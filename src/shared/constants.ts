// Every balance number in the game lives here. Tune freely.

// --- simulation ---
export const TICK_MS = 50; // 20 Hz
export const TICKS_PER_SEC = 1000 / TICK_MS;
export const SNAP_EVERY = 2; // snapshots at 10 Hz
export const sec = (s: number) => Math.round(s * TICKS_PER_SEC);

// --- world ---
export const WORLD_W = 96;
export const WORLD_H = 64;
export const TILE_PX = 16;
export const SURFACE_Y = 8; // first ground row; rows above are sky
export const DIRT_BOTTOM = 25; // dirt: SURFACE_Y..25
export const STONE_BOTTOM = 50; // stone: 26..50, deep rock below
export const CART_X = 30;
export const BELL_X = 36;
export const SHAFT_X1 = 47; // shaft interior columns 47,48
export const SHAFT_X2 = 48;
export const SHAFT_BOTTOM = 30; // shaft interior reaches this row
export const SHAFT_DOORS = [14, 22, 29]; // wall openings (row pairs r,r+1... single rows kept simple)
export const SPAWN_X_MIN = 26;
export const SPAWN_X_MAX = 42;
export const VEIN_COUNT = 80;

// --- movement (tiles per tick unless noted) ---
export const WALK_SPEED = 0.25; // 5 tiles/s
export const CLIMB_SPEED = 0.175; // 3.5 tiles/s
export const GRAVITY = 0.0625;
export const MAX_FALL = 1.0;
export const BODY_HW = 0.35; // half width
export const BODY_H = 0.9;
export const FALL_STUN_TILES = 4;
export const FALL_STUN_TICKS = sec(1.5);
export const ELEVATOR_SPEED = 0.15; // 3 tiles/s

// --- digging (ticks per tile by hardness) ---
export const DIG_DIRT = sec(0.5);
export const DIG_STONE = sec(1.2);
export const DIG_DEEP = sec(2.5);
export const DIG_RUBBLE = sec(0.4);
export const REACH = 1.7; // dig/interact reach from body center, tile units

// --- gold ---
export const CARRY_CAP = 12;
export const QUOTA = 140;
export const ROUND_TICKS = sec(10 * 60);

// --- building: personal cooldowns that bank charges ---
export const BUILD = {
  post: { cooldown: sec(18), max: 3, start: 2 },
  ladder: { cooldown: sec(7), max: 5, start: 3 },
  lantern: { cooldown: sec(32), max: 2, start: 1 }
} as const;
export type BuildKind = keyof typeof BUILD;

// --- attacks ---
export const ATTACK_CD = sec(6);
export const ATTACK_RANGE = 1.5;
export const ATTACK_STUN = sec(1.5);
export const ATTACK_GOLD_DROP = 3; // up to this many coins knocked loose
export const POST_HP = 2;

// --- dynamite ---
export const DYNAMITE_CHANCE = 0.045; // per dug tile
export const DYNAMITE_FUSE = sec(2);
export const DYNAMITE_MAX = 2;
export const DYNAMITE_STUN = sec(3);

// --- lanterns / light ---
export const LANTERN_RADIUS = 5.5; // tiles
export const HELMET_RADIUS = 2.2;
export const LANTERN_FUEL = sec(3.5 * 60);

// --- stability / cave-ins ---
export const SPAN_STABLE = 5; // unsupported ceiling run <= this is safe
export const SPAN_CRIT = 8; // >= this collapses fast
export const FUSE_MIN = sec(11);
export const FUSE_MAX = sec(17);
export const FUSE_CRIT = sec(1.5);
export const SCAN_BUDGET = 64; // stability scans per tick
export const ROCK_FALL_TICKS = 3; // a falling rock drops 1 tile per this many ticks
export const RESCUE_TICKS = sec(1.5);
export const WIGGLE_PING_CD = sec(5);
export const PING_FUZZ = 2.5; // tiles of random offset on help pings

// --- the mole ---
export const MOLE_CD = {
  sour: sec(45),
  skim: sec(60),
  snuff: sec(50),
  jam: sec(90),
  hat: sec(35)
} as const;
export type MoleAbility = keyof typeof MOLE_CD;
export const SOUR_FUSE_MIN = sec(10);
export const SOUR_FUSE_MAX = sec(30);
export const SKIM_MIN = 8;
export const SKIM_MAX = 12;
export const SKIM_RANGE = 2.5;
export const SNUFF_RADIUS = 6;
export const JAM_TICKS = sec(25);
export const STASH_TARGET = 45;

// --- meetings ---
export const BELL_RINGS_PER_PLAYER = 1;
export const MEETING_COOLDOWN = sec(45);
export const VOTE_TICKS = sec(60);
export const BELL_RANGE = 2.5;

// everyone-is-buried: short grace so the last collapse lands, then round over
export const ALL_BURIED_GRACE = sec(2.5);

// --- rooms ---
export const MAX_PLAYERS = 10; // tuned for 6, roomy for 10
export const MIN_PLAYERS = 2;
export const ROOM_GC_MS = 10 * 60 * 1000;
export const REJOIN_GRACE_TICKS = sec(60);
export const ROUND_END_TICKS = sec(15);
export const INTRO_TICKS = sec(4);

// --- hats ---
// 10 pickable + 2 extra colors the mole can also fake (a mystery hat!)
export const HAT_COLORS = [
  '#e23b3b', // red
  '#3b6fe2', // blue
  '#3bb54a', // green
  '#e2c43b', // yellow
  '#a04ad8', // purple
  '#e87b2a', // orange
  '#34c8c8', // cyan
  '#e86fb1', // pink
  '#f0f0e8', // white
  '#454545', // black
  '#9ade4a', // lime
  '#8a6c4a' // brown
] as const;
export const PICKABLE_HATS = 10;

export const PROTOCOL_VERSION = 1;
