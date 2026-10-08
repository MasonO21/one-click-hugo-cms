// Every screen and dialog of the game on a range of phones and tablets, reached with real taps (Playwright refuses
// to tap a button that is covered or off screen). Each stop is screenshotted and its layout audited: buttons cut off
// by the screen edge or hidden under the notch / home bar, tap targets under 40 px, buttons overlapping each other
// and clipped text. Notches and home bars are simulated through the game's safe-area variables.
// node tools/visual-screens.mjs [--devices se,max,ipad,...] [--out dir]      (needs the dev server on :8123)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const DEVICES = {
  se: { width: 375, height: 667, dpr: 2, sat: 20, sab: 0 },           // iPhone SE
  mini: { width: 320, height: 568, dpr: 2, sat: 20, sab: 0 },         // smallest supported (iPhone SE 1st gen size)
  i15: { width: 393, height: 852, dpr: 3, sat: 59, sab: 34 },         // iPhone 15/16
  max: { width: 440, height: 956, dpr: 3, sat: 62, sab: 34 },         // iPhone 17 Pro Max
  a360: { width: 360, height: 640, dpr: 3, sat: 24, sab: 0 },         // small Android
  a412: { width: 412, height: 915, dpr: 2.6, sat: 32, sab: 24 },      // tall Android
  ipad: { width: 1032, height: 1376, dpr: 2, sat: 24, sab: 20 },      // iPad Pro 13"
  ipadland: { width: 1376, height: 1032, dpr: 2, sat: 24, sab: 20 },  // … landscape
  ipadsplit: { width: 320, height: 1032, dpr: 2, sat: 24, sab: 20 },  // iPad Split View, narrow
};
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const devs = opt('--devices', Object.keys(DEVICES).join(',')).split(',');
const outRoot = path.resolve(opt('--out', '/tmp/sizzle-screens'));

// in-page layout audit of what is on screen now
const AUDIT = ({ sat, sab }) => {
  const W = innerWidth, H = innerHeight, issues = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return null; for (let p = el; p; p = p.parentElement) if (p.hidden || getComputedStyle(p).display === 'none') return null; return r; };
  const scroller = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && (p.scrollHeight > p.clientHeight + 2 || p.scrollWidth > p.clientWidth + 2)) return p; } return null; };
  const label = (el) => (el.getAttribute('aria-label') || el.dataset.act || el.textContent || el.className).trim().replace(/\s+/g, ' ').slice(0, 40);
  const top = (el, r) => { const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(H - 1, Math.max(0, r.top + r.height / 2)); const t = document.elementFromPoint(x, y); return !t || el === t || el.contains(t) || t.contains(el); };
  // only the top layer can be tapped: the open dialog if there is one, else the screen (and the HUD in a level)
  const layers = [...document.querySelectorAll('.modal, #scr-confirm, .adlayer')].filter(el => !el.hidden && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 50);
  const layer = layers.sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0))[0] || document.body;
  const hits = [...layer.querySelectorAll('button, [data-act], .world-card, .lvl, .shop-card, .skin-card, label.toggle, .hd-pack')].filter(el => !el.closest('#hud') || !document.getElementById('hud').hidden);
  const shown = [];
  for (const el of hits) {
    const r = vis(el);
    if (!r) continue;
    const sc = scroller(el);
    if (sc) { const s = sc.getBoundingClientRect(); if (r.bottom < s.top || r.top > s.bottom || r.right < s.left || r.left > s.right) continue; } // scrolled out of view: fine
    shown.push([el, r]);
    if (!sc && (r.left < -1 || r.right > W + 1 || r.top < -1 || r.bottom > H + 1)) issues.push(`cut off by the screen edge: "${label(el)}" (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`);
    else if (!sc && (r.top < sat - 2 || r.bottom > H - sab + 2) && !el.closest('.world-card')) issues.push(`under the notch / home bar: "${label(el)}" (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)})`);
    if ((r.width < 40 || r.height < 36) && !el.matches('label.toggle')) issues.push(`small tap target: "${label(el)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
    if (!sc && !top(el, r)) issues.push(`covered by another element: "${label(el)}"`);
  }
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    const [a, ra] = shown[i], [b, rb] = shown[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (ix > 2 && iy > 2 && ix * iy > 0.15 * Math.min(ra.width * ra.height, rb.width * rb.height)) issues.push(`overlapping: "${label(a)}" and "${label(b)}"`);
  }
  for (const el of document.querySelectorAll('button span, h2, h3, .wc-name, .ribbon, #hud-name, .hp-name, .sc-name, .toast, .tip')) {
    const r = vis(el); if (!r) continue;
    if (el.scrollWidth > el.clientWidth && getComputedStyle(el).overflow !== 'visible') issues.push(`text cut off: "${label(el)}"`);
    if (!scroller(el) && (r.right > W + 1 || r.left < -1)) issues.push(`text off screen: "${label(el)}"`);
  }
  return [...new Set(issues)];
};

async function tour(browser, name, dev) {
  const out = path.join(outRoot, name);
  fs.mkdirSync(out, { recursive: true });
  const page = await browser.newPage({ viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: dev.dpr, hasTouch: true, isMobile: dev.width < 900 });
  const errors = [], report = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await page.goto('http://localhost:8123/?nosw');
  const stars = {}; for (let i = 0; i < 46; i++) stars[i] = 1 + (i * 7) % 3;
  await page.evaluate((stars) => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 47, stars, hotdogs: 350, owned: { banana: { at: 1, source: 'test' }, dragon: { at: 1, source: 'test' } }, character: 'sausage' })), stars);
  await page.reload();
  await page.waitForFunction(() => window.__app && window.__app.ui, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: `:root { --sat: ${dev.sat}px !important; --sab: ${dev.sab}px !important; } #install-hint { display: none !important; }` });
  await page.clock.runFor(2500);
  let n = 0;
  const shot = async (tag, settle = 700) => {
    await page.clock.runFor(settle);
    const file = `${String(++n).padStart(2, '0')}-${tag}.png`;
    await page.screenshot({ path: path.join(out, file) });
    const issues = await page.evaluate(AUDIT, { sat: dev.sat, sab: dev.sab });
    report.push({ stop: tag, file, issues });
  };
  // a finger tap at the middle of the element, as long as it is on screen and nothing covers it there
  // (buttons that pulse never count as "stable" for Playwright's own tap, so the check is done here)
  const tap = async (sel, what) => {
    const at = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { why: 'not found' };
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return { why: 'not visible' };
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { why: `off screen at ${Math.round(x)},${Math.round(y)}` };
      const t = document.elementFromPoint(x, y);
      if (!t || !(t === el || el.contains(t))) return { why: `covered by ${t ? (t.id || t.className || t.tagName) : 'nothing'}` };
      return { x, y };
    }, sel);
    if (at.why) { report.push({ stop: 'tap', file: '', issues: [`could not tap ${what || sel}: ${at.why}`] }); return false; }
    await page.touchscreen.tap(at.x, at.y);
    await page.clock.runFor(150);
    return true;
  };
  const ui = (fn, arg) => page.evaluate(fn, arg);

  await shot('title');
  await tap('#scr-title [data-act="play"]', 'PLAY');
  await shot('worlds', 1200);
  await ui(() => { const l = document.getElementById('world-list'); l.scrollLeft = l.scrollWidth; });
  await shot('worlds-last');
  await ui(() => { const l = document.getElementById('world-list'); l.scrollLeft = 0; });
  await page.clock.runFor(300);
  await tap('.world-card[data-w="0"]', 'world 1 card');
  await shot('levels-world1');
  await tap('#scr-levels [data-act="back"]', 'back');
  await ui(() => { const l = document.getElementById('world-list'), c = l.children[2]; l.scrollLeft = c.offsetLeft - (l.clientWidth - c.clientWidth) / 2; });
  await page.clock.runFor(400);
  await tap('.world-card[data-w="2"]', 'world 3 card');
  await shot('levels-world3');
  await tap('#level-grid .lvl.current', 'the current level');
  await page.evaluate(() => window.__app.game.pointerDown(0, 0));
  await shot('level-start', 1500);
  await tap('#hud [data-act="pause"]', 'pause');
  await shot('pause');
  await tap('#scr-pause [data-act="resume"]', 'resume');
  // stuck on a level: hint and skip appear
  await ui(() => { const g = window.__app.game; g.fails = 9; g.flips = g.info.par + 6; window.__app.ui.updateHud(g); });
  await shot('hint-and-skip', 400);
  await tap('#hud-hint', 'hint');
  await shot('hint-route', 2200);
  await tap('#hud [data-act="overview"]', 'look around');
  await shot('overview', 1500);
  await tap('#hud [data-act="overview"]', 'look around (off)');
  // win: play the level's route
  await ui(() => {
    const app = window.__app; app.restartLevel(); const game = app.game, sol = game.level.solution, PH = window.__PHYS_DT;
    let shot = 0, wait = -1, t0 = 0;
    const s = game.sim, step = s.step.bind(s);
    s.step = () => { step(); if (game.phase !== 'play' || shot >= sol.length) return;
      if (wait < 0) { if (!(shot === 0 ? s.canLaunch() : s.t - t0 > 0.15 && s.canLaunch())) return; wait = Math.round((sol[shot][2] || 0) * 60); } else wait--;
      if (wait <= 0) { const [a, p] = sol[shot]; const len = 14 + p * (app.maxDrag() - 14); game.pointerDown(200, 400); game.pointerMove(200 - Math.cos(a) * len, 400 - Math.sin(a) * len); game.pointerUp(); t0 = s.t; shot++; wait = -1; } };
  });
  for (let k = 0; k < 400 && await page.evaluate(() => document.getElementById('scr-win').hidden); k++) await page.clock.runFor(100);
  await shot('win', 2500);
  await tap('#scr-win [data-act="levels"]', 'levels (from the win card)');
  await page.clock.runFor(800);
  await tap('#scr-levels [data-act="back"]', 'back');
  await tap('#scr-worlds [data-act="back"]', 'back');
  // world complete: win the last level of world 2 with an instant route
  // (the first time the last level of a world is beaten; the win itself is forced, with par flips)
  await ui(() => { const a = window.__app; a.save.unlocked = 60; a.startLevel(59); const g = a.game; g.pointerDown(0, 0); g.flips = g.info.par; g.sim.status = 'win'; g.onWinEvent(320, 400); });
  for (let k = 0; k < 60 && await page.evaluate(() => document.getElementById('scr-win').hidden); k++) await page.clock.runFor(100);
  await shot('win-world-end', 2500);
  await tap('#scr-win [data-act="next"]', 'NEXT');
  for (let k = 0; k < 60 && await page.evaluate(() => document.getElementById('scr-worlddone').hidden && document.getElementById('scr-worlddone')); k++) await page.clock.runFor(100);
  await shot('world-complete', 1500);
  await tap('#scr-worlddone [data-act="wd-continue"]', 'CONTINUE');
  await page.clock.runFor(1500);
  await ui(() => { const a = window.__app; if (a.ads.showing) return; document.getElementById('scr-win').hidden = true; a.toMenu('scr-title'); });
  await page.clock.runFor(800);
  // locker, shop, packs
  await tap('#scr-title [data-act="skins"]', 'SKINS');
  await shot('locker');
  await ui(() => { const s = document.querySelector('#scr-skins .locker-scroll'); s.scrollTop = s.scrollHeight; });
  await shot('locker-trophies', 300);
  await tap('#scr-skins [data-act="shop"]', 'shop banner');
  await shot('shop-food');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#shop-tabs [data-tab]')].map(b => b.dataset.tab));
  for (const t of tabs.slice(1)) {
    await page.locator(`#shop-tabs [data-tab="${t}"]`).scrollIntoViewIfNeeded().catch(() => {});
    if (!(await tap(`#shop-tabs [data-tab="${t}"]`, `shop tab ${t}`))) continue;
    if (['critters', 'bundles', 'owned'].includes(t)) await shot('shop-' + t);
    else { await page.clock.runFor(400); report.push({ stop: 'shop-' + t, file: '', issues: await page.evaluate(AUDIT, { sat: dev.sat, sab: dev.sab }) }); }
  }
  await tap('#shop-tabs [data-tab="food"]', 'shop tab food');
  await tap('#shop-grid .shop-card:not(.owned):not(.on) .shop-btn', 'a character\'s 🌭100 button');
  await shot('buy-confirm', 400);
  await tap('#scr-confirm [data-act="confirm-no"]', 'cancel');
  await tap('#shop-wallet', 'Hot Dogs wallet');
  await shot('hotdogs');
  await tap('#scr-hotdogs [data-act="hotdogs-close"]', 'close');
  await tap('#scr-shop [data-act="back"]', 'back');
  await tap('#scr-skins [data-act="back"]', 'back');
  // options, privacy, reset
  await tap('#scr-title [data-act="settings"]', 'OPTIONS');
  await shot('options');
  await tap('#scr-settings [data-act="privacy"]', 'privacy policy');
  await shot('privacy');
  await tap('#scr-privacy [data-act="privacy-close"]', 'close');
  await page.locator('#scr-settings [data-act="reset"]').scrollIntoViewIfNeeded().catch(() => {});
  await tap('#scr-settings [data-act="reset"]', 'reset progress');
  await shot('reset-confirm', 400);
  await tap('#scr-confirm [data-act="confirm-no"]', 'cancel');
  if (await page.locator('#ad-test').isVisible()) {
    await page.locator('#ad-test [data-kind="interstitial"]').scrollIntoViewIfNeeded().catch(() => {});
    await tap('#ad-test [data-kind="interstitial"]', 'test forced ad');
    await shot('test-ad', 600);
    await page.clock.runFor(8000);
    await page.keyboard.press('Escape').catch(() => {});
  }
  // a phone turned sideways
  if (dev.width < 600) {
    await page.setViewportSize({ width: dev.height, height: dev.width });
    await page.clock.runFor(600);
    await shot('landscape', 400);
    await page.setViewportSize({ width: dev.width, height: dev.height });
  }
  await page.close();
  return { report, errors };
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let total = 0;
const summary = {};
for (const d of devs) {
  const r = await tour(browser, d, DEVICES[d]);
  summary[d] = r;
  const issues = r.report.flatMap(s => s.issues.map(i => `${s.stop}: ${i}`));
  total += issues.length + r.errors.length;
  console.log(`\n== ${d} (${DEVICES[d].width}×${DEVICES[d].height}): ${r.report.filter(s => s.file).length} screens, ${issues.length} layout issue(s), ${r.errors.length} page error(s)`);
  for (const i of issues) console.log('  • ' + i);
  for (const e of [...new Set(r.errors)]) console.log('  ✗ ' + e);
}
fs.writeFileSync(path.join(outRoot, 'report.json'), JSON.stringify(summary, null, 1));
await browser.close();
process.exit(total ? 1 : 0);
