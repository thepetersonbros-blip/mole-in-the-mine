// Fuses expire -> ceiling tiles become falling rocks -> rocks land as rubble,
// burying anyone underneath and re-dirtying neighbors so cascades propagate.

import { BODY_H, DYNAMITE_STUN, ROCK_FALL_TICKS, WORLD_H, WORLD_W } from '../../shared/constants';
import { T, isSolid } from '../../shared/tiles';
import { getTile, idx, markDirty, setTile, spawnPile } from './grid';
import type { PlayerSlot, Room } from './types';

export function tickFuses(room: Room): void {
  for (const [i, fuse] of room.fuses) {
    fuse.left--;
    if (fuse.left > 0) continue;
    room.fuses.delete(i);
    const x = i % WORLD_W;
    const y = Math.floor(i / WORLD_W);
    const t = room.tiles[i];
    if (!isSolid(t) || t === T.BEDROCK) continue;
    // the ceiling tile lets go
    setTile(room, x, y, T.AIR, 0, 'crumble');
    room.rocks.push({ x, y, fallTimer: ROCK_FALL_TICKS });
  }
}

export function tickRocks(room: Room): void {
  for (let r = room.rocks.length - 1; r >= 0; r--) {
    const rock = room.rocks[r];
    rock.fallTimer--;
    if (rock.fallTimer > 0) continue;
    rock.fallTimer = ROCK_FALL_TICKS;
    const belowSolid = rock.y + 1 >= WORLD_H - 1 || isSolid(getTile(room, rock.x, rock.y + 1));
    if (belowSolid) {
      room.rocks.splice(r, 1);
      landRock(room, rock.x, rock.y);
    } else {
      rock.y++;
    }
  }
}

function landRock(room: Room, x: number, y: number): void {
  setTile(room, x, y, T.RUBBLE, 0, 'rockfall');
  addQuake(room, x, y);
  for (const p of room.players) {
    if (!p?.dwarf || p.banished || p.dwarf.buried) continue;
    if (dwarfOverlapsTile(p, x, y)) bury(room, p);
  }
}

export function dwarfOverlapsTile(p: PlayerSlot, x: number, y: number): boolean {
  const d = p.dwarf!;
  const fx = Math.floor(d.phys.x);
  const top = Math.floor(d.phys.y - BODY_H + 0.05);
  const bot = Math.floor(d.phys.y - 0.05);
  return fx === x && y >= top && y <= bot;
}

export function bury(room: Room, p: PlayerSlot): void {
  const d = p.dwarf!;
  d.buried = true;
  d.digging = null;
  d.phys.vy = 0;
  d.phys.stun = 0;
  // align them into the tile so the rescue dig frees them cleanly
  d.phys.x = Math.floor(d.phys.x) + 0.5;
  d.phys.y = Math.floor(d.phys.y - 0.05) + 1;
  if (p.carry > 0) {
    spawnPile(room, Math.floor(d.phys.x), Math.floor(d.phys.y - 0.5), p.carry);
    p.carry = 0;
  }
  room.events.push({
    k: 'bury',
    eid: d.eid,
    x: Math.floor(d.phys.x),
    y: Math.floor(d.phys.y - 0.5)
  });
}

// Safety net: if the world has become solid around a dwarf (any cause), bury them.
export function buriedByWorld(room: Room, p: PlayerSlot): boolean {
  const d = p.dwarf!;
  const t = getTile(room, Math.floor(d.phys.x), Math.floor(d.phys.y - BODY_H / 2));
  return isSolid(t);
}

export function tickDynamite(room: Room): void {
  for (let i = room.dynamites.length - 1; i >= 0; i--) {
    const d = room.dynamites[i];
    d.fuse--;
    if (d.fuse > 0) continue;
    room.dynamites.splice(i, 1);
    explode(room, d.x, d.y);
  }
}

function explode(room: Room, x: number, y: number): void {
  room.events.push({ k: 'boom', x: x + 0.5, y: y + 0.5 });
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const t = getTile(room, tx, ty);
      if (t === T.AIR || t === T.BEDROCK) continue;
      const gold = room.meta[tileIdxOf(tx, ty)] & 0x0f;
      setTile(room, tx, ty, T.AIR, 0, 'blast');
      if (gold > 0) spawnPile(room, tx, ty, gold);
    }
  }
  // anyone too close gets rattled hard and sprays their pockets
  for (const p of room.players) {
    if (!p?.dwarf || p.banished || p.dwarf.buried) continue;
    const d = p.dwarf;
    const dist = Math.hypot(d.phys.x - (x + 0.5), d.phys.y - 0.5 - (y + 0.5));
    if (dist <= 2.2) {
      d.phys.stun = Math.max(d.phys.stun, DYNAMITE_STUN);
      d.digging = null;
      if (p.carry > 0) {
        spawnPile(room, Math.floor(d.phys.x), Math.floor(d.phys.y - 0.5), p.carry);
        p.carry = 0;
      }
      room.events.push({ k: 'stun', eid: d.eid });
    }
  }
  room.events.push({ k: 'quake', x, y, n: 5 });
}

function tileIdxOf(x: number, y: number): number {
  return y * WORLD_W + x;
}

export function addQuake(room: Room, x: number, y: number): void {
  if (!room.quakeAcc) {
    room.quakeAcc = { x, y, n: 1, timer: 8 };
  } else {
    room.quakeAcc.n++;
    room.quakeAcc.x = Math.round((room.quakeAcc.x + x) / 2);
    room.quakeAcc.y = Math.round((room.quakeAcc.y + y) / 2);
    room.quakeAcc.timer = Math.max(room.quakeAcc.timer, 4);
  }
}

export function tickQuake(room: Room): void {
  if (!room.quakeAcc) return;
  room.quakeAcc.timer--;
  if (room.quakeAcc.timer <= 0) {
    const q = room.quakeAcc;
    room.quakeAcc = null;
    room.events.push({ k: 'quake', x: q.x, y: q.y, n: q.n });
  }
}

// Free any dwarf buried at this tile (called when its rubble is dug out).
export function tryRescueAt(room: Room, x: number, y: number, rescuer: PlayerSlot | null): void {
  for (const p of room.players) {
    if (!p?.dwarf || !p.dwarf.buried) continue;
    const bx = Math.floor(p.dwarf.phys.x);
    const by = Math.floor(p.dwarf.phys.y - 0.5);
    if (bx === x && by === y) {
      p.dwarf.buried = false;
      p.dwarf.phys.fallStart = -1;
      if (rescuer && rescuer !== p) {
        rescuer.stats.rescues++;
        room.events.push({ k: 'rescue', eid: p.dwarf.eid, byName: rescuer.name });
      }
    }
  }
}

export function unburyAll(room: Room): void {
  for (const p of room.players) {
    if (!p?.dwarf) continue;
    if (p.dwarf.buried) {
      const bx = Math.floor(p.dwarf.phys.x);
      const by = Math.floor(p.dwarf.phys.y - 0.5);
      if (room.tiles[idx(bx, by)] === T.RUBBLE) {
        setTile(room, bx, by, T.AIR, 0, 'dig');
        markDirty(room, bx, by);
      }
      p.dwarf.buried = false;
    }
    p.dwarf.phys.stun = 0;
    p.dwarf.digging = null;
  }
}
