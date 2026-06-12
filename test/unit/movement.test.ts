import { describe, expect, it } from 'vitest';
import { makePhys, step, type PhysWorld } from '../../src/shared/movement';
import { FALL_STUN_TICKS } from '../../src/shared/constants';

// tiny worlds from ASCII; '#' solid, 'L' ladder, '.' air; row 0 = y 0
function world(rows: string[]): PhysWorld {
  return {
    isSolid: (x, y) => rows[y]?.[x] === '#',
    isLadder: (x, y) => rows[y]?.[x] === 'L',
    platform: null
  };
}

const FLAT = world([
  '..........',
  '..........',
  '..........',
  '##########'
]);

describe('movement', () => {
  it('walks right on flat ground', () => {
    const p = makePhys(2, 3);
    for (let i = 0; i < 10; i++) step(p, { lr: 1, ud: 0, facing: 1 }, FLAT);
    expect(p.x).toBeGreaterThan(4);
    expect(p.y).toBe(3);
    expect(p.onGround).toBe(true);
  });

  it('is stopped by a wall', () => {
    const w = world([
      '..........',
      '....#.....',
      '....#.....',
      '##########'
    ]);
    const p = makePhys(2.5, 3);
    for (let i = 0; i < 30; i++) step(p, { lr: 1, ud: 0, facing: 1 }, w);
    expect(p.x).toBeLessThan(4);
  });

  it('auto-steps up a single tile', () => {
    const w = world([
      '..........',
      '..........',
      '....######',
      '##########'
    ]);
    const p = makePhys(2.5, 3);
    for (let i = 0; i < 14; i++) step(p, { lr: 1, ud: 0, facing: 1 }, w);
    expect(p.y).toBe(2);
    expect(p.x).toBeGreaterThan(4.5);
  });

  it('falls off ledges and lands', () => {
    const w = world([
      '..........',
      '###.......',
      '..........',
      '..........',
      '##########'
    ]);
    const p = makePhys(1.5, 1);
    for (let i = 0; i < 12; i++) step(p, { lr: 1, ud: 0, facing: 1 }, w);
    for (let i = 0; i < 30; i++) step(p, { lr: 0, ud: 0, facing: 1 }, w);
    expect(p.y).toBe(4);
    expect(p.onGround).toBe(true);
  });

  it('climbs ladders up and down', () => {
    const w = world([
      '..........',
      '....L.....',
      '....L.....',
      '....L.....',
      '##########'
    ]);
    const p = makePhys(4.5, 4);
    for (let i = 0; i < 60; i++) step(p, { lr: 0, ud: 1, facing: 1 }, w);
    expect(p.y).toBeLessThan(2.5);
    for (let i = 0; i < 80; i++) step(p, { lr: 0, ud: -1, facing: 1 }, w);
    expect(p.y).toBeGreaterThan(3.4);
  });

  it('hops off a ladder into a one-tall corridor (exit assist)', () => {
    // a ladder column with a 1x1 side tunnel halfway up
    const w = world([
      '..........',
      '####L#####',
      '....L.....', // <- corridor at y=2, reachable only with exact alignment
      '####L#####',
      '####L#####',
      '##########'
    ]);
    const p = makePhys(4.5, 5);
    // climb to a deliberately awkward height mid-corridor, then push right
    for (let i = 0; i < 200 && p.y > 3.2; i++) step(p, { lr: 0, ud: 1, facing: 1 }, w);
    let entered = false;
    for (let i = 0; i < 80; i++) {
      step(p, { lr: 1, ud: i % 4 === 0 ? 1 : 0, facing: 1 }, w);
      if (p.x > 5.6 && p.y === 3) entered = true;
    }
    expect(entered).toBe(true);
  });

  it('stuns after a long fall', () => {
    const w = world([
      '#.........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '..........',
      '##########'
    ]);
    const p = makePhys(1.5, 0);
    let stunned = false;
    for (let i = 0; i < 120; i++) {
      step(p, { lr: i < 4 ? 1 : 0, ud: 0, facing: 1 }, w);
      if (p.stun > 0) stunned = true;
    }
    expect(p.y).toBe(7);
    expect(stunned).toBe(true);
    expect(p.stun).toBeLessThanOrEqual(FALL_STUN_TICKS);
  });

  it('rides a platform', () => {
    const w: PhysWorld = {
      isSolid: () => false,
      isLadder: () => false,
      platform: { x1: 3, x2: 5, y: 6 }
    };
    const p = makePhys(4, 2);
    for (let i = 0; i < 100; i++) step(p, { lr: 0, ud: 0, facing: 1 }, w);
    expect(p.y).toBeCloseTo(6, 5);
    expect(p.onGround).toBe(true);
  });
});
