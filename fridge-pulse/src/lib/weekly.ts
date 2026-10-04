import type { DayActivity } from '../health/types';
import { dayTotals, lastDays, type LogEntry } from './foodLog';
import type { PantryItem } from './types';

/**
 * The weekly score: the last seven days of food rescued rather than thrown out, days the protein goal
 * was met, and active days. Each part counts only when there is something to count, so someone who
 * does not track protein is not marked down for it. It never judges what someone eats.
 */

/** A day counts as active with this many steps, or a workout of at least ACTIVE_MINUTES. */
export const ACTIVE_STEPS = 7000;
export const ACTIVE_MINUTES = 20;
/** Five active days a week is the goal (about 150 minutes of activity, as WHO advises). */
export const ACTIVE_DAYS_GOAL = 5;
/** A day meets the protein goal at 90% of it. */
export const PROTEIN_HIT = 0.9;

export interface ScorePart {
  key: 'food' | 'protein' | 'active';
  label: string;
  /** 0 to 1, or null when there is nothing to score yet. */
  ratio: number | null;
  /** "12 used, 2 thrown out". */
  detail: string;
  /** What to do to start counting it, when ratio is null. */
  hint: string | null;
}

export interface WeeklyScore {
  /** 0-100, or null when no part can be scored. */
  score: number | null;
  parts: ScorePart[];
  message: string;
}

export function isActiveDay(d: Pick<DayActivity, 'steps' | 'workoutMinutes'>): boolean {
  return d.steps >= ACTIVE_STEPS || d.workoutMinutes >= ACTIVE_MINUTES;
}

export function weeklyScore(input: {
  items: PantryItem[];
  log: LogEntry[];
  /** Grams a day, when the person set a goal. */
  proteinTarget: number | null;
  /** The last seven days from the health app, when connected. */
  activity: DayActivity[] | null;
  today: string;
}): WeeklyScore {
  const days = lastDays(7, input.today);
  const week = new Set(days);

  let used = 0;
  let wasted = 0;
  for (const i of input.items) {
    if (i.status === 'active' || !i.resolvedOn || !week.has(i.resolvedOn)) continue;
    if (i.status === 'used') used += 1;
    else wasted += 1;
  }
  const food: ScorePart = {
    key: 'food',
    label: 'Food used, not wasted',
    ratio: used + wasted > 0 ? used / (used + wasted) : null,
    detail: `${used} used, ${wasted} thrown out`,
    hint: used + wasted > 0 ? null : 'Mark food used or thrown out to count this.',
  };

  let protein: ScorePart;
  if (input.proteinTarget && input.proteinTarget > 0) {
    const hit = days.filter((d) => dayTotals(input.log, d).protein >= input.proteinTarget! * PROTEIN_HIT).length;
    const logged = days.filter((d) => dayTotals(input.log, d).entries > 0).length;
    protein = {
      key: 'protein',
      label: 'Protein goal met',
      ratio: logged > 0 ? hit / 7 : null,
      detail: `${hit} of 7 days`,
      hint: logged > 0 ? null : 'Log what you eat to count this.',
    };
  } else {
    protein = { key: 'protein', label: 'Protein goal met', ratio: null, detail: 'No goal set', hint: 'Set a protein goal to count this.' };
  }

  let active: ScorePart;
  if (input.activity && input.activity.length > 0) {
    const n = input.activity.filter((d) => week.has(d.day) && isActiveDay(d)).length;
    active = { key: 'active', label: 'Active days', ratio: Math.min(1, n / ACTIVE_DAYS_GOAL), detail: `${n} of ${ACTIVE_DAYS_GOAL}`, hint: null };
  } else {
    active = { key: 'active', label: 'Active days', ratio: null, detail: 'Not connected', hint: 'Connect a health app to count this.' };
  }

  const parts = [food, protein, active];
  const scored = parts.filter((p) => p.ratio !== null);
  const score = scored.length > 0 ? Math.round((scored.reduce((s, p) => s + p.ratio!, 0) / scored.length) * 100) : null;
  const message =
    score === null
      ? 'Your score starts once there is something to count.'
      : score >= 85
        ? 'A brilliant week. Keep it going.'
        : score >= 60
          ? 'A good week, with room to grow.'
          : score >= 30
            ? 'Every rescued meal and walk counts.'
            : 'A fresh week starts every day.';
  return { score, parts, message };
}
