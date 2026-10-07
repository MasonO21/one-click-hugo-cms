// QA harness helpers for first-session playtests (Playwright + swiftshader).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const URL = process.env.NC_URL || 'http://localhost:5411/';
export const SP = process.env.SP || '/tmp/claude-0/-home-user/7f6578c8-95bd-55eb-b617-072e72dc93ff/scratchpad';
export const OUT = process.env.NC_OUT || SP + '/out';
fs.mkdirSync(OUT, { recursive: true });

export const VIEWPORTS = {
  phone: { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  portrait: { width: 390, height: 844, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  desktop: { width: 1280, height: 720, hasTouch: false, isMobile: false, deviceScaleFactor: 1 },
};

export async function launch(vp = 'phone', { storage } = {}) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'],
  });
  const v = VIEWPORTS[vp];
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: v.hasTouch, isMobile: v.isMobile, deviceScaleFactor: v.deviceScaleFactor, storageState: storage });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; if (!t.includes('GPU stall') && !t.includes('[vite]')) logs.push(t); if (m.type() === 'error' || m.type() === 'warning') console.log('  console:', t.slice(0, 300)); });
  page.on('pageerror', (e) => { logs.push(`[pageerror] ${e.message}`); console.log('  PAGEERROR:', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')); });
  return { browser, context, page, logs };
}

let shotN = 0;
export async function shot(page, name) {
  const p = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: p });
  console.log('  shot:', p);
  return p;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitReady(page) {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game && !!window.game.state, null, { timeout: 30000 });
  await page.evaluate(() => { window.__loadPlay = window.game.state.playTime; });
  await page.waitForTimeout(1500);
}

export async function tap(page, sel, opts = {}) {
  const el = page.locator(sel).first();
  await el.waitFor({ state: 'visible', timeout: opts.timeout ?? 5000 });
  const box = await el.boundingBox();
  if (!box) throw new Error('no box for ' + sel);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const hasTouch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  if (hasTouch && !opts.click) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await page.waitForTimeout(opts.after ?? 250);
}

export async function tapXY(page, x, y, after = 250) {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(after);
}

export async function info(page) {
  return page.evaluate(() => {
    const g = window.game, s = g.state;
    const p = s.player;
    return {
      t: Math.round(s.playTime), res: Object.fromEntries(Object.entries(s.resources || {}).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.floor(v)])),
      player: p ? { x: +p.x.toFixed(1), z: +p.z.toFixed(1) } : null,
      missions: s.missions?.active?.map?.((m) => `${m.id}:${m.progress}`) ?? s.missions,
    };
  });
}

/** Steer the player toward a world point using the input vector (respecting camera yaw). */
export async function walkTo(page, x, z, { tol = 1.5, maxMs = 30000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const r = await page.evaluate(([tx, tz, tol]) => {
      const g = window.game; const p = g.state.player; const yaw = g.view.camera.yaw;
      const dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz);
      if (d < tol) { g.input.moveX = 0; g.input.moveY = 0; return d; }
      const wx = dx / d, wz = dz / d;
      // invert: dx = mx cos - my sin ; dz = -mx sin - my cos
      const mx = wx * Math.cos(yaw) - wz * Math.sin(yaw);
      const my = -wx * Math.sin(yaw) - wz * Math.cos(yaw);
      const k = d < 3 ? 0.6 : 1;
      g.input.moveX = mx * k; g.input.moveY = my * k; return d;
    }, [x, z, tol]);
    if (r < tol) return true;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => { window.game.input.moveX = 0; window.game.input.moveY = 0; });
  return false;
}

export async function snapshot(page, context, file) {
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await page.waitForTimeout(800);
  await context.storageState({ path: file });
}

/** Run the sim k times per rendered frame (swiftshader renders ~3-6 fps). */
export async function timeScale(page, k) {
  await page.evaluate((k) => {
    const g = window.game;
    if (!g.__origUpdate) g.__origUpdate = g.update.bind(g);
    g.update = (dt) => { for (let i = 0; i < k; i++) g.__origUpdate(dt); };
  }, k);
}

/** Advance game time by `sec` seconds instantly (sim only) — models "waiting / reading" time. */
export async function advance(page, sec, step = 0.1) {
  await page.evaluate(([sec, step]) => { const g = window.game; const u = g.__origUpdate || g.update.bind(g); for (let t = 0; t < sec; t += step) u(step); }, [sec, step]);
}

export async function gameTime(page) { return page.evaluate(() => window.game.state.playTime); }
export async function mission(page) { return page.evaluate(() => { const m = window.game.sys.missions.current(); return m ? { id: m.id, p: window.game.sys.missions.progress(m.id) } : null; }); }
export async function guide(page) { return page.evaluate(() => window.game.sys.tutorial.guide()); }
export async function res(page) { return page.evaluate(() => Object.fromEntries(Object.entries(window.game.state.resources.amounts).filter(([, v]) => v > 0).map(([k, v]) => [k, Math.floor(v)]))); }
export async function w2s(page, x, z, y = 0) { return page.evaluate(([x, y, z]) => window.renderer.worldToScreen(x, y, z), [x, y, z]); }

export async function dismissWelcome(page, { claimDaily = false } = {}) {
  const el = page.locator('#btn-offline-collect');
  if (await el.count() && await el.first().isVisible()) { await tap(page, '#btn-offline-collect', { after: 1200 }); }
  // the daily popup opens ~3 s after a (non-fresh) launch
  if (await page.evaluate(() => window.game.fresh)) return;
  const t0 = await page.evaluate(() => window.__loadPlay ?? 0);
  await page.waitForFunction((t0) => window.game.state.playTime > t0 + 4.5 || !!document.querySelector('[data-panel="daily"]'), t0, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  if (await page.locator('[data-panel="daily"]').count()) {
    if (claimDaily) await page.evaluate(() => [...document.querySelectorAll('[data-panel="daily"] button')].find((b) => /claim/i.test(b.innerText))?.setAttribute('data-qa', 'dclaim'));
    await tap(page, claimDaily ? '[data-qa="dclaim"]' : '[data-panel="daily"] .pm-close', { after: 900 });
    if (await page.locator('[data-panel="daily"]').count()) await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

/** Names of open panels (data-panel on the card). */
export async function openPanels(page) {
  return page.evaluate(() => [...document.querySelectorAll('.pm-frame:not(.closing) .pm-card')].map((c) => c.getAttribute('data-panel')));
}

/** Dismiss open modals the way a player would: tap their main (green) button. Returns names closed. */
export async function closeModals(page, max = 4) {
  const closed = [];
  for (let i = 0; i < max; i++) {
    const name = await page.evaluate(() => {
      const card = document.querySelector('.nv-modals .pm-frame .pm-card');
      if (!card) return null;
      const btn = [...card.querySelectorAll('button')].find((b) => b.classList.contains('good') && b.offsetParent) || [...card.querySelectorAll('.m-actions button')].pop() || card.querySelector('.pm-close');
      if (btn) btn.setAttribute('data-qa', 'mclose');
      return card.getAttribute('data-panel') + (btn ? '' : ':nobtn');
    });
    if (!name) break;
    closed.push(name);
    if (name.endsWith(':nobtn')) { await page.keyboard.press('Escape'); await page.waitForTimeout(700); continue; }
    await tap(page, '[data-qa="mclose"]', { after: 900 });
    await page.evaluate(() => document.querySelector('[data-qa="mclose"]')?.removeAttribute('data-qa'));
  }
  return closed;
}
