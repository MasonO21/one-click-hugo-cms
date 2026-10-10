/*
 * Help requests (once per helper, never one's own, at most `need`, the requester deletes) and the Caravan boss
 * (members only, 3 hits a day, the power × 50 plausibility cap).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, T0, DAY } = require('./helpers');
const { RULES } = require('../src/app');

async function caravan(s, n, profile) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(await s.player('m' + i, profile));
  const { aid } = (await s.req('POST', '/v1/alliances', { token: ps[0].token, body: { name: 'Lions' } })).body;
  for (const p of ps.slice(1)) await s.req('POST', `/v1/alliances/${aid}/join`, { token: p.token });
  return { aid, ps };
}

test('help requests: ask, list, help once each, never your own, at most `need`, delete your own', async (t) => {
  const s = await start();
  t.after(s.stop);
  const loner = await s.player('loner');
  assert.equal((await s.req('POST', '/v1/helps', { token: loner.token, body: { plot: 'hall', need: 2 } })).body.error, 'no_alliance');
  const { aid, ps: [a, b, c, d] } = await caravan(s, 4);

  assert.equal((await s.req('POST', '/v1/helps', { token: a.token, body: { label: 'no plot' } })).status, 400);
  const ask = await s.req('POST', '/v1/helps', { token: a.token, body: { plot: 'hall', label: 'Caravan Hall Lv 5 and a label that is far too long', end: T0 + 3600e3, need: 2, aid: 'elsewhere' } });
  assert.equal(ask.status, 200);
  const rid = ask.body.rid;
  const list = (await s.req('GET', '/v1/helps', { token: b.token })).body;
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], { rid, aid, by: a.id, plot: 'hall', label: 'Caravan Hall Lv 5 and a label that is far t'.slice(0, 40).trim(), at: T0, end: T0 + 3600e3, need: 2, hs: {} });
  assert.deepEqual((await s.req('GET', '/v1/helps', { token: loner.token })).body, []);

  const own = await s.req('POST', `/v1/helps/${rid}/help`, { token: a.token });
  assert.equal(own.status, 403);
  assert.equal(own.body.error, 'own_request');
  assert.equal((await s.req('POST', `/v1/helps/${rid}/help`, { token: loner.token })).status, 403);
  const h1 = await s.req('POST', `/v1/helps/${rid}/help`, { token: b.token });
  assert.deepEqual(h1.body, { ok: true, n: 1 });
  const again = await s.req('POST', `/v1/helps/${rid}/help`, { token: b.token });
  assert.equal(again.status, 409);
  assert.equal(again.body.error, 'already_helped');
  assert.equal((await s.req('POST', `/v1/helps/${rid}/help`, { token: c.token })).body.n, 2);
  const full = await s.req('POST', `/v1/helps/${rid}/help`, { token: d.token });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, 'help_full');
  // the requester still sees the full request (to apply the last help) until it deletes it
  const mine = (await s.req('GET', '/v1/helps', { token: a.token })).body[0];
  assert.deepEqual(Object.keys(mine.hs).sort(), [b.id, c.id].sort());

  assert.equal((await s.req('DELETE', `/v1/helps/${rid}`, { token: b.token })).status, 403);
  assert.equal((await s.req('DELETE', `/v1/helps/${rid}`, { token: a.token })).status, 200);
  assert.equal((await s.req('DELETE', `/v1/helps/${rid}`, { token: a.token })).status, 404);
  assert.equal((await s.req('POST', `/v1/helps/${rid}/help`, { token: d.token })).status, 404);
  assert.deepEqual((await s.req('GET', '/v1/helps', { token: a.token })).body, []);
});

test('help requests: need clamped to 1-10, ended builds refuse help, requests expire after a day, 10 open at most', async (t) => {
  const s = await start();
  t.after(s.stop);
  const { ps: [a, b] } = await caravan(s, 2);
  const big = await s.req('POST', '/v1/helps', { token: a.token, body: { plot: 'well', need: 50, end: T0 + 60e3 } });
  const r = (await s.req('GET', '/v1/helps', { token: a.token })).body[0];
  assert.equal(r.need, 10);
  s.tick(61e3);
  assert.equal((await s.req('POST', `/v1/helps/${big.body.rid}/help`, { token: b.token })).body.error, 'ended');
  s.tick(DAY);
  assert.deepEqual((await s.req('GET', '/v1/helps', { token: a.token })).body, []);
  assert.equal((await s.req('POST', `/v1/helps/${big.body.rid}/help`, { token: b.token })).status, 404);
  for (let i = 0; i < RULES.MAX_OPEN_HELPS; i++) {
    assert.equal((await s.req('POST', '/v1/helps', { token: a.token, body: { plot: 'p' + i } })).status, 200);
  }
  assert.equal((await s.req('POST', '/v1/helps', { token: a.token, body: { plot: 'one more' } })).status, 429);
});

test('a member who leaves takes their help requests along', async (t) => {
  const s = await start();
  t.after(s.stop);
  const { ps: [a, b] } = await caravan(s, 2);
  await s.req('POST', '/v1/helps', { token: b.token, body: { plot: 'hall' } });
  assert.equal((await s.req('GET', '/v1/helps', { token: a.token })).body.length, 1);
  await s.req('POST', '/v1/alliances/leave', { token: b.token });
  assert.equal((await s.req('GET', '/v1/helps', { token: a.token })).body.length, 0);
});

test('Caravan boss: members only, first hit sets hp, 3 hits a day, power × 50 cap, retries are free', async (t) => {
  const s = await start();
  t.after(s.stop);
  const { aid, ps: [a, b] } = await caravan(s, 2, { power: 1000 });
  const out = await s.player('out', { power: 1000 });
  const day = Math.floor(T0 / DAY);
  assert.equal(RULES.BOSS_DAMAGE_PER_POWER, 50);

  assert.equal((await s.req('GET', `/v1/alliances/${aid}/boss?day=${day}`, { token: a.token })).status, 404);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: out.token, body: { day, hp: 1e5, total: 10 } })).status, 403);
  assert.equal((await s.req('GET', `/v1/alliances/${aid}/boss?day=${day}`, { token: out.token })).status, 403);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day: day + 5, hp: 1e5, total: 10 } })).body.error, 'bad_day');
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, total: 10 } })).body.error, 'bad_hp');
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5 } })).body.error, 'bad_total');

  const h1 = await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 10000 } });
  assert.equal(h1.status, 200);
  assert.equal(h1.body.hp, 1e5);
  assert.deepEqual(h1.body.dmg, { [a.id]: 10000 });
  // the boss's hp is fixed by the first hit of the day
  const hb = await s.req('POST', `/v1/alliances/${aid}/boss`, { token: b.token, body: { day, hp: 1, total: 5000 } });
  assert.equal(hb.body.hp, 1e5);
  assert.deepEqual(hb.body.dmg, { [a.id]: 10000, [b.id]: 5000 });

  // a total beyond power × 50 (here 50,000) is refused and uses no hit
  const cheat = await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 50001 } });
  assert.equal(cheat.status, 400);
  assert.equal(cheat.body.error, 'implausible');
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 20000 } })).status, 200);
  // a retry of the same total (or a smaller one) changes nothing and is free
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 20000 } })).status, 200);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 15000 } })).body.dmg[a.id], 20000);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 50000 } })).status, 200);
  const fourth = await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day, hp: 1e5, total: 50000.5 } });
  assert.equal(fourth.status, 429);
  assert.equal(fourth.body.error, 'hit_limit');

  const g = await s.req('GET', `/v1/alliances/${aid}/boss?day=${day}`, { token: b.token });
  assert.deepEqual(g.body.dmg, { [a.id]: 50000, [b.id]: 5000 });
  assert.deepEqual(g.body.hits, { [a.id]: 3, [b.id]: 1 });
  // the next day is a new boss with new hits
  s.tick(DAY);
  const next = await s.req('POST', `/v1/alliances/${aid}/boss`, { token: a.token, body: { day: day + 1, hp: 2e5, total: 100 } });
  assert.equal(next.body.hp, 2e5);
  assert.deepEqual(next.body.dmg, { [a.id]: 100 });
});
