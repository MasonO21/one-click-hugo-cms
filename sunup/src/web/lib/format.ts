import type { Mood } from '../../shared/types';

export const MOOD_INFO: Record<Mood, { emoji: string; label: string }> = {
  great: { emoji: '☀️', label: 'Great' },
  good: { emoji: '🙂', label: 'Good' },
  okay: { emoji: '😐', label: 'Okay' },
  meh: { emoji: '😮‍💨', label: 'Meh' },
  rough: { emoji: '🌧️', label: 'Rough' },
};

export function clock(ts: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(ts);
}

export function dayName(ts: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone }).format(ts);
}

function sameDay(a: number, b: number, timeZone?: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone });
  return f.format(a) === f.format(b);
}

/** "Today", "Tomorrow", "Yesterday" or a weekday. */
export function dayWord(ts: number, now: number, timeZone?: string): string {
  if (sameDay(ts, now, timeZone)) return 'Today';
  if (sameDay(ts, now + 86_400_000, timeZone)) return 'Tomorrow';
  if (sameDay(ts, now - 86_400_000, timeZone)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(ts);
}

/** "8:12 AM", "Yesterday 8:12 AM" or "Mon 8:12 AM". */
export function when(ts: number, now: number, timeZone?: string): string {
  if (sameDay(ts, now, timeZone)) return clock(ts, timeZone);
  if (sameDay(ts, now - 86_400_000, timeZone)) return `Yesterday ${clock(ts, timeZone)}`;
  if (sameDay(ts, now + 86_400_000, timeZone)) return `Tomorrow ${clock(ts, timeZone)}`;
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(ts);
  return `${day} ${clock(ts, timeZone)}`;
}

export function ago(ts: number, now: number): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Live countdown text: "1h 48m", "12m 05s", "45s". */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

/** The single-file demo ships without the website pages (terms, privacy, landing). */
export const HAS_SITE = import.meta.env.VITE_SUNUP_SINGLE !== '1';
