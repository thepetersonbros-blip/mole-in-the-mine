import {
  BUILD,
  BELL_RINGS_PER_PLAYER,
  CART_X,
  BELL_X,
  INTRO_TICKS,
  LANTERN_FUEL,
  MIN_PLAYERS,
  QUOTA,
  ROUND_TICKS,
  SPAWN_X_MAX,
  SPAWN_X_MIN,
  STASH_TARGET,
  SURFACE_Y,
  type BuildKind
} from '../../shared/constants';
import type { PlayerRoundStats, RoundEndMsg } from '../../shared/protocol';
import { makePhys } from '../../shared/movement';
import { genWorld } from './world';
import { dealMole } from './mole';
import type { PlayerSlot, Room } from './types';

export function freshEid(room: Room): number {
  for (;;) {
    const e = 1000 + Math.floor(room.rand() * 9000);
    const taken = room.players.some((p) => p?.dwarf?.eid === e);
    if (!taken) return e;
  }
}

export function startCharges(): { charges: Record<BuildKind, number>; timers: Record<BuildKind, number> } {
  const charges = {} as Record<BuildKind, number>;
  const timers = {} as Record<BuildKind, number>;
  for (const k of Object.keys(BUILD) as BuildKind[]) {
    charges[k] = BUILD[k].start;
    timers[k] = BUILD[k].cooldown;
  }
  return { charges, timers };
}

export function connectedPlayers(room: Room): PlayerSlot[] {
  return room.players.filter((p): p is PlayerSlot => !!p && p.socketId !== null);
}

export function startRound(room: Room): void {
  room.round++;
  const gen = genWorld(room.seed + room.round * 7919);
  room.tiles = gen.tiles;
  room.meta = gen.meta;
  room.cart = 0;
  room.quota = QUOTA;
  room.roundTicksLeft = ROUND_TICKS;
  room.lanterns = [];
  room.piles = [];
  room.rocks = [];
  room.dynamites = [];
  room.dirty = new Set();
  room.fuses = new Map();
  room.quakeAcc = null;
  room.elevY = SURFACE_Y;
  room.elevJam = 0;
  room.meeting = null;
  room.meetingMsg = null;
  room.meetingResultAt = -1;
  room.meetingCd = 0;
  room.lastRoundEnd = null;

  // two camp lanterns with deep fuel reserves
  for (const x of [CART_X - 2, BELL_X + 2]) {
    room.lanterns.push({ id: room.nextId++, x, y: SURFACE_Y - 1, lit: true, fuel: LANTERN_FUEL * 4 });
  }

  const active = connectedPlayers(room);
  let i = 0;
  const spread = Math.max(2, Math.floor((SPAWN_X_MAX - SPAWN_X_MIN) / Math.max(1, active.length - 1)));
  for (const p of room.players) {
    if (!p) continue;
    p.banished = false;
    p.carry = 0;
    p.dynamite = 0;
    p.vote = null;
    p.votedMoleEver = false;
    p.bellRings = BELL_RINGS_PER_PLAYER;
    p.stats = { gold: 0, rescues: 0, bonksGiven: 0, bonksTaken: 0 };
    const { charges, timers } = startCharges();
    p.charges = charges;
    p.chargeTimers = timers;
    if (p.socketId !== null) {
      p.dwarf = {
        eid: 0,
        phys: makePhys(Math.min(SPAWN_X_MAX, SPAWN_X_MIN + i * spread) + 0.5, SURFACE_Y),
        hatShown: p.hatTrue,
        buried: false,
        wiggleCd: 0,
        digging: null,
        attackCd: 0,
        lastInput: { seq: 0, lr: 0, ud: 0, facing: 1 }
      };
      i++;
    } else {
      p.dwarf = null;
    }
  }
  for (const p of room.players) {
    if (p?.dwarf) p.dwarf.eid = freshEid(room);
  }

  // a mole needs a crowd; small test lobbies run pure co-op
  const prevMole = room.mole?.slot ?? -1;
  room.mole = active.length >= 4 ? dealMole(room, active, prevMole) : null;

  room.phase = 'intro';
  room.introLeft = INTRO_TICKS;
  room.pendingSync = true;
  room.pendingRolePush = true;
}

export function checkWins(room: Room): void {
  if (room.phase !== 'playing') return;
  if (room.cart >= room.quota) {
    endRound(room, 'miners', 'quota');
    return;
  }
  if (room.mole && room.mole.stash >= STASH_TARGET) {
    endRound(room, 'mole', 'stash');
    return;
  }
  if (room.roundTicksLeft <= 0) {
    endRound(room, room.mole ? 'mole' : 'miners', 'timer');
  }
}

export function endRound(room: Room, winner: 'miners' | 'mole', reason: RoundEndMsg['reason']): void {
  const moleSlot = room.mole?.slot ?? -1;
  const molePlayer = moleSlot >= 0 ? room.players[moleSlot] : null;

  const stats: PlayerRoundStats[] = [];
  for (const p of room.players) {
    if (!p) continue;
    stats.push({
      slot: p.slot,
      name: p.name,
      hat: p.hatTrue,
      gold: p.stats.gold,
      rescues: p.stats.rescues,
      bonksGiven: p.stats.bonksGiven,
      bonksTaken: p.stats.bonksTaken,
      votedCorrectly: room.mole ? p.votedMoleEver : null
    });
    // night scoring
    let pts = 0;
    const isMole = p.slot === moleSlot;
    if (winner === 'miners' && !isMole) pts += 3;
    if (winner === 'mole' && isMole) pts += 4;
    pts += Math.floor(p.stats.gold / 30);
    pts += p.stats.rescues;
    if (room.mole && p.votedMoleEver && !isMole) pts += 1;
    p.nightScore += pts;
  }

  const msg: RoundEndMsg = {
    round: room.round,
    winner,
    reason,
    moleSlot,
    moleName: molePlayer?.name ?? '',
    hatHistory: room.mole?.hatHistory ?? [],
    cart: room.cart,
    quota: room.quota,
    stash: room.mole?.stash ?? 0,
    stats,
    totals: room.players
      .filter((p): p is PlayerSlot => !!p)
      .map((p) => ({ slot: p.slot, name: p.name, score: p.nightScore }))
      .sort((a, b) => b.score - a.score)
  };
  room.lastRoundEnd = msg;
  room.phase = 'roundEnd';
  room.meeting = null;
  room.meetingMsg = null;
  room.mole = null; // secret is out (it's in the message), wipe the state
  room.pendingMsgs.push({ ev: 'roundEnd', payload: msg });
  room.pendingSync = true;
}

export function canStart(room: Room): boolean {
  return connectedPlayers(room).length >= MIN_PLAYERS;
}
