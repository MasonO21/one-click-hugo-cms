import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/data.js';
import * as S from '../src/sim.js';

const T0 = new Date(2026, 5, 10, 15, 0, 0).getTime();
const fresh = (seed = 99) => { const st = S.newState(T0, seed); st.tut.done = true; st.flags.firstEvo = true; return st; };
const pull = (st, n = 1, mode = 'coin', now = T0) => { const r = S.gachaPull(st, n, mode, now); assert.ok(r.ok, `pull failed: ${r.reason}`); return r; };

test('pool integrity: every entry exists, tiers sum to 100%, odds table sums to 1', () => {
  assert.equal(D.GACHA.tiers.reduce((a, t) => a + t.p, 0), 100);
  assert.equal(new Set(D.GACHA_POOL.map((i) => i.id)).size, D.GACHA_POOL.length, 'unique ids');
  for (const i of D.GACHA_POOL) {
    assert.ok(D.TIER[i.tier], i.id);
    if (i.filler) assert.ok(i.reward && Object.keys(i.reward).length, i.id);
    else { assert.ok(D.DECOR[i.id]?.gacha === i.tier, `${i.id} decor tier matches pool tier`); }
  }
  assert.equal(D.FIG_IDS.length, 80, '70 creature figures + 10 golden');
  assert.equal(D.COLLECTIBLE_IDS.length, 99);
  const t = S.gachaTable(T0);
  assert.ok(Math.abs(t.rows.reduce((a, r) => a + r.prob, 0) - 1) < 1e-9);
  for (const tier of D.TIER_IDS) assert.ok(Math.abs(t.rows.filter((r) => r.tier === tier).reduce((a, r) => a + r.prob, 0) - D.TIER[tier].p / 100) < 1e-9, tier);
  // nothing purchasable directly can also be a capsule exclusive
  for (const id of D.COLLECTIBLE_IDS) { const d = D.DECOR[id]; assert.ok(!d.price && !d.pack, id); }
  // every art key the renderer needs exists
  for (const i of D.GACHA_POOL.filter((x) => x.kind === 'skin')) assert.ok(D.SKINS[i.id], i.id);
});

test('spotlight is stable within a week, changes across weeks, and boosts exactly those two items', () => {
  const a = S.gachaSpotlight(T0), b = S.gachaSpotlight(T0 + 2 * 864e5);
  if (S.gachaWeek(T0) === S.gachaWeek(T0 + 2 * 864e5)) assert.deepEqual(a, b);
  const weeks = new Set(); for (let w = 0; w < 40; w++) weeks.add(S.gachaSpotlight(T0 + w * 7 * 864e5).rare);
  assert.ok(weeks.size > 5, 'spotlight rotates');
  const t = S.gachaTable(T0), rare = t.rows.filter((r) => r.tier === 'rare' && !D.POOL_BY_ID[r.id].filler);
  const spot = rare.find((r) => r.spotlight), sib = rare.find((r) => !r.spotlight && D.POOL_BY_ID[r.id].w === D.POOL_BY_ID[spot.id].w);
  assert.ok(Math.abs(spot.prob / sib.prob - D.GACHA.spotMult) < 1e-9);
  assert.equal(t.rows.filter((r) => r.spotlight).length, 2);
});

test('paying: coins, glass, 10-pull discount, insufficient funds, disabled setting, daily cap', () => {
  const st = fresh(); st.cur.coins = 3; st.cur.glass = 1000;
  assert.equal(S.gachaPull(st, 5, 'coin', T0).reason, 'count');
  pull(st, 1, 'coin'); assert.equal(st.cur.coins, 2);
  assert.equal(S.gachaPull(st, 10, 'coin', T0).reason, 'coins');
  const rewardGlass = (r) => r.results.reduce((a, x) => a + (x.reward?.glass || 0), 0);   // filler capsules may refund a little
  const g0 = st.cur.glass; const r1 = pull(st, 1, 'glass'); assert.equal(r1.cost, 30); assert.equal(st.cur.glass, g0 - 30 + rewardGlass(r1));
  const g1 = st.cur.glass; const r10 = pull(st, 10, 'glass'); assert.equal(r10.cost, 270, 'ten pulls cost 270'); assert.equal(st.cur.glass, g1 - 270 + rewardGlass(r10));
  assert.equal(st.gacha.paidToday, 11);
  st.settings.paidPulls = false;
  assert.equal(S.gachaPull(st, 1, 'glass', T0).reason, 'disabled');
  assert.ok(S.gachaPull(st, 1, 'coin', T0).ok, 'coins still work when paid pulls are off');
  st.settings.paidPulls = true; st.cur.glass = 1e5;
  while (S.gachaPaidLeft(st, T0) >= 10) pull(st, 10, 'glass');
  const left = S.gachaPaidLeft(st, T0);
  assert.ok(left < 10 && st.gacha.paidToday <= D.GACHA.paidDailyCap);
  assert.equal(S.gachaPull(st, 10, 'glass', T0).reason, 'cap');
  assert.equal(S.gachaPull(st, 10, 'glass', T0 + 864e5).ok, true, 'the cap resets the next day');
  const poor = fresh(); poor.cur.glass = 29;
  assert.equal(S.gachaPull(poor, 1, 'glass', T0).reason, 'glass');
  assert.equal(poor.cur.glass, 29, 'a failed pull costs nothing');
});

test('free daily capsule: once a day, costs nothing', () => {
  const st = fresh();
  assert.ok(S.gachaFreeAvailable(st, T0));
  const r = pull(st, 1, 'free');
  assert.equal(r.cost, 0); assert.equal(st.cur.coins, 0);
  assert.equal(S.gachaPull(st, 1, 'free', T0).reason, 'used');
  assert.ok(!S.gachaFreeAvailable(st, T0));
  assert.ok(S.gachaFreeAvailable(st, T0 + 864e5));
  assert.equal(S.gachaPull(st, 10, 'free', T0 + 864e5).reason, 'count');
});

test('pity: Rare+ at least every 10 pulls, Legendary at least every 60, over 30 000 pulls', () => {
  const st = fresh(1234); st.cur.coins = 1e9;
  let sinceRare = 0, sinceLeg = 0, maxRare = 0, maxLeg = 0, n = 0; const tiers = {};
  for (let i = 0; i < 3000; i++) {
    for (const x of pull(st, 10, 'coin').results) {
      n++; tiers[x.tier] = (tiers[x.tier] || 0) + 1; sinceRare++; sinceLeg++;
      if (x.tier === 'rare' || x.tier === 'legendary') { maxRare = Math.max(maxRare, sinceRare); sinceRare = 0; }
      if (x.tier === 'legendary') { maxLeg = Math.max(maxLeg, sinceLeg); sinceLeg = 0; }
    }
  }
  assert.equal(n, 30000);
  assert.ok(maxRare <= D.GACHA.pityRare, `longest Rare+ drought ${maxRare}`);
  assert.ok(maxLeg <= D.GACHA.pityLegend, `longest Legendary drought ${maxLeg}`);
  const f = (t) => tiers[t] / n;
  // pity nudges rates up slightly, but they must stay close to the published tier rates
  assert.ok(Math.abs(f('common') - 0.58) < 0.05, `common ${f('common')}`);
  assert.ok(f('rare') > 0.10 && f('rare') < 0.16, `rare ${f('rare')}`);
  assert.ok(f('legendary') > 0.028 && f('legendary') < 0.048, `legendary ${f('legendary')}`);
});

test('item frequencies match the published per-item odds (chi-square style tolerance)', () => {
  const st = fresh(7); st.cur.coins = 1e9;
  const keep = [D.GACHA.pityRare, D.GACHA.pityLegend]; D.GACHA.pityRare = D.GACHA.pityLegend = 1e9;   // switch pity off to measure the raw odds
  const N = 60000, counts = {};
  try { for (let i = 0; i < N / 10; i++) for (const x of pull(st, 10, 'coin').results) counts[x.id] = (counts[x.id] || 0) + 1; }
  finally { [D.GACHA.pityRare, D.GACHA.pityLegend] = keep; }
  for (const r of S.gachaTable(T0).rows) {
    const exp = r.prob * N, sd = Math.sqrt(exp * (1 - r.prob));
    assert.ok(Math.abs((counts[r.id] || 0) - exp) < 5 * sd + 3, `${r.id}: got ${counts[r.id] || 0}, expected ${exp.toFixed(1)}`);
  }
});

test('new items go to the toybox; duplicates convert to shards; fillers pay out and never count as collectibles', () => {
  const st = fresh(5); st.cur.coins = 1e6;
  const seen = new Set(); let dupes = 0, shards = 0, fillers = 0;
  for (let i = 0; i < 400; i++) {
    const x = pull(st, 1, 'coin').results[0];
    if (D.POOL_BY_ID[x.id].filler) { fillers++; assert.ok(x.reward && !x.isNew && x.shards === 0); continue; }
    if (seen.has(x.id)) { dupes++; shards += x.shards; assert.ok(!x.isNew && x.shards === D.TIER[x.tier].shards); }
    else { seen.add(x.id); assert.ok(x.isNew); assert.ok(st.own[x.id]); assert.equal(st.gacha.owned[x.id], 1); }
  }
  assert.ok(dupes > 50 && fillers > 30);
  assert.equal(st.gacha.shards, shards);
  assert.equal(S.toysOwned(st), seen.size);
  for (const id of seen) assert.equal(st.gacha.owned[id] >= 1, true);
});

test('filler rewards land in the wallet', () => {
  const st = fresh(11); st.cur.coins = 1e6; const c0 = { ...st.cur };
  const b = { coins: 0, glass: 0, tokens: 0, pearls: 0 };
  for (let i = 0; i < 300; i++) { const x = pull(st, 1, 'coin').results[0]; if (x.reward) for (const k of Object.keys(b)) b[k] += x.reward[k] || 0; }
  assert.equal(st.cur.glass, c0.glass + b.glass);
  assert.equal(st.cur.tokens, c0.tokens + b.tokens);
  assert.equal(st.cur.pearls, c0.pearls + b.pearls);
  assert.equal(st.cur.coins, c0.coins - 300 + b.coins);
  assert.ok(b.coins > 0 && b.pearls > 0);
});

test('prize counter: buy a specific un-owned toy with shards', () => {
  const st = fresh(); st.gacha.shards = 7;
  const id = D.figId('crab.0');
  assert.equal(S.prizeCost(id), D.TIER.common.prize);
  assert.equal(S.prizeBuy(st, id).reason, 'shards');
  st.gacha.shards = 100;
  assert.ok(S.prizeBuy(st, id).ok);
  assert.equal(st.gacha.shards, 100 - D.TIER.common.prize);
  assert.ok(st.own[id] && st.gacha.owned[id] === 1);
  assert.equal(S.prizeBuy(st, id).reason, 'owned');
  assert.equal(S.prizeBuy(st, 'f_coin').reason, 'nope');
  assert.equal(S.prizeBuy(st, 'nonsense').reason, 'nope');
});

test('toybox sets and collector milestones pay out exactly once', () => {
  const st = fresh();
  const fam = D.TOY_SETS[0];
  assert.equal(S.claimToySet(st, fam.id).ok, false);
  for (const id of fam.items) { st.gacha.owned[id] = 1; st.own[id] = true; }
  const info = S.toySetInfo(st).find((s) => s.id === fam.id);
  assert.equal(info.have, 7);
  const c0 = st.cur.coins, g0 = st.cur.glass;
  assert.ok(S.claimToySet(st, fam.id).ok);
  assert.equal(st.cur.coins, c0 + fam.reward.coins); assert.equal(st.cur.glass, g0 + fam.reward.glass);
  assert.equal(S.claimToySet(st, fam.id).ok, false);
  for (const id of D.COLLECTIBLE_IDS.slice(0, 12)) st.gacha.owned[id] = 1;
  assert.ok(S.toysOwned(st) >= 10);
  assert.ok(S.claimToyMile(st, 0).ok);
  assert.equal(S.claimToyMile(st, 0).ok, false);
  assert.equal(S.claimToyMile(st, 1).ok, false, '25 not reached');
});

test('coins come from play: daily day-7, quest chest, tide gifts, quests; pull quest completes from a free capsule', () => {
  const st = fresh(); const day = (n) => T0 + n * 864e5;
  for (let i = 0; i < 6; i++) S.claimDaily(st, day(i));
  const c0 = st.cur.coins; const r = S.claimDaily(st, day(6)); assert.equal(r.coins, 2); assert.equal(st.cur.coins, c0 + 2);
  let got = 0; for (let i = 0; i < 400; i++) { const s2 = fresh(i + 1); const g = S.claimGift(s2, T0); if (g.coins) got++; }
  assert.ok(got > 15 && got < 60, `coins from ~8% of gifts: ${got}/400`);
  const q = fresh(); q.quests = { day: S.dayKey(T0), list: [{ id: 'pull', ev: 'pull', goal: 1, prog: 0, done: false, claimed: false, glass: 2, coins: 1, pearls: 50 }], chest: false };
  pull(q, 1, 'free'); assert.ok(q.quests.list[0].done);
  const c1 = q.cur.coins; S.claimQuest(q, 0); assert.equal(q.cur.coins, c1 + 1);
  for (let i = 0; i < 20; i++) { const s3 = fresh(i); S.ensureDaily(s3, T0 + i * 864e5 * 1); }
});

test('figurines are placeable decor only once owned; capsule items cannot be bought directly', () => {
  const st = fresh(); st.cur.pearls = 1e6;
  const id = D.figId('crab.0');
  assert.equal(S.applyTool(st, 'tide', `decor:${id}`, 0, 0).reason, 'notowned');
  assert.equal(S.buyDecor(st, id).reason, 'gacha');
  assert.equal(S.buyDecor(st, 'candy').reason, 'gacha');
  st.gacha.owned[id] = 1; st.own[id] = true;
  assert.ok(S.applyTool(st, 'tide', `decor:${id}`, 0, 0).ok);
  assert.equal(S.tileAt(st.pools.tide, 0, 0).d, id);
  st.gacha.owned.candy = 1; st.own.candy = true;
  assert.ok(S.equip(st, 'candy')); assert.equal(st.equip.skin, 'candy');
});

test('save round-trip keeps the collection; old saves gain gacha defaults; corrupt data is repaired', () => {
  const st = fresh(); st.cur.coins = 5; st.cur.glass = 9999;
  pull(st, 10, 'glass');
  const json = S.serialize(st);
  const back = S.deserialize(json, T0 + 1000);
  assert.deepEqual(back.gacha.owned, st.gacha.owned);
  assert.equal(back.gacha.pityR, st.gacha.pityR);
  assert.equal(back.cur.coins, st.cur.coins);
  const old = JSON.parse(json); delete old.gacha; delete old.cur.coins; delete old.settings.paidPulls;
  const mig = S.deserialize(JSON.stringify(old), T0);
  assert.equal(mig.cur.coins, 0); assert.equal(mig.settings.paidPulls, true); assert.equal(mig.gacha.pulls, 0);
  const bad = JSON.parse(json); bad.gacha.owned.bogus = 3; bad.gacha.owned.f_coin = 2; bad.gacha.shards = -4; bad.gacha.pityR = 'x'; bad.gacha.owned[D.figId('crab.0')] = 2; bad.own = {};
  const fixed = S.deserialize(JSON.stringify(bad), T0);
  assert.ok(!('bogus' in fixed.gacha.owned) && !('f_coin' in fixed.gacha.owned));
  assert.equal(fixed.gacha.shards, 0); assert.equal(fixed.gacha.pityR, 0);
  assert.ok(fixed.own[D.figId('crab.0')], 'ownership is rebuilt from the toybox');
});

test('determinism: the same seed and inputs give the same capsules (fair, replayable)', () => {
  const a = fresh(42), b = fresh(42); a.cur.coins = b.cur.coins = 100;
  const ra = pull(a, 10, 'coin').results.map((x) => x.id), rb = pull(b, 10, 'coin').results.map((x) => x.id);
  assert.deepEqual(ra, rb);
});
