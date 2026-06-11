// Local prediction for YOUR dwarf only. Runs the same shared movement step
// the server runs, then gently corrects toward the server's word when they
// disagree. Everyone else interpolates (see state.ts).

import { SHAFT_X1, SHAFT_X2, TICK_MS } from '../shared/constants';
import { T, isSolid } from '../shared/tiles';
import { makePhys, step, type Phys, type PhysWorld, type StepInput } from '../shared/movement';
import { F, dwarfRenderPos, game, tileAt } from './state';

export const myInput: StepInput & { seq: number } = { seq: 0, lr: 0, ud: 0, facing: 1 };

let phys: Phys | null = null;
let acc = 0;
let last = 0;

export function resetPrediction(): void {
  phys = null;
}

const world: PhysWorld = {
  isSolid: (x, y) => isSolid(tileAt(x, y)),
  isLadder: (x, y) => tileAt(x, y) === T.LADDER,
  platform: { x1: SHAFT_X1, x2: SHAFT_X2 + 1, y: 8 }
};

export function myServerDwarf() {
  return game.dwarfs.get(game.myEid) ?? null;
}

// Called every frame; returns the position to render + simulate camera from.
export function predictedPos(now: number): { x: number; y: number; phys: Phys | null } {
  const sd = myServerDwarf();
  if (!sd) {
    phys = null;
    return { x: 0, y: 0, phys: null };
  }
  const serverPos = { x: sd.x1, y: sd.y1 }; // freshest known server position

  if (!phys) {
    phys = makePhys(serverPos.x, serverPos.y);
    last = now;
    acc = 0;
  }

  const buried = (sd.flags & F.buried) !== 0;
  if (buried || game.phase !== 'playing') {
    // server owns us entirely; follow the interpolated stream
    const p = dwarfRenderPos(sd, now);
    phys.x = p.x;
    phys.y = p.y;
    phys.vy = 0;
    last = now;
    return { x: p.x, y: p.y, phys };
  }

  acc += Math.min(200, now - last);
  last = now;
  world.platform!.y = game.elevY;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    step(phys, myInput, world);
  }

  // reconcile
  const dx = serverPos.x - phys.x;
  const dy = serverPos.y - phys.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > 2.25) {
    phys.x = serverPos.x;
    phys.y = serverPos.y;
    phys.vy = 0;
  } else if (d2 > 0.02) {
    phys.x += dx * 0.12;
    phys.y += dy * 0.12;
  }
  return { x: phys.x, y: phys.y, phys };
}
