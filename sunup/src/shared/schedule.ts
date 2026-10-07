import type { Alert, CheckIn, Schedule, User } from './types';
import { HOUR, addDays, dayOfWeek, isTime, localParts, minutesOf, zonedToUtc } from './time';

/** A check-in this long before a window opens still counts for it. */
export const EARLY_MS = 2 * HOUR;
/** A window is only enforced if the schedule was in place this long before its deadline. */
export const NOTICE_MS = HOUR;

export interface SlotInstance {
  /** `${date}@${deadline}`, unique per user. */
  key: string;
  date: string;
  start: string;
  deadline: string;
  openAt: number;
  /** Earliest check-in that counts for this window. */
  acceptFrom: number;
  deadlineAt: number;
}

export type SlotStatus = 'upcoming' | 'open' | 'done' | 'missed' | 'late' | 'paused' | 'untracked';

/** Every window between `fromDate` and `toDate` (inclusive, local dates), in order. */
export function slotsBetween(user: User, fromDate: string, toDate: string): SlotInstance[] {
  const out: SlotInstance[] = [];
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    if (!user.schedule.days.includes(dayOfWeek(date))) continue;
    for (const slot of user.schedule.slots) {
      const openAt = zonedToUtc(date, slot.start, user.timezone);
      out.push({
        key: `${date}@${slot.deadline}`,
        date,
        start: slot.start,
        deadline: slot.deadline,
        openAt,
        acceptFrom: openAt - EARLY_MS,
        deadlineAt: zonedToUtc(date, slot.deadline, user.timezone),
      });
    }
  }
  out.sort((a, b) => a.deadlineAt - b.deadlineAt);
  // A check-in can only count for one window.
  for (let i = 1; i < out.length; i++) {
    out[i].acceptFrom = Math.max(out[i].acceptFrom, out[i - 1].deadlineAt);
  }
  return out;
}

/** Yesterday's, today's and tomorrow's windows in the user's zone. */
export function slotsAround(user: User, now: number): SlotInstance[] {
  const today = localParts(now, user.timezone).date;
  return slotsBetween(user, addDays(today, -1), addDays(today, 1));
}

export function checkInFor(slot: SlotInstance, checkIns: CheckIn[]): CheckIn | undefined {
  return checkIns.find((c) => c.at >= slot.acceptFrom && c.at <= slot.deadlineAt);
}

export function isPaused(user: User, at: number): boolean {
  const within = (p: { from: number; until: number }) => p.from <= at && at <= p.until;
  return (!!user.pause && within(user.pause)) || !!user.pastPauses?.some(within);
}

export function isEnforced(user: User, slot: SlotInstance): boolean {
  return user.onboarded && slot.deadlineAt - user.scheduleSince >= NOTICE_MS && !isPaused(user, slot.deadlineAt);
}

export function slotStatus(
  user: User,
  slot: SlotInstance,
  checkIns: CheckIn[],
  alerts: Alert[],
  now: number,
): SlotStatus {
  if (checkInFor(slot, checkIns)) return 'done';
  if (isPaused(user, slot.deadlineAt)) return 'paused';
  if (now < slot.acceptFrom) return 'upcoming';
  if (now <= slot.deadlineAt) return 'open';
  if (!isEnforced(user, slot)) return 'untracked';
  const alert = alerts.find((a) => a.kind === 'missed' && a.slotKey === slot.key);
  return alert?.resolvedAt ? 'late' : 'missed';
}

/**
 * Consecutive days the user checked in without a missed window. Today counts once done.
 * Days up to `user.streakFloor.date` come from the saved floor, since their check-ins get pruned.
 */
export function streak(user: User, checkIns: CheckIn[], alerts: Alert[], now: number): number {
  const today = localParts(now, user.timezone).date;
  const firstDay = localParts(user.createdAt, user.timezone).date;
  const floor = user.streakFloor && user.streakFloor.date < today ? user.streakFloor : undefined;
  const mine = checkIns.filter((c) => c.userId === user.id);
  const daysWithCheckIn = new Set(mine.map((c) => localParts(c.at, user.timezone).date));
  let count = 0;
  for (let i = 0, date = today; i < 366 && date >= firstDay; i++, date = addDays(date, -1)) {
    if (floor && date === floor.date) return count + floor.count;
    const slots = slotsBetween(user, date, date);
    if (slots.length === 0) continue;
    const statuses = slots.map((s) => slotStatus(user, s, mine, alerts, now));
    if (statuses.some((s) => s === 'missed' || s === 'late')) break;
    if (statuses.some((s) => s === 'done') || daysWithCheckIn.has(date)) count++;
    else if (date === today || statuses.every((s) => s === 'paused')) continue;
    else break;
  }
  return count;
}

/** Validates a schedule shape; returns a problem or null. */
export function scheduleProblem(schedule: unknown, maxSlots: number): string | null {
  if (!schedule || typeof schedule !== 'object') return 'Schedule is missing.';
  const s = schedule as Schedule;
  if (!Array.isArray(s.slots) || s.slots.length === 0) return 'Add at least one check-in window.';
  if (s.slots.length > maxSlots) {
    return maxSlots === 1 ? 'Extra daily check-ins are a Premium feature.' : `Up to ${maxSlots} check-ins a day.`;
  }
  let previousDeadline = -1;
  for (const slot of s.slots) {
    if (!slot || !isTime(slot.start) || !isTime(slot.deadline)) return 'Times must look like 07:30.';
    const start = minutesOf(slot.start);
    const deadline = minutesOf(slot.deadline);
    if (deadline - start < 30) return 'Each window needs to be at least 30 minutes long.';
    if (start < previousDeadline) return 'Check-in windows can\'t overlap.';
    previousDeadline = deadline;
  }
  if (!Array.isArray(s.days) || s.days.length === 0) return 'Pick at least one day.';
  if (!s.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return 'Days are invalid.';
  if (typeof s.smart !== 'boolean') return 'Smart check-in setting is invalid.';
  return null;
}
