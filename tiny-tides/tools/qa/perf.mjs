// Frame-cost check on a CPU-throttled phone-sized browser (throttle 4x ≈ an iPhone from around 2017).
//   node tools/build.mjs --debug && node tools/qa/perf.mjs [--throttle=4] [--seconds=4]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const THROTTLE = +args.throttle || 4, SECONDS = +args.seconds || 4;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const rows = [];
let failed = false;

for (const [label, w, h, dpr, battery] of [['iPhone SE 375x667 @2x', 375, 667, 2, false], ['iPhone 15 Pro 393x852 @3x', 393, 852, 3, false], ['iPhone 15 Pro, battery saver', 393, 852, 3, true], ['iPad 820x1180 @2x', 820, 1180, 2, false]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${port}/?debug`);
  await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 });
  await page.evaluate((battery) => {
    const { G, S } = window.__tt, st = G.state, now = G.now();
    G.tutorialSkip(); G.ui.closeAllModals(); st.lvl = 14; st.cur.pearls = 1e6; st.settings.battery = battery; G.applySettings();
    for (let i = 0; i < 3; i++) S.expandPool(st, 'tide');
    const p = st.pools.tide;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { if ((x * 7 + y * 3) % 5 < 2) S.applyTool(st, 'tide', 'dig', x, y); }
    for (const id of ['granite', 'kelp', 'mossy', 'ember', 'pearlite']) for (let k = 0; k < 3; k++) S.applyTool(st, 'tide', `piece:${id}`, (k * 2 + id.length) % p.w, (id.length + k * 3) % p.h);
    for (let i = 0; i < 9; i++) { const e = S.spawnEgg(st, p, now, { warm: 0 }); if (e) { const c = S.hatchEgg(st, 'tide', e.id, now).creature; if (i % 3 === 0) c.form = D_first(c.form); } }
    function D_first(f) { return f; }
    st.equip.fx = 'bubbles'; window.__tt.scene.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio, window.__tt.scene.insets); G.ui.layoutChanged();
  }, battery);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.waitForTimeout(500);
  const r = await page.evaluate(async (seconds) => {
    const sc = window.__tt.scene, orig = sc.frame; let cost = 0, n = 0, worst = 0;
    sc.frame = (dt, t) => { const a = performance.now(); orig(dt, t); const d = performance.now() - a; cost += d; n++; worst = Math.max(worst, d); };
    const stamps = [];
    await new Promise((res) => { const t0 = performance.now(); const loop = (t) => { stamps.push(t); if (t - t0 < seconds * 1000) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    sc.frame = orig;
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
    return { fps: Math.round(1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)), p95gap: Math.round(gaps[Math.floor(gaps.length * 0.95)]), frames: n, avgCost: +(cost / Math.max(1, n)).toFixed(2), worstCost: Math.round(worst) };
  }, SECONDS);
  rows.push({ device: label, throttle: `${THROTTLE}x`, 'fps': r.fps, 'p95 frame gap ms': r.p95gap, 'avg draw ms': r.avgCost, 'worst draw ms': r.worstCost });
  if (r.avgCost > 14 && !battery) failed = true;
  await ctx.close();
}
console.table(rows);
await browser.close(); server.close();
if (failed) { console.error(`PERF: average draw cost above 14 ms at ${THROTTLE}x throttle`); process.exit(1); }
console.log('PERF OK');
