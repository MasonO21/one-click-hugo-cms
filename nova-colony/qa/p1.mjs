import { launch, waitReady, shot, info, sleep, walkTo, tap } from './lib.mjs';
const { browser, page, logs } = await launch('phone');
await waitReady(page);
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps', fps);
const t0 = await page.evaluate(() => window.game.state.playTime);
// follow guide arrow to a tree
for (let i = 0; i < 6; i++) {
  const g = await page.evaluate(() => { const g = window.game.sys.tutorial.guide(); return g && g.world; });
  if (!g) break;
  console.log('guide target', g);
  await walkTo(page, g.x, g.z, { tol: 2.6 });
  await sleep(300);
  if (i === 0) await shot(page, 'chop1');
  // wait until tree depleted or wood>=60
  for (let k = 0; k < 40; k++) {
    const r = await page.evaluate(() => window.game.state.resources.amounts.wood);
    if (k === 3 && i === 0) await shot(page, 'chop-float');
    const g2 = await page.evaluate(() => { const g = window.game.sys.tutorial.guide(); return g && g.world; });
    if (!g2 || g2.x !== g.x || g2.z !== g.z) break;
    await sleep(250);
  }
  console.log(JSON.stringify(await info(page)).slice(0, 200));
  const m = await page.evaluate(() => window.game.sys.missions.current()?.id);
  if (m !== 'm01_wood') break;
}
const t1 = await page.evaluate(() => window.game.state.playTime);
console.log('wood step game seconds', (t1 - t0).toFixed(1));
await sleep(500);
await shot(page, 'wood-done');
await sleep(1500);
await shot(page, 'wood-done2');
console.log(await page.evaluate(() => JSON.stringify({ cur: window.game.sys.missions.current()?.id, prog: window.game.state.missions.progress.m01_wood, completed: window.game.state.missions.completed })));
console.log(await page.evaluate(() => document.querySelector('.nv-root')?.innerText.slice(0, 800)));
await browser.close();
