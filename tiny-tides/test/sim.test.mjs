import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/data.js';
import * as S from '../src/sim.js';

const T0 = Date.UTC(2026, 5, 10, 15, 0, 0); // a Wednesday afternoon, far from a spring tide
const fresh = (over = {}) => {
  const st = S.newState(T0, 12345);
  st.tut.done = true;
  st.flags.firstEvo = true;
  Object.assign(st, over);
  return st;
};
const put = (st, tool, x, y, biome = 'tide') => {
  const r = S.applyTool(st, biome, tool, x, y);
  assert.ok(r.ok, `${tool}@${x},${y} -> ${r.reason}`);
  return r;
};
const addCreature = (st, form, x, y, biome = 'tide', lvl = 1) => {
  const pool = st.pools[biome];
  const c = { id: st.nid++, form, x, y, lvl, stored: 0, born: T0, hat: null, evo: null };
  pool.creatures.push(c);
  pool.ver++;
  return c;
};

test('data integrity: 10 families x 7 forms, sane references', () => {
  assert.equal(D.FAMILY_IDS.length, 10);
  assert.equal(D.FORM_IDS.length, 70);
  for (const fid of D.FAMILY_IDS) {
    const fam = D.FAMILIES[fid];
    assert.equal(Object.keys(fam.br).length, 3, fid);
    assert.ok(D.TRAITS.includes(fam.second), fid);
    assert.ok(!(fam.second in fam.br), `${fid}: mythic secondary trait must differ from branch traits`);
    for (const t of Object.keys(fam.br)) assert.ok(D.TRAITS.includes(t));
    for (const k of Object.keys(fam.likes)) assert.ok(D.TRAITS.includes(k));
    assert.equal(D.formsOfFamily(fid).length, 7);
    const names = D.formsOfFamily(fid).map((f) => D.FORMS[f].name);
    assert.equal(new Set(names).size, 7, `${fid} has duplicate names`);
  }
  assert.equal(new Set(D.FORM_IDS.map((f) => D.FORMS[f].name)).size, 70, 'all form names unique');
  for (const [id, p] of Object.entries(D.PIECES)) {
    for (const k of Object.keys(p.tr)) assert.ok(D.TRAITS.includes(k), id);
    assert.ok(D.PIECES_BY_BIOME[p.biome].includes(id));
  }
  for (const pk of Object.values(D.PACKS)) for (const it of pk.items) assert.ok(D.DECOR[it], it);
  for (const [id, d] of Object.entries(D.DECOR)) assert.ok(d.free || d.price || d.pack, id);
  for (const id of D.IAP.glass) assert.equal(D.PRODUCTS[id].type, 'consumable');
  // every trait used by a branch must be producible by some piece/water in that biome
  for (const fid of D.FAMILY_IDS) {
    const biome = D.FAMILIES[fid].biome;
    const producible = new Set();
    for (const p of D.PIECES_BY_BIOME[biome]) for (const k of Object.keys(D.PIECES[p].tr)) producible.add(k);
    for (const lv of Object.values(D.WATER_TR[biome])) for (const k of Object.keys(lv)) producible.add(k);
    for (const t of [...Object.keys(D.FAMILIES[fid].br), D.FAMILIES[fid].second]) assert.ok(producible.has(t), `${fid} needs ${t}`);
  }
});

test('traits: kernel weights and water/piece contributions', () => {
  const st = fresh(); st.cur.pearls = 9999;
  const pool = st.pools.tide;
  put(st, 'piece:granite', 2, 2);
  assert.equal(Math.round(S.traitsAt(pool, 2, 2).stone), 25);
  assert.equal(Math.round(S.traitsAt(pool, 2, 3).stone), 19);   // 0.75 * 25
  assert.equal(Math.round(S.traitsAt(pool, 2, 4).stone), 11);   // 0.45 * 25
  assert.equal(S.traitsAt(pool, 0, 0).stone, 0);
  put(st, 'dig', 3, 2);
  assert.ok(S.traitsAt(pool, 2, 3).calm > 0, 'shallow water gives Calm');
  const before = S.traitsAt(pool, 2, 3).stone;
  put(st, 'piece:granite', 1, 2);
  assert.ok(S.traitsAt(pool, 2, 3).stone > before, 'cache invalidated after change');
});

test('building rules, costs, refunds and relocation', () => {
  const st = fresh(); st.cur.pearls = 500;
  const pool = st.pools.tide;
  const r = put(st, 'dig', 1, 1);
  assert.equal(r.cost, 8);
  assert.equal(st.cur.pearls, 492);
  assert.equal(S.applyTool(st, 'tide', 'dig', 1, 1).reason, 'locked', 'deep water gated by pool level');
  assert.equal(S.applyTool(st, 'tide', 'piece:mossy', 0, 0).reason, 'locked');
  assert.equal(S.applyTool(st, 'tide', 'piece:granite', 1, 1).ok, true, 'rock on shallow ok');
  assert.equal(S.applyTool(st, 'tide', 'dig', 1, 1).reason, 'piece', 'cannot dig under a rock');
  const e = S.applyTool(st, 'tide', 'erase', 1, 1);
  assert.equal(e.refund, 10);
  assert.equal(S.applyTool(st, 'tide', 'erase', 1, 1).reason, 'empty');
  const f = S.applyTool(st, 'tide', 'fill', 1, 1);
  assert.equal(f.refund, 4);
  assert.equal(S.applyTool(st, 'tide', 'fill', 1, 1).reason, 'dry');
  // a crab standing on sand gets moved when a rock lands on its tile
  const c = addCreature(st, 'crab.0', 2, 2);
  put(st, 'piece:granite', 2, 2);
  assert.ok(!(c.x === 2 && c.y === 2), 'creature was relocated');
  assert.ok(S.canStand(pool, D.FAMILIES.crab, c.x, c.y));
  // poor player
  st.cur.pearls = 0;
  assert.equal(S.applyTool(st, 'tide', 'piece:granite', 4, 4).reason, 'pearls');
  // out of bounds
  assert.equal(S.applyTool(st, 'tide', 'dig', 99, 99).reason, 'bounds');
});

test('decor placement rules', () => {
  const st = fresh(); st.cur.pearls = 500;
  assert.equal(S.applyTool(st, 'tide', 'decor:sandcastle', 0, 0).reason, 'notowned');
  st.own.sandcastle = true; st.own.duck = true;
  assert.ok(S.applyTool(st, 'tide', 'decor:sandcastle', 0, 0).ok);
  assert.equal(S.applyTool(st, 'tide', 'decor:duck', 0, 0).reason, 'float');
  put(st, 'dig', 1, 0);
  assert.ok(S.applyTool(st, 'tide', 'decor:duck', 1, 0).ok);
  assert.equal(S.applyTool(st, 'tide', 'decor:sandcastle', 1, 0).reason, 'shore');
  S.applyTool(st, 'tide', 'fill', 1, 0);
  assert.equal(S.tileAt(st.pools.tide, 1, 0).d, null, 'float decor removed when the water is filled in');
});

test('spawning: level-1 tide only ever produces the starter crab; eggs cap at population limit', () => {
  const st = fresh(); st.cur.pearls = 999;
  put(st, 'piece:granite', 2, 2);
  put(st, 'dig', 3, 3);
  const ev = S.tick(st, T0 + 6 * D.HOUR);
  const pool = st.pools.tide;
  assert.ok(pool.eggs.length > 0);
  assert.equal(pool.eggs.length, S.popCap(st, pool));
  assert.ok(pool.eggs.every((e) => e.fam === 'crab'));
  assert.equal(ev.filter((e) => e.type === 'egg').length, pool.eggs.length);
  // eggs sit on valid tiles, never on the same tile
  const seen = new Set();
  for (const e of pool.eggs) { assert.ok(S.canStand(pool, D.FAMILIES.crab, e.x, e.y)); const k = e.x + ',' + e.y; assert.ok(!seen.has(k)); seen.add(k); }
});

test('spawning follows habitat: kelp+shallows attract seahorses, deep water attracts jellies', () => {
  const st = fresh({ lvl: 8 }); st.cur.pearls = 1e6;
  const pool = st.pools.tide;
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2]]) put(st, 'dig', x, y);
  for (const [x, y] of [[0, 1], [4, 1], [0, 2], [4, 2], [2, 0]]) put(st, 'piece:kelp', x, y);
  const counts = {};
  for (let i = 0; i < 300; i++) {
    const s = S.pickSpawn(st, pool);
    counts[s.fam] = (counts[s.fam] || 0) + 1;
  }
  assert.ok(counts.horse > counts.crab, JSON.stringify(counts));
  // deep water pocket
  const st2 = fresh({ lvl: 8 }); st2.cur.pearls = 1e6;
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2], [1, 3], [2, 3]]) { put(st2, 'dig', x, y); put(st2, 'dig', x, y); }
  const c2 = {};
  for (let i = 0; i < 300; i++) { const s = S.pickSpawn(st2, st2.pools.tide); c2[s.fam] = (c2[s.fam] || 0) + 1; }
  assert.ok(c2.jelly > 30, JSON.stringify(c2));
  const jelly = S.pickSpawn(st2, st2.pools.tide, 'jelly');
  assert.equal(S.tileAt(st2.pools.tide, jelly.x, jelly.y).w, 2, 'jellies only stand in deep water');
});

test('hatching respects warm-up, grants discovery + xp once', () => {
  const st = fresh();
  const pool = st.pools.tide;
  const egg = S.spawnEgg(st, pool, T0);
  assert.equal(S.hatchEgg(st, 'tide', egg.id, T0).reason, 'warming');
  const r = S.hatchEgg(st, 'tide', egg.id, T0 + D.EGG_WARM);
  assert.ok(r.ok && r.isNew);
  assert.ok(st.dex['crab.0']);
  assert.equal(pool.creatures.length, 1);
  assert.equal(S.hatchEgg(st, 'tide', egg.id, T0 + D.EGG_WARM).reason, 'gone');
  const egg2 = S.spawnEgg(st, pool, T0);
  const r2 = S.hatchEgg(st, 'tide', egg2.id, T0 + D.EGG_WARM);
  assert.ok(!r2.isNew);
});

test('production: linear, capped by bubble capacity, survives long offline gaps', () => {
  const st = fresh(); st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  const c = addCreature(st, 'crab.0', 2, 2);
  const rate = S.creatureRate(st, st.pools.tide, c, T0);
  assert.ok(rate > 10 && rate < 60, `rate ${rate}`);
  S.tick(st, T0 + 1 * D.HOUR);
  assert.ok(Math.abs(c.stored - rate) < 0.5, `1h stored ${c.stored} vs ${rate}`);
  S.tick(st, T0 + 3 * 24 * D.HOUR);
  const cap = rate * D.bubbleCapHours(st.lvl);
  assert.ok(Math.abs(c.stored - cap) < 1, `capped at ${cap}, got ${c.stored}`);
  const got = S.collect(st, 'tide', c.id);
  assert.equal(got, Math.floor(cap));
  assert.ok(c.stored < 1);
  assert.equal(st.cur.pearls, 150 + got);
  // a clock that jumps backwards grants nothing and doesn't corrupt state
  const p = st.cur.pearls;
  S.tick(st, T0 - 5 * D.HOUR);
  assert.equal(st.cur.pearls, p);
  assert.equal(st.lastTick, T0 - 5 * D.HOUR);
});

test('evolution: branch chosen by habitat, needs level + habitat + pearls, completes offline', () => {
  const st = fresh(); st.cur.pearls = 5000; st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  const pool = st.pools.tide;
  const c = addCreature(st, 'crab.0', 2, 2);
  let info = S.evoInfo(st, pool, c);
  assert.equal(info.reason, 'level');
  c.lvl = 3;
  info = S.evoInfo(st, pool, c);
  assert.equal(info.reason, 'habitat');
  assert.equal(S.startEvolution(st, 'tide', c.id, T0).ok, false);
  put(st, 'piece:granite', 1, 2); put(st, 'piece:granite', 3, 2); put(st, 'piece:granite', 2, 1);
  info = S.evoInfo(st, pool, c);
  assert.equal(info.best.trait, 'stone');
  assert.ok(info.canStart);
  const before = st.cur.pearls;
  const r = S.startEvolution(st, 'tide', c.id, T0);
  assert.ok(r.ok);
  assert.equal(r.to, 'crab.b.stone');
  assert.equal(st.cur.pearls, before - D.STAGE[1].evoCost);
  assert.equal(c.evo.end - c.evo.start, D.STAGE[1].evoTime);
  assert.equal(S.startEvolution(st, 'tide', c.id, T0).reason, 'evolving');
  // rearranging mid-cocoon cannot change the outcome
  put(st, 'piece:granite', 2, 3);
  const evs = S.tick(st, T0 + 2 * D.HOUR);
  assert.equal(c.form, 'crab.b.stone');
  assert.equal(c.evo, null);
  assert.ok(evs.some((e) => e.type === 'evolved' && e.first));
  assert.ok(st.dex['crab.b.stone']);
  assert.equal(st.stats.evolved, 1);
  // cocoon time produces nothing
  assert.ok(c.stored < S.creatureRate(st, pool, c, T0) * 2, 'no production while evolving is counted before completion');
});

test('evolution: strongest trait wins; hourglass shortens; first evolution is a fast tutorial', () => {
  const st = fresh(); st.cur.pearls = 1e5; st.lvl = 6; st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  const pool = st.pools.tide;
  const c = addCreature(st, 'crab.0', 2, 2, 'tide', 3);
  put(st, 'piece:granite', 1, 2);
  put(st, 'piece:ember', 3, 2); put(st, 'piece:ember', 2, 1); put(st, 'piece:ember', 2, 3);
  assert.equal(S.evoInfo(st, pool, c).best.trait, 'warmth');
  st.iap.hourglass = true;
  assert.equal(S.evoDuration(st, 1), D.STAGE[1].evoTime * 0.75);
  st.flags.firstEvo = false;
  assert.equal(S.evoDuration(st, 1), D.TUTORIAL_EVO_TIME);
});

test('mythic evolution needs main + secondary trait and level 8', () => {
  const st = fresh(); st.cur.pearls = 1e6; st.lvl = 10; st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  st.pools.tide.exp = 0;
  const pool = st.pools.tide;
  const c = addCreature(st, 'crab.b.stone', 2, 2, 'tide', 8);
  for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) put(st, 'piece:granite', x, y);
  let info = S.evoInfo(st, pool, c);
  assert.ok(info.mythic.value >= 65, `stone ${info.mythic.value}`);
  assert.equal(info.reason, 'habitat', 'still missing glow');
  put(st, 'piece:pearlite', 1, 1); put(st, 'piece:pearlite', 3, 1); put(st, 'piece:pearlite', 3, 3);
  info = S.evoInfo(st, pool, c);
  assert.ok(info.canStart, JSON.stringify(info.mythic));
  assert.equal(info.to, 'crab.m.stone');
  c.lvl = 7;
  assert.equal(S.evoInfo(st, pool, c).reason, 'level');
});

test('speed-ups: glass, tokens, hourglass daily freebie', () => {
  const st = fresh(); st.cur.glass = 100; st.cur.tokens = 2;
  const c = addCreature(st, 'crab.0', 2, 2, 'tide', 3);
  st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  put(st, 'piece:granite', 1, 2); put(st, 'piece:granite', 3, 2); put(st, 'piece:granite', 2, 1);
  st.cur.pearls = 500;
  S.startEvolution(st, 'tide', c.id, T0);
  const cost = S.speedUpCost(st, c, T0);
  assert.equal(cost, Math.ceil(D.STAGE[1].evoTime / MINS(D.SPEEDUP_MIN_PER_GLASS)));
  assert.equal(S.speedUp(st, 'tide', c.id, T0, 'free').reason, 'used');
  const r = S.speedUp(st, 'tide', c.id, T0, 'glass');
  assert.ok(r.ok);
  assert.equal(st.cur.glass, 100 - cost + D.DISCOVER_GLASS[2], 'paid, then earned the first-discovery bonus');
  assert.equal(c.form, 'crab.b.stone');
  assert.equal(r.events.filter((e) => e.type === 'evolved').length, 1);
  // tokens shave an hour per use
  const c2 = addCreature(st, 'crab.0', 0, 4, 'tide', 3);
  put(st, 'piece:granite', 1, 4); put(st, 'piece:granite', 0, 3); put(st, 'piece:granite', 1, 3);
  st.flags.firstEvo = true;
  S.startEvolution(st, 'tide', c2.id, T0);
  assert.ok(c2.evo);
  const end0 = c2.evo.end;
  const t = S.speedUp(st, 'tide', c2.id, T0, 'token');
  assert.ok(t.ok);
  assert.equal(st.cur.tokens, 1);
  assert.equal(c2.evo.end, end0 - D.HOUR, 'a token shaves one hour');
  assert.ok(S.speedUp(st, 'tide', c2.id, T0, 'token').ok);
  assert.ok(c2.evo === null && c2.form.startsWith('crab.b.'), 'two tokens finish a 2h cocoon');
  // hourglass: one free finish per day
  st.iap.hourglass = true;
  const c3 = addCreature(st, 'crab.b.stone', 4, 4, 'tide', 8);
  c3.evo = { to: 'crab.m.stone', start: T0, end: T0 + 4 * D.HOUR };
  assert.ok(S.freeFinishAvailable(st, T0));
  assert.ok(S.speedUp(st, 'tide', c3.id, T0, 'free').ok);
  assert.equal(c3.form, 'crab.m.stone');
  assert.ok(!S.freeFinishAvailable(st, T0));
  assert.equal(S.freeFinishAvailable(st, T0 + 24 * D.HOUR), true, 'resets next day');
});

test('level-ups cost pearls, cap per stage and grant xp; pool levels unlock content', () => {
  const st = fresh(); st.cur.pearls = 1e6; st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  const c = addCreature(st, 'crab.0', 2, 2);
  const r = S.levelUp(st, 'tide', c.id);
  assert.ok(r.ok);
  assert.equal(r.cost, 15);
  assert.equal(c.lvl, 2);
  while (S.levelUp(st, 'tide', c.id).ok);
  assert.equal(c.lvl, D.STAGE[1].maxLvl);
  assert.equal(S.levelUp(st, 'tide', c.id).reason, 'max');
  const events = [];
  st.xp = 0; st.lvl = 1;
  S.addXp(st, 1000, events);
  assert.ok(st.lvl > 3);
  assert.ok(events.some((e) => e.type === 'levelup' && e.unlocks.length));
  assert.ok(S.unlocksAtLevel(2).some((u) => u.id === 'snail'));
});

test('pool expansion', () => {
  const st = fresh({ lvl: 3 }); st.cur.pearls = 100;
  assert.equal(S.expandPool(st, 'tide').reason, 'pearls');
  st.cur.pearls = 1000;
  put(st, 'piece:granite', 1, 1);
  const r = S.expandPool(st, 'tide');
  assert.ok(r.ok);
  const pool = st.pools.tide;
  assert.equal(pool.w * pool.h, pool.tiles.length);
  assert.equal(S.tileAt(pool, 1, 1).p, 'granite', 'existing tiles preserved');
  assert.equal(S.expandPool(st, 'tide').reason, 'locked');
  assert.equal(S.popCap(st, pool), 3 + 1 + 0);
});

test('release refunds part of the investment', () => {
  const st = fresh(); st.pools.tide.nextEgg = T0 - 1;
  const c = addCreature(st, 'crab.0', 2, 2, 'tide', 4);
  const before = st.cur.pearls;
  const r = S.releaseCreature(st, 'tide', c.id, T0);
  assert.ok(r.ok);
  const invested = S.levelCost(1, 1) + S.levelCost(1, 2) + S.levelCost(1, 3);
  assert.equal(r.refund, Math.floor(invested * 0.5) + 5);
  assert.equal(st.cur.pearls, before + r.refund);
  assert.equal(st.pools.tide.creatures.length, 0);
  assert.ok(st.pools.tide.nextEgg > T0, 'a fresh egg comes soon after freeing a slot');
});

test('purchases are credited exactly once; restore does not re-grant bonuses', () => {
  const st = fresh();
  const g = D.IAP.glass[1];
  const r1 = S.applyProduct(st, g, 'tx1', T0);
  assert.ok(r1.ok && !r1.dup);
  assert.equal(st.cur.glass, 20 + 330);
  const r2 = S.applyProduct(st, g, 'tx1', T0);
  assert.ok(r2.dup);
  assert.equal(st.cur.glass, 350, 'same transaction id never pays twice');
  S.applyProduct(st, g, 'tx2', T0);
  assert.equal(st.cur.glass, 680, 'a new consumable purchase does');
  // deep ocean
  const d1 = S.applyProduct(st, D.IAP.deep, 'tx3', T0);
  assert.ok(st.iap.deep && st.pools.deep);
  assert.equal(st.pools.deep.biome, 'deep');
  assert.equal(st.cur.glass, 730);
  S.applyProduct(st, D.IAP.deep, 'tx4', T0);
  assert.equal(st.cur.glass, 730, 'owning it already: no second bonus');
  // restore on a fresh install
  const st2 = fresh();
  S.applyProduct(st2, D.IAP.deep, 'r1', T0, { restore: true });
  assert.ok(st2.iap.deep);
  assert.equal(st2.cur.glass, 20);
  // packs + starter own the right decor
  S.applyProduct(st2, `${D.APP_ID}.pack.sakura`, 'p1', T0);
  assert.ok(st2.own.sakura && st2.own.petals && st2.own.bow);
  S.applyProduct(st2, D.IAP.starter, 's1', T0);
  assert.ok(st2.own.partyhat && st2.own.bubblegum);
  assert.equal(st2.cur.glass, 220);
  assert.equal(S.applyProduct(st2, 'bogus', 'x', T0).ok, false);
  assert.ok(d1.ok);
});

test('deep ocean pool: works like the tidepool with its own families & pieces', () => {
  const st = fresh(); st.cur.pearls = 1e6;
  S.applyProduct(st, D.IAP.deep, 'd', T0);
  const pool = st.pools.deep;
  assert.equal(pool.eggs.length, 1, 'a starter egg is waiting');
  assert.equal(pool.eggs[0].fam, 'angler');
  assert.ok(pool.tiles.filter((t) => t.w === 2).length >= 4 && pool.tiles.some((t) => t.p === 'glowstone'), 'starter trench + glowstone');
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]]) put(st, 'dig', x, y, 'deep');   // 2 -> 3 (trench)
  put(st, 'piece:glowstone', 1, 3, 'deep'); put(st, 'piece:glowstone', 4, 2, 'deep');
  assert.equal(S.applyTool(st, 'deep', 'piece:granite', 0, 0).reason, 'nope', 'tidepool pieces are not usable in the deep');
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(S.pickSpawn(st, pool).fam);
  assert.ok([...seen].every((f) => D.FAMILIES[f].biome === 'deep'));
  S.tick(st, T0 + 5 * D.HOUR);
  assert.ok(pool.eggs.length > 0);
  const egg = pool.eggs[0];
  const h = S.hatchEgg(st, 'deep', egg.id, T0 + 5 * D.HOUR);
  assert.ok(h.ok);
  const c = pool.creatures[0];
  assert.ok(S.creatureRate(st, pool, c, T0) > D.STAGE[1].rate * 1.3, 'deep creatures earn more');
});

test('daily quests, login streak with shield, tide gifts', () => {
  const st = fresh();
  S.ensureDaily(st, T0);
  assert.equal(st.quests.list.length, D.QUEST_COUNT);
  assert.equal(new Set(st.quests.list.map((q) => q.id)).size, D.QUEST_COUNT);
  assert.equal(S.ensureDaily(st, T0 + HOUR_(1)), false, 'same day: no regen');
  assert.equal(S.ensureDaily(st, T0 + 24 * D.HOUR), true, 'next day regenerates');
  const q = st.quests.list[0];
  S.noteQuest(st, q.ev, q.goal);
  assert.ok(q.done);
  const g0 = st.cur.glass;
  assert.ok(S.claimQuest(st, 0).ok);
  assert.ok(st.cur.glass > g0);
  assert.equal(S.claimQuest(st, 0).ok, false);
  for (const [i, qq] of st.quests.list.entries()) { S.noteQuest(st, qq.ev, qq.goal); S.claimQuest(st, i); }
  assert.ok(S.claimQuestChest(st).ok);
  assert.equal(S.claimQuestChest(st).ok, false);

  // login streak
  const s2 = fresh();
  const day = (n) => T0 + n * 24 * D.HOUR;
  assert.equal(S.claimDaily(s2, day(0)).n, 1);
  assert.equal(S.claimDaily(s2, day(0)).ok, false, 'once per day');
  assert.equal(S.claimDaily(s2, day(1)).n, 2);
  const skip = S.claimDaily(s2, day(3));   // missed one day: shield saves the streak
  assert.equal(skip.n, 3); assert.ok(skip.saved);
  const reset = S.claimDaily(s2, day(6));  // missed two days, shield spent: reset
  assert.equal(reset.n, 1);
  // 7th day gives the big prize and re-arms the shield
  for (let i = 7; i <= 12; i++) S.claimDaily(s2, day(i));
  assert.equal(s2.daily.n, 7);
  assert.equal(s2.daily.shield, 1);

  // tide gifts: once per window
  const s3 = fresh();
  const noon = new Date(2026, 5, 10, 13, 0, 0).getTime();
  assert.ok(S.giftAvailable(s3, noon));
  const gift = S.claimGift(s3, noon);
  assert.ok(gift.ok);
  assert.equal(S.claimGift(s3, noon + 30 * 60e3).ok, false);
  assert.ok(S.giftAvailable(s3, new Date(2026, 5, 10, 19, 0, 0).getTime()), 'evening window is a new gift');
  assert.equal(S.giftWindow(new Date(2026, 5, 11, 2, 0, 0).getTime()).key, S.giftWindow(new Date(2026, 5, 10, 22, 0, 0).getTime()).key, 'after midnight is still last evening');
  assert.ok(S.nextGiftAt(noon) > noon);
});
const MINS = (n) => n * 60e3;
function HOUR_(n) { return n * D.HOUR; }

test('spring tide follows the real moon', () => {
  assert.ok(S.springTide(Date.UTC(2000, 0, 21, 4, 40)).on, 'full moon 2000-01-21');
  assert.ok(S.springTide(Date.UTC(2000, 0, 6, 18, 14)).on, 'new moon 2000-01-06');
  assert.ok(!S.springTide(Date.UTC(2000, 0, 13, 12, 0)).on, 'first quarter');
  let on = 0;
  for (let d = 0; d < 300; d++) if (S.springTide(T0 + d * 864e5).on) on++;
  assert.ok(on > 25 && on < 60, `spring tide days per 300: ${on}`);
});

test('save round-trip, corruption handling, migration defaults', () => {
  const st = fresh(); st.cur.pearls = 4262;
  put(st, 'piece:granite', 1, 1); // costs 20 -> 4242
  const c = addCreature(st, 'crab.0', 2, 2, 'tide', 4);
  S.traitsAt(st.pools.tide, 2, 2); // populate cache
  const json = S.serialize(st);
  assert.ok(!json.includes('_tc'), 'caches are not persisted');
  const back = S.deserialize(json, T0 + 1000);
  assert.equal(back.cur.pearls, 4242);
  assert.equal(back.pools.tide.creatures[0].lvl, 4);
  assert.equal(S.tileAt(back.pools.tide, 1, 1).p, 'granite');
  assert.ok(back.nid > c.id);
  assert.equal(S.deserialize('not json', T0), null);
  assert.equal(S.deserialize('{"pools":{}}', T0), null);
  // old save missing newer keys still loads with defaults
  const old = JSON.parse(json); delete old.settings; delete old.daily; delete old.iap.packs;
  const migrated = S.deserialize(JSON.stringify(old), T0);
  assert.ok(migrated.settings && migrated.daily && migrated.iap.packs !== undefined);
  // garbage values are repaired
  const bad = JSON.parse(json); bad.cur.pearls = -5; bad.cur.glass = 'x'; bad.pools.tide.tiles[0].p = 'nonsense'; bad.pools.tide.creatures.push({ id: 99, form: 'ghost.0' });
  const fixed = S.deserialize(JSON.stringify(bad), T0);
  assert.equal(fixed.cur.pearls, 0);
  assert.equal(S.tileAt(fixed.pools.tide, 0, 0).p, null);
  assert.equal(fixed.pools.tide.creatures.length, 1);
});

test('shop: buying decor with pearls or glass, packs cannot be bought in-game', () => {
  const st = fresh(); st.cur.pearls = 200; st.cur.glass = 30;
  st.cur.pearls = D.DECOR.sandcastle.price.pearls + 80;
  assert.ok(S.buyDecor(st, 'sandcastle').ok);
  assert.equal(st.cur.pearls, 80);
  assert.equal(S.buyDecor(st, 'sandcastle').reason, 'owned');
  assert.equal(S.buyDecor(st, 'umbrella').reason, 'pearls');
  assert.ok(S.buyDecor(st, 'halo').ok);
  assert.equal(st.cur.glass, 5);
  assert.equal(S.buyDecor(st, 'crownhat').reason, 'pack');
  assert.ok(S.equip(st, 'aqua'));
  assert.equal(S.equip(st, 'neon'), false);
  const c = addCreature(st, 'crab.0', 1, 1);
  assert.equal(S.setHat(st, 'tide', c.id, 'crownhat'), false);
  assert.ok(S.setHat(st, 'tide', c.id, 'halo'));
  assert.equal(c.hat, 'halo');
});

test('boosts: fast-forward, sun surge doubles income, lucky egg', () => {
  const st = fresh(); st.cur.glass = 500; st.pools.tide.nextEgg = T0 + 999 * D.HOUR;
  assert.equal(S.buyBoost(st, 'ff2', T0).reason, 'nothing');
  const c = addCreature(st, 'crab.0', 2, 2);
  const rate = S.creatureRate(st, st.pools.tide, c, T0);
  const ff = S.buyBoost(st, 'ff2', T0);
  assert.ok(ff.ok);
  assert.ok(Math.abs(ff.pearls - rate * 2) < 3);
  assert.ok(S.buyBoost(st, 'sun', T0).ok);
  const r2 = S.creatureRate(st, st.pools.tide, c, T0 + 1);
  assert.ok(Math.abs(r2 / rate - 2) < 0.01, 'doubled');
  assert.ok(S.creatureRate(st, st.pools.tide, c, T0 + 3 * D.HOUR) < r2 * 0.6, 'expires');
  const before = st.pools.tide.eggs.length;
  assert.ok(S.buyBoost(st, 'egg', T0).ok);
  assert.equal(st.pools.tide.eggs.length, before + 1);
});

test('offline catch-up over a week is fast and consistent', () => {
  const st = fresh(); st.cur.pearls = 5000; st.lvl = 8;
  for (const [x, y] of [[1, 1], [2, 1]]) put(st, 'dig', x, y);
  put(st, 'piece:kelp', 0, 1); put(st, 'piece:granite', 3, 1);
  for (let i = 0; i < 3; i++) { const e = S.spawnEgg(st, st.pools.tide, T0, { warm: 0 }); S.hatchEgg(st, 'tide', e.id, T0); }
  const t = Date.now();
  const ev = S.tick(st, T0 + 7 * 24 * D.HOUR);
  assert.ok(Date.now() - t < 500, 'catch-up is fast');
  const pool = st.pools.tide;
  assert.ok(S.population(pool) <= S.popCap(st, pool));
  assert.ok(ev.filter((e) => e.type === 'egg').length >= 1);
  for (const c of pool.creatures) assert.ok(c.stored >= 0 && Number.isFinite(c.stored));
  assert.equal(st.lastTick, T0 + 7 * 24 * D.HOUR);
});
