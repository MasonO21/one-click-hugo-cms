import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { UpstreamError, type ClaudeService } from '../src/claude.js';
import { createHouseholdStore } from '../src/household.js';
import { fakeJpegBase64 } from './helpers.js';

const config = { scansPerDay: 3, mealsPerDay: 3, identifiesPerDay: 3, corsOrigin: null };
const auth = (user: string) => ({ 'content-type': 'application/json', Authorization: `Bearer ${user}` });

describe('allowances', () => {
  it('a request that fails on our side does not use up the day’s allowance; a refusal does', async () => {
    let mode: 'down' | 'refuse' | 'ok' = 'down';
    const claude: ClaudeService = {
      scan: async () => ({ items: [], purchaseDate: null, currency: null, notes: null }),
      meals: async () => {
        if (mode === 'down') throw new UpstreamError('unavailable', 'The AI service is busy.');
        if (mode === 'refuse') throw new UpstreamError('refused', 'Not food.');
        return { meals: [] };
      },
      identify: async () => ({ candidates: [] }),
    };
    const app = createApp({ config, claude, entitlements: { isActive: async () => true } });
    const scan = (user: string) =>
      app.request('/v1/meals', {
        method: 'POST',
        headers: auth(user),
        body: JSON.stringify({ today: '2026-10-05', diet: 'none', servings: 2, items: [{ name: 'Eggs', category: 'dairy', quantity: '6', daysLeft: 2 }] }),
      });
    const outage: number[] = [];
    for (let i = 0; i < 5; i += 1) outage.push((await scan('user-outage-1')).status);
    assert.deepEqual(outage, [503, 503, 503, 503, 503]);
    mode = 'ok';
    assert.equal((await scan('user-outage-1')).status, 200);

    mode = 'refuse';
    const refused: number[] = [];
    for (let i = 0; i < 4; i += 1) refused.push((await scan('user-refused-1')).status);
    assert.deepEqual(refused, [422, 422, 422, 429]);
  });

  it('a call the phone hung up on is stopped and does not use up the day’s allowance', async () => {
    let hang = true;
    const signals: (AbortSignal | undefined)[] = [];
    const claude: ClaudeService = {
      scan: (_req, signal) => {
        signals.push(signal);
        if (!hang) return Promise.resolve({ items: [], purchaseDate: null, currency: null, notes: null });
        return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new UpstreamError('unavailable', 'The request was cancelled.'))));
      },
      meals: async () => ({ meals: [] }),
      identify: async () => ({ candidates: [] }),
    };
    const app = createApp({ config: { ...config, scansPerDay: 1 }, claude, entitlements: { isActive: async () => true } });
    const scan = (signal?: AbortSignal) =>
      app.request('/v1/scan', {
        method: 'POST',
        headers: auth('user-hangup-1'),
        body: JSON.stringify({ location: 'fridge', today: '2026-10-06', locale: 'en-US', images: [{ mediaType: 'image/jpeg', data: fakeJpegBase64() }] }),
        signal,
      });
    const phone = new AbortController();
    const first = scan(phone.signal);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(signals[0]?.aborted, false);
    phone.abort();
    await Promise.resolve(first).catch(() => null);
    assert.equal(signals[0]?.aborted, true, 'the model call is told to stop');
    hang = false;
    assert.equal((await scan()).status, 200, 'the one scan of the day is still there');
    assert.equal((await scan()).status, 429);
  });

  it('caps how many people can join one household in a day', async () => {
    const claude: ClaudeService = { scan: async () => ({ items: [], purchaseDate: null, currency: null, notes: null }), meals: async () => ({ meals: [] }), identify: async () => ({ candidates: [] }) };
    const app = createApp({ config, claude, entitlements: { isActive: async () => true }, households: createHouseholdStore() });
    const made = (await (await app.request('/v1/household', { method: 'POST', headers: auth('owner-0000001'), body: JSON.stringify({ name: 'Home', memberName: 'Owner' }) })).json()) as { household: { code: string } };
    const statuses: number[] = [];
    for (let i = 0; i < 13; i += 1) {
      const user = `cycler-${String(i).padStart(4, '0')}`;
      const res = await app.request('/v1/household/join', { method: 'POST', headers: auth(user), body: JSON.stringify({ code: made.household.code, memberName: `C${i}` }) });
      statuses.push(res.status);
      if (res.status === 200) await app.request('/v1/household/leave', { method: 'POST', headers: auth(user), body: '{}' });
    }
    assert.deepEqual(statuses, [...Array(12).fill(200), 429]);
  });
});
