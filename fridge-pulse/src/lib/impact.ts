import { addDays, daysBetween, todayISO } from './dates';
import type { PantryItem } from './types';

/** Running totals that outlive the 90-day item history, for milestones and the no-waste streak. */
export interface Lifetime {
  used: number;
  wasted: number;
  /** Used in the last three days before its date. */
  rescued: number;
  /** Day the person started tracking (first item added). */
  startedOn: string | null;
  /** Most recent day something was thrown out. */
  lastWastedOn: string | null;
}

export const NO_LIFETIME: Lifetime = { used: 0, wasted: 0, rescued: 0, startedOn: null, lastWastedOn: null };

/** A rescue: used before its date passed, within its last three days. */
export function isRescue(item: Pick<PantryItem, 'status' | 'resolvedOn' | 'expiresOn'>): boolean {
  if (item.status !== 'used' || !item.resolvedOn) return false;
  const spare = daysBetween(item.resolvedOn, item.expiresOn);
  return spare >= 0 && spare <= 3;
}

export const MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

export interface DayBar {
  /** YYYY-MM-DD */
  day: string;
  /** Short weekday label: "M", "T", ... */
  label: string;
  used: number;
  wasted: number;
}

export interface Impact {
  /** Rescues in the last 30 days. */
  rescuedRecently: number;
  usedRecently: number;
  wastedRecently: number;
  /** Whole days since food was last thrown out (or since tracking began). */
  streakDays: number;
  /** Today and the six days before, oldest first. */
  week: DayBar[];
  lifetimeRescued: number;
  /** The next rescue milestone, or null past the last one. */
  nextMilestone: number | null;
  /** The milestone most recently reached, or null before the first rescue. */
  lastMilestone: number | null;
}

/** Everything the impact card shows, from the item history and running totals. */
export function computeImpact(items: PantryItem[], lifetime: Lifetime, now: Date = new Date()): Impact {
  const today = todayISO(now);
  const since = addDays(today, -29);
  let rescuedRecently = 0;
  let usedRecently = 0;
  let wastedRecently = 0;
  const week: DayBar[] = [];
  for (let back = 6; back >= 0; back -= 1) {
    const day = addDays(today, -back);
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
    week.push({ day, label, used: 0, wasted: 0 });
  }
  for (const item of items) {
    if (item.status === 'active' || !item.resolvedOn) continue;
    if (item.resolvedOn >= since && item.resolvedOn <= today) {
      if (item.status === 'used') usedRecently += 1;
      else wastedRecently += 1;
      if (isRescue(item)) rescuedRecently += 1;
    }
    const bar = week.find((b) => b.day === item.resolvedOn);
    if (bar) bar[item.status === 'used' ? 'used' : 'wasted'] += 1;
  }
  const from = lifetime.lastWastedOn ?? lifetime.startedOn;
  const streakDays = from ? Math.max(0, daysBetween(from, today)) : 0;
  const lifetimeRescued = lifetime.rescued;
  const nextMilestone = MILESTONES.find((m) => m > lifetimeRescued) ?? null;
  const reached = MILESTONES.filter((m) => m <= lifetimeRescued);
  return {
    rescuedRecently,
    usedRecently,
    wastedRecently,
    streakDays,
    week,
    lifetimeRescued,
    nextMilestone,
    lastMilestone: reached.length ? reached[reached.length - 1]! : null,
  };
}
