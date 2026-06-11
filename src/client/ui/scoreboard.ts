import { HAT_COLORS } from '../../shared/constants';
import { game } from '../state';
import { sendLobby } from '../net';
import { escapeHtml } from './screens';

let ov: HTMLElement | null = null;

function ensure(): HTMLElement {
  if (!ov) {
    ov = document.createElement('div');
    ov.className = 'overlay';
    ov.id = 'boardOv';
    document.getElementById('ui')!.appendChild(ov);
  }
  return ov;
}

const REASONS: Record<string, string> = {
  quota: 'The cart hit the quota!',
  banished: 'The mole was banished!',
  timer: 'The whistle blew... the cart came up short.',
  stash: 'The mole filled a secret stash.',
  buried: 'Every single dwarf got buried alive. The mine keeps the gold.'
};

export function renderBoard(): void {
  const e = ensure();
  const r = game.roundEnd;
  const show = game.phase === 'roundEnd' && r !== null;
  e.style.display = show ? 'flex' : 'none';
  if (!show || !r) return;

  const isHost = game.roster.find((x) => x.slot === game.you.slot)?.isHost;
  const minersWin = r.winner === 'miners';
  const hadMole = r.moleSlot >= 0;
  const banner = !hadMole
    ? minersWin
      ? '⛏ SHIFT COMPLETE'
      : '⏰ SHIFT FAILED'
    : minersWin
      ? '⛏ MINERS WIN'
      : '🕳 THE MOLE WINS';
  e.innerHTML = `
    <div class="bigbanner ${minersWin ? 'miners' : 'mole'}">${banner}</div>
    <div class="hint" style="font-size:16px">${REASONS[r.reason] ?? ''} (${r.cart}/${r.quota} gold banked${hadMole ? `, ${r.stash} stolen` : ''})</div>
    ${
      hadMole
        ? `<div style="text-align:center">
            <div style="font-size:20px;font-weight:800;color:var(--danger)">The mole was ${escapeHtml(r.moleName)}!</div>
            <div class="hathist" style="margin-top:6px">
              <span class="hint">hats worn:</span>
              ${r.hatHistory.map((h) => `<div class="chip" style="width:18px;height:18px;border-radius:50%;border:2px solid #0008;background:${HAT_COLORS[h]}"></div>`).join('<span class="hint">→</span>')}
            </div>
          </div>`
        : '<div class="hint">(practice round, no mole)</div>'
    }
    <table class="stats">
      <tr><th></th><th>dwarf</th><th>gold</th><th>rescues</th><th>bonks</th><th>got bonked</th>${hadMole ? '<th>voted right</th>' : ''}</tr>
      ${r.stats
        .map(
          (s) => `
        <tr>
          <td><div class="chip" style="width:14px;height:14px;border-radius:50%;background:${HAT_COLORS[s.hat]};display:inline-block"></div></td>
          <td class="nm">${escapeHtml(s.name)}${s.slot === r.moleSlot ? ' 🕳' : ''}</td>
          <td>${s.gold}</td><td>${s.rescues}</td><td>${s.bonksGiven}</td><td>${s.bonksTaken}</td>
          ${hadMole ? `<td>${s.slot === r.moleSlot ? '—' : s.votedCorrectly ? '✔' : ''}</td>` : ''}
        </tr>`
        )
        .join('')}
    </table>
    <div style="text-align:center">
      <div class="hint" style="margin-bottom:4px">TONIGHT'S SCORE</div>
      <div class="row" style="justify-content:center;gap:14px">
        ${r.totals.map((t, i) => `<span style="font-weight:800">${i === 0 ? '👑 ' : ''}${escapeHtml(t.name)}: ${t.score}</span>`).join('')}
      </div>
    </div>
    ${
      isHost
        ? `<button id="bd-again">⛏ Next round (new mine, new mole)</button>`
        : `<div class="hint">Waiting for the host to start the next round...</div>`
    }
  `;
  e.querySelector('#bd-again')?.addEventListener('click', () => sendLobby({ type: 'again' }));
}
