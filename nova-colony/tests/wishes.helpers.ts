/** Shared fixtures for the wish tests (not a test file). */
import type { Colonist, Wish } from '../src/core/state';
import type { ProfessionId } from '../src/data/schema';
import { makeColony, type Colony } from './expeditions.helpers';

export { collect, HOUR, MIN, placeNear, reload, T0 } from './expeditions.helpers';
export type { Colony } from './expeditions.helpers';

export interface WishColonyOpts {
  seed?: number;
  tier?: number;
  crew?: ProfessionId[];
  /** The opening tutorial is over (default true): wishes are open. */
  tutorialDone?: boolean;
}

/** A started colony (every region discovered, all research done) whose tutorial is over, so wishes can open. */
export function wishColony(o: WishColonyOpts = {}): Colony {
  const rig = makeColony({ seed: o.seed ?? 4321, tier: o.tier ?? 2, crew: o.crew, tower: false });
  const st = rig.game.state;
  st.tutorial.done = o.tutorialDone ?? true;
  if (o.tutorialDone === false) st.colony.tier = o.tier ?? 0;
  // nobody asleep: tests pick the hour themselves
  st.time.dayTime = 0.45;
  for (const c of st.colonists.list) c.activity = 'idle';
  return rig;
}

/**
 * Advance only the wish clock: `seconds` of online play in 1 s steps (playTime and the wall clock move together;
 * the rest of the simulation stands still, so colonists keep whatever they were doing).
 */
export function tickWishes(rig: Colony, seconds: number): void {
  const g = rig.game;
  for (let i = 0; i < seconds; i++) {
    g.state.playTime += 1;
    rig.clock.now += 1000;
    g.sys.wishes.update(1);
  }
}

/** Run the full simulation for `seconds` with the sun pinned at midday (nobody goes to bed). */
export function stepDay(rig: Colony, seconds: number, dt = 0.25): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    rig.game.state.time.dayTime = 0.45;
    rig.clock.now += dt * 1000;
    rig.game.update(dt);
  }
}

/** Voice a specific wish now (for a specific colonist, else the first one free). */
export function force(rig: Colony, def: string, colonist?: number): Wish {
  const w = rig.game.sys.wishes.debugOffer(def, colonist);
  if (!w) throw new Error(`could not voice ${def}`);
  return w;
}

export function colonists(rig: Colony): Colonist[] {
  return rig.game.state.colonists.list;
}

/** Fill a resource to `n` (raising storage is not needed for the small amounts wishes use). */
export function setAmount(rig: Colony, res: string, n: number): void {
  rig.game.state.resources.amounts[res] = n;
  rig.game.state.resources.lifetime[res] = Math.max(rig.game.state.resources.lifetime[res] ?? 0, n);
}
