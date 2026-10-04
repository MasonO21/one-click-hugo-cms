import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRevenueCatChecker, EntitlementLookupError, isValidAppUserId } from '../src/auth.js';

const NOW = Date.parse('2026-09-29T12:00:00Z');

function checker(respond: (url: string) => Response | Promise<Response> | never, clock = { t: NOW }) {
  const calls: { url: string; auth: string | null }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return respond(url);
  }) as unknown as typeof fetch;
  const c = createRevenueCatChecker({ secretKey: 'sk_secret', entitlementId: 'pro', fetchImpl, now: () => clock.t });
  return { c, calls, clock };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const sub = (ent: unknown) => json({ subscriber: { entitlements: ent ? { pro: ent } : {} } });

describe('RevenueCat entitlement checker', () => {
  it('accepts a live trial or subscription and sends the secret as a bearer token', async () => {
    const { c, calls } = checker(() => sub({ expires_date: '2026-10-05T12:00:00Z' }));
    assert.equal(await c.isActive('$RCAnonymousID:abc123456789'), true);
    assert.equal(calls[0]?.auth, 'Bearer sk_secret');
    assert.match(calls[0]?.url ?? '', /subscribers\/%24RCAnonymousID%3Aabc123456789$/);
  });

  it('rejects an expired entitlement, a missing one, and an unknown user', async () => {
    assert.equal(await checker(() => sub({ expires_date: '2026-09-28T12:00:00Z' })).c.isActive('user-aaaaaaaa'), false);
    assert.equal(await checker(() => sub(null)).c.isActive('user-aaaaaaaa'), false);
  });

  it('treats a null expiry as a lifetime entitlement', async () => {
    assert.equal(await checker(() => sub({ expires_date: null })).c.isActive('user-aaaaaaaa'), true);
  });

  it('honours the billing-retry grace period', async () => {
    const { c } = checker(() => sub({ expires_date: '2026-09-28T12:00:00Z', grace_period_expires_date: '2026-10-01T12:00:00Z' }));
    assert.equal(await c.isActive('user-aaaaaaaa'), true);
  });

  it('caches answers, with a shorter lifetime for "no" so new purchases show up quickly', async () => {
    const yes = checker(() => sub({ expires_date: '2026-10-05T12:00:00Z' }));
    await yes.c.isActive('user-aaaaaaaa');
    await yes.c.isActive('user-aaaaaaaa');
    assert.equal(yes.calls.length, 1);
    yes.clock.t += 6 * 60_000;
    await yes.c.isActive('user-aaaaaaaa');
    assert.equal(yes.calls.length, 2);

    const no = checker(() => sub(null));
    await no.c.isActive('user-aaaaaaaa');
    no.clock.t += 31_000;
    await no.c.isActive('user-aaaaaaaa');
    assert.equal(no.calls.length, 2);
  });

  it('reports when a household plan runs out, from the same lookup', async () => {
    const both = checker(() => json({ subscriber: { entitlements: { pro: { expires_date: '2026-10-05T12:00:00Z' }, household: { expires_date: '2026-10-05T12:00:00Z' } } } }));
    assert.equal(await both.c.isActive('user-aaaaaaaa'), true);
    assert.equal(await both.c.householdUntil?.('user-aaaaaaaa'), Date.parse('2026-10-05T12:00:00Z'));
    assert.equal(both.calls.length, 1);
    // A plan just for one person, and a household plan that has ended, cover nobody else.
    assert.equal(await checker(() => sub({ expires_date: '2026-10-05T12:00:00Z' })).c.householdUntil?.('user-aaaaaaaa'), null);
    const ended = checker(() => json({ subscriber: { entitlements: { household: { expires_date: '2026-09-28T12:00:00Z' } } } }));
    assert.equal(await ended.c.householdUntil?.('user-aaaaaaaa'), null);
    // The grace period counts, as it does for the person's own access.
    const retry = checker(() => json({ subscriber: { entitlements: { household: { expires_date: '2026-09-28T12:00:00Z', grace_period_expires_date: '2026-10-01T12:00:00Z' } } } }));
    assert.equal(await retry.c.householdUntil?.('user-aaaaaaaa'), Date.parse('2026-10-01T12:00:00Z'));
  });

  it('fails loudly (not "not subscribed") when RevenueCat is unreachable or erroring', async () => {
    await assert.rejects(checker(() => json({}, 500)).c.isActive('user-aaaaaaaa'), EntitlementLookupError);
    await assert.rejects(
      checker(() => {
        throw new Error('network down');
      }).c.isActive('user-aaaaaaaa'),
      EntitlementLookupError,
    );
  });

  it('validates the shape of app user ids before they reach the lookup', () => {
    assert.equal(isValidAppUserId('$RCAnonymousID:3f2a9c1de4b84f0f9a6d'), true);
    assert.equal(isValidAppUserId('local-abc123xyz'), true);
    assert.equal(isValidAppUserId('short'), false);
    assert.equal(isValidAppUserId('has space in it'), false);
    assert.equal(isValidAppUserId('../../etc/passwd'), false);
    assert.equal(isValidAppUserId('a'.repeat(101)), false);
  });
});
