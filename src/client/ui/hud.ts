import { BUILD, HAT_COLORS, TICKS_PER_SEC, type BuildKind, type MoleAbility } from '../../shared/constants';
import { T } from '../../shared/tiles';
import { game, tileAt } from '../state';
import { sendAction, sendMole } from '../net';
import { contextInfo, placeKind } from '../input/keyboard';
import { predictedPos } from '../predict';

let built = false;
const $ = (id: string) => document.getElementById(id)!;

export function initHud(): void {
  if (built) return;
  built = true;
  const ui = document.getElementById('ui')!;
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.innerHTML = `
    <div class="keys">A/D move · W/S climb · E dig/use (hold) · F bonk<br>1 post · 2 ladder · 3 lamp · X dynamite · M mole</div>
    <div class="top">
      <span id="h-round" class="hint"></span>
      <div class="qbar"><div id="h-qfill"></div></div>
      <span class="quota" id="h-quota"></span>
      <span class="timer" id="h-timer"></span>
    </div>
    <div id="carry">💰 <span id="h-carry">0</span>/12 <span id="h-dyn" style="display:none"> · 🧨 <span id="h-dynn">0</span></span></div>
    <div id="prompt"></div>
    <div id="toolbar">
      <button class="tool" id="t-post"><span class="ico">🪵</span>post<span class="n" id="n-post">0</span></button>
      <button class="tool" id="t-ladder"><span class="ico">🪜</span>ladder<span class="n" id="n-ladder">0</span></button>
      <button class="tool" id="t-lantern"><span class="ico">🏮</span>lamp<span class="n" id="n-lantern">0</span></button>
    </div>
    <div id="moledrawer">
      <span class="stash">STASH<br><span id="m-stash">0</span>/<span id="m-target">45</span></span>
      <button class="tool" id="m-sour"><span class="ico">🪓</span>sour</button>
      <button class="tool" id="m-skim"><span class="ico">🤏</span>skim</button>
      <button class="tool" id="m-snuff"><span class="ico">💨</span>snuff</button>
      <button class="tool" id="m-jam"><span class="ico">⚙️</span>jam</button>
      <button class="tool" id="m-hat"><span class="ico">🎩</span>hat</button>
    </div>
    <div id="hatpick"></div>
    <div id="buried">
      <h2>YOU'RE BURIED ALIVE</h2>
      <div class="hint">You dropped your gold. A friend has to dig you out.<br>All you can do is wiggle and make muffled noises.</div>
      <button id="b-wiggle">😱 WIGGLE & YELL</button>
    </div>
    <div id="stick"><div class="nub"></div></div>
    <button id="bigact">ACT</button>
    <button id="bigatk">BONK</button>
  `;
  ui.appendChild(hud);

  $('t-post').addEventListener('click', () => placeKind('post'));
  $('t-ladder').addEventListener('click', () => placeKind('ladder'));
  $('t-lantern').addEventListener('click', () => placeKind('lantern'));
  $('b-wiggle').addEventListener('click', () => sendAction({ type: 'wiggle' }));

  $('m-skim').addEventListener('click', () => sendMole({ type: 'skim' }));
  $('m-snuff').addEventListener('click', () => sendMole({ type: 'snuff' }));
  $('m-jam').addEventListener('click', () => sendMole({ type: 'jam' }));
  $('m-sour').addEventListener('click', sourNearestPost);
  $('m-hat').addEventListener('click', toggleHatPick);

  window.addEventListener('mitm-drawer', () => {
    if (game.isMole) $('moledrawer').classList.toggle('on');
  });

  const pick = $('hatpick');
  pick.innerHTML = HAT_COLORS.map(
    (c, i) => `<div class="hat" data-hat="${i}" style="background:${c};width:32px;height:32px"></div>`
  ).join('');
  pick.querySelectorAll('.hat').forEach((h) => {
    h.addEventListener('click', () => {
      sendMole({ type: 'hat', hat: Number((h as HTMLElement).dataset.hat) });
      pick.classList.remove('on');
    });
  });

  setInterval(hudTick, 100);
}

function toggleHatPick(): void {
  $('hatpick').classList.toggle('on');
}

function sourNearestPost(): void {
  const pos = predictedPos(performance.now());
  const fx = Math.floor(pos.x);
  const fy = Math.floor(pos.y - 0.45);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (tileAt(fx + dx, fy + dy) === T.POST) {
        sendMole({ type: 'sour', x: fx + dx, y: fy + dy });
        return;
      }
    }
  }
}

const fmt = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / TICKS_PER_SEC));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function setTool(id: string, kind: BuildKind): void {
  const elN = $(`n-${kind}`);
  const tool = $(`t-${kind}`);
  elN.textContent = String(game.me.charges[kind]);
  tool.classList.toggle('zero', game.me.charges[kind] <= 0);
  const max = BUILD[kind].max;
  if (game.me.charges[kind] < max) {
    const pct = (game.me.chargeIn[kind] / BUILD[kind].cooldown) * 100;
    tool.classList.add('cd');
    (tool as HTMLElement).style.setProperty('--cd', `${pct}%`);
  } else {
    tool.classList.remove('cd');
  }
}

function hudTick(): void {
  if (!document.getElementById('hud')?.classList.contains('on')) return;
  const playing = game.phase === 'playing';

  $('h-round').textContent = `R${game.round}`;
  $('h-quota').textContent = `${game.cart}/${game.quota}`;
  ($('h-qfill') as HTMLElement).style.width = `${Math.min(100, (game.cart / Math.max(1, game.quota)) * 100)}%`;
  const timer = $('h-timer');
  timer.textContent = fmt(game.left);
  timer.classList.toggle('low', game.left < 60 * TICKS_PER_SEC);
  $('h-carry').textContent = String(game.me.carry);
  $('h-dyn').style.display = game.me.dynamite > 0 ? 'inline' : 'none';
  $('h-dynn').textContent = String(game.me.dynamite);

  setTool('t-post', 'post');
  setTool('t-ladder', 'ladder');
  setTool('t-lantern', 'lantern');

  // context prompt
  const prompt = $('prompt');
  const info = playing ? contextInfo() : null;
  if (info && !game.me.buried) {
    prompt.style.display = 'block';
    prompt.textContent = document.body.classList.contains('touch') ? info.label : `E — ${info.label}`;
  } else {
    prompt.style.display = 'none';
  }
  const bigact = document.getElementById('bigact');
  if (bigact) bigact.textContent = game.me.buried ? '😱' : info ? shortLabel(info.label) : '...';

  // buried overlay
  $('buried').classList.toggle('on', playing && game.me.buried);

  // mole drawer
  const drawer = $('moledrawer');
  if (!game.isMole || !playing) {
    drawer.classList.remove('on');
    $('hatpick').classList.remove('on');
  } else if (game.isMole && playing && !drawer.classList.contains('on')) {
    drawer.classList.add('on');
  }
  if (game.isMole && game.molePriv) {
    $('m-stash').textContent = String(game.molePriv.stash);
    $('m-target').textContent = String(game.molePriv.stashTarget);
    setMoleCd('m-sour', 'sour');
    setMoleCd('m-skim', 'skim');
    setMoleCd('m-snuff', 'snuff');
    setMoleCd('m-jam', 'jam');
    setMoleCd('m-hat', 'hat');
  }
}

function setMoleCd(id: string, ability: MoleAbility): void {
  const tool = $(id);
  const cd = game.molePriv?.cds[ability] ?? 0;
  tool.classList.toggle('zero', cd > 0);
}

function shortLabel(label: string): string {
  if (label.startsWith('Deposit')) return '💰';
  if (label.startsWith('Ring')) return '🔔';
  if (label.startsWith('Dig rubble')) return '⛏❗';
  if (label.startsWith('Dig')) return '⛏';
  return 'ACT';
}
