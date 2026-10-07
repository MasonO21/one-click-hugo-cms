/** Time / countdown formatting helpers. */

/** dayTime 0..1 (0 = midnight) -> "10:24". */
export function clockText(dayTime: number): string {
  const mins = Math.floor((((dayTime % 1) + 1) % 1) * 24 * 60);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

export function dayPhase(dayTime: number): { icon: string; name: string } {
  const t = ((dayTime % 1) + 1) % 1;
  if (t < 0.2 || t >= 0.82) return { icon: '🌙', name: 'Night' };
  if (t < 0.3) return { icon: '🌅', name: 'Sunrise' };
  if (t < 0.7) return { icon: '☀️', name: 'Day' };
  return { icon: '🌇', name: 'Sunset' };
}

/** 4932 -> "1:22:12", 125 -> "2:05". */
export function fmtHMS(seconds: number): string {
  seconds = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Milliseconds until the next local midnight (daily resets). */
export function msUntilLocalMidnight(nowMs: number): number {
  const d = new Date(nowMs);
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - nowMs;
}

/** "4h 12m" style rounded duration for long waits. */
export function fmtLong(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

/**
 * Welcome Back sub-headline. `credited` is the offline summary's production time, which already
 * includes the offline efficiency (credited = min(away, cap) × efficiency), so it is shorter than the
 * absence even when nothing was capped. Only an absence past the offline cap gets the "kept busy for
 * <cap>" line, with the capped wall-clock time (not the efficiency-scaled one).
 */
export function offlineWorkedText(away: number, credited: number, efficiency: number, fmt: (s: number) => string): string {
  const worked = efficiency > 0 ? credited / efficiency : credited;
  return away > worked + 60 ? `Your colony kept busy for ${fmt(worked)} while you were gone:` : 'Your colony produced:';
}
