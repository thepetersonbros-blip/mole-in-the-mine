// THE AUDIT. Serialize every payload type during a live mole game and prove
// that nothing a non-mole client receives can identify the mole, the stash,
// the soured posts, or tie a hat swap to a person.

import { describe, expect, it } from 'vitest';
import { T } from '../../src/shared/tiles';
import { setTile } from '../../src/server/game/grid';
import { startRound } from '../../src/server/game/rules';
import { handleMoleAction } from '../../src/server/game/mole';
import { handleVote, startMeeting } from '../../src/server/game/meetings';
import {
  buildMe,
  buildMole,
  buildRole,
  buildSnap,
  buildSync
} from '../../src/server/net/serialize';
import { addPlayer, cleanup, testRoom, ticks } from '../fixtures/world';

const FORBIDDEN_KEYS = ['stash', 'soured', 'hatHistory', 'moleSlot', 'moleName', 'cds', 'votedMoleEver'];

function deepKeys(obj: unknown, out = new Set<string>()): Set<string> {
  if (obj === null || typeof obj !== 'object') return out;
  if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) return out;
  if (Array.isArray(obj)) {
    for (const v of obj) deepKeys(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out.add(k);
    deepKeys(v, out);
  }
  return out;
}

describe('secrecy audit', () => {
  it('no payload a non-mole receives can expose the mole', () => {
    const room = testRoom(99);
    for (let i = 0; i < 6; i++) addPlayer(room, `P${i}`, 27 + i * 2, 8);
    startRound(room);
    ticks(room, 100); // into 'playing'
    expect(room.mole).not.toBeNull();
    const moleSlot = room.mole!.slot;
    const mole = room.players[moleSlot]!;

    // the mole commits every crime in the book
    room.cart = 60;
    mole.dwarf!.phys.x = 30.5;
    mole.dwarf!.phys.y = 8;
    setTile(room, 31, 7, T.POST, (2 << 6), 'place');
    handleMoleAction(room, mole, { type: 'sour', x: 31, y: 7 });
    handleMoleAction(room, mole, { type: 'skim' });
    handleMoleAction(room, mole, { type: 'snuff' });
    handleMoleAction(room, mole, { type: 'jam' });
    handleMoleAction(room, mole, { type: 'hat', hat: 8 });
    const events = ticks(room, 700); // includes the soured crumble

    // 1) world events carry no forbidden keys and no actor on sabotage shapes
    for (const ev of events) {
      const keys = deepKeys(ev);
      for (const f of FORBIDDEN_KEYS) expect(keys.has(f), `event leaked "${f}"`).toBe(false);
      if (ev.k === 'tile' && (ev.cause === 'crumble' || ev.cause === 'rockfall')) {
        expect(Object.keys(ev).sort()).toEqual(['cause', 'k', 'm', 't', 'x', 'y']);
      }
      if (ev.k === 'cart') expect(Object.keys(ev).sort()).toEqual(['k', 'total']);
      if (ev.k === 'lantern') expect(Object.keys(ev).sort()).toEqual(['id', 'k', 'lit', 'x', 'y']);
      if (ev.k === 'elev') expect(Object.keys(ev).sort()).toEqual(['jammed', 'k']);
    }

    // 2) snapshots: dwarfs are opaque (eid/x/y/hat/flags), no slot, no name
    const snap = buildSnap(room);
    for (const d of snap.dw) {
      expect(Object.keys(d).sort()).toEqual(['eid', 'flags', 'hat', 'x', 'y']);
    }
    const snapKeys = deepKeys(snap);
    for (const f of FORBIDDEN_KEYS) expect(snapKeys.has(f)).toBe(false);

    // 3) per-player payloads
    for (const p of room.players) {
      if (!p) continue;
      const isMole = p.slot === moleSlot;
      const sync = buildSync(room, p);
      const me = buildMe(p);
      const role = buildRole(room, p);
      const keys = new Set<string>([...deepKeys(sync), ...deepKeys(me)]);
      for (const f of FORBIDDEN_KEYS) expect(keys.has(f), `sync/me leaked "${f}"`).toBe(false);
      expect(role.mole).toBe(isMole);
      // sync.dw must not link eids to roster slots
      for (const d of sync.dw ?? []) {
        expect(Object.keys(d).sort()).toEqual(['eid', 'flags', 'hat', 'x', 'y']);
      }
      // roster shows TRUE hats only, never the shown/disguised hat
      const rosterMole = sync.roster.find((r) => r.slot === moleSlot)!;
      expect(rosterMole.hat).toBe(mole.hatTrue);
      expect(rosterMole.hat).not.toBe(8);
    }

    // 4) the disguise is live: some dwarf wears hat 8, but nothing says who
    expect(snap.dw.some((d) => d.hat === 8)).toBe(true);

    // 5) the mole's own private channel works and is the ONLY stash carrier
    const priv = buildMole(room)!;
    expect(priv.stash).toBeGreaterThan(0);
    cleanup(room);
  });

  it('after a meeting, every entity id is reshuffled (no cross-meeting tracking)', () => {
    const room = testRoom(101);
    for (let i = 0; i < 6; i++) addPlayer(room, `P${i}`, 27 + i * 2, 8);
    startRound(room);
    ticks(room, 100);
    const before = room.players.filter((p) => p?.dwarf).map((p) => p!.dwarf!.eid);
    // run a meeting that banishes nobody
    startMeeting(room, 'P0');
    for (const p of room.players) if (p) handleVote(room, p, { target: 'skip' });
    ticks(room, 200); // result shown, play resumed
    expect(room.phase).toBe('playing');
    const after = room.players.filter((p) => p?.dwarf).map((p) => p!.dwarf!.eid);
    for (const e of after) expect(before).not.toContain(e);
    cleanup(room);
  });
});
