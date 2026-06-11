import { DIG_DEEP, DIG_DIRT, DIG_RUBBLE, DIG_STONE } from './constants';

// Tile ids fit a Uint8Array. Meta byte: bits 0-3 gold, 4-5 crack stage, 6-7 post hp.
export const T = {
  AIR: 0,
  DIRT: 1,
  STONE: 2,
  DEEP: 3,
  BEDROCK: 4,
  RUBBLE: 5,
  POST: 6,
  LADDER: 7
} as const;
export type TileId = (typeof T)[keyof typeof T];

export function isSolid(t: number): boolean {
  return t === T.DIRT || t === T.STONE || t === T.DEEP || t === T.BEDROCK || t === T.RUBBLE;
}

// Holds a ceiling up (splits unsupported spans).
export function isAnchor(t: number): boolean {
  return isSolid(t) || t === T.POST;
}

export function isClimbable(t: number): boolean {
  return t === T.LADDER;
}

export function isDiggable(t: number): boolean {
  return t === T.DIRT || t === T.STONE || t === T.DEEP || t === T.RUBBLE;
}

export function digTicks(t: number): number {
  switch (t) {
    case T.DIRT:
      return DIG_DIRT;
    case T.STONE:
      return DIG_STONE;
    case T.DEEP:
      return DIG_DEEP;
    case T.RUBBLE:
      return DIG_RUBBLE;
    default:
      return 0;
  }
}

// --- meta byte helpers ---
export const metaGold = (m: number) => m & 0x0f;
export const metaCrack = (m: number) => (m >> 4) & 0x03;
export const metaHp = (m: number) => (m >> 6) & 0x03;
export const withGold = (m: number, g: number) => (m & ~0x0f) | (g & 0x0f);
export const withCrack = (m: number, c: number) => (m & ~0x30) | ((c & 0x03) << 4);
export const withHp = (m: number, hp: number) => (m & ~0xc0) | ((hp & 0x03) << 6);
