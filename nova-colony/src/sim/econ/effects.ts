/**
 * Cached, allocation-free views of building/recipe effects used by the economy and crafting systems.
 * Content defs are immutable at runtime, so entries are computed once per def (WeakMap-keyed).
 */
import type { BuildingDef, RecipeDef, ResourceBag } from '../../data/schema';
import { bagEntries } from '../../core/bag';
import { CELL, cellMin } from '../../core/constants';
import type { BuildingInstance } from '../../core/state';

export type Entries = [string, number][];

export interface DefEffects {
  produces: Entries;
  consumes: Entries;
  storage: Entries;
}

export interface RecipeFlows {
  /** Resource inputs per minute at speed 1 (one cycle every `recipe.time` seconds). */
  ins: Entries;
  /** Resource outputs per minute at speed 1. */
  outs: Entries;
}

const defCache = new WeakMap<BuildingDef, DefEffects>();
const recipeCache = new WeakMap<RecipeDef, RecipeFlows>();

function entries(bag: ResourceBag | undefined): Entries {
  return bagEntries(bag).filter(([, n]) => n > 0);
}

export function defEffects(def: BuildingDef): DefEffects {
  let fx = defCache.get(def);
  if (!fx) {
    fx = { produces: entries(def.produces), consumes: entries(def.consumes), storage: entries(def.storage) };
    defCache.set(def, fx);
  }
  return fx;
}

export function recipeFlows(recipe: RecipeDef): RecipeFlows {
  let f = recipeCache.get(recipe);
  if (!f) {
    const perMin = recipe.time > 0 ? 60 / recipe.time : 0;
    f = {
      ins: entries(recipe.inputs).map(([r, n]) => [r, n * perMin]),
      outs: entries(recipe.outputs.resources).map(([r, n]) => [r, n * perMin]),
    };
    recipeCache.set(recipe, f);
  }
  return f;
}

/**
 * Level effect multiplier applied to a facility's numeric effects:
 * `1 + (level - 1) × (def.levelEffect ?? 0.5)` (L2 = 150%, L3 = 200% by default).
 */
export function levelMult(def: BuildingDef, level: number): number {
  return 1 + Math.max(0, (level || 1) - 1) * (def.levelEffect ?? 0.5);
}

/**
 * Factory cycle speed (1 = one cycle per `recipe.time` seconds). Shared by CraftingSystem (online
 * cycles) and EconomySystem (rate display + offline mirror) so both always agree.
 */
export function factorySpeed(opEff: number, lm: number, craftSpeedMod: number, productionMod: number): number {
  return Math.max(0, opEff * lm * craftSpeedMod * productionMod);
}

/** World-space footprint center (same as BuildingSystem.center) without allocating arrays. */
export function centerX(b: BuildingInstance, def: BuildingDef): number {
  const w = b.rot % 2 === 1 ? def.size[1] : def.size[0];
  return cellMin(b.x) + (w * CELL) / 2;
}

export function centerZ(b: BuildingInstance, def: BuildingDef): number {
  const h = b.rot % 2 === 1 ? def.size[0] : def.size[1];
  return cellMin(b.z) + (h * CELL) / 2;
}
