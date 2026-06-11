// Darkness mask: a screen-sized offscreen canvas filled with near-black,
// with light punched out via destination-out radial gradients.

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

  // lanterns
  for (const l of game.lanterns.values()) {
    if (!l.lit) continue;
    const fl = 1 + Math.sin(now / 110 + l.id) * 0.06;
    hole(v, (l.x + 0.5) * TILE_PX, (l.y + 0.6) * TILE_PX, LANTERN_RADIUS * fl);
  }

  // helmet lamps (every dwarf, including me)
  for (const rd of game.dwarfs.values()) {
    if (rd.flags & F.buried) continue;
    const isMe = rd.eid === game.myEid;
    const pos = isMe ? predictedPos(now) : dwarfRenderPos(rd, now);
    hole(v, pos.x * TILE_PX, (pos.y - 1) * TILE_PX, HELMET_RADIUS, 0.95);
  }

  mctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(mask, 0, 0);
  ctx.restore();
}
