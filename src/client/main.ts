import { game, onUpdate } from './state';
import { connect } from './net';
import { initRenderer } from './render/renderer';
import { initKeyboard } from './input/keyboard';
import { initTouch } from './input/touch';
import { initScreens, route } from './ui/screens';
import { initHud } from './ui/hud';
import { unlock } from './audio';

function boot(): void {
  initScreens();
  initHud();
  initKeyboard();
  initTouch();
  initRenderer(document.getElementById('game') as HTMLCanvasElement);
  onUpdate(route);
  route();

  // browsers require a gesture before audio is allowed
  const tryUnlock = () => unlock();
  window.addEventListener('pointerdown', tryUnlock);
  window.addEventListener('keydown', tryUnlock);

  // refreshed mid-game? hop straight back into your dwarf
  const room = new URL(location.href).searchParams.get('room')?.toUpperCase();
  const name = localStorage.getItem('mitm.name');
  if (room && name && localStorage.getItem(`mitm.token.${room}`)) {
    connect({ room, name, hat: Number(localStorage.getItem('mitm.hat') ?? 0) || 0 });
  }

  // test/debug hook (everything here is this player's own view anyway)
  (window as unknown as { __game: typeof game }).__game = game;
}

boot();
