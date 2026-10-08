/**
 * Side tab order and the collapsed side list. A late colony no longer scrolls past early leftovers ("Pest Patrol")
 * to find its Steel goals, and a tier-up that opens six chains at once does not bury the board in sixteen cards.
 */
import type { MissionDef } from '../../data/schema';

/** Side cards shown before "Show all side missions": every claimable one, filled up to this many in all. */
export const SIDE_CAP = 5;

/**
 * Side tab order: rewards waiting to be claimed first; then the goals closest to done (progress fraction, when
 * `frac` is given); then the newest tier; then board order.
 */
export function sideOrder(list: readonly MissionDef[], claimable: ReadonlySet<string>, frac?: (m: MissionDef) => number): MissionDef[] {
  const f = (m: MissionDef) => (frac ? Math.min(1, Math.max(0, frac(m) || 0)) : 0);
  return list
    .map((m, i) => ({ m, i, f: f(m) }))
    .sort((a, b) =>
      Number(claimable.has(b.m.id)) - Number(claimable.has(a.m.id))
      || b.f - a.f
      || (b.m.minTier ?? 0) - (a.m.minTier ?? 0)
      || a.i - b.i)
    .map((e) => e.m);
}

/**
 * The side cards to show. Expanded: all of `ordered`. Collapsed: every claimable card (they never count against the
 * cap; the cap grows to fit them), then the first non-claimable cards of `ordered` until `cap` cards show in all.
 * Keeps `ordered`'s order, so with sideOrder's list the collapsed cards are the top of the expanded one.
 * `hidden` is how many cards the collapsed list leaves out (the "N more" on the Show all button).
 */
export function sideVisible(ordered: readonly MissionDef[], claimable: ReadonlySet<string>, expanded: boolean, cap = SIDE_CAP): { shown: MissionDef[]; hidden: number } {
  const ready = ordered.filter((m) => claimable.has(m.id)).length;
  let room = Math.max(0, cap - ready);
  const collapsed: MissionDef[] = [];
  for (const m of ordered) {
    if (claimable.has(m.id)) collapsed.push(m);
    else if (room > 0) {
      collapsed.push(m);
      room--;
    }
  }
  const hidden = ordered.length - collapsed.length;
  return { shown: expanded ? [...ordered] : collapsed, hidden };
}
