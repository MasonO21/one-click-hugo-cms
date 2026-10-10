/*
 * Rainkeep: playing with real people. When KH.net has a backend (net.js: the claude.ai link shared with friends,
 * or the Rainkeep server), the Caravan tab opens on its Online side:
 *   - a real Caravan to found or join: its members, chat, help on each other's builds and research, and a shared
 *     boss each day, the Glass Serpent, whose health the members wear down together;
 *   - the Arena: attack other wardens' keeps (each fights as an expedition foe of its own stage, behind walls,
 *     the rule the simulated rival keeps use), win Arena points from them, and revenge the ones who hit you;
 *   - the Wardens board of every real player, and the Square, a chat for everyone.
 * The simulated Caravan stays one tap away, and without a backend the tab is exactly what it was.
 * This file is the game side: state in S.online, what each action does, and the panels. net.js does the talking.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { icon, esc, fmt, clamp } = KH.u;
  const { UI, ACT } = KH;
  const O = DATA.online;
  const net = KH.net;
  let S = null;
  KH.hooks.boot.push(() => {
    S = KH.S;
    // an ask cut short by closing the game
    if (S.online) for (const k of Object.keys(S.online.mine)) if (S.online.mine[k] === 'asking') delete S.online.mine[k];
  });
  KH.hooks.defaults.push((s) => {
    s.online = { lp: 0, aid: null, attacks: { day: 0, n: 0 }, wins: { day: 0, n: 0 }, seenBt: 0, log: [], boss: { day: 0, hits: 0, total: 0, claimed: 0 },
      helped: {}, helpDay: { day: 0, n: 0 }, applied: {}, mine: {}, chatSeen: {}, autoAsk: true, blocked: {} };
    s.stats.arenaWins = 0; s.stats.onlineHelps = 0; s.stats.bossHits = 0;
  });
  // the online day is the same for everyone (UTC): a Caravan's boss of the day is one document for all its
  // members wherever they live, and the server's attack limit turns over at the same moment
  const today = () => Math.floor(Date.now() / 864e5);
  const now = () => Date.now();
  const on = () => net.online();
  const me = () => net.me();

  // ---- what the network has told us (not saved) ----
  const M = { top: [], topAt: 0, lp: [], opp: [], oppAt: 0, als: [], alsAt: 0, al: null, members: [], membersAt: 0, chat: { world: [], al: [] }, helps: [], boss: null, bossAt: 0, names: {}, busy: {}, err: null };
  KH.mp = { M, today };
  // network news redraws without forcing, so a tap in progress isn't lost to it
  const refresh = () => KH.renderAll();
  // a display name for a player id: the name the backend knows, else their keep
  const nameOf = (id, p) => (id === me() ? 'You' : M.names[id] || (p && p.name) || 'A warden');
  const keepOf = (p) => `${p.keep}'s keep`;
  const wantNames = (ids) => {
    const miss = ids.filter((id) => id && !(id in M.names));
    if (!miss.length) return;
    miss.forEach((id) => { M.names[id] = ''; });
    net.names(miss).then((r) => { Object.assign(M.names, r); refresh(); });
  };
  const fresh = (at, ms) => now() - at < ms;
  const onlineNow = (p) => p && (p.id === me() || now() - p.seen < 5 * 60000);

  // ======================================================================
  // My profile: what other players see of this keep
  // ======================================================================
  const leadCls = () => {
    if (S.formation && ['guard', 'bow', 'lancer'].includes(S.formation)) return S.formation;
    const t = S.troops || {};
    return ['guard', 'bow', 'lancer'].sort((a, b) => (t[b] || 0) - (t[a] || 0))[0];
  };
  function profile() {
    return {
      v: 1, keep: S.wyrm.name, power: Math.round(KH.power()), wyrm: S.lv.wyrm, skin: S.skins.on, stage: S.stage, cls: leadCls(),
      squad: KH.squadHome().slice(0, 5).map((id) => ({ id, lvl: S.heroes[id].lvl, stars: S.heroes[id].stars })),
      lp: S.online.lp, aid: S.online.aid, seen: now(), ver: DATA.version,
    };
  }
  let lastPut = '', lastPutAt = 0;
  function syncProfile(force) {
    if (!on() || !S) return Promise.resolve(false);
    const p = profile(), key = JSON.stringify({ ...p, seen: 0, power: Math.round(p.power / 50) });
    if (!force && key === lastPut && now() - lastPutAt < 120000) return Promise.resolve(false);
    if (!force && now() - lastPutAt < 60000 && key !== lastPut && lastPut) return Promise.resolve(false);
    lastPut = key; lastPutAt = now();
    return net.putProfile(p);
  }
  KH.mp.syncProfile = syncProfile;

  // ======================================================================
  // The Caravan (alliance): found, join, leave
  // ======================================================================
  let alUnsub = null, helpUnsub = null, worldUnsub = null, watchedAid = null;
  const deadAt = { al: 0, world: 0 };
  // a listener the store ended comes back on a later tick, after a pause (its own: the Square's ending doesn't
  // hold up a change of Caravan)
  const dead = (which) => () => {
    deadAt[which] = now();
    if (which === 'world') { if (worldUnsub) worldUnsub(); worldUnsub = null; } else watchedAid = undefined;
  };
  function unwatchAlliance() {
    if (alUnsub) alUnsub(); if (helpUnsub) helpUnsub();
    alUnsub = helpUnsub = null; watchedAid = null;
  }
  function watchAlliance() {
    const aid = S.online.aid;
    if (aid === watchedAid) return;
    if (watchedAid === undefined && aid && now() - deadAt.al < 30000) return; // only a dead listener waits
    const again = watchedAid === undefined && aid && M.al && M.al.aid === aid;
    if (alUnsub) alUnsub(); if (helpUnsub) helpUnsub();
    alUnsub = helpUnsub = null; watchedAid = aid;
    if (!again) { M.chat.al = []; M.helps = []; M.boss = null; M.al = null; M.members = []; }
    if (!aid) return;
    loadAl(true);
    loadMembers(true);
    alUnsub = net.watchChat(`al-${aid}`, (list) => { M.chat.al = list; wantNames(list.map((m) => m.by)); refresh(); }, dead('al'));
    helpUnsub = net.watchHelps(aid, (list) => { M.helps = list; applyHelps(); wantNames(list.map((h) => h.by)); refresh(); }, dead('al'));
    loadBoss(true);
    // help requests older than a day go
    net.oldHelps(aid, now() - 864e5);
  }
  // the Caravan itself (its motto, colour, leader): re-read now and then, since others change it. Only a read
  // that says it is gone takes this keep out of it; one that fails says nothing (net.js: undefined)
  function loadAl(force) {
    const aid = S.online.aid;
    if (!aid || (!force && fresh(M.alAt || 0, 30000))) return;
    M.alAt = now();
    net.alliance(aid).then((a) => {
      if (S.online.aid !== aid || a === undefined) return;
      M.al = a;
      if (a === null) { S.online.aid = null; syncProfile(true); }
      refresh();
    });
  }
  function loadMembers(force) {
    const aid = S.online.aid;
    if (!aid || (!force && fresh(M.membersAt, 30000))) return;
    M.membersAt = now();
    loadAl();
    net.members(aid).then((list) => { if (S.online.aid !== aid) return; M.members = list; wantNames(list.map((p) => p.id)); refresh(); });
  }
  function loadTop(force) {
    if (!force && fresh(M.topAt, 30000)) return;
    M.topAt = now();
    net.topPlayers('power', 100).then((list) => { M.top = list; M.topLoaded = true; wantNames(list.map((p) => p.id)); refresh(); });
    net.topPlayers('lp', 50).then((list) => { M.lp = list; refresh(); });
  }
  function loadAlliances(force) {
    if (!force && fresh(M.alsAt, 30000)) return;
    M.alsAt = now();
    net.alliances(30).then((list) => { M.als = list; refresh(); });
    loadTop(force);
  }
  // members of each Caravan, counted from the board (a closed test is well under its hundred)
  const countOf = (aid) => M.top.filter((p) => p.aid === aid).length;

  const TAG = /^[A-Z0-9]{2,4}$/;
  const COLORS = ['#3fd0c0', '#e8b54a', '#c0392b', '#8a6ad0', '#2fa89a', '#d4783a'];
  ACT.mpcreate = async () => {
    if (!on() || S.online.aid) return;
    const el = (id) => document.getElementById(id);
    const name = KH.netClean.str(el('al-name') ? el('al-name').value : '', 24), tag = KH.netClean.str(el('al-tag') ? el('al-tag').value : '', 4).toUpperCase();
    if (name.length < 3) return KH.toast('Give your Caravan a name of at least 3 letters.', 'warn');
    if (!TAG.test(tag)) return KH.toast('A tag is 2 to 4 letters or digits, like WEL.', 'warn');
    if (S.lv.wyrm < O.found) return KH.toast(`Founding a Caravan takes Rainwyrm Lv ${O.found}.`, 'warn');
    if (M.busy.create) return;
    M.busy.create = true;
    const aid = await net.createAlliance({ name, tag, color: COLORS[Math.floor(Math.random() * COLORS.length)], motto: 'Water for every cup.' });
    M.busy.create = false;
    if (!aid) return KH.toast('The Caravan could not be founded just now. Try again in a moment.', 'warn');
    S.online.aid = aid;
    await net.joinAlliance(aid);
    syncProfile(true);
    watchAlliance();
    KH.toast(`You founded ${name} [${tag}]. Share the game's link so friends can join you.`, 'good');
    KH.sfx('claim');
    KH.save(); refresh();
  };
  ACT.mpjoin = async (aid) => {
    if (!on() || S.online.aid) return;
    const a = M.als.find((x) => x.aid === aid) || (await net.alliance(aid));
    if (!a) return KH.toast('That Caravan has broken camp.', 'warn');
    if (!a.open) return KH.toast(`${a.name} isn't taking new members.`, 'warn');
    const members = await net.members(aid);
    if (members.length >= O.caravanMax) return KH.toast(`${a.name} is full (${O.caravanMax} members).`, 'warn');
    if ((await net.joinAlliance(aid)) === false) return KH.toast('Joining failed. Try again in a moment.', 'warn');
    S.online.aid = aid;
    syncProfile(true);
    watchAlliance();
    KH.toast(`You joined ${a.name} [${a.tag}].`, 'good');
    KH.sfx('claim');
    KH.save(); refresh();
  };
  ACT.mpleave = () => { UI.mpLeave = true; };
  ACT.mpleaveno = () => { UI.mpLeave = false; };
  ACT.mpleaveyes = async () => {
    UI.mpLeave = false;
    const aid = S.online.aid, a = M.al;
    if (!aid) return;
    // a leader hands the Caravan to its strongest remaining member
    if (a && a.leader === me()) {
      const next = M.members.filter((p) => p.id !== me()).sort((x, y) => y.power - x.power)[0];
      if (next) await net.updateAlliance(aid, { leader: next.id });
    }
    await net.leaveAlliance();
    S.online.aid = null;
    syncProfile(true);
    watchAlliance();
    KH.toast(`You left ${a ? a.name : 'the Caravan'}.`, '');
    KH.save(); refresh();
  };
  ACT.mpmotto = async () => {
    const el = document.getElementById('al-motto');
    if (!M.al || M.al.leader !== me() || !el) return;
    const motto = KH.netClean.str(el.value, 80);
    if (await net.updateAlliance(M.al.aid, { motto })) { M.al.motto = motto; KH.toast('Motto saved.', 'good'); refresh(); }
  };
  ACT.mpopen = async () => {
    if (!M.al || M.al.leader !== me()) return;
    const open = !M.al.open;
    if (await net.updateAlliance(M.al.aid, { open })) { M.al.open = open; refresh(); }
  };

  // ======================================================================
  // Chat: the Caravan's, and the Square for everyone
  // ======================================================================
  ACT.mpchat = async (ch) => {
    const el = document.getElementById(`chat-${ch}`);
    if (!el || !on()) return;
    const text = KH.netClean.str(el.value, 200);
    if (!text) return;
    const channel = ch === 'al' ? (S.online.aid ? `al-${S.online.aid}` : null) : 'world';
    if (!channel) return;
    el.value = '';
    if (!(await net.sendChat(channel, text))) { el.value = text; KH.toast('Slow down a moment, then send again.', 'warn'); }
  };
  function watchWorld(want) {
    if (want && !worldUnsub && now() - deadAt.world > 30000) worldUnsub = net.watchChat('world', (list) => { M.chat.world = list; wantNames(list.map((m) => m.by)); refresh(); }, dead('world'));
    if (!want && worldUnsub) { worldUnsub(); worldUnsub = null; }
  }
  const unread = (key) => { const list = M.chat[key]; const last = list.length ? list[list.length - 1] : null; return !!last && last.by !== me() && last.at > (S.online.chatSeen[key] || 0); };

  // ======================================================================
  // Help: ask the Caravan for help on a build or research, and help theirs
  // ======================================================================
  const jobLabel = (key) => (key === 'research' ? `Research: ${(DATA.techs.find((t) => S.research && t.id === S.research.tech) || { name: 'research' }).name}` : `${KH.plotName(key)} to Lv ${(S.lv[key] || 0) + 1}`);
  // asks in flight (not saved: a save made mid-ask that still says 'asking' is cleared by applyHelps)
  const asking = new Set();
  async function ask(key) {
    if (!on() || !S.online.aid || S.online.mine[key]) return;
    const job = KH.findJob(key);
    if (!job || job.end <= S.time) return;
    S.online.mine[key] = 'asking';
    asking.add(key);
    // the id is known before the request shows up in the Caravan's list, so it is never taken for a stray
    const rid = await net.askHelp({ aid: S.online.aid, plot: key, label: jobLabel(key), end: now() + (job.end - S.time) * 1000, need: O.help.need }, (id) => { S.online.mine[key] = id; });
    asking.delete(key);
    if (rid) S.online.mine[key] = rid; else delete S.online.mine[key];
    refresh();
  }
  ACT.mpask = (key) => ask(key);
  KH.on('buildStart', (e) => { if (S && S.online.autoAsk) ask(e.plot); });
  KH.on('researchStart', () => { if (S && S.online.autoAsk) ask('research'); });
  // helpers on my requests cut my timers, once each; finished or fully helped requests go
  function applyHelps() {
    if (!S) return;
    const mineByRid = Object.fromEntries(Object.entries(S.online.mine).map(([k, rid]) => [rid, k]));
    for (const h of M.helps) {
      if (h.by !== me()) continue;
      const key = mineByRid[h.rid], job = key && KH.findJob(key);
      // a request of mine this save doesn't know: one still being asked for (the server's id arrives with the
      // answer), or a stray from another device or an older save, cleared once it is a few minutes old
      if (!key && (asking.size || now() - h.at < 3 * 60000)) continue;
      const done = S.online.applied[h.rid] || [];
      const fresh2 = Object.keys(h.hs).filter((id) => id !== me() && !done.includes(id)).slice(0, Math.max(0, h.need - done.length));
      if (fresh2.length && job && job.end > S.time) {
        for (let i = 0; i < fresh2.length; i++) KH.cutJob(job, Math.max(O.help.cut * (job.end - job.start), O.help.min));
        wantNames(fresh2);
        const who = nameOf(fresh2[0]) || 'A Caravan member';
        KH.toast(`${who}${fresh2.length > 1 ? ` and ${fresh2.length - 1} more` : ''} helped: ${h.label}.`, 'good', 'mphelp', 4);
      }
      S.online.applied[h.rid] = done.concat(fresh2);
      if (!job || job.end <= S.time || S.online.applied[h.rid].length >= h.need) {
        net.dropHelp(h.rid);
        delete S.online.applied[h.rid];
        if (key) delete S.online.mine[key];
      }
    }
    // requests of mine the Caravan no longer shows (dropped, or the Caravan changed)
    for (const [k, rid] of Object.entries(S.online.mine)) {
      if (rid === 'asking') { if (!asking.has(k)) delete S.online.mine[k]; continue; }
      if (!M.helps.some((h) => h.rid === rid) && !(KH.findJob(k) && KH.findJob(k).end > S.time)) delete S.online.mine[k];
    }
  }
  const helpable = () => M.helps.filter((h) => h.by !== me() && !S.online.helped[h.rid] && !(me() in h.hs) && Object.keys(h.hs).length < h.need && h.end > now());
  const helpsLeftToday = () => (S.online.helpDay.day === today() ? Math.max(0, O.help.daily - S.online.helpDay.n) : O.help.daily);
  ACT.mphelp = async (rid) => {
    const list = rid ? helpable().filter((h) => h.rid === rid) : helpable();
    if (!list.length) return;
    let n = 0;
    for (const h of list) { S.online.helped[h.rid] = now(); if (await net.giveHelp(h.rid)) n++; }
    if (!n) return;
    if (S.online.helpDay.day !== today()) S.online.helpDay = { day: today(), n: 0 };
    const paid = Math.min(n, helpsLeftToday());
    S.online.helpDay.n += paid;
    S.stats.onlineHelps += n;
    if (paid) S.caravan.points += O.help.points * paid;
    KH.toast(`You helped ${n} Caravan member${n > 1 ? 's' : ''}.${paid ? ` +${O.help.points * paid} Caravan points.` : ''}`, 'good');
    // forget helps older than two days
    for (const k of Object.keys(S.online.helped)) if (now() - S.online.helped[k] > 2 * 864e5) delete S.online.helped[k];
    KH.save(); refresh();
  };

  // ======================================================================
  // The Glass Serpent: the Caravan's boss, one a day, shared health
  // ======================================================================
  const B = O.boss;
  function bossFoe() {
    const n = S.stage, e = KH.foeStats(KH.stageLevel(n), 1), cls = ['guard', 'bow', 'lancer'][today() % 3];
    return { n, name: B.name, cls, boss: true, chapter: 'The Dunes', act: KH.enemyFor(n).act, atk: e.atk * B.atk, def: e.def, hp: e.hp * B.hp, base: e.hp, traits: [] };
  }
  const damageOf = (f, result) => Math.round(f.hp - (result.rounds.length ? result.rounds[result.rounds.length - 1].eh : f.hp));
  // a hit is scored against this squad's own auto-battle damage, so it counts the same at any strength
  function par(f, team) {
    let t = 0;
    for (let k = 0; k < 3; k++) t += damageOf(f, KH.simulateBattle(team, f, { breathHp: f.base, art: KH.artOf() }));
    return Math.max(1, t / 3);
  }
  function loadBoss(force) {
    const aid = S.online.aid;
    if (!aid || (!force && fresh(M.bossAt, 20000))) return;
    M.bossAt = now();
    net.boss(aid, today()).then((b) => { if (S.online.aid === aid) { M.boss = b; refresh(); } });
  }
  const bossToday = () => (S.online.boss.day === today() ? S.online.boss : { day: today(), hits: 0, total: 0, claimed: 0 });
  const bossDown = () => !!M.boss && Object.values(M.boss.dmg).reduce((a, b) => a + b, 0) >= M.boss.hp;
  ACT.mpboss = async () => {
    if (!on() || !S.online.aid) return;
    const b = bossToday();
    if (b.hits >= B.hits) return KH.toast(`No attacks left today. The ${B.name} returns tomorrow.`, 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    if (bossDown()) return KH.toast(`The ${B.name} is already down today.`, 'warn');
    const f = bossFoe(), team = KH.teamStats(f.cls), p = par(f, team), aid = S.online.aid, day = today();
    S.online.boss = { ...b, hits: b.hits + 1 };
    KH.fightLive({
      title: `${B.name} · attack ${S.online.boss.hits} of ${B.hits}`, foe: f, team, opts: { breathHp: f.base, art: KH.artOf() },
      intro: 'Glass scales grind in the sand. The Serpent rises over the dune…',
      onEnd: (result) => {
        const pts = clamp(Math.round((100 * damageOf(f, result)) / p), 0, B.cap);
        const ob = S.online.boss;
        if (ob.day !== day) return { noTips: true, resultTitle: 'It slipped away' };
        ob.total += pts;
        S.stats.bossHits++;
        // the day's health: set by the first member to strike it, from the Caravan's size then
        const hp = Math.max(B.minMembers, M.members.length || 1) * B.perMember;
        net.hitBoss(aid, day, hp, ob.total).then(() => loadBoss(true));
        if (M.boss) M.boss.dmg[me()] = ob.total; else M.boss = { hp, dmg: { [me()]: ob.total } };
        KH.emit('battle', { kind: 'caravanboss', win: false, foe: f });
        KH.save();
        const line = result.timeout ? `The ${B.name} sinks back under the sand.` : `The squad falls back from the ${B.name}.`;
        return { noTips: true, resultTitle: `${pts} points`, loseLine: line, timeoutLine: line, extra: `Your total today: ${ob.total} · ${B.hits - ob.hits} attack${B.hits - ob.hits === 1 ? '' : 's'} left` };
      },
    });
  };
  ACT.mpbossclaim = () => {
    const b = bossToday();
    if (!bossDown() || !b.total || b.claimed) return;
    const total = Object.values(M.boss.dmg).reduce((a, x) => a + x, 0), share = b.total / Math.max(1, total);
    const k = clamp(0.6 + share * 2, 0.6, 1.6), g = {};
    for (const [a, n] of Object.entries(KH.scaleReward(B.chest))) g[a] = Math.max(1, Math.round(n * k));
    S.online.boss = { ...b, claimed: 1 };
    KH.grant(g);
    KH.toast(`The ${B.name}'s hoard: your share of the Caravan's kill.`, 'good');
    KH.sfx('claim');
    KH.save(); refresh();
  };

  // ======================================================================
  // The Arena: attack real players' keeps
  // ======================================================================
  const A = O.arena;
  const attacksLeft = () => (S.online.attacks.day === today() ? Math.max(0, A.attacks - S.online.attacks.n) : A.attacks);
  function loadOpponents(force) {
    if (!force && fresh(M.oppAt, 30000)) return;
    M.oppAt = now();
    net.opponents(Math.max(1, KH.power()), 8).then((list) => { M.opp = list.filter((p) => !S.online.blocked[p.id]); wantNames(list.map((p) => p.id)); refresh(); });
  }
  // a real keep fights as an expedition foe of its own stage, behind walls (the rival keeps' rule, rivals.js)
  const arenaFoe = (p) => ({ n: p.stage, name: keepOf(p), cls: p.cls, boss: false, traits: [], ...KH.foeStats(KH.stageLevel(Math.max(3, p.stage - 1)), A.wall) });
  ACT.mpattack = async (arg) => {
    const [id, r] = String(arg).split('|'), revenge = r === 'r';
    if (!on()) return;
    if (attacksLeft() < 1) return KH.toast('No Arena attacks left today.', 'warn');
    if (!KH.squadHome().length) return KH.toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const p = M.opp.find((x) => x.id === id) || (await net.player(id));
    if (!p) return KH.toast('That keep is out of reach right now.', 'warn');
    const ratio = p.power / Math.max(1, KH.power());
    if (!revenge && (ratio < 1 - A.range || ratio > 1 + A.range)) return KH.toast('That keep is no longer a fair match. Refresh the list.', 'warn');
    if (S.online.attacks.day !== today()) S.online.attacks = { day: today(), n: 0 };
    S.online.attacks.n++;
    const foe = arenaFoe(p), team = KH.teamStats(foe.cls), lp0 = S.online.lp;
    KH.fightLive({
      title: `Arena · ${keepOf(p)}`, foe, team, opts: { art: KH.artOf() },
      intro: `${nameOf(p.id, p)}'s keep. Its walls are manned.`,
      onEnd: (result) => {
        let d = 0, g = null;
        if (result.win) {
          d = clamp(Math.round(A.points.base + (p.lp - lp0) / A.points.per), A.points.min, A.points.max);
          S.online.lp += d;
          S.stats.arenaWins++;
          if (S.online.wins.day !== today()) S.online.wins = { day: today(), n: 0 };
          if (S.online.wins.n < A.paidWins) { S.online.wins.n++; g = KH.scaleReward(A.win); KH.grant(g); }
        } else S.online.lp = Math.max(0, S.online.lp - A.loss);
        // the server (HTTP) keeps the Arena points itself and answers with this keep's own
        net.postBattle({ def: p.id, win: !!result.win, d, ap: Math.round(KH.power()), dp: p.power }).then((r) => { if (r && typeof r === 'object' && Number.isFinite(r.lp)) { S.online.lp = Math.max(0, Math.round(r.lp)); refresh(); } });
        if (revenge) S.online.log = S.online.log.map((l) => (l.att === p.id ? { ...l, revenged: true } : l));
        syncProfile(true);
        KH.emit('battle', { kind: 'arena', win: result.win, foe });
        KH.save();
        return { rewards: g, resultTitle: result.win ? `+${d} Arena points` : 'Repelled', noTips: true,
          extra: result.win ? `You took ${d} points from ${esc(nameOf(p.id, p))}.${g ? '' : ' (Today\'s paid wins are used up.)'}` : `−${A.loss} Arena points · ${attacksLeft()} attack${attacksLeft() === 1 ? '' : 's'} left today` };
      },
    });
  };
  // attacks on this keep since it last looked: the points they took, and a chance at revenge
  let btAt = 0;
  async function checkBattles() {
    if (!on() || now() - btAt < 60000) return;
    btAt = now();
    // read from ten minutes back, so an attacker whose clock runs a little slow is still seen; each record is
    // applied once, by its id (a save from before ids were kept counts what it had already read as seen)
    const legacy = !S.online.seenIds;
    const seenIds = S.online.seenIds || (S.online.seenIds = []);
    const raw = await net.battlesAgainst(Math.max(0, S.online.seenBt - 10 * 60000));
    if (legacy) for (const r of raw) if (r.bid && r.at <= S.online.seenBt && !seenIds.includes(r.bid)) seenIds.push(r.bid);
    const list = raw.slice().sort((a, b) => a.at - b.at).filter((r) => r.bid && !seenIds.includes(r.bid));
    // a full page means more to read: soon, and past what this page held
    if (raw.length >= 50) { btAt = 0; S.online.seenBt = Math.max(S.online.seenBt, ...raw.map((r) => r.at)); }
    if (!list.length) return;
    let lost = 0;
    for (const r of list) {
      seenIds.push(r.bid);
      S.online.seenBt = Math.max(S.online.seenBt, r.at);
      if (r.win) { S.online.lp = Math.max(0, S.online.lp - r.d); lost += r.d; }
      S.online.log.unshift({ att: r.att, at: r.at, win: r.win, d: r.d });
    }
    S.online.seenIds = seenIds.slice(-200);
    S.online.log = S.online.log.slice(0, 12);
    wantNames(list.map((r) => r.att));
    const wins = list.filter((r) => r.win).length;
    if (wins) KH.toast(`${wins === 1 ? 'A warden' : `${wins} wardens`} broke through your walls in the Arena: −${lost} points. Revenge waits in the Caravan tab.`, 'warn', 'mpbt', 30);
    else KH.toast('Your walls held against an Arena attack.', 'good', 'mpbt', 30);
    if (Math.random() < 0.2) net.dropBattles(now() - 3 * 864e5);
    if (net.kind() === 'http') net.player(me()).then((pr) => { if (pr && Number.isFinite(pr.lp)) { S.online.lp = pr.lp; refresh(); } });
    syncProfile(true);
    KH.save(); refresh();
  }

  // ======================================================================
  // The loop: keep the profile fresh, watch the Caravan, read the Arena
  // ======================================================================
  let last = 0;
  KH.hooks.tick.push(() => {
    if (!S || !on() || now() - last < 5000) return;
    last = now();
    syncProfile();
    watchAlliance();
    checkBattles();
    if (UI.tab === 'caravan' && UI.sub.caravan !== 'sim') {
      const t = UI.mpTab || 'caravan';
      if (t === 'caravan') { if (S.online.aid) { loadMembers(); loadBoss(); } else loadAlliances(); }
      if (t === 'arena') loadOpponents();
      // the board feeds the header on every tab ("wardens · online"), so it stays fresh on all of them
      loadTop();
      watchWorld(t === 'square');
      if (t === 'square' && M.chat.world.length) S.online.chatSeen.world = M.chat.world[M.chat.world.length - 1].at;
      if (t === 'caravan' && M.chat.al.length) S.online.chatSeen.al = M.chat.al[M.chat.al.length - 1].at;
    } else watchWorld(false);
  });
  KH.on('netReady', (e) => {
    if (!S) return;
    // a refused write (a viewer who can't write) or a withdrawn grant: back to the single-player Caravan
    if (!e.online) { watchWorld(false); unwatchAlliance(); refresh(); return; }
    if (UI.sub.caravan == null) UI.sub.caravan = 'online';
    // the board is read once this keep's own profile is there, so a first visit doesn't show it missing
    syncProfile(true).then(() => loadTop(true));
    watchAlliance();
    refresh();
  });
  window.addEventListener('pagehide', () => { if (on() && S) net.putProfile(profile()); });

  // the Caravan tab's dot: help wanted, unread Caravan chat, a boss attack or a hoard waiting
  const simDot = KH.caravanDot;
  KH.caravanDot = () => (simDot ? simDot() : false) || (on() && !!S.online.aid && (helpable().length > 0 || unread('al') || (bossToday().hits < B.hits && !bossDown()) || (bossDown() && bossToday().total > 0 && !bossToday().claimed)));

  // ======================================================================
  // The panel: the Caravan tab's Online side
  // ======================================================================
  ACT.mpmode = (m) => { UI.sub.caravan = m === 'sim' ? 'sim' : 'online'; };
  ACT.mptab = (t) => { UI.mpTab = t; last = 0; };
  ACT.mprefresh = () => { M.topAt = M.oppAt = M.alsAt = M.membersAt = M.bossAt = 0; last = 0; btAt = 0; };
  const seg = (cur, list, act) => `<div class="seg mp-seg">${list.map(([v, label, dot]) => `<button class="${cur === v ? 'on' : ''}" data-act="${act}" data-arg="${v}">${label}${dot ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>`;
  const pRow = (p, rank, extra = '') => `<div class="row mp-row ${p.id === me() ? 'you' : ''}">${rank != null ? `<span class="mp-rank">${rank}</span>` : ''}<i class="mp-on ${onlineNow(p) ? 'on' : ''}"></i>
    <div class="grow"><b>${esc(nameOf(p.id, p))}</b><div class="muted small">${esc(keepOf(p))} · Wyrm ${p.wyrm} · stage ${p.stage}${p.aid && M.als.find((a) => a.aid === p.aid) ? ` · [${esc(M.als.find((a) => a.aid === p.aid).tag)}]` : ''}</div></div>${extra}</div>`;
  // each message from someone else carries a small button for Report and Block
  const msgs = (list, n, ch) => {
    const shown = list.filter((m) => !S.online.blocked[m.by]).slice(-n);
    return shown.length ? shown.map((m) => `<div class="msg ${m.by === me() ? 'you' : ''}"><b>${esc(nameOf(m.by))}</b> ${esc(m.text)}${m.by !== me() ? `<button class="mp-more" data-act="mpmsg" data-arg="${ch}|${esc(m.mid)}" aria-label="Report or block">⋯</button>` : ''}</div>`).join('') : '<p class="muted small">No messages yet. Say hello.</p>';
  };
  ACT.mpmsg = (arg) => { const [ch, mid] = String(arg).split('|'); UI.sheet = { kind: 'mpmsg', ch, mid }; };
  ACT.mpblock = (id) => { S.online.blocked[id] = Date.now(); UI.sheet = null; KH.toast(`You won't see ${nameOf(id)}'s messages any more. Unblock them in Settings.`, ''); KH.save(); };
  ACT.mpunblock = (id) => { delete S.online.blocked[id]; KH.save(); };
  ACT.mpreport = async () => {
    const sh = UI.sheet, list = sh && M.chat[sh.ch === 'world' ? 'world' : 'al'], m = list && list.find((x) => x.mid === sh.mid);
    UI.sheet = null;
    if (!m) return;
    // the report goes to the game's keepers with this player's playtest report (playtest.js), which only they read
    // (the server keeps reports of its own as well: net.report)
    const r = { ch: sh.ch === 'world' ? 'world' : `al-${S.online.aid}`, mid: m.mid, by: m.by, text: m.text, at: m.at };
    const sent = await net.report(r);
    const ok = (KH.playtest ? KH.playtest.addReport(r) : false) || sent;
    KH.toast(ok ? 'Reported. The game\'s keepers will look at it.' : 'The report could not be sent just now.', ok ? 'good' : 'warn');
  };
  KH.sheets.mpmsg = () => {
    const sh = UI.sheet, list = M.chat[sh.ch === 'world' ? 'world' : 'al'], m = list.find((x) => x.mid === sh.mid);
    if (!m) { UI.sheet = null; return { title: '', body: '' }; }
    return { title: nameOf(m.by), lvl: '', body: `<div class="card"><p class="small">"${esc(m.text)}"</p></div>
      <p class="muted small">Report a message that's abusive, hateful or spam: the game's keepers can remove it. Blocking hides everything this player writes, on this device.</p>
      <div class="confirm-actions"><button class="btn alt" data-act="mpblock" data-arg="${esc(m.by)}">Block</button><button class="btn" data-act="mpreport">Report</button></div>` };
  };
  const say = (ch, ph) => `<div class="row mp-say"><input id="chat-${ch}" maxlength="200" placeholder="${esc(ph)}" data-enter="mpchat" data-arg="${ch}" autocomplete="off" enterkeyhint="send"><button class="btn small" data-act="mpchat" data-arg="${ch}">Send</button></div>`;

  function caravanView() {
    const a = M.al;
    if (!S.online.aid) {
      const list = M.als.map((x) => {
        const n = countOf(x.aid), full = n >= O.caravanMax;
        return `<div class="card row mp-al"><span class="mp-crest" style="background:${x.color}">${esc(x.tag)}</span><div class="grow"><b>${esc(x.name)}</b> <span class="muted small">[${esc(x.tag)}]</span><div class="muted small">${x.motto ? `"${esc(x.motto)}" · ` : ''}${n} member${n === 1 ? '' : 's'}${x.open ? '' : ' · closed'}</div></div>
          <button class="btn small ${!x.open || full ? 'off' : ''}" data-act="mpjoin" data-arg="${esc(x.aid)}">Join</button></div>`;
      }).join('');
      return `<div class="card stack"><p class="small">A real Caravan is other people playing this same game: chat with them, speed up each other's builds, and bring down the ${esc(B.name)} together each day.</p></div>
        <div class="section-label">Caravans</div>${list || '<p class="muted small">No Caravans yet. Found the first one.</p>'}
        <div class="section-label">Found a Caravan</div>
        <div class="card stack"><label class="field"><span class="muted small">Name</span><input id="al-name" maxlength="24" placeholder="The Last Well" autocomplete="off"></label>
        <label class="field"><span class="muted small">Tag (2 to 4 letters)</span><input id="al-tag" maxlength="4" placeholder="WEL" autocomplete="off" style="text-transform:uppercase"></label>
        <button class="btn wide ${S.lv.wyrm < O.found ? 'off' : ''}" data-act="mpcreate">${S.lv.wyrm < O.found ? `Found a Caravan at Rainwyrm Lv ${O.found}` : 'Found the Caravan'}</button></div>`;
    }
    if (UI.mpLeave) return `<div class="card stack"><p>Leave ${esc(a ? a.name : 'this Caravan')}? Your help requests and today's boss attacks stay behind.</p><div class="confirm-actions"><button class="btn alt" data-act="mpleaveno">Stay</button><button class="btn" data-act="mpleaveyes">Leave</button></div></div>`;
    const lead = a && a.leader === me(), power = M.members.reduce((s2, p) => s2 + p.power, 0);
    const b = bossToday(), boss = M.boss, total = boss ? Object.values(boss.dmg).reduce((x, y) => x + y, 0) : 0, hp = boss ? boss.hp : Math.max(B.minMembers, M.members.length || 1) * B.perMember;
    const left = Math.max(0, hp - total), down = bossDown();
    const top = boss ? Object.entries(boss.dmg).sort((x, y) => y[1] - x[1]).slice(0, 5) : [];
    wantNames(top.map((x) => x[0]));
    const bossCard = `<div class="card raid-card stack"><div class="row"><div class="grow"><span class="section-label" style="margin:0">Caravan boss · today</span><h3>${esc(B.name)}</h3></div><span class="chip">${icon('i-sword')}${B.hits - b.hits} left</span></div>
      <div class="bar foe"><i style="width:${(left / hp) * 100}%"></i></div><div class="muted small">${down ? 'Brought down today.' : `${fmt(left)} of ${fmt(hp)} health left`} · your points ${b.total}</div>
      ${top.length ? `<div class="mp-dmg">${top.map(([id, d]) => `<span class="${id === me() ? 'you' : ''}">${esc(nameOf(id))} <b>${d}</b></span>`).join('')}</div>` : ''}
      ${down ? `<button class="btn wide ${b.total && !b.claimed ? 'gold' : 'off'}" data-act="mpbossclaim">${b.claimed ? 'Hoard claimed' : b.total ? 'Claim your share of the hoard' : 'You didn\'t strike it today'}</button>`
        : `<button class="btn wide ${b.hits < B.hits ? '' : 'off'}" data-act="mpboss" data-primary>${b.hits < B.hits ? 'Attack' : 'No attacks left today'}</button>`}</div>`;
    const theirs = helpable();
    const mine = M.helps.filter((h) => h.by === me());
    const running = ['research'].concat(S.builds.map((x) => x.plot)).filter((k) => { const j = KH.findJob(k); return j && j.end > S.time && !S.online.mine[k]; });
    const helpCard = `<div class="card stack"><div class="row"><div class="grow"><b>${theirs.length} help request${theirs.length === 1 ? '' : 's'}</b><div class="muted small">Each help cuts a member's timer. You earn ${O.help.points} Caravan points each, ${helpsLeftToday()} more today.</div></div>
      <button class="btn small ${theirs.length ? 'gold' : 'off'}" data-act="mphelp">Help all</button></div>
      ${theirs.slice(0, 5).map((h) => `<div class="row mp-help"><div class="grow small"><b>${esc(nameOf(h.by))}</b> · ${esc(h.label)}</div><span class="muted small">${Object.keys(h.hs).length}/${h.need}</span></div>`).join('')}
      ${mine.map((h) => `<div class="row mp-help you"><div class="grow small">Yours · ${esc(h.label)}</div><span class="muted small">${Object.keys(h.hs).length}/${h.need} helped</span></div>`).join('')}
      ${running.map((k) => `<div class="row mp-help"><div class="grow small">${esc(jobLabel(k))}</div><button class="btn small alt" data-act="mpask" data-arg="${k}">Ask for help</button></div>`).join('')}</div>`;
    const members = M.members.slice().sort((x, y) => y.power - x.power).map((p) => pRow(p, null, `${a && a.leader === p.id ? '<span class="chip small r-epic">Leader</span>' : ''}<span class="muted small">${fmt(p.power)}</span>`)).join('');
    return `<div class="card row mp-alhead"><span class="mp-crest" style="background:${a ? a.color : '#3fd0c0'}">${esc(a ? a.tag : '')}</span><div class="grow"><h3>${esc(a ? a.name : 'Your Caravan')}</h3><div class="muted small">${a && a.motto ? `"${esc(a.motto)}"` : ''}</div></div></div>
      <div class="row wrap"><span class="chip">${icon('i-people')}${M.members.length}/${O.caravanMax}</span><span class="chip">${icon('i-power')}${fmt(power)}</span>${lead ? `<span class="chip">${a && a.open ? 'Open to all' : 'Closed'}</span>` : ''}</div>
      <div class="section-label">Boss</div>${bossCard}
      <div class="section-label">Help</div>${helpCard}
      <div class="section-label">Caravan chat</div><div class="card chat mp-chat">${msgs(M.chat.al, 30, 'al')}</div>${say('al', 'Say something to your Caravan')}
      <div class="section-label">Members</div><div class="card stack">${members || '<p class="muted small">Loading…</p>'}</div>
      ${lead ? `<div class="section-label">Leader</div><div class="card stack"><label class="field"><span class="muted small">Motto</span><input id="al-motto" maxlength="80" value="${esc(a ? a.motto : '')}" autocomplete="off"></label><div class="row"><button class="btn small alt" data-act="mpmotto">Save motto</button><button class="btn small alt" data-act="mpopen">${a && a.open ? 'Close to new members' : 'Open to new members'}</button></div></div>` : ''}
      <button class="btn alt wide" data-act="mpleave">Leave the Caravan</button>`;
  }
  function arenaView() {
    const rank = M.lp.findIndex((p) => p.id === me()) + 1;
    const opp = M.opp.map((p) => pRow(p, null, `<div class="mp-opp"><span class="muted small">${fmt(p.power)} · ${p.lp} pts</span><button class="btn small ${attacksLeft() ? '' : 'off'}" data-act="mpattack" data-arg="${esc(p.id)}">Attack</button></div>`)).join('');
    const log = S.online.log.slice(0, 6).map((l) => `<div class="row mp-log ${l.win ? 'lost' : 'held'}">${icon(l.win ? 'i-sword' : 'i-shieldwall')}<div class="grow small"><b>${esc(nameOf(l.att))}</b> ${l.win ? `broke through: −${l.d} points` : 'was repelled by your walls'}</div>${l.win && !l.revenged ? `<button class="btn small gold ${attacksLeft() ? '' : 'off'}" data-act="mpattack" data-arg="${esc(l.att)}|r">Revenge</button>` : ''}</div>`).join('');
    wantNames(S.online.log.map((l) => l.att));
    return `<div class="card row mp-me"><div class="grow"><b>${S.online.lp} Arena points</b><div class="muted small">${rank ? `Rank ${rank} of ${M.lp.length}` : 'Unranked'} · ${attacksLeft()} of ${A.attacks} attacks left today</div></div>${icon('i-duel', 'mp-big')}</div>
      <p class="muted small">Attack keeps near your power. Each fights as an expedition foe of its own stage, behind its walls. A win takes Arena points from it${A.paidWins ? ` and pays Starglass and journals, ${A.paidWins} times a day` : ''}.</p>
      <div class="section-label">Opponents</div><div class="card stack">${opp || '<p class="muted small">No keeps near your power yet. As more wardens play, they appear here.</p>'}</div>
      ${log ? `<div class="section-label">Attacks on your keep</div><div class="card stack">${log}</div>` : ''}
      <button class="btn alt wide" data-act="mprefresh">Refresh</button>`;
  }
  function boardView() {
    const rows = M.top.slice(0, 50).map((p, i) => pRow(p, i + 1, `<span class="muted small">${fmt(p.power)}</span>`)).join('');
    const mine = M.top.findIndex((p) => p.id === me());
    return `<p class="muted small">Every warden playing this link, by power. A green mark: playing now.</p><div class="card stack">${rows || '<p class="muted small">Loading…</p>'}</div>
      ${mine < 0 ? '<p class="muted small">Your keep appears here within a minute.</p>' : ''}<button class="btn alt wide" data-act="mprefresh">Refresh</button>`;
  }
  function squareView() {
    return `<p class="muted small">The Square: everyone playing this link reads it. Be kind.</p><div class="card chat mp-chat">${msgs(M.chat.world, 40, 'world')}</div>${say('world', 'Say something to every warden')}`;
  }
  const simPanel = KH.panels.caravan;
  KH.panels.caravan = () => {
    if (!on()) return simPanel();
    const mode = UI.sub.caravan === 'sim' ? 'sim' : 'online';
    const head = seg(mode, [['online', 'Online'], ['sim', 'Your Caravan']], 'mpmode');
    if (mode === 'sim') return head + simPanel();
    const t = UI.mpTab || 'caravan';
    const body = t === 'arena' ? arenaView() : t === 'board' ? boardView() : t === 'square' ? squareView() : caravanView();
    const al = !!S.online.aid && (helpable().length > 0 || unread('al'));
    // alone on the link: how friends get here (the share menu is the platform's, the game can't open it)
    // (people outside the owner's organization can only write shared data as Editors invited by email: db.d.ts)
    const alone = M.topLoaded && M.top.filter((p) => p.id !== me()).length === 0
      ? `<div class="card stack mp-alone"><b>Only you so far</b><p class="small">${net.isAdmin() ? 'Share this game from the <b>Share</b> menu at the top of the page. People in your organization: <b>Contributor</b> access. Anyone else: invite them by email as <b>Editor</b>, with link sharing off (outside an organization only Editors can play online; Editors could also change the page, so invite people you trust). They appear here as soon as they open it.' : 'Friends join when the game\'s owner shares it with them. They appear here as soon as they open it.'}</p></div>` : '';
    return `${head}<div class="panel-head"><h2>Wardens online</h2><p>${M.top.length ? `${M.top.length} warden${M.top.length === 1 ? '' : 's'} · ${M.top.filter(onlineNow).length} online` : 'Real players'}</p></div>
      ${alone}${seg(t, [['caravan', 'Caravan', al], ['arena', 'Arena', S.online.log.some((l) => l.win && !l.revenged)], ['board', 'Wardens'], ['square', 'Square', unread('world')]], 'mptab')}${body}`;
  };
  KH.mp.helpable = helpable;
})();
