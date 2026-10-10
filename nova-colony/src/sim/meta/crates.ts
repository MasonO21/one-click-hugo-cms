/**
 * Fixed-content crates (Supply Crate, Mystery Crate, the Tech / Alloy / Nano / Titanium crates, reward bundles) grow
 * with the colony: a crate earned at a later tier than its own brings its resources times
 * crateScale(colony tier) / crateScale(crate tier), the same 1 + 1.2 x tier curve as the free crate (meta/util
 * crateReward). A mid-game Supply Crate is no longer "+60 wood into 11.4K".
 *
 * Bundles the player ties at a station (a Timber Bundle from 100 wood, a Rations Crate, a Defense Crate…) keep their
 * recipe's contents, or crafting them would make resources from nothing: the colony counts the crates it crafted
 * (state.crafting.madeCrates) and those open at their base contents.
 *
 * A crate whose resources are each under SMALL_CRATE_SHARE of their storage opens with a toast instead of the
 * full-screen crate scene (sim/chests openCrate). Nova caches always keep their scene.
 */
import type { Game } from '../../core/Game';
import type { DataRegistry } from '../../data';
import type { Reward } from '../../data/schema';
import { bagEntries } from '../../core/bag';
import { niceAmount } from '../expedition/rules';

declare module '../../core/state' {
  interface CraftingState {
    /** Crate items crafted by the colony and not opened yet (they open at their base contents). */
    madeCrates?: Record<string, number>;
  }
}

/** Crate size by tier: the free crate's curve (meta/util crateReward). */
export function crateScale(tier: number): number {
  return 1 + 1.2 * Math.max(0, tier);
}

/** A crate whose resources are each under this share of their storage opens with a toast. */
export const SMALL_CRATE_SHARE = 0.02;

/** The crate item is the output of a recipe (a bundle the player ties). */
export function craftableCrate(data: DataRegistry, item: string): boolean {
  return data.recipes.some((r) => !!r.outputs.items?.[item]);
}

/**
 * A crate's contents at the colony tier: resources (and season XP) times crateScale(tier) / crateScale(crate tier),
 * never below the base. Items, Nova, colonists and everything else stay as they are.
 */
export function tierCrateReward(data: DataRegistry, item: string, base: Reward, tier: number): Reward {
  const def = data.item(item);
  const k = crateScale(tier) / crateScale(def?.tier ?? 0);
  if (!(k > 1.001)) return base;
  const out: Reward = { ...base };
  if (base.resources) {
    const res: Record<string, number> = {};
    for (const [id, n] of bagEntries(base.resources)) res[id] = Math.max(n, niceAmount(n * k));
    out.resources = res;
  }
  if (base.xp) out.xp = Math.max(base.xp, Math.round(base.xp * k));
  return out;
}

/**
 * What a crate opened now brings: a crafted one its base contents (and one fewer is counted as crafted), any other
 * the tier-scaled contents.
 */
export function crateContents(game: Game, item: string, base: Reward): Reward {
  const made = game.state.crafting.madeCrates;
  if (made && (made[item] ?? 0) > 0) {
    made[item]--;
    if (made[item] <= 0) delete made[item];
    return base;
  }
  return tierCrateReward(game.data, item, base, game.state.colony.tier);
}

/**
 * Resources only (plus Nova, XP, research points or plain items), each under SMALL_CRATE_SHARE of `storage` (the
 * capacity, or the amount held when rewards filled past it): a toast will do.
 */
export function isSmallCrate(reward: Reward, storage: (id: string) => number): boolean {
  if (reward.colonist || reward.cosmetic || reward.cosmetics?.length || reward.vehicle || reward.boost) return false;
  const res = bagEntries(reward.resources);
  if (!res.length) return false;
  for (const [id, n] of res) {
    const cap = storage(id);
    if (!(cap > 0) || n > cap * SMALL_CRATE_SHARE) return false;
  }
  return true;
}

/**
 * Count the crate items the colony crafts (hand queue and factories), and give a save from before the count one:
 * the craftable crates already in the backpack are treated as crafted (they open at their base contents).
 */
export function installCrateTracking(game: Game): void {
  game.bus.on('craft:completed', (e) => {
    const r = game.data.recipe(e.recipe);
    for (const [id, n] of Object.entries(r?.outputs.items ?? {})) {
      if (!(n > 0) || game.data.item(id)?.category !== 'crate') continue;
      const made = (game.state.crafting.madeCrates ??= {});
      made[id] = (made[id] ?? 0) + n;
    }
  });
}

export function normalizeCrateSave(game: Game): void {
  const cs = game.state.crafting;
  if (cs.madeCrates) return;
  const made: Record<string, number> = {};
  for (const [id, n] of Object.entries(game.state.player.items)) {
    if (n > 0 && game.data.item(id)?.category === 'crate' && craftableCrate(game.data, id)) made[id] = n;
  }
  cs.madeCrates = made;
}
