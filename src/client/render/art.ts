// Programmatic pixel art. Everything draws in world pixels (16px tiles);
// the renderer's transform provides zoom. Deterministic speckle via hash2d.

import { BELL_X, CART_X, SHAFT_X1, SHAFT_X2, SURFACE_Y, TILE_PX } from '../../shared/constants';
import { T, metaCrack, metaGold, metaHp } from '../../shared/tiles';
import { hash2d } from '../../shared/rng';

const P = TILE_PX;

const TILE_BASE: Record<number, string> = {
  [T.DIRT]: '#6b4a2f',
  [T.STONE]: '#62626e',
  [T.DEEP]: '#43435a',
  [T.BEDROCK]: '#23232b',
  [T.RUBBLE]: '#54452f'
};
const TILE_DARK: Record<number, string> = {
  [T.DIRT]: '#573a23',
  [T.STONE]: '#50505c',
  [T.DEEP]: '#36364a',
  [T.BEDROCK]: '#1a1a20',
  [T.RUBBLE]: '#443823'
};

const TILE_LIGHT: Record<number, string> = {
  [T.DIRT]: '#7d5a3c',
  [T.STONE]: '#74747e',
  [T.DEEP]: '#52526b',
  [T.BEDROCK]: '#2c2c36',
  [T.RUBBLE]: '#66543a'
};

export function drawTile(
  ctx: CanvasRenderingContext2D,
  t: number,
  m: number,
  tx: number,
  ty: number,
  nbr: (x: number, y: number) => number,
  now: number
): void {
  const x = tx * P;
  const y = ty * P;
  if (t === T.AIR) return;

  if (t === T.POST) {
    drawPost(ctx, x, y, metaHp(m));
    return;
  }
  if (t === T.LADDER) {
    drawLadder(ctx, x, y);
    return;
  }

  ctx.fillStyle = TILE_BASE[t] ?? '#f0f';
  ctx.fillRect(x, y, P, P);
  // speckle
  const dark = TILE_DARK[t] ?? '#000';
  ctx.fillStyle = dark;
  for (let i = 0; i < 4; i++) {
    const h = hash2d(11 + i, tx, ty);
    const sx = Math.floor(h * 13);
    const sy = Math.floor(hash2d(31 + i, tx, ty) * 13);
    ctx.fillRect(x + 1 + sx, y + 1 + sy, 2, 2);
  }
  // per-material character
  if (t === T.DIRT && hash2d(141, tx, ty) > 0.62) {
    // tiny embedded stones and root threads
    ctx.fillStyle = '#7d6850';
    ctx.fillRect(x + 3 + Math.floor(hash2d(143, tx, ty) * 9), y + 4 + Math.floor(hash2d(144, tx, ty) * 8), 3, 2);
    if (hash2d(145, tx, ty) > 0.7) {
      ctx.strokeStyle = '#4a3420';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 3 + hash2d(146, tx, ty) * 8);
      ctx.quadraticCurveTo(x + 8, y + 6 + hash2d(147, tx, ty) * 6, x + 14, y + 4 + hash2d(148, tx, ty) * 9);
      ctx.stroke();
    }
  }
  if (t === T.STONE && hash2d(151, tx, ty) > 0.5) {
    // facet line catching the light
    ctx.strokeStyle = '#7e7e8a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const fx = x + 3 + hash2d(152, tx, ty) * 7;
    const fy = y + 3 + hash2d(153, tx, ty) * 7;
    ctx.moveTo(fx, fy + 5);
    ctx.lineTo(fx + 5, fy);
    ctx.stroke();
  }
  if (t === T.DEEP && hash2d(161, tx, ty) > 0.75) {
    // cold mineral glint
    const a = 0.35 + 0.3 * Math.sin(now / 700 + tx * 3.1 + ty * 1.7);
    ctx.fillStyle = `rgba(140,160,220,${a})`;
    ctx.fillRect(x + 3 + Math.floor(hash2d(162, tx, ty) * 10), y + 3 + Math.floor(hash2d(163, tx, ty) * 10), 1.5, 1.5);
  }
  if (t === T.RUBBLE) {
    // jumbled chunks
    ctx.fillStyle = '#6a5a3e';
    for (let i = 0; i < 3; i++) {
      const sx = Math.floor(hash2d(51 + i, tx, ty) * 10);
      const sy = Math.floor(hash2d(71 + i, tx, ty) * 10);
      ctx.fillRect(x + 1 + sx, y + 2 + sy, 4, 3);
    }
    ctx.fillStyle = '#473a26';
    ctx.fillRect(x + 2 + Math.floor(hash2d(53, tx, ty) * 9), y + 8, 3, 2);
  }
  if (t === T.BEDROCK) {
    ctx.strokeStyle = '#101014';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, P - 1, P - 1);
    ctx.fillStyle = '#2e2e3a';
    ctx.fillRect(x + 3 + Math.floor(hash2d(171, tx, ty) * 8), y + 3 + Math.floor(hash2d(172, tx, ty) * 8), 4, 1.5);
  }

  // fake ambient occlusion: edges that face open air catch light or shadow
  const lit = TILE_LIGHT[t] ?? '#fff';
  if (nbr(tx, ty - 1) === T.AIR && !(ty === SURFACE_Y && t === T.DIRT)) {
    ctx.fillStyle = lit;
    ctx.fillRect(x, y, P, 2);
  }
  if (nbr(tx, ty + 1) === T.AIR) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x, y + P - 2, P, 2);
  }
  if (nbr(tx - 1, ty) === T.AIR) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x, y, 2, P);
  }
  if (nbr(tx + 1, ty) === T.AIR) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(x + P - 2, y, 2, P);
  }

  // grass lip + tufts on the surface row
  if (ty === SURFACE_Y && t === T.DIRT) {
    ctx.fillStyle = '#3f7d33';
    ctx.fillRect(x, y, P, 3);
    ctx.fillStyle = '#549c43';
    ctx.fillRect(x, y, P, 1);
    if (hash2d(181, tx, ty) > 0.45) {
      const gx = x + 2 + Math.floor(hash2d(182, tx, ty) * 11);
      const swayG = Math.sin(now / 900 + tx) * 0.8;
      ctx.strokeStyle = '#5cab48';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx + swayG, y - 3 - hash2d(183, tx, ty) * 2);
      ctx.moveTo(gx + 2, y);
      ctx.lineTo(gx + 2 - swayG, y - 2.5);
      ctx.stroke();
    }
  }
  // gold / gems: now they twinkle
  const g = metaGold(m);
  if (g > 0) {
    const gem = g >= 9;
    const n = Math.min(4, 1 + (g >> 2));
    for (let i = 0; i < n; i++) {
      const sx = 2 + Math.floor(hash2d(91 + i, tx, ty) * 11);
      const sy = 2 + Math.floor(hash2d(113 + i, tx, ty) * 11);
      const tw = 0.65 + 0.35 * Math.sin(now / 260 + hash2d(99 + i, tx, ty) * 6.3);
      ctx.globalAlpha = tw;
      ctx.fillStyle = gem ? '#7ae0ff' : '#ffd84a';
      if (gem) {
        ctx.fillRect(x + sx, y + sy - 1, 1, 3);
        ctx.fillRect(x + sx - 1, y + sy, 3, 1);
      } else {
        ctx.fillRect(x + sx, y + sy, 2, 2);
      }
      // the brightest moment throws a tiny white glint
      if (tw > 0.93) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + sx, y + sy - 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }
  // cracks
  const c = metaCrack(m);
  if (c > 0) {
    ctx.strokeStyle = c === 2 ? '#160f08' : '#2c1d0e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const j = hash2d(7, tx, ty) * 6;
    ctx.moveTo(x + 3 + j, y + P);
    ctx.lineTo(x + 6 + j, y + P - 6);
    ctx.lineTo(x + 4 + j, y + P - 9);
    if (c === 2) {
      ctx.moveTo(x + 11, y + P);
      ctx.lineTo(x + 9, y + P - 5);
      ctx.lineTo(x + 12, y + P - 10);
    }
    ctx.stroke();
  }
}

function drawPost(ctx: CanvasRenderingContext2D, x: number, y: number, hp: number): void {
  ctx.fillStyle = '#8a6433';
  ctx.fillRect(x + 6, y + 2, 4, P - 2);
  ctx.fillStyle = '#a87b3f';
  ctx.fillRect(x + 6, y + 2, 2, P - 2);
  // cap beam
  ctx.fillStyle = '#8a6433';
  ctx.fillRect(x + 1, y, P - 2, 3);
  ctx.fillStyle = '#a87b3f';
  ctx.fillRect(x + 1, y, P - 2, 1);
  if (hp <= 1) {
    ctx.strokeStyle = '#3a2a12';
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 4);
    ctx.lineTo(x + 9, y + 8);
    ctx.lineTo(x + 7, y + 12);
    ctx.stroke();
  }
}

function drawLadder(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = '#b08a48';
  ctx.fillRect(x + 3, y, 2, P);
  ctx.fillRect(x + 11, y, 2, P);
  for (let r = 2; r < P; r += 5) {
    ctx.fillRect(x + 3, y + r, 10, 2);
  }
}

export interface DwarfDrawOpts {
  facing: 1 | -1;
  hat: string;
  walking: boolean;
  onLadder: boolean;
  digging: boolean;
  stunned: boolean;
  zz: boolean;
  phase: number; // animation clock (seconds)
  isMe: boolean;
}

// feet at (fx, fy) in world px
export function drawDwarf(ctx: CanvasRenderingContext2D, fx: number, fy: number, o: DwarfDrawOpts): void {
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(fx, fy + 0.5, 6, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(fx, fy);
  if (o.facing < 0) ctx.scale(-1, 1);
  const bob = o.walking ? Math.sin(o.phase * 14) * 1.2 : 0;
  const legSwing = o.walking ? Math.sin(o.phase * 14) * 2.5 : 0;

  // legs
  ctx.fillStyle = '#3c3328';
  ctx.fillRect(-4 + legSwing * 0.5, -4, 3, 4);
  ctx.fillRect(1 - legSwing * 0.5, -4, 3, 4);
  // body (tunic)
  ctx.fillStyle = '#4a5a78';
  ctx.fillRect(-5, -11 + bob * 0.4, 10, 8);
  ctx.fillStyle = '#3c4a64';
  ctx.fillRect(-5, -6 + bob * 0.4, 10, 3);
  // beard
  ctx.fillStyle = '#d8d3c8';
  ctx.fillRect(-4, -12 + bob * 0.4, 8, 4);
  // face
  ctx.fillStyle = '#e8b88a';
  ctx.fillRect(-3, -15 + bob * 0.4, 7, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(2, -14 + bob * 0.4, 1.5, 1.5); // eye
  // helmet
  ctx.fillStyle = o.hat;
  ctx.fillRect(-5, -18 + bob * 0.4, 10, 4);
  ctx.fillRect(-6, -15 + bob * 0.4, 12, 1.5);
  // helmet lamp
  ctx.fillStyle = '#fff6c0';
  ctx.fillRect(4, -17 + bob * 0.4, 2.5, 2.5);

  // pickaxe
  if (o.digging || o.stunned === false) {
    const swing = o.digging ? Math.sin(o.phase * 18) * 0.9 : 0.25;
    ctx.save();
    ctx.translate(4, -9 + bob * 0.4);
    ctx.rotate(swing - 0.5);
    ctx.fillStyle = '#8a6433';
    ctx.fillRect(0, -1, 9, 2); // handle
    ctx.fillStyle = '#9fa8b8';
    ctx.fillRect(7, -3, 2, 6); // head
    ctx.restore();
  }
  ctx.restore();

  if (o.stunned) {
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i < 3; i++) {
      const a = o.phase * 6 + (i * Math.PI * 2) / 3;
      ctx.fillRect(fx + Math.cos(a) * 7 - 1, fy - 20 + Math.sin(a) * 2.5 - 1, 2.5, 2.5);
    }
  }
  if (o.zz) {
    ctx.fillStyle = '#9ad0ff';
    ctx.font = '8px monospace';
    ctx.fillText('zZ', fx + 5, fy - 20);
  }
  if (o.isMe) {
    ctx.fillStyle = '#ffffffaa';
    ctx.beginPath();
    ctx.moveTo(fx, fy - 23);
    ctx.lineTo(fx - 3, fy - 27);
    ctx.lineTo(fx + 3, fy - 27);
    ctx.fill();
  }
}

export function drawCamp(ctx: CanvasRenderingContext2D, cartGold: number, quota: number, now = 0): void {
  const gy = SURFACE_Y * P;
  // tent
  const tx = (CART_X - 6) * P;
  ctx.fillStyle = '#7a4434';
  ctx.beginPath();
  ctx.moveTo(tx - 14, gy);
  ctx.lineTo(tx, gy - 18);
  ctx.lineTo(tx + 14, gy);
  ctx.fill();
  ctx.fillStyle = '#94543e';
  ctx.beginPath();
  ctx.moveTo(tx, gy - 18);
  ctx.lineTo(tx + 14, gy);
  ctx.lineTo(tx + 6, gy);
  ctx.lineTo(tx - 1, gy - 14);
  ctx.fill();
  ctx.fillStyle = '#2a1a14';
  ctx.beginPath();
  ctx.moveTo(tx - 4, gy);
  ctx.lineTo(tx, gy - 7);
  ctx.lineTo(tx + 4, gy);
  ctx.fill();
  // campfire with a living flame
  const fx = (CART_X - 3) * P;
  ctx.fillStyle = '#3a3a40';
  for (let i = 0; i < 4; i++) {
    const a = Math.PI + (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.arc(fx + Math.cos(a) * 6, gy - 1.5, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#5a3a1c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(fx - 5, gy - 1);
  ctx.lineTo(fx + 5, gy - 4);
  ctx.moveTo(fx + 5, gy - 1);
  ctx.lineTo(fx - 5, gy - 4);
  ctx.stroke();
  const fl = 1 + Math.sin(now * 9) * 0.18 + Math.sin(now * 23) * 0.08;
  const fg = ctx.createRadialGradient(fx, gy - 6, 1, fx, gy - 6, 8 * fl);
  fg.addColorStop(0, 'rgba(255,240,170,0.95)');
  fg.addColorStop(0.5, 'rgba(255,160,70,0.7)');
  fg.addColorStop(1, 'rgba(255,110,40,0)');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(fx - 4, gy - 2);
  ctx.quadraticCurveTo(fx - 4, gy - 8 * fl, fx, gy - 11 * fl);
  ctx.quadraticCurveTo(fx + 4, gy - 8 * fl, fx + 4, gy - 2);
  ctx.fill();
  // cart
  const cx = CART_X * P;
  ctx.fillStyle = '#6e4a26';
  ctx.fillRect(cx - 10, gy - 12, 26, 9);
  ctx.fillStyle = '#8a6433';
  ctx.fillRect(cx - 10, gy - 12, 26, 2);
  ctx.fillStyle = '#2a2a30';
  ctx.beginPath();
  ctx.arc(cx - 4, gy - 2, 3, 0, Math.PI * 2);
  ctx.arc(cx + 10, gy - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  const fill = Math.min(1, cartGold / Math.max(1, quota));
  if (fill > 0.02) {
    ctx.fillStyle = '#ffd84a';
    const h = 2 + fill * 6;
    ctx.beginPath();
    ctx.ellipse(cx + 3, gy - 12, 11, h, 0, Math.PI, 0);
    ctx.fill();
    // sparkle on the hoard
    const tw = Math.sin(now * 5.3);
    if (tw > 0.55) {
      ctx.fillStyle = '#fff8d0';
      ctx.fillRect(cx + 1 + tw * 6, gy - 13 - h * 0.4, 1.5, 1.5);
    }
  }
  ctx.fillStyle = '#d8d3c8';
  ctx.font = '6px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CART', cx + 3, gy + 7);

  // bell
  const bx = BELL_X * P + 8;
  ctx.fillStyle = '#5a4a30';
  ctx.fillRect(bx - 7, gy - 22, 3, 22);
  ctx.fillRect(bx + 4, gy - 22, 3, 22);
  ctx.fillRect(bx - 8, gy - 24, 16, 3);
  ctx.fillStyle = '#c9a227';
  ctx.beginPath();
  ctx.moveTo(bx - 4, gy - 13);
  ctx.quadraticCurveTo(bx, gy - 22, bx + 4, gy - 13);
  ctx.lineTo(bx + 4, gy - 12);
  ctx.lineTo(bx - 4, gy - 12);
  ctx.fill();
  ctx.fillStyle = '#d8d3c8';
  ctx.fillText('BELL', bx, gy + 7);
  ctx.textAlign = 'left';
}

export function drawElevator(ctx: CanvasRenderingContext2D, elevY: number, jammed: boolean, phase: number): void {
  const x1 = SHAFT_X1 * P;
  const x2 = (SHAFT_X2 + 1) * P;
  const gy = SURFACE_Y * P;
  // headframe
  ctx.fillStyle = '#5a4a30';
  ctx.fillRect(x1 - 4, gy - 26, 3, 26);
  ctx.fillRect(x2 + 1, gy - 26, 3, 26);
  ctx.fillRect(x1 - 6, gy - 28, x2 - x1 + 12, 4);
  // cables
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1 + 6, gy - 24);
  ctx.lineTo(x1 + 6, elevY * P - 4);
  ctx.moveTo(x2 - 6, gy - 24);
  ctx.lineTo(x2 - 6, elevY * P - 4);
  ctx.stroke();
  // platform
  const py = elevY * P;
  ctx.fillStyle = jammed ? '#7a4030' : '#8a6433';
  ctx.fillRect(x1, py - 4, x2 - x1, 4);
  ctx.fillStyle = jammed ? '#9a5040' : '#a87b3f';
  ctx.fillRect(x1, py - 4, x2 - x1, 1.5);
  if (jammed && Math.sin(phase * 10) > 0) {
    ctx.fillStyle = '#ff6a4a';
    ctx.font = '7px monospace';
    ctx.fillText('!', x1 + (x2 - x1) / 2 - 2, py - 8);
  }
}

export function drawDynamite(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number): void {
  const px = x * P;
  const py = y * P;
  ctx.fillStyle = '#c83232';
  ctx.fillRect(px + 6, py + 8, 4, 7);
  ctx.fillStyle = '#7a1c1c';
  ctx.fillRect(px + 6, py + 10, 4, 1.5);
  // sparking fuse
  ctx.strokeStyle = '#caa';
  ctx.beginPath();
  ctx.moveTo(px + 8, py + 8);
  ctx.lineTo(px + 10, py + 5);
  ctx.stroke();
  if (Math.sin(phase * 24) > -0.4) {
    ctx.fillStyle = Math.sin(phase * 24) > 0.4 ? '#fff0a8' : '#ff9a3c';
    ctx.fillRect(px + 9, py + 3.5, 2.5, 2.5);
  }
}

export function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const px = x * P;
  const py = y * P;
  ctx.fillStyle = '#56564e';
  ctx.beginPath();
  ctx.moveTo(px + 2, py + 13);
  ctx.lineTo(px + 1, py + 6);
  ctx.lineTo(px + 6, py + 2);
  ctx.lineTo(px + 12, py + 3);
  ctx.lineTo(px + 14, py + 9);
  ctx.lineTo(px + 11, py + 14);
  ctx.fill();
  ctx.fillStyle = '#6a6a60';
  ctx.fillRect(px + 4, py + 5, 4, 3);
}

export function drawPile(ctx: CanvasRenderingContext2D, x: number, y: number, amt: number): void {
  const px = x * P;
  const py = y * P;
  const h = Math.min(8, 3 + amt * 0.4);
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  ctx.ellipse(px + 8, py + P - 1, 6, h, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#fff0a8';
  ctx.fillRect(px + 5, py + P - h, 2, 2);
}

export function drawLanternSprite(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean, phase: number): void {
  const px = x * P;
  const py = y * P;
  if (lit) {
    // warm halo around the glass
    const fl = 0.8 + Math.sin(phase * 9 + x) * 0.14 + Math.sin(phase * 21 + x * 2) * 0.06;
    const g = ctx.createRadialGradient(px + 8.5, py + 10, 1, px + 8.5, py + 10, 14 * fl);
    g.addColorStop(0, 'rgba(255,214,120,0.5)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 8, py - 6, 32, 32);
  }
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(px + 6, py + 6, 5, 8);
  ctx.fillRect(px + 7, py + 4, 3, 2);
  if (lit) {
    const fl = 0.7 + Math.sin(phase * 9 + x) * 0.3;
    ctx.fillStyle = `rgba(255,216,74,${fl})`;
    ctx.fillRect(px + 7, py + 8, 3, 4);
    ctx.fillStyle = `rgba(255,250,220,${fl})`;
    ctx.fillRect(px + 8, py + 9, 1.5, 2);
  }
}

export function drawSky(ctx: CanvasRenderingContext2D, x0: number, x1: number, now = 0): void {
  const top = 0;
  const h = SURFACE_Y * P;
  const grad = ctx.createLinearGradient(0, top, 0, h);
  grad.addColorStop(0, '#0a0f24');
  grad.addColorStop(0.55, '#1a2240');
  grad.addColorStop(1, '#2c3a5c');
  ctx.fillStyle = grad;
  ctx.fillRect(x0, top, x1 - x0, h);
  // twinkling stars
  const tx0 = Math.floor(x0 / P);
  const tx1 = Math.ceil(x1 / P);
  ctx.fillStyle = '#dfe8ff';
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = 0; ty < SURFACE_Y - 1; ty++) {
      if (hash2d(5, tx, ty) > 0.84) {
        const tw = 0.25 + hash2d(6, tx, ty) * 0.5 + 0.25 * Math.sin(now / 600 + hash2d(7, tx, ty) * 6.3);
        ctx.globalAlpha = Math.max(0.08, tw);
        ctx.fillRect(tx * P + Math.floor(hash2d(8, tx, ty) * 14), ty * P + Math.floor(hash2d(9, tx, ty) * 14), 1.5, 1.5);
      }
    }
  }
  ctx.globalAlpha = 1;
  // drifting night clouds
  for (let i = 0; i < 2; i++) {
    const cw = 70 + i * 40;
    const cx = ((now / (260 - i * 80) + i * 700) % (WORLD_PXW + cw * 2)) - cw;
    const cy = (1.2 + i * 1.6) * P;
    ctx.fillStyle = i === 0 ? 'rgba(70,86,130,0.35)' : 'rgba(50,62,100,0.4)';
    for (let b = 0; b < 3; b++) {
      ctx.beginPath();
      ctx.ellipse(cx + b * cw * 0.26, cy + Math.sin(b * 2 + i) * 2, cw * 0.2, cw * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // far hills behind the camp
  ctx.fillStyle = '#141c34';
  ctx.beginPath();
  ctx.moveTo(x0, h);
  for (let tx = tx0; tx <= tx1 + 1; tx++) {
    ctx.lineTo(tx * P, h - 8 - hash2d(201, tx, 0) * 14 - Math.sin(tx * 0.7) * 5);
  }
  ctx.lineTo(x1, h);
  ctx.fill();
  ctx.fillStyle = '#1d2742';
  ctx.beginPath();
  ctx.moveTo(x0, h);
  for (let tx = tx0; tx <= tx1 + 1; tx++) {
    ctx.lineTo(tx * P + 8, h - 3 - hash2d(202, tx, 1) * 8);
  }
  ctx.lineTo(x1, h);
  ctx.fill();
  // moon with halo
  const mg = ctx.createRadialGradient(74 * P, 2.4 * P, 6, 74 * P, 2.4 * P, 26);
  mg.addColorStop(0, 'rgba(244,238,218,0.5)');
  mg.addColorStop(1, 'rgba(244,238,218,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(74 * P - 26, 2.4 * P - 26, 52, 52);
  ctx.fillStyle = '#f4eeda';
  ctx.beginPath();
  ctx.arc(74 * P, 2.4 * P, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d8d0b8';
  ctx.beginPath();
  ctx.arc(74 * P - 3, 2.4 * P - 2, 2, 0, Math.PI * 2);
  ctx.arc(74 * P + 3, 2.4 * P + 3, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

const WORLD_PXW = 96 * P;
