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
import { IdentifyRequestSchema, MAX_IMAGE_BYTES, MealsRequestSchema, ScanRequestSchema } from './schemas.js';

export interface Deps {
  config: Pick<Config, 'scansPerDay' | 'mealsPerDay' | 'identifiesPerDay' | 'corsOrigin'>;
  claude: ClaudeService;
  entitlements: EntitlementChecker;
  /** Finds product pictures for identified foods. Without it, candidates come back without pictures. */
  pictures?: PictureFinder;
  limiter?: RateLimiter;
  /** Resolves the caller's IP for abuse limiting. */
  clientIp?: (c: Context) => string;
}

type ErrorCode = 'unauthorized' | 'payment_required' | 'rate_limited' | 'bad_request' | 'refused' | 'unavailable';

function fail(c: Context, status: 400 | 401 | 402 | 413 | 422 | 429 | 502 | 503, code: ErrorCode, message: string) {
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

type Env = { Variables: { userId: string } };

/** Why an uploaded image cannot be used, or null when it is fine. */
function badImage(img: { mediaType: string; data: string }): { status: 400 | 413; message: string } | null {
  if (!matchesMediaType(img.data, img.mediaType)) return { status: 400, message: 'An image does not match its declared type.' };
  if (Buffer.byteLength(img.data, 'base64') > MAX_IMAGE_BYTES) return { status: 413, message: 'An image is too large.' };
  return null;
}

const BURST_PER_MINUTE = { scan: 8, meals: 20, identify: 6 } as const;

export function createApp({ config, claude, entitlements, pictures = noPictures, limiter = new RateLimiter(), clientIp = () => 'unknown' }: Deps) {
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
    const ipGate = limiter.hit(`ip:${clientIp(c)}`, 60, 60_000);
    if (!ipGate.ok) {
      c.header('Retry-After', String(ipGate.retryAfterSec));
      return fail(c, 429, 'rate_limited', 'Too many requests. Please slow down.');
    }

    const match = /^Bearer (.+)$/.exec(c.req.header('Authorization') ?? '');
    const userId = match?.[1]?.trim();
    if (!userId || !isValidAppUserId(userId)) return fail(c, 401, 'unauthorized', 'Sign in again to continue.');

    try {
      if (!(await entitlements.isActive(userId))) {
        return fail(c, 402, 'payment_required', 'Start your free trial or subscribe to use this feature.');
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
