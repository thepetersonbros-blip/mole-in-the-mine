import { HAT_COLORS, SURFACE_Y, TILE_PX, WORLD_H, WORLD_W } from '../../shared/constants';
import { F, dwarfRenderPos, game, metaAt, tileAt } from '../state';
import { predictedPos } from '../predict';
import {
  drawCamp,
  drawDwarf,
  drawDynamite,
  drawElevator,
  drawLanternSprite,
  drawPile,
  drawRock,
  drawSky,
  drawTile
} from './art';
import { drawDarkness, type View } from './darkness';
import { getShakeOffset, particles, rings, stepParticles } from './effects';
import { currentAimTile } from '../input/keyboard';

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let cam = { x: 30 * TILE_PX, y: 8 * TILE_PX };
let lastFrame = 0;

export function initRenderer(c: HTMLCanvasElement): void {
  canvas = c;
  ctx = c.getContext('2d')!;
  resize();
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  requestAnimationFrame(frame);
}

function resize(): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}

function zoomLevel(): number {
  const m = Math.min(window.innerWidth, window.innerHeight);
  return m >= 760 ? 3 : 2;
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  stepParticles(dt);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const zoom = zoomLevel();
  const scale = zoom * dpr;
  const vw = canvas.width;
  const vh = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0e1d';
  ctx.fillRect(0, 0, vw, vh);

  if (!game.hasWorld || game.phase === 'lobby') return;

  // --- camera target ---
  let target: { x: number; y: number } | null = null;
  const meBanished = game.roster.find((r) => r.slot === game.you.slot)?.banished;
  const mine = game.dwarfs.get(game.myEid);
  if (mine && !meBanished) {
    const p = predictedPos(now);
    target = { x: p.x * TILE_PX, y: (p.y - 0.7) * TILE_PX };
  } else {
    // spectator: hover over the action (average of dwarfs)
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const rd of game.dwarfs.values()) {
      const p = dwarfRenderPos(rd, now);
      sx += p.x;
      sy += p.y;
      n++;
    }
    target = n > 0 ? { x: (sx / n) * TILE_PX, y: (sy / n) * TILE_PX } : { x: cam.x, y: cam.y };
  }
  cam.x += (target.x - cam.x) * 0.12;
  cam.y += (target.y - cam.y) * 0.12;

  const viewW = vw / scale;
  const viewH = vh / scale;
  let camX = cam.x - viewW / 2;
  let camY = cam.y - viewH / 2;
  camX = Math.max(0, Math.min(WORLD_W * TILE_PX - viewW, camX));
  camY = Math.max(0, Math.min(WORLD_H * TILE_PX - viewH, camY));
  const shake = getShakeOffset(now);
  camX += shake.x / zoom;
  camY += shake.y / zoom;

  ctx.setTransform(scale, 0, 0, scale, -camX * scale, -camY * scale);
  ctx.imageSmoothingEnabled = false;

  // --- world ---
  drawSky(ctx, camX, camX + viewW);
  const tx0 = Math.max(0, Math.floor(camX / TILE_PX) - 1);
  const tx1 = Math.min(WORLD_W - 1, Math.ceil((camX + viewW) / TILE_PX) + 1);
  const ty0 = Math.max(0, Math.floor(camY / TILE_PX) - 1);
  const ty1 = Math.min(WORLD_H - 1, Math.ceil((camY + viewH) / TILE_PX) + 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      drawTile(ctx, tileAt(tx, ty), metaAt(tx, ty), tx, ty);
    }
  }

  drawCamp(ctx, game.cart, game.quota);
  drawElevator(ctx, game.elevY, game.elevJammed, now / 1000);

  for (const p of game.piles.values()) {
    if (tileSolid(p.x, p.y)) continue; // still buried in rubble
    drawPile(ctx, p.x, p.y, p.amt);
  }
  for (const l of game.lanterns.values()) drawLanternSprite(ctx, l.x, l.y, l.lit, now / 1000);
  for (const r of game.rocks) drawRock(ctx, r.x - 0.5, r.y);
  for (const d of game.dyn) drawDynamite(ctx, d.x, d.y, now / 1000);

  // --- dwarfs ---
  for (const rd of game.dwarfs.values()) {
    if (rd.eid === game.myEid) continue;
    if (rd.flags & F.buried) continue; // hidden under the rubble
    const p = dwarfRenderPos(rd, now);
    drawDwarf(ctx, p.x * TILE_PX, p.y * TILE_PX, {
      facing: rd.flags & F.left ? -1 : 1,
      hat: HAT_COLORS[rd.hat] ?? '#fff',
      walking: (rd.flags & F.walk) !== 0,
      onLadder: (rd.flags & F.ladder) !== 0,
      digging: (rd.flags & F.dig) !== 0,
      stunned: (rd.flags & F.stun) !== 0,
      zz: (rd.flags & F.zz) !== 0,
      phase: now / 1000 + rd.eid,
      isMe: false
    });
  }
  if (mine && !meBanished && !(mine.flags & F.buried)) {
    const p = predictedPos(now);
    drawDwarf(ctx, p.x * TILE_PX, p.y * TILE_PX, {
      facing: mine.flags & F.left ? -1 : 1,
      hat: HAT_COLORS[mine.hat] ?? '#fff',
      walking: (mine.flags & F.walk) !== 0,
      onLadder: (mine.flags & F.ladder) !== 0,
      digging: (mine.flags & F.dig) !== 0 || game.me.digging !== null,
      stunned: (mine.flags & F.stun) !== 0,
      zz: false,
      phase: now / 1000,
      isMe: true
    });
  }

  // --- aim + dig progress ---
  const aim = currentAimTile();
  if (aim && game.phase === 'playing' && !game.me.buried) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(aim.x * TILE_PX + 1, aim.y * TILE_PX + 1, TILE_PX - 2, TILE_PX - 2);
  }
  if (game.me.digging) {
    const d = game.me.digging;
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(d.x * TILE_PX + 8, d.y * TILE_PX + 8, 6, -Math.PI / 2, -Math.PI / 2 + d.pct * Math.PI * 2);
    ctx.stroke();
  }

  // --- particles + rings ---
  for (const p of particles) {
    ctx.globalAlpha = 1 - p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * TILE_PX - p.size / 2, p.y * TILE_PX - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const r of rings) {
    const age = (now - r.born) / 2000;
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(r.x * TILE_PX, r.y * TILE_PX, 4 + age * 30, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- darkness ---
  const view: View = { camX, camY, scale, w: vw, h: vh };
  drawDarkness(ctx, view, now);
}

function tileSolid(x: number, y: number): boolean {
  const t = tileAt(x, y);
  return t === 1 || t === 2 || t === 3 || t === 4 || t === 5;
}
