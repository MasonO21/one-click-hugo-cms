// Reminders (Update 14): local notifications the player opts into (Settings → Reminders; off by default, and only where
// the store build registered a notification plugin, engine/platform.js setNotifyBridge). Scheduled when the app goes to
// the background and cleared when it comes back: energy full, the next day's free chest and quests, and the Boss Rush
// opening. None lands in the quiet hours (REMINDERS.quiet, local time): it moves to the morning.
import { REMINDERS, ENERGY_MAX, ENERGY_REGEN_SEC, BOSS_RUSH } from '../game/data.js';
import { now as clockNow } from './clock.js';
import { energyNextIn, rushTimes, rushOpen } from './economy.js';
import { canNotify, notifySchedule, notifyCancel } from '../engine/platform.js';

/** `t` moved out of the quiet hours (local time) to the morning they end. */
export function outOfQuiet(t) {
  const [from, to] = REMINDERS.quiet, d = new Date(t), h = d.getHours() + d.getMinutes() / 60;
  if (h >= from || h < to) {
    const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (h >= from ? 1 : 0), to, 0, 0, 0);
    return m.getTime();
  }
  return t;
}

/** What would be scheduled now: [{ id, at, title, body }] (sorted by time). */
export function reminderList(p, t = clockNow()) {
  const out = [], T = REMINDERS.text;
  if (p.energy < ENERGY_MAX) {
    const full = t + (energyNextIn(p) + (ENERGY_MAX - p.energy - 1) * ENERGY_REGEN_SEC) * 1000;
    out.push({ id: 'energy', at: outOfQuiet(full), ...T.energy });
  }
  const d = new Date(t), daily = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, REMINDERS.dailyHour, 0, 0, 0).getTime();
  out.push({ id: 'daily', at: daily, ...T.daily });
  if (p.chapter.unlocked >= BOSS_RUSH.unlockAt && !rushOpen(p, t)) out.push({ id: 'rush', at: outOfQuiet(rushTimes(t).starts), ...T.rush });
  return out.filter((r) => r.at > t + 60e3).sort((a, b) => a.at - b.at);
}

/** App to the background: schedule (when the player opted in and the platform can). Returns how many. */
export function scheduleReminders(p) {
  if (!p.settings.reminders || !canNotify()) return 0;
  const list = reminderList(p);
  notifySchedule(list);
  return list.length;
}

/** App back in front (or the setting turned off): nothing stays scheduled. */
export const cancelReminders = () => notifyCancel();
