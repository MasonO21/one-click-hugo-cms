// Visual check of the scene renderer. Usage: node tools/scene-test.mjs out.png [hour] [biome]
import { build } from 'esbuild';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || '/tmp/tt/scene.png';
const hour = +(process.argv[3] ?? 14);
const biome = process.argv[4] || 'tide';
fs.mkdirSync('/tmp/tt', { recursive: true });
await build({ entryPoints: [path.join(root, 'tools/scene-entry.js')], bundle: true, format: 'iife', outfile: '/tmp/tt/scene-bundle.js', logLevel: 'error' });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error('CONSOLE', m.text()));
await page.setContent('<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="margin:0;background:#000"><canvas id=c></canvas>');
await page.addScriptTag({ content: fs.readFileSync('/tmp/tt/scene-bundle.js', 'utf8') });
await page.evaluate(({ hour, biome }) => {
  const { D, S, createScene } = window.Harness;
  const d = new Date(); d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
  const now = d.getTime();
  const st = S.newState(now, 5); st.tut.done = true; st.lvl = 12; st.cur.pearls = 1e7;
  if (biome === 'deep') S.applyProduct(st, D.IAP.deep, 'x', now);
  for (const k of D.DECOR_IDS) st.own[k] = true;
  const pool = st.pools[biome];
  const put = (t, x, y) => { const r = S.applyTool(st, biome, t, x, y); if (!r.ok) console.error('put fail', t, x, y, r.reason); };
  if (biome === 'tide') {
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [2, 3]]) put('dig', x, y);
    for (const [x, y] of [[2, 1], [2, 2]]) put('dig', x, y);
    put('piece:granite', 0, 1); put('piece:granite', 0, 2); put('piece:mossy', 4, 4); put('piece:kelp', 1, 3); put('piece:kelp', 3, 3);
    put('piece:ember', 4, 1); put('piece:pearlite', 0, 4); put('decor:sandcastle', 4, 3); put('decor:umbrella', 0, 5); put('decor:duck', 1, 1);
    put('decor:lantern', 4, 2); put('decor:lighthouse', 3, 5); put('decor:treasure', 1, 5);
    const forms = [['crab.0', 3, 4], ['snail.0', 2, 4], ['star.b.warmth', 1, 2], ['horse.m.glow', 3, 3], ['jelly.b.glow', 2, 2], ['octo.0', 3, 2]];
    let n = 0;
    for (const [f, x, y] of forms) { const c = { id: st.nid++, form: f, x, y, lvl: 3, stored: 60 + n * 90, born: now, hat: n === 1 ? 'partyhat' : n === 3 ? 'crownhat' : null, evo: null }; pool.creatures.push(c); n++; }
    const e = S.spawnEgg(st, pool, now - 1e6, { fam: 'crab' });
    pool.creatures.push({ id: st.nid++, form: 'crab.0', x: 4, y: 5, lvl: 3, stored: 0, born: now, hat: null, evo: { to: 'crab.b.stone', start: now - 1000, end: now + 3600e3 } });
  } else {
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3], [2, 4], [3, 4]]) { put('dig', x, y); put('dig', x, y); put('dig', x, y); }
    put('piece:glowstone', 1, 2); put('piece:vent', 4, 4); put('piece:biokelp', 1, 4); put('piece:basalt', 4, 2);
    const forms = [['angler.b.glow', 2, 2], ['naut.m.stone', 3, 3], ['manta.0', 2, 4], ['drake.b.glow', 3, 4]];
    forms.forEach(([f, x, y], n) => pool.creatures.push({ id: st.nid++, form: f, x, y, lvl: 3, stored: 200 * n, born: now, hat: null, evo: null }));
  }
  const cv = document.getElementById('c');
  const sc = createScene(cv);
  sc.state = st; sc.biome = biome;
  sc.resize(390, 844, 2, { top: 130, bottom: 120 });
  sc.buildMode = false;
  let t = performance.now();
  window.__sc = sc; window.__now = now;
  for (let i = 0; i < 90; i++) sc.frame(1 / 30, now + i * 33);
}, { hour, biome });
await page.screenshot({ path: out });
await browser.close();
console.log('wrote', out);
