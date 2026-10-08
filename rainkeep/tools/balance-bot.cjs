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
 *            sgspend (spend spare Starglass only on 10-pulls instead of crates and speedups), channels, bond, cloudrun, decor, tales, bloom, deep, crossing, pals, road, rivals, siege, intel, heirloom, formation, fishing, defense, ranks, clash, awaken, outposts, trade, decrees, talents, derby, pacts, dry
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
  await page.goto('file://' + path.resolve(__dirname, '../index.html') + '?flat&quick&collect=' + (process.argv[4] || 5) + '&no=' + (process.argv[5] || ''));
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
    const taleTry = {}; const cx = { runs: 0, wins: 0, depth: 0 }; const sg = { n: 0, waves: 0, full: 0, kings: 0, by: [] }; const iv = { sent: 0 }; let hlGot = 0; const fs = { casts: 0, caught: 0 }; const cl = { n: 0, places: [0, 0, 0], swept: 0 }; const op = { raised: 0, reinf: 0 }; const tr = { sent: 0 }; const dc = {}; const dy = { n: 0 }; const pc = { gifts: 0, pacts: 0 }; const dr = {};
    const team_log = []; let sickSecs = 0, popSecs = 0, thirstSecs = 0, dormSecs = 0, lastFightTry = -999, ttype = 0, lastWin = 0; const thaw = [];
    const W = KH.world;
    const steps = Math.round(HOURS * 3600 / 5);
    const safe = (fn) => { try { fn(); } catch (e) { errs.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]); } };
    for (let step = 0; step < steps; step++) {
      safe(() => {
        // story sheets
        if (UI.sheet && UI.sheet.kind === 'ascend' || UI.sheetQueue.some((s) => s.kind === 'ascend') || (S.lv.wyrm >= 12 && !S.wyrm.element)) A.ascend('floodheart');
        if (S.stage > D.actOneStage && !S.endingSeen) { UI.sheet = { kind: 'ending' }; A.close(); }
        if (S.stage > D.actTwoStage && !S.ending2Seen) { UI.sheet = { kind: 'ending', act: 2 }; A.close(); }
        if (S.stage > D.finalStage && !S.ending3Seen) { UI.sheet = { kind: 'ending', act: 3 }; A.close(); }
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
        // raiders sighted: boil water for the walls when the cisterns can spare it
        if (KH.raidNear && KH.raidNear() && !S.map.raid.pour && !NO.includes('raidprep')) { const c = KH.scaleReward(D.world.raids.pour); if (S.res.water > c.water * 4) A.raidpour(); }
        // the Rainwyrm's wishes: feed it and pet it when it asks (the rest come from normal play)
        if (S.bond && S.bond.wish && !NO.includes('bond')) { if (S.bond.wish.id === 'dates') A.bondfeed(); else if (S.bond.wish.id === 'pet') A.pet(); }
        // keep gardens: build with what the stores can easily spare (never Starglass)
        // gate defenses: the same rule as the gardens (only with three times the cost in hand), cheapest first
        if (KH.defense && KH.defense.unlocked() && !NO.includes('defense')) for (const d of D.defense.items.slice().sort((a, b) => KH.defense.lvl(a.id) - KH.defense.lvl(b.id))) { const c = KH.defense.costOf(d); if (KH.defense.lvl(d.id) < D.defense.max && Object.entries(c).every(([k, v]) => (k in S.res ? S.res[k] : S[k]) >= v * 3)) A.defense(d.id); }
        if (KH.decor && KH.decor.unlocked() && !NO.includes('decor')) for (const d of D.decor.items) { if (d.starglass) continue; const c = KH.decor.costOf(d.id); if (KH.decor.level(d.id) < D.decor.maxLevel && Object.entries(c).every(([k, v]) => (k in S.res ? S.res[k] : S[k]) >= v * 3)) A.decor(d.id); }
        // Hero Tales: read every chapter as it opens (once a minute per hero after a loss); squad heroes
        // take the battle ending, everyone else the steward one
        if (KH.tales && !NO.includes('tales') && KH.squadHome().length) for (const id of Object.keys(S.heroes)) {
          if (!KH.tales.ready(id) || (taleTry[id] && S.time - taleTry[id] < 60)) continue;
          const tl = KH.tales.of(id);
          if (tl.part >= 3) KH.tales.pick(`${id}:${S.squad.includes(id) ? 'a' : 'b'}`);
          else { taleTry[id] = S.time; KH.tales.fight(id); A.bclose(); }
          UI.sheet = null; UI.sheetQueue = [];
        }
        // Bloom: plant a grove whenever the stores hold three times its price
        if (KH.bloom && !NO.includes('bloom') && KH.bloom.unlocked() && KH.bloom.count() < KH.bloom.max) { const c = KH.bloom.costOf(); if (Object.entries(c).every(([k, v]) => S.res[k] >= v * 3)) A.plantnear(); }
        // Cloud Run: three decent flights a day
        if (KH.cloudRun && !NO.includes('cloudrun')) while (KH.cloudRun.unlocked() && KH.cloudRun.left() > 0) { KH.cloudRun.auto(32, 1); while (KH.cloudRun.buyCheapest && KH.cloudRun.buyCheapest()); }
        // the Deepspring: refine whenever a charge waits, deepen whenever the stores allow; dolphins and
        // whales take the daily Tideglass Kit, and whales spend spare Starglass on refines once charges run out
        if (KH.deep && !NO.includes('deep') && KH.deep.unlocked() && S.deep.open) {
          if (DOLPHIN) buy('tidekit');
          while (KH.deep.canRefine()) A.refine('5');
          if (WHALE) while (KH.deep.charges() < 1 && S.starglass > 3000 + KH.deep.sgCost() && KH.canAfford(KH.deep.refineCost()) && S.res.water - KH.deep.refineCost().water >= KH.deep.reserve()) A.refinesg();
          while (KH.deep.canDeepen()) A.deepen();
          UI.sheet = null;
        }
        // companions: collect the forage, use every skill that's ready (the hoopoe only when a timer runs),
        // tame whoever can be tamed, Advance when the bells allow and feed the cheapest next level;
        // dolphins and whales take the daily Companion Kit
        if (KH.pals && !NO.includes('pals') && KH.pals.open()) {
          if (DOLPHIN) buy('petkit');
          if (KH.pals.forage() > 0) A.forage();
          for (const p of KH.pals.list) if (KH.pals.canTame(p)) A.paltame(p.id);
          for (const p of KH.pals.list) {
            if (!S.pals.own[p.id]) continue;
            if (KH.pals.skillReady(p) && (p.id !== 'hoopoe' || S.builds.length || (S.research && S.research.end > S.time))) A.palskill(p.id);
            while (KH.pals.canAdvance(p)) A.paladv(p.id);
          }
          // save up for a companion that is ready to tame before feeding the others
          const want = KH.pals.list.find((p) => !S.pals.own[p.id] && KH.pals.reqMet(p));
          const keep = want ? (want.tame.treats || 0) : 0;
          for (let k = 0; k < 60; k++) {
            const next = (p) => KH.pals.feedCost(p, S.pals.own[p.id].lv + 1).treats;
            if ((S.items.treats || 0) - keep < 1) break;
            const c = KH.pals.list.filter((p) => KH.pals.canFeed(p)).sort((a, b) => next(a) - next(b))[0];
            if (!c || (S.items.treats || 0) - next(c) < keep) break;
            A.palfeed(`${c.id}:1`);
          }
          UI.sheet = null;
        }
        // the Spice Road: roll every die, take the first ware at the Bazaar, collect each lap prize
        if (KH.road && !NO.includes('road') && KH.road.open()) {
          if (DOLPHIN) buy('roadkit');
          for (let k = 0; k < 40 && (S.items.dice || 0) > 0; k++) {
            if (S.road.wares) A.roadbuy('0');
            A.roadroll('all');
          }
          if (S.road.wares) A.roadbuy('0');
          // Lucky Dice go to the Bazaar or a Sweet Well when one is in reach, else the farthest roll
          while ((S.items.lucky || 0) > 0) {
            const B = KH.road.board, pos = S.road.pos;
            const f = [1, 2, 3, 4, 5, 6].find((n) => ['market', 'well'].includes(B[(pos + n) % B.length])) || 6;
            A.roadroll(`lucky:${f}`);
            if (S.road.wares) A.roadbuy('0');
          }
          D.road.laps.forEach(([n], i) => { if (S.road.laps >= n && !S.road.claimed.includes(i)) A.roadlap(i); });
          UI.sheet = null; UI.road = null;
        }
        // the Crossing: every route as it opens, played the way a careful player would
        if (KH.crossing && !NO.includes('crossing') && KH.crossing.unlocked() && !KH.crossing.run() && KH.squadHome().length === S.squad.length) {
          while (KH.crossing.maps() >= 1) { const r = KH.crossing.auto(); if (r) { cx.runs++; cx.depth += r.d; if (r.won) cx.wins++; } else break; }
          UI.sheet = null;
        }
        // Spring Fishing: every cast, played the way a fairly quick player would
        if (KH.fishing && !NO.includes('fishing') && KH.fishing.unlocked() && KH.fishing.casts() >= 1) {
          const r = KH.fishing.auto(0.85); fs.casts += r.length; fs.caught += r.filter((x) => !['spooked', 'missed', 'snapped', 'escaped'].includes(x)).length;
        }
        // heirlooms: temper the squad's
        if (KH.heirloom && !NO.includes('heirloom')) {
          const order = S.squad.slice(); // only the squad fights, so only the squad's heirlooms are worth the whetstones
          for (const id of order) { for (let k = 0; k < 10 && KH.heirloom.awake(id) && KH.heirloom.lvOf(id) < KH.heirloom.max && KH.have('whetstone') >= KH.heirloom.costOf(id); k++) A.heirloom(id); }
        }
        // the Scorpion Siege: sound the horn once a host is camped outside and the squad is home, countering every
        // wave it can (the whale buys an extra counter for the Captain or the King)
        if (KH.siege && !NO.includes('siege') && KH.siege.unlocked() && !KH.siege.run() && KH.siege.hosts() >= 1 && KH.squadHome().length === S.squad.length && !KH.raidNear()) {
          const r = KH.siege.auto({ buy: WHALE ? 500 : 0 });
          if (r) { sg.n++; sg.waves += r.d; if (r.d >= D.siege.waves) sg.full++; if (r.king) sg.kings++; sg.by.push(r.d); }
          UI.sheet = null;
        }
        // Channels: a player who keeps up with the water puzzles, three stars each
        const CHN = KH.channels;
        if (CHN && CHN.unlocked() && !NO.includes('channels')) {
          for (let n = 1; n <= CHN.open(); n++) if (!S.chan.stars[n]) CHN.autoSolve(n, 3);
          if (S.chan.daily !== KH.u.today()) CHN.autoSolve('daily', 3);
          D.channels.starChests.forEach((c, i) => A.chanchest(i));
          UI.sheet = null;
        }
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
        // Warden's Decrees: each one as soon as it is ready, except a Rush Order, which waits for 20 minutes of
        // timers under way to cut, and Open Roads, which waits for a march out gathering
        if (KH.decrees && KH.decrees.unlocked() && !NO.includes('decrees')) {
          for (const d of KH.decrees.list) {
            if (!KH.decrees.ready(d)) continue;
            if (d.cut) { const left = [...S.builds, S.research, S.training].filter(Boolean).reduce((a, j) => a + Math.min(d.max, Math.max(0, j.end - S.time)), 0); if (left < 1200) continue; }
            if (d.id === 'roads' && !S.map.marches.some((m) => m.kind === 'gather')) continue;
            A.decree(d.id); dc[d.id] = (dc[d.id] || 0) + 1;
          }
        }
        // the Dry Season: dig a cistern when four times its cost is in hand, ration the water otherwise
        if (KH.dry && KH.dry.unlocked() && !NO.includes('dry') && (KH.dry.active() || KH.dry.warning()) && !S.dry.edict) {
          const dig = D.dry.edicts.find((e) => e.id === 'dig'), c = KH.scaleReward(dig.cost);
          A.dryedict(Object.entries(c).every(([k, v]) => S.res[k] >= 4 * v) ? 'dig' : 'ration');
          if (S.dry.edict) dr[S.dry.edict] = (dr[S.dry.edict] || 0) + 1;
        }
        // Camel Derby: keep Saffron training (her lowest stat, with three times the cost in hand), and run every
        // entry in the highest open cup whose rivals she is two fifths of the way into
        if (KH.derby && KH.derby.unlocked() && !NO.includes('derby')) {
          const X = S.derby, DD = D.derby;
          if (!X.train) {
            const st = DD.stats.map((x) => x.id).filter((k) => X.camel[k] < DD.maxLv).sort((a, b) => X.camel[a] - X.camel[b])[0];
            if (st) { const c = KH.derby.trainCost(X.camel[st]); if (Object.entries(c).every(([k, v]) => S.res[k] >= 3 * v)) A.derbytrain(st); }
          }
          while (X.entries > 0) {
            const my = KH.derby.mine(), avg = (my.spd + my.sta + my.spi) / 3;
            let cup = DD.cups[0];
            for (let i = 1; i < DD.cups.length; i++) if (KH.derby.cupOpen(i) && avg >= DD.cups[i].lv[0] + 0.4 * (DD.cups[i].lv[1] - DD.cups[i].lv[0])) cup = DD.cups[i];
            const g = KH.derby.autoRace(cup.id);
            if (!g) break;
            dy.n++; dy[cup.id] = dy[cup.id] || [0, 0, 0, 0, 0, 0]; dy[cup.id][g.place - 1]++;
            if (!ms.derby1 && g.place === 1) ms.derby1 = Math.round(S.time / 60);
          }
        }
        // Wadi Clash: every banner, fought by the captains (the auto-player)
        if (KH.clash && KH.clash.unlocked() && KH.clash.banners() > 0 && !NO.includes('clash')) { const g = KH.clash.autoMatch(); if (g) { cl.n++; cl.places[g.place - 1]++; if (g.swept) cl.swept++; if (!ms.clash1 && g.place === 1) ms.clash1 = Math.round(S.time / 60); } }
        // troop ranks: drill when the barracks would otherwise stand idle (housing full), the cheapest step first
        // (Veterans, then Elites, then Champions), and only with three times the drill's cost in hand
        if (KH.ranks && KH.ranks.unlocked() && !S.training && !NO.includes('ranks')) {
          drill: for (let i = 0; i < D.ranks.list.length && KH.ranks.open(i); i++) {
            for (const c of Object.keys(D.troops).sort((a, b) => KH.ranks.pool(b, i) - KH.ranks.pool(a, i))) {
              let n = Math.min(KH.ranks.batch(), KH.ranks.pool(c, i));
              for (const [k, v] of Object.entries(KH.ranks.costOf(c, i, 1))) if (v > 0) n = Math.min(n, Math.floor(S.res[k] / (3 * v)));
              if (n < 10) continue;
              A.dtype(c); A.drank(i); KH.UI.drillN = n; A.drill();
              if (S.training) { if (!ms['rank' + i]) ms['rank' + i] = Math.round(S.time / 60); break drill; }
            }
          }
        }
        // heroes
        for (const id of Object.keys(S.heroes)) A.star(id);
        // talents: every hero takes each tier as it opens (attack, leading their class, the early skill, the counter
        // edge, leading again)
        if (KH.talents && KH.talents.unlocked() && !NO.includes('talents')) for (const id of Object.keys(S.heroes)) for (let t = 0; t < D.talents.levels.length; t++) if (KH.talents.tierOpen(id, t) && KH.talents.picks(id)[t] == null) A.talent(`${id}:${t}:${[0, 0, 1, 1, 0][t]}`);
        // awakening: any 5-star hero whose shards cover the next step
        if (KH.awaken && !NO.includes('awaken')) for (const id of Object.keys(S.heroes)) if (KH.awaken.ready(id) && KH.awaken.lvOf(id) < KH.awaken.max && S.heroes[id].shards >= KH.awaken.costOf(id)) { A.awaken(id); if (!ms.awaken1) ms.awaken1 = Math.round(S.time / 60); }
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
        if (KH.squadHome().length && (KH.statPower(team) * (1 + br) >= KH.statPower(foe) * 0.95 || S.time - lastFightTry > 60)) { lastFightTry = S.time; const st0 = S.stage; if (KH.formation && !NO.includes('formation')) A.formation(KH.formation.best(foe) || ''); A.fight(); A.bclose(); if (S.stage > st0) lastWin = S.time; }
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
            // for the camp quest, the weakest Scorpion camp in sight (hives don't count for it)
            const pool = campQuest ? tiles.filter((t) => t.kind === 'camp' && !t.salt).sort((a, b) => a.lvl - b.lvl) : tiles;
            const tgt = pool.find((t) => (campQuest ? true : t.kind === 'beast' || t.kind === 'camp') && !t.gone && !t.busy && (() => { UI.wsend = 1; const s = KH.statPower; const foeP = s({ ...KH.foeStats(D.world.beastStage(t.lvl) + (t.kind === 'camp' ? D.world.campStageBonus : 0), t.kind === 'camp' ? D.world.campScale : D.world.beastScale) }); return s(KH.teamStats(t.cls || 'guard', { troops: KH.marchTroops() })) > foeP * 1.1; })());
            if (tgt) { UI.wsend = 0.5; if (KH.formation && !NO.includes('formation')) A.formation(KH.formation.best({ cls: tgt.cls || 'guard', ...KH.foeStats(D.world.beastStage(tgt.lvl) + (tgt.kind === 'camp' ? D.world.campStageBonus : 0), tgt.kind === 'camp' ? D.world.campScale : D.world.beastScale) }, 0.5) || ''); A.wattack(tgt.k); }
          }
          // watchtower intel: scouts and errands whenever a slot is free, the squad on fights it clearly outmatches (most stars first)
          if (KH.intel && !NO.includes('intel') && KH.intel.unlocked() && !KH.raidNear()) {
            const IV = KH.intel, s = KH.statPower;
            for (const r of IV.list().slice().sort((a, b) => b.stars - a.stars)) {
              if (!free() || W.tile(r.x, r.y).busy) continue;
              const K = IV.kinds[r.kind], foe = IV.foeOf(r);
              if (K.hero) { if (!S.heroes[r.hero] || KH.heroBusy(r.hero)) continue; }
              else if (foe) { if (!KH.squadHome().length || s(KH.teamStats(foe.cls, { troops: KH.capTroops(S.troops, KH.marchCap()) })) < s(foe) * 1.15) continue; UI.wsend = 1; }
              if (foe && KH.formation && !NO.includes('formation')) A.formation(KH.formation.best(foe) || '');
              const n = S.map.marches.length; A.intelgo(r.k); if (S.map.marches.length > n) iv.sent++;
              UI.sheet = null;
            }
          }
          // pacts: befriend the strongest keeps (as many as the Rainwyrm allows pacts with), gift them when a gift is
          // due and five gifts are in hand, sign as soon as they trust you; raid only the others
          const friends = KH.pacts && KH.rivals && KH.rivals.open() && !NO.includes('pacts') ? KH.rivals.list().slice().sort((a, b) => b.mult - a.mult).slice(0, KH.pacts.slots()) : [];
          for (const r of friends) {
            if (r.pact) continue;
            if (KH.pacts.st(r) >= D.pacts.pact.need) { A.rivalpact(r.k); if (r.pact) { pc.pacts++; if (!ms.pact1) ms.pact1 = Math.round(S.time / 60); } continue; }
            if (!KH.pacts.giftWait(r) && Object.entries(KH.pacts.giftCost()).every(([k, v]) => S.res[k] >= 5 * v)) { A.rivalgift(r.k); pc.gifts++; }
          }
          // rival keeps: revenge first, then the richest one the march clearly outmatches (scouted first); never with raiders in sight
          if (KH.rivals && !NO.includes('rivals') && KH.rivals.open() && free() && KH.squadHome().length && !KH.raidNear()) {
            const RV = KH.rivals, s = KH.statPower;
            const odds = (r) => s(KH.teamStats(r.cls, { troops: KH.marchTroops(), atkBonus: RV.revenge(r) ? D.rivals.revenge.atk : 0 })) / s(RV.foeOf(r));
            const loot = (r) => Object.values(RV.stashOf(r)).reduce((a, b) => a + b, 0);
            const ok = RV.list().filter((r) => !RV.shielded(r) && !W.tile(r.x, r.y).busy && odds(r) > 1.25 && !friends.includes(r));
            const tgt = ok.find((r) => RV.revenge(r)) || ok.sort((a, b) => loot(b) - loot(a))[0];
            if (tgt) { if (!RV.scouted(tgt)) A.rivalscout(tgt.k); UI.wsend = 0.75; if (KH.formation && !NO.includes('formation')) A.formation(KH.formation.best(RV.foeOf(tgt), 0.75) || ''); A.wattack(tgt.k); UI.sheet = null; }
          }
          if (free()) { const r = tiles.find((t) => t.kind === 'ruin' && !t.gone && !t.busy); if (r) { UI.wsend = 0.25; A.wexplore(r.k); } }
          // trade: the far markets first, an escort when troops can spare one, only with three times the goods in hand
          if (KH.trade && !NO.includes('trade') && KH.trade.unlocked() && KH.trade.trips().length < KH.trade.slots()) {
            KH.trade.refresh();
            const pool = Object.values(KH.capTroops(S.troops, KH.marchCap(), S.formation)).reduce((a, b) => a + b, 0);
            for (const m of D.trade.markets.slice().reverse()) {
              if (KH.trade.trips().length >= KH.trade.slots()) break;
              (S.trade.board[m.id] || []).forEach((o, n) => {
                if (o.taken || KH.trade.trips().length >= KH.trade.slots()) return;
                if (!Object.entries(KH.trade.want(m, o)).every(([k, v]) => S.res[k] >= v * 3)) return;
                UI.tradeEscort = NO.includes('escort') ? 0 : Object.entries(KH.trade.guardFee(m, 1)).every(([k, v]) => S.res[k] >= v * 5) ? 1 : 0;
                A.tradego(`${m.id}:${n}`); tr.sent++;
              });
            }
          }
          // outposts: collect when half full, raise walls with three times the cost in hand, reinforce a thin
          // garrison, and claim the best node in sight with a garrison a little above the raiders it will draw
          if (KH.outposts && !NO.includes('outposts') && KH.outposts.unlocked()) {
            const OP = KH.outposts, OD = D.outposts;
            for (const o of OP.list().slice()) {
              if (o.stored >= OP.capOf(o) * 0.5) OP.collect(o, true);
              const c = OP.upCost(o);
              if (o.lvl < OD.max && Object.entries(c).every(([k, v]) => S.res[k] >= v * 3)) A.outup(o.k);
              if (OP.odds(o)[0] === 'Too thin' && free() && !KH.raidNear()) { UI.wsend = 0.25; A.outreinforce(o.k); UI.sheet = null; op.reinf++; }
            }
            if (OP.free() > 0 && free() && !KH.raidNear()) {
              const n = tiles.filter((t) => t.kind === 'node' && !t.gone && !t.busy).sort((a, b) => b.lvl - a.lvl)[0];
              const pool = Object.values(KH.capTroops(S.troops, KH.marchCap(), S.formation)).reduce((a, b) => a + b, 0);
              if (n && pool > 0 && Object.entries(OP.costOf()).every(([k, v]) => S.res[k] >= v * 2)) {
                UI.wsend = Math.min(1, (Math.max(OD.garrison, (OD.raid.base + OD.raid.perLvl * n.lvl) * 1.3) * KH.marchCap()) / pool);
                const before = OP.list().length + S.map.marches.length;
                A.outpost(n.k); UI.sheet = null;
                if (OP.list().length + S.map.marches.length > before) { op.raised++; if (!ms.outpost1) ms.outpost1 = Math.round(S.time / 60); }
              }
            }
          }
          // a player keeps a slot free while a watchtower report waits
          const ivWait = KH.intel && !NO.includes('intel') && KH.intel.unlocked() && KH.intel.list().some((r) => !W.tile(r.x, r.y).busy);
          if (free() && !(ivWait && S.map.marches.length >= W.slots() - 1)) { const n = tiles.filter((t) => t.kind === 'node' && !t.gone && !t.busy).sort((a, b) => b.lvl - a.lvl)[0]; if (n) { UI.wsend = 0.5; A.gather(n.k); } }
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
      if (S.deep && [1, 5, 10, 15, 20, 25, 30].includes(S.deep.lv) && !ms['DS' + S.deep.lv]) ms['DS' + S.deep.lv] = Math.round(S.time / 60);
      if (S.pals && S.pals.open) { const n = Object.keys(S.pals.own).length; if (!ms['pals' + n]) ms['pals' + n] = Math.round(S.time / 60); }
      if (S.road && S.road.open) { const n = S.stats.laps; for (const m of [10, 50, 100]) if (n >= m && !ms['laps' + m]) ms['laps' + m] = Math.round(S.time / 60); }
      if (S.rivals && S.rivals.open) { for (const m of [1, 10, 50]) if (S.stats.rivalWins >= m && !ms['rival' + m]) ms['rival' + m] = Math.round(S.time / 60); }
      if (step % 360 === 0) log.push(`t=${Math.round(S.time / 60)}m H${S.lv.wyrm} st${S.stage} pw${Math.round(KH.power())} sp${S.spire.floor - 1} du${S.duels.rank} gear${Object.values(S.gear).reduce((a, b) => a + b, 0)} ss${S.sunsteel} forge${S.lv.forge} pop${S.pop} heroes${Object.keys(S.heroes).length} stars${Object.values(S.heroes).reduce((a, h) => a + h.stars, 0)} lvls[${S.squad.map((id) => S.heroes[id].lvl).join(',')}] troops${KH.troopsAll()} pop${S.pop}/${KH.housing()} wnet${Math.round(KH.rates(false).net.water*60)} res=${['stone', 'food', 'water', 'copper'].map((r) => Math.round(S.res[r])).join('/')} sg${S.starglass} bc${S.beacons} jr${S.journals} q${S.quest} pass${KH.passTier()} ktech${Object.values(S.caravan.tech).reduce((a, b) => a + b, 0)} kpts${S.caravan.points} ev${Math.round(S.ev.pts)} ach${S.ach.claimed.length} gath${S.stats.gathers} beasts${S.stats.beasts} ruins${S.stats.ruins} camps${S.stats.camps} raids${S.stats.raidsRepelled}/${S.stats.raidKills} war${S.stats.warWins} ds${S.deep ? S.deep.lv : 0}/tg${S.tideglass || 0} pals[${S.pals ? Object.entries(S.pals.own).map(([k, o]) => k.slice(0, 2) + o.lv).join(',') : ''}]tr${(S.items && S.items.treats) || 0}/bl${(S.items && S.items.bells) || 0} road${S.stats.laps || 0}L/${S.stats.rolls || 0}r riv${S.stats.rivalWins || 0}w/${S.stats.rivalLosses || 0}l/${S.stats.struck || 0}s next=${(() => { if (S.lv.wyrm >= D.wyrm.maxLevel) return 'max'; const blk = KH.upgradeBlock('wyrm'); if (blk) return blk.replace(/ /g, '_'); const c = KH.buildCost('wyrm', S.lv.wyrm + 1); const short = Object.entries(c).filter(([k, v]) => (S.res[k] ?? 0) < v).map(([k, v]) => k + Math.round(100 * (S.res[k] ?? 0) / v) + '%'); return S.builds.some((b) => b.plot === 'wyrm') ? 'building' : short.length ? 'short:' + short.join(',') : 'affordable'; })()}`);
    }
    iv.done = S.stats.intel; iv.five = S.stats.intel5;
    hlGot = KH.have('whetstone') + Object.values(S.heirlooms || {}).reduce((a, lv) => a + D.heirloom.cost.slice(0, lv).reduce((x, y) => x + y, 0), 0);
    const hl = { woken: S.stats.heirWoken, tempers: S.stats.tempers, top: S.stats.heirTop, whet: KH.have('whetstone'), lv: Object.entries(S.heirlooms || {}).map(([k, v]) => k.slice(0, 3) + v).join(','), squad: S.squad.map((id) => `${id.slice(0, 3)}${S.heroes[id].stars}*`).join(','), got: hlGot };
    fs.koi = S.stats.koi; fs.kinds = S.stats.fishKinds;
    const df = S.defense ? { ...S.defense } : {};
    cl.best = S.clash ? S.clash.best : 0; cl.lp = S.clash ? S.clash.lp : 0; cl.tier = KH.clash ? KH.clash.tier() : 0; cl.top = S.stats.clashTop; cl.season = S.clash ? S.clash.season : 0;
    Object.assign(op, { held: S.stats.outpostsHeld, defs: S.stats.outpostDefs, falls: S.stats.outpostFalls, now: (S.outposts || []).map((o) => `${o.res}${o.lvl}`).join(',') });
    const tl = { picked: S.stats.talents, full: Object.values(S.talents || {}).filter((p) => p.filter((x) => x != null).length === 5).length, squad: S.squad.map((id) => `${id.slice(0, 3)}${(S.talents[id] || []).filter((x) => x != null).length}`).join(',') };
    if (S.derby) Object.assign(dy, { camel: S.derby.camel, tack: S.derby.tack.join(','), wins: S.derby.wins });
    if (S.rivals && S.rivals.list) Object.assign(pc, { st: S.rivals.list.map((r) => `${r.mult}:${Math.round(r.st || 0)}${r.pact ? 'P' : ''}`).join(' '), feudWins: S.stats.feudWins, struck: S.stats.struck });
    if (S.dry) Object.assign(dr, { seasons: S.stats.drySeasons, A: S.stats.dryA, cisterns: S.dry.cisterns, last: S.dry.last ? S.dry.last.grade : '' });
    dc.n = S.stats.decrees; dc.most = S.stats.decreeMost;
    Object.assign(tr, { home: S.stats.tradeTrips, glass: S.stats.tradeGlass, ambush: S.stats.tradeAmbush });
    const hl2 = S.hall ? { rank: KH.hall.rank(), best: S.hall.best, days: S.stats.hallDays } : {};
    const aw = S.awaken ? { n: S.stats.awakened, top: S.stats.awakenTop, heroes: Object.entries(S.awaken).map(([k, v]) => `${k.slice(0, 3)}${v}`).join(','), squad: S.squad.map((id) => `${id.slice(0, 3)}${S.awaken[id] || 0}`).join(',') } : {};
    const rk = S.ranks ? { drilled: S.stats.drilled, champs: S.stats.champs, ranks: Object.entries(S.ranks).map(([c, r]) => `${c}:${r.join('/')}`).join(' '), mult: Object.keys(S.ranks).map((c) => KH.rankMult(c).toFixed(2)).join(',') } : {};
    return { cx, sg, iv, hl, fs, df, rk, cl, aw, hl2, op, tr, dc, tl, dy, pc, dr, SG, spent: S.spentUsd, patron: KH.patronLevel(), gear: S.gear, spire: S.spire.floor - 1, duels: S.duels, ending2: S.ending2Seen, sunsteel: S.sunsteel, qLog, idleLog, SRC: Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([r, n]) => [r, Math.round(n)]))])), incPicks: incPicks.length, keep: { rains: S.stats.rains, surplus: S.stats.surplus, incidents: S.stats.incidents, trades: S.stats.trades }, thirst: Math.round(thirstSecs / 60), dorm: Math.round(dormSecs / 60), team_log, thaw, log, ms, errs: errs.slice(0, 15), sick: (100 * sickSecs / popSecs).toFixed(2), stats: S.stats, lv: S.lv, tech: S.tech, end: S.endingSeen, element: S.wyrm.element, quest: S.quest, mailN: S.mail.length };
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
  console.log('crossing:', JSON.stringify(out.cx));
  console.log('siege:', JSON.stringify(out.sg));
  console.log('intel:', JSON.stringify(out.iv));
  console.log('heirlooms:', JSON.stringify(out.hl));
  console.log('fishing:', JSON.stringify(out.fs));
  console.log('defense:', JSON.stringify(out.df));
  console.log('ranks:', JSON.stringify(out.rk));
  console.log('clash:', JSON.stringify(out.cl));
  console.log('awaken:', JSON.stringify(out.aw));
  console.log('hall:', JSON.stringify(out.hl2));
  console.log('outposts:', JSON.stringify(out.op));
  console.log('trade:', JSON.stringify(out.tr));
  console.log('decrees:', JSON.stringify(out.dc));
  console.log('talents:', JSON.stringify(out.tl));
  console.log('derby:', JSON.stringify(out.dy));
  console.log('pacts:', JSON.stringify(out.pc));
  console.log('dry:', JSON.stringify(out.dr));
  console.log('final lv', JSON.stringify(out.lv), 'tech', JSON.stringify(out.tech), 'ending', out.end, 'element', out.element, 'quest', out.quest);
  console.log('stats', JSON.stringify(out.stats));
  console.log('TEAM', JSON.stringify(out.team_log));
  console.log('thaw placements', out.thaw.join(' '));
  console.log('BOT ERRORS:', out.errs.length ? out.errs.join('\n') : 'none');
  console.log('PAGE ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
  await browser.close();
})();
