/*
 * Kindlehold Snowfield: the world map around the hold. Seeded tiles hold resource
 * nodes, beasts, ruins and raider camps; the frost line recedes as the wyrm grows.
 * Marches gather, fight and explore. Raiders also come for the hold itself.
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
  let layoutCache = {};
  const key = (x, y) => `${x},${y}`;
  const dist = (x, y) => Math.hypot(x - C, y - C);
  const sight = () => W.sight(S.lv.hearth) + 0.5;
  const visible = (x, y) => dist(x, y) <= sight();
  function base(x, y) {
    const k = key(x, y);
    if (layoutCache[k]) return layoutCache[k];
    const r = seeded((S.map.seed ^ (x * 7919 + y * 104729)) >>> 0);
    const d = dist(x, y);
    let t;
    if (d < 0.5) t = { kind: 'hold' };
    else if (d < 1.6) t = { kind: 'empty', decor: r() < 0.3 ? 'pine' : null };
    else {
      const v = r();
      if (v < 0.17) {
        const w = r();
        let res = w < 0.3 ? 'wood' : w < 0.6 ? 'food' : w < 0.86 ? 'coal' : 'iron';
        if (res === 'iron' && d < 3) res = 'coal';
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
        t = { kind: 'empty', decor: dv < 0.4 ? 'pine' : dv < 0.55 ? 'rock' : null };
      }
    }
    t.x = x; t.y = y; t.k = k;
    t.v = r(); // per-tile variation for drawing
    layoutCache[k] = t;
    return t;
  }
  // live view of a tile: layout + saved state (respawns, levels, depletion)
  function tile(x, y) {
    const b = base(x, y), st = S.map.tiles[b.k] || {};
    const t = { ...b, st };
    if (b.kind === 'node') {
      t.lvl = b.lvl + (st.lvlUp || 0);
      t.cap = W.nodes[b.res].cap * t.lvl;
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
    if (t.kind === 'camp') {
      return { name: `Frostfang Camp`, cls: 'guard', boss: true, ...KH.foeStats(W.beastStage(t.lvl) + W.campStageBonus, W.campScale) };
    }
    return { name: t.name, cls: t.cls, boss: false, ...KH.foeStats(W.beastStage(t.lvl), W.beastScale) };
  }
  const tileName = (t) => (t.kind === 'node' ? W.nodes[t.res].name : t.kind === 'beast' ? t.name : t.kind === 'camp' ? 'Frostfang Camp' : t.kind === 'ruin' ? DATA.ruins.find((r) => r.id === t.ruin).name : t.kind === 'hold' ? 'Your hold' : 'Open snow');

  // ======================================================================
  // Marches
  // ======================================================================
  const slots = () => W.marchSlots(S.lv.barracks);
  const gatherMult = () => 1 + 0.1 * (S.tech.sledges || 0) + KH.stewardVal('gather') / 100 + KH.bonus('gather');
  const loadMult = () => 1 + 0.1 * (S.tech.sledges || 0);
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
      const L = S.lv.hearth;
      if (t.kind === 'beast') {
        rewards = { journals: 4 + 3 * t.lvl, ...KH.scaleReward({ food: 0.6 + t.lvl * 0.12, wood: 0.4 + t.lvl * 0.08 }) };
        if (t.lvl >= 6) rewards.starglass = 5 + t.lvl;
        const roll = Math.random();
        if (t.lvl >= 9 && roll < 0.04) rewards.shard_legendary = 1;
        else if (t.lvl >= 5 && roll < 0.12) rewards.shard_epic = 1;
        else if (roll < 0.3) rewards.speed5 = 1;
        S.stats.beasts++;
        KH.addPassXp(DATA.passXp.beast);
        setTile(t.k, { until: S.time + W.beastRespawn, lvlUp: (t.st.lvlUp || 0) + (t.lvl < 14 && t.lvl <= L + 2 ? 1 : 0) });
        KH.emit('beast', { lvl: t.lvl });
      } else {
        rewards = { starglass: 30 + 10 * t.lvl, beacons: 1, journals: 10 + 5 * t.lvl, ...KH.scaleReward({ wood: 2, coal: 2, iron: 1.5 }) };
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
      KH.startBattle({ title: `The Snowfield · ${label}`, foe, team, result, rewards, sideLabel: 'Your march', intro: 'Your march reaches its target…', loseLine: 'The march falls back with losses.' });
    } else KH.toast(result.win ? `Your march beat the ${label}.` : `Your march lost to the ${label}. Some troops fell.`, result.win ? 'good' : 'warn');
  }

  // ======================================================================
  // Ruins
  // ======================================================================
  function applyOutcome(rw, m) {
    const g = {}, notes = [];
    for (const [k, v] of Object.entries(rw)) {
      if (k === 'survivors') { const n = KH.addSurvivors(v); notes.push(n ? `${n} survivor${n > 1 ? 's' : ''} joined the hold.` : 'There was no room in the shelters, so they moved on.'); }
      else if (k === 'troopsLost') m.lossFrac = v;
      else if (k === 'heal') { const n = S.sick; S.sick = 0; if (n) notes.push(`${n} sick survivor${n > 1 ? 's' : ''} recovered.`); }
      else if (k === 'foodCost' || k === 'coalCost') {
        const res = k === 'foodCost' ? 'food' : 'coal';
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
      body: `<div class="ruin-art">${icon('i-ruin')}</div><p class="lore">${esc(ruin.text)}</p>
        <div class="stack">${ruin.choices.map((c, i) => `<button class="btn wide alt choice" data-act="ruinpick" data-arg="${i}" ${i === 0 ? 'data-primary' : ''}>${esc(c.label)}</button>`).join('')}</div>`,
    };
  };

  // ======================================================================
  // Raids on the hold
  // ======================================================================
  const RD = W.raids;
  const warnTime = () => RD.warn + 10 * S.lv.watchtower + 30 * (S.tech.horns || 0) + KH.bonus('forecast') / 2;
  KH.raidNear = () => !!S && S.lv.hearth >= RD.fromHearth && S.map.raid.next > 0 && S.map.raid.next - S.time <= warnTime() && S.map.raid.next > S.time;
  function raidFoe() {
    const st = Math.max(2, Math.min(S.stage * 0.9, S.lv.hearth * 3));
    return { n: Math.round(st), name: 'Frostfang Raiders', cls: pick(['guard', 'bow', 'lancer']), boss: false, chapter: 'Raid', ...KH.foeStats(st, 1.1) };
  }
  function resolveRaid() {
    const foe = raidFoe();
    const wt = 0.03 * S.lv.watchtower;
    const team = KH.teamStats(foe.cls, { troops: { ...S.troops }, atkBonus: wt, defBonus: wt });
    const result = KH.simulateBattle(team, foe);
    let rewards = null, extra = '';
    if (result.win) {
      rewards = KH.scaleReward({ wood: 2, food: 2, iron: 1 });
      KH.grant(rewards);
      S.stats.raidsRepelled++;
      KH.emit('raidRepelled');
      S.map.raid.last = { win: true, t: S.time };
      extra = 'The raiders scatter into the snow, leaving their sledges behind.';
    } else {
      const prot = KH.protectOf(), stolen = {};
      for (const r of KH.RES) { const n = Math.floor(Math.max(0, S.res[r] - prot) * 0.15); if (n > 0) { S.res[r] -= n; stolen[r] = n; } }
      let lost = 0;
      for (const k in S.troops) { const l = Math.round(S.troops[k] * 0.1); S.troops[k] -= l; lost += l; }
      S.map.raid.last = { win: false, t: S.time, stolen, lost };
      extra = `They made off with ${Object.entries(stolen).map(([k, v]) => `${fmt(v)} ${k}`).join(', ') || 'nothing'}${lost ? ` and ${lost} troops fell` : ''}. A bigger Storehouse protects more.`;
      KH.mail('Raiders broke into the hold', extra);
    }
    KH.emit('battle', { kind: 'raid', win: result.win, foe });
    const team2 = { ...team, heroes: team.heroes };
    if (!UI.battle) {
      KH.startBattle({ title: 'Raid on the hold', foe, team: team2, result, rewards, sideLabel: 'Your defenders', intro: 'Raiders storm the walls!', extra, noTips: false, loseLine: 'The raiders break through the gate.' });
    }
  }
  KH.raidInfo = () => {
    if (S.lv.hearth < RD.fromHearth) return `<p class="muted small">Raiders start testing your walls once your Hearthwyrm reaches Lv ${RD.fromHearth}.</p>`;
    const near = KH.raidNear();
    const last = S.map.raid.last;
    return `<div class="card stack"><b>${near ? `Raiders arrive in ${fmtTime(S.map.raid.next - S.time)}` : 'No raiders sighted'}</b>
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
          S.res[m.res] += m.amount;
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
    if (S.lv.hearth >= RD.fromHearth) {
      if (!raid.next || offline) {
        if (!raid.next || raid.next - S.time < 300) raid.next = S.time + rand(RD.every[0], RD.every[1]);
        raid.warned = false;
      } else {
        if (!raid.warned && raid.next - S.time <= warnTime()) {
          raid.warned = true;
          KH.toast(`Raiders sighted! They reach the hold in ${fmtTime(raid.next - S.time)}. Bring your troops home.`, 'warn');
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
    id: `march-${m.id}`, title: 'March returning', body: m.kind === 'gather' ? `Gatherers are home with ${m.res}.` : 'Your march is back at the hold.',
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
    if (t.kind === 'hold') return { title: 'Your hold', lvl: `Lv ${S.lv.hearth}`, body: `<p class="muted">${esc(S.wyrm.name)} keeps ${fmt(Math.round(sight() - 0.5))} tiles of the Snowfield thawed around the hold. Grow it to push the frost line back.</p><button class="btn wide" data-act="tab" data-arg="town">Enter the hold</button>` };
    if (!visible(x, y)) return { title: 'Frozen', lvl: '', body: `<p class="muted">This ground is locked under the frost. ${esc(S.wyrm.name)} thaws a little more of the Snowfield every time it grows.</p>` };
    const busyMsg = t.busy ? '<p class="notice">One of your marches is already here.</p>' : '';
    const pool = KH.capTroops(S.troops, KH.marchCap());
    const avail = sum(pool);
    const fracs = [[0.25, '¼'], [0.5, '½'], [1, 'All']].map(([f, l]) => `<button class="${UI.wsend === f ? 'on' : ''}" data-act="wfrac" data-arg="${f}">${l}<small>${fmt(Math.floor(avail * f))}</small></button>`).join('');
    const why = canSend(t.kind === 'beast' || t.kind === 'camp');
    const slotLine = `<p class="muted small">${S.map.marches.length}/${slots()} marches out · ${fmt(avail)} troops ready (march cap ${KH.marchCap()}) · ${fmtTime(tr)} away</p>`;
    if (t.kind === 'empty') return { title: 'Open snow', lvl: '', body: `<p class="muted">${t.decor === 'pine' ? 'A stand of frozen pines. Nothing to take here.' : t.decor === 'rock' ? 'Wind-scoured rocks.' : 'Empty, quiet snow.'}</p>` };
    if (t.kind === 'node') {
      const node = W.nodes[t.res];
      const n = Math.floor(avail * UI.wsend);
      const amount = Math.min(t.left, Math.floor(n * node.load * loadMult()));
      const secs = n ? amount / (n * node.rate * gatherMult()) + tr * 2 : 0;
      return {
        title: name, lvl: `Lv ${t.lvl}`,
        body: `${t.gone ? `<p class="notice cold">Picked clean. It recovers in ${fmtTime(t.st.until - S.time)}.</p>` : `<p class="muted">${fmt(t.left)} of ${fmt(t.cap)} ${KH.NAME[t.res].toLowerCase()} left. Each troop carries ${fmt(node.load * loadMult())}.</p>`}
          ${busyMsg}${slotLine}<div class="seg">${fracs}</div>
          ${n && !t.gone ? `<p class="small">Brings home <b>${fmt(amount)}</b> ${KH.NAME[t.res].toLowerCase()} in about ${fmtTime(secs)}.</p>` : ''}
          ${why ? `<p class="notice cold">${esc(why)}</p>` : ''}
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
        body: `${t.gone ? `<p class="notice cold">${t.kind === 'camp' ? 'Burned out. Raiders return' : 'The den is empty. Something returns'} in ${fmtTime(t.st.until - S.time)}.</p>` : ''}
          <div class="row">${KH.foeArt(foe, 'mini-foe')}<div class="grow"><div class="muted small">${icon(DATA.classes[foe.cls].icon)} Fights like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.</div>
          <div class="vs"><div class="side"><span class="muted small">Your march</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">${t.kind === 'camp' ? 'Camp' : 'Beast'}</span><b>${fmt(theirs)}</b></div></div>
          <b style="color:${odds[1]}">${odds[0]}</b></div></div>
          ${busyMsg}${slotLine}<div class="seg">${fracs}</div>
          <p class="muted small">Your squad leads the march and is away until it returns. ${t.kind === 'camp' ? 'Camps pay out Starglass, a Beacon Token and supplies.' : 'Beasts drop journals, food and sometimes hero shards.'} A lost fight costs 15% of the troops sent.</p>
          ${why ? `<p class="notice cold">${esc(why)}</p>` : ''}
          <button class="btn wide ${why || t.gone || t.busy ? 'off' : ''}" data-act="wattack" data-arg="${t.k}" data-primary>${icon('i-sword')}Attack</button>`,
      };
    }
    if (t.kind === 'ruin') {
      const ruin = DATA.ruins.find((r) => r.id === t.ruin);
      return {
        title: name, lvl: t.gone ? 'Explored' : 'Ruin',
        body: `<div class="ruin-art">${icon('i-ruin')}</div><p class="lore">${t.gone ? 'Your scouts have already been through here.' : esc(ruin.text)}</p>${busyMsg}${slotLine}
          ${why ? `<p class="notice cold">${esc(why)}</p>` : ''}
          ${t.gone ? '' : `<button class="btn wide ${why || t.busy ? 'off' : ''}" data-act="wexplore" data-arg="${t.k}" data-primary>Send scouts</button>`}`,
      };
    }
    return { title: name, lvl: '', body: '' };
  };
  KH.sheetHint = (q, kind, arg, mark) => mark('#sheet [data-primary]:not(.off)');

  ACT.wcenter = () => { view.ox = 0; view.oy = 0; };
  ACT.wnearest = () => {
    // pan to the nearest open node and open it
    let best = null, bd = 1e9;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!visible(x, y)) continue;
      const t = tile(x, y);
      if (t.kind === 'node' && !t.gone && !t.busy && dist(x, y) < bd) { best = t; bd = dist(x, y); }
    }
    if (!best) return KH.toast('No open resources within the thaw right now.', 'warn');
    view.ox = -(best.x - C) * TS; view.oy = -(best.y - C) * TS;
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
    const html = `<div class="world-top">${KH.subtabs('world', [['map', 'Snowfield'], ['expedition', 'Expedition']])}</div>
      <div class="world-tools"><span class="chip">${icon('i-flag')}${S.map.marches.length}/${slots()} marches</span><span class="chip">${icon('i-people')}${fmt(sum(S.troops))} home</span><button class="btn small alt" data-act="wcenter">Center</button><button class="btn small gold" data-act="wnearest" data-primary>Find resources</button></div>
      ${marches ? `<div class="marches">${marches}</div>` : `<div class="marches"><p class="muted small">${S.lv.barracks ? 'Tap a resource, beast, ruin or camp to send a march. Drag to look around.' : 'Build the Barracks to send marches onto the Snowfield.'}</p></div>`}`;
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
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" style="color:${color}">${sym.innerHTML.replace(/currentColor/g, color)}</svg>`;
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return img;
    };
    icons.wood = mk('i-wood'); icons.food = mk('i-food'); icons.coal = mk('i-coal'); icons.iron = mk('i-iron');
    icons.paw = mk('i-paw', '#ffd7c8'); icons.ruin = mk('i-ruin', '#e7f2ff'); icons.flag = mk('i-flag', '#ffb3a1'); icons.lock = mk('i-lock', '#9fb6cc');
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
  function pine(x, y, s) {
    ctx.fillStyle = '#1f3a34';
    ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x - 7 * s, y); ctx.lineTo(x + 7 * s, y); ctx.fill();
    ctx.fillStyle = '#e6eef6';
    ctx.beginPath(); ctx.moveTo(x, y - 16 * s); ctx.lineTo(x - 3.5 * s, y - 9 * s); ctx.lineTo(x + 3.5 * s, y - 9 * s); ctx.fill();
  }
  function badge(x, y, img, lvl, col, dim) {
    ctx.globalAlpha = dim ? 0.45 : 1;
    ctx.fillStyle = 'rgba(8,14,24,.82)'; ell(x, y, 13, 13); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ell(x, y, 13, 13); ctx.stroke();
    if (img && img.complete) ctx.drawImage(img, x - 9, y - 9, 18, 18);
    if (lvl != null) {
      ctx.fillStyle = col; ell(x + 11, y + 9, 7, 7); ctx.fill();
      ctx.fillStyle = '#0b1320'; ctx.font = "700 9px 'Barlow Semi Condensed', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(lvl), x + 11, y + 9.5);
    }
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (!S || !(UI.tab === 'world' && UI.sub.world === 'map') || document.hidden) return;
    if (!VW) resize();
    if (!VW) return;
    const t = now / 1000;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#5e7894'); g.addColorStop(1, '#86a0b8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    const R = sight();
    const [hx, hy] = toScreen(C, C);
    // thawed ground
    const tg = ctx.createRadialGradient(hx, hy, 0, hx, hy, (R + 0.5) * TS);
    tg.addColorStop(0, 'rgba(120,96,80,.35)'); tg.addColorStop(0.6, 'rgba(150,170,190,.08)'); tg.addColorStop(1, 'rgba(150,170,190,0)');
    ctx.fillStyle = tg; ell(hx, hy, (R + 0.5) * TS, (R + 0.5) * TS); ctx.fill();
    // grid + tiles
    const x0 = Math.max(0, Math.floor(C - (VW / 2 + view.ox) / TS) - 1), x1 = Math.min(N - 1, Math.ceil(C + (VW / 2 - view.ox) / TS) + 1);
    const y0 = Math.max(0, Math.floor(C - (VH * 0.46 + view.oy) / TS) - 1), y1 = Math.min(N - 1, Math.ceil(C + (VH * 0.54 - view.oy) / TS) + 1);
    ctx.strokeStyle = 'rgba(230,240,250,.08)'; ctx.lineWidth = 1;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [sx, sy] = toScreen(x, y);
      ctx.strokeRect(sx - TS / 2, sy - TS / 2, TS, TS);
    }
    const marchTargets = new Set(S.map.marches.map((m) => key(m.x, m.y)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const [sx, sy] = toScreen(x, y);
      const vis = visible(x, y);
      const tt = vis ? tile(x, y) : base(x, y);
      if (tt.kind === 'hold') {
        const gg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 30);
        gg.addColorStop(0, `rgba(255,150,70,${0.7 + 0.1 * Math.sin(t * 3)})`); gg.addColorStop(1, 'rgba(255,150,70,0)');
        ctx.fillStyle = gg; ell(sx, sy, 30, 30); ctx.fill();
        ctx.fillStyle = '#5a3d26'; ctx.fillRect(sx - 12, sy - 2, 8, 7); ctx.fillRect(sx + 4, sy - 1, 9, 6);
        ctx.fillStyle = '#e6eef6'; ctx.beginPath(); ctx.moveTo(sx - 13, sy - 2); ctx.lineTo(sx - 8, sy - 8); ctx.lineTo(sx - 3, sy - 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + 3, sy - 1); ctx.lineTo(sx + 8.5, sy - 7); ctx.lineTo(sx + 14, sy - 1); ctx.fill();
        ctx.fillStyle = '#ffcf6e'; ell(sx, sy - 6, 3.5, 3.5); ctx.fill();
        continue;
      }
      if (tt.decor === 'pine' || (tt.kind === 'node' && tt.res === 'wood')) {
        pine(sx - 10, sy + 10, 0.8 + tt.v * 0.3); pine(sx + 9, sy + 12, 0.7 + tt.v * 0.3); pine(sx, sy + 6, 1);
      } else if (tt.decor === 'rock' || (tt.kind === 'node' && (tt.res === 'coal' || tt.res === 'iron'))) {
        ctx.fillStyle = tt.res === 'coal' ? '#2b2f36' : '#6d7785'; ell(sx - 6, sy + 10, 9, 6); ctx.fill(); ell(sx + 8, sy + 12, 7, 5); ctx.fill();
        ctx.fillStyle = '#e6eef6'; ell(sx - 7, sy + 6, 5, 2); ctx.fill();
      } else if (tt.kind === 'node' && tt.res === 'food') {
        ctx.strokeStyle = 'rgba(80,60,40,.5)'; ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(sx - 10 + i * 6, sy + 12 - (i % 2) * 3, 1.2, 0, Math.PI * 2); ctx.stroke(); }
      } else if (tt.kind === 'camp') {
        ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.moveTo(sx - 16, sy + 14); ctx.lineTo(sx - 8, sy + 2); ctx.lineTo(sx, sy + 14); ctx.fill();
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 15); ctx.lineTo(sx + 10, sy + 4); ctx.lineTo(sx + 18, sy + 15); ctx.fill();
      } else if (tt.kind === 'ruin') {
        ctx.fillStyle = '#8f99a6'; ctx.fillRect(sx - 12, sy + 2, 5, 12); ctx.fillRect(sx + 7, sy, 5, 14); ctx.fillRect(sx - 12, sy, 24, 4);
      }
      if (!vis) continue;
      const busy = marchTargets.has(tt.k);
      if (tt.kind === 'node') badge(sx, sy - 8, icons[tt.res], tt.lvl, '#ffcf6e', tt.gone);
      else if (tt.kind === 'beast') badge(sx, sy - 8, icons.paw, tt.lvl, '#ff8a7a', tt.gone);
      else if (tt.kind === 'camp') badge(sx, sy - 8, icons.flag, tt.lvl, '#ff5e4e', tt.gone);
      else if (tt.kind === 'ruin') {
        if (!tt.gone) {
          const a = 0.35 + 0.25 * Math.sin(t * 2.5 + tt.v * 6);
          ctx.fillStyle = `rgba(140,200,255,${a})`; ell(sx, sy - 8, 18, 18); ctx.fill();
        }
        badge(sx, sy - 8, icons.ruin, null, '#8fd0ff', tt.gone);
      }
      if (busy) { ctx.strokeStyle = 'rgba(255,207,110,.9)'; ctx.setLineDash([3, 3]); ell(sx, sy - 8, 17, 17); ctx.stroke(); ctx.setLineDash([]); }
      if (UI.wsel === tt.k && UI.sheet && UI.sheet.kind === 'tile') { ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 2.5; ctx.strokeRect(sx - TS / 2 + 2, sy - TS / 2 + 2, TS - 4, TS - 4); }
    }
    // frost beyond the thaw
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VW, VH);
    ctx.arc(hx, hy, R * TS, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(226,238,250,.62)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
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
      ctx.strokeStyle = '#0b1320'; ctx.lineWidth = 1.5; ell(mx, my, 6, 6); ctx.stroke();
    }
    // a little snowfall
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 40; i++) {
      const fx = ((i * 97.13 + t * 12 * (1 + (i % 3))) % (VW + 20)) - 10, fy = ((i * 53.7 + t * 30 * (1 + (i % 4) * 0.3)) % (VH + 20)) - 10;
      ell(fx, fy, 1 + (i % 3) * 0.5, 1 + (i % 3) * 0.5); ctx.fill();
    }
  }

  let drag = null;
  cv.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
    cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    const lim = C * TS;
    view.ox = clamp(drag.ox + dx, -lim, lim);
    view.oy = clamp(drag.oy + dy, -lim, lim);
  });
  cv.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved || !S) return;
    const r = cv.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const x = Math.round(C + (px - VW / 2 - view.ox) / TS), y = Math.round(C + (py - VH * 0.46 - view.oy) / TS);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    KH.sfx('tap');
    ACT.wsel(key(x, y));
    KH.renderAll(true);
  });
  cv.addEventListener('pointercancel', () => { drag = null; });

  KH.on('booted', () => { makeIcons(); resize(); requestAnimationFrame(frame); });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);

  KH.hooks.power.push(() => 0);
  KH.world = { tile, visible, travel, slots, base };
})();
