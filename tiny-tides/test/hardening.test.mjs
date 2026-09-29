// Regression tests for defects found in review: clock changes, DST, damaged saves, capsule pity, purchase ledger.
// Time zone must be fixed before anything touches Date, so the rules layer is imported dynamically below.
process.env.TZ = 'America/New_York';
import test from 'node:test';
import assert from 'node:assert/strict';

const S = await import('../src/sim.js');
const D = await import('../src/data.js');

const HOUR = D.HOUR;
const T0 = new Date(2026, 5, 10, 15, 0, 0).getTime();   // Wed 10 Jun 2026, 3pm New York time
const DAY = 864e5;
const fresh = () => { const st = S.newState(T0, 4242); st.tut.done = true; st.flags.firstEvo = true; return st; };

// ------------------------------------------------------------------ the clock can't be used to re-arm anything
test('winding the clock back cannot re-claim daily rewards, quests, gifts, free capsules or the paid-pull cap', () => {
  const st = fresh();
  st.cur.glass = 1e6;
  const t1 = T0 + 3 * DAY;
  assert.ok(S.claimDaily(st, t1).ok);
  assert.ok(S.claimGift(st, t1).ok);
  assert.ok(S.gachaPull(st, 1, 'free', t1).ok);
  assert.equal(S.ensureDaily(st, t1), true);
  while (S.gachaPaidLeft(st, t1) > 0) assert.ok(S.gachaPull(st, 1, 'glass', t1).ok);
  const glass = st.cur.glass, coins = st.cur.coins, quests = JSON.stringify(st.quests);
  for (const back of [1 * HOUR, 6 * HOUR, DAY, 2 * DAY, 3 * DAY]) {
    const t = t1 - back;
    assert.equal(S.claimDaily(st, t).ok, false, `daily after -${back / HOUR}h`);
    assert.equal(S.claimGift(st, t).ok, false, `gift after -${back / HOUR}h`);
    assert.equal(S.gachaPull(st, 1, 'free', t).ok, false, `free capsule after -${back / HOUR}h`);
    assert.equal(S.gachaPaidLeft(st, t), 0, `paid pulls left after -${back / HOUR}h`);
    assert.equal(S.gachaPull(st, 1, 'glass', t).reason, 'cap');
    assert.equal(S.ensureDaily(st, t), false, `quests regenerated after -${back / HOUR}h`);
    assert.equal(S.dailyAvailable(st, t), false);
    assert.equal(S.giftAvailable(st, t), false);
  }
  assert.equal(st.cur.glass, glass); assert.equal(st.cur.coins, coins); assert.equal(JSON.stringify(st.quests), quests);
  // …and the next real day still works
  assert.ok(S.claimDaily(st, t1 + DAY).ok);
  assert.ok(S.gachaPull(st, 1, 'free', t1 + DAY).ok);
  assert.equal(S.gachaPaidLeft(st, t1 + DAY), D.GACHA.paidDailyCap);
});

test('the hourglass daily free finish cannot be re-armed by the clock either', () => {
  const st = fresh(); st.iap.hourglass = true;
  assert.equal(S.freeFinishAvailable(st, T0), true);
  st.flags.freeFinish = S.dayKey(T0);
  assert.equal(S.freeFinishAvailable(st, T0 - DAY), false);
  assert.equal(S.freeFinishAvailable(st, T0 + DAY), true);
});

// ------------------------------------------------------------------ DST
test('game-day keys and numbers roll over at the same instant (4am local) across DST changes', () => {
  for (const start of [new Date(2026, 2, 7, 12), new Date(2026, 10, 0, 12)]) {       // around 8 Mar (spring forward) and 1 Nov (fall back)
    let prev = null;
    for (let t = start.getTime(); t < start.getTime() + 4 * DAY; t += 10 * 60e3) {
      const cur = { key: S.dayKey(t), num: S.dayNum(t) };
      if (prev) {
        assert.equal(cur.key !== prev.key, cur.num !== prev.num, `key/num disagree at ${new Date(t).toString()}`);
        if (cur.key !== prev.key) { const d = new Date(t); assert.equal(d.getHours(), 4, `rolled at ${d.toString()}`); assert.equal(cur.num, prev.num + 1); assert.ok(cur.key > prev.key); }
      }
      prev = cur;
    }
  }
});

test('the weekly spotlight ends at 4am local, including across a DST change', () => {
  for (let wk = 0; wk < 80; wk++) {
    const now = new Date(2026, 0, 1 + wk * 7 + 3, 12).getTime();
    const sp = S.gachaSpotlight(now), end = new Date(sp.endsAt);
    assert.equal(end.getHours(), 4, `week ${sp.week} ends ${end.toString()}`);
    assert.ok(sp.endsAt > now && sp.endsAt - now <= 7 * DAY + HOUR);
    assert.equal(S.gachaSpotlight(sp.endsAt - 1).week, sp.week);
    assert.equal(S.gachaSpotlight(sp.endsAt + 1).week, sp.week + 1);
  }
});

test('the drop table always reports its own week (no stale cache)', () => {
  const seen = new Map();
  for (let wk = 0; wk < 400; wk++) {
    const now = T0 + wk * 7 * DAY;
    const tb = S.gachaTable(now);
    assert.equal(tb.spotlight.week, S.gachaWeek(now));
    assert.equal(tb.spotlight.endsAt, S.gachaSpotlight(now).endsAt);
    assert.ok(Math.abs(tb.rows.reduce((a, r) => a + r.prob, 0) - 1) < 1e-9);
    seen.set(`${tb.spotlight.rare}|${tb.spotlight.legendary}`, 1);
  }
  assert.ok(seen.size > 20, 'spotlight rotates through many pairs');
});

// ------------------------------------------------------------------ damaged or tampered saves
function seededWorld() {
  const st = fresh();
  const pool = st.pools.tide;
  for (let i = 0; i < 3; i++) { const e = S.spawnEgg(st, pool, T0, { warm: 0 }); assert.ok(e); S.hatchEgg(st, 'tide', e.id, T0); }
  S.spawnEgg(st, pool, T0, { warm: 60e3 });
  st.cur.glass = 400; S.applyProduct(st, D.IAP.deep, 'tx-deep', T0);
  assert.ok(st.iap.deep && st.pools.deep);
  S.gachaPull(st, 10, 'glass', T0);
  S.ensureDaily(st, T0);
  const c = pool.creatures[0]; st.cur.pearls = 9999; S.levelUp(st, 'tide', c.id);
  return st;
}
const parsed = () => JSON.parse(S.serialize(seededWorld()));

/** Everything the game does with a loaded state, so a bad field would throw here rather than on a player's phone. */
function exercise(st, now) {
  S.tick(st, now + 5 * HOUR);
  S.ensureDaily(st, now + 5 * HOUR);
  S.tick(st, now + 3 * DAY);
  for (const [biome, pool] of Object.entries(st.pools)) {
    assert.equal(pool.tiles.length, pool.w * pool.h, `${biome} tiles`);
    for (const c of pool.creatures) { S.evoInfo(st, pool, c); S.creatureRate(st, pool, c, now); S.happiness(pool, c); }
    S.expandInfo(st, biome);
  }
  S.totalRate(st, now); S.storedTotal(st); S.dexCount(st); S.toysOwned(st); S.toySetInfo(st); S.gachaPity(st); S.gachaTable(now);
  S.claimDaily(st, now + 5 * HOUR); S.claimGift(st, now + 5 * HOUR); S.gachaPull(st, 1, 'free', now + 5 * HOUR);
  for (const q of st.quests.list) S.questText(q);
  S.serialize(st);
  // structural invariants
  const ids = new Set();
  for (const pool of Object.values(st.pools)) {
    const occ = new Set();
    for (const it of [...pool.creatures, ...pool.eggs]) {
      assert.ok(Number.isInteger(it.id) && it.id > 0 && !ids.has(it.id) && it.id < st.nid, `id ${it.id}`); ids.add(it.id);
      assert.ok(S.inb(pool, it.x, it.y), 'in bounds');
      const k = `${it.x},${it.y}`; assert.ok(!occ.has(k), `two occupants on ${k}`); occ.add(k);
      assert.ok(S.canStand(pool, D.FAMILIES[it.fam || D.FORMS[it.form].fam], it.x, it.y), 'standing somewhere they can');
    }
    for (const c of pool.creatures) { assert.ok(c.lvl >= 1 && c.lvl <= S.maxLevel(D.FORMS[c.form].stage)); assert.ok(Number.isFinite(c.stored) && c.stored >= 0); }
  }
  for (const k of ['pearls', 'glass', 'tokens', 'coins']) assert.ok(Number.isFinite(st.cur[k]) && st.cur[k] >= 0, k);
  if (st.iap.deep) assert.ok(st.pools.deep, 'deep entitlement keeps its pool');
  assert.equal(({}).polluted, undefined, 'prototype not polluted');
}

const MUTATIONS = {
  'null tile': (o) => { o.pools.tide.tiles[3] = null; },
  'tile with junk': (o) => { o.pools.tide.tiles[4] = { w: 'x', p: 'nope', d: 7 }; },
  'tile water out of range': (o) => { o.pools.tide.tiles[5].w = 99; },
  'null creature': (o) => { o.pools.tide.creatures[0] = null; },
  'creatures is a string': (o) => { o.pools.tide.creatures = 'nope'; },
  'eggs is a number': (o) => { o.pools.tide.eggs = 5; },
  'null cur': (o) => { o.cur = null; },
  'currency junk': (o) => { o.cur = { pearls: 'lots', glass: -50, tokens: null, coins: 1e99 }; },
  'null boost': (o) => { o.boost = null; },
  'bad evo target': (o) => { o.pools.tide.creatures[0].evo = { to: 'bogus', start: 0, end: 5 }; },
  'evo to another family': (o) => { o.pools.tide.creatures[0].evo = { to: 'jelly.0', start: 0, end: 5 }; },
  'creature out of bounds': (o) => { o.pools.tide.creatures[0].x = 999; o.pools.tide.creatures[0].y = -4; },
  'creature coordinates missing': (o) => { delete o.pools.tide.creatures[0].x; delete o.pools.tide.creatures[0].y; },
  'creatures share a tile': (o) => { const [a, b] = o.pools.tide.creatures; b.x = a.x; b.y = a.y; },
  'duplicate ids': (o) => { const cs = o.pools.tide.creatures; cs[1].id = cs[0].id; o.pools.tide.eggs[0].id = cs[0].id; },
  'ids missing': (o) => { for (const c of o.pools.tide.creatures) delete c.id; o.nid = 'x'; },
  'absurd level and stored pearls': (o) => { o.pools.tide.creatures[0].lvl = 1e9; o.pools.tide.creatures[0].stored = -5; o.pools.tide.creatures[1].stored = 'many'; },
  'unknown form': (o) => { o.pools.tide.creatures[0].form = 'kraken.9'; },
  'form named like an Object property': (o) => { o.pools.tide.creatures[0].form = 'constructor'; o.pools.tide.eggs[0].fam = '__proto__'; },
  'deep pool truncated while Deep Ocean is owned': (o) => { o.pools.deep.tiles.length = 3; },
  'deep pool missing while Deep Ocean is owned': (o) => { delete o.pools.deep; },
  'deep pool dimensions junk': (o) => { o.pools.deep.w = 'wide'; o.pools.deep.h = -1; },
  'gacha owned is null': (o) => { o.gacha.owned = null; },
  'gacha owned has junk keys': (o) => { o.gacha.owned = { constructor: 3, toString: 2, nope: 1, f_glass10: 4 }; },
  'gacha counters junk': (o) => { o.gacha.pityR = 1e9; o.gacha.pityL = -3; o.gacha.shards = 'a'; o.gacha.paidToday = null; o.gacha.milesClaimed = 'x'; o.gacha.setsClaimed = []; },
  'quests junk': (o) => { o.quests.list = [null, { id: 'nope' }, { id: 'collect', goal: 'x' }, 5]; },
  'equipped item does not exist': (o) => { o.equip = { skin: 'bogus', fx: null }; },
  'dex junk': (o) => { o.dex = { bogus: 1, 'crab.0': 'yesterday' }; },
  'iap junk': (o) => { o.iap = { deep: 'yes', done: null, packs: [] }; },
  'settings not an object': (o) => { o.settings = 3; },
  'prototype pollution attempt': (o) => { o.__proto__ = { polluted: true }; o.cur.__proto__ = { polluted: true }; o.constructor = { prototype: { polluted: true } }; },
  'top level junk': (o) => { o.extra = { a: 1 }; o.lastTick = 'now'; o.lvl = -4; o.xp = 'x'; o.seed = null; },
};
for (const [name, mutate] of Object.entries(MUTATIONS)) {
  test(`damaged save loads into a playable game: ${name}`, () => {
    const o = parsed();
    mutate(o);
    let json = JSON.stringify(o);
    if (name === 'prototype pollution attempt') json = json.replace(/^\{/, '{"__proto__":{"polluted":true},');
    const st = S.deserialize(json, T0);
    assert.ok(st, 'should recover, not refuse');
    exercise(st, T0);
    if (name.startsWith('deep pool')) assert.ok(st.pools.deep, 'a paying player keeps a Deep Ocean');
  });
}
test('unusable saves are refused cleanly so the loader falls back to the backup', () => {
  for (const bad of ['', '{', 'null', '[]', '"x"', '{"pools":null}', '{"pools":{"tide":5}}', '{"pools":{"tide":{"tiles":[]}}}', '{"pools":{"tide":{"w":5,"h":6,"tiles":[1,2,3]}}}']) assert.equal(S.deserialize(bad, T0), null, bad);
});
test('random corruption never crashes the loader or the game (fuzz)', () => {
  let seed = 99;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const junk = [null, 0, -1, 1e99, 'x', [], {}, true, NaN, undefined, '__proto__', 2 ** 40];
  const base = JSON.parse(S.serialize(seededWorld()));
  const paths = [];
  (function walk(x, p) { if (x && typeof x === 'object') for (const k of Object.keys(x)) { paths.push([...p, k]); walk(x[k], [...p, k]); } })(base, []);
  let refused = 0;
  for (let i = 0; i < 400; i++) {
    const o = JSON.parse(JSON.stringify(base));
    for (let m = 0, n = 1 + Math.floor(rnd() * 4); m < n; m++) {
      const path = paths[Math.floor(rnd() * paths.length)];
      let ref = o;
      for (let j = 0; j < path.length - 1 && ref; j++) ref = ref[path[j]];
      if (ref && typeof ref === 'object') { const v = junk[Math.floor(rnd() * junk.length)]; if (v === undefined) delete ref[path[path.length - 1]]; else ref[path[path.length - 1]] = v; }
    }
    const st = S.deserialize(JSON.stringify(o), T0);
    if (!st) { refused++; continue; }
    exercise(st, T0);
  }
  console.log(`# corruption fuzz: ${400 - refused} loaded, ${refused} refused`);
  assert.ok(refused < 200, `too many refusals: ${refused}`);
});

test('the newest write wins when several saves exist, whatever the clock says', () => {
  const st = fresh(); st.cur.glass = 20;
  const older = S.serialize(st);                  // seq 1
  st.cur.glass = 350; st.iap.done['tx-1'] = T0;
  const newer = S.serialize(st);                  // seq 2, then the clock is wound back before the next tick
  S.tick(st, T0 - 30 * 60e3);
  const a = S.deserialize(older, T0), b = S.deserialize(newer, T0);
  assert.ok(b.lastTick <= a.lastTick, 'precondition: the wall clock alone would prefer the older save');
  assert.equal(S.newestSave([a, b]).cur.glass, 350);
  assert.equal(S.newestSave([b, a]).cur.glass, 350);
  assert.equal(S.newestSave([]), null);
});

// ------------------------------------------------------------------ capsule fairness
test('a pity-guaranteed pull is always a real collectible, and prize capsules never reset the pity counters', () => {
  const st = fresh(); st.cur.coins = 1e9;
  const fillerRare = D.POOL_BY_TIER.rare.filter((i) => i.filler).map((i) => i.id);
  assert.ok(fillerRare.length > 0, 'the Rare tier does contain prize capsules (this test is meaningful)');
  let dryR = 0, dryL = 0, worstR = 0, worstL = 0;
  for (let i = 0; i < 30000; i++) {
    const before = { ...st.gacha };
    const forcedR = before.pityR + 1 >= D.GACHA.pityRare, forcedL = before.pityL + 1 >= D.GACHA.pityLegend;
    const r = S.gachaPull(st, 1, 'coin', T0).results[0];
    const item = D.POOL_BY_ID[r.id];
    if (forcedR || forcedL) assert.ok(!item.filler && (item.tier === 'rare' || item.tier === 'legendary'), `forced pull gave ${r.id}`);
    if (forcedL) assert.equal(item.tier, 'legendary');
    if (item.filler) { assert.equal(st.gacha.pityR, before.pityR + 1); assert.equal(st.gacha.pityL, before.pityL + 1); }
    dryR = !item.filler && (item.tier === 'rare' || item.tier === 'legendary') ? 0 : dryR + 1;
    dryL = !item.filler && item.tier === 'legendary' ? 0 : dryL + 1;
    worstR = Math.max(worstR, dryR); worstL = Math.max(worstL, dryL);
  }
  assert.ok(worstR <= D.GACHA.pityRare - 1, `${worstR} pulls in a row without a Rare-or-better collectible`);
  assert.ok(worstL <= D.GACHA.pityLegend - 1, `${worstL} pulls in a row without a Legendary`);
});

// ------------------------------------------------------------------ purchases
test('the purchase ledger trims the oldest transactions by age, never by key order', () => {
  const st = fresh();
  for (let i = 0; i < 320; i++) S.applyProduct(st, D.IAP.glass[0], String(9000000000000 - i * 7), T0 + i * 1000);   // descending numeric-looking ids
  const keys = Object.keys(st.iap.done);
  assert.equal(keys.length, 300);
  assert.ok(st.iap.done[String(9000000000000 - 319 * 7)], 'the newest is kept');
  assert.equal(st.iap.done[String(9000000000000)], undefined, 'the oldest was dropped');
  assert.ok(S.applyProduct(st, D.IAP.glass[0], String(9000000000000 - 319 * 7), T0).dup, 'recent transaction still de-duplicated');
});
