/*
 * Rainkeep Dunes: the world map around the keep. Seeded tiles keep resource
 * nodes, beasts, ruins and raider camps; the dust haze recedes as the wyrm grows.
 * world3d.js draws the map in 3D when WebGL is available; the canvas below is the fallback.
 * Marches gather, fight and explore. Raiders also come for the keep itself.
 */
'use strict';
(function () {
  const KH = window.KH;
  const { $, clamp, fmt, fmtTime, icon, esc, rand, pick, sum, seeded } = KH.u;
  const { UI, ACT } = KH;
  const W = DATA.world;
  const N = W.size, C = Math.floor(N / 2);
  let S = null;
  KH.hooks.boot.push(() => { S = KH.S; layoutCache = {}; });

  KH.hooks.defaults.push((s) => {
    s.map = { seed: Math.floor(Math.random() * 1e9), tiles: {}, marches: [], seq: 0, pendingRuin: null, raid: { next: 0, warned: false, last: null } };
  });
  UI.wsend = 1;
  UI.wsel = null;

  // ======================================================================
  // Tiles
  // ======================================================================
  let layoutCache = {}, cacheAct = null;
  const act2 = () => !!S && S.stage > DATA.actOneStage;
  const key = (x, y) => `${x},${y}`;
  const dist = (x, y) => Math.hypot(x - C, y - C);
  const sight = () => W.sight(S.lv.wyrm) + 0.5;
  const visible = (x, y) => dist(x, y) <= sight();
  // the Act I layout of one tile; r is the tile's own seeded stream
  function layout1(x, y, r, d) {
    let t;
    if (d < 0.5) t = { kind: 'keep' };
    else if (d < 1.6) t = { kind: 'empty', decor: r() < 0.3 ? 'palm' : null };
    else {
      const v = r();
      if (v < 0.17) {
        const w = r();
        let res = w < 0.3 ? 'stone' : w < 0.6 ? 'food' : w < 0.86 ? 'water' : 'copper';
        if (res === 'copper' && d < 3) res = 'water';
        t = { kind: 'node', res, lvl: clamp(Math.round(d / 1.3 + r() * 1.2), 1, 10) };
      } else if (v < 0.25) {
        const b = W.beasts[Math.floor(r() * W.beasts.length)];
        t = { kind: 'beast', name: b[0], cls: b[1], lvl: clamp(Math.round(d * 0.95 + r() * 1.5 - 0.5), 1, 14) };
      } else if (v < 0.285) {
        t = { kind: 'ruin', ruin: DATA.ruins[Math.floor(r() * DATA.ruins.length)].id };
      } else if (v < 0.3 && d >= 4.5) {
        t = { kind: 'camp', lvl: clamp(Math.round(d * 0.7), 2, 10) };
      } else {
        const dv = r();
        t = { kind: 'empty', decor: dv < 0.4 ? 'palm' : dv < 0.55 ? 'rock' : null };
      }
    }
    return t;
  }
  const tileRng = (x, y) => seeded((S.map.seed ^ (x * 7919 + y * 104729)) >>> 0);
  // The main quest asks for a Scorpion camp around Rainwyrm Lv 12. On the few maps with none in
  // sight by then, one patch of bare sand 5 to 6.5 tiles out (sand in Act II too) holds a camp.
  let anchorSeed = null, anchorK = null;
  function anchorCamp() {
    if (anchorSeed === S.map.seed) return anchorK;
    anchorSeed = S.map.seed; anchorK = null;
    const reach = W.sight(10) + 0.5, X = W.act2, ring = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const d = dist(x, y);
      if (d > reach) continue;
      const r = tileRng(x, y), t = layout1(x, y, r, d), v = r(), a2 = r();
      if (t.kind === 'camp') return anchorK;
      const sandInAct2 = a2 >= X.veinShare + (d >= X.hiveFrom ? X.hiveShare : 0);
      if (t.kind === 'empty' && !t.decor && d >= 5 && d <= 6.5 && sandInAct2) ring.push([v, key(x, y)]);
    }
    ring.sort((a, b) => a[0] - b[0]);
    anchorK = ring.length ? ring[0][1] : null;
    return anchorK;
  }
  function base(x, y) {
    const A2 = act2();
    if (A2 !== cacheAct) { layoutCache = {}; cacheAct = A2; } // Act II reshapes the Dunes
    const k = key(x, y);
    if (layoutCache[k]) return layoutCache[k];
    const r = tileRng(x, y);
    const d = dist(x, y);
    let t = layout1(x, y, r, d);
    if (k === anchorCamp()) t = { kind: 'camp', lvl: clamp(Math.round(d * 0.7), 2, 10) };
    t.x = x; t.y = y; t.k = k;
    t.v = r(); // per-tile variation for drawing
    // Act II: drawn after the base layout so the Act I map never changes
    const a2 = r();
    if (A2 && t.kind === 'empty' && !t.decor && d >= 3) {
      const X = W.act2;
      if (a2 < X.veinShare) t = { kind: 'node', res: 'sunsteel', lvl: clamp(Math.round(d / 1.5), 1, 10), x, y, k, v: t.v };
      else if (a2 < X.veinShare + X.hiveShare && d >= X.hiveFrom) t = { kind: 'camp', salt: true, cls: ['guard', 'bow', 'lancer'][Math.floor(t.v * 3)], lvl: clamp(Math.round(d * 0.9) - 4, 1, 12), x, y, k, v: t.v };
    }
    if (A2 && t.kind === 'node' && t.res === 'water') t.flooded = true;
    layoutCache[k] = t;
    return t;
  }
  // live view of a tile: layout + saved state (respawns, levels, depletion)
  function tile(x, y) {
    const b = base(x, y), st = S.map.tiles[b.k] || {};
    const t = { ...b, st };
    if (b.kind === 'node') {
      t.lvl = b.lvl + (st.lvlUp || 0);
      t.cap = W.nodes[b.res].cap * t.lvl * (b.flooded ? W.act2.floodCap : 1);
      t.left = st.until && S.time >= st.until ? t.cap : st.left == null ? t.cap : st.left;
      t.gone = !!(st.until && S.time < st.until);
      t.busy = st.busy && S.map.marches.some((m) => m.id === st.busy) ? st.busy : null;
    } else if (b.kind === 'beast' || b.kind === 'camp') {
      t.lvl = Math.min(b.kind === 'beast' ? 14 : 12, b.lvl + (st.lvlUp || 0));
      t.gone = !!(st.until && S.time < st.until);
      t.busy = st.busy && S.map.marches.some((m) => m.id === st.busy) ? st.busy : null;
    } else if (b.kind === 'ruin') {
      t.gone = !!st.done;
      t.busy = st.busy && S.map.marches.some((m) => m.id === st.busy) ? st.busy : null;
    }
    return t;
  }
  const setTile = (k, patch) => { S.map.tiles[k] = { ...(S.map.tiles[k] || {}), ...patch }; };
  function beastFoe(t) {
    if (t.kind === 'camp' && t.salt) {
      return { name: 'Saltborn Hive', cls: t.cls, boss: true, ...KH.foeStats(W.act2.hiveStage(t.lvl), W.act2.hiveScale) };
    }
    if (t.kind === 'camp') {
      return { name: `Scorpion Camp`, cls: 'guard', boss: true, ...KH.foeStats(W.beastStage(t.lvl) + W.campStageBonus, W.campScale) };
    }
    return { name: t.name, cls: t.cls, boss: false, ...KH.foeStats(W.beastStage(t.lvl), W.beastScale) };
  }
  const tileName = (t) => (t.kind === 'node' ? (t.flooded ? 'Flooded Oasis' : W.nodes[t.res].name) : t.kind === 'beast' ? t.name : t.kind === 'camp' ? (t.salt ? 'Saltborn Hive' : 'Scorpion Camp') : t.kind === 'ruin' ? DATA.ruins.find((r) => r.id === t.ruin).name : t.kind === 'keep' ? 'Your keep' : 'Open sand');

  // ======================================================================
  // Marches
  // ======================================================================
  const slots = () => W.marchSlots(S.lv.barracks);
  const gatherMult = () => 1 + 0.1 * (S.tech.camels || 0) + KH.stewardVal('gather') / 100 + KH.bonus('gather');
  const loadMult = () => 1 + 0.1 * (S.tech.camels || 0);
  const travel = (x, y) => Math.max(4, Math.round(dist(x, y) * W.travelPerTile));
  KH.troopsAway = () => (S ? S.map.marches.reduce((a, m) => a + sum(m.troops), 0) : 0);
  KH.heroBusy = (id) => !!S && S.map.marches.some((m) => m.heroes.includes(id));
  function pickTroops(frac) {
    const pool = KH.capTroops(S.troops, KH.marchCap());
    const out = {};
    for (const k in pool) out[k] = Math.floor(pool[k] * frac);
    return out;
  }
  function takeTroops(tr) { for (const k in tr) S.troops[k] -= tr[k]; }
  function returnTroops(tr, lossFrac = 0) {
    let lost = 0;
    for (const k in tr) { const l = Math.round(tr[k] * lossFrac); lost += l; S.troops[k] += tr[k] - l; }
    return lost;
  }
  function canSend(needHeroes) {
    if (!S.lv.barracks) return 'Build the Barracks to send marches.';
    if (S.map.marches.length >= slots()) return `All ${slots()} march slot${slots() > 1 ? 's are' : ' is'} in use. Barracks Lv 5 and 10 add more.`;
    if (needHeroes && !KH.squadHome().length) return 'Your squad is already out on a march.';
    return null;
  }
  function newMarch(kind, t, troops, heroes = []) {
    S.map.seq++;
    const tr = travel(t.x, t.y);
    const m = { id: S.map.seq, kind, x: t.x, y: t.y, troops, heroes, depart: S.time, arrive: S.time + tr, back: 0, state: 'out', amount: 0, res: null, workEnd: 0, report: null };
    takeTroops(troops);
    S.map.marches.push(m);
    setTile(t.k, { busy: m.id });
    KH.sfx('build');
    return m;
  }

  ACT.wsel = (k) => { UI.wsel = k; UI.sheet = { kind: 'tile', tile: k }; };
  ACT.wfrac = (f) => { UI.wsend = Number(f); };
  ACT.gather = (k) => {
    const [x, y] = k.split(',').map(Number), t = tile(x, y);
    if (t.kind !== 'node' || t.gone || t.busy || !visible(x, y)) return;
    const why = canSend(false);
    if (why) return KH.toast(why, 'warn');
    const troops = pickTroops(UI.wsend);
    const n = sum(troops);
    if (n < 1) return KH.toast('No troops at home to send. Train some at the Barracks.', 'warn');
    const node = W.nodes[t.res];
    const amount = Math.min(t.left, Math.floor(n * node.load * loadMult()));
    const m = newMarch('gather', t, troops);
    m.res = t.res;
    m.amount = amount;
    setTile(t.k, { left: t.left - amount, until: 0 });
    UI.sheet = null;
    KH.toast(`${n} troops set out to gather ${KH.NAME[t.res].toLowerCase()}.`, 'good');
    KH.emit('gatherStart');
  };
  ACT.wattack = (k) => {
    const [x, y] = k.split(',').map(Number), t = tile(x, y);
    if ((t.kind !== 'beast' && t.kind !== 'camp') || t.gone || t.busy || !visible(x, y)) return;
    const why = canSend(true);
    if (why) return KH.toast(why, 'warn');
    const troops = pickTroops(UI.wsend);
    newMarch(t.kind, t, troops, KH.squadHome());
    UI.sheet = null;
    KH.toast(`Your squad marches on the ${tileName(t)}.`, 'good');
  };
  ACT.wexplore = (k) => {
    const [x, y] = k.split(',').map(Number), t = tile(x, y);
    if (t.kind !== 'ruin' || t.gone || t.busy || !visible(x, y)) return;
    const why = canSend(false);
    if (why) return KH.toast(why, 'warn');
    const troops = pickTroops(Math.min(UI.wsend, 0.25));
    if (sum(troops) < 1) return KH.toast('Send at least one troop to explore.', 'warn');
    newMarch('ruin', t, troops);
    UI.sheet = null;
    KH.toast(`Scouts head for the ${tileName(t)}.`, 'good');
  };
  ACT.recall = (id) => {
    const m = S.map.marches.find((x) => x.id === Number(id));
    if (!m || m.state === 'back') return;
    if (m.state === 'out') {
      refundNode(m, m.amount);
      m.amount = 0;
      m.state = 'back';
      m.back = S.time + (S.time - m.depart);
    }
    else if (m.state === 'work') {
      const node = W.nodes[m.res];
      const got = Math.floor(Math.min(m.amount, (S.time - m.arrive) * sum(m.troops) * node.rate * gatherMult()));
      refundNode(m, m.amount - got);
      m.amount = got;
      m.state = 'back';
      m.back = S.time + travel(m.x, m.y);
    }
    KH.toast('March recalled.', '');
  };
  function refundNode(m, n) {
    if (m.kind !== 'gather' || n <= 0) return;
    const k = key(m.x, m.y), st = S.map.tiles[k] || {};
    setTile(k, { left: (st.left || 0) + n });
  }

  function resolveFight(m, offline) {
    const t = tile(m.x, m.y);
    const foe = { ...beastFoe(t), n: t.lvl };
    const team = KH.teamStats(foe.cls, { troops: m.troops, heroes: m.heroes });
    const result = KH.simulateBattle(team, foe);
    let rewards = null;
    if (result.win) {
      const L = S.lv.wyrm;
      if (t.kind === 'beast') {
        rewards = { journals: 4 + 3 * t.lvl, ...KH.scaleReward({ food: 0.6 + t.lvl * 0.12, stone: 0.4 + t.lvl * 0.08 }) };
        if (t.lvl >= 6) rewards.starglass = 5 + t.lvl;
        const roll = Math.random();
        if (t.lvl >= 9 && roll < 0.04) rewards.shard_legendary = 1;
        else if (t.lvl >= 5 && roll < 0.12) rewards.shard_epic = 1;
        else if (roll < 0.3) rewards.speed5 = 1;
        if (KH.pals && KH.pals.open()) rewards.treats = DATA.companions.beast(t.lvl); // Honeyed Dates for the companions
        S.stats.beasts++;
        KH.addPassXp(DATA.passXp.beast);
        setTile(t.k, { until: S.time + W.beastRespawn, lvlUp: (t.st.lvlUp || 0) + (t.lvl < 14 && t.lvl <= L + 2 ? 1 : 0) });
        KH.emit('beast', { lvl: t.lvl });
      } else if (t.salt) {
        rewards = { sunsteel: 60 + 20 * t.lvl, starglass: 40 + 10 * t.lvl, journals: 20 + 6 * t.lvl, ...KH.scaleReward({ copper: 2, water: 2 }) };
        if (Math.random() < 0.15) rewards.shard_epic = 1;
        S.stats.hives = (S.stats.hives || 0) + 1;
        setTile(t.k, { until: S.time + W.act2.hiveRespawn, lvlUp: (t.st.lvlUp || 0) + (t.lvl < 12 ? 1 : 0) });
        KH.emit('hiveDestroyed', { lvl: t.lvl });
      } else {
        rewards = { starglass: 30 + 10 * t.lvl, beacons: 1, journals: 10 + 5 * t.lvl, ...KH.scaleReward({ stone: 2, water: 2, copper: 1.5 }) };
        S.stats.camps++;
        setTile(t.k, { until: S.time + W.campRespawn, lvlUp: (t.st.lvlUp || 0) + (t.lvl < 12 ? 1 : 0) });
        KH.emit('campDestroyed', { lvl: t.lvl });
      }
      KH.grant(rewards);
    }
    const lossFrac = result.win ? 0 : 0.15;
    m.report = { win: result.win, foe: foe.name, lvl: t.lvl, rewards, lossFrac };
    KH.emit('battle', { kind: t.kind, win: result.win, foe });
    if (offline) return;
    const label = `${foe.name} Lv ${t.lvl}`;
    if (UI.tab === 'world' && !UI.sheet && !UI.battle) {
      KH.startBattle({ title: `The Dunes · ${label}`, foe, team, result, rewards, sideLabel: 'Your march', intro: 'Your march reaches its target…', loseLine: 'The march falls back with losses.' });
    } else KH.toast(result.win ? `Your march beat the ${label}.` : `Your march lost to the ${label}. Some troops fell.`, result.win ? 'good' : 'warn');
  }

  // ======================================================================
  // Ruins
  // ======================================================================
  function applyOutcome(rw, m) {
    const g = {}, notes = [];
    for (const [k, v] of Object.entries(rw)) {
      if (k === 'survivors') { const n = KH.addSurvivors(v); notes.push(n ? `${n} survivor${n > 1 ? 's' : ''} joined the keep.` : 'There was no room in the houses, so they moved on.'); }
      else if (k === 'troopsLost') m.lossFrac = v;
      else if (k === 'heal') { const n = S.sick; S.sick = 0; if (n) notes.push(`${n} sick survivor${n > 1 ? 's' : ''} recovered.`); }
      else if (k === 'foodCost' || k === 'waterCost') {
        const res = k === 'foodCost' ? 'food' : 'water';
        const c = Math.min(S.res[res], KH.scaleReward({ [res]: v })[res]);
        S.res[res] -= c;
        notes.push(`You gave ${fmt(c)} ${res}.`);
      } else g[k] = v;
    }
    const scaled = KH.scaleReward(g);
    KH.grant(scaled);
    return { reward: scaled, notes };
  }
  ACT.ruinpick = (i) => {
    const p = S.map.pendingRuin;
    if (!p || p.outcome) return;
    const ruin = DATA.ruins.find((r) => r.id === p.ruin);
    const ch = ruin.choices[Number(i)];
    if (!ch) return;
    let x = Math.random(), out = ch.outcomes[ch.outcomes.length - 1];
    for (const o of ch.outcomes) { if (x < o.p) { out = o; break; } x -= o.p; }
    const m = S.map.marches.find((mm) => mm.id === p.march) || { lossFrac: 0 };
    const res = applyOutcome(out.reward, m);
    p.outcome = { text: out.text, choice: ch.label, ...res };
    S.stats.ruins++;
    setTile(key(p.x, p.y), { done: true });
    KH.emit('ruin', { id: ruin.id });
    KH.sfx('claim');
  };
  ACT.ruindone = () => {
    const p = S.map.pendingRuin;
    if (!p) return;
    const m = S.map.marches.find((mm) => mm.id === p.march);
    if (m) { m.state = 'back'; m.back = S.time + travel(m.x, m.y); }
    S.map.pendingRuin = null;
    UI.sheet = null;
  };
  KH.sheets.ruin = () => {
    const p = S.map.pendingRuin;
    if (!p) { UI.sheet = null; return { title: '', lvl: '', body: '' }; }
    const ruin = DATA.ruins.find((r) => r.id === p.ruin);
    if (p.outcome) {
      const o = p.outcome;
      return {
        title: ruin.name, lvl: '', noClose: true,
        body: `<p class="muted small">You chose: ${esc(o.choice)}</p><p class="lore">${esc(o.text)}</p>
          ${Object.keys(o.reward).length ? `<div class="costs">${KH.rewardHTML(o.reward)}</div>` : ''}
          ${o.notes.map((n) => `<p class="notice good">${esc(n)}</p>`).join('')}
          <button class="btn wide" data-act="ruindone">Head home</button>`,
      };
    }
    return {
      title: ruin.name, lvl: 'Ruin', noClose: true,
      body: `${KH.art.painted('ruin', ruin.id) ? KH.art.banner('ruin', ruin.id, esc(ruin.text)) : `<div class="ruin-art">${icon('i-ruin')}</div><p class="lore">${esc(ruin.text)}</p>`}
        <div class="stack">${ruin.choices.map((c, i) => `<button class="btn wide alt choice" data-act="ruinpick" data-arg="${i}" ${i === 0 ? 'data-primary' : ''}>${esc(c.label)}</button>`).join('')}</div>`,
    };
  };

  // ======================================================================
  // Raids on the keep
  // ======================================================================
  const RD = W.raids;
  const warnTime = () => RD.warn + 10 * S.lv.watchtower + 30 * (S.tech.mirrors || 0) + KH.bonus('forecast') / 2;
  KH.raidNear = () => !!S && S.lv.wyrm >= RD.fromWyrm && S.map.raid.next > 0 && S.map.raid.next - S.time <= warnTime() && S.map.raid.next > S.time;
  // how far the sighted raiders have come (0 just sighted, 1 at the gate), for the 3D keep
  KH.raidProgress = () => (KH.raidNear() ? clamp(1 - (S.map.raid.next - S.time) / warnTime(), 0, 1) : null);
  function raidFoe() {
    const st = Math.max(2, Math.min(S.stage * 0.9, S.lv.wyrm * 3));
    return { n: Math.round(st), name: 'Scorpion Raiders', cls: pick(['guard', 'bow', 'lancer']), boss: false, chapter: 'Raid', ...KH.foeStats(st, 1.1) };
  }
  // ready the walls while raiders are sighted: rain turns the approach to mud, boiling water steadies the walls
  const rainingNow = () => !!(KH.keep && KH.keep.raining());
  ACT.raidpour = () => {
    if (!KH.raidNear()) return KH.toast('No raiders in sight.', 'warn');
    if (S.map.raid.pour) return KH.toast('The cauldrons are already steaming on the walls.', '');
    const cost = KH.scaleReward(RD.pour);
    if (!KH.canAfford(cost)) return KH.toast('Not enough water to spare for the walls.', 'warn');
    KH.pay(cost);
    S.map.raid.pour = true;
    KH.sfx('build');
    KH.toast('Cauldrons of boiling water stand ready on the walls.', 'good');
  };
  function resolveRaid() {
    const foe = raidFoe();
    const wet = rainingNow(), pour = !!S.map.raid.pour;
    if (wet) for (const k of ['atk', 'def', 'hp']) foe[k] *= 1 - RD.rainWeaken;
    S.map.raid.pour = false;
    const wt = 0.03 * S.lv.watchtower + (pour ? RD.pourBonus : 0);
    const team = KH.teamStats(foe.cls, { troops: { ...S.troops }, atkBonus: wt, defBonus: wt });
    const result = KH.simulateBattle(team, foe);
    let rewards = null, extra = [wet ? 'The rain turned the dunes to mud under their feet.' : '', pour ? 'Boiling water poured from the walls.' : ''].filter(Boolean).join(' ');
    if (result.win) {
      rewards = KH.scaleReward({ stone: 2, food: 2, copper: 1 });
      KH.grant(rewards);
      S.stats.raidsRepelled++;
      KH.emit('raidRepelled');
      S.map.raid.last = { win: true, t: S.time };
      extra = `${extra ? `${extra} ` : ''}The raiders scatter into the dunes, dropping what they carried.`;
    } else {
      const prot = KH.protectOf(), stolen = {};
      for (const r of KH.RES) { const n = Math.floor(Math.max(0, S.res[r] - prot) * 0.15); if (n > 0) { S.res[r] -= n; stolen[r] = n; } }
      let lost = 0;
      for (const k in S.troops) { const l = Math.round(S.troops[k] * 0.1); S.troops[k] -= l; lost += l; }
      S.map.raid.last = { win: false, t: S.time, stolen, lost };
      extra = `${extra ? `${extra} ` : ''}They made off with ${Object.entries(stolen).map(([k, v]) => `${fmt(v)} ${k}`).join(', ') || 'nothing'}${lost ? ` and ${lost} troops fell` : ''}. A bigger Storehouse protects more.`;
      KH.mail('Raiders broke into the keep', extra);
    }
    KH.emit('battle', { kind: 'raid', win: result.win, foe });
    const team2 = { ...team, heroes: team.heroes };
    if (!UI.battle) {
      KH.startBattle({ title: 'Raid on the keep', foe, team: team2, result, rewards, sideLabel: 'Your defenders', intro: 'Raiders storm the walls!', extra, noTips: false, loseLine: 'The raiders break through the gate.' });
    }
  }
  KH.raidInfo = () => {
    if (S.lv.wyrm < RD.fromWyrm) return `<p class="muted small">Raiders start testing your walls once your Rainwyrm reaches Lv ${RD.fromWyrm}.</p>`;
    const near = KH.raidNear();
    const last = S.map.raid.last;
    const rainLeft = KH.keep && KH.keep.rainLeft ? KH.keep.rainLeft() : 0;
    const prep = near ? `<div class="row wrap">${S.map.raid.pour ? '<span class="chip r-epic">Cauldrons ready (+20%)</span>' : `<button class="btn small" data-act="raidpour">Boil water for the walls · ${icon('i-water')}${fmt(KH.scaleReward(RD.pour).water)}</button>`}
        ${rainingNow() ? '<span class="chip r-epic">Raining: raiders 20% weaker</span>' : KH.keep && S.lv.wyrm >= DATA.rain.unlock ? (rainLeft > 0 ? `<span class="chip">Rain in ${fmtTime(rainLeft)}</span>` : '<button class="btn small" data-act="rain">Call the Rain on them</button>') : ''}</div>
        <div class="muted small">If it is raining when they arrive, the raiders fight 20% weaker. Boiling water from the wells gives your defenders +20% attack and defense for this raid.</div>` : '';
    return `<div class="card stack"><b>${near ? `Raiders arrive in ${fmtTime(S.map.raid.next - S.time)}` : 'No raiders sighted'}</b>${prep}
      <div class="muted small">Your defenders are every troop at home plus your squad. Each Watchtower level steadies them by 3% and spots raiders 10s sooner. Troops out gathering can't defend. The Storehouse protects ${fmt(KH.protectOf())} of each resource.</div>
      ${last ? `<div class="small ${last.win ? 'r-epic' : ''}">Last raid: ${last.win ? 'repelled' : 'they broke through'}.</div>` : ''}</div>`;
  };

  // ======================================================================
  // Tick
  // ======================================================================
  KH.hooks.tick.push((dt, offline, log) => {
    if (!S) return;
    for (const m of S.map.marches.slice()) {
      if (m.state === 'out' && S.time >= m.arrive) {
        if (m.kind === 'gather') {
          m.state = 'work';
          m.workEnd = m.arrive + m.amount / Math.max(0.01, sum(m.troops) * W.nodes[m.res].rate * gatherMult());
        } else if (m.kind === 'ruin') {
          if (S.map.pendingRuin) { m.arrive = S.time + 5; continue; } // one ruin story at a time
          m.state = 'work';
          m.workEnd = Infinity;
          S.map.pendingRuin = { x: m.x, y: m.y, ruin: base(m.x, m.y).ruin, march: m.id };
          if (!offline) KH.queueSheet({ kind: 'ruin' });
        } else {
          resolveFight(m, offline);
          m.state = 'back';
          m.back = S.time + travel(m.x, m.y);
        }
      }
      if (m.state === 'work' && m.kind === 'gather' && S.time >= m.workEnd) {
        m.state = 'back';
        m.back = m.workEnd + travel(m.x, m.y);
        const k = key(m.x, m.y), st = S.map.tiles[k] || {};
        if ((st.left || 0) <= 0) setTile(k, { until: S.time + W.nodeRespawn, left: null });
      }
      if (m.state === 'back' && S.time >= m.back) {
        const lost = returnTroops(m.troops, (m.report && m.report.lossFrac) || m.lossFrac || 0);
        S.map.marches = S.map.marches.filter((x) => x !== m);
        const k = key(m.x, m.y);
        if (S.map.tiles[k] && S.map.tiles[k].busy === m.id) setTile(k, { busy: null });
        if (m.kind === 'gather' && m.amount > 0) {
          KH.grant({ [m.res]: m.amount });
          S.stats.gathers++;
          S.stats.gathered += m.amount;
          KH.addPassXp(DATA.passXp.gather);
          KH.emit('gatherDone', { res: m.res, amount: m.amount });
          if (log) (log.marches = log.marches || []).push(`Gatherers brought home ${fmt(m.amount)} ${m.res}.`);
          else KH.toast(`Gatherers returned with ${fmt(m.amount)} ${KH.NAME[m.res].toLowerCase()}.`, 'good', 'gather', 2);
        } else if (!log && lost) KH.toast(`Your march returned. ${lost} troops were lost.`, 'warn');
      }
    }
    // raiders
    const raid = S.map.raid;
    if (S.lv.wyrm >= RD.fromWyrm) {
      if (!raid.next || offline) {
        if (!raid.next || raid.next - S.time < 300) raid.next = S.time + rand(RD.every[0], RD.every[1]);
        raid.warned = false;
      } else {
        if (!raid.warned && raid.next - S.time <= warnTime()) {
          raid.warned = true;
          KH.toast(`Raiders sighted! They reach the keep in ${fmtTime(raid.next - S.time)}. Bring your troops home.`, 'warn');
          KH.sfx('raid');
          KH.emit('raidSighted');
        }
        if (S.time >= raid.next) {
          raid.next = S.time + rand(RD.every[0], RD.every[1]);
          raid.warned = false;
          resolveRaid();
        }
      }
    }
  });
  KH.on('booted', () => { if (S.map.pendingRuin) KH.queueSheet({ kind: 'ruin' }); });
  KH.notifyHooks = KH.notifyHooks || [];
  KH.notifyHooks.push(() => S.map.marches.filter((m) => m.back || m.workEnd < Infinity).map((m) => ({
    id: `march-${m.id}`, title: 'March returning', body: m.kind === 'gather' ? `Gatherers are home with ${m.res}.` : 'Your march is back at the keep.',
    end: m.back || (m.workEnd + travel(m.x, m.y)),
  })));

  // ======================================================================
  // UI: chips, dots, tile sheet, overlay
  // ======================================================================
  KH.worldDot = () => !!S && ((S.lv.barracks && S.map.marches.length < slots() && sum(S.troops) > 0 && S.stats.gathers < 3) || !!S.map.pendingRuin);
  KH.chips.push(() => {
    let h = '';
    if (KH.raidNear()) h += `<button class="qchip raid" data-act="plot" data-arg="watchtower">${icon('i-sword')}Raiders <time>${fmtTime(S.map.raid.next - S.time)}</time></button>`;
    for (const m of S.map.marches) {
      const t = m.state === 'out' ? m.arrive : m.state === 'work' ? m.workEnd : m.back;
      const lbl = m.kind === 'gather' ? `${KH.NAME[m.res]}` : m.kind === 'ruin' ? 'Scouts' : 'March';
      h += `<button class="qchip" data-act="tab" data-arg="map">${icon(m.kind === 'gather' ? KH.ICON[m.res] : m.kind === 'ruin' ? 'i-ruin' : 'i-flag')}${lbl} <time>${t === Infinity ? 'waiting' : fmtTime(t - S.time)}</time></button>`;
    }
    return h;
  });

  KH.sheets.tile = () => {
    const [x, y] = UI.sheet.tile.split(',').map(Number);
    const t = tile(x, y);
    const d = dist(x, y);
    const tr = travel(x, y);
    const name = tileName(t);
    if (t.kind === 'keep') return { title: 'Your keep', lvl: `Lv ${S.lv.wyrm}`, body: `<p class="muted">${esc(S.wyrm.name)}'s mist keeps the air clear for ${fmt(Math.round(sight() - 0.5))} tiles around the keep. Grow it to push the dust haze back.</p><button class="btn wide" data-act="tab" data-arg="town">Enter the keep</button>` };
    if (!visible(x, y)) return { title: 'Dust Haze', lvl: '', body: `<p class="muted">This ground is hidden in the dust haze. ${esc(S.wyrm.name)}'s mist clears a little more of the Dunes every time it grows.</p>` };
    const busyMsg = t.busy ? '<p class="notice">One of your marches is already here.</p>' : '';
    const pool = KH.capTroops(S.troops, KH.marchCap());
    const avail = sum(pool);
    const fracs = [[0.25, '¼'], [0.5, '½'], [1, 'All']].map(([f, l]) => `<button class="${UI.wsend === f ? 'on' : ''}" data-act="wfrac" data-arg="${f}">${l}<small>${fmt(Math.floor(avail * f))}</small></button>`).join('');
    const why = canSend(t.kind === 'beast' || t.kind === 'camp');
    const slotLine = `<p class="muted small">${S.map.marches.length}/${slots()} marches out · ${fmt(avail)} troops ready (march cap ${KH.marchCap()}) · ${fmtTime(tr)} away</p>`;
    if (t.kind === 'empty') {
      const grove = KH.bloom && KH.bloom.groves()[t.k];
      return { title: grove ? 'Grove' : 'Open sand', lvl: '', body: `${grove ? '' : `<p class="muted">${t.decor === 'palm' ? 'A few dry palms around a dead well. Nothing to take here.' : t.decor === 'rock' ? 'Wind-carved rocks.' : 'Empty, rippling sand.'}</p>`}${KH.bloomTile ? KH.bloomTile(t) : ''}` };
    }
    if (t.kind === 'node') {
      const node = W.nodes[t.res];
      const n = Math.floor(avail * UI.wsend);
      const amount = Math.min(t.left, Math.floor(n * node.load * loadMult()));
      const secs = n ? amount / (n * node.rate * gatherMult()) + tr * 2 : 0;
      return {
        title: name, lvl: `Lv ${t.lvl}`,
        body: `${t.res === 'sunsteel' ? '<p class="muted small">Since the rains came back, veins of Sunsteel lie exposed in the washed-out sand. Gatherers carry it home for the Warden\'s Gear.</p>' : t.flooded ? '<p class="muted small">The rains filled this spring to the brim: it holds twice the water it used to.</p>' : ''}
          ${t.gone ? `<p class="notice heat">Picked clean. It recovers in ${fmtTime(t.st.until - S.time)}.</p>` : `<p class="muted">${fmt(t.left)} of ${fmt(t.cap)} ${KH.NAME[t.res].toLowerCase()} left. Each troop carries ${fmt(node.load * loadMult())}.</p>`}
          ${busyMsg}${slotLine}<div class="seg">${fracs}</div>
          ${n && !t.gone ? `<p class="small">Brings home <b>${fmt(amount)}</b> ${KH.NAME[t.res].toLowerCase()} in about ${fmtTime(secs)}.</p>` : ''}
          ${why ? `<p class="notice heat">${esc(why)}</p>` : ''}
          <button class="btn wide ${why || t.gone || t.busy || !n ? 'off' : ''}" data-act="gather" data-arg="${t.k}" data-primary>Send gatherers</button>`,
      };
    }
    if (t.kind === 'beast' || t.kind === 'camp') {
      const foe = beastFoe(t);
      const troops = KH.capTroops(pool, Math.floor(avail * UI.wsend));
      const team = KH.teamStats(foe.cls, { troops, heroes: KH.squadHome() });
      const ours = KH.statPower(team), theirs = KH.statPower(foe);
      const odds = ours >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
      const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === foe.cls);
      return {
        title: name, lvl: `Lv ${t.lvl}`,
        body: `${t.salt ? '<p class="muted small">A hive of the Saltborn, crusted white and humming. It drinks the ground dry around it.</p>' : ''}${t.gone ? `<p class="notice heat">${t.salt ? 'Shattered. The salt regrows' : t.kind === 'camp' ? 'Burned out. Raiders return' : 'The den is empty. Something returns'} in ${fmtTime(t.st.until - S.time)}.</p>` : ''}
          <div class="row">${KH.foeArt(foe, 'mini-foe')}<div class="grow"><div class="muted small">${icon(DATA.classes[foe.cls].icon)} Fights like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.</div>
          <div class="vs"><div class="side"><span class="muted small">Your march</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">${t.salt ? 'Hive' : t.kind === 'camp' ? 'Camp' : 'Beast'}</span><b>${fmt(theirs)}</b></div></div>
          <b style="color:${odds[1]}">${odds[0]}</b></div></div>
          ${busyMsg}${slotLine}<div class="seg">${fracs}</div>
          <p class="muted small">Your squad leads the march and is away until it returns. ${t.salt ? 'Hives pay out Sunsteel, Starglass, journals and sometimes an Epic Shard Pouch.' : t.kind === 'camp' ? 'Camps pay out Starglass, a Beacon Token and supplies.' : 'Beasts drop journals, food and sometimes hero shards.'} A lost fight costs 15% of the troops sent.</p>
          ${why ? `<p class="notice heat">${esc(why)}</p>` : ''}
          <button class="btn wide ${why || t.gone || t.busy ? 'off' : ''}" data-act="wattack" data-arg="${t.k}" data-primary>${icon('i-sword')}Attack</button>`,
      };
    }
    if (t.kind === 'ruin') {
      const ruin = DATA.ruins.find((r) => r.id === t.ruin);
      return {
        title: name, lvl: t.gone ? 'Explored' : 'Ruin',
        body: `<div class="ruin-art">${icon('i-ruin')}</div><p class="lore">${t.gone ? 'Your scouts have already been through here.' : esc(ruin.text)}</p>${busyMsg}${slotLine}
          ${why ? `<p class="notice heat">${esc(why)}</p>` : ''}
          ${t.gone ? '' : `<button class="btn wide ${why || t.busy ? 'off' : ''}" data-act="wexplore" data-arg="${t.k}" data-primary>Send scouts</button>`}`,
      };
    }
    return { title: name, lvl: '', body: '' };
  };
  KH.sheetHint = (q, kind, arg, mark) => mark('#sheet [data-primary]:not(.off)');

  ACT.wcenter = () => { view.ox = 0; view.oy = 0; if (KH.world3d && KH.world3d.center) KH.world3d.center(); };
  ACT.wnearest = () => {
    // pan to the nearest open node and open it
    let best = null, bd = 1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!visible(x, y)) continue;
      const t = tile(x, y);
      if (t.kind === 'node' && !t.gone && !t.busy && dist(x, y) < bd) { best = t; bd = dist(x, y); }
    }
    if (!best) return KH.toast('No open resources within clear sight right now.', 'warn');
    view.ox = -(best.x - C) * TS; view.oy = -(best.y - C) * TS;
    if (KH.world3d && KH.world3d.focus) KH.world3d.focus(best.x, best.y);
    ACT.wsel(best.k);
  };

  function renderOverlay(force) {
    if (!(UI.tab === 'world' && UI.sub.world === 'map')) return;
    const marches = S.map.marches.map((m) => {
      const t = m.state === 'out' ? m.arrive : m.state === 'work' ? m.workEnd : m.back;
      const lbl = m.kind === 'gather' ? `Gathering ${m.res}` : m.kind === 'ruin' ? 'Scouting a ruin' : m.kind === 'camp' ? 'Raiding a camp' : 'Hunting';
      const st = m.state === 'out' ? 'marching' : m.state === 'work' ? (m.kind === 'gather' ? 'working' : 'waiting for you') : 'returning';
      return `<div class="march"><span class="grow"><b>${lbl}</b><br><span class="muted small">${sum(m.troops)} troops · ${st}</span></span><time>${t === Infinity ? '' : fmtTime(t - S.time)}</time>${m.state !== 'back' && m.kind !== 'ruin' ? `<button class="btn small alt" data-act="recall" data-arg="${m.id}">Recall</button>` : m.kind === 'ruin' && m.state === 'work' ? '<button class="btn small gold" data-act="sheet" data-arg="ruin">Open</button>' : ''}</div>`;
    }).join('');
    const html = `<div class="world-top">${KH.subtabs('world', [['map', 'Dunes'], ['expedition', 'Expedition'], ...KH.worldTabs.map((w) => [w.id, w.label, w.dot && w.dot()])])}</div>
      <div class="world-tools"><span class="chip" title="Marches out, and troops at home">${icon('i-flag')}${S.map.marches.length}/${slots()}<i class="sep"></i>${icon('i-people')}${fmt(sum(S.troops))}</span><button class="btn small alt" data-act="wcenter" aria-label="Back to the keep" title="Back to the keep">${icon('i-compass')}</button>${KH.bloom && KH.bloom.unlocked() ? `<button class="chip bloom-chip" data-act="bloom" title="Bloom">${icon('i-sprout')}${KH.bloom.oases()}/${KH.bloom.max}</button>` : ''}<button class="btn small gold" data-act="wnearest" data-primary>Find resources</button></div>
      ${marches ? `<div class="marches">${marches}</div>` : !S.lv.barracks ? '<div class="marches"><p class="muted small">Build the Barracks to send marches onto the Dunes.</p></div>' : S.stats.gathers < 3 ? '<div class="marches"><p class="muted small">Tap a resource, beast, ruin or camp to send a march. Drag to look around.</p></div>' : ''}`;
    KH.setHTML($('#world-ui'), html, force);
  }
  KH.renderHooks.push(renderOverlay);

  // ======================================================================
  // Canvas map
  // ======================================================================
  const cv = $('#worldmap');
  const ctx = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1;
  const TS = 54;
  const view = { ox: 0, oy: 0 };
  const icons = {};
  function makeIcons() {
    const mk = (id, color) => {
      const sym = document.getElementById(id);
      if (!sym) return null;
      const img = new Image(), art = !color && KH.iconArt && KH.iconArt(id);
      // plain icons take the painting; tinted markers keep the drawn symbol
      if (art) { img.src = art; return img; }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" style="color:${color}">${((KH.iconSVG && KH.iconSVG[id]) || sym.innerHTML).replace(/currentColor/g, color)}</svg>`;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return img;
    };
    icons.stone = mk('i-stone'); icons.food = mk('i-food'); icons.water = mk('i-water'); icons.copper = mk('i-copper'); icons.sunsteel = mk('i-sunsteel');
    icons.paw = mk('i-paw', '#ffd7c8'); icons.ruin = mk('i-ruin', '#e7f6ff'); icons.flag = mk('i-flag', '#ffb3a1'); icons.lock = mk('i-lock', '#e8d2b0'); icons.hive = mk('i-spire', '#eaf6ff');
  }
  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
  }
  const toScreen = (x, y) => [VW / 2 + (x - C) * TS + view.ox, VH * 0.46 + (y - C) * TS + view.oy];
  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
  function palm(x, y, s) {
    ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3 * s, y - 8 * s, x + 1 * s, y - 15 * s); ctx.stroke();
    ctx.fillStyle = '#3f7a3a';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.7;
      ctx.beginPath(); ctx.ellipse(x + 1 * s + Math.cos(a) * 5 * s, y - 15 * s + Math.sin(a) * 3 * s + 2 * s, 6 * s, 1.8 * s, a, 0, Math.PI * 2); ctx.fill();
    }
  }
  function badge(x, y, img, lvl, col, dim) {
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.fillStyle = 'rgba(40,22,10,.82)'; ell(x, y, 13, 13); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ell(x, y, 13, 13); ctx.stroke();
    if (img && img.complete) ctx.drawImage(img, x - 9, y - 9, 18, 18);
    if (lvl != null) {
      ctx.fillStyle = col; ell(x + 11, y + 9, 7, 7); ctx.fill();
      ctx.fillStyle = '#2a1608'; ctx.font = "700 9px 'Barlow Semi Condensed', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(lvl), x + 11, y + 9.5);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!S || !(UI.tab === 'world' && UI.sub.world === 'map') || document.hidden || KH.world3dActive) return;
    if (!VW) resize();
    if (!VW) return;
    const t = now / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#c98d52'); g.addColorStop(1, '#e2b57a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    const R = sight();
    const [hx, hy] = toScreen(C, C);
    // clear ground around the keep
    const tg = ctx.createRadialGradient(hx, hy, 0, hx, hy, (R + 0.5) * TS);
    tg.addColorStop(0, 'rgba(120,170,110,.35)'); tg.addColorStop(0.5, 'rgba(240,210,160,.12)'); tg.addColorStop(1, 'rgba(240,210,160,0)');
    ctx.fillStyle = tg; ell(hx, hy, (R + 0.5) * TS, (R + 0.5) * TS); ctx.fill();
    // grid + tiles
    const x0 = Math.max(0, Math.floor(C - (VW / 2 + view.ox) / TS) - 1), x1 = Math.min(N - 1, Math.ceil(C + (VW / 2 - view.ox) / TS) + 1);
    const y0 = Math.max(0, Math.floor(C - (VH * 0.46 + view.oy) / TS) - 1), y1 = Math.min(N - 1, Math.ceil(C + (VH * 0.54 - view.oy) / TS) + 1);
    ctx.strokeStyle = 'rgba(90,50,20,.10)'; ctx.lineWidth = 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [sx, sy] = toScreen(x, y);
      ctx.strokeRect(sx - TS / 2, sy - TS / 2, TS, TS);
    }
    const marchTargets = new Set(S.map.marches.map((m) => key(m.x, m.y)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [sx, sy] = toScreen(x, y);
      const vis = visible(x, y);
      const tt = vis ? tile(x, y) : base(x, y);
      if (tt.kind === 'keep') {
        const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
        gg.addColorStop(0, `rgba(90,200,255,${0.6 + 0.1 * Math.sin(t * 3)})`); gg.addColorStop(1, 'rgba(90,200,255,0)');
        ctx.fillStyle = gg; ell(sx, sy, 30, 30); ctx.fill();
        ctx.fillStyle = '#c99a62'; ctx.fillRect(sx - 13, sy - 4, 9, 9); ctx.fillRect(sx + 4, sy - 3, 10, 8);
        ctx.fillStyle = '#e8c992'; ctx.fillRect(sx - 13, sy - 6, 9, 2); ctx.fillRect(sx + 4, sy - 5, 10, 2);
        ctx.fillStyle = '#3cc8cf'; ell(sx, sy + 6, 6, 3); ctx.fill();
        continue;
      }
      const grove = tt.kind === 'empty' && KH.bloom && KH.bloom.groves()[tt.k];
      if (grove) {
        // Bloom: a green patch that fills in with palms and a pool as it grows
        const st = KH.bloom.stageOf(grove);
        ctx.fillStyle = '#6fa84a'; ell(sx, sy + 10, 9 + st * 5, 4 + st * 2.5); ctx.fill();
        if (st === 2) { ctx.fillStyle = '#3cc8cf'; ell(sx + 5, sy + 11, 5, 2.2); ctx.fill(); }
        if (st >= 1) { palm(sx - 7, sy + 11, 0.6 + st * 0.12); palm(sx + 2, sy + 13, 0.5 + st * 0.12); }
      } else if (tt.decor === 'palm') {
        palm(sx - 10, sy + 12, 0.8 + tt.v * 0.3); palm(sx + 9, sy + 14, 0.7 + tt.v * 0.3);
      } else if (tt.kind === 'node' && tt.res === 'stone') {
        ctx.fillStyle = '#b07a48'; ctx.fillRect(sx - 14, sy + 2, 12, 12); ctx.fillRect(sx + 2, sy + 5, 12, 9);
        ctx.fillStyle = '#d9a56a'; ctx.fillRect(sx - 14, sy + 2, 12, 3); ctx.fillRect(sx + 2, sy + 5, 12, 3);
      } else if (tt.kind === 'node' && tt.res === 'water') {
        const fl = tt.flooded ? 1.45 : 1;
        ctx.fillStyle = '#5fb07a'; ell(sx, sy + 10, 14 * fl, 7 * fl); ctx.fill();
        ctx.fillStyle = '#3cc8cf'; ell(sx, sy + 10, 10 * fl, 4.5 * fl); ctx.fill();
        if (tt.flooded) { ctx.strokeStyle = `rgba(220,250,255,${0.4 + 0.2 * Math.sin(t * 2 + tt.v * 5)})`; ctx.lineWidth = 1; ell(sx, sy + 10, 6 + 4 * ((t * 0.6 + tt.v) % 1) * fl, 2.7 + 2 * ((t * 0.6 + tt.v) % 1) * fl); ctx.stroke(); }
      } else if (tt.kind === 'node' && tt.res === 'sunsteel') {
        const gl = 0.6 + 0.4 * Math.sin(t * 2.4 + tt.v * 6);
        ctx.fillStyle = '#8a6a44'; ell(sx, sy + 12, 13, 5); ctx.fill();
        ctx.fillStyle = '#e8b54a'; ctx.shadowColor = '#ffb347'; ctx.shadowBlur = 8 * gl;
        for (const [ox, h, w] of [[-7, 13, 4], [-1, 18, 5], [6, 11, 4]]) { ctx.beginPath(); ctx.moveTo(sx + ox - w, sy + 12); ctx.lineTo(sx + ox, sy + 12 - h); ctx.lineTo(sx + ox + w, sy + 12); ctx.fill(); }
        ctx.shadowBlur = 0;
      } else if (tt.decor === 'rock' || (tt.kind === 'node' && tt.res === 'copper')) {
        ctx.fillStyle = tt.res === 'copper' ? '#9a5a34' : '#a87a4e'; ell(sx - 6, sy + 10, 9, 6); ctx.fill(); ell(sx + 8, sy + 12, 7, 5); ctx.fill();
        ctx.fillStyle = tt.res === 'copper' ? '#4fc0a0' : '#d9b07a'; ell(sx - 7, sy + 7, 4, 2); ctx.fill();
      } else if (tt.kind === 'node' && tt.res === 'food') {
        palm(sx - 8, sy + 12, 0.8); palm(sx + 8, sy + 14, 0.7);
      } else if (tt.kind === 'camp' && tt.salt) {
        ctx.fillStyle = '#d8d2c4'; ell(sx, sy + 13, 16, 5); ctx.fill();
        ctx.fillStyle = '#f4f8fb';
        for (const [ox, h, w] of [[-9, 14, 5], [0, 22, 6], [9, 16, 5]]) { ctx.beginPath(); ctx.moveTo(sx + ox - w, sy + 13); ctx.lineTo(sx + ox, sy + 13 - h); ctx.lineTo(sx + ox + w, sy + 13); ctx.fill(); }
        ctx.fillStyle = '#b8c8d4'; ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 6, sy + 13); ctx.lineTo(sx + 1, sy + 13); ctx.fill();
      } else if (tt.kind === 'camp') {
        ctx.fillStyle = '#7a3a2a'; ctx.beginPath(); ctx.moveTo(sx - 16, sy + 14); ctx.lineTo(sx - 8, sy + 2); ctx.lineTo(sx, sy + 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 15); ctx.lineTo(sx + 10, sy + 4); ctx.lineTo(sx + 18, sy + 15); ctx.fill();
      } else if (tt.kind === 'ruin') {
        ctx.fillStyle = '#b8936a'; ctx.fillRect(sx - 12, sy + 2, 5, 12); ctx.fillRect(sx + 7, sy, 5, 14); ctx.fillRect(sx - 12, sy, 24, 4);
      }
      if (!vis) continue;
      const busy = marchTargets.has(tt.k);
      if (tt.kind === 'node') badge(sx, sy - 8, icons[tt.res], tt.lvl, '#ffcf6e', tt.gone);
      else if (tt.kind === 'beast') badge(sx, sy - 8, icons.paw, tt.lvl, '#ff8a7a', tt.gone);
      else if (tt.kind === 'camp') badge(sx, sy - 8, tt.salt ? icons.hive : icons.flag, tt.lvl, tt.salt ? '#9fd8ff' : '#ff5e4e', tt.gone);
      else if (tt.kind === 'ruin') {
        if (!tt.gone) {
          const a = 0.35 + 0.25 * Math.sin(t * 2.5 + tt.v * 6);
          ctx.fillStyle = `rgba(120,220,255,${a})`; ell(sx, sy - 8, 18, 18); ctx.fill();
        }
        badge(sx, sy - 8, icons.ruin, null, '#8fe4ff', tt.gone);
      }
      if (busy) { ctx.strokeStyle = 'rgba(255,207,110,.9)'; ctx.setLineDash([3, 3]); ell(sx, sy - 8, 17, 17); ctx.stroke(); ctx.setLineDash([]); }
      if (UI.wsel === tt.k && UI.sheet && UI.sheet.kind === 'tile') { ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 2.5; ctx.strokeRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4); }
    }
    // dust haze beyond clear sight
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.arc(hx, hy, R * TS, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(232,196,140,.72)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,245,225,.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ell(hx, hy, R * TS, R * TS); ctx.stroke(); ctx.setLineDash([]);
    // marches
    for (const m of S.map.marches) {
      const [tx, ty] = toScreen(m.x, m.y);
      let p;
      if (m.state === 'out') p = clamp((S.time - m.depart) / (m.arrive - m.depart), 0, 1);
      else if (m.state === 'work') p = 1;
      else { const tr = travel(m.x, m.y); p = clamp((m.back - S.time) / tr, 0, 1); }
      const col = m.kind === 'gather' ? '#ffcf6e' : m.kind === 'ruin' ? '#8fd0ff' : '#ff6b5e';
      ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty - 8); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      const mx = hx + (tx - hx) * p, my = hy + (ty - 8 - hy) * p;
      ctx.fillStyle = col; ell(mx, my, m.state === 'work' ? 6 + Math.sin(t * 5) : 6, m.state === 'work' ? 6 + Math.sin(t * 5) : 6); ctx.fill();
      ctx.strokeStyle = '#2a1608'; ctx.lineWidth = 1.5; ell(mx, my, 6, 6); ctx.stroke();
    }
    // drifting sand
    ctx.fillStyle = 'rgba(255,236,200,.5)';
    for (let i = 0; i < 40; i++) {
      const fx = ((i * 97.13 + t * 40 * (1 + (i % 3))) % (VW + 20)) - 10, fy = ((i * 53.7 + t * 6 * (1 + (i % 4) * 0.3)) % (VH + 20)) - 10;
      ell(fx, fy, 1.4 + (i % 3) * 0.4, 0.6); ctx.fill();
    }
  }

  // drag to look around, tap a tile; in 3D a pinch or the wheel zooms
  let drag = null;
  const fingers = new Map();
  const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const w3 = () => (KH.world3dActive ? KH.world3d : null);
  cv.addEventListener('pointerdown', (e) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 1) drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, ox: view.ox, oy: view.oy, moved: false, pinch: 0 };
    else if (drag) { drag.moved = true; drag.pinch = spread(); }
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !fingers.has(e.pointerId)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size >= 2) { const d = spread(); if (w3() && drag.pinch) w3().zoom(d / drag.pinch); drag.pinch = d; return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (w3()) { if (drag.moved) w3().pan(e.clientX - drag.lx, e.clientY - drag.ly); }
    else {
      const lim = C * TS;
      view.ox = clamp(drag.ox + dx, -lim, lim);
      view.oy = clamp(drag.oy + dy, -lim, lim);
    }
    drag.lx = e.clientX; drag.ly = e.clientY;
  });
  cv.addEventListener('pointerup', (e) => {
    fingers.delete(e.pointerId);
    if (!drag || fingers.size) return;
    const moved = drag.moved;
    drag = null;
    if (moved || !S) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let k;
    if (w3()) k = w3().pick(px, py);
    else {
      const x = Math.round(C + (px - VW / 2 - view.ox) / TS), y = Math.round(C + (py - VH * 0.46 - view.oy) / TS);
      k = x < 0 || y < 0 || x >= N || y >= N ? null : key(x, y);
    }
    if (!k) return;
    KH.sfx('tap');
    ACT.wsel(k);
    KH.renderAll(true);
  });
  cv.addEventListener('pointercancel', (e) => { fingers.delete(e.pointerId); if (!fingers.size) drag = null; });
  cv.addEventListener('wheel', (e) => { if (!w3()) return; e.preventDefault(); w3().zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08); }, { passive: false });

  KH.on('booted', () => { makeIcons(); resize(); requestAnimationFrame(frame); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  KH.hooks.power.push(() => 0);
  KH.world = { tile, visible, travel, slots, base, sight, dist, key, N, C, view, tileName };
})();
