import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import type { ClaudeService } from '../src/claude.js';
import { createHouseholdStore, formatCode, HouseholdError, MAX_MEMBERS, normalizeCode, TOMBSTONE_DAYS, type SyncRecord } from '../src/household.js';

const item = (id: string, name: string, updatedAt: number, over: Record<string, unknown> = {}): SyncRecord => ({
  kind: 'item',
  id,
  updatedAt,
  deleted: false,
  data: { name, category: 'dairy', quantity: '1', location: 'fridge', addedOn: '2026-10-01', expiresOn: '2026-10-08', expirySource: 'estimate', status: 'active', ...over },
});

describe('household store', () => {
  it('creates a household, lets others join by code, and lists members without their ids', () => {
    const store = createHouseholdStore();
    const made = store.create('user-a', 'Sam', 'Our flat');
    assert.match(made.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    assert.deepEqual(made.members, [{ name: 'Sam', you: true }]);
    const joined = store.join('user-b', 'Alex', made.code.toLowerCase().replace('-', ' '));
    assert.equal(joined.name, 'Our flat');
    assert.deepEqual(joined.members, [
      { name: 'Sam', you: false },
      { name: 'Alex', you: true },
    ]);
    assert.equal(store.get('user-c'), null);
  });

  it('refuses a wrong code, a second household and a full one', () => {
    const store = createHouseholdStore();
    const { code } = store.create('owner', 'Owner', 'Home');
    assert.throws(() => store.join('x', 'X', 'ZZZZ-ZZZZ'), (e: unknown) => e instanceof HouseholdError && e.code === 'not_found');
    assert.throws(() => store.create('owner', 'Owner', 'Another'), (e: unknown) => e instanceof HouseholdError && e.code === 'already_member');
    for (let i = 1; i < MAX_MEMBERS; i += 1) store.join(`m${i}`, `M${i}`, code);
    assert.throws(() => store.join('late', 'Late', code), (e: unknown) => e instanceof HouseholdError && e.code === 'full');
  });

  it('shares changes, keeps the newest, and passes deletions on', () => {
    const store = createHouseholdStore();
    const { code } = store.create('a', 'A', 'Home');
    store.join('b', 'B', code);
    const first = store.sync('a', 0, [item('i1', 'Milk', 1000), item('i2', 'Eggs', 1000)], 5000);
    assert.equal(first.changes.length, 2);
    // B gets both, then edits milk; A's older edit of milk loses.
    const b1 = store.sync('b', 0, [], 5000);
    assert.deepEqual(b1.changes.map((c) => c.id).sort(), ['i1', 'i2']);
    store.sync('b', b1.cursor, [item('i1', 'Oat milk', 3000)], 5000);
    store.sync('a', first.cursor, [item('i1', 'Whole milk', 2000)], 5000);
    const a2 = store.sync('a', first.cursor, [], 5000);
    assert.deepEqual(a2.changes.map((c) => [c.id, c.data?.name]), [['i1', 'Oat milk']]);
    // A deletes eggs; B hears about it.
    const a3 = store.sync('a', a2.cursor, [{ kind: 'item', id: 'i2', updatedAt: 4000, deleted: true, data: null }], 5000);
    const b2 = store.sync('b', b1.cursor + 1, [], 5000);
    assert.ok(b2.changes.some((c) => c.id === 'i2' && c.deleted && c.data === null));
    // Re-sending the same change does not bump the sequence.
    const again = store.sync('a', a3.cursor, [{ kind: 'item', id: 'i2', updatedAt: 4000, deleted: true, data: null }], 5000);
    assert.equal(again.changes.length, 0);
    assert.equal(again.cursor, a3.cursor);
  });

  it('does not let a clock that runs ahead win forever, and forgets old deletions', () => {
    const store = createHouseholdStore();
    store.create('a', 'A', 'Home');
    const now = 10 * 86_400_000 * TOMBSTONE_DAYS;
    store.sync('a', 0, [item('i1', 'Milk', now + 86_400_000)], now);
    const res = store.sync('a', 0, [item('i1', 'Milk 2', now + 10 * 60_000)], now + 6 * 60_000);
    assert.equal(res.changes[0]?.data?.name, 'Milk 2');
    store.sync('a', 0, [{ kind: 'item', id: 'i1', updatedAt: now + 11 * 60_000, deleted: true, data: null }], now + 11 * 60_000);
    const later = store.sync('a', 0, [], now + (TOMBSTONE_DAYS + 1) * 86_400_000);
    assert.equal(later.changes.length, 0);
  });

  it('pages long histories, and the last one out deletes the household', () => {
    const store = createHouseholdStore();
    store.create('a', 'A', 'Home');
    const many = Array.from({ length: 520 }, (_, i) => item(`i${i}`, `Food ${i}`, 1000 + i));
    store.sync('a', 0, many, 5000);
    const page1 = store.sync('a', 0, [], 5000);
    assert.equal(page1.more, true);
    assert.equal(page1.changes.length, 500);
    const page2 = store.sync('a', page1.cursor, [], 5000);
    assert.equal(page2.more, false);
    assert.equal(page2.changes.length, 20);
    store.leave('a');
    assert.equal(store.get('a'), null);
    const again = store.create('a', 'A', 'New home');
    assert.equal(store.sync('a', 0, [], 5000).changes.length, 0);
    assert.notEqual(again.code, '');
  });

  it('records who pays for a household plan, and the cover it gives everyone', () => {
    const store = createHouseholdStore();
    const { code } = store.create('payer', 'Sam', 'Home');
    store.join('housemate', 'Alex', code);
    const now = 1_000_000;
    assert.deepEqual(store.coverage('housemate'), { until: null, sponsorUser: null });
    store.sponsor('payer', now + 5000, now);
    assert.deepEqual(store.coverage('housemate'), { until: now + 5000, sponsorUser: 'payer' });
    // A shorter plan from someone else does not take over; a longer one does.
    store.join('other', 'Kim', code);
    store.sponsor('other', now + 1000, now);
    assert.equal(store.coverage('housemate')?.sponsorUser, 'payer');
    store.sponsor('other', now + 9000, now);
    assert.deepEqual(store.coverage('housemate'), { until: now + 9000, sponsorUser: 'other' });
    // The payer's plan ending ends the cover; someone who never paid changes nothing.
    store.sponsor('housemate', null, now);
    assert.equal(store.coverage('housemate')?.sponsorUser, 'other');
    store.sponsor('other', null, now);
    assert.deepEqual(store.coverage('housemate'), { until: null, sponsorUser: null });
    // Leaving stops paying for the others; someone outside a household has no cover.
    store.sponsor('payer', now + 5000, now);
    store.leave('payer');
    assert.deepEqual(store.coverage('housemate'), { until: null, sponsorUser: null });
    assert.equal(store.coverage('stranger'), null);
    store.sponsor('stranger', now + 5000, now);
  });

  it('shows the cover and who pays, without anyone’s id', () => {
    const store = createHouseholdStore();
    const { code } = store.create('payer', 'Sam', 'Home');
    store.join('housemate', 'Alex', code);
    const until = Date.now() + 86_400_000;
    store.sponsor('payer', until);
    const seen = store.get('housemate')!;
    assert.equal(seen.coveredUntil, until);
    assert.deepEqual(seen.members, [
      { name: 'Sam', you: false, sponsor: true },
      { name: 'Alex', you: true },
    ]);
    assert.ok(!JSON.stringify(seen).includes('payer'));
    // Once the date on record has passed, nobody is shown as covered.
    store.sponsor('payer', Date.now() - 1000 + 2000);
    const later = store.sync('housemate', 0, [], Date.now() + 10_000).household;
    assert.equal(later.coveredUntil, null);
    assert.deepEqual(later.members.map((m) => m.sponsor ?? false), [false, false]);
  });

  it('adds the household plan columns to a database made before them', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-households-'));
    try {
      const file = join(dir, 'old.sqlite');
      const old = new DatabaseSync(file);
      old.exec(`
        CREATE TABLE households (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, seq INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
        CREATE TABLE members (member TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, name TEXT NOT NULL, joined_at INTEGER NOT NULL);
        INSERT INTO households VALUES ('h1', 'Old home', 'ABCDEFGH', 0, 1);
      `);
      old.close();
      const store = createHouseholdStore(file);
      const joined = store.join('late', 'Late', 'ABCD-EFGH');
      assert.equal(joined.coveredUntil, null);
      store.sponsor('late', Date.now() + 60_000);
      assert.equal(store.coverage('late')?.sponsorUser, 'late');
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads invite codes however they are typed', () => {
    assert.equal(normalizeCode('abcd-ef23'), 'ABCDEF23');
    assert.equal(formatCode('ABCDEF23'), 'ABCD-EF23');
  });
});

describe('household endpoints', () => {
  const claude: ClaudeService = { scan: async () => ({ items: [], purchaseDate: null, currency: null, notes: null }), meals: async () => ({ meals: [] }), identify: async () => ({ candidates: [] }) };
  const setup = (withStore = true) => {
    const app = createApp({
      config: { scansPerDay: 3, mealsPerDay: 3, identifiesPerDay: 3, corsOrigin: null },
      claude,
      entitlements: { isActive: async () => true },
      households: withStore ? createHouseholdStore() : undefined,
    });
    const call = (path: string, user: string, body?: unknown) =>
      app.request(path, {
        method: body === undefined && path === '/v1/household' ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${user}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    return call;
  };
  const A = '$RCAnonymousID:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const B = '$RCAnonymousID:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  it('creates, joins, syncs and leaves', async () => {
    const call = setup();
    assert.deepEqual(await (await call('/v1/household', A)).json(), { household: null });
    const made = (await (await call('/v1/household', A, { name: 'Home', memberName: 'Sam' })).json()) as { household: { code: string } };
    const joined = await call('/v1/household/join', B, { code: made.household.code, memberName: 'Alex' });
    assert.equal(joined.status, 200);
    const push = await call('/v1/household/sync', A, { since: 0, changes: [item('i1', 'Milk', 1000)] });
    assert.equal(push.status, 200);
    const pull = (await (await call('/v1/household/sync', B, { since: 0, changes: [] })).json()) as { changes: SyncRecord[]; household: { members: unknown[] } };
    assert.equal(pull.changes[0]?.data?.name, 'Milk');
    assert.equal(pull.household.members.length, 2);
    assert.equal((await call('/v1/household/leave', B, {})).status, 200);
    assert.equal((await call('/v1/household/sync', B, { since: 0, changes: [] })).status, 404);
  });

  it('checks what is shared, and refuses a wrong code with 404', async () => {
    const call = setup();
    await call('/v1/household', A, { name: 'Home', memberName: 'Sam' });
    const bad = await call('/v1/household/sync', A, { since: 0, changes: [{ kind: 'item', id: 'x', updatedAt: 1, deleted: false, data: { name: 'Milk' } }] });
    assert.equal(bad.status, 400);
    const huge = await call('/v1/household/sync', A, { since: 0, changes: [item('x', 'M'.repeat(200), 1)] });
    assert.equal(huge.status, 400);
    assert.equal((await call('/v1/household/join', B, { code: 'ZZZZ-ZZZZ', memberName: 'Alex' })).status, 404);
    assert.equal((await call('/v1/household', B, { name: '', memberName: 'Alex' })).status, 400);
    assert.equal((await call('/v1/household', A, { name: 'Again', memberName: 'Sam' })).status, 409);
  });

  it('limits guesses at invite codes', async () => {
    const call = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await call('/v1/household/join', B, { code: `ZZZZ-ZZ${i}`, memberName: 'Alex' })).status);
    assert.ok(statuses.includes(429));
  });

  describe('household plan', () => {
    /** Stands in for RevenueCat: who has a plan of their own, and whose household plan runs until when. */
    const plans = () => {
      const own = new Map<string, boolean>();
      const household = new Map<string, number | null>();
      let lookups = 0;
      return {
        own,
        household,
        lookups: () => lookups,
        checker: {
          isActive: async (u: string) => own.get(u) ?? false,
          householdUntil: async (u: string) => {
            lookups += 1;
            return household.get(u) ?? null;
          },
        },
      };
    };
    const setupPlans = () => {
      const p = plans();
      const store = createHouseholdStore();
      const app = createApp({ config: { scansPerDay: 3, mealsPerDay: 3, identifiesPerDay: 3, corsOrigin: null }, claude, entitlements: p.checker, households: store });
      const call = (path: string, user: string, body?: unknown) =>
        app.request(path, {
          method: body === undefined && path === '/v1/household' ? 'GET' : 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${user}` },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      return { p, store, call };
    };
    const C = '$RCAnonymousID:cccccccccccccccccccccccccccccccc';
    const meals = (call: (path: string, user: string, body?: unknown) => Promise<Response> | Response, user: string) =>
      call('/v1/meals', user, { items: [{ name: 'Milk', category: 'dairy', daysLeft: 2 }], diet: 'none', count: 1 });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it('covers everyone in the payer’s household, and nobody else', async () => {
      const { p, call } = setupPlans();
      p.own.set(A, true);
      p.household.set(A, Date.now() + 86_400_000);
      const made = (await (await call('/v1/household', A, { name: 'Home', memberName: 'Sam' })).json()) as { household: { code: string } };
      // Without a plan, B can still join; the answer says the household is covered.
      assert.equal((await meals(call, B)).status, 402);
      const joined = (await (await call('/v1/household/join', B, { code: made.household.code, memberName: 'Alex' })).json()) as { household: { coveredUntil: number | null; members: { sponsor?: boolean }[] } };
      assert.ok(joined.household.coveredUntil);
      assert.deepEqual(joined.household.members.map((m) => m.sponsor ?? false), [true, false]);
      assert.equal((await call('/v1/household/sync', B, { since: 0, changes: [] })).status, 200);
      assert.notEqual((await meals(call, B)).status, 402);
      // C has no plan and no household: only the open household calls answer.
      assert.equal((await meals(call, C)).status, 402);
      assert.equal((await call('/v1/household/sync', C, { since: 0, changes: [] })).status, 402);
      assert.deepEqual(await (await call('/v1/household', C)).json(), { household: null });
      assert.equal((await call('/v1/household', C, { name: 'Mine', memberName: 'C' })).status, 402);
    });

    it('asks the store again when the plan reaches its end date: renewed keeps the cover, ended stops it', async () => {
      const { p, call } = setupPlans();
      p.own.set(A, true);
      p.household.set(A, Date.now() + 40);
      const made = (await (await call('/v1/household', A, { name: 'Home', memberName: 'Sam' })).json()) as { household: { code: string } };
      await call('/v1/household/join', B, { code: made.household.code, memberName: 'Alex' });
      // The plan renews while the payer is away; the housemate is still let in.
      p.household.set(A, Date.now() + 86_400_000);
      await wait(60);
      const before = p.lookups();
      assert.equal((await call('/v1/household/sync', B, { since: 0, changes: [] })).status, 200);
      assert.equal(p.lookups(), before + 1);
      // Covered again until the new date: no more store lookups for a while.
      assert.equal((await call('/v1/household/sync', B, { since: 0, changes: [] })).status, 200);
      assert.equal(p.lookups(), before + 1);
    });

    it('stops covering the household when the plan ends or the payer switches to a plan just for them', async () => {
      const { p, call } = setupPlans();
      p.own.set(A, true);
      p.household.set(A, Date.now() + 40);
      const made = (await (await call('/v1/household', A, { name: 'Home', memberName: 'Sam' })).json()) as { household: { code: string } };
      await call('/v1/household/join', B, { code: made.household.code, memberName: 'Alex' });
      p.household.set(A, null);
      await wait(60);
      assert.equal((await call('/v1/household/sync', B, { since: 0, changes: [] })).status, 402);
      const seen = (await (await call('/v1/household', B)).json()) as { household: { coveredUntil: number | null } };
      assert.equal(seen.household.coveredUntil, null);
      // Leaving is always allowed.
      assert.equal((await call('/v1/household/leave', B, {})).status, 200);

      // Switching plans: the payer's next call ends the cover straight away.
      const { p: q, call: call2 } = setupPlans();
      q.own.set(A, true);
      q.household.set(A, Date.now() + 86_400_000);
      const home = (await (await call2('/v1/household', A, { name: 'Home', memberName: 'Sam' })).json()) as { household: { code: string } };
      await call2('/v1/household/join', B, { code: home.household.code, memberName: 'Alex' });
      q.household.set(A, null);
      await call2('/v1/household/sync', A, { since: 0, changes: [] });
      assert.equal((await call2('/v1/household/sync', B, { since: 0, changes: [] })).status, 402);
    });
  });

  it('answers 503 when the server has no household storage', async () => {
    const call = setup(false);
    assert.equal((await call('/v1/household', A)).status, 503);
  });
});
