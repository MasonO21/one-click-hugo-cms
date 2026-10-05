// End-to-end test of the ad flow with the placeholder provider (localhost = test context).
// node tools/e2e-ads.mjs   (needs the dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `/tmp/claude-0/shots/ads-${n}.png` });
let fails = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const ev = (fn, arg) => page.evaluate(fn, arg);
const hidden = (id) => ev((id) => document.getElementById(id).hidden, id);

// a returning player: 4 levels beaten, 6 minutes played, last ad long ago
await page.goto('http://localhost:8123/?nosw');
await ev(() => {
  localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 5, stars: { 0: 3, 1: 3, 2: 2, 3: 3 }, best: { 0: 1, 1: 2, 2: 3, 3: 2 }, seenTips: { all: 1 },
    ads: { wins: 4, levelsSinceAd: 4, lastShownAt: 0, interstitials: 0, rewarded: 0, playSeconds: 360, freeHints: {} } }));
});
await page.reload();
await page.waitForTimeout(1500);

async function winCurrent() {
  // play the verified route with real pointer drags (as tools/e2e.mjs does)
  await page.waitForFunction(() => window.__app.game && window.__app.game.phase === 'play' && !window.__app.game.attract, null, { timeout: 10000 });
  const info = await ev(() => ({ sol: window.__app.game.level.solution, maxDrag: window.__app.maxDrag() }));
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const [a, p, delay] of info.sol) {
      await page.waitForFunction(() => { const g = window.__app.game; return g.phase !== 'play' || g.sim.canLaunch(); }, null, { timeout: 15000 });
      if (await ev(() => window.__app.game.phase !== 'play')) break;
      if (delay) await page.waitForTimeout(delay * 1000);
      const len = 14 + p * (info.maxDrag - 14) + 0.5;
      const sx = 195, sy = 420, ex = sx - Math.cos(a) * len, ey = sy - Math.sin(a) * len;
      await page.mouse.move(sx, sy); await page.mouse.down();
      for (let k = 1; k <= 6; k++) await page.mouse.move(sx + (ex - sx) * k / 6, sy + (ey - sy) * k / 6);
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    try { await page.waitForFunction(() => !document.getElementById('scr-win').hidden, null, { timeout: 12000 }); await page.waitForTimeout(900); return true; }
    catch (e) { await ev(() => window.__app.restartLevel()); await page.waitForTimeout(400); }
  }
  return false;
}
// trigger the level's win event directly (the ad checks below don't depend on the physics route)
async function forceWin() {
  await page.waitForFunction(() => window.__app.game && window.__app.game.phase === 'play' && !window.__app.game.attract, null, { timeout: 10000 });
  await ev(() => window.__app.game.onWinEvent(400, 400));
  try { await page.waitForFunction(() => !document.getElementById('scr-win').hidden, null, { timeout: 6000 }); await page.waitForTimeout(600); return true; } catch (e) { return false; }
}
const adUp = () => ev(() => !!document.querySelector('.adlayer'));

// ---- 1. forced ad after the 5th level beaten (and 5+ minutes played), on NEXT
await ev(() => window.__app.startLevel(4));
check(await winCurrent(), 'beat level 5 through the UI');
check(!(await adUp()), 'no ad while the level-complete card is showing');
await page.click('[data-act=next]', { force: true });
await page.waitForTimeout(500);
check(await adUp(), 'forced ad appears when tapping NEXT after the 5th win');
check(await ev(() => window.__app.game.paused), 'game is paused under the ad');
check(await ev(() => document.querySelector('.ad-close').disabled), 'ad close button is locked for the first seconds');
await shot('1-interstitial');
check(!(await hidden('scr-win')), 'win card stays underneath until the ad closes');
await page.waitForFunction(() => !document.querySelector('.ad-close').disabled, null, { timeout: 8000 });
await page.click('.ad-close');
await page.waitForTimeout(600);
check(!(await adUp()), 'ad closes');
check(await ev(() => window.__app.game.info.index === 5 && !window.__app.game.paused), 'next level (6) starts, not paused');
check(await ev(() => window.__app.save.ads.levelsSinceAd === 0 && window.__app.save.ads.interstitials === 1), 'counters reset after the ad');

// ---- 2. the very next win: no ad (needs 3 levels + 3 minutes)
check(await winCurrent(), 'beat level 6');
await page.click('[data-act=next]', { force: true });
await page.waitForTimeout(500);
check(!(await adUp()), 'no forced ad on the following level (1/3 since last ad)');

// ---- 3. retry / fail never shows an ad
await ev(() => window.__app.restartLevel());
await page.waitForTimeout(300);
check(!(await adUp()), 'no ad on restart');

// ---- 4. hints: first one in a world is free, the next costs a reward ad
await ev(() => { const g = window.__app.game; g.fails = 3; g.hud(); });
await page.waitForTimeout(200);
check(!(await hidden('hud-hint')), 'hint button appears after 3 fails');
check(await hidden('hint-ad'), 'first hint of the world has no AD badge');
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(400);
check(!(await adUp()) && await ev(() => window.__app.game.showHint), 'free hint shows the route without an ad');
await ev(() => window.__app.restartLevel());
await page.waitForTimeout(300);
check(await ev(() => window.__app.game.showHint), 'hint route stays after restarting the level');
await ev(() => window.__app.startLevel(7));
await page.waitForTimeout(800);
await ev(() => { const g = window.__app.game; g.fails = 3; g.hud(); });
await page.waitForTimeout(200);
check(!(await hidden('hint-ad')), 'second hint in the same world shows the AD badge');
await shot('2-hud-adhint');
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(500);
check(await adUp(), 'reward ad opens for the paid hint');
await shot('3-rewarded');
await page.click('.ad-close');
await page.waitForTimeout(400);
check(!(await ev(() => window.__app.game.showHint)), 'closing the reward ad early gives no hint');
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(300);
await page.waitForFunction(() => { const c = document.querySelector('.ad-collect'); return c && !c.hidden; }, null, { timeout: 9000 });
await shot('4-rewarded-done');
await page.click('.ad-collect');
await page.waitForTimeout(500);
check(await ev(() => window.__app.game.showHint && !window.__app.game.paused), 'watching the reward ad unlocks the hint and resumes');

// ---- 5. skip after 8 fails
check(await hidden('hud-skip'), 'no skip button before 8 fails');
await ev(() => { const g = window.__app.game; g.fails = 8; g.hud(); });
await page.waitForTimeout(200);
check(!(await hidden('hud-skip')), 'skip button appears after 8 fails');
await shot('5-hud-skip');
await page.click('#hud-skip', { force: true });
await page.waitForTimeout(300);
check(!(await hidden('scr-confirm')) && await ev(() => document.getElementById('confirm-yes').textContent.includes('Watch')), 'skip asks for confirmation (Watch ad)');
await shot('6-skip-confirm');
await page.click('[data-act=confirm-yes]', { force: true });
await page.waitForFunction(() => { const c = document.querySelector('.ad-collect'); return c && !c.hidden; }, null, { timeout: 9000 });
await page.click('.ad-collect');
await page.waitForTimeout(800);
check(await ev(() => window.__app.game.info.index === 8 && window.__app.save.skipped[7] === true && window.__app.save.unlocked >= 9), 'level 8 skipped → level 9 starts and is unlocked');
await ev(() => window.__app.toMenu('scr-levels'));
await page.waitForTimeout(800);
check(await ev(() => document.querySelectorAll('.lvl')[7].classList.contains('skipped')), 'level select marks level 8 as skipped');
await shot('7-levels-skipped');

// ---- 6. world-complete: no forced ad
await ev(() => { const a = window.__app; a.save.ads.levelsSinceAd = 9; a.save.ads.lastShownAt = 0; a.save.unlocked = Math.max(a.save.unlocked, 20); a.startLevel(19); });
check(await forceWin(), 'win the world-1 boss level');
await page.click('[data-act=next]', { force: true });
await page.waitForTimeout(600);
check(!(await adUp()) && !(await hidden('scr-worlddone')), 'world-complete celebration shows, no ad');
await page.click('[data-act=wd-continue]', { force: true });
await page.waitForTimeout(600);

// ---- 7. "remove ads" stops forced ads but keeps reward ads
await ev(() => { const a = window.__app; a.save.ads.levelsSinceAd = 9; a.save.ads.lastShownAt = 0; a.setSetting('adsRemoved', true); a.startLevel(20); });
check(await forceWin(), 'win level 21');
await page.click('[data-act=next]', { force: true });
await page.waitForTimeout(600);
check(!(await adUp()), 'no forced ad after "Remove ads"');
await ev(() => { const g = window.__app.game; g.fails = 3; g.hud(); });
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(300);
check(!(await adUp()), 'first hint in world 2 is free');

// ---- settings panel
await ev(() => { window.__app.setSetting('adsRemoved', false); window.__app.toMenu('scr-title'); });
await page.waitForTimeout(500);
await page.click('[data-act=settings]', { force: true });
await page.waitForTimeout(600);
check(!(await hidden('ad-test')), 'Ad testing panel visible in a test build');
await ev(() => { document.querySelector('.settings-card').scrollTop = 9999; });
await page.waitForTimeout(200);
await shot('8-settings');

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
