// Capsule Machine economy check, using the real rules (src/sim.js). Usage: node tools/balance-gacha.mjs [players=400]
//  1. How many pulls does it take to own every toy, with and without spending shards at the Prize Counter?
//  2. What does that cost in Sea Glass / real money, and how many days does the daily pull cap stretch it over?
//  3. What does a player who never pays get in 30 / 90 days?
import * as D from '../../src/data.js';
import * as S from '../../src/sim.js';

const PLAYERS = +process.argv[2] || 400;
const T0 = new Date(2026, 5, 10, 9).getTime(), DAY = 864e5;
const GLASS_PER_USD = { 60: 60 / 0.99, 330: 330 / 4.99, 700: 700 / 9.99, 1500: 1500 / 19.99 };
const bestRate = Math.max(...Object.values(GLASS_PER_USD)), worstRate = Math.min(...Object.values(GLASS_PER_USD));
const total = D.COLLECTIBLE_IDS.length;
const pct = (arr, q) => arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(q * arr.length))];
const fresh = (seed) => { const st = S.newState(T0, seed); st.tut.done = true; st.flags.firstEvo = true; st.cur.coins = 1e9; st.cur.glass = 1e9; return st; };

// -------- 1 & 2: pulls to complete
function pullsToComplete(seed, useShards) {
  const st = fresh(seed); let pulls = 0;
  while (S.toysOwned(st) < total && pulls < 5000) {
    const r = S.gachaPull(st, 1, 'coin', T0 + Math.floor(pulls / 20) * DAY); if (!r.ok) throw new Error(r.reason);
    pulls++;
    if (useShards) {   // spend shards on the most valuable missing toy we can afford
      for (const t of ['legendary', 'rare', 'uncommon', 'common']) {
        for (const it of D.POOL_BY_TIER[t]) if (!it.filler && !st.gacha.owned[it.id] && st.gacha.shards >= S.prizeCost(it.id)) S.prizeBuy(st, it.id);
      }
    }
  }
  return pulls;
}
const rows = [];
for (const [label, shards] of [['pulls only', false], ['pulls + Prize Counter', true]]) {
  const xs = Array.from({ length: PLAYERS }, (_, i) => pullsToComplete(1000 + i, shards));
  const med = pct(xs, 0.5), p90 = pct(xs, 0.9);
  rows.push({
    plan: label, 'median pulls': med, 'p90 pulls': p90,
    'median Sea Glass': med * D.GACHA.costGlass, 'median $ (best pack)': +(med * D.GACHA.costGlass / bestRate).toFixed(0), 'median $ (smallest pack)': +(med * D.GACHA.costGlass / worstRate).toFixed(0),
    'days at daily cap': Math.ceil(med / D.GACHA.paidDailyCap),
  });
}
console.log(`\nCompleting the Toybox (${total} toys), ${PLAYERS} simulated players. Pull = ${D.GACHA.costGlass} Sea Glass, daily cap ${D.GACHA.paidDailyCap} pulls.`);
console.table(rows);

// -------- 3: a player who never pays: 1 free pull a day + Capsule Coins earned through play
function freePlayer(seed, days, coinsPerDay) {
  const st = S.newState(T0, seed); st.tut.done = true; st.flags.firstEvo = true; st.cur.coins = 2; st.cur.glass = 0;
  for (let d = 0; d < days; d++) {
    const now = T0 + d * DAY;
    S.ensureDaily(st, now);
    S.gachaPull(st, 1, 'free', now);
    st.cur.coins += coinsPerDay;
    while (st.cur.coins >= 1) S.gachaPull(st, 1, 'coin', now);
    for (const it of D.COLLECTIBLE_IDS) if (!st.gacha.owned[it]) for (const t of ['legendary', 'rare', 'uncommon', 'common']) if (D.POOL_BY_ID[it].tier === t && st.gacha.shards >= S.prizeCost(it)) S.prizeBuy(st, it);
  }
  return { toys: S.toysOwned(st), pulls: st.gacha.pulls };
}
// Capsule Coin income: tutorial +2, day-7 login +2 (weekly), quest 'pull' +1 (some days), quest chest +1 (most days), Tide Gifts 8% x 3/day, Dex/Toybox milestones (one-off)
const income = [['light (only daily chest & streak)', 0.9], ['regular', 1.6], ['dedicated', 2.4]];
const out = [];
for (const [label, cpd] of income) for (const days of [30, 90]) {
  const rs = Array.from({ length: 100 }, (_, i) => freePlayer(50 + i, days, cpd));
  out.push({ 'free player': label, days, 'coins/day': cpd, 'median pulls': pct(rs.map((r) => r.pulls), 0.5), 'median toys': pct(rs.map((r) => r.toys), 0.5), [`of ${total}`]: `${Math.round(100 * pct(rs.map((r) => r.toys), 0.5) / total)}%` });
}
console.log('\nPlayers who never pay (free daily capsule + Capsule Coins earned in play, duplicates -> shards -> Prize Counter):');
console.table(out);

// -------- fairness: what a "10 pull" gives on average
const N = 20000, st = fresh(7); let rare = 0, leg = 0, filler = 0, spot = 0;
const sp = S.gachaSpotlight(T0);
for (let i = 0; i < N; i++) {
  const r = S.gachaPull(st, 1, 'coin', T0).results[0], it = D.POOL_BY_ID[r.id];
  if (it.filler) filler++; if (it.tier === 'rare' || it.tier === 'legendary') { if (it.tier === 'rare') rare++; else leg++; } if (r.id === sp.rare || r.id === sp.legendary) spot++;
}
console.log(`\nMeasured over ${N} pulls (with pity, one long-lived account): Rare ${(100 * rare / N).toFixed(2)}%  Legendary ${(100 * leg / N).toFixed(2)}%  prize capsules ${(100 * filler / N).toFixed(1)}%  spotlight items ${(100 * spot / N).toFixed(2)}%  (published tier rates: Rare ${D.TIER.rare.p}%, Legendary ${D.TIER.legendary.p}%)`);
