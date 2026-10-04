/** Answers whether an app user currently has an active subscription or trial. */
export interface EntitlementChecker {
  /** Resolves true when entitled. Throws `EntitlementLookupError` when the store lookup itself fails. */
  isActive(appUserId: string): Promise<boolean>;
  /**
   * When the person's household plan runs out (ms since the epoch), or null without a live one. A
   * household plan covers everyone in the payer's shared household. Without this, no plan does.
   */
  householdUntil?(appUserId: string): Promise<number | null>;
}

/** Stands in for "never runs out" (a lifetime entitlement has no expiry date). */
export const NO_EXPIRY = Date.UTC(9999, 11, 31);

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
  /** The entitlement the household plans grant as well. */
  householdEntitlementId?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** How long a positive answer is reused. */
  positiveTtlMs?: number;
  /** How long a negative answer is reused; short so a fresh purchase takes effect quickly. */
  negativeTtlMs?: number;
}

type RevenueCatEntitlement = { expires_date?: string | null; grace_period_expires_date?: string | null };

interface RevenueCatSubscriber {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
  };
}

/** Verifies entitlements against RevenueCat's REST API using a server-side secret key. */
export function createRevenueCatChecker({
  secretKey,
  entitlementId,
  householdEntitlementId = 'household',
  fetchImpl = fetch,
  now = Date.now,
  positiveTtlMs = 5 * 60_000,
  negativeTtlMs = 30_000,
}: RevenueCatOptions): EntitlementChecker {
  // One lookup answers both questions, so checking for a household plan costs nothing extra.
  const cache = new Map<string, { active: boolean; household: number | null; until: number }>();

  async function lookup(appUserId: string) {
    const t = now();
    const hit = cache.get(appUserId);
    if (hit && hit.until > t) return hit;

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
    const entitlements = body.subscriber?.entitlements ?? {};
    const active = liveUntil(entitlements[entitlementId], t) != null;
    const household = liveUntil(entitlements[householdEntitlementId], t);

    // Bound the cache so a flood of made-up ids cannot grow memory without limit.
    if (cache.size > 10_000) cache.clear();
    const entry = { active, household, until: t + (active ? positiveTtlMs : negativeTtlMs) };
    cache.set(appUserId, entry);
    return entry;
  }

  return {
    isActive: async (appUserId) => (await lookup(appUserId)).active,
    householdUntil: async (appUserId) => (await lookup(appUserId)).household,
  };
}

/** When a live entitlement runs out (ms), or null when it is missing or has run out. */
function liveUntil(ent: RevenueCatEntitlement | undefined, nowMs: number): number | null {
  if (!ent) return null;
  // A null expiry means a lifetime / non-expiring entitlement.
  if (ent.expires_date == null) return NO_EXPIRY;
  const expires = Date.parse(ent.expires_date);
  // Billing retry grace period: the store is still trying to collect payment.
  const grace = ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : NaN;
  const until = Math.max(Number.isFinite(expires) ? expires : 0, Number.isFinite(grace) ? grace : 0);
  return until > nowMs ? until : null;
}

/** Development only: lets every request through. */
export function createOpenChecker(): EntitlementChecker {
  return { isActive: async () => true };
}
