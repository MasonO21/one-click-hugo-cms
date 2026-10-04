export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface Config {
  port: number;
  /** Claude model used for scanning and meals. */
  model: string;
  scanEffort: Effort;
  mealsEffort: Effort;
  identifyEffort: Effort;
  revenueCatSecretKey: string | null;
  entitlementId: string;
  /** The RevenueCat entitlement the household plans grant: its holder covers their shared household. */
  householdEntitlementId: string;
  /** Skips subscription checks. Local development only. */
  allowUnauthenticated: boolean;
  /** Per-user daily caps, to bound spend if an account is abused. */
  scansPerDay: number;
  mealsPerDay: number;
  /** Web lookups of unrecognised items. Each one runs web searches, so it costs more than a scan. */
  identifiesPerDay: number;
  /** Sent to Open Food Facts and Wikipedia with picture lookups, as both ask. Include a contact. */
  pictureUserAgent: string;
  /** Overridable for tests; the public services by default. */
  offBaseUrl: string;
  wikiBaseUrl: string;
  /** Read the client IP from X-Forwarded-For (set when behind a trusted reverse proxy). */
  trustProxy: boolean;
  corsOrigin: string | null;
  /** SQLite file for shared households, or null to turn household sharing off. */
  householdDb: string | null;
}

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

function effort(value: string | undefined, fallback: Effort): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : fallback;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function baseUrl(value: string | undefined, fallback: string): string {
  const v = value?.trim().replace(/\/+$/, '');
  return v && /^https?:\/\//.test(v) ? v : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const allowUnauthenticated = env.ALLOW_UNAUTHENTICATED === 'true';
  const revenueCatSecretKey = env.REVENUECAT_SECRET_KEY?.trim() || null;

  // Fail closed: without a way to verify subscriptions, anyone could spend your API credits.
  if (!revenueCatSecretKey && !allowUnauthenticated) {
    throw new Error(
      'REVENUECAT_SECRET_KEY is not set. Set it, or set ALLOW_UNAUTHENTICATED=true for local development only.',
    );
  }

  return {
    port: int(env.PORT, 8787),
    model: env.ANTHROPIC_MODEL?.trim() || 'claude-opus-5-5',
    scanEffort: effort(env.SCAN_EFFORT, 'medium'),
    mealsEffort: effort(env.MEALS_EFFORT, 'low'),
    identifyEffort: effort(env.IDENTIFY_EFFORT, 'medium'),
    revenueCatSecretKey,
    entitlementId: env.REVENUECAT_ENTITLEMENT_ID?.trim() || 'pro',
    householdEntitlementId: env.REVENUECAT_HOUSEHOLD_ENTITLEMENT_ID?.trim() || 'household',
    allowUnauthenticated,
    scansPerDay: int(env.SCANS_PER_DAY, 15),
    mealsPerDay: int(env.MEALS_PER_DAY, 40),
    identifiesPerDay: int(env.IDENTIFIES_PER_DAY, 10),
    pictureUserAgent: env.PICTURE_USER_AGENT?.trim() || 'FridgePulse/1.0 (food expiry tracker)',
    offBaseUrl: baseUrl(env.OFF_BASE_URL, 'https://world.openfoodfacts.org'),
    wikiBaseUrl: baseUrl(env.WIKI_BASE_URL, 'https://en.wikipedia.org'),
    trustProxy: env.TRUST_PROXY === 'true',
    corsOrigin: env.CORS_ORIGIN?.trim() || null,
    householdDb: env.HOUSEHOLD_DB?.trim() === 'off' ? null : env.HOUSEHOLD_DB?.trim() || 'data/households.sqlite',
  };
}
