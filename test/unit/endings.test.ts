// Every way a round can end, plus core verbs (dig, carry, deposit, attack,
// bury, rescue) driven through the real handlers.

import { describe, expect, it } from 'vitest';
import { QUOTA, STASH_TARGET } from '../../src/shared/constants';
import { T, withGold } from '../../src/shared/tiles';
import { startRound } from '../../src/server/game/rules';
import { handleAction } from '../../src/server/game/actions';
import { handleMoleAction } from '../../src/server/game/mole';
import { handleVote, startMeeting } from '../../src/server/game/meetings';
import { setTile } from '../../src/server/game/grid';
import { bury } from '../../src/server/game/collapse';
import type { PlayerSlot, Room } from '../../src/server/game/types';
import { addPlayer, cleanup, testRoom, ticks } from '../fixtures/world';

function startedRoom(n = 6, seed = 50): { room: Room; players: PlayerSlot[] } {
  const room = testRoom(seed);
  const players: PlayerSlot[] = [];
  for (let i = 0; i < n; i++) players.push(addPlayer(room, `P${i}`, 28 + i, 8));
  startRound(room);
  ticks(room, 100); // through the intro
  expect(room.phase).toBe('playing');
  return { room, players };
}

const molePlayer = (room: Room) => room.players[room.mole!.slot]!;
const nonMole = (room: Room) => room.players.find((p) => p && p.slot !== room.mole!.slot)!;

describe('round endings', () => {
  it('miners win on quota', () => {
    const { room } = startedRoom();
    room.cart = QUOTA;
    ticks(room, 2);
    expect(room.phase).toBe('roundEnd');
    expect(room.lastRoundEnd?.winner).toBe('miners');
    expect(room.lastRoundEnd?.reason).toBe('quota');
    cleanup(room);
  });

  it('mole wins on the whistle', () => {
    const { room } = startedRoom();
    expect(room.mole).not.toBeNull();
    room.roundTicksLeft = 1;
    ticks(room, 2);
    expect(room.lastRoundEnd?.winner).toBe('mole');
    expect(room.lastRoundEnd?.reason).toBe('timer');
    cleanup(room);
  });

  it('mole wins by stash', () => {
    const { room } = startedRoom();
    room.mole!.stash = STASH_TARGET;
    ticks(room, 2);
    expect(room.lastRoundEnd?.winner).toBe('mole');
    expect(room.lastRoundEnd?.reason).toBe('stash');
    cleanup(room);
  });

  it('miners win by banishing the mole; vote reveal is correct', () => {
    const { room } = startedRoom();
    const mole = room.mole!.slot;
    startMeeting(room, 'P0');
    expect(room.phase).toBe('meeting');
    for (const p of room.players) {
      if (p) handleVote(room, p, { target: mole });
    }
    expect(room.phase).toBe('roundEnd');
    expect(room.lastRoundEnd?.winner).toBe('miners');
    expect(room.lastRoundEnd?.reason).toBe('banished');
    expect(room.lastRoundEnd?.moleSlot).toBe(mole);
    cleanup(room);
  });

  it('banishing an innocent resumes play with that player out', () => {
    const { room } = startedRoom();
    const victim = nonMole(room);
    startMeeting(room, 'P0');
    for (const p of room.players) {
      if (p) handleVote(room, p, { target: victim.slot });
    }
    expect(room.phase).toBe('meeting'); // result is being shown
    ticks(room, 200);
    expect(room.phase).toBe('playing');
    expect(victim.banished).toBe(true);
    // fresh identities after the meeting
    const eids = room.players.filter((p) => p?.dwarf).map((p) => p!.dwarf!.eid);
    expect(new Set(eids).size).toBe(eids.length);
    cleanup(room);
  });

  it('a tie banishes nobody', () => {
    const { room, players } = startedRoom();
    startMeeting(room, 'P0');
    for (let i = 0; i < players.length; i++) {
      handleVote(room, players[i], { target: i < 3 ? 0 : 1 });
    }
    ticks(room, 200);
    expect(room.phase).toBe('playing');
    expect(room.players.every((p) => !p || !p.banished)).toBe(true);
    cleanup(room);
  });
});

describe('core verbs', () => {
  it('dig a gold tile, carry it, deposit it (with the public name tag)', () => {
    const { room } = startedRoom();
    const p = nonMole(room);
    const d = p.dwarf!;
    // teleport onto a controlled spot: solid gold tile right below
    d.phys.x = 25.5;
    d.phys.y = 8;
    const tx = 25;
    const ty = 8;
    setTile(room, tx, ty, T.DIRT, withGold(0, 5), 'place');
    handleAction(room, p, { type: 'dig', x: tx, y: ty });
    const evs = ticks(room, 60);
    expect(p.carry).toBe(5);
    expect(evs.some((e) => e.k === 'tile' && e.cause === 'dig' && e.x === tx)).toBe(true);
    // walk to the cart and deposit
    d.phys.x = 30.5;
    d.phys.y = 8;
    handleAction(room, p, { type: 'deposit' });
    expect(room.cart).toBe(5);
    expect(p.carry).toBe(0);
    expect(room.events.some((e) => e.k === 'deposit' && (e as any).name === p.name)).toBe(true);
    cleanup(room);
  });

  it('attack stuns, knocks gold loose, and credits the bonk', () => {
    const { room } = startedRoom();
    const a = room.players[0]!;
    const b = room.players[1]!;
    a.dwarf!.phys.x = 30;
    a.dwarf!.phys.y = 8;
    a.dwarf!.phys.facing = 1;
    b.dwarf!.phys.x = 31;
    b.dwarf!.phys.y = 8;
    b.carry = 10;
    handleAction(room, a, { type: 'attack' });
    expect(b.dwarf!.phys.stun).toBeGreaterThan(0);
    expect(b.carry).toBeLessThan(10);
    expect(a.stats.bonksGiven).toBe(1);
    expect(b.stats.bonksTaken).toBe(1);
    // dropped coins exist as a pile
    expect(room.piles.length).toBeGreaterThan(0);
    // cooldown: immediate second swing does nothing
    handleAction(room, a, { type: 'attack' });
    expect(a.stats.bonksGiven).toBe(1);
    cleanup(room);
  });

  it('attacks break posts in two hits', () => {
    const { room } = startedRoom();
    const a = room.players[0]!;
    a.dwarf!.phys.x = 30;
    a.dwarf!.phys.y = 8;
    a.dwarf!.phys.facing = 1;
    // post stands in the air row, on top of the surface ground
    setTile(room, 31, 7, T.POST, (2 << 6), 'place');
    handleAction(room, a, { type: 'attack' });
    expect(room.tiles[7 * 96 + 31]).toBe(T.POST);
    a.dwarf!.attackCd = 0;
    handleAction(room, a, { type: 'attack' });
    expect(room.tiles[7 * 96 + 31]).toBe(T.AIR);
    cleanup(room);
  });

  it('burying drops your gold; a friend digging you out is a rescue', () => {
    const { room } = startedRoom();
    const victim = room.players[2]!;
    const hero = room.players[3]!;
    victim.carry = 7;
    victim.dwarf!.phys.x = 33.5;
    victim.dwarf!.phys.y = 8; // on the surface
    bury(room, victim);
    setTile(room, 33, 7, T.RUBBLE, 0, 'rockfall'); // the rubble entombing them
    expect(victim.dwarf!.buried).toBe(true);
    expect(victim.carry).toBe(0);
    expect(room.piles.some((g) => g.amt === 7)).toBe(true);
    // hero digs the rubble at the victim's tile
    hero.dwarf!.phys.x = 32.5;
    hero.dwarf!.phys.y = 8;
    handleAction(room, hero, { type: 'dig', x: 33, y: 7 });
    const evs = ticks(room, 80);
    expect(victim.dwarf!.buried).toBe(false);
    expect(hero.stats.rescues).toBe(1);
    expect(evs.some((e) => e.k === 'rescue')).toBe(true);
    cleanup(room);
  });

  it('wiggle pings are fuzzed and anonymous', () => {
    const { room } = startedRoom();
    const victim = room.players[2]!;
    victim.dwarf!.phys.x = 33.5;
    victim.dwarf!.phys.y = 10;
    bury(room, victim);
    handleAction(room, victim, { type: 'wiggle' });
    const ping = room.events.find((e) => e.k === 'ping') as { k: 'ping'; x: number; y: number };
    expect(ping).toBeTruthy();
    expect(Object.keys(ping).sort()).toEqual(['k', 'x', 'y']);
    cleanup(room);
  });
});

describe('dynamite', () => {
  it('explodes after its fuse, breaks earth, scatters gold, stuns the careless', () => {
    const { room } = startedRoom();
    const digger = room.players[0]!;
    const bystander = room.players[1]!;
    digger.dynamite = 1;
    digger.dwarf!.phys.x = 25.5;
    digger.dwarf!.phys.y = 8;
    bystander.dwarf!.phys.x = 26.5;
    bystander.dwarf!.phys.y = 8;
    bystander.carry = 6;
    // gold right below the blast
    setTile(room, 25, 8, T.DIRT, withGold(0, 4), 'place');
    handleAction(room, digger, { type: 'dynamite' });
    expect(room.dynamites.length).toBe(1);
    expect(digger.dynamite).toBe(0);
    const evs = ticks(room, 60);
    expect(evs.some((e) => e.k === 'boom')).toBe(true);
    expect(evs.some((e) => e.k === 'quake')).toBe(true);
    // earth in the 3x3 around the stick is gone
    expect(room.tiles[8 * 96 + 25]).toBe(T.AIR);
    // the gold survived as a pile
    expect(room.piles.some((g) => g.amt >= 4)).toBe(true);
    // the bystander got rattled and dropped their pockets
    expect(bystander.carry).toBe(0);
    cleanup(room);
  });
});

describe('mole abilities', () => {
  it('soured posts crumble later with an anonymous event', () => {
    const { room } = startedRoom();
    const m = molePlayer(room);
    m.dwarf!.phys.x = 30;
    m.dwarf!.phys.y = 8;
    setTile(room, 31, 7, T.POST, (2 << 6), 'place');
    room.events = [];
    handleMoleAction(room, m, { type: 'sour', x: 31, y: 7 });
    expect(room.events.length).toBe(0); // perfectly silent
    const evs = ticks(room, 700);
    const crumble = evs.find((e) => e.k === 'tile' && e.cause === 'crumble' && e.x === 31);
    expect(crumble).toBeTruthy();
    expect(Object.keys(crumble!).sort()).toEqual(['cause', 'k', 'm', 't', 'x', 'y']);
    cleanup(room);
  });

  it('skims are silent cart drops; stash grows', () => {
    const { room } = startedRoom();
    const m = molePlayer(room);
    room.cart = 50;
    m.dwarf!.phys.x = 30.5;
    m.dwarf!.phys.y = 8;
    handleMoleAction(room, m, { type: 'skim' });
    expect(room.cart).toBeLessThan(50);
    expect(room.mole!.stash).toBeGreaterThan(0);
    const ev = room.events.find((e) => e.k === 'cart') as any;
    expect(ev).toBeTruthy();
    expect(Object.keys(ev).sort()).toEqual(['k', 'total']);
    cleanup(room);
  });

  it('hat swaps change the shown hat and are recorded in history', () => {
    const { room } = startedRoom();
    const m = molePlayer(room);
    const before = m.dwarf!.hatShown;
    handleMoleAction(room, m, { type: 'hat', hat: 9 });
    expect(m.dwarf!.hatShown).toBe(9);
    expect(m.dwarf!.hatShown).not.toBe(before);
    expect(room.mole!.hatHistory).toContain(9);
    // non-mole cannot
    const honest = nonMole(room);
    const h = honest.dwarf!.hatShown;
    handleMoleAction(room, honest, { type: 'hat', hat: 8 });
    expect(honest.dwarf!.hatShown).toBe(h);
    cleanup(room);
  });

  it('jam freezes the elevator and announces anonymously', () => {
    const { room } = startedRoom();
    const m = molePlayer(room);
    handleMoleAction(room, m, { type: 'jam' });
    expect(room.elevJam).toBeGreaterThan(0);
    const ev = room.events.find((e) => e.k === 'elev') as any;
    expect(Object.keys(ev).sort()).toEqual(['jammed', 'k']);
    cleanup(room);
  });
});
