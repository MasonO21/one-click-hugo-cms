import { addDays, atHour, daysBetween, todayISO } from './dates';
import { active, daysLeft } from './expiry';
import type { PantryItem } from './types';

export interface Digest {
  fireAt: Date;
  title: string;
  body: string;
  itemIds: string[];
}

export interface DigestOptions {
  /** Local hour of day (0-23) the reminder fires. */
  hour: number;
  /** How many days ahead to schedule. iOS caps pending local notifications at 64. */
  horizonDays?: number;
}

const MAX_NAMES = 3;

/**
 * One digest per day. On each day it lists active items that expire that day or
 * the next, so every item gets a "tomorrow" heads-up and a "today" nudge.
 */
export function buildDigests(
  items: PantryItem[],
  now: Date,
  { hour, horizonDays = 14 }: DigestOptions,
): Digest[] {
  const live = active(items);
  const today = todayISO(now);
  const digests: Digest[] = [];

  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const day = addDays(today, offset);
    const fireAt = atHour(day, hour);
    if (fireAt.getTime() <= now.getTime()) continue;

    const due = live
      .map((item) => ({ item, left: daysBetween(day, item.expiresOn) }))
      .filter(({ left }) => left === 0 || left === 1)
      .sort((a, b) => a.left - b.left || a.item.name.localeCompare(b.item.name));
    if (due.length === 0) continue;

    const shown = due.slice(0, MAX_NAMES).map(({ item, left }) => `${item.name} ${left === 0 ? 'today' : 'tomorrow'}`);
    const extra = due.length - shown.length;
    if (extra > 0) shown.push(`+${extra} more`);

    digests.push({
      fireAt,
      title: due.length === 1 ? '1 item needs using up' : `${due.length} items need using up`,
      body: `${shown.join(' · ')}. Tap for meal ideas.`,
      itemIds: due.map(({ item }) => item.id),
    });
  }
  return digests;
}

/** Items the user should look at right now (expired or expiring within 2 days). */
export function needsAttention(items: PantryItem[], now: Date = new Date()): PantryItem[] {
  return active(items).filter((i) => daysLeft(i, now) <= 2);
}
