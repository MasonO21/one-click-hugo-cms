// End-to-end play-through on a phone-sized viewport using real touch input. Saves screenshots to /tmp/tt/e2e.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../www');
const shots = process.env.SHOTS || '/tmp/tt/e2e';
fs.mkdirSync(shots, { recursive: true });
for (const f of fs.readdirSync(shots)) fs.unlinkSync(path.join(shots, f));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const f = path.join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const port = server.address().port;
const W = +process.env.W || 390, H = +process.env.H || 844;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
await ctx.addInitScript(() => { const fixed = new Date('2026-06-10T10:30:00-07:00').getTime(); const real = Date.now; const t0 = real(); Date.now = () => fixed + (real() - t0); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type().toUpperCase() + ' ' + m.text()); });
let n = 0;
const shot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const ev = (fn, arg) => page.evaluate(fn, arg);
const tapXY = async (x, y) => { const hit = await page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e && e.id !== 'scene' ? (e.className || e.tagName) : ''; }, { x, y }); if (hit) fail(`tap at ${Math.round(x)},${Math.round(y)} lands on a DOM overlay (${hit}) instead of the canvas`); await page.touchscreen.tap(x, y); await page.waitForTimeout(120); };
const tapTile = async (t) => { const [x, y] = await ev(({ x, y }) => window.__tt.scene.tileCenter(x, y), t); await tapXY(x, y); };
const tapCreature = async (id) => { const [x, y] = await ev((id) => { const sc = window.__tt.scene; const v = sc.views.get(id); const [px, py] = sc.tileCenter(v.x, v.y); return [px, py - sc.ts * 0.15]; }, id); await tapXY(x, y); };
const click = async (sel) => { const e = page.locator(sel).first(); await e.waitFor({ state: 'visible', timeout: 4000 }); await e.click({ force: true }); await page.waitForTimeout(150); };
const fail = (m) => { console.error('FAIL: ' + m); errs.push('FAIL ' + m); };
const step = () => ev(() => window.__tt.G.state.tut.step);
const expectStep = async (s, label) => { const cur = await step(); if (cur !== s) fail(`${label}: expected tutorial step ${s}, got ${cur}`); };

await page.goto(`http://localhost:${port}/?debug`);
await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 });
await page.waitForTimeout(500);
await shot('intro');
await click('[data-act="tutstart"]');
await expectStep(1, 'after intro');
await shot('tut1-dig');

// -- step 1: dig two tiles (drag paint across both)
let tiles = await ev(() => window.__tt.G.tutorial().tiles);
for (const t of tiles) await tapTile(t);
await expectStep(2, 'after digging');
await shot('tut2-rock');
// -- step 2: place a rock
tiles = await ev(() => window.__tt.G.tutorial().tiles);
if (!tiles.length) fail('no rock hint tiles');
await tapTile(tiles[0]);
await expectStep(3, 'after rock');
await page.waitForTimeout(600);
await shot('tut3-egg-warming');
await ev(() => window.__tt.advance(5000));
await page.waitForTimeout(400);
tiles = await ev(() => window.__tt.G.tutorial().tiles);
for (let i = 0; i < 3; i++) await tapTile(tiles[0]);
await page.waitForTimeout(400);
await expectStep(4, 'after hatch');
await shot('tut4-bubble');
const cid = await ev(() => window.__tt.G.state.pools.tide.creatures[0].id);
const bp = await ev((id) => window.__tt.scene.bubblePos(id), cid);
if (!bp) fail('no bubble on the first creature'); else await tapXY(bp.x, bp.y);
await page.waitForTimeout(300);
await expectStep(5, 'after collect');
await shot('tut5-levelup');
// -- step 5: open creature, level up twice
await tapCreature(cid);
await page.waitForSelector('#sheet.open', { timeout: 3000 });
await shot('sheet-open');
await click('#sheet .btn-level'); await click('#sheet .btn-level');
await expectStep(6, 'after level 3');
await shot('tut6-habitat');
// -- step 6: add rock next to creature
tiles = await ev(() => window.__tt.G.tutorial().tiles);
await tapTile(tiles[0]);
await page.waitForTimeout(300);
let info = await ev(() => window.__tt.G.tutorial());
if (!/Evolve/.test(info.text)) { tiles = info.tiles; if (tiles[0]) await tapTile(tiles[0]); }
await page.waitForTimeout(200);
await shot('tut6b-ready-to-evolve');
// open creature and evolve
await tapCreature(cid);
await page.waitForSelector('#sheet.open', { timeout: 3000 });
await shot('sheet-evolve');
await click('#sheet .btn-evolve');
await expectStep(7, 'after evolve');
await page.waitForTimeout(300);
await shot('tut7-cocoon');
await ev(() => window.__tt.advance(16000));
await page.waitForSelector('[data-overlay="reveal"]', { timeout: 4000 });
await shot('reveal');
await click('[data-act="close:reveal"]');
await page.waitForSelector('[data-overlay="levelup"]', { timeout: 4000 });
await shot('levelup');
await click('[data-act="close:levelup"]');
await page.waitForSelector('[data-overlay="tutdone"]', { timeout: 4000 });
await shot('tutorial-done');
await click('[data-act="close:tutdone"]');
await page.waitForTimeout(500);
if (await page.locator('[data-overlay="daily"]').count()) { await shot('daily'); await click('[data-act="claimdaily"]'); await page.waitForTimeout(300); await shot('daily-reward'); await click('[data-act="close:reward"]'); }
await page.waitForTimeout(300);
const done = await ev(() => window.__tt.G.state.tut.done);
if (!done) fail('tutorial not marked done');
await shot('after-tutorial-pool');

// -- explore the app
await ev(() => window.__tt.give({ pearls: 5000, glass: 300 }));
await click('[data-tab="build"]'); await page.waitForTimeout(300); await shot('build-dock');
await click('[data-tab="pool"]');
await click('[data-tab="dex"]'); await shot('dex'); await ev(() => document.querySelector('.modal .mb').scrollTo(0, 600)); await shot('dex-scrolled'); await click('[data-act="close:dex"]');
await click('[data-tab="quests"]'); await shot('quests'); await click('[data-act="close:quests"]');
await click('[data-tab="shop"]'); await shot('shop-glass');
for (const t of ['boost', 'decor', 'deep']) { await click(`[data-act="shoptab:${t}"]`); await shot('shop-' + t); }
await click('[data-act="shoptab:decor"]'); await click('[data-act="shopsub:hat"]'); await shot('shop-hats');
await click('[data-act="shopsub:skin"]'); await shot('shop-skins');
await click('[data-act="close:shop"]');
await click('[data-act="settings"]'); await shot('settings'); await click('[data-act="close:settings"]');
// -- premium biome flow (demo purchase)
await click('[data-act="biome:deep"]'); await shot('deep-upsell');
await click(`[data-act="buy:com.tinytides.game.deepocean"]`);
await page.waitForSelector('[data-overlay="purchased"]', { timeout: 5000 });
await shot('deep-purchased');
await click('[data-act="godeep"]'); await page.waitForTimeout(600); await shot('deep-scene');
await click('[data-tab="build"]'); await shot('deep-build');
await click('[data-tab="pool"]'); await click('[data-act="biome:tide"]');
// -- decor placement & photo
await ev(() => { const s = window.__tt.G.state; s.own.sandcastle = true; s.own.duck = true; });
await click('[data-tab="build"]'); await click('[data-act="decorpicker"]'); await shot('decor-picker'); await click('[data-act="useprop:sandcastle"]');
await page.waitForTimeout(300);
await click('[data-tab="pool"]'); await click('[data-act="snap"]'); await shot('photo'); await click('[data-act="close:photo"]');

// -- persistence + welcome back: save, rewind lastSeen by 6h, reload
await ev(() => window.__tt.G.save(true));
const before = await ev(() => ({ n: window.__tt.G.state.pools.tide.creatures.length, lvl: window.__tt.G.state.lvl, dex: Object.keys(window.__tt.G.state.dex).length, deep: window.__tt.G.state.iap.deep }));
await ev(() => { const raw = JSON.parse(localStorage.getItem('tinytides.save.v1')); raw.lastSeen -= 6 * 3600e3; raw.lastTick -= 6 * 3600e3; localStorage.setItem('tinytides.save.v1', JSON.stringify(raw)); localStorage.removeItem('tinytides.save.v1.bak'); window.__tt.G.resetting = true; /* block the pagehide save so it cannot overwrite the rewound save */ });
await page.reload();
await page.waitForSelector('#boot.gone', { state: 'attached', timeout: 8000 });
await page.waitForTimeout(600);
const after = await ev(() => ({ n: window.__tt.G.state.pools.tide.creatures.length, lvl: window.__tt.G.state.lvl, dex: Object.keys(window.__tt.G.state.dex).length, deep: window.__tt.G.state.iap.deep }));
if (JSON.stringify(before) !== JSON.stringify(after)) fail(`state changed across reload: ${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
if (!(await page.locator('[data-overlay="welcome"]').count())) fail('no welcome-back modal after 6h away');
await shot('welcome-back');
await click('[data-act="close:welcome"]');
await page.waitForTimeout(400);
await shot('after-welcome');
const bad = errs.filter((e) => !/AudioContext/.test(e));
console.log(bad.length ? 'PROBLEMS:\n' + bad.join('\n') : 'E2E OK — no failures, no console errors');
console.log('screenshots in', shots);
await browser.close(); server.close();
process.exit(bad.length ? 1 : 0);
