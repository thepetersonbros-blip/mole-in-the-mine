import type { Server, Socket } from 'socket.io';
import type { ActionMsg, InputMsg, JoinAuth, LobbyMsg, MoleActionMsg, VoteMsg } from '../../shared/protocol';
import { PICKABLE_HATS } from '../../shared/constants';
import { handleAction } from '../game/actions';
import { handleMoleAction } from '../game/mole';
import { handleVote } from '../game/meetings';
import { canStart, startRound } from '../game/rules';
import type { PlayerSlot, Room } from '../game/types';
import { joinRoom, migrateHost } from '../rooms';
import { buildRole, buildSync } from './serialize';

interface SocketCtx {
  room: Room;
  player: PlayerSlot;
}

const clamp1 = (v: unknown): -1 | 0 | 1 => (v === 1 || v === -1 ? v : 0);

export function attachHandlers(io: Server): void {
  io.use((socket, next) => {
    const auth = socket.handshake.auth as Partial<JoinAuth>;
    const outcome = joinRoom({
      v: Number(auth.v),
      create: !!auth.create,
      room: typeof auth.room === 'string' ? auth.room : undefined,
      name: typeof auth.name === 'string' ? auth.name : '',
      hat: Number.isInteger(auth.hat) ? (auth.hat as number) : -1,
      token: typeof auth.token === 'string' ? auth.token : undefined
    });
    if (!outcome.ok) {
      next(new Error(outcome.err));
      return;
    }
    (socket.data as SocketCtx).room = outcome.room;
    (socket.data as SocketCtx).player = outcome.player;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const { room, player } = socket.data as SocketCtx;

    // a returning token kicks any zombie socket still holding the slot
    if (player.socketId && player.socketId !== socket.id) {
      io.sockets.sockets.get(player.socketId)?.disconnect(true);
    }
    player.socketId = socket.id;
    player.disconnectedAt = -1;
    room.lastActivity = Date.now();
    socket.join(room.code);

    socket.emit('sync', buildSync(room, player));
    if (room.phase !== 'lobby') {
      socket.emit('role', buildRole(room, player));
    }
    room.pendingSync = true; // everyone sees the fresh roster

    // crude flood guard: per-second message budget
    let budget = 80;
    let windowStart = Date.now();
    const allow = (): boolean => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        budget = 80;
      }
      return budget-- > 0;
    };

    socket.on('input', (raw: Partial<InputMsg>) => {
      if (!allow() || !player.dwarf) return;
      player.dwarf.lastInput = {
        seq: Number(raw.seq) || 0,
        lr: clamp1(raw.lr),
        ud: clamp1(raw.ud),
        facing: raw.facing === -1 ? -1 : 1
      };
    });

    socket.on('action', (raw: ActionMsg) => {
      if (!allow() || typeof raw !== 'object' || raw === null) return;
      const a = raw as ActionMsg & { x?: unknown; y?: unknown };
      if ('x' in a && (!Number.isInteger(a.x) || !Number.isInteger(a.y))) return;
      handleAction(room, player, raw);
      room.lastActivity = Date.now();
    });

    socket.on('moleAction', (raw: MoleActionMsg) => {
      if (!allow() || typeof raw !== 'object' || raw === null) return;
      handleMoleAction(room, player, raw);
    });

    socket.on('vote', (raw: Partial<VoteMsg>) => {
      if (!allow()) return;
      const target = raw?.target;
      if (target !== 'skip' && !Number.isInteger(target)) return;
      handleVote(room, player, { target: target as number | 'skip' });
    });

    socket.on('lobby', (raw: LobbyMsg) => {
      if (!allow() || typeof raw !== 'object' || raw === null) return;
      if (raw.type === 'hat') {
        if (room.phase !== 'lobby' && room.phase !== 'roundEnd') return;
        const hat = Number(raw.hat);
        if (!Number.isInteger(hat) || hat < 0 || hat >= PICKABLE_HATS) return;
        const used = room.players.some((p) => p && p !== player && p.hatTrue === hat);
        if (used) return;
        player.hatTrue = hat;
        room.pendingSync = true;
        return;
      }
      if (raw.type === 'start') {
        if (!player.isHost || room.phase !== 'lobby' || !canStart(room)) return;
        startRound(room);
        return;
      }
      if (raw.type === 'again') {
        if (!player.isHost || room.phase !== 'roundEnd') return;
        startRound(room);
      }
    });

    socket.on('disconnect', () => {
      if (player.socketId !== socket.id) return; // an old zombie, not the live binding
      player.socketId = null;
      player.disconnectedAt = room.tick;
      room.lastActivity = Date.now();
      migrateHost(room);
      room.pendingSync = true;
    });
  });
}
