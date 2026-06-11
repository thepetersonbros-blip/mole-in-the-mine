import { describe, expect, it } from 'vitest';
import { FUSE_MAX, FUSE_MIN, SPAN_STABLE } from '../../src/shared/constants';
import { T } from '../../src/shared/tiles';
import { setTile } from '../../src/server/game/grid';
import { cleanup, sandboxRound, snapAscii, stamp, testRoom, ticks } from '../fixtures/world';

// All scenarios stamp into a solid bedrock world around (20, 20).

describe('stability and cave-ins', () => {
  it('a narrow tunnel (span <= 4) never collapses', () => {
    const room = testRoom(1);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ######
      #....#
      ######
    `);
    ticks(room, FUSE_MAX + 200);
    expect(snapAscii(room, 20, 18, 6, 3)).toBe('######\n#....#\n######');
    expect(room.fuses.size).toBe(0);
    cleanup(room);
  });

  it('a wide tunnel cracks, then the ceiling falls as rubble', () => {
    const room = testRoom(2);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ########
      #......#
      ########
    `);
    const evs = ticks(room, FUSE_MAX + 400);
    const cracks = evs.filter((e) => e.k === 'crack' && e.stage > 0);
    expect(cracks.length).toBeGreaterThan(0);
    const falls = evs.filter((e) => e.k === 'tile' && e.cause === 'rockfall');
    expect(falls.length).toBeGreaterThan(0);
    // a quake was felt
    expect(evs.some((e) => e.k === 'quake')).toBe(true);
    // rubble landed inside the old corridor
    const strip = snapAscii(room, 21, 19, 6, 1);
    expect(strip).toContain('R');
    cleanup(room);
  });

  it('a post splits a wide span into stable halves', () => {
    const room = testRoom(3);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ##########
      #...P....#
      ##########
    `);
    ticks(room, FUSE_MAX + 200);
    expect(snapAscii(room, 20, 18, 10, 3)).toBe('##########\n#...P....#\n##########');
    cleanup(room);
  });

  it('breaking the post triggers the collapse', () => {
    const room = testRoom(4);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ##########
      #...P....#
      ##########
    `);
    ticks(room, 50); // settle: stable
    setTile(room, 24, 19, T.AIR, 0, 'crumble'); // the post "fails"
    const evs = ticks(room, FUSE_MAX + 400);
    expect(evs.some((e) => e.k === 'tile' && e.cause === 'rockfall')).toBe(true);
    cleanup(room);
  });

  it('cascades settle: no fuses or rocks left after a big collapse', () => {
    const room = testRoom(5);
    sandboxRound(room);
    stamp(room, 20, 14, `
      ############
      ############
      ############
      #..........#
      ############
    `);
    ticks(room, (FUSE_MAX + 100) * 4);
    expect(room.fuses.size).toBe(0);
    expect(room.rocks.length).toBe(0);
    cleanup(room);
  });

  it('same seed = identical collapse timeline (determinism)', () => {
    const run = (seed: number) => {
      const room = testRoom(seed);
      sandboxRound(room);
      stamp(room, 20, 18, `
        #########
        #.......#
        #########
      `);
      ticks(room, FUSE_MAX + 300);
      const result = snapAscii(room, 20, 18, 9, 3);
      cleanup(room);
      return result;
    };
    expect(run(77)).toBe(run(77));
  });

  it('cracking gives fair warning: fuse respects FUSE_MIN', () => {
    const room = testRoom(6);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ########
      #......#
      ########
    `);
    const early = ticks(room, FUSE_MIN - 20);
    expect(early.some((e) => e.k === 'tile' && e.cause === 'crumble')).toBe(false);
    expect(early.some((e) => e.k === 'crack' && e.stage === 1)).toBe(true);
    cleanup(room);
  });

  it(`span constant sanity: SPAN_STABLE is ${SPAN_STABLE}`, () => {
    expect(SPAN_STABLE).toBeGreaterThanOrEqual(3);
    expect(SPAN_STABLE).toBeLessThan(7);
  });

  it('staircases with no posts are NOT free: the run keeps counting downhill', () => {
    const room = testRoom(8);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ##########
      #.########
      ##.#######
      ###.######
      ####.#####
      #####.####
      ######.###
      #######.##
      ##########
    `);
    const evs = ticks(room, FUSE_MAX + 400);
    expect(evs.some((e) => e.k === 'crack' && e.stage > 0)).toBe(true);
    expect(evs.some((e) => e.k === 'tile' && e.cause === 'rockfall')).toBe(true);
    cleanup(room);
  });

  it('a post on a stair landing splits the run back to safe', () => {
    const room = testRoom(9);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ##########
      #.########
      ##.#######
      ###.######
      ####P#####
      #####.####
      ######.###
      #######.##
      ##########
    `);
    const evs = ticks(room, FUSE_MAX + 300);
    expect(evs.some((e) => e.k === 'tile' && e.cause === 'rockfall')).toBe(false);
    cleanup(room);
  });

  it('lanterns do NOT hold ceilings up (only posts do)', () => {
    const room = testRoom(10);
    sandboxRound(room);
    stamp(room, 20, 18, `
      ##########
      #........#
      ##########
    `);
    room.lanterns.push({ id: 1, x: 24, y: 19, lit: true, fuel: 999999 });
    const evs = ticks(room, FUSE_MAX + 400);
    expect(evs.some((e) => e.k === 'tile' && e.cause === 'rockfall')).toBe(true);
    cleanup(room);
  });
});
