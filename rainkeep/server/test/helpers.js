/*
 * Test helpers: a server on an ephemeral port with an in-memory database and a clock the test moves by hand,
 * plus a JSON request helper, a player factory and a Server-Sent Events reader.
 */
'use strict';

const { createServer } = require('../src/app');

const ADMIN = 'test-admin-token-0123456789abcdef';
const DAY = 864e5;
const T0 = Date.UTC(2026, 9, 10, 12, 0, 0); // noon UTC, so +12 h crosses into the next Arena day

async function start(opts = {}) {
  const clock = { t: opts.t0 || T0 };
  const server = createServer(Object.assign({ dbPath: ':memory:', adminToken: ADMIN, now: () => clock.t }, opts));
  await new Promise((resolve) => server.listen(opts.port || 0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  async function req(method, path, { token, body, headers } = {}) {
    const h = Object.assign({}, headers);
    if (token) h.Authorization = 'Bearer ' + token;
    let payload;
    if (body !== undefined) {
      h['Content-Type'] = 'application/json';
      payload = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(url + path, { method, headers: h, body: payload });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    return { status: res.status, body: data, headers: res.headers };
  }

  let n = 0;
  // A signed-in player, optionally with a profile written.
  async function player(name, profile) {
    const r = await req('POST', '/v1/auth', { body: { deviceId: `test-device-${name}-${++n}`, name } });
    if (r.status !== 200) throw new Error('auth failed: ' + JSON.stringify(r.body));
    const p = { id: r.body.id, token: r.body.token, name };
    if (profile) {
      const w = await req('PUT', '/v1/players/me', { token: p.token, body: profile });
      if (w.status !== 200) throw new Error('profile failed: ' + JSON.stringify(w.body));
    }
    return p;
  }

  // (tests also drop connections the client opened but never used, which a graceful close would wait out)
  const stop = () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  return { server, db: server.db, url, clock, req, player, stop, tick: (ms) => { clock.t += ms; } };
}

// Opens GET /v1/stream and collects its events; next(pred) waits for the first unread event that matches.
async function openStream(url, token, { header } = {}) {
  const ctl = new AbortController();
  const res = await fetch(url + '/v1/stream' + (header ? '' : '?token=' + encodeURIComponent(token)), {
    signal: ctl.signal, headers: header ? { Authorization: 'Bearer ' + token } : {},
  });
  const events = [];
  if (res.status === 200) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = { type: null, data: null, comment: null };
            for (const line of block.split('\n')) {
              if (line.startsWith(':')) ev.comment = line.slice(1).trim();
              else if (line.startsWith('event: ')) ev.type = line.slice(7);
              else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
            }
            events.push(ev);
          }
        }
      } catch (e) { /* aborted */ }
    })();
  }
  async function next(pred, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
      const k = events.findIndex(pred);
      if (k >= 0) return events.splice(k, 1)[0];
      if (Date.now() > end) throw new Error('no matching event; saw ' + JSON.stringify(events));
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  return { res, events, next, close: () => ctl.abort() };
}

module.exports = { start, openStream, ADMIN, DAY, T0 };
