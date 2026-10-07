import { SP, launch, waitReady, shot, sleep, walkTo, tap, tapXY, snapshot, timeScale, gameTime, mission, guide, res, w2s } from './lib.mjs';
const SP = process.env.SP;
const { browser, context, page } = await launch('phone');
await waitReady(page);
await timeScale(page, 2);
// quick wood
for (let i = 0; i < 8; i++) {
  const g = await guide(page); if (!g?.world || (await mission(page))?.id !== 'm01_wood') break;
  await walkTo(page, g.world.x, g.world.z, { tol: 2.6 });
  for (let k = 0; k < 40; k++) { const g2 = await guide(page); if (!g2?.world || g2.world.x !== g.world.x) break; await sleep(200); }
}
await sleep(2500);
console.log('after wood', await gameTime(page), await mission(page), await res(page));
await snapshot(page, context, SP + '/snap-wood.json');
// Build shelter via UI
await tap(page, '#btn-build', { after: 800 });
await shot(page, 'buildmenu');
console.log('guide', JSON.stringify(await guide(page)));
await tap(page, '[data-build="shelter"]', { after: 800 });
await shot(page, 'ghost');
console.log(await page.evaluate(() => JSON.stringify(window.game.view.build)));
console.log('guide', JSON.stringify(await guide(page)));
console.log(await page.evaluate(() => document.querySelector('#buildbar')?.innerText));
await browser.close();
