// Automated smoke playtest: boots the game headless and drives a bot through every major system.
// usage: npm run playtest            (starts its own dev server on :5199)
//        node scripts/playtest.mjs http://localhost:5173/   (use a running server)
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
let URL = process.argv[2];
let server = null;
if (!URL) {
  URL = 'http://localhost:5199/';
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { cwd: new globalThis.URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
}

// In-page bot: flees the horde, circle-strafes the boss, walks into good gates, picks the first card.
const BOT = `window.__bot = (secs, god) => {
  const app = window.__soulswarm, r = app.run;
  if (god && !r.__god) { r.__god = true; r.player.hurt = () => {}; }
  for (let i = 0; i < Math.round(secs * 30); i++) {
    if (app.run !== r || r.ended) break;
    const P = r.player; let fx = 0, fz = 0;
    r.enemies.query(P.x, P.z, 7, (e) => { if (e.type === 'boss') return; const dx = P.x - e.x, dz = P.z - e.z, d2 = dx * dx + dz * dz + 0.5; fx += dx / d2; fz += dz / d2; });
    const B = r.bossEnemy;
    if (B && B.active) { const dx = B.x - P.x, dz = B.z - P.z, d = Math.hypot(dx, dz) || 1, pull = d > 7.5 ? 1.2 : d < 5 ? -1.6 : 0; fx += dx / d * pull - dz / d * 0.8; fz += dz / d * pull + dx / d * 0.8; }
    if (r.gates.pair && !r.gates.pair.done) { const g = r.gates.pair.gates.find((G) => G.op.type === 'mul' || G.op.type === 'add'); if (g) { const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz); fx += dx / l * 1.5; fz += dz / l * 1.5; } }
    fx += Math.cos(r.time * 0.35) * 0.25; fz += Math.sin(r.time * 0.35) * 0.25;
    const l = Math.hypot(fx, fz) || 1;
    r.input.keys.clear(); r.input.tx = fx / l; r.input.tz = fz / l; r.input.moved = true;
    if (r.levelPending) { const c = document.querySelector('.lvl-back .card'); if (c) c.click(); }
    if (!r.levelPending && (r.levelQueue > 0 || r.chestQueue > 0)) r.showLevelUp();
    if (r.nova >= 1 && r.legion.count > 25) r.ui.wantsNova = true;
    if (r.paused && r.player.dead) { r.revive(false); document.querySelectorAll('.modal-back').forEach((n) => n.remove()); }
    r.update(1 / 30);
  }
  r.input.tx = r.input.tz = 0;
  return { t: Math.round(r.time), kills: r.counters.kills, legion: r.legion.count, peak: r.legion.peak, level: r.level, novas: r.counters.novas, gates: r.counters.gates, bossKills: r.bossKills, bossDead: r.bossDead, ended: r.ended };
};`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function session(fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(BOT);
  // the suite runs on any day: a weekend Blood Moon (8 elites, a darker blood-red world) only where a test turns it on
  await page.evaluate(() => { const p = window.__soulswarm && window.__soulswarm.profile; if (p) p.flags.bloodMoon = 'off'; });
  try { await fn(page, errors); } catch (e) { errors.push('harness: ' + e.message); }
  await ctx.close();
  return errors;
}
let errs;
const BOSS_QA = `
window.__bossRun = (ch) => {
  const app = window.__soulswarm;
  if (app.run) app.exitRun();
  app.profile.chapter.unlocked = Math.max(6, ch === 100 ? 0 : ch, app.profile.chapter.unlocked); app.profile.energy = 30; app.profile.flags.tutorialDone = true; app.startRun(ch); // a veteran: the first run's King is gentler
  const r = app.run; r.player.hurt = () => {}; r.time = ch === 100 ? 299.9 : 359.9;
  for (let i = 0; i < 150 && !(r.bossEnemy && r.boss.state !== 'enter'); i++) r.update(1 / 30);
  return r;
};
window.__step = (r, sec, ix = 0, iz = 0) => { for (let i = 0; i < Math.round(sec * 30); i++) { r.input.tx = ix; r.input.tz = iz; r.update(1 / 30); } };
window.__hit = (r, f) => { const e = r.bossEnemy; e.hp = e.maxHp * (f + 0.01); r.enemies.damage(e, e.maxHp * 0.02, { silent: true }); };`;
// 47. Update 13: the 30-chapter campaign. Six acts of five (ACTS), each with its realm (painted floor, props, weather),
//     its ground hazard, its foe and its finale boss; earlier bosses return stronger under the act's epithet. The Endless
//     Abyss moved to ENDLESS_ID (100) and v1 saves carry its records there. Late chapters scale foes and the Shepherd's
//     weapons together (data.js SCALE), pay more on a first clear and roll richer relics. The home card steps through the
//     open chapters and the Abyss, and its label opens the campaign map.
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), save = await import('/src/meta/save.js'), eco = await import('/src/meta/economy.js');
    const W = await import('/src/game/world.js'), WE = await import('/src/game/weather.js'), ART = await import('/src/ui/art.js');
    const app = window.__soulswarm, p = app.profile, out = {};
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), q = (sel) => document.querySelector(sel);
    // the campaign's shape
    const C = D.CHAPTERS;
    out.data = { n: C.length, acts: D.ACTS.length, spans: D.ACTS.every((A, i) => A.from === i * 5 + 1 && A.to === i * 5 + 5 && C.slice(A.from - 1, A.to).every((c) => c.act === A.n)),
      finales: D.ACTS.map((A) => C[A.to - 1].bossId + ':' + C[A.to - 1].tier).join(' '),
      art: C.every((c) => /chapter-\d+/.test(ART.chapterArt(c))) && /chapter-endless/.test(ART.chapterArt(D.ENDLESS)),
      realms: C.every((c) => W.FLOORS[c.floor] && W.PROPS[c.biome] && W.PROPS[c.biome].length >= 4 && WE.WEATHER[c.biome]),
      bosses: C.every((c) => D.BOSSES[c.bossId]), returning: C.filter((c) => c.tier > 1).length,
      endless: D.ENDLESS.id === 100 && D.chapterById(100) === D.ENDLESS && D.chapterById(6) === C[5] && D.ENDLESS.lvl === 6,
      names: new Set(C.map((c) => c.name)).size };
    // save migration: a v1 profile's Endless records (chapter 6) move to 100; a v2 one's chapter 6 is Chapter 6
    const KEY = 'soulswarm.save.v1', load = (v) => { localStorage.setItem(KEY, JSON.stringify(v)); const r = save.loadProfile(); localStorage.removeItem(KEY); return r; };
    const v1 = save.newProfile(); delete v1.v; v1.chapter = { unlocked: 6, selected: 6, best: { 5: { time: 400, cleared: true, kills: 9 }, 6: { time: 1234, cleared: false, kills: 77, depth: 4 } } };
    const a = load(v1);
    const v2 = save.newProfile(); v2.chapter = { unlocked: 31, selected: 7, best: { 6: { time: 380, cleared: true, kills: 5 } } };
    const b = load(v2);
    out.save = { endless: a.chapter.best[100] && a.chapter.best[100].time, six: !!a.chapter.best[6], sel: a.chapter.selected, v: a.v,
      keep: !!(b.chapter.best[6] && b.chapter.best[6].cleared), clamp: b.chapter.unlocked, sel2: b.chapter.selected };
    // rewards: Act I's first clears are unchanged; later ones pay 100 gems (an act's last 250 + 3 Sigils); richer hoards
    out.rewards = { g: [1, 5, 6, 9, 10, 25, 30].map(D.firstClearGems), sig: [1, 5, 6, 10, 30].map(D.firstClearSigils),
      hoard: [6, 11, 21, 30].map((c) => Object.keys(D.normalHoard(c)).join('/')) };
    const res = (ch, extra = {}) => ({ chapter: ch, time: 380, kills: 3000, raised: 400, bestLegion: 150, novas: 5, gates: 8, victory: true, level: 30, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, ...extra });
    const keep = JSON.stringify(p);
    p.chapter.unlocked = 10; delete p.chapter.best[10];
    const r10 = eco.applyRunResult(p, res(10));
    out.rewards.ch10 = { first: r10.rewards.firstClearGems, sigils: r10.rewards.sigils, unlocked: p.chapter.unlocked, relic: r10.rewards.relic };
    p.chapter.unlocked = 30; delete p.chapter.best[30];
    const r30 = eco.applyRunResult(p, res(30));
    out.rewards.ch30 = { first: r30.rewards.firstClearGems, unlocked: p.chapter.unlocked };
    Object.keys(p).forEach((k) => delete p[k]); Object.assign(p, JSON.parse(keep));
    // scaling: weapons keep pace from Chapter 6 (Act I and the Abyss play as before); a returning boss is named and harder
    const tough = {};
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.chapter.unlocked = 30;
    for (const ch of [1, 5, 6, 10, 20, 30, 100]) {
      p.energy = 30; app.startRun(ch); const r = app.run;
      tough[ch] = { wm: +r.stats.weaponMul.toFixed(2), hp: +r.hpMul().toFixed(2), dmg: +r.dmgMul().toFixed(2), lvl: r.lvl };
      app.exitRun();
    }
    out.scale = tough;
    // returning bosses: the bar and the warning carry the act's epithet; tiers fight faster
    const warned = [];
    let r = window.__bossRun(12); out.tier = { id: r.boss.id, tier: r.boss.tier, bar: q('.bossbar .nm')?.textContent, rate: r.boss.tierRate, dirge: r.boss.dirgeAt, dirge0: D.BOSS_PHASES.dirge.at };
    app.exitRun();
    p.energy = 30; app.startRun(7); r = app.run; { const b0 = r.ui.banner.bind(r.ui); r.ui.banner = (t, sub, kind) => { if (kind === 'boss') warned.push(t + ' | ' + sub); return b0(t, sub, kind); }; }
    r.player.hurt = () => {}; r.time = 352.5; for (let i = 0; i < 20; i++) r.update(1 / 30);
    out.tier.warn = warned[0]; app.exitRun();
    // Act foes: only in their acts (the director never picks one elsewhere)
    const picks = (ch, min) => { p.energy = 30; app.startRun(ch); const rr = app.run; rr.time = min * 60; const n = {}; for (let i = 0; i < 4000; i++) { const t = rr.pickType(); n[t] = (n[t] || 0) + 1; } app.exitRun(); return n; };
    const P1 = picks(5, 4), P6 = picks(7, 3), P11 = picks(12, 3), P16 = picks(17, 3), P21 = picks(22, 3), P26 = picks(27, 3);
    const actFoes = ['siren', 'thornback', 'rat', 'caller', 'stalker'];
    out.foes = { act1: actFoes.filter((t) => P1[t]).length, siren: P6.siren || 0, thornback: P11.thornback || 0, rat: P16.rat || 0, caller: P21.caller || 0, stalker: P26.stalker || 0,
      stray: [[P6, 'siren'], [P11, 'thornback'], [P16, 'rat'], [P21, 'caller'], [P26, 'stalker']].map(([n, own]) => actFoes.filter((t) => t !== own && n[t]).join('+')).filter(Boolean).join(',') };
    return out;
  });
  const d = s.data;
  check('campaign: 30 chapters in six acts of five, each painted, in its realm (floor, props, weather), each with a boss; the five act finales bring a new boss',
    d.n === 30 && d.acts === 6 && d.spans && d.art && d.realms && d.bosses && d.names === 30 && d.finales === 'vesperine:1 morwenna:1 gorrath:1 mire:1 kaelthar:1 nihl:1' && d.returning >= 15, JSON.stringify(d));
  check('campaign: the Endless Abyss is ENDLESS_ID (100), plays at level 6, and chapterById keeps Chapter 6 as Chapter 6', d.endless, JSON.stringify(d));
  check('campaign save: a v1 save\'s Endless record and choice move from 6 to 100; a v2 save keeps Chapter 6, and unlocked clamps to 30',
    s.save.endless === 1234 && !s.save.six && s.save.sel === 100 && s.save.v === 2 && s.save.keep && s.save.clamp === 30 && s.save.sel2 === 7, JSON.stringify(s.save));
  const R = s.rewards;
  check('campaign rewards: Act I first clears unchanged; later 100 gems, an act finale 250 + 3 Sigils; Chapter 10 opens 11, Chapter 30 opens nothing; richer relic hoards',
    R.g.join() === '58,130,100,100,250,250,250' && R.sig.join() === '1,1,1,3,3' && R.ch10.first === 250 && R.ch10.sigils === 3 && R.ch10.unlocked === 11 && R.ch10.relic && R.ch30.first === 250 && R.ch30.unlocked === 30
    && R.hoard.join(' ') === 'common/rare/epic rare/epic rare/epic/legendary rare/epic/legendary', JSON.stringify(R));
  const T = s.scale;
  check('campaign scaling: Act I and the Abyss keep weapon ×1; from Chapter 6 weapons and foes climb together, foes a step ahead',
    T[1].wm === 1 && T[5].wm === 1 && T[100].wm === 1 && T[100].lvl === 6 && T[6].wm > 1 && T[10].wm > T[6].wm && T[30].wm > T[20].wm
    && T[6].hp / T[5].hp > T[6].wm && T[30].hp > T[20].hp && T[30].dmg > T[20].dmg && T[20].dmg > T[6].dmg, JSON.stringify(T));
  check('campaign: a returning boss carries the act\'s epithet on the bar and the warning, fights faster and sings the Dirge sooner',
    s.tier.id === 'gravemaw' && s.tier.tier === 3 && /^Thornbound Gravemaw/i.test(s.tier.bar || '') && s.tier.rate > 1 && s.tier.dirge < s.tier.dirge0 && /RETURNS \| Drowned Pyrexa: stronger than before/.test(s.tier.warn || ''), JSON.stringify(s.tier));
  check('campaign foes: each act\'s foe comes only in its own act (none in Act I)',
    s.foes.act1 === 0 && s.foes.siren > 0 && s.foes.thornback > 0 && s.foes.rat > 0 && s.foes.caller > 0 && s.foes.stalker > 0 && !s.foes.stray, JSON.stringify(s.foes));
});
check('update 13 campaign: no runtime errors', !errs.length, errs[0] || '');

// 48. Update 13: the realms' hazards and the act foes at work, in quiet arenas (no director, no weapons)
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), app = window.__soulswarm, p = app.profile, out = {};
    p.flags.tutorialDone = true; p.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }; p.flags.bloodMoon = 'off'; p.chapter.unlocked = 30;
    const start = (ch) => {
      if (app.run) app.exitRun();
      p.energy = 30; app.startRun(ch); const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0; r.time = 120;
      r.weapons.update = () => {}; r.addXp = () => {}; r.player.invuln = 0; r.input.tx = r.input.tz = 0; r.events.nextAt = 1e9;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const near = (r, type, dx, dz) => { const e = r.enemies.spawn(type, r.player.x + dx, r.player.z + dz, { hpMul: 50 }); e.spawnT = 2; return e; };
    const find = (r, kind, fn) => { const H = r.hazards; for (let cx = -8; cx <= 8; cx++) for (let cz = -8; cz <= 8; cz++) for (let k = 0; k < 9; k++) { const x = cx * 6 + (k % 3) * 2, z = cz * 6 + ((k / 3) | 0) * 2; if (fn(H, x, z)) return { x, z }; } return null; };
    // tide pools slow the Shepherd (Act II); brambles slow and cut (Act III)
    let r = start(6), H = r.hazards, P = r.player;
    let at = find(r, 'tide', (H, x, z) => H.tideAt(x, z));
    out.tide = at ? { slow: H.slowAt(at.x, at.z) } : null;
    if (at) { P.x = at.x; P.z = at.z; r.input.tx = 0.3; step(r, 0.1); out.tide.ground = P.ground; r.input.tx = 0; }
    r = start(11); H = r.hazards; P = r.player;
    at = find(r, 'brambles', (H, x, z) => H.brambleAt(x, z) && H.slowAt(x, z) < 1);
    if (at) { P.x = at.x; P.z = at.z; const hp0 = P.hp; step(r, 2); out.bramble = { slow: H.slowAt(at.x, at.z), cut: +(hp0 - P.hp).toFixed(1) }; }
    // miasma clouds drift through the fens (Act IV) and poison; lightning strikes where the Shepherd goes (Act V)
    r = start(16); H = r.hazards; P = r.player; step(r, 0.2);
    out.miasma = { clouds: H.clouds.length };
    if (H.clouds[0]) { const c = H.clouds[0]; c.t = 3; P.x = c.x; P.z = c.z; c.vx = c.vz = 0; const hp0 = P.hp; step(r, 1.5); out.miasma.poison = +(hp0 - P.hp).toFixed(1); }
    r = start(21); H = r.hazards; P = r.player; H.boltT = 0; step(r, 0.1);
    out.lightning = { marked: H.bolts.length, at: H.bolts[0] && +Math.hypot(H.bolts[0].x - P.x, H.bolts[0].z - P.z).toFixed(1) };
    if (H.bolts[0]) { H.bolts[0].x = P.x; H.bolts[0].z = P.z; } // (a mark can land up to 2.2 m off: stand under it)
    let hurt = 0; P.hurt = () => { hurt++; }; H.boltT = 99; step(r, 1.3); out.lightning.struck = hurt; out.lightning.left = H.bolts.length;
    // gravity wells pull the Shepherd toward their cores (Act VI)
    r = start(26); H = r.hazards; P = r.player;
    const G = D.HAZARDS.gravity; let pulled = null;
    for (let i = 0; i < 400 && !pulled; i++) { step(r, 1 / 30 * 6); for (let k = 0; k < H.nw; k++) { const Wl = H.wells[k]; if (Wl.pull) { pulled = { x: Wl.x, z: Wl.z }; break; } } }
    if (pulled) { P.x = pulled.x + G.radius * 0.5; P.z = pulled.z; const d0 = Math.hypot(P.x - pulled.x, P.z - pulled.z); step(r, 0.2); out.well = { d0: +d0.toFixed(2), d1: +Math.hypot(P.x - pulled.x, P.z - pulled.z).toFixed(2) }; }
    // a Siren's song holds the minions inside its circle; they drift to her and fight again after
    r = start(7); P = r.player; P.hurt = () => {};
    for (let i = 0; i < 8; i++) r.legion.raise(P.x + (Math.random() - 0.5), P.z + (Math.random() - 0.5), { fx: false });
    let e = near(r, 'siren', 0, -8); e.shootCd = 0;
    step(r, 0.1); out.siren = { marked: e.state === 1 && !!e.tele };
    step(r, D.ENEMIES.siren.song.tele - 0.2);
    for (const m of r.legion.list) { m.x = e.lx + (Math.random() - 0.5); m.z = e.lz + (Math.random() - 0.5); } // (they ran at her: back into the circle)
    step(r, 0.3);
    out.siren.held = r.legion.list.filter((m) => m.charmT > 0).length;
    step(r, D.ENEMIES.siren.song.entrance + 0.3); out.siren.free = r.legion.list.filter((m) => m.charmT > 0).length;
    // a Thornback marks a lane, charges down it, throws the Shepherd aside and leaves brambles
    r = start(12); P = r.player; hurt = 0; P.hurt = () => { hurt++; };
    e = near(r, 'thornback', 0, -6); e.moveCd = 0; const tr0 = r.hazards.trails.length;
    step(r, 0.1); out.thorn = { lane: e.state === 1 && r.hazards.lines.length > 0 };
    for (let i = 0; i < 90 && e.state !== 3; i++) step(r, 1 / 30); out.thorn.hit = hurt; // to the end of the charge out.thorn.trail = r.hazards.trails.filter((t) => t.kind === 'bramble').length - tr0;
    // a Plague Rat swarm comes as a pack; a Stormcaller's bolt runs down its marked line; a Void Stalker blinks beside him
    r = start(17); const before = r.enemies.counts.rat; r.spawnPack(10, 'rat'); out.rats = r.enemies.counts.rat - before;
    r = start(22); P = r.player; hurt = 0; P.hurt = () => { hurt++; };
    e = near(r, 'caller', 0, -7); e.shootCd = 0; step(r, 0.1); out.caller = { marked: e.state === 1 && r.hazards.lines.length > 0 };
    step(r, D.ENEMIES.caller.bolt.tele + 0.1); out.caller.struck = hurt;
    r = start(27); P = r.player; P.hurt = () => {};
    e = near(r, 'stalker', 0, -9); e.shootCd = 0; step(r, 0.1); out.stalker = { marked: e.state === 1 && !!e.tele, d0: +Math.hypot(e.x - P.x, e.z - P.z).toFixed(1) };
    step(r, D.ENEMIES.stalker.blink.tele + 0.05); out.stalker.d1 = +Math.hypot(e.x - P.x, e.z - P.z).toFixed(1);
    app.exitRun();
    return out;
  });
  check('realms: tide pools slow the Shepherd (Act II); brambles slow and cut him (Act III)',
    s.tide && s.tide.slow < 1 && s.tide.ground < 1 && s.bramble && s.bramble.slow < 1 && s.bramble.cut > 0, JSON.stringify({ t: s.tide, b: s.bramble }));
  check('realms: miasma clouds drift through the fens and poison (Act IV); lightning marks where he goes, then strikes (Act V)',
    s.miasma.clouds >= 2 && s.miasma.poison > 0 && s.lightning.marked === 1 && s.lightning.at < 4 && s.lightning.struck === 1 && s.lightning.left === 0, JSON.stringify({ m: s.miasma, l: s.lightning }));
  check('realms: a gravity well pulls the Shepherd toward its core (Act VI)', s.well && s.well.d1 < s.well.d0 - 0.1, JSON.stringify(s.well));
  check('act foes: the Siren sings a marked circle that holds the minions inside, then lets them go',
    s.siren.marked && s.siren.held >= 6 && s.siren.free === 0, JSON.stringify(s.siren));
  check('act foes: the Thornback marks a lane, charges, throws the Shepherd once and leaves brambles; Plague Rats come as a pack',
    s.thorn.lane && s.thorn.hit === 1 && s.thorn.trail > 0 && s.rats >= 9, JSON.stringify({ t: s.thorn, rats: s.rats }));
  check('act foes: the Stormcaller marks a line and its bolt strikes; the Void Stalker marks a spot beside him and blinks there',
    s.caller.marked && s.caller.struck === 1 && s.stalker.marked && s.stalker.d0 > 8 && s.stalker.d1 < 4, JSON.stringify({ c: s.caller, s: s.stalker }));
});
check('update 13 realms: no runtime errors', !errs.length, errs[0] || '');

// 49. Update 13: the act bosses' signatures (Tidal Lanes, Briar Roots, Plague Spores, the Tempest, the First Night's
//     echoes and pull), their painted models and voices, and the chapter map
errs = await session(async (page) => {
  await page.evaluate(BOSS_QA);
  const s = await page.evaluate(async () => {
    const D = await import('/src/game/data.js'), app = window.__soulswarm, p = app.profile, out = { ch: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms)), q = (sel) => document.querySelector(sel);
    await app.foeModels.loadFoeModels();
    p.chapter.unlocked = 30;
    for (const ch of [10, 15, 20, 25, 30]) {
      const r = window.__bossRun(ch), b = r.boss, P = r.player;
      r.weapons.update = () => {};
      const c = out.ch[ch] = { id: b.id, bar: q('.bossbar .nm').textContent, painted: !!b.mat.uniforms.uMap.value, tier: b.tier };
      let hurt = 0; P.hurt = () => { hurt++; };
      b.cd = 99;
      if (b.id === 'morwenna') { b.force('tidal'); c.lanes = b.lanes.length; c.state = b.state; const L = b.lanes[0]; P.x = (L.x0 + L.x1) / 2; P.z = (L.z0 + L.z1) / 2; window.__step(r, 1.6); c.fired = b.lanes.filter((l) => l.fired).length; }
      if (b.id === 'gorrath') { b.force('roots'); c.state = b.state; c.zones = b.zones.length; const z = b.zones[0]; P.x = z.x; P.z = z.z; window.__step(r, 1.8); c.rooted = (P.rootT || 0) > 0 || hurt > 0; }
      if (b.id === 'mire') { b.force('spores'); c.state = b.state; window.__step(r, 0.4); c.lobs = r.projectiles.lobs.filter((l) => l.burn === 'miasma').length; window.__step(r, 2.5); c.clouds = r.hazards.trails.filter((t) => t.kind === 'miasma').length; }
      if (b.id === 'kaelthar') { b.force('storm'); c.state = b.state; c.beams = b.beams && b.beams.n; window.__step(r, 1.4); c.lines = r.hazards.lines.length; c.thunder = !!r.hazards.thunder; }
      if (b.id === 'nihl') { const ks = []; for (let i = 0; i < 4; i++) { b.state = 'chase'; b.force('echo'); ks.push(b.state); b.cancelAttacks && b.cancelAttacks(); } c.echo = ks; b.state = 'chase'; b.wellT = 0; window.__step(r, 0.2); c.well = !!b.well; }
      c.hurt = hurt;
    }
    app.exitRun();
    // their announcer lines and painted portraits ship
    const keys = ['morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'].flatMap((b) => ['a_' + b, 'a_' + b + '_return', 'a_' + b + '_slain']);
    const types = await Promise.all(keys.map((k) => fetch('/src/assets/voice/' + k + '.mp3').then((x) => (x.ok ? x.headers.get('content-type') : 'missing'))));
    out.voice = types.every((t) => t === 'audio/mpeg') ? keys.length : types.join();
    const ART = await import('/src/ui/art.js');
    out.bestiary = ['siren', 'thornback', 'rat', 'caller', 'stalker', 'morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'].filter((id) => D.BESTIARY.order.includes(id) && ART.FOE_ART[id]).length;
    out.models = ['siren', 'thornback', 'rat', 'caller', 'stalker', 'morwenna', 'gorrath', 'mire', 'kaelthar', 'nihl'].filter((id) => app.foeModels.foeModel(id)).length;
    // the home card: Act II · Chapter 7 with its act's five dots; the arrows reach the Endless Abyss; the label opens the map
    p.flags.tutorialDone = true; p.flags.coach = ''; p.chapter.unlocked = 8; p.chapter.selected = 7; app.meta.show('battle'); app.meta.refresh(); await wait(150);
    out.home = { label: q('.chap-no')?.textContent.trim(), dots: document.querySelectorAll('.chap-dots i').length, on: [...document.querySelectorAll('.chap-dots i')].findIndex((i) => i.classList.contains('on')) };
    for (let i = 0; i < 3; i++) { q('.chap [data-act="next"]').click(); await wait(60); } // 8, 9 (the next, locked) and the Abyss
    out.home.end = p.chapter.selected; out.home.endLabel = q('.chap-no')?.textContent.trim(); out.home.nextOff = q('.chap [data-act="next"]').disabled;
    q('.chap-no').click(); await wait(200);
    const m = q('.mm-chapters');
    out.map = { open: !!m, acts: m ? m.querySelectorAll('.cm-act:not(.cm-endless)').length : 0, tiles: m ? m.querySelectorAll('.cm-ch:not(.cm-wide)').length : 0,
      locked: m ? m.querySelectorAll('.cm-ch.lk').length : 0, on: m && m.querySelector('.cm-ch.on')?.dataset.id };
    m && m.querySelector('.cm-ch[data-id="20"]').click(); await wait(80);
    out.map.lockedTap = p.chapter.selected;
    m && m.querySelector('.cm-ch[data-id="3"]').click(); await wait(150);
    out.map.picked = p.chapter.selected; out.map.closed = !q('.mm-chapters'); out.map.label = q('.chap-no')?.textContent.trim();
    return out;
  });
  const B = s.ch, D_NAME = { morwenna: 'Morwenna', gorrath: 'Gorrath', mire: 'Mother Mire', kaelthar: 'Kaelthar', nihl: 'Nihl' };
  check('act bosses: each act finale fights in its colour, painted, named on the bar',
    B[10].id === 'morwenna' && B[15].id === 'gorrath' && B[20].id === 'mire' && B[25].id === 'kaelthar' && B[30].id === 'nihl' && Object.values(B).every((c) => c.painted && c.tier === 1 && c.bar.toUpperCase().includes(D_NAME[c.id].toUpperCase())), JSON.stringify(B));
  check('act bosses: Morwenna\'s Tidal Lanes mark and fire; Gorrath\'s roots rise where marked; Mother Mire lobs spores that leave miasma',
    B[10].state === 'tidal' && B[10].lanes >= 2 && B[10].fired >= 1 && B[10].hurt >= 1 && B[15].state === 'roots' && B[15].zones > 3 && B[15].rooted && B[20].state === 'spores' && B[20].lobs > 0 && B[20].clouds > 0, JSON.stringify([B[10], B[15], B[20]]));
  check('act bosses: Kaelthar\'s Tempest sweeps beams and calls thunder; Nihl echoes the fallen bosses\' signatures and pulls',
    B[25].state === 'storm' && B[25].beams >= 2 && B[25].lines >= 2 && B[25].thunder && B[30].echo.length === 4 && new Set(B[30].echo).size === 4 && B[30].well, JSON.stringify([B[25], B[30]]));
  check('act bosses and foes: 15 announcer lines, 10 Bestiary paintings and 10 painted models ship', s.voice === 15 && s.bestiary === 10 && s.models === 10, JSON.stringify({ v: s.voice, b: s.bestiary, m: s.models }));
  check('chapter card: "Act II · Chapter 7" with its act\'s five dots; the arrows step to the next open chapter and the Endless Abyss, then stop',
    /Act II · Chapter 7/.test(s.home.label) && s.home.dots === 5 && s.home.on === 1 && s.home.end === 100 && /Endless/.test(s.home.endLabel) && s.home.nextOff, JSON.stringify(s.home));
  check('chapter map: six acts of five painted tiles (locked past the next chapter), the Abyss below; a locked tap does nothing, an open one selects and closes',
    s.map.open && s.map.acts === 6 && s.map.tiles === 30 && s.map.locked === 22 && s.map.on === '100' && s.map.lockedTap === 100 && s.map.picked === 3 && s.map.closed && /Act I · Chapter 3/.test(s.map.label), JSON.stringify(s.map));
});
check('update 13 bosses and map: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
