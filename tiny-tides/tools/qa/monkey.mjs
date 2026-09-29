// UI monkey test: random taps, random buttons, time jumps, Escape and reloads on a phone-sized touch viewport.
// Fails on any uncaught error, console error, external network request, broken save, or a UI that ends up unusable.
//   node tools/build.mjs --debug && node tools/qa/monkey.mjs [--seeds=3] [--steps=400] [--w=390] [--h=844]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const SEEDS = +args.seeds || 3, STEPS = +args.steps || 400, W = +args.w || 390, H = +args.h || 844;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const problems = [];

for (let seed = 1; seed <= SEEDS; seed++) {
  let s = seed * 7919;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Berlin', locale: 'en-GB' });
  await ctx.addInitScript(() => { const fixed = new Date('2026-06-10T10:30:00+02:00').getTime(); const real = Date.now; const t0 = real(); Date.now = () => fixed + (real() - t0); });
  await ctx.addInitScript(() => { window.open = () => null; });      // links the player taps open Safari; that is the player's choice, not the app talking to a server
  const external = [];
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(`http://localhost:${port}`) || u.startsWith('data:') || u.startsWith('blob:')) route.continue(); else { external.push(u); route.abort(); } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  page.on('console', (m) => { if (m.type() === 'error' && !/AudioContext|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  const load = async () => { await page.goto(`http://localhost:${port}/?debug`); await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 }); await page.waitForTimeout(300); };
  await load();
  const ev = (fn, a) => page.evaluate(fn, a);
  if (seed % 2 === 0) await ev(() => { window.__tt.G.tutorialSkip(); window.__tt.G.ui.closeAllModals(); });
  else { await page.locator('[data-act="tutstart"]').first().click({ force: true }).catch(() => {}); }
  await ev(() => { window.__tt.give({ pearls: 20000, glass: 400, coins: 5 }); });

  const SKIP = /^(reset|link|sharephoto|sharereveal|confirm:yes|dbg)/;
  const log = [];
  for (let i = 0; i < STEPS; i++) {
    const r = rnd();
    let what = '';
    try {
      if (r < 0.45) {
        const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); what = `tap ${x},${y}`;
        await page.touchscreen.tap(x, y);
      } else if (r < 0.88) {
        const targets = await ev(() => [...document.querySelectorAll('[data-act],[data-gz],[data-tab]')].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 4 && b.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && b.bottom > 0 && b.top < window.innerHeight && !e.closest('[hidden]'); }).map((e) => { const b = e.getBoundingClientRect(); return { a: e.dataset.act || e.dataset.gz || e.dataset.tab, x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
        const pool = targets.filter((t) => !SKIP.test(t.a));
        if (pool.length) { const t = pool[Math.floor(rnd() * pool.length)]; what = `press ${t.a}`; await page.touchscreen.tap(t.x, t.y); }
      } else if (r < 0.93) {
        const ms = [60e3, 10 * 60e3, 3600e3, 6 * 3600e3, 30 * 3600e3][Math.floor(rnd() * 5)]; what = `advance ${ms / 60e3}min`;
        await ev((ms) => window.__tt.advance(ms), ms);
      } else if (r < 0.96) { what = 'Escape'; await page.keyboard.press('Escape'); }
      else if (r < 0.98) { what = 'drag'; const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40, { steps: 4 }); await page.mouse.up(); }
      else { what = 'reload'; await ev(() => window.__tt.G.save(true)); await load(); }
    } catch (e) { errs.push(`ACTION FAILED (${what}): ${e.message.split('\n')[0]}`); }
    log.push(what); if (log.length > 10) log.shift();
    if (i % 20 === 19) {
      const bad = await ev(() => {
        const { G, S, D } = window.__tt, st = G.state;
        for (const k of ['pearls', 'glass', 'tokens', 'coins']) if (!Number.isFinite(st.cur[k]) || st.cur[k] < 0) return `currency ${k}=${st.cur[k]}`;
        for (const pool of Object.values(st.pools)) for (const it of [...pool.creatures, ...pool.eggs]) if (!S.inb(pool, it.x, it.y)) return 'creature out of bounds';
        if (!S.deserialize(S.serialize(st), Date.now())) return 'state does not survive a save/load';
        if (document.querySelectorAll('.overlay').length > 6) return `${document.querySelectorAll('.overlay').length} dialogs stacked`;
        if (D.GACHA.paidDailyCap < st.gacha.paidToday) return 'paid cap exceeded';
        return '';
      });
      if (bad) errs.push(`INVARIANT (${bad}) after: ${log.join(' | ')}`);
      // the app must always be recoverable: closing dialogs must give back the pool screen
      await ev(() => window.__tt.G.ui.closeAllModals());
      const usable = await ev(() => !!document.querySelector('#nav') && getComputedStyle(document.querySelector('#nav')).display !== 'none');
      if (!usable) errs.push('nav bar missing after closing dialogs');
    }
  }
  if (external.length) errs.push('EXTERNAL REQUESTS: ' + [...new Set(external)].join(', '));
  console.log(`seed ${seed}: ${STEPS} actions, ${errs.length ? errs.length + ' problem(s)' : 'clean'}`);
  for (const e of errs) { console.error('  ' + e); problems.push(`seed ${seed}: ${e}`); }
  await ctx.close();
}
await browser.close(); server.close();
console.log(problems.length ? `\nMONKEY FAILED (${problems.length})` : '\nMONKEY OK');
process.exit(problems.length ? 1 : 0);
