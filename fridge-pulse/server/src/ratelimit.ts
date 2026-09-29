export interface LimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Fixed-window counters kept in memory. Good enough for a single instance;
 * run more than one and put the counters in Redis (or similar) instead.
 */
export class RateLimiter {
  private windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private now: () => number = Date.now) {}

  hit(key: string, limit: number, windowMs: number): LimitResult {
    const t = this.now();
    if (this.windows.size > 50_000) this.sweep(t);

    const w = this.windows.get(key);
    if (!w || w.resetAt <= t) {
      this.windows.set(key, { count: 1, resetAt: t + windowMs });
      return { ok: true, retryAfterSec: 0 };
    }
    if (w.count >= limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - t) / 1000)) };
    w.count += 1;
    return { ok: true, retryAfterSec: 0 };
  }

  private sweep(t: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= t) this.windows.delete(k);
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;
