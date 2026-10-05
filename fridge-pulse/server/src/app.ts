import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { EntitlementLookupError, isValidAppUserId, type EntitlementChecker } from './auth.js';
import { UpstreamError, type ClaudeService } from './claude.js';
import type { Config } from './config.js';
import { withPictures } from './identify.js';
import { noPictures, type PictureFinder } from './pictures.js';
import { DAY_MS, RateLimiter } from './ratelimit.js';
import { BarcodeUnavailable, isValidGtin, type BarcodeLookup } from './barcode.js';
import { HouseholdError, SPONSOR_RECHECK_MS, type HouseholdStore } from './household.js';
import { BarcodeRequestSchema, CreateHouseholdSchema, HouseholdSyncSchema, IdentifyRequestSchema, JoinHouseholdSchema, MAX_IMAGE_BYTES, MealsRequestSchema, RemoveMemberSchema, ScanRequestSchema } from './schemas.js';

export interface Deps {
  config: Pick<Config, 'scansPerDay' | 'mealsPerDay' | 'identifiesPerDay' | 'corsOrigin'> & Partial<Pick<Config, 'barcodesPerDay'>>;
  claude: ClaudeService;
  entitlements: EntitlementChecker;
  /** Finds product pictures for identified foods. Without it, candidates come back without pictures. */
  pictures?: PictureFinder;
  limiter?: RateLimiter;
  /** Resolves the caller's IP for abuse limiting. */
  clientIp?: (c: Context) => string;
  /** Product barcodes. Without it, the barcode endpoint answers 503. */
  barcodes?: BarcodeLookup;
  /** Shared households. Without it, the household endpoints answer 503. */
  households?: HouseholdStore;
  /** The time, for tests. */
  now?: () => number;
}

type ErrorCode = 'unauthorized' | 'payment_required' | 'rate_limited' | 'bad_request' | 'refused' | 'unavailable' | 'not_found' | 'conflict';

function fail(c: Context, status: 400 | 401 | 402 | 404 | 409 | 413 | 422 | 429 | 502 | 503, code: ErrorCode, message: string) {
  return c.json({ error: { code, message } }, status);
}

/** JPEG, PNG and WebP signatures; the API rejects images whose bytes do not match the declared type. */
function matchesMediaType(b64: string, mediaType: string): boolean {
  const head = Buffer.from(b64.slice(0, 24), 'base64');
  if (mediaType === 'image/jpeg') return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (mediaType === 'image/png') return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mediaType === 'image/webp') return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

type Env = { Variables: { userId: string; /** When the caller's own household plan runs out, if they have one. */ householdUntil: number | null } };

/** Why an uploaded image cannot be used, or null when it is fine. */
function badImage(img: { mediaType: string; data: string }): { status: 400 | 413; message: string } | null {
  if (!matchesMediaType(img.data, img.mediaType)) return { status: 400, message: 'An image does not match its declared type.' };
  if (Buffer.byteLength(img.data, 'base64') > MAX_IMAGE_BYTES) return { status: 413, message: 'An image is too large.' };
  return null;
}

/**
 * All calls from one IP address in a minute. Phones on one mobile network can share an address, and
 * each phone in a household syncs twice a minute, so this leaves room for many people behind one.
 */
export const CALLS_PER_IP_PER_MINUTE = 240;
const BURST_PER_MINUTE = { scan: 8, meals: 20, identify: 6, household: 30, join: 5, barcode: 40 } as const;
/** Household sync runs every half minute while the app is open; this is several times a full day of that. */
const HOUSEHOLD_CALLS_PER_DAY = 6000;
/** Wrong invite codes allowed per day, so codes cannot be guessed. */
const JOINS_PER_DAY = 10;
/**
 * Household calls open to people without a plan: joining (someone else's household plan may cover
 * them), looking at their household (to see whether it does) and leaving. Everything else needs a plan
 * or that cover.
 */
const OPEN_ROUTES = new Set(['GET /v1/household', 'POST /v1/household/join', 'POST /v1/household/leave']);
/** Calls to those routes per IP per day from people without a plan, so made-up ids cannot farm them. */
const OPEN_CALLS_PER_IP_PER_DAY = 200;

export function createApp({ config, claude, entitlements, pictures = noPictures, limiter = new RateLimiter(), clientIp = () => 'unknown', households, barcodes, now = Date.now }: Deps) {
  const app = new Hono<Env>();

  if (config.corsOrigin) app.use('*', cors({ origin: config.corsOrigin }));

  app.get('/health', (c) => c.json({ ok: true }));

  app.use(
    '/v1/*',
    bodyLimit({
      maxSize: 16 * 1024 * 1024,
      onError: (c) => fail(c, 413, 'bad_request', 'The upload is too large.'),
    }),
  );

  // Every API call must come from a current subscriber or trial user.
  app.use('/v1/*', async (c, next) => {
    // Cheap per-IP cap first, so a flood of made-up ids cannot hammer the entitlement lookup.
    const ipGate = limiter.hit(`ip:${clientIp(c)}`, CALLS_PER_IP_PER_MINUTE, 60_000);
    if (!ipGate.ok) {
      c.header('Retry-After', String(ipGate.retryAfterSec));
      return fail(c, 429, 'rate_limited', 'Too many requests. Please slow down.');
    }

    const match = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '');
    const userId = match?.[1]?.trim();
    if (!userId || !isValidAppUserId(userId)) return fail(c, 401, 'unauthorized', 'Sign in again to continue.');

    try {
      if (!(await allowed(c, userId))) {
        if (!OPEN_ROUTES.has(`${c.req.method} ${c.req.path}`)) {
          return fail(c, 402, 'payment_required', 'Start your free trial or subscribe to use this feature.');
        }
        const open = limiter.hit(`open:ip:${clientIp(c)}`, OPEN_CALLS_PER_IP_PER_DAY, DAY_MS);
        if (!open.ok) {
          c.header('Retry-After', String(open.retryAfterSec));
          return fail(c, 429, 'rate_limited', 'Too many requests. Try again tomorrow.');
        }
      }
    } catch (e) {
      if (e instanceof EntitlementLookupError) {
        console.error('Entitlement lookup failed:', e.message);
        return fail(c, 503, 'unavailable', 'Could not verify your subscription. Please try again.');
      }
      throw e;
    }
    c.set('userId', userId);
    await next();
  });

  /** A plan of their own, or a household plan someone in their household pays for. */
  async function allowed(c: Context<Env>, userId: string): Promise<boolean> {
    c.set('householdUntil', null);
    const own = await entitlements.isActive(userId);
    if (!households || !entitlements.householdUntil) return own;
    const t = now();
    // The same lookup says whether they pay for a household plan. Note it, or that it has ended (a
    // cancellation that has run out, a refund, a switch to a plan just for them), on the way past.
    const mine = await entitlements.householdUntil(userId);
    c.set('householdUntil', mine);
    try {
      households.sponsor(userId, mine, t);
    } catch (e) {
      console.error('Could not record a household plan:', e instanceof Error ? e.message : e);
    }
    if (own) return true;

    let cover;
    try {
      cover = households.coverage(userId);
    } catch (e) {
      console.error('Could not read household cover:', e instanceof Error ? e.message : e);
      return false;
    }
    if (!cover?.sponsorUser || cover.until == null) return false;
    const live = cover.until > t;
    // Ask the store about the payer once the date on record has passed (the plan may have renewed), and
    // every few hours before then (a refund ends it early).
    if (live && cover.checkedAt != null && t - cover.checkedAt < SPONSOR_RECHECK_MS) return true;
    let until: number | null;
    try {
      until = await entitlements.householdUntil(cover.sponsorUser);
    } catch (e) {
      // The store cannot be asked right now: a date still ahead holds until it can.
      if (live && e instanceof EntitlementLookupError) return true;
      throw e;
    }
    households.sponsor(cover.sponsorUser, until, t);
    return until != null && until > t;
  }

  function limited(c: Context<Env>, bucket: keyof typeof BURST_PER_MINUTE, perDay: number) {
    const userId = c.get('userId');
    const day = limiter.hit(`${bucket}:day:${userId}`, perDay, DAY_MS);
    // A short burst cap stops a stuck client from looping.
    const burst = day.ok ? limiter.hit(`${bucket}:min:${userId}`, BURST_PER_MINUTE[bucket], 60_000) : day;
    if (burst.ok) return null;
    c.header('Retry-After', String(burst.retryAfterSec));
    return fail(c, 429, 'rate_limited', day.ok ? 'Too many requests. Please wait a minute.' : 'You have reached today\'s limit. Try again tomorrow.');
  }

  function upstream(c: Context, e: unknown) {
    if (e instanceof UpstreamError) {
      if (e.kind === 'refused') return fail(c, 422, 'refused', e.message);
      if (e.kind === 'bad_output') return fail(c, 502, 'unavailable', e.message);
      return fail(c, 503, 'unavailable', e.message);
    }
    console.error('Unexpected error:', e instanceof Error ? e.message : e);
    return fail(c, 502, 'unavailable', 'Something went wrong. Please try again.');
  }

  app.post('/v1/scan', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'bad_request', 'The request body must be JSON.');
    }
    const parsed = ScanRequestSchema.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
    const req = parsed.data;

    for (const img of req.images) {
      const bad = badImage(img);
      if (bad) return fail(c, bad.status, 'bad_request', bad.message);
    }

    const blocked = limited(c, 'scan', config.scansPerDay);
    if (blocked) return blocked;

    try {
      const out = await claude.scan(req);
      return c.json(out);
    } catch (e) {
      return upstream(c, e);
    }
  });

  app.post('/v1/meals', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'bad_request', 'The request body must be JSON.');
    }
    const parsed = MealsRequestSchema.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));

    const blocked = limited(c, 'meals', config.mealsPerDay);
    if (blocked) return blocked;

    try {
      const out = await claude.meals(parsed.data);
      return c.json(out);
    } catch (e) {
      return upstream(c, e);
    }
  });

  app.post('/v1/identify', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'bad_request', 'The request body must be JSON.');
    }
    const parsed = IdentifyRequestSchema.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
    const req = parsed.data;
    if (req.image) {
      const bad = badImage(req.image);
      if (bad) return fail(c, bad.status, 'bad_request', bad.message);
    }

    const blocked = limited(c, 'identify', config.identifiesPerDay);
    if (blocked) return blocked;

    try {
      const report = await claude.identify(req);
      return c.json(await withPictures(report, pictures));
    } catch (e) {
      return upstream(c, e);
    }
  });

  app.post('/v1/barcode', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 400, 'bad_request', 'The request body must be JSON.');
    }
    const parsed = BarcodeRequestSchema.safeParse(body);
    if (!parsed.success || !isValidGtin(parsed.data.code)) return fail(c, 400, 'bad_request', 'That is not a product barcode.');
    if (!barcodes) return fail(c, 503, 'unavailable', 'Barcode lookups are not set up on this server.');

    const blocked = limited(c, 'barcode', config.barcodesPerDay ?? 300);
    if (blocked) return blocked;

    try {
      return c.json({ product: await barcodes.find(parsed.data.code) });
    } catch (e) {
      if (e instanceof BarcodeUnavailable) return fail(c, 503, 'unavailable', 'Could not look that barcode up right now. Try again in a moment.');
      throw e;
    }
  });

  // -------------------------------------------------------------------------
  // Shared households
  // -------------------------------------------------------------------------

  async function body(c: Context<Env>): Promise<unknown> {
    try {
      return await c.req.json();
    } catch {
      return undefined;
    }
  }

  function householdFailure(c: Context<Env>, e: unknown) {
    if (e instanceof HouseholdError) {
      if (e.code === 'not_found') return fail(c, 404, 'not_found', e.message);
      if (e.code === 'not_member') return fail(c, 404, 'not_found', e.message);
      return fail(c, 409, 'conflict', e.message);
    }
    console.error('Household error:', e instanceof Error ? e.message : e);
    return fail(c, 503, 'unavailable', 'Household sharing is not available right now.');
  }

  /** Runs a household call: the store must exist, and the caller stays inside the household limits. */
  function household(handler: (c: Context<Env>, store: HouseholdStore) => Promise<Response> | Response) {
    return async (c: Context<Env>) => {
      if (!households) return fail(c, 503, 'unavailable', 'Household sharing is not set up on this server.');
      const blocked = limited(c, 'household', HOUSEHOLD_CALLS_PER_DAY);
      if (blocked) return blocked;
      try {
        return await handler(c, households);
      } catch (e) {
        return householdFailure(c, e);
      }
    };
  }

  app.get(
    '/v1/household',
    household((c, store) => c.json({ household: store.get(c.get('userId')) })),
  );

  app.post(
    '/v1/household',
    household(async (c, store) => {
      const parsed = CreateHouseholdSchema.safeParse(await body(c));
      if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
      const userId = c.get('userId');
      store.create(userId, parsed.data.memberName, parsed.data.name);
      // A payer on the household plan covers the new household from the start.
      store.sponsor(userId, c.get('householdUntil'));
      return c.json({ household: store.get(userId) });
    }),
  );

  app.post(
    '/v1/household/join',
    household(async (c, store) => {
      const parsed = JoinHouseholdSchema.safeParse(await body(c));
      if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
      const blocked = limited(c, 'join', JOINS_PER_DAY);
      if (blocked) return blocked;
      const userId = c.get('userId');
      store.join(userId, parsed.data.memberName, parsed.data.code);
      store.sponsor(userId, c.get('householdUntil'));
      return c.json({ household: store.get(userId) });
    }),
  );

  app.post(
    '/v1/household/leave',
    household((c, store) => {
      store.leave(c.get('userId'));
      return c.json({ household: null });
    }),
  );

  app.post(
    '/v1/household/remove',
    household(async (c, store) => {
      const parsed = RemoveMemberSchema.safeParse(await body(c));
      if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
      return c.json({ household: store.remove(c.get('userId'), parsed.data.member) });
    }),
  );

  app.post(
    '/v1/household/code',
    household((c, store) => c.json({ household: store.newCode(c.get('userId')) })),
  );

  app.post(
    '/v1/household/sync',
    household(async (c, store) => {
      const parsed = HouseholdSyncSchema.safeParse(await body(c));
      if (!parsed.success) return fail(c, 400, 'bad_request', describe(parsed.error));
      return c.json(store.sync(c.get('userId'), parsed.data.since, parsed.data.changes));
    }),
  );

  app.notFound((c) => fail(c, 400, 'bad_request', 'Not found.'));
  app.onError((e, c) => {
    console.error('Unhandled error:', e.message);
    return fail(c, 502, 'unavailable', 'Something went wrong. Please try again.');
  });

  return app;
}

function describe(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Invalid request.';
  const path = issue.path.join('.');
  return `Invalid request${path ? ` (${path})` : ''}: ${issue.message}`;
}
