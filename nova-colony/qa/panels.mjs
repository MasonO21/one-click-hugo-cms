// Panel tour: open every first-session panel through its real button and screenshot it.
import { SP, launch, waitReady, dismissWelcome, tap, shot, sleep, closeModals, openPanels } from './lib.mjs';
const vp = process.argv[2] || 'portrait';
const snap = process.argv[3] || 'victory';
const { browser, page, logs } = await launch(vp, { storage: `${SP}/snap-${snap}.json` });
await waitReady(page);
await dismissWelcome(page);
await closeModals(page);
await shot(page, `${vp}-hud`);
const list = [['#btn-build', 'build'], ['#btn-research', 'research'], ['#btn-colonists', 'crew'], ['#btn-craft', 'craft'], ['#btn-missions', 'missions'], ['#btn-map', 'map'], ['#btn-shop', 'shop'], ['#btn-menu', 'menu']];
for (const [sel, name] of list) {
  try {
    await tap(page, sel, { after: 1300 });
    await shot(page, `${vp}-${name}`);
    const ov = await page.evaluate(() => { const c = document.querySelector('.pm-frame:not(.closing) .pm-card'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), sw: c.scrollWidth > c.clientWidth + 2 }; });
    console.log(name, JSON.stringify(ov));
    await page.keyboard.press('Escape');
    await sleep(500);
    if ((await openPanels(page)).length) { await page.keyboard.press('Escape'); await sleep(400); }
  } catch (e) { console.log('fail', name, e.message.split('\n')[0]); }
}
// offers
for (const p of ['daily', 'spin']) {
  await page.evaluate((p) => window.game.bus.emit('ui:open', { panel: p }), p);
  await sleep(1300);
  await shot(page, `${vp}-${p}`);
  await page.keyboard.press('Escape');
  await sleep(500);
}
// colony panel via the tier chip
await tap(page, '#tier-badge', { after: 1300 }).catch(() => {});
await shot(page, `${vp}-colony`);
console.log(logs.filter((l) => /error/i.test(l)).slice(0, 10).join('\n'));
await browser.close();
