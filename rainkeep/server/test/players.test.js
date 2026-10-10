/*
 * Profiles (clamping), leaderboards, lookups and Arena opponents.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, T0 } = require('./helpers');

test('profile upsert clamps numbers, cuts strings, restricts cls and drops unknown and server-owned fields', async (t) => {
  const s = await start();
  t.after(s.stop);
  const p = await s.player('ann');
  const r = await s.req('PUT', '/v1/players/me', {
    token: p.token,
    body: {
      v: 7, keep: 'Ashwyrm\n‮of the Long Dry Road Beyond', power: 1e15, wyrm: 99, skin: 'dune', stage: 1000, cls: 'wizard',
      squad: [{ id: 'kesh', lvl: 5000, stars: -3 }, { id: '', lvl: 1 }, 'junk', { id: 'b', lvl: 2, stars: 9 }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }],
      lp: 99999, aid: 'stolen', seen: 1, ver: '4.43.0-beta.long', admin: true, __proto__: { x: 1 },
    },
  });
  assert.equal(r.status, 200);
  const b = r.body;
  assert.equal(b.id, p.id);
  assert.equal(b.name, 'ann');
  assert.equal(b.v, 1);
  assert.equal(b.keep, 'Ashwyrm of the Long Dry'); // line break to a space, bidi override gone, cut to 24 and trimmed
  assert.equal(b.power, 1e9);
  assert.equal(b.wyrm, 40);
  assert.equal(b.stage, 400);
  assert.equal(b.cls, 'guard'); // an unknown class leaves the default
  assert.equal(b.squad.length, 5);
  assert.deepEqual(b.squad[0], { id: 'kesh', lvl: 999, stars: 0 });
  assert.deepEqual(b.squad[1], { id: 'b', lvl: 2, stars: 9 });
  assert.deepEqual(b.squad[2], { id: 'c', lvl: 1, stars: 0 });
  assert.equal(b.lp, 0); // Arena points are the server's
  assert.equal(b.aid, null); // membership too
  assert.equal(b.seen, T0); // stamped by the server
  assert.equal(b.ver, '4.43.0-beta.');
  assert.equal('admin' in b, false);

  // a partial update keeps the other fields; a bad number is ignored rather than zeroing the field
  const u = await s.req('PUT', '/v1/players/me', { token: p.token, body: { cls: 'lancer', power: 'lots', wyrm: 0, stage: -5 } });
  assert.equal(u.body.cls, 'lancer');
  assert.equal(u.body.power, 1e9);
  assert.equal(u.body.wyrm, 1);
  assert.equal(u.body.stage, 1);
  assert.equal(u.body.keep, b.keep);
  // a name in the profile renames the player
  assert.equal((await s.req('PUT', '/v1/players/me', { token: p.token, body: { name: 'Annika' } })).body.name, 'Annika');
});

test('leaderboards by power and by lp, lookups by id and by Caravan', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a', { power: 500, keep: 'A' });
  const b = await s.player('b', { power: 900, keep: 'B' });
  const c = await s.player('c', { power: 700, keep: 'C' });
  await s.player('ghost'); // signed in but never wrote a profile: not on the boards
  s.db.setLp(a.id, 300);
  s.db.setLp(c.id, 100);

  const byPower = await s.req('GET', '/v1/players?order=power', { token: a.token });
  assert.deepEqual(byPower.body.map((x) => x.id), [b.id, c.id, a.id]);
  assert.ok(byPower.body.every((x) => typeof x.name === 'string' && x.id));
  const byLp = await s.req('GET', '/v1/players?order=lp&limit=2', { token: a.token });
  assert.deepEqual(byLp.body.map((x) => x.id), [a.id, c.id]);
  // limit is capped at 100 and junk falls back to the default
  assert.equal((await s.req('GET', '/v1/players?limit=5000', { token: a.token })).status, 200);
  assert.equal((await s.req('GET', '/v1/players?limit=abc', { token: a.token })).body.length, 3);

  const ids = await s.req('GET', `/v1/players?ids=${b.id},${c.id},nobody`, { token: a.token });
  assert.deepEqual(ids.body.map((x) => x.id).sort(), [b.id, c.id].sort());

  const one = await s.req('GET', `/v1/players/${c.id}`, { token: a.token });
  assert.equal(one.body.keep, 'C');
  assert.equal((await s.req('GET', '/v1/players/me', { token: a.token })).body.id, a.id);
  assert.equal((await s.req('GET', '/v1/players/nobody', { token: a.token })).status, 404);

  const al = await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Sand Lions' } });
  const mem = await s.req('GET', `/v1/players?aid=${al.body.aid}`, { token: b.token });
  assert.deepEqual(mem.body.map((x) => x.id), [a.id]);
  assert.equal(mem.body[0].aid, al.body.aid);
});

test('opponents are within ±40% of the given power and never the caller', async (t) => {
  const s = await start();
  t.after(s.stop);
  const me = await s.player('me', { power: 1000 });
  const ps = {};
  for (const pw of [500, 599, 600, 1000, 1200, 1400, 1401, 3000]) ps[pw] = await s.player('p' + pw, { power: pw });
  const r = await s.req('GET', '/v1/players/opponents?power=1000&limit=20', { token: me.token });
  assert.equal(r.status, 200);
  const got = r.body.map((x) => x.power).sort((x, y) => x - y);
  assert.deepEqual(got, [600, 1000, 1200, 1400]);
  assert.ok(!r.body.some((x) => x.id === me.id));
  // limit is capped at 20; without power the caller's own is used
  assert.equal((await s.req('GET', '/v1/players/opponents?limit=2', { token: me.token })).body.length, 2);
  assert.equal((await s.req('GET', '/v1/players/opponents?power=3000', { token: me.token })).body.length, 1);
});
