// Capture the best first-session moments (phone landscape) for docs/screenshots/first-session-*.png.
// Usage: SP=<snapshot dir> node qa/showcase.mjs <stage>   (stages: intro chop build colonist attack tier)
import fs from 'node:fs';
import { SP, launch, waitReady, dismissWelcome, walkTo, shot, sleep, tap, tapXY, guide, advance, closeModals, w2s, openPanels } from './lib.mjs';
const stage = process.argv[2];
const DEST = process.env.DEST || '/tmp/nc-showcase';
fs.mkdirSync(DEST, { recursive: true });
const save = async (page, name) => { await page.screenshot({ path: `${DEST}/${name}.png` }); console.log('saved', name); };

if (stage === 'intro' || stage === 'chop') {
  const { browser, page } = await launch('phone');
  await page.goto(process.env.NC_URL || 'http://localhost:5411/', { waitUntil: 'load' });
  await page.waitForFunction(() => !!document.querySelector('.nv-modals .pm-card'), null, { timeout: 20000 });
  await sleep(1400);
  if (stage === 'intro') await save(page, 'intro');
  await closeModals(page);
  if (stage === 'chop') {
    const g = await guide(page);
    await walkTo(page, g.world.x, g.world.z, { tol: 2.6 });
    for (let i = 0; i < 8; i++) { await sleep(260); await save(page, 'chop-' + i); }
  }
  await browser.close();
}
if (stage === 'build') {
  const { browser, page } = await launch('phone', { storage: `${SP}/snap-rescue.json` });
  await waitReady(page);
  await dismissWelcome(page);
  await closeModals(page);
  await page.evaluate(() => { const a = window.game.state.resources.amounts; a.wood = Math.max(a.wood, 120); a.stone = Math.max(a.stone, 60); });
  await tap(page, '#btn-build', { after: 1500 });
  await save(page, 'build-menu');
  await tap(page, '[data-build="logging_camp"]', { after: 2500 });
  await save(page, 'build-ghost-initial');
  console.log(await page.evaluate(() => JSON.stringify({ v: window.game.view.build.valid, r: window.game.view.build.reason, cam: window.game.view.camera.mode })));
  const spot = await page.evaluate(() => { const c = window.game.sys.buildings.colonyCenter(); return { x: c.x - 7, z: c.z + 9 }; });
  const sp = await w2s(page, spot.x, spot.z, 0);
  await tapXY(page, sp.x, sp.y, 2500);
  await save(page, 'build-ghost');
  console.log(await page.evaluate(() => JSON.stringify({ v: window.game.view.build.valid, r: window.game.view.build.reason })));
  await tap(page, '#btn-build-confirm', { after: 1500 });
  await save(page, 'build-placed');
  console.log(await page.evaluate(() => JSON.stringify({ mode: window.game.view.mode, cam: window.game.view.camera.mode })));
  await browser.close();
}
if (stage === 'colonist') {
  const { browser, page } = await launch('phone', { storage: `${SP}/snap-logging.json` });
  await waitReady(page);
  await dismissWelcome(page);
  await closeModals(page);
  const c = await page.evaluate(() => { const c = window.game.state.colonists.list[0]; return { x: c.x, z: c.z }; });
  await walkTo(page, c.x + 2, c.z + 3, { tol: 2 });
  for (let i = 0; i < 10; i++) { await sleep(900); await save(page, 'colonist-' + i); }
  await browser.close();
}
if (stage === 'attack') {
  const { browser, page } = await launch('phone', { storage: `${SP}/snap-turret.json` });
  await waitReady(page);
  await dismissWelcome(page);
  await closeModals(page);
  const tur = await page.evaluate(() => { const b = window.game.state.buildings.list.find((b) => b.def === 'scrap_turret'); return window.game.sys.buildings.center(b); });
  await walkTo(page, tur.x + 1.2, tur.z + 1.6, { tol: 1.2 });
  let left = await page.evaluate(() => window.game.state.combat.nextAt - window.game.state.playTime);
  if (await page.evaluate(() => window.game.state.combat.phase === 'peace')) { await advance(page, left + 0.5); left = await page.evaluate(() => window.game.state.combat.nextAt - window.game.state.playTime); }
  await sleep(1200);
  await save(page, 'warning');
  await advance(page, Math.max(0, left - 1));
  for (let i = 0; i < 16; i++) {
    await sleep(1000);
    const n = await page.evaluate(() => window.game.state.combat.aliens.filter((a) => a.state !== 'dying').length);
    if (n > 0) await save(page, 'attack-' + i);
    if (await page.locator('[data-panel="victory"]').count()) break;
  }
  await page.waitForSelector('[data-panel="victory"]', { timeout: 120000 }).catch(() => {});
  await sleep(1500);
  await save(page, 'victory-closed');
  const chest = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-panel="victory"] button')].find((b) => !b.id); if (b) b.setAttribute('data-qa', 'chest'); return !!b; });
  if (chest) { await tap(page, '[data-qa="chest"]', { after: 1800 }); await save(page, 'victory-open'); }
  await browser.close();
}
if (stage === 'tier') {
  const { browser, page } = await launch('phone', { storage: `${SP}/snap-research.json` });
  await waitReady(page);
  await dismissWelcome(page);
  await closeModals(page);
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  await walkTo(page, core.x + 2, core.z + 4, { tol: 2 });
  await sleep(800);
  const p = await w2s(page, core.x, core.z, 1.5);
  await tapXY(page, p.x, p.y, 1500);
  await save(page, 'colony-panel');
  const b = await page.evaluate(() => { const btn = [...document.querySelectorAll('.pm-frame button')].find((b) => /upgrade/i.test(b.innerText)); if (btn) btn.setAttribute('data-qa', 'ubtn'); return !!btn; });
  if (b) await tap(page, '[data-qa="ubtn"]', { after: 300 });
  for (let i = 0; i < 6; i++) { await sleep(450); await save(page, 'tier-' + i); }
  await sleep(1500);
  await save(page, 'tier-card');
  await browser.close();
}
