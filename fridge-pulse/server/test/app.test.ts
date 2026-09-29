import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { EntitlementLookupError, type EntitlementChecker } from '../src/auth.js';
import { UpstreamError, type ClaudeService } from '../src/claude.js';
import { RateLimiter } from '../src/ratelimit.js';
import type { MealsRequest, ScanRequest } from '../src/schemas.js';
import { fakeJpegBase64 } from './helpers.js';

const USER = 'user-1234567890';
const config = { scansPerDay: 3, mealsPerDay: 3, corsOrigin: null };

function setup(over: { entitled?: boolean | Error; claude?: Partial<ClaudeService>; limiter?: RateLimiter } = {}) {
  const seen: { scan: ScanRequest[]; meals: MealsRequest[] } = { scan: [], meals: [] };
  const claude: ClaudeService = {
    async scan(req) {
      seen.scan.push(req);
      return { items: [{ name: 'Milk', category: 'dairy', quantity: '1', shelfLifeDays: 6, labelExpiryDate: null, confidence: 'high' }], notes: null };
    },
    async meals(req) {
      seen.meals.push(req);
      return { meals: [] };
    },
    ...over.claude,
  };
  const entitlements: EntitlementChecker = {
    async isActive() {
      if (over.entitled instanceof Error) throw over.entitled;
      return over.entitled ?? true;
    },
  };
  const app = createApp({ config, claude, entitlements, limiter: over.limiter });
  const call = (path: string, body: unknown, headers: Record<string, string> = { Authorization: `Bearer ${USER}` }) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  return { app, call, seen };
}

const scanBody = (over: Partial<ScanRequest> = {}) => ({
  location: 'fridge',
  today: '2026-09-29',
  locale: 'en-US',
  images: [{ mediaType: 'image/jpeg', data: fakeJpegBase64() }],
  ...over,
});
const mealsBody = (over: Partial<MealsRequest> = {}) => ({
  today: '2026-09-29',
  diet: 'none',
  servings: 2,
  exclude: [],
  items: [{ name: 'Milk', category: 'dairy', quantity: '1', daysLeft: 2 }],
  ...over,
});

const errorOf = async (res: Response) => ((await res.json()) as { error: { code: string; message: string } }).error;

describe('health', () => {
  it('responds without auth', async () => {
    const { app } = setup();
    const res = await app.request('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

describe('access control', () => {
  it('rejects a missing or malformed token with 401', async () => {
    const { call } = setup();
    assert.equal((await call('/v1/scan', scanBody(), {})).status, 401);
    assert.equal((await call('/v1/scan', scanBody(), { Authorization: 'Basic abc' })).status, 401);
    assert.equal((await call('/v1/scan', scanBody(), { Authorization: 'Bearer ../etc/passwd' })).status, 401);
  });

  it('rejects users without an active subscription or trial with 402, before doing any model work', async () => {
    const { call, seen } = setup({ entitled: false });
    const res = await call('/v1/scan', scanBody());
    assert.equal(res.status, 402);
    assert.equal((await errorOf(res)).code, 'payment_required');
    assert.equal(seen.scan.length, 0);
  });

  it('returns 503, not 402, when the subscription lookup itself fails', async () => {
    const { call } = setup({ entitled: new EntitlementLookupError('down') });
    const res = await call('/v1/meals', mealsBody());
    assert.equal(res.status, 503);
    assert.equal((await errorOf(res)).code, 'unavailable');
  });
});

describe('POST /v1/scan', () => {
  it('returns the model result for a valid request', async () => {
    const { call, seen } = setup();
    const res = await call('/v1/scan', scanBody());
    assert.equal(res.status, 200);
    const body = (await res.json()) as { items: { name: string }[] };
    assert.equal(body.items[0]?.name, 'Milk');
    assert.equal(seen.scan[0]?.location, 'fridge');
  });

  it('validates the request', async () => {
    const { call } = setup();
    assert.equal((await call('/v1/scan', scanBody({ images: [] }))).status, 400);
    assert.equal((await call('/v1/scan', scanBody({ location: 'garage' as never }))).status, 400);
    assert.equal((await call('/v1/scan', scanBody({ today: '29/09/2026' }))).status, 400);
    assert.equal((await call('/v1/scan', scanBody({ images: [{ mediaType: 'image/gif' as never, data: fakeJpegBase64() }] }))).status, 400);
    assert.equal((await call('/v1/scan', '{not json')).status, 400);
    const five = Array.from({ length: 5 }, () => ({ mediaType: 'image/jpeg' as const, data: fakeJpegBase64() }));
    assert.equal((await call('/v1/scan', scanBody({ images: five }))).status, 400);
  });

  it('rejects image bytes that do not match the declared type', async () => {
    const { call } = setup();
    const res = await call('/v1/scan', scanBody({ images: [{ mediaType: 'image/png', data: fakeJpegBase64() }] }));
    assert.equal(res.status, 400);
    assert.match((await errorOf(res)).message, /does not match/);
  });

  it('rejects oversized images', async () => {
    const { call } = setup();
    const big = fakeJpegBase64(4 * 1024 * 1024);
    const res = await call('/v1/scan', scanBody({ images: [{ mediaType: 'image/jpeg', data: big }] }));
    assert.ok([400, 413].includes(res.status));
  });

  it('maps upstream failures to sensible statuses', async () => {
    const cases: [UpstreamError, number, string][] = [
      [new UpstreamError('refused', 'no'), 422, 'refused'],
      [new UpstreamError('unavailable', 'busy'), 503, 'unavailable'],
      [new UpstreamError('bad_output', 'meh'), 502, 'unavailable'],
    ];
    for (const [err, status, code] of cases) {
      const { call } = setup({ claude: { scan: async () => { throw err; } } });
      const res = await call('/v1/scan', scanBody());
      assert.equal(res.status, status);
      assert.equal((await errorOf(res)).code, code);
    }
  });

  it('does not leak unexpected error details to the client', async () => {
    const { call } = setup({ claude: { scan: async () => { throw new Error('secret internal detail'); } } });
    const res = await call('/v1/scan', scanBody());
    assert.equal(res.status, 502);
    assert.doesNotMatch(JSON.stringify(await res.json()), /secret internal detail/);
  });

  it('enforces the per-user daily limit with Retry-After, independently per user', async () => {
    const { call, seen } = setup({ limiter: new RateLimiter() });
    for (let i = 0; i < 3; i++) assert.equal((await call('/v1/scan', scanBody())).status, 200);
    const res = await call('/v1/scan', scanBody());
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    assert.equal((await errorOf(res)).code, 'rate_limited');
    assert.equal(seen.scan.length, 3);
    // A different user still has their own allowance.
    assert.equal((await call('/v1/scan', scanBody(), { Authorization: 'Bearer another-user-999' })).status, 200);
  });
});

describe('POST /v1/meals', () => {
  it('returns meals for valid input and forwards diet and servings', async () => {
    const { call, seen } = setup();
    const res = await call('/v1/meals', mealsBody({ diet: 'vegan', servings: 4 }));
    assert.equal(res.status, 200);
    assert.equal(seen.meals[0]?.diet, 'vegan');
    assert.equal(seen.meals[0]?.servings, 4);
  });

  it('validates the request', async () => {
    const { call } = setup();
    assert.equal((await call('/v1/meals', mealsBody({ items: [] }))).status, 400);
    assert.equal((await call('/v1/meals', mealsBody({ servings: 0 }))).status, 400);
    assert.equal((await call('/v1/meals', mealsBody({ diet: 'carnivore' as never }))).status, 400);
    assert.equal((await call('/v1/meals', mealsBody({ items: [{ name: 'x'.repeat(200), category: 'other', quantity: '1', daysLeft: 1 }] }))).status, 400);
    assert.equal((await call('/v1/meals', mealsBody({ items: [{ name: 'Milk', category: 'dairy', quantity: '1', daysLeft: -3 }] }))).status, 400);
  });
});

describe('abuse limits', () => {
  it('caps requests per IP before any entitlement lookup happens', async () => {
    let lookups = 0;
    const app = createApp({
      config,
      claude: { scan: async () => ({ items: [], notes: null }), meals: async () => ({ meals: [] }) },
      entitlements: { isActive: async () => { lookups++; return true; } },
    });
    let last = 0;
    for (let i = 0; i < 70; i++) {
      const res = await app.request('/v1/scan', { method: 'POST', headers: { Authorization: `Bearer flood-user-${i}0000` }, body: '{}' });
      last = res.status;
    }
    assert.equal(last, 429);
    assert.ok(lookups <= 60);
  });
});
