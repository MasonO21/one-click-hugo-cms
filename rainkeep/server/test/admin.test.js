/*
 * Playtest reports and live config: players write their own report and read the config; only the admin token
 * reads every report and sets the config.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, ADMIN, T0 } = require('./helpers');

test('telemetry: one cleaned report per player, readable with the admin token only', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('ann');
  const b = await s.player('bo');
  const doc = {
    first: T0 - 1000, last: T0, days: [20300, 20296, 20296, 'x', 20301], sessions: 3, secs: 1234.4,
    ftue: { intro: 5, firstBuild: 60 }, stage: 12, wyrm: 4, power: 3456, ver: '4.43.0',
    feat: Object.fromEntries(Array.from({ length: 80 }, (_, i) => ['sheet' + i, i])),
    spend: { n: 2, usd: 9.98, extra: 1 },
    dev: { tier: 'high', gpu: 'Apple GPU', mem: 8, cores: 8, w: 390, h: 844, dpr: 3, ua: 'u'.repeat(400), boot: { ui: 120, keep3d: 800, dunes3d: 950 } },
    fps: 58.5,
    err: Array.from({ length: 25 }, (_, i) => ({ m: 'TypeError ' + i + ' '.repeat(3) + 'e'.repeat(200), n: 1, at: T0 })),
    fb: [{ at: T0, r: 9, t: 'Loved it.\nThe dunes\tlook great.', stage: 12, ver: '4.43.0' }],
    secret: 'dropped',
  };
  assert.deepEqual((await s.req('PUT', '/v1/telemetry', { token: a.token, body: doc })).body, { ok: true });
  await s.req('PUT', '/v1/telemetry', { token: b.token, body: { sessions: 1 } });

  assert.equal((await s.req('GET', '/v1/admin/telemetry')).status, 401);
  assert.equal((await s.req('GET', '/v1/admin/telemetry', { token: a.token })).status, 403);
  assert.equal((await s.req('GET', '/v1/admin/telemetry', { token: ADMIN + 'x' })).status, 403);
  const all = await s.req('GET', '/v1/admin/telemetry', { token: ADMIN });
  assert.equal(all.status, 200);
  assert.equal(all.body.length, 2);
  const r = all.body.find((x) => x.id === a.id);
  assert.equal(r.name, 'ann');
  assert.equal(r.updated, T0);
  assert.deepEqual(r.days, [20296, 20300, 20301]);
  assert.equal(r.secs, 1234);
  assert.equal(Object.keys(r.feat).length, 60);
  assert.equal(r.feat.sheet79, 79); // the busiest 60 are kept
  assert.equal('sheet0' in r.feat, false);
  assert.deepEqual(r.spend, { n: 2, usd: 9.98 });
  assert.equal(r.dev.ua.length, 200);
  assert.deepEqual(r.dev.boot, { ui: 120, keep3d: 800, dunes3d: 950 });
  assert.equal(r.err.length, 20);
  assert.equal(r.err[0].m.length, 160);
  assert.equal(r.err[19].m.slice(0, 13), 'TypeError 24 ');
  assert.deepEqual(r.fb, [{ at: T0, r: 5, t: 'Loved it.\nThe dunes look great.', stage: 12, ver: '4.43.0' }]);
  assert.equal('secret' in r, false);

  // a second report replaces the first
  await s.req('PUT', '/v1/telemetry', { token: a.token, body: { sessions: 4 } });
  const again = (await s.req('GET', '/v1/admin/telemetry', { token: ADMIN })).body.find((x) => x.id === a.id);
  assert.equal(again.sessions, 4);
  assert.equal('days' in again, false);
});

test('live config: default, set by the admin (cleaned), read by players', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('ann');
  assert.deepEqual((await s.req('GET', '/v1/config', { token: a.token })).body, { motd: '', motdId: '', test: { week: 0, focus: '' } });
  assert.equal((await s.req('GET', '/v1/config')).status, 401);
  assert.equal((await s.req('PUT', '/v1/admin/config', { token: a.token, body: { motd: 'hacked' } })).status, 403);
  const put = await s.req('PUT', '/v1/admin/config', { token: ADMIN, body: { motd: 'Welcome to week 2! ' + 'x'.repeat(300), motdId: 7, test: { week: 2, focus: 'Caravans' }, flags: { x: 1 } } });
  assert.equal(put.status, 200);
  assert.equal(put.body.motd.length, 200);
  assert.equal('flags' in put.body, false);
  const got = (await s.req('GET', '/v1/config', { token: a.token })).body;
  assert.equal(got.motdId, 7);
  assert.deepEqual(got.test, { week: 2, focus: 'Caravans' });
});

test('without ADMIN_TOKEN the admin routes are closed to every token', async (t) => {
  const s = await start({ adminToken: '' });
  t.after(s.stop);
  assert.equal((await s.req('GET', '/v1/admin/telemetry', { token: ADMIN })).status, 403);
  assert.equal((await s.req('PUT', '/v1/admin/config', { token: '', body: {} })).status, 401);
});
