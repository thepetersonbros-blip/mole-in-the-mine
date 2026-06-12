// Darkness mask: a screen-sized offscreen canvas filled with near-black,
// with light punched out via destination-out radial gradients. After the
// mask lands, warmLight() paints a low-alpha additive orange pass so the
// tunnels feel torch-lit instead of just less dark.

import { HELMET_RADIUS, LANTERN_RADIUS, SURFACE_Y, TILE_PX } from '../../shared/constants';
import { F, dwarfRenderPos, game } from '../state';
import { predictedPos } from '../predict';

let mask: HTMLCanvasElement | null = null;
let mctx: CanvasRenderingContext2D | null = null;

export interface View {
  camX: number; // world px at left edge
  camY: number;
  scale: number; // device px per world px
  w: number; // device px
  h: number;
}

function flicker(now: number, seed: number): number {
  return 1 + Math.sin(now / 110 + seed) * 0.05 + Math.sin(now / 37 + seed * 2.7) * 0.025;
}

function hole(v: View, wx: number, wy: number, radiusTiles: number, soft = 1): void {
  if (!mctx) return;
  const sx = (wx - v.camX) * v.scale;
  const sy = (wy - v.camY) * v.scale;
  const r = radiusTiles * TILE_PX * v.scale;
  const g = mctx.createRadialGradient(sx, sy, r * 0.15, sx, sy, r);
  g.addColorStop(0, `rgba(0,0,0,${soft})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  mctx.fillStyle = g;
  mctx.beginPath();
  mctx.arc(sx, sy, r, 0, Math.PI * 2);
  mctx.fill();
}

interface Light {
  wx: number;
  wy: number;
  r: number; // tiles
  facing: 0 | 1 | -1; // 0 = round lantern, else helmet beam direction
}

function collectLights(now: number): Light[] {
  const lights: Light[] = [];
  for (const l of game.lanterns.values()) {
    if (!l.lit) continue;
    lights.push({
      wx: (l.x + 0.5) * TILE_PX,
      wy: (l.y + 0.6) * TILE_PX,
      r: LANTERN_RADIUS * flicker(now, l.id),
      facing: 0
    });
  }
  for (const rd of game.dwarfs.values()) {
    if (rd.flags & F.buried) continue;
    const isMe = rd.eid === game.myEid;
    const pos = isMe ? predictedPos(now) : dwarfRenderPos(rd, now);
    lights.push({
      wx: pos.x * TILE_PX,
      wy: (pos.y - 1) * TILE_PX,
      r: HELMET_RADIUS,
      facing: rd.flags & F.left ? -1 : 1
    });
  }
  return lights;
}

export function drawDarkness(ctx: CanvasRenderingContext2D, v: View, now: number): void {
  if (!mask) {
    mask = document.createElement('canvas');
    mctx = mask.getContext('2d');
  }
  if (!mctx) return;
  if (mask.width !== v.w || mask.height !== v.h) {
    mask.width = v.w;
    mask.height = v.h;
  }
  mctx.globalCompositeOperation = 'source-over';
  mctx.clearRect(0, 0, v.w, v.h);
  mctx.fillStyle = 'rgba(4,4,14,0.93)';
  mctx.fillRect(0, 0, v.w, v.h);

  mctx.globalCompositeOperation = 'destination-out';

  // the sky and camp are always lit: clear everything above the surface line,
  // with a soft glow bleeding a couple tiles into the ground
  const surfScreen = (SURFACE_Y * TILE_PX - v.camY) * v.scale;
  mctx.fillStyle = 'rgba(0,0,0,1)';
  mctx.fillRect(0, 0, v.w, Math.max(0, surfScreen));
  const bleed = mctx.createLinearGradient(0, surfScreen, 0, surfScreen + 2.2 * TILE_PX * v.scale);
  bleed.addColorStop(0, 'rgba(0,0,0,0.9)');
  bleed.addColorStop(1, 'rgba(0,0,0,0)');
  mctx.fillStyle = bleed;
  mctx.fillRect(0, surfScreen, v.w, 2.2 * TILE_PX * v.scale);

  const lights = collectLights(now);
  for (const l of lights) {
    hole(v, l.wx, l.wy, l.r, l.facing === 0 ? 1 : 0.95);
    if (l.facing !== 0) {
      // helmet beam: a cheap cone, faked with two shrinking holes ahead
      hole(v, l.wx + l.facing * 1.3 * TILE_PX, l.wy, l.r * 0.8, 0.8);
      hole(v, l.wx + l.facing * 2.4 * TILE_PX, l.wy + 0.3 * TILE_PX, l.r * 0.55, 0.6);
    }
  }

  mctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.restore();

  // warm pass: torchlight color floating over everything the light touches
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (l.wy < SURFACE_Y * TILE_PX) continue; // sunlight zone needs no torch tint
    const sx = (l.wx - v.camX) * v.scale;
    const sy = (l.wy - v.camY) * v.scale;
    const r = l.r * TILE_PX * v.scale * (l.facing === 0 ? 0.95 : 0.8);
    if (sx < -r || sx > v.w + r || sy < -r || sy > v.h + r) continue;
    const g = ctx.createRadialGradient(sx, sy, r * 0.05, sx, sy, r);
    const warm = l.facing === 0 ? 0.085 : 0.05;
    g.addColorStop(0, `rgba(255,160,60,${warm})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}
