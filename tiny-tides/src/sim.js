// Tiny Tides — simulation core. Pure logic (no DOM, no Date.now): every function takes `now`.
import * as D from './data.js';

const { FORMS, FAMILIES, PIECES, BIOMES, STAGE, DECOR, PRODUCTS, HOUR, MIN } = D;
export const SAVE_VERSION = 1;

// ================================================================ utils
export function rand(state) {
  let t = (state.seed = (state.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s, a, b) => a + Math.floor(rand(s) * (b - a + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const p2 = (n) => String(n).padStart(2, '0');
const roundTo = (v, n) => Math.round(v / n) * n;

/** The game day: local calendar date, rolling over at 4am local wall-clock so night owls aren't punished (DST-safe). */
function gameDate(now) {
  const d = new Date(now);
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() - 4);
  return [t.getFullYear(), t.getMonth() + 1, t.getDate()];
}
/** 'YYYY-MM-DD'. Keys sort chronologically, which the daily gates rely on (see `isNewer`). */
export function dayKey(now) { const [y, m, d] = gameDate(now); return `${y}-${p2(m)}-${p2(d)}`; }
export function dayNum(now) { const [y, m, d] = gameDate(now); return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
/** Daily gates only ever move forward, so winding the clock back can't re-arm a claim that was already taken. */
export const isNewer = (key, last) => key > (last || '');
/** The current "Tide Gift" window (morning / afternoon / evening, local time). */
export function giftWindow(now) {
  const d = new Date(now);
  const h = d.getHours();
  let day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let id = h >= 18 ? 2 : h >= 12 ? 1 : h >= 5 ? 0 : 2;
  if (h < 5) day = new Date(day.getTime() - 864e5 + 12 * HOUR); // belongs to yesterday's evening
  const dk = `${day.getFullYear()}-${p2(day.getMonth() + 1)}-${p2(day.getDate())}`;
  return { key: `${dk}:${id}`, id, name: D.GIFT_WINDOWS[id].name };
}
/** Next local time a new gift window opens (for notifications / countdown). */
export function nextGiftAt(now) {
  const d = new Date(now);
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const marks = [];
  for (let k = 0; k < 3; k++) for (const h of [5, 12, 18]) marks.push(base + k * 864e5 + h * HOUR);
  return marks.find((t) => t > now);
}
export function moonPhase(now) {
  const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14);
  const days = (now - ref) / 864e5;
  return (((days % syn) + syn) % syn) / syn; // 0 = new, .5 = full
}
export function springTide(now) {
  const p = moonPhase(now);
  const dist = Math.min(p, Math.abs(p - 0.5), 1 - p) * 29.53;
  return dist <= 1.0 ? { on: true, kind: Math.abs(p - 0.5) < 0.25 ? 'Full Moon' : 'New Moon' } : { on: false };
}
export const fmtDur = (ms) => {
  ms = Math.max(0, ms);
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return mm ? `${h}h ${mm}m` : `${h}h`;
  const dd = Math.floor(h / 24);
  return `${dd}d ${h % 24}h`;
};
export const fmtNum = (n) => {
  n = Math.floor(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0).replace(/\.0$/, '') + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 2 : 1).replace(/\.?0+$/, '') + 'M';
  return (n / 1e9).toFixed(2) + 'B';
};

// ================================================================ state
export function newPool(biome, now) {
  const step = BIOMES[biome].steps[0];
  const tiles = [];
  for (let i = 0; i < step.w * step.h; i++) tiles.push({ w: 0, p: null, d: null });
  return { biome, exp: 0, w: step.w, h: step.h, tiles, creatures: [], eggs: [], nextEgg: now + 2 * HOUR, ver: 1 };
}
export function newState(now, seed) {
  return {
    v: SAVE_VERSION, seed: ((seed ?? now) >>> 0) || 1, nid: 1, seq: 0, created: now, lastTick: now, lastSeen: now,
    cur: { pearls: 150, glass: 20, tokens: 0, coins: 0 },
    lvl: 1, xp: 0,
    pools: { tide: newPool('tide', now) },
    dex: {}, dexClaimed: [],
    own: Object.fromEntries(D.FREE_DECOR.map((d) => [d, true])),
    equip: { skin: 'aqua', fx: 'bubbles' },
    iap: { deep: false, hourglass: false, starter: false, packs: {}, done: {} },
    boost: { until: 0, mult: 2 },
    quests: { day: '', list: [], chest: false },
    daily: { n: 0, last: -99, shield: 1 },
    gift: { key: '' },
    gacha: { pulls: 0, paidPulls: 0, pityR: 0, pityL: 0, shards: 0, owned: {}, freeDay: '', paidDay: '', paidToday: 0, setsClaimed: {}, milesClaimed: [] },
    settings: { music: true, sfx: true, haptics: true, notif: false, reduceMotion: false, battery: false, paidPulls: true },
    stats: { collected: 0, pearls: 0, hatched: 0, evolved: 0, pets: 0, placed: 0, levelups: 0, gifts: 0, days: 0 },
    tut: { step: 0, done: false },
    flags: {},
  };
}
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/** Overlay saved data onto a fresh default state, keeping the default's shape (wrong types are ignored, not trusted). */
function mergeInto(base, saved) {
  for (const k of Object.keys(saved)) {
    if (UNSAFE_KEYS.has(k)) continue;
    const b = base[k], v = saved[k];
    if (isObj(b)) { if (isObj(v)) mergeInto(b, v); }
    else if (Array.isArray(b)) { if (Array.isArray(v)) base[k] = v; }
    else if (b === undefined || (v !== null && typeof v === typeof b)) base[k] = v;   // b undefined: open-ended maps (dex, own, iap.done…)
  }
  return base;
}
/** `seq` counts writes: it is how the loader tells the newest of several saves apart (wall-clock time can't be trusted). */
export function serialize(state) {
  state.seq = (state.seq | 0) + 1;
  return JSON.stringify(state, (k, v) => (k[0] === '_' || k === 'ver' ? undefined : v));
}

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const asInt = (v, lo, hi, dflt) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? clamp(v, lo, hi) : dflt; };
const asNum = (v, lo, hi, dflt) => { v = Number(v); return Number.isFinite(v) ? clamp(v, lo, hi) : dflt; };
const MAX_CUR = 1e13;

/** Rebuild one pool from saved data, dropping/repairing anything that would break the rules. Returns null if unusable. */
function sanitizePool(biome, p, now, ids, orphans) {
  const B = BIOMES[biome];
  if (!isObj(p) || !Array.isArray(p.tiles)) return null;
  const w = asInt(p.w, 1, 16, 0), h = asInt(p.h, 1, 16, 0);
  if (!w || !h || p.tiles.length !== w * h) return null;
  const pool = { biome, exp: asInt(p.exp, 0, B.steps.length - 1, 0), w, h, ver: 1, tiles: [], creatures: [], eggs: [], nextEgg: asNum(p.nextEgg, 0, 8.64e15, now + 2 * HOUR) };
  for (const t of p.tiles) {
    const o = isObj(t) ? t : {};
    const tw = asInt(o.w, 0, B.maxW, 0);
    const pc = has(PIECES, o.p) && PIECES[o.p].biome === biome && PIECES[o.p].onW.includes(tw) ? o.p : null;
    const dc = !pc && has(DECOR, o.d) && DECOR[o.d].kind === 'prop' && (DECOR[o.d].place === 'shore' ? tw === 0 : tw >= 1) ? o.d : null;
    pool.tiles.push({ w: tw, p: pc, d: dc });
  }
  const newId = (v) => { v = asInt(v, 1, 2147483646, 0); if (v && !ids.has(v)) { ids.add(v); return v; } return 0; };
  const settle = (it, list) => {              // keep it on a tile it can stand on, unshared; otherwise drop it
    it.x = asInt(it.x, 0, w - 1, 0); it.y = asInt(it.y, 0, h - 1, 0);
    if (!(canStand(pool, famOf(it), it.x, it.y) && !occupantAt(pool, it.x, it.y)) && !relocate(pool, it)) return;
    list.push(it);
    if (!it.id) orphans.push(it);
  };
  for (const c of Array.isArray(p.creatures) ? p.creatures : []) {
    if (!isObj(c) || !has(FORMS, c.form)) continue;
    const stage = FORMS[c.form].stage, e = c.evo;
    const evo = isObj(e) && has(FORMS, e.to) && FORMS[e.to].fam === FORMS[c.form].fam && FORMS[e.to].stage === stage + 1 && Number.isFinite(e.end)
      ? { to: e.to, start: asNum(e.start, 0, 8.64e15, now), end: asNum(e.end, 0, 8.64e15, now) } : null;
    const it = { id: newId(c.id), form: c.form, x: c.x, y: c.y, lvl: asInt(c.lvl, 1, maxLevel(stage), 1), stored: asNum(c.stored, 0, 1e9, 0), spent: asNum(c.spent, 0, 1e12, 0), born: asNum(c.born, 0, 8.64e15, now), hat: has(DECOR, c.hat) && DECOR[c.hat].kind === 'hat' ? c.hat : null, evo };
    if (Number.isFinite(c.petAt)) it.petAt = c.petAt;
    settle(it, pool.creatures);
  }
  for (const e of Array.isArray(p.eggs) ? p.eggs : []) {
    if (!isObj(e) || !has(FAMILIES, e.fam) || FAMILIES[e.fam].biome !== biome) continue;
    settle({ id: newId(e.id), fam: e.fam, x: e.x, y: e.y, born: asNum(e.born, 0, 8.64e15, now), ready: asNum(e.ready, 0, 8.64e15, now) }, pool.eggs);
  }
  return pool;
}
/** The most recently written of several loaded saves (highest write counter; the clock is only a tie-breaker). */
export function newestSave(states) {
  return [...states].sort((a, b) => (b.seq - a.seq) || (b.lastTick - a.lastTick))[0] || null;
}
/** Parse + validate a save. Returns a healthy state or null (the caller then tries the next backup). */
export function deserialize(str, now) {
  let saved;
  try { saved = JSON.parse(str); } catch { return null; }
  if (!isObj(saved) || !isObj(saved.pools) || !isObj(saved.pools.tide)) return null;
  try { return rebuild(saved, now); } catch { return null; }
}
function rebuild(saved, now) {
  const st = newState(now, saved.seed);
  const pools = saved.pools;
  for (const k of Object.keys(saved)) if (k !== 'pools' && has(st, k)) mergeInto(st, { [k]: saved[k] });
  const ids = new Set(), orphans = [];
  st.pools = {};
  for (const [biome, p] of Object.entries(pools)) {
    if (!has(BIOMES, biome)) continue;
    const sp = sanitizePool(biome, p, now, ids, orphans);
    if (sp) st.pools[biome] = sp;
  }
  if (!st.pools.tide) return null;
  // numbers
  for (const k of ['pearls', 'glass', 'tokens', 'coins']) st.cur[k] = asNum(st.cur[k], 0, MAX_CUR, 0);
  st.xp = asNum(st.xp, 0, 1e12, 0);
  st.lvl = asInt(st.lvl, 1, D.MAX_POOL_LVL, 1);
  st.seq = asInt(st.seq, 0, 2 ** 40, 0);
  st.seed = (st.seed >>> 0) || 1;
  st.boost.until = asNum(st.boost.until, 0, 8.64e15, 0);
  st.boost.mult = asNum(st.boost.mult, 1, 10, 2);
  st.daily.n = asInt(st.daily.n, 0, 1e6, 0); st.daily.last = asNum(st.daily.last, -99, 1e6, -99); st.daily.shield = asInt(st.daily.shield, 0, 1, 1);
  st.tut.step = asInt(st.tut.step, 0, 99, 0);
  for (const k of Object.keys(st.stats)) st.stats[k] = asNum(st.stats[k], 0, 1e12, 0);
  // maps & lists keyed by content ids
  st.dex = Object.fromEntries(Object.entries(st.dex).filter(([k, v]) => has(FORMS, k) && Number.isFinite(v)));
  st.own = { ...Object.fromEntries(Object.keys(st.own).filter((k) => has(DECOR, k) && st.own[k] === true).map((k) => [k, true])), ...Object.fromEntries(D.FREE_DECOR.map((d) => [d, true])) };
  st.iap.done = Object.fromEntries(Object.entries(st.iap.done).filter(([, v]) => Number.isFinite(v)));
  st.iap.packs = Object.fromEntries(Object.keys(st.iap.packs).filter((k) => has(D.PACKS, k) && st.iap.packs[k]).map((k) => [k, true]));
  st.dexClaimed = st.dexClaimed.filter((i) => Number.isInteger(i) && i >= 0 && i < D.DEX_MILESTONES.length);
  const Q = st.quests;
  Q.list = Q.list.filter((q) => isObj(q) && D.QUEST_TEMPLATES.some((t) => t.id === q.id) && Number.isFinite(q.goal) && q.goal > 0 && Number.isFinite(q.prog))
    .map((q) => ({ id: q.id, ev: D.QUEST_TEMPLATES.find((t) => t.id === q.id).ev, goal: Math.floor(q.goal), prog: clamp(Math.floor(q.prog), 0, Math.floor(q.goal)), done: !!q.done, claimed: !!q.claimed, glass: asInt(q.glass, 0, 1e6, 0), coins: asInt(q.coins, 0, 1e6, 0), pearls: asInt(q.pearls, 0, 1e12, 0) }));
  sanitizeGacha(st);
  for (const k of ['skin', 'fx']) if (!(has(DECOR, st.equip[k]) && DECOR[st.equip[k]].kind === k && st.own[st.equip[k]])) st.equip[k] = k === 'skin' ? 'aqua' : 'bubbles';
  // ids
  st.nid = asInt(st.nid, 1, 2147483000, 1);
  for (const id of ids) st.nid = Math.max(st.nid, id + 1);
  for (const it of orphans) it.id = st.nid++;
  if (!Number.isFinite(st.lastTick) || st.lastTick > now + HOUR) st.lastTick = now;
  if (!Number.isFinite(st.lastSeen)) st.lastSeen = now;
  if (st.iap.deep && !st.pools.deep) st.pools.deep = starterDeepPool(st, now);   // never leave a paying player without their biome
  return st;
}

// ================================================================ tiles & traits
export const inb = (pool, x, y) => x >= 0 && y >= 0 && x < pool.w && y < pool.h;
export const tileAt = (pool, x, y) => (inb(pool, x, y) ? pool.tiles[y * pool.w + x] : null);
const bump = (pool) => { pool.ver++; };

function tileContrib(pool, t, out) {
  const wt = D.WATER_TR[pool.biome][t.w];
  if (wt) for (const k in wt) out[k] = (out[k] || 0) + wt[k];
  if (t.p) { const tr = PIECES[t.p].tr; for (const k in tr) out[k] = (out[k] || 0) + tr[k]; }
}
/** Habitat trait values (0-100) around a tile. Cached until the pool changes. */
export function traitsAt(pool, x, y) {
  if (!pool._tc || pool._tcv !== pool.ver) { pool._tc = new Map(); pool._tcv = pool.ver; }
  const key = y * pool.w + x;
  let r = pool._tc.get(key);
  if (r) return r;
  const raw = {};
  for (const [dx, dy, w] of D.KERNEL) {
    const t = tileAt(pool, x + dx, y + dy);
    if (!t) continue;
    const c = {};
    tileContrib(pool, t, c);
    for (const k in c) raw[k] = (raw[k] || 0) + c[k] * w;
  }
  r = {};
  for (const t of D.TRAITS) r[t] = Math.min(100, (raw[t] || 0) * D.TRAIT_SCALE);
  pool._tc.set(key, r);
  return r;
}
export function suitability(fam, tr) {
  let s = 0, z = 0;
  for (const k in fam.likes) { s += fam.likes[k] * tr[k]; z += fam.likes[k]; }
  return clamp(s / z / 60, 0, 1);
}
export function occupantAt(pool, x, y) {
  return pool.creatures.find((c) => c.x === x && c.y === y) || pool.eggs.find((e) => e.x === x && e.y === y) || null;
}
export function canStand(pool, fam, x, y) {
  const t = tileAt(pool, x, y);
  return !!t && !t.p && fam.w.includes(t.w);
}
const famOf = (item) => FAMILIES[item.fam || FORMS[item.form].fam];

function relocate(pool, item) {
  const fam = famOf(item);
  const seen = new Set([item.y * pool.w + item.x]);
  let q = [[item.x, item.y]];
  while (q.length) {
    const nq = [];
    for (const [x, y] of q) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = ny * pool.w + nx;
        if (!inb(pool, nx, ny) || seen.has(k)) continue;
        seen.add(k);
        if (canStand(pool, fam, nx, ny) && !occupantAt(pool, nx, ny)) { item.x = nx; item.y = ny; return true; }
        nq.push([nx, ny]);
      }
    }
    q = nq;
  }
  return false;
}

// ================================================================ economy helpers
export const dexCount = (state) => Object.keys(state.dex).length;
export const popCap = (state, pool) => 3 + pool.exp + Math.floor(state.lvl / 4);
export const population = (pool) => pool.creatures.length + pool.eggs.length;
export const levelCost = (stage, lvl) => Math.round(STAGE[stage].lvlBase * Math.pow(STAGE[stage].lvlGrow, lvl - 1));
export const maxLevel = (stage) => STAGE[stage].maxLvl;

export function globalMult(state, now) {
  let m = 1 + D.DEX_RATE_BONUS * dexCount(state);
  m *= 1 + D.POOL_RATE_BONUS * (state.lvl - 1);
  if (now < state.boost.until) m *= state.boost.mult;
  if (springTide(now).on) m *= D.SPRING_TIDE.rate;
  return m;
}
export function happiness(pool, c) {
  return suitability(famOf(c), traitsAt(pool, c.x, c.y));
}
/** Pearls per hour for one creature. */
export function creatureRate(state, pool, c, now, gm) {
  const f = FORMS[c.form];
  const g = gm ?? globalMult(state, now);
  return STAGE[f.stage].rate * BIOMES[pool.biome].rateMult * (1 + D.LVL_RATE_GAIN * (c.lvl - 1))
    * (0.7 + 0.6 * happiness(pool, c)) * g;
}
export function totalRate(state, now) {
  const gm = globalMult(state, now);
  let r = 0;
  for (const pool of Object.values(state.pools)) for (const c of pool.creatures) if (!c.evo) r += creatureRate(state, pool, c, now, gm);
  return r;
}
export const bubbleCap = (state, pool, c, now, gm) => creatureRate(state, pool, c, now, gm) * D.bubbleCapHours(state.lvl);
export const storedTotal = (state) => {
  let s = 0;
  for (const pool of Object.values(state.pools)) for (const c of pool.creatures) s += c.stored;
  return s;
};

// ================================================================ progression
export function unlocksAtLevel(L) {
  const out = [];
  for (const [id, p] of Object.entries(PIECES)) if (p.biome === 'tide' && p.unlock === L && L > 1) out.push({ kind: 'piece', id, name: p.name });
  for (const [id, f] of Object.entries(FAMILIES)) if (f.biome === 'tide' && f.unlock === L && L > 1) out.push({ kind: 'family', id, name: f.name });
  BIOMES.tide.steps.forEach((s, i) => { if (i && s.lvl === L) out.push({ kind: 'expand', name: `Pool expansion ${s.w}×${s.h}` }); });
  if (L === BIOMES.tide.deepUnlock) out.push({ kind: 'dig', name: 'Deep water digging' });
  return out;
}
export function addXp(state, n, events) {
  if (state.lvl >= D.MAX_POOL_LVL) return;
  state.xp += n;
  while (state.lvl < D.MAX_POOL_LVL && state.xp >= D.xpForLevel(state.lvl)) {
    state.xp -= D.xpForLevel(state.lvl);
    state.lvl++;
    events?.push({ type: 'levelup', lvl: state.lvl, unlocks: unlocksAtLevel(state.lvl) });
  }
}
function discover(state, formId, now, events) {
  if (state.dex[formId]) return false;
  state.dex[formId] = now;
  const st = FORMS[formId].stage;
  state.cur.glass += D.DISCOVER_GLASS[st];
  addXp(state, D.DISCOVER_XP[st], events);
  return true;
}

// ================================================================ eggs & hatching
export function pickSpawn(state, pool, forceFam, near) {
  const fams = D.FAMILIES_BY_BIOME[pool.biome].filter((f) => state.lvl >= FAMILIES[f].unlock);
  const starter = D.FAMILIES_BY_BIOME[pool.biome][0];
  const cands = {};
  for (const fid of fams) {
    if (forceFam && fid !== forceFam) continue;
    const fam = FAMILIES[fid];
    for (let y = 0; y < pool.h; y++) for (let x = 0; x < pool.w; x++) {
      if (!canStand(pool, fam, x, y) || occupantAt(pool, x, y)) continue;
      let s = suitability(fam, traitsAt(pool, x, y));
      if (near) s += Math.max(0, 0.5 - (Math.abs(x - near[0]) + Math.abs(y - near[1])) * 0.1);
      if (s >= 0.12 || fid === starter) (cands[fid] ||= []).push({ x, y, s });
    }
  }
  const fw = Object.entries(cands).map(([fid, arr]) => {
    const best = Math.max(...arr.map((a) => a.s));
    return [fid, forceFam ? 1 : Math.pow(best, 2) * 100 + (fid === starter ? 2 : 0)];
  });
  if (!fw.length) return null;
  let r = rand(state) * fw.reduce((a, b) => a + b[1], 0), fam = fw[0][0];
  for (const [fid, w] of fw) { if ((r -= w) <= 0) { fam = fid; break; } }
  const arr = cands[fam];
  let tr = rand(state) * arr.reduce((a, b) => a + b.s * b.s + 0.01, 0), spot = arr[0];
  for (const a of arr) { if ((tr -= a.s * a.s + 0.01) <= 0) { spot = a; break; } }
  return { fam, x: spot.x, y: spot.y };
}
export function spawnEgg(state, pool, now, opts = {}) {
  const s = pickSpawn(state, pool, opts.fam, opts.near);
  if (!s) return null;
  const egg = { id: state.nid++, fam: s.fam, x: s.x, y: s.y, born: now, ready: now + (opts.warm ?? D.EGG_WARM) };
  pool.eggs.push(egg);
  return egg;
}
export function hatchEgg(state, biome, eggId, now) {
  const pool = state.pools[biome];
  const i = pool.eggs.findIndex((e) => e.id === eggId);
  if (i < 0) return { ok: false, reason: 'gone' };
  const egg = pool.eggs[i];
  if (now < egg.ready) return { ok: false, reason: 'warming', wait: egg.ready - now };
  pool.eggs.splice(i, 1);
  const c = { id: egg.id, form: `${egg.fam}.0`, x: egg.x, y: egg.y, lvl: 1, stored: 0, spent: 0, born: now, hat: null, evo: null };
  pool.creatures.push(c);
  const events = [];
  const isNew = discover(state, c.form, now, events);
  addXp(state, 8, events);
  state.stats.hatched++;
  noteQuest(state, 'hatch', 1);
  bump(pool);
  return { ok: true, creature: c, isNew, events };
}

// ================================================================ collecting
export function collect(state, biome, cid) {
  const pool = state.pools[biome];
  const c = pool.creatures.find((k) => k.id === cid);
  if (!c) return 0;
  const amt = Math.floor(c.stored);
  if (amt < 1) return 0;
  c.stored -= amt;
  state.cur.pearls += amt;
  state.stats.collected++;
  state.stats.pearls += amt;
  noteQuest(state, 'collect', 1);
  noteQuest(state, 'pearls', amt);
  return amt;
}
export function collectAll(state, biome) {
  let total = 0, n = 0;
  for (const c of state.pools[biome].creatures) { const a = collect(state, biome, c.id); if (a) { total += a; n++; } }
  return { total, n };
}
export function petCreature(state, biome, cid, now) {
  const c = state.pools[biome].creatures.find((k) => k.id === cid);
  if (!c || (c.petAt && now - c.petAt < 20e3)) return { ok: false };
  c.petAt = now;
  state.cur.pearls += 1;
  state.stats.pets++;
  noteQuest(state, 'pet', 1);
  return { ok: true, reward: 1 };
}

// ================================================================ level-up & evolution
export function levelUp(state, biome, cid) {
  const pool = state.pools[biome];
  const c = pool.creatures.find((k) => k.id === cid);
  if (!c) return { ok: false, reason: 'gone' };
  const stage = FORMS[c.form].stage;
  if (c.evo) return { ok: false, reason: 'evolving' };
  if (c.lvl >= maxLevel(stage)) return { ok: false, reason: 'max' };
  const cost = levelCost(stage, c.lvl);
  if (state.cur.pearls < cost) return { ok: false, reason: 'pearls', need: cost };
  state.cur.pearls -= cost;
  c.spent = (c.spent || 0) + cost;
  c.lvl++;
  state.stats.levelups++;
  const events = [];
  addXp(state, STAGE[stage].lvlXp, events);
  noteQuest(state, 'levelup', 1);
  return { ok: true, cost, lvl: c.lvl, events };
}
export function evoDuration(state, stage) {
  if (!state.flags.firstEvo) return D.TUTORIAL_EVO_TIME;
  const base = STAGE[stage].evoTime;
  return state.iap.hourglass ? base * D.HOURGLASS_FACTOR : base;
}
/** What could this creature evolve into, and what is still missing? */
export function evoInfo(state, pool, c) {
  const f = FORMS[c.form], fam = FAMILIES[f.fam], stage = f.stage;
  const traits = traitsAt(pool, c.x, c.y);
  const info = { stage, traits, maxed: stage >= 3, evolving: !!c.evo, needLvl: STAGE[stage].evoLvl, lvlOk: c.lvl >= STAGE[stage].evoLvl, cost: STAGE[stage].evoCost, branches: [], best: null, mythic: null, canStart: false, reason: '' };
  if (info.maxed) { info.reason = 'max'; return info; }
  if (stage === 1) {
    for (const trait of Object.keys(fam.br)) {
      const form = D.branchForm(f.fam, trait), value = traits[trait];
      info.branches.push({ trait, form, value, need: D.BRANCH_NEED, met: value >= D.BRANCH_NEED, known: !!state.dex[form] });
    }
    const met = info.branches.filter((b) => b.met).sort((a, b) => b.value - a.value);
    info.best = met[0] || null;
    info.to = info.best?.form;
  } else {
    const trait = f.trait, second = fam.second;
    const m = { trait, form: D.mythicForm(f.fam, trait), value: traits[trait], need: D.MYTHIC_NEED, second, secondValue: traits[second], needSecond: D.MYTHIC_SECOND, known: !!state.dex[D.mythicForm(f.fam, trait)] };
    m.met = m.value >= m.need && m.secondValue >= m.needSecond;
    info.mythic = m;
    info.to = m.met ? m.form : null;
  }
  info.dur = evoDuration(state, stage);
  if (c.evo) info.reason = 'evolving';
  else if (!info.lvlOk) info.reason = 'level';
  else if (!info.to) info.reason = 'habitat';
  else if (state.cur.pearls < info.cost) info.reason = 'pearls';
  else info.canStart = true;
  return info;
}
export function startEvolution(state, biome, cid, now) {
  const pool = state.pools[biome];
  const c = pool.creatures.find((k) => k.id === cid);
  if (!c) return { ok: false, reason: 'gone' };
  const info = evoInfo(state, pool, c);
  if (!info.canStart) return { ok: false, reason: info.reason };
  state.cur.pearls -= info.cost;
  c.spent = (c.spent || 0) + info.cost;
  c.evo = { to: info.to, start: now, end: now + info.dur };
  state.flags.firstEvo = true;
  noteQuest(state, 'evolve', 1);
  return { ok: true, to: info.to, end: c.evo.end };
}
function finishEvolution(state, pool, c, events) {
  const now = c.evo.end;
  const to = c.evo.to;
  c.form = to;
  c.evo = null;
  state.stats.evolved++;
  const isNew = discover(state, to, now, events);
  addXp(state, D.STAGE[FORMS[to].stage].xp, events);
  events.push({ type: 'evolved', biome: pool.biome, id: c.id, form: to, first: isNew, at: now });
  bump(pool);
}
export function speedUpCost(state, c, now) {
  if (!c.evo || c.evo.end <= now) return 0;
  return Math.max(1, Math.ceil((c.evo.end - now) / (D.SPEEDUP_MIN_PER_GLASS * MIN)));
}
/** mode: 'glass' | 'token' | 'free' (daily Golden Hourglass finish). */
export function speedUp(state, biome, cid, now, mode) {
  const pool = state.pools[biome];
  const c = pool.creatures.find((k) => k.id === cid);
  if (!c?.evo) return { ok: false, reason: 'none' };
  const events = [];
  if (mode === 'token') {
    if (state.cur.tokens < 1) return { ok: false, reason: 'tokens' };
    state.cur.tokens--;
    c.evo.end -= D.TOKEN_MS;
  } else if (mode === 'free') {
    if (!freeFinishAvailable(state, now)) return { ok: false, reason: 'used' };
    state.flags.freeFinish = dayKey(now);
    c.evo.end = Math.min(c.evo.end, now);
  } else {
    const cost = speedUpCost(state, c, now);
    if (state.cur.glass < cost) return { ok: false, reason: 'glass', need: cost };
    state.cur.glass -= cost;
    c.evo.end = Math.min(c.evo.end, now);
  }
  if (c.evo.end <= now) finishEvolution(state, pool, c, events);
  return { ok: true, events };
}
export function freeFinishAvailable(state, now) { return !!state.iap.hourglass && isNewer(dayKey(now), state.flags.freeFinish); }

export function releaseCreature(state, biome, cid, now) {
  const pool = state.pools[biome];
  const i = pool.creatures.findIndex((k) => k.id === cid);
  if (i < 0) return { ok: false };
  const c = pool.creatures[i];
  // half of what was actually paid (level-ups and evolutions), so a release can never earn more than it cost
  const refund = Math.floor((c.spent || 0) * D.REFUND) + Math.floor(c.stored) + 5;
  state.cur.pearls += refund;
  pool.creatures.splice(i, 1);
  if (pool.nextEgg < now) pool.nextEgg = now + MIN;
  bump(pool);
  return { ok: true, refund };
}
export function setHat(state, biome, cid, hat) {
  const c = state.pools[biome].creatures.find((k) => k.id === cid);
  if (!c) return false;
  if (hat && !(state.own[hat] && DECOR[hat]?.kind === 'hat')) return false;
  c.hat = hat || null;
  return true;
}

// ================================================================ building
export const maxDig = (state, biome) => (biome === 'tide' ? (state.lvl >= BIOMES.tide.deepUnlock ? 2 : 1) : BIOMES.deep.maxW);
export function pieceUnlocked(state, id) { const p = PIECES[id]; return p.biome === 'deep' || state.lvl >= p.unlock; }
const fail = (reason, extra) => ({ ok: false, reason, ...extra });

/** Apply a build tool to one tile. tool: dig | fill | erase | piece:<id> | decor:<id> */
export function applyTool(state, biome, tool, x, y) {
  const pool = state.pools[biome];
  if (!pool) return fail('nopool');
  const t = tileAt(pool, x, y);
  if (!t) return fail('bounds');
  const B = BIOMES[biome];
  const occ = occupantAt(pool, x, y);
  const check = (mutate) => {
    // apply the mutation; if an occupant can no longer stand there, try to move it, else roll back
    const snap = { w: t.w, p: t.p, d: t.d };
    mutate();
    if (occ) {
      const fam = famOf(occ);
      if (!canStand(pool, fam, occ.x, occ.y)) {
        const from = [occ.x, occ.y];
        if (!relocate(pool, occ)) { Object.assign(t, snap); return false; }
        occ._moved = from;
      }
    }
    return true;
  };
  if (tool === 'dig') {
    if (t.p) return fail('piece');
    const nw = t.w + 1;
    if (nw > B.maxW) return fail('max');
    if (nw > maxDig(state, biome)) return fail('locked', { lvl: B.deepUnlock });
    const cost = B.digCost[nw];
    if (state.cur.pearls < cost) return fail('pearls', { need: cost });
    if (!check(() => { t.w = nw; if (t.d && DECOR[t.d].place === 'shore') t.d = null; })) return fail('occupied');
    state.cur.pearls -= cost;
    bump(pool);
    return { ok: true, cost, refund: 0 };
  }
  if (tool === 'fill') {
    if (t.p) return fail('piece');
    if (t.w <= 0) return fail('dry');
    const old = t.w, refund = Math.floor((B.digCost[old] || 0) * D.REFUND);
    if (!check(() => { t.w = old - 1; if (t.d && DECOR[t.d].place === 'float' && t.w === 0) t.d = null; })) return fail('occupied');
    state.cur.pearls += refund;
    bump(pool);
    return { ok: true, cost: 0, refund };
  }
  if (tool === 'erase') {
    if (t.p) { const refund = Math.floor(PIECES[t.p].cost * D.REFUND); t.p = null; state.cur.pearls += refund; bump(pool); return { ok: true, cost: 0, refund }; }
    if (t.d) { t.d = null; return { ok: true, cost: 0, refund: 0 }; }
    return fail('empty');
  }
  if (tool.startsWith('piece:')) {
    const id = tool.slice(6), p = PIECES[id];
    if (!p || p.biome !== biome) return fail('nope');
    if (!pieceUnlocked(state, id)) return fail('locked', { lvl: p.unlock });
    if (t.p === id) return fail('same');
    if (!p.onW.includes(t.w)) return fail('water');
    // placing over another piece swaps it, refunding part of the old one
    const refund = t.p ? Math.floor(PIECES[t.p].cost * D.REFUND) : 0;
    if (state.cur.pearls + refund < p.cost) return fail('pearls', { need: p.cost - refund });
    if (!check(() => { t.p = id; t.d = null; })) return fail('occupied');
    state.cur.pearls += refund - p.cost;
    state.stats.placed++;
    noteQuest(state, 'place', 1);
    bump(pool);
    return { ok: true, cost: p.cost, refund };
  }
  if (tool.startsWith('decor:')) {
    const id = tool.slice(6), d = DECOR[id];
    if (!d || d.kind !== 'prop') return fail('nope');
    if (!state.own[id]) return fail('notowned');
    if (t.p) return fail('piece');
    if (d.place === 'shore' && t.w !== 0) return fail('shore');
    if (d.place === 'float' && t.w < 1) return fail('float');
    if (t.d === id) return fail('same');
    t.d = id;
    bump(pool);
    return { ok: true, cost: 0, refund: 0 };
  }
  return fail('tool');
}
export function expandInfo(state, biome) {
  const pool = state.pools[biome], B = BIOMES[biome], next = B.steps[pool.exp + 1];
  if (!next) return null;
  return { ...next, lvlOk: state.lvl >= next.lvl, canPay: state.cur.pearls >= next.cost };
}
export function expandPool(state, biome) {
  const pool = state.pools[biome], info = expandInfo(state, biome);
  if (!info) return fail('max');
  if (!info.lvlOk) return fail('locked', { lvl: info.lvl });
  if (!info.canPay) return fail('pearls', { need: info.cost });
  state.cur.pearls -= info.cost;
  const tiles = [];
  for (let y = 0; y < info.h; y++) for (let x = 0; x < info.w; x++) tiles.push(x < pool.w && y < pool.h ? pool.tiles[y * pool.w + x] : { w: 0, p: null, d: null });
  pool.tiles = tiles; pool.w = info.w; pool.h = info.h; pool.exp++;
  const events = [];
  addXp(state, 20, events);
  bump(pool);
  return { ok: true, w: info.w, h: info.h, events };
}

// ================================================================ time advance
const CHUNK = 3 * HOUR;
function produce(state, pool, t0, t1) {
  if (t1 <= t0) return;
  const mid = (t0 + t1) / 2, gm = globalMult(state, mid), hrs = (t1 - t0) / HOUR;
  const capH = D.bubbleCapHours(state.lvl);
  for (const c of pool.creatures) {
    if (c.evo) continue;
    const r = creatureRate(state, pool, c, mid, gm);
    const cap = r * capH;
    // already-stored pearls are never removed, even if the cap later shrinks
    if (c.stored < cap) c.stored = Math.min(cap, c.stored + r * hrs);
  }
}
function advancePool(state, pool, t0, t1, events) {
  let t = t0, guard = 0;
  while (t < t1 && guard++ < 2000) {
    let next = Math.min(t1, t + CHUNK), kind = null, who = null;
    for (const c of pool.creatures) {
      if (!c.evo) continue;
      const e = Math.max(t, c.evo.end);
      if (e <= next) { next = e; kind = 'evo'; who = c; }
    }
    const canSpawn = (pool.biome !== 'tide' || state.tut.done) && population(pool) < popCap(state, pool);
    if (canSpawn && pool.nextEgg <= next && pool.nextEgg > t) { next = pool.nextEgg; kind = 'egg'; who = null; }
    else if (canSpawn && pool.nextEgg <= t) { next = t; kind = 'egg'; }
    if (state.boost.until > t && state.boost.until < next) { next = state.boost.until; kind = null; }
    produce(state, pool, t, next);
    t = next;
    if (kind === 'evo') finishEvolution(state, pool, who, events);
    else if (kind === 'egg') {
      const egg = spawnEgg(state, pool, t);
      const spring = springTide(t).on;
      pool.nextEgg = t + D.EGG_INTERVAL * (spring ? D.SPRING_TIDE.egg : 1);
      if (egg) events.push({ type: 'egg', biome: pool.biome, id: egg.id, fam: egg.fam, at: t });
    }
  }
}
/** Advance the world to `now` (handles both live ticks and long offline gaps). Returns events. */
export function tick(state, now) {
  const events = [];
  if (now < state.lastTick) { state.lastTick = now; return events; } // clock moved backwards: resync, grant nothing
  const t0 = Math.max(state.lastTick, now - D.MAX_OFFLINE);
  for (const pool of Object.values(state.pools)) advancePool(state, pool, t0, now, events);
  state.lastTick = now;
  return events;
}

// ================================================================ quests, daily, gifts
export function noteQuest(state, ev, n) {
  for (const q of state.quests.list) if (q.ev === ev && !q.done) { q.prog = Math.min(q.goal, q.prog + n); if (q.prog >= q.goal) q.done = true; }
}
export function ensureDaily(state, now) {
  const dk = dayKey(now);
  if (!isNewer(dk, state.quests.day)) return false;
  const rate = Math.max(30, totalRate(state, now));
  const canEvolve = Object.values(state.pools).some((p) => p.creatures.some((c) => FORMS[c.form].stage < 3));
  const pool = D.QUEST_TEMPLATES.filter((q) => q.id !== 'evolve' || canEvolve);
  const list = [];
  const bag = [...pool];
  while (list.length < D.QUEST_COUNT && bag.length) {
    const tpl = bag.splice(Math.floor(rand(state) * bag.length), 1)[0];
    const goal = tpl.scale ? Math.max(100, roundTo(rate * 2, 10)) : randInt(state, tpl.min, tpl.max);
    list.push({ id: tpl.id, ev: tpl.ev, goal, prog: 0, done: false, claimed: false, glass: tpl.glass, coins: tpl.coins || 0, pearls: Math.max(50, roundTo(rate * 0.3, 10)) });
  }
  state.quests = { day: dk, list, chest: false };
  return true;
}
export const questText = (q) => D.QUEST_TEMPLATES.find((t) => t.id === q.id).text(q.goal);
export function claimQuest(state, i) {
  const q = state.quests.list[i];
  if (!q || !q.done || q.claimed) return { ok: false };
  q.claimed = true;
  state.cur.glass += q.glass;
  state.cur.pearls += q.pearls;
  if (q.coins) state.cur.coins += q.coins;
  const events = [];
  addXp(state, 10, events);
  return { ok: true, glass: q.glass, pearls: q.pearls, coins: q.coins || 0, events };
}
export function claimQuestChest(state) {
  const Q = state.quests;
  if (Q.chest || !Q.list.length || !Q.list.every((q) => q.claimed)) return { ok: false };
  Q.chest = true;
  state.cur.glass += D.QUEST_ALL_BONUS.glass;
  state.cur.tokens += D.QUEST_ALL_BONUS.tokens;
  state.cur.coins += D.QUEST_ALL_BONUS.coins || 0;
  return { ok: true, ...D.QUEST_ALL_BONUS };
}
export function dailyAvailable(state, now) { return dayNum(now) > state.daily.last; }
export function claimDaily(state, now) {
  const today = dayNum(now), D0 = state.daily;
  if (today <= D0.last) return { ok: false };
  const gap = today - D0.last;
  let saved = false;
  if (gap === 1) D0.n++;
  else if (gap === 2 && D0.shield > 0) { D0.n++; D0.shield = 0; saved = true; }
  else D0.n = 1;
  if (D0.n % 7 === 0) D0.shield = 1;
  D0.last = today;
  state.stats.days++;
  const r = D.DAILY_REWARDS[(D0.n - 1) % 7];
  const out = { ok: true, n: D0.n, day: (D0.n - 1) % 7, saved, label: r.label };
  if (r.pearlsHours) { out.pearls = Math.max(100, Math.round(totalRate(state, now) * r.pearlsHours)); state.cur.pearls += out.pearls; }
  if (r.glass) { out.glass = r.glass; state.cur.glass += r.glass; }
  if (r.tokens) { out.tokens = r.tokens; state.cur.tokens += r.tokens; }
  if (r.coins) { out.coins = r.coins; state.cur.coins += r.coins; }
  return out;
}
export function giftAvailable(state, now) { return isNewer(giftWindow(now).key, state.gift.key); }
export function claimGift(state, now) {
  const w = giftWindow(now);
  if (!isNewer(w.key, state.gift.key)) return { ok: false };
  state.gift.key = w.key;
  state.stats.gifts++;
  noteQuest(state, 'gift', 1);
  const r = rand(state), rate = totalRate(state, now);
  const events = [];
  let out = { ok: true, window: w.name, events };
  if (r < 0.55) { out.pearls = Math.max(80, Math.round(rate * (0.5 + rand(state)))); state.cur.pearls += out.pearls; }
  else if (r < 0.78) { out.glass = randInt(state, 2, 4); state.cur.glass += out.glass; }
  else if (r < 0.86) { out.tokens = 1; state.cur.tokens += 1; }
  else if (r < 0.94) { out.coins = 1; state.cur.coins += 1; }
  else {
    const pool = state.pools.tide;
    const egg = population(pool) < popCap(state, pool) ? spawnEgg(state, pool, now, { warm: 0 }) : null;
    if (egg) out.egg = egg.id; else { out.glass = 3; state.cur.glass += 3; }
  }
  addXp(state, 5, events);
  return out;
}

// ================================================================ shop
export function buyDecor(state, id) {
  const d = DECOR[id];
  if (!d || state.own[id]) return fail('owned');
  if (d.gacha) return fail('gacha');
  if (d.pack || !d.price) return fail('pack');
  if (d.price.pearls) { if (state.cur.pearls < d.price.pearls) return fail('pearls', { need: d.price.pearls }); state.cur.pearls -= d.price.pearls; }
  else { if (state.cur.glass < d.price.glass) return fail('glass', { need: d.price.glass }); state.cur.glass -= d.price.glass; }
  state.own[id] = true;
  return { ok: true };
}
export function equip(state, id) {
  const d = DECOR[id];
  if (!d || !state.own[id]) return false;
  if (d.kind === 'skin') state.equip.skin = id;
  else if (d.kind === 'fx') state.equip.fx = id;
  else return false;
  return true;
}
export function buyBoost(state, id, now) {
  const b = D.BOOSTS[id];
  if (!b) return fail('nope');
  if (state.cur.glass < b.glass) return fail('glass', { need: b.glass });
  if (b.ff) {
    const rate = totalRate(state, now);
    if (rate <= 0) return fail('nothing');
    state.cur.glass -= b.glass;
    const pearls = Math.round(rate * b.ff);
    state.cur.pearls += pearls;
    return { ok: true, pearls };
  }
  if (b.mult) {
    state.cur.glass -= b.glass;
    state.boost = { until: Math.max(now, state.boost.until) + b.dur, mult: b.mult };
    return { ok: true, until: state.boost.until };
  }
  if (b.egg) {
    const pool = state.pools.tide;
    if (population(pool) >= popCap(state, pool)) return fail('full');
    const egg = spawnEgg(state, pool, now, { warm: 0 });
    if (!egg) return fail('nospot');
    state.cur.glass -= b.glass;
    return { ok: true, egg: egg.id };
  }
  return fail('nope');
}

/** The Deep Ocean starts with a small trench, a glowstone and an egg about to hatch, so the first minute is rewarding. */
function starterDeepPool(state, now) {
  const p = newPool('deep', now);
  const cx = Math.floor(p.w / 2) - 1, cy = Math.floor(p.h / 2) - 1;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) tileAt(p, cx + dx, cy + dy).w = 2;
  tileAt(p, cx - 1, cy).p = 'glowstone';
  tileAt(p, cx + 2, cy + 1).p = 'vent';
  p.nextEgg = now + 20 * MIN;
  spawnEgg(state, p, now, { fam: 'angler', warm: 12e3 });
  bump(p);
  return p;
}
/** Grant a purchase exactly once. opts.restore skips one-off glass bonuses. */
export function applyProduct(state, productId, txId, now, opts = {}) {
  const P = PRODUCTS[productId];
  if (!P) return fail('unknown');
  if (txId && state.iap.done[txId]) return { ok: true, dup: true };
  const out = { ok: true, product: productId, glass: 0 };
  if (P.type === 'consumable') {
    state.cur.glass += P.glass; out.glass = P.glass;
  } else {
    let already = false;
    if (P.deep) { already = state.iap.deep; state.iap.deep = true; if (!state.pools.deep) state.pools.deep = starterDeepPool(state, now); }
    else if (P.hourglass) { already = state.iap.hourglass; state.iap.hourglass = true; }
    else if (P.starter) { already = state.iap.starter; state.iap.starter = true; }
    else if (P.pack) { already = !!state.iap.packs[P.pack]; state.iap.packs[P.pack] = true; }
    const items = P.pack ? D.PACKS[P.pack].items : P.items || [];
    for (const it of items) state.own[it] = true;
    if (!already && !opts.restore && P.glass) { state.cur.glass += P.glass; out.glass = P.glass; }
    out.dup = already;
  }
  if (txId) {
    state.iap.done[txId] = now;
    const all = Object.entries(state.iap.done);
    if (all.length > 300) for (const [k] of all.sort((a, b) => a[1] - b[1]).slice(0, all.length - 300)) delete state.iap.done[k];
  }
  return out;
}


// ================================================================ Capsule Machine (gashapon)
// Cosmetic collectibles only. All odds are derived from data.js weights; pity and spending limits are enforced here.
function sanitizeGacha(st) {
  const g = st.gacha;
  for (const k of ['pulls', 'paidPulls', 'pityR', 'pityL', 'shards', 'paidToday']) g[k] = asInt(g[k], 0, 1e9, 0);
  g.pityR = Math.min(g.pityR, D.GACHA.pityRare - 1); g.pityL = Math.min(g.pityL, D.GACHA.pityLegend - 1);
  for (const id of Object.keys(g.owned)) {
    if (!has(D.POOL_BY_ID, id) || D.POOL_BY_ID[id].filler || !(g.owned[id] > 0)) delete g.owned[id];
    else g.owned[id] = asInt(g.owned[id], 1, 1e6, 1);
  }
  for (const id of Object.keys(g.owned)) st.own[id] = true;       // ownership can never be lost to a partial save
  for (const id of Object.keys(g.setsClaimed)) if (!D.TOY_SETS.some((x) => x.id === id) || !g.setsClaimed[id]) delete g.setsClaimed[id];
  g.milesClaimed = [...new Set(g.milesClaimed.filter((i) => Number.isInteger(i) && i >= 0 && i < D.TOY_MILESTONES.length))];
}
export const gachaWeek = (now) => Math.floor(dayNum(now) / 7);
const hash32 = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; };
/** This week's Spotlight: one Rare and one Legendary collectible are `spotMult` times as likely as their tier siblings. */
export function gachaSpotlight(now) {
  const wk = gachaWeek(now), pick = (tier, salt) => { const list = D.POOL_BY_TIER[tier].filter((i) => !i.filler); return list[hash32(wk * 31 + salt) % list.length].id; };
  const next = new Date((wk + 1) * 7 * 864e5);                 // the next week starts on this game day…
  return { week: wk, rare: pick('rare', 7), legendary: pick('legendary', 13), endsAt: new Date(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 4).getTime() };   // …at 4am local
}
const tableCache = new Map();   // one entry per spotlight week
/** Full drop table for the current week. rows: { id, tier, prob, spotlight }, tiers: { tierId: prob }. Probabilities sum to 1. */
export function gachaTable(now) {
  const sp = gachaSpotlight(now), key = `${sp.week}|${sp.endsAt}`;
  if (tableCache.has(key)) return tableCache.get(key);
  if (tableCache.size > 8) tableCache.clear();
  const rows = [], tiers = {};
  for (const t of D.GACHA.tiers) {
    const items = D.POOL_BY_TIER[t.id], wOf = (i) => i.w * (i.id === sp.rare || i.id === sp.legendary ? D.GACHA.spotMult : 1);
    const total = items.reduce((a, i) => a + wOf(i), 0);
    tiers[t.id] = t.p / 100;
    for (const i of items) rows.push({ id: i.id, tier: t.id, prob: (t.p / 100) * wOf(i) / total, spotlight: i.id === sp.rare || i.id === sp.legendary });
  }
  const out = { rows, tiers, spotlight: sp };
  tableCache.set(key, out);
  return out;
}
export const gachaFreeAvailable = (state, now) => isNewer(dayKey(now), state.gacha.freeDay);
export function gachaPaidLeft(state, now) {
  const g = state.gacha; return Math.max(0, D.GACHA.paidDailyCap - (isNewer(dayKey(now), g.paidDay) ? 0 : g.paidToday));
}
/** Pulls until the next guaranteed Rare-or-better / Legendary. */
export function gachaPity(state) {
  return { rare: Math.max(1, D.GACHA.pityRare - state.gacha.pityR), legendary: Math.max(1, D.GACHA.pityLegend - state.gacha.pityL) };
}
function pickWeighted(state, items, wOf) {
  let r = rand(state) * items.reduce((a, i) => a + wOf(i), 0);
  for (const i of items) { r -= wOf(i); if (r <= 0) return i; }
  return items[items.length - 1];
}
function grantCapsule(state, item, now) {
  const g = state.gacha, tier = D.TIER[item.tier], res = { id: item.id, tier: item.tier, kind: item.kind, name: item.name, isNew: false, shards: 0 };
  if (item.filler) {
    const r = item.reward; res.reward = {};
    if (r.coins) { state.cur.coins += r.coins; res.reward.coins = r.coins; }
    if (r.glass) { state.cur.glass += r.glass; res.reward.glass = r.glass; }
    if (r.tokens) { state.cur.tokens += r.tokens; res.reward.tokens = r.tokens; }
    if (r.pearlsHours) { const p = Math.max(100, Math.round(totalRate(state, now) * r.pearlsHours)); state.cur.pearls += p; res.reward.pearls = p; }
    return res;
  }
  if (g.owned[item.id]) { g.owned[item.id]++; g.shards += tier.shards; res.shards = tier.shards; }
  else { g.owned[item.id] = 1; res.isNew = true; }
  state.own[item.id] = true;
  return res;
}
/** One capsule. `sp` is this week's spotlight. Updates pity counters.
 *  Pity: never more than 9 pulls in a row without a Rare-or-better *collectible*, or 59 without a Legendary. The guaranteed pull is
 *  always a collectible (never a filler prize), and a filler prize never resets the counters. */
function rollCapsule(state, sp, now) {
  const g = state.gacha, T = D.GACHA;
  let tierId, forced = true;
  if (g.pityL + 1 >= T.pityLegend) tierId = 'legendary';
  else if (g.pityR + 1 >= T.pityRare) tierId = rand(state) * (D.TIER.rare.p + D.TIER.legendary.p) < D.TIER.legendary.p ? 'legendary' : 'rare';
  else { forced = false; let r = rand(state) * 100; tierId = 'legendary'; for (const t of T.tiers) { if ((r -= t.p) < 0) { tierId = t.id; break; } } }
  const items = forced ? D.POOL_BY_TIER[tierId].filter((i) => !i.filler) : D.POOL_BY_TIER[tierId];
  const item = pickWeighted(state, items, (i) => i.w * (i.id === sp.rare || i.id === sp.legendary ? T.spotMult : 1));
  g.pityR++; g.pityL++;
  if (!item.filler) { if (item.tier === 'legendary') { g.pityR = 0; g.pityL = 0; } else if (item.tier === 'rare') g.pityR = 0; }
  return grantCapsule(state, item, now);
}
/** mode: 'free' (daily, n=1) | 'coin' | 'glass'. Returns { ok, results[], paid, cost } or { ok:false, reason }. */
export function gachaPull(state, n, mode, now) {
  const g = state.gacha, T = D.GACHA;
  if (!(n === 1 || n === 10)) return fail('count');
  let cost = 0;
  if (mode === 'free') {
    if (n !== 1) return fail('count');
    if (!gachaFreeAvailable(state, now)) return fail('used');
  } else if (mode === 'coin') {
    cost = T.costCoin * n;
    if (state.cur.coins < cost) return fail('coins', { need: cost });
  } else if (mode === 'glass') {
    if (!state.settings.paidPulls) return fail('disabled');
    cost = n === 10 ? T.costGlass10 : T.costGlass * n;
    if (n > gachaPaidLeft(state, now)) return fail('cap', { left: gachaPaidLeft(state, now) });
    if (state.cur.glass < cost) return fail('glass', { need: cost });
  } else return fail('mode');
  if (mode === 'free') g.freeDay = dayKey(now);
  else if (mode === 'coin') state.cur.coins -= cost;
  else {
    state.cur.glass -= cost;
    if (isNewer(dayKey(now), g.paidDay)) { g.paidDay = dayKey(now); g.paidToday = 0; }
    g.paidToday += n; g.paidPulls += n;
  }
  const sp = gachaSpotlight(now), results = [];
  for (let i = 0; i < n; i++) results.push(rollCapsule(state, sp, now));
  g.pulls += n;
  state.stats.pulls = (state.stats.pulls || 0) + n;
  noteQuest(state, 'pull', n);
  const events = [];
  addXp(state, 2 * n, events);
  return { ok: true, results, cost, mode, pity: gachaPity(state), events };
}
/** Prize Counter: exchange shards for a specific un-owned collectible. */
export function prizeCost(id) { const it = D.POOL_BY_ID[id]; return it && !it.filler ? D.TIER[it.tier].prize : 0; }
export function prizeBuy(state, id) {
  const it = D.POOL_BY_ID[id], g = state.gacha;
  if (!it || it.filler) return fail('nope');
  if (g.owned[id]) return fail('owned');
  const c = prizeCost(id);
  if (g.shards < c) return fail('shards', { need: c });
  g.shards -= c; g.owned[id] = 1; state.own[id] = true;
  return { ok: true, cost: c };
}
export const toysOwned = (state) => D.COLLECTIBLE_IDS.reduce((a, id) => a + (state.gacha.owned[id] ? 1 : 0), 0);
export function toySetInfo(state) {
  return D.TOY_SETS.map((s) => ({ ...s, have: s.items.filter((i) => state.gacha.owned[i]).length, total: s.items.length, claimed: !!state.gacha.setsClaimed[s.id] }));
}
function giveReward(state, r) { if (r.coins) state.cur.coins += r.coins; if (r.glass) state.cur.glass += r.glass; if (r.tokens) state.cur.tokens += r.tokens; }
export function claimToySet(state, id) {
  const s = toySetInfo(state).find((x) => x.id === id);
  if (!s || s.claimed || s.have < s.total) return fail('nope');
  state.gacha.setsClaimed[id] = true; giveReward(state, s.reward);
  return { ok: true, reward: s.reward };
}
export function claimToyMile(state, i) {
  const m = D.TOY_MILESTONES[i], g = state.gacha;
  if (!m || g.milesClaimed.includes(i) || toysOwned(state) < m.n) return fail('nope');
  g.milesClaimed.push(i); giveReward(state, m.reward);
  return { ok: true, reward: m.reward };
}
