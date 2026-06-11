// Pure physics step shared by the server simulation and client prediction.
// Coordinates: x,y are the dwarf's FEET position in tile units. Tile row r
// occupies [r, r+1). Standing on top of tile row r means y === r.
// Determinism matters: identical inputs + identical world = identical result.

import {
  BODY_H,
  BODY_HW,
  CLIMB_SPEED,
  FALL_STUN_TICKS,
  FALL_STUN_TILES,
  GRAVITY,
  MAX_FALL,
  WALK_SPEED,
  WORLD_H,
  WORLD_W
} from './constants';

export interface Phys {
  x: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  onGround: boolean;
  onLadder: boolean;
  fallStart: number; // y where the current fall began; -1 when not falling
  stun: number; // ticks remaining
}

export interface StepInput {
  lr: -1 | 0 | 1;
  ud: -1 | 0 | 1; // +1 up, -1 down
  facing: 1 | -1;
}

export interface PhysWorld {
  isSolid(tx: number, ty: number): boolean;
  isLadder(tx: number, ty: number): boolean;
  // elevator platform top surface, or null
  platform: { x1: number; x2: number; y: number } | null;
}

export function makePhys(x: number, y: number): Phys {
  return { x, y, vy: 0, facing: 1, onGround: true, onLadder: false, fallStart: -1, stun: 0 };
}

const EPS = 0.001;

function bodyBlocked(w: PhysWorld, x: number, y: number): boolean {
  const top = Math.floor(y - BODY_H + EPS);
  const bot = Math.floor(y - EPS);
  const left = Math.floor(x - BODY_HW);
  const right = Math.floor(x + BODY_HW);
  for (let ty = top; ty <= bot; ty++) {
    for (let tx = left; tx <= right; tx++) {
      if (w.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

function onPlatform(w: PhysWorld, x: number, y: number): boolean {
  const p = w.platform;
  if (!p) return false;
  return x >= p.x1 - BODY_HW && x <= p.x2 + BODY_HW && Math.abs(y - p.y) < 0.005;
}

function groundBelow(w: PhysWorld, x: number, y: number): boolean {
  if (onPlatform(w, x, y)) return true;
  if (Math.abs(y - Math.round(y)) > EPS) return false; // not resting on a tile boundary
  const row = Math.round(y);
  const left = Math.floor(x - BODY_HW);
  const right = Math.floor(x + BODY_HW);
  for (let tx = left; tx <= right; tx++) {
    if (w.isSolid(tx, row)) return true;
  }
  return false;
}

export interface StepResult {
  landedFall: number; // tiles fallen on a landing this tick, else 0
}

export function step(p: Phys, input: StepInput, w: PhysWorld): StepResult {
  const res: StepResult = { landedFall: 0 };
  let lr = input.lr;
  let ud = input.ud;
  if (p.stun > 0) {
    p.stun--;
    lr = 0;
    ud = 0;
  } else {
    p.facing = input.facing;
  }

  // Ladder state from body center tile.
  const cx = Math.floor(p.x);
  const cy = Math.floor(p.y - BODY_H / 2);
  p.onLadder = w.isLadder(cx, cy) || w.isLadder(Math.floor(p.x), Math.floor(p.y - EPS));

  // --- horizontal ---
  if (lr !== 0) {
    const nx = clampX(p.x + lr * WALK_SPEED);
    if (!bodyBlocked(w, nx, p.y)) {
      p.x = nx;
    } else if (p.onGround && !bodyBlocked(w, nx, p.y - 1) && !bodyBlocked(w, p.x, p.y - 1)) {
      // auto step-up of exactly 1 tile
      p.y = Math.round(p.y) - 1;
      p.x = nx;
      p.vy = 0;
    }
  }

  // --- vertical ---
  if (p.onLadder) {
    p.vy = 0;
    p.fallStart = -1;
    if (ud !== 0) {
      const ny = p.y - ud * CLIMB_SPEED;
      if (!bodyBlocked(w, p.x, ny)) p.y = clampY(ny);
      // climbing down off the ladder onto ground settles naturally next tick
    }
  } else {
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
    let ny = p.y + p.vy;
    // platform catch (only when moving down through its surface)
    const plat = w.platform;
    if (
      plat &&
      p.vy >= 0 &&
      p.x >= plat.x1 - BODY_HW &&
      p.x <= plat.x2 + BODY_HW &&
      p.y <= plat.y + EPS &&
      ny >= plat.y
    ) {
      ny = plat.y;
      land(p, res, ny);
      p.y = clampY(ny);
    } else if (p.vy > 0) {
      // tile floor catch: feet crossing into a solid row
      const fromRow = Math.floor(p.y + EPS);
      const toRow = Math.floor(ny + EPS);
      let landedRow = -1;
      for (let row = fromRow; row <= toRow; row++) {
        if (row <= Math.floor(p.y - EPS)) continue;
        const left = Math.floor(p.x - BODY_HW);
        const right = Math.floor(p.x + BODY_HW);
        let solid = false;
        for (let tx = left; tx <= right; tx++) if (w.isSolid(tx, row)) solid = true;
        if (solid) {
          landedRow = row;
          break;
        }
      }
      if (landedRow >= 0) {
        ny = landedRow;
        land(p, res, ny);
      } else {
        if (p.fallStart < 0) p.fallStart = p.y;
        p.onGround = false;
      }
      p.y = clampY(ny);
    } else {
      p.y = clampY(ny);
    }
  }

  // settle/refresh ground state
  if (groundBelow(w, p.x, p.y)) {
    p.onGround = true;
    p.vy = 0;
  } else if (!p.onLadder) {
    p.onGround = false;
  }

  // Buried-in-wall safety: if the world changed around us (rubble landed in
  // our tile), don't apply physics into solids; the bury system handles it.
  return res;
}

function land(p: Phys, res: StepResult, y: number) {
  if (p.fallStart >= 0) {
    const dist = y - p.fallStart;
    if (dist > FALL_STUN_TILES) {
      p.stun = Math.max(p.stun, FALL_STUN_TICKS);
      res.landedFall = dist;
    }
  }
  p.fallStart = -1;
  p.vy = 0;
  p.onGround = true;
}

function clampX(x: number): number {
  return Math.min(Math.max(x, 1 + BODY_HW), WORLD_W - 1 - BODY_HW);
}
function clampY(y: number): number {
  return Math.min(Math.max(y, 1), WORLD_H - 1);
}
