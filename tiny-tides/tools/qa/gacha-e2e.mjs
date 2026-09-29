// End-to-end run of the Capsule Machine on a phone viewport. Requires a --debug build.  node tools/gacha-e2e.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../www');
const shots = process.env.SHOTS || '/tmp/tt/gz';
fs.mkdirSync(shots, { recursive: true }); for (const f of fs.readdirSync(shots)) fs.unlinkSync(path.join(shots, f));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const W = +process.env.W || 390, H = +process.env.H || 844;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
await ctx.addInitScript(() => { const fixed = new Date('2026-06-10T10:30:00-07:00').getTime(); const real = Date.now; const t0 = real(); Date.now = () => fixed + (real() - t0); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/AudioContext/.test(m.text())) errs.push(m.type().toUpperCase() + ' ' + m.text()); });
let n = 0;
const shot = async (name) => { await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const fail = (m) => { console.error('FAIL: ' + m); errs.push('FAIL ' + m); };
const click = async (sel) => { const e = page.locator(sel).first(); await e.waitFor({ state: 'visible', timeout: 6000 }); await e.click({ force: true }); await page.waitForTimeout(120); };

await page.goto(`http://localhost:${server.address().port}/?debug`);
await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 });
// skip tutorial, give currency
await ev(() => { const { G } = window.__tt; G.tutorialSkip(); const s = G.state; s.cur.coins = 12; s.cur.glass = 700; s.lvl = 8; for (const k of Object.keys(s.quests)) void k; });
await page.waitForTimeout(400);
await ev(() => { window.__tt.G.ui.closeAllModals(); });
await shot('pool-with-capsule-fab');
if (!(await page.locator('#fab-capsule:not([hidden])').count())) fail('capsule FAB not visible');

// ---- open the machine, take the free daily capsule
await click('#fab-capsule button');
await page.waitForSelector('#gz-cv', { timeout: 4000 });
await shot('machine-idle');
await click('[data-gz^="pull:1:free"]');
await page.waitForSelector('[data-gz="open:0"]', { timeout: 9000 });
await shot('capsule-dropped');
await click('[data-gz="open:0"]');
await page.waitForSelector('#gz-cap:not([hidden])', { timeout: 6000 });
await shot('reveal-single');
const free = await ev(() => window.__tt.G.state.gacha);
if (free.pulls !== 1 || free.freeDay === '') fail('free pull not recorded: ' + JSON.stringify(free));
await click('[data-gz="next"]');
await page.waitForSelector('[data-gz^="pull:1:coin"]', { timeout: 4000 });
if (await page.locator('.gz-free').count()) fail('free button still shown after use');

// ---- 10-pull with coins
await click('[data-gz^="pull:10:"]');
await page.waitForSelector('[data-gz="openall"]', { timeout: 14000 });
await shot('pile-10');
const coinsAfter = await ev(() => window.__tt.G.state.cur.coins);
if (coinsAfter > 12 - 10 + 20) fail('coins not spent');
await click('[data-gz="openall"]');
// wait for results summary (auto-open through 10 capsules; tap "Next"/canvas if needed)
for (let i = 0; i < 40; i++) {
  if (await page.locator('#gz-sum:not([hidden])').count()) break;
  if (await page.locator('[data-gz="next"]').count()) { if (i === 3) await shot('reveal-batch'); await page.locator('[data-gz="next"]').first().click({ force: true }).catch(() => {}); }
  await page.waitForTimeout(450);
}
if (!(await page.locator('#gz-sum:not([hidden])').count())) fail('summary never appeared');
await shot('summary-10');
await click('[data-gz="done"]');

// ---- region switch: paid pulls are refused (and cost nothing) in blocked storefronts
await ev(() => { window.__tt.G.state.cur.coins = 0; window.__tt.store.country = 'BEL'; });
{
  const gb = await ev(() => window.__tt.G.state.cur.glass);
  await page.waitForTimeout(700);
  await click('[data-gz^="pull:1:glass"]');
  await page.waitForTimeout(400);
  const ga = await ev(() => ({ glass: window.__tt.G.state.cur.glass, pulls: window.__tt.G.state.gacha.paidPulls }));
  if (ga.glass !== gb) fail(`glass changed in a blocked region: ${gb} -> ${ga.glass}`);
  await shot('region-blocked');
  await ev(() => { window.__tt.store.country = 'USA'; });
  await page.waitForTimeout(700);
}
// ---- glass pull needs a confirm + spends glass
await ev(() => { window.__tt.G.state.cur.coins = 0; });
const g0 = await ev(() => window.__tt.G.state.cur.glass);
await click('[data-gz^="pull:1:glass"]');
await page.waitForSelector('[data-act="confirm:yes"]', { timeout: 3000 });
await shot('confirm-glass');
await click('[data-act="confirm:yes"]');
await page.waitForSelector('[data-gz="open:0"]', { timeout: 9000 });
const g1 = await ev(() => window.__tt.G.state.cur.glass);
if (g1 > g0 - 30 + 10 || g1 < g0 - 30) fail(`glass ${g0} -> ${g1}`);
await click('[data-gz="open:0"]'); await page.waitForSelector('#gz-cap:not([hidden])', { timeout: 6000 }); await click('[data-gz="next"]');

// ---- other tabs
await click('[data-gz="tab:toys"]'); await shot('toybox');
await ev(() => document.querySelector('.modal.gz .mb').scrollTo(0, 500)); await shot('toybox-scrolled');
const ownedId = await ev(() => Object.keys(window.__tt.G.state.gacha.owned)[0]);
if (!ownedId.startsWith('fig')) await click('[data-gz="toytab:goods"]');
await click(`[data-gz="toy:${ownedId}"]`); await shot('toy-detail'); await click('[data-act="close:toydetail"]');
await click('[data-gz="toytab:goods"]'); await shot('toybox-goodies');
await click('[data-gz="tab:prizes"]'); await ev(() => { window.__tt.G.state.gacha.shards = 60; window.__tt.G.ui.gacha.refreshWallet(); }); await click('[data-gz="ptier:uncommon"]'); await shot('prizes');
const before = await ev(() => Object.keys(window.__tt.G.state.gacha.owned).length);
await click('[data-gz^="prize:"]'); 
const after = await ev(() => Object.keys(window.__tt.G.state.gacha.owned).length);
if (after !== before + 1) fail(`prize exchange did not add a toy (${before} -> ${after})`);
await click('[data-gz="tab:rates"]'); await shot('rates'); await ev(() => document.querySelector('.modal.gz .mb').scrollTo(0, 420)); await shot('rates-scrolled');
const rateSum = await ev(() => [...document.querySelectorAll('.rate-row b')].reduce((a, b) => a + parseFloat(b.textContent), 0));
if (Math.abs(rateSum - 100) > 0.6) fail(`displayed rates sum to ${rateSum}%`);
await click('[data-act="close:gacha"]');

// ---- place a figurine on the beach and tap the Beach Gachapon
await ev(() => { const s = window.__tt.G.state; s.own.capsulemachine = true; s.gacha.owned.capsulemachine = 1; });
await click('[data-tab="build"]');
await ev(() => { const { G } = window.__tt; G.setTool(`decor:${Object.keys(G.state.gacha.owned).find((k) => k.startsWith('fig_'))}`); });
await page.waitForTimeout(200);
const tile = await ev(() => { const { S, G } = window.__tt; const p = G.state.pools.tide; for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { const t = S.tileAt(p, x, y); if (t.w === 0 && !t.p && !t.d) return { x, y }; } });
const [tx, ty] = await ev((t) => window.__tt.scene.tileCenter(t.x, t.y), tile);
await page.touchscreen.tap(tx, ty); await page.waitForTimeout(300);
if (!(await ev((t) => !!window.__tt.S.tileAt(window.__tt.G.state.pools.tide, t.x, t.y).d, tile))) fail('figurine was not placed');
await ev(() => { window.__tt.G.setTool('decor:capsulemachine'); });
const tile2 = await ev(() => { const { S, G } = window.__tt; const p = G.state.pools.tide; for (let y = p.h - 1; y >= 0; y--) for (let x = p.w - 1; x >= 0; x--) { const t = S.tileAt(p, x, y); if (t.w === 0 && !t.p && !t.d) return { x, y }; } });
const [ux, uy] = await ev((t) => window.__tt.scene.tileCenter(t.x, t.y), tile2);
await page.touchscreen.tap(ux, uy); await page.waitForTimeout(300);
await click('[data-tab="pool"]'); await page.waitForTimeout(500); await shot('pool-with-toys');
const [vx, vy] = await ev((t) => window.__tt.scene.tileCenter(t.x, t.y), tile2);   // layout changes when the build dock closes
await page.touchscreen.tap(vx, vy); await page.waitForTimeout(500);
if (!(await page.locator('[data-overlay="gacha"]').count())) fail('tapping the Beach Gachapon did not open the machine');
await shot('opened-from-beach');
await click('[data-act="close:gacha"]');

// ---- persistence
await ev(() => window.__tt.G.save(true));
const snap = await ev(() => JSON.stringify(window.__tt.G.state.gacha.owned));
await page.reload(); await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 }); await page.waitForTimeout(500);
const snap2 = await ev(() => JSON.stringify(window.__tt.G.state.gacha.owned));
if (snap !== snap2) fail('toybox did not survive a reload');

const bad = errs;
console.log(bad.length ? 'PROBLEMS:\n' + bad.join('\n') : 'GACHA E2E OK — no failures, no console errors');
console.log('screenshots in', shots);
await browser.close(); server.close();
process.exit(bad.length ? 1 : 0);
