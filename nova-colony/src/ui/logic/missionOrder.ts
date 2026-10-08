/**
 * Side tab order: rewards waiting to be claimed first, then the goals of the newest tier, then the rest in
 * board order. A late colony no longer scrolls past early leftovers ("Pest Patrol") to find its Steel goals.
 */
import type { MissionDef } from '../../data/schema';

export function sideOrder(list: readonly MissionDef[], claimable: ReadonlySet<string>): MissionDef[] {
  return list
    .map((m, i) => ({ m, i }))
    .sort((a, b) =>
      Number(claimable.has(b.m.id)) - Number(claimable.has(a.m.id))
      || (b.m.minTier ?? 0) - (a.m.minTier ?? 0)
      || a.i - b.i)
    .map((e) => e.m);
}
