import type { ResourceBag } from './schema';

/**
 * ECONOMY PACING — the central levers for how long the road to Titanium takes.
 *
 * Target (docs/SPEC.md §2, tests/pacing.*): an engaged player (five 20-minute sessions a day) reaches Titanium in about
 * four weeks: Reinforced in the first session, Stone at the end of day 1, Steel on day 3, Alloy on day 6-7, Nano on
 * day 13-14, Titanium on day 26-30 (~45 h online). Production numbers stay as authored in the content files (big,
 * growing numbers are part of the fun); the goals grow instead. Every multiplier is indexed by colony tier
 * (0 Wood … 6 Titanium) and applied once, when the content arrays are built (data/buildings.ts, tiers.ts,
 * research.ts, missions.ts), so the UI, the sim and the tests all see the same paced numbers.
 *
 *  - `build`: a facility's cost (and with it every level-up, cost × levelCostMult^level) by its unlock tier. Decor
 *    stays as authored (a lantern or a fountain is a small cozy wish at any tier).
 *  - `storage`: what a storage building holds, by its unlock tier, so every cost of its tier always fits.
 *  - `piece`: walls, floors, doors… of a material tier (TierDef.pieceCost and a piece's own extras); kept at 1.
 *  - `research`: RP and resources of a tech by its tier.
 *  - `tierUp`: the Command Center upgrade INTO a tier.
 *  - `missionReward`: resources and RP a main or side mission pays, by the tier it is played in.
 *  - `survivors`: the chance an expedition finds someone to bring home and the weight of survivor-rescue world
 *    events. With weeks of trips and events these would otherwise outgrow the recruitment board (which sets the
 *    colony's growth, sim/colony/recruitBoard.ts); rescues stay a lovely surprise, not the main road.
 *  - `copies`: the first few copies of a facility cost the same, then each further copy costs `growth` x the one
 *    before (structure pieces and decor never escalate). Without it an older building turns into a bargain once
 *    the colony is a few tiers past it (a hundred research desks at Nano); with it, levelling up what you have and
 *    building the newer, bigger machines is the better deal, and the colony stays a readable size.
 *
 * Wood and the first Reinforced Wood steps stay at 1 so the guided first 15 minutes are exactly as before.
 */
export interface PacingDef {
  copies: { free: number; growth: number };
  survivors: number;
  build: number[];
  storage: number[];
  piece: number[];
  research: number[];
  tierUp: number[];
  missionReward: number[];
}

export const PACING: PacingDef = {
  copies: { free: 4, growth: 1.15 },
  survivors: 0.04,
  build: [1, 3, 6, 12, 16, 35, 35],
  storage: [1, 3, 6, 20, 35, 70, 70],
  // walls, floors and doors stay cheap at every tier: building rooms is the cozy part, never a goal to grind for
  piece: [1, 1, 1, 1, 1, 1, 1],
  research: [1, 5, 30, 54, 70, 70, 70],
  tierUp: [1, 1, 6.5, 33, 40, 62, 64],
  missionReward: [1, 2, 4, 6, 10, 16, 20],
};

/** A friendly amount: whole numbers below 100, then steps of 5, then two significant digits (12,345 -> 12,000). */
export function roundCost(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 100) return Math.max(1, Math.round(n));
  if (n < 1000) return Math.round(n / 5) * 5;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

/** Scale every entry of a bag and round to a friendly amount (a multiplier of 1 returns an unchanged copy). */
export function scaleBag<T extends ResourceBag | undefined>(bag: T, mult: number): T {
  if (!bag) return bag;
  const out: ResourceBag = {};
  for (const [k, v] of Object.entries(bag)) {
    if (typeof v !== 'number') continue;
    out[k] = mult === 1 ? v : roundCost(v * mult);
  }
  return out as T;
}

/** The multiplier for a tier (clamped to the table). */
export function pace(table: number[], tier: number): number {
  const t = Math.max(0, Math.min(table.length - 1, Math.floor(tier) || 0));
  return table[t] ?? 1;
}

/** Cost multiplier for the next copy of a facility when `owned` copies already stand (1 for the first `free`). */
export function copyMult(owned: number): number {
  const extra = Math.max(0, Math.floor(owned) - PACING.copies.free + 1);
  return extra > 0 ? Math.pow(PACING.copies.growth, extra) : 1;
}
