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
  function ArtifactNet(db, user, me, canWrite, admin) {
    const st = { calls: 0, errors: 0, lastError: null };
    const safe = (p, dflt) => { st.calls++; return Promise.resolve(p).then((v) => v, (e) => { st.errors++; st.lastError = (e && (e.code || e.message)) || String(e); return dflt; }); };
    // one write at a time per document (the store asks for it): later writes to the same path wait their turn
    const chain = {};
    const write = (path, fn) => { const run = (chain[path] || Promise.resolve()).then(fn, fn); chain[path] = run.catch(() => {}); return safe(run.then(() => true), false); };
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
      player: (id) => safe(db.doc(`players/${id}`).get().then((d) => (d.exists ? cleanProfile(id, d.data()) : null)), null),
      topPlayers: (by, n) => safe(players().orderBy(by === 'lp' ? 'lp' : 'power', 'desc').limit(Math.min(100, n || 50)).get().then((s) => docs(s).map((d) => cleanProfile(d.id, d.data()))), []),
      opponents: (power, n) => safe(players().where('power', '>=', power * 0.6).where('power', '<=', power * 1.4).limit(60).get()
        .then((s) => docs(s).filter((d) => d.id !== me).map((d) => cleanProfile(d.id, d.data())).sort((a, b) => Math.abs(a.power - power) - Math.abs(b.power - power)).slice(0, n || 8)), []),
      members: (aid) => safe(players().where('aid', '==', aid).limit(60).get().then((s) => docs(s).map((d) => cleanProfile(d.id, d.data()))), []),
      alliances: (n) => safe(db.collection('al').orderBy('created', 'desc').limit(Math.min(50, n || 30)).get().then((s) => docs(s).map((d) => cleanAlliance(d.id, d.data()))), []),
      alliance: (aid) => safe(db.doc(`al/${aid}`).get().then((d) => (d.exists ? cleanAlliance(aid, d.data()) : null)), null),
      createAlliance: async (o) => {
        const ref = db.collection('al').doc();
        const ok = await write(`al/${ref.id}`, () => ref.set({ name: str(o.name, 24), tag: str(o.tag, 4), color: o.color, motto: str(o.motto, 80), leader: me, created: Date.now(), open: true }));
        return ok ? ref.id : null;
      },
      updateAlliance: (aid, patch) => write(`al/${aid}`, () => db.doc(`al/${aid}`).update(patch)),
      // membership lives on each player's own profile (mp.js writes it), so joining touches nobody else's data
      joinAlliance: async () => true,
      leaveAlliance: async () => true,
      watchChat: (channel, cb) => {
        try {
          return db.collection(`chat/${channel}/m`).orderBy('at', 'desc').limit(60).onSnapshot((s) => cb(docs(s).map((d) => cleanMsg(d.id, d.data())).filter((m) => m.text).reverse()), (e) => { st.errors++; st.lastError = e && e.code; });
        } catch (e) { st.errors++; return () => {}; }
      },
      sendChat: async (channel, text) => {
        const t = str(text, 200);
        if (!t || Date.now() - lastChat < 2000) return false;
        lastChat = Date.now();
        const col = db.collection(`chat/${channel}/m`);
        const ok = await safe(col.add({ by: me, at: Date.now(), text: t }).then(() => true), false);
        // each channel keeps its newest 100: now and then the sender clears what is older
        if (ok && Math.random() < 0.15) {
          safe(col.orderBy('at', 'desc').limit(300).get().then((s) => Promise.all(docs(s).slice(100).map((d) => col.doc(d.id).delete()))), null);
        }
        return ok;
      },
      askHelp: async (o) => {
        const ref = db.collection('hp').doc();
        const ok = await write(`hp/${ref.id}`, () => ref.set({ aid: o.aid, by: me, plot: str(o.plot, 24), label: str(o.label, 40), at: Date.now(), end: o.end, need: o.need, hs: {} }));
        return ok ? ref.id : null;
      },
      // a nested merge: two helpers at once both count
      giveHelp: (rid) => write(`hp/${rid}`, () => db.doc(`hp/${rid}`).update({ hs: { [me]: Date.now() } })),
      dropHelp: (rid) => write(`hp/${rid}`, () => db.doc(`hp/${rid}`).delete()),
      watchHelps: (aid, cb) => {
        try {
          return db.collection('hp').where('aid', '==', aid).limit(100).onSnapshot((s) => cb(docs(s).map((d) => cleanHelp(d.id, d.data()))), (e) => { st.errors++; st.lastError = e && e.code; });
        } catch (e) { st.errors++; return () => {}; }
      },
      oldHelps: (aid, before) => safe(db.collection('hp').where('aid', '==', aid).where('at', '<', before).limit(50).get().then((s) => Promise.all(docs(s).map((d) => db.doc(`hp/${d.id}`).delete()))), null),
      boss: (aid, day) => safe(db.doc(`al/${aid}/boss/${day}`).get().then((d) => (d.exists ? cleanBoss(d.data()) : null)), null),
      hitBoss: async (aid, day, hp, total) => {
        const ref = db.doc(`al/${aid}/boss/${day}`);
        return write(ref.path, async () => { const d = await ref.get(); if (d.exists) await ref.update({ dmg: { [me]: total } }); else await ref.set({ hp, dmg: { [me]: total } }); });
      },
      postBattle: (rec) => safe(db.collection('bt').add({ ...rec, att: me, at: Date.now() }).then(() => true), false),
      battlesAgainst: (since) => safe(db.collection('bt').where('def', '==', me).where('at', '>', since).limit(50).get().then((s) => docs(s).map((d) => cleanBattle(d.id, d.data()))), []),
      dropBattles: (before) => safe(db.collection('bt').where('def', '==', me).where('at', '<', before).limit(50).get().then((s) => Promise.all(docs(s).map((d) => db.doc(`bt/${d.id}`).delete()))), null),
      // a reported chat message, for the owner's Playtest sheet; the owner removes it from there
      report: (r) => safe(db.collection('rp').add({ ch: str(r.ch, 60), mid: idOf(r.mid), by: idOf(r.by), text: str(r.text, 200), at: num(r.at, 0, 1e14), rep: me, rat: Date.now() }).then(() => true), false),
      reports: () => safe(db.collection('rp').orderBy('rat', 'desc').limit(50).get().then((s) => docs(s).map((d) => ({ rid: d.id, ch: str(d.data().ch, 60), mid: idOf(d.data().mid), by: idOf(d.data().by), text: str(d.data().text, 200), rep: idOf(d.data().rep), rat: num(d.data().rat, 0, 1e14) }))), []),
      removeMessage: (ch, mid, rid) => safe(Promise.all([/^(world|al-[\w:@+.~-]+)$/.test(ch) && idOf(mid) ? db.doc(`chat/${ch}/m/${mid}`).delete() : null, rid ? db.doc(`rp/${rid}`).delete() : null]).then(() => true), false),
      putTelemetry: (doc) => write(`pt/${me}`, () => db.doc(`pt/${me}`).set(doc)),
      allTelemetry: () => safe(db.collection('pt').limit(1000).get().then((s) => docs(s).map((d) => ({ id: d.id, ...d.data() }))), []),
      config: () => safe(db.doc('cfg/live').get().then((d) => (d.exists ? d.data() : null)), null),
    };
    return net;
  }

  // ---- offline: every call answers "nothing" ----
  const none = () => Promise.resolve(null);
  const OFF = {
    kind: () => null, online: () => false, me: () => null, isAdmin: () => false, status: () => ({ kind: null, online: false, calls: 0, errors: 0, lastError: null }),
    names: () => Promise.resolve({}), putProfile: none, player: none, topPlayers: () => Promise.resolve([]), opponents: () => Promise.resolve([]), members: () => Promise.resolve([]),
    alliances: () => Promise.resolve([]), alliance: none, createAlliance: none, updateAlliance: none, joinAlliance: none, leaveAlliance: none,
    watchChat: () => () => {}, sendChat: () => Promise.resolve(false), askHelp: none, giveHelp: () => Promise.resolve(false), dropHelp: none, watchHelps: () => () => {}, oldHelps: none,
    boss: none, hitBoss: () => Promise.resolve(false), postBattle: () => Promise.resolve(false), battlesAgainst: () => Promise.resolve([]), dropBattles: none,
    putTelemetry: () => Promise.resolve(false), allTelemetry: () => Promise.resolve([]), config: none, report: () => Promise.resolve(false), reports: () => Promise.resolve([]), removeMessage: () => Promise.resolve(false),
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
        const h = window.RKHttpNet(DATA.server, {});
        await h.ready;
        if (h.online()) { impl = h; return; }
      } catch (e) { /* fall through */ }
    }
    const C = window.claude;
    if (!C || typeof C.use !== 'function') return;
    const [db, user] = await Promise.all([C.use('db').catch(() => null), C.use('user').catch(() => null)]);
    if (!db || !user) return;
    const me = await user.id();
    if (!me) return;
    // a viewer who may not write shared data (Viewer, Commenter) plays alone; when the platform says nothing,
    // the first write decides
    const can = await user.can('data.write');
    let canWrite = can !== false;
    const admin = (await user.isOwner()) || (await user.canEdit());
    if (can == null) {
      try { await db.doc(`players/${me}`).get(); } catch (e) { canWrite = false; }
    }
    impl = ArtifactNet(db, user, me, canWrite, admin);
  }
  KH.on('booted', () => {
    pick().catch(() => {}).then(() => { resolveReady(facade.online()); KH.emit('netReady', { online: facade.online(), kind: facade.kind() }); });
  });
})();
