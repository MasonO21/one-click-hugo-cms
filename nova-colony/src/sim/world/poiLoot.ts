/**
 * Tier-scaled loot for points of interest and region survey caches (data/survey.ts). Pure: same inputs and RNG state,
 * same haul. A haul is worth `minutes` of a reference colony's output at the colony's tier (the expedition value
 * model), spread over a few of the POI's themed goods, each valued at that tier and capped by storage.
 */
import type { DataRegistry } from '../../data';
import type { Reward } from '../../data/schema';
import type { Rng } from '../../core/rng';
import { MAX_TIER } from '../../core/constants';
import { LOOT_AHEAD_WEIGHT, LOOT_FRESH_PER_HOUR, LOOT_STORAGE_SHARE, LOOT_THIN_FLOOR, LOOT_THIN_STEP, LOOT_VARIANCE, POI_LOOT, type PoiLootDef } from '../../data/survey';
import { niceAmount, referenceValuePerHour, relevance, valueAt } from '../expedition/rules';

export interface LootContext {
  data: DataRegistry;
  /** Colony tier. */
  tier: number;
  /** Storage capacity per resource (a good never brings more than LOOT_STORAGE_SHARE of it; 0 = not storable yet). */
  capacity?: (id: string) => number;
}

function clampTier(data: DataRegistry, t: number): number {
  const rules = data.expeditionRules;
  return Math.max(0, Math.min(MAX_TIER, rules.reference.length - 1, Math.floor(t) || 0));
}

/** Value (wood-equivalents) of `minutes` of a reference colony's output at a tier. */
export function lootValue(data: DataRegistry, tier: number, minutes: number): number {
  return (referenceValuePerHour(data.expeditionRules, clampTier(data, tier)) * minutes) / 60;
}

/**
 * Weighted pool of goods a profile can hand out at a tier: outgrown goods fade, goods one tier ahead weigh half,
 * further ahead (or with no storage yet) never.
 */
export function lootPool(ctx: LootContext, yields: Record<string, number>): [string, number][] {
  const rules = ctx.data.expeditionRules;
  const t = clampTier(ctx.data, ctx.tier);
  const out: [string, number][] = [];
  for (const k of Object.keys(yields).sort()) {
    const w = yields[k] ?? 0;
    if (!(w > 0)) continue;
    if (k !== 'rp') {
      if (!ctx.data.resource(k)) continue;
      if (ctx.capacity && !(ctx.capacity(k) > 0)) continue;
    }
    const intro = rules.intro[k] ?? 0;
    if (intro > t + 1) continue;
    const weight = intro > t ? w * LOOT_AHEAD_WEIGHT : w * relevance(rules, t, k);
    if (weight > 0 && valueAt(rules, t, k) > 0) out.push([k, weight]);
  }
  return out;
}

/** Roll a themed haul worth `minutes` of colony output at the context's tier. */
export function rollGoods(ctx: LootContext, profile: Pick<PoiLootDef, 'minutes' | 'picks' | 'yields'>, rng: Rng): Reward {
  const rules = ctx.data.expeditionRules;
  const t = clampTier(ctx.data, ctx.tier);
  let pool = lootPool(ctx, profile.yields);
  if (!pool.length) pool = [['wood', 1]];
  const picked: [string, number][] = [];
  for (let i = 0; i < Math.max(1, profile.picks) && pool.length; i++) {
    const total = pool.reduce((s, [, w]) => s + w, 0);
    let r = rng.next() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      r -= pool[j][1];
      if (r < 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx]);
    pool = pool.filter((_, j) => j !== idx);
  }
  const value = lootValue(ctx.data, t, profile.minutes) * (1 + (rng.next() * 2 - 1) * LOOT_VARIANCE);
  const wsum = picked.reduce((s, [, w]) => s + w, 0) || 1;
  const out: Reward = {};
  const resources: Record<string, number> = {};
  for (const [k, w] of picked) {
    let n = niceAmount((value * (w / wsum)) / Math.max(1e-6, valueAt(rules, t, k)));
    if (k === 'rp') {
      out.rp = Math.max(1, n);
      continue;
    }
    const cap = ctx.capacity?.(k);
    if (cap != null && cap > 0) n = Math.min(n, Math.max(1, niceAmount(cap * LOOT_STORAGE_SHARE)));
    resources[k] = Math.max(1, n);
  }
  if (Object.keys(resources).length) out.resources = resources;
  return out;
}

/**
 * Share of a haul's goods after `recent` other points of interest were opened within the hour: full for the first
 * LOOT_FRESH_PER_HOUR, then thinning (0.8, 0.67, 0.57 … never below LOOT_THIN_FLOOR).
 */
export function lootThinning(recent: number): number {
  const extra = Math.max(0, Math.floor(recent) - LOOT_FRESH_PER_HOUR + 1);
  return extra <= 0 ? 1 : Math.max(LOOT_THIN_FLOOR, 1 / (1 + extra / LOOT_THIN_STEP));
}

/**
 * What a POI hands out at the colony's tier: its themed goods (POI_LOOT, times `mult`: see lootThinning) plus the
 * items, Nova, colonist and season XP of its own reward. POIs without a loot profile (beacons, world-event markers)
 * hand out their reward as it is.
 */
export function rollPoiLoot(ctx: LootContext, poiDef: string, rng: Rng, mult = 1): Reward {
  const def = ctx.data.poi(poiDef);
  const base = def?.reward ?? {};
  const profile = POI_LOOT[poiDef];
  if (!profile) return base;
  const goods = rollGoods(ctx, { ...profile, minutes: profile.minutes * Math.max(0, mult) }, rng);
  const out: Reward = { ...goods };
  if (base.items) out.items = { ...base.items };
  if (base.nova) out.nova = base.nova;
  if (base.colonist) out.colonist = base.colonist;
  if (base.xp) out.xp = base.xp;
  return out;
}

/** Profile of a POI kind (undefined: it hands out its fixed reward). */
export function poiLootDef(poiDef: string): PoiLootDef | undefined {
  return POI_LOOT[poiDef];
}
