/*
 * Kindlehold prototype.
 * One file of plain JS: state + simulation, actions, DOM rendering, canvas town.
 * Content and tuning live in data.js.
 */
'use strict';
(function () {
  // ======================================================================
  // Helpers
  // ======================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

  function fmt(n) {
    n = Math.floor(n);
    const neg = n < 0;
    n = Math.abs(n);
    let s;
    if (n >= 1e6) s = (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    else if (n >= 1e4) s = (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    else s = String(n);
    return (neg ? '−' : '') + s;
  }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  }
  const fmtTemp = (t) => (Math.round(t) < 0 ? '−' : '') + Math.abs(Math.round(t)) + '°C';
  const perMin = (r) => {
    const v = Math.round(r * 60);
    return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v)) + '/min';
  };
  const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }

  // ======================================================================
  // Lookups
  // ======================================================================
  const HERO = {};
  DATA.heroes.forEach((h) => { HERO[h.id] = h; });
  const PLOT = { hearth: { id: 'hearth', type: 'hearth', unlock: 1 } };
  DATA.plots.forEach((p) => { PLOT[p.id] = p; });
  const PROD = { wood: 'woodcutter', food: 'hunter', coal: 'coalpit', iron: 'ironmine' };
  const TECH_FOR = { wood: 'axes', food: 'traps', coal: 'seams', iron: 'smelt' };
  const RES = ['wood', 'food', 'coal', 'iron'];
  const ICON = { wood: 'i-wood', food: 'i-food', coal: 'i-coal', iron: 'i-iron', starglass: 'i-gem', beacons: 'i-beacon', journals: 'i-journal' };
  const NAME = { wood: 'Wood', food: 'Food', coal: 'Coal', iron: 'Iron', starglass: 'Starglass', beacons: 'Beacon Tokens', journals: 'Field Journals' };
  const SHORT = {
    hearth: 'Hearthwyrm', coalpit: 'Coal Pit', woodcutter: 'Woodcutter', shelter1: 'Shelter', shelter2: 'Shelter',
    infirmary: 'Infirmary', archive: 'Archive', watchtower: 'Watchtower', barracks: 'Barracks', hunter: 'Hunters', ironmine: 'Iron Mine',
  };
  const plotName = (pid) => DATA.buildings[PLOT[pid].type].name + (pid === 'shelter2' ? ' II' : '');

  // ======================================================================
  // State
  // ======================================================================
  let S = null;
  const UI = {
    tab: 'town', sheet: null, pointerDown: false, trainType: 'guard', trainN: 10,
    confirmReset: false, upgradable: new Set(), questTarget: null, battle: null, lastToast: {},
  };

  function newState() {
    const st = DATA.start;
    const s = {
      v: 1, time: 0, savedAt: Date.now(),
      res: { ...st.res }, starglass: st.starglass, beacons: st.beacons, journals: st.journals,
      pop: st.survivors, sick: 0, acc: { sick: 0, heal: 0, lost: 0, arrive: 0, leave: 0 },
      workers: { woodcutter: 0, hunter: 0, coalpit: 0, ironmine: 0 }, autoWork: true,
      lv: { hearth: 0 }, blaze: 'steady', dormant: false,
      builds: [], builders: 1, research: null, tech: {}, training: null,
      troops: { guard: 0, bow: 0, lancer: 0 },
      heroes: {}, squad: [], stewards: {},
      stage: 1, patrolSince: 0,
      quest: 0, pass: { xp: 0, premium: false, free: [], prem: [] },
      pity: 0, firstPull: true,
      stipend: { left: 0, last: -1 },
      skins: { owned: ['hearth'], on: 'hearth' },
      bought: {}, spentUsd: 0,
      wx: [],
      stats: { pulls: 0, trained: 0, researched: 0, upgrades: 0, wins: 0 },
      seenIntro: false,
    };
    DATA.plots.forEach((p) => { s.lv[p.id] = 0; });
    Object.assign(s.lv, st.levels);
    DATA.techs.forEach((t) => { s.tech[t.id] = 0; });
    st.heroes.forEach((id) => { s.heroes[id] = { lvl: 1, stars: 1, shards: 0 }; });
    s.squad = st.heroes.slice(0, 3);
    return s;
  }

  function mergeDefaults(def, saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved === undefined ? def : saved;
    const out = { ...def };
    for (const k of Object.keys(saved)) {
      const d = def[k], v = saved[k];
      out[k] = d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v) ? mergeDefaults(d, v) : v;
    }
    return out;
  }

  function save() {
    if (!S) return;
    S.savedAt = Date.now();
    try { localStorage.setItem(DATA.saveKey, JSON.stringify(S)); } catch (e) { /* storage unavailable: play continues unsaved */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(DATA.saveKey);
      if (raw) return mergeDefaults(newState(), JSON.parse(raw));
    } catch (e) { /* corrupt or blocked storage: start fresh */ }
    return null;
  }

  // ======================================================================
  // Derived values
  // ======================================================================
  const stageOf = (L) => DATA.hearth.stages.filter((s) => L >= s.from).pop() || DATA.hearth.stages[0];
  const blaze = () => DATA.hearth.blaze[S.blaze];
  const slotsOf = (pid) => (S.lv[pid] ? DATA.workerSlots(S.lv[pid]) : 0);
  const housing = () => ['shelter1', 'shelter2'].reduce((a, p) => a + (S.lv[p] ? DATA.buildings.shelter.housing(S.lv[p]) : 0), 0);
  const curWx = () => S.wx.find((w) => w.start <= S.time && S.time < w.end) || S.wx[0] || { type: 'clear', start: 0, end: 0 };
  const forecastRange = () => 90 + 45 * S.lv.watchtower + 30 * (S.tech.horns || 0);
  const heatAt = (L) => Math.round(DATA.hearth.heat(L) * blaze().heat);
  const burnRate = () => DATA.hearth.burn(S.lv.hearth) * blaze().burn;
  const marchCap = () => (S.lv.barracks ? 20 + 20 * S.lv.barracks : 0);
  const troopCap = () => marchCap() * 2;
  const outsideTemp = (wx) => wx.temp - wx.chill * (S.lv.hearth - 1);
  const troopMult = () => (1 + 0.08 * Math.max(0, S.lv.barracks - 1)) * (1 + 0.06 * (S.tech.drills || 0));

  function stewardVal(kind) {
    const id = S.stewards[kind];
    if (!id || !S.heroes[id]) return 0;
    const post = DATA.stewardPosts[kind];
    if (!S.lv[post.plot]) return 0;
    return HERO[id].steward.val * (1 + 0.2 * (S.heroes[id].stars - 1));
  }
  function townTemp(wx) {
    return outsideTemp(wx) + (S.dormant ? 0 : DATA.hearth.heat(S.lv.hearth) * blaze().heat) + 2 * (S.tech.insulation || 0) + stewardVal('heat');
  }
  const comfortOf = (t) => DATA.comfort.find((b) => t >= b.min);
  function workerRate(pid) {
    const L = S.lv[pid];
    if (!L) return 0;
    const b = DATA.buildings[PLOT[pid].type];
    return b.perWorker * (1 + DATA.workerGrowth * (L - 1)) * (1 + 0.12 * (S.tech[TECH_FOR[b.prod]] || 0) + stewardVal(b.prod) / 100);
  }
  function rates(offline) {
    const wx = offline ? DATA.weather.clear : DATA.weather[curWx().type];
    const temp = townTemp(wx);
    const band = comfortOf(temp);
    const healthy = S.pop > 0 ? (S.pop - S.sick) / S.pop : 0;
    const prod = {};
    for (const r of RES) {
      const pid = PROD[r];
      const b = DATA.buildings[PLOT[pid].type];
      const w = Math.min(S.workers[pid] || 0, slotsOf(pid));
      prod[r] = workerRate(pid) * w * healthy * band.prod * (b.outdoor ? wx.outdoor : 1);
    }
    const eat = S.pop * DATA.foodPerSurvivor;
    const burn = S.dormant ? 0 : burnRate();
    const net = { wood: prod.wood, food: prod.food - eat, coal: prod.coal - burn, iron: prod.iron };
    return { wx, temp, band, healthy, prod, eat, burn, net };
  }
  function healRate(temp) {
    const base = temp >= -15 ? DATA.baseRecovery : DATA.baseRecovery * 0.3;
    const inf = S.lv.infirmary ? DATA.infirmaryRate * S.lv.infirmary * (1 + 0.3 * (S.tech.medicine || 0) + stewardVal('heal') / 100) : 0;
    return base + inf;
  }

  // costs
  function buildCost(pid, to) {
    const b = DATA.buildings[PLOT[pid].type];
    const m = Math.pow(b.growth, to - 1);
    const c = {};
    for (const k in b.cost) c[k] = Math.round(b.cost[k] * m);
    if (to >= DATA.ironShareFrom) c.iron = (c.iron || 0) + Math.round((c.wood || 0) * 0.2);
    return c;
  }
  const buildTime = (pid, to) => Math.round(DATA.buildings[PLOT[pid].type].time * Math.pow(DATA.buildTimeGrowth, to - 1));
  function hearthReqs(to) {
    if (to < 2) return [];
    const r = [{ plot: 'coalpit', lvl: to - 1 }, { plot: 'shelter1', lvl: to - 1 }];
    if (to >= 5) r.push({ plot: 'ironmine', lvl: to - 2 });
    return r;
  }
  const maxLevel = () => DATA.hearth.maxLevel;
  function upgradeBlock(pid) {
    const L = S.lv[pid], to = L + 1;
    if (L >= maxLevel()) return 'Max level reached this season.';
    if (pid === 'hearth') {
      for (const r of hearthReqs(to)) if (S.lv[r.plot] < r.lvl) return `Needs ${plotName(r.plot)} Lv ${r.lvl}.`;
    } else {
      if (S.lv.hearth < PLOT[pid].unlock) return `Unlocks at Hearthwyrm Lv ${PLOT[pid].unlock}.`;
      if (to > S.lv.hearth) return `Grow the Hearthwyrm to Lv ${to} first.`;
    }
    if (S.builds.some((b) => b.plot === pid)) return 'Already under construction.';
    return null;
  }
  const canAfford = (c) => Object.entries(c).every(([k, v]) => (k in S.res ? S.res[k] : S[k]) >= v);
  function pay(c) { for (const [k, v] of Object.entries(c)) { if (k in S.res) S.res[k] -= v; else S[k] -= v; } }
  const techCost = (t, lvl) => Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, Math.round(v * Math.pow(DATA.techGrowth, lvl))]));
  const techTime = (t, lvl) => Math.round(t.time * Math.pow(DATA.techTimeGrowth, lvl));
  const techMax = () => Math.min(5, S.lv.archive);

  // heroes + combat
  function heroStats(id) {
    const h = S.heroes[id], r = DATA.rarities[HERO[id].rarity];
    const m = (1 + 0.09 * (h.lvl - 1)) * (1 + 0.15 * (h.stars - 1));
    return { atk: r.atk * m, def: r.def * m, hp: r.hp * m };
  }
  const statPower = (s) => Math.round(s.atk * 2 + s.def * 2 + s.hp / 5);
  const heroPower = (id) => statPower(heroStats(id));
  function unitPower(type) {
    const t = DATA.troops[type], m = troopMult();
    return statPower({ atk: t.atk * m, def: t.def * m, hp: t.hp * m });
  }
  function counterMult(c, e) {
    if (!e) return 1;
    if (DATA.counters[c] === e) return 1.2;
    if (DATA.counters[e] === c) return 0.9;
    return 1;
  }
  function marchTroops() {
    const cap = marchCap(), total = sum(S.troops);
    if (total <= cap) return { ...S.troops };
    const f = cap / total, out = {};
    for (const k in S.troops) out[k] = Math.floor(S.troops[k] * f);
    return out;
  }
  function teamStats(enemyCls) {
    let atk = 0, def = 0, hp = 0;
    const fx = { atk: 0, dr: 0, burst: 0, heal: 0 };
    for (const id of S.squad) {
      if (!S.heroes[id]) continue;
      const s = heroStats(id);
      atk += s.atk * counterMult(HERO[id].cls, enemyCls);
      def += s.def; hp += s.hp;
      for (const [k, v] of Object.entries(HERO[id].skill.fx)) fx[k] += v;
    }
    const m = marchTroops(), um = troopMult();
    for (const type in m) {
      const t = DATA.troops[type];
      atk += m[type] * t.atk * um * counterMult(type, enemyCls);
      def += m[type] * t.def * um; hp += m[type] * t.hp * um;
    }
    atk *= 1 + fx.atk;
    fx.dr = Math.min(fx.dr, 0.4);
    return { atk, def, hp, fx, troops: m };
  }
  function chapterOf(n) { return DATA.chapters.filter((c) => n >= c.from).pop(); }
  function enemyFor(n) {
    const E = DATA.enemy, boss = DATA.bosses[n], ch = chapterOf(n);
    const foe = boss || ch.foes[(n - ch.from) % ch.foes.length];
    const bm = boss ? E.boss : 1;
    return {
      n, name: foe[0], cls: foe[1], boss: !!boss, chapter: ch.name,
      atk: E.atk * Math.pow(E.gAtk, n - 1) * bm, def: E.def * Math.pow(E.gDef, n - 1) * bm, hp: E.hp * Math.pow(E.gHp, n - 1) * bm,
    };
  }
  const stageRewards = (n) => {
    const boss = !!DATA.bosses[n];
    const r = { starglass: boss ? 100 : 25, journals: 5 + 2 * n, wood: 60 * n, food: 40 * n };
    if (boss) r.beacons = 1;
    return r;
  };
  function power() {
    let p = 0;
    for (const pid in S.lv) p += S.lv[pid] * (pid === 'hearth' ? 150 : 40);
    for (const id in S.heroes) p += heroPower(id);
    for (const t in S.troops) p += S.troops[t] * unitPower(t);
    for (const k in S.tech) p += S.tech[k] * 30;
    return p;
  }

  function patrolPreview() {
    const c = S.stage - 1;
    if (c < 1) return null;
    const mins = Math.min((S.time - S.patrolSince) / 60, DATA.patrolCapMinutes);
    const g = {
      journals: Math.floor((2 + 0.5 * c) * mins),
      wood: Math.floor((20 + 10 * c) * mins),
      food: Math.floor((15 + 8 * c) * mins),
      coal: Math.floor((10 + 6 * c) * mins),
    };
    if (c >= 3) g.iron = Math.floor(3 * c * mins);
    const sg = Math.floor(mins / 5) * (1 + Math.floor(c / 10));
    if (sg) g.starglass = sg;
    return { mins, g };
  }

  const passTier = () => Math.min(DATA.pass.tiers.length, Math.floor(S.pass.xp / DATA.pass.xpPerTier));
  const addPassXp = (n) => { S.pass.xp = Math.min(S.pass.xp + n, DATA.pass.tiers.length * DATA.pass.xpPerTier); };
  const today = () => Math.floor(Date.now() / 864e5);

  function grant(g) {
    for (const [k, v] of Object.entries(g)) {
      if (k in S.res) S.res[k] += v;
      else if (k === 'starglass' || k === 'beacons' || k === 'journals') S[k] += v;
      else if (k === 'builder2') S.builders = Math.max(S.builders, 2);
      else if (k === 'stipend') S.stipend.left += v;
      else if (k === 'ledger') S.pass.premium = true;
      else if (k === 'skin' && !S.skins.owned.includes(v)) S.skins.owned.push(v);
    }
  }
  function rewardHTML(g) {
    return Object.entries(g).map(([k, v]) => {
      if (ICON[k]) return `<span class="chip">${icon(ICON[k])}${fmt(v)}</span>`;
      if (k === 'builder2') return `<span class="chip">${icon('i-hammer')}2nd builder</span>`;
      if (k === 'stipend') return `<span class="chip">${icon('i-gem')}90/day × ${v}</span>`;
      if (k === 'ledger') return `<span class="chip">${icon('i-journal')}Premium track</span>`;
      if (k === 'skin') return `<span class="chip">${icon('i-beacon')}${esc(DATA.skins[v].name)}</span>`;
      return '';
    }).join(' ');
  }
  function costHTML(c, mult = 1) {
    return `<div class="costs">${Object.entries(c).map(([k, v]) => {
      const need = v * mult, have = k in S.res ? S.res[k] : S[k];
      return `<span class="cost ${have < need ? 'short' : ''}">${icon(ICON[k])}${fmt(need)}</span>`;
    }).join('')}</div>`;
  }

  // ======================================================================
  // Workers
  // ======================================================================
  function autoAssign() {
    const w = { woodcutter: 0, hunter: 0, coalpit: 0, ironmine: 0 };
    let pool = S.pop;
    const give = (pid, n) => {
      const k = Math.max(0, Math.min(n, slotsOf(pid) - w[pid], pool));
      w[pid] += k; pool -= k;
    };
    const per = (pid) => Math.max(workerRate(pid), 1e-4);
    if (S.lv.coalpit) give('coalpit', Math.ceil((burnRate() * 1.2) / per('coalpit')));
    if (S.lv.hunter) give('hunter', Math.ceil((S.pop * DATA.foodPerSurvivor * 1.15) / per('hunter')));
    const order = ['woodcutter', 'coalpit', 'hunter', 'ironmine'];
    let moved = true;
    while (pool > 0 && moved) {
      moved = false;
      for (const pid of order) {
        if (pool > 0 && w[pid] < slotsOf(pid)) { w[pid]++; pool--; moved = true; }
      }
    }
    S.workers = w;
  }
  function fixWorkers() {
    if (S.autoWork) return autoAssign();
    let over = sum(S.workers) - S.pop;
    while (over > 0) {
      const pid = Object.keys(S.workers).sort((a, b) => S.workers[b] - S.workers[a])[0];
      S.workers[pid]--; over--;
    }
  }

  // ======================================================================
  // Weather
  // ======================================================================
  function nextWeather(prev) {
    let type = 'clear';
    if (prev.type === 'clear') {
      const r = Math.random();
      if (prev.end < 150) type = 'snow';
      else if (r < 0.42) type = 'snow';
      else if (S.lv.hearth >= 5 && prev.end > 600 && r > 0.84) type = 'deepfreeze';
      else type = 'blizzard';
    }
    const dur = { clear: [60, 110], snow: [30, 50], blizzard: [35, 55], deepfreeze: [30, 45] }[type];
    return { type, start: prev.end, end: prev.end + Math.round(rand(dur[0], dur[1])) };
  }
  function ensureWeather() {
    if (!S.wx.length) S.wx.push({ type: 'clear', start: S.time, end: S.time + Math.round(rand(70, 100)) });
    while (S.wx.length > 1 && S.wx[0].end <= S.time) S.wx.shift();
    if (S.wx[0].end <= S.time) S.wx = [{ type: 'clear', start: S.time, end: S.time + 80 }];
    while (S.wx[S.wx.length - 1].end < S.time + 900) S.wx.push(nextWeather(S.wx[S.wx.length - 1]));
  }

  // ======================================================================
  // Simulation
  // ======================================================================
  function tick(dt, offline = false, log = null) {
    S.time += dt;
    ensureWeather();
    const eff = offline ? DATA.offline.efficiency : 1;
    const R = rates(offline);

    for (const r of RES) {
      const before = S.res[r];
      S.res[r] = Math.max(0, S.res[r] + R.net[r] * dt * eff);
      if (log) log[r] = (log[r] || 0) + (S.res[r] - before);
    }

    if (!S.dormant && S.res.coal <= 0) {
      S.dormant = true;
      if (!offline) toast('The Hearthwyrm has gone dormant. Get coal flowing or the hold will freeze.', 'warn', 'dormant', 20);
    } else if (S.dormant && S.res.coal >= 20) {
      S.dormant = false;
      if (!offline) toast('The Hearthwyrm stirs awake.', 'good', 'wake', 20);
    }

    let popChanged = false;
    if (!offline) {
      const healthyN = S.pop - S.sick;
      if (R.band.sick > 0 && healthyN > 0) {
        S.acc.sick += healthyN * R.band.sick * dt;
        let n = 0;
        while (S.acc.sick >= 1 && S.sick < S.pop) { S.sick++; S.acc.sick -= 1; n++; }
        if (n) toast('Survivors are falling ill from the cold. Stoke the wyrm or build an Infirmary.', 'cold', 'sick', 25);
      } else S.acc.sick = Math.max(0, S.acc.sick - dt * 0.05);

      if (R.band.lost > 0 && S.sick > 0) {
        S.acc.lost += S.sick * R.band.lost * dt;
        while (S.acc.lost >= 1 && S.sick > 0) {
          S.sick--; S.pop--; S.acc.lost -= 1; popChanged = true;
          toast('A survivor was lost to the frost.', 'warn', 'lost', 8);
        }
      }
      if (S.res.food <= 0 && R.net.food < 0 && S.pop > 1) {
        S.acc.leave += dt / 10;
        while (S.acc.leave >= 1 && S.pop > 1) {
          S.acc.leave -= 1; S.pop--; S.sick = Math.min(S.sick, S.pop); popChanged = true;
          toast('The stores are empty. A family left to find food elsewhere.', 'warn', 'leave', 12);
        }
      } else S.acc.leave = 0;
    }

    if (S.sick > 0) {
      S.acc.heal += S.sick * healRate(R.temp) * dt;
      while (S.acc.heal >= 1 && S.sick > 0) {
        S.sick--; S.acc.heal -= 1;
        if (log) log.healed = (log.healed || 0) + 1;
      }
    } else S.acc.heal = 0;

    const cap = housing();
    if (S.pop < cap && S.res.food > 1 && R.band.name !== 'Freezing') {
      S.acc.arrive += dt / (DATA.arrivalEvery / (1 + 0.15 * (S.lv.hearth - 1)));
      while (S.acc.arrive >= 1 && S.pop < cap) {
        S.pop++; S.acc.arrive -= 1; popChanged = true;
        if (log) log.arrived = (log.arrived || 0) + 1;
      }
      if (S.pop >= cap && !offline) toast('Every shelter is full. Upgrade a Hide Shelter to take in more survivors.', '', 'full', 120);
    }
    if (popChanged) fixWorkers();

    for (const b of S.builds.slice()) if (S.time >= b.end) finishBuild(b, offline, log);
    if (S.research && S.time >= S.research.end) finishResearch(offline, log);
    if (S.training && S.time >= S.training.end) finishTraining(offline, log);

    if (!offline) announceWeather();
  }

  function announceWeather() {
    const range = forecastRange();
    for (const w of S.wx) {
      if (w.type !== 'blizzard' && w.type !== 'deepfreeze') continue;
      const name = DATA.weather[w.type].name;
      if (!w.seen && w.start - S.time <= range && w.start > S.time) {
        w.seen = true;
        toast(`${name} sighted, arriving in ${fmtTime(w.start - S.time)}. Set the Hearthwyrm to Roaring before it hits.`, 'cold');
      }
      if (!w.began && S.time >= w.start && S.time < w.end) {
        w.began = true; w.seen = true;
        toast(`${name}! Outdoor work slows. Keep the wyrm roaring.`, 'cold');
      }
    }
  }

  function finishBuild(b, offline, log) {
    S.builds = S.builds.filter((x) => x !== b);
    const prevStage = stageOf(S.lv.hearth).name;
    S.lv[b.plot] = b.to;
    S.stats.upgrades++;
    addPassXp(DATA.passXp.upgrade);
    if (log) (log.built = log.built || []).push(`${plotName(b.plot)} Lv ${b.to}`);
    fixWorkers();
    if (offline) return;
    UI.floaters.push({ plot: b.plot, text: b.to === 1 ? 'Built!' : `Lv ${b.to}!`, t0: performance.now() });
    if (b.plot === 'hearth') {
      const st = stageOf(S.lv.hearth).name;
      if (st !== prevStage) toast(`Your Hearthwyrm has grown into a ${st}! New buildings unlocked.`, 'good');
      else toast(`The Hearthwyrm reached Lv ${b.to}. Its warmth reaches further.`, 'good');
    } else toast(`${plotName(b.plot)} ${b.to === 1 ? 'built' : `reached Lv ${b.to}`}.`, 'good');
  }
  function finishResearch(offline, log) {
    const r = S.research;
    S.tech[r.tech] = r.to;
    S.research = null;
    S.stats.researched++;
    addPassXp(DATA.passXp.research);
    const t = DATA.techs.find((x) => x.id === r.tech);
    if (log) (log.built = log.built || []).push(`${t.name} ${r.to}`);
    if (!offline) toast(`Research complete: ${t.name} ${r.to}.`, 'good');
  }
  function finishTraining(offline, log) {
    const tr = S.training;
    S.troops[tr.type] += tr.n;
    S.stats.trained += tr.n;
    addPassXp(Math.floor(tr.n / 10) * DATA.passXp.train10);
    S.training = null;
    if (log) (log.built = log.built || []).push(`${tr.n} ${DATA.troops[tr.type].name}`);
    if (!offline) toast(`${tr.n} ${DATA.troops[tr.type].name} ready for the march.`, 'good');
  }

  function catchUp(seconds) {
    const capped = Math.min(seconds, DATA.offline.capSeconds);
    const log = {};
    S.wx = [];
    let left = capped;
    while (left > 0) {
      const dt = Math.min(1, left);
      tick(dt, true, log);
      left -= dt;
    }
    S.wx = [];
    ensureWeather();
    return { seconds, capped, log };
  }

  // ======================================================================
  // Actions (invoked from data-act attributes)
  // ======================================================================
  const ACT = {};

  ACT.tab = (tab) => {
    UI.tab = tab;
    UI.sheet = null;
    const panel = $('#panel');
    panel.hidden = tab === 'town';
    panel.scrollTop = 0;
    panel._h = null;
  };
  ACT.close = () => {
    if (UI.sheet && UI.sheet.kind === 'intro') S.seenIntro = true;
    UI.sheet = null;
    UI.confirmReset = false;
  };
  ACT.plot = (pid) => {
    if (UI.tab !== 'town') ACT.tab('town');
    UI.sheet = { kind: 'plot', pid };
  };
  ACT.forecast = () => { UI.sheet = { kind: 'forecast' }; };
  ACT.settings = () => { UI.sheet = { kind: 'settings' }; };
  ACT.hero = (id) => { UI.sheet = { kind: 'hero', id }; };
  ACT.odds = () => { UI.sheet = { kind: 'odds' }; };

  ACT.build = (pid) => {
    const why = upgradeBlock(pid);
    if (why) return toast(why, 'warn');
    if (S.builds.length >= S.builders) return toast(S.builders < 2 ? "Your builder is busy. The Founder's Cache adds a second builder." : 'Both builders are busy.', 'warn');
    const to = S.lv[pid] + 1, cost = buildCost(pid, to);
    if (!canAfford(cost)) return toast('Not enough resources yet.', 'warn');
    pay(cost);
    S.builds.push({ plot: pid, to, start: S.time, end: S.time + buildTime(pid, to) });
  };
  function speedCost(end) {
    const left = end - S.time;
    return left <= DATA.freeFinishSeconds ? 0 : Math.ceil(left / DATA.speedupSecondsPerStarglass);
  }
  ACT.speed = (arg) => {
    const job = arg === 'research' ? S.research : arg === 'training' ? S.training : S.builds.find((b) => b.plot === arg);
    if (!job) return;
    const c = speedCost(job.end);
    if (S.starglass < c) return toast('Not enough Starglass.', 'warn');
    S.starglass -= c;
    job.end = S.time;
    tick(0);
  };
  ACT.blaze = (b) => {
    S.blaze = b;
    if (S.autoWork) autoAssign();
  };
  ACT.work = (arg) => {
    const [pid, d] = arg.split(':');
    const delta = Number(d);
    const idle = S.pop - sum(S.workers);
    if (delta > 0 && idle <= 0) return toast('No idle survivors. Take workers from another building.', 'warn');
    S.autoWork = false;
    S.workers[pid] = clamp(S.workers[pid] + delta, 0, slotsOf(pid));
  };
  ACT.autowork = () => {
    S.autoWork = !S.autoWork;
    if (S.autoWork) autoAssign();
  };
  ACT.skin = (id) => {
    if (S.skins.owned.includes(id)) { S.skins.on = id; return toast(`${DATA.skins[id].name} equipped.`, 'good'); }
    const sk = DATA.skins[id];
    if (sk.starglass) {
      if (S.starglass < sk.starglass) return toast('Not enough Starglass.', 'warn');
      S.starglass -= sk.starglass;
      S.skins.owned.push(id); S.skins.on = id;
      return toast(`${sk.name} unlocked and equipped.`, 'good');
    }
    UI.sheet = { kind: 'buy', skin: id };
  };

  ACT.research = (id) => {
    if (S.research) return toast('The scholars are already busy.', 'warn');
    const t = DATA.techs.find((x) => x.id === id), lvl = S.tech[id];
    if (lvl >= techMax()) return toast(lvl >= 5 ? 'Fully researched.' : 'Upgrade the Archive to research further.', 'warn');
    const c = techCost(t, lvl);
    if (!canAfford(c)) return toast('Not enough resources yet.', 'warn');
    pay(c);
    S.research = { tech: id, to: lvl + 1, start: S.time, end: S.time + techTime(t, lvl) };
  };

  const batchMax = () => 10 * S.lv.barracks;
  const trainTime = (n) => (n * DATA.trainSecondsPerUnit) / (1 + 0.15 * (S.lv.barracks - 1)) / (1 + stewardVal('train') / 100);
  ACT.ttype = (type) => {
    if (DATA.troops[type].needs && !S.lv[DATA.troops[type].needs]) return toast('Sled Lancers need iron. Build the Iron Mine first.', 'warn');
    UI.trainType = type;
  };
  ACT.tn = (d) => {
    if (d === 'max') {
      const c = DATA.troops[UI.trainType].cost;
      let n = Math.min(batchMax(), troopCap() - sum(S.troops));
      for (const [k, v] of Object.entries(c)) n = Math.min(n, Math.floor(S.res[k] / v));
      UI.trainN = Math.max(1, n);
    } else UI.trainN = clamp(UI.trainN + Number(d), 1, batchMax());
  };
  ACT.train = () => {
    if (S.training) return toast('The barracks is already training.', 'warn');
    const type = UI.trainType, t = DATA.troops[type];
    if (t.needs && !S.lv[t.needs]) return toast('Build the Iron Mine first.', 'warn');
    const room = troopCap() - sum(S.troops);
    if (room <= 0) return toast('The barracks is full. Upgrade it to house more troops.', 'warn');
    const n = clamp(UI.trainN, 1, Math.min(batchMax(), room));
    const c = Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, v * n]));
    if (!canAfford(c)) return toast('Not enough resources for that many.', 'warn');
    pay(c);
    S.training = { type, n, start: S.time, end: S.time + trainTime(n) };
  };

  ACT.lvl = (arg) => {
    const [id, mode] = arg.split(':');
    const h = S.heroes[id], cap = DATA.heroLevelCapPerStar * h.stars;
    if (h.lvl >= cap) return toast(h.stars >= DATA.heroMaxStars ? 'This hero is at max level.' : 'Level cap reached. Add a star to raise it.', 'warn');
    let n = 0;
    do {
      const c = 2 * h.lvl;
      if (S.journals < c) break;
      S.journals -= c; h.lvl++; n++;
    } while (mode === 'max' && h.lvl < cap);
    if (!n) toast('Not enough Field Journals. Expeditions and patrols bring more.', 'warn');
  };
  ACT.star = (id) => {
    const h = S.heroes[id], need = 10 * h.stars;
    if (h.stars >= DATA.heroMaxStars) return;
    if (h.shards < need) return toast(`Needs ${need} shards. Duplicate recruits give ${DATA.shardsPerDupe}.`, 'warn');
    h.shards -= need; h.stars++;
    toast(`${HERO[id].name} reached ${h.stars} stars.`, 'good');
  };
  ACT.squad = (id) => {
    const i = S.squad.indexOf(id);
    if (i >= 0) {
      if (S.squad.length === 1) return toast('The squad needs at least one hero.', 'warn');
      S.squad.splice(i, 1);
    } else if (S.squad.length >= 3) return toast('The squad is full. Remove a hero first.', 'warn');
    else S.squad.push(id);
  };
  ACT.station = (id) => {
    const kind = HERO[id].steward.kind, post = DATA.stewardPosts[kind];
    if (!S.lv[post.plot]) return toast(`Build the ${plotName(post.plot)} first.`, 'warn');
    if (S.stewards[kind] === id) delete S.stewards[kind];
    else S.stewards[kind] = id;
    if (S.autoWork) autoAssign();
  };

  ACT.claimquest = () => {
    const q = DATA.quests[S.quest];
    if (!q || !q.check(S)) return;
    grant(q.reward);
    addPassXp(DATA.questPassXp);
    S.quest++;
    toast('Quest complete. Rewards collected.', 'good');
  };
  ACT.go = (target) => {
    const [kind, arg] = target.split(':');
    if (kind === 'plot') ACT.plot(arg);
    else ACT.tab(arg);
  };

  ACT.patrol = () => {
    const p = patrolPreview();
    if (!p) return;
    if (p.mins < 1) return toast('The patrol cache is still filling.', 'warn');
    grant(p.g);
    S.patrolSince = S.time;
    toast('Patrol cache collected.', 'good');
  };

  ACT.fight = () => {
    if (S.stage > DATA.maxStage) return;
    if (!S.squad.length) return toast('Pick at least one hero for the squad.', 'warn');
    const foe = enemyFor(S.stage), team = teamStats(foe.cls);
    const result = simulateBattle(team, foe);
    let rewards = null;
    if (result.win) {
      rewards = stageRewards(foe.n);
      grant(rewards);
      if (S.stage === 1) S.patrolSince = S.time;
      S.stage++;
      S.stats.wins++;
      addPassXp(DATA.passXp.stage);
    }
    startBattleAnim({ foe, team, result, rewards });
  };

  ACT.pull = (n) => {
    n = Number(n);
    const tokens = n, sg = n === 1 ? DATA.recruit.singleCost : DATA.recruit.tenCost;
    if (S.beacons >= tokens) S.beacons -= tokens;
    else if (S.starglass >= sg) S.starglass -= sg;
    else return toast('Not enough Beacon Tokens or Starglass.', 'warn');
    const results = [];
    let gotEpic = false;
    for (let i = 0; i < n; i++) {
      const r = pullOne(n === 10 && i === 9 && !gotEpic);
      if (r.rarity !== 'rare') gotEpic = true;
      results.push(r);
    }
    S.stats.pulls += n;
    addPassXp(DATA.passXp.pull * n);
    UI.sheet = { kind: 'results', results };
  };
  function pullOne(minEpic) {
    let id;
    S.pity++;
    if (S.firstPull) {
      S.firstPull = false;
      id = DATA.recruit.firstPull;
    } else {
      const o = DATA.recruit.odds;
      let rarity;
      if (S.pity >= DATA.recruit.pity) rarity = 'legendary';
      else {
        const x = Math.random();
        rarity = x < o.legendary ? 'legendary' : x < o.legendary + o.epic ? 'epic' : 'rare';
      }
      if (minEpic && rarity === 'rare') rarity = 'epic';
      const pool = DATA.heroes.filter((h) => h.rarity === rarity).map((h) => h.id);
      id = rarity === 'legendary' && Math.random() < DATA.recruit.featuredShare ? DATA.recruit.featured : pick(pool);
    }
    if (HERO[id].rarity === 'legendary') S.pity = 0;
    const isNew = !S.heroes[id];
    if (isNew) {
      S.heroes[id] = { lvl: 1, stars: 1, shards: 0 };
      if (S.squad.length < 3) S.squad.push(id);
    } else S.heroes[id].shards += DATA.shardsPerDupe;
    return { id, rarity: HERO[id].rarity, isNew };
  }

  ACT.passclaim = (arg) => {
    const [track, i] = [arg.split(':')[0], Number(arg.split(':')[1])];
    if (passTier() <= i) return toast('Earn more Ledger XP to reach this tier.', 'warn');
    if (track === 'prem' && !S.pass.premium) { UI.sheet = { kind: 'buy', id: 'ledger' }; return; }
    if (S.pass[track].includes(i)) return;
    S.pass[track].push(i);
    grant(DATA.pass.tiers[i][track === 'free' ? 0 : 1]);
    toast('Ledger reward collected.', 'good');
  };
  ACT.buy = (id) => {
    const item = DATA.shop.find((x) => x.id === id);
    if (item.once && S.bought[id]) return toast('Already purchased.', 'warn');
    UI.sheet = { kind: 'buy', id };
  };
  ACT.confirmbuy = () => {
    const sh = UI.sheet;
    if (!sh || sh.kind !== 'buy') return;
    if (sh.skin) {
      const sk = DATA.skins[sh.skin];
      if (!S.skins.owned.includes(sh.skin)) S.skins.owned.push(sh.skin);
      S.skins.on = sh.skin;
      S.spentUsd += sk.usd;
      toast(`${sk.name} unlocked and equipped. (Simulated purchase)`, 'good');
    } else {
      const item = DATA.shop.find((x) => x.id === sh.id);
      grant(item.grants);
      S.bought[item.id] = (S.bought[item.id] || 0) + 1;
      S.spentUsd += item.usd;
      toast(`${item.name} delivered. (Simulated purchase)`, 'good');
    }
    UI.sheet = null;
  };
  ACT.stipend = () => {
    if (S.stipend.left <= 0 || S.stipend.last === today()) return;
    S.stipend.left--; S.stipend.last = today();
    S.starglass += 90;
    toast("Today's Ember Stipend: 90 Starglass.", 'good');
  };
  ACT.crate = (res) => {
    if (S.starglass < DATA.crateCost) return toast('Not enough Starglass.', 'warn');
    S.starglass -= DATA.crateCost;
    const n = DATA.crateSize(res, S.lv.hearth);
    S.res[res] += n;
    toast(`+${fmt(n)} ${NAME[res]}.`, 'good');
  };

  ACT.reset = () => { UI.confirmReset = true; };
  ACT.resetno = () => { UI.confirmReset = false; };
  ACT.resetyes = () => {
    try { localStorage.removeItem(DATA.saveKey); } catch (e) { /* ignore */ }
    S = newState();
    autoAssign();
    ensureWeather();
    UI.confirmReset = false;
    ACT.tab('town');
    UI.sheet = { kind: 'intro' };
  };

  ACT.bskip = () => finishBattleAnim();
  ACT.bclose = () => {
    UI.battle = null;
    $('#battle').hidden = true;
  };

  // ======================================================================
  // Battle
  // ======================================================================
  const dmgOf = (a, d) => (a * 3 * a) / (a + d);
  function simulateBattle(team, foe) {
    let th = team.hp, eh = foe.hp;
    const rounds = [];
    for (let r = 1; r <= DATA.maxRounds; r++) {
      const ours = dmgOf(team.atk, foe.def) * (r === 1 ? 1 + team.fx.burst : 1) * rand(0.92, 1.08);
      eh = Math.max(0, eh - ours);
      if (eh <= 0) { rounds.push({ ours, theirs: 0, th, eh }); return { win: true, rounds }; }
      const theirs = dmgOf(foe.atk, team.def) * (1 - team.fx.dr) * rand(0.92, 1.08);
      th = Math.max(0, th - theirs);
      if (th > 0) th = Math.min(team.hp, th + team.fx.heal * team.hp);
      rounds.push({ ours, theirs, th, eh });
      if (th <= 0) return { win: false, rounds };
    }
    return { win: false, rounds, timeout: true };
  }

  function foeArt(foe) {
    const col = { guard: '#6b8fb8', bow: '#8a7bd0', lancer: '#4fa9c0' }[foe.cls];
    const eye = foe.boss ? '#ff6a3c' : '#bff4ff';
    return `<svg class="b-enemy" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="66" r="46" fill="${col}" opacity=".12"/>
      <path d="M22 60 L30 18 L44 46 L56 8 L68 44 L84 16 L98 60 Z" fill="#d9f0ff" opacity=".85"/>
      <ellipse cx="60" cy="72" rx="38" ry="34" fill="${col}"/>
      <ellipse cx="60" cy="80" rx="26" ry="20" fill="#0b1320" opacity=".35"/>
      <ellipse cx="45" cy="66" rx="9" ry="6" fill="${eye}" opacity=".35"/><ellipse cx="75" cy="66" rx="9" ry="6" fill="${eye}" opacity=".35"/>
      <ellipse cx="45" cy="66" rx="5.5" ry="3.2" fill="${eye}"/><ellipse cx="75" cy="66" rx="5.5" ry="3.2" fill="${eye}"/>
      <path d="M42 84 L47 92 L52 84 L57 93 L62 84 L67 93 L72 84 L77 91 L80 84 Z" fill="#eef7ff"/>
      ${foe.boss ? '<path d="M38 30 L44 40 L50 28 L56 40 L60 24 L64 40 L70 28 L76 40 L82 30 L80 44 L40 44 Z" fill="#ffcf6e"/>' : ''}
    </svg>`;
  }

  function startBattleAnim(b) {
    UI.battle = { ...b, i: 0, timer: null };
    const el = $('#battle');
    const foe = b.foe;
    el.innerHTML = `
      <div class="b-title"><span class="stage-num">Stage ${foe.n} · ${esc(foe.chapter)}</span><h2>${esc(foe.name)}</h2></div>
      <div class="b-field">
        <div class="b-side" id="b-foe">${foeArt(foe)}
          <div class="b-hp"><div class="lbl"><span>${esc(foe.name)}</span><span id="b-eh">${fmt(foe.hp)}</span></div><div class="bar foe"><i id="b-ehb" style="width:100%"></i></div></div>
        </div>
        <div class="b-log" id="b-log">Your squad marches out into the snow…</div>
        <div class="b-side" id="b-us">
          <div class="squad">${S.squad.map((id) => `<div class="slot">${portrait(id)}</div>`).join('')}</div>
          <div class="b-hp"><div class="lbl"><span>Your squad · ${fmt(sum(b.team.troops))} troops</span><span id="b-th">${fmt(b.team.hp)}</span></div><div class="bar"><i id="b-thb" style="width:100%"></i></div></div>
        </div>
      </div>
      <div id="b-foot"><button class="btn alt wide" data-act="bskip">Skip</button></div>`;
    el.hidden = false;
    const step = () => {
      const B = UI.battle;
      if (!B) return;
      const r = B.result.rounds[B.i];
      if (!r) return finishBattleAnim();
      $('#b-ehb').style.width = `${(r.eh / B.foe.hp) * 100}%`;
      $('#b-eh').textContent = fmt(r.eh);
      floaty('#b-foe', `−${fmt(r.ours)}`, '');
      $('#b-log').textContent = B.i === 0 && B.team.fx.burst ? 'Opening charge!' : `Round ${B.i + 1}`;
      B.timer = setTimeout(() => {
        if (!UI.battle) return;
        if (r.theirs) {
          $('#b-thb').style.width = `${(r.th / B.team.hp) * 100}%`;
          $('#b-th').textContent = fmt(r.th);
          floaty('#b-us', `−${fmt(r.theirs)}`, 'hurt');
        }
        B.i++;
        B.timer = setTimeout(step, 380);
      }, 380);
    };
    UI.battle.timer = setTimeout(step, 700);
  }
  function floaty(sel, text, cls) {
    const host = $(sel);
    if (!host) return;
    const f = document.createElement('div');
    f.className = `floaty ${cls}`;
    f.textContent = text;
    host.appendChild(f);
    host.classList.remove('shake'); void host.offsetWidth; host.classList.add('shake');
    setTimeout(() => f.remove(), 800);
  }
  function finishBattleAnim() {
    const B = UI.battle;
    if (!B) return;
    clearTimeout(B.timer);
    const last = B.result.rounds[B.result.rounds.length - 1];
    $('#b-ehb').style.width = `${(last.eh / B.foe.hp) * 100}%`;
    $('#b-eh').textContent = fmt(last.eh);
    $('#b-thb').style.width = `${(last.th / B.team.hp) * 100}%`;
    $('#b-th').textContent = fmt(last.th);
    const win = B.result.win;
    $('#b-log').textContent = win ? `${B.foe.name} defeated in ${B.result.rounds.length} rounds.` : B.result.timeout ? 'The squad could not break through in time.' : 'The squad falls back to the hold.';
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === B.foe.cls);
    const tips = win ? '' : `<p class="muted small">Level your heroes, train more troops, or bring a ${DATA.classes[counter].name} hero: they hit ${B.foe.name} 20% harder.</p>`;
    $('#b-foot').innerHTML = `<div class="b-result">
      <h2 class="${win ? 'win' : 'lose'}">${win ? 'Victory' : 'Defeat'}</h2>
      ${B.rewards ? `<div class="costs">${rewardHTML(B.rewards)}</div>` : ''}${tips}
      <button class="btn wide" data-act="bclose">Continue</button></div>`;
    UI.battle = { ...B, done: true, timer: null };
  }

  // ======================================================================
  // Portraits
  // ======================================================================
  const SKIN_TONES = ['#f2cba8', '#d9a47c', '#b07850', '#7d4e33', '#e9bc95', '#c48a62'];
  const RAR_BG = { rare: ['#132a45', '#2c5d8f'], epic: ['#221840', '#5b3d92'], legendary: ['#33230a', '#9a6d1c'] };
  const BEARDS = { bram: '#3b2a1d', gunnar: '#a8682e', ondrak: '#d9d2c4', oskar: '#6b4a2e' };
  function portrait(id) {
    const d = HERO[id], i = DATA.heroes.indexOf(d);
    const [bg1, bg2] = RAR_BG[d.rarity];
    const skin = SKIN_TONES[(i * 5) % SKIN_TONES.length];
    const cloak = `hsl(${d.hue} 38% 34%)`, cloakD = `hsl(${d.hue} 40% 20%)`, accent = `hsl(${d.hue} 75% 64%)`;
    let gear = '';
    if (d.cls === 'guard') {
      gear = `<path d="M33 52 C33 27 67 27 67 52 Z" fill="#9aa6b2"/><path d="M37 40 C42 31 58 31 63 40" stroke="#c9d2dc" stroke-width="2" fill="none"/>
        <rect x="31" y="47" width="38" height="6" rx="3" fill="#7c8794"/><rect x="48.5" y="47" width="3" height="13" fill="#7c8794"/>
        <path d="M50 26 C56 16 66 16 70 20 C62 20 56 24 52 30 Z" fill="${accent}"/>`;
    } else if (d.cls === 'bow') {
      gear = `<path d="M29 64 C26 36 38 22 50 20 C62 22 74 36 71 64 C67 50 62 41 50 39 C38 41 33 50 29 64 Z" fill="${cloak}"/>
        <path d="M50 20 C62 22 74 36 71 64 C69 54 66 46 60 41 Z" fill="${cloakD}" opacity=".7"/>`;
    } else {
      gear = `<path d="M34 40 C34 22 66 22 66 40 Z" fill="${cloakD}"/><ellipse cx="50" cy="40" rx="20" ry="7" fill="#e3d9c6"/>
        <rect x="37" y="42" width="26" height="7" rx="3.5" fill="#2a3440"/><circle cx="44" cy="45.5" r="3" fill="${accent}" opacity=".85"/><circle cx="56" cy="45.5" r="3" fill="${accent}" opacity=".85"/>`;
    }
    const eyes = d.cls === 'lancer' ? '' : (id === 'mireille'
      ? '<circle cx="44" cy="54" r="1.9" fill="#1b1410"/><ellipse cx="56" cy="54" rx="4.6" ry="3.6" fill="#1b1410"/><path d="M36 50 L64 57" stroke="#1b1410" stroke-width="1.4"/>'
      : '<circle cx="44" cy="54" r="1.9" fill="#1b1410"/><circle cx="56" cy="54" r="1.9" fill="#1b1410"/>');
    const beard = BEARDS[id] ? `<path d="M37 57 C38 77 62 77 63 57 C58 64 42 64 37 57 Z" fill="${BEARDS[id]}"/>` : '<path d="M45.5 63 Q50 66 54.5 63" stroke="#6b3b2a" stroke-width="1.5" fill="none"/>';
    return `<svg class="portrait" viewBox="0 0 100 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="100" height="110" fill="${bg1}"/><circle cx="50" cy="42" r="48" fill="${bg2}" opacity=".55"/>
      <circle cx="18" cy="20" r="1.3" fill="#fff" opacity=".4"/><circle cx="84" cy="30" r="1" fill="#fff" opacity=".4"/><circle cx="76" cy="12" r="1.5" fill="#fff" opacity=".3"/>
      <path d="M6 110 C9 84 28 73 50 73 C72 73 91 84 94 110 Z" fill="${cloak}"/>
      <path d="M50 73 C72 73 91 84 94 110 L62 110 Z" fill="${cloakD}" opacity=".6"/>
      <rect x="44" y="62" width="12" height="14" fill="${skin}"/>
      <ellipse cx="50" cy="53" rx="14" ry="17" fill="${skin}"/>
      ${eyes}${beard}${gear}
      <path d="M23 84 C33 71 67 71 77 84 C69 92 31 92 23 84 Z" fill="#ebe4d8"/>
      <path d="M30 86 C38 90 62 90 70 86" stroke="#cfc6b6" stroke-width="1.5" fill="none"/>
    </svg>`;
  }
  const starsHTML = (n) => `<span class="stars">${Array.from({ length: DATA.heroMaxStars }, (_, i) => icon('i-star', i < n ? '' : 'off')).join('')}</span>`;

  // ======================================================================
  // Rendering: DOM
  // ======================================================================
  function setHTML(el, html, force) {
    if (!el || el._h === html) return;
    if (UI.pointerDown && !force) return;
    const scroller = el.querySelector('.sheet-body');
    const keep = scroller ? scroller.scrollTop : 0;
    el.innerHTML = html;
    el._h = html;
    const s2 = el.querySelector('.sheet-body');
    if (s2) s2.scrollTop = keep;
  }

  function renderHUD(R) {
    $('#hud-power').textContent = fmt(power());
    setHTML($('#hud-wyrm'), `<b>Lv ${S.lv.hearth}</b><span>${stageOf(S.lv.hearth).name}</span>`);
    $('#hud-starglass').textContent = fmt(S.starglass);
    $('#hud-beacons').textContent = fmt(S.beacons);
    setHTML($('#hud-res'), RES.map((r) => {
      const locked = r === 'iron' && !S.lv.ironmine && S.res.iron < 1;
      const net = R.net[r];
      return `<div class="res ${locked ? 'locked' : ''}" title="${NAME[r]}">${icon(ICON[r])}<div><b>${fmt(S.res[r])}</b><small class="${net < -0.004 ? 'neg' : ''}">${locked ? 'Locked' : perMin(net)}</small></div></div>`;
    }).join(''));
    const band = R.band, cls = band.name.toLowerCase();
    const w = curWx(), range = forecastRange();
    let next;
    if (w.type !== 'clear') next = `${icon('i-snow')}<span>${esc(DATA.weather[w.type].name)}</span> <b>${fmtTime(w.end - S.time)} left</b>`;
    else {
      const sev = S.wx.find((x) => x.start > S.time && (x.type === 'blizzard' || x.type === 'deepfreeze') && x.start - S.time <= range);
      next = sev ? `${icon('i-snow')}<span>${DATA.weather[sev.type].name}</span> <b>${fmtTime(sev.start - S.time)}</b>` : `<span>Clear skies ahead</span>`;
    }
    const warn = w.type === 'blizzard' || w.type === 'deepfreeze' || next.includes('i-snow');
    setHTML($('#hud-climate'), `<span class="temp t-${cls}">${icon('i-temp')}${fmtTemp(R.temp)}</span><span class="band t-${cls}">${band.name}</span>
      <span class="pop">${icon('i-people')}${S.pop}/${housing()}${S.sick ? ` · ${S.sick} sick` : ''}</span><span class="next ${warn ? 'warn' : ''}">${next}</span>`);
  }

  function renderStageOverlays() {
    let q = '';
    for (let i = 0; i < S.builders; i++) {
      const b = S.builds[i];
      q += b
        ? `<button class="qchip" data-act="plot" data-arg="${b.plot}">${icon('i-hammer')}${SHORT[b.plot]} Lv ${b.to} <time>${fmtTime(b.end - S.time)}</time></button>`
        : `<span class="qchip idle">${icon('i-hammer')}Builder idle</span>`;
    }
    if (S.research) {
      const t = DATA.techs.find((x) => x.id === S.research.tech);
      q += `<button class="qchip" data-act="plot" data-arg="archive">${icon('i-journal')}${esc(t.name)} <time>${fmtTime(S.research.end - S.time)}</time></button>`;
    }
    if (S.training) q += `<button class="qchip" data-act="plot" data-arg="barracks">${icon(DATA.classes[S.training.type].icon)}${S.training.n} ${DATA.troops[S.training.type].name} <time>${fmtTime(S.training.end - S.time)}</time></button>`;
    setHTML($('#queue'), q);

    const quest = DATA.quests[S.quest];
    let h = '';
    if (quest) {
      const done = quest.check(S);
      UI.questTarget = !done && quest.go.startsWith('plot:') ? quest.go.slice(5) : null;
      h = `<div class="quest ${done ? 'done' : ''}"><div class="qtext"><div class="qlabel">Chapter quest ${S.quest + 1} of ${DATA.quests.length}</div>
        <div class="qgoal">${esc(quest.text)}</div><div class="qrew">${rewardHTML(quest.reward)}</div></div>
        ${done ? '<button class="btn gold small" data-act="claimquest">Claim</button>' : `<button class="btn small alt" data-act="go" data-arg="${quest.go}">Go</button>`}</div>`;
    } else {
      UI.questTarget = null;
      h = '<div class="quest"><div class="qtext"><div class="qlabel">Chapter quests</div><div class="qgoal">Every chapter quest is done. New chapters open each season.</div></div></div>';
    }
    setHTML($('#quest'), h);
  }

  function renderDots() {
    const p = patrolPreview();
    $('#dot-exp').hidden = !(p && p.mins >= 30);
    $('#dot-rec').hidden = !(S.beacons >= 1);
    const st = S.stipend.left > 0 && S.stipend.last !== today();
    const tier = passTier();
    let passReady = false;
    for (let i = 0; i < tier; i++) {
      if (!S.pass.free.includes(i) || (S.pass.premium && !S.pass.prem.includes(i))) { passReady = true; break; }
    }
    $('#dot-shop').hidden = !(st || passReady);
    document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.arg === UI.tab));
  }

  // ---------- Panels ----------
  function panelHeroes() {
    const owned = Object.keys(S.heroes).sort((a, b) => heroPower(b) - heroPower(a));
    const missing = DATA.heroes.filter((h) => !S.heroes[h.id]);
    const team = teamStats(null);
    const card = (id) => {
      const d = HERO[id], h = S.heroes[id];
      const inSquad = S.squad.includes(id), steward = S.stewards[d.steward.kind] === id;
      return `<button class="hcard ${d.rarity}" data-act="hero" data-arg="${id}">${portrait(id)}
        <span class="badges"><span class="cls-badge">${icon(DATA.classes[d.cls].icon)}</span><span style="display:grid;gap:3px;justify-items:end">${inSquad ? '<span class="squad-badge">SQUAD</span>' : ''}${steward ? '<span class="steward-badge">STEWARD</span>' : ''}</span></span>
        <span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}</span><span class="sub"><span>Lv ${h.lvl}</span>${starsHTML(h.stars)}</span></span></button>`;
    };
    return `<div class="panel-head"><h2>Heroes</h2><p>Squad power ${fmt(statPower(team))}</p></div>
      <div class="card stack"><div class="row"><div class="grow"><b>Expedition squad</b><div class="muted small">Up to 3 heroes march with your troops. Tap a hero to swap.</div></div></div>
      <div class="squad">${[0, 1, 2].map((i) => S.squad[i] ? `<button class="slot" data-act="hero" data-arg="${S.squad[i]}">${portrait(S.squad[i])}</button>` : '<div class="slot">+</div>').join('')}</div></div>
      <div class="row"><span class="section-label grow">Roster · ${owned.length}/${DATA.heroes.length}</span><span class="chip muted small">${icon('i-journal')}${fmt(S.journals)} journals</span></div>
      <div class="hero-grid">${owned.map(card).join('')}${missing.map((d) => `<button class="hcard ${d.rarity} missing" data-act="hero" data-arg="${d.id}">${portrait(d.id)}<span class="meta"><span class="nm">${esc(d.name.split(' ')[0])}</span><span class="sub"><span class="r-${d.rarity}">${DATA.rarities[d.rarity].name}</span></span></span></button>`).join('')}</div>`;
  }

  function panelExpedition() {
    const n = S.stage;
    const p = patrolPreview();
    let patrol;
    if (!p) patrol = '<div class="card"><b>Patrol cache</b><p class="muted small">Clear stage 1 and your scouts start bringing back journals and supplies while you play or rest.</p></div>';
    else {
      patrol = `<div class="card stack"><div class="row"><div class="grow"><b>Patrol cache</b><div class="muted small">${Math.floor(p.mins)} of ${DATA.patrolCapMinutes} min collected</div></div>
        <button class="btn small ${p.mins < 1 ? 'off' : 'gold'}" data-act="patrol">Collect</button></div>
        <div class="bar xp"><i style="width:${(p.mins / DATA.patrolCapMinutes) * 100}%"></i></div><div class="costs">${rewardHTML(p.g)}</div></div>`;
    }
    if (n > DATA.maxStage) {
      return `<div class="panel-head"><h2>Expedition</h2></div>${patrol}<div class="stage-card" style="margin-top:12px"><div class="foe">The Frost Titan has fallen.</div><p class="muted">Titan's Reach is quiet. New regions thaw out each season.</p></div>`;
    }
    const foe = enemyFor(n), team = teamStats(foe.cls);
    const ours = statPower(team), theirs = statPower(foe);
    const counter = Object.keys(DATA.counters).find((c) => DATA.counters[c] === foe.cls);
    const ch = chapterOf(n);
    const cells = Array.from({ length: 10 }, (_, i) => {
      const s = ch.from + i;
      return `<i class="${s < n ? 'done' : s === n ? 'cur' : ''} ${DATA.bosses[s] ? 'boss' : ''}">${s}</i>`;
    }).join('');
    const odds = ours >= theirs * 1.15 ? ['Favored', 'var(--good)'] : ours >= theirs * 0.9 ? ['Even fight', 'var(--gold)'] : ['Risky', 'var(--bad)'];
    return `<div class="panel-head"><h2>Expedition</h2><p>${esc(ch.name)}</p></div>
      ${patrol}
      <div class="section-label">Next stage</div>
      <div class="stage-card ${foe.boss ? 'boss' : ''}">
        <span class="stage-num">Stage ${n}${foe.boss ? ' · Boss' : ''}</span>
        <div class="foe">${esc(foe.name)}</div>
        <div class="muted small">${icon(DATA.classes[foe.cls].icon)} Fights like ${DATA.classes[foe.cls].name}s. Weak to ${DATA.classes[counter].name}s.</div>
        <div class="vs"><div class="side"><span class="muted small">Your squad</span><b>${fmt(ours)}</b></div><span class="x">vs</span><div class="side right"><span class="muted small">Enemy</span><b>${fmt(theirs)}</b></div></div>
        <div class="row wrap"><div class="squad">${S.squad.map((id) => `<button class="slot" data-act="hero" data-arg="${id}">${portrait(id)}</button>`).join('')}</div>
          <div class="grow small muted">${fmt(sum(team.troops))} troops march${S.lv.barracks ? ` (cap ${marchCap()})` : '. Build Barracks to add troops.'}<br><b style="color:${odds[1]}">${odds[0]}</b></div></div>
        <div style="margin-top:12px"><div class="muted small" style="margin-bottom:6px">First clear: ${rewardHTML(stageRewards(n))}</div><button class="btn wide" data-act="fight">Fight</button></div>
      </div>
      <div class="section-label">${esc(ch.name)}</div><div class="stage-list">${cells}</div>`;
  }

  function panelRecruit() {
    const f = HERO[DATA.recruit.featured];
    const toPity = DATA.recruit.pity - S.pity;
    const costLine = (n) => {
      const sg = n === 1 ? DATA.recruit.singleCost : DATA.recruit.tenCost;
      return S.beacons >= n ? `<small>${icon('i-beacon')}${n} token${n > 1 ? 's' : ''}</small>` : `<small>${icon('i-gem')}${fmt(sg)}</small>`;
    };
    return `<div class="panel-head"><h2>The Beacon</h2><p>Light it and see who answers.</p></div>
      <div class="beacon-hero"><div><span class="section-label" style="margin:0">Featured Legendary</span><div class="feat-name r-legendary">${esc(f.name)}</div>
        <p class="muted small" style="margin:4px 0 0">${esc(f.title)}. Half of all Legendary results are ${esc(f.name.split(' ')[0])}.</p></div>
        <div class="portrait-wrap">${portrait(f.id)}</div></div>
      <div class="pull-row"><button class="btn alt" data-act="pull" data-arg="1">Recruit ×1${costLine(1)}</button><button class="btn" data-act="pull" data-arg="10">Recruit ×10${costLine(10)}</button></div>
      <div class="card stack" style="margin-top:12px">
        <div class="row"><div class="grow"><b>Legendary guarantee</b><div class="muted small">${S.firstPull ? 'Your first recruit is a guaranteed Epic. ' : ''}A Legendary is guaranteed within ${toPity} more recruit${toPity === 1 ? '' : 's'}.</div></div><button class="btn small alt" data-act="odds">Odds</button></div>
        <div class="bar"><i style="width:${(S.pity / DATA.recruit.pity) * 100}%"></i></div>
        <div class="muted small">Every ×10 includes at least one Epic or better. Duplicates become ${DATA.shardsPerDupe} shards for that hero's next star.</div>
      </div>
      <div class="row" style="margin-top:12px"><span class="chip">${icon('i-beacon')}${S.beacons} Beacon Tokens</span><span class="chip">${icon('i-gem')}${fmt(S.starglass)} Starglass</span></div>`;
  }

  function panelShop() {
    const offers = DATA.shop.filter((x) => ['founder', 'stipend', 'ledger'].includes(x.id));
    const offer = (o) => {
      const done = o.once && S.bought[o.id];
      let extra = '';
      if (o.id === 'stipend' && S.stipend.left > 0) {
        extra = S.stipend.last !== today()
          ? `<button class="btn small gold" data-act="stipend">Claim 90 today</button>`
          : `<span class="muted small">Claimed today · ${S.stipend.left} days left</span>`;
      }
      return `<div class="card offer ${o.id === 'founder' && !done ? 'featured' : ''}"><div class="grow"><h3>${esc(o.name)}${o.tag ? `<span class="tag">${o.tag}</span>` : ''}</h3>
        <p class="muted small" style="margin:4px 0 6px">${esc(o.desc)}</p>${extra}</div>
        ${done ? '<span class="muted small">Owned</span>' : `<button class="btn small" data-act="buy" data-arg="${o.id}">$${o.usd.toFixed(2)}</button>`}</div>`;
    };
    const tier = passTier(), xpIn = S.pass.xp - tier * DATA.pass.xpPerTier;
    const passRows = DATA.pass.tiers.map((t, i) => {
      const reached = tier > i;
      const cell = (track, g) => {
        const claimed = S.pass[track].includes(i);
        const locked = track === 'prem' && !S.pass.premium;
        let btn = '';
        if (claimed) btn = '<span class="muted small">Got</span>';
        else if (reached && !locked) btn = `<button class="btn small gold" data-act="passclaim" data-arg="${track}:${i}">Claim</button>`;
        else if (locked) btn = icon('i-lock');
        return `<div class="pass-cell ${track === 'prem' ? 'prem' : ''} ${claimed ? 'claimed' : ''}"><span class="costs">${rewardHTML(g)}</span>${btn}</div>`;
      };
      return `<div class="pass-row"><span class="tier ${reached ? 'reached' : ''}">${i + 1}</span>${cell('free', t[0])}${cell('prem', t[1])}</div>`;
    }).join('');
    const skins = Object.entries(DATA.skins).map(([id, sk]) => {
      const own = S.skins.owned.includes(id), on = S.skins.on === id;
      const price = own ? (on ? 'Equipped' : 'Equip') : sk.starglass ? `${icon('i-gem')}${fmt(sk.starglass)}` : `$${sk.usd.toFixed(2)}`;
      return `<button class="card skin ${on ? 'on' : ''}" data-act="skin" data-arg="${id}">
        <span class="swatch" style="background:radial-gradient(60% 80% at 30% 70%, ${sk.fire[1]}, transparent 60%), linear-gradient(120deg, ${sk.body[0]}, ${sk.body[1]})"></span>
        <b>${esc(sk.name)}</b><span class="muted small">${sk.note ? esc(sk.note) : own ? 'Owned' : 'Cosmetic only'}</span><span class="chip">${price}</span></button>`;
    }).join('');
    const sg = DATA.shop.filter((x) => x.id.startsWith('sg')).map((o) => `<button class="card sg" data-act="buy" data-arg="${o.id}">${icon('i-gem')}<b>${fmt(o.grants.starglass)}</b><span class="muted small">${esc(o.name)}</span><span class="btn small">$${o.usd.toFixed(2)}</span></button>`).join('');
    const crates = RES.map((r) => `<button class="card sg" data-act="crate" data-arg="${r}">${icon(ICON[r])}<b>${fmt(DATA.crateSize(r, S.lv.hearth))}</b><span class="muted small">${NAME[r]} crate</span><span class="chip">${icon('i-gem')}${DATA.crateCost}</span></button>`).join('');
    return `<div class="panel-head"><h2>Store</h2><p>Simulated spend so far: $${S.spentUsd.toFixed(2)}</p></div>
      <p class="proto-note">Prototype store. Purchases are simulated and nothing is charged. In the App Store build these buttons open Apple's in-app purchase sheet.</p>
      <div class="section-label">Offers</div><div class="stack">${offers.map(offer).join('')}</div>
      <div class="section-label">Hearthkeeper's Ledger · Season 1</div>
      <div class="card stack"><div class="row"><div class="grow"><b>Tier ${tier} of ${DATA.pass.tiers.length}</b><div class="muted small">Earn Ledger XP from quests, upgrades, battles and recruits.</div></div>
        ${S.pass.premium ? '<span class="chip r-epic">Premium active</span>' : '<button class="btn small" data-act="buy" data-arg="ledger">Unlock premium</button>'}</div>
        <div class="bar xp"><i style="width:${tier >= DATA.pass.tiers.length ? 100 : (xpIn / DATA.pass.xpPerTier) * 100}%"></i></div>
        <div class="pass-row"><span></span><span class="muted small">Free</span><span class="muted small">Premium</span></div>${passRows}</div>
      <div class="section-label">Wyrm skins</div><div class="skin-grid">${skins}</div>
      <div class="section-label">Starglass</div><div class="sg-grid">${sg}</div>
      <div class="section-label">Supply crates</div><div class="sg-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">${crates}</div>`;
  }

  function renderPanel(force) {
    if (UI.tab === 'town') return;
    const panel = $('#panel');
    const keep = panel.scrollTop;
    const html = { heroes: panelHeroes, expedition: panelExpedition, recruit: panelRecruit, shop: panelShop }[UI.tab]();
    setHTML(panel, html, force);
    panel.scrollTop = keep;
  }

  // ---------- Sheets ----------
  function effectRows(pid) {
    const type = PLOT[pid].type, L = S.lv[pid], N = L + 1;
    const maxed = L >= maxLevel();
    const up = (v) => (maxed || !L ? '' : `<span class="up">→ ${v}</span>`);
    const rows = [];
    const b = DATA.buildings[type];
    if (type === 'hearth') {
      rows.push(['Heat at current blaze', `+${heatAt(L)}°C`, up(`+${heatAt(N)}°C`)]);
      rows.push(['Coal burned', `${perMin(burnRate()).replace('+', '')}`, up(perMin(DATA.hearth.burn(N) * blaze().burn).replace('+', ''))]);
      rows.push(['Building level cap', `Lv ${L}`, up(`Lv ${N}`)]);
    } else if (type === 'shelter') {
      rows.push(['Beds', `${L ? b.housing(L) : 0}`, up(b.housing(N))]);
    } else if (b.prod) {
      const per = (lvl) => b.perWorker * (1 + DATA.workerGrowth * (lvl - 1)) * 60;
      rows.push([`${NAME[b.prod]} per worker`, L ? `${per(L).toFixed(1)}/min` : '—', up(`${per(N).toFixed(1)}/min`)]);
      rows.push(['Worker slots', `${slotsOf(pid)}`, up(DATA.workerSlots(N))]);
    } else if (type === 'infirmary') {
      const rec = (lvl) => Math.round(1 / (DATA.baseRecovery + DATA.infirmaryRate * lvl * (1 + 0.3 * (S.tech.medicine || 0))));
      rows.push(['Average recovery', L ? `${rec(L)}s` : `${Math.round(1 / DATA.baseRecovery)}s`, up(`${rec(N)}s`)]);
    } else if (type === 'barracks') {
      rows.push(['March capacity', `${marchCap()}`, up(20 + 20 * N)]);
      rows.push(['Troop housing', `${troopCap()}`, up(40 + 40 * N)]);
      rows.push(['Training batch', `${batchMax()}`, up(10 * N)]);
      rows.push(['Troop strength', `+${Math.round((troopMult() - 1) * 100)}%`, up(`+${Math.round(((1 + 0.08 * (N - 1)) * (1 + 0.06 * (S.tech.drills || 0)) - 1) * 100)}%`)]);
    } else if (type === 'watchtower') {
      rows.push(['Forecast range', fmtTime(forecastRange()), up(fmtTime(forecastRange() + 45))]);
    } else if (type === 'archive') {
      rows.push(['Research level cap', `${techMax()}`, up(Math.min(5, N))]);
    }
    if (!rows.length) return '';
    return `<dl class="kv">${rows.map(([k, v, u]) => `<dt>${k}</dt><dd>${v}${u}</dd>`).join('')}</dl>`;
  }

  function upgradeHTML(pid) {
    const L = S.lv[pid], to = L + 1;
    const job = S.builds.find((b) => b.plot === pid);
    if (job) {
      const total = job.end - job.start, left = job.end - S.time, c = speedCost(job.end);
      return `<div class="section-label">${L ? `Upgrading to Lv ${to}` : 'Under construction'}</div>
        <div class="bar"><i style="width:${clamp((1 - left / total) * 100, 0, 100)}%"></i></div>
        <div class="row"><span class="grow chip">${icon('i-clock')}${fmtTime(left)} left</span>
        <button class="btn small ${c ? 'alt' : 'gold'}" data-act="speed" data-arg="${pid}">${c ? `${icon('i-gem')}${c} Finish now` : 'Finish free'}</button></div>`;
    }
    if (L >= maxLevel()) return '<p class="notice good">Max level for this season. Season 2 raises the cap.</p>';
    const why = upgradeBlock(pid), cost = buildCost(pid, to), afford = canAfford(cost);
    const busy = S.builds.length >= S.builders;
    let h = `<div class="section-label">${L ? `Upgrade to Lv ${to}` : 'Build'}</div>`;
    if (pid === 'hearth' && hearthReqs(to).length) {
      h += `<div class="costs">${hearthReqs(to).map((r) => `<span class="cost ${S.lv[r.plot] < r.lvl ? 'short' : ''}">${SHORT[r.plot]} Lv ${r.lvl}</span>`).join('')}</div>`;
    }
    h += `${costHTML(cost)}<div class="chip muted">${icon('i-clock')}${fmtTime(buildTime(pid, to))}</div>`;
    if (why) h += `<p class="notice cold">${esc(why)}</p>`;
    else if (busy) {
      const b = S.builds[0];
      h += `<p class="notice">Builder busy with ${SHORT[b.plot]} Lv ${b.to} (${fmtTime(b.end - S.time)}).${S.builders < 2 ? " The Founder's Cache adds a permanent second builder." : ''}</p>`;
    }
    h += `<button class="btn wide ${why || busy || !afford ? 'off' : ''}" data-act="build" data-arg="${pid}">${icon('i-up')}${L ? 'Upgrade' : 'Build'}</button>`;
    return h;
  }

  function hearthControls(R) {
    const seg = Object.entries(DATA.hearth.blaze).map(([k, v]) =>
      `<button class="${S.blaze === k ? 'on' : ''}" data-act="blaze" data-arg="${k}">${v.name}<small>+${Math.round(DATA.hearth.heat(S.lv.hearth) * v.heat)}°C · ${Math.round(DATA.hearth.burn(S.lv.hearth) * v.burn * 60)}/min</small></button>`).join('');
    let status;
    if (S.dormant) status = `<p class="notice">The Hearthwyrm is dormant. It wakes once you have 20 coal. Put more workers on the Coal Pit.</p>`;
    else if (R.net.coal < 0) status = `<p class="notice">Coal runs out in ${fmtTime(S.res.coal / -R.net.coal)} at this blaze.</p>`;
    else status = `<p class="notice good">Coal supply is steady (${perMin(R.net.coal)}).</p>`;
    const skins = S.skins.owned.map((id) => `<button class="btn small ${S.skins.on === id ? 'gold' : 'alt'}" data-act="skin" data-arg="${id}">${esc(DATA.skins[id].name)}</button>`).join('');
    return `<div class="section-label">Blaze</div><div class="seg">${seg}</div>${status}
      <p class="muted small">Roaring doubles coal use for 45% more heat. Bank the fire on calm days and let it roar before a blizzard.</p>
      <div class="section-label">Scales</div><div class="row wrap">${skins}<button class="btn small alt" data-act="tab" data-arg="shop">More skins</button></div>`;
  }

  function workerControls(pid, R) {
    const b = DATA.buildings[PLOT[pid].type];
    const idle = S.pop - sum(S.workers);
    return `<div class="section-label">Workers</div>
      <div class="row"><div class="grow"><b>${perMin(R.prod[b.prod])}</b> <span class="muted small">${NAME[b.prod].toLowerCase()} right now</span><div class="muted small">${idle} idle survivor${idle === 1 ? '' : 's'}</div></div>
      <div class="stepper"><button data-act="work" data-arg="${pid}:-1" aria-label="Remove worker">−</button><b>${S.workers[pid]}/${slotsOf(pid)}</b><button data-act="work" data-arg="${pid}:1" aria-label="Add worker">+</button></div></div>
      <button class="btn small ${S.autoWork ? 'gold' : 'alt'}" data-act="autowork">${S.autoWork ? 'Auto-assign on' : 'Auto-assign off'}</button>
      ${b.outdoor ? '<p class="muted small">Outdoor work: blizzards halve output here.</p>' : ''}`;
  }

  function trainingHTML() {
    if (S.training) {
      const t = S.training, left = t.end - S.time, c = speedCost(t.end);
      return `<div class="section-label">Training ${t.n} ${DATA.troops[t.type].name}</div>
        <div class="bar"><i style="width:${clamp((1 - left / (t.end - t.start)) * 100, 0, 100)}%"></i></div>
        <div class="row"><span class="grow chip">${icon('i-clock')}${fmtTime(left)} left</span><button class="btn small ${c ? 'alt' : 'gold'}" data-act="speed" data-arg="training">${c ? `${icon('i-gem')}${c} Finish now` : 'Finish free'}</button></div>`;
    }
    const room = Math.max(0, troopCap() - sum(S.troops));
    UI.trainN = clamp(UI.trainN, 1, Math.max(1, Math.min(batchMax(), room)));
    const t = DATA.troops[UI.trainType];
    const rows = Object.entries(DATA.troops).map(([k, v]) => {
      const lock = v.needs && !S.lv[v.needs];
      return `<button class="troop-row ${UI.trainType === k ? 'on' : ''}" data-act="ttype" data-arg="${k}"><span class="row">${icon(DATA.classes[k].icon)}<span><b>${v.name}</b><br><span class="muted small">${lock ? 'Needs the Iron Mine' : `Beats ${DATA.classes[DATA.counters[k]].name}s`}</span></span></span><b>${fmt(S.troops[k])}</b></button>`;
    }).join('');
    return `<div class="section-label">Train troops · ${fmt(sum(S.troops))}/${fmt(troopCap())} housed</div><div class="stack">${rows}</div>
      <div class="row"><span class="grow muted small">Batch size (max ${batchMax()})</span>
      <div class="stepper"><button data-act="tn" data-arg="-10" aria-label="Fewer">−</button><b>${UI.trainN}</b><button data-act="tn" data-arg="10" aria-label="More">+</button></div>
      <button class="btn small alt" data-act="tn" data-arg="max">Max</button></div>
      ${costHTML(t.cost, UI.trainN)}<div class="chip muted">${icon('i-clock')}${fmtTime(trainTime(UI.trainN))}</div>
      <button class="btn wide" data-act="train">Train ${UI.trainN} ${t.name}</button>`;
  }

  function researchHTML() {
    const max = techMax();
    return `<div class="section-label">Research · level cap ${max}</div><div class="stack">${DATA.techs.map((t) => {
      const lvl = S.tech[t.id], active = S.research && S.research.tech === t.id;
      let right;
      if (active) {
        const c = speedCost(S.research.end);
        right = `<button class="btn small ${c ? 'alt' : 'gold'}" data-act="speed" data-arg="research">${fmtTime(S.research.end - S.time)} · ${c ? `${icon('i-gem')}${c}` : 'Free'}</button>`;
      } else if (lvl >= 5) right = '<span class="muted small">Complete</span>';
      else right = `<button class="btn small ${S.research || lvl >= max || !canAfford(techCost(t, lvl)) ? 'off' : ''}" data-act="research" data-arg="${t.id}">Research</button>`;
      return `<div class="card tech"><div class="grow"><h3>${esc(t.name)} <span class="muted small">${lvl}/5</span></h3><div class="muted small">${esc(t.desc)}</div>
        ${lvl < 5 && !active ? `<div class="row wrap" style="margin-top:6px">${costHTML(techCost(t, lvl))}<span class="chip muted small">${icon('i-clock')}${fmtTime(techTime(t, lvl))}</span></div>` : ''}</div>${right}</div>`;
    }).join('')}</div>`;
  }

  function forecastHTML() {
    const range = forecastRange();
    const items = S.wx.filter((w) => w.end > S.time).slice(0, 8).map((w) => {
      const now = w.start <= S.time;
      const visible = now || w.start - S.time <= range;
      const d = DATA.weather[w.type];
      if (!visible) return `<div class="fc unknown">${icon('i-snow')}<span>Beyond sight</span><span class="muted small">${fmtTime(w.start - S.time)}</span></div>`;
      return `<div class="fc ${w.type} ${now ? 'now' : ''}">${icon(w.type === 'clear' ? 'i-temp' : 'i-snow')}<span><b>${d.name}</b> <span class="muted small">${fmtTemp(outsideTemp(d))} outside${d.outdoor < 1 ? ` · outdoor work ${Math.round(d.outdoor * 100)}%` : ''}</span></span>
        <span class="muted small">${now ? `now · ends ${fmtTime(w.end - S.time)}` : `in ${fmtTime(w.start - S.time)}`}</span></div>`;
    });
    return `<div class="forecast">${items.join('')}</div>`;
  }

  function sheetPlot(pid, R) {
    const p = PLOT[pid], type = p.type, b = DATA.buildings[type], L = S.lv[pid];
    const locked = pid !== 'hearth' && S.lv.hearth < p.unlock;
    let body = '';
    if (type === 'hearth') {
      const st = stageOf(L);
      body += `<p class="muted">${esc(b.desc)}</p><p class="chip" style="color:var(--gold)">${esc(st.name)}${L < maxLevel() ? ` · next form at Lv ${(DATA.hearth.stages.find((s) => s.from > L) || {}).from || '—'}` : ''}</p>`;
      body += hearthControls(R) + effectRows(pid) + upgradeHTML(pid);
    } else {
      if (locked) body += `<p class="notice cold">Unlocks when your Hearthwyrm reaches Lv ${p.unlock}.</p>`;
      body += `<p class="muted">${esc(b.desc)}</p>`;
      if (L && b.prod) body += workerControls(pid, R);
      if (L && type === 'shelter') body += `<p class="notice good">${S.pop} survivors housed across ${housing()} beds${S.sick ? `, ${S.sick} sick` : ''}.</p>`;
      if (L && type === 'infirmary') body += `<p class="notice ${S.sick ? 'cold' : 'good'}">${S.sick ? `${S.sick} patient${S.sick > 1 ? 's' : ''} in care.` : 'No one is sick right now.'}</p>`;
      body += effectRows(pid);
      if (!locked) body += upgradeHTML(pid);
      if (L && type === 'barracks') body += trainingHTML();
      if (L && type === 'archive') body += researchHTML();
      if (L && type === 'watchtower') body += `<div class="section-label">What the lookouts see</div>${forecastHTML()}`;
    }
    return { title: plotName(pid), lvl: L ? `Lv ${L}` : locked ? 'Locked' : 'Not built', body };
  }

  function sheetHero(id) {
    const d = HERO[id], h = S.heroes[id];
    const head = `<div class="row" style="align-items:flex-start"><div style="width:112px;flex:none;border-radius:12px;overflow:hidden;border:1px solid var(--line)">${portrait(id)}</div>
      <div class="grow"><div class="r-${d.rarity}" style="font-weight:700">${DATA.rarities[d.rarity].name} · ${DATA.classes[d.cls].name}</div><div class="muted small">${esc(d.title)}</div>
      <p class="small" style="margin-top:6px">${esc(d.bio)}</p></div></div>`;
    const skill = `<div class="card"><b>${esc(d.skill.name)}</b><div class="muted small">${esc(d.skill.desc)}</div></div>`;
    const post = DATA.stewardPosts[d.steward.kind];
    if (!h) {
      return { title: d.name, lvl: 'Not recruited', body: `${head}${skill}<div class="card"><b>Steward: ${plotName(post.plot)}</b><div class="muted small">${post.label(d.steward.val)}</div></div>
        <p class="notice cold">Recruit ${esc(d.name.split(' ')[0])} at the Beacon.</p><button class="btn wide" data-act="tab" data-arg="recruit">Go to the Beacon</button>` };
    }
    const s = heroStats(id), cap = DATA.heroLevelCapPerStar * h.stars, cost = 2 * h.lvl;
    const isSteward = S.stewards[d.steward.kind] === id;
    const other = S.stewards[d.steward.kind] && !isSteward ? HERO[S.stewards[d.steward.kind]].name.split(' ')[0] : null;
    const needShards = 10 * h.stars;
    const inSquad = S.squad.includes(id);
    return {
      title: d.name, lvl: `Lv ${h.lvl}`,
      body: `${head}
        <div class="stats"><div class="stat"><span>Attack</span><b>${fmt(s.atk)}</b></div><div class="stat"><span>Defense</span><b>${fmt(s.def)}</b></div><div class="stat"><span>Health</span><b>${fmt(s.hp)}</b></div></div>
        ${skill}
        <div class="card stack"><div class="row"><div class="grow"><b>Level ${h.lvl} / ${cap}</b><div class="muted small">Next level costs ${cost} Field Journals · you have ${fmt(S.journals)}</div></div></div>
          <div class="row"><button class="btn grow ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:1">Level up</button><button class="btn alt ${h.lvl >= cap || S.journals < cost ? 'off' : ''}" data-act="lvl" data-arg="${id}:max">Max</button></div></div>
        <div class="card stack"><div class="row"><div class="grow"><b>${starsHTML(h.stars)}</b><div class="muted small">${h.stars >= DATA.heroMaxStars ? 'Fully starred.' : `${h.shards}/${needShards} shards. Each star adds 15% stats, 10 levels and a stronger steward bonus.`}</div></div>
          ${h.stars < DATA.heroMaxStars ? `<button class="btn small ${h.shards < needShards ? 'off' : 'gold'}" data-act="star" data-arg="${id}">Add star</button>` : ''}</div>
          ${h.stars < DATA.heroMaxStars ? `<div class="bar xp"><i style="width:${Math.min(100, (h.shards / needShards) * 100)}%"></i></div>` : ''}</div>
        <div class="card stack"><div class="row"><div class="grow"><b>Steward of the ${plotName(post.plot)}</b><div class="muted small">${post.label(Math.round(d.steward.val * (1 + 0.2 * (h.stars - 1))))} while stationed${other ? `. Replaces ${esc(other)}.` : '.'} Stewards still fight.</div></div>
          <button class="btn small ${isSteward ? 'gold' : 'alt'}" data-act="station" data-arg="${id}">${isSteward ? 'Stationed' : 'Station'}</button></div></div>
        <button class="btn wide ${inSquad ? 'alt' : ''}" data-act="squad" data-arg="${id}">${inSquad ? 'Remove from squad' : 'Add to squad'}</button>`,
    };
  }

  function sheetForecast(R) {
    const heat = S.dormant ? 0 : DATA.hearth.heat(S.lv.hearth) * blaze().heat;
    return {
      title: 'Forecast', lvl: `Sight ${fmtTime(forecastRange())}`,
      body: `<dl class="kv"><dt>Outside</dt><dd>${fmtTemp(outsideTemp(R.wx))}</dd><dt>Hearthwyrm (${blaze().name})</dt><dd>+${Math.round(heat)}°C</dd>
        ${S.tech.insulation ? `<dt>Hide-Lined Walls</dt><dd>+${2 * S.tech.insulation}°C</dd>` : ''}${stewardVal('heat') ? `<dt>Steward</dt><dd>+${Math.round(stewardVal('heat'))}°C</dd>` : ''}
        <dt>In the hold</dt><dd class="t-${R.band.name.toLowerCase()}">${fmtTemp(R.temp)} · ${R.band.name}</dd></dl>
        ${forecastHTML()}
        <div class="card small"><b>How warmth works</b><div class="muted">The frost hunts warmth: every time your wyrm grows, storms come for it a little colder. Comfortable (5°C and up) speeds work by 10%. Below −5°C people start falling ill, and below −15°C the sick can be lost. The Watchtower and the Long Horns research let you see storms sooner.</div></div>
        <button class="btn wide" data-act="plot" data-arg="hearth">Tend the Hearthwyrm</button>`,
    };
  }

  function sheetSettings() {
    const body = UI.confirmReset
      ? `<p class="notice">Erase this hold and start over? Your heroes, buildings and simulated purchases will be gone.</p><div class="confirm-actions"><button class="btn alt" data-act="resetno">Keep playing</button><button class="btn" data-act="resetyes">Erase hold</button></div>`
      : `<dl class="kv"><dt>Time in the hold</dt><dd>${fmtTime(S.time)}</dd><dt>Survivors</dt><dd>${S.pop}</dd><dt>Stages cleared</dt><dd>${S.stage - 1}</dd>
        <dt>Heroes recruited</dt><dd>${Object.keys(S.heroes).length}</dd><dt>Buildings upgraded</dt><dd>${S.stats.upgrades}</dd><dt>Simulated spend</dt><dd>$${S.spentUsd.toFixed(2)}</dd></dl>
        <p class="muted small">Kindlehold prototype 0.1. Timers and production run about 30× faster than the planned live game so the whole loop fits in one sitting. Progress saves in this browser.</p>
        <button class="btn alt wide" data-act="reset">Start a new hold</button>`;
    return { title: 'Hold ledger', lvl: '', body };
  }

  function sheetIntro() {
    return {
      title: '', lvl: '', noClose: true,
      body: `<div class="intro-art"><h1>Kindlehold</h1></div>
        <p class="lore">The sun went grey in the winter they now call the Long Night, and it never warmed again. Cities froze. Forests died standing.</p>
        <p class="lore">In the ash of a fallen forge you found something still warm: a cracked egg, and inside it a creature made of embers.</p>
        <p class="lore">It is small and it is hungry. As long as it burns, the cold cannot reach the people huddled around it.</p>
        <p class="lore"><b>Feed the Hearthwyrm. Shelter the survivors. Watch the sky.</b></p>
        <button class="btn wide" data-act="close">Light the hold</button>`,
    };
  }

  function sheetOffline() {
    const o = UI.sheet.data, l = o.log;
    const gains = {};
    for (const r of RES) if (l[r] > 0.5) gains[r] = Math.floor(l[r]);
    const mins = Math.round(o.capped / 60);
    return {
      title: 'While you were away', lvl: '',
      body: `<p>Your hold kept working for ${mins} minute${mins === 1 ? '' : 's'}${o.seconds > o.capped ? ` (the most it banks is ${Math.round(DATA.offline.capSeconds / 60)})` : ''}. The Hearthwyrm banked its fire, so no one fell ill.</p>
        ${Object.keys(gains).length ? `<div class="costs">${rewardHTML(gains)}</div>` : '<p class="muted">Production was balanced out by what the hold consumed.</p>'}
        ${l.arrived ? `<p class="notice good">${l.arrived} survivor${l.arrived > 1 ? 's' : ''} found their way to the hold.</p>` : ''}
        ${l.built ? `<p class="notice good">Finished: ${l.built.map(esc).join(', ')}.</p>` : ''}
        <button class="btn wide" data-act="close">Back to the hold</button>`,
    };
  }

  function sheetOdds() {
    const o = DATA.recruit.odds;
    const list = (r) => DATA.heroes.filter((h) => h.rarity === r).map((h) => esc(h.name)).join(', ');
    const per = (r) => (o[r] * 100) / DATA.heroes.filter((h) => h.rarity === r).length;
    return {
      title: 'Recruitment odds', lvl: '',
      body: `<dl class="kv"><dt class="r-legendary">Legendary</dt><dd>${(o.legendary * 100).toFixed(1)}%</dd><dt class="r-epic">Epic</dt><dd>${(o.epic * 100).toFixed(1)}%</dd><dt class="r-rare">Rare</dt><dd>${(o.rare * 100).toFixed(1)}%</dd></dl>
        <p class="small"><b class="r-legendary">Legendary:</b> ${HERO[DATA.recruit.featured].name} ${(o.legendary * DATA.recruit.featuredShare * 100).toFixed(2)}%, every other Legendary ${((o.legendary * (1 - DATA.recruit.featuredShare)) / 3 * 100).toFixed(2)}% each. <span class="muted">${list('legendary')}</span></p>
        <p class="small"><b class="r-epic">Epic:</b> ${per('epic').toFixed(2)}% each. <span class="muted">${list('epic')}</span></p>
        <p class="small"><b class="r-rare">Rare:</b> ${per('rare').toFixed(2)}% each. <span class="muted">${list('rare')}</span></p>
        <p class="muted small">Your first recruit is ${HERO[DATA.recruit.firstPull].name}. A Legendary is guaranteed on or before the ${DATA.recruit.pity}th recruit since your last one. Every ×10 includes at least one Epic or better. Odds are shown before every purchase, as the App Store requires.</p>`,
    };
  }

  function sheetBuy() {
    const sh = UI.sheet;
    let name, desc, usd, grants = null;
    if (sh.skin) {
      const sk = DATA.skins[sh.skin];
      name = sk.name; desc = 'A cosmetic wyrm skin. It changes how your Hearthwyrm looks and nothing else.'; usd = sk.usd;
    } else {
      const it = DATA.shop.find((x) => x.id === sh.id);
      name = it.name; desc = it.desc || `${fmt(it.grants.starglass)} Starglass.`; usd = it.usd; grants = it.grants;
    }
    return {
      title: name, lvl: `$${usd.toFixed(2)}`,
      body: `<p>${esc(desc)}</p>${grants ? `<div class="costs">${rewardHTML(grants)}</div>` : ''}
        <p class="proto-note">Prototype: no money changes hands. In the App Store build this step opens Apple's purchase sheet.</p>
        <div class="confirm-actions"><button class="btn alt" data-act="close">Cancel</button><button class="btn" data-act="confirmbuy">Simulate $${usd.toFixed(2)}</button></div>`,
    };
  }

  function sheetResults() {
    const rs = UI.sheet.results;
    return {
      title: 'The beacon answers', lvl: '',
      body: `<div class="results ${rs.length === 1 ? 'single' : ''}">${rs.map((r, i) => `<div class="rcard ${r.rarity}" style="animation-delay:${i * 90}ms">${portrait(r.id)}<p class="r-${r.rarity}">${esc(HERO[r.id].name.split(' ')[0])}</p><p class="${r.isNew ? 'new' : 'muted'}">${r.isNew ? 'New!' : `+${DATA.shardsPerDupe} shards`}</p></div>`).join('')}</div>
        <div class="confirm-actions"><button class="btn alt" data-act="tab" data-arg="heroes">View heroes</button><button class="btn" data-act="close">Continue</button></div>`,
    };
  }

  function renderSheet(R, force) {
    const el = $('#sheet'), scrim = $('#scrim');
    $('#app').classList.toggle('sheet-open', !!UI.sheet);
    if (!UI.sheet) {
      if (!el.hidden) { el.hidden = true; scrim.hidden = true; el._h = null; el._key = null; }
      return;
    }
    const k = UI.sheet.kind;
    const s = k === 'plot' ? sheetPlot(UI.sheet.pid, R) : k === 'hero' ? sheetHero(UI.sheet.id) : k === 'forecast' ? sheetForecast(R)
      : k === 'settings' ? sheetSettings() : k === 'intro' ? sheetIntro() : k === 'offline' ? sheetOffline() : k === 'odds' ? sheetOdds()
      : k === 'buy' ? sheetBuy() : sheetResults();
    const html = `${s.title || s.lvl ? `<div class="sheet-head"><h2>${esc(s.title)}</h2>${s.lvl ? `<span class="lvl">${esc(s.lvl)}</span>` : ''}
      ${s.noClose ? '' : `<button class="icon-btn" data-act="close" aria-label="Close">${icon('i-close')}</button>`}</div>` : ''}<div class="sheet-body">${s.body}</div>`;
    const key = `${k}:${UI.sheet.pid || UI.sheet.id || UI.sheet.skin || ''}`;
    const fresh = el.hidden || el._key !== key;
    el.hidden = false; scrim.hidden = false;
    setHTML(el, html, force || fresh);
    if (fresh) {
      el._key = key;
      const body = el.querySelector('.sheet-body');
      if (body) body.scrollTop = 0;
    }
  }

  // toasts
  function toast(msg, kind = '', key = null, gap = 0) {
    const now = performance.now();
    if (key) {
      if (UI.lastToast[key] && now - UI.lastToast[key] < gap * 1000) return;
      UI.lastToast[key] = now;
    }
    const host = $('#toasts');
    while (host.children.length >= 3) host.firstChild.remove();
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  let lastR = null;
  function renderAll(force) {
    const R = rates(false);
    lastR = R;
    renderHUD(R);
    renderStageOverlays();
    if (UI.tab === 'town' && $('#quest').offsetHeight !== T.qh) resize();
    renderDots();
    renderPanel(force);
    renderSheet(R, force);
    // cache which plots can be upgraded right now, for the canvas arrows
    UI.upgradable = new Set();
    if (S.builds.length < S.builders) {
      for (const pid of Object.keys(PLOT)) {
        if (S.lv[pid] && !upgradeBlock(pid) && canAfford(buildCost(pid, S.lv[pid] + 1))) UI.upgradable.add(pid);
      }
    }
  }

  // ======================================================================
  // Rendering: town canvas
  // ======================================================================
  const cv = $('#town');
  const ctx = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1;
  const T = { cx: 0, cy: 0, rx: 0, ry: 0, k: 1, top: 0, pos: {}, stars: [], ridges: [[], []], flakes: [], embers: [] };
  UI.floaters = [];
  const SNOW = '#e3edf6';

  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    T.top = Math.max(36, VH * 0.11);
    T.qh = $('#quest').offsetHeight || 70;
    const groundH = VH - T.top - (T.qh + 22);
    T.k = clamp(Math.min(VW / 400, VH / 560), 0.7, 1.2);
    T.cx = VW / 2;
    T.cy = T.top + groundH * 0.5 + 12;
    T.ry = groundH * 0.39;
    T.rx = Math.min(VW * 0.385, T.ry * 1.9, 240);
    DATA.plots.forEach((p, i) => {
      const a = Math.PI / 2 + (i * Math.PI * 2) / DATA.plots.length;
      const x = T.cx + T.rx * Math.cos(a), y = T.cy + T.ry * Math.sin(a);
      const depth = (y - (T.cy - T.ry)) / (2 * T.ry);
      T.pos[p.id] = { x, y, s: T.k * (0.84 + 0.22 * depth) };
    });
    T.pos.hearth = { x: T.cx, y: T.cy, s: T.k };
    T.stars = Array.from({ length: 60 }, () => ({ x: rand(0, VW), y: rand(0, T.top), r: rand(0.4, 1.3), p: rand(0, 6) }));
    const ridge = (h0, h1, step) => {
      const pts = [];
      for (let x = -20; x <= VW + 40; x += step * rand(0.6, 1.3)) pts.push([x, T.top - rand(h0, h1) * T.k]);
      return pts;
    };
    T.ridges = [ridge(14, 46, 38), ridge(4, 20, 26)];
    if (!T.flakes.length) T.flakes = Array.from({ length: 170 }, () => ({ x: Math.random(), y: Math.random(), z: rand(0.3, 1), p: rand(0, 6) }));
    const top = $('#stage').offsetTop;
    $('#toasts').style.top = `${top + 8}px`;
  }

  function ell(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }

  function hut(x, y, w, h, rh, wall, roof, lit) {
    const d = w * 0.3;
    ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x + d * 0.4, y + 2, w * 0.8, w * 0.22); ctx.fill();
    ctx.fillStyle = shade(wall, -0.3);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2 + d, y - d * 0.5); ctx.lineTo(x + w / 2 + d, y - h - d * 0.5); ctx.lineTo(x + w / 2, y - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = wall; ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = shade(roof, -0.2);
    ctx.beginPath(); ctx.moveTo(x, y - h - rh); ctx.lineTo(x + d, y - h - rh - d * 0.5); ctx.lineTo(x + w / 2 + d + 2, y - h - d * 0.5 + 2); ctx.lineTo(x + w / 2 + 2, y - h + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SNOW;
    ctx.beginPath(); ctx.moveTo(x, y - h - rh); ctx.lineTo(x + d, y - h - rh - d * 0.5); ctx.lineTo(x + w * 0.3 + d, y - h - rh * 0.42 - d * 0.5); ctx.lineTo(x + w * 0.3, y - h - rh * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 3, y - h + 2); ctx.lineTo(x, y - h - rh); ctx.lineTo(x + w / 2 + 3, y - h + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = SNOW;
    ctx.beginPath(); ctx.moveTo(x - w * 0.24, y - h - rh * 0.5); ctx.lineTo(x, y - h - rh - 1); ctx.lineTo(x + w * 0.24, y - h - rh * 0.5); ctx.quadraticCurveTo(x, y - h - rh * 0.62, x - w * 0.24, y - h - rh * 0.5); ctx.fill();
    ctx.fillStyle = '#24170f'; ctx.fillRect(x - w * 0.1, y - h * 0.62, w * 0.2, h * 0.62);
    ctx.fillStyle = lit ? '#ffc56a' : '#2b3442';
    if (lit) { ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 8; }
    ctx.fillRect(x - w * 0.38, y - h * 0.72, w * 0.16, h * 0.26);
    ctx.fillRect(x + w * 0.22, y - h * 0.72, w * 0.16, h * 0.26);
    ctx.shadowBlur = 0;
    ctx.fillStyle = SNOW; ctx.fillRect(x - w / 2 - 1, y - 2, w + d + 2, 2.5);
  }
  function tent(x, y, w, h, col) {
    ctx.fillStyle = 'rgba(8,16,30,.3)'; ell(x, y + 1, w * 0.7, w * 0.2); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.quadraticCurveTo(x - w * 0.2, y - h * 0.5, x, y - h); ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.5, x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(col, -0.3);
    ctx.beginPath(); ctx.moveTo(x, y - h); ctx.quadraticCurveTo(x + w * 0.2, y - h * 0.5, x + w / 2, y); ctx.lineTo(x + w * 0.12, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - 3, y - h - 5); ctx.lineTo(x + 2, y - h + 4); ctx.moveTo(x + 3, y - h - 5); ctx.lineTo(x - 2, y - h + 4); ctx.stroke();
    ctx.fillStyle = '#2a1b12'; ctx.beginPath(); ctx.moveTo(x - w * 0.1, y); ctx.lineTo(x, y - h * 0.45); ctx.lineTo(x + w * 0.1, y); ctx.fill();
    ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - w * 0.12, y - h * 0.72); ctx.lineTo(x, y - h); ctx.lineTo(x + w * 0.12, y - h * 0.72); ctx.fill();
  }

  function drawBuilding(pid, x, y, s, t) {
    const type = PLOT[pid].type, L = S.lv[pid];
    const lit = !!(DATA.buildings[type].prod ? S.workers[pid] : true);
    const w = 34 * s, h = 19 * s, rh = 15 * s;
    switch (type) {
      case 'shelter': {
        const n = L >= 7 ? 3 : L >= 4 ? 3 : 2;
        tent(x - 13 * s, y - 4 * s, 22 * s, 26 * s, '#8b6a4c');
        tent(x + 12 * s, y - 2 * s, 24 * s, 29 * s, '#7a5c43');
        if (n >= 3) tent(x, y + 5 * s, 20 * s, 23 * s, '#957457');
        if (L >= 7) hut(x - 2 * s, y + 6 * s, w * 0.7, h * 0.8, rh * 0.8, '#6e5039', '#3e2d21', true);
        break;
      }
      case 'woodcutter': {
        hut(x + 4 * s, y, w, h, rh, '#7a5434', '#4d3220', lit);
        ctx.fillStyle = '#6b4526';
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) {
          ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 3 * s, 3 * s); ctx.fill();
          ctx.fillStyle = '#d9b07c'; ell(x - 19 * s + j * 6 * s + i * 3 * s, y - 3 * s - i * 5 * s, 1.6 * s, 1.6 * s); ctx.fill(); ctx.fillStyle = '#6b4526';
        }
        ctx.fillStyle = SNOW; ell(x - 14 * s, y - 15 * s, 7 * s, 2 * s); ctx.fill();
        break;
      }
      case 'hunter': {
        hut(x, y, w, h, rh, '#6b5644', '#3f3024', lit);
        ctx.strokeStyle = '#efe2c9'; ctx.lineWidth = 1.6 * s; ctx.beginPath();
        ctx.moveTo(x, y - h - 1); ctx.lineTo(x - 7 * s, y - h - 7 * s); ctx.lineTo(x - 10 * s, y - h - 5 * s);
        ctx.moveTo(x - 7 * s, y - h - 7 * s); ctx.lineTo(x - 6 * s, y - h - 11 * s);
        ctx.moveTo(x, y - h - 1); ctx.lineTo(x + 7 * s, y - h - 7 * s); ctx.lineTo(x + 10 * s, y - h - 5 * s);
        ctx.moveTo(x + 7 * s, y - h - 7 * s); ctx.lineTo(x + 6 * s, y - h - 11 * s); ctx.stroke();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.5 * s; ctx.beginPath();
        ctx.moveTo(x - 26 * s, y); ctx.lineTo(x - 26 * s, y - 20 * s); ctx.moveTo(x - 14 * s, y + 2 * s); ctx.lineTo(x - 14 * s, y - 18 * s);
        ctx.moveTo(x - 28 * s, y - 19 * s); ctx.lineTo(x - 12 * s, y - 17 * s); ctx.stroke();
        ctx.fillStyle = '#9a6a42'; ctx.fillRect(x - 24 * s, y - 18 * s, 4 * s, 9 * s);
        ctx.fillStyle = '#c99a62'; ctx.fillRect(x - 19 * s, y - 17.5 * s, 4 * s, 7 * s);
        break;
      }
      case 'coalpit': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 28 * s, 8 * s); ctx.fill();
        ctx.fillStyle = '#25282e'; ctx.beginPath(); ctx.moveTo(x - 26 * s, y); ctx.quadraticCurveTo(x - 10 * s, y - 22 * s, x + 2 * s, y - 16 * s); ctx.quadraticCurveTo(x + 16 * s, y - 20 * s, x + 26 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3a3f48'; ell(x - 8 * s, y - 10 * s, 6 * s, 4 * s); ctx.fill(); ell(x + 9 * s, y - 9 * s, 5 * s, 3 * s); ctx.fill();
        ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2.2 * s; ctx.beginPath();
        ctx.moveTo(x + 4 * s, y - 2 * s); ctx.lineTo(x + 12 * s, y - 34 * s); ctx.lineTo(x + 20 * s, y - 2 * s);
        ctx.moveTo(x + 7 * s, y - 16 * s); ctx.lineTo(x + 17 * s, y - 16 * s); ctx.stroke();
        ctx.strokeStyle = '#a8b2bd'; ctx.lineWidth = 1.5 * s; ell(x + 12 * s, y - 33 * s, 4 * s, 4 * s); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
          ctx.fillStyle = `rgba(255,${120 + i * 20},50,${0.35 + a * 0.6})`;
          ell(x - 14 * s + i * 7 * s, y - 5 * s - (i % 2) * 5 * s, 1.3 * s, 1.3 * s); ctx.fill();
        }
        ctx.fillStyle = '#5a4030'; ctx.fillRect(x - 24 * s, y - 6 * s, 10 * s, 5 * s);
        ctx.fillStyle = '#1d1f24'; ell(x - 19 * s, y - 7 * s, 5 * s, 2.2 * s); ctx.fill();
        break;
      }
      case 'ironmine': {
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 28 * s, 8 * s); ctx.fill();
        ctx.fillStyle = '#5d6673'; ctx.beginPath(); ctx.moveTo(x - 27 * s, y); ctx.lineTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 14 * s, y - 26 * s); ctx.lineTo(x + 27 * s, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7d8794'; ctx.beginPath(); ctx.moveTo(x - 18 * s, y - 24 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x - 2 * s, y - 18 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - 12 * s, y - 28 * s); ctx.lineTo(x - 4 * s, y - 32 * s); ctx.lineTo(x + 8 * s, y - 28 * s); ctx.quadraticCurveTo(x - 2 * s, y - 25 * s, x - 12 * s, y - 28 * s); ctx.fill();
        ctx.fillStyle = '#0d1014'; ctx.beginPath(); ctx.moveTo(x - 8 * s, y); ctx.lineTo(x - 8 * s, y - 11 * s); ctx.quadraticCurveTo(x, y - 19 * s, x + 8 * s, y - 11 * s); ctx.lineTo(x + 8 * s, y); ctx.fill();
        ctx.strokeStyle = '#7a5434'; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y); ctx.stroke();
        if (lit) { ctx.fillStyle = '#ffc56a'; ctx.shadowColor = '#ff9a3c'; ctx.shadowBlur = 10; ell(x + 12 * s, y - 10 * s, 1.8 * s, 1.8 * s); ctx.fill(); ctx.shadowBlur = 0; }
        break;
      }
      case 'infirmary': {
        hut(x, y, w, h, rh, '#cfc6b4', '#4f7a5a', true);
        ctx.fillStyle = '#eef6e6'; ell(x - 22 * s, y - 24 * s, 6 * s, 6 * s); ctx.fill();
        ctx.fillStyle = '#4f9a5a'; ctx.beginPath(); ctx.moveTo(x - 22 * s, y - 28 * s); ctx.quadraticCurveTo(x - 17 * s, y - 24 * s, x - 22 * s, y - 20 * s); ctx.quadraticCurveTo(x - 27 * s, y - 24 * s, x - 22 * s, y - 28 * s); ctx.fill();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.moveTo(x - 22 * s, y - 18 * s); ctx.lineTo(x - 22 * s, y); ctx.stroke();
        break;
      }
      case 'barracks': {
        hut(x, y, w * 1.45, h * 1.05, rh * 1.05, '#6a4e3a', '#3a2a20', true);
        ctx.fillStyle = '#9aa6b2'; ell(x - 14 * s, y - 10 * s, 3.4 * s, 3.4 * s); ctx.fill(); ell(x + 14 * s, y - 10 * s, 3.4 * s, 3.4 * s); ctx.fill();
        ctx.strokeStyle = '#5a4030'; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(x + 30 * s, y); ctx.lineTo(x + 30 * s, y - 44 * s); ctx.stroke();
        const wave = Math.sin(t * 4) * 2 * s;
        ctx.fillStyle = '#ff7b2e'; ctx.beginPath(); ctx.moveTo(x + 30 * s, y - 44 * s); ctx.quadraticCurveTo(x + 38 * s, y - 42 * s + wave, x + 44 * s, y - 40 * s); ctx.lineTo(x + 30 * s, y - 34 * s); ctx.fill();
        break;
      }
      case 'watchtower': {
        const top = y - 50 * s;
        ctx.fillStyle = 'rgba(8,16,30,.35)'; ell(x, y + 2, 16 * s, 5 * s); ctx.fill();
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2.2 * s; ctx.beginPath();
        ctx.moveTo(x - 11 * s, y); ctx.lineTo(x - 7 * s, top); ctx.moveTo(x + 11 * s, y); ctx.lineTo(x + 7 * s, top);
        ctx.moveTo(x - 10 * s, y - 12 * s); ctx.lineTo(x + 9 * s, y - 28 * s); ctx.moveTo(x + 10 * s, y - 12 * s); ctx.lineTo(x - 9 * s, y - 28 * s);
        ctx.moveTo(x - 9 * s, y - 32 * s); ctx.lineTo(x + 8 * s, y - 46 * s); ctx.stroke();
        ctx.fillStyle = '#5a3d26'; ctx.fillRect(x - 12 * s, top - 3 * s, 24 * s, 5 * s);
        ctx.fillStyle = '#7a5434'; ctx.fillRect(x - 10 * s, top - 12 * s, 3 * s, 9 * s); ctx.fillRect(x + 7 * s, top - 12 * s, 3 * s, 9 * s);
        ctx.fillStyle = '#3e2d21'; ctx.beginPath(); ctx.moveTo(x - 15 * s, top - 11 * s); ctx.lineTo(x, top - 22 * s); ctx.lineTo(x + 15 * s, top - 11 * s); ctx.fill();
        ctx.fillStyle = SNOW; ctx.beginPath(); ctx.moveTo(x - 8 * s, top - 16 * s); ctx.lineTo(x, top - 22 * s); ctx.lineTo(x + 8 * s, top - 16 * s); ctx.fill();
        const sweep = Math.sin(t * 0.6);
        const g = ctx.createRadialGradient(x, top - 6 * s, 0, x, top - 6 * s, 70 * s);
        g.addColorStop(0, 'rgba(255,214,140,.35)'); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x, top - 6 * s);
        ctx.arc(x, top - 6 * s, 70 * s, Math.PI + sweep * 0.9 - 0.18, Math.PI + sweep * 0.9 + 0.18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffb04a'; ctx.shadowBlur = 10; ell(x, top - 6 * s, 2.4 * s, 2.4 * s); ctx.fill(); ctx.shadowBlur = 0;
        break;
      }
      case 'archive': {
        hut(x, y, w * 1.15, h * 1.1, rh * 1.15, '#7f8a98', '#4a586b', true);
        ctx.fillStyle = '#ffd27a'; ctx.shadowColor = '#ffb04a'; ctx.shadowBlur = 8; ell(x, y - h * 1.1 - rh * 0.35, 3.2 * s, 3.2 * s); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#b8c2cd'; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(x + 14 * s, y - h * 1.1 - 2 * s); ctx.lineTo(x + 24 * s, y - h * 1.1 - 14 * s); ctx.stroke();
        break;
      }
      default: break;
    }
  }

  function drawPlot(pid, now, t) {
    const P = T.pos[pid], { x, y, s } = P, p = PLOT[pid], L = S.lv[pid];
    const locked = S.lv.hearth < p.unlock;
    const job = S.builds.find((b) => b.plot === pid);
    if (UI.questTarget === pid) {
      const a = 0.45 + 0.35 * Math.sin(t * 4);
      ctx.strokeStyle = `rgba(255,207,110,${a})`; ctx.lineWidth = 2.5;
      ell(x, y - 2, 30 * s, 11 * s); ctx.stroke();
    }
    if (locked) {
      ctx.fillStyle = 'rgba(200,220,240,.18)'; ell(x, y, 22 * s, 8 * s); ctx.fill();
      ctx.fillStyle = '#c9d8e6'; ell(x, y - 3 * s, 14 * s, 6 * s); ctx.fill();
      ctx.fillStyle = 'rgba(20,32,50,.75)'; ctx.fillRect(x - 5 * s, y - 13 * s, 10 * s, 8 * s);
      ctx.strokeStyle = 'rgba(20,32,50,.75)'; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.arc(x, y - 13 * s, 3.4 * s, Math.PI, 0); ctx.stroke();
      label(x, y + 13 * s, `Wyrm Lv ${p.unlock}`, s, 'rgba(180,200,220,.75)');
      return;
    }
    if (!L && !job) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,230,180,.6)'; ctx.lineWidth = 1.5;
      ell(x, y - 2, 22 * s, 8 * s); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,207,110,.9)'; ctx.font = `700 ${18 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', x, y - 3);
      label(x, y + 13 * s, `Build ${SHORT[pid]}`, s, '#ffd88f');
      return;
    }
    if (L) drawBuilding(pid, x, y, s, t);
    else { ctx.fillStyle = 'rgba(120,90,60,.5)'; ell(x, y, 20 * s, 7 * s); ctx.fill(); }
    if (job) {
      ctx.strokeStyle = 'rgba(214,170,110,.9)'; ctx.lineWidth = 1.5 * s; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * 12 * s, y); ctx.lineTo(x + i * 12 * s, y - 30 * s); }
      ctx.moveTo(x - 14 * s, y - 10 * s); ctx.lineTo(x + 14 * s, y - 10 * s); ctx.moveTo(x - 14 * s, y - 22 * s); ctx.lineTo(x + 14 * s, y - 22 * s);
      ctx.moveTo(x - 12 * s, y); ctx.lineTo(x + 12 * s, y - 22 * s); ctx.stroke();
      const frac = clamp((S.time - job.start) / (job.end - job.start), 0, 1);
      pill(x, y - 44 * s, fmtTime(job.end - S.time), s, frac);
    }
    if (L) {
      const bx = x + 20 * s, by = y - 3 * s;
      ctx.fillStyle = '#0b1320'; ell(bx, by, 8.5 * s, 8.5 * s); ctx.fill();
      ctx.strokeStyle = '#ffcf6e'; ctx.lineWidth = 1.4; ell(bx, by, 8.5 * s, 8.5 * s); ctx.stroke();
      ctx.fillStyle = '#ffe7b0'; ctx.font = `700 ${10 * s}px 'Barlow Semi Condensed', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(L), bx, by + 0.5);
      label(x, y + 13 * s, SHORT[pid], s);
      if (UI.upgradable.has(pid) && !job) {
        const ay = y - 40 * s - Math.abs(Math.sin(t * 3)) * 4 * s, ax = x - 18 * s;
        ctx.fillStyle = '#2e9a55'; ell(ax, ay, 7 * s, 7 * s); ctx.fill();
        ctx.fillStyle = '#eaffef'; ctx.beginPath(); ctx.moveTo(ax, ay - 4.5 * s); ctx.lineTo(ax + 4 * s, ay + 0.5 * s); ctx.lineTo(ax + 1.6 * s, ay + 0.5 * s); ctx.lineTo(ax + 1.6 * s, ay + 4 * s); ctx.lineTo(ax - 1.6 * s, ay + 4 * s); ctx.lineTo(ax - 1.6 * s, ay + 0.5 * s); ctx.lineTo(ax - 4 * s, ay + 0.5 * s); ctx.closePath(); ctx.fill();
      }
    }
    for (const f of UI.floaters) {
      if (f.plot !== pid) continue;
      const age = (now - f.t0) / 1000;
      ctx.globalAlpha = clamp(1.6 - age, 0, 1);
      ctx.fillStyle = '#ffe08a'; ctx.font = `700 ${16 * s}px 'Grenze', serif`; ctx.textAlign = 'center';
      ctx.fillText(f.text, x, y - 50 * s - age * 18);
      ctx.globalAlpha = 1;
    }
  }
  function label(x, y, text, s, col = 'rgba(225,236,247,.92)') {
    ctx.font = `600 ${11 * s}px 'Barlow Semi Condensed', sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(8,14,24,.75)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = col; ctx.fillText(text, x, y);
  }
  function pill(x, y, text, s, frac) {
    ctx.font = `700 ${11 * s}px 'Barlow Semi Condensed', sans-serif`;
    const w = ctx.measureText(text).width + 22 * s, h = 16 * s;
    ctx.fillStyle = 'rgba(8,14,24,.85)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w, h); ctx.fill();
    ctx.fillStyle = 'rgba(255,138,61,.55)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - h / 2, w * frac, h, h / 2) : ctx.rect(x - w / 2, y - h / 2, w * frac, h); ctx.fill();
    ctx.fillStyle = '#ffe7c4'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 0.5);
  }

  function coilPoint(u) {
    // u: 0 = tail tip (right, behind) → 1 = neck base (front right)
    const a = 40, b = 17;
    const th = -0.35 - u * (Math.PI * 1.5 + 0.35);
    return [a * Math.cos(th), b * Math.sin(th)];
  }
  function drawWyrm(x, y, t) {
    const L = S.lv.hearth, st = stageOf(L), skin = DATA.skins[S.skins.on] || DATA.skins.hearth;
    const f = st.size * T.k * 1.3;
    const dorm = S.dormant;
    const dark = dorm ? shade(skin.body[0], -0.45) : skin.body[0];
    const light = dorm ? shade(skin.body[1], -0.5) : skin.body[1];
    const belly = dorm ? shade(skin.belly, -0.5) : skin.belly;
    const fh = dorm ? 0 : { low: 0.7, steady: 1, roaring: 1.4 }[S.blaze];

    ctx.save();
    ctx.translate(x, y);
    // warm glow on the snow
    if (!dorm) {
      const g = ctx.createRadialGradient(0, -6 * f, 0, 0, -6 * f, 110 * f * (0.8 + 0.3 * fh));
      g.addColorStop(0, `rgba(255,150,70,${0.42 * fh})`); g.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = g; ell(0, -6 * f, 150 * f, 90 * f); ctx.fill();
    }
    ctx.scale(f, f);
    // melted ground + stones
    ctx.fillStyle = 'rgba(52,40,34,.6)'; ell(0, 2, 56, 24); ctx.fill();
    ctx.fillStyle = 'rgba(30,24,22,.55)'; ell(0, 0, 22, 10); ctx.fill();

    const N = 46, front = [], back = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, [px, py] = coilPoint(u);
      const r = 2 + 6.5 * Math.pow(u, 0.7);
      (py < 0 ? back : front).push({ px, py, r });
    }
    const tube = (pts, withBelly) => {
      ctx.fillStyle = dark; for (const q of pts) { ell(q.px, q.py, q.r, q.r); ctx.fill(); }
      ctx.fillStyle = light; for (const q of pts) { ell(q.px, q.py - q.r * 0.25, q.r * 0.7, q.r * 0.6); ctx.fill(); }
      if (withBelly) { ctx.fillStyle = belly; for (const q of pts) { ell(q.px, q.py + q.r * 0.5, q.r * 0.55, q.r * 0.32); ctx.fill(); } }
    };
    const spikes = (pts) => {
      ctx.fillStyle = shade(skin.horn, dorm ? -0.5 : 0);
      for (let i = 2; i < pts.length; i += 3) {
        const q = pts[i];
        ctx.beginPath(); ctx.moveTo(q.px - q.r * 0.35, q.py - q.r * 0.8); ctx.lineTo(q.px, q.py - q.r * 1.6); ctx.lineTo(q.px + q.r * 0.35, q.py - q.r * 0.8); ctx.fill();
      }
    };
    tube(back, false); spikes(back);

    // stones + fire
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.fillStyle = i % 2 ? '#5d6673' : '#4b535e';
      ell(Math.cos(a) * 15, Math.sin(a) * 6.5 - 1, 4, 3); ctx.fill();
    }
    if (dorm) {
      for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(255,90,40,${0.25 + 0.2 * Math.sin(t * 2 + i)})`; ell(-6 + i * 3, -1, 1.6, 1.2); ctx.fill(); }
      ctx.fillStyle = 'rgba(160,170,185,.25)';
      for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; ell(Math.sin(k * 6 + i) * 3, -6 - k * 30, 3 + k * 6, 2 + k * 4); ctx.fill(); }
    } else {
      ctx.globalCompositeOperation = 'lighter';
      const g2 = ctx.createRadialGradient(0, -10, 0, 0, -10, 34 * fh);
      g2.addColorStop(0, 'rgba(255,170,80,.55)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g2; ell(0, -10, 34 * fh, 30 * fh); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      const tongue = (dx, w, h, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(dx - w, -1);
        ctx.quadraticCurveTo(dx - w * 0.9, -h * 0.55, dx + Math.sin(t * 6 + dx) * 2, -h);
        ctx.quadraticCurveTo(dx + w * 0.9, -h * 0.55, dx + w, -1); ctx.closePath(); ctx.fill();
      };
      const fl = (k) => 1 + 0.13 * Math.sin(t * 9 + k) + 0.07 * Math.sin(t * 17 + k * 2);
      tongue(-5, 6, 20 * fh * fl(1), skin.fire[0]);
      tongue(5, 6, 18 * fh * fl(2), skin.fire[0]);
      tongue(0, 8, 28 * fh * fl(3), skin.fire[0]);
      tongue(0, 5, 18 * fh * fl(4), skin.fire[1]);
      tongue(-2, 2.5, 10 * fh * fl(5), '#fffbe8');
    }

    // wing (folded) behind the front coil
    const bob = Math.sin(t * 1.6) * 1.2;
    ctx.fillStyle = dorm ? shade(skin.body[0], -0.55) : shade(skin.body[0], -0.15);
    ctx.beginPath(); ctx.moveTo(16, 4); ctx.lineTo(6, -24 + bob * 0.5); ctx.lineTo(13, -18); ctx.lineTo(20, -27 + bob * 0.5); ctx.lineTo(24, -14); ctx.lineTo(32, -18); ctx.lineTo(28, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = light; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(18, 2); ctx.lineTo(6, -24 + bob * 0.5); ctx.moveTo(20, 2); ctx.lineTo(20, -27 + bob * 0.5); ctx.moveTo(24, 2); ctx.lineTo(32, -18); ctx.stroke();

    tube(front, true);

    // neck + head
    const [nx, ny] = coilPoint(1);
    const hx = 33, hy = -38 + bob;
    const neck = [];
    for (let i = 0; i <= 14; i++) {
      const u = i / 14, cx1 = 46, cy1 = -6;
      const px = (1 - u) * (1 - u) * nx + 2 * (1 - u) * u * cx1 + u * u * hx;
      const py = (1 - u) * (1 - u) * ny + 2 * (1 - u) * u * cy1 + u * u * (hy + 4);
      neck.push({ px, py, r: 8.2 - 2.6 * u });
    }
    tube(neck, true);
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-0.12);
    ctx.strokeStyle = shade(skin.horn, dorm ? -0.5 : 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(3, -5); ctx.quadraticCurveTo(10, -10, 15, -16); ctx.moveTo(6, -3); ctx.quadraticCurveTo(13, -6, 18, -9); ctx.stroke();
    ctx.fillStyle = dark; ell(0, 0, 10, 7.5); ctx.fill();
    ctx.fillStyle = dark; ell(-10, 2.5, 8.5, 5); ctx.fill();
    ctx.fillStyle = light; ell(-2, -2.5, 8, 4); ctx.fill(); ell(-11, 0.5, 6, 2.6); ctx.fill();
    ctx.fillStyle = belly; ell(-9, 5.6, 7, 1.8); ctx.fill();
    ctx.fillStyle = '#1b1012'; ell(-17, 1.5, 1, 0.8); ctx.fill();
    if (dorm) {
      ctx.strokeStyle = '#1b1012'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-3, -0.5, 0, -2); ctx.stroke();
    } else {
      const blink = (t % 5) < 0.12;
      ctx.fillStyle = skin.eye; ctx.shadowColor = skin.fire[1]; ctx.shadowBlur = 8;
      ell(-3, -2, 2.6, blink ? 0.4 : 1.9); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#1b1012'; ell(-3.4, -2, 0.7, blink ? 0.2 : 1.5); ctx.fill();
    }
    ctx.restore();
    ctx.restore();

    // embers
    if (!dorm && Math.random() < 0.35 * fh) T.embers.push({ x: x + rand(-6, 6) * f, y: y - 18 * f, vx: rand(-8, 8), vy: rand(-28, -14) * (0.6 + fh * 0.4), life: rand(1.2, 2.4), age: 0, col: skin.fire[1] });

    // hungry bubble
    if (!dorm && lastR && lastR.net.coal < 0 && S.res.coal / -lastR.net.coal < 45) {
      pill(x + hx * f, y + (hy - 22) * f, 'Hungry!', T.k, 1);
    } else if (dorm) pill(x, y - 46 * f, 'Dormant: needs coal', T.k, 0);
  }

  function drawWalkers(t) {
    const healthy = S.pop - S.sick;
    const posts = Object.keys(S.workers).filter((p) => S.workers[p] > 0 && S.lv[p]);
    if (!posts.length) return [];
    const n = Math.min(healthy, 16);
    const list = [];
    for (let i = 0; i < n; i++) {
      const pid = posts[i % posts.length], P = T.pos[pid];
      const sp = 0.12 + (i % 5) * 0.02;
      const u = (Math.sin(t * sp * Math.PI + i * 1.9) + 1) / 2;
      const sx = T.cx + (P.x - T.cx) * 0.28, sy = T.cy + (P.y - T.cy) * 0.28;
      const x = sx + (P.x - sx) * (0.15 + 0.7 * u) + Math.sin(i * 7) * 5, y = sy + (P.y - sy) * (0.15 + 0.7 * u) + Math.cos(i * 5) * 3;
      list.push({ y, draw: () => {
        const s = T.k * (0.85 + 0.25 * ((y - (T.cy - T.ry)) / (2 * T.ry)));
        ctx.fillStyle = 'rgba(8,16,30,.3)'; ell(x, y + 1, 3.2 * s, 1.2 * s); ctx.fill();
        ctx.fillStyle = i % 3 ? '#3a2d24' : '#2c3a4a'; ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 2.4 * s, 4 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9dcc8'; ell(x, y - 9 * s, 1.8 * s, 1.8 * s); ctx.fill();
        ctx.fillStyle = '#ffb04a'; ell(x + 2.6 * s, y - 4 * s, 0.9 * s, 0.9 * s); ctx.fill();
      } });
    }
    return list;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!S || UI.tab !== 'town' || document.hidden || !VW) return;
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;
    const R = lastR || rates(false);
    const wxType = curWx().type;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, T.top);
    sky.addColorStop(0, '#050a14'); sky.addColorStop(1, '#16273e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, VW, T.top + 2);
    for (const st of T.stars) { ctx.fillStyle = `rgba(220,235,255,${0.35 + 0.35 * Math.sin(t * 1.3 + st.p)})`; ell(st.x, st.y, st.r, st.r); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 2; b++) {
      ctx.strokeStyle = b ? 'rgba(120,90,220,.10)' : 'rgba(80,220,170,.12)'; ctx.lineWidth = 14 + b * 8;
      ctx.beginPath();
      for (let xx = -10; xx <= VW + 10; xx += 12) {
        const yy = T.top * (0.32 + b * 0.16) + Math.sin(xx * 0.012 + t * 0.25 + b * 2) * 10 + Math.sin(xx * 0.03 - t * 0.4) * 4;
        xx === -10 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    T.ridges.forEach((pts, li) => {
      ctx.fillStyle = li ? '#1b2c42' : '#122136';
      ctx.beginPath(); ctx.moveTo(-20, T.top + 2); pts.forEach(([px, py]) => ctx.lineTo(px, py)); ctx.lineTo(VW + 40, T.top + 2); ctx.closePath(); ctx.fill();
      if (!li) {
        ctx.fillStyle = 'rgba(210,228,245,.18)';
        pts.forEach(([px, py], i) => { if (i % 2 === 0) { ctx.beginPath(); ctx.moveTo(px - 6, py + 7); ctx.lineTo(px, py); ctx.lineTo(px + 6, py + 7); ctx.fill(); } });
      }
    });
    // ground
    const gr = ctx.createLinearGradient(0, T.top, 0, VH);
    gr.addColorStop(0, '#4d6580'); gr.addColorStop(0.5, '#6f89a3'); gr.addColorStop(1, '#8aa3bb');
    ctx.fillStyle = gr; ctx.fillRect(0, T.top, VW, VH - T.top);
    // drifts
    ctx.fillStyle = 'rgba(230,240,250,.07)';
    for (let i = 0; i < 6; i++) { ell((i * 97 + 40) % VW, T.top + 30 + i * (VH - T.top) / 6, 90, 10); ctx.fill(); }
    // trodden paths
    ctx.strokeStyle = 'rgba(70,82,100,.28)'; ctx.lineCap = 'round';
    for (const p of DATA.plots) {
      if (!S.lv[p.id]) continue;
      const P = T.pos[p.id];
      ctx.lineWidth = 7 * P.s; ctx.beginPath(); ctx.moveTo(T.cx, T.cy); ctx.lineTo(P.x, P.y); ctx.stroke();
    }

    // depth-sorted scene
    const items = DATA.plots.map((p) => ({ y: T.pos[p.id].y, draw: () => drawPlot(p.id, now, t) }));
    items.push({ y: T.cy, draw: () => drawWyrm(T.cx, T.cy, t) });
    items.push(...drawWalkers(t));
    items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());

    // embers
    ctx.globalCompositeOperation = 'lighter';
    for (const e of T.embers) {
      e.age += dt; e.x += e.vx * dt; e.y += e.vy * dt; e.vx += Math.sin(t * 3 + e.y) * 6 * dt;
      ctx.globalAlpha = clamp(1 - e.age / e.life, 0, 1);
      ctx.fillStyle = e.col; ell(e.x, e.y, 1.3, 1.3); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    T.embers = T.embers.filter((e) => e.age < e.life);
    UI.floaters = UI.floaters.filter((f) => now - f.t0 < 1600);

    // cold vignette
    const coldA = { Comfortable: 0.04, Chilly: 0.14, Cold: 0.28, Freezing: 0.42 }[R.band.name] + (wxType === 'blizzard' ? 0.1 : wxType === 'deepfreeze' ? 0.16 : 0);
    const vg = ctx.createRadialGradient(T.cx, T.cy, Math.min(VW, VH) * 0.25, T.cx, T.cy, Math.max(VW, VH) * 0.75);
    vg.addColorStop(0, 'rgba(120,175,240,0)'); vg.addColorStop(1, `rgba(120,175,240,${coldA})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (wxType === 'blizzard' || wxType === 'deepfreeze') { ctx.fillStyle = 'rgba(205,225,250,.10)'; ctx.fillRect(0, 0, VW, VH); }

    // snow
    const cfg = { clear: [45, 0.02, 1], snow: [120, 0.05, 1], blizzard: [170, 0.45, 1.8], deepfreeze: [110, 0.08, 0.6] }[wxType];
    for (let i = 0; i < cfg[0]; i++) {
      const fl = T.flakes[i];
      fl.y += (0.04 + 0.06 * fl.z) * cfg[2] * dt;
      fl.x += (cfg[1] * fl.z + Math.sin(t + fl.p) * 0.01) * dt;
      if (fl.y > 1) { fl.y -= 1; fl.x = Math.random(); }
      if (fl.x > 1) fl.x -= 1;
      const r = (0.6 + 1.6 * fl.z) * (wxType === 'blizzard' ? 1.1 : 1);
      ctx.fillStyle = `rgba(240,248,255,${0.35 + 0.5 * fl.z})`;
      if (wxType === 'blizzard') { ctx.fillRect(fl.x * VW, fl.y * VH, r * 5 * fl.z + 2, r * 0.7); }
      else { ell(fl.x * VW, fl.y * VH, r, r); ctx.fill(); }
    }
  }

  function hitTest(px, py) {
    const W = T.pos.hearth, f = stageOf(S.lv.hearth).size * T.k * 1.3;
    if (Math.hypot(px - W.x, (py - (W.y - 12 * f)) * 1.1) < 44 * f + 10) return 'hearth';
    let best = null, bd = 1e9;
    for (const p of DATA.plots) {
      const P = T.pos[p.id];
      const d = Math.hypot(px - P.x, py - (P.y - 14 * P.s));
      if (d < 34 * P.s && d < bd) { best = p.id; bd = d; }
    }
    return best;
  }

  // ======================================================================
  // Input + loop
  // ======================================================================
  let down = null;
  cv.addEventListener('pointerdown', (e) => { down = { x: e.offsetX, y: e.offsetY }; });
  cv.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 12) { down = null; return; }
    down = null;
    const pid = hitTest(e.offsetX, e.offsetY);
    if (!pid) return;
    if (pid !== 'hearth' && S.lv.hearth < PLOT[pid].unlock) {
      toast(`The ${plotName(pid)} unlocks at Hearthwyrm Lv ${PLOT[pid].unlock}.`, 'cold');
      return;
    }
    ACT.plot(pid);
    renderAll(true);
  });

  document.addEventListener('pointerdown', () => { UI.pointerDown = true; clearTimeout(UI.pdTimer); }, true);
  const release = () => { clearTimeout(UI.pdTimer); UI.pdTimer = setTimeout(() => { UI.pointerDown = false; }, 120); };
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !S) return;
    const fn = ACT[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(el.dataset.arg, el);
    save();
    renderAll(true);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && UI.sheet && UI.sheet.kind !== 'intro') { ACT.close(); renderAll(true); }
  });

  let lastReal = Date.now(), lastSave = Date.now(), uiTick = 0;
  function loop() {
    const now = Date.now();
    const dt = (now - lastReal) / 1000;
    lastReal = now;
    if (dt > 30) {
      const o = catchUp(dt);
      if (o.seconds > 60) UI.sheet = { kind: 'offline', data: o };
    } else if (dt > 0) {
      let left = dt;
      while (left > 0) { const d = Math.min(1, left); tick(d); left -= d; }
    }
    uiTick++;
    renderAll(false);
    if (now - lastSave > 5000) { save(); lastSave = now; }
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else loop(); });
  window.addEventListener('pagehide', save);
  window.addEventListener('resize', resize);

  // ======================================================================
  // Boot
  // ======================================================================
  function boot(hot) {
    const fromHot = hot && hot.S ? mergeDefaults(newState(), hot.S) : null;
    S = fromHot || load() || newState();
    if (!fromHot && S.time === 0) autoAssign();
    let offline = null;
    if (!fromHot) {
      const away = (Date.now() - (S.savedAt || Date.now())) / 1000;
      if (away > 60 && S.seenIntro) offline = catchUp(away);
    }
    ensureWeather();
    lastReal = Date.now();
    resize();
    if (!S.seenIntro) UI.sheet = { kind: 'intro' };
    else if (offline) UI.sheet = { kind: 'offline', data: offline };
    renderAll(true);
    setInterval(loop, 250);
    requestAnimationFrame(frame);
    if (window.ResizeObserver) new ResizeObserver(resize).observe($('#stage'));
  }

  // Debug + test hooks for designers: kindlehold.advance(600) fast-forwards 10 minutes.
  window.kindlehold = {
    state: () => S,
    advance(sec) { let l = sec; while (l > 0) { const d = Math.min(1, l); tick(d); l -= d; } renderAll(true); },
    grant(g) { grant(g); renderAll(true); },
    act(name, arg) { ACT[name](arg); renderAll(true); },
    data: DATA,
  };

  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ S }));
  if (hot && hot.ready) hot.ready(boot);
  else boot((hot && hot.data) || {});
})();
