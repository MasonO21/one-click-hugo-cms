// Records a scripted, frame-perfect 9:16 gameplay ad (1080×1920 @30fps) to MP4.
// Requires the dev server (`npm run dev`) and ffmpeg with libx264 on PATH.
// usage: node scripts/record-trailer.mjs [out.mp4] [http://localhost:5173/]
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const OUT = process.argv[2] || 'trailer.mp4';
const URL = process.argv[3] || 'http://localhost:5173/';
const FPS = 30, SECONDS = +(process.env.DURATION || 21), DSF = +(process.env.DSF || 3);
const FRAMES = Math.round(FPS * SECONDS);
const dir = join(process.env.TMPDIR || tmpdir(), 'soulswarm-trailer-frames');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

// Page-side director: scripted beats over a real run (god mode, no level-up pauses).
const director = `
window.__trailer = (() => {
  const app = window.__soulswarm;
  app.profile.energy = 30;
  app.startRun(1);
  const r = app.run, E = app.engine;
  E.manual = true;
  E.q = { ...E.q, pr: ${DSF}, bloomScale: 1, particles: 1, lights: 24 };
  E.resize();
  r.player.hurt = () => {};
  r.addXp = () => {};
  r.nextGate = r.nextSwarm = 1e9; r.eliteIdx = 99; r.warned = true;
  r.skillLv.soulBolt = 3; r.skillLv.skullHalo = 2; r.skillLv.gravePulse = 1;
  const boost = () => { r.stats.raise = 0.85; r.stats.cap = 400; r.stats.minionDmg *= 1.6; };
  const rc = r.recomputeStats.bind(r); r.recomputeStats = () => { rc(); boost(); }; r.recomputeStats();
  r.time = 170;
  app.profile.flags.hints = { move: 1, raise: 1, gates: 1, nova: 1 };
  const style = document.createElement('style');
  style.textContent = '.hint,.banner{display:none!important}' +
    '.ad-cap{position:absolute;left:0;right:0;top:19%;z-index:20;text-align:center;font-family:Cinzel,serif;font-weight:900;color:#fff;font-size:30px;line-height:1.1;letter-spacing:.04em;padding:0 18px;text-shadow:0 0 18px rgba(78,242,255,.9),0 3px 0 #00303a;pointer-events:none;transition:opacity .25s}' +
    '.ad-cap em{font-style:normal;color:#ffcf4a;text-shadow:0 0 18px rgba(255,207,74,.9),0 3px 0 #4a2a00}' +
    '.ad-end{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(70% 50% at 50% 45%,rgba(10,40,55,.85),rgba(2,3,8,.96));opacity:0;transition:opacity .4s}' +
    '.ad-end .logo{font-size:52px}.ad-end .tag{font-family:Cinzel,serif;font-weight:700;letter-spacing:.35em;color:#9fb2cc;font-size:14px}' +
    '.ad-end .cta{margin-top:18px;padding:14px 34px;font-family:Oxanium,sans-serif;font-weight:800;font-size:22px;letter-spacing:.08em;color:#2a1300;background:linear-gradient(180deg,#ffe07a,#e88f1a);clip-path:var(--bevel-sm)}';
  document.head.appendChild(style);
  const cap = document.createElement('div'); cap.className = 'ad-cap'; document.getElementById('ui').appendChild(cap);
  const end = document.createElement('div'); end.className = 'ad-end';
  end.innerHTML = '<div class="logo">SOUL<span>SWARM</span></div><div class="tag">RAISE THE LEGION</div><div class="cta">PLAY FREE</div>';
  document.getElementById('ui').appendChild(end);
  const say = (html) => { cap.innerHTML = html; cap.style.opacity = html ? 1 : 0; };
  const ring = (n, R, type) => { const P = r.player; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; r.enemies.spawn(type || (i % 4 ? 'husk' : 'ghoul'), P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, { hpMul: 2.2, dmgMul: 1 }); } };
  const beats = [
    [0.0, () => { ring(36, 9); ring(44, 12.5); say('THEY OUTNUMBER YOU<br><em>500 TO 1</em>'); }],
    [3.2, () => say('BUT EVERY ENEMY YOU KILL...')],
    [5.6, () => { say('...<em>JOINS YOUR ARMY</em>'); ring(40, 13); }],
    [8.6, () => { say('PICK THE RIGHT GATE'); r.gates.spawnPair([{ type: 'mul', n: 3 }, { type: 'div', n: 2 }]); }],
    [12.4, () => { say('THEN DETONATE<br><em>THEM ALL</em>'); ring(50, 10); ring(56, 13.5, 'husk'); }],
    [13.8, () => { r.nova = 1; r.triggerNova(); }],
    [16.2, () => { say(''); r.boss.spawn(); }],
    [18.6, () => { end.style.opacity = 1; }],
  ];
  let bi = 0, gateTarget = null;
  return {
    frame(t) {
      while (bi < beats.length && beats[bi][0] <= t) beats[bi++][1]();
      // bot: drift in a slow arc; head for the ×3 gate while it is up
      const P = r.player; let ix = Math.cos(t * 0.5) * 0.45, iz = -0.5 + Math.sin(t * 0.7) * 0.2;
      const pair = r.gates.pair;
      if (pair && !pair.done) { const g = pair.gates.find((G) => G.op.type === 'mul'); const dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz) || 1; ix = dx / l; iz = dz / l; }
      if (t > 12.4) { ix *= 0.2; iz *= 0.2; }
      r.input.keys.clear(); r.input.tx = ix; r.input.tz = iz;
      E.step(1 / ${FPS});
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = (a.currentTime || 0) + 1000 / ${FPS}; }
      return { legion: r.legion.count, enemies: r.enemies.count };
    },
  };
})();`;

const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: DSF, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
console.log('loading', URL);
await page.goto(URL);
await page.waitForTimeout(3000);
console.log('loaded');
await page.evaluate(() => {
  window.__soulswarm.engine.manual = true;
  // Virtual timers: banners and popups expire on game-frame time, not wall-clock capture time.
  const queue = []; let now = 0;
  window.setTimeout = (fn, ms, ...args) => { queue.push({ t: now + (ms || 0), fn, args }); return queue.length; };
  window.__advanceTimers = (ms) => {
    now += ms;
    for (let i = 0; i < queue.length;) {
      if (queue[i].t <= now) { const o = queue.splice(i, 1)[0]; try { o.fn(...o.args); } catch (e) { console.error(e); } } else i++;
    }
  };
});
await page.evaluate(director);
console.log('director ready');
const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  const info = await page.evaluate(`__trailer.frame(${f / FPS})`);
  await page.evaluate(`__advanceTimers(${1000 / FPS})`);
  await page.screenshot({ path: join(dir, `f${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (f % 60 === 0) console.log(`frame ${f}/${FRAMES}`, info, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
await browser.close();
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i "${join(dir, 'f%05d.jpg')}" -vf "scale=1080:1920:flags=lanczos,format=yuv420p" -c:v libx264 -preset slow -crf 18 -movflags +faststart "${OUT}"`);
rmSync(dir, { recursive: true, force: true });
console.log('wrote', OUT);
