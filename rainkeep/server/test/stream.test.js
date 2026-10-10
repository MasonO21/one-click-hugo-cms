/*
 * GET /v1/stream: Server-Sent Events for the caller only (chat, help, boss, battle, alliance), the token in the
 * query or the header, and a comment heartbeat.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { start, openStream, T0, DAY } = require('./helpers');

test('the stream refuses a missing or bad token', async (t) => {
  const s = await start();
  t.after(s.stop);
  assert.equal((await s.req('GET', '/v1/stream')).status, 401);
  assert.equal((await s.req('GET', '/v1/stream?token=nope')).status, 401);
});

test('events reach the players they concern, and only them', async (t) => {
  const s = await start({ heartbeatMs: 40 });
  t.after(s.stop);
  const a = await s.player('a', { power: 1000 });
  const b = await s.player('b', { power: 1000 });
  const out = await s.player('out', { power: 1000 });
  const { aid } = (await s.req('POST', '/v1/alliances', { token: a.token, body: { name: 'Lions' } })).body;

  const sa = await openStream(s.url, a.token);
  const sb = await openStream(s.url, b.token, { header: true });
  const so = await openStream(s.url, out.token);
  t.after(() => { sa.close(); sb.close(); so.close(); });
  assert.equal(sa.res.status, 200);
  assert.match(sa.res.headers.get('content-type'), /text\/event-stream/);
  assert.equal((await sa.next((e) => e.type === 'hello')).data.id, a.id);
  await sb.next((e) => e.type === 'hello');
  await so.next((e) => e.type === 'hello');

  // a heartbeat comment
  await sa.next((e) => e.comment === 'ping');

  // join: the Caravan's members hear of it
  await s.req('POST', `/v1/alliances/${aid}/join`, { token: b.token });
  const j = await sa.next((e) => e.type === 'alliance');
  assert.deepEqual([j.data.type, j.data.id], ['join', b.id]);

  // Caravan chat reaches members only; world chat reaches everyone
  await s.req('POST', `/v1/chat/al-${aid}`, { token: a.token, body: { text: 'members' } });
  s.tick(2000);
  await s.req('POST', '/v1/chat/world', { token: a.token, body: { text: 'everyone' } });
  assert.equal((await sb.next((e) => e.type === 'chat' && e.data.channel === `al-${aid}`)).data.msg.text, 'members');
  assert.equal((await so.next((e) => e.type === 'chat')).data.msg.text, 'everyone'); // the first chat `out` sees is the world one
  await sb.next((e) => e.type === 'chat' && e.data.channel === 'world');

  // help and boss go to the Caravan
  const { rid } = (await s.req('POST', '/v1/helps', { token: a.token, body: { plot: 'hall', need: 3 } })).body;
  const ask = await sb.next((e) => e.type === 'help' && e.data.type === 'ask');
  assert.equal(ask.data.req.rid, rid);
  await s.req('POST', `/v1/helps/${rid}/help`, { token: b.token });
  const hh = await sa.next((e) => e.type === 'help' && e.data.type === 'help');
  assert.deepEqual([hh.data.rid, hh.data.by, hh.data.n], [rid, b.id, 1]);
  const day = Math.floor(T0 / DAY);
  await s.req('POST', `/v1/alliances/${aid}/boss`, { token: b.token, body: { day, hp: 5000, total: 700 } });
  const boss = await sa.next((e) => e.type === 'boss');
  assert.deepEqual(boss.data.dmg, { [b.id]: 700 });

  // an Arena record goes to its defender
  await s.req('POST', '/v1/battles', { token: out.token, body: { def: a.id, win: true } });
  const bt = await sa.next((e) => e.type === 'battle');
  assert.equal(bt.data.att, out.id);
  assert.equal(bt.data.d, 20);

  // a kick reaches the kicked player too
  await s.req('POST', `/v1/alliances/${aid}/kick`, { token: a.token, body: { id: b.id } });
  assert.equal((await sb.next((e) => e.type === 'alliance' && e.data.type === 'kick')).data.id, b.id);

  // nothing of the Caravan's leaked to the outsider
  assert.ok(!so.events.some((e) => (e.type === 'chat' && e.data.channel !== 'world') || ['help', 'boss', 'alliance'].includes(e.type)));
  assert.ok(!sb.events.some((e) => e.type === 'battle'));
});

test('a player holds at most 3 streams: the oldest gives way', async (t) => {
  const s = await start();
  t.after(s.stop);
  const a = await s.player('a');
  const streams = [];
  for (let i = 0; i < 4; i++) {
    const st = await openStream(s.url, a.token);
    await st.next((e) => e.type === 'hello');
    streams.push(st);
  }
  t.after(() => streams.forEach((st) => st.close()));
  assert.equal(s.server.hub.count(), 3);
  // a client that goes away leaves the set
  streams.forEach((st) => st.close());
  const end = Date.now() + 3000;
  while (s.server.hub.count() && Date.now() < end) await new Promise((r) => setTimeout(r, 15));
  assert.equal(s.server.hub.count(), 0);
});
