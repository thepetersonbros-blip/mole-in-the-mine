import {
  ATTACK_CD,
  ATTACK_GOLD_DROP,
  ATTACK_RANGE,
  ATTACK_STUN,
  BELL_RANGE,
  BELL_X,
  BODY_H,
  BUILD,
  CARRY_CAP,
  CART_X,
  DYNAMITE_CHANCE,
  DYNAMITE_FUSE,
  DYNAMITE_MAX,
  LANTERN_FUEL,
  PING_FUZZ,
  POST_HP,
  REACH,
  RESCUE_TICKS,
  SURFACE_Y,
  WIGGLE_PING_CD
} from '../../shared/constants';
import { T, digTicks, isDiggable, isSolid, metaGold, metaHp, withHp } from '../../shared/tiles';
import type { ActionMsg } from '../../shared/protocol';
import { getMeta, getTile, idx, setTile, spawnPile } from './grid';
import { bury, dwarfOverlapsTile, tryRescueAt } from './collapse';
import type { PlayerSlot, Room } from './types';
import { startMeeting } from './meetings';

const center = (p: PlayerSlot) => ({ cx: p.dwarf!.phys.x, cy: p.dwarf!.phys.y - BODY_H / 2 });

function inReach(p: PlayerSlot, x: number, y: number, reach = REACH): boolean {
  const { cx, cy } = center(p);
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  return dx * dx + dy * dy <= reach * reach;
}

export function handleAction(room: Room, p: PlayerSlot, a: ActionMsg): void {
  if (room.phase !== 'playing' || !p.dwarf || p.banished) return;
  const d = p.dwarf;

  if (d.buried) {
    if (a.type === 'wiggle' && d.wiggleCd <= 0) {
      d.wiggleCd = WIGGLE_PING_CD;
      const fx = d.phys.x + (room.rand() * 2 - 1) * PING_FUZZ;
      const fy = d.phys.y + (room.rand() * 2 - 1) * PING_FUZZ;
      room.events.push({ k: 'ping', x: Math.round(fx * 2) / 2, y: Math.round(fy * 2) / 2 });
    }
    return; // nothing else while buried
  }
  if (d.phys.stun > 0 && a.type !== 'cancel') return;

  switch (a.type) {
    case 'dig': {
      const t = getTile(room, a.x, a.y);
      if (!isDiggable(t) || !inReach(p, a.x, a.y)) return;
      const occupied = anyBuriedAt(room, a.x, a.y);
      const total = occupied ? RESCUE_TICKS : digTicks(t);
      d.digging = { x: a.x, y: a.y, left: total, total, px: d.phys.x, py: d.phys.y };
      return;
    }
    case 'place': {
      placeThing(room, p, a.kind, a.x, a.y);
      return;
    }
    case 'deposit': {
      if (p.carry <= 0) return;
      const { cx, cy } = center(p);
      if (Math.abs(cx - (CART_X + 0.5)) > 2.5 || Math.abs(cy - SURFACE_Y) > 2.5) return;
      const amt = p.carry;
      p.carry = 0;
      room.cart += amt;
      p.stats.gold += amt;
      room.events.push({ k: 'deposit', name: p.name, amt, total: room.cart });
      return;
    }
    case 'attack': {
      doAttack(room, p);
      return;
    }
    case 'bell': {
      if (p.bellRings <= 0 || room.meetingCd > 0) return;
      const { cx, cy } = center(p);
      if (Math.abs(cx - (BELL_X + 0.5)) > BELL_RANGE || Math.abs(cy - SURFACE_Y) > 3) return;
      p.bellRings--;
      startMeeting(room, p.name);
      return;
    }
    case 'rescue': {
      // alias for dig (kept for protocol compatibility)
      handleAction(room, p, { type: 'dig', x: a.x, y: a.y });
      return;
    }
    case 'cancel': {
      d.digging = null;
      return;
    }
    case 'dynamite': {
      if (p.dynamite <= 0) return;
      p.dynamite--;
      room.dynamites.push({
        x: Math.floor(d.phys.x),
        y: Math.floor(d.phys.y - BODY_H / 2),
        fuse: DYNAMITE_FUSE
      });
      return;
    }
    case 'wiggle':
      return;
    default:
      return;
  }
}

function anyBuriedAt(room: Room, x: number, y: number): boolean {
  return room.players.some((q) => {
    if (!q?.dwarf?.buried) return false;
    return Math.floor(q.dwarf.phys.x) === x && Math.floor(q.dwarf.phys.y - 0.5) === y;
  });
}

function placeThing(room: Room, p: PlayerSlot, kind: keyof typeof BUILD, x: number, y: number): void {
  if (!BUILD[kind] || p.charges[kind] <= 0) return;
  if (!inReach(p, x, y)) return;
  if (getTile(room, x, y) !== T.AIR) return;
  const below = getTile(room, x, y + 1);
  if (kind === 'post') {
    if (!isSolid(below)) return;
    p.charges[kind]--;
    setTile(room, x, y, T.POST, withHp(0, POST_HP), 'place');
  } else if (kind === 'ladder') {
    if (!isSolid(below) && below !== T.LADDER) return;
    p.charges[kind]--;
    setTile(room, x, y, T.LADDER, 0, 'place');
  } else {
    // lantern entity, needs a floor
    if (!isSolid(below)) return;
    p.charges[kind]--;
    const id = room.nextId++;
    room.lanterns.push({ id, x, y, lit: true, fuel: LANTERN_FUEL });
    room.events.push({ k: 'lantern', id, x, y, lit: true });
  }
}

function doAttack(room: Room, p: PlayerSlot): void {
  const d = p.dwarf!;
  if (d.attackCd > 0) return;
  d.attackCd = ATTACK_CD;
  d.digging = null;
  const dir = d.phys.facing;
  const { cx, cy } = center(p);

  // 1) a dwarf in front?
  for (const q of room.players) {
    if (!q?.dwarf || q === p || q.banished || q.dwarf.buried) continue;
    const qx = q.dwarf.phys.x;
    const qy = q.dwarf.phys.y - BODY_H / 2;
    const dx = qx - cx;
    if (Math.sign(dx) !== dir && Math.abs(dx) > 0.4) continue;
    if (Math.abs(dx) > ATTACK_RANGE || Math.abs(qy - cy) > 1.2) continue;
    q.dwarf.phys.stun = Math.max(q.dwarf.phys.stun, ATTACK_STUN);
    q.dwarf.digging = null;
    p.stats.bonksGiven++;
    q.stats.bonksTaken++;
    const drop = Math.min(q.carry, 1 + Math.floor(room.rand() * ATTACK_GOLD_DROP));
    if (drop > 0) {
      q.carry -= drop;
      spawnPile(room, Math.floor(qx), Math.floor(q.dwarf.phys.y - 0.5), drop);
    }
    room.events.push({ k: 'swing', eid: d.eid, dir, hit: 'dwarf' });
    room.events.push({ k: 'stun', eid: q.dwarf.eid });
    return;
  }

  // 2) a structure in front? (post takes 2 hits, ladder 1, lantern 1)
  const tx = Math.floor(cx + dir * 1.0);
  const ty = Math.floor(cy);
  const t = getTile(room, tx, ty);
  if (t === T.POST) {
    const hp = Math.max(0, metaHp(getMeta(room, tx, ty)) - 1);
    if (hp <= 0) {
      setTile(room, tx, ty, T.AIR, 0, 'attack');
    } else {
      setTileMetaOnly(room, tx, ty, withHp(0, hp));
    }
    room.events.push({ k: 'swing', eid: d.eid, dir, hit: 'tile' });
    return;
  }
  if (t === T.LADDER) {
    setTile(room, tx, ty, T.AIR, 0, 'attack');
    room.events.push({ k: 'swing', eid: d.eid, dir, hit: 'tile' });
    return;
  }
  const lantern = room.lanterns.find(
    (l) => Math.abs(l.x + 0.5 - cx) <= ATTACK_RANGE + 0.5 && Math.sign(l.x + 0.5 - cx || dir) === dir && Math.abs(l.y - cy) <= 1.5
  );
  if (lantern) {
    room.lanterns.splice(room.lanterns.indexOf(lantern), 1);
    room.events.push({ k: 'lantern', id: lantern.id, x: lantern.x, y: lantern.y, lit: false });
    room.events.push({ k: 'swing', eid: d.eid, dir, hit: 'tile' });
    return;
  }
  room.events.push({ k: 'swing', eid: d.eid, dir, hit: 'air' });
}

function setTileMetaOnly(room: Room, x: number, y: number, m: number): void {
  const i = idx(x, y);
  room.meta[i] = m;
  room.events.push({ k: 'tile', x, y, t: room.tiles[i], m, cause: 'attack' });
}

// Called from the sim each tick while a dwarf is digging.
export function tickDig(room: Room, p: PlayerSlot): void {
  const d = p.dwarf!;
  if (!d.digging) return;
  // actually moving away (not just holding a direction) or getting hurt interrupts
  const drifted =
    Math.abs(d.phys.x - d.digging.px) > 0.2 || Math.abs(d.phys.y - d.digging.py) > 0.2;
  if (drifted || d.phys.stun > 0 || d.buried) {
    d.digging = null;
    return;
  }
  if (!inReach(p, d.digging.x, d.digging.y)) {
    d.digging = null;
    return;
  }
  const t = getTile(room, d.digging.x, d.digging.y);
  if (!isDiggable(t)) {
    d.digging = null;
    return;
  }
  d.digging.left--;
  if (d.digging.left > 0) return;

  const { x, y } = d.digging;
  d.digging = null;
  const gold = metaGold(getMeta(room, x, y));
  const wasEarth = getTile(room, x, y) !== T.RUBBLE;
  setTile(room, x, y, T.AIR, 0, 'dig');
  tryRescueAt(room, x, y, p);
  if (gold > 0) {
    const take = Math.min(gold, CARRY_CAP - p.carry);
    p.carry += take;
    if (gold - take > 0) spawnPile(room, x, y, gold - take);
  }
  // sometimes the earth gives back: a stick of dynamite
  if (wasEarth && p.dynamite < DYNAMITE_MAX && room.rand() < DYNAMITE_CHANCE) {
    p.dynamite++;
  }
}

// Auto-pickup: standing on a pile sucks coins into your pockets.
// Not while stunned: dropped loot must be stealable for bonks to matter.
export function tickPickups(room: Room, p: PlayerSlot): void {
  const d = p.dwarf!;
  if (d.buried || d.phys.stun > 0 || p.carry >= CARRY_CAP) return;
  const fx = Math.floor(d.phys.x);
  const fy = Math.floor(d.phys.y - 0.5);
  for (const pile of room.piles) {
    if ((pile.x === fx && (pile.y === fy || pile.y === fy + 1)) === false) continue;
    if (isSolid(getTile(room, pile.x, pile.y))) continue; // still under rubble
    const take = Math.min(pile.amt, CARRY_CAP - p.carry);
    if (take <= 0) continue;
    p.carry += take;
    pile.amt -= take;
    room.events.push({ k: 'pile', id: pile.id, x: pile.x, y: pile.y, amt: pile.amt });
    if (pile.amt <= 0) room.piles.splice(room.piles.indexOf(pile), 1);
    break;
  }
}

export { bury, dwarfOverlapsTile };
