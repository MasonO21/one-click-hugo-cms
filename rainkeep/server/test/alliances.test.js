/*
 * Caravans: create, list, edit (leader only), join (cap of 30, closed Caravans), leave (leadership passes to the
 * longest-standing member, the last one out disbands it) and kick.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, T0 } = require('./helpers');

test('create: name required, tag and colour cleaned, caller becomes leader and member', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a', { power: 100 });
  assert.equal((await s.req('POST', '/v1/alliances', { token: a.token, body: { name: '  ', tag: 'X' } })).body.error, 'bad_name');
  const r = await s.req('POST', '/v1/alliances', {
    token: a.token, body: { name: 'Sand Lions of the Western Erg', tag: 'ab!c9z', color: 'red', motto: 'm'.repeat(120), leader: 'someone' },
  });
  assert.equal(r.status, 200);
  const aid = r.body.aid;
  assert.equal(typeof aid, 'string');
  const al = (await s.req('GET', `/v1/alliances/${aid}`, { token: a.token })).body;
  assert.equal(al.name, 'Sand Lions of the Wester');
  assert.equal(al.tag, 'ABC9');
  assert.equal(al.color, '#c8a24a'); // a bad colour falls back to the default
  assert.equal(al.motto.length, 80);
  assert.equal(al.leader, a.id);
  assert.equal(al.open, true);
  assert.equal(al.created, T0);
  assert.equal(al.count, 1);
  assert.deepEqual(al.members.map((m) => m.id), [a.id]);
  assert.equal((await s.req('GET', '/v1/players/me', { token: a.token })).body.aid, aid);
  // a tag can be derived from the name; a second Caravan needs leaving the first
  assert.equal((await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Other' } })).status, 409);
  const b = await s.player('b');
  const r2 = await s.req('POST', '/v1/alliances', { token: b.token, body: { name: 'dune riders', color: '#A0B1C2' } });
  const al2 = (await s.req('GET', `/v1/alliances/${r2.body.aid}`, { token: b.token })).body;
  assert.equal(al2.tag, 'DR');
  assert.equal(al2.color, '#a0b1c2');
  assert.equal((await s.req('GET', '/v1/alliances/nope', { token: b.token })).status, 404);
});

test('list: newest first with member counts, limit capped at 50', async (t) => {
  const s = await start();
  t.after(s.stop);
  const aids = [];
  for (let i = 0; i < 3; i++) {
    const p = await s.player('p' + i);
    aids.push((await s.req('POST', '/v1/alliances', { token: p.token, body: { name: 'Caravan ' + i } })).body.aid);
    s.tick(1000);
  }
  const q = await s.player('q');
  await s.req('POST', `/v1/alliances/${aids[0]}/join`, { token: q.token });
  const list = (await s.req('GET', '/v1/alliances?limit=500', { token: q.token })).body;
  assert.deepEqual(list.map((a) => a.aid), aids.slice().reverse());
  assert.equal(list[2].count, 2);
  assert.equal(list[0].count, 1);
  assert.equal((await s.req('GET', '/v1/alliances?limit=2', { token: q.token })).body.length, 2);
});

test('edits are leader only; name and leader are not editable', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const b = await s.player('b');
  const { aid } = (await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Lions' } })).body;
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: b.token });
  const no = await s.req('PATCH', `/v1/alliances/${aid}`, { token: b.token, body: { motto: 'mine now' } });
  assert.equal(no.status, 403);
  assert.equal(no.body.error, 'not_leader');
  const ok = await s.req('PATCH', `/v1/alliances/${aid}`, { token: a.token, body: { motto: 'Water first', color: '#112233', open: false, name: 'Renamed', leader: b.id } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.motto, 'Water first');
  assert.equal(ok.body.color, '#112233');
  assert.equal(ok.body.open, false);
  assert.equal(ok.body.name, 'Lions');
  assert.equal(ok.body.leader, a.id);
  assert.equal((await s.req('PATCH', '/v1/alliances/nope', { token: a.token, body: {} })).status, 404);
});

test('join: closed Caravans refuse, the 31st member is refused, one Caravan at a time', async (t) => {
  const s = await start();
  t.after(s.stop);
  const lead = await s.player('lead');
  const { aid } = (await s.req('POST', '/v1/alliances', { token: lead.token, body: { name: 'Big' } })).body;
  for (let i = 0; i < 29; i++) {
    const p = await s.player('m' + i);
    const r = await s.req('POST', `/v1/alliances/${aid}/join`, { token: p.token });
    assert.equal(r.status, 200, `member ${i + 2}`);
  }
  assert.equal((await s.req('GET', `/v1/alliances/${aid}`, { token: lead.token })).body.count, 30);
  const late = await s.player('late');
  const full = await s.req('POST', `/v1/alliances/${aid}/join`, { token: late.token });
  assert.equal(full.status, 409);
  assert.equal(full.body.error, 'full');

  const other = await s.player('other');
  const small = (await s.req('POST', '/v1/alliances', { token: other.token, body: { name: 'Small', open: false } })).body.aid;
  const closed = await s.req('POST', `/v1/alliances/${small}/join`, { token: late.token });
  assert.equal(closed.status, 403);
  assert.equal(closed.body.error, 'closed');
  await s.req('PATCH', `/v1/alliances/${small}`, { token: other.token, body: { open: true } });
  assert.equal((await s.req('POST', `/v1/alliances/${small}/join`, { token: late.token })).status, 200);
  // joining again is a no-op; joining another needs leaving first
  assert.equal((await s.req('POST', `/v1/alliances/${small}/join`, { token: late.token })).status, 200);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/join`, { token: late.token })).body.error, 'in_alliance');
  assert.equal((await s.req('POST', '/v1/alliances/nope/join', { token: late.token })).status, 404);
});

test('leave: leadership passes to the longest-standing member; the last one out disbands the Caravan', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const b = await s.player('b');
  const c = await s.player('c');
  assert.equal((await s.req('POST', '/v1/alliances/leave', { token: a.token })).status, 409);
  const { aid } = (await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Lions' } })).body;
  s.tick(1000);
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: c.token }); // c joins before b
  s.tick(1000);
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: b.token });
  await s.req('POST', `/v1/chat/al-${aid}`, { token: a.token, body: { text: 'bye' } });

  const r = await s.req('POST', '/v1/alliances/leave', { token: a.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.leader, c.id);
  const al = (await s.req('GET', `/v1/alliances/${aid}`, { token: b.token })).body;
  assert.equal(al.leader, c.id);
  assert.equal(al.count, 2);
  assert.equal((await s.req('GET', '/v1/players/me', { token: a.token })).body.aid, null);

  await s.req('POST', '/v1/alliances/leave', { token: c.token });
  assert.equal((await s.req('GET', `/v1/alliances/${aid}`, { token: b.token })).body.leader, b.id);
  const last = await s.req('POST', '/v1/alliances/leave', { token: b.token });
  assert.equal(last.body.disbanded, true);
  assert.equal((await s.req('GET', `/v1/alliances/${aid}`, { token: b.token })).status, 404);
  assert.equal(s.db.raw.prepare('SELECT COUNT(*) AS n FROM chat WHERE channel = ?').get('al-' + aid).n, 0);
});

test('kick: leader only, members only, never oneself', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const b = await s.player('b');
  const c = await s.player('c');
  const stranger = await s.player('stranger');
  const { aid } = (await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Lions' } })).body;
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: b.token });
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: c.token });
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/kick`, { token: b.token, body: { id: c.id } })).status, 403);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/kick`, { token: a.token, body: { id: a.id } })).status, 400);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/kick`, { token: a.token, body: {} })).status, 400);
  assert.equal((await s.req('POST', `/v1/alliances/${aid}/kick`, { token: a.token, body: { id: stranger.id } })).status, 404);
  const k = await s.req('POST', `/v1/alliances/${aid}/kick`, { token: a.token, body: { id: c.id } });
  assert.equal(k.status, 200);
  assert.equal((await s.req('GET', '/v1/players/me', { token: c.token })).body.aid, null);
  assert.equal((await s.req('GET', `/v1/alliances/${aid}`, { token: a.token })).body.count, 2);
  // the kicked player can no longer read the Caravan's chat
  assert.equal((await s.req('GET', `/v1/chat/al-${aid}`, { token: c.token })).status, 403);
});
