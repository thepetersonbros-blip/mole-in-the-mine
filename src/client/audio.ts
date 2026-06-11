// All sound is synthesized: no audio files, no loading, no licensing.
// iOS requires a user gesture before audio can play; main.ts calls unlock().

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlock(): void {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function now(): number {
  return ctx?.currentTime ?? 0;
}

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.5, glide = 0): void {
  if (!ctx || !master || ctx.state !== 'running') return;
  const t = now();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide !== 0) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;
function noise(dur: number, vol: number, lowpass: number): void {
  if (!ctx || !master || ctx.state !== 'running') return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = now();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  dig: () => noise(0.08, 0.25, 900),
  digRock: () => {
    noise(0.06, 0.3, 1400);
    tone(190, 0.06, 'square', 0.12);
  },
  breakTile: () => {
    noise(0.18, 0.4, 700);
    tone(120, 0.15, 'triangle', 0.25, -60);
  },
  gold: () => {
    tone(880, 0.09, 'sine', 0.3);
    setTimeout(() => tone(1320, 0.12, 'sine', 0.25), 60);
  },
  place: () => tone(220, 0.1, 'square', 0.2, -40),
  deposit: () => {
    tone(660, 0.1, 'sine', 0.3);
    setTimeout(() => tone(990, 0.14, 'sine', 0.3), 80);
    setTimeout(() => tone(1320, 0.18, 'sine', 0.25), 160);
  },
  creak: () => tone(90, 0.5, 'sawtooth', 0.12, 25),
  rumble: (mag: number) => noise(0.7 + mag * 0.12, Math.min(0.7, 0.22 + mag * 0.07), 220),
  bury: () => {
    noise(0.5, 0.5, 380);
    tone(70, 0.5, 'sine', 0.4, -25);
  },
  rescue: () => {
    tone(520, 0.1, 'triangle', 0.3);
    setTimeout(() => tone(780, 0.18, 'triangle', 0.3), 90);
  },
  ping: () => tone(540, 0.35, 'sine', 0.12, -160),
  bell: () => {
    tone(1245, 1.1, 'triangle', 0.4, -8);
    tone(830, 1.3, 'sine', 0.3, -5);
  },
  swing: () => noise(0.07, 0.18, 2600),
  bonk: () => {
    tone(160, 0.18, 'square', 0.35, -70);
    noise(0.1, 0.2, 800);
  },
  stun: () => tone(300, 0.4, 'sine', 0.2, 320),
  jam: () => tone(110, 0.5, 'sawtooth', 0.25, -50),
  snuff: () => noise(0.2, 0.18, 500),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.3), i * 120));
  },
  lose: () => {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sawtooth', 0.18), i * 150));
  },
  tick: () => tone(1000, 0.04, 'square', 0.08)
};
