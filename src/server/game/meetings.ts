import { MEETING_COOLDOWN, SPAWN_X_MIN, SURFACE_Y, VOTE_TICKS, sec } from '../../shared/constants';
import type { MeetingMsg, VoteMsg } from '../../shared/protocol';
import { unburyAll } from './collapse';
import type { PlayerSlot, Room } from './types';
import { endRound, freshEid } from './rules';
import { makePhys } from '../../shared/movement';

const RESULT_SHOW_TICKS = sec(6);

function eligibleVoters(room: Room): PlayerSlot[] {
  return room.players.filter((p): p is PlayerSlot => !!p && !p.banished && p.socketId !== null);
}

export function startMeeting(room: Room, byName: string): void {
  room.phase = 'meeting';
  unburyAll(room);
  // pull everyone to the camp lineup
  let i = 0;
  for (const p of room.players) {
    if (!p?.dwarf || p.banished) continue;
    p.dwarf.phys = makePhys(SPAWN_X_MIN + 1 + i * 2, SURFACE_Y);
    p.dwarf.digging = null;
    p.vote = null;
    i++;
  }
  room.meeting = { byName, endTick: room.tick + VOTE_TICKS, votes: new Map() };
  room.meetingResultAt = -1;
  const msg: MeetingMsg = { state: 'start', byName, endTick: room.tick + VOTE_TICKS };
  room.meetingMsg = msg;
  room.pendingMsgs.push({ ev: 'meeting', payload: msg });
  room.pendingSync = true; // positions and unburials changed a lot at once
}

export function handleVote(room: Room, p: PlayerSlot, v: VoteMsg): void {
  if (room.phase !== 'meeting' || !room.meeting || room.meetingResultAt >= 0) return;
  if (p.banished) return;
  if (v.target !== 'skip') {
    const t = room.players[v.target];
    if (!t || t.banished) return;
  }
  room.meeting.votes.set(p.slot, v.target);
  p.vote = v.target;
  if (room.meeting.votes.size >= eligibleVoters(room).length) resolveMeeting(room);
}

export function tickMeeting(room: Room): void {
  if (!room.meeting) return;
  if (room.meetingResultAt >= 0) {
    if (room.tick >= room.meetingResultAt) resumePlay(room);
    return;
  }
  if (room.tick >= room.meeting.endTick) resolveMeeting(room);
}

function resolveMeeting(room: Room): void {
  const meeting = room.meeting!;
  const voters = eligibleVoters(room);
  const counts = new Map<number, number>();
  for (const [, target] of meeting.votes) {
    if (target === 'skip') continue;
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const majority = Math.floor(voters.length / 2) + 1;
  let banished: number | null = null;
  for (const [slot, n] of counts) {
    if (n >= majority) banished = slot;
  }

  // remember who voted for the actual mole (for the night scoreboard)
  if (room.mole) {
    for (const [slot, target] of meeting.votes) {
      if (target === room.mole.slot) {
        const p = room.players[slot];
        if (p) p.votedMoleEver = true;
      }
    }
  }

  const wasMole = banished !== null && room.mole?.slot === banished;
  if (banished !== null) {
    const p = room.players[banished];
    if (p) {
      p.banished = true;
      p.vote = null;
    }
  }

  const msg: MeetingMsg = {
    state: 'result',
    byName: meeting.byName,
    votes: [...meeting.votes.entries()].map(([slot, target]) => ({ slot, target })),
    banished,
    banishedWasMole: banished === null ? undefined : wasMole
  };
  room.meetingMsg = msg;
  room.pendingMsgs.push({ ev: 'meeting', payload: msg });

  if (wasMole) {
    room.meeting = null;
    room.meetingResultAt = -1;
    endRound(room, 'miners', 'banished');
    return;
  }
  room.meetingResultAt = room.tick + RESULT_SHOW_TICKS;
}

function resumePlay(room: Room): void {
  room.meeting = null;
  room.meetingMsg = null;
  room.meetingResultAt = -1;
  room.meetingCd = MEETING_COOLDOWN;
  // fresh identities: new entity ids for everyone, hats back to true colors.
  // This closes the "track an eid across a meeting" devtools leak and resets
  // in-fiction trails too.
  for (const p of room.players) {
    if (!p?.dwarf) continue;
    p.dwarf.eid = 0;
  }
  for (const p of room.players) {
    if (!p?.dwarf) continue;
    p.dwarf.eid = freshEid(room);
    p.dwarf.hatShown = p.hatTrue;
  }
  room.phase = 'playing';
  room.pendingSync = true;
  room.pendingRolePush = true; // everyone learns their own new eid privately
}
