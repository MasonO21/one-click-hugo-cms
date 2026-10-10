/*
 * The browser adapter (net-http.js) end to end: loaded into a Node vm context with a fake window and localStorage,
 * the real fetch and no EventSource (so its watchers poll), talking to a test server as two players and an admin.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { start, T0, DAY } = require('./helpers');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', '..', 'net-http.js'), 'utf8');

// A minimal EventSource on fetch: enough of the browser's (readyState, onopen, onerror, addEventListener, close).
class FakeEventSource {
  constructor(url) {
    this.readyState = 0;
    this.listeners = {};
    this.ctl = new AbortController();
    fetch(url, { signal: this.ctl.signal }).then(async (res) => {
      if (res.status !== 200) { this.readyState = 2; if (this.onerror) this.onerror({}); return; }
      this.readyState = 1;
      if (this.onopen) this.onopen({});
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const type = (/^event: (.*)$/m.exec(block) || [])[1];
          const data = (/^data: (.*)$/m.exec(block) || [])[1];
          if (type && data !== undefined) (this.listeners[type] || []).forEach((f) => f({ data }));
        }
      }
    }).catch(() => {});
  }
  addEventListener(type, f) { (this.listeners[type] = this.listeners[type] || []).push(f); }
  close() { this.readyState = 2; this.ctl.abort(); }
}

// A fresh "browser": its own window, localStorage and copy of the script.
function browser(storage, extra) {
  const store = storage || new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const ctx = Object.assign({ fetch, AbortController, setTimeout, clearTimeout, setInterval, clearInterval, crypto: globalThis.crypto, localStorage, console }, extra);
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { filename: 'net-http.js' });
  return { RKHttpNet: ctx.window.RKHttpNet, store };
}
// objects made inside the vm have its prototypes: compare plain copies
const plain = (x) => JSON.parse(JSON.stringify(x));
async function until(fn, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

test('the adapter exposes every KH.net call', () => {
  const net = browser().RKHttpNet('http://127.0.0.1:9');
  const calls = ['online', 'kind', 'me', 'isAdmin', 'names', 'putProfile', 'player', 'topPlayers', 'opponents', 'members',
    'alliances', 'alliance', 'createAlliance', 'updateAlliance', 'joinAlliance', 'leaveAlliance', 'watchChat', 'sendChat',
    'askHelp', 'giveHelp', 'watchHelps', 'dropHelp', 'boss', 'hitBoss', 'postBattle', 'battlesAgainst', 'putTelemetry',
    'allTelemetry', 'config', 'putSave', 'getSave', 'status',
    // the game's calls beyond NETWORK.md's table (net.js OFF lists them)
    'oldHelps', 'dropBattles', 'report', 'reports', 'removeMessage'];
  for (const c of calls) assert.equal(typeof net[c], 'function', c);
  assert.equal(typeof net.ready.then, 'function');
  assert.equal(net.kind(), 'http');
  return net.ready;
});

test('two players and an admin, end to end through the adapter', async (t) => {
  const s = await start();
  t.after(s.stop);
  const A = browser();
  const B = browser();
  const ann = A.RKHttpNet(s.url + '/', { name: 'Ann', pollMs: 50 });
  const bo = B.RKHttpNet(s.url, { name: 'Bo', pollMs: 50 });
  // watchers poll on timers: stop them even when an assertion fails, or the test process never ends
  const offs = [];
  t.after(() => offs.forEach((f) => f()));

  // sign-in on first use: a deviceId and a token in localStorage
  assert.equal(await ann.ready, true);
  assert.equal(await bo.ready, true);
  assert.equal(ann.online(), true);
  assert.equal(typeof ann.me(), 'string');
  assert.notEqual(ann.me(), bo.me());
  assert.match(A.store.get('rk-device'), /^[0-9a-f-]{36}$/);
  assert.ok(A.store.get('rk-token').length > 30);
  assert.equal(ann.isAdmin(), false);

  // profiles and leaderboards
  const p = await ann.putProfile({ keep: 'Ashwyrm', power: 1000, wyrm: 5, stage: 30, cls: 'bow', squad: [{ id: 'kesh', lvl: 12, stars: 2 }], lp: 5000 });
  assert.equal(p.keep, 'Ashwyrm');
  assert.equal(p.lp, 0);
  await bo.putProfile({ keep: 'Brinefang', power: 1200, wyrm: 6, stage: 35, cls: 'guard' });
  assert.deepEqual((await ann.topPlayers('power', 10)).map((x) => x.name), ['Bo', 'Ann']);
  assert.equal((await ann.topPlayers('lp', 10)).length, 2);
  assert.deepEqual(plain(await bo.names([ann.me(), bo.me(), 'nobody'])), { [ann.me()]: 'Ann', [bo.me()]: 'Bo' });
  assert.deepEqual((await ann.opponents(1000, 5)).map((x) => x.id), [bo.me()]);
  assert.equal((await bo.player(ann.me())).cls, 'bow');
  assert.equal(await bo.player('nobody'), null);

  // a Caravan
  const aid = await ann.createAlliance({ name: 'Sand Lions', tag: 'SL', color: '#aa8800', motto: 'Water first' });
  assert.equal(typeof aid, 'string');
  assert.ok((await bo.alliances(10)).some((a) => a.aid === aid));
  assert.equal(await bo.joinAlliance(aid), true);
  assert.equal((await ann.members(aid)).length, 2);
  const al = await bo.alliance(aid);
  assert.equal(al.count, 2);
  assert.equal(al.members, 2); // the member count, as the artifact backend gives it
  assert.equal(await ann.updateAlliance(aid, { motto: 'Shade for all' }), true);
  assert.equal(await bo.updateAlliance(aid, { motto: 'mine' }), false); // leader only
  assert.equal((await bo.alliance(aid)).motto, 'Shade for all');

  // chat: Bo watches the Caravan channel (polling, as there is no EventSource) and sees Ann's message
  let seen = null;
  const off = bo.watchChat('al-' + aid, (msgs) => { seen = msgs; });
  offs.push(off);
  await until(() => seen);
  assert.deepEqual(plain(seen), []);
  assert.equal(await ann.sendChat('al-' + aid, 'Hello, Caravan'), true);
  await until(() => seen.length === 1);
  assert.equal(seen[0].text, 'Hello, Caravan');
  assert.equal(seen[0].by, ann.me());
  assert.equal(await ann.sendChat('al-' + aid, 'too fast'), false); // 1 per 2 s
  s.tick(2000);
  assert.equal(await ann.sendChat('al-' + aid, 'Second'), true);
  await until(() => seen.length === 2);
  off();
  // Bo reports Ann's first message; an admin sees it and removes it
  assert.equal(await bo.report({ ch: 'al-' + aid, mid: seen[0].mid, by: seen[0].by, text: seen[0].text, at: seen[0].at }), true);
  assert.deepEqual(plain(await bo.reports()), []); // not an admin
  const mod = browser().RKHttpNet(s.url, { adminToken: require('./helpers').ADMIN });
  const reps = await mod.reports();
  assert.equal(reps.length, 1);
  assert.equal(reps[0].text, 'Hello, Caravan');
  assert.equal(await mod.removeMessage(reps[0].ch, reps[0].mid, reps[0].rid), true);
  assert.deepEqual(plain(await mod.reports()), []);
  let after = null;
  const off2 = ann.watchChat('al-' + aid, (msgs) => { after = msgs; });
  offs.push(off2);
  await until(() => after);
  assert.deepEqual(plain(after.map((m) => m.text)), ['Second']);
  off2();
  assert.equal(await ann.oldHelps(aid, 0), null);
  assert.equal(await ann.dropBattles(0), null);

  // help: Ann asks, Bo sees it and helps once
  let helps = null;
  const offH = bo.watchHelps(aid, (list) => { helps = list; });
  offs.push(offH);
  const rid = await ann.askHelp({ aid, plot: 'hall', label: 'Caravan Hall', end: T0 + 3600e3, need: 3 });
  assert.equal(typeof rid, 'string');
  await until(() => helps && helps.length === 1);
  assert.equal(helps[0].rid, rid);
  assert.equal(await bo.giveHelp(rid), true);
  assert.equal(await bo.giveHelp(rid), false);
  assert.equal(await ann.giveHelp(rid), false);
  await until(() => helps[0] && Object.keys(helps[0].hs).length === 1);
  assert.equal(await bo.dropHelp(rid), false);
  assert.equal(await ann.dropHelp(rid), true);
  await until(() => helps.length === 0);
  offH();

  // the Caravan boss
  const day = Math.floor(T0 / DAY);
  assert.equal(await ann.boss(aid, day), null);
  const hit = await ann.hitBoss(aid, day, 100000, 5000);
  assert.equal(hit.hp, 100000);
  assert.equal((await bo.boss(aid, day)).dmg[ann.me()], 5000);
  assert.equal(await ann.hitBoss(aid, day, 100000, 1e9), null); // past power × 50

  // an Arena battle and the defender reading it
  const res = await ann.postBattle({ def: bo.me(), win: true, ap: 1000, dp: 1200 });
  assert.equal(res.d, 20);
  assert.equal(res.lp, 20);
  const recs = await bo.battlesAgainst(0);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].att, ann.me());
  assert.equal(recs[0].win, true);
  const revenge = await bo.postBattle({ def: ann.me(), win: true });
  assert.equal(revenge.d, 21); // round(20 + (20 - 0) / 25)
  assert.equal((await bo.player(ann.me())).lp, 0);

  // telemetry, config and saves
  assert.equal(await ann.putTelemetry({ first: T0, last: T0, days: [day], sessions: 1, secs: 60 }), true);
  assert.deepEqual(plain(await ann.allTelemetry()), []); // not an admin
  const admin = browser().RKHttpNet(s.url, { adminToken: require('./helpers').ADMIN });
  assert.equal(admin.isAdmin(), true);
  const reports = await admin.allTelemetry();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].id, ann.me());
  assert.equal(reports[0].secs, 60);
  assert.ok(await admin.putConfig({ motd: 'Welcome, testers', motdId: 'w1', test: { week: 1, focus: 'Caravans' } }));
  assert.equal((await bo.config()).motd, 'Welcome, testers');
  assert.equal(await ann.putSave('RK1:save-code'), true);
  assert.equal((await ann.getSave()).code, 'RK1:save-code');
  assert.equal(await bo.getSave(), null);

  // leaving
  assert.equal(await bo.leaveAlliance(), true);
  assert.equal((await ann.alliance(aid)).count, 1);

  const st = plain(bo.status());
  assert.equal(st.kind, 'http');
  assert.equal(st.online, true);
  assert.ok(st.calls > 10);
  assert.ok(st.errors >= 2); // the refused edit and the refused drop
  assert.equal(typeof st.lastError, 'string');
  assert.equal(plain(ann.status()).online, true);
});

test('a stored token is reused, and a refused one is replaced by signing in again', async (t) => {
  const s = await start();
  t.after(s.stop);
  const first = browser();
  const a = first.RKHttpNet(s.url);
  await a.ready;
  const id = a.me();
  const token = first.store.get('rk-token');
  // the same browser again: same token, same player
  const again = browser(first.store).RKHttpNet(s.url);
  assert.equal(await again.ready, true);
  assert.equal(again.me(), id);
  assert.equal(first.store.get('rk-token'), token);
  // the server forgets every token: the next call signs in again with the same device and still works
  s.db.raw.exec('DELETE FROM tokens');
  assert.ok(await again.putProfile({ keep: 'Still me', power: 10 }));
  assert.notEqual(first.store.get('rk-token'), token);
  assert.equal((await again.player(id)).keep, 'Still me');
  const third = browser(first.store).RKHttpNet(s.url);
  await third.ready;
  assert.equal(third.me(), id);
});

test('with no server every call resolves its fallback and counts the error', async () => {
  const net = browser().RKHttpNet('http://127.0.0.1:9', { pollMs: 50 });
  assert.equal(await net.ready, false);
  assert.equal(net.online(), false);
  assert.equal(await net.player('x'), null);
  assert.deepEqual(plain(await net.topPlayers('power', 5)), []);
  assert.equal(await net.sendChat('world', 'hi'), false);
  assert.equal(await net.createAlliance({ name: 'x' }), null);
  assert.deepEqual(plain(await net.names(['a'])), {});
  assert.equal(await net.config(), null);
  net.watchChat('world', () => {})();
  const st = net.status();
  assert.equal(st.online, false);
  assert.ok(st.errors >= 6);
  assert.ok(st.lastError);
});

test('with EventSource, watchers update from the event stream (no polling needed)', async (t) => {
  const s = await start();
  t.after(s.stop);
  const offs = [];
  t.after(() => offs.forEach((f) => f()));
  // a poll interval far longer than the test: anything that arrives came over the stream
  const ann = browser(null, { EventSource: FakeEventSource }).RKHttpNet(s.url, { name: 'Ann', pollMs: 600000 });
  const bo = browser().RKHttpNet(s.url, { name: 'Bo' });
  await ann.ready;
  await bo.ready;
  const aid = await ann.createAlliance({ name: 'Lions' });
  await bo.joinAlliance(aid);
  let msgs = null;
  let helps = null;
  offs.push(ann.watchChat('world', (m) => { msgs = m; }));
  offs.push(ann.watchHelps(aid, (h) => { helps = h; }));
  await until(() => msgs && helps);
  await until(() => s.server.hub.count() === 1);
  assert.equal(await bo.sendChat('world', 'over the stream'), true);
  await until(() => msgs.length === 1);
  assert.equal(msgs[0].text, 'over the stream');
  const rid = await bo.askHelp({ plot: 'hall', label: 'Hall', end: T0 + 3600e3, need: 2 });
  await until(() => helps.length === 1 && helps[0].rid === rid);
  // a moderator's removal reaches the open list
  const mod = browser().RKHttpNet(s.url, { adminToken: require('./helpers').ADMIN });
  assert.equal(await mod.removeMessage('world', msgs[0].mid), true);
  await until(() => msgs.length === 0);
});

test('a client that starts offline keeps polling and catches up once the server is there', async (t) => {
  const probe = await start();
  const port = probe.server.address().port;
  await probe.stop();
  const offs = [];
  t.after(() => offs.forEach((f) => f()));
  const ann = browser().RKHttpNet(`http://127.0.0.1:${port}`, { pollMs: 40 });
  assert.equal(await ann.ready, false);
  let msgs = null;
  offs.push(ann.watchChat('world', (m) => { msgs = m; }));
  const s = await start({ port });
  t.after(s.stop);
  const bo = await s.player('bo');
  await s.req('POST', '/v1/chat/world', { token: bo.token, body: { text: 'anyone there?' } });
  await until(() => msgs && msgs.length === 1);
  assert.equal(msgs[0].text, 'anyone there?');
  assert.equal(ann.online(), true);
  assert.equal(typeof ann.me(), 'string');
});
