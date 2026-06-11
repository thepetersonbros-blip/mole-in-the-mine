// Single source of truth for every message that crosses the wire.
// SECURITY NOTE: nothing in here may ever carry the mole's identity, stash,
// cooldowns, or soured posts except the per-socket private messages marked so.

import type { BuildKind, MoleAbility } from './constants';

export type Phase = 'lobby' | 'intro' | 'playing' | 'meeting' | 'roundEnd';

// ---------- client -> server ----------

export interface JoinAuth {
  v: number; // protocol version
  create?: boolean;
  room?: string; // 4-letter code when joining
  name: string;
  hat: number; // preferred hat index (0..PICKABLE_HATS-1)
  token?: string; // rejoin token
}

export interface InputMsg {
  seq: number;
  lr: -1 | 0 | 1;
  ud: -1 | 0 | 1; // +1 = up (ladder/elevator), -1 = down
  facing: 1 | -1;
}

export type ActionMsg =
  | { type: 'dig'; x: number; y: number }
  | { type: 'place'; kind: BuildKind; x: number; y: number }
  | { type: 'deposit' }
  | { type: 'rescue'; x: number; y: number }
  | { type: 'attack' }
  | { type: 'bell' }
  | { type: 'wiggle' }
  | { type: 'dynamite' } // drop a lit stick at your feet
  | { type: 'cancel' }; // stop current dig/rescue

export type MoleActionMsg =
  | { type: 'sour'; x: number; y: number }
  | { type: 'skim' }
  | { type: 'snuff' }
  | { type: 'jam' }
  | { type: 'hat'; hat: number };

export interface VoteMsg {
  target: number | 'skip'; // slot index
}

export type LobbyMsg =
  | { type: 'hat'; hat: number }
  | { type: 'start' } // host only
  | { type: 'again' }; // host only, from roundEnd -> next round

// ---------- server -> client ----------

export interface RosterEntry {
  slot: number;
  name: string;
  hat: number; // TRUE hat (lobby + meetings + scoreboard only)
  connected: boolean;
  banished: boolean;
  isHost: boolean;
}

// One dwarf as the world sees it. NO name, NO slot: eid is a per-round
// shuffled opaque id, hat is whatever hat the dwarf is wearing right now.
export interface DwarfSnap {
  eid: number;
  x: number; // quantized: tiles * 32
  y: number;
  hat: number;
  flags: number; // bit0 buried, bit1 stunned, bit2 zZ (disconnected), bit3 facingLeft, bit4 walking, bit5 onLadder, bit6 digging
}

export interface Snap {
  t: number; // server tick
  dw: DwarfSnap[];
  rocks: [number, number][]; // falling rocks, quantized
  dyn: [number, number][]; // lit dynamite sticks, tile coords
  elevY: number; // quantized
  cart: number;
  left: number; // round ticks left
}

export interface LanternSnap {
  id: number;
  x: number;
  y: number;
  lit: boolean;
}
export interface PileSnap {
  id: number;
  x: number;
  y: number;
  amt: number;
}

export interface SyncMsg {
  v: number;
  tick: number;
  phase: Phase;
  round: number;
  code: string;
  you: { slot: number; token: string };
  roster: RosterEntry[];
  // world (absent in lobby)
  grid?: ArrayBuffer; // WORLD_W*WORLD_H*2 bytes: tiles then meta
  cart?: number;
  quota?: number;
  left?: number;
  dw?: DwarfSnap[];
  lanterns?: LanternSnap[];
  piles?: PileSnap[];
  elevY?: number;
  elevJammed?: boolean;
  meeting?: MeetingMsg | null;
  roundEnd?: RoundEndMsg | null;
  bellRingsLeft?: number;
}

export type Ev =
  | { k: 'tile'; x: number; y: number; t: number; m: number; cause: 'dig' | 'place' | 'crumble' | 'rockfall' | 'attack' | 'blast' }
  | { k: 'crack'; x: number; y: number; stage: number }
  | { k: 'quake'; x: number; y: number; n: number } // n = rocks involved
  | { k: 'bury'; eid: number; x: number; y: number }
  | { k: 'rescue'; eid: number; byName: string }
  | { k: 'ping'; x: number; y: number } // muffled help, pre-fuzzed server-side
  | { k: 'deposit'; name: string; amt: number; total: number } // the honest anchor
  | { k: 'cart'; total: number } // anonymous total change (skims look like this)
  | { k: 'pile'; id: number; x: number; y: number; amt: number } // amt 0 = gone
  | { k: 'lantern'; id: number; x: number; y: number; lit: boolean }
  | { k: 'elev'; jammed: boolean }
  | { k: 'swing'; eid: number; dir: 1 | -1; hit: 'air' | 'dwarf' | 'tile' }
  | { k: 'stun'; eid: number }
  | { k: 'dust'; x: number; y: number } // cosmetic warnings
  | { k: 'boom'; x: number; y: number }; // dynamite

export interface MeetingMsg {
  state: 'start' | 'result';
  byName?: string; // who rang (public act)
  endTick?: number;
  votes?: { slot: number; target: number | 'skip' }[]; // revealed at result
  banished?: number | null;
  banishedWasMole?: boolean;
}

export interface PlayerRoundStats {
  slot: number;
  name: string;
  hat: number;
  gold: number;
  rescues: number;
  bonksGiven: number;
  bonksTaken: number;
  votedCorrectly: boolean | null;
}

export interface RoundEndMsg {
  round: number;
  winner: 'miners' | 'mole';
  reason: 'quota' | 'banished' | 'timer' | 'stash';
  moleSlot: number;
  moleName: string;
  hatHistory: number[]; // every hat the mole wore
  cart: number;
  quota: number;
  stash: number;
  stats: PlayerRoundStats[];
  totals: { slot: number; name: string; score: number }[]; // night running score
}

// Private, per-socket only.
export interface RolePrivate {
  mole: boolean;
  eid: number; // your dwarf's entity id this round
}
export interface MolePrivate {
  stash: number;
  stashTarget: number;
  cds: Record<MoleAbility, number>; // ticks until ready
}
export interface MeMsg {
  carry: number;
  dynamite: number;
  charges: Record<BuildKind, number>;
  chargeIn: Record<BuildKind, number>; // ticks to next charge
  attackCd: number;
  buried: boolean;
  stun: number;
  bellRingsLeft: number;
  digging: { x: number; y: number; pct: number } | null;
}

export interface ErrMsg {
  code: 'room-not-found' | 'room-full' | 'in-progress' | 'bad-version' | 'bad-name';
  msg: string;
}

// Socket.io event-name map (documentation; both sides use these strings).
export const EV = {
  sync: 'sync',
  snap: 'snap',
  ev: 'ev',
  me: 'me',
  role: 'role',
  mole: 'mole',
  meeting: 'meeting',
  roundEnd: 'roundEnd',
  err: 'err',
  // client -> server
  input: 'input',
  action: 'action',
  moleAction: 'moleAction',
  vote: 'vote',
  lobby: 'lobby'
} as const;
