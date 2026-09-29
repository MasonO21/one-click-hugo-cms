// Economy sanity check: a scripted "typical" player (4 check-ins a day) over N days.
// Usage: node tools/balance.mjs [days] [checkinsPerDay]
import * as D from '../src/data.js';
import * as S from '../src/sim.js';

const DAYS = +process.argv[2] || 30;
const PER_DAY = +process.argv[3] || 4;
const HOURS = { 4: [8, 12.5, 18, 21.5], 3: [8, 13, 20], 2: [8, 20], 6: [7.5, 10, 13, 16, 19, 22] }[PER_DAY] || [8, 12.5, 18, 21.5];
const T0 = new Date(2026, 5, 10, 0, 0, 0).getTime();
const st = S.newState(T0 + 8 * D.HOUR, 777);
st.tut.done = true;
st.flags.firstEvo = true;
const pool = st.pools.tide;

const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
function bestPieceFor(trait) {
  const opts = D.PIECES_BY_BIOME.tide.filter((id) => S.pieceUnlocked(st, id) && D.PIECES[id].tr[trait]);
  opts.sort((a, b) => D.PIECES[b].tr[trait] / D.PIECES[b].cost - D.PIECES[a].tr[trait] / D.PIECES[a].cost);
  return opts[0];
}
function improveHabitat(c, want) {
  for (const trait of want) {
    if (trait === 'depth' || trait === 'calm') continue; // water shaping isn't modelled by this bot
    const id = bestPieceFor(trait);
    if (!id) continue;
    // prefer empty tiles, otherwise swap out a piece that doesn't help the wanted trait
    for (const swap of [false, true]) {
      for (const [dx, dy] of ADJ) {
        const t = S.tileAt(pool, c.x + dx, c.y + dy);
        if (!t || (t.p && !swap) || (t.p && D.PIECES[t.p].tr[trait])) continue;
        const r = S.applyTool(st, 'tide', `piece:${id}`, c.x + dx, c.y + dy);
        if (r.ok) return true;
      }
    }
  }
  return false;
}
function spend(now) {
  let guard = 0;
  while (guard++ < 200) {
    let acted = false;
    // expansions first when clearly affordable
    const ex = S.expandInfo(st, 'tide');
    if (ex && ex.lvlOk && st.cur.pearls > ex.cost * 1.2) { S.expandPool(st, 'tide'); acted = true; }
    for (const c of pool.creatures) {
      if (c.evo) continue;
      const info = S.evoInfo(st, pool, c);
      if (info.canStart) { S.startEvolution(st, 'tide', c.id, now); acted = true; continue; }
      if (info.reason === 'habitat' && info.lvlOk) {
        const want = info.stage === 1
          ? [info.branches.map((b) => b.trait).find((t) => bestPieceFor(t) && t !== 'depth' && t !== 'calm')]
          : [info.mythic.value < info.mythic.need && info.mythic.trait, info.mythic.secondValue < info.mythic.needSecond && info.mythic.second].filter(Boolean);
        if (st.cur.pearls > 200 && improveHabitat(c, want)) acted = true;
      }
    }
    // cheapest level-up
    const cands = pool.creatures.filter((c) => !c.evo && c.lvl < S.maxLevel(D.FORMS[c.form].stage));
    cands.sort((a, b) => S.levelCost(D.FORMS[a.form].stage, a.lvl) - S.levelCost(D.FORMS[b.form].stage, b.lvl));
    const c = cands[0];
    if (c && S.levelUp(st, 'tide', c.id).ok) acted = true;
    if (!acted) break;
  }
}

const rows = [];
let simDay = 0;
for (let day = 0; day < DAYS; day++) {
  for (const h of HOURS) {
    const now = T0 + day * 864e5 + h * D.HOUR;
    if (now <= st.lastTick) continue;
    S.tick(st, now);
    S.ensureDaily(st, now);
    if (S.dailyAvailable(st, now)) S.claimDaily(st, now);
    if (S.giftAvailable(st, now)) S.claimGift(st, now);
    for (const e of [...pool.eggs]) S.hatchEgg(st, 'tide', e.id, now);
    S.collectAll(st, 'tide');
    spend(now);
    // release surplus stage-1 creatures when the pool is full of finished ones (frees room for new species)
    if (S.population(pool) >= S.popCap(st, pool) && pool.creatures.some((c) => D.FORMS[c.form].stage === 3 && c.lvl >= 15)) {
      const worst = pool.creatures.filter((c) => D.FORMS[c.form].stage === 3).sort((a, b) => b.lvl - a.lvl)[0];
      if (worst) S.releaseCreature(st, 'tide', worst.id, now);
    }
  }
  if ([0, 1, 2, 3, 4, 6, 9, 13, 20, 29, 44, 59, 89].includes(day)) {
    const now = T0 + day * 864e5 + 22 * D.HOUR;
    const stages = [0, 0, 0, 0];
    for (const c of pool.creatures) stages[D.FORMS[c.form].stage]++;
    rows.push({
      day: day + 1, poolLvl: st.lvl, size: `${pool.w}x${pool.h}`, cap: S.popCap(st, pool), pop: S.population(pool),
      s1: stages[1], s2: stages[2], s3: stages[3], 'rate/h': Math.round(S.totalRate(st, now)), pearls: Math.round(st.cur.pearls),
      glass: st.cur.glass, dex: S.dexCount(st), earned: st.stats.pearls,
    });
  }
}
console.table(rows);

if (process.argv.includes('--grid')) {
  for (const c of pool.creatures) {
    const i = S.evoInfo(st, pool, c);
    console.log(c.form, `@${c.x},${c.y}`, 'lvl', c.lvl, '->', i.reason || 'ok', i.mythic ? `main ${Math.round(i.mythic.value)}/${i.mythic.need} second(${i.mythic.second}) ${Math.round(i.mythic.secondValue)}/${i.mythic.needSecond}` : '');
  }
  let g = '';
  for (let y = 0; y < pool.h; y++) {
    for (let x = 0; x < pool.w; x++) { const t = S.tileAt(pool, x, y), o = S.occupantAt(pool, x, y); g += o ? 'C' : t.p ? t.p[0] : t.w ? '~' : '.'; }
    g += '\n';
  }
  console.log(g);
}
