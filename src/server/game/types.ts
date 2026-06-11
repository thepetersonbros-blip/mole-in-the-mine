import type { BuildKind, MoleAbility } from '../../shared/constants';
import type { Ev, InputMsg, MeetingMsg, Phase, RoundEndMsg } from '../../shared/protocol';
import type { Phys } from '../../shared/movement';

export interface Dwarf {
  eid: number;
  phys: Phys;
  hatShown: number;
  buried: boolean;
  wiggleCd: number;
  // current channeled job (digging a tile; rescues are digs on occupied rubble)
  digging: { x: number; y: number; left: number; total: number; px: number; py: number } | null;
  attackCd: number;
  lastInput: InputMsg;
}

export interface PlayerSlot {
  slot: number;
  name: string;
  hatTrue: number;
  token: string;
  socketId: string | null;
  disconnectedAt: number; // room tick, -1 when connected
  isHost: boolean;
  banished: boolean;
  dwarf: Dwarf | null;
  carry: number;
  dynamite: number;
  charges: Record<BuildKind, number>;
  chargeTimers: Record<BuildKind, number>;
  bellRings: number;
  vote: number | 'skip' | null;
  votedMoleEver: boolean;
  stats: { gold: number; rescues: number; bonksGiven: number; bonksTaken: number };
  nightScore: number;
}

export interface Lantern {
  id: number;
  x: number;
  y: number;
  lit: boolean;
  fuel: number;
}
export interface Pile {
  id: number;
  x: number;
  y: number;
  amt: number;
}
export interface Rock {
  x: number;
  y: number;
  fallTimer: number;
}
export interface Dynamite {
  x: number;
  y: number;
  fuse: number;
}

export interface MoleSecret {
  slot: number;
  stash: number;
  cds: Record<MoleAbility, number>;
  // tileIdx -> ticks left until the soured post fails (sim ticks)
  soured: Map<number, number>;
  hatHistory: number[];
}

export interface MeetingState {
  byName: string;
  endTick: number; // wall tick
  votes: Map<number, number | 'skip'>;
}

export interface Room {
  code: string;
  seed: number;
  rand: () => number;
  lastActivity: number; // Date.now, GC only — never used by the sim
  tick: number; // wall ticks since room creation (drives meetings, intro)
  phase: Phase;
  round: number;
  players: (PlayerSlot | null)[];
  // round state
  tiles: Uint8Array;
  meta: Uint8Array;
  cart: number;
  quota: number;
  roundTicksLeft: number; // sim ticks, only counts down during 'playing'
  lanterns: Lantern[];
  piles: Pile[];
  rocks: Rock[];
  dynamites: Dynamite[];
  elevY: number;
  elevJam: number;
  nextId: number;
  dirty: Set<number>;
  fuses: Map<number, { left: number; stage: number }>; // sim-tick countdowns
  quakeAcc: { x: number; y: number; n: number; timer: number } | null;
  meeting: MeetingState | null;
  meetingMsg: MeetingMsg | null; // last meeting payload (for syncs mid-meeting)
  meetingCd: number;
  allBuriedTicks: number; // how long every connected dwarf has been buried
  mole: MoleSecret | null;
  introLeft: number;
  lastRoundEnd: RoundEndMsg | null;
  events: Ev[]; // queued this tick, flushed after
  // outbox handled by the network layer after each tick
  pendingMsgs: { ev: string; payload: unknown }[];
  pendingSync: boolean; // re-send full sync to everyone
  pendingRolePush: boolean; // re-send private role/mole messages
  meetingResultAt: number; // wall tick when a shown meeting result resumes play (-1 idle)
}

export const tileIdx = (x: number, y: number, W: number) => y * W + x;
