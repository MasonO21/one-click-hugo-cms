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
    for (let i = 0; i < 90 && e.state !== 3; i++) step(r, 1 / 30); out.thorn.hit = hurt; out.thorn.trail = r.hazards.trails.filter((t) => t.kind === 'bramble').length - tr0; // to the end of the charge
    // a Plague Rat swarm comes as a pack; a Stormcaller's bolt runs down its marked line; a Void Stalker blinks beside him
    r = start(17); const before = r.enemies.counts.rat; r.spawnPack(10, 'rat'); out.rats = r.enemies.counts.rat - before;
    r = start(22); P = r.player; hurt = 0; P.hurt = () => { hurt++; };
    e = near(r, 'caller', 0, -7); e.shootCd = 0; step(r, 0.1); out.caller = { marked: e.state === 1 && r.hazards.lines.length > 0 };
    step(r, D.ENEMIES.caller.bolt.tele + 0.1); out.caller.struck = hurt;
    r = start(27); P = r.player; P.hurt = () => {};
    e = near(r, 'stalker', 0, -9); e.shootCd = 0; step(r, 0.1); out.stalker = { marked: e.state === 1 && !!e.tele, d0: +Math.hypot(e.x - P.x, e.z - P.z).toFixed(1) };
    step(r, D.ENEMIES.stalker.blink.tele + 0.05); out.stalker.d1 = +Math.hypot(e.x - P.x, e.z - P.z).toFixed(1);
    app.exitRun();
    out.hints = ['tide', 'brambles', 'miasma', 'lightning', 'gravity'].filter((k) => p.flags.hints[k]).join(); // each realm's first-encounter tip, once
    return out;
  });
  check('realms: tide pools slow the Shepherd (Act II); brambles slow and cut him (Act III)',
    s.tide && s.tide.slow < 1 && s.tide.ground < 1 && s.bramble && s.bramble.slow < 1 && s.bramble.cut > 0, JSON.stringify({ t: s.tide, b: s.bramble }));
  check('realms: miasma clouds drift through the fens and poison (Act IV); lightning marks where he goes, then strikes (Act V)',
    s.miasma.clouds >= 2 && s.miasma.poison > 0 && s.lightning.marked === 1 && s.lightning.at < 4 && s.lightning.struck === 1 && s.lightning.left === 0, JSON.stringify({ m: s.miasma, l: s.lightning }));
  check('realms: a gravity well pulls the Shepherd toward its core (Act VI)', s.well && s.well.d1 < s.well.d0 - 0.1, JSON.stringify(s.well));
  check('realms: each hazard gives its first-encounter tip once (tide, brambles, miasma, lightning, gravity)', s.hints === 'tide,brambles,miasma,lightning,gravity', s.hints);
  check('act foes: the Siren sings a marked circle that holds the minions inside, then lets them go',
    s.siren.marked && s.siren.held >= 6 && s.siren.free === 0, JSON.stringify(s.siren));
  check('act foes: the Thornback marks a lane, charges, throws the Shepherd once and leaves brambles; Plague Rats come as a pack',
    s.thorn.lane && s.thorn.hit === 1 && s.thorn.trail > 0 && s.rats >= 9, JSON.stringify({ t: s.thorn, rats: s.rats }));
  check('act foes: the Stormcaller marks a line and its bolt strikes; the Void Stalker marks a spot beside him and blinks there',
    s.caller.marked && s.caller.struck === 1 && s.stalker.marked && s.stalker.d0 > 8 && s.stalker.d1 < 4, JSON.stringify({ c: s.caller, s: s.stalker }));
});
check('update 13 realms: no runtime errors', !errs.length, errs[0] || '');

await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
