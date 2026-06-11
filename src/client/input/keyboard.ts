import { BELL_RANGE, BELL_X, BODY_H, CART_X, SURFACE_Y, type BuildKind } from '../../shared/constants';
import { isDiggable } from '../../shared/tiles';
import { T } from '../../shared/tiles';
import { game, tileAt } from '../state';
import { myInput, predictedPos } from '../predict';
import { sendAction, sendInput } from '../net';

let keys = new Set<string>();
let actHeld = false; // E / Space / the big ACT button held down

// touch's big ACT button reuses the hold-to-keep-digging loop
export function setActHeld(v: boolean): void {
  actHeld = v;
}

export function initKeyboard(): void {
  window.addEventListener('keydown', (e) => {
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    recompute();
    if (k === 'e' || k === ' ') {
      actHeld = true;
      contextAction();
    }
    if (k === 'f') sendAction({ type: 'attack' });
    if (k === 'x') sendAction({ type: 'dynamite' });
    if (k === 'q' || k === 'escape') sendAction({ type: 'cancel' });
    if (k === '1') placeKind('post');
    if (k === '2') placeKind('ladder');
    if (k === '3') placeKind('lantern');
    if (k === 'm') window.dispatchEvent(new CustomEvent('mitm-drawer'));
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') actHeld = false;
    keys.delete(k);
    recompute();
  });
  window.addEventListener('blur', () => {
    keys.clear();
    actHeld = false;
    recompute();
  });
  setInterval(sendNow, 1000); // heartbeat
  // hold to keep digging: re-fire the context action while it's a dig
  setInterval(() => {
    if (!actHeld || game.phase !== 'playing' || game.me.digging) return;
    const info = contextInfo();
    if (info && info.label.startsWith('Dig')) info.act();
  }, 250);
}

// touch joystick feeds the same pipe
export function setAxes(lr: -1 | 0 | 1, ud: -1 | 0 | 1): void {
  if (myInput.lr === lr && myInput.ud === ud) return;
  myInput.lr = lr;
  myInput.ud = ud;
  if (lr !== 0) myInput.facing = lr;
  sendNow();
}

function recompute(): void {
  const lr = ((keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)) as -1 | 0 | 1;
  const ud = ((keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)) as -1 | 0 | 1;
  if (lr === myInput.lr && ud === myInput.ud) return;
  myInput.lr = lr;
  myInput.ud = ud;
  if (lr !== 0) myInput.facing = lr;
  sendNow();
}

function sendNow(): void {
  myInput.seq++;
  sendInput({ seq: myInput.seq, lr: myInput.lr, ud: myInput.ud, facing: myInput.facing });
}

function nearCart(x: number, y: number): boolean {
  return Math.abs(x - (CART_X + 0.5)) <= 2.5 && Math.abs(y - SURFACE_Y) <= 2.5;
}
function nearBell(x: number, y: number): boolean {
  return Math.abs(x - (BELL_X + 0.5)) <= BELL_RANGE && Math.abs(y - SURFACE_Y) <= 3;
}

export function currentAimTile(): { x: number; y: number } | null {
  if (!game.hasWorld || game.phase !== 'playing' || game.me.buried) return null;
  const pos = predictedPos(performance.now());
  const fx = Math.floor(pos.x);
  const bodyRow = Math.floor(pos.y - BODY_H / 2);
  const candidates: { x: number; y: number }[] = [];
  if (myInput.ud === -1) {
    candidates.push({ x: fx, y: Math.floor(pos.y + 0.01) });
  } else if (myInput.ud === 1 && tileAt(fx, bodyRow) !== T.LADDER) {
    candidates.push({ x: fx, y: Math.floor(pos.y - BODY_H + 0.05) - 1 });
  }
  const frontX = Math.floor(pos.x + myInput.facing * 0.9);
  candidates.push({ x: frontX, y: bodyRow });
  candidates.push({ x: frontX, y: bodyRow + 1 });
  for (const c of candidates) {
    if (isDiggable(tileAt(c.x, c.y))) return c;
  }
  return null;
}

// What would E / the big ACT button do right now?
export function contextInfo(): { label: string; act: () => void } | null {
  if (!game.hasWorld || game.phase !== 'playing') return null;
  if (game.me.buried) {
    return { label: 'WIGGLE & YELL', act: () => sendAction({ type: 'wiggle' }) };
  }
  const pos = predictedPos(performance.now());
  if (game.me.carry > 0 && nearCart(pos.x, pos.y)) {
    return { label: `Deposit ${game.me.carry} gold`, act: () => sendAction({ type: 'deposit' }) };
  }
  if (game.bellRingsLeft > 0 && nearBell(pos.x, pos.y)) {
    return { label: 'Ring the bell (meeting!)', act: () => sendAction({ type: 'bell' }) };
  }
  const aim = currentAimTile();
  if (aim) {
    const t = tileAt(aim.x, aim.y);
    const label = t === T.RUBBLE ? 'Dig rubble' : 'Dig';
    return { label, act: () => sendAction({ type: 'dig', x: aim.x, y: aim.y }) };
  }
  return null;
}

export function contextAction(): void {
  contextInfo()?.act();
}

export function placeKind(kind: BuildKind): void {
  if (!game.hasWorld || game.phase !== 'playing' || game.me.buried) return;
  if (game.me.charges[kind] <= 0) return;
  const pos = predictedPos(performance.now());
  const bodyRow = Math.floor(pos.y - BODY_H / 2);
  let x: number;
  let y: number;
  if (kind === 'ladder') {
    x = Math.floor(pos.x);
    y = bodyRow;
  } else {
    x = Math.floor(pos.x + myInput.facing * 1.0);
    y = Math.floor(pos.y - 0.05);
    if (tileAt(x, y) !== T.AIR) {
      // fall back to our own tile (e.g. placing a post right where we stand)
      x = Math.floor(pos.x);
    }
  }
  sendAction({ type: 'place', kind, x, y });
}
