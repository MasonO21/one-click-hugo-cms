/**
 * Build drawer card order within one category tab. A late colony opened Defense on the Wooden Barricade and had
 * to scroll past twenty old cards to reach its current-tier turrets; this puts what matters now on top.
 */
import type { BuildingDef } from '../../data/schema';

export type BuildOrderDef = Pick<BuildingDef, 'id' | 'unlockTier' | 'piece'>;

/**
 * Card order for one Build tab. `defs` come in definition order (each category's data lists the oldest tier first).
 *
 * - Colony tier 0 (only one tier unlocked, the first session): unchanged. Buildable cards in definition order, then
 *   the locked ones in definition order, and nothing is pinned, so the tutorial's first builds sit where they
 *   always did.
 * - Later tiers:
 *   1. `pinned` (the card the main mission / guide hand points at) goes first when it is in this tab, locked or not:
 *      a locked one opens the research it needs.
 *   2. Then the reached tiers, newest first. Within a tier the buildable cards come first, then the ones still
 *      behind research (one research away; tapping one opens that research), each in definition order. So a Nano
 *      colony sees its Nano turrets (researched or not) before the Advanced Alloy ones, and the Wooden Barricade last.
 *   3. Then the cards of tiers not reached yet, nearest tier first: a preview at the end, never in the way.
 * - Structure pieces stay in definition order (floor, wall, door… first), buildable before research-locked: their
 *   material comes from the tier picker, so a newer piece is not a better one, and the basics are what every tier
 *   builds most.
 *
 * `unlocked` says whether a card can be built now (its tier is reached and its research is done).
 */
export function buildCardOrder<T extends BuildOrderDef>(defs: readonly T[], colonyTier: number, unlocked: (d: T) => boolean, pinned?: string | null): T[] {
  if (colonyTier <= 0) return [...defs.filter((d) => unlocked(d)), ...defs.filter((d) => !unlocked(d))];
  const key = (d: T, i: number): number[] => {
    const future = d.unlockTier > colonyTier;
    return [
      d.id === pinned ? 0 : 1,
      future ? 1 : 0,
      // reached: newest tier first (pieces all rank alike); not reached: nearest tier first
      future ? d.unlockTier : d.piece ? 0 : -d.unlockTier,
      unlocked(d) ? 0 : 1,
      i,
    ];
  };
  return defs
    .map((d, i) => ({ d, k: key(d, i) }))
    .sort((a, b) => {
      for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
      return 0;
    })
    .map((e) => e.d);
}
