/** Answers whether an app user currently has an active subscription or trial. */
export interface EntitlementChecker {
  /** Resolves true when entitled. Throws `EntitlementLookupError` when the store lookup itself fails. */
  isActive(appUserId: string): Promise<boolean>;
}

export class EntitlementLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementLookupError';
  }
}

/** RevenueCat anonymous ids look like "$RCAnonymousID:<hex>"; custom ids are app-defined. */
const APP_USER_ID = /^[$A-Za-z0-9_:.\-]{8,100}$/;

export function isValidAppUserId(id: string): boolean {
  return APP_USER_ID.test(id);
}

interface RevenueCatOptions {
  secretKey: string;
  entitlementId: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** How long a positive answer is reused. */
  positiveTtlMs?: number;
  /** How long a negative answer is reused; short so a fresh purchase takes effect quickly. */
  negativeTtlMs?: number;
}

interface RevenueCatSubscriber {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string | null; grace_period_expires_date?: string | null }>;
  };
}

/** Verifies entitlements against RevenueCat's REST API using a server-side secret key. */
export function createRevenueCatChecker({
  secretKey,
  entitlementId,
  fetchImpl = fetch,
  now = Date.now,
  positiveTtlMs = 5 * 60_000,
  negativeTtlMs = 30_000,
}: RevenueCatOptions): EntitlementChecker {
  const cache = new Map<string, { active: boolean; until: number }>();

  return {
    async isActive(appUserId) {
      const t = now();
      const hit = cache.get(appUserId);
      if (hit && hit.until > t) return hit.active;

      let res: Response;
      try {
        res = await fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
          headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8_000),
        });
      } catch {
        throw new EntitlementLookupError('Could not reach RevenueCat');
      }
      if (!res.ok) throw new EntitlementLookupError(`RevenueCat responded ${res.status}`);

      const body = (await res.json()) as RevenueCatSubscriber;
      const ent = body.subscriber?.entitlements?.[entitlementId];
      const active = ent != null && isLive(ent, t);

      // Bound the cache so a flood of made-up ids cannot grow memory without limit.
      if (cache.size > 10_000) cache.clear();
      cache.set(appUserId, { active, until: t + (active ? positiveTtlMs : negativeTtlMs) });
      return active;
    },
  };
}

function isLive(
  ent: { expires_date?: string | null; grace_period_expires_date?: string | null },
  nowMs: number,
): boolean {
  // A null expiry means a lifetime / non-expiring entitlement.
  if (ent.expires_date == null) return true;
  const expires = Date.parse(ent.expires_date);
  if (Number.isFinite(expires) && expires > nowMs) return true;
  // Billing retry grace period: the store is still trying to collect payment.
  const grace = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : NaN;
  return Number.isFinite(grace) && grace > nowMs;
}

/** Development only: lets every request through. */
export function createOpenChecker(): EntitlementChecker {
  return { isActive: async () => true };
}
