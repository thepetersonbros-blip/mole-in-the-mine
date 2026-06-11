// Real server, real sockets: six bots create a room, start a shift, move,
// dig, and one of them drops and rejoins with its token mid-round.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connectIo, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION } from '../../src/shared/constants';
import type { Ev, RolePrivate, Snap, SyncMsg } from '../../src/shared/protocol';
import { createGameServer, type GameServer } from '../../src/server/app';

let server: GameServer;
let port: number;

interface Bot {
  sock: Socket;
  name: string;
  sync: SyncMsg | null;
  role: RolePrivate | null;
  snaps: Snap[];
  events: Ev[];
}

function mkBot(name: string, auth: Record<string, unknown>): Promise<Bot> {
  return new Promise((resolve, reject) => {
    const sock = connectIo(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      auth: { v: PROTOCOL_VERSION, name, hat: -1, ...auth }
    });
    const bot: Bot = { sock, name, sync: null, role: null, snaps: [], events: [] };
    sock.on('sync', (s: SyncMsg) => {
      const first = bot.sync === null;
      bot.sync = s;
      if (first) resolve(bot);
    });
    sock.on('role', (r: RolePrivate) => (bot.role = r));
    sock.on('snap', (s: Snap) => {
      bot.snaps.push(s);
      if (bot.snaps.length > 50) bot.snaps.shift();
    });
    sock.on('ev', (evs: Ev[]) => {
      bot.events.push(...evs);
      if (bot.events.length > 500) bot.events.splice(0, bot.events.length - 500);
    });
    sock.on('connect_error', (e) => reject(new Error(`${name}: ${e.message}`)));
    setTimeout(() => reject(new Error(`${name}: no sync after 5s`)), 5000);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | null | undefined | false, what: string, ms = 10000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v as T;
    if (Date.now() - t0 > ms) throw new Error(`timeout waiting for ${what}`);
    await sleep(50);
  }
}

describe('six bots play', () => {
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = createGameServer();
    port = await server.listen(0);
  });

  afterAll(async () => {
    for (const b of bots) b.sock.disconnect();
    await server.close();
  });

  it('host creates, five join, everyone sees the roster', async () => {
    const host = await mkBot('Host', { create: true });
    bots.push(host);
    const code = host.sync!.code;
    expect(code).toMatch(/^[A-Z]{4}$/);
    for (let i = 1; i < 6; i++) {
      bots.push(await mkBot(`Bot${i}`, { room: code }));
    }
    await waitFor(() => bots[0].sync?.roster.filter((r) => r.connected).length === 6, 'full roster');
    // hats are unique
    const hats = new Set(bots[0].sync!.roster.map((r) => r.hat));
    expect(hats.size).toBe(6);
  });

  it('host starts; everyone gets a role; exactly one mole', async () => {
    bots[0].sock.emit('lobby', { type: 'start' });
    await waitFor(() => bots.every((b) => b.role !== null), 'roles dealt');
    const moles = bots.filter((b) => b.role!.mole);
    expect(moles.length).toBe(1);
    await waitFor(() => bots[0].sync?.phase === 'playing' || bots[0].snaps.length > 0, 'playing phase', 12000);
  });

  it('movement flows through snapshots', async () => {
    const b = bots[1];
    await waitFor(() => b.snaps.length > 2, 'snapshots');
    const eid = b.role!.eid;
    const before = b.snaps.at(-1)!.dw.find((d) => d.eid === eid)!;
    b.sock.emit('input', { seq: 1, lr: 1, ud: 0, facing: 1 });
    await sleep(1200);
    b.sock.emit('input', { seq: 2, lr: 0, ud: 0, facing: 1 });
    await sleep(200);
    const after = b.snaps.at(-1)!.dw.find((d) => d.eid === eid)!;
    expect(after.x).toBeGreaterThan(before.x + 32); // moved at least a tile
    // every bot sees the same world: same dwarf moved on bot 4's feed
    const other = bots[4].snaps.at(-1)!.dw.find((d) => d.eid === eid)!;
    expect(Math.abs(other.x - after.x)).toBeLessThan(64);
  });

  it('digging broadcasts tile events to everyone', async () => {
    const b = bots[2];
    const eid = b.role!.eid;
    const me = await waitFor(() => b.snaps.at(-1)?.dw.find((d) => d.eid === eid), 'my dwarf');
    const tx = Math.floor(me.x / 32);
    const ty = Math.floor(me.y / 32); // tile under my feet
    b.sock.emit('action', { type: 'dig', x: tx, y: ty });
    await waitFor(
      () => bots[5].events.some((e) => e.k === 'tile' && e.cause === 'dig' && e.x === tx && e.y === ty),
      'dig event seen by another bot'
    );
  });

  it('a dropped player rejoins with their token and keeps their dwarf', async () => {
    const b = bots[3];
    const code = b.sync!.code;
    const token = b.sync!.you.token;
    const slot = b.sync!.you.slot;
    const eid = b.role!.eid;
    b.sock.disconnect();
    await sleep(300);
    const back = await mkBot('Bot3', { room: code, token });
    expect(back.sync!.you.slot).toBe(slot);
    await waitFor(() => back.role !== null, 'role after rejoin');
    expect(back.role!.eid).toBe(eid); // same dwarf, mid-round
    bots[3] = back;
  });

  it('snapshots never contain names or slots on dwarfs', () => {
    for (const b of bots) {
      for (const s of b.snaps.slice(-5)) {
        for (const d of s.dw) {
          expect(Object.keys(d).sort()).toEqual(['eid', 'flags', 'hat', 'x', 'y']);
        }
      }
    }
  });
});
