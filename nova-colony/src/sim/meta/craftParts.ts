/**
 * Crafted-part chains: the items a recipe consumes that are crafted themselves (the Hover Bike's Robotic Core is made
 * at the Fabricator Bench from Machine Parts, which come from the Workshop). The tutorial's research focus and the
 * Craft panel's "needs Robotic Core → made at Fabricator Bench" line both walk the same chain from here.
 * Pure over data + the backpack.
 */
import type { DataRegistry } from '../../data';
import type { BuildingDef, RecipeDef } from '../../data/schema';

export interface PartStep {
  /** Item id of the part. */
  item: string;
  /** How many one craft of the parent recipe consumes, and how many are in the backpack. */
  need: number;
  have: number;
  /** The recipe that makes it. */
  recipe: RecipeDef;
  /** The building that offers the recipe's station (cheapest tier first), if any. */
  station: BuildingDef | undefined;
  /** 0 = consumed by the recipe asked about, 1 = by that part's recipe, ... */
  depth: number;
}

/** The recipe that crafts an item, if any. */
export function partRecipe(data: DataRegistry, item: string): RecipeDef | undefined {
  return data.recipes.find((r) => !!r.outputs.items?.[item]);
}

/** The building that offers a crafting station (the earliest one when several do: the Medical Bay before the Hospital). */
export function stationBuilding(data: DataRegistry, station: string): BuildingDef | undefined {
  let best: BuildingDef | undefined;
  for (const b of data.buildings) if (b.station === station && (!best || b.unlockTier < best.unlockTier)) best = b;
  return best;
}

/**
 * The crafted parts `recipe` consumes that the backpack does not hold enough of, depth first (each part, then the
 * parts its own recipe is missing). Parts already in the backpack end their branch.
 */
export function missingParts(data: DataRegistry, recipe: RecipeDef | undefined, items: Readonly<Record<string, number>>, depth = 0, out: PartStep[] = []): PartStep[] {
  if (!recipe || depth > 3) return out;
  for (const [item, need] of Object.entries(recipe.itemInputs ?? {})) {
    const have = items[item] ?? 0;
    if (have >= need) continue;
    const sub = partRecipe(data, item);
    if (!sub) continue;
    out.push({ item, need, have, recipe: sub, station: sub.station === 'hand' ? undefined : stationBuilding(data, sub.station), depth });
    missingParts(data, sub, items, depth + 1, out);
  }
  return out;
}
