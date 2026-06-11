import { io, type Socket } from 'socket.io-client';
import { PROTOCOL_VERSION } from '../shared/constants';
import type {
  ActionMsg,
  Ev,
  InputMsg,
  LobbyMsg,
  MeMsg,
  MeetingMsg,
  MolePrivate,
  MoleActionMsg,
  RolePrivate,
  RoundEndMsg,
  Snap,
  SyncMsg,
  VoteMsg
} from '../shared/protocol';
import { applySnap, applySync, game, update } from './state';
import { onWorldEvents, toast } from './render/effects';
import { resetPrediction } from './predict';
import { sfx } from './audio';

let socket: Socket | null = null;
let curtainTimer: ReturnType<typeof setTimeout> | null = null;

export interface ConnectOpts {
  create?: boolean;
  room?: string;
  name: string;
  hat: number;
}

const tokenKey = (code: string) => `mitm.token.${code}`;

export function connect(opts: ConnectOpts): void {
  disconnect();
  game.connState = 'connecting';
  game.errCode = '';
  update();

  const token = opts.room ? localStorage.getItem(tokenKey(opts.room.toUpperCase())) ?? undefined : undefined;
  socket = io({
    transports: ['websocket', 'polling'],
    auth: {
      v: PROTOCOL_VERSION,
      create: !!opts.create,
      room: opts.room,
      name: opts.name,
      hat: opts.hat,
      token
    },
    reconnectionAttempts: 12,
    reconnectionDelayMax: 4000
  });

  socket.on('connect', () => {
    game.connState = 'on';
    hideCurtainSoon();
    update();
  });

  socket.on('connect_error', (err) => {
    const code = (err?.message ?? '').toString();
    if (['room-not-found', 'room-full', 'bad-version', 'bad-name', 'in-progress'].includes(code)) {
      game.errCode = code;
      game.connState = 'failed';
      socket?.disconnect();
      socket = null;
      update();
    }
    // other errors: socket.io keeps retrying (cold-start wakes etc.)
  });

  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    game.connState = 'reconnecting';
    if (curtainTimer) clearTimeout(curtainTimer);
    curtainTimer = setTimeout(update, 1500); // curtain appears if still down
  });

  socket.io.on('reconnect_failed', () => {
    game.connState = 'failed';
    game.errCode = 'lost';
    update();
  });

  socket.on('sync', (msg: SyncMsg) => {
    applySync(msg);
    localStorage.setItem(tokenKey(msg.code), msg.you.token);
    localStorage.setItem('mitm.lastRoom', msg.code);
    const url = new URL(location.href);
    url.searchParams.set('room', msg.code);
    history.replaceState(null, '', url.toString());
    resetPrediction();
    update();
  });

  socket.on('snap', (s: Snap) => {
    applySnap(s);
  });

  socket.on('ev', (evs: Ev[]) => {
    onWorldEvents(evs);
  });

  socket.on('me', (m: MeMsg) => {
    if (m.dynamite > game.me.dynamite) {
      toast('🧨 You found DYNAMITE! Press X to drop it. Then RUN.');
      sfx.gold();
    }
    game.me = m;
    game.bellRingsLeft = m.bellRingsLeft;
  });

  socket.on('role', (r: RolePrivate) => {
    game.myEid = r.eid;
    game.isMole = r.mole;
    if (!r.mole) game.molePriv = null;
    resetPrediction();
    update();
  });

  socket.on('mole', (m: MolePrivate) => {
    game.molePriv = m;
  });

  socket.on('meeting', (m: MeetingMsg) => {
    game.meeting = m;
    if (m.state === 'start') {
      game.myVote = null;
      const ticksLeft = (m.endTick ?? game.serverTick) - game.serverTick;
      game.meetingDeadline = performance.now() + Math.max(0, ticksLeft) * 50;
    }
    update();
  });

  socket.on('roundEnd', (r: RoundEndMsg) => {
    game.roundEnd = r;
    update();
  });
}

function hideCurtainSoon(): void {
  if (curtainTimer) clearTimeout(curtainTimer);
  curtainTimer = null;
}

export function disconnect(): void {
  socket?.disconnect();
  socket = null;
}

export const sendInput = (m: InputMsg) => socket?.emit('input', m);
export const sendAction = (m: ActionMsg) => socket?.emit('action', m);
export const sendMole = (m: MoleActionMsg) => socket?.emit('moleAction', m);
export const sendVote = (m: VoteMsg) => socket?.emit('vote', m);
export const sendLobby = (m: LobbyMsg) => socket?.emit('lobby', m);

// phones kill background sockets; pounce the moment we're visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && socket && !socket.connected) {
    socket.connect();
  }
});
