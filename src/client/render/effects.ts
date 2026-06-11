// Central world-event dispatch: applies tile/entity deltas to the client
// mirror, then layers on cosmetics (particles, shakes, toasts, sounds).

import { WORLD_W } from '../../shared/constants';
import type { Ev } from '../../shared/protocol';
import { game, update } from '../state';
import { sfx } from '../audio';
import { predictedPos } from '../predict';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
}
export const particles: Particle[] = [];

export interface Ring {
  x: number;
  y: number;
  born: number;
  color: string;
}
export const rings: Ring[] = [];

interface Shake {
  mag: number;
  until: number;
}
const shakes: Shake[] = [];

export function getShakeOffset(now: number): { x: number; y: number } {
  let mag = 0;
  for (let i = shakes.length - 1; i >= 0; i--) {
    if (shakes[i].until < now) {
      shakes.splice(i, 1);
      continue;
    }
    const left = (shakes[i].until - now) / 1000;
    mag = Math.max(mag, shakes[i].mag * Math.min(1, left));
  }
  if (mag <= 0) return { x: 0, y: 0 };
  return { x: (Math.random() * 2 - 1) * mag, y: (Math.random() * 2 - 1) * mag };
}

function burst(x: number, y: number, n: number, color: string, spread = 1.4): void {
  for (let i = 0; i < n && particles.length < 350; i++) {
    particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: (Math.random() * 2 - 1) * spread,
      vy: -Math.random() * 1.6,
      life: 0,
      maxLife: 0.5 + Math.random() * 0.5,
      size: 1.5 + Math.random() * 2,
      color,
      gravity: 5
    });
  }
}

export function stepParticles(dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  const now = performance.now();
  for (let i = rings.length - 1; i >= 0; i--) {
    if (now - rings[i].born > 2000) rings.splice(i, 1);
  }
}

export function toast(text: string, ms = 2600): void {
  const ui = document.getElementById('ui');
  if (!ui) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  // stack a little if several appear
  const count = ui.querySelectorAll('.toast').length;
  el.style.marginTop = `${count * 34}px`;
  ui.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 450);
  }, ms);
}

function myPos(): { x: number; y: number } {
  const p = predictedPos(performance.now());
  return { x: p.x, y: p.y };
}

export function onWorldEvents(evs: Ev[]): void {
  let needUpdate = false;
  for (const ev of evs) {
    switch (ev.k) {
      case 'tile': {
        game.tiles[ev.y * WORLD_W + ev.x] = ev.t;
        game.meta[ev.y * WORLD_W + ev.x] = ev.m;
        if (ev.cause === 'dig') {
          burst(ev.x, ev.y, 6, '#8a6a45');
          sfx.dig();
        } else if (ev.cause === 'crumble') {
          burst(ev.x, ev.y, 8, '#6e6e76');
          sfx.creak();
        } else if (ev.cause === 'rockfall') {
          burst(ev.x, ev.y, 10, '#5a4a3c');
          sfx.breakTile();
        } else if (ev.cause === 'place') {
          burst(ev.x, ev.y, 4, '#a87b3f', 0.6);
          sfx.place();
        } else if (ev.cause === 'attack') {
          burst(ev.x, ev.y, 8, '#a87b3f');
          sfx.bonk();
        } else if (ev.cause === 'blast') {
          burst(ev.x, ev.y, 14, '#ff9a3c', 2.5);
        }
        break;
      }
      case 'crack': {
        game.meta[ev.y * WORLD_W + ev.x] = (game.meta[ev.y * WORLD_W + ev.x] & ~0x30) | ((ev.stage & 3) << 4);
        if (ev.stage > 0) {
          burst(ev.x, ev.y + 1, 3, '#cbb89a', 0.4);
          if (ev.stage === 2) sfx.creak();
        }
        break;
      }
      case 'quake': {
        const me = myPos();
        const dist = Math.hypot(me.x - ev.x, me.y - ev.y);
        // everyone feels it; closer feels it harder
        const near = Math.max(0.3, 1 - dist / 70);
        const mag = Math.min(14, (3 + ev.n * 1.6) * near);
        shakes.push({ mag, until: performance.now() + 550 + ev.n * 60 });
        sfx.rumble(ev.n * near);
        if (navigator.vibrate) navigator.vibrate(Math.min(220, 50 + ev.n * 25));
        break;
      }
      case 'bury': {
        burst(ev.x, ev.y, 16, '#5a4a3c', 2);
        sfx.bury();
        if (ev.eid === game.myEid) needUpdate = true;
        break;
      }
      case 'rescue': {
        sfx.rescue();
        if (ev.eid === game.myEid) {
          toast(`${ev.byName} dug you out!`);
          needUpdate = true;
        } else {
          toast(`${ev.byName} rescued a buried dwarf!`);
        }
        break;
      }
      case 'ping': {
        rings.push({ x: ev.x, y: ev.y, born: performance.now(), color: '#ffd84a' });
        sfx.ping();
        break;
      }
      case 'deposit': {
        game.cart = ev.total;
        toast(`${ev.name} banked ${ev.amt} gold`);
        sfx.deposit();
        break;
      }
      case 'cart': {
        // anonymous change: no sound, no toast. (Yes, this is the skim. Shh.)
        game.cart = ev.total;
        break;
      }
      case 'pile': {
        if (ev.amt <= 0) game.piles.delete(ev.id);
        else game.piles.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, amt: ev.amt });
        break;
      }
      case 'lantern': {
        const existing = game.lanterns.get(ev.id);
        if (!existing && ev.lit) {
          game.lanterns.set(ev.id, { id: ev.id, x: ev.x, y: ev.y, lit: ev.lit });
        } else if (existing) {
          if (!ev.lit && !game.lanterns.has(ev.id)) break;
          existing.lit = ev.lit;
          if (!ev.lit) {
            // either burnout, snuffed, or smashed; smashed ones vanish next sync
            burst(ev.x, ev.y, 4, '#888', 0.4);
            sfx.snuff();
          }
        }
        break;
      }
      case 'elev': {
        game.elevJammed = ev.jammed;
        toast(ev.jammed ? 'The elevator is jammed!' : 'The elevator is moving again.');
        if (ev.jammed) sfx.jam();
        break;
      }
      case 'swing': {
        sfx.swing();
        if (ev.hit === 'dwarf') sfx.bonk();
        break;
      }
      case 'stun': {
        if (ev.eid === game.myEid) toast('BONK! You got clobbered.');
        sfx.stun();
        break;
      }
      case 'dust': {
        burst(ev.x, ev.y, 4, '#cbb89a', 0.5);
        break;
      }
      case 'boom': {
        burst(ev.x, ev.y, 24, '#ff9a3c', 3);
        shakes.push({ mag: 10, until: performance.now() + 500 });
        sfx.rumble(6);
        break;
      }
    }
  }
  if (needUpdate) update();
}
