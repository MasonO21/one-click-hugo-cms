import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { destination } from '../public/lib/geo.js';
import { makeDemoTrail } from '../public/lib/sim.js';

let tmp;
let base;
let app;

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'waypath-'));
  await mkdir(join(tmp, 'public'));
  await writeFile(join(tmp, 'public', 'index.html'), '<h1>hi</h1>');
  await writeFile(join(tmp, 'secret.txt'), 'nope');
  app = await createApp({ dataDir: join(tmp, 'trails'), publicDir: join(tmp, 'public'), uploadsPerHour: 6 });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  await new Promise((r) => app.server.close(r));
  await rm(tmp, { recursive: true, force: true });
});

const post = (body, headers = {}) =>
  fetch(`${base}/api/trails`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('serves static files with security headers; blocks traversal', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), '<h1>hi</h1>');
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/%00']) {
    const bad = await fetch(`${base}${p}`);
    assert.ok([400, 403, 404].includes(bad.status), `${p} -> ${bad.status}`);
    assert.doesNotMatch(await bad.text(), /nope/);
  }
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
});

test('publish -> nearby -> fetch -> unpublish', async () => {
  const demo = makeDemoTrail({ lat: 40, lng: -105 });
  const r = await post({ ...demo, id: 'client-chosen', stats: { distance: 1 } });
  assert.equal(r.status, 201);
  const { id, deleteToken } = await r.json();
  assert.match(id, /^[0-9a-f-]{36}$/, 'server assigns the id, ignoring the client one');
  assert.ok(deleteToken.length >= 24);

  // nearby: inside and outside the radius
  const near = await (await fetch(`${base}/api/trails?lat=40.01&lng=-105&radiusKm=5`)).json();
  assert.equal(near.trails.length, 1);
  assert.equal(near.trails[0].id, id);
  assert.ok(near.trails[0].distanceFromUserM > 1000 && near.trails[0].distanceFromUserM < 1200);
  assert.equal(near.trails[0].points, undefined, 'list must not ship geometry');
  assert.equal(near.trails[0].stats.distance, demo.stats.distance, 'server recomputes stats');
  const far = destination({ lat: 40, lng: -105 }, 0, 100_000);
  assert.equal((await (await fetch(`${base}/api/trails?lat=${far.lat}&lng=${far.lng}&radiusKm=50`)).json()).trails.length, 0);

  const full = await (await fetch(`${base}/api/trails/${id}`)).json();
  assert.equal(full.points.length, demo.points.length);
  assert.equal(full.waypoints.length, 4);
  assert.equal(full.tokenHash, undefined);
  assert.equal(JSON.stringify(full).includes(deleteToken), false);

  assert.equal((await fetch(`${base}/api/trails/${id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await fetch(`${base}/api/trails/${id}`, { method: 'DELETE', headers: { 'x-delete-token': 'wrong' } })).status, 403);
  assert.equal((await fetch(`${base}/api/trails/${id}`, { method: 'DELETE', headers: { 'x-delete-token': deleteToken } })).status, 200);
  assert.equal((await fetch(`${base}/api/trails/${id}`)).status, 404);
  assert.equal((await (await fetch(`${base}/api/trails?lat=40&lng=-105`)).json()).trails.length, 0);
});

test('rejects bad uploads with useful errors', async () => {
  assert.equal((await post('{not json')).status, 400);
  const r = await post({ points: [[1, 2]] });
  assert.equal(r.status, 422);
  assert.match((await r.json()).error, /at least 2/);
  assert.equal((await fetch(`${base}/api/trails`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
  const huge = { points: [[1, 1], [2, 2]], description: 'x'.repeat(9 * 1024 * 1024) };
  assert.equal((await post(huge)).status, 413);
});

test('bad ids and unknown routes', async () => {
  for (const id of ['../etc/passwd', '..%2f..%2fetc%2fpasswd', 'x', '00000000-0000-0000-0000-000000000000']) {
    assert.equal((await fetch(`${base}/api/trails/${id}`)).status, 404, id);
  }
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'PUT' })).status, 405);
});

test('store survives a restart', async () => {
  const r = await post(makeDemoTrail({ lat: 10, lng: 10 }));
  const { id } = await r.json();
  const again = await createApp({ dataDir: join(tmp, 'trails'), publicDir: join(tmp, 'public') });
  assert.ok(again.store.index.has(id));
});

test('upload rate limit', async () => {
  let last;
  for (let i = 0; i < 8; i++) last = (await post({ points: [[1, 2]] })).status;
  assert.equal(last, 429);
});
