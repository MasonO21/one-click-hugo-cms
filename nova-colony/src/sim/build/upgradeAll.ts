/**
 * "Upgrade all": level every building of one kind up one step in a single tap (the levelling counterpart of the
 * pieces' "upgrade entire room" / massTierUp). The audit counted level-up taps as the biggest share of a session's
 * taps: twelve Logging Camps meant twelve inspectors.
 *
 * Every building that can be levelled (not at max level, not under construction) is a candidate, lowest level first.
 * When the whole bill is not affordable the plan takes as many as the resources cover, in that order. Each upgrade
 * goes through BuildingSystem.levelUp, so costs, invested totals, events, floats and mission credit are exactly those
 * of single upgrades.
 */
import type { Game } from '../../core/Game';
import type { Id } from '../../core/state';
import type { ResourceBag } from '../../data/schema';
import { bagAdd, bagCovers, bagEntries } from '../../core/bag';

export interface UpgradeAllPlan {
  /** Every building of the kind that can be levelled, lowest level first. */
  ids: Id[];
  /** Cost of levelling all of them one step. */
  total: ResourceBag;
  /** The ones the current resources cover, in order, and what they cost together. */
  affordable: Id[];
  affordableTotal: ResourceBag;
}

export function upgradeAllPlan(game: Game, def: string): UpgradeAllPlan {
  const bs = game.sys.buildings;
  const d = game.data.building(def);
  const out: UpgradeAllPlan = { ids: [], total: {}, affordable: [], affordableTotal: {} };
  if (!d || d.piece || d.core || d.maxLevel <= 1) return out;
  const cands: { id: Id; level: number; cost: ResourceBag }[] = [];
  for (const b of game.state.buildings.list) {
    if (b.def !== def || b.status === 'building') continue;
    const cost = bs.levelUpCost(b.id);
    if (cost) cands.push({ id: b.id, level: b.level, cost });
  }
  cands.sort((a, b) => a.level - b.level || a.id - b.id);
  const budget: Record<string, number> = { ...game.state.resources.amounts };
  for (const c of cands) {
    out.ids.push(c.id);
    out.total = bagAdd(out.total, c.cost);
    if (!bagCovers(budget, c.cost)) continue;
    for (const [k, v] of bagEntries(c.cost)) budget[k] = (budget[k] ?? 0) - v;
    out.affordable.push(c.id);
    out.affordableTotal = bagAdd(out.affordableTotal, c.cost);
  }
  return out;
}

/** Level up every affordable building of the kind one step (lowest level first). Returns how many were levelled. */
export function upgradeAll(game: Game, def: string): number {
  const plan = upgradeAllPlan(game, def);
  let n = 0;
  for (const id of plan.affordable) if (game.sys.buildings.levelUp(id)) n++;
  return n;
}
