const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** 1234 -> "1.2K", 999 -> "999", 0.5 -> "0.5". */
export function fmt(n: number, digits = 1): string {
  if (!isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 10 && n % 1 !== 0) return sign + n.toFixed(1).replace(/\.0$/, '');
  if (n < 1000) return sign + Math.floor(n).toString();
  let i = 0;
  while (n >= 1000 && i < SUFFIXES.length - 1) {
    n /= 1000;
    i++;
  }
  // 999,600 must read "1M", not "1000K"
  if (i < SUFFIXES.length - 1 && Number(n.toFixed(n < 100 ? digits : 0)) >= 1000) {
    n /= 1000;
    i++;
  }
  return sign + n.toFixed(n < 100 ? digits : 0).replace(/\.0$/, '') + SUFFIXES[i];
}

/** Signed format for rates: "+12", "-3.5". */
export function fmtSigned(n: number): string {
  return (n >= 0 ? '+' : '') + fmt(n);
}

/** 272 -> "4m 32s", 16320 -> "4h 32m". */
export function fmtDuration(seconds: number): string {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`;
  return `${s}s`;
}

/** 125 -> "2:05" countdown style. */
export function fmtClock(seconds: number): string {
  seconds = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Local calendar date key "YYYY-MM-DD" for daily resets. */
export function dateKey(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
