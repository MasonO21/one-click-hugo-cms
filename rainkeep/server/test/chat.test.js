/*
 * Chat: world and Caravan channels, members only, 1 message per 2 s, 200 characters, newest 100 kept, reports.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, ADMIN, T0 } = require('./helpers');

test('world chat: send and read, oldest first, since filter, names attached', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('ann');
  const b = await s.player('bo');
  const m1 = await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: '  Rain\ttoday?  ' } });
  assert.equal(m1.status, 200);
  assert.deepEqual(m1.body, { mid: m1.body.mid, by: a.id, name: 'ann', at: T0, text: 'Rain today?' });
  s.tick(500);
  await s.req('POST', '/v1/chat/world', { token: b.token, body: { text: 'Only in the north.' } });
  const all = (await s.req('GET', '/v1/chat/world', { token: a.token })).body;
  assert.deepEqual(all.map((m) => m.text), ['Rain today?', 'Only in the north.']);
  const since = (await s.req('GET', `/v1/chat/world?since=${T0}`, { token: a.token })).body;
  assert.deepEqual(since.map((m) => m.by), [b.id]);
  assert.equal((await s.req('GET', '/v1/chat/lobby', { token: a.token })).status, 404);
  assert.equal((await s.req('GET', '/v1/chat/world')).status, 401);
});

test('a Caravan channel is for its members only', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const out = await s.player('out');
  const { aid } = (await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Lions' } })).body;
  assert.equal((await s.req('POST', `/v1/chat/al-${aid}`, { token: a.token, body: { text: 'members only' } })).status, 200);
  const no = await s.req('GET', `/v1/chat/al-${aid}`, { token: out.token });
  assert.equal(no.status, 403);
  assert.equal(no.body.error, 'not_member');
  assert.equal((await s.req('POST', `/v1/chat/al-${aid}`, { token: out.token, body: { text: 'let me in' } })).status, 403);
  assert.equal((await s.req('GET', `/v1/chat/al-${aid}`, { token: a.token })).body.length, 1);
});

test('one message per 2 seconds per player; empty refused; 200 characters kept', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const b = await s.player('b');
  assert.equal((await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'one' } })).status, 200);
  s.tick(1500);
  const slow = await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'two' } });
  assert.equal(slow.status, 429);
  assert.equal(slow.body.error, 'slow_down');
  assert.equal(slow.headers.get('retry-after'), '1');
  // the limit is per player
  assert.equal((await s.req('POST', '/v1/chat/world', { token: b.token, body: { text: 'hi' } })).status, 200);
  s.tick(500);
  assert.equal((await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'two' } })).status, 200);
  s.tick(2000);
  assert.equal((await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: ' \u0000 ' } })).status, 400);
  const long = await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'w'.repeat(300) } });
  assert.equal(long.status, 200);
  assert.equal(long.body.text.length, 200);
});

test('each channel keeps its newest 100 messages', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  for (let i = 1; i <= 105; i++) {
    s.tick(2000);
    const r = await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'm' + i } });
    assert.equal(r.status, 200);
  }
  const list = (await s.req('GET', '/v1/chat/world', { token: a.token })).body;
  assert.equal(list.length, 100);
  assert.equal(list[0].text, 'm6');
  assert.equal(list[99].text, 'm105');
  assert.equal(s.db.raw.prepare("SELECT COUNT(*) AS n FROM chat WHERE channel = 'world'").get().n, 100);
});

test('reports are stored with a copy of the message for moderators', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const b = await s.player('b');
  const m = (await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'rude words' } })).body;
  const r = await s.req('POST', `/v1/chat/world/${m.mid}/report`, { token: b.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  // a repeat report by the same player is not a second report
  await s.req('POST', `/v1/chat/world/${m.mid}/report`, { token: b.token });
  assert.equal((await s.req('POST', '/v1/chat/world/99999/report', { token: b.token })).status, 404);
  assert.equal((await s.req('POST', '/v1/chat/world/abc/report', { token: b.token })).status, 404);

  assert.equal((await s.req('GET', '/v1/admin/reports', { token: b.token })).status, 403);
  const reps = (await s.req('GET', '/v1/admin/reports', { token: ADMIN })).body;
  assert.equal(reps.length, 1);
  assert.deepEqual(reps[0], { rid: reps[0].rid, ch: 'world', mid: m.mid, by: a.id, text: 'rude words', at: T0, rep: b.id, rat: T0 });

  // a moderator removes the message and closes the report; players can't
  assert.equal((await s.req('DELETE', `/v1/admin/chat/world/${m.mid}`, { token: b.token })).status, 403);
  assert.equal((await s.req('DELETE', `/v1/admin/chat/world/${m.mid}`, { token: ADMIN })).status, 200);
  assert.deepEqual((await s.req('GET', '/v1/chat/world', { token: b.token })).body, []);
  assert.equal((await s.req('DELETE', `/v1/admin/chat/world/${m.mid}`, { token: ADMIN })).status, 404);
  // removing the message closed its reports too
  assert.deepEqual((await s.req('GET', '/v1/admin/reports', { token: ADMIN })).body, []);
  assert.equal((await s.req('DELETE', `/v1/admin/reports/${reps[0].rid}`, { token: ADMIN })).status, 404);
});
