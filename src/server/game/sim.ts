import {
  BUILD,
  ELEVATOR_SPEED,
  SHAFT_BOTTOM,
  SHAFT_X1,
  SHAFT_X2,
  SURFACE_Y,
  type BuildKind
} from '../../shared/constants';
import { T, isSolid } from '../../shared/tiles';
import { step, type PhysWorld } from '../../shared/movement';
import { getTile } from './grid';
import { tickDig, tickPickups } from './actions';
import { buriedByWorld, bury, tickDynamite, tickFuses, tickQuake, tickRocks } from './collapse';
import { processStability } from './stability';
import { tickMole } from './mole';
import { tickMeeting } from './meetings';
import { checkWins } from './rules';
import type { PlayerSlot, Room } from './types';

export function roomTick(room: Room): void {
  room.tick++;
  switch (room.phase) {
    case 'lobby':
    case 'roundEnd':
      return;
    case 'intro':
      room.introLeft--;
      if (room.introLeft <= 0) {
        room.phase = 'playing';
        room.pendingSync = true;
      }
      return;
    case 'meeting':
      tickMeeting(room);
      return;
    case 'playing':
      simTick(room);
      return;
  }
}

function activeDwarfs(room: Room): PlayerSlot[] {
  return room.players.filter((p): p is PlayerSlot => !!p?.dwarf && !p.banished);
}

function simTick(room: Room): void {
  // --- global timers ---
  if (room.elevJam > 0) {
    room.elevJam--;
    if (room.elevJam === 0) room.events.push({ k: 'elev', jammed: false });
  }
  if (room.meetingCd > 0) room.meetingCd--;
  for (const l of room.lanterns) {
    if (!l.lit) continue;
    l.fuel--;
    if (l.fuel <= 0) {
      l.lit = false;
      room.events.push({ k: 'lantern', id: l.id, x: l.x, y: l.y, lit: false });
    }
  }

  const world: PhysWorld = {
    isSolid: (x, y) => isSolid(getTile(room, x, y)),
    isLadder: (x, y) => getTile(room, x, y) === T.LADDER,
    platform: { x1: SHAFT_X1, x2: SHAFT_X2 + 1, y: room.elevY }
  };

  const players = activeDwarfs(room);

  // --- per-player timers + movement ---
  for (const p of players) {
    const d = p.dwarf!;
    if (d.attackCd > 0) d.attackCd--;
    if (d.wiggleCd > 0) d.wiggleCd--;
    for (const k of Object.keys(BUILD) as BuildKind[]) {
      if (p.charges[k] >= BUILD[k].max) {
        p.chargeTimers[k] = BUILD[k].cooldown;
        continue;
      }
      p.chargeTimers[k]--;
      if (p.chargeTimers[k] <= 0) {
        p.charges[k]++;
        p.chargeTimers[k] = BUILD[k].cooldown;
      }
    }
    if (!d.buried) {
      step(d.phys, d.lastInput, world);
    }
  }

  // --- elevator (after movement so we know who is standing on it) ---
  if (room.elevJam <= 0) {
    let dir = 0;
    const riders: PlayerSlot[] = [];
    for (const p of players) {
      const d = p.dwarf!;
      if (d.buried) continue;
      const onPlat =
        Math.abs(d.phys.y - room.elevY) < 0.12 &&
        d.phys.x >= SHAFT_X1 - 0.35 &&
        d.phys.x <= SHAFT_X2 + 1 + 0.35;
      if (onPlat) {
        riders.push(p);
        dir += d.lastInput.ud;
      }
    }
    if (riders.length > 0 && dir !== 0) {
      const move = Math.sign(dir) * ELEVATOR_SPEED; // +1 = up = y decreases
      const ny = Math.min(Math.max(room.elevY - move, SURFACE_Y), SHAFT_BOTTOM);
      const delta = ny - room.elevY;
      if (delta !== 0) {
        room.elevY = ny;
        for (const p of riders) {
          p.dwarf!.phys.y += delta;
          p.dwarf!.phys.onGround = true;
          p.dwarf!.phys.fallStart = -1;
        }
      }
    }
  }

  // --- channeled digs, pickups ---
  for (const p of players) tickDig(room, p);
  for (const p of players) tickPickups(room, p);

  // --- the mole's slow poisons ---
  tickMole(room);

  // --- earth physics ---
  tickDynamite(room);
  processStability(room);
  tickFuses(room);
  tickRocks(room);
  tickQuake(room);

  // safety net: anyone inside solid ground is buried
  for (const p of players) {
    if (!p.dwarf!.buried && buriedByWorld(room, p)) bury(room, p);
  }

  // --- clock + verdicts ---
  room.roundTicksLeft--;
  checkWins(room);
}
