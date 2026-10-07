// Renders captioned App Store / Play screenshots (1290×2796, iPhone 6.7") from staged in-game moments.
// Requires the dev server (`npm run dev`). usage: node scripts/store-screenshots.mjs [outDir] [url]
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serveGoogleFonts } from './lib/fonts.mjs';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = process.argv[2] || new URL('../store/screenshots/', import.meta.url).pathname;
const PAGE_URL = process.argv[3] || process.env.URL || "http://localhost:5173/";
mkdirSync(OUT, { recursive: true });

// Each shot stages a moment in page JS, steps the simulation, then adds a caption band.
const ONLY = process.env.ONLY;
const SHOTS = [
  { name: '01-legion', caption: 'EVERY KILL <em>JOINS YOUR ARMY</em>', stage: `
    start(1, 150); give({ soulBolt: 3, skullHalo: 2, gravePulse: 1 });
    legion([['husk', 28], ['ghoul', 12], ['brute', 10], ['witch', 10], ['bloater', 4]], 4); ring(48, 10); ring(30, 12.5); sim(1.6);` },
  { name: '02-gates', caption: 'PICK THE <em>RIGHT GATE</em>', stage: `
    start(1, 120); give({ soulBolt: 2 }); r.legion.addMany(45, r.player.x, r.player.z); sim(1.5);
    r.player.vx = 0; r.player.vz = -1; r.gates.spawnPair([{ type: 'mul', n: 3 }, { type: 'div', n: 2 }]); sim(1.2, 0, -0.3);` },
  { name: '03-nova', caption: 'DETONATE <em>THE LEGION</em>', stage: `
    start(1, 200); give({ soulBolt: 3, gravePulse: 2 }); r.legion.addMany(180, r.player.x, r.player.z); ring(60, 10); ring(60, 13); sim(1.2);
    r.nova = 1; r.triggerNova(); sim(0.7);` }, // 0.25 s wind-up, then 0.45 s into the chain
  { name: '04-boss', caption: 'SLAY <em>THE HOLLOW KING</em>', stage: `
    start(1, 340); give({ soulBolt: 3, scythe: 2, skullHalo: 2 }); legion([['husk', 40], ['brute', 6], ['witch', 6]], 2); r.time = 359.9; sim(3.4, 0, 0);
    // pose the King mid Grave Slam telegraph (three ring bands and safe lanes), facing the camera
    const b = r.bossEnemy; b.x = r.player.x; b.z = r.player.z - 4.8; b.rot = 0;
    r.boss.force('slam'); sim(0.55, 0, 0); const bu = r.boss.update; r.boss.update = () => {};
    const rb = r.boss.render.bind(r.boss); r.boss.render = (dt) => { rb(dt); r.boss.mat.uniforms.uFlash.value = 0; };
    r.camPos.copy(r.desiredCam()); sim(0.25, 0, 0);` },
  { name: '05-heroes', caption: 'COLLECT <em>LEGENDARY SHEPHERDS</em>', menu: 'heroes', stage: `
    const p = app.profile; for (const id of ['nyx', 'seraphine', 'liora', 'mordrake']) { p.heroes[id].owned = true; p.heroes[id].stars = 1 + (id === 'mordrake' ? 2 : 1); }
    p.heroes.vael.stars = 3; p.gold = 48200; p.gems = 2350; E.manual = false; app.meta.show('heroes'); app.meta.refresh();` },
  { name: '06-chapters', caption: 'FIVE CURSED <em>CHAPTERS</em>', stage: `
    app.profile.chapter.unlocked = 5; start(2, 200); give({ soulBolt: 3, chains: 3, gravePulse: 1 });
    legion([['husk', 24], ['brute', 8], ['witch', 8]], 2); ring(36, 10);
    const P = r.player; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; r.enemies.spawn('witch', P.x + Math.cos(a) * 8, P.z + Math.sin(a) * 8, { hpMul: 6 }); }
    sim(3.2);` },
];

SHOTS.push(
  { name: '07-rites', caption: 'UNLEASH <em>YOUR HERO\'S RITE</em>', stage: `
    hero('seraphine'); start(3, 170); give({ chains: 3, soulBolt: 2 }); legion([['husk', 26], ['ghoul', 8], ['brute', 6], ['witch', 6]], 2);
    ring(40, 7.5); ring(36, 10.5); sim(1.0); r.ui.wantsRite = true; sim(0.5);` },
  { name: '08-torment', caption: 'DARE <em>NIGHTMARE & TORMENT</em>', stage: `
    const p = app.profile; p.chapter.unlocked = 5; p.chapter.best[5] = { ...(p.chapter.best[5] || {}), cleared: true, time: 400 };
    p.diff.best[5] = { nightmare: { time: 400, legion: 120, kills: 2400, streak: 300, cleared: true } };
    hero('vael'); start(5, 240, { difficulty: 'torment' }); give({ soulBolt: 3, scythe: 2, skullHalo: 2 }); legion([['husk', 22], ['brute', 6], ['witch', 6]], 2);
    const P = r.player; r.affixes.roll(r.spawnEnemy('brute', { elite: true, at: { x: P.x + 2.5, z: P.z - 9.5 } }));
    ring(44, 10.5); ring(30, 13.5); sim(1.2);` },
);

const helpers = `
  const app = window.__soulswarm, E = app.engine;
  E.manual = true;
  E.q = { ...E.q, pr: 3, bloomScale: 1, particles: 1, lights: 24 }; E.resize();
  let r = null;
  app.profile.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 };
  const start = (ch, t, opts) => { app.profile.energy = 30; app.profile.chapter.unlocked = Math.max(ch, app.profile.chapter.unlocked); app.startRun(ch, opts); r = app.run;
    r.player.hurt = () => {}; r.addXp = () => {}; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.warned = t >= 352; r.time = t; r.events.director = () => {}; };
  const hero = (id) => { app.profile.heroes[id].owned = true; app.profile.selectedHero = id; };
  const give = (lv) => { Object.assign(r.skillLv, lv); r.recomputeStats(); r.stats.cap = 400; };
  // a mixed legion: every kind of minion, plus a few gold Champions (raised Brute elites)
  const legion = (kinds, champions = 0) => { const P = r.player, j = () => (Math.random() - 0.5) * 6;
    for (const [kind, n] of kinds) for (let i = 0; i < n; i++) r.legion.raise(P.x + j(), P.z + j(), { kind, fx: false });
    for (let i = 0; i < champions; i++) r.legion.raise(P.x + j(), P.z + j(), { kind: 'brute', elite: true, fx: false }); };
  const ring = (n, R) => { const P = r.player; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; r.enemies.spawn(i % 4 ? 'husk' : 'ghoul', P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, { hpMul: 3 }); } };
  const sim = (sec, ix = 0.3, iz = -0.4) => { for (let i = 0; i < Math.round(sec * 30); i++) { r.input.tx = ix; r.input.tz = iz; E.step(1 / 30); } };
`;

const caption = (html) => `(() => {
  const s = document.createElement('style');
  s.textContent = '.hint,.banner,.run-intro,.lvl-back,.toast{display:none!important}.hud.intro-on .legion{opacity:1!important}.hud-top{visibility:hidden}.ss-cap{position:absolute;left:0;right:0;top:0;z-index:90;padding:calc(var(--safe-t) + 74px) 18px 26px;text-align:center;font-family:Cinzel,serif;font-weight:900;font-size:31px;line-height:1.08;letter-spacing:.03em;color:#fff;background:linear-gradient(180deg,rgba(3,5,12,.96) 55%,rgba(3,5,12,0));text-shadow:0 0 18px rgba(78,242,255,.85),0 3px 0 #00303a;pointer-events:none}.ss-cap em{font-style:normal;display:block;color:#ffcf4a;font-size:38px;text-shadow:0 0 20px rgba(255,207,74,.9),0 3px 0 #4a2a00}';
  document.head.appendChild(s);
  const d = document.createElement('div'); d.className = 'ss-cap'; d.innerHTML = ${JSON.stringify(html)};
  document.getElementById('ui').appendChild(d);
})()`;

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const shot of SHOTS.filter((x) => !ONLY || x.name.startsWith(ONLY))) {
  const t0 = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  await serveGoogleFonts(ctx);
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.evaluate(`(() => { ${helpers} ${shot.stage} })()`);
  console.log(shot.name, 'staged', Date.now() - t0, 'ms');
  if (shot.menu) await page.waitForTimeout(1500);
  else await page.evaluate(() => { for (const a of document.getAnimations()) { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* ignore */ } } });
  await page.evaluate(caption(shot.caption));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${shot.name}.jpg`, type: 'jpeg', quality: 92, timeout: 180000 });
  console.log('wrote', shot.name);
  await ctx.close();
}
await browser.close();
