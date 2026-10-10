/*
 * Arena: the server computes and applies the points, allows 5 attacks a day within ±40% power, and the defender
 * reads the records naming them.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, T0, DAY } = require('./helpers');
const { arenaPoints } = require('../src/app');

test('arenaPoints: 20 between equals, more for beating a higher keep, clamped to 8-40', () => {
  assert.equal(arenaPoints(0, 0), 20);
  assert.equal(arenaPoints(100, 150), 22);
  assert.equal(arenaPoints(500, 0), 8);
  assert.equal(arenaPoints(0, 2000), 40);
  assert.equal(arenaPoints(300, 200), 16);
});

test('a win moves points from the defender, a loss costs the attacker 5, floored at 0', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a', { power: 1000 });
  const b = await s.player('b', { power: 1200 });
  s.db.setLp(a.id, 100);
  s.db.setLp(b.id, 150);

  const w = await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: true, ap: 1, dp: 999999 } });
  assert.equal(w.status, 200);
  assert.equal(w.body.win, true);
  assert.equal(w.body.d, 22); // round(20 + (150 - 100) / 25)
  assert.equal(w.body.lp, 122);
  assert.equal(w.body.left, 4);
  assert.equal((await s.req('GET', `/v1/players/${b.id}`, { token: a.token })).body.lp, 128);

  const l = await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: false } });
  assert.equal(l.body.d, 0);
  assert.equal(l.body.lp, 117);
  assert.equal((await s.req('GET', `/v1/players/${b.id}`, { token: a.token })).body.lp, 128);

  // floors: a defender with 3 points loses 3; an attacker with 2 points who loses ends at 0
  s.db.setLp(b.id, 3);
  await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: true } });
  assert.equal((await s.req('GET', `/v1/players/${b.id}`, { token: a.token })).body.lp, 0);
  s.db.setLp(b.id, 2);
  const bl = await s.req('POST', '/v1/battles', { token: b.token, body: { def: a.id, win: false } });
  assert.equal(bl.body.lp, 0);
});

test('the defender reads the records naming them, with the server-side powers', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a', { power: 1000 });
  const b = await s.player('b', { power: 900 });
  const c = await s.player('c', { power: 1100 });
  await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: true, ap: 5, dp: 5 } });
  s.tick(1000);
  await s.req('POST', '/v1/battles', { token: c.token, body: { def: b.id, win: false } });
  await s.req('POST', '/v1/battles', { token: b.token, body: { def: a.id, win: true } });

  const recs = (await s.req('GET', '/v1/battles?since=0', { token: b.token })).body;
  assert.equal(recs.length, 2);
  assert.deepEqual(recs[0], { bid: recs[0].bid, att: a.id, def: b.id, win: true, at: T0, d: 20, ap: 1000, dp: 900 });
  assert.equal(recs[1].att, c.id);
  assert.equal(recs[1].win, false);
  const later = (await s.req('GET', `/v1/battles?since=${T0}`, { token: b.token })).body;
  assert.deepEqual(later.map((r) => r.att), [c.id]);
  // the attacker isn't the defender of their own records
  assert.deepEqual((await s.req('GET', '/v1/battles', { token: c.token })).body, []);
  // records older than three days are gone
  s.tick(3 * DAY + 2000);
  assert.deepEqual((await s.req('GET', '/v1/battles?since=0', { token: b.token })).body, []);
});

test('refusals: 5 attacks a day, out of range, yourself, unknown defender, a missing result', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a', { power: 1000 });
  const b = await s.player('b', { power: 1400 });
  const weak = await s.player('weak', { power: 599 });
  const strong = await s.player('strong', { power: 1401 });

  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { def: a.id, win: true } })).body.error, 'self');
  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { def: 'nobody', win: true } })).status, 404);
  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id } })).body.error, 'bad_win');
  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { win: true } })).body.error, 'bad_def');
  const far = await s.req('POST', '/v1/battles', { token: a.token, body: { def: strong.id, win: true } });
  assert.equal(far.status, 403);
  assert.equal(far.body.error, 'out_of_range');
  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { def: weak.id, win: true } })).status, 403);

  for (let i = 0; i < 5; i++) {
    const r = await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: i % 2 === 0 } });
    assert.equal(r.status, 200, 'attack ' + (i + 1));
    assert.equal(r.body.left, 4 - i);
  }
  const sixth = await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: true } });
  assert.equal(sixth.status, 429);
  assert.equal(sixth.body.error, 'attack_limit');
  assert.equal(sixth.headers.get('retry-after'), String(12 * 3600)); // T0 is noon UTC
  // the next UTC day brings 5 more
  s.tick(12 * 3600e3);
  assert.equal((await s.req('POST', '/v1/battles', { token: a.token, body: { def: b.id, win: true } })).status, 200);
});

test('revenge: a keep that attacked you may be hit back whatever the power gap, for three days', async (t) => {
  const s = await start();
  t.after(s.stop);
  const strong = await s.player('strong', { power: 2000 });
  const weak = await s.player('weak', { power: 1000 });
  // strong attacks weak (within strong's band only after strong's power is lowered for the test)
  s.db.raw.prepare('UPDATE players SET power = 1300 WHERE id = ?').run(strong.id);
  assert.equal((await s.req('POST', '/v1/battles', { token: strong.token, body: { def: weak.id, win: true } })).status, 200);
  s.db.raw.prepare('UPDATE players SET power = 2000 WHERE id = ?').run(strong.id);
  const third = await s.player('third', { power: 2000 });
  // weak (1000) may not pick on a 2000 keep in general, but may take revenge on the one that attacked
  assert.equal((await s.req('POST', '/v1/battles', { token: weak.token, body: { def: third.id, win: true } })).status, 403);
  assert.equal((await s.req('POST', '/v1/battles', { token: weak.token, body: { def: strong.id, win: true } })).status, 200);
  s.tick(3 * DAY + 1000);
  assert.equal((await s.req('POST', '/v1/battles', { token: weak.token, body: { def: strong.id, win: true } })).status, 403);
});
