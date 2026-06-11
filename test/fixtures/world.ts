// Test scaffolding: rooms with hand-drawn ASCII worlds, fake players, and a
// tick runner that collects emitted events.

import { WORLD_H, WORLD_W } from '../../src/shared/constants';
import { T } from '../../src/shared/tiles';
import { withGold, withHp } from '../../src/shared/tiles';
import { makePhys } from '../../src/shared/movement';
import type { Ev } from '../../src/shared/protocol';
import { createRoom, rooms } from '../../src/server/rooms';
import { roomTick } from '../../src/server/game/sim';
import { markDirty } from '../../src/server/game/grid';
import { startCharges } from '../../src/server/game/rules';
import type { PlayerSlot, Room } from '../../src/server/game/types';

export function testRoom(seed = 42): Room {
  const room = createRoom(seed);
  return room;
}

export function cleanup(room: Room): void {
  rooms.delete(room.code);
}

// A frozen bedrock world with a huge clock: stamp scenarios into it.
export function sandboxRound(room: Room): void {
  room.tiles = new Uint8Array(WORLD_W * WORLD_H).fill(T.BEDROCK);
  room.meta = new Uint8Array(WORLD_W * WORLD_H);
  room.phase = 'playing';
  room.round = 1;
  room.quota = 9_999_999;
  room.roundTicksLeft = 100_000_000;
  room.cart = 0;
  room.lanterns = [];
  room.piles = [];
  room.rocks = [];
  room.dirty = new Set();
  room.fuses = new Map();
}

const CHAR_TILE: Record<string, number> = {
  '.': T.AIR,
  '#': T.DIRT,
  S: T.STONE,
  D: T.DEEP,
  B: T.BEDROCK,
  R: T.RUBBLE,
  P: T.POST,
  L: T.LADDER,
  g: T.DIRT
};

export function stamp(room: Room, ox: number, oy: number, art: string): void {
  const rows = art
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
  for (let dy = 0; dy < rows.length; dy++) {
    for (let dx = 0; dx < rows[dy].length; dx++) {
      const ch = rows[dy][dx];
      const t = CHAR_TILE[ch];
      if (t === undefined) continue;
      const i = (oy + dy) * WORLD_W + (ox + dx);
      room.tiles[i] = t;
      room.meta[i] = ch === 'g' ? withGold(0, 4) : ch === 'P' ? withHp(0, 2) : 0;
      markDirty(room, ox + dx, oy + dy);
    }
  }
}

export function snapAscii(room: Room, ox: number, oy: number, w: number, h: number): string {
  const INV: Record<number, string> = {
    [T.AIR]: '.',
    [T.DIRT]: '#',
    [T.STONE]: 'S',
    [T.DEEP]: 'D',
    [T.BEDROCK]: 'B',
    [T.RUBBLE]: 'R',
    [T.POST]: 'P',
    [T.LADDER]: 'L'
  };
  const out: string[] = [];
  for (let dy = 0; dy < h; dy++) {
    let row = '';
    for (let dx = 0; dx < w; dx++) {
      row += INV[room.tiles[(oy + dy) * WORLD_W + (ox + dx)]] ?? '?';
    }
    out.push(row);
  }
  return out.join('\n');
}

let fakeSeq = 1;
export function addPlayer(room: Room, name: string, x: number, y: number): PlayerSlot {
  const slot = room.players.findIndex((p) => p === null);
  const { charges, timers } = startCharges();
  const p: PlayerSlot = {
    slot,
    name,
    hatTrue: slot,
    token: `tok-${name}`,
    socketId: `fake-${fakeSeq++}`,
    disconnectedAt: -1,
    isHost: slot === 0,
    banished: false,
    dwarf: {
      eid: 1000 + slot,
      phys: makePhys(x, y),
      hatShown: slot,
      buried: false,
      wiggleCd: 0,
      digging: null,
      attackCd: 0,
      lastInput: { seq: 0, lr: 0, ud: 0, facing: 1 }
    },
    carry: 0,
    dynamite: 0,
    charges,
    chargeTimers: timers,
    bellRings: 1,
    vote: null,
    votedMoleEver: false,
    stats: { gold: 0, rescues: 0, bonksGiven: 0, bonksTaken: 0 },
    nightScore: 0
  };
  room.players[slot] = p;
  return p;
}

// Run n ticks; return every event emitted along the way.
export function ticks(room: Room, n: number): Ev[] {
  const all: Ev[] = [];
  for (let i = 0; i < n; i++) {
    roomTick(room);
    all.push(...room.events);
    room.events = [];
    room.pendingMsgs = [];
    room.pendingSync = false;
    room.pendingRolePush = false;
  }
  return all;
}

// Run ticks but keep per-tick event batches (for ordering assertions).
export function ticksBatched(room: Room, n: number): Ev[][] {
  const batches: Ev[][] = [];
  for (let i = 0; i < n; i++) {
    roomTick(room);
    batches.push(room.events);
    room.events = [];
    room.pendingMsgs = [];
  }
  return batches;
}
