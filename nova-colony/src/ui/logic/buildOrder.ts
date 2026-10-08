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
 *   2. Then every card that can be built now, newest tier first. A phone shows about three cards above the fold, so
 *      they must be things the player can tap and place: a Nano colony sees its newest buildable turrets, not a row
 *      of padlocks, and the Wood-tier cards close this run.
 *   3. Then the cards of reached tiers still behind research, newest tier first (one research away; tapping one
 *      opens that research).
 *   4. Then the cards of tiers not reached yet, nearest tier first: a preview at the end, never in the way.
 *   Same-tier cards keep definition order in every group.
 * - Structure pieces keep definition order inside each group (floor, wall, door… first): their material comes from
 *   the tier picker, so a newer piece is not a better one, and the basics are what every tier builds most.
 *
 * `unlocked` says whether a card can be built now (its tier is reached and its research is done).
 */
export function buildCardOrder<T extends BuildOrderDef>(defs: readonly T[], colonyTier: number, unlocked: (d: T) => boolean, pinned?: string | null): T[] {
  if (colonyTier <= 0) return [...defs.filter((d) => unlocked(d)), ...defs.filter((d) => !unlocked(d))];
  const key = (d: T, i: number): number[] => {
    // 0 buildable now, 1 behind research in a reached tier, 2 a tier not reached yet
    const group = unlocked(d) ? 0 : d.unlockTier > colonyTier ? 2 : 1;
    return [
      d.id === pinned ? 0 : 1,
      group,
      // reached tiers: newest first (pieces all rank alike); tiers not reached yet: nearest first
      group === 2 ? d.unlockTier : d.piece ? 0 : -d.unlockTier,
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
