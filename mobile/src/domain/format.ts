export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

// The phone's time zone, such as "America/Denver", or null if it cannot be read.
export function currentTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Notes keep the time zone they were made in, so a note from a trip shows the time it
// was there. An unknown or missing zone falls back to the phone's own.
function zoneOption(timeZone: string | null | undefined): { timeZone?: string } {
  if (!timeZone) return {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return { timeZone };
  } catch {
    return {};
  }
}

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

function calendarDay(timestamp: number, timeZone?: string | null): CalendarDay {
  const zone = zoneOption(timeZone);
  if (!zone.timeZone) {
    const d = new Date(timestamp);
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-US', { ...zone, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(
    new Date(timestamp),
  );
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

// The time of day, with the zone's short name when it is not the phone's own zone.
export function formatTime(timestamp: number, locale?: string, timeZone?: string | null): string {
  const zone = zoneOption(timeZone);
  const elsewhere = zone.timeZone !== undefined && zone.timeZone !== currentTimeZone();
  return new Date(timestamp).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...zone,
    ...(elsewhere ? { timeZoneName: 'short' } : {}),
  });
}

// "Today", "Yesterday", or the date, for the calendar day where the note was made.
export function formatDay(timestamp: number, now: number = Date.now(), locale?: string, timeZone?: string | null): string {
  const date = calendarDay(timestamp, timeZone);
  const today = calendarDay(now);
  const diffDays = Math.round(
    (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(date.year, date.month - 1, date.day)) / 86400000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Date(timestamp).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...zoneOption(timeZone),
    ...(date.year === today.year ? {} : { year: 'numeric' }),
  });
}

export function dayKey(timestamp: number, timeZone?: string | null): string {
  const { year, month, day } = calendarDay(timestamp, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type OutingKind = 'hike' | 'run';

export function partOfDay(timestamp: number): 'Morning' | 'Afternoon' | 'Evening' | 'Night' {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

export function defaultOutingName(kind: OutingKind, startedAt: number): string {
  return `${partOfDay(startedAt)} ${kind}`;
}
