import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, client } from './helpers.js';

const srv = await startServer();
after(() => srv.stop());

test('two players are matched together, play, and surrender', async () => {
  const a = client(srv.url), b = client(srv.url);
  await Promise.all([a.open(), b.open()]);
  a.send({ t: 'hello', name: 'Alpha' }); b.send({ t: 'hello', name: 'Bravo' });
  const wa = await a.next(m => m.t === 'welcome'), wb = await b.next(m => m.t === 'welcome');
  assert.ok(wa.token && wb.token && wa.pid !== wb.pid);

  a.send({ t: 'queue', mode: 'quick', heroId: 'kaida', skinId: 'kaida_frost', name: 'Alpha' });
  b.send({ t: 'queue', mode: 'quick', heroId: 'kaida', skinId: 'kaida_classic', name: 'Bravo' });
  const ma = await a.next(m => m.t === 'match'), mb = await b.next(m => m.t === 'match');
  assert.equal(ma.room, mb.room, 'same room');
  assert.equal(ma.roster.length, 6);
  assert.equal(ma.roster.filter(r => r.hu).length, 2, 'two humans, four bots');
  for (const team of [0, 1]) {
    const ids = ma.roster.filter(r => r.tm === team).map(r => r.h);
    assert.equal(new Set(ids).size, 3, 'no duplicate heroes within a team');
  }

  const s0 = await a.next(m => m.t === 's' && m.me);
  const me0 = s0.u.find(u => u.i === s0.me.id);
  assert.ok(me0, 'own hero is in the snapshot');
  assert.equal(s0.me.gold >= 300, true);

  const dir = ma.team === 0 ? 1 : -1;
  a.send({ t: 'in', d: { x: dir, y: 0 }, a: false });
  const s1 = await a.snapshotAfter(1200);
  const me1 = s1.u.find(u => u.i === s1.me.id);
  assert.ok(Math.abs(me1.x - me0.x) > 150, `hero moved ${me1.x - me0.x}`);

  a.send({ t: 'in', d: null, a: false });
  a.send({ t: 'buy', id: 'swift_boots' });
  a.send({ t: 'cast', i: 1, dir: null });   // not learned yet: ignored
  a.send({ t: 'up', i: 1 });
  a.send({ t: 'up', i: 1 });                 // only one point at level 1
  a.send({ t: 'cast', i: 1, dir: null });
  const s2 = await a.snapshotAfter(600);
  assert.deepEqual([s2.me.rk[1], s2.me.pt], [1, 0], 'one point spent on the skill');
  assert.ok(s2.me.items.includes('swift_boots'), 'purchase applied');
  assert.ok(s2.me.cd[1] > 0, 'skill went on cooldown');

  // Garbage input is ignored without crashing the server.
  a.send({ t: 'in', d: { x: 'NaN', y: 1e309 } });
  a.send({ t: 'cast', i: 7 });
  a.send({ t: 'buy', id: '__proto__' });
  a.ws.send('not json');

  a.send({ t: 'surrender' });
  const ea = await a.next(m => m.t === 'end', 5000), eb = await b.next(m => m.t === 'end', 5000);
  assert.equal(ea.winner, 1 - ma.team);
  assert.equal(eb.summary.rows.length, 6);
  assert.ok(srv.errors() === '', srv.errors());
  a.close(); b.close();
});

test('a single player is matched with bots after the queue wait', async () => {
  const c = client(srv.url);
  await c.open();
  c.send({ t: 'hello' });
  await c.next(m => m.t === 'welcome');
  c.send({ t: 'queue', mode: 'ranked', heroId: 'orin', skinId: 'nope' });
  const m = await c.next(m => m.t === 'match', 5000);
  assert.equal(m.roster.filter(r => r.hu).length, 1);
  assert.equal(m.roster.find(r => r.pid === m.pid).sk, 'orin_classic', 'invalid skin falls back to classic');
  c.send({ t: 'surrender' });
  await c.next(m => m.t === 'end', 5000);
  c.close();
});

test('HTTP: login, cloud save, leaderboard, account deletion', async () => {
  const post = (path, body, token) => fetch(srv.http + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const l1 = await (await post('/api/login', { deviceId: 'device-1', name: 'Tester' })).json();
  const l2 = await (await post('/api/login', { deviceId: 'device-1' })).json();
  assert.equal(l1.pid, l2.pid, 'same device, same account');
  const auth = { Authorization: 'Bearer ' + l1.token, 'Content-Type': 'application/json' };
  assert.equal((await fetch(srv.http + '/api/save')).status, 401);
  const put = await fetch(srv.http + '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ save: { v: 1, coins: 77, name: 'Tester' } }) });
  assert.equal(put.status, 200);
  const got = await (await fetch(srv.http + '/api/save', { headers: auth })).json();
  assert.equal(got.save.coins, 77);
  const big = await fetch(srv.http + '/api/save', { method: 'PUT', headers: auth, body: JSON.stringify({ save: { blob: 'x'.repeat(70000) } }) });
  assert.equal(big.status, 413, 'oversized saves are rejected');
  const lb = await (await fetch(srv.http + '/api/leaderboard')).json();
  assert.ok(Array.isArray(lb.top));
  const del = await fetch(srv.http + '/api/account', { method: 'DELETE', headers: auth });
  assert.equal(del.status, 200);
  assert.equal((await fetch(srv.http + '/api/save', { headers: auth })).status, 401, 'deleted account can no longer sign in');
  const h = await (await fetch(srv.http + '/health')).json();
  assert.equal(h.ok, true);
});
