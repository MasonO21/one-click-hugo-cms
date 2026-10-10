/**
 * Craft panel helpers: the stations the colony has not built yet (locked tabs: "Build a Crafting Table · 5 recipes")
 * and the crafted-part chain a recipe needs ("Needs Robotic Core → made at Fabricator Bench"). Pure over game state
 * and data (the same part walk as the tutorial's research focus, sim/meta/craftParts).
 */
import type { Game } from '../../core/Game';
import type { BuildingDef, RecipeDef } from '../../data/schema';
import { missingParts, stationBuilding } from '../../sim/meta/craftParts';

export interface LockedStation {
  station: string;
  /** The building that offers it (the earliest one). */
  def: BuildingDef;
  /** Recipes it will offer at the colony's tier (research-gated ones included). */
  recipes: number;
  /** The building can be placed now (else it still needs research). */
  buildable: boolean;
  /** Research to start for it when it is not buildable yet (the next open step), if any. */
  research: string | null;
}

/** Tab id of a locked station. */
export const LOCKED_PREFIX = 'lock:';

/**
 * Crafting stations the colony could have at its tier but has not built (none built and working): the Craft panel
 * lists them as locked tabs so the player learns they exist and what they make.
 */
export function lockedStations(game: Game, built: readonly string[]): LockedStation[] {
  const { data } = game;
  const tier = game.state.colony.tier;
  const out: LockedStation[] = [];
  const seen = new Set<string>(built);
  for (const b of data.buildings) {
    const st = b.station;
    if (!st || seen.has(st)) continue;
    seen.add(st);
    const def = stationBuilding(data, st);
    if (!def || def.unlockTier > tier) continue;
    const recipes = data.recipes.filter((r) => r.station === st && r.unlockTier <= tier).length;
    if (!recipes) continue;
    const buildable = game.sys.buildings.isUnlocked(def.id);
    out.push({ station: st, def, recipes, buildable, research: buildable || !def.research ? null : game.sys.research.nextStep(def.research) });
  }
  // what can be built now first, then the busiest stations (the Crafting Table before the Campfire)
  return out.sort((a, b) => Number(b.buildable) - Number(a.buildable) || a.def.unlockTier - b.def.unlockTier || b.recipes - a.recipes);
}

/**
 * "Needs Robotic Core → made at Fabricator Bench · Machine Parts → made at Workshop" for a recipe whose crafted parts
 * are not in the backpack yet (null when nothing is missing). A station that is not built, or a part recipe that still
 * needs research, says so.
 */
export function partChainText(game: Game, recipe: RecipeDef, built: readonly string[]): string | null {
  const { data, state } = game;
  const steps = missingParts(data, recipe, state.player.items);
  if (!steps.length) return null;
  const parts = steps.map((s) => {
    const name = data.item(s.item)?.name ?? s.item;
    const where = s.recipe.station === 'hand' ? 'made by hand' : `made at ${s.station?.name ?? game.sys.crafting.stationName(s.recipe.station)}`;
    let note = '';
    if (!game.sys.crafting.isUnlocked(s.recipe)) {
      const r = s.recipe.research ? data.researchDef(s.recipe.research)?.name : null;
      note = r ? ` (research ${r})` : ` (${data.tier(s.recipe.unlockTier).name} tier)`;
    } else if (s.recipe.station !== 'hand' && !built.includes(s.recipe.station)) note = ' (not built yet)';
    return `${name} → ${where}${note}`;
  });
  return `Needs ${parts.join(' · ')}`;
}

