// Observe the first attack up close: aliens visible? turret aims/fires? kills + drops fly to the HUD?
import { SP, launch, waitReady, dismissWelcome, walkTo, shot, sleep, advance, timeScale } from './lib.mjs';
const vp = process.argv[2] || 'phone';
const { browser, page, logs } = await launch(vp, { storage: SP + '/snap-turret.json' });
await waitReady(page);
await dismissWelcome(page);
const tur = await page.evaluate(() => { const b = window.game.state.buildings.list.find((b) => b.def === 'scrap_turret'); return window.game.sys.buildings.center(b); });
await walkTo(page, tur.x + 1.2, tur.z + 1.6, { tol: 1.2 });
const left = await page.evaluate(() => window.game.state.combat.nextAt - window.game.state.playTime);
console.log('phase', await page.evaluate(() => window.game.state.combat.phase), 'left', left);
await advance(page, Math.max(0, left + 0.5));
const left2 = await page.evaluate(() => window.game.state.combat.nextAt - window.game.state.playTime);
console.log('phase', await page.evaluate(() => window.game.state.combat.phase), 'left', left2);
await shot(page, `${vp}-warning`);
await advance(page, Math.max(0, left2 - 2));
await page.evaluate(() => { window.__ev = []; const b = window.game.bus; for (const k of ['combat:started', 'alien:killed', 'alien:died', 'combat:ended', 'turret:fire', 'resource:gained', 'ui:float']) b.on(k, (e) => window.__ev.push(k + ' ' + JSON.stringify(e).slice(0, 90))); });
for (let i = 0; i < 14; i++) {
  await sleep(1300);
  const s = await page.evaluate(() => { const g = window.game; const c = g.state.combat; return { ph: c.phase, t: c.nextAt, al: c.aliens.map((a) => `${a.def}@${a.x.toFixed(0)},${a.z.toFixed(0)} ${a.state} hp${a.hp.toFixed(0)}`).slice(0, 5), proj: (c.projectiles || []).length, q: c.spawnQueue.length }; });
  console.log(i, JSON.stringify(s));
  await shot(page, `${vp}-atk-${i}`);
  if (s.ph !== 'attack' && i > 3) break;
}
console.log((await page.evaluate(() => window.__ev)).slice(0, 40).join('\n'));
await browser.close();
