/*
 * Rainkeep server: the HTTP API from NETWORK.md ("HTTP API"). One process, one SQLite file, Node built-ins only.
 * createServer({ dbPath, adminToken, now, corsOrigin, log }) returns a node:http server that isn't listening yet,
 * so tests can inject a clock and an in-memory database and listen on an ephemeral port.
 * The server is authoritative for what the artifact backend can only trust: Caravan membership limits, one help
 * per helper, Arena attack limits and points, boss-hit plausibility and chat rate limits.
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { openDb, profileOut } = require('./db');
const V = require('./validate');
const { Hub } = require('./stream');

const VERSION = require('../package.json').version;
const { DAY, LIMITS } = V;

// The rules the server enforces (NETWORK.md). Named so a balance change is one edit.
const MAX_MEMBERS = 30; // a Caravan's member cap: the 31st join is refused
const CHAT_GAP_MS = 2000; // one chat message per 2 seconds per player
const CHAT_KEEP = 100; // each channel keeps its newest 100 messages
const ATTACKS_PER_DAY = 5; // Arena attacks per attacker per UTC day
const POWER_BAND = 0.4; // Arena opponents are within ±40% of the attacker's power
const LOSS_COST = 5; // Arena points an attacker loses on a loss
const BOSS_HITS_PER_DAY = 3; // the game's DATA.online.boss.hits
// Plausibility cap for the Caravan boss: a player's damage total for a day may not exceed their keep's power
// times this. A modified client can still lie inside the cap; resolving fights on the server is the real fix.
const BOSS_DAMAGE_PER_POWER = 50;
const BOSS_DAY_SLACK = 1; // the boss day is the player's local day: within one of the server's UTC day
const HELP_TTL = DAY; // help requests older than a day are dropped
const MAX_OPEN_HELPS = 10; // open help requests per player, so one player can't flood the Caravan's list
const BATTLE_TTL = 3 * DAY; // Arena records older than three days are dropped
const TOKENS_KEPT = 5; // a player's newest tokens stay valid (phone, browser, reinstall); older ones stop working
const STREAMS_PER_PLAYER = 3; // open /v1/stream connections per player
const RULES = {
  MAX_MEMBERS, CHAT_GAP_MS, CHAT_KEEP, ATTACKS_PER_DAY, POWER_BAND, LOSS_COST, BOSS_HITS_PER_DAY,
  BOSS_DAMAGE_PER_POWER, BOSS_DAY_SLACK, HELP_TTL, MAX_OPEN_HELPS, BATTLE_TTL, TOKENS_KEPT, STREAMS_PER_PLAYER,
};
const DEFAULT_CONFIG = V.cleanConfig({});
const STREAMING = Symbol('streaming');

class HttpError extends Error {
  constructor(status, code, message, headers) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}
const fail = (status, code, message, headers) => { throw new HttpError(status, code, message, headers); };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const hex = (s) => sha(s).toString('hex');
const newId = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// Arena points a win moves: more for beating a keep ranked above you, fewer for one below (NETWORK.md).
function arenaPoints(attLp, defLp) {
  return clamp(Math.round(20 + (defLp - attLp) / 25), 8, 40);
}

// True when `other` is within ±40% of `power` (the attacker's power is the reference).
function inBand(power, other) {
  return Math.abs(other - power) <= POWER_BAND * power + 1e-9;
}

function createServer(opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const db = openDb(opts.dbPath || ':memory:');
  const hub = new Hub({ heartbeatMs: opts.heartbeatMs || 25000, perPlayer: STREAMS_PER_PLAYER });
  // only the hash is kept, and it is compared in constant time
  const adminHash = opts.adminToken ? sha(opts.adminToken) : null;
  const origins = String(opts.corsOrigin || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const anyOrigin = !origins.length || origins.includes('*');

  // ---- routing
  const routes = [];
  // auth: 'player' (a bearer token), 'admin' (the admin token) or 'none'
  const route = (method, path, fn, o = {}) => routes.push({
    method, parts: path.split('/').filter(Boolean), fn, auth: o.auth || 'player', queryToken: !!o.queryToken,
  });

  function match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    let other = false;
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < segs.length && ok; i++) {
        const p = r.parts[i];
        if (p[0] !== ':') { ok = p === segs[i]; continue; }
        let v = '';
        try { v = decodeURIComponent(segs[i]); } catch (e) { ok = false; break; }
        ok = v.length > 0 && v.length <= 64;
        params[p.slice(1)] = v;
      }
      if (!ok) continue;
      if (r.method === method) return { r, params };
      other = true;
    }
    return other ? 405 : null;
  }

  // ---- request plumbing
  function common(req, res) {
    if (anyOrigin) res.setHeader('Access-Control-Allow-Origin', '*');
    else {
      res.setHeader('Vary', 'Origin');
      if (req.headers.origin && origins.includes(req.headers.origin)) res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
  }

  function send(res, status, obj, extra) {
    if (res.headersSent) { try { res.end(); } catch (e) { /* gone */ } return; }
    const body = JSON.stringify(obj);
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) }, extra));
    res.end(body);
  }

  function readBody(req) {
    const tooLarge = () => new HttpError(413, 'too_large', 'The request body is over 600 KB.', { Connection: 'close' });
    if (Number(req.headers['content-length'] || 0) > LIMITS.bodyBytes) return Promise.reject(tooLarge());
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = (err, v) => { if (done) return; done = true; if (err) reject(err); else resolve(v); };
      req.on('data', (ch) => {
        if (done) return;
        size += ch.length;
        if (size > LIMITS.bodyBytes) finish(tooLarge());
        else chunks.push(ch);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) return finish(null, {});
        let v;
        try { v = JSON.parse(text); } catch (e) { return finish(new HttpError(400, 'bad_json', 'The body is not valid JSON.')); }
        if (!V.isObj(v)) return finish(new HttpError(400, 'bad_body', 'The body must be a JSON object.'));
        finish(null, v);
      });
      req.on('error', (e) => finish(e));
      req.on('close', () => finish(new HttpError(400, 'aborted', 'The request was cut off.')));
    });
  }

  function bearer(req) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(req.headers.authorization || '');
    return m ? m[1] : '';
  }

  // The player behind the request's token. Only GET /v1/stream also takes ?token= (EventSource can't set headers).
  function authPlayer(req, url) {
    const tok = bearer(req) || (url ? url.searchParams.get('token') || '' : '');
    if (!tok) fail(401, 'no_token', 'Sign in first (POST /v1/auth).');
    const p = tok.length <= 256 ? db.playerByToken(hex(tok)) : null;
    if (!p) fail(401, 'bad_token', 'This token is not valid: sign in again.');
    return p;
  }

  function authAdmin(req) {
    const tok = bearer(req);
    if (!tok) fail(401, 'no_token', 'This route needs the admin token.');
    if (!adminHash || !crypto.timingSafeEqual(sha(tok), adminHash)) fail(403, 'not_admin', 'This route needs the admin token.');
  }

  async function handle(req, res) {
    const t0 = process.hrtime.bigint();
    let path = '-';
    try {
      common(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch (e) { fail(400, 'bad_url', 'Bad URL.'); }
      path = url.pathname;
      const m = match(req.method, url.pathname);
      if (!m) fail(404, 'not_found', 'No such route.');
      if (m === 405) fail(405, 'method_not_allowed', 'That method is not allowed on this route.');
      const c = { req, res, url, q: url.searchParams, params: m.params, body: {} };
      // authenticate before reading a body, so a stranger can't make the server buffer 600 KB
      if (m.r.auth === 'player') c.me = authPlayer(req, m.r.queryToken ? url : null);
      else if (m.r.auth === 'admin') authAdmin(req);
      if (req.method !== 'GET') c.body = await readBody(req);
      // re-read the player after the await: from here to the response everything is synchronous, so checks such
      // as the chat gap or the member cap can't race another request from the same player
      if (c.me) c.me = db.playerById(c.me.id);
      c.now = now();
      const out = m.r.fn(c);
      if (out !== STREAMING) send(res, 200, out);
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.code, message: e.message }, e.headers);
      else {
        log(`error ${req.method} ${path}: ${(e && e.stack) || e}`);
        send(res, 500, { error: 'server_error', message: 'Something went wrong on the server.' });
      }
    } finally {
      // the path only: the query can carry the stream's token, and headers are never logged
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      log(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
    }
  }

  // ---- shared helpers for the routes
  function mustAlliance(aid) {
    const a = db.alliance(aid);
    if (!a) fail(404, 'no_alliance', 'No such Caravan.');
    return a;
  }
  function memberOf(c, aid) {
    const a = mustAlliance(aid);
    if (c.me.aid !== a.aid) fail(403, 'not_member', 'Only members of this Caravan can do that.');
    return a;
  }
  // Takes `pid` out of Caravan `aid` (leave or kick). An empty Caravan is disbanded; a leaving leader hands over to
  // the longest-standing member (NETWORK.md: the server writes it, so it never waits for someone to open the sheet).
  function departs(pid, aid, type) {
    const out = db.tx(() => {
      db.setAid(pid, null, null);
      db.deleteHelpsBy(pid, aid);
      const a = db.alliance(aid);
      if (!a) return { leader: null, disbanded: false };
      if (!a.count) { db.deleteAlliance(aid); return { leader: null, disbanded: true }; }
      let leader = a.leader;
      if (leader === pid) { leader = db.eldest(aid).id; db.updateAlliance(aid, { leader }); }
      return { leader, disbanded: false };
    });
    hub.to(db.memberIds(aid).concat(pid), 'alliance', { type, aid, id: pid, leader: out.leader });
    return out;
  }
  function chatChannel(c) {
    const ch = c.params.channel;
    if (ch === 'world') return ch;
    const m = /^al-(.+)$/.exec(ch);
    if (!m || m[1].length > LIMITS.aid) fail(404, 'no_channel', 'Chat channels are world and al-{aid}.');
    if (c.me.aid !== m[1]) fail(403, 'not_member', "Only a Caravan's members can use its chat.");
    return ch;
  }
  const today = (c) => Math.floor(c.now / DAY);

  // ---- routes (NETWORK.md "HTTP API"); literal paths come before the :param paths they would also match
  route('GET', '/v1/health', () => ({ ok: true, version: VERSION }), { auth: 'none' });

  // A device account: one per deviceId. The deviceId works like a password, so only its hash is stored, and each
  // sign-in issues a fresh random token of which only the hash is stored too.
  route('POST', '/v1/auth', (c) => {
    const dev = typeof c.body.deviceId === 'string' ? c.body.deviceId.trim() : '';
    if (dev.length < 8 || dev.length > 200) fail(400, 'bad_device', 'deviceId must be 8 to 200 characters.');
    const device = hex('device:' + dev);
    let p = db.playerByDevice(device);
    if (!p) {
      const id = newId(9);
      db.createPlayer(id, device, V.str(c.body.name, LIMITS.name) || `Warden ${id.slice(0, 4)}`, c.now);
      p = db.playerById(id);
    }
    const token = newId(32);
    db.addToken(hex(token), p.id, c.now, TOKENS_KEPT);
    return { token, id: p.id, name: p.name };
  }, { auth: 'none' });

  route('GET', '/v1/me', (c) => ({ id: c.me.id, name: c.me.name, aid: c.me.aid || null }));
  route('PATCH', '/v1/me', (c) => {
    const name = V.str(c.body.name, LIMITS.name);
    if (!name) fail(400, 'bad_name', 'A name needs 1 to 24 characters.');
    db.rename(c.me.id, name);
    return { id: c.me.id, name };
  });

  route('PUT', '/v1/save', (c) => {
    const code = c.body.code;
    if (typeof code !== 'string' || !code) fail(400, 'bad_save', 'code must be the save code, a non-empty string.');
    if (Buffer.byteLength(code) > LIMITS.saveBytes) fail(413, 'too_large', 'A cloud save is at most 512 KB.');
    db.putSave(c.me.id, code, V.time(c.body.at, c.now), c.now);
    return { ok: true };
  });
  route('GET', '/v1/save', (c) => {
    const s = db.getSave(c.me.id);
    if (!s) fail(404, 'no_save', 'No cloud save yet.');
    return { code: s.code, at: s.at };
  });

  // ---- players
  route('PUT', '/v1/players/me', (c) => {
    db.updateProfile(c.me.id, V.cleanProfile(c.body), c.now);
    return profileOut(db.playerById(c.me.id));
  });
  route('GET', '/v1/players', (c) => {
    // ids= (up to 100, for names()) and aid= (members) are lookups; otherwise a leaderboard
    if (c.q.has('ids')) {
      const ids = [...new Set(c.q.get('ids').split(',').map((s) => s.trim()).filter((s) => s && s.length <= 64))].slice(0, 100);
      return ids.length ? db.byIds(ids) : [];
    }
    if (c.q.has('aid')) return db.members(c.q.get('aid'));
    return db.top(c.q.get('order') === 'lp' ? 'lp' : 'power', V.int(c.q.get('limit'), 1, 100, 50));
  });
  route('GET', '/v1/players/opponents', (c) => {
    const power = V.num(c.q.get('power'), 0, LIMITS.power[1], c.me.power);
    return db.opponents(power * (1 - POWER_BAND), power * (1 + POWER_BAND), c.me.id, V.int(c.q.get('limit'), 1, 20, 10));
  });
  route('GET', '/v1/players/:id', (c) => {
    const p = c.params.id === 'me' ? c.me : db.playerById(c.params.id);
    if (!p) fail(404, 'no_player', 'No such player.');
    return profileOut(p);
  });

  // ---- Caravans
  route('GET', '/v1/alliances', (c) => db.alliances(V.int(c.q.get('limit'), 1, 50, 20)));
  route('POST', '/v1/alliances', (c) => {
    if (c.me.aid) fail(409, 'in_alliance', 'Leave your Caravan first.');
    const a = V.cleanAlliance(c.body, true);
    if (!a.name) fail(400, 'bad_name', 'A Caravan needs a name (1 to 24 characters).');
    const aid = newId(6);
    db.tx(() => {
      db.createAlliance(Object.assign({ aid, leader: c.me.id, created: c.now }, a));
      db.setAid(c.me.id, aid, c.now);
    });
    return { aid };
  });
  route('POST', '/v1/alliances/leave', (c) => {
    if (!c.me.aid) fail(409, 'not_in_alliance', 'You are not in a Caravan.');
    const out = departs(c.me.id, c.me.aid, 'leave');
    return { ok: true, leader: out.leader, disbanded: out.disbanded };
  });
  route('GET', '/v1/alliances/:aid', (c) => {
    const a = mustAlliance(c.params.aid);
    a.members = db.members(a.aid);
    return a;
  });
  route('PATCH', '/v1/alliances/:aid', (c) => {
    const a = mustAlliance(c.params.aid);
    if (a.leader !== c.me.id) fail(403, 'not_leader', 'Only the leader can change the Caravan.');
    db.updateAlliance(a.aid, V.cleanAlliance(c.body, false));
    const out = db.alliance(a.aid);
    hub.to(db.memberIds(a.aid), 'alliance', { type: 'update', aid: a.aid, alliance: out });
    return out;
  });
  route('POST', '/v1/alliances/:aid/join', (c) => {
    const a = mustAlliance(c.params.aid);
    if (c.me.aid === a.aid) return { ok: true, aid: a.aid };
    if (c.me.aid) fail(409, 'in_alliance', 'Leave your Caravan first.');
    if (!a.open) fail(403, 'closed', 'This Caravan is closed to new members.');
    if (a.count >= MAX_MEMBERS) fail(409, 'full', `A Caravan holds at most ${MAX_MEMBERS} members.`);
    db.setAid(c.me.id, a.aid, c.now);
    hub.to(db.memberIds(a.aid), 'alliance', { type: 'join', aid: a.aid, id: c.me.id, leader: a.leader });
    return { ok: true, aid: a.aid };
  });
  route('POST', '/v1/alliances/:aid/kick', (c) => {
    const a = mustAlliance(c.params.aid);
    if (a.leader !== c.me.id) fail(403, 'not_leader', 'Only the leader can remove a member.');
    const id = typeof c.body.id === 'string' ? c.body.id : '';
    if (!id) fail(400, 'bad_id', 'id (the member to remove) is required.');
    if (id === c.me.id) fail(400, 'self', 'A leader leaves instead of kicking themselves.');
    const p = db.playerById(id);
    if (!p || p.aid !== a.aid) fail(404, 'not_member', 'That player is not in this Caravan.');
    departs(id, a.aid, 'kick');
    return { ok: true };
  });

  // ---- chat
  route('GET', '/v1/chat/:channel', (c) => db.chatSince(chatChannel(c), V.time(c.q.get('since'), 0), CHAT_KEEP));
  route('POST', '/v1/chat/:channel', (c) => {
    const ch = chatChannel(c);
    const wait = c.me.last_chat + CHAT_GAP_MS - c.now;
    if (wait > 0) fail(429, 'slow_down', 'One message every 2 seconds.', { 'Retry-After': String(Math.ceil(wait / 1000)) });
    const text = V.str(c.body.text, LIMITS.chat);
    if (!text) fail(400, 'empty', 'The message is empty.');
    const mid = db.tx(() => {
      db.setLastChat(c.me.id, c.now);
      return db.addChat(ch, c.me.id, c.now, text, CHAT_KEEP);
    });
    const msg = db.chatMsg(ch, mid);
    if (ch === 'world') hub.all('chat', { channel: ch, msg });
    else hub.to(db.memberIds(c.me.aid), 'chat', { channel: ch, msg });
    return msg;
  });
  // A report keeps a copy of the message, since the channel only keeps its newest 100.
  route('POST', '/v1/chat/:channel/:mid/report', (c) => {
    const ch = chatChannel(c);
    const msg = /^\d{1,15}$/.test(c.params.mid) ? db.chatMsg(ch, Number(c.params.mid)) : null;
    if (!msg) fail(404, 'no_message', 'That message is gone.');
    db.addReport({ channel: ch, mid: Number(msg.id), author: msg.by, text: msg.text, msgAt: msg.at, reporter: c.me.id, at: c.now });
    return { ok: true };
  });

  // ---- help requests
  route('POST', '/v1/helps', (c) => {
    if (!c.me.aid) fail(403, 'no_alliance', 'Join a Caravan to ask for help.');
    const h = V.cleanHelp(c.body, c.now);
    if (!h.plot) fail(400, 'bad_plot', 'plot (the building) is required.');
    const fresh = c.now - HELP_TTL;
    db.pruneHelps(fresh);
    if (db.openHelpsBy(c.me.id, fresh) >= MAX_OPEN_HELPS) fail(429, 'too_many', `At most ${MAX_OPEN_HELPS} open help requests.`);
    const rid = newId(9);
    db.addHelp(Object.assign({ rid, aid: c.me.aid, by: c.me.id, at: c.now }, h));
    hub.to(db.memberIds(c.me.aid), 'help', { type: 'ask', aid: c.me.aid, rid, req: db.help(rid) });
    return { rid };
  });
  // every request in the Caravan younger than a day, full ones too: the requester's game needs to see the last
  // help arrive before it deletes the request
  route('GET', '/v1/helps', (c) => (c.me.aid ? db.helpsFor(c.me.aid, c.now - HELP_TTL) : []));
  route('POST', '/v1/helps/:rid/help', (c) => {
    const r = db.help(c.params.rid);
    if (!r || r.at <= c.now - HELP_TTL) fail(404, 'no_request', 'That help request is gone.');
    if (r.aid !== c.me.aid) fail(403, 'not_member', "Only the Caravan's members can help.");
    if (r.by === c.me.id) fail(403, 'own_request', "You can't help your own request.");
    if (Object.hasOwn(r.hs, c.me.id)) fail(409, 'already_helped', 'You already helped with this.');
    const n = Object.keys(r.hs).length;
    if (n >= r.need) fail(409, 'help_full', 'This request has all the help it needs.');
    if (r.end <= c.now) fail(409, 'ended', 'That build has finished.');
    db.addHelpHit(r.id, c.me.id, c.now);
    hub.to(db.memberIds(r.aid), 'help', { type: 'help', aid: r.aid, rid: r.id, by: c.me.id, n: n + 1 });
    return { ok: true, n: n + 1 };
  });
  route('DELETE', '/v1/helps/:rid', (c) => {
    const r = db.help(c.params.rid);
    if (!r) fail(404, 'no_request', 'That help request is gone.');
    if (r.by !== c.me.id) fail(403, 'not_yours', 'Only the player who asked can remove a request.');
    db.deleteHelp(r.id);
    hub.to(db.memberIds(r.aid), 'help', { type: 'drop', aid: r.aid, rid: r.id });
    return { ok: true };
  });

  // ---- Caravan boss
  route('GET', '/v1/alliances/:aid/boss', (c) => {
    const a = memberOf(c, c.params.aid);
    const b = db.boss(a.aid, V.int(c.q.get('day'), 0, 1e7, today(c)));
    if (!b) fail(404, 'no_boss', "Nobody has fought this day's boss yet.");
    return b;
  });
  route('POST', '/v1/alliances/:aid/boss', (c) => {
    const a = memberOf(c, c.params.aid);
    const day = V.int(c.body.day, 0, 1e7, null);
    if (day === null || Math.abs(day - today(c)) > BOSS_DAY_SLACK) fail(400, 'bad_day', 'day must be today (local days since the epoch).');
    const total = V.num(c.body.total, 0, 1e15, null);
    if (total === null) fail(400, 'bad_total', 'total (your damage so far today) must be a number.');
    // the first hit of the day sets the boss's hp; later ones can't change it
    const hp = V.num(c.body.hp, 1, 1e15, null);
    const before = db.boss(a.aid, day);
    if (!before && hp === null) fail(400, 'bad_hp', 'hp must be a positive number.');
    const prev = db.bossEntry(a.aid, day, c.me.id) || { total: 0, hits: 0 };
    // a repeat of the same total (a retry) or an older, smaller one changes nothing and uses no hit
    const grows = total > prev.total;
    if (grows) {
      if (prev.hits >= BOSS_HITS_PER_DAY) fail(429, 'hit_limit', `${BOSS_HITS_PER_DAY} boss attacks a day.`);
      if (total > c.me.power * BOSS_DAMAGE_PER_POWER) fail(400, 'implausible', "That total is more than your keep's power allows.");
    }
    db.tx(() => {
      if (!before) db.setBossHp(a.aid, day, hp);
      if (grows) db.putBossDmg(a.aid, day, c.me.id, total, prev.hits + 1, c.now);
    });
    db.pruneBoss(today(c) - 7);
    const b = db.boss(a.aid, day);
    if (grows || !before) hub.to(db.memberIds(a.aid), 'boss', Object.assign({ aid: a.aid, day }, b));
    return b;
  });

  // ---- Arena
  // The attacker's game fights the battle and reports the result; the server checks the limits, takes both
  // powers and Arena points from its own records (the request's ap/dp are ignored) and moves the points itself.
  route('POST', '/v1/battles', (c) => {
    const defId = typeof c.body.def === 'string' ? c.body.def : '';
    if (!defId) fail(400, 'bad_def', "def (the defender's id) is required.");
    if (defId === c.me.id) fail(400, 'self', "You can't attack your own keep.");
    if (typeof c.body.win !== 'boolean') fail(400, 'bad_win', 'win must be true or false.');
    const def = db.playerById(defId);
    if (!def) fail(404, 'no_player', 'No such player.');
    const dayStart = today(c) * DAY;
    const used = db.attacksSince(c.me.id, dayStart);
    if (used >= ATTACKS_PER_DAY) {
      fail(429, 'attack_limit', `${ATTACKS_PER_DAY} Arena attacks a day.`, { 'Retry-After': String(Math.ceil((dayStart + DAY - c.now) / 1000)) });
    }
    if (!inBand(c.me.power, def.power)) fail(403, 'out_of_range', 'Arena opponents must be within 40% of your power.');
    const win = c.body.win;
    const d = win ? arenaPoints(c.me.lp, def.lp) : 0;
    const lp = win ? c.me.lp + d : Math.max(0, c.me.lp - LOSS_COST);
    const rec = { id: newId(9), att: c.me.id, def: def.id, win, at: c.now, d, ap: c.me.power, dp: def.power };
    db.tx(() => {
      db.addBattle(rec);
      db.setLp(c.me.id, lp);
      if (win) db.setLp(def.id, Math.max(0, def.lp - d));
    });
    db.pruneBattles(c.now - BATTLE_TTL);
    hub.to([def.id], 'battle', rec);
    return { bid: rec.id, win, d, lp, left: ATTACKS_PER_DAY - used - 1 };
  });
  route('GET', '/v1/battles', (c) => db.battlesAgainst(c.me.id, Math.max(V.time(c.q.get('since'), 0), c.now - BATTLE_TTL), 100));

  // ---- playtest reports, moderation and live config
  route('PUT', '/v1/telemetry', (c) => {
    db.putTelemetry(c.me.id, V.cleanTelemetry(c.body), c.now);
    return { ok: true };
  });
  route('GET', '/v1/admin/telemetry', () => db.allTelemetry(), { auth: 'admin' });
  route('GET', '/v1/admin/reports', (c) => db.reports(V.int(c.q.get('limit'), 1, 500, 200)), { auth: 'admin' });
  route('GET', '/v1/config', () => db.getConfig() || DEFAULT_CONFIG);
  route('PUT', '/v1/admin/config', (c) => {
    const cfg = V.cleanConfig(c.body);
    db.putConfig(cfg);
    return cfg;
  }, { auth: 'admin' });

  // ---- live events
  route('GET', '/v1/stream', (c) => {
    c.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx-style proxies would otherwise hold events back
    });
    c.req.socket.setNoDelay(true);
    c.res.write('retry: 5000\n\n');
    c.res.write(Hub.frame('hello', { id: c.me.id, at: c.now }));
    hub.add(c.me.id, c.req, c.res);
    return STREAMING;
  }, { queryToken: true });

  const server = http.createServer((req, res) => { handle(req, res).catch((e) => log(`error: ${(e && e.stack) || e}`)); });
  server.db = db;
  server.hub = hub;
  // closing also ends the open event streams (or the server would wait on them forever) and the database
  const close = server.close.bind(server);
  server.close = (cb) => {
    hub.close();
    close((err) => {
      try { db.close(); } catch (e) { /* already closed */ }
      if (cb) cb(err);
    });
    server.closeIdleConnections();
    return server;
  };
  return server;
}

module.exports = { createServer, arenaPoints, inBand, RULES, VERSION };
