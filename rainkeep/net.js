/*
 * Rainkeep: the network layer (NETWORK.md). One interface, KH.net, for the online features (mp.js) and the
 * playtest reports (playtest.js), over whichever backend this copy of the game can reach:
 *   - the claude.ai artifact's shared database and identity (claude.use('db'), claude.use('user')): everyone the
 *     owner shares the game with, at Contributor or above, plays together;
 *   - the Rainkeep server (net-http.js, server/) when DATA.server names one (the native app, a hosted web build).
 * With neither, KH.net.online() is false and the game is the single-player game it always was.
 * Everything another player wrote is untrusted: it is cleaned here (numbers clamped, strings cut and stripped of
 * control characters) before the game sees it, and the UI still escapes every string it shows.
 */
'use strict';
(function () {
  const KH = window.KH;

  // ---- cleaning what other players wrote ----
  const num = (v, lo, hi, d = 0) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  const int = (v, lo, hi, d = 0) => Math.round(num(v, lo, hi, d));
  // eslint-disable-next-line no-control-regex
  const BAD = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;
  const str = (v, n) => (typeof v === 'string' ? v.replace(BAD, '').trim().slice(0, n) : '');
  const idOf = (v) => (typeof v === 'string' && /^[\w:@+.~-]{1,120}$/.test(v) ? v : '');
  const CLS = ['guard', 'bow', 'lancer'];
  const cleanProfile = (id, d) => (!d ? null : {
    id, keep: str(d.keep, 24) || 'A keep', name: str(d.name, 24), power: num(d.power, 0, 1e12), wyrm: int(d.wyrm, 1, 40, 1),
    skin: str(d.skin, 24) || 'river', stage: int(d.stage, 1, 400, 1), cls: CLS.includes(d.cls) ? d.cls : 'guard',
    squad: Array.isArray(d.squad) ? d.squad.slice(0, 5).map((h) => ({ id: str(h && h.id, 20), lvl: int(h && h.lvl, 1, 999, 1), stars: int(h && h.stars, 0, 6, 0) })).filter((h) => h.id) : [],
    lp: int(d.lp, 0, 1e6), aid: idOf(d.aid) || null, seen: num(d.seen, 0, 1e14), ver: str(d.ver, 12),
  });
  const cleanAlliance = (aid, d) => (!d ? null : {
    aid, name: str(d.name, 24) || 'A Caravan', tag: str(d.tag, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'RK',
    color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#3fd0c0', motto: str(d.motto, 80), leader: idOf(d.leader),
    created: num(d.created, 0, 1e14), open: d.open !== false, members: d.members != null ? int(d.members, 0, 999) : null,
  });
  const cleanMsg = (mid, d) => (!d ? null : { mid, by: idOf(d.by), at: num(d.at, 0, 1e14), text: str(d.text, 200) });
  const cleanHelp = (rid, d) => (!d ? null : {
    rid, aid: idOf(d.aid), by: idOf(d.by), plot: str(d.plot, 24), label: str(d.label, 40), at: num(d.at, 0, 1e14), end: num(d.end, 0, 1e14),
    need: int(d.need, 1, 10, 1), hs: d.hs && typeof d.hs === 'object' ? Object.fromEntries(Object.entries(d.hs).filter(([k]) => idOf(k)).slice(0, 40).map(([k, v]) => [k, num(v, 0, 1e14)])) : {},
  });
  const cleanBoss = (d) => (!d ? null : { hp: num(d.hp, 1, 1e9, 1), dmg: d.dmg && typeof d.dmg === 'object' ? Object.fromEntries(Object.entries(d.dmg).filter(([k]) => idOf(k)).slice(0, 60).map(([k, v]) => [k, num(v, 0, 1e7)])) : {} });
  const cleanBattle = (bid, d) => (!d ? null : { bid, att: idOf(d.att), def: idOf(d.def), win: !!d.win, at: num(d.at, 0, 1e14), d: int(d.d, 0, 100), ap: num(d.ap, 0, 1e12), dp: num(d.dp, 0, 1e12) });
  KH.netClean = { num, int, str, idOf, cleanProfile, cleanAlliance, cleanMsg, cleanHelp, cleanBoss, cleanBattle };

  // ---- the artifact backend ----
  function ArtifactNet(db, user, me, canWrite, admin, unsure) {
    const st = { calls: 0, errors: 0, lastError: null };
    // a viewer the platform said nothing about finds out with a refused write; a withdrawn grant ends play
    // online for this visit (db.d.ts: invalid_argument on a well-formed write, revoked)
    const lost = (e) => {
      const c = e && e.code;
      if (canWrite && (c === 'revoked' || (unsure && c === 'invalid_argument'))) { canWrite = false; KH.emit('netReady', { online: false, kind: 'artifact' }); }
    };
    // p: a promise, or a function that makes one (refs are built inside it, so a bad path rejects, never throws)
    const safe = (p, dflt) => {
      st.calls++;
      return Promise.resolve().then(() => (typeof p === 'function' ? p() : p)).then((v) => v, (e) => { st.errors++; st.lastError = (e && (e.code || e.message)) || String(e); if (e && e.code === 'revoked') lost(e); return dflt; });
    };
    const wsafe = (fn, dflt) => { st.calls++; return Promise.resolve().then(fn).then((v) => v, (e) => { st.errors++; st.lastError = (e && (e.code || e.message)) || String(e); lost(e); return dflt; }); };
    // one write at a time per document (the store asks for it): later writes to the same path wait their turn
    const chain = {};
    const write = (path, fn) => { const run = (chain[path] || Promise.resolve()).then(fn, fn); chain[path] = run.catch(() => {}); return wsafe(() => run.then(() => true), false); };
    // a listener the store ended (a budget, a stopped bridge, a withdrawn grant) is dead: only a fresh subscribe
    // brings it back, which the caller does after a pause (onDead)
    const listen = (q, map, cb, onDead) => {
      try {
        return q().onSnapshot((s) => cb(map(s)), (e) => { st.errors++; st.lastError = e && e.code; lost(e); if (onDead) onDead(e && e.code); });
      } catch (e) { st.errors++; st.lastError = e && (e.code || e.message); if (onDead) setTimeout(() => onDead('throw'), 0); return () => {}; }
    };
    const docs = (snap) => (snap && snap.docs ? snap.docs.filter((d) => d.exists) : []);
    const players = () => db.collection('players');
    let lastChat = 0;
    const net = {
      kind: () => 'artifact', online: () => canWrite, me: () => me, isAdmin: () => admin,
      status: () => ({ kind: 'artifact', online: canWrite, ...st }),
      names: async (ids) => {
        const list = [...new Set(ids.filter(Boolean))];
        if (!list.length) return {};
        const ps = await safe(user.profiles(list), {});
        return Object.fromEntries(list.map((id) => [id, (ps[id] && ps[id].name) || '']));
      },
      putProfile: (p) => write(`players/${me}`, () => db.doc(`players/${me}`).set(p)),
      player: (id) => (idOf(id) ? safe(() => db.doc(`players/${id}`).get().then((d) => (d.exists ? cleanProfile(id, d.data()) : null)), null) : Promise.resolve(null)),
      topPlayers: (by, n) => safe(players().orderBy(by === 'lp' ? 'lp' : 'power', 'desc').limit(Math.min(100, n || 50)).get().then((s) => docs(s).map((d) => cleanProfile(d.id, d.data()))), []),
      opponents: (power, n) => safe(players().where('power', '>=', power * 0.6).where('power', '<=', power * 1.4).limit(60).get()
        .then((s) => docs(s).filter((d) => d.id !== me).map((d) => cleanProfile(d.id, d.data())).sort((a, b) => Math.abs(a.power - power) - Math.abs(b.power - power)).slice(0, n || 8)), []),
      members: (aid) => safe(players().where('aid', '==', aid).limit(60).get().then((s) => docs(s).map((d) => cleanProfile(d.id, d.data()))), []),
      alliances: (n) => safe(db.collection('al').orderBy('created', 'desc').limit(Math.min(50, n || 30)).get().then((s) => docs(s).map((d) => cleanAlliance(d.id, d.data()))), []),
      // null: no such Caravan; undefined: the store couldn't say just now (never read as "gone")
      alliance: (aid) => (idOf(aid) ? safe(() => db.doc(`al/${aid}`).get().then((d) => (d.exists ? cleanAlliance(aid, d.data()) : null)), undefined) : Promise.resolve(null)),
      createAlliance: async (o) => {
        const id = await safe(() => db.collection('al').doc().id, null);
        if (!id) return null;
        const ok = await write(`al/${id}`, () => db.doc(`al/${id}`).set({ name: str(o.name, 24), tag: str(o.tag, 4), color: o.color, motto: str(o.motto, 80), leader: me, created: Date.now(), open: true }));
        return ok ? id : null;
      },
      updateAlliance: (aid, patch) => write(`al/${aid}`, () => db.doc(`al/${aid}`).update(patch)),
      // membership lives on each player's own profile (mp.js writes it), so joining touches nobody else's data
      joinAlliance: async () => true,
      leaveAlliance: async () => true,
      watchChat: (channel, cb, onDead) => listen(() => db.collection(`chat/${channel}/m`).orderBy('at', 'desc').limit(60), (s) => docs(s).map((d) => cleanMsg(d.id, d.data())).filter((m) => m.text).reverse(), cb, onDead),
      sendChat: async (channel, text) => {
        const t = str(text, 200);
        if (!t || Date.now() - lastChat < 2000) return false;
        lastChat = Date.now();
        const col = () => db.collection(`chat/${channel}/m`);
        const ok = await wsafe(() => col().add({ by: me, at: Date.now(), text: t }).then(() => true), false);
        // each channel keeps its newest 100: now and then the sender clears what is older
        if (ok && Math.random() < 0.15) {
          safe(() => col().orderBy('at', 'desc').limit(300).get().then((s) => Promise.all(docs(s).slice(100).map((d) => col().doc(d.id).delete()))), null);
        }
        return ok;
      },
      // onId hears the request's id before it is written: the store shows a write in snapshots before it
      // confirms it, and the asker's game must already know the request is its own (mp.js applyHelps)
      askHelp: async (o, onId) => {
        const id = await safe(() => db.collection('hp').doc().id, null);
        if (!id) return null;
        if (onId) onId(id);
        const ok = await write(`hp/${id}`, () => db.doc(`hp/${id}`).set({ aid: o.aid, by: me, plot: str(o.plot, 24), label: str(o.label, 40), at: Date.now(), end: o.end, need: o.need, hs: {} }));
        return ok ? id : null;
      },
      // a nested merge: two helpers at once both count
      giveHelp: (rid) => write(`hp/${rid}`, () => db.doc(`hp/${rid}`).update({ hs: { [me]: Date.now() } })),
      dropHelp: (rid) => write(`hp/${rid}`, () => db.doc(`hp/${rid}`).delete()),
      watchHelps: (aid, cb, onDead) => listen(() => db.collection('hp').where('aid', '==', aid).limit(100), (s) => docs(s).map((d) => cleanHelp(d.id, d.data())), cb, onDead),
      oldHelps: (aid, before) => safe(() => db.collection('hp').where('aid', '==', aid).where('at', '<', before).limit(50).get().then((s) => Promise.all(docs(s).map((d) => db.doc(`hp/${d.id}`).delete()))), null),
      boss: (aid, day) => safe(() => db.doc(`al/${aid}/boss/${day}`).get().then((d) => (d.exists ? cleanBoss(d.data()) : null)), null),
      // the day's boss is made once, then every hit is a nested merge of the hitter's own total: two members
      // striking first at the same moment both count
      hitBoss: async (aid, day, hp, total) => {
        const path = `al/${aid}/boss/${day}`;
        const made = await write(path, async () => { const ref = db.doc(path); const d = await ref.get(); if (!d.exists) await ref.set({ hp, dmg: {} }); });
        if (!made) return false;
        return write(path, () => db.doc(path).update({ dmg: { [me]: total } }));
      },
      postBattle: (rec) => wsafe(() => db.collection('bt').add({ ...rec, att: me, at: Date.now() }).then(() => true), false),
      // oldest first, so a long list is read in order and nothing is skipped (mp.js remembers what it has seen)
      battlesAgainst: (since) => safe(() => db.collection('bt').where('def', '==', me).where('at', '>', since).orderBy('at').limit(50).get().then((s) => docs(s).map((d) => cleanBattle(d.id, d.data()))), []),
      dropBattles: (before) => safe(() => db.collection('bt').where('def', '==', me).where('at', '<', before).limit(50).get().then((s) => Promise.all(docs(s).map((d) => db.doc(`bt/${d.id}`).delete()))), null),
      // moderation (the owner): a reported message is deleted and remembered as removed in cfg/mod, so the
      // reports that name it (they travel in the reporters' own playtest reports, playtest.js) drop off the sheet
      removeMessage: (ch, mid) => {
        if (!/^(world|al-[\w:@+.~-]+)$/.test(ch) || !idOf(mid)) return Promise.resolve(false);
        const mod = db.doc('cfg/mod');
        return safe(() => db.doc(`chat/${ch}/m/${mid}`).delete().then(() => write('cfg/mod', async () => { const d = await mod.get(); if (d.exists) await mod.update({ removed: { [mid]: Date.now() } }); else await mod.set({ removed: { [mid]: Date.now() } }); })), false);
      },
      moderation: () => safe(() => db.doc('cfg/mod').get().then((d) => (d.exists && d.data().removed && typeof d.data().removed === 'object' ? d.data().removed : {})), {}),
      putTelemetry: (doc) => write(`pt/${me}`, () => db.doc(`pt/${me}`).set(doc)),
      allTelemetry: () => safe(() => db.collection('pt').limit(1000).get().then((s) => docs(s).map((d) => ({ id: d.id, ...d.data() }))), []),
      config: () => safe(() => db.doc('cfg/live').get().then((d) => (d.exists ? d.data() : null)), null),
    };
    return net;
  }

  // ---- the server's answers pass through the same cleaning as the artifact's ----
  function cleaned(h) {
    const each = (f) => (list) => (Array.isArray(list) ? list.map(f).filter(Boolean) : []);
    const prof = (p) => (p && typeof p === 'object' ? cleanProfile(idOf(p.id), p) : null);
    const al = (a) => (a && typeof a === 'object' ? cleanAlliance(idOf(a.aid), a) : a === undefined ? undefined : null);
    const msg = (m) => (m && typeof m === 'object' ? cleanMsg(idOf(String(m.mid != null ? m.mid : m.id)), m) : null);
    const help = (r) => (r && typeof r === 'object' ? cleanHelp(idOf(String(r.rid != null ? r.rid : r.id)), r) : null);
    const bt = (r) => (r && typeof r === 'object' ? cleanBattle(idOf(String(r.bid != null ? r.bid : r.id)), r) : null);
    const then = (k, f) => (...a) => Promise.resolve(h[k](...a)).then(f);
    return {
      ...h,
      player: then('player', prof), topPlayers: then('topPlayers', each(prof)), opponents: then('opponents', each(prof)), members: then('members', each(prof)),
      alliances: then('alliances', each(al)), alliance: then('alliance', al),
      watchChat: (ch, cb, onDead) => h.watchChat(ch, (list) => cb(each(msg)(list).filter((m) => m.text)), onDead),
      watchHelps: (aid, cb, onDead) => h.watchHelps(aid, (list) => cb(each(help)(list)), onDead),
      boss: then('boss', (b) => (b && typeof b === 'object' ? cleanBoss(b) : null)),
      battlesAgainst: then('battlesAgainst', each(bt)),
    };
  }

  // ---- offline: every call answers "nothing" ----
  const none = () => Promise.resolve(null);
  const OFF = {
    kind: () => null, online: () => false, me: () => null, isAdmin: () => false, status: () => ({ kind: null, online: false, calls: 0, errors: 0, lastError: null }),
    names: () => Promise.resolve({}), putProfile: none, player: none, topPlayers: () => Promise.resolve([]), opponents: () => Promise.resolve([]), members: () => Promise.resolve([]),
    alliances: () => Promise.resolve([]), alliance: none, createAlliance: none, updateAlliance: none, joinAlliance: none, leaveAlliance: none,
    watchChat: () => () => {}, sendChat: () => Promise.resolve(false), askHelp: none, giveHelp: () => Promise.resolve(false), dropHelp: none, watchHelps: () => () => {}, oldHelps: none,
    boss: none, hitBoss: () => Promise.resolve(false), postBattle: () => Promise.resolve(false), battlesAgainst: () => Promise.resolve([]), dropBattles: none,
    putTelemetry: () => Promise.resolve(false), allTelemetry: () => Promise.resolve([]), config: none, removeMessage: () => Promise.resolve(false), moderation: () => Promise.resolve({}),
    report: () => Promise.resolve(false), reports: () => Promise.resolve([]),
  };

  // KH.net forwards to the backend once it is known; until then (and without one) it is offline
  let impl = OFF;
  const facade = {};
  for (const k of Object.keys(OFF)) facade[k] = (...a) => (typeof impl[k] === 'function' ? impl[k] : OFF[k])(...a);
  let resolveReady;
  facade.ready = new Promise((r) => { resolveReady = r; });
  KH.net = facade;

  async function pick() {
    // a server named in data.js (the native app, a hosted build) comes first
    if (DATA.server && window.RKHttpNet) {
      try {
        // the server's admin token (the Playtest sheet) is never built in: a team member's own device holds it,
        // set once by hand (server/README.md)
        let adminToken;
        try { adminToken = localStorage.getItem('rk-admin') || undefined; } catch (e) { /* storage blocked */ }
        const h = window.RKHttpNet(DATA.server, { adminToken });
        await h.ready;
        if (h.online()) { impl = cleaned(h); return; }
      } catch (e) { /* fall through */ }
    }
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return;
    const [db, user] = await Promise.all([C.use('db').catch(() => null), C.use('user').catch(() => null)]);
    if (!db || !user) return;
    const me = await user.id();
    if (!me) return;
    // a viewer who may not write shared data (Viewer, Commenter) plays alone; when the platform says nothing,
    // the first refused write decides (ArtifactNet: lost)
    const can = await user.can('data.write');
    const admin = (await user.isOwner()) || (await user.canEdit());
    impl = ArtifactNet(db, user, me, can !== false, admin, can == null);
  }
  KH.on('booted', () => {
    pick().catch(() => {}).then(() => { resolveReady(facade.online()); KH.emit('netReady', { online: facade.online(), kind: facade.kind() }); });
  });
})();
