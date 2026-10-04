import { daysBetween, todayISO } from './dates';
import type { PantryItem } from './types';

export type Urgency = 'expired' | 'today' | 'soon' | 'week' | 'ok';

export const URGENCY_ORDER: Urgency[] = ['expired', 'today', 'soon', 'week', 'ok'];

/** Days until the item expires; negative once it is past its date. */
export function daysLeft(item: Pick<PantryItem, 'expiresOn'>, now: Date = new Date()): number {
  return daysBetween(todayISO(now), item.expiresOn);
}

export function urgencyOf(days: number): Urgency {
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= 3) return 'soon';
  if (days <= 7) return 'week';
  return 'ok';
}

export function expiryLabel(days: number): string {
  if (days < -1) return `Expired ${-days} days ago`;
  if (days === -1) return 'Expired yesterday';
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Tomorrow';
  if (days < 14) return `In ${days} days`;
  if (days < 60) return `In ${Math.round(days / 7)} weeks`;
  if (days < 365) return `In ${Math.round(days / 30)} months`;
  return 'In over a year';
}

export function active(items: PantryItem[]): PantryItem[] {
  return items.filter((i) => i.status === 'active');
}

export function sortByExpiry(items: PantryItem[]): PantryItem[] {
  return [...items].sort((a, b) =>
    a.expiresOn === b.expiresOn ? a.name.localeCompare(b.name) : a.expiresOn < b.expiresOn ? -1 : 1,
  );
}

export interface PulseSummary {
  total: number;
  counts: Record<Urgency, number>;
}

export function summarize(items: PantryItem[], now: Date = new Date()): PulseSummary {
  const counts: Record<Urgency, number> = { expired: 0, today: 0, soon: 0, week: 0, ok: 0 };
  const live = active(items);
  for (const item of live) counts[urgencyOf(daysLeft(item, now))] += 1;
  return { total: live.length, counts };
}

/**
 * Freshness score: the share of tracked food with more than 3 days left, 0 to 100. Null when
 * nothing is tracked. Simple on purpose, so the number is easy to explain on screen.
 */
export function freshnessScore(summary: PulseSummary): number | null {
  if (summary.total === 0) return null;
  return Math.round(((summary.counts.week + summary.counts.ok) / summary.total) * 100);
}

/** A few words for a score. */
export function freshnessWord(score: number): string {
  if (score >= 80) return 'Looking fresh';
  if (score >= 50) return 'Some need using';
  if (score >= 25) return 'Time to cook';
  return 'Use it or lose it';
}

export interface WasteStats {
  used: number;
  wasted: number;
  /** Items used up while they were about to expire (within 3 days of the date). */
  rescued: number;
}

/** Stats for items resolved on/after `sinceISO` (YYYY-MM-DD). */
export function wasteStats(items: PantryItem[], sinceISO: string): WasteStats {
  let used = 0;
  let wasted = 0;
  let rescued = 0;
  for (const item of items) {
    if (item.status === 'active' || !item.resolvedOn || item.resolvedOn < sinceISO) continue;
    if (item.status === 'wasted') {
      wasted += 1;
      continue;
    }
    used += 1;
    // Used in its last three days, and not after its date had passed.
    const spare = daysBetween(item.resolvedOn, item.expiresOn);
    if (spare >= 0 && spare <= 3) rescued += 1;
  }
  return { used, wasted, rescued };
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
