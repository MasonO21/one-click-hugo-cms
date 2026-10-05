// Renders captioned App Store / Play screenshots (1290×2796, iPhone 6.7") from staged in-game moments.
// Requires the dev server (`npm run dev`). usage: node scripts/store-screenshots.mjs [outDir] [url]
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = process.argv[2] || new URL('../store/screenshots/', import.meta.url).pathname;
const PAGE_URL = process.argv[3] || 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });

// Each shot stages a moment in page JS, steps the simulation, then adds a caption band.
const SHOTS = [
  { name: '01-legion', caption: 'EVERY KILL <em>JOINS YOUR ARMY</em>', stage: `
    start(1, 150); give({ soulBolt: 3, skullHalo: 2, gravePulse: 1 });
    r.legion.addMany(140, r.player.x, r.player.z); ring(40, 9); sim(3.5);` },
  { name: '02-gates', caption: 'PICK THE <em>RIGHT GATE</em>', stage: `
    start(1, 120); give({ soulBolt: 2 }); r.legion.addMany(45, r.player.x, r.player.z); sim(1.5);
    r.player.vx = 0; r.player.vz = -1; r.gates.spawnPair([{ type: 'mul', n: 3 }, { type: 'div', n: 2 }]); sim(1.2, 0, -0.3);` },
  { name: '03-nova', caption: 'DETONATE <em>THE LEGION</em>', stage: `
    start(1, 200); give({ soulBolt: 3, gravePulse: 2 }); r.legion.addMany(180, r.player.x, r.player.z); ring(60, 10); ring(60, 13); sim(1.2);
    r.nova = 1; r.triggerNova(); sim(0.45);` },
  { name: '04-boss', caption: 'SLAY <em>THE HOLLOW KING</em>', stage: `
    start(1, 340); give({ soulBolt: 3, scythe: 2, skullHalo: 2 }); r.legion.addMany(90, r.player.x, r.player.z); r.time = 359.9; sim(3.4);
    r.boss.cd = 0; sim(0.9);` },
  { name: '05-heroes', caption: 'COLLECT <em>LEGENDARY SHEPHERDS</em>', menu: 'heroes', stage: `
    const p = app.profile; for (const id of ['nyx', 'seraphine', 'mordrake']) { p.heroes[id].owned = true; p.heroes[id].stars = 1 + (id === 'mordrake' ? 2 : 1); }
    p.heroes.vael.stars = 3; p.gold = 48200; p.gems = 2350; E.manual = false; app.meta.show('heroes'); app.meta.refresh();` },
  { name: '06-chapters', caption: 'FIVE CURSED <em>CHAPTERS</em>', stage: `
    app.profile.chapter.unlocked = 5; start(4, 160); give({ soulBolt: 3, chains: 3, gravePulse: 1 }); r.legion.addMany(110, r.player.x, r.player.z); ring(50, 10); sim(3);` },
];

const helpers = `
  const app = window.__soulswarm, E = app.engine;
  E.manual = true;
  E.q = { ...E.q, pr: 3, bloomScale: 1, particles: 1, lights: 24 }; E.resize();
  let r = null;
  app.profile.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
  const start = (ch, t) => { app.profile.energy = 30; app.profile.chapter.unlocked = Math.max(ch, app.profile.chapter.unlocked); app.startRun(ch); r = app.run;
    r.player.hurt = () => {}; r.addXp = () => {}; r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.warned = t >= 352; r.time = t; };
  const give = (lv) => { Object.assign(r.skillLv, lv); r.recomputeStats(); r.stats.cap = 400; };
  const ring = (n, R) => { const P = r.player; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; r.enemies.spawn(i % 4 ? 'husk' : 'ghoul', P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, { hpMul: 3 }); } };
  const sim = (sec, ix = 0.3, iz = -0.4) => { for (let i = 0; i < Math.round(sec * 30); i++) { r.input.tx = ix; r.input.tz = iz; E.step(1 / 30); } };
`;

const caption = (html) => `(() => {
  const s = document.createElement('style');
  s.textContent = '.hint,.banner,.lvl-back,.toast{display:none!important}.ss-cap{position:absolute;left:0;right:0;top:0;z-index:90;padding:calc(var(--safe-t) + 74px) 18px 26px;text-align:center;font-family:Cinzel,serif;font-weight:900;font-size:31px;line-height:1.08;letter-spacing:.03em;color:#fff;background:linear-gradient(180deg,rgba(3,5,12,.96) 55%,rgba(3,5,12,0));text-shadow:0 0 18px rgba(78,242,255,.85),0 3px 0 #00303a;pointer-events:none}.ss-cap em{font-style:normal;display:block;color:#ffcf4a;font-size:38px;text-shadow:0 0 20px rgba(255,207,74,.9),0 3px 0 #4a2a00}';
  document.head.appendChild(s);
  const d = document.createElement('div'); d.className = 'ss-cap'; d.innerHTML = ${JSON.stringify(html)};
  document.getElementById('ui').appendChild(d);
})()`;

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const shot of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.evaluate(`(() => { ${helpers} ${shot.stage} })()`);
  if (shot.menu) await page.waitForTimeout(1500);
  else await page.evaluate(() => { for (const a of document.getAnimations()) { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* ignore */ } } });
  await page.evaluate(caption(shot.caption));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log('wrote', shot.name);
  await ctx.close();
}
await browser.close();
