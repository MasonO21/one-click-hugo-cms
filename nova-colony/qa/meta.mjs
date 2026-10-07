// Meta flows through the real UI: Welcome Back (2x ad), daily gift, Lucky Wheel, free crate, save/reload continuity.
import { SP, launch, waitReady, dismissWelcome, tap, shot, sleep, closeModals, openPanels, res } from './lib.mjs';
const vp = process.argv[2] || 'phone';
const snap = process.argv[3] || 'tier';
const { browser, context, page, logs } = await launch(vp, { storage: `${SP}/snap-${snap}.json` });
await waitReady(page);
await sleep(1500);
console.log('panels at load', await openPanels(page));
await closeModals(page);
// ---- save/reload continuity
const before = await page.evaluate(() => { const g = window.game; return { t: Math.round(g.state.playTime), m: g.sys.missions.current()?.id, b: g.state.buildings.list.length, tier: g.state.colony.tier, wood: Math.floor(g.state.resources.amounts.wood), p: [Math.round(g.state.player.x), Math.round(g.state.player.z)], col: g.state.colonists.list.length }; });
// pretend we left 4 h 32 min ago
await page.evaluate(() => { const g = window.game; g.setPaused(true); g.state.lastTickAt = Date.now() - (4 * 3600 + 32 * 60) * 1000; window.dispatchEvent(new Event('pagehide')); });
await sleep(1200);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !!window.game && !!window.game.state, null, { timeout: 30000 });
await sleep(2500);
const after = await page.evaluate(() => { const g = window.game; return { t: Math.round(g.state.playTime), m: g.sys.missions.current()?.id, b: g.state.buildings.list.length, tier: g.state.colony.tier, wood: Math.floor(g.state.resources.amounts.wood), p: [Math.round(g.state.player.x), Math.round(g.state.player.z)], col: g.state.colonists.list.length }; });
console.log('before', JSON.stringify(before));
console.log('after ', JSON.stringify(after));
console.log('panels after reload', await openPanels(page));
await shot(page, `${vp}-welcome`);
console.log(await page.evaluate(() => document.querySelector('[data-panel="welcome"]')?.innerText.replace(/\s+/g, ' ')));
const r0 = await res(page);
if (await page.locator('#btn-offline-double').count()) {
  await tap(page, '#btn-offline-double', { after: 600 });
  await shot(page, `${vp}-welcome-ad`);
  await page.waitForFunction(() => { const b = document.querySelector('[data-dev-ad] [data-claim]'); return b && !b.disabled; }, null, { timeout: 15000 }).catch(() => console.log('  no claimable dev ad'));
  if (await page.locator('[data-dev-ad] [data-claim]').count()) await tap(page, '[data-dev-ad] [data-claim]', { after: 1500 });
  await shot(page, `${vp}-welcome-ad2`);
  console.log('panels', await openPanels(page));
  // mock ad may show an overlay: close / wait
  const adUi = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('ad ui:', adUi.replace(/\s+/g, ' ').slice(0, 200));
}
await sleep(2000);
if (await page.locator('#btn-offline-collect').count()) await tap(page, '#btn-offline-collect', { after: 1500 });
console.log('res before', JSON.stringify(r0), 'after', JSON.stringify(await res(page)));
await shot(page, `${vp}-welcome-done`);
// ---- daily popup appears ~3 s after launch once the welcome is dealt with
await sleep(5000);
console.log('panels (daily?)', await openPanels(page));
await shot(page, `${vp}-daily-popup`);
if ((await openPanels(page)).includes('daily')) {
  await page.evaluate(() => [...document.querySelectorAll('[data-panel="daily"] button')].find((b) => /claim/i.test(b.innerText))?.setAttribute('data-qa', 'dclaim'));
  await tap(page, '[data-qa="dclaim"]', { after: 1800 });
  await shot(page, `${vp}-daily-claimed`);
  console.log('after daily', JSON.stringify(await res(page)), await openPanels(page));
  await closeModals(page);
  if ((await openPanels(page)).length) { await page.keyboard.press('Escape'); await sleep(600); }
}
// ---- spin via the HUD pill
const pills = await page.evaluate(() => [...document.querySelectorAll('.offer')].map((b) => b.innerText.replace(/\s+/g, ' ')));
console.log('offer pills', pills);
await page.evaluate(() => [...document.querySelectorAll('.offer')].find((b) => /spin/i.test(b.innerText))?.setAttribute('data-qa', 'spin'));
if (await page.locator('[data-qa="spin"]').count()) {
  await tap(page, '[data-qa="spin"]', { after: 1200 });
  console.log('spin buttons', await page.evaluate(() => [...document.querySelectorAll('[data-panel="spin"] button')].map((b) => b.innerText.replace(/\s+/g, ' '))));
  await shot(page, `${vp}-spin-panel`);
  await page.evaluate(() => [...document.querySelectorAll('[data-panel="spin"] button')].find((b) => /spin/i.test(b.innerText) && !/extra/i.test(b.innerText))?.setAttribute('data-qa', 'dospin'));
  await tap(page, '[data-qa="dospin"]', { after: 900 });
  await shot(page, `${vp}-spinning`);
  await sleep(5000);
  await shot(page, `${vp}-spin-result`);
  console.log('after spin', JSON.stringify(await res(page)), await openPanels(page));
  await closeModals(page);
  if ((await openPanels(page)).length) { await page.keyboard.press('Escape'); await sleep(600); }
}
// ---- free crate via the HUD pill
await page.evaluate(() => [...document.querySelectorAll('.offer')].find((b) => /crate/i.test(b.innerText))?.setAttribute('data-qa', 'crate'));
if (await page.locator('[data-qa="crate"]').count()) {
  await tap(page, '[data-qa="crate"]', { after: 1300 });
  await shot(page, `${vp}-shop-crate`);
  await page.evaluate(() => [...document.querySelectorAll('[data-panel="shop"] button')].find((b) => /free crate/i.test(b.innerText))?.setAttribute('data-qa', 'freecrate'));
  await tap(page, '[data-qa="freecrate"]', { after: 1800 });
  await shot(page, `${vp}-crate-opened`);
  console.log('after crate', JSON.stringify(await res(page)), await openPanels(page));
}
console.log(logs.filter((l) => /error/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
