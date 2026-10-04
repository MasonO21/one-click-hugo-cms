import assert from 'node:assert/strict';
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

  it('answers 503 when the server has no household storage', async () => {
    const call = setup(false);
    assert.equal((await call('/v1/household', A)).status, 503);
  });
});
