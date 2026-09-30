import { normalizeName } from './expiry';
import type { Category, PantryItem } from './types';

export interface BuyAgain {
  name: string;
  category: Category;
  /** How often it was used up or thrown out recently. */
  times: number;
}

/**
 * Foods finished recently that are not in the fridge any more and not already on the list, most
 * often bought first. The obvious things to buy again.
 */
export function buyAgain(items: PantryItem[], onList: string[], sinceISO: string, limit = 8): BuyAgain[] {
  const stocked = new Set(items.filter((i) => i.status === 'active').map((i) => normalizeName(i.name)));
  const listed = new Set(onList.map(normalizeName));
  const seen = new Map<string, BuyAgain & { last: string }>();
  for (const item of items) {
    if (item.status === 'active' || !item.resolvedOn || item.resolvedOn < sinceISO) continue;
    const key = normalizeName(item.name);
    if (!key || stocked.has(key) || listed.has(key)) continue;
    const prev = seen.get(key);
    if (prev) {
      prev.times += 1;
      if (item.resolvedOn > prev.last) prev.last = item.resolvedOn;
    } else seen.set(key, { name: item.name.trim(), category: item.category, times: 1, last: item.resolvedOn });
  }
  return [...seen.values()]
    .sort((a, b) => b.times - a.times || b.last.localeCompare(a.last) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ name, category, times }) => ({ name, category, times }));
}

/** The list as plain text, for sharing with whoever does the shop. */
export function shoppingText(names: string[]): string {
  return ['Shopping list', ...names.map((n) => `• ${n}`)].join('\n');
}
