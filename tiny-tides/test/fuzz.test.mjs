// Property/fuzz test: hammer the rules with random, valid-or-invalid actions and assert that no invariant ever breaks.
// Seeded, so any failure reproduces: FUZZ_SEED=123 node --test test/fuzz.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/data.js';
import * as S from '../src/sim.js';

const T0 = new Date(2026, 2, 8, 6, 30, 0).getTime();     // near a US DST change on purpose
function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function check(st, now, ctx) {
  const fail = (m) => assert.fail(`${m}\n  after: ${ctx}`);
  for (const k of ['pearls', 'glass', 'tokens', 'coins']) if (!Number.isFinite(st.cur[k]) || st.cur[k] < 0) fail(`currency ${k}=${st.cur[k]}`);
  if (!Number.isInteger(st.cur.glass) || !Number.isInteger(st.cur.coins) || !Number.isInteger(st.cur.tokens)) fail(`non-integer premium currency ${JSON.stringify(st.cur)}`);
  if (!(st.lvl >= 1 && st.lvl <= D.MAX_POOL_LVL)) fail(`lvl ${st.lvl}`);
  if (!(st.xp >= 0) || (st.lvl < D.MAX_POOL_LVL && st.xp >= D.xpForLevel(st.lvl))) fail(`xp ${st.xp} at lvl ${st.lvl}`);
  const ids = new Set();
  for (const [biome, pool] of Object.entries(st.pools)) {
    if (pool.tiles.length !== pool.w * pool.h) fail(`${biome}: tiles ${pool.tiles.length} != ${pool.w}x${pool.h}`);
    const B = D.BIOMES[biome];
    pool.tiles.forEach((t, i) => {
      if (!(t.w >= 0 && t.w <= B.maxW && Number.isInteger(t.w))) fail(`${biome}: tile ${i} water ${t.w}`);
      if (t.p) {
        const p = D.PIECES[t.p]; if (!p) fail(`bad piece ${t.p}`);
        if (p.biome !== biome) fail(`${biome} holds foreign piece ${t.p}`);
        if (!p.onW.includes(t.w)) fail(`${t.p} stands on water level ${t.w}`);
        if (t.d) fail(`tile ${i} has both a piece and decor`);
      }
      if (t.d) {
        const d = D.DECOR[t.d]; if (!d || d.kind !== 'prop') fail(`bad decor ${t.d}`);
        if (d.place === 'shore' && t.w !== 0) fail(`shore decor ${t.d} on water`);
        if (d.place === 'float' && t.w < 1) fail(`float decor ${t.d} on sand`);
      }
    });
    const occ = new Set();
    for (const c of pool.creatures) {
      if (!D.FORMS[c.form]) fail(`bad form ${c.form}`);
      if (ids.has(c.id)) fail(`duplicate id ${c.id}`); ids.add(c.id);
      if (!S.inb(pool, c.x, c.y)) fail(`creature ${c.id} out of bounds (${c.x},${c.y})`);
      const fam = D.FAMILIES[D.FORMS[c.form].fam];
      if (!S.canStand(pool, fam, c.x, c.y)) fail(`creature ${c.id} (${c.form}) cannot stand at ${c.x},${c.y}`);
      const k = `${c.x},${c.y}`; if (occ.has(k)) fail(`two occupants at ${biome} ${k}`); occ.add(k);
      const stage = D.FORMS[c.form].stage;
      if (!(c.lvl >= 1 && c.lvl <= D.STAGE[stage].maxLvl)) fail(`creature level ${c.lvl} at stage ${stage}`);
      if (!Number.isFinite(c.stored) || c.stored < 0) fail(`stored ${c.stored}`);
      // earned pearls are never taken away when a boost/spring tide ends (the cap shrinks), so bound by the best-case cap instead
      const maxRate = D.STAGE[stage].rate * B.rateMult * (1 + D.LVL_RATE_GAIN * (c.lvl - 1)) * 1.3 * (1 + D.DEX_RATE_BONUS * S.dexCount(st)) * (1 + D.POOL_RATE_BONUS * (st.lvl - 1)) * 2 * D.SPRING_TIDE.rate;
      if (c.stored > maxRate * D.bubbleCapHours(st.lvl) * 1.001 + 1) fail(`stored ${c.stored} above the best-case bubble cap ${maxRate * D.bubbleCapHours(st.lvl)}`);
      if (c.evo && !D.FORMS[c.evo.to]) fail(`evo target ${c.evo.to}`);
      if (!st.dex[c.form]) fail(`creature ${c.form} missing from dex`);
    }
    for (const e of pool.eggs) {
      if (!D.FAMILIES[e.fam]) fail(`bad egg family ${e.fam}`);
      if (ids.has(e.id)) fail(`duplicate id ${e.id}`); ids.add(e.id);
      if (!S.inb(pool, e.x, e.y)) fail(`egg out of bounds`);
      if (!S.canStand(pool, D.FAMILIES[e.fam], e.x, e.y)) fail(`egg ${e.id} (${e.fam}) on invalid tile ${e.x},${e.y}`);
      const k = `${e.x},${e.y}`; if (occ.has(k)) fail(`egg shares tile ${biome} ${k}`); occ.add(k);
    }
    if (S.population(pool) > S.popCap(st, pool)) fail(`${biome}: population ${S.population(pool)} above cap ${S.popCap(st, pool)}`);
  }
  for (const id of ids) if (id >= st.nid) fail(`nid ${st.nid} not above used id ${id}`);
  for (const f of Object.keys(st.dex)) if (!D.FORMS[f]) fail(`dex has ${f}`);
  const g = st.gacha;
  if (!(g.pityR >= 0 && g.pityR < D.GACHA.pityRare) || !(g.pityL >= 0 && g.pityL < D.GACHA.pityLegend)) fail(`pity out of range ${g.pityR}/${g.pityL}`);
  if (!Number.isInteger(g.shards) || g.shards < 0) fail(`shards ${g.shards}`);
  if (g.paidToday > D.GACHA.paidDailyCap) fail(`paid pulls today ${g.paidToday} above cap`);
  for (const [id, n] of Object.entries(g.owned)) { if (!D.POOL_BY_ID[id] || D.POOL_BY_ID[id].filler) fail(`owned ${id}`); if (!(Number.isInteger(n) && n > 0)) fail(`owned count ${id}=${n}`); if (!st.own[id]) fail(`${id} owned in toybox but not in own`); }
  if (st.iap.deep !== !!st.pools.deep) fail('deep entitlement and deep pool disagree');
  // save round-trip is lossless and stable
  const noVer = (j) => JSON.stringify(JSON.parse(j), (k, v) => (k === 'ver' || k === 'seq' ? undefined : v));      // 'seq' counts writes; 'ver' is a render-cache counter (not saved)
  const j1 = noVer(S.serialize(st)), back = S.deserialize(S.serialize(st), now), j2 = noVer(S.serialize(back));
  if (j1 !== j2) {
    const where = (x, y, path) => {          // first path at which the two saves differ
      if (JSON.stringify(x) === JSON.stringify(y)) return null;
      if (x && y && typeof x === 'object' && typeof y === 'object') for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { const w = where(x[k], y[k], `${path}.${k}`); if (w) return w; }
      return `${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`;
    };
    fail(`serialize/deserialize is not idempotent at ${where(JSON.parse(j1), JSON.parse(j2), 'state')}`);
  }
}

function run(seed, steps) {
  const rnd = prng(seed), pick = (arr) => arr[Math.floor(rnd() * arr.length)], ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  let now = T0, st = S.newState(now, seed);
  st.tut.done = rnd() < 0.7; st.flags.firstEvo = rnd() < 0.7;
  st.cur.pearls = ri(0, 5000); st.cur.glass = ri(0, 500); st.cur.coins = ri(0, 30); st.cur.tokens = ri(0, 3);
  if (rnd() < 0.4) st.lvl = ri(1, 25);
  const log = [];
  const tools = ['dig', 'fill', 'erase', ...Object.keys(D.PIECES).map((p) => `piece:${p}`), ...D.DECOR_IDS.filter((d) => D.DECOR[d].kind === 'prop').map((d) => `decor:${d}`)];
  const products = D.PRODUCT_IDS;
  for (let i = 0; i < steps; i++) {
    const biomes = Object.keys(st.pools), biome = pick(biomes), pool = st.pools[biome];
    const cr = pool.creatures.length ? pick(pool.creatures) : null;
    const op = ri(0, 27);
    let what = `#${i} op${op}`;
    switch (op) {
      case 0: case 1: case 2: case 3: { const t = pick(tools), x = ri(-1, pool.w), y = ri(-1, pool.h); what = `tool ${t} ${biome}@${x},${y}`; if (t.startsWith('decor:') && rnd() < 0.8) st.own[t.slice(6)] = true; S.applyTool(st, biome, t, x, y); break; }
      case 4: what = `expand ${biome}`; S.expandPool(st, biome); break;
      case 5: { what = 'spawnEgg'; if (S.population(pool) < S.popCap(st, pool)) S.spawnEgg(st, pool, now, { warm: rnd() < 0.5 ? 0 : 60e3 }); break; }
      case 6: case 7: { const e = pool.eggs.length ? pick(pool.eggs) : null; what = `hatch ${e?.id}`; if (e) S.hatchEgg(st, biome, e.id, now); break; }
      case 8: case 9: what = `levelUp ${cr?.id}`; if (cr) S.levelUp(st, biome, cr.id); break;
      case 10: what = `evolve ${cr?.id}`; if (cr) S.startEvolution(st, biome, cr.id, now); break;
      case 11: what = `speedUp ${cr?.id}`; if (cr) S.speedUp(st, biome, cr.id, now, pick(['glass', 'token', 'free'])); break;
      case 12: what = `collect ${cr?.id}`; if (cr) S.collect(st, biome, cr.id); break;
      case 13: what = 'collectAll'; S.collectAll(st, biome); break;
      case 14: what = `release ${cr?.id}`; if (cr && rnd() < 0.4) S.releaseCreature(st, biome, cr.id, now); break;
      case 15: { const hats = D.DECOR_IDS.filter((d) => D.DECOR[d].kind === 'hat'); const h = pick(hats); what = `hat ${h}`; if (rnd() < 0.5) st.own[h] = true; if (cr) S.setHat(st, biome, cr.id, rnd() < 0.2 ? null : h); break; }
      case 16: case 17: case 18: { const dt = pick([60e3, 10 * 60e3, 3600e3, 5 * 3600e3, 26 * 3600e3, 3 * 864e5, 40 * 864e5, -3600e3, -864e5]); what = `tick ${dt / 60e3}min`; now += dt; const ev = S.tick(st, now); void ev; break; }
      case 19: what = 'daily/gift/quests'; S.ensureDaily(st, now); S.claimDaily(st, now); S.claimGift(st, now); if (st.quests.list.length) { const q = pick(st.quests.list); S.noteQuest(st, q.ev, ri(1, 5)); S.claimQuest(st, st.quests.list.indexOf(q)); S.claimQuestChest(st); } break;
      case 20: { const id = pick(D.DECOR_IDS); what = `buyDecor ${id}`; S.buyDecor(st, id); S.equip(st, id); break; }
      case 21: { const b = pick(Object.keys(D.BOOSTS)); what = `boost ${b}`; S.buyBoost(st, b, now); break; }
      case 22: { const p = pick(products), tx = rnd() < 0.3 ? `dup${ri(0, 3)}` : `tx${i}`; what = `product ${p} ${tx}`; S.applyProduct(st, p, tx, now, { restore: rnd() < 0.3 }); break; }
      case 23: case 24: { const n = pick([1, 10]), m = pick(['free', 'coin', 'glass']); what = `pull x${n} ${m}`; st.settings.paidPulls = rnd() < 0.9; S.gachaPull(st, n, m, now); break; }
      case 25: { const id = pick(D.COLLECTIBLE_IDS); what = `prize ${id}`; if (rnd() < 0.5) st.gacha.shards += ri(0, 200); S.prizeBuy(st, id); S.claimToySet(st, pick(D.TOY_SETS).id); S.claimToyMile(st, ri(0, 4)); break; }
      case 26: { what = 'save/load'; const back = S.deserialize(S.serialize(st), now); assert.ok(back, 'state failed to reload'); st = back; break; }
      case 27: { what = 'gift currency'; st.cur.pearls += ri(0, 200000); st.cur.glass += ri(0, 300); st.cur.coins += ri(0, 10); if (rnd() < 0.3) st.lvl = Math.min(D.MAX_POOL_LVL, st.lvl + ri(1, 5)); break; }
      default: break;
    }
    log.push(what); if (log.length > 12) log.shift();
    check(st, now, `seed ${seed}: ${log.join(' | ')}`);
  }
  return st;
}

test('fuzz: rules hold their invariants under random play (120 seeds x 250 steps)', () => {
  const only = process.env.FUZZ_SEED;
  const count = +process.env.FUZZ_COUNT || 120, steps = +process.env.FUZZ_STEPS || 250;
  const seeds = only ? [+only] : Array.from({ length: count }, (_, i) => 1000 + i);
  for (const s of seeds) run(s, only ? Math.max(steps, 600) : steps);
});
