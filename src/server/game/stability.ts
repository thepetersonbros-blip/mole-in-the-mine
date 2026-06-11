// The cave-in brain. Air tiles underground form horizontal "segments" bounded
// by anchors (solid tiles or posts). The solid ceiling above a segment cracks
// when the segment is too wide, then falls on a deterministic fuse.

import {
  FUSE_CRIT,
  FUSE_MAX,
  FUSE_MIN,
  SCAN_BUDGET,
  SPAN_CRIT,
  SPAN_STABLE,
  SURFACE_Y,
  WORLD_W
} from '../../shared/constants';
import { T, isAnchor, isSolid, metaCrack, withCrack } from '../../shared/tiles';
import { hash2d } from '../../shared/rng';
import { getTile, idx, inBounds } from './grid';
import type { Room } from './types';

const SCAN_CAP = 12; // max tiles scanned each direction; beyond = huge cavern = critical

export function processStability(room: Room): void {
  if (room.dirty.size === 0) return;
  const batch: number[] = [];
  for (const i of room.dirty) {
    batch.push(i);
    if (batch.length >= SCAN_BUDGET) break;
  }
  const visited = new Set<number>(); // segment keys handled this pass
  for (const i of batch) {
    room.dirty.delete(i);
    const x = i % WORLD_W;
    const y = Math.floor(i / WORLD_W);
    if (y <= SURFACE_Y) continue; // sky and the surface row have open air above
    if (getTile(room, x, y) !== T.AIR && getTile(room, x, y) !== T.LADDER) continue;
    evaluateSegment(room, x, y, visited);
  }
}

function evaluateSegment(room: Room, x: number, y: number, visited: Set<number>): void {
  // walk to the left anchor
  let left = x;
  let steps = 0;
  while (steps < SCAN_CAP && !isAnchor(getTile(room, left - 1, y))) {
    left--;
    steps++;
  }
  const key = idx(left, y);
  if (visited.has(key)) return;
  visited.add(key);

  let right = x;
  steps = 0;
  while (steps < SCAN_CAP && !isAnchor(getTile(room, right + 1, y))) {
    right++;
    steps++;
  }
  const span = right - left + 1;
  const capped = span >= SCAN_CAP * 2; // never found anchors: treat as huge

  let stage = 0;
  if (capped || span >= SPAN_CRIT) stage = 2;
  else if (span > SPAN_STABLE) stage = 1;

  for (let cx = left; cx <= right; cx++) {
    applyStage(room, cx, y - 1, stage);
  }
}

function applyStage(room: Room, x: number, y: number, stage: number): void {
  if (!inBounds(x, y) || y < SURFACE_Y) return;
  const t = getTile(room, x, y);
  if (!isSolid(t) || t === T.BEDROCK) {
    // nothing above to fall here (taller cavern column or unbreakable rock)
    return;
  }
  const i = idx(x, y);
  const cur = metaCrack(room.meta[i]);
  if (cur === stage) return;
  room.meta[i] = withCrack(room.meta[i], stage);
  if (stage === 0) {
    room.fuses.delete(i);
  } else if (stage === 1) {
    const dur = FUSE_MIN + Math.floor(hash2d(room.seed, x, y) * (FUSE_MAX - FUSE_MIN));
    room.fuses.set(i, { left: dur, stage });
  } else {
    const existing = room.fuses.get(i);
    const left = existing ? Math.min(existing.left, FUSE_CRIT) : FUSE_CRIT;
    room.fuses.set(i, { left, stage });
  }
  room.events.push({ k: 'crack', x, y, stage });
}
