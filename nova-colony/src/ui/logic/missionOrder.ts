/**
 * Side tab order, the collapsed side list and the session's NEW marks. A late colony no longer scrolls past early
 * leftovers ("Pest Patrol") to find its Steel goals, a tier-up that opens six chains at once does not bury the board
 * in sixteen cards, and the chains it opens are not hidden behind "Show all" either.
 */
import type { MissionDef } from '../../data/schema';

/** Side cards shown before "Show all side missions": every claimable or NEW one, filled up to this many in all. */
export const SIDE_CAP = 5;

/**
 * Side tab order: rewards waiting to be claimed first; then NEW cards (`fresh`: offered this session, not seen
 * yet); then the goals closest to done (progress fraction, when `frac` is given); then the newest tier; then board
 * order.
 */
export function sideOrder(list: readonly MissionDef[], claimable: ReadonlySet<string>, frac?: (m: MissionDef) => number, fresh: ReadonlySet<string> = new Set()): MissionDef[] {
  const f = (m: MissionDef) => (frac ? Math.min(1, Math.max(0, frac(m) || 0)) : 0);
  return list
    .map((m, i) => ({ m, i, f: f(m) }))
    .sort((a, b) =>
      Number(claimable.has(b.m.id)) - Number(claimable.has(a.m.id))
      || Number(fresh.has(b.m.id)) - Number(fresh.has(a.m.id))
      || b.f - a.f
      || (b.m.minTier ?? 0) - (a.m.minTier ?? 0)
      || a.i - b.i)
    .map((e) => e.m);
}

/**
 * The side cards to show. Expanded: all of `ordered`. Collapsed: every card in `always` (the claimable and NEW
 * ones: they never count against the cap, the cap grows to fit them), then the first other cards of `ordered` until
 * `cap` cards show in all. Keeps `ordered`'s order, so with sideOrder's list the collapsed cards are the top of the
 * expanded one. `hidden` is how many cards the collapsed list leaves out (the "N more" on the Show all button).
 */
export function sideVisible(ordered: readonly MissionDef[], always: ReadonlySet<string>, expanded: boolean, cap = SIDE_CAP): { shown: MissionDef[]; hidden: number } {
  const kept = ordered.filter((m) => always.has(m.id)).length;
  let room = Math.max(0, cap - kept);
  const collapsed: MissionDef[] = [];
  for (const m of ordered) {
    if (always.has(m.id)) collapsed.push(m);
    else if (room > 0) {
      collapsed.push(m);
      room--;
    }
  }
  const hidden = ordered.length - collapsed.length;
  return { shown: expanded ? [...ordered] : collapsed, hidden };
}

/**
 * Which side cards read NEW, for this session only (nothing is saved). A card is NEW when it was offered during the
 * session (`offered`: the mission system leaves out everything already on the board at launch, so nothing is NEW at
 * boot) and the player has not seen it yet. It stays NEW for the whole visit that first shows it, so the chip is
 * there to read, and turns seen when that visit ends (the player leaves the Side tab or closes the panel).
 */
export class SideSeen {
  private readonly seen = new Set<string>();
  private readonly visit = new Set<string>();

  /** The NEW ones among `ids`. */
  fresh(ids: Iterable<string>, offered: ReadonlySet<string>): Set<string> {
    const out = new Set<string>();
    for (const id of ids) if (offered.has(id) && !this.seen.has(id)) out.add(id);
    return out;
  }

  /** The Side tab is showing these NEW cards. */
  showing(ids: Iterable<string>): void {
    for (const id of ids) this.visit.add(id);
  }

  /** The visit is over (left the Side tab, closed the panel): what it showed is seen now. */
  endVisit(): void {
    for (const id of this.visit) this.seen.add(id);
    this.visit.clear();
  }
}
