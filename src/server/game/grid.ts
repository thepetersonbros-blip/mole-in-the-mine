import { WORLD_H, WORLD_W } from '../../shared/constants';
import type { Ev } from '../../shared/protocol';
import type { Pile, Room } from './types';

export const inBounds = (x: number, y: number) => x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;
export const idx = (x: number, y: number) => y * WORLD_W + x;

export function getTile(room: Room, x: number, y: number): number {
  if (!inBounds(x, y)) return 4; // bedrock outside
  return room.tiles[idx(x, y)];
}
export function getMeta(room: Room, x: number, y: number): number {
  if (!inBounds(x, y)) return 0;
  return room.meta[idx(x, y)];
}

export function markDirty(room: Room, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (inBounds(x + dx, y + dy)) room.dirty.add(idx(x + dx, y + dy));
    }
  }
}

export function setTile(
  room: Room,
  x: number,
  y: number,
  t: number,
  m: number,
  cause: Extract<Ev, { k: 'tile' }>['cause']
): void {
  if (!inBounds(x, y)) return;
  const i = idx(x, y);
  room.tiles[i] = t;
  room.meta[i] = m;
  room.fuses.delete(i); // a changed tile is no longer the same ceiling
  room.events.push({ k: 'tile', x, y, t, m, cause });
  markDirty(room, x, y);
}

let pileSeq = 1;
export function spawnPile(room: Room, x: number, y: number, amt: number): void {
  if (amt <= 0) return;
  const existing = room.piles.find((p) => p.x === x && p.y === y);
  if (existing) {
    existing.amt += amt;
    room.events.push({ k: 'pile', id: existing.id, x, y, amt: existing.amt });
    return;
  }
  const pile: Pile = { id: pileSeq++, x, y, amt };
  room.piles.push(pile);
  room.events.push({ k: 'pile', id: pile.id, x, y, amt });
}

export function updatePile(room: Room, pile: Pile, amt: number): void {
  pile.amt = amt;
  room.events.push({ k: 'pile', id: pile.id, x: pile.x, y: pile.y, amt });
  if (amt <= 0) {
    const i = room.piles.indexOf(pile);
    if (i >= 0) room.piles.splice(i, 1);
  }
}
