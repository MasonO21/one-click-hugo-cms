// Economy invariants: nothing the player can do in the rules creates currency out of thin air.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/sim.js';
import * as D from '../src/data.js';

const T0 = new Date(2026, 5, 10, 15).getTime();
const prng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const world = (seed) => {
  const st = S.newState(T0, seed); st.tut.done = true; st.flags.firstEvo = true; st.lvl = 30; st.cur.pearls = 50000;
  for (let i = 0; i < 4; i++) { const e = S.spawnEgg(st, st.pools.tide, T0, { warm: 0 }); if (e) S.hatchEgg(st, 'tide', e.id, T0); }
  return st;
};

test('building never creates value: pearls plus what the tiles could be sold back for can only go down', () => {
  // (swapping an expensive rock for a cheap one does hand back pearls, but the expensive rock is gone: wealth still drops)
  const wealth = (st) => {
    let w = st.cur.pearls;
    for (const t of st.pools.tide.tiles) {
      for (let k = 1; k <= t.w; k++) w += D.REFUND * D.BIOMES.tide.digCost[k];
      if (t.p) w += D.REFUND * D.PIECES[t.p].cost;
    }
    return w;
  };
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = prng(seed), st = world(seed), pool = st.pools.tide;
    const tools = ['dig', 'fill', 'erase', ...D.PIECES_BY_BIOME.tide.map((p) => `piece:${p}`)];
    let w = wealth(st);
    for (let i = 0; i < 400; i++) {
      const t = tools[Math.floor(rnd() * tools.length)];
      S.applyTool(st, 'tide', t, Math.floor(rnd() * pool.w), Math.floor(rnd() * pool.h));
      const now = wealth(st);
      assert.ok(now <= w + 1e-9, `seed ${seed}: ${t} raised wealth ${w} -> ${now}`);
      w = now;
    }
  }
});

test('hatch -> level -> evolve -> release is a loss at every stage', () => {
  const st = world(3); st.cur.pearls = 1e7;
  const pool = st.pools.tide;
  for (const c of [...pool.creatures]) {
    const before = st.cur.pearls;
    while (c.lvl < 6 && S.levelUp(st, 'tide', c.id).ok);
    const r = S.releaseCreature(st, 'tide', c.id, T0);
    assert.ok(r.ok);
    assert.ok(st.cur.pearls <= before + 5 + Math.floor(c.stored), 'a release returns at most half of the spend');
  }
});

test('capsule prizes can never fund more capsules: coins and Sea Glass come back at a small fraction of the price', () => {
  let coins = 0, glass = 0;
  for (const r of S.gachaTable(T0).rows) { const it = D.POOL_BY_ID[r.id]; if (it.filler) { coins += r.prob * (it.reward.coins || 0); glass += r.prob * (it.reward.glass || 0); } }
  assert.ok(coins < 0.25 * D.GACHA.costCoin, `coin prizes return ${coins.toFixed(3)} coins per 1-coin pull`);
  assert.ok(glass < 0.05 * D.GACHA.costGlass, `Sea Glass prizes return ${glass.toFixed(2)} per ${D.GACHA.costGlass}`);
  // and the same holds when measured by actually pulling (pity included)
  const st = S.newState(T0, 9); st.tut.done = true; st.cur.coins = 1e6; const start = st.cur.coins;
  for (let i = 0; i < 20000; i++) S.gachaPull(st, 1, 'coin', T0);
  const net = start - st.cur.coins;
  assert.ok(net > 0.8 * 20000, `20000 coin pulls cost ${net} coins net`);
});

test('the daily Sea Glass pull cap holds however the pulls are grouped', () => {
  const st = S.newState(T0, 5); st.cur.glass = 1e6; st.tut.done = true;
  let done = 0;
  for (let i = 0; i < 100; i++) { const n = i % 3 === 0 ? 10 : 1; if (S.gachaPull(st, n, 'glass', T0).ok) done += n; }
  assert.equal(done <= D.GACHA.paidDailyCap, true, `${done} paid pulls in one day`);
  assert.equal(S.gachaPaidLeft(st, T0), D.GACHA.paidDailyCap - done);
  assert.ok(S.gachaPull(st, 1, 'glass', T0 + 864e5).ok, 'the next day resets it');
});

test('Sea Glass packs: bigger packs are better value and their bonus labels are true', () => {
  const packs = Object.values(D.PRODUCTS).filter((p) => p.type === 'consumable').sort((a, b) => a.glass - b.glass);
  const per = (p) => p.glass / parseFloat(p.price.slice(1));
  for (let i = 1; i < packs.length; i++) {
    assert.ok(per(packs[i]) > per(packs[i - 1]), `${packs[i].name} is not better value than ${packs[i - 1].name}`);
    const claimed = +/\+(\d+)%/.exec(packs[i].tag)[1], actual = (per(packs[i]) / per(packs[0]) - 1) * 100;
    assert.ok(Math.abs(claimed - actual) <= 0.6, `${packs[i].name}: label says ${claimed}%, real bonus ${actual.toFixed(1)}%`);
  }
});

test('one-off rewards are bounded: repeated claims of the same daily/gift/quest/dex/toy reward pay once', () => {
  const st = S.newState(T0, 11); st.tut.done = true;
  S.ensureDaily(st, T0);
  const g0 = st.cur.glass;
  S.claimDaily(st, T0); const g1 = st.cur.glass;
  for (let i = 0; i < 5; i++) S.claimDaily(st, T0);
  assert.equal(st.cur.glass, g1);
  assert.ok(g1 >= g0);
  for (const set of D.TOY_SETS) { for (const it of set.items) st.gacha.owned[it] = 1; }
  const before = { ...st.cur };
  for (const set of D.TOY_SETS) { S.claimToySet(st, set.id); S.claimToySet(st, set.id); }
  const once = { ...st.cur };
  for (const set of D.TOY_SETS) S.claimToySet(st, set.id);
  assert.deepEqual(st.cur, once);
  assert.ok(once.glass > before.glass);
});
