// THE choke point. Every byte that reaches a socket is built in this file
// with explicit field allowlists. Mole secrets exist only in room.mole and
// are serialized solely by buildMole(), which is sent solely to the mole.

import type { Server } from 'socket.io';
import { PROTOCOL_VERSION, SNAP_EVERY, STASH_TARGET, WORLD_H, WORLD_W } from '../../shared/constants';
import type {
  DwarfSnap,
  MeMsg,
  MolePrivate,
  RolePrivate,
  RosterEntry,
  Snap,
  SyncMsg
} from '../../shared/protocol';
import type { PlayerSlot, Room } from '../game/types';

const F_BURIED = 1;
const F_STUN = 2;
const F_ZZ = 4;
const F_LEFT = 8;
const F_WALK = 16;
const F_LADDER = 32;
const F_DIG = 64;

const q = (v: number) => Math.round(v * 32); // position quantization

export function dwarfSnaps(room: Room): DwarfSnap[] {
  const out: DwarfSnap[] = [];
  for (const p of room.players) {
    if (!p?.dwarf || p.banished) continue;
    const d = p.dwarf;
    let flags = 0;
    if (d.buried) flags |= F_BURIED;
    if (d.phys.stun > 0) flags |= F_STUN;
    if (p.socketId === null) flags |= F_ZZ;
    if (d.phys.facing < 0) flags |= F_LEFT;
    if (d.lastInput.lr !== 0) flags |= F_WALK;
    if (d.phys.onLadder) flags |= F_LADDER;
    if (d.digging) flags |= F_DIG;
    out.push({ eid: d.eid, x: q(d.phys.x), y: q(d.phys.y), hat: d.hatShown, flags });
  }
  // stable order by eid so nothing about join order leaks
  out.sort((a, b) => a.eid - b.eid);
  return out;
}

export function buildRoster(room: Room): RosterEntry[] {
  return room.players
    .filter((p): p is PlayerSlot => !!p)
    .map((p) => ({
      slot: p.slot,
      name: p.name,
      hat: p.hatTrue,
      connected: p.socketId !== null,
      banished: p.banished,
      isHost: p.isHost
    }));
}

export function buildSync(room: Room, p: PlayerSlot): SyncMsg {
  const msg: SyncMsg = {
    v: PROTOCOL_VERSION,
    tick: room.tick,
    phase: room.phase,
    round: room.round,
    code: room.code,
    you: { slot: p.slot, token: p.token },
    roster: buildRoster(room)
  };
  if (room.phase !== 'lobby' && room.tiles.length > 0) {
    const buf = new Uint8Array(WORLD_W * WORLD_H * 2);
    buf.set(room.tiles, 0);
    buf.set(room.meta, WORLD_W * WORLD_H);
    msg.grid = buf.buffer;
    msg.cart = room.cart;
    msg.quota = room.quota;
    msg.left = room.roundTicksLeft;
    msg.dw = dwarfSnaps(room);
    msg.lanterns = room.lanterns.map((l) => ({ id: l.id, x: l.x, y: l.y, lit: l.lit }));
    msg.piles = room.piles.map((g) => ({ id: g.id, x: g.x, y: g.y, amt: g.amt }));
    msg.elevY = q(room.elevY);
    msg.elevJammed = room.elevJam > 0;
    msg.meeting = room.meetingMsg;
    msg.roundEnd = room.lastRoundEnd;
    msg.bellRingsLeft = p.bellRings;
  }
  return msg;
}

export function buildSnap(room: Room): Snap {
  return {
    t: room.tick,
    dw: dwarfSnaps(room),
    rocks: room.rocks.map((r) => [q(r.x + 0.5), q(r.y)] as [number, number]),
    dyn: room.dynamites.map((d) => [d.x, d.y] as [number, number]),
    elevY: q(room.elevY),
    cart: room.cart,
    left: room.roundTicksLeft
  };
}

export function buildMe(p: PlayerSlot): MeMsg {
  const d = p.dwarf;
  return {
    carry: p.carry,
    dynamite: p.dynamite,
    charges: { ...p.charges },
    chargeIn: { ...p.chargeTimers },
    attackCd: d?.attackCd ?? 0,
    buried: d?.buried ?? false,
    stun: d?.phys.stun ?? 0,
    bellRingsLeft: p.bellRings,
    digging: d?.digging
      ? { x: d.digging.x, y: d.digging.y, pct: 1 - d.digging.left / d.digging.total }
      : null
  };
}

export function buildRole(room: Room, p: PlayerSlot): RolePrivate {
  return {
    mole: room.mole?.slot === p.slot,
    eid: p.dwarf?.eid ?? -1
  };
}

export function buildMole(room: Room): MolePrivate | null {
  if (!room.mole) return null;
  return {
    stash: room.mole.stash,
    stashTarget: STASH_TARGET,
    cds: { ...room.mole.cds }
  };
}

// Called once per tick after the sim. Owns all emission.
export function flushRoom(io: Server, room: Room): void {
  const sockets = (p: PlayerSlot) => (p.socketId ? io.sockets.sockets.get(p.socketId) : undefined);
  const connected = room.players.filter((p): p is PlayerSlot => !!p && p.socketId !== null);

  if (room.pendingSync) {
    room.pendingSync = false;
    for (const p of connected) sockets(p)?.emit('sync', buildSync(room, p));
  }

  if (room.events.length > 0) {
    io.to(room.code).emit('ev', room.events);
    room.events = [];
  }

  for (const m of room.pendingMsgs) io.to(room.code).emit(m.ev, m.payload);
  room.pendingMsgs = [];

  if (room.pendingRolePush) {
    room.pendingRolePush = false;
    for (const p of connected) {
      sockets(p)?.emit('role', buildRole(room, p));
      if (room.mole?.slot === p.slot) sockets(p)?.emit('mole', buildMole(room));
    }
  }

  if (room.phase === 'playing' && room.tick % SNAP_EVERY === 0) {
    io.to(room.code).emit('snap', buildSnap(room));
    for (const p of connected) {
      sockets(p)?.emit('me', buildMe(p));
      if (room.mole?.slot === p.slot) sockets(p)?.emit('mole', buildMole(room));
    }
  }
}
