/*
 * Rainkeep balance bot: plays the whole game in a headless browser, the way a strong and
 * attentive player would, and prints milestones (Rainwyrm levels, stages, Spire floors, Duel
 * ranks), where resources came from, builder idle time and any errors.
 *
 *   npm i -D playwright && npx playwright install chromium     (once)
 *   node tools/balance-bot.cjs <mode> <hours> [collect] [no]
 *
 *   mode     f2p | founder | dolphin | whale   (founder buys the Founder's Cache; dolphin also buys the
 *            season pass, Growth Fund, Stipend, daily kits and a Growth Pack at each Rainwyrm level;
 *            whale adds Grand Growth Packs, chests and Starglass hoards). Purchases are simulated through the store.
 *   hours    game hours to simulate (36 covers the whole game)
 *   collect  seconds between surplus-bubble taps (default 5; 600 plays like a casual player)
 *   no       comma list of systems to switch off for ablations: surplus,trade,inc,rain,gear,spire,duels,
 *            sgspend (spend spare Starglass only on 10-pulls instead of crates and speedups)
 *
 * Results vary a lot between runs (gacha luck, raid timing): compare several seeds, not one.
 */
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Install Playwright first: npm i -D playwright && npx playwright install chromium'); process.exit(1); }
const MODE = process.argv[2] || 'f2p';
const HOURS = Number(process.argv[3] || 8);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?flat&collect=' + (process.argv[4] || 5) + '&no=' + (process.argv[5] || ''));
  await page.waitForTimeout(600);
  await page.click('text=Open the keep');
  const out = await page.evaluate(({ MODE, HOURS }) => {
    const KH = window.rainkeep.KH, D = window.rainkeep.data, A = KH.ACT, UI = KH.UI;
    const S = KH.S;
    // paying players buy through the (simulated) store, so Patron points and spend brackets count
    const buy = (id) => { if (KH.canBuy(id) !== true) return false; A.buy(id); A.confirmbuy(); UI.sheet = null; return true; };
    const PAYS = MODE !== 'f2p', WHALE = MODE === 'whale', DOLPHIN = MODE === 'dolphin' || WHALE;
    const CAP = WHALE ? 1000 : 120;
    if (PAYS) buy('founder');
    let lastBig = -1e9;
    const log = [], ms = {}, errs = [];
    const order = ['wyrm', 'well', 'shelter1', 'grove', 'quarry', 'shelter2', 'mine', 'forge', 'barracks', 'storehouse', 'infirmary', 'hall', 'watchtower', 'archive'];
    const NO = (new URLSearchParams(location.search).get('no') || '').split(',');
    // Starglass flow by action (negative = spent), to see where each spend level's Starglass goes
    const SG = {};
    for (const k of Object.keys(A)) { const f = A[k]; if (typeof f !== 'function') continue; A[k] = (...args) => { const sg = S.starglass, r = f(...args); if (S.starglass !== sg) SG[k] = (SG[k] || 0) + S.starglass - sg; return r; }; }
    // resource accounting: where stone, food, water and copper came from
    const SRC = {}; const addSrc = (src, d) => { SRC[src] = SRC[src] || {}; for (const [k, v] of Object.entries(d)) if (['stone', 'food', 'water', 'copper'].includes(k)) SRC[src][k] = (SRC[src][k] || 0) + v; };
    const snap = () => ({ ...S.res });
    const diff = (a) => Object.fromEntries(Object.keys(S.res).map((k) => [k, S.res[k] - a[k]]));
    const wrap = (name, src) => { const f = A[name]; A[name] = (x) => { const a = snap(); f(x); addSrc(src, diff(a)); }; };
    wrap('collectall', 'surplus'); wrap('trade', 'trade'); wrap('incpick', 'incident'); wrap('rain', 'rainBurst'); wrap('claimquest', 'quests');
    const qLog = []; { const f = A.claimquest; A.claimquest = () => { const q0 = S.quest; f(); if (S.quest > q0) qLog.push(`${q0}@${Math.round(S.time)}s`); }; }
    const COLLECT = NO.includes('surplus') ? 0 : Number(new URLSearchParams(location.search).get('collect') || 5); let lastCollect = -999; const incPicks = [];
    let idleSecs = 0; const idleLog = []; let lastSpire = -999, lastSpireTry = -999;
    const team_log = []; let sickSecs = 0, popSecs = 0, thirstSecs = 0, dormSecs = 0, lastFightTry = -999, ttype = 0, lastWin = 0; const thaw = [];
    const W = KH.world;
    const steps = Math.round(HOURS * 3600 / 5);
    const safe = (fn) => { try { fn(); } catch (e) { errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]); } };
    for (let step = 0; step < steps; step++) {
      safe(() => {
        // story sheets
        if (UI.sheet && UI.sheet.kind === 'ascend' || UI.sheetQueue.some((s) => s.kind === 'ascend') || (S.lv.wyrm >= 12 && !S.wyrm.element)) A.ascend('floodheart');
        if (S.stage > D.actOneStage && !S.endingSeen) { UI.sheet = { kind: 'ending' }; A.close(); }
        if (S.stage > D.finalStage && !S.ending2Seen) { UI.sheet = { kind: 'ending', act: 2 }; A.close(); }
        if (S.map.pendingRuin) { if (!S.map.pendingRuin.outcome) A.ruinpick(0); A.ruindone(); }
        UI.sheet = null; UI.sheetQueue = [];
        A.pet();
        // fire
        if (S.lv.wyrm >= D.wyrm.autoMistLevel) { if (!S.autoMist) A.automist(); }
        else { const soon = S.wx.find((w) => KH.isStorm(w.type) && w.start - S.time < 20 && w.end > S.time); A.mist(soon && S.res.water > 60 ? 'high' : S.res.water < 30 ? 'low' : 'steady'); }
        // keep systems: surplus, rain, incidents, merchants
        // a disabled system still does what the current chapter quest asks, so quests never stall
        const cq = D.quests[S.quest], wants = (go) => cq && cq.go === go;
        if ((COLLECT && S.time - lastCollect >= COLLECT) || wants('surplus')) { lastCollect = S.time; A.collectall(); }
        if ((!NO.includes('rain') || (cq && cq.text === 'Call the Rain')) && S.lv.wyrm >= D.rain.unlock && !KH.keep.raining() && KH.keep.rainLeft() <= 0) A.rain();
        if (S.thirsty && S.items.rainCharm > 0 && !KH.keep.raining()) A.raincharm();
        const kp = S.keep;
        if (NO.includes('inc') && !wants('sheet:incident')) { if (kp.incident && !kp.incident.outcome) kp.incident = null; kp.nextIncident = S.time + 9999; }
        if (kp.incident && !kp.incident.outcome) {
          const d = D.incidents.find((x) => x.id === kp.incident.id);
          const i = d.choices.findIndex((c) => (!c.needs || c.needs(S)) && KH.canAfford(KH.scaleReward(c.cost || {})));
          if (i >= 0) { A.incpick(i); incPicks.push(d.id + ':' + i + (Object.keys(kp.incident.outcome.reward).length ? '' : '-')); }
        }
        if (kp.incident && kp.incident.outcome) A.incdone();
        if ((!NO.includes('trade') || wants('sheet:merchant')) && KH.keep.merchantHere()) kp.merchant.offers.forEach((o, i) => { if (NO.includes('trade') && S.stats.trades > 0) return; if (o.give.starglass && S.starglass < o.give.starglass + 1500) return; let n = 0; while (o.left > 0 && KH.canAfford(o.give) && n++ < 4) A.trade(i); });
        // claims
        const q = D.quests[S.quest]; if (q && q.check(S)) A.claimquest();
        A.login(); for (let i = 0; i < 5; i++) A.dutychest(i);
        for (const a of D.achievements) A.ach(a.id);
        for (let i = 0; i < 4; i++) A.evclaim(i);
        for (const m of S.mail) if (!m.seen && /Oasis Wars/.test(m.title)) { m.seen = 1; thaw.push(m.title.replace('Oasis Wars: you placed ', '') + '@H' + S.lv.wyrm); }
        A.mailall();
        for (let i = 0; i < D.pass.tiers.length; i++) { if (!S.pass.free.includes(i) && KH.passTier() > i) A.passclaim('free:' + i); if (S.pass.premium && !S.pass.prem.includes(i) && KH.passTier() > i) A.passclaim('prem:' + i); }
        // spending: the dolphin buys the season pass, the fund, the stipend and the daily kits; the whale adds chests and hoards
        if (DOLPHIN && S.time > 1800) { buy('growth'); if (S.stipend.left <= 0) buy('stipend'); buy('stormkit'); buy('forgekit'); if (!S.pass.premium) buy('ledger'); }
        // Growth Packs after each Rainwyrm level: dolphins take the small one, whales both
        if (DOLPHIN) buy('lvpack');
        if (WHALE) buy('lvpack2');
        if (WHALE && S.spentUsd < CAP && S.time - lastBig > 7200) { lastBig = S.time; buy('warchest'); buy('sg6'); }
        for (const [l] of D.growthFund) A.growth(l);
        A.stipend();
        if (PAYS) A.patronchest();
        // spare Starglass (every mode, so spend levels compare like for like): crates for whatever the next
        // Rainwyrm level (and the buildings it needs) is short of, then speedups on long builds, keeping a reserve
        if (!NO.includes('sgspend') && S.starglass > 1500) {
          const need = {};
          const addCost = (pid, to) => { for (const [k, v] of Object.entries(KH.buildCost(pid, to))) if (k in S.res) need[k] = (need[k] || 0) + v; };
          if (S.lv.wyrm < D.wyrm.maxLevel) {
            addCost('wyrm', S.lv.wyrm + 1);
            for (const r of D.wyrmReqs(S.lv.wyrm + 1)) if (S.lv[r.plot] < r.lvl) addCost(r.plot, S.lv[r.plot] + 1);
          }
          for (const r of Object.keys(need)) {
            for (let n = 0; n < 60 && S.starglass > 1500 && S.res[r] < need[r] * 1.1; n++) { const sg = S.starglass; A.crate(r); if (S.starglass === sg) break; }
          }
          for (const b of S.builds.slice().sort((a, c) => (a.plot === 'wyrm' ? -1 : 1))) if (b.end - S.time > 300 && S.starglass > 1500 + KH.speedCost(b.end)) A.speed(b.plot);
        }
        for (const k of Object.keys(D.items)) if (D.items[k].kind === 'crate' && S.items[k] > 0) A.useitem(k + ':all');
        for (const k of ['shard_legendary', 'shard_epic']) while (S.items[k] > 0) { const r = k === 'shard_legendary' ? 'legendary' : 'epic'; const pickH = D.heroes.filter((h) => h.rarity === r && KH.heroAvailable(h)).sort((a, b) => (S.heroes[b.id] ? 1 : 0) - (S.heroes[a.id] ? 1 : 0))[0]; A.pouch(k + ':' + pickH.id); }
        for (const k of Object.keys(D.items)) if (D.items[k].kind === 'cache' && S.items[k] > 0) A.useitem(k + ':all');
        // Act II systems: gear (cheapest piece first), the Spire, Duels and Glory trades
        if (!NO.includes('gear') && S.lv.forge) {
          for (let g = 0; g < 6; g++) {
            const piece = D.forge.gear.map((x) => x.id).filter((id) => S.gear[id] < KH.forge.gearCap()).sort((a, b) => S.gear[a] - S.gear[b])[0];
            if (!piece) break;
            const c = KH.forge.gearCost(S.gear[piece]);
            if (S.sunsteel < c.sunsteel || S.res.stone < c.stone * 2) break;
            A.gearup(piece + ':1');
          }
        }
        if (!NO.includes('spire') && KH.trials.spireOpen() && KH.squadHome().length && S.time - lastSpire > 30) {
          const foe = KH.trials.spireFoe(S.spire.floor), team = KH.trials.spireTeam(foe), m = D.spire.mods[foe.mod];
          const br = m.noBreath || S.dormant ? 0 : D.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath'));
          if (KH.statPower(team) * (1 + br) >= KH.statPower(foe) * 0.95 || S.time - lastSpireTry > 300) { lastSpireTry = S.time; A.spire(); A.bclose(); }
          lastSpire = S.time;
        }
        if (!NO.includes('duels') && KH.trials.duelsOpen() && S.duels.tickets > 0 && KH.squadHome().length) {
          const br = S.dormant ? 0 : D.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath'));
          const list = KH.trials.challengers().map((f) => ({ f, k: KH.statPower(KH.teamStats(f.cls)) * (1 + br) / KH.statPower(f) }));
          const pick = list.filter((x) => x.k >= 1.0).pop() || list.sort((a, b) => b.k - a.k)[0];
          if (pick) { A.duel(pick.f.n); A.bclose(); }
        }
        if (S.glory >= 650) A.gloryshop('epic'); else if (S.glory >= 200) A.gloryshop('sunsteel');
        // builds
        const qt = q && q.go.startsWith('plot:') ? [q.go.slice(5)] : [];
        for (let b = 0; b < 2; b++) {
          if (S.builds.length >= S.builders) break;
          for (const pid of [...qt, ...order]) { const n = S.builds.length; A.build(pid); if (S.builds.length > n) break; }
        }
        // speedups on the hearth
        const hj = S.builds.find((b) => b.plot === 'wyrm');
        if (hj && hj.end - S.time > 120 && Object.keys(D.items).some((k) => D.items[k].kind === 'speed' && S.items[k] > 0)) A.usespeed('wyrm:auto');
        // research + training
        if (S.lv.archive && !S.research) for (const t of D.techs.slice().sort((a, b) => S.tech[a.id] - S.tech[b.id])) { A.research(t.id); if (S.research) break; }
        if (S.lv.barracks && !S.training) { const types = S.lv.mine ? ['guard', 'bow', 'lancer'] : ['guard', 'bow']; A.ttype(types[ttype++ % types.length]); A.tn('max'); A.train(); }
        // heroes
        for (const id of Object.keys(S.heroes)) A.star(id);
        const best = Object.keys(S.heroes).filter((id) => !(KH.heroBusy && KH.heroBusy(id))).sort((a, b) => KH.heroPower(b) - KH.heroPower(a)).slice(0, 3);
        if (!S.squad.some((id) => KH.heroBusy(id))) S.squad = best;
        for (const id of S.squad) A.lvl(id + ':max');
        const byKind = {};
        for (const id of Object.keys(S.heroes)) { const k = D.heroes.find((h) => h.id === id).steward.kind; if (!byKind[k] || S.heroes[id].stars > S.heroes[byKind[k]].stars) byKind[k] = id; }
        for (const [k, id] of Object.entries(byKind)) if (S.stewards[k] !== id) A.station(id);
        while (S.beacons >= 1) { A.pull('1'); }
        const allStarred = D.heroes.filter((h) => KH.heroAvailable(h)).every((h) => S.heroes[h.id] && S.heroes[h.id].stars >= D.heroMaxStars);
        if (S.starglass > 2500 && (NO.includes('sgspend') || !allStarred)) A.pull('10');
        // kindred
        if (S.lv.hall && !S.caravan.joined) A.kjoin('lastwell');
        if (S.caravan.joined) {
          while (S.caravan.charges > 0 && KH.canAfford({ stone: 1e9 }) === false && S.caravan.charges > 0) { const c = S.caravan.charges; A.kdonate(['banners', 'supply', 'hands', 'shade', 'scouts'].find((t) => S.caravan.tech[t] < 10) || 'supply'); if (S.caravan.charges === c) break; }
          A.khelp(); A.kgifts();
          if (S.caravan.points > 4500) A.kbuy('k_legendary'); else if (S.caravan.points > 600) A.kbuy('k_beacon');
          if (S.caravan.raid && !S.caravan.raid.ended && S.caravan.raid.attacks > 0 && KH.squadHome().length) { A.kraid(); A.bclose(); }
        }
        // expedition
        const foe = KH.enemyFor(S.stage);
        const team = KH.teamStats(foe.cls);
        const br = S.dormant ? 0 : D.wyrm.breath(S.lv.wyrm) * (1 + KH.bonus('breath'));
        if (KH.squadHome().length && (KH.statPower(team) * (1 + br) >= KH.statPower(foe) * 0.95 || S.time - lastFightTry > 60)) { lastFightTry = S.time; const st0 = S.stage; A.fight(); A.bclose(); if (S.stage > st0) lastWin = S.time; }
        // snowfield
        if (S.lv.barracks) {
          const free = () => S.map.marches.length < W.slots();
          const tiles = [];
          for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if (W.visible(x, y)) tiles.push(W.tile(x, y));
          const dist = (t) => Math.hypot(t.x - 10, t.y - 10);
          tiles.sort((a, b) => dist(a) - dist(b));
          const campQuest = D.quests[S.quest] && /camp/.test(D.quests[S.quest].text);
          const stuck = campQuest || (S.time - lastWin > 300 && KH.statPower(KH.teamStats(KH.enemyFor(S.stage).cls)) < KH.statPower(KH.enemyFor(S.stage)) * 0.9);
          if (free() && KH.squadHome().length && stuck) {
            const tgt = tiles.find((t) => (campQuest ? t.kind === 'camp' : t.kind === 'beast' || t.kind === 'camp') && !t.gone && !t.busy && (() => { UI.wsend = 1; const s = KH.statPower; const foeP = s({ ...KH.foeStats(D.world.beastStage(t.lvl) + (t.kind === 'camp' ? D.world.campStageBonus : 0), t.kind === 'camp' ? D.world.campScale : D.world.beastScale) }); return s(KH.teamStats(t.cls || 'guard', { troops: KH.marchTroops() })) > foeP * 1.1; })());
            if (tgt) { UI.wsend = 0.5; A.wattack(tgt.k); }
          }
          if (free()) { const r = tiles.find((t) => t.kind === 'ruin' && !t.gone && !t.busy); if (r) { UI.wsend = 0.25; A.wexplore(r.k); } }
          if (free()) { const n = tiles.filter((t) => t.kind === 'node' && !t.gone && !t.busy).sort((a, b) => b.lvl - a.lvl)[0]; if (n) { UI.wsend = 0.5; A.gather(n.k); } }
        }
        const pp = KH.patrolPreview(); if (pp && pp.mins >= 30) A.patrol();
      });
      safe(() => { const R = KH.rates(false); addSrc('production', Object.fromEntries(Object.entries(R.prod).map(([k, v]) => [k, v * 5]))); if (KH.keep.raining()) addSrc('rainExtra', { water: R.prod.water * 5 / 1.5 * 0.5 }); });
      for (let i = 0; i < 5; i++) safe(() => KH.tick(1));
      if (S.builds.length < S.builders) idleSecs += 5;
      if (step % 360 === 359) { idleLog.push(Math.round(100 * idleSecs / 1800)); idleSecs = 0; }
      sickSecs += S.sick * 5; popSecs += S.pop * 5; if (S.thirsty) thirstSecs += 5; if (S.dormant) dormSecs += 5;
      const k1 = 'H' + S.lv.wyrm; if (!ms[k1]) ms[k1] = Math.round(S.time / 60);
      const k2 = 'stage' + Math.floor((S.stage - 1) / 10) * 10; if (!ms[k2]) ms[k2] = Math.round(S.time / 60);
      if (step % 360 === 0) { const tm = KH.teamStats(null, { heroes: S.squad.filter((id) => S.heroes[id]) }); team_log.push([Math.round(S.time / 60), S.lv.wyrm, S.stage, Math.round(tm.atk), Math.round(tm.def), Math.round(tm.hp)]); }
      const k3 = 'spire' + Math.floor((S.spire.floor - 1) / 10) * 10; if (S.spire.floor > 1 && !ms[k3]) ms[k3] = Math.round(S.time / 60);
      for (const rk of [500, 300, 100, 25, 1]) if (S.duels.best <= rk && !ms['duel' + rk]) ms['duel' + rk] = Math.round(S.time / 60);
      if (step % 360 === 0) log.push(`t=${Math.round(S.time / 60)}m H${S.lv.wyrm} st${S.stage} sp${S.spire.floor - 1} du${S.duels.rank} gear${Object.values(S.gear).reduce((a, b) => a + b, 0)} ss${S.sunsteel} forge${S.lv.forge} pop${S.pop} heroes${Object.keys(S.heroes).length} stars${Object.values(S.heroes).reduce((a, h) => a + h.stars, 0)} lvls[${S.squad.map((id) => S.heroes[id].lvl).join(',')}] troops${KH.troopsAll()} pop${S.pop}/${KH.housing()} wnet${Math.round(KH.rates(false).net.water*60)} res=${['stone', 'food', 'water', 'copper'].map((r) => Math.round(S.res[r])).join('/')} sg${S.starglass} bc${S.beacons} jr${S.journals} q${S.quest} pass${KH.passTier()} ktech${Object.values(S.caravan.tech).reduce((a, b) => a + b, 0)} kpts${S.caravan.points} ev${Math.round(S.ev.pts)} ach${S.ach.claimed.length} gath${S.stats.gathers} beasts${S.stats.beasts} ruins${S.stats.ruins} camps${S.stats.camps} raids${S.stats.raidsRepelled}/${S.stats.raidKills} war${S.stats.warWins} next=${(() => { if (S.lv.wyrm >= D.wyrm.maxLevel) return 'max'; const blk = KH.upgradeBlock('wyrm'); if (blk) return blk.replace(/ /g, '_'); const c = KH.buildCost('wyrm', S.lv.wyrm + 1); const short = Object.entries(c).filter(([k, v]) => (S.res[k] ?? 0) < v).map(([k, v]) => k + Math.round(100 * (S.res[k] ?? 0) / v) + '%'); return S.builds.some((b) => b.plot === 'wyrm') ? 'building' : short.length ? 'short:' + short.join(',') : 'affordable'; })()}`);
    }
    return { SG, spent: S.spentUsd, patron: KH.patronLevel(), gear: S.gear, spire: S.spire.floor - 1, duels: S.duels, ending2: S.ending2Seen, sunsteel: S.sunsteel, qLog, idleLog, SRC: Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([r, n]) => [r, Math.round(n)]))])), incPicks: incPicks.length, keep: { rains: S.stats.rains, surplus: S.stats.surplus, incidents: S.stats.incidents, trades: S.stats.trades }, thirst: Math.round(thirstSecs / 60), dorm: Math.round(dormSecs / 60), team_log, thaw, log, ms, errs: errs.slice(0, 15), sick: (100 * sickSecs / popSecs).toFixed(2), stats: S.stats, lv: S.lv, tech: S.tech, end: S.endingSeen, element: S.wyrm.element, quest: S.quest, mailN: S.mail.length };
  }, { MODE, HOURS });
  console.log('SRC', JSON.stringify(out.SRC));
  console.log('builder idle % per 30 min', out.idleLog.join(' '));
  console.log('SPEND', JSON.stringify({ usd: Math.round(out.spent), patron: out.patron }));
  console.log('STARGLASS by action', JSON.stringify(Object.fromEntries(Object.entries(out.SG).sort((x, y) => x[1] - y[1]))));
  console.log('ACT2', JSON.stringify({ gear: out.gear, spire: out.spire, duelRank: out.duels.rank, duelBest: out.duels.best, ending2: out.ending2, sunsteel: out.sunsteel }));
  console.log('quests claimed (index@seconds):', out.qLog.join(' '));
  console.log('MODE', MODE, 'sick%', out.sick, 'thirsty min', out.thirst, 'dormant min', out.dorm, 'keep', JSON.stringify(out.keep));
  console.log(out.log.join('\n'));
  console.log('milestones (minutes):', JSON.stringify(out.ms));
  console.log('final lv', JSON.stringify(out.lv), 'tech', JSON.stringify(out.tech), 'ending', out.end, 'element', out.element, 'quest', out.quest);
  console.log('stats', JSON.stringify(out.stats));
  console.log('TEAM', JSON.stringify(out.team_log));
  console.log('thaw placements', out.thaw.join(' '));
  console.log('BOT ERRORS:', out.errs.length ? out.errs.join('\n') : 'none');
  console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
  await browser.close();
})();
