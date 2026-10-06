// Shardfall Arena game server: HTTP API (accounts, cloud save, leaderboard) and WebSocket
// matchmaking + server-authoritative 3v3 matches. See ../README.md for the protocol.
import http from 'node:http';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { SF, Room, TICK } from './game.js';

const PORT = +(process.env.PORT || 8787);
const QUEUE_WAIT = +(process.env.QUEUE_WAIT || 8);          // seconds before bots fill a match
const TICK_SCALE = Math.max(1, +(process.env.TICK_SCALE || 1)); // >1 runs matches faster (tests only)
const DATA_DIR = resolve(process.env.DATA_DIR || './data');
const MAX_SAVE = 64 * 1024;
const BOT_TAKEOVER = 10;                                     // seconds before a disconnected player's hero is botted

// ---------------------------------------------------------------------------
// Accounts. A JSON file is enough for a prototype; production should use a real database and keep
// currency balances on the server instead of trusting the uploaded save.
// ---------------------------------------------------------------------------
mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = join(DATA_DIR, 'accounts.json');
const db = existsSync(DB_FILE) ? JSON.parse(readFileSync(DB_FILE, 'utf8')) : { players: {}, devices: {} };
let dirty = false;
const persist = () => { dirty = true; };
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
  renameSync(DB_FILE + '.tmp', DB_FILE);
}, 2000).unref();

const newId = () => crypto.randomBytes(9).toString('base64url');
function createPlayer(name) {
  const pid = newId(), token = crypto.randomBytes(24).toString('base64url');
  db.players[pid] = { pid, token, name: cleanName(name), mmr: 1000, ranked: 0, save: null, savedAt: null, created: new Date().toISOString() };
  persist();
  return db.players[pid];
}
const byToken = token => (typeof token === 'string' ? Object.values(db.players).find(p => p.token === token) : null) || null;
function cleanName(n) { const s = String(n || '').replace(/[^A-Za-z0-9_ ]/g, '').trim().slice(0, 16); return s.length >= 3 ? s : 'Shardling' + Math.floor(1000 + Math.random() * 9000); }

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => {
      if (size > limit) { const e = new Error('too large'); e.status = 413; return fail(e); }
      try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { fail(e); }
    });
    req.on('error', fail);
  });
}
const authed = req => byToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204);
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true, rooms: rooms.size, queued: queue.length, uptime: Math.round(process.uptime()) });
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req, 4096);
      const device = typeof body.deviceId === 'string' ? body.deviceId.slice(0, 128) : null;
      let p = device && db.devices[device] ? db.players[db.devices[device]] : null;
      if (!p) { p = createPlayer(body.name); if (device) { db.devices[device] = p.pid; persist(); } }
      return send(res, 200, { pid: p.pid, token: p.token, name: p.name, mmr: p.mmr });
    }
    if (url.pathname === '/api/save') {
      const p = authed(req);
      if (!p) return send(res, 401, { error: 'Sign in first' });
      if (req.method === 'GET') return send(res, 200, { save: p.save, savedAt: p.savedAt });
      if (req.method === 'PUT') {
        const body = await readBody(req, MAX_SAVE);
        if (!body.save || typeof body.save !== 'object') return send(res, 400, { error: 'Missing save' });
        p.save = body.save; p.savedAt = new Date().toISOString(); if (body.save.name) p.name = cleanName(body.save.name);
        persist();
        return send(res, 200, { savedAt: p.savedAt });
      }
    }
    if (url.pathname === '/api/account' && req.method === 'DELETE') {
      const p = authed(req);
      if (!p) return send(res, 401, { error: 'Sign in first' });
      delete db.players[p.pid];
      for (const [d, pid] of Object.entries(db.devices)) if (pid === p.pid) delete db.devices[d];
      persist();
      return send(res, 200, { deleted: true });
    }
    if (url.pathname === '/api/leaderboard') {
      const top = Object.values(db.players).filter(p => p.ranked > 0).sort((a, b) => b.mmr - a.mmr).slice(0, 50).map(p => ({ name: p.name, mmr: Math.round(p.mmr), matches: p.ranked }));
      return send(res, 200, { top });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, e.status || 400, { error: e.status === 413 ? 'Too large' : 'Bad request' });
  }
});

// ---------------------------------------------------------------------------
// WebSocket: matchmaking and matches
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: { threshold: 512 } });
const queue = [];            // { client, mode, heroId, skinId, since }
const rooms = new Map();     // roomId -> { room, members: Map(pid -> client), tick }
const clients = new Map();   // pid -> client (one live socket per account)

function out(client, msg) { if (client.ws.readyState === 1) client.ws.send(JSON.stringify(msg)); }

wss.on('connection', ws => {
  const client = { ws, pid: null, account: null, roomId: null, rate: 0 };
  const rateTimer = setInterval(() => { client.rate = 0; }, 1000);
  ws.on('message', raw => {
    if (++client.rate > 90) { if (client.rate > 300) ws.close(1008, 'rate limit'); return; }
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    handle(client, msg);
  });
  ws.on('close', () => { clearInterval(rateTimer); leave(client); });
});

function handle(client, msg) {
  if (msg.t === 'hello') {
    let acc = byToken(msg.token);
    if (!acc) acc = createPlayer(msg.name);
    const prev = clients.get(acc.pid);
    if (prev && prev !== client) { prev.replaced = true; prev.ws.close(4000, 'signed in elsewhere'); }
    client.pid = acc.pid; client.account = acc;
    clients.set(acc.pid, client);
    out(client, { t: 'welcome', pid: acc.pid, token: acc.token, mmr: Math.round(acc.mmr) });
    // Reconnect into a running match.
    for (const [id, r] of rooms) {
      if (r.members.has(acc.pid)) {
        r.members.set(acc.pid, client); client.roomId = id; r.room.setConnected(acc.pid, true); clearTimeout(r.takeover.get(acc.pid));
        out(client, matchMsg(r.room, acc.pid));
        break;
      }
    }
    return;
  }
  if (!client.pid) return out(client, { t: 'error', msg: 'Say hello first' });
  if (msg.t === 'ping') return out(client, { t: 'pong', c: msg.c });
  if (msg.t === 'queue') {
    if (client.roomId) return;
    const hero = SF.HERO[msg.heroId];
    if (!hero) return out(client, { t: 'error', msg: 'Unknown hero' });
    const skin = SF.SKIN[msg.skinId] && SF.SKIN[msg.skinId].hero === hero.id ? msg.skinId : SF.defaultSkin(hero.id);
    if (msg.name) client.account.name = cleanName(msg.name);
    const mode = msg.mode === 'ranked' ? 'ranked' : 'quick';
    removeFromQueue(client);
    const spell = typeof msg.spell === 'string' && Object.prototype.hasOwnProperty.call(SF.SPELLS, msg.spell) ? msg.spell : 'blink';
    queue.push({ client, mode, heroId: hero.id, skinId: skin, spell, since: Date.now() });
    return out(client, { t: 'queued', n: queue.filter(q => q.mode === mode).length, wait: QUEUE_WAIT });
  }
  if (msg.t === 'cancel') { removeFromQueue(client); return out(client, { t: 'cancelled' }); }
  const r = client.roomId && rooms.get(client.roomId);
  if (r) r.room.input(client.pid, msg);
}

function removeFromQueue(client) { const i = queue.findIndex(q => q.client === client); if (i >= 0) queue.splice(i, 1); }

function leave(client) {
  removeFromQueue(client);
  if (clients.get(client.pid) === client) clients.delete(client.pid);
  const r = client.roomId && rooms.get(client.roomId);
  if (r && !client.replaced) {
    r.room.setConnected(client.pid, false);
    r.takeover.set(client.pid, setTimeout(() => r.room.botTakeover(client.pid), BOT_TAKEOVER * 1000));
  }
}

function matchMsg(room, pid) {
  const h = room.byPid.get(pid);
  return { t: 'match', room: room.id, mode: room.mode, pid, team: h.team, heroId: h.id, roster: room.rosterInfo(), bushes: room.m.bushes };
}

// Teams: humans alternate between sides, but two humans on one team never share a hero.
function assignTeams(entries) {
  const teams = [[], []];
  for (const e of entries) {
    const order = teams[0].length <= teams[1].length ? [0, 1] : [1, 0];
    const t = order.find(i => teams[i].length < 3 && !teams[i].some(x => x.heroId === e.heroId));
    if (t !== undefined) teams[t].push(e);
    else {
      const i = order.find(k => teams[k].length < 3);
      const used = new Set(teams[i].map(x => x.heroId));
      e.heroId = SF.HEROES.find(h => !used.has(h.id)).id; e.skinId = SF.defaultSkin(e.heroId);
      teams[i].push(e);
    }
  }
  return teams;
}

function matchmake() {
  for (const mode of ['quick', 'ranked']) {
    const waiting = queue.filter(q => q.mode === mode && q.client.ws.readyState === 1);
    if (!waiting.length) continue;
    const ready = waiting.length >= 6 || Date.now() - waiting[0].since >= QUEUE_WAIT * 1000;
    if (!ready) continue;
    const group = waiting.slice(0, 6);
    group.forEach(g => removeFromQueue(g.client));
    const teams = assignTeams(group);
    const players = [];
    teams.forEach((list, team) => list.forEach(e => players.push({ pid: e.client.pid, name: e.client.account.name, heroId: e.heroId, skinId: e.skinId, spell: e.spell, team })));
    const room = new Room({ id: newId(), mode, players });
    const members = new Map(group.map(g => [g.client.pid, g.client]));
    rooms.set(room.id, { room, members, tick: 0, takeover: new Map() });
    for (const g of group) { g.client.roomId = room.id; out(g.client, matchMsg(room, g.client.pid)); }
  }
}
setInterval(matchmake, 250);

function finish(id, r) {
  const m = r.room.m, sum = m.summary();
  if (r.room.mode === 'ranked') {
    const mmr = pid => (pid && db.players[pid] ? db.players[pid].mmr : 1000);
    const avg = team => sum.rows.filter(x => x.team === team).reduce((a, x) => a + mmr(x.pid), 0) / 3;
    for (const row of sum.rows) {
      const p = row.pid && db.players[row.pid];
      if (!p) continue;
      const expect = 1 / (1 + Math.pow(10, (avg(1 - row.team) - avg(row.team)) / 400));
      p.mmr += 32 * ((row.team === sum.winner ? 1 : 0) - expect); p.ranked++;
      row.mmr = Math.round(p.mmr);
    }
    persist();
  }
  const mvpIndex = sum.rows.indexOf(sum.mvp);
  for (const [pid, client] of r.members) {
    if (client.roomId !== id) continue;
    client.roomId = null;
    out(client, { t: 'end', winner: sum.winner, summary: { winner: sum.winner, time: sum.time, kills: sum.kills, teamStats: sum.teamStats, rows: sum.rows, mvp: mvpIndex } });
  }
  for (const t of r.takeover.values()) clearTimeout(t);
  rooms.delete(id);
}

// Fixed-step simulation for every room; snapshots go out every other tick (15 Hz).
setInterval(() => {
  for (const [id, r] of rooms) {
    for (let k = 0; k < TICK_SCALE && !r.room.ended; k++) { r.room.step(); r.tick++; }
    if (r.tick % 2 === 0 || r.room.ended) {
      for (const [pid, client] of r.members) {
        if (client.roomId !== id || client.ws.readyState !== 1) continue;
        const h = r.room.byPid.get(pid);
        out(client, r.room.snapshotFor(h.team, pid, r.room.eventsFor(pid)));
      }
      r.room.events.length = 0;
    }
    if (r.room.ended) finish(id, r);
  }
}, TICK * 1000);

server.listen(PORT, () => console.log(`Shardfall server listening on :${server.address().port} (queue wait ${QUEUE_WAIT}s)`));

export { server };
