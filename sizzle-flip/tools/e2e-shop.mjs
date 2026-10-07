// Shop flow with the browser test store (localhost = test context). node tools/e2e-shop.mjs  (dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const hidden = (id) => ev((id) => document.getElementById(id).hidden, id);
const card = (id) => `.shop-card[data-item="${id}"]`;
await page.goto('http://localhost:8123/?nosw');
await ev(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 30, stars: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }, seenTips: { a: 1 } })));
await page.reload(); await page.waitForTimeout(1500);

await page.click('#scr-title [data-act=shop]', { force: true }); await page.waitForTimeout(500);
check(!(await hidden('scr-shop')), 'title SHOP opens the shop');
const tab = async (name) => { await page.click(`.shop-tab:has-text("${name}")`, { force: true }); await page.waitForTimeout(250); };
check(await ev(() => document.querySelectorAll('.shop-tab').length) === 8, '7 category tabs + Owned');
let total = 0, priced = 0;
for (const name of ['Food', 'Sweets', 'Stuff', 'Rides', 'Critters', 'Party', 'Colors']) {
  await tab(name);
  total += await ev(() => document.querySelectorAll('.shop-card').length);
  priced += await ev(() => [...document.querySelectorAll('.shop-card .shop-btn span')].filter(s => s.textContent === '$1.00').length);
}
check(total === 130, `tabs list all 130 characters (${total})`);
check(priced === 130, 'every character costs $1.00');
check(!(await hidden('shop-bundle')) && await ev(() => document.querySelector('#shop-bundle-buy span').textContent === '$9.99'), 'Everything Bundle offered for $9.99');
await tab('Owned');
check(await ev(() => document.querySelectorAll('.shop-card').length === 1 && document.querySelector('.shop-card[data-item="sausage"]').classList.contains('on')), 'Owned tab: just the sausage, equipped');
await tab('Food');
// cancel
await page.click(`${card('banana')} .shop-btn`, { force: true }); await page.waitForTimeout(300);
check(!(await hidden('scr-confirm')) && /TEST PURCHASE/.test(await ev(() => document.getElementById('confirm-text').textContent)), 'test store asks to confirm (clearly marked as a test)');
await page.click('[data-act=confirm-no]', { force: true }); await page.waitForTimeout(300);
check(!(await ev(() => window.__app.shop.isOwned('banana'))), 'cancelling buys nothing');
// buy
await page.click(`${card('banana')} .shop-btn`, { force: true }); await page.waitForTimeout(300);
await page.click('[data-act=confirm-yes]', { force: true }); await page.waitForTimeout(400);
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.save.character === 'banana'), 'buying unlocks and equips the item');
check(await ev((s) => document.querySelector(s).classList.contains('on'), card('banana')), 'shop shows it as equipped');
check(await ev(() => /unlocked/.test(document.getElementById('toast').textContent)), 'player gets a confirmation');
// equip sausage, then item again
await tab('Owned');
check(await ev(() => document.querySelectorAll('.shop-card').length) === 2, 'Owned tab lists the sausage + the new item');
await page.click(`${card('sausage')} .shop-btn`, { force: true }); await page.waitForTimeout(300);
check(await ev(() => window.__app.save.character === 'sausage' && !window.__app.shop.characterItem()), 'switching back to the sausage');
await page.click(`${card('banana')} .shop-btn`, { force: true }); await page.waitForTimeout(300);
check(await ev(() => window.__app.shop.characterItem()?.id === 'banana'), 're-equipping an owned item is free');
// play with it: render + win through real drags
await ev(() => { window.__app.startLevel(0); });
await page.waitForFunction(() => window.__app.game.phase === 'play' || window.__app.game.phase === 'intro', null, { timeout: 5000 });
await ev(() => window.__app.game.pointerDown(0, 0));
const sol = await ev(() => window.__app.game.level.solution);
const md = await ev(() => window.__app.maxDrag());
for (const [a, p] of sol) {
  await page.waitForFunction(() => { const g = window.__app.game; return g.phase !== 'play' || g.sim.canLaunch(); }, null, { timeout: 15000 });
  const len = 14 + p * (md - 14), sx = 195, sy = 420, ex = sx - Math.cos(a) * len, ey = sy - Math.sin(a) * len;
  await page.mouse.move(sx, sy); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(sx + (ex - sx) * k / 6, sy + (ey - sy) * k / 6);
  await page.mouse.up(); await page.waitForTimeout(300);
}
await page.waitForFunction(() => !document.getElementById('scr-win').hidden, null, { timeout: 15000 }).catch(() => {});
check(!(await hidden('scr-win')), 'level 1 won with the banana equipped');
await page.screenshot({ path: '/tmp/claude-0/shots/shop-win.png' });
// persistence + reset progress keeps purchases
await page.reload(); await page.waitForTimeout(1500);
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.shop.characterItem()?.id === 'banana'), 'purchase and equipped item survive a reload');
await ev(() => window.__app.resetProgress());
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.save.character === 'banana' && !window.__app.save.stars[0]), '"Reset progress" keeps purchases');
// locker: picking a skin switches to the sausage
await ev(() => { window.__app.save.stars = { 0: 3 }; window.__app.ui.show('scr-skins'); });
await page.waitForTimeout(400);
check(await ev(() => !document.querySelector('#skin-grid .skin.on')), 'locker shows no sausage skin equipped while an item is');
await page.click('#skin-grid .skin', { force: true }); await page.waitForTimeout(300);
check(await ev(() => window.__app.save.character === 'sausage'), 'equipping a skin in the locker switches back to the sausage');
await page.click('.shop-banner', { force: true }); await page.waitForTimeout(400);
check(!(await hidden('scr-shop')), 'locker banner opens the shop');
await page.click('#scr-shop [data-act=back]', { force: true }); await page.waitForTimeout(300);
check(!(await hidden('scr-skins')), 'back returns to the locker');
// restore + test reset
await ev(() => window.__app.ui.show('scr-shop')); await page.waitForTimeout(200);
await page.click('#shop-restore', { force: true }); await page.waitForTimeout(400);
check(await ev(() => /purchases/.test(document.getElementById('toast').textContent)), 'restore button responds');
await ev(() => window.__app.shop.resetTestPurchases());
check(await ev(() => !window.__app.shop.isOwned('banana') && window.__app.save.character === 'sausage'), 'testing panel can clear test purchases');
// the Everything Bundle
await ev(() => { window.__app.ui.shopTab = 'party'; window.__app.ui.show('scr-shop'); }); await page.waitForTimeout(300);
await page.click('#shop-bundle-buy', { force: true }); await page.waitForTimeout(300);
check(/Everything Bundle/.test(await ev(() => document.getElementById('confirm-text').textContent)), 'bundle purchase asks to confirm');
await page.click('[data-act=confirm-yes]', { force: true }); await page.waitForTimeout(500);
check(await ev(() => window.__app.shop.hasBundle && window.__app.shop.ownedCount() === 130), 'bundle unlocks all 130 characters');
check(await ev(() => window.__app.ui.shopTab === 'owned' && document.querySelectorAll('.shop-card').length === 131), 'shop jumps to Owned with everything in it');
check(await hidden('shop-bundle'), 'bundle banner gone once bought');
await page.click(`${card('dragon')} .shop-btn`, { force: true }); await page.waitForTimeout(300);
check(await ev(() => window.__app.shop.characterItem()?.id === 'dragon'), 'any character can then be equipped (Dragon)');
await page.reload(); await page.waitForTimeout(1500);
check(await ev(() => window.__app.shop.hasBundle && window.__app.shop.characterItem()?.id === 'dragon'), 'bundle and equipped character survive a reload');
await ev(() => window.__app.shop.resetTestPurchases());
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
