/*
 * Health, sign-in, tokens, errors, limits, headers and cloud saves.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');

test('health, headers and CORS', async (t) => {
  const s = await start();
  t.after(s.stop);
  const h = await s.req('GET', '/v1/health');
  assert.equal(h.status, 200);
  assert.equal(h.body.ok, true);
  assert.equal(typeof h.body.version, 'string');
  assert.equal(h.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(h.headers.get('access-control-allow-origin'), '*');
  assert.match(h.headers.get('content-type'), /application\/json/);
  assert.equal(h.headers.get('cache-control'), 'no-store');

  const pre = await fetch(s.url + '/v1/players/me', { method: 'OPTIONS', headers: { Origin: 'https://x.example', 'Access-Control-Request-Method': 'PUT' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('access-control-allow-methods'), /PUT/);
  assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
});

test('CORS_ORIGIN as a list echoes only the listed origins', async (t) => {
  const s = await start({ corsOrigin: 'https://rainkeep.example, capacitor://localhost' });
  t.after(s.stop);
  const ok = await s.req('GET', '/v1/health', { headers: { Origin: 'capacitor://localhost' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.match(ok.headers.get('vary'), /Origin/);
  const no = await s.req('GET', '/v1/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('device sign-in: one account per deviceId, a fresh token each time, only hashes stored', async (t) => {
  const s = await start();
  t.after(s.stop);
  assert.equal((await s.req('POST', '/v1/auth', { body: {} })).status, 400);
  assert.equal((await s.req('POST', '/v1/auth', { body: { deviceId: 'short' } })).body.error, 'bad_device');

  const a = await s.req('POST', '/v1/auth', { body: { deviceId: 'device-0001-abcdef', name: 'Ann\u0007 of the  Dunes and a very long name indeed' } });
  assert.equal(a.status, 200);
  assert.equal(typeof a.body.token, 'string');
  assert.ok(a.body.token.length >= 40);
  assert.equal(a.body.name, 'Ann of the Dunes and a v'); // control char gone, spaces collapsed, cut to 24
  const again = await s.req('POST', '/v1/auth', { body: { deviceId: 'device-0001-abcdef' } });
  assert.equal(again.body.id, a.body.id);
  assert.notEqual(again.body.token, a.body.token);
  // both tokens work
  assert.equal((await s.req('GET', '/v1/me', { token: a.body.token })).body.id, a.body.id);
  assert.equal((await s.req('GET', '/v1/me', { token: again.body.token })).body.id, a.body.id);

  // no token or deviceId is stored in the clear
  const tokens = s.db.raw.prepare('SELECT hash FROM tokens').all().map((r) => r.hash);
  assert.ok(!tokens.includes(a.body.token) && tokens.length === 2);
  const devices = s.db.raw.prepare('SELECT device FROM players').all().map((r) => r.device);
  assert.ok(!devices.includes('device-0001-abcdef'));

  // a player keeps their newest 5 tokens: the 6th sign-in retires the first
  for (let i = 0; i < 4; i++) await s.req('POST', '/v1/auth', { body: { deviceId: 'device-0001-abcdef' } });
  assert.equal((await s.req('GET', '/v1/me', { token: a.body.token })).status, 401);
  assert.equal((await s.req('GET', '/v1/me', { token: again.body.token })).status, 200);

  // without a name the server picks one
  const b = await s.req('POST', '/v1/auth', { body: { deviceId: 'device-0002-abcdef' } });
  assert.match(b.body.name, /^Warden /);
  assert.notEqual(b.body.id, a.body.id);
});

test('auth failures are 401 with a JSON error', async (t) => {
  const s = await start();
  t.after(s.stop);
  const none = await s.req('GET', '/v1/me');
  assert.equal(none.status, 401);
  assert.deepEqual(Object.keys(none.body).sort(), ['error', 'message']);
  assert.equal(none.body.error, 'no_token');
  assert.equal((await s.req('GET', '/v1/me', { token: 'not-a-real-token' })).body.error, 'bad_token');
  assert.equal((await s.req('GET', '/v1/me', { headers: { Authorization: 'Basic abc' } })).status, 401);
  assert.equal((await s.req('PUT', '/v1/players/me', { body: { keep: 'x' } })).status, 401);
  // ?token= is for the event stream only
  const p = await s.player('ann');
  assert.equal((await s.req('GET', '/v1/me?token=' + p.token)).status, 401);
  assert.equal((await s.req('GET', '/v1/config', { token: p.token })).status, 200);
});

test('names: PATCH /v1/me', async (t) => {
  const s = await start();
  t.after(s.stop);
  const p = await s.player('ann');
  const r = await s.req('PATCH', '/v1/me', { token: p.token, body: { name: '  Queen of Ash  ' } });
  assert.deepEqual(r.body, { id: p.id, name: 'Queen of Ash' });
  assert.equal((await s.req('GET', `/v1/players/${p.id}`, { token: p.token })).body.name, 'Queen of Ash');
  assert.equal((await s.req('PATCH', '/v1/me', { token: p.token, body: { name: '\u0000‮ ' } })).status, 400);
  assert.equal((await s.req('PATCH', '/v1/me', { token: p.token, body: { name: 'x'.repeat(50) } })).body.name.length, 24);
});

test('routing, bad bodies and the 600 KB body limit', async (t) => {
  const s = await start();
  t.after(s.stop);
  const p = await s.player('ann');
  assert.equal((await s.req('GET', '/v1/nothing', { token: p.token })).status, 404);
  assert.equal((await s.req('DELETE', '/v1/health')).status, 405);
  const bad = await s.req('PUT', '/v1/players/me', { token: p.token, body: '{"keep": ' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'bad_json');
  assert.equal((await s.req('PUT', '/v1/players/me', { token: p.token, body: '[1,2]' })).body.error, 'bad_body');
  const big = await s.req('PUT', '/v1/telemetry', { token: p.token, body: { pad: 'x'.repeat(610 * 1024) } });
  assert.equal(big.status, 413);
  assert.equal(big.body.error, 'too_large');
  // the server is still fine afterwards
  assert.equal((await s.req('GET', '/v1/health')).status, 200);
});

test('cloud save: put, get, 404 before, 512 KB cap', async (t) => {
  const s = await start();
  t.after(s.stop);
  const p = await s.player('ann');
  assert.equal((await s.req('GET', '/v1/save', { token: p.token })).status, 404);
  assert.equal((await s.req('PUT', '/v1/save', { token: p.token, body: { code: 'RK1:abc', at: 1234 } })).body.ok, true);
  assert.deepEqual((await s.req('GET', '/v1/save', { token: p.token })).body, { code: 'RK1:abc', at: 1234 });
  assert.equal((await s.req('PUT', '/v1/save', { token: p.token, body: { code: 42 } })).status, 400);
  const big = await s.req('PUT', '/v1/save', { token: p.token, body: { code: 'x'.repeat(512 * 1024 + 1) } });
  assert.equal(big.status, 413);
  const max = await s.req('PUT', '/v1/save', { token: p.token, body: { code: 'y'.repeat(512 * 1024) } });
  assert.equal(max.status, 200);
  // another player can't read it
  const q = await s.player('bo');
  assert.equal((await s.req('GET', '/v1/save', { token: q.token })).status, 404);
});
