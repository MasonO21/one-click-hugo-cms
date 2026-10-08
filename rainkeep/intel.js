/*
 * Rainkeep: Watchtower Intel, reports from the watchtower's scouts. From Rainwyrm Lv 4 (with the Barracks
 * built) a new report arrives every 75 minutes of keep time, each one a job on open sand within sight and
 * rated one to five stars: survivors to rescue from raiders, a man-eater to hunt and a Scorpion lieutenant's
 * bounty (fights for the squad), a lost caravan and a relic in the sand (a few scouts are enough), and a
 * hero's errand (one hero goes alone, a benched one if you have one, and comes home with that hero's
 * shards). More stars, a stronger foe and a bigger reward; a higher Watchtower brings better reports and
 * holds more of them. Every report has a short story and an ending.
 * Plugs into world.js (tile layout, marches, the tile sheet, the 2D map) through KH.intel, world3d.js (the
 * marker on the sand) and core through KH.hooks, KH.sheets and KH.on.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { fmt, fmtTime, icon, esc, clamp } = KH.u;
  const { UI, ACT } = KH;
  const I = DATA.intel, KINDS = I.kinds;
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; });
  KH.hooks.defaults.push((s) => {
    s.intel = { open: false, acc: 0, seq: 0, list: [], last: null };
    s.stats.intel = 0; s.stats.intel5 = 0;
  });

  const unlocked = () => !!S && S.lv.wyrm >= I.unlock && S.lv.barracks > 0;
  const cap = () => I.cap + I.capAt.filter((lv) => S.lv.watchtower >= lv).length;
  const list = () => (S && S.intel ? S.intel.list : []);
  const byKey = (k) => list().findIndex((r) => r.k === k);
  const at = (k) => { const i = byKey(k); return i >= 0 ? list()[i] : null; };
  const tale = (r) => I.tales[r.kind][r.v % I.tales[r.kind].length];
  const heroName = (id) => (id && DATA.heroes.find((h) => h.id === id) ? DATA.heroes.find((h) => h.id === id).name : 'A hero');
  const fill = (s, r) => s.replace(/\{hero\}/g, heroName(r.hero));
  const title = (r) => fill(tale(r)[0], r);
  const fades = (r) => Math.max(0, r.t + I.life - S.time);
  const starsHTML = (n) => `<span class="iv-stars" aria-label="${n} stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;

  // ======================================================================
  // New reports
  // ======================================================================
  function rollStars() {
    const wt = S.lv.watchtower || 0, w = I.stars.map((b, i) => b * (1 + I.starTower * wt * i));
    let v = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { v -= w[i]; if (v < 0) return i + 1; }
    return 1;
  }
  function rollKind(hero) {
    const kinds = Object.keys(KINDS).filter((k) => !KINDS[k].hero || hero);
    let v = Math.random() * kinds.reduce((a, k) => a + KINDS[k].w, 0);
    for (const k of kinds) { v -= KINDS[k].w; if (v < 0) return k; }
    return kinds[0];
  }
  // an errand goes to a hero who isn't in the squad if there is one (benched heroes get something to do)
  function errandHero() {
    const own = Object.keys(S.heroes), bench = own.filter((id) => !S.squad.includes(id));
    const pool = bench.length ? bench : own;
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }
  function spot() {
    const W = KH.world, out = [], [lo, hi] = I.ring, taken = new Set(list().map((r) => r.k));
    for (let y = 0; y < W.N; y++) for (let x = 0; x < W.N; x++) {
      const d = W.dist(x, y), k = W.key(x, y);
      if (d < lo || d > hi || taken.has(k) || !W.visible(x, y) || !W.openSand(x, y)) continue;
      if (KH.rivals && KH.rivals.byKey(k) >= 0) continue;
      if (S.map.marches.some((m) => m.x === x && m.y === y)) continue;
      out.push([x, y]);
    }
    return out.length ? out[Math.floor(Math.random() * out.length)] : null;
  }
  function add() {
    const p = spot();
    if (!p) return null;
    const hero = errandHero(), kind = rollKind(hero);
    const r = { id: ++S.intel.seq, kind, x: p[0], y: p[1], k: KH.world.key(p[0], p[1]), stars: rollStars(), v: Math.floor(Math.random() * 3), hero: KINDS[kind].hero ? hero : null, t: S.time };
    S.intel.list.push(r);
    KH.emit('intelNew', { kind });
    return r;
  }
  const remove = (r) => { S.intel.list = S.intel.list.filter((x) => x !== r); };

  KH.hooks.tick.push((dt) => {
    if (!unlocked() || !dt) return;
    const X = S.intel;
    if (!X.open) {
      X.open = true; X.acc = 0;
      for (let i = 0; i < I.cap; i++) add();
      KH.mail('Reports from the watchtower', 'The scouts in the watchtower have started keeping a ledger of what they see out on the Dunes: people in trouble, beasts on the roads, things glinting in the sand. Each report is marked on the map with stars for how hard (and how rewarding) it looks. A new one comes in every hour or so.');
      KH.emit('intelOpen', {});
      return;
    }
    // old reports fade (never one a march is on its way to)
    const stale = X.list.filter((r) => S.time - r.t > I.life && !KH.world.tile(r.x, r.y).busy);
    if (stale.length) X.list = X.list.filter((r) => !stale.includes(r));
    if (X.list.length >= cap()) { X.acc = 0; return; }
    X.acc += dt;
    while (X.acc >= I.every && X.list.length < cap()) { X.acc -= I.every; if (!add()) { X.acc = 0; break; } }
    if (X.list.length >= cap()) X.acc = 0;
  });

  // ======================================================================
  // Foes and rewards
  // ======================================================================
  const FOES = { rescue: ['Raider band', ['guard', 'bow', 'lancer']], hunt: [null, ['lancer', 'guard']], bounty: [null, ['guard', 'bow', 'lancer']] };
  function foeOf(r) {
    const K = KINDS[r.kind];
    if (!K.fight) return null;
    const n = Math.max(2, S.stage + I.foe.offset + I.foe.perStar * r.stars), lvl = KH.stageLevel ? KH.stageLevel(n) : n;
    const cls = FOES[r.kind][1][(r.id + r.v) % FOES[r.kind][1].length];
    const name = r.kind === 'rescue' ? FOES.rescue[0] : r.kind === 'hunt' ? tale(r)[0] : tale(r)[0];
    return { n: Math.round(n), name, cls, boss: r.kind === 'bounty' || r.stars >= 5, chapter: 'Watchtower Intel', ...KH.foeStats(lvl, r.kind === 'bounty' ? I.foe.bounty : 1) };
  }
  function rewardsOf(r) {
    const K = KINDS[r.kind], m = I.starMult(r.stars), g = {};
    for (const [k, v] of Object.entries(K.give || {})) g[k] = v * m;
    if (K.journals) g.journals = K.journals * m;
    const out = KH.scaleReward(g);
    if (K.starglass) out.starglass = K.starglass * r.stars;
    if (K.treats && KH.pals && KH.pals.open()) out.treats = K.treats * r.stars;
    if (r.kind === 'hunt' && r.stars >= 4) out.speed15 = 1;
    if (r.kind === 'relic' && r.stars >= 4) out.rainCharm = 1;
    if (r.kind === 'caravan' && r.stars >= 3 && KH.road && KH.road.open()) out.dice = r.stars - 2;
    if (r.kind === 'bounty' && r.stars >= 5) out.beacons = 1;
    if (K.whet) out.whetstone = K.whet * r.stars;
    for (const k of Object.keys(out)) if (!out[k]) delete out[k];
    return out;
  }
  const shardsOf = (r) => (KINDS[r.kind].shards ? KINDS[r.kind].shards + r.stars : 0);
  const survivorsOf = (r) => (KINDS[r.kind].survivors ? KINDS[r.kind].survivors + r.stars : 0);

  // world.js calls this when a march reaches a report
  function resolve(m) {
    const r = at(KH.world.key(m.x, m.y));
    if (!r) return null;
    const K = KINDS[r.kind], foe = foeOf(r);
    let result = null, team = null, win = true;
    if (foe) {
      team = KH.teamStats(foe.cls, { troops: m.troops, heroes: m.heroes });
      result = KH.simulateBattle(team, foe);
      win = result.win;
    }
    let rewards = null, notes = '';
    if (win) {
      rewards = rewardsOf(r);
      if (r.kind === 'bounty' && r.stars < 5 && Math.random() < K.beacon * r.stars) rewards.beacons = 1;
      KH.grant(rewards);
      const sv = survivorsOf(r);
      if (sv) { const n = KH.addSurvivors(sv); notes = n ? ` ${n} survivor${n > 1 ? 's' : ''} came home with them.` : ' There was no room in the houses, so they went on to the coast.'; }
      const sh = shardsOf(r);
      if (sh && r.hero && S.heroes[r.hero]) { S.heroes[r.hero].shards += sh; notes += ` (+${sh} ${heroName(r.hero)} shards)`; }
      remove(r);
      S.stats.intel++;
      if (r.stars >= 5) S.stats.intel5++;
      if (KH.duty) KH.duty('intel');
      KH.emit('intelDone', { kind: r.kind, stars: r.stars });
    }
    const text = win ? fill(tale(r)[2], r) + notes : 'The march could not break through and falls back. The report stays on the ledger.';
    S.intel.last = { title: title(r), kind: r.kind, stars: r.stars, win, text, rewards: rewards || {} };
    return { report: r, win, result, foe, team, rewards, text, title: title(r), lossFrac: win ? 0 : I.loss };
  }

  // ======================================================================
  // Actions
  // ======================================================================
  ACT.intel = () => { UI.sheet = { kind: 'intel' }; };
  ACT.intelgo = (k) => {
    const r = at(k), W = KH.world, M = W.march;
    if (!r) return;
    const t = W.tile(r.x, r.y), K = KINDS[r.kind];
    if (t.busy) return KH.toast('One of your marches is already on its way there.', 'warn');
    if (K.hero) {
      if (!S.heroes[r.hero]) return KH.toast(`${heroName(r.hero)} is not in your keep.`, 'warn');
      if (KH.heroBusy(r.hero)) return KH.toast(`${heroName(r.hero)} is out on another march.`, 'warn');
    }
    const why = M.canSend(!!K.fight);
    if (why) return KH.toast(why, 'warn');
    const troops = M.pickTroops(K.fight ? UI.wsend : K.hero ? I.escort : I.scouts);
    if (Object.values(troops).reduce((a, b) => a + b, 0) < 1 && !K.hero) return KH.toast('No troops at home to send. Train some at the Barracks.', 'warn');
    M.newMarch('intel', t, troops, K.fight ? KH.squadHome() : K.hero ? [r.hero] : []);
    UI.sheet = null;
    KH.toast(K.hero ? `${heroName(r.hero)} sets out: ${title(r)}.` : K.fight ? `Your squad marches out: ${title(r)}.` : `Scouts head out: ${title(r)}.`, 'good');
  };
  ACT.intelfind = (k) => {
    const r = at(k);
    if (!r) return;
    UI.sheet = null;
    KH.ACT.tab('world');
    if (UI.sub) UI.sub.world = 'map';
    KH.world.focus(r.x, r.y);
    ACT.wsel(k);
  };
  ACT.inteldone = () => { S.intel.last = null; };

  // ======================================================================
  // Sheets: a report's tile, and the ledger of every report
  // ======================================================================
  function sheet(t, ui) {
    const r = at(t.k), K = KINDS[r.kind], tl = tale(r), foe = foeOf(r), rw = rewardsOf(r);
    let fight = '';
    if (foe) {
      const team = KH.teamStats(foe.cls, { troops: ui.troops, heroes: KH.squadHome() });
      const ours = KH.statPower(team), theirs = KH.statPower(foe);
      const odds = ours >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
      const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === foe.cls);
      fight = `<div class="row">${KH.foeArt(foe, 'mini-foe')}<div class="grow"><div class="muted small">${icon(DATA.classes[foe.cls].icon)} ${esc(foe.name)} fight${r.kind === 'rescue' ? '' : 's'} like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.</div>
        <div class="vs"><div class="side"><span class="muted small">Your march</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">${r.kind === 'hunt' ? 'Beast' : 'Raiders'}</span><b>${fmt(theirs)}</b></div></div>
        <b style="color:${odds[1]}">${odds[0]}</b></div></div>
        ${ui.busyMsg}${ui.slotLine}<div class="seg">${ui.fracs}</div>${KH.formationRow ? KH.formationRow(foe, UI.wsend) : ''}`;
    }
    const sendWhy = ui.why || (K.hero && r.hero && KH.heroBusy(r.hero) ? `${heroName(r.hero)} is out on another march.` : null);
    const who = K.hero ? `<div class="row iv-hero">${KH.portrait(r.hero)}<div class="grow"><b>${esc(heroName(r.hero))}</b><div class="muted small">Goes alone with a small escort, and comes home with ${shardsOf(r)} of ${esc(heroName(r.hero))}'s shards.</div></div></div>${ui.busyMsg}${ui.slotLine}` : !foe ? `${ui.busyMsg}${ui.slotLine}<p class="muted small">A few scouts are enough: ${Math.round(I.scouts * 100)}% of the march.</p>` : '';
    const label = K.hero ? `Send ${esc(heroName(r.hero))}` : foe ? 'Send the squad' : 'Send scouts';
    const sv = survivorsOf(r);
    return {
      title: fill(tl[0], r), lvl: `${r.stars}★ ${K.name}`,
      body: `<div class="row iv-head">${icon(K.icon, 'iv-kind')}<div class="grow">${starsHTML(r.stars)}<p class="lore">${esc(fill(tl[1], r))}</p>${t.busy ? '' : `<div class="muted small">The trail goes cold in ${fmtTime(fades(r))}.</div>`}</div></div>
        ${fight}${who}
        <div class="card stack"><b>Reward</b><div class="costs">${KH.rewardHTML(rw)}</div>${sv ? `<div class="muted small">and ${sv} survivors, if the houses have room</div>` : ''}${r.kind === 'bounty' ? `<div class="muted small">A ${Math.round(K.beacon * r.stars * 100)}% chance of a Beacon Token${r.stars >= 5 ? ' (certain at five stars)' : ''}</div>` : ''}</div>
        ${foe ? `<p class="muted small">Your squad leads the march and is away until it returns. A lost fight costs ${Math.round(I.loss * 100)}% of the troops sent, and the report stays.</p>` : ''}
        ${sendWhy ? `<p class="notice heat">${esc(sendWhy)}</p>` : ''}
        <button class="btn wide ${sendWhy || t.busy ? 'off' : ''}" data-act="intelgo" data-arg="${t.k}" data-primary>${icon(foe ? 'i-sword' : K.icon)}${label}</button>
        <button class="btn wide alt" data-act="intel">All reports</button>`,
    };
  }
  KH.sheets.intel = () => {
    const intro = KH.art.banner('event', 'intel', 'The watchtower\'s ledger: people in trouble, beasts on the roads and things glinting in the sand, each marked on the map with stars.');
    if (!unlocked()) return { title: 'Watchtower Intel', lvl: 'Locked', body: `${intro}<div class="card"><p>${icon('i-lock')} The watchtower's scouts start sending reports once your Rainwyrm reaches Lv ${I.unlock} and the Barracks stands.</p></div>` };
    const X = S.intel, L = X.last;
    const last = L ? `<div class="card stack iv-last ${L.win ? '' : 'lost'}"><div class="row">${icon(KINDS[L.kind].icon, 'iv-kind small')}<b class="grow">${esc(L.title)}</b>${starsHTML(L.stars)}</div><p class="small">${esc(L.text)}</p>${Object.keys(L.rewards).length ? `<div class="costs">${KH.rewardHTML(L.rewards)}</div>` : ''}<button class="btn small alt" data-act="inteldone">Done</button></div>` : '';
    const rows = X.list.slice().sort((a, b) => b.stars - a.stars).map((r) => {
      const K = KINDS[r.kind], t = KH.world.tile(r.x, r.y);
      return `<button class="iv-row" data-act="intelfind" data-arg="${r.k}">${icon(K.icon, 'iv-kind small')}<span class="grow"><b>${esc(title(r))}</b><span class="muted small">${esc(K.name)}${K.hero ? ` · ${esc(heroName(r.hero))}` : ''} · ${fmtTime(KH.world.travel(r.x, r.y))} away${t.busy ? ' · <b>march on the way</b>' : ` · fades in ${fmtTime(fades(r))}`}</span></span>${starsHTML(r.stars)}</button>`;
    }).join('');
    const next = X.list.length >= cap() ? `The ledger is full (${cap()} reports). Answer one, or wait for one to fade, to make room.` : `Next report in ${fmtTime(I.every - X.acc)}.`;
    return {
      title: 'Watchtower Intel', lvl: `${X.list.length}/${cap()}`,
      body: `${intro}${last}<div class="stack iv-list">${rows || '<p class="muted">No reports right now.</p>'}</div>
        <p class="muted small">${esc(next)} The Watchtower holds one more report from Lv ${I.capAt[0]} and Lv ${I.capAt[1]}, and every level of it brings better ones.</p>
        <div class="muted small">Reports completed ${S.stats.intel} · five-star ${S.stats.intel5}</div>`,
    };
  };

  // a chip in the world tab's tool row (world.js) opens the ledger
  KH.intelChip = () => (unlocked() ? `<button class="chip${list().some((r) => !KH.world.tile(r.x, r.y).busy) ? ' glow' : ''}" data-act="intel" title="Watchtower Intel">${icon('i-intel')}${list().length}</button>` : '');

  // for world.js, world3d.js, tests and the balance bot
  KH.intel = { unlocked, cap, list, byKey, at, resolve, sheet, foeOf, rewardsOf, title, heroName, add, kinds: KINDS };
})();
