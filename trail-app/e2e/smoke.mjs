// Browser smoke test: two hikers, one trail. Needs Playwright + a Chromium (not a dependency of the app):
//   npm i -g playwright   (or: npx playwright install chromium)   then   npm run e2e
// Uses the simulated-GPS mode, so it needs no real location or glasses.
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(join(root, 'x.js'))('playwright');
  }
}

const { chromium } = await loadPlaywright();
const tmp = await mkdtemp(join(tmpdir(), 'waypath-e2e-'));
const { server } = await createApp({ dataDir: join(tmp, 'trails') });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();

const newHiker = async () => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    permissions: ['geolocation'], geolocation: { latitude: 39.9784, longitude: -105.2895 },
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => m.type() === 'error' && page.errors.push(m.text())); // includes CSP violations
  page.on('pageerror', (e) => page.errors.push(e.message));
  return { ctx, page };
};
const step = (msg) => console.log(`  ✓ ${msg}`);

try {
  console.log('Hiker A records and publishes');
  const A = await newHiker();
  let p = A.page;
  await p.goto(base);
  await p.locator('label.toggle:has-text("Simulate GPS") input').check();
  await p.click('a.btn:has-text("Record a trail")');
  await p.waitForSelector('.banner:has-text("Recording")');
  await p.waitForTimeout(3000);
  await p.click('button:has-text("Water")');
  await p.waitForTimeout(7000);
  await p.click('button:has-text("Finish & save")');
  await p.fill('dialog input[type=text] >> nth=0', 'E2E Loop');
  await p.click('dialog button:has-text("Save trail")');
  await p.waitForSelector('h1:has-text("E2E Loop")');
  assert.equal(await p.locator('.wp').count(), 1);
  step('recorded a trail with a waypoint from simulated GPS');
  await p.click('button:has-text("Publish for other hikers")');
  await p.click('dialog button:has-text("Publish")');
  await p.waitForSelector('button:has-text("Copy share link")');
  step('published it');
  assert.deepEqual(A.page.errors, []);
  await A.ctx.close();

  console.log('Hiker B finds and follows it');
  const B = await newHiker();
  p = B.page;
  await p.goto(base);
  await p.click('.trail-item:has-text("E2E Loop")');
  await p.click('button:has-text("Save offline")');
  await p.waitForSelector('.badge:has-text("Saved offline")');
  assert.equal(await p.locator('button:has-text("Publish")').count(), 0, "must not offer to publish someone else's trail");
  step('found it in Shared trails and saved it offline');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.waitForTimeout(1500);
  await B.ctx.setOffline(true);
  await p.reload();
  await p.waitForSelector('h1:has-text("E2E Loop")');
  step('reloaded with the network off: app shell + trail come from cache');

  await p.click('a.btn:has-text("Follow in reverse")');
  await p.locator('label.toggle:has-text("Simulate GPS") input').check();
  await p.click('button:has-text("Start guidance")');
  await p.waitForFunction(() => document.querySelector('.hud-svg')?.dataset.status === 'on-trail', null, { timeout: 10000 });
  step('guidance is on-trail, arrow rendered');
  await p.click('button:has-text("Wander off")');
  await p.waitForSelector('.banner:has-text("off the trail")', { timeout: 10000 });
  assert.equal(await p.locator('.hud-svg').getAttribute('data-status'), 'off-trail');
  step('off-trail detected and shown');
  await p.click('button:has-text("Return to trail")');
  await p.waitForFunction(() => document.querySelector('.hud-svg')?.dataset.status === 'on-trail', null, { timeout: 10000 });
  step('recovered to on-trail');
  assert.deepEqual(B.page.errors, []);
  await B.ctx.close();
  console.log('\nE2E passed');
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
  await rm(tmp, { recursive: true, force: true });
}
