// Progression check: a scripted "collector" who chases the Tidedex, using the real rules (src/sim.js).
// It levels creatures, reshapes the habitat around each one (hill climbing on the game's own trait maths) to reach undiscovered
// forms, attracts new families, and releases finished creatures to make room. It never pays for anything.
//
//   node tools/balance-collector.mjs [--profile=casual|regular|hardcore] [--days=120] [--seed=1] [--rich=1]
//   --rich=1 gives unlimited pearls: the fastest a perfect player could go (eggs, levels and cocoon timers still apply).
import * as D from '../../src/data.js';
import * as S from '../../src/sim.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const PROFILES = { casual: [9, 20.5], regular: [8, 12.5, 18, 21.5], hardcore: [7, 9, 11, 13, 15, 17, 19, 21.5] };
const profile = args.profile || 'regular', HOURS = PROFILES[profile], DAYS = +args.days || 120, RICH = args.rich === '1';
const { HOUR } = D, DAY = 864e5, T0 = new Date(2026, 5, 10, 0).getTime();
// what-if overrides for tuning experiments (hours / pearls), e.g. --evoTime1=4 --evoTime2=16 --evoCost1=250 --evoCost2=6000
if (args.evoTime1) D.STAGE[1].evoTime = +args.evoTime1 * HOUR;
if (args.evoTime2) D.STAGE[2].evoTime = +args.evoTime2 * HOUR;
if (args.evoCost1) D.STAGE[1].evoCost = +args.evoCost1;
if (args.evoCost2) D.STAGE[2].evoCost = +args.evoCost2;
const st = S.newState(T0 + 8 * HOUR, +args.seed || 1);
st.tut.done = true; st.flags.firstEvo = true;
const pool = () => st.pools.tide;
const FAM_ORDER = D.FAMILIES_BY_BIOME.tide;
const TIDE_FORMS = D.formsOfBiome('tide');
const NEED = D.BRANCH_NEED;

const pieces = () => D.PIECES_BY_BIOME.tide.filter((id) => S.pieceUnlocked(st, id));
const affordable = (cost) => RICH || st.cur.pearls >= cost;

/** Try single-tile edits around (cx, cy) and keep the one that raises score(); repeat. Returns number of moves made. */
function climb(cx, cy, score, maxMoves, keepStanding) {
  const p = pool();
  let made = 0;
  for (let m = 0; m < maxMoves; m++) {
    const base = score(); let best = null, bestScore = base + 1e-6;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = cx + dx, y = cy + dy, t = S.tileAt(p, x, y);
      if (!t || (dx === 0 && dy === 0 && !keepStanding) || S.occupantAt(p, x, y)) continue;
      const moves = [];
      if (!t.p && t.w < S.maxDig(st, 'tide') && affordable(D.BIOMES.tide.digCost[t.w + 1])) moves.push(['dig', (q) => { q.w++; }, (q, o) => { q.w = o.w; }]);
      if (!t.p && t.w > 0) moves.push(['fill', (q) => { q.w--; }, (q, o) => { q.w = o.w; }]);
      if (t.p) moves.push(['erase', (q) => { q.p = null; }, (q, o) => { q.p = o.p; }]);
      for (const id of pieces()) if (t.p !== id && D.PIECES[id].onW.includes(t.w) && affordable(D.PIECES[id].cost)) moves.push([`piece:${id}`, (q) => { q.p = id; }, (q, o) => { q.p = o.p; }]);
      for (const [tool, apply, undo] of moves) {
        const old = { w: t.w, p: t.p };
        apply(t); p.ver++;
        let sc = -1e9;
        if (!keepStanding || S.canStand(p, keepStanding, cx, cy)) sc = score();
        undo(t, old); p.ver++;
        if (sc > bestScore) { bestScore = sc; best = { tool, x, y }; }
      }
    }
    if (!best) break;
    const r = S.applyTool(st, 'tide', best.tool, best.x, best.y);
    if (!r.ok) break;
    made++;
  }
  return made;
}

function targetFor(c) {
  const f = D.FORMS[c.form];
  if (f.stage === 1) {
    const tr = S.traitsAt(pool(), c.x, c.y);
    const open = Object.keys(D.FAMILIES[f.fam].br).filter((t) => !st.dex[D.branchForm(f.fam, t)]).sort((a, b) => tr[b] - tr[a]);
    return open.length ? D.branchForm(f.fam, open[0]) : null;
  }
  if (f.stage === 2) { const m = D.mythicForm(f.fam, f.trait); return st.dex[m] ? null : m; }
  return null;
}
function shapeFor(c, goal) {
  const p = pool(), fam = D.FAMILIES[D.FORMS[c.form].fam], g = D.FORMS[goal], trait = g.trait;
  const score = () => {
    const tr = S.traitsAt(p, c.x, c.y);
    if (g.stage === 2) {
      const mo = Math.max(...Object.keys(fam.br).filter((t) => t !== trait).map((t) => tr[t]));
      return tr[trait] >= NEED && tr[trait] > mo ? 1000 + tr[trait] : Math.min(tr[trait], NEED) * 2 + (tr[trait] - mo);
    }
    const a = tr[trait], b = tr[fam.second];
    return a >= D.MYTHIC_NEED && b >= D.MYTHIC_SECOND ? 1000 : Math.min(a, D.MYTHIC_NEED) + Math.min(b, D.MYTHIC_SECOND) * 1.5;
  };
  return climb(c.x, c.y, score, 14, null);
}
function attract() {
  const p = pool();
  if (S.population(p) >= S.popCap(st, p)) return;
  for (const fid of FAM_ORDER) {
    const fam = D.FAMILIES[fid];
    if (st.lvl < fam.unlock) continue;
    if (!D.formsOfFamily(fid).some((f) => !st.dex[f])) continue;                                  // family complete
    if ([...p.creatures, ...p.eggs].some((k) => (k.fam || D.FORMS[k.form].fam) === fid)) continue;   // already have one growing
    let bestSpot = null, bestS = -1;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      if (!S.canStand(p, fam, x, y) || S.occupantAt(p, x, y)) continue;
      const s = S.suitability(fam, S.traitsAt(p, x, y));
      if (s > bestS) { bestS = s; bestSpot = [x, y]; }
    }
    if (!bestSpot) continue;
    climb(bestSpot[0], bestSpot[1], () => S.suitability(fam, S.traitsAt(p, bestSpot[0], bestSpot[1])), 12, fam);
    return;                                                                                       // one family per check-in
  }
}
function manage(now) {
  const p = pool();
  if (RICH) st.cur.pearls = 1e12;
  const ex = S.expandInfo(st, 'tide');
  if (ex && ex.lvlOk && ex.canPay) S.expandPool(st, 'tide');
  for (const c of [...p.creatures]) {
    if (c.evo) continue;
    const goal = targetFor(c);
    if (!goal) { if (S.population(p) >= S.popCap(st, p) - 1) S.releaseCreature(st, 'tide', c.id, now); continue; }
    const need = D.STAGE[D.FORMS[c.form].stage].evoLvl;
    while (c.lvl < need && S.levelUp(st, 'tide', c.id).ok);
    if (c.lvl < need) continue;
    shapeFor(c, goal);
    const info = S.evoInfo(st, p, c);
    if (info.canStart) S.startEvolution(st, 'tide', c.id, now);
  }
  attract();
  // spare pearls make the pool earn faster (cheapest level-ups first), keeping a reserve for the next evolution
  const reserve = RICH ? 0 : 6000;
  for (let g = 0; g < 60; g++) {
    const c = p.creatures.filter((k) => !k.evo && k.lvl < S.maxLevel(D.FORMS[k.form].stage)).sort((a, b) => S.levelCost(D.FORMS[a.form].stage, a.lvl) - S.levelCost(D.FORMS[b.form].stage, b.lvl))[0];
    if (!c || st.cur.pearls - S.levelCost(D.FORMS[c.form].stage, c.lvl) < reserve || RICH) break;
    S.levelUp(st, 'tide', c.id);
  }
}

const rows = [], milestones = {};
const marks = [0.1, 0.25, 0.5, 0.75, 0.9, 1];
const show = new Set([1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180]);
for (let day = 0; day < DAYS; day++) {
  for (const h of HOURS) {
    const now = T0 + day * DAY + h * HOUR;
    if (now <= st.lastTick) continue;
    S.tick(st, now); S.ensureDaily(st, now);
    if (S.dailyAvailable(st, now)) S.claimDaily(st, now);
    if (S.giftAvailable(st, now)) S.claimGift(st, now);
    for (const e of [...pool().eggs]) if (now >= e.ready) S.hatchEgg(st, 'tide', e.id, now);
    S.collectAll(st, 'tide');
    manage(now);
  }
  const have = TIDE_FORMS.filter((f) => st.dex[f]).length;
  for (const m of marks) if (!milestones[m] && have / TIDE_FORMS.length >= m) milestones[m] = day + 1;
  if (show.has(day + 1)) {
    const stages = [0, 0, 0, 0]; for (const c of pool().creatures) stages[D.FORMS[c.form].stage]++;
    rows.push({ day: day + 1, poolLvl: st.lvl, grid: `${pool().w}x${pool().h}`, cap: S.popCap(st, pool()), 'baby/evolved/mythic': stages.slice(1).join('/'), 'pearls/h': Math.round(S.totalRate(st, T0 + (day + 1) * DAY)), 'dex (tide)': `${have}/${TIDE_FORMS.length}`, families: D.FAMILIES_BY_BIOME.tide.filter((f) => st.dex[`${f}.0`]).length });
  }
}
console.log(`\nCollector profile "${profile}" (${HOURS.length} check-ins/day)${RICH ? ', unlimited pearls' : ''}, seed ${args.seed || 1}`);
console.table(rows);
console.log('Tidedex (Tidepool forms) reached: ' + marks.map((m) => `${Math.round(m * 100)}% on day ${milestones[m] ?? `>${DAYS}`}`).join(' · '));

if (args.detail) {
  console.log('\nStill undiscovered:', TIDE_FORMS.filter((f) => !st.dex[f]).map((f) => `${f} (${D.FORMS[f].name})`).join(', ') || 'none');
  for (const c of pool().creatures) { const i = S.evoInfo(st, pool(), c); console.log(' ', c.form, `lvl ${c.lvl} @${c.x},${c.y}`, i.reason || 'ok', i.mythic ? `${i.mythic.trait} ${Math.round(i.mythic.value)}/${i.mythic.need} + ${i.mythic.second} ${Math.round(i.mythic.secondValue)}/${i.mythic.needSecond}` : i.branches.map((b) => `${b.trait} ${Math.round(b.value)}`).join(' ')); }
  let g = ''; for (let y = 0; y < pool().h; y++) { for (let x = 0; x < pool().w; x++) { const t = S.tileAt(pool(), x, y), o = S.occupantAt(pool(), x, y); g += o ? 'C' : t.p ? t.p[0] : t.w ? String(t.w) : '.'; } g += '\n'; } console.log(g);
}
