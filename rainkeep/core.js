/*
 * Rainkeep core: shared namespace, state, simulation, combat and core actions.
 * Other scripts (ui.js, town.js, town3d.js, events.js, caravan.js, world.js) plug in through
 * KH.hooks, KH.on/KH.emit and KH.ACT. Content and tuning live in data.js.
 */
'use strict';
(function () {
  const KH = (window.KH = window.KH || {});

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
    if (n >= 1e9) s = (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B';
    else if (n >= 1e6) s = (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
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
  // local calendar day number (resets at local midnight)
  const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  KH.u = { $, clamp, rand, pick, pad, sum, fmt, fmtTime, fmtTemp, perMin, icon, esc, shade, today, seeded };

  // ======================================================================
  // Events + hooks
  // ======================================================================
  const listeners = {};
  KH.on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
  KH.emit = (ev, data) => {
    for (const fn of listeners[ev] || []) {
      try { fn(data); } catch (e) { console.error(e); }
    }
  };
  KH.hooks = { defaults: [], tick: [], bonus: [], power: [], boot: [] };
  KH.bonus = (key) => KH.hooks.bonus.reduce((a, f) => a + (f(key) || 0), 0);
  const toast = (...a) => KH.toast && KH.toast(...a);

  // ======================================================================
  // Lookups
  // ======================================================================
  const HERO = {};
  DATA.heroes.forEach((h) => { HERO[h.id] = h; });
  const PLOT = { wyrm: { id: 'wyrm', type: 'wyrm', unlock: 1 } };
  DATA.plots.forEach((p) => { PLOT[p.id] = p; });
  const PROD = { stone: 'quarry', food: 'grove', water: 'well', copper: 'mine' };
  const TECH_FOR = { stone: 'chisels', food: 'irrigation', water: 'boring', copper: 'smelt' };
  const RES = ['stone', 'food', 'water', 'copper'];
  const ICON = { stone: 'i-stone', food: 'i-food', water: 'i-water', copper: 'i-copper', starglass: 'i-gem', beacons: 'i-beacon', journals: 'i-journal', sunsteel: 'i-sunsteel', glory: 'i-glory' };
  const NAME = { stone: 'Stone', food: 'Food', water: 'Water', copper: 'Copper', starglass: 'Starglass', beacons: 'Beacon Tokens', journals: 'Field Journals', sunsteel: 'Sunsteel', glory: 'Glory' };
  const SHORT = {
    wyrm: 'Rainwyrm', well: 'Deep Well', quarry: 'Quarry', shelter1: 'Houses', shelter2: 'Houses',
    infirmary: 'Healers', archive: 'Archive', watchtower: 'Watchtower', barracks: 'Barracks', grove: 'Date Grove',
    mine: 'Copper Mine', hall: 'Caravan Hall', storehouse: 'Storehouse', forge: 'Forge',
  };
  const plotName = (pid) => DATA.buildings[PLOT[pid].type].name + (pid === 'shelter2' ? ' II' : '');
  Object.assign(KH, { HERO, PLOT, PROD, RES, ICON, NAME, SHORT, plotName });

  // ======================================================================
  // State
  // ======================================================================
  let S = null;
  Object.defineProperty(KH, 'S', { get: () => S });
  const UI = (KH.UI = {
    tab: 'town', sub: { world: 'map', heroes: 'roster' }, sheet: null, sheetQueue: [], pointerDown: false,
    trainType: 'guard', trainN: 10, confirmReset: false, upgradable: new Set(), questTarget: null,
    battle: null, lastToast: {}, floaters: [], petT: 0,
  });

  function newState() {
    const st = DATA.start;
    const s = {
      v: 2, time: 0, savedAt: Date.now(),
      res: { ...st.res }, starglass: st.starglass, beacons: st.beacons, journals: st.journals, sunsteel: 0, glory: 0,
      pop: st.survivors, sick: 0, acc: { sick: 0, heal: 0, lost: 0, arrive: 0, leave: 0 },
      workers: { quarry: 0, grove: 0, well: 0, mine: 0 }, autoWork: true,
      lv: { wyrm: 0 }, mist: 'steady', autoMist: false, dormant: false, thirsty: false,
      builds: [], builders: 1, research: null, tech: {}, training: null,
      troops: { guard: 0, bow: 0, lancer: 0 },
      heroes: {}, squad: [], stewards: {},
      stage: 1, patrolSince: 0,
      quest: 0, pass: { xp: 0, premium: false, free: [], prem: [], season: 1, end: 0 },
      pity: 0, firstPull: true,
      stipend: { left: 0, last: -1 },
      lvPack: { lvl: 0, until: 0, bought: [], seen: true },
      skins: { owned: ['river'], on: 'river' },
      bought: {}, boughtDay: {}, growthClaimed: [], spentUsd: 0,
      items: {},
      wx: [], storm: null,
      wyrm: { name: st.wyrmName, element: null, petDay: -1, lastPet: 0 },
      story: { chapters: [], forms: [1] },
      settings: { sfx: true, music: true, haptics: true, notify: true, liveBattle: true, autoBattle: false, battleSpeed: 1 },
      stats: {
        pulls: 0, trained: 0, researched: 0, upgrades: 0, wins: 0, pets: 0, gathers: 0, ruins: 0, beasts: 0,
        donations: 0, dutyChests: 0, raidAttacks: 0, raidsRepelled: 0, camps: 0, cleanStorms: 0, sickTotal: 0,
        raidKills: 0, warWins: 0, gathered: 0,
      },
      endingSeen: false, ending2Seen: false, ending3Seen: false, seenIntro: false,
    };
    DATA.plots.forEach((p) => { s.lv[p.id] = 0; });
    Object.assign(s.lv, st.levels);
    DATA.techs.forEach((t) => { s.tech[t.id] = 0; });
    st.heroes.forEach((id) => { s.heroes[id] = { lvl: 1, stars: 1, shards: 0 }; });
    s.squad = st.heroes.slice(0, 3);
    KH.hooks.defaults.forEach((f) => f(s));
    return s;
  }
  KH.newState = newState;

  function mergeDefaults(def, saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return saved === undefined ? def : saved;
    const out = { ...def };
    for (const k of Object.keys(saved)) {
      const d = def[k], v = saved[k];
      out[k] = d && typeof d === 'object' && !Array.isArray(d) && v && typeof v === 'object' && !Array.isArray(v) ? mergeDefaults(d, v) : v;
    }
    return out;
  }
  KH.mergeDefaults = mergeDefaults;

  function save() {
    if (!S) return;
    S.savedAt = Date.now();
    try { localStorage.setItem(DATA.saveKey, JSON.stringify(S)); } catch (e) { /* storage unavailable: play continues unsaved */ }
  }
  // Saves from before keep life (2.1) point at quest numbers that have since moved: step over the quests added then.
  function migrate(obj) {
    if (!obj.keep && typeof obj.quest === 'number') for (const i of DATA.questsAdded21) if (obj.quest >= i) obj.quest++;
    // and before 3.0 (no Forge state yet): step over the Forge, Spire and Duels quests
    if (!obj.gear && typeof obj.quest === 'number') for (const i of DATA.questsAdded30) if (obj.quest >= i) obj.quest++;
    return obj;
  }
  function load() {
    try {
      const raw = localStorage.getItem(DATA.saveKey);
      if (raw) return mergeDefaults(newState(), migrate(JSON.parse(raw)));
    } catch (e) { /* corrupt or blocked storage: start fresh */ }
    return null;
  }
  // Swap the whole state while keeping the object identity other scripts hold.
  function replaceState(obj) {
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, obj);
  }
  KH.save = save;
  KH.replaceState = replaceState;
  KH.exportSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  KH.importSave = (code) => {
    const obj = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!obj || typeof obj !== 'object' || !obj.lv || !obj.res) throw new Error('not a Rainkeep save');
    replaceState(mergeDefaults(newState(), migrate(obj)));
    S.wx = [];
    ensureWeather();
    save();
  };

  // ======================================================================
  // Derived values
  // ======================================================================
  const stageOf = (L) => DATA.wyrm.stages.filter((s) => L >= s.from).pop() || DATA.wyrm.stages[0];
  const stageIndex = (L) => DATA.wyrm.stages.indexOf(stageOf(L));
  const mist = () => DATA.wyrm.mist[S.mist] || DATA.wyrm.mist.steady;
  const slotsOf = (pid) => (S.lv[pid] ? DATA.workerSlots(S.lv[pid]) : 0);
  const housing = () => ['shelter1', 'shelter2'].reduce((a, p) => a + (S.lv[p] ? DATA.buildings.shelter.housing(S.lv[p]) : 0), 0);
  const curWx = () => S.wx.find((w) => w.start <= S.time && S.time < w.end) || S.wx[0] || { type: 'clear', start: 0, end: 0 };
  const forecastRange = () => 90 + 45 * S.lv.watchtower + 30 * (S.tech.mirrors || 0) + KH.bonus('forecast');
  const coolOf = (L) => DATA.wyrm.cool(L) * mist().cool;
  const coolAt = (L) => Math.round(coolOf(L));
  // what the wyrm drinks; survivors drink on top of this (see rates)
  const drinkRate = () => DATA.wyrm.drink(S.lv.wyrm) * mist().drink;
  const marchCap = () => DATA.marchCap(S.lv.barracks);
  const troopCap = () => marchCap() * 2;
  // Day and night: f is the phase of the day (0..1), night 0 (midday) .. 1 (deep night).
  function dayNight(t = S.time) {
    const D = DATA.day, f = (((t + D.offset) / D.length) % 1 + 1) % 1, K = D.keys;
    let i = 0;
    while (i < K.length - 2 && f > K[i + 1][0]) i++;
    const k = clamp((f - K[i][0]) / Math.max(1e-6, K[i + 1][0] - K[i][0]), 0, 1), e = k * k * (3 - 2 * k);
    const night = K[i][1] + (K[i + 1][1] - K[i][1]) * e;
    const name = night > 0.6 ? 'Night' : night > 0.05 ? (f < 0.3 ? 'Dawn' : 'Dusk') : 'Day';
    // seconds until the next sunrise (f = 0.07) or nightfall (f = 0.72)
    const goal = name === 'Night' || name === 'Dawn' ? 0.07 : 0.72;
    const next = (((goal - f) % 1 + 1) % 1) * D.length;
    return { f, night, name, next, shift: D.noon + (D.night - D.noon) * night };
  }
  // now=false gives the weather's own temperature (used for the forecast list)
  const outsideTemp = (wx, now = true) => wx.temp + wx.scorch * (S.lv.wyrm - 1) + (now ? dayNight().shift : 0);
  const troopMult = () => Math.pow(1 + DATA.troopLevelBonus, Math.max(0, S.lv.barracks - 1)) * (1 + 0.06 * (S.tech.drills || 0) + KH.bonus('troop'));
  const protectOf = () => (S.lv.storehouse ? Math.round(DATA.buildings.storehouse.protect(S.lv.storehouse) * (1 + KH.bonus('protect'))) : 0);

  function stewardVal(kind) {
    const id = S.stewards[kind];
    if (!id || !S.heroes[id]) return 0;
    const post = DATA.stewardPosts[kind];
    if (!S.lv[post.plot]) return 0;
    return stewardOf(id);
  }
  // a hero's steward bonus: grows 20% per star, and with a Hero Tale's choice (story.js)
  const stewardOf = (id) => HERO[id].steward.val * (1 + 0.2 * ((S.heroes[id] ? S.heroes[id].stars : 1) - 1)) * (1 + (KH.taleBoost ? KH.taleBoost(id, 'steward') : 0));
  function townTemp(wx, offline) {
    return outsideTemp(wx, !offline) - (S.dormant ? 0 : coolOf(S.lv.wyrm)) - (S.tech.shade || 0) - stewardVal('cool') - KH.bonus('cool');
  }
  // lower is better: the first band whose max the town stays under
  const comfortOf = (t) => DATA.comfort.find((b) => t <= b.max);
  function workerRate(pid) {
    const L = S.lv[pid];
    if (!L) return 0;
    const b = DATA.buildings[PLOT[pid].type];
    return b.perWorker * (1 + DATA.workerGrowth * (L - 1)) * Math.max(0.2, 1 + 0.12 * (S.tech[TECH_FOR[b.prod]] || 0) + stewardVal(b.prod) / 100 + KH.bonus('prod') + KH.bonus(`prod_${b.prod}`));
  }
  function rates(offline) {
    const wx = offline ? DATA.weather.clear : DATA.weather[curWx().type];
    const temp = townTemp(wx, offline);
    const band = comfortOf(temp);
    const healthy = S.pop > 0 ? (S.pop - S.sick) / S.pop : 0;
    const prod = {};
    for (const r of RES) {
      const pid = PROD[r];
      const b = DATA.buildings[PLOT[pid].type];
      const w = Math.min(S.workers[pid] || 0, slotsOf(pid));
      prod[r] = workerRate(pid) * w * healthy * band.prod * (b.outdoor ? Math.min(1, wx.outdoor + KH.bonus('outdoor')) : 1) * (1 + KH.bonus(`mult_${r}`));
    }
    const eat = S.pop * DATA.foodPerSurvivor;
    const thirst = S.pop * DATA.waterPerSurvivor * Math.max(0.1, 1 - KH.bonus('drinkCut'));
    const burn = S.dormant ? 0 : drinkRate();
    const net = { stone: prod.stone, food: prod.food - eat, water: prod.water - burn - thirst, copper: prod.copper };
    return { wx, temp, band, healthy, prod, eat, thirst, burn, net };
  }
  function healRate(temp) {
    const base = temp <= DATA.comfort[2].max && !S.thirsty ? DATA.baseRecovery : DATA.baseRecovery * 0.3;
    const inf = S.lv.infirmary ? DATA.infirmaryRate * S.lv.infirmary * (1 + 0.3 * (S.tech.medicine || 0) + stewardVal('heal') / 100) : 0;
    return (base + inf) * (1 + KH.bonus('heal'));
  }

  // costs
  // three bends: a building's own growth to Lv 10, steeper late growth to Lv 15, gentler Act II growth after
  function levelCurve(growth, late, to, end = late) {
    const L = DATA.lateLevel, E = DATA.endLevel;
    return Math.pow(growth, Math.min(to, L) - 1) * Math.pow(late, clamp(to - L, 0, E - L)) * Math.pow(end, Math.max(0, to - E));
  }
  function buildCost(pid, to) {
    const b = DATA.buildings[PLOT[pid].type];
    const m = levelCurve(b.growth, DATA.lateCostGrowth, to, DATA.endCostGrowth);
    const c = {};
    for (const k in b.cost) c[k] = Math.round(b.cost[k] * m);
    // higher levels draw on every resource (mudbrick needs water), so water, food and copper stay useful
    if (to >= 3) {
      c.water = Math.max(c.water || 0, Math.round((c.stone || 0) * 0.45));
      c.food = Math.max(c.food || 0, Math.round((c.stone || 0) * 0.35));
    }
    if (to >= DATA.copperShareFrom) c.copper = (c.copper || 0) + Math.round((c.stone || 0) * (to > DATA.endLevel ? 0.13 : 0.22));
    return c;
  }
  const buildTime = (pid, to) => Math.round((DATA.buildings[PLOT[pid].type].time * levelCurve(DATA.buildTimeGrowth, DATA.lateTimeGrowth, to, DATA.endTimeGrowth)) / (1 + KH.bonus('build')));
  const maxLevel = () => DATA.wyrm.maxLevel;
  function upgradeBlock(pid) {
    const L = S.lv[pid], to = L + 1;
    if (L >= maxLevel()) return 'Max level reached.';
    if (pid === 'wyrm') {
      for (const r of DATA.wyrmReqs(to)) if (S.lv[r.plot] < r.lvl) return `Needs ${plotName(r.plot)} Lv ${r.lvl}.`;
    } else {
      if (S.lv.wyrm < PLOT[pid].unlock) return `Unlocks at Rainwyrm Lv ${PLOT[pid].unlock}.`;
      if (to > S.lv.wyrm) return `Grow the Rainwyrm to Lv ${to} first.`;
    }
    if (S.builds.some((b) => b.plot === pid)) return 'Already under construction.';
    return null;
  }
  const have = (k) => (k in S.res ? S.res[k] : k in DATA.items ? S.items[k] || 0 : S[k] || 0);
  const canAfford = (c) => Object.entries(c).every(([k, v]) => have(k) >= v);
  function pay(c) {
    for (const [k, v] of Object.entries(c)) {
      if (k in S.res) S.res[k] -= v;
      else if (k in DATA.items) S.items[k] = (S.items[k] || 0) - v;
      else S[k] -= v;
    }
  }
  const techCurve = (g, late, lvl) => Math.pow(g, Math.min(lvl, DATA.techLateLevel)) * Math.pow(late, Math.max(0, lvl - DATA.techLateLevel));
  const techCost = (t, lvl) => Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, Math.round(v * techCurve(DATA.techGrowth, DATA.techLateGrowth, lvl))]));
  const techTime = (t, lvl) => Math.round((t.time * techCurve(DATA.techTimeGrowth, DATA.techLateTimeGrowth, lvl)) / (1 + KH.bonus('build')));
  const techMax = () => Math.min(DATA.techMaxLevel, S.lv.archive);

  // ======================================================================
  // Heroes + combat
  // ======================================================================
  function heroStats(id) {
    const h = S.heroes[id], r = DATA.rarities[HERO[id].rarity];
    const lvl = KH.sparLevel ? KH.sparLevel(id) : h.lvl; // a hero in the Sparring Ring fights at the squad's level (spar.js)
    const m = (1 + 0.09 * (lvl - 1)) * (1 + 0.15 * (h.stars - 1)) * (1 + 0.05 * (S.tech.tactics || 0)) * (1 + (KH.heirloomBoost ? KH.heirloomBoost(id, 'stat') : 0)) * (1 + (KH.awakenBoost ? KH.awakenBoost(id, 'stat') : 0));
    const tl = (k) => (1 + (KH.talentBoost ? KH.talentBoost(id, k) : 0)) * (1 + (KH.charmBoost ? KH.charmBoost(id, k) : 0)); // hero talents (talents.js), relic charms (charms.js)
    return { atk: r.atk * m * tl('atk'), def: r.def * m * tl('def'), hp: r.hp * m * tl('hp') };
  }
  const skillScale = (id) => (1 + DATA.skillPerStar * ((S.heroes[id] ? S.heroes[id].stars : 1) - 1)) * (1 + (KH.taleBoost ? KH.taleBoost(id, 'skill') : 0)) * (1 + (KH.heirloomBoost ? KH.heirloomBoost(id, 'skill') : 0)) * (1 + (KH.awakenBoost ? KH.awakenBoost(id, 'skill') : 0)) * (1 + (KH.talentBoost ? KH.talentBoost(id, 'skill') : 0)) * (1 + (KH.charmBoost ? KH.charmBoost(id, 'skill') : 0));
  function skillText(id) {
    const d = HERO[id], k = skillScale(id);
    return d.skill.desc.replace(/\{(\w+)\}/g, (_, key) => `${Math.round(d.skill.fx[key] * k * 100)}%`);
  }
  // stars, Rainwyrm levels past 9 and the Deepspring's Springsong ranks (deepspring.js) each raise it
  const heroCap = (id) => DATA.heroLevelCapPerStar * S.heroes[id].stars + DATA.heroCapPerWyrm * Math.max(0, S.lv.wyrm - 9) + KH.bonus('heroCap') + (KH.awakenBoost ? KH.awakenBoost(id, 'cap') : 0);
  const statPower = (s) => Math.round(s.atk * 2 + s.def * 2 + s.hp / 5);
  const heroPower = (id) => statPower(heroStats(id));
  function unitPower(type) {
    const t = DATA.troops[type], m = troopMult() * (KH.rankMult ? KH.rankMult(type) : 1);
    return statPower({ atk: t.atk * m, def: t.def * m, hp: t.hp * m });
  }
  function counterMult(c, e) {
    if (!e) return 1;
    if (DATA.counters[c] === e) return 1.2;
    if (DATA.counters[e] === c) return 0.9;
    return 1;
  }
  // lead (a troop class) fills DATA.formation.lead of the march first when there are enough of it; the rest
  // come in proportion (and more of the lead if the others run short)
  function capTroops(pool, cap, lead) {
    const total = sum(pool);
    if (!lead || !(lead in pool)) {
      if (total <= cap) return { ...pool };
      const f = cap / total, out = {};
      for (const k in pool) out[k] = Math.floor(pool[k] * f);
      return out;
    }
    const n = Math.min(cap, total), out = {}, others = Object.keys(pool).filter((k) => k !== lead);
    out[lead] = Math.min(pool[lead], Math.floor(n * DATA.formation.lead));
    const rest = others.reduce((a, k) => a + pool[k], 0), room = n - out[lead];
    const f = rest > 0 ? Math.min(1, room / rest) : 0;
    for (const k of others) out[k] = Math.floor(pool[k] * f);
    out[lead] = Math.min(pool[lead], n - others.reduce((a, k) => a + out[k], 0));
    return out;
  }
  const marchTroops = () => capTroops(S.troops, marchCap(), S.formation);
  // Squad heroes can be away leading a march on the Dunes.
  const squadHome = () => S.squad.filter((id) => S.heroes[id] && !(KH.heroBusy && KH.heroBusy(id)));
  function teamStats(enemyCls, opts = {}) {
    let atk = 0, def = 0, hp = 0;
    const fx = { atk: 0, dr: 0, burst: 0, heal: 0, pierce: 0 };
    const heroes = opts.heroes || squadHome();
    // hero talents (talents.js): leading a troop class, a bigger counter edge, a stronger Torrent
    const tt = KH.talentTeam ? KH.talentTeam(heroes) : { lead: {}, counter: {}, torrent: 0 };
    const edge = (c) => counterMult(c, enemyCls) + (enemyCls && DATA.counters[c] === enemyCls ? tt.counter[c] || 0 : 0);
    for (const id of heroes) {
      if (!S.heroes[id]) continue;
      const s = heroStats(id);
      atk += s.atk * edge(HERO[id].cls);
      def += s.def; hp += s.hp;
      const k = skillScale(id);
      for (const [key, v] of Object.entries(HERO[id].skill.fx)) fx[key] += v * k;
    }
    const m = opts.troops || marchTroops(), um = troopMult();
    // Warden's Gear (forge.js): squad-wide bonuses plus a bonus per troop class
    const gb = !opts.noGear && KH.gearBonus ? KH.gearBonus() : null;
    for (const type in m) {
      // troop ranks (ranks.js): the class's average over recruits, Veterans, Elites and Champions
      const t = DATA.troops[type], tb = (gb ? 1 + (gb.troop[type] || 0) : 1) * (KH.rankMult ? KH.rankMult(type) : 1) * (1 + (tt.lead[type] || 0));
      atk += m[type] * t.atk * um * tb * edge(type);
      def += m[type] * t.def * um * tb; hp += m[type] * t.hp * um * tb;
    }
    atk *= 1 + fx.atk + KH.bonus('teamAtk') + (opts.atkBonus || 0) + (gb ? gb.atk : 0);
    def *= 1 + (opts.defBonus || 0) + (gb ? gb.def : 0);
    hp *= 1 + (gb ? gb.hp : 0);
    // hero kinships (kinships.js): two heroes whose stories are tied, fighting side by side
    const kb = KH.kinTeam ? KH.kinTeam(heroes) : null;
    if (kb) { atk *= 1 + kb.atk; def *= 1 + kb.def; hp *= 1 + kb.hp; fx.dr += kb.dr; }
    fx.dr = Math.min(fx.dr, 0.4);
    fx.pierce = Math.min(fx.pierce, 0.5);
    fx.torrent = tt.torrent + (kb ? kb.torrent : 0);
    return { atk, def, hp, fx, troops: m, heroes };
  }
  const chapterOf = (n) => DATA.chapters.filter((c) => n >= c.from).pop();
  function enemyGrowth(n, g1, g2, g3) {
    const E = DATA.enemy;
    const a = Math.min(n, E.lateFrom) - 1;
    const b = clamp(n - E.lateFrom, 0, DATA.actOneStage - E.lateFrom);
    const c = Math.max(0, n - DATA.actOneStage);
    return Math.pow(g1, a) * Math.pow(g2, b) * Math.pow(g3, c);
  }
  // Stats for "a foe as strong as expedition stage n" (fractional n allowed).
  function foeStats(n, mult = 1) {
    const E = DATA.enemy;
    return {
      atk: E.atk * enemyGrowth(n, E.gAtk, E.lAtk, E.endAtk) * mult,
      def: E.def * enemyGrowth(n, E.gDef, E.lDef, E.endDef) * mult,
      hp: E.hp * enemyGrowth(n, E.gHp, E.lHp, E.endHp) * mult,
    };
  }
  // how strong expedition stage n fights: past Act II each stage climbs a little less steeply
  const stageLevel = (n) => (n <= DATA.actTwoStage ? n : DATA.actTwoStage + (n - DATA.actTwoStage) * DATA.enemy.act3Ease);
  function enemyFor(n) {
    const ch = chapterOf(n), depth = n - DATA.finalStage, FB = DATA.farSouthBosses;
    // past the story, every tenth stage is one of the Far South's named warlords, a rank harder each time round
    const far = depth > 0 && depth % 10 === 0 ? FB[(depth / 10 - 1) % FB.length] : null, round = far ? Math.floor((depth / 10 - 1) / FB.length) : 0;
    const boss = DATA.bosses[n] || (far && [round ? `${far[0]} ${['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][Math.min(8, round - 1)]}` : far[0], far[1]]);
    const foe = boss || ch.foes[(n - ch.from) % ch.foes.length];
    const isBoss = !!boss;
    const name = depth > 0 && !far ? `${foe[0]} · depth ${depth}` : foe[0];
    const traits = traitsFor(n, isBoss), st = foeStats(stageLevel(n), isBoss ? DATA.enemy.boss : 1);
    if (traits.length) { const T = DATA.traits, e = traits.reduce((m, t) => m * (T.list[t].ease != null ? T.list[t].ease : T.ease), 1); for (const k of ['atk', 'def', 'hp']) st[k] *= e; if (traits.includes('armored')) st.def *= T.list.armored.def; }
    return { n, name, cls: foe[1], boss: isBoss, chapter: ch.name, act: ch.act || (n > DATA.finalStage ? 4 : 1), traits, ...st };
  }
  // foe traits (DATA.traits): none before stage 16, then one each (two for a boss), turning through the five so
  // neighbouring stages differ
  function traitsFor(n, boss) {
    const T = DATA.traits, O = T.order;
    if (n < T.from) return [];
    const a = O[(n * 2 + Math.floor(n / O.length)) % O.length];
    if (!boss) return [a];
    return [a, O[(O.indexOf(a) + 2) % O.length]];
  }
  function stageRewards(n) {
    const boss = !!DATA.bosses[n] || (n > DATA.finalStage && n % 10 === 0);
    // Act III and the endless Far South
    if (n > DATA.actTwoStage) {
      const r = { starglass: boss ? 120 : 25, journals: 25 + Math.round(n / 2), stone: 60 * n, food: 40 * n, copper: 10 * n, sunsteel: boss ? 60 : 15 };
      if (boss && n <= DATA.finalStage) r.beacons = 2;
      if (n > DATA.finalStage) r.tideglass = boss ? DATA.deepspring.farSouth.boss : DATA.deepspring.farSouth.stage;
      return r;
    }
    if (n > DATA.actOneStage) {
      const r = { starglass: boss ? 120 : 30, journals: 10 + 2 * n, stone: 60 * n, food: 40 * n, copper: 9 * n, sunsteel: boss ? 50 : 12 };
      if (boss) r.beacons = 2;
      return r;
    }
    const r = { starglass: boss ? 100 : 25, journals: 5 + 2 * n, stone: 60 * n, food: 40 * n };
    if (n > 30) r.copper = 8 * n;
    if (boss) r.beacons = n >= 30 ? 2 : 1;
    return r;
  }
  const dmgOf = (a, d) => (a * 3 * a) / (a + d);
  // ======================================================================
  // Battle engine: rounds of blows, the wyrm's breath, hero skills and the foe's wind-ups.
  // simulateBattle plays a whole battle with the auto-battle policy; the live battle screen
  // (ui.js) steps the same engine round by round with the player's taps.
  // ======================================================================
  const skillKind = (id) => Object.keys(HERO[id].skill.fx)[0];
  function newBattle(team, foe, opts = {}) {
    const BT = DATA.battle;
    return {
      // opts.startHp: a squad already worn down (the Crossing carries its losses from fight to fight)
      team, foe, opts, th: opts.startHp != null ? clamp(opts.startHp, 1, team.hp) : team.hp, eh: foe.hp, r: 0, rounds: [], over: false, win: false, timeout: false,
      fdef: foe.def * (1 - team.fx.pierce),
      // opts.breathHp: size the breath from a different foe's health (the Leviathan's is far too big to measure by)
      breath: !S.dormant && !opts.noBreath ? (opts.breathHp || foe.hp) * DATA.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath') + (opts.breathBonus || 0) + (team.fx.torrent || 0)) : 0,
      breathUsed: false,
      skills: (team.heroes || []).filter((id) => S.heroes[id]).map((id) => ({ id, kind: skillKind(id), charge: DATA.battle.startCharge + (KH.talentBoost ? KH.talentBoost(id, 'charge') : 0), k: 0.85 + 0.15 * skillScale(id) })),
      guard: 0, sunder: 0,
      windup: (foe.boss ? BT.boss.first : BT.windupFirst) === 1, // the coming round's blow is a wind-up
      // foe traits: a sand-shell's rounds left, a frenzy's build-up, venom's ward rounds left
      traits: foe.traits || [], shell: (foe.traits || []).includes('shell') ? DATA.traits.list.shell.rounds : 0, rage: 0, ward: 0,
    };
  }
  const roundHit = (st) => dmgOf(st.team.atk, st.fdef * (st.sunder ? 1 - DATA.battle.skills.pierce.cut * (st.traits && st.traits.includes('armored') ? 2 : 1) : 1)) * (st.shell > 0 ? 1 - DATA.traits.list.shell.cut : 1);
  // acts: { breath: true, skills: [index, ...] } applied before the round's blows
  function battleStep(st, acts = {}) {
    if (st.over) return null;
    const BT = DATA.battle, rec = { acts: [] };
    const ready = (sk) => sk.charge >= BT.charge;
    if (acts.breath && st.breath > 0 && !st.breathUsed) {
      st.breathUsed = true;
      const broke = st.windup;
      st.eh = Math.max(0, st.eh - st.breath);
      if (broke) st.windup = false;
      const cracked = st.shell > 0, calmed = st.rage > 0 && st.traits.includes('frenzy');
      st.shell = 0; if (calmed) st.rage = 0;
      rec.acts.push({ kind: 'breath', dmg: st.breath, broke, cracked, calmed });
    }
    for (const i of acts.skills || []) {
      const sk = st.skills[i];
      if (!sk || !ready(sk) || st.eh <= 0) continue;
      sk.charge = 0;
      const d = BT.skills[sk.kind];
      const a = { kind: sk.kind, id: sk.id };
      if (d.hit) { a.dmg = roundHit(st) * d.hit * sk.k; st.eh = Math.max(0, st.eh - a.dmg); rec.struck = true; }
      if (d.heal) { a.heal = Math.min(st.team.hp - st.th, st.team.hp * d.heal * sk.k); st.th += a.heal; if (st.traits.includes('venom')) { st.ward = DATA.traits.list.venom.ward; a.cured = true; } }
      if (sk.kind === 'dr') st.guard = d.rounds;
      if (sk.kind === 'pierce') st.sunder = d.rounds;
      rec.acts.push(a);
    }
    st.r++;
    if (st.eh > 0) {
      rec.ours = roundHit(st) * (st.r === 1 ? 1 + st.team.fx.burst : 1) * rand(0.92, 1.08);
      st.eh = Math.max(0, st.eh - rec.ours);
    }
    if (st.eh <= 0) {
      Object.assign(rec, { theirs: 0, th: st.th, eh: 0 });
      st.rounds.push(rec);
      st.over = true; st.win = true;
      return rec;
    }
    const wind = st.windup ? (st.foe.boss ? BT.boss.windup : BT.windup) : 1;
    rec.windup = st.windup;
    rec.guarded = st.guard > 0;
    const TL = DATA.traits.list, rage = st.traits.includes('frenzy') ? 1 + TL.frenzy.ramp * st.rage : 1;
    rec.theirs = dmgOf(st.foe.atk, st.team.def) * (1 - st.team.fx.dr) * wind * rage * (st.guard ? 1 - BT.skills.dr.cut : 1) * rand(0.92, 1.08);
    st.th = Math.max(0, st.th - rec.theirs);
    if (st.th > 0) st.th = Math.min(st.team.hp, st.th + st.team.fx.heal * st.team.hp);
    // foe traits at the end of the round
    if (st.traits.length) {
      if (st.traits.includes('regen') && !rec.struck && st.eh > 0) { rec.regen = Math.min(st.foe.hp - st.eh, (st.opts.breathHp || st.foe.hp) * TL.regen.heal); st.eh += rec.regen; }
      if (st.traits.includes('venom') && st.th > 0) { if (st.ward > 0) st.ward--; else { rec.venom = st.team.hp * TL.venom.dot; st.th = Math.max(0, st.th - rec.venom); } }
      if (st.shell > 0) st.shell--;
      if (st.traits.includes('frenzy')) st.rage++;
    }
    if (st.guard) st.guard--;
    if (st.sunder) st.sunder--;
    for (const sk of st.skills) sk.charge = Math.min(BT.charge, sk.charge + 1);
    rec.th = st.th; rec.eh = st.eh;
    st.rounds.push(rec);
    if (st.th <= 0) { st.over = true; st.win = false; return rec; }
    if (st.r >= DATA.maxRounds) { st.over = true; st.win = false; st.timeout = true; return rec; }
    const nr = st.r + 1;
    const first = st.foe.boss ? BT.boss.first : BT.windupFirst, every = st.foe.boss ? BT.boss.every : BT.windupEvery;
    st.windup = nr >= first && (nr - first) % every === 0;
    rec.next = st.windup ? 'windup' : '';
    return rec;
  }
  // the auto-battle policy: what a sensible player would tap before the coming round
  function autoActs(st) {
    const BT = DATA.battle, acts = { skills: [] };
    if (st.breath > 0 && !st.breathUsed) {
      // finish the foe, break a wind-up, crack a sand-shell, calm a frenzy once it builds, or burn early against
      // ordinary foes (but not into a shell that would be cracked anyway, nor before a frenzy has built)
      const tr = st.traits || [], frenzy = tr.includes('frenzy');
      if (st.eh <= st.breath || st.windup || (st.shell > 1) || (frenzy && st.rage >= 3) || (!st.foe.boss && st.r === 0 && !frenzy)) acts.breath = true;
    }
    const hpK = st.th / st.team.hp;
    st.skills.forEach((sk, i) => {
      if (sk.charge < BT.charge) return;
      if (sk.kind === 'dr') { if (st.windup || hpK < 0.4) acts.skills.push(i); }
      else if (sk.kind === 'heal') { if (hpK < 0.6 || ((st.traits || []).includes('venom') && !st.ward && hpK < 0.9)) acts.skills.push(i); }
      else if (sk.kind === 'pierce') { if (!st.sunder) acts.skills.push(i); }
      else acts.skills.push(i);
    });
    return acts;
  }
  function simulateBattle(team, foe, opts = {}) {
    const st = newBattle(team, foe, opts);
    while (!st.over) battleStep(st, autoActs(st));
    return { win: st.win, rounds: st.rounds, breath: 0, timeout: st.timeout, th: st.th };
  }
  function power() {
    let p = 0;
    for (const pid in S.lv) p += S.lv[pid] * (pid === 'wyrm' ? 150 : 40);
    for (const id in S.heroes) p += heroPower(id);
    for (const t in S.troops) p += S.troops[t] * unitPower(t);
    for (const k in S.tech) p += S.tech[k] * 30;
    for (const f of KH.hooks.power) p += f() || 0;
    return p;
  }

  function patrolPreview() {
    const c = Math.min(S.stage - 1, 110);
    if (c < 1) return null;
    const mins = Math.min((S.time - S.patrolSince) / 60, DATA.patrolCapMinutes);
    const g = {
      journals: Math.floor((2 + 0.5 * c) * mins),
      stone: Math.floor((20 + 10 * c) * mins),
      food: Math.floor((15 + 8 * c) * mins),
      water: Math.floor((10 + 6 * c) * mins),
    };
    if (c >= 3) g.copper = Math.floor(3 * c * mins);
    const sg = Math.floor(mins / 5) * (1 + Math.floor(c / 10));
    if (sg) g.starglass = sg;
    return { mins, g };
  }

  const passTier = () => Math.min(DATA.pass.tiers.length, Math.floor(S.pass.xp / DATA.pass.xpPerTier));
  // A Ledger reward for this season. Season 1 keeps its original table; later seasons scale to the keep,
  // and their premium capstone is the season's skin (Starglass instead if you already own it).
  function passReward(i, track, season = S.pass.season || 1) {
    const t = track === 'free' ? 0 : 1;
    if (season <= 1) return DATA.pass.tiers[i][t];
    const g = { ...DATA.pass.seasonTiers[i][t] };
    if (g.skin) {
      const sk = DATA.pass.seasonSkins[(season - 2) % DATA.pass.seasonSkins.length];
      delete g.skin;
      if (season - 2 < DATA.pass.seasonSkins.length && !S.skins.owned.includes(sk)) g.skin = sk;
      else g.starglass = (g.starglass || 0) + 800;
    }
    return scaleReward(g);
  }
  const addPassXp = (n) => { S.pass.xp = Math.min(S.pass.xp + n, DATA.pass.tiers.length * DATA.pass.xpPerTier); };

  // Reward bundles: resources, currencies, backpack items and a few special keys.
  function grant(g) {
    for (const [k, v] of Object.entries(g)) {
      if (k in S.res) S.res[k] += v;
      else if (k === 'starglass' || k === 'beacons' || k === 'journals' || k === 'sunsteel' || k === 'glory' || k === 'tideglass') S[k] = (S[k] || 0) + v;
      else if (k in DATA.items) S.items[k] = (S.items[k] || 0) + v;
      else if (k === 'builder2') S.builders = Math.max(S.builders, 2);
      else if (k === 'stipend') S.stipend.left += v;
      else if (k === 'ledger') S.pass.premium = true;
      else if (k === 'growth') S.bought.growth = 1;
      else if (k === 'lvpack') for (const [r, n] of Object.entries(levelPackRes(v))) S.res[r] += n;
      else if (k === 'skin' && !S.skins.owned.includes(v)) S.skins.owned.push(v);
      else if (k === 'cpoints' && S.caravan) S.caravan.points += v;
    }
    KH.emit('grant', g);
  }
  // Small reward numbers in ruins/events: resources are quarter-crates and journals scale with the keep.
  function scaleReward(g) {
    const L = S.lv.wyrm, out = {};
    for (const [k, v] of Object.entries(g)) {
      if (k in S.res) out[k] = Math.round((v * DATA.crateSize(k, L)) / 4);
      else if (k === 'journals') out[k] = Math.round(v * (5 + 2 * L));
      else out[k] = v;
    }
    return out;
  }

  // Growth Packs: resources to take the Rainwyrm from Lv L to L + 1 (the wyrm plus each building that level needs),
  // and a share of it rounded to two significant figures.
  function levelPath(L) {
    const need = {};
    const add = (c) => { for (const [k, v] of Object.entries(c)) if (k in S.res) need[k] = (need[k] || 0) + v; };
    add(buildCost('wyrm', L + 1));
    for (const r of DATA.wyrmReqs(L + 1)) add(buildCost(r.plot, r.lvl));
    return need;
  }
  function levelPackRes(share) {
    const out = {};
    for (const [k, v] of Object.entries(levelPath(S.lvPack.lvl || S.lv.wyrm))) {
      const n = v * share, mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
      out[k] = Math.round(n / mag) * mag;
    }
    return out;
  }
  const levelPackOpen = () => !!(S.lvPack && S.lvPack.lvl && S.time < S.lvPack.until);
  const levelPackGrants = (id) => {
    const g = { ...shopItem(id).grants }, share = g.lvpack;
    delete g.lvpack;
    return { ...levelPackRes(share), ...g };
  };

  // ======================================================================
  // Workers
  // ======================================================================
  function autoAssign() {
    const w = { quarry: 0, grove: 0, well: 0, mine: 0 };
    let pool = S.pop;
    const give = (pid, n) => {
      const k = Math.max(0, Math.min(n, slotsOf(pid) - w[pid], pool));
      w[pid] += k; pool -= k;
    };
    const per = (pid) => Math.max(workerRate(pid), 1e-4);
    if (S.lv.well) give('well', Math.ceil(((drinkRate() + S.pop * DATA.waterPerSurvivor) * 1.2) / per('well')));
    if (S.lv.grove) give('grove', Math.ceil((S.pop * DATA.foodPerSurvivor * 1.15) / per('grove')));
    const order = ['quarry', 'well', 'grove', 'mine'];
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
  function addSurvivors(n) {
    const room = Math.max(0, housing() - S.pop);
    const k = Math.min(n, room);
    S.pop += k;
    if (k) fixWorkers();
    return k;
  }

  // ======================================================================
  // Weather
  // ======================================================================
  function nextWeather(prev) {
    let type = 'clear';
    if (prev.type === 'clear') {
      const r = Math.random();
      if (prev.end < 150) type = 'haze';
      else if (r < 0.42) type = 'haze';
      else if (S.lv.wyrm >= 5 && prev.end > 600 && r > 0.84) type = 'heatwave';
      else type = 'sandstorm';
    }
    const dur = { clear: [60, 110], haze: [30, 50], sandstorm: [35, 55], heatwave: [30, 45] }[type];
    return { type, start: prev.end, end: prev.end + Math.round(rand(dur[0], dur[1])) };
  }
  function ensureWeather() {
    if (!S.wx.length) S.wx.push({ type: 'clear', start: S.time, end: S.time + Math.round(rand(70, 100)) });
    while (S.wx.length > 1 && S.wx[0].end <= S.time) S.wx.shift();
    if (S.wx[0].end <= S.time) S.wx = [{ type: 'clear', start: S.time, end: S.time + 80 }];
    while (S.wx[S.wx.length - 1].end < S.time + 900) S.wx.push(nextWeather(S.wx[S.wx.length - 1]));
  }
  const isStorm = (t) => t === 'sandstorm' || t === 'heatwave';

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
    if (!offline && R.burn > 0) KH.emit('mist', { seconds: dt, high: S.mist === 'high' });
    if (S.autoMist && S.lv.wyrm >= DATA.wyrm.autoMistLevel) autoMist(R);

    if (!S.dormant && S.res.water <= 0) {
      S.dormant = true;
      if (!offline) { toast('The wells are dry and the Rainwyrm has gone dormant. Get water flowing before the heat takes the keep.', 'warn', 'dormant', 20); KH.emit('dormant'); }
    } else if (S.dormant && S.res.water >= 20) {
      S.dormant = false;
      if (!offline) toast('Water is flowing again. The Rainwyrm stirs awake.', 'good', 'wake', 20);
    }
    // nothing left to drink: the sick get worse and families start to leave
    S.thirsty = S.res.water <= 0 && R.net.water < 0;

    let popChanged = false;
    if (!offline) {
      const healthyN = S.pop - S.sick;
      if (R.band.sick > 0 && healthyN > 0) {
        S.acc.sick += healthyN * R.band.sick * dt;
        let n = 0;
        while (S.acc.sick >= 1 && S.sick < S.pop) { S.sick++; S.acc.sick -= 1; n++; }
        if (n) {
          S.stats.sickTotal += n;
          toast("Survivors are falling ill from the heat. Raise the wyrm's mist or build a Healer's House.", 'heat', 'sick', 25);
        }
      } else S.acc.sick = Math.max(0, S.acc.sick - dt * 0.05);

      if (R.band.lost > 0 && S.sick > 0) {
        S.acc.lost += S.sick * R.band.lost * dt;
        while (S.acc.lost >= 1 && S.sick > 0) {
          S.sick--; S.pop--; S.acc.lost -= 1; popChanged = true;
          toast('A survivor was lost to the heat.', 'warn', 'lost', 8);
        }
      }
      const hungry = S.res.food <= 0 && R.net.food < 0;
      if ((hungry || S.thirsty) && S.pop > 1) {
        S.acc.leave += dt / (S.thirsty ? 6 : 10);
        while (S.acc.leave >= 1 && S.pop > 1) {
          S.acc.leave -= 1; S.pop--; S.sick = Math.min(S.sick, S.pop); popChanged = true;
          toast(S.thirsty ? 'The cisterns are dry. A family left to search for water elsewhere.' : 'The stores are empty. A family left to find food elsewhere.', 'warn', 'leave', 12);
        }
      } else S.acc.leave = 0;

      // storms: track whether anyone fell ill while it raged
      const w = curWx();
      if (isStorm(w.type) && (!S.storm || S.storm.start !== w.start)) S.storm = { start: w.start, end: w.end, type: w.type, sickAt: S.stats.sickTotal };
      if (S.storm && S.time >= S.storm.end) {
        const clean = S.stats.sickTotal === S.storm.sickAt;
        if (clean) {
          S.stats.cleanStorms++;
          toast(`The ${DATA.weather[S.storm.type].name.toLowerCase()} has passed and no one fell ill.`, 'good');
        }
        KH.emit('stormEnd', { type: S.storm.type, clean });
        S.storm = null;
      }
    }

    if (S.sick > 0) {
      S.acc.heal += S.sick * healRate(R.temp) * dt;
      while (S.acc.heal >= 1 && S.sick > 0) {
        S.sick--; S.acc.heal -= 1;
        if (log) log.healed = (log.healed || 0) + 1;
      }
    } else S.acc.heal = 0;

    const cap = housing();
    if (S.pop < cap && S.res.food > 1 && !S.thirsty && R.band !== DATA.comfort[DATA.comfort.length - 1]) {
      S.acc.arrive += dt / (DATA.arrivalEvery / (1 + 0.15 * (S.lv.wyrm - 1)));
      while (S.acc.arrive >= 1 && S.pop < cap) {
        S.pop++; S.acc.arrive -= 1; popChanged = true;
        if (log) log.arrived = (log.arrived || 0) + 1;
      }
      if (S.pop >= cap && !offline && S.quest >= 4) toast('Every house is full. Upgrade the Mudbrick Houses to take in more survivors.', '', 'full', 180);
    }
    if (popChanged) fixWorkers();

    for (const b of S.builds.slice()) if (S.time >= b.end) finishBuild(b, offline, log);
    if (S.research && S.time >= S.research.end) finishResearch(offline, log);
    if (S.training && S.time >= S.training.end) finishTraining(offline, log);

    for (const f of KH.hooks.tick) f(dt, offline, log);
    if (!offline) announceWeather();
  }

  // An attuned wyrm sets its own mist: pour for storms, drizzle at night or when water runs low.
  function autoMist(R) {
    const soon = S.wx.some((w) => isStorm(w.type) && w.start - S.time < 20 && w.end > S.time);
    const low = S.res.water < 40 || (R.net.water < 0 && S.res.water / -R.net.water < 60);
    const want = soon && !low ? 'high' : low || (dayNight().night > 0.6 && R.band !== DATA.comfort[DATA.comfort.length - 1]) ? 'low' : 'steady';
    if (S.mist !== want) { S.mist = want; if (S.autoWork) autoAssign(); }
  }

  function announceWeather() {
    const range = forecastRange();
    for (const w of S.wx) {
      if (!isStorm(w.type)) continue;
      const name = DATA.weather[w.type].name;
      if (!w.seen && w.start - S.time <= range && w.start > S.time) {
        w.seen = true;
        toast(`${name} sighted, arriving in ${fmtTime(w.start - S.time)}. Set the Rainwyrm to Downpour before it hits.`, 'heat');
        KH.emit('stormSighted', { type: w.type, in: w.start - S.time });
      }
      if (!w.began && S.time >= w.start && S.time < w.end) {
        w.began = true; w.seen = true;
        toast(`${name}! Outdoor work slows. Keep the wyrm's mist pouring.`, 'heat');
        KH.emit('stormStart', { type: w.type });
      }
    }
  }

  function finishBuild(b, offline, log) {
    S.builds = S.builds.filter((x) => x !== b);
    const prevStage = stageOf(S.lv.wyrm).name;
    S.lv[b.plot] = b.to;
    S.stats.upgrades++;
    addPassXp(DATA.passXp.upgrade);
    if (log) (log.built = log.built || []).push(`${plotName(b.plot)} Lv ${b.to}`);
    fixWorkers();
    KH.emit('upgrade', { plot: b.plot, to: b.to, offline });
    if (b.plot === 'wyrm') {
      const st = stageOf(S.lv.wyrm);
      if (st.name !== prevStage) {
        KH.queueSheet({ kind: 'evolve', from: st.from });
        KH.emit('evolve', { stage: st.name, level: b.to });
      }
      if (b.to >= DATA.ascension.level && !S.wyrm.element) KH.queueSheet({ kind: 'ascend' });
      if (b.to >= DATA.levelPacks.from && b.to < maxLevel('wyrm')) {
        S.lvPack = { lvl: b.to, until: S.time + DATA.levelPacks.window, bought: [], seen: false };
        if (!offline) toast(`Growth Packs for Rainwyrm Lv ${b.to + 1} are in the Store for the next ${fmtTime(DATA.levelPacks.window)}.`, '', 'lvpack', 4);
      }
    }
    if (offline) return;
    UI.floaters.push({ plot: b.plot, text: b.to === 1 ? 'Built!' : `Lv ${b.to}!`, t0: performance.now() });
    if (b.plot === 'wyrm') {
      if (stageOf(S.lv.wyrm).name === prevStage) toast(`${S.wyrm.name} reached Lv ${b.to}. Its mist reaches further.`, 'good');
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
    KH.emit('research', { tech: r.tech, to: r.to });
    if (!offline) toast(`Research complete: ${t.name} ${r.to}.`, 'good');
  }
  function finishTraining(offline, log) {
    const tr = S.training;
    if (tr.rank != null) { S.training = null; return KH.ranks.finish(tr, offline, log); } // a drill (ranks.js)
    S.troops[tr.type] += tr.n;
    S.stats.trained += tr.n;
    addPassXp(Math.floor(tr.n / 10) * DATA.passXp.train10);
    S.training = null;
    if (log) (log.built = log.built || []).push(`${tr.n} ${DATA.troops[tr.type].name}`);
    KH.emit('train', { type: tr.type, n: tr.n });
    if (!offline) toast(`${tr.n} ${DATA.troops[tr.type].name} ready for the march.`, 'good');
  }

  function catchUp(seconds) {
    const capped = Math.min(seconds, DATA.offline.capSeconds + KH.bonus('offlineCap'));
    const log = {};
    S.wx = [];
    S.storm = null;
    let left = capped;
    while (left > 0) {
      const dt = Math.min(2, left);
      tick(dt, true, log);
      left -= dt;
    }
    // timers keep running in real time even past the production cap
    if (seconds > capped) {
      const extra = seconds - capped;
      S.time += extra;
      for (const b of S.builds.slice()) if (S.time >= b.end) finishBuild(b, true, log);
      if (S.research && S.time >= S.research.end) finishResearch(true, log);
      if (S.training && S.time >= S.training.end) finishTraining(true, log);
      for (const f of KH.hooks.tick) f(0, true, log);
    }
    S.wx = [];
    ensureWeather();
    return { seconds, capped, log };
  }

  // ======================================================================
  // Jobs (construction, research, training) and speedups
  // ======================================================================
  function findJob(key) {
    if (key === 'research') return S.research;
    if (key === 'training') return S.training;
    return S.builds.find((b) => b.plot === key) || null;
  }
  function speedCost(end) {
    const left = end - S.time;
    return left <= DATA.freeFinishSeconds + KH.bonus('freeFinish') ? 0 : Math.ceil(left / DATA.speedupSecondsPerStarglass);
  }
  function cutJob(job, secs) {
    job.end = Math.max(S.time, job.end - secs);
    if (job.end <= S.time) tick(0);
  }

  // ======================================================================
  // Actions (invoked from data-act attributes)
  // ======================================================================
  const ACT = (KH.ACT = {});
  ACT.automist = () => {
    if (S.lv.wyrm < DATA.wyrm.autoMistLevel) return toast(`Your wyrm learns to set its own mist at Lv ${DATA.wyrm.autoMistLevel}.`, 'warn');
    S.autoMist = !S.autoMist;
    if (S.autoMist) autoMist(rates(false));
  };

  ACT.build = (pid) => {
    const why = upgradeBlock(pid);
    if (why) return toast(why, 'warn');
    if (S.builds.length >= S.builders) return toast(S.builders < 2 ? "Your builder is busy. The Founder's Cache adds a second builder." : 'Both builders are busy.', 'warn');
    const to = S.lv[pid] + 1, cost = buildCost(pid, to);
    if (!canAfford(cost)) return toast('Not enough resources yet.', 'warn');
    pay(cost);
    const job = { plot: pid, to, start: S.time, end: S.time + buildTime(pid, to) };
    S.builds.push(job);
    KH.emit('buildStart', { plot: pid, job });
  };
  ACT.speed = (arg) => {
    const job = findJob(arg);
    if (!job) return;
    const c = speedCost(job.end);
    if (S.starglass < c) return toast('Not enough Starglass.', 'warn');
    S.starglass -= c;
    cutJob(job, job.end - S.time);
    KH.emit('speedup', { starglass: c });
  };
  ACT.mist = (m) => {
    if (!DATA.wyrm.mist[m]) return;
    S.mist = m;
    S.autoMist = false;
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

  ACT.research = (id) => {
    if (S.research) return toast('The scholars are already busy.', 'warn');
    const t = DATA.techs.find((x) => x.id === id), lvl = S.tech[id];
    if (t.needs && !S.lv[t.needs]) return toast(`Build the ${DATA.buildings[PLOT[t.needs].type].name} first.`, 'warn');
    if (lvl >= techMax()) return toast(lvl >= DATA.techMaxLevel ? 'Fully researched.' : 'Upgrade the Archive to research further.', 'warn');
    const c = techCost(t, lvl);
    if (!canAfford(c)) return toast('Not enough resources yet.', 'warn');
    pay(c);
    S.research = { tech: id, to: lvl + 1, start: S.time, end: S.time + techTime(t, lvl) };
    KH.emit('researchStart', { job: S.research });
  };

  const batchMax = () => 10 * S.lv.barracks;
  const trainTime = (n) => (n * DATA.trainSecondsPerUnit) / (1 + 0.15 * (S.lv.barracks - 1)) / (1 + stewardVal('train') / 100);
  const troopsAll = () => sum(S.troops) + (KH.troopsAway ? KH.troopsAway() : 0);
  ACT.ttype = (type) => {
    if (DATA.troops[type].needs && !S.lv[DATA.troops[type].needs]) return toast('Camel Lancers need copper. Build the Copper Mine first.', 'warn');
    UI.trainType = type;
  };
  ACT.tn = (d) => {
    if (d === 'max') {
      const c = DATA.troops[UI.trainType].cost;
      let n = Math.min(batchMax(), troopCap() - troopsAll());
      for (const [k, v] of Object.entries(c)) n = Math.min(n, Math.floor(S.res[k] / v));
      UI.trainN = Math.max(1, n);
    } else UI.trainN = clamp(UI.trainN + Number(d), 1, batchMax());
  };
  ACT.train = () => {
    if (S.training) return toast('The barracks is already training.', 'warn');
    const type = UI.trainType, t = DATA.troops[type];
    if (t.needs && !S.lv[t.needs]) return toast('Build the Copper Mine first.', 'warn');
    const room = troopCap() - troopsAll();
    if (room <= 0) return toast('The barracks is full. Upgrade it to house more troops.', 'warn');
    const n = clamp(UI.trainN, 1, Math.min(batchMax(), room));
    const c = Object.fromEntries(Object.entries(t.cost).map(([k, v]) => [k, v * n]));
    if (!canAfford(c)) return toast('Not enough resources for that many.', 'warn');
    pay(c);
    S.training = { type, n, start: S.time, end: S.time + trainTime(n) };
  };

  ACT.lvl = (arg) => {
    const [id, mode] = arg.split(':');
    const h = S.heroes[id], cap = heroCap(id);
    if (h.lvl >= cap) return toast(h.stars < DATA.heroMaxStars ? 'Level cap reached. Add a star to raise it.' : S.lv.wyrm >= DATA.wyrm.maxLevel ? 'Level cap reached. Each Springsong rank of the Deepspring raises it.' : 'Level cap reached. Each Rainwyrm level past 9 raises it.', 'warn');
    let n = 0;
    do {
      const c = 2 * h.lvl;
      if (S.journals < c) break;
      S.journals -= c; h.lvl++; n++;
    } while (mode === 'max' && h.lvl < cap);
    if (!n) toast('Not enough Field Journals. Expeditions, beasts and patrols bring more.', 'warn');
    else KH.emit('heroLevel', { id, lvl: h.lvl });
  };
  ACT.star = (id) => {
    const h = S.heroes[id], need = 10 * h.stars;
    if (h.stars >= DATA.heroMaxStars) return;
    if (h.shards < need) return toast(`Needs ${need} shards. Each duplicate recruit gives ${DATA.shardsPerDupe[HERO[id].rarity]}.`, 'warn');
    h.shards -= need; h.stars++;
    toast(`${HERO[id].name} reached ${h.stars} stars.`, 'good');
    KH.emit('heroStar', { id, stars: h.stars });
  };
  ACT.squad = (id) => {
    const i = S.squad.indexOf(id);
    if (KH.heroBusy && KH.heroBusy(id)) return toast(`${HERO[id].name.split(' ')[0]} ${KH.heroAwayWhy ? KH.heroAwayWhy(id) : 'is out leading a march'}.`, 'warn');
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
    KH.emit('quest', { index: S.quest - 1 });
  };

  ACT.patrol = () => {
    const p = patrolPreview();
    if (!p) return;
    if (p.mins < 1) return toast('The patrol cache is still filling.', 'warn');
    grant(p.g);
    S.patrolSince = S.time;
    toast('Patrol cache collected.', 'good');
    KH.emit('patrol');
  };

  ACT.fight = () => {
    if (!squadHome().length) return toast('Your squad is out on the Dunes. Wait for them to return.', 'warn');
    const foe = enemyFor(S.stage), team = teamStats(foe.cls);
    KH.fightLive({
      title: `Stage ${foe.n} · ${foe.chapter}`, foe, team,
      onEnd: (result) => {
        let rewards = null;
        const chapterBefore = chapterOf(S.stage).from;
        if (result.win && S.stage === foe.n) {
          rewards = stageRewards(foe.n);
          grant(rewards);
          if (S.stage === 1) S.patrolSince = S.time;
          S.stage++;
          S.stats.wins++;
          addPassXp(DATA.passXp.stage);
        }
        KH.emit('battle', { kind: 'stage', win: result.win, foe });
        if (result.win) KH.emit('stage', { n: foe.n });
        const after = [];
        if (result.win && foe.n === DATA.actOneStage && !S.endingSeen) after.push({ kind: 'ending' });
        else if (result.win && foe.n === DATA.actTwoStage && !S.ending2Seen) after.push({ kind: 'ending', act: 2 });
        else if (result.win && foe.n === DATA.finalStage && !S.ending3Seen) after.push({ kind: 'ending', act: 3 });
        else if (result.win && chapterOf(S.stage).from !== chapterBefore && !S.story.chapters.includes(chapterOf(S.stage).from)) after.push({ kind: 'story', from: chapterOf(S.stage).from });
        // Stage Stars (stars.js): the stars this clear took
        const extra = result.win && KH.stageStars ? KH.stageStars(foe.n, result, team) : '';
        save();
        return { rewards, after, extra };
      },
    });
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
    KH.emit('pull', { n, results });
  };
  // Act II heroes join the pool once the Sunheart is quenched
  // Act II heroes answer the Beacon once the Sunheart is quenched, Act III heroes once the Ember Throne falls
  const heroAvailable = (h) => !h.act || S.stage > (h.act >= 3 ? DATA.actTwoStage : DATA.actOneStage);
  const featured = () => {
    const legs = DATA.heroes.filter((h) => h.rarity === 'legendary' && heroAvailable(h));
    return legs[Math.floor(S.time / DATA.events.length) % legs.length].id;
  };
  function addHero(id, shards = DATA.shardsPerDupe[HERO[id].rarity]) {
    const isNew = !S.heroes[id];
    if (isNew) {
      S.heroes[id] = { lvl: 1, stars: 1, shards: 0 };
      if (S.squad.length < 3) S.squad.push(id);
    } else S.heroes[id].shards += shards;
    return isNew;
  }
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
      const pool = DATA.heroes.filter((h) => h.rarity === rarity && heroAvailable(h)).map((h) => h.id);
      id = rarity === 'legendary' && Math.random() < DATA.recruit.featuredShare ? featured() : pick(pool);
    }
    if (HERO[id].rarity === 'legendary') S.pity = 0;
    const isNew = addHero(id);
    return { id, rarity: HERO[id].rarity, isNew };
  }

  ACT.passclaim = (arg) => {
    const [track, i] = [arg.split(':')[0], Number(arg.split(':')[1])];
    if (passTier() <= i) return toast('Earn more Ledger XP to reach this tier.', 'warn');
    if (track === 'prem' && !S.pass.premium) return ACT.buy('ledger');
    if (S.pass[track].includes(i)) return;
    S.pass[track].push(i);
    grant(passReward(i, track));
    toast('Ledger reward collected.', 'good');
  };

  // Purchases: the App Store build goes through KHNative (RevenueCat); the web build simulates.
  function shopItem(id) { return DATA.shop.find((x) => x.id === id); }
  function canBuy(id) {
    const item = shopItem(id);
    if (!item) return true;
    if (item.once && S.bought[id]) return 'Already purchased.';
    if (item.daily && S.boughtDay[id] === today()) return 'Already bought today. Back tomorrow.';
    if (item.needs && !S.lv[item.needs]) return `Build the ${DATA.buildings[PLOT[item.needs].type].name} first.`;
    if (item.needsWyrm && S.lv.wyrm < item.needsWyrm) return `Opens at Rainwyrm Lv ${item.needsWyrm}.`;
    if (item.when && !item.when(S)) return 'This offer has ended.';
    if (id === 'ledger' && S.pass.premium) return 'Premium is already active this season.';
    if (item.levelPack) {
      if (!levelPackOpen()) return S.lvPack && S.lvPack.lvl ? 'This Growth Pack has ended. New ones open at your next Rainwyrm level.' : `Growth Packs go on sale each time your Rainwyrm levels up, from Lv ${DATA.levelPacks.from}.`;
      if (S.lvPack.bought.includes(id)) return 'Already bought for this level.';
    }
    return true;
  }
  function completePurchase(ref, opts = {}) {
    let usd = 0;
    if (ref.skin) {
      const sk = DATA.skins[ref.skin];
      if (!S.skins.owned.includes(ref.skin)) S.skins.owned.push(ref.skin);
      S.skins.on = ref.skin;
      if (!opts.restore) { usd = sk.usd || 0; S.spentUsd += usd; }
      toast(`${sk.name} unlocked and equipped.${opts.simulated ? ' (Simulated purchase)' : ''}`, 'good');
    } else {
      const item = shopItem(ref.id);
      if (opts.restore && S.bought[item.id]) return;
      grant(item.grants);
      if (item.levelPack && S.lvPack && !S.lvPack.bought.includes(item.id)) S.lvPack.bought.push(item.id);
      S.bought[item.id] = (S.bought[item.id] || 0) + 1;
      if (item.daily) S.boughtDay[item.id] = today();
      if (!opts.restore) { usd = item.usd; S.spentUsd += usd; }
      toast(`${item.name} delivered.${opts.simulated ? ' (Simulated purchase)' : ''}`, 'good');
    }
    KH.emit('purchase', { ...ref, usd });
    save();
  }
  KH.completePurchase = completePurchase;
  function nativeBuy(ref) {
    const N = window.KHNative;
    const sku = ref.skin || ref.id;
    N.purchase(sku).then((res) => {
      if (res && res.ok) completePurchase(ref);
      else if (res && !res.cancelled) toast(`The purchase didn't go through${res.error ? `: ${res.error}` : ''}.`, 'warn');
      KH.renderAll && KH.renderAll(true);
    }).catch(() => toast("The purchase didn't go through. Please try again.", 'warn'));
  }
  ACT.buy = (id) => {
    const ok = canBuy(id);
    if (ok !== true) return toast(ok, 'warn');
    if (window.KHNative && window.KHNative.purchasesAvailable) return nativeBuy({ id });
    UI.sheet = { kind: 'buy', id };
  };
  ACT.confirmbuy = () => {
    const sh = UI.sheet;
    if (!sh || sh.kind !== 'buy') return;
    if (!sh.skin && canBuy(sh.id) !== true) return;
    completePurchase(sh.skin ? { skin: sh.skin } : { id: sh.id }, { simulated: true });
    UI.sheet = null;
  };
  ACT.skin = (id) => {
    if (S.skins.owned.includes(id)) { S.skins.on = id; return toast(`${DATA.skins[id].name} equipped.`, 'good'); }
    const sk = DATA.skins[id];
    if (sk.locked) return toast(`${sk.name}: ${sk.note}.`, 'warn');
    if (sk.starglass) {
      if (S.starglass < sk.starglass) return toast('Not enough Starglass.', 'warn');
      S.starglass -= sk.starglass;
      S.skins.owned.push(id); S.skins.on = id;
      return toast(`${sk.name} unlocked and equipped.`, 'good');
    }
    if (window.KHNative && window.KHNative.purchasesAvailable) return nativeBuy({ skin: id });
    UI.sheet = { kind: 'buy', skin: id };
  };
  ACT.restore = () => {
    const N = window.KHNative;
    if (!N || !N.purchasesAvailable) return toast('Restoring purchases works in the App Store version.', 'warn');
    N.restore().then((res) => {
      const skus = (res && res.skus) || [];
      for (const s of skus) {
        if (DATA.skins[s]) completePurchase({ skin: s }, { restore: true });
        else if (shopItem(s) && shopItem(s).once) completePurchase({ id: s }, { restore: true });
      }
      toast(skus.length ? 'Purchases restored.' : 'No purchases to restore.', 'good');
      KH.renderAll && KH.renderAll(true);
    });
  };
  ACT.growth = (lvl) => {
    lvl = Number(lvl);
    const row = DATA.growthFund.find((g) => g[0] === lvl);
    if (!S.bought.growth || !row || S.lv.wyrm < lvl || S.growthClaimed.includes(lvl)) return;
    S.growthClaimed.push(lvl);
    S.starglass += row[1];
    toast(`Growth Fund: +${fmt(row[1])} Starglass.`, 'good');
  };
  ACT.stipend = () => {
    if (S.stipend.left <= 0 || S.stipend.last === today()) return;
    S.stipend.left--; S.stipend.last = today();
    S.starglass += 90;
    toast("Today's Oasis Stipend: 90 Starglass.", 'good');
  };
  ACT.crate = (res) => {
    if (S.starglass < DATA.crateCost) return toast('Not enough Starglass.', 'warn');
    S.starglass -= DATA.crateCost;
    const n = DATA.crateSize(res, S.lv.wyrm);
    S.res[res] += n;
    toast(`+${fmt(n)} ${NAME[res]}.`, 'good');
  };

  // the wyrm
  ACT.pet = () => {
    const now = performance.now();
    UI.petT = now;
    if (S.time - S.wyrm.lastPet < 4) return;
    S.wyrm.lastPet = S.time;
    S.stats.pets++;
    KH.emit('pet');
    if (S.wyrm.petDay !== today()) {
      S.wyrm.petDay = today();
      const g = { journals: 5 + S.lv.wyrm, starglass: 10 };
      grant(g);
      toast(`${S.wyrm.name} hums and nuzzles your hand. +${g.journals} journals, +10 Starglass.`, 'good');
    } else toast(`${S.wyrm.name} hums happily.`, 'good', 'purr', 6);
  };
  ACT.rename = () => {
    const el = document.getElementById('wyrm-name');
    const name = el ? el.value.trim().replace(/\s+/g, ' ').slice(0, 16) : '';
    if (!name) return toast('Give your wyrm a name first.', 'warn');
    S.wyrm.name = name;
    UI.sheet = { kind: 'plot', pid: 'wyrm' };
    toast(`Your Rainwyrm is now called ${name}.`, 'good');
  };
  ACT.ascend = (branch) => {
    if (S.wyrm.element || S.lv.wyrm < DATA.ascension.level || !DATA.ascension.branches[branch]) return;
    S.wyrm.element = branch;
    UI.sheet = null;
    toast(`${S.wyrm.name} ascends as a ${DATA.ascension.branches[branch].name} wyrm.`, 'good');
    KH.emit('ascend', { branch });
  };

  ACT.reset = () => { UI.confirmReset = true; };
  ACT.resetno = () => { UI.confirmReset = false; };
  ACT.resetyes = () => {
    try { localStorage.removeItem(DATA.saveKey); } catch (e) { /* ignore */ }
    replaceState(newState());
    autoAssign();
    ensureWeather();
    KH.hooks.boot.forEach((f) => f(true));
    UI.confirmReset = false;
    UI.sheetQueue = [];
    ACT.tab && ACT.tab('town');
    UI.sheet = { kind: 'intro' };
  };

  // ======================================================================
  // Sheet queue: story beats wait until the player closes what's open
  // ======================================================================
  KH.queueSheet = (sheet) => {
    if (!UI.sheet && !UI.battle) UI.sheet = sheet;
    else UI.sheetQueue.push(sheet);
  };
  KH.nextSheet = () => {
    if (!UI.sheet && !UI.battle && UI.sheetQueue.length) UI.sheet = UI.sheetQueue.shift();
  };

  // ======================================================================
  // Public surface for the other scripts
  // ======================================================================
  Object.assign(KH, {
    newStateFn: newState, load, tick, catchUp, rates, stageOf, stageIndex, mist, slotsOf, housing, curWx, forecastRange, dayNight,
    coolOf, coolAt, drinkRate, marchCap, troopCap, outsideTemp, troopMult, protectOf, stewardVal, townTemp, comfortOf,
    workerRate, healRate, buildCost, buildTime, maxLevel, upgradeBlock, canAfford, pay, have, techCost, techTime, techMax,
    heroStats, heroCap, skillScale, skillText, stewardOf, statPower, heroPower, unitPower, counterMult, capTroops, marchTroops, squadHome,
    teamStats, chapterOf, foeStats, stageLevel, enemyFor, traitsFor, stageRewards, simulateBattle, newBattle, battleStep, autoActs, skillKind, power, patrolPreview, passTier, addPassXp, passReward,
    grant, scaleReward, autoAssign, fixWorkers, addSurvivors, ensureWeather, isStorm, findJob, speedCost, cutJob,
    batchMax, trainTime, troopsAll, featured, addHero, canBuy, shopItem, heroAvailable, levelPath, levelPackOpen, levelPackGrants,
  });

  // Ascension bonuses
  KH.hooks.bonus.push((k) => {
    const e = S && S.wyrm && S.wyrm.element;
    if (!e) return 0;
    if (e === 'monsoon' && k === 'prod') return 0.1;
    if (e === 'mistveil' && k === 'cool') return 3;
    if (e === 'mistveil' && k === 'forecast') return 60;
    if (e === 'floodheart' && k === 'breath') return 1;
    if (e === 'floodheart' && k === 'teamAtk') return 0.08;
    return 0;
  });

  // ======================================================================
  // Loop + boot
  // ======================================================================
  let lastReal = Date.now(), lastSave = Date.now();
  function loop() {
    const now = Date.now();
    const dt = (now - lastReal) / 1000;
    lastReal = now;
    if (dt > 30) {
      const o = catchUp(dt);
      if (o.seconds > 60) KH.queueSheet({ kind: 'offline', data: o });
    } else if (dt > 0) {
      let left = dt;
      while (left > 0) { const d = Math.min(1, left); tick(d); left -= d; }
    }
    KH.renderAll(false);
    if (now - lastSave > 5000) { save(); lastSave = now; }
  }
  KH.loop = loop;

  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.hidden) { save(); KH.emit('hidden'); } else { loop(); KH.emit('visible'); }
  });
  window.addEventListener('pagehide', save);

  function boot(hot) {
    const fromHot = hot && hot.S ? mergeDefaults(newState(), hot.S) : null;
    S = fromHot || load() || newState();
    const fresh = S.time === 0;
    if (!fromHot && fresh) autoAssign();
    KH.hooks.boot.forEach((f) => f(fresh));
    let offline = null;
    if (!fromHot) {
      const away = (Date.now() - (S.savedAt || Date.now())) / 1000;
      if (away > 60 && S.seenIntro) offline = catchUp(away);
    }
    ensureWeather();
    lastReal = Date.now();
    if (!S.seenIntro) UI.sheet = { kind: 'intro' };
    else if (offline) UI.sheet = { kind: 'offline', data: offline };
    KH.emit('booted');
    KH.renderAll(true);
    setInterval(loop, 250);
  }

  // Test + tuning hooks for designers: rainkeep.advance(600) fast-forwards 10 minutes.
  window.rainkeep = {
    state: () => S,
    advance(sec) { let l = sec; while (l > 0) { const d = Math.min(1, l); tick(d); l -= d; } KH.renderAll(true); },
    grant(g) { grant(g); KH.renderAll(true); },
    act(name, arg) { ACT[name](arg); KH.renderAll(true); },
    data: DATA,
    KH,
  };

  function start() {
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ S }));
    if (hot && hot.ready) hot.ready(boot);
    else boot((hot && hot.data) || {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else setTimeout(start, 0);
})();
