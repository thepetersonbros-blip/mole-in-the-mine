// Everything secret lives in this module's state and NEVER goes through the
// shared serializers. The only way mole data reaches a socket is the private
// per-socket 'mole' message built in net/serialize.ts for the mole alone.

import {
  BODY_H,
  CART_X,
  HAT_COLORS,
  JAM_TICKS,
  MOLE_CD,
  REACH,
  SKIM_MAX,
  SKIM_MIN,
  SKIM_RANGE,
  SNUFF_RADIUS,
  SOUR_FUSE_MAX,
  SOUR_FUSE_MIN,
  SURFACE_Y,
  WORLD_W,
  type MoleAbility
} from '../../shared/constants';
import { T } from '../../shared/tiles';
import type { MoleActionMsg } from '../../shared/protocol';
import { getTile, idx, setTile } from './grid';
import type { MoleSecret, PlayerSlot, Room } from './types';
import { randInt } from '../../shared/rng';

export function dealMole(room: Room, eligible: PlayerSlot[], excludeSlot: number): MoleSecret | null {
  const pool = eligible.filter((p) => p.slot !== excludeSlot);
  const pick = (pool.length > 0 ? pool : eligible)[Math.floor(room.rand() * (pool.length > 0 ? pool.length : eligible.length))];
  if (!pick) return null;
  return {
    slot: pick.slot,
    stash: 0,
    cds: { sour: 0, skim: 0, snuff: 0, jam: 0, hat: 0 },
    soured: new Map(),
    hatHistory: [pick.hatTrue]
  };
}

export function handleMoleAction(room: Room, p: PlayerSlot, a: MoleActionMsg): void {
  const m = room.mole;
  if (!m || m.slot !== p.slot) return; // silently ignore impostors-of-the-impostor
  if (room.phase !== 'playing' || !p.dwarf || p.banished || p.dwarf.buried) return;
  if (p.dwarf.phys.stun > 0) return;
  const d = p.dwarf;
  const cx = d.phys.x;
  const cy = d.phys.y - BODY_H / 2;

  const ready = (k: MoleAbility) => m.cds[k] <= 0;
  const spend = (k: MoleAbility) => (m.cds[k] = MOLE_CD[k]);

  switch (a.type) {
    case 'sour': {
      if (!ready('sour')) return;
      if (getTile(room, a.x, a.y) !== T.POST) return;
      const dx = a.x + 0.5 - cx;
      const dy = a.y + 0.5 - cy;
      if (dx * dx + dy * dy > REACH * REACH) return;
      const fuse = randInt(room.rand, SOUR_FUSE_MIN, SOUR_FUSE_MAX);
      m.soured.set(idx(a.x, a.y), fuse);
      spend('sour');
      return; // perfectly silent: no event of any kind
    }
    case 'skim': {
      if (!ready('skim')) return;
      if (Math.abs(cx - (CART_X + 0.5)) > SKIM_RANGE || Math.abs(cy - SURFACE_Y) > 2.5) return;
      const amt = Math.min(room.cart, randInt(room.rand, SKIM_MIN, SKIM_MAX));
      if (amt <= 0) return;
      room.cart -= amt;
      m.stash += amt;
      room.events.push({ k: 'cart', total: room.cart }); // anonymous total change
      spend('skim');
      return;
    }
    case 'snuff': {
      if (!ready('snuff')) return;
      let any = false;
      for (const l of room.lanterns) {
        if (!l.lit) continue;
        const dx = l.x + 0.5 - cx;
        const dy = l.y + 0.5 - cy;
        if (dx * dx + dy * dy <= SNUFF_RADIUS * SNUFF_RADIUS) {
          l.lit = false;
          // identical payload to a natural fuel burnout
          room.events.push({ k: 'lantern', id: l.id, x: l.x, y: l.y, lit: false });
          any = true;
        }
      }
      if (any) spend('snuff');
      return;
    }
    case 'jam': {
      if (!ready('jam')) return;
      room.elevJam = JAM_TICKS;
      room.events.push({ k: 'elev', jammed: true });
      spend('jam');
      return;
    }
    case 'hat': {
      if (!ready('hat')) return;
      if (a.hat < 0 || a.hat >= HAT_COLORS.length) return;
      if (a.hat === d.hatShown) return;
      d.hatShown = a.hat;
      m.hatHistory.push(a.hat);
      spend('hat');
      return; // silent: the new hat simply appears in the next snapshot
    }
    default:
      return;
  }
}

export function tickMole(room: Room): void {
  const m = room.mole;
  if (!m) return;
  for (const k of Object.keys(m.cds) as MoleAbility[]) {
    if (m.cds[k] > 0) m.cds[k]--;
  }
  for (const [i, left] of m.soured) {
    if (left - 1 <= 0) {
      m.soured.delete(i);
      const x = i % WORLD_W;
      const y = Math.floor(i / WORLD_W);
      if (room.tiles[i] === T.POST) {
        // indistinguishable from a natural crumble
        setTile(room, x, y, T.AIR, 0, 'crumble');
      }
    } else {
      m.soured.set(i, left - 1);
    }
  }
}
