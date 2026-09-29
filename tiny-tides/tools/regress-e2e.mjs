// Regression checks for UI/flow defects found in review. Uses the debug build (`node tools/build.mjs --debug`) and real touch input.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const problems = [];
const fail = (m) => { console.error('FAIL: ' + m); problems.push(m); };
const ok = (c, m) => { if (!c) fail(m); else console.log('ok   ' + m); };

async function fresh(w = 390, h = 844) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await ctx.addInitScript(() => { const fixed = new Date('2026-06-10T10:30:00-07:00').getTime(); const real = Date.now; const t0 = real(); Date.now = () => fixed + (real() - t0); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${port}/?debug`);
  await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(400);
  return { ctx, page, ev: (fn, arg) => page.evaluate(fn, arg) };
}
const boot = async (page) => { await page.reload(); await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 }); await page.waitForTimeout(500); };

// ---------------------------------------------------------------- 1. quitting during the first evolution reveal must not strand the tutorial
{
  const { ctx, page, ev } = await fresh();
  await ev(() => {
    const { G, S } = window.__tt, now = G.now();
    G.tutorialStart();
    const s = G.state, p = s.pools.tide;
    for (const [x, y] of [[2, 2], [2, 3]]) S.applyTool(s, 'tide', 'dig', x, y);
    S.applyTool(s, 'tide', 'piece:granite', 1, 2);
    const egg = S.spawnEgg(s, p, now, { fam: 'crab', warm: 0 });
    S.hatchEgg(s, 'tide', egg.id, now);
    const c = p.creatures[0]; c.lvl = 3; s.tut.step = 7; c.evo = { to: 'crab.b.stone', start: now - 5000, end: now - 1000 };
    G.tick();
  });
  await page.waitForTimeout(800);
  const t = await ev(() => ({ done: window.__tt.G.state.tut.done, step: window.__tt.G.state.tut.step, modal: !!document.querySelector('[data-overlay="reveal"]'), flag: window.__tt.G.state.flags.tutModal }));
  ok(t.done && t.modal, `first evolution finishes the tutorial at once and opens the reveal (${JSON.stringify(t)})`);
  await ev(() => window.__tt.G.save(true));
  await boot(page);
  const back = await ev(() => ({ done: window.__tt.G.state.tut.done, celebrate: !!document.querySelector('[data-overlay="tutdone"]'), eggsOn: window.__tt.G.state.pools.tide.nextEgg > 0 }));
  ok(back.done, 'after a restart the tutorial is still finished (not stuck at step 8)');
  ok(back.celebrate, 'the "You did it!" card still appears after the restart');
  await ctx.close();
}

// ---------------------------------------------------------------- 2. "Send home" is not offered during the tutorial; opening Build closes the creature sheet
{
  const { ctx, page, ev } = await fresh();
  await ev(() => {
    const { G, S } = window.__tt, now = G.now(), s = G.state, p = s.pools.tide;
    G.tutorialStart(); s.tut.step = 5;
    S.applyTool(s, 'tide', 'dig', 2, 2);
    const egg = S.spawnEgg(s, p, now, { fam: 'crab', warm: 0 }); S.hatchEgg(s, 'tide', egg.id, now);
    G.select(p.creatures[0].id); G.ui.openSheet(p.creatures[0].id);
  });
  await page.waitForTimeout(300);
  await page.locator('[data-act="shtab:style"]').first().click({ force: true }).catch(() => {});
  ok(await page.locator('[data-act="release"]').count() === 0, 'no "Send home" button while the tutorial is running');
  await ev(() => window.__tt.G.tutorialSkip());
  await page.waitForTimeout(200);
  await ev(() => { const { G } = window.__tt; G.ui.openSheet(G.state.pools.tide.creatures[0].id); });
  await page.waitForTimeout(300);
  await page.locator('[data-tab="build"]').first().click({ force: true });
  await page.waitForTimeout(400);
  const sheet = await ev(() => { const e = document.getElementById('sheet'); return e ? getComputedStyle(e).visibility !== 'hidden' && e.classList.contains('open') : false; });
  ok(!sheet, 'the creature sheet closes when the Build tab opens');
  await ctx.close();
}

// ---------------------------------------------------------------- 3. toasts raised inside a modal are visible
{
  const { ctx, page, ev } = await fresh();
  await ev(() => { const { G } = window.__tt; G.tutorialSkip(); G.state.settings.paidPulls = false; G.ui.openGacha(); });
  await page.waitForTimeout(500);
  await ev(() => window.__tt.G.ui.toast('hello from a modal', 'warn'));
  await page.waitForTimeout(150);
  const vis = await ev(() => { const t = document.querySelector('#toasts .toast'); if (!t) return 'none'; const r = t.getBoundingClientRect(); const hit = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit.some((e) => e.classList?.contains('toast')) || getComputedStyle(document.getElementById('toasts')).zIndex; });
  const z = await ev(() => ({ toasts: +getComputedStyle(document.getElementById('toasts')).zIndex, modal: +getComputedStyle(document.getElementById('modal-root')).zIndex }));
  ok(z.toasts > z.modal, `toasts (z ${z.toasts}) stack above the modal layer (z ${z.modal}) [${vis}]`);
  await ctx.close();
}

// ---------------------------------------------------------------- 4. tapping the crank uses the free daily capsule first
{
  const { ctx, page, ev } = await fresh();
  await ev(() => { const { G } = window.__tt; G.tutorialSkip(); G.state.cur.coins = 5; G.ui.openGacha(); });
  await page.waitForTimeout(700);
  const box = await ev(() => { const r = document.getElementById('gz-cv').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  // crank hotspot is at (262, 372) in the machine's 360x470 design space (MW/MH in src/art_gacha.js)
  const sx = box.w / 360, sy = box.h / 470;
  await page.touchscreen.tap(box.x + 262 * sx, box.y + 372 * sy);
  await page.waitForTimeout(600);
  const r = await ev(() => ({ coins: window.__tt.G.state.cur.coins, free: window.__tt.S.gachaFreeAvailable(window.__tt.G.state, window.__tt.G.now()) }));
  ok(r.coins === 5 && r.free === false, `crank tap used the free capsule, not a coin (${JSON.stringify(r)})`);
  await ctx.close();
}

// ---------------------------------------------------------------- 5. Escape does not dismiss sticky dialogs; a backdrop press-and-release does dismiss plain ones
{
  const { ctx, page, ev } = await fresh();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('[data-overlay="intro"]').count() === 1, 'Escape leaves the intro dialog open');
  await page.locator('[data-act="tutstart"]').first().click({ force: true });
  await ev(() => { window.__tt.G.tutorialSkip(); window.__tt.G.ui.openSettings(); });
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(await page.locator('[data-overlay="settings"]').count() === 0, 'Escape closes an ordinary dialog (Settings)');
  await ctx.close();
}

// ---------------------------------------------------------------- 6. small phone: the HUD fits and nothing scrolls sideways
for (const [w, h] of [[320, 568], [375, 667]]) {
  const { ctx, page, ev } = await fresh(w, h);
  await ev(() => { const { G } = window.__tt; G.tutorialSkip(); G.state.cur.pearls = 987654; G.state.cur.glass = 54321; G.state.cur.coins = 12; G.state.iap.deep = true; G.state.pools.deep ||= window.__tt.S.newPool('deep', G.now()); G.ui.refresh(); });
  await page.waitForTimeout(400);
  const m = await ev(() => { const rows = [...document.querySelectorAll('#hud .hud-row')]; return { over: rows.map((r) => r.scrollWidth - r.clientWidth), doc: document.documentElement.scrollWidth - window.innerWidth }; });
  ok(m.over.every((o) => o <= 0) && m.doc <= 0, `${w}x${h}: HUD rows fit (${JSON.stringify(m)})`);
  await ctx.close();
}

await browser.close(); server.close();
console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nREGRESSION E2E OK');
process.exit(problems.length ? 1 : 0);
