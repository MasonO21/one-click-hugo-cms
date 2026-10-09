/**
 * Paid random items (loot caches) by region. Belgium treats paid loot boxes as gambling, so where the store's country
 * is restricted, nothing random is sold for money: bundles holding caches are hidden and refused, the paid season
 * track hands out a cache's Nova value instead of the cache, and caches can't be bought with Nova. Caches earned by
 * playing (daily gift, free season track, events) are unaffected. See docs/MOBILE.md §9.
 */
import type { DataRegistry } from '../../data';
import type { ProductDef, Reward } from '../../data/schema';

/** Store countries (ISO 3166-1 alpha-2 and alpha-3) where paid random items are not offered. */
export const PAID_RANDOM_RESTRICTED: readonly string[] = ['BE', 'BEL'];

export function regionRestrictsPaidRandom(country: string | null | undefined): boolean {
  return !!country && PAID_RANDOM_RESTRICTED.includes(country.trim().toUpperCase());
}

/** Does this reward hold a loot cache (an item that rolls random contents)? */
export function rewardHasRandomItems(data: DataRegistry, r: Reward | null | undefined): boolean {
  for (const id of Object.keys(r?.items ?? {})) if (data.item(id)?.use?.chest) return true;
  return false;
}

export function productHasRandomItems(data: DataRegistry, p: ProductDef): boolean {
  return rewardHasRandomItems(data, p.grants);
}

/** The same reward with every cache swapped for half its Nova price in Nova (fixed, not random). */
export function withoutRandomItems(data: DataRegistry, r: Reward): Reward {
  if (!rewardHasRandomItems(data, r)) return r;
  const items: Record<string, number> = {};
  let nova = r.nova ?? 0;
  for (const [id, n] of Object.entries(r.items ?? {})) {
    const chest = data.item(id)?.use?.chest;
    if (chest) nova += Math.round((data.chest(chest)?.nova ?? 0) * 0.5) * (n ?? 0);
    else items[id] = n ?? 0;
  }
  const out: Reward = { ...r, nova };
  if (Object.keys(items).length) out.items = items;
  else delete out.items;
  return out;
}
