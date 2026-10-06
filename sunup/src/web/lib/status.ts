import type { WatchedView } from '../../shared/snapshot';
import { formatHM } from '../../shared/util';
import { when } from './format';

/** One line describing how someone you watch is doing today. */
export function statusLine(w: WatchedView, now: number, alerting: boolean): { text: string; tone: 'ok' | 'warn' | 'danger' | 'muted' } {
  if (alerting) return { text: 'Not answering: see alert', tone: 'danger' };
  if (w.paused) return { text: 'Away mode', tone: 'muted' };
  const s = w.slot;
  if (!s) return { text: 'No check-ins scheduled', tone: 'muted' };
  switch (s.status) {
    case 'done':
      return { text: `Checked in ${when(s.checkIn!.at, now, w.timezone)}`, tone: 'ok' };
    case 'open':
      return { text: `Window open until ${formatHM(s.deadline)}`, tone: 'warn' };
    case 'missed':
      return { text: `Missed ${formatHM(s.deadline)} check-in`, tone: 'danger' };
    case 'late':
      return { text: 'Checked in late', tone: 'ok' };
    default:
      return { text: w.lastCheckIn ? `Last check-in ${when(w.lastCheckIn.at, now)}` : 'Waiting for first check-in', tone: 'muted' };
  }
}
