// Client mirror of the world. Mutated only by net.ts message handlers and
// read by the renderer + UI. Remote dwarfs interpolate between snapshots.

import type {
  DwarfSnap,
  LanternSnap,
  MeMsg,
  MeetingMsg,
  MolePrivate,
  Phase,
  PileSnap,
  RosterEntry,
  RoundEndMsg,
  Snap,
  SyncMsg
} from '../shared/protocol';
import { WORLD_H, WORLD_W } from '../shared/constants';

export interface RemoteDwarf {
  eid: number;
  hat: number;
  flags: number;
  // two latest snapshot points for interpolation
  x0: number; y0: number; t0: number;
  x1: number; y1: number; t1: number;
}

export const F = { buried: 1, stun: 2, zz: 4, left: 8, walk: 16, ladder: 32, dig: 64 } as const;

export const game = {
  connState: 'boot' as 'boot' | 'connecting' | 'on' | 'reconnecting' | 'failed',
  errCode: '' as string,
  phase: 'lobby' as Phase,
  code: '',
  round: 0,
  you: { slot: -1, token: '' },
  myEid: -1,
  isMole: false,
  roster: [] as RosterEntry[],
  tiles: new Uint8Array(WORLD_W * WORLD_H),
  meta: new Uint8Array(WORLD_W * WORLD_H),
  hasWorld: false,
  cart: 0,
  quota: 1,
  left: 0,
  serverTick: 0,
  dwarfs: new Map<number, RemoteDwarf>(),
  rocks: [] as { x: number; y: number }[],
  dyn: [] as { x: number; y: number }[],
  piles: new Map<number, PileSnap>(),
  lanterns: new Map<number, LanternSnap>(),
  elevY: 8,
  elevJammed: false,
  bellRingsLeft: 0,
  me: {
    carry: 0,
    dynamite: 0,
    charges: { post: 0, ladder: 0, lantern: 0 },
    chargeIn: { post: 0, ladder: 0, lantern: 0 },
    attackCd: 0,
    buried: false,
    stun: 0,
    bellRingsLeft: 0,
    digging: null
  } as MeMsg,
  molePriv: null as MolePrivate | null,
  meeting: null as MeetingMsg | null,
  meetingDeadline: 0, // performance.now() based local deadline for the vote timer
  roundEnd: null as RoundEndMsg | null,
  myVote: null as number | 'skip' | null
};

const uq = (v: number) => v / 32;

type Listener = () => void;
const listeners = new Set<Listener>();
export function onUpdate(fn: Listener): void {
  listeners.add(fn);
}
export function update(): void {
  for (const fn of listeners) fn();
}

export function tileAt(x: number, y: number): number {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return 4;
  return game.tiles[y * WORLD_W + x];
}
export function metaAt(x: number, y: number): number {
  if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return 0;
  return game.meta[y * WORLD_W + x];
}

export function applySync(msg: SyncMsg): void {
  game.phase = msg.phase;
  game.code = msg.code;
  game.round = msg.round;
  game.you = msg.you;
  game.roster = msg.roster;
  game.serverTick = msg.tick;
  if (msg.grid) {
    const buf = new Uint8Array(msg.grid);
    const n = WORLD_W * WORLD_H;
    game.tiles.set(buf.subarray(0, n));
    game.meta.set(buf.subarray(n, n * 2));
    game.hasWorld = true;
  } else if (msg.phase === 'lobby') {
    game.hasWorld = false;
  }
  if (msg.cart !== undefined) game.cart = msg.cart;
  if (msg.quota !== undefined) game.quota = msg.quota;
  if (msg.left !== undefined) game.left = msg.left;
  if (msg.elevY !== undefined) game.elevY = uq(msg.elevY);
  if (msg.elevJammed !== undefined) game.elevJammed = msg.elevJammed;
  if (msg.bellRingsLeft !== undefined) game.bellRingsLeft = msg.bellRingsLeft;
  game.meeting = msg.meeting ?? null;
  game.roundEnd = msg.roundEnd ?? null;
  if (!game.meeting) game.myVote = null;
  if (game.meeting?.state === 'start' && game.meeting.endTick) {
    game.meetingDeadline = performance.now() + Math.max(0, game.meeting.endTick - msg.tick) * 50;
  }

  game.piles.clear();
  for (const p of msg.piles ?? []) game.piles.set(p.id, p);
  game.lanterns.clear();
  for (const l of msg.lanterns ?? []) game.lanterns.set(l.id, l);
  if (msg.dw) applyDwarfList(msg.dw, performance.now());
  game.rocks = [];
}

function applyDwarfList(list: DwarfSnap[], now: number): void {
  const seen = new Set<number>();
  for (const d of list) {
    seen.add(d.eid);
    const x = uq(d.x);
    const y = uq(d.y);
    let rd = game.dwarfs.get(d.eid);
    if (!rd) {
      rd = { eid: d.eid, hat: d.hat, flags: d.flags, x0: x, y0: y, t0: now - 100, x1: x, y1: y, t1: now };
      game.dwarfs.set(d.eid, rd);
    } else {
      rd.x0 = rd.x1;
      rd.y0 = rd.y1;
      rd.t0 = rd.t1;
      rd.x1 = x;
      rd.y1 = y;
      rd.t1 = now;
      rd.hat = d.hat;
      rd.flags = d.flags;
    }
  }
  for (const eid of [...game.dwarfs.keys()]) {
    if (!seen.has(eid)) game.dwarfs.delete(eid);
  }
}

export function applySnap(s: Snap): void {
  const now = performance.now();
  game.serverTick = s.t;
  game.cart = s.cart;
  game.left = s.left;
  game.elevY = uq(s.elevY);
  game.rocks = s.rocks.map(([x, y]) => ({ x: uq(x), y: uq(y) }));
  game.dyn = s.dyn.map(([x, y]) => ({ x, y }));
  applyDwarfList(s.dw, now);
}

// rendered (interpolated) position of a remote dwarf, ~150ms behind
export function dwarfRenderPos(rd: RemoteDwarf, now: number): { x: number; y: number } {
  const target = now - 150;
  const span = Math.max(1, rd.t1 - rd.t0);
  const a = Math.min(1.25, Math.max(0, (target - rd.t0) / span));
  return { x: rd.x0 + (rd.x1 - rd.x0) * a, y: rd.y0 + (rd.y1 - rd.y0) * a };
}
