import { HAT_COLORS, MIN_PLAYERS, PICKABLE_HATS } from '../../shared/constants';
import { game } from '../state';
import { connect, sendLobby } from '../net';
import { renderMeeting } from './meeting';
import { renderBoard } from './scoreboard';

const HAT_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange', 'Cyan', 'Pink', 'White', 'Black'];

let join: HTMLElement;
let lobby: HTMLElement;
let curtain: HTMLElement;
let intro: HTMLElement;
let pickedHat = 0;

export function initScreens(): void {
  const ui = document.getElementById('ui')!;
  join = el('div', 'screen');
  join.id = 'screen-join';
  lobby = el('div', 'screen');
  lobby.id = 'screen-lobby';
  intro = el('div', 'overlay');
  intro.id = 'introOv';
  curtain = el('div', '');
  curtain.id = 'curtain';
  ui.append(join, lobby, intro, curtain);
  pickedHat = Number(localStorage.getItem('mitm.hat') ?? 0) || 0;
  renderJoin();
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function hatChip(i: number, size = 38): string {
  return `<div class="hat" data-hat="${i}" style="width:${size}px;height:${size}px;background:${HAT_COLORS[i]}"></div>`;
}

export function renderJoin(): void {
  const url = new URL(location.href);
  const prefill = (url.searchParams.get('room') ?? localStorage.getItem('mitm.lastRoom') ?? '').toUpperCase();
  const name = localStorage.getItem('mitm.name') ?? '';
  join.innerHTML = `
    <div class="title">MOLE IN THE MINE</div>
    <div class="subtitle">Dig together. Trust no one.</div>
    <div class="card">
      <input type="text" id="jn-name" placeholder="Your name" maxlength="14" value="${escapeHtml(name)}" />
      <div class="row" style="justify-content:space-between"><span class="hint">Pick your hat:</span></div>
      <div class="hats" id="jn-hats">
        ${Array.from({ length: PICKABLE_HATS }, (_, i) => hatChip(i)).join('')}
      </div>
      <button id="jn-create">⛏ Open a new mine</button>
      <div class="row">
        <input type="text" id="jn-code" class="code" placeholder="CODE" maxlength="4" style="flex:1" value="${escapeHtml(prefill)}" />
        <button id="jn-join" class="secondary">Join</button>
      </div>
      <div class="err" id="jn-err">${errText()}</div>
      <div class="hint">Six friends, one shared mine. Haul gold to the cart before the shift whistle.
      One of you is secretly paid by the rival mine. Cave-ins are... not always accidents.</div>
    </div>`;
  join.querySelectorAll('.hat').forEach((h) => {
    const i = Number((h as HTMLElement).dataset.hat);
    if (i === pickedHat) h.classList.add('sel');
    h.addEventListener('click', () => {
      pickedHat = i;
      localStorage.setItem('mitm.hat', String(i));
      join.querySelectorAll('.hat').forEach((x) => x.classList.remove('sel'));
      h.classList.add('sel');
    });
  });
  const nameInput = join.querySelector('#jn-name') as HTMLInputElement;
  const codeInput = join.querySelector('#jn-code') as HTMLInputElement;
  const getName = () => {
    const n = nameInput.value.trim();
    if (!n) {
      (join.querySelector('#jn-err') as HTMLElement).textContent = 'Pick a name first!';
      nameInput.focus();
      return null;
    }
    localStorage.setItem('mitm.name', n);
    return n;
  };
  join.querySelector('#jn-create')?.addEventListener('click', () => {
    const n = getName();
    if (n) connect({ create: true, name: n, hat: pickedHat });
  });
  const doJoin = () => {
    const n = getName();
    const code = codeInput.value.trim().toUpperCase();
    if (n && code.length === 4) connect({ room: code, name: n, hat: pickedHat });
    else if (n) (join.querySelector('#jn-err') as HTMLElement).textContent = 'Room codes are 4 letters.';
  };
  join.querySelector('#jn-join')?.addEventListener('click', doJoin);
  codeInput.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') doJoin();
  });
}

function errText(): string {
  switch (game.errCode) {
    case 'room-not-found':
      return 'That mine is gone (wrong code, or the server took a nap). Open a new one!';
    case 'room-full':
      return 'That mine is packed full.';
    case 'bad-name':
      return 'That name will not fly down here.';
    case 'bad-version':
      return 'Your game is outdated. Hard-refresh the page (Ctrl+Shift+R).';
    case 'lost':
      return 'Lost the connection and could not get it back.';
    default:
      return '';
  }
}

function renderLobby(): void {
  const me = game.roster.find((r) => r.slot === game.you.slot);
  const isHost = !!me?.isHost;
  const n = game.roster.filter((r) => r.connected).length;
  const link = `${location.origin}${location.pathname}?room=${game.code}`;
  lobby.innerHTML = `
    <div class="title" style="font-size:30px">THE MINE IS OPEN</div>
    <div class="card">
      <div class="hint" style="text-align:center">Tell your friends the code:</div>
      <div class="codebig">${game.code}</div>
      <button id="lb-copy" class="secondary">📋 Copy invite link</button>
      <div class="roster">
        ${game.roster
          .map(
            (r) => `
          <div class="p">
            <div class="chip" style="background:${HAT_COLORS[r.hat]}"></div>
            <div class="nm">${escapeHtml(r.name)} ${r.isHost ? '⭐' : ''}</div>
            <div class="tag">${r.connected ? (r.slot === game.you.slot ? 'you' : 'ready') : 'gone'}</div>
          </div>`
          )
          .join('')}
      </div>
      <div class="row" style="justify-content:space-between">
        <span class="hint">Change hat:</span>
      </div>
      <div class="hats" id="lb-hats">
        ${Array.from({ length: PICKABLE_HATS }, (_, i) => hatChip(i, 30)).join('')}
      </div>
      ${
        isHost
          ? `<button id="lb-start" ${n < MIN_PLAYERS ? 'disabled' : ''}>⛏ Start the shift (${n} dwarfs)</button>
             <div class="hint" style="text-align:center">${n >= 4 ? 'A mole WILL be among you.' : '4+ dwarfs adds the secret mole. Fewer = practice dig.'}</div>`
          : `<div class="hint" style="text-align:center">Waiting for the host to start the shift...</div>`
      }
      <div class="hint">How to play: dig gold, haul it to the cart. Wide tunnels cave in, so place support posts.
      Crushed dwarfs get buried, not killed: dig them out. Heard a rumble? Count the hats.
      Ring the bell to vote out the mole. Phones: keep your screen on.</div>
    </div>`;
  lobby.querySelector('#lb-copy')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(link);
    (lobby.querySelector('#lb-copy') as HTMLElement).textContent = '✓ Copied!';
  });
  lobby.querySelector('#lb-start')?.addEventListener('click', () => sendLobby({ type: 'start' }));
  const taken = new Set(game.roster.filter((r) => r.slot !== game.you.slot).map((r) => r.hat));
  lobby.querySelectorAll('#lb-hats .hat').forEach((h) => {
    const i = Number((h as HTMLElement).dataset.hat);
    if (taken.has(i)) h.classList.add('taken');
    if (me && me.hat === i) h.classList.add('sel');
    h.addEventListener('click', () => {
      if (!taken.has(i)) sendLobby({ type: 'hat', hat: i });
    });
  });
}

function renderIntro(): void {
  const mole = game.isMole;
  intro.innerHTML = `
    <div class="bigbanner" style="color:var(--dim)">ROUND ${game.round}</div>
    <div class="bigbanner ${mole ? 'mole' : 'miners'}">${mole ? 'YOU ARE THE MOLE' : 'YOU ARE A MINER'}</div>
    <div class="card" style="text-align:center">
      ${
        mole
          ? `<div>Make the shift fail. Sour supports, skim the cart, snuff lanterns, jam the elevator...
             and <b>swap your hat</b> to frame your friends. Press <b>M</b> (or the red drawer) for your dirty tricks.</div>`
          : `<div>Bank <b>${game.quota} gold</b> before the whistle. Build supports or the roof comes down.
             One of you is lying. Watch the hats.</div>`
      }
    </div>`;
}

function renderCurtain(): void {
  if (game.connState === 'connecting') {
    curtain.innerHTML = `<div class="spin"></div><div><b>Waking the mine...</b></div>
      <div class="hint">Free servers nap when nobody plays.<br>First wake-up can take a minute. Hang tight.</div>`;
    curtain.classList.add('on');
  } else if (game.connState === 'reconnecting') {
    curtain.innerHTML = `<div class="spin"></div><div><b>Reconnecting...</b></div>
      <div class="hint">Your dwarf is holding its breath.</div>`;
    curtain.classList.add('on');
  } else if (game.connState === 'failed') {
    curtain.innerHTML = `<div><b>${errText() || 'Connection failed.'}</b></div>
      <button id="ct-back">Back to the entrance</button>`;
    curtain.classList.add('on');
    curtain.querySelector('#ct-back')?.addEventListener('click', () => {
      game.connState = 'boot';
      game.errCode = '';
      route();
    });
  } else {
    curtain.classList.remove('on');
  }
}

export function route(): void {
  const show = (e: HTMLElement, on: boolean) => (e.style.display = on ? 'flex' : 'none');
  const hud = document.getElementById('hud');
  const inGame = ['intro', 'playing', 'meeting', 'roundEnd'].includes(game.phase) && game.connState !== 'boot' && game.connState !== 'failed';

  show(join, game.connState === 'boot' || game.connState === 'failed');
  if (game.connState === 'boot') renderJoin();
  show(lobby, game.connState === 'on' && game.phase === 'lobby');
  if (game.connState === 'on' && game.phase === 'lobby') renderLobby();
  hud?.classList.toggle('on', inGame);
  show(intro, inGame && game.phase === 'intro');
  if (inGame && game.phase === 'intro') renderIntro();
  renderMeeting();
  renderBoard();
  renderCurtain();
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
