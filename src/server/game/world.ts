import {
  DIRT_BOTTOM,
  SHAFT_BOTTOM,
  SHAFT_DOORS,
  SHAFT_X1,
  SHAFT_X2,
  STONE_BOTTOM,
  SURFACE_Y,
  VEIN_COUNT,
  WORLD_H,
  WORLD_W
} from '../../shared/constants';
import { T, withGold } from '../../shared/tiles';
import { mulberry32, randInt } from '../../shared/rng';

export interface WorldGen {
  tiles: Uint8Array;
  meta: Uint8Array;
}

export function genWorld(seed: number): WorldGen {
  const W = WORLD_W;
  const H = WORLD_H;
  const tiles = new Uint8Array(W * H);
  const meta = new Uint8Array(W * H);
  const rand = mulberry32(seed);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (y < SURFACE_Y) {
        tiles[i] = T.AIR;
      } else if (y <= DIRT_BOTTOM) {
        tiles[i] = T.DIRT;
      } else if (y <= STONE_BOTTOM) {
        tiles[i] = T.STONE;
      } else {
        tiles[i] = T.DEEP;
      }
      // unbreakable border
      if (x === 0 || x === W - 1 || y === H - 1) tiles[i] = y < SURFACE_Y ? T.AIR : T.BEDROCK;
      if (y === H - 1) tiles[i] = T.BEDROCK;
    }
  }

  // A little terrain wobble: occasional stone boulders in dirt, dirt pockets in stone.
  for (let n = 0; n < 60; n++) {
    const x = randInt(rand, 2, W - 3);
    const y = randInt(rand, SURFACE_Y + 3, STONE_BOTTOM - 2);
    const t = y <= DIRT_BOTTOM ? T.STONE : T.DIRT;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const i = (y + dy) * W + (x + dx);
        if (tiles[i] !== T.BEDROCK) tiles[i] = t;
      }
  }

  // Gold veins: random walks; richer the deeper you go.
  for (let v = 0; v < VEIN_COUNT; v++) {
    // weight depth toward the bottom
    const r = rand();
    const y0 = SURFACE_Y + 2 + Math.floor(Math.pow(r, 0.75) * (H - SURFACE_Y - 8));
    let x = randInt(rand, 2, W - 3);
    let y = Math.min(y0, H - 4);
    const len = randInt(rand, 3, 9);
    for (let s = 0; s < len; s++) {
      const i = y * W + x;
      if (tiles[i] !== T.BEDROCK && tiles[i] !== T.AIR) {
        let g: number;
        if (y <= DIRT_BOTTOM) g = randInt(rand, 2, 4);
        else if (y <= STONE_BOTTOM) g = randInt(rand, 4, 8);
        else g = randInt(rand, 9, 15); // gems
        meta[i] = withGold(meta[i], g);
      }
      x += randInt(rand, -1, 1);
      y += randInt(rand, -1, 1);
      x = Math.max(2, Math.min(W - 3, x));
      y = Math.max(SURFACE_Y + 2, Math.min(H - 3, y));
    }
  }

  // Elevator shaft: interior air, bedrock-lined walls, doors at set depths.
  for (let y = SURFACE_Y; y <= SHAFT_BOTTOM; y++) {
    tiles[y * W + SHAFT_X1] = T.AIR;
    tiles[y * W + SHAFT_X2] = T.AIR;
    meta[y * W + SHAFT_X1] = 0;
    meta[y * W + SHAFT_X2] = 0;
    const door = SHAFT_DOORS.includes(y);
    tiles[y * W + (SHAFT_X1 - 1)] = door ? T.AIR : T.BEDROCK;
    tiles[y * W + (SHAFT_X2 + 1)] = door ? T.AIR : T.BEDROCK;
    if (door) {
      meta[y * W + (SHAFT_X1 - 1)] = 0;
      meta[y * W + (SHAFT_X2 + 1)] = 0;
    }
  }
  // shaft floor
  for (let x = SHAFT_X1 - 1; x <= SHAFT_X2 + 1; x++) {
    tiles[(SHAFT_BOTTOM + 1) * W + x] = T.BEDROCK;
  }
  // door sills: make sure there's something to stand on just outside each door
  for (const y of SHAFT_DOORS) {
    for (const x of [SHAFT_X1 - 1, SHAFT_X2 + 1]) {
      const below = (y + 1) * W + x;
      if (tiles[below] === T.AIR) tiles[below] = T.BEDROCK;
    }
  }

  // Clean camp surface: flat dirt row at SURFACE_Y across the camp area.
  for (let x = 20; x <= 45; x++) {
    tiles[SURFACE_Y * W + x] = T.DIRT;
    meta[SURFACE_Y * W + x] = 0;
    for (let y = 0; y < SURFACE_Y; y++) {
      tiles[y * W + x] = T.AIR;
      meta[y * W + x] = 0;
    }
  }

  return { tiles, meta };
}
