// Generates App Store screenshots (iPhone 6.9", iPhone 6.5", iPad 13") into store/screenshots/.
// Builds a debug bundle (needs the __tt hooks), scripts populated mid-game scenes, captures, then frames them with captions.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
execSync('node tools/build.mjs --debug', { cwd: root, stdio: 'inherit' });
const www = path.join(root, 'www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => { const f = path.join(www, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0);
const port = server.address().port;

const DEVICES = [
  { id: 'iphone-6.9', w: 440, h: 956, dpr: 3, out: [1320, 2868] },
  { id: 'iphone-6.5', w: 428, h: 926, dpr: 3, out: [1284, 2778] },
  { id: 'ipad-13', w: 1032, h: 1376, dpr: 2, out: [2064, 2752] },
];
const SHOTS = [
  { slug: 'build', caption: 'Build a tiny living tidepool', bg: ['#5fd6ff', '#8b7bff'] },
  { slug: 'evolve', caption: 'Rocks & water decide what they become', bg: ['#ff9ad8', '#a78bfa'] },
  { slug: 'discover', caption: 'Discover 70 adorable creatures', bg: ['#ffd66d', '#ff8fc4'] },
  { slug: 'capsules', caption: 'Crank the capsule machine', bg: ['#ff8ad8', '#8b5cf6'] },
  { slug: 'toybox', caption: 'Collect 99 tiny toys', bg: ['#ffd66d', '#ff7ac8'] },
  { slug: 'idle', caption: 'Check in a few times a day', bg: ['#6ee7b7', '#3fb8ee'] },
  { slug: 'tidedex', caption: 'Complete your Tidedex', bg: ['#a78bfa', '#5b6cff'] },
  { slug: 'deep', caption: 'Dive into the glowing Deep Ocean', bg: ['#3358d6', '#0f1a5c'] },
  { slug: 'decor', caption: 'Decorate it your way', bg: ['#ff7ac8', '#7b3dff'] },
];

/** Runs inside the game page: builds a rich mid-game world for the requested scene. */
const SETUP = ({ scene }) => {
  const { G, S, D } = window.__tt;
  const st = G.state, now = G.now();
  const put = (t, x, y, b = 'tide') => { const r = S.applyTool(st, b, t, x, y); if (!r.ok) console.error('put', t, x, y, r.reason); };
  const mk = (b, form, x, y, o = {}) => { const p = st.pools[b]; const stage = D.FORMS[form].stage; const c = { id: st.nid++, form, x, y, lvl: Math.min(o.lvl || 6, D.STAGE[stage].maxLvl), stored: 0, born: now, hat: o.hat || null, evo: null }; p.creatures.push(c); const cap = S.bubbleCap(st, p, c, now); c.stored = cap * (o.fill ?? 0); return c; };
  if (!st.tut.done) { st.tut = { step: 9, done: true }; st.flags.firstEvo = true; }
  st.lvl = 13; st.xp = 120; st.cur = { pearls: 12840, glass: 236, tokens: 2 };
  for (const k of D.DECOR_IDS) st.own[k] = true;
  st.daily = { n: 4, last: S.dayNum(now), shield: 1 }; st.gift.key = S.giftWindow(now).key; st.quests.day = S.dayKey(now);
  st.stats.collected = 88;
  const tide = st.pools.tide;
  for (let i = 0; i < 4; i++) { const r = S.expandPool(st, 'tide'); if (!r.ok) break; }
  st.iap.deep = true; if (!st.pools.deep) S.applyProduct(st, D.IAP.deep, 'shot', now, { restore: true });
  tide.creatures.length = 0; tide.eggs.length = 0; for (const t of tide.tiles) { t.w = 0; t.p = null; t.d = null; }
  const pool = tide;
  for (const [x, y] of [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4], [3, 5]]) put('dig', x, y);
  for (const [x, y] of [[3, 3], [3, 4]]) put('dig', x, y);
  for (const [t, x, y] of [['piece:granite', 1, 2], ['piece:granite', 1, 3], ['piece:granite', 5, 3], ['piece:mossy', 5, 2], ['piece:mossy', 1, 4], ['piece:kelp', 2, 2], ['piece:kelp', 4, 4], ['piece:ember', 6, 5], ['piece:pearlite', 0, 5], ['piece:kelp', 1, 6], ['piece:granite', 6, 2]]) put(t, x, y);
  for (const [t, x, y] of [['decor:umbrella', 0, 1], ['decor:lantern', 6, 1], ['decor:duck', 4, 3], ['decor:lilypad', 2, 3], ['decor:lighthouse', 5, 6], ['decor:treasure', 2, 6], ['decor:sandcastle', 0, 3], ['decor:surfboard', 6, 4], ['decor:sign', 4, 0]]) put(t, x, y);
  const list = [['horse.m.glow', 4, 2, 'crownhat', .9], ['jelly.b.glow', 3, 3, null, .55], ['octo.b.stone', 3, 4, null, .0], ['star.b.warmth', 2, 4, 'shades', .8], ['crab.b.stone', 1, 5, 'partyhat', .65], ['snail.b.green', 4, 6, null, .3], ['crab.0', 5, 4, 'flowerhat', .2]];
  const made = {};
  for (const [f, x, y, hat, fill] of list) made[f] = mk('tide', f, x, y, { hat, fill, lvl: f === 'crab.0' ? 4 : 7 });
  S.spawnEgg(st, pool, now - 1e6, { fam: 'crab' });
  const egg = pool.eggs[0]; if (egg) { egg.ready = now - 1000; }
  // Tidedex progress
  const known = D.FORM_IDS.filter((f) => D.FORMS[f].fam !== 'octo' || D.FORMS[f].stage < 3);
  let n = 0; for (const f of known) { if (D.FORMS[f].biome === 'deep' || D.FAMILIES[D.FORMS[f].fam].biome === 'deep') continue; if (D.FORMS[f].stage === 3 && n % 3) { n++; continue; } st.dex[f] = now - n * 1000; n++; }
  st.dex['crab.b.warmth'] = undefined; delete st.dex['crab.b.warmth'];
  tide.ver++;
  return { horse: made['horse.m.glow'].id, crab: made['crab.0'].id, jelly: made['jelly.b.glow'].id };
};

async function capture(dev, outDir) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr, isMobile: dev.w < 700, hasTouch: true, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  await ctx.addInitScript(() => { const fixed = new Date('2026-06-10T11:20:00-07:00').getTime(); const real = Date.now; const t0 = real(); Date.now = () => fixed + (real() - t0); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('CONSOLE', m.text()));
  await page.goto(`http://localhost:${port}/?debug`);
  await page.waitForSelector('#boot.gone', { state: 'attached' });
  await page.waitForTimeout(400);
  const ids = await page.evaluate(SETUP, { scene: 'all' });
  const shot = async (slug, wait = 1200) => { await page.waitForTimeout(wait); await page.screenshot({ path: path.join(outDir, `${slug}.png`) }); };
  const go = (fn, arg) => page.evaluate(fn, arg);
  await go(() => { const { G } = window.__tt; G.ui.closeAllModals(); G.ui.closeSheet(); G.setTab('pool'); G.ui.refresh(); G.ui.layoutChanged(); });
  await go(() => { window.__tt.G.state.pools.tide.ver++; });
  await page.evaluate(() => { const { G } = window.__tt; for (const c of G.state.pools.tide.creatures) c.stored = c.stored; });
  await shot('build', 1800);                                  // 1 pool
  await go((id) => { const { G } = window.__tt; G.ui.openSheet(id); }, ids.crab);
  await shot('evolve', 1200);                                 // 2 inspector
  await go(() => { const { G } = window.__tt; G.ui.closeSheet(); G.reveals.push({ type: 'evolved', biome: 'tide', id: 1, form: 'horse.m.glow', first: true, at: Date.now() }); G.ui.pumpReveals(); });
  await shot('discover', 1500);                               // 3 reveal
  await go(() => { const { G } = window.__tt; G.ui.closeAllModals(); G.ui.showWelcome({ away: 5.3 * 3600e3, pearls: 1840, eggs: 2, evolved: [{ form: 'jelly.b.glow' }], levelups: [] }); });
  await shot('idle', 900);                                    // 4 welcome back
  await go(() => { const { G } = window.__tt; G.ui.closeAllModals(); G.ui.openDex(); });
  await shot('tidedex', 900);                                 // 5 dex
  await go(() => { const { G, S, D } = window.__tt; G.ui.closeAllModals(); const st = G.state, now = G.now(), p = st.pools.deep; p.creatures.length = 0; p.eggs.length = 0; for (const t of p.tiles) { t.w = 0; t.p = null; } st.cur.pearls = 1e6;
    const put = (t, x, y) => S.applyTool(st, 'deep', t, x, y);
    for (const [x, y] of [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4], [3, 5]]) { put('dig', x, y); put('dig', x, y); }
    for (const [x, y] of [[3, 3], [3, 4]]) put('dig', x, y);
    for (const [t, x, y] of [['piece:glowstone', 1, 2], ['piece:glowstone', 5, 3], ['piece:vent', 5, 5], ['piece:biokelp', 1, 4], ['piece:basalt', 5, 2], ['piece:biokelp', 5, 4], ['piece:vent', 1, 6], ['piece:glowstone', 4, 1], ['piece:basalt', 1, 3]]) put(t, x, y);
    const mk = (f, x, y, fill, hat) => { const c = { id: st.nid++, form: f, x, y, lvl: Math.min(6, D.STAGE[D.FORMS[f].stage].maxLvl), stored: 0, born: now, hat: hat || null, evo: null }; p.creatures.push(c); c.stored = S.bubbleCap(st, p, c, now) * fill; };
    mk('angler.b.glow', 2, 2, .9); mk('naut.m.glow', 3, 3, .5, 'crownhat'); mk('manta.b.glow', 4, 3, .4); mk('drake.b.glow', 3, 4, .8); mk('angler.0', 4, 2, .3); mk('naut.b.stone', 2, 4, .6);
    p.ver++; G.switchBiome('deep'); G.setTab('pool'); G.ui.layoutChanged(); });
  await shot('deep', 2000);                                   // 6 deep
  await go(() => { const { G } = window.__tt; G.switchBiome('tide'); const st = G.state; st.equip.skin = 'neon'; st.equip.fx = 'stars'; G.scene._baseKey = ''; G.ui.refresh(); G.ui.layoutChanged(); });
  await shot('decor', 2200);                                  // 7 decor / neon
  // ---- Capsule Machine: a forced Legendary reveal and a well-filled Toybox
  await go(() => {
    const { G, S, D } = window.__tt; const st = G.state;
    G.ui.closeAllModals(); G.switchBiome('tide'); G.setTab('pool');
    st.equip.skin = 'candy'; st.equip.fx = 'hearts'; G.scene._baseKey = '';
    st.cur.coins = 20; st.gacha.pityL = 59; st.gacha.pityR = 3;
    D.COLLECTIBLE_IDS.forEach((id, i) => { if (i % 3 !== 0 || D.POOL_BY_ID[id].tier === 'common') { st.gacha.owned[id] = 1 + (i % 5 === 0 ? 1 : 0); st.own[id] = true; } });
    for (const f of D.TOY_SETS.slice(0, 2)) for (const id of f.items) { st.gacha.owned[id] = 1; st.own[id] = true; }
    st.gacha.owned[D.goldFigId('star')] = 1; st.gacha.owned[D.goldFigId('jelly')] = 1; st.gacha.shards = 42;
    delete st.gacha.owned[D.goldFigId('octo')]; delete st.gacha.owned.figg_crab;
    G.ui.refresh(); G.ui.openGacha();
  });
  await page.waitForSelector('#gz-cv');
  await page.waitForTimeout(700);
  await page.click('[data-gz="pull:1:coin"]', { force: true });
  await page.waitForSelector('[data-gz="open:0"]', { timeout: 9000 });
  await page.waitForTimeout(400);
  await page.click('[data-gz="open:0"]', { force: true });
  await page.waitForSelector('#gz-cap:not([hidden])');
  await shot('capsules', 1500);
  await page.click('[data-gz="next"]', { force: true });
  await page.waitForTimeout(300);
  await page.click('[data-gz="tab:toys"]', { force: true });
  await shot('toybox', 900);
  await go(() => { window.__tt.G.ui.closeAllModals(); });
  await browser.close();
}

async function frame(dev, rawDir, outDir) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: dev.out[0], height: dev.out[1] }, deviceScaleFactor: 1 });
  const font = fs.readFileSync(path.join(root, 'node_modules/@fontsource/fredoka/files/fredoka-latin-700-normal.woff2')).toString('base64');
  await page.setContent(`<!doctype html><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${font});font-weight:700}body{margin:0}</style><canvas id=c width=${dev.out[0]} height=${dev.out[1]}></canvas>`);
  await page.evaluate(() => document.fonts.load('700 100px F'));
  for (const s of SHOTS) {
    const raw = 'data:image/png;base64,' + fs.readFileSync(path.join(rawDir, `${s.slug}.png`)).toString('base64');
    const url = await page.evaluate(async ({ raw, s, W, H }) => {
      const cv = document.getElementById('c'), c = cv.getContext('2d'), T = Math.PI * 2;
      const img = new Image(); img.src = raw; await img.decode();
      const g = c.createLinearGradient(0, 0, W * 0.3, H); g.addColorStop(0, s.bg[0]); g.addColorStop(1, s.bg[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H * 0.62); c.fillStyle = 'rgba(255,255,255,.10)'; for (let i = 0; i < 18; i++) { c.rotate(T / 18); c.beginPath(); c.moveTo(-W * 0.03, 0); c.lineTo(0, -H); c.lineTo(W * 0.03, 0); c.fill(); } c.restore();
      const r = (n) => { let a = n; return () => (a = (a * 9301 + 49297) % 233280) / 233280; }; const rnd = r(7);
      for (let i = 0; i < 16; i++) { const x = rnd() * W, y = rnd() * H * 0.3, rad = W * (0.008 + rnd() * 0.022); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = W * 0.004; c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x, y, rad, 0, T); c.fill(); c.stroke(); }
      // caption (max 2 lines)
      const fs0 = W * 0.083; c.font = `700 ${fs0}px F`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const words = s.caption.split(' '), lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > W * 0.86 && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
      const top = H * 0.045 + fs0;
      lines.forEach((ln, i) => { const y = top + i * fs0 * 1.08; c.lineJoin = 'round'; c.lineWidth = fs0 * 0.24; c.strokeStyle = '#3b1d5e'; c.strokeText(ln, W / 2, y); c.fillStyle = '#fff'; c.fillText(ln, W / 2, y); });
      // device screenshot with rounded corners, border, shadow
      const sy = H * 0.045 + fs0 * (1.08 * lines.length + 0.5) + H * 0.02, aspect = img.height / img.width;
      const sw = Math.min(W * 0.86, (H - sy - H * 0.03) / aspect), sh = sw * aspect, sx = (W - sw) / 2;
      const rad = sw * 0.075;
      const rr = (x, y, w, h, r0) => { c.beginPath(); c.moveTo(x + r0, y); c.arcTo(x + w, y, x + w, y + h, r0); c.arcTo(x + w, y + h, x, y + h, r0); c.arcTo(x, y + h, x, y, r0); c.arcTo(x, y, x + w, y, r0); c.closePath(); };
      c.save(); c.shadowColor = 'rgba(30,10,80,.45)'; c.shadowBlur = W * 0.05; c.shadowOffsetY = W * 0.02; rr(sx, sy, sw, sh, rad); c.fillStyle = '#3b1d5e'; c.fill(); c.restore();
      c.save(); rr(sx, sy, sw, sh, rad); c.clip(); c.drawImage(img, sx, sy, sw, sh); c.restore();
      rr(sx, sy, sw, sh, rad); c.lineWidth = W * 0.012; c.strokeStyle = '#3b1d5e'; c.stroke();
      return cv.toDataURL('image/png');
    }, { raw, s, W: dev.out[0], H: dev.out[1] });
    const opt = await sharp(Buffer.from(url.split(',')[1], 'base64')).removeAlpha().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();   // opaque + losslessly optimised
    fs.writeFileSync(path.join(outDir, `${String(SHOTS.indexOf(s) + 1).padStart(2, '0')}-${s.slug}.png`), opt);
  }
  await browser.close();
}

for (const dev of DEVICES) {
  const raw = `/tmp/tt/shots-raw/${dev.id}`, out = path.join(root, 'store/screenshots', dev.id);
  fs.mkdirSync(raw, { recursive: true }); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  await capture(dev, raw);
  await frame(dev, raw, out);
  console.log(dev.id, '→', fs.readdirSync(out).length, 'screenshots');
}
server.close();
execSync('node tools/build.mjs', { cwd: root, stdio: 'inherit' });   // restore the release bundle
