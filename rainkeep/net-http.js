/*
 * Rainkeep: the HTTP backend of KH.net (NETWORK.md), for the native app or a self-hosted web build with DATA.server
 * set. window.RKHttpNet(baseUrl, opts) returns an object with every KH.net call (and the game's extra ones net.js
 * lists: report, reports, removeMessage, oldHelps, dropBattles), giving records the artifact backend's shapes.
 * Each call returns a Promise that never rejects: a failure resolves null/false/[] and is counted in status(); a
 * write resolves something truthy (true, the new id, or the server's stored record) when it worked.
 * The device signs in on first use: its id lives in localStorage 'rk-device' and its token in 'rk-token'.
 * opts: { adminToken, name, pollMs }. watch* calls listen on the server's event stream (EventSource) and fall
 * back to polling every 15 seconds; each returns an unsubscribe function. No dependencies.
 */
'use strict';
(function () {
  const POLL_MS = 15000;
  const TIMEOUT_MS = 15000;
  const EVENTS = ['chat', 'help', 'boss', 'battle', 'alliance'];

  // localStorage throws in some private modes and sandboxed frames: then the sign-in lasts for this session only
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* this session only */ } }
  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* no Web Crypto */ }
    let s = 'd-';
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  const seg = encodeURIComponent;
  const query = (o) => Object.keys(o).filter((k) => o[k] !== undefined && o[k] !== null).map((k) => k + '=' + seg(o[k])).join('&');
  const arr = (v) => (Array.isArray(v) ? v : []);

  window.RKHttpNet = function (baseUrl, opts) {
    opts = opts || {};
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const pollMs = opts.pollMs || POLL_MS;
    const st = { online: false, calls: 0, errors: 0, lastError: null };
    const names = new Map();
    let id = null;
    let token = load('rk-token');
    let signing = null;

    function note(e) {
      st.errors++;
      st.lastError = String((e && e.message) || e).slice(0, 120);
    }

    async function send(method, path, body, auth) {
      const headers = {};
      if (auth) headers.Authorization = 'Bearer ' + auth;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
      try {
        const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
        let data = null;
        try { data = await res.json(); } catch (e) { /* empty or not JSON */ }
        return { ok: res.ok, status: res.status, data };
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    // One sign-in at a time: every call that finds no token waits on the same one.
    function signIn() {
      if (!signing) {
        signing = (async () => {
          let dev = load('rk-device');
          if (!dev) { dev = uuid(); store('rk-device', dev); }
          const r = await send('POST', '/v1/auth', { deviceId: dev, name: opts.name || undefined });
          if (!r.ok || !r.data || !r.data.token) throw new Error('sign-in refused (' + r.status + ')');
          token = r.data.token;
          id = r.data.id;
          names.set(id, r.data.name);
          store('rk-token', token);
        })();
        signing.then(() => { signing = null; }, () => { signing = null; });
      }
      return signing;
    }

    // ready: a stored token is checked with GET /v1/me; without one (or when it's refused) the device signs in.
    st.calls++;
    const ready = (async () => {
      try {
        if (token) {
          const r = await send('GET', '/v1/me', undefined, token);
          if (r.ok && r.data && r.data.id) { id = r.data.id; names.set(id, r.data.name); st.online = true; return true; }
          if (r.status !== 401) throw new Error('GET /v1/me ' + r.status);
        }
        await signIn();
        st.online = true;
        return true;
      } catch (e) {
        note(e);
        st.online = false;
        return false;
      }
    })();

    // One API call as this player: signs in when needed, and once more if the token is refused. Never throws.
    // A 404 on a lookup (`soft`) is an answer (no such thing), not an error.
    async function call(method, path, body, fallback, soft) {
      st.calls++;
      try {
        await ready;
        if (!token || !id) await signIn();
        let r = await send(method, path, body, token);
        if (r.status === 401) {
          token = null;
          await signIn();
          r = await send(method, path, body, token);
        }
        st.online = true;
        if (r.ok) return r.data;
        // 'gone:<code>': the server's own 404 with that code answers null ("there is no such thing"); any other
        // failure (a proxy's 404 page, a wrong address) answers the fallback
        if (typeof soft === 'string' && soft.startsWith('gone:') && r.status === 404 && r.data && r.data.error === soft.slice(5)) return null;
        if (!(soft && r.status === 404)) note(method + ' ' + path.split('?')[0] + ' ' + r.status + ' ' + ((r.data && r.data.error) || ''));
        return fallback;
      } catch (e) {
        st.online = false;
        note(e);
        return fallback;
      }
    }
    // A call with the admin token (the playtest dashboard); `gone` treats a 404 as done.
    async function admin(method, path, body, fallback, gone) {
      st.calls++;
      if (!opts.adminToken) return fallback;
      try {
        const r = await send(method, path, body, opts.adminToken);
        if (r.ok) return r.data;
        if (gone && r.status === 404) return true;
        note(method + ' ' + path.split('/').slice(0, 4).join('/') + ' ' + r.status);
      } catch (e) {
        note(e);
      }
      return fallback;
    }
    const remember = (p) => { if (p && p.id) names.set(p.id, p.name || p.keep || 'Warden'); return p; };
    // the artifact backend's Caravans carry their member count as `members`: the game reads either backend alike
    const caravan = (a) => (a ? Object.assign({}, a, { members: a.count }) : null);
    const rememberAll = (list) => { list = arr(list); list.forEach(remember); return list; };

    // ---- live updates: one shared EventSource for every watcher, or one shared poll timer without it
    const watchers = new Set();
    let es = null;
    let polling = typeof EventSource !== 'function';
    let pollTimer = null;
    function openStream() {
      let opened = false;
      try {
        // EventSource can't send headers: the stream route alone takes the token as a query parameter
        es = new EventSource(base + '/v1/stream?token=' + seg(token));
      } catch (e) {
        es = null;
        polling = true;
        return;
      }
      // after a reconnect, pull whatever was missed while the stream was down
      es.onopen = () => { if (opened) watchers.forEach((w) => w.pull()); opened = true; };
      es.onerror = () => {
        // CLOSED means the browser gave up (a refused token, a proxy that drops streams): poll instead
        if (es && es.readyState === 2) { es.close(); es = null; polling = true; streamUp(); }
      };
      EVENTS.forEach((type) => es.addEventListener(type, (e) => {
        let d = null;
        try { d = JSON.parse(e.data); } catch (err) { return; }
        watchers.forEach((w) => w.on(type, d));
      }));
    }
    function streamUp() {
      if (!watchers.size) return;
      if (!polling && !es && token) openStream();
      // poll while there is no stream: no EventSource, a stream that gave up, or not signed in yet (offline at
      // start); each round tries the stream again once a sign-in has worked
      if (!es && !pollTimer) pollTimer = setInterval(() => { watchers.forEach((w) => w.pull()); streamUp(); }, pollMs);
      if (es && pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }
    function watch(w) {
      watchers.add(w);
      ready.then(() => { if (watchers.has(w)) { w.pull(); streamUp(); } });
      return () => {
        if (!watchers.delete(w) || watchers.size) return;
        if (es) { es.close(); es = null; }
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      };
    }
    const safeCb = (cb, v) => { try { cb(v); } catch (e) { note(e); } };

    function watchChat(channel, cb) {
      let msgs = [];
      let seen = new Set();
      let last = 0;
      let first = true;
      let live = true;
      const path = '/v1/chat/' + seg(channel);
      const add = (list) => {
        let fresh = false;
        for (const m of arr(list)) {
          if (!m || seen.has(m.mid)) continue;
          seen.add(m.mid);
          msgs.push(m);
          fresh = true;
          if (m.at > last) last = m.at;
          if (m.name) names.set(m.by, m.name);
        }
        if (fresh && msgs.length > 1) {
          msgs.sort((a, b) => a.at - b.at || Number(a.mid) - Number(b.mid));
          if (msgs.length > 100) { msgs = msgs.slice(-100); seen = new Set(msgs.map((m) => m.mid)); }
        }
        return fresh;
      };
      const emit = () => { if (live) safeCb(cb, msgs.slice()); };
      const off = watch({
        // `since` one millisecond back so messages sharing the newest timestamp aren't missed (repeats drop by id)
        pull: async () => {
          const list = await call('GET', path + (last ? '?since=' + (last - 1) : ''), undefined, null);
          if (list && (add(list) || first)) { first = false; emit(); }
        },
        on: (type, d) => {
          if (type !== 'chat' || !d || d.channel !== channel) return;
          // a moderator removed a message
          if (d.removed) { const n = msgs.length; msgs = msgs.filter((m) => m.mid !== d.removed); if (msgs.length !== n) emit(); return; }
          if (add([d.msg])) emit();
        },
      });
      return () => { live = false; off(); };
    }

    function watchHelps(aid, cb) {
      let live = true;
      let lastKey = null;
      const w = {
        pull: async () => {
          const list = await call('GET', '/v1/helps', undefined, null);
          if (!live || !list) return;
          const open = arr(list).filter((r) => !aid || r.aid === aid);
          const key = JSON.stringify(open);
          if (key !== lastKey) { lastKey = key; safeCb(cb, open); }
        },
        on: (type, d) => { if (type === 'help' && d && (!aid || d.aid === aid)) w.pull(); },
      };
      const off = watch(w);
      return () => { live = false; off(); };
    }

    // Every public call goes through this, so even a bug in here resolves to the fallback instead of rejecting.
    const safe = (fn, fallback) => (...a) => Promise.resolve().then(() => fn(...a)).catch((e) => { note(e); return fallback; });

    return {
      ready,
      online: () => st.online,
      kind: () => 'http',
      me: () => id,
      isAdmin: () => !!opts.adminToken,
      names: safe(async (ids) => {
        const want = [...new Set(arr(ids).filter((x) => typeof x === 'string' && x))];
        const miss = want.filter((x) => !names.has(x));
        for (let i = 0; i < miss.length; i += 100) {
          rememberAll(await call('GET', '/v1/players?' + query({ ids: miss.slice(i, i + 100).join(',') }), undefined, []));
        }
        const out = {};
        for (const x of want) if (names.has(x)) out[x] = names.get(x);
        return out;
      }, {}),
      putProfile: safe(async (p) => remember(await call('PUT', '/v1/players/me', p || {}, null)), null),
      player: safe(async (pid) => remember(await call('GET', '/v1/players/' + seg(pid), undefined, null, true)), null),
      topPlayers: safe(async (by, n) => rememberAll(await call('GET', '/v1/players?' + query({ order: by === 'lp' ? 'lp' : 'power', limit: n || 50 }), undefined, [])), []),
      opponents: safe(async (power, n) => rememberAll(await call('GET', '/v1/players/opponents?' + query({ power, limit: n || 10 }), undefined, [])), []),
      members: safe(async (aid) => rememberAll(await call('GET', '/v1/players?' + query({ aid }), undefined, [])), []),
      alliances: safe(async (n) => arr(await call('GET', '/v1/alliances?' + query({ limit: n || 20 }), undefined, [])).map(caravan), []),
      // null when the Caravan is gone, undefined when the server couldn't be asked (never read as "gone")
      alliance: safe(async (aid) => {
        const a = await call('GET', '/v1/alliances/' + seg(aid), undefined, undefined, 'gone:no_alliance');
        if (a === undefined) return undefined;
        if (a) rememberAll(a.members);
        return caravan(a);
      }, undefined),
      createAlliance: safe(async (o) => { const r = await call('POST', '/v1/alliances', o || {}, null); return (r && r.aid) || null; }, null),
      updateAlliance: safe(async (aid, patch) => !!(await call('PATCH', '/v1/alliances/' + seg(aid), patch || {}, null)), false),
      joinAlliance: safe(async (aid) => !!(await call('POST', '/v1/alliances/' + seg(aid) + '/join', {}, null)), false),
      leaveAlliance: safe(async () => !!(await call('POST', '/v1/alliances/leave', {}, null)), false),
      kick: safe(async (aid, pid) => !!(await call('POST', '/v1/alliances/' + seg(aid) + '/kick', { id: pid }, null)), false),
      watchChat: (channel, cb) => { try { return watchChat(channel, cb); } catch (e) { note(e); return () => {}; } },
      sendChat: safe(async (channel, text) => !!(await call('POST', '/v1/chat/' + seg(channel), { text: String(text || '') }, null)), false),
      // r: { ch, mid, by, text, at } (the server keeps its own copy of the message)
      report: safe(async (r) => !!(await call('POST', '/v1/chat/' + seg(r.ch) + '/' + seg(r.mid) + '/report', {}, null)), false),
      reports: safe(async () => arr(await admin('GET', '/v1/admin/reports', undefined, [])), []),
      // a moderator removes a reported message and closes its report; already gone counts as done
      removeMessage: safe(async (ch, mid, rid) => {
        const a = ch && mid ? await admin('DELETE', '/v1/admin/chat/' + seg(ch) + '/' + seg(mid), undefined, null, true) : true;
        const b = rid ? await admin('DELETE', '/v1/admin/reports/' + seg(rid), undefined, null, true) : true;
        return !!(a && b);
      }, false),
      askHelp: safe(async (o) => {
        o = o || {};
        const r = await call('POST', '/v1/helps', { plot: o.plot, label: o.label, end: o.end, need: o.need }, null);
        return (r && r.rid) || null;
      }, null),
      giveHelp: safe(async (rid) => !!(await call('POST', '/v1/helps/' + seg(rid) + '/help', {}, null)), false),
      watchHelps: (aid, cb) => { try { return watchHelps(aid, cb); } catch (e) { note(e); return () => {}; } },
      dropHelp: safe(async (rid) => !!(await call('DELETE', '/v1/helps/' + seg(rid), undefined, null)), false),
      // the server drops help requests after a day and Arena records after three: nothing for the client to clear
      oldHelps: () => Promise.resolve(null),
      dropBattles: () => Promise.resolve(null),
      boss: safe((aid, day) => call('GET', '/v1/alliances/' + seg(aid) + '/boss?' + query({ day }), undefined, null, true), null),
      hitBoss: safe((aid, day, hp, total) => call('POST', '/v1/alliances/' + seg(aid) + '/boss', { day, hp, total }, null), null),
      // resolves the server's result { bid, win, d, lp, left }: lp is this player's new Arena points
      postBattle: safe((rec) => call('POST', '/v1/battles', { def: rec && rec.def, win: !!(rec && rec.win), ap: rec && rec.ap, dp: rec && rec.dp }, null), null),
      battlesAgainst: safe(async (since) => arr(await call('GET', '/v1/battles?' + query({ since: since || 0 }), undefined, [])), []),
      putTelemetry: safe(async (doc) => !!(await call('PUT', '/v1/telemetry', doc || {}, null)), false),
      allTelemetry: safe(async () => arr(await admin('GET', '/v1/admin/telemetry', undefined, [])), []),
      config: safe(() => call('GET', '/v1/config', undefined, null), null),
      putConfig: safe((cfg) => admin('PUT', '/v1/admin/config', cfg || {}, null), null),
      putSave: safe(async (code) => !!(await call('PUT', '/v1/save', { code: String(code || ''), at: Date.now() }, null)), false),
      getSave: safe(() => call('GET', '/v1/save', undefined, null, true), null),
      setName: safe(async (name) => { const r = await call('PATCH', '/v1/me', { name }, null); if (r) names.set(r.id, r.name); return r ? r.name : null; }, null),
      status: () => ({ kind: 'http', online: st.online, calls: st.calls, errors: st.errors, lastError: st.lastError }),
    };
  };
})();
