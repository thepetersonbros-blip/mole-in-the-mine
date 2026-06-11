import { HAT_COLORS } from '../../shared/constants';
import { game } from '../state';
import { sendVote } from '../net';
import { escapeHtml } from './screens';

let ov: HTMLElement | null = null;
let timerEl: HTMLElement | null = null;
let timerInterval: ReturnType<typeof setInterval> | null = null;

function ensure(): HTMLElement {
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'meetingOv';
    document.getElementById('ui')!.appendChild(ov);
  }
  return ov;
}

export function renderMeeting(): void {
  const e = ensure();
  const m = game.meeting;
  const show = game.phase === 'meeting' && m !== null;
  e.style.display = show ? 'flex' : 'none';
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (!show || !m) return;

  if (m.state === 'start') {
    const voters = game.roster.filter((r) => !r.banished);
    e.innerHTML = `
      <div class="bigbanner" style="color:var(--gold)">🔔 MEETING!</div>
      <div class="hint">${escapeHtml(m.byName ?? '')} rang the bell. Talk it out. Who is the mole?</div>
      <div class="hint" id="mt-timer" style="font-size:18px;font-weight:800"></div>
      ${voters
        .map(
          (r) => `
        <div class="votecard ${game.myVote === r.slot ? 'voted' : ''}">
          <div class="chip" style="background:${HAT_COLORS[r.hat]}"></div>
          <div class="nm">${escapeHtml(r.name)}${r.slot === game.you.slot ? ' (you)' : ''}${r.connected ? '' : ' 💤'}</div>
          <button class="secondary vt" data-slot="${r.slot}" ${game.myVote !== null ? 'disabled' : ''}>vote</button>
        </div>`
        )
        .join('')}
      <button class="secondary" id="vt-skip" ${game.myVote !== null ? 'disabled' : ''}>Skip (vote nobody)</button>
      ${game.myVote !== null ? '<div class="hint">Vote locked in. Waiting for the others...</div>' : ''}
    `;
    e.querySelectorAll('.vt').forEach((b) =>
      b.addEventListener('click', () => {
        const slot = Number((b as HTMLElement).dataset.slot);
        game.myVote = slot;
        sendVote({ target: slot });
        renderMeeting();
      })
    );
    e.querySelector('#vt-skip')?.addEventListener('click', () => {
      game.myVote = 'skip';
      sendVote({ target: 'skip' });
      renderMeeting();
    });
    timerEl = e.querySelector('#mt-timer');
    const tick = () => {
      const msLeft = Math.max(0, game.meetingDeadline - performance.now());
      if (timerEl) timerEl.textContent = `Vote closes in ${Math.ceil(msLeft / 1000)}s`;
    };
    tick();
    timerInterval = setInterval(tick, 250);
    return;
  }

  // result
  const banished = m.banished ?? null;
  const banishedName = banished !== null ? game.roster.find((r) => r.slot === banished)?.name ?? '???' : null;
  e.innerHTML = `
    <div class="bigbanner" style="color:${banished !== null ? 'var(--danger)' : 'var(--dim)'}">
      ${banished !== null ? `${escapeHtml(banishedName!)} WAS BANISHED` : 'NOBODY WAS BANISHED'}
    </div>
    ${
      banished !== null && m.banishedWasMole === false
        ? `<div class="hint" style="font-size:17px">...and they were <b>NOT</b> the mole. Oops.</div>`
        : ''
    }
    <table class="stats">
      <tr><th>dwarf</th><th>voted for</th></tr>
      ${(m.votes ?? [])
        .map((v) => {
          const who = game.roster.find((r) => r.slot === v.slot)?.name ?? '?';
          const tgt = v.target === 'skip' ? 'skip' : game.roster.find((r) => r.slot === v.target)?.name ?? '?';
          return `<tr><td class="nm">${escapeHtml(who)}</td><td>${escapeHtml(String(tgt))}</td></tr>`;
        })
        .join('')}
    </table>
    <div class="hint">Back to the mine in a moment...</div>
  `;
}
