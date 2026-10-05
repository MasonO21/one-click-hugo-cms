#!/usr/bin/env node
// Checks the platform layer in a real browser:
//  1. file:// build: no errors, purchases and ads are still the test stand-ins.
//  2. http build: manifest and icons load, the service worker installs, and the game reloads offline.
import { launchChromium } from './lib/pw.mjs';
import { serve } from './serve.mjs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? ' — ' + detail : ''}`); if (!ok) failed++; };

const browser = await launchChromium();
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(join(web, 'index.html')).href);
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({ native: SF.platform.native, os: SF.platform.os, iap: typeof SF.iap.buy, ads: typeof SF.ads.showRewarded, haptics: typeof SF.haptics.tap, restore: typeof SF.iap.restore }));
  check('web build is not treated as native', info.native === false && info.os === 'web');
  check('purchases and ads keep the test stand-ins', info.iap === 'function' && info.ads === 'function' && info.restore === 'undefined');
  check('haptics are safe no-ops', info.haptics === 'function');
  await page.evaluate(() => { SF.haptics.tap(); SF.haptics.impact(); SF.haptics.success(); });
  check('no page errors on file://', errors.length === 0, errors.join('; '));

  const server = await serve(0);
  const base = `http://localhost:${server.address().port}/`;
  const p2 = await ctx.newPage();
  const errs2 = [];
  p2.on('pageerror', e => errs2.push(e.message));
  await p2.goto(base);
  const manifest = await p2.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  check('manifest loads', manifest.name === 'Shardfall Arena' && manifest.icons.length >= 4);
  const icons = await p2.evaluate(async m => Promise.all(m.icons.map(i => fetch(i.src).then(r => r.ok))), manifest);
  check('manifest icons exist', icons.every(Boolean));
  await p2.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
  if (!(await p2.evaluate(() => !!navigator.serviceWorker.controller))) { await p2.reload(); await p2.waitForTimeout(1500); }
  check('service worker controls the page', await p2.evaluate(() => !!navigator.serviceWorker.controller));
  server.close();
  await ctx.setOffline(true);
  await p2.reload();
  await p2.waitForTimeout(1200);
  check('game loads offline', await p2.evaluate(() => !!(window.SF && SF.lobby && document.querySelector('.btn-battle'))));
  check('no page errors over http', errs2.length === 0, errs2.join('; '));
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
