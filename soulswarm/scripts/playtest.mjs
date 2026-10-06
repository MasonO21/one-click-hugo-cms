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
    if (!r.levelPending && r.levelQueue > 0) r.showLevelUp();
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
  try { await fn(page, errors); } catch (e) { errors.push('harness: ' + e.message); }
  await ctx.close();
  return errors;
}

// 1. Boot + menu
let errs = await session(async (page) => {
  const ok = await page.evaluate(() => !!document.querySelector('.btn-battle') && !!window.__soulswarm.engine);
  check('boots to the home screen', ok);
});
check('no errors on boot', !errs.length, errs[0] || '');

// 2. Every hero survives a minute and grows a legion
for (const hero of ['vael', 'nyx', 'seraphine', 'mordrake']) {
  errs = await session(async (page) => {
    const s = await page.evaluate((h) => {
      const p = window.__soulswarm.profile; p.heroes[h].owned = true; p.heroes[h].stars = 1; p.selectedHero = h;
      window.__soulswarm.startRun(1); return window.__bot(60, false);
    }, hero);
    check(`${hero}: 60s run`, s.kills > 40 && s.peak > 5, JSON.stringify(s));
    const dup = await page.evaluate(() => { const a = window.__soulswarm.run.enemies.active; return a.length - new Set(a).size; });
    check(`${hero}: no duplicated pooled enemies`, dup === 0, `duplicates=${dup}`);
  });
  check(`${hero}: no runtime errors`, !errs.length, errs[0] || '');
}

// 3. Chapter 1 full clear: gates, nova, boss, victory, results, back to menu
errs = await session(async (page) => {
  await page.evaluate(() => window.__soulswarm.startRun(1));
  let s;
  for (let i = 0; i < 50; i++) { s = await page.evaluate(() => window.__bot(10, true)); if (s.bossDead || s.t > 560) break; }
  check('chapter 1: gates passed', s.gates >= 3, `gates=${s.gates}`);
  check('chapter 1: soul nova used', s.novas >= 2, `novas=${s.novas}`);
  check('chapter 1: Gravemaw defeated', s.bossDead, `t=${s.t}`);
  await page.waitForTimeout(4500);
  const head = await page.evaluate(() => document.querySelector('.res-head b')?.textContent);
  check('chapter 1: victory screen', head === 'VICTORY', head);
  await page.evaluate(() => document.querySelector('.modal .btn-primary')?.click());
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ menu: !window.__soulswarm.meta.el.hidden, run: !!window.__soulswarm.run, unlocked: window.__soulswarm.profile.chapter.unlocked }));
  check('returns to menu and unlocks chapter 2', back.menu && !back.run && back.unlocked === 2, JSON.stringify(back));
});
check('chapter 1 clear: no runtime errors', !errs.length, errs[0] || '');

// 4. Endless Abyss: boss returns, run continues
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm; app.profile.chapter.unlocked = 6; app.startRun(6);
    const r = app.run; while (r.time < 304 && !r.ended) window.__bot(5, true);
    const b = r.bossEnemy; if (b) { b.hp = 1; r.enemies.damage(b, 50); }
    const gatesBefore = r.counters.gates, t = r.time;
    window.__bot(2, true);
    return { up: !!b, kills: r.bossKills, next: Math.round(r.nextBossAt), ended: r.ended, gateIn: Math.round(r.nextGate - t), swarmIn: Math.round(r.nextSwarm - t), pairsSpawned: r.gates.pair ? 1 : 0 };
  });
  check('endless: boss returns and run continues', s.up && s.kills === 1 && !s.ended && s.next > 600, JSON.stringify(s));
  check('endless: no gate/swarm catch-up burst after the kill', s.gateIn >= 10 && s.swarmIn >= 25 && !s.pairsSpawned, JSON.stringify(s));
});
check('endless: no runtime errors', !errs.length, errs[0] || '');

// 5. Economy: gacha pity, purchases, pass, quests
errs = await session(async (page) => {
  const s = await page.evaluate(async () => {
    const eco = await import('/src/meta/economy.js');
    const p = window.__soulswarm.profile; p.gems = 100000;
    const pull = eco.summon(p, 10, 'gems');
    const epicPlus = pull.results.some((x) => x.rarity === 'epic' || x.rarity === 'legendary');
    for (let i = 0; i < 6; i++) eco.summon(p, 10, 'gems');
    const starter = eco.applyPurchase(p, 'starter_pack');
    const first = eco.firstPurchaseBonus(p, 'gems_80');
    eco.addPassXp(p, 1600);
    const pass = eco.passState(p).tier;
    return { ok: pull.ok, n: pull.results.length, epicPlus, pulls: p.altar.pulls, pity: p.altar.pity, nyx: p.heroes.nyx.owned, starterGone: !eco.starterAvailable(p), first, pass, items: starter.length };
  });
  check('gacha: 10-pull guarantees Epic+', s.ok && s.n === 10 && s.epicPlus, JSON.stringify(s));
  check('gacha: pity never exceeds 60', s.pulls === 70 && s.pity < 60, `pity=${s.pity}`);
  check('starter pack grants Nyx once', s.nyx && s.starterGone);
  check('soul pass tiers from XP', s.pass === 3, `tier=${s.pass}`);
});
check('economy: no runtime errors', !errs.length, errs[0] || '');

// ---------------------------------------------------------------- 6. Horde behaviours and chapter identities
// Frame-stepped staged checks: the enemy signature moves (Ghoul lunge, Brute slam, Witch lob), the chapter
// modifiers (Ch2 burning ground, Ch3 ice, Ch4 vignette, Ch5 elites, Endless rotation) and the Bulwark taunt
// contract (run.legion.taunters / hitMinion), using a fake taunter so it runs before the Legion branch lands.
errs = await session(async (page) => {
  const s = await page.evaluate(() => {
    const app = window.__soulswarm, prof = app.profile, post = app.engine.post;
    app.engine.manual = true;
    prof.flags.tutorialDone = true; prof.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
    // a quiet arena: no director spawns, gates, swarms, elites, weapons or level-ups; the Shepherd stands still
    const start = (ch) => {
      if (app.run) app.exitRun();
      prof.energy = 30; prof.chapter.unlocked = 6; app.startRun(ch);
      const r = app.run;
      r.spawnAcc = -1e9; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.modBannerAt = 0;
      r.weapons.update = () => {}; r.addXp = () => {}; r.player.invuln = 0; r.input.tx = r.input.tz = 0;
      return r;
    };
    const step = (r, sec) => { for (let i = 0; i < Math.round(sec * 30); i++) r.update(1 / 30); };
    const near = (r, type, dx, dz) => { const e = r.enemies.spawn(type, r.player.x + dx, r.player.z + dz, { hpMul: 50 }); e.spawnT = 1; return e; };
    const out = {};

    // Ghoul: crouch at 3 m (0.4 s), lunge at ~11 m/s along the locked direction, recover
    let r = start(1), P = r.player;
    const g = near(r, 'ghoul', 2.6, 0);
    const states = new Set(); let crouch = 0, vmax = 0;
    for (let i = 0; i < 45; i++) { r.update(1 / 30); states.add(g.state); if (g.state === 1) crouch += 1 / 30; if (g.state === 2) vmax = Math.max(vmax, Math.hypot(g.vx, g.vz)); }
    out.lunge = { states: [...states].sort().join(''), crouch: +crouch.toFixed(2), vmax: +vmax.toFixed(1) };

    // Brute: cone telegraph for the full 1.0 s wind-up, then 1.4× damage with knockback
    r = start(1); P = r.player;
    const b = near(r, 'brute', 0, -1.9);
    let hp0 = P.hp, windAt = -1, hitAt = -1, cone = false, knock = 0;
    for (let i = 0; i < 60 && hitAt < 0; i++) {
      r.update(1 / 30);
      if (b.state === 1 && windAt < 0) windAt = r.time;
      if (r.hazards.teles.some((t) => t.owner === b)) cone = true;
      if (P.hp < hp0) { hitAt = r.time; knock = Math.hypot(P.kx, P.kz); }
    }
    out.slam = { cone, delay: +(hitAt - windAt).toFixed(3), dmg: +(hp0 - P.hp).toFixed(1), want: +(b.dmg * 1.4).toFixed(1), knock: +knock.toFixed(1) };

    // Witch: the lob lands where its telegraph circle sits, after a 1.0 s flight, for its damage (no fire in Ch1)
    r = start(1); P = r.player;
    const w = near(r, 'witch', 0, -7); w.shootCd = 0;
    r.update(1 / 30);
    const L = r.projectiles.lobs[0], tele = L && r.hazards.teles.find((t) => t.kind === 0);
    const at = L ? { x: L.tx, z: L.tz } : { x: NaN, z: NaN };
    hp0 = P.hp; let frames = 0;
    while (L && r.projectiles.lobs.includes(L) && frames < 60) { r.update(1 / 30); frames++; }
    out.lob = { thrown: !!L, tele: !!tele && Math.hypot(tele.x - at.x, tele.z - at.z) < 0.01, off: L ? +Math.hypot(L.x - at.x, L.z - at.z).toFixed(3) : -1,
      flight: +(frames / 30).toFixed(2), dmg: +(hp0 - P.hp).toFixed(1), want: +w.dmg.toFixed(1), burns: r.hazards.burns.length };

    // Ch2: a landed lob leaves burning ground that hurts while the Shepherd stands in it
    r = start(2); P = r.player;
    const w2 = near(r, 'witch', 0, -7); w2.shootCd = 0;
    step(r, 1.2);
    const patch = r.hazards.burns[0];
    P.invuln = 0; hp0 = P.hp;
    step(r, 1.0);
    out.burn = { patches: r.hazards.burns.length, dps: patch ? +patch.dps.toFixed(2) : 0, lost: +(hp0 - P.hp).toFixed(2) };

    // Ch3: on an ice patch the Shepherd takes far longer to reach speed
    r = start(3); P = r.player;
    const H = r.hazards, ring5 = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]];
    const find = (want) => { for (let R = 3; R < 90; R += 0.5) for (let a = 0; a < 6.28; a += 0.15) { const x = Math.cos(a) * R, z = Math.sin(a) * R; if (ring5.every(([u, v]) => H.iceAt(x + u, z + v) === want)) return { x, z }; } return null; };
    const iceSpot = find(true), dry = find(false);
    const speedAfter = (p) => { P.x = p.x - 0.4; P.z = p.z; P.vx = P.vz = 0; r.input.tx = 1; step(r, 0.2); r.input.tx = 0; return Math.hypot(P.vx, P.vz); };
    const vIce = iceSpot ? speedAfter(iceSpot) : -1, onIce = P.onIce, vDry = dry ? speedAfter(dry) : -1;
    out.ice = { found: !!iceSpot && !!dry, onIce, vIce: +vIce.toFixed(2), vDry: +vDry.toFixed(2), ch1: (start(1), app.run.hazards.iceAt(iceSpot ? iceSpot.x : 0, iceSpot ? iceSpot.z : 0)) };

    // Ch4: a tighter fog vignette during the run, restored afterwards
    r = start(4);
    const vigIn = post.uVignette.value;
    app.exitRun();
    out.vignette = { during: vigIn, after: post.uVignette.value };

    // Ch5 schedules 8 elites; Ch1 keeps 4
    const elitesBy300 = (ch) => {
      const rr = start(ch); rr.eliteIdx = 0; let n = 0;
      const sp = rr.spawnEnemy.bind(rr); rr.spawnEnemy = (t, o = {}) => { if (o.elite) n++; return sp(t, o); };
      for (let t = 0; t <= 300; t += 0.5) { rr.time = t; rr.director(0); }
      return n;
    };
    out.elites = { ch5: elitesBy300(5), ch1: elitesBy300(1) };

    // Endless: the modifier set rotates Ch2 → Ch3 → … with each Gravemaw kill
    r = start(6);
    const d1 = r.mods.burn ? 'ch2' : '?';
    r.bossKills = 1; r.director(0);
    out.endless = { d1, d2: r.mods.ice ? 'ch3' : '?' };

    // Taunt: inert without taunters (undefined or empty) …
    r = start(1); P = r.player;
    let calls = 0; r.legion.hitMinion = () => { calls++; };
    const h1 = near(r, 'husk', 5, 0);
    r.legion.taunters = undefined; step(r, 0.5);
    r.legion.taunters = []; step(r, 0.5);
    out.inert = { calls, approach: +Math.hypot(h1.x - P.x, h1.z - P.z).toFixed(2) };
    r.enemies.clearAll(false);
    // … and with a (fake) taunter in range, enemies steer to it and hit it instead of the Shepherd
    const fake = { x: P.x + 7, z: P.z, hp: 100, vx: 0, vz: 0 };
    let hits = 0; r.legion.hitMinion = (m, dmg) => { hits++; m.hp -= dmg; };
    r.legion.taunters = [fake];
    const h2 = near(r, 'husk', 9, 1);
    hp0 = P.hp; P.invuln = 0;
    step(r, 2.5);
    out.taunt = { toTaunter: +Math.hypot(h2.x - fake.x, h2.z - fake.z).toFixed(2), toShepherd: +Math.hypot(h2.x - P.x, h2.z - P.z).toFixed(2), hits, fakeHp: +fake.hp.toFixed(1), shepherdHurt: +(hp0 - P.hp).toFixed(1) };
    app.exitRun();
    return out;
  });
  const { lunge, slam, lob, burn, ice, vignette, elites, endless, inert, taunt } = s;
  check('horde: Ghoul crouches 0.4 s, lunges ~11 m/s, recovers', lunge.states === '0123' && lunge.crouch >= 0.36 && lunge.crouch <= 0.45 && lunge.vmax >= 9.5, JSON.stringify(lunge));
  check('horde: Brute slam hits for 1.4× after its 1.0 s wind-up', slam.cone && slam.delay >= 0.99 && Math.abs(slam.dmg - slam.want) < 0.6 && slam.knock > 3, JSON.stringify(slam));
  check('horde: Witch lob lands on its telegraph after 1.0 s', lob.thrown && lob.tele && lob.off < 0.01 && lob.flight >= 0.99 && Math.abs(lob.dmg - lob.want) < 0.6 && lob.burns === 0, JSON.stringify(lob));
  check('horde: Ch2 burning ground hurts', burn.patches >= 1 && burn.lost >= burn.dps * 0.5, JSON.stringify(burn));
  check('horde: Ch3 ice slows Shepherd acceleration', ice.found && ice.onIce && ice.vIce > 0 && ice.vIce < ice.vDry * 0.75 && !ice.ch1, JSON.stringify(ice));
  check('horde: Ch4 vignette tightens, restored after', vignette.during > 1 && Math.abs(vignette.after - 0.85) < 1e-6, JSON.stringify(vignette));
  check('horde: Ch5 spawns 8 elites (Ch1 keeps 4)', elites.ch5 === 8 && elites.ch1 === 4, JSON.stringify(elites));
  check('horde: Endless rotates chapter modifiers by depth', endless.d1 === 'ch2' && endless.d2 === 'ch3', JSON.stringify(endless));
  check('horde: taunt is inert without taunters', inert.calls === 0 && inert.approach < 3.5, JSON.stringify(inert));
  check('horde: taunt pulls enemies onto a taunter', taunt.toTaunter < 1 && taunt.hits >= 1 && taunt.fakeHp < 100 && taunt.shepherdHurt === 0, JSON.stringify(taunt));
});
check('horde: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
