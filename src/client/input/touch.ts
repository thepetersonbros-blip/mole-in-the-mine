import { contextAction, setActHeld, setAxes } from './keyboard';
import { sendAction } from '../net';

export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches;
}

export function initTouch(): void {
  if (!isTouchDevice()) return;
  document.body.classList.add('touch');

  let stickId: number | null = null;
  let origin = { x: 0, y: 0 };
  const stick = document.getElementById('stick')!;
  const nub = stick.querySelector('.nub') as HTMLElement;

  const isUiTarget = (el: EventTarget | null): boolean => {
    let n = el as HTMLElement | null;
    while (n) {
      if (n.tagName === 'BUTTON' || n.tagName === 'INPUT' || n.classList?.contains('overlay') || n.classList?.contains('screen') || n.classList?.contains('card')) return true;
      n = n.parentElement;
    }
    return false;
  };

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (isUiTarget(e.target)) return;
    if (stickId === null && e.clientX < window.innerWidth * 0.55) {
      stickId = e.pointerId;
      origin = { x: e.clientX, y: e.clientY };
      stick.style.display = 'block';
      stick.style.left = `${origin.x - 60}px`;
      stick.style.top = `${origin.y - 60}px`;
      nub.style.left = '36px';
      nub.style.top = '36px';
    }
  });

  document.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    const lim = 42;
    const cx = Math.max(-lim, Math.min(lim, dx));
    const cy = Math.max(-lim, Math.min(lim, dy));
    nub.style.left = `${36 + cx}px`;
    nub.style.top = `${36 + cy}px`;
    const dead = 13;
    const lr = dx > dead ? 1 : dx < -dead ? -1 : 0;
    const ud = dy < -dead ? 1 : dy > dead ? -1 : 0; // screen up = world up
    setAxes(lr, ud);
  });

  const release = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    stick.style.display = 'none';
    setAxes(0, 0);
  };
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', release);

  const bigact = document.getElementById('bigact');
  bigact?.addEventListener('pointerdown', () => {
    contextAction();
    setActHeld(true);
  });
  const actUp = () => setActHeld(false);
  bigact?.addEventListener('pointerup', actUp);
  bigact?.addEventListener('pointercancel', actUp);
  bigact?.addEventListener('pointerleave', actUp);
  document.getElementById('bigatk')?.addEventListener('click', () => sendAction({ type: 'attack' }));

  // iOS: kill pinch zoom + double-tap zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  let lastTap = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTap < 320 && !isUiTarget(e.target)) e.preventDefault();
      lastTap = now;
    },
    { passive: false }
  );

  // keep the screen awake during play (best effort)
  const tryWakeLock = async () => {
    try {
      await (navigator as any).wakeLock?.request('screen');
    } catch {
      /* not supported or denied: lobby tip covers it */
    }
  };
  void tryWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void tryWakeLock();
  });
}
