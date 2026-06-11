import { describe, expect, it } from 'vitest';
import { genWorld } from '../../src/server/game/world';
import {
  SHAFT_BOTTOM,
  SHAFT_DOORS,
  SHAFT_X1,
  SHAFT_X2,
  SURFACE_Y,
  WORLD_H,
  WORLD_W
} from '../../src/shared/constants';
import { T, metaGold } from '../../src/shared/tiles';

describe('worldgen', () => {
  it('same seed makes the same world', () => {
    const a = genWorld(123);
    const b = genWorld(123);
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(true);
    expect(Buffer.from(a.meta).equals(Buffer.from(b.meta))).toBe(true);
  });

  it('different seeds differ', () => {
    const a = genWorld(123);
    const b = genWorld(456);
    expect(Buffer.from(a.tiles).equals(Buffer.from(b.tiles))).toBe(false);
  });

  it('has a sealed border and a sky', () => {
    const { tiles } = genWorld(9);
    for (let y = SURFACE_Y; y < WORLD_H; y++) {
      expect(tiles[y * WORLD_W]).toBe(T.BEDROCK);
      expect(tiles[y * WORLD_W + WORLD_W - 1]).toBe(T.BEDROCK);
    }
    for (let x = 0; x < WORLD_W; x++) {
      expect(tiles[(WORLD_H - 1) * WORLD_W + x]).toBe(T.BEDROCK);
      expect(tiles[2 * WORLD_W + x]).toBe(T.AIR);
    }
  });

  it('elevator shaft is open with doors and standable sills', () => {
    const { tiles } = genWorld(9);
    for (let y = SURFACE_Y; y <= SHAFT_BOTTOM; y++) {
      expect(tiles[y * WORLD_W + SHAFT_X1]).toBe(T.AIR);
      expect(tiles[y * WORLD_W + SHAFT_X2]).toBe(T.AIR);
    }
    for (const y of SHAFT_DOORS) {
      expect(tiles[y * WORLD_W + (SHAFT_X1 - 1)]).toBe(T.AIR);
      expect(tiles[y * WORLD_W + (SHAFT_X2 + 1)]).toBe(T.AIR);
      // something solid right below the doorway
      expect(tiles[(y + 1) * WORLD_W + (SHAFT_X1 - 1)]).not.toBe(T.AIR);
    }
  });

  it('has gold, and the deep stuff is richer', () => {
    const { tiles, meta } = genWorld(42);
    let shallow = 0;
    let shallowN = 0;
    let deep = 0;
    let deepN = 0;
    for (let y = SURFACE_Y; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const g = metaGold(meta[y * WORLD_W + x]);
        if (g === 0 || tiles[y * WORLD_W + x] === T.AIR) continue;
        if (y <= 25) {
          shallow += g;
          shallowN++;
        } else if (y > 50) {
          deep += g;
          deepN++;
        }
      }
    }
    expect(shallowN).toBeGreaterThan(3);
    expect(deepN).toBeGreaterThan(3);
    expect(deep / deepN).toBeGreaterThan(shallow / shallowN);
  });
});
