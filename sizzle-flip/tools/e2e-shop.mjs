// Shop flow with the browser test store (localhost = test context): Hot Dog packs, characters, bundles.
// node tools/e2e-shop.mjs  (dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { PACKS, SKIN_PRICE, bundlePrice } from '../src/shop-config.js';
import { ITEMS, CATEGORIES } from '../src/art/items.js';
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const hidden = (id) => ev((id) => document.getElementById(id).hidden, id);
const text = (sel) => ev((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/⁠/g, '') : null; }, sel);
const card = (id) => `.shop-card[data-item="${id}"]`;
const balance = () => ev(() => window.__app.shop.balance);
const tap = async (sel, wait = 300) => { await page.click(sel, { force: true }); await page.waitForTimeout(wait); };
const tab = async (id) => { const sel = `.shop-tab[data-tab="${id}"]`; await page.$eval(sel, (e) => e.scrollIntoView({ inline: 'center', block: 'nearest' })); await page.waitForTimeout(100); await tap(sel, 250); };
const n = (x) => x.toLocaleString('en-US');

await page.goto('http://localhost:8123/?nosw');
await ev(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 30, stars: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 }, seenTips: { a: 1 } })));
await page.reload(); await page.waitForTimeout(1500);

// --- layout and prices
await tap('#scr-title [data-act=shop]', 500);
check(!(await hidden('scr-shop')), 'title SHOP opens the shop');
check(await ev(() => [...document.querySelectorAll('.shop-tab')].map(t => t.dataset.tab).join()) === [...CATEGORIES.map(c => c.id), 'bundles', 'owned'].join(), '7 category tabs + Bundles + Owned');
check(!(await hidden('shop-wallet')) && await text('#shop-balance') === '0', 'Hot Dogs balance shows 0 in the header');
let total = 0, priced = 0;
const badBanner = [];
for (const c of CATEGORIES) {
  await tab(c.id);
  total += await ev(() => document.querySelectorAll('.shop-card').length);
  priced += await ev(() => [...document.querySelectorAll('.shop-card .shop-btn span')].filter(s => s.textContent.replace(/⁠/g, '') === '🌭100').length);
  const count = ITEMS.filter(i => i.cat === c.id).length;
  const btn = await text(`#shop-bundle-slot .shop-bundle[data-bundle="${c.id}"] .shop-btn`);
  if (btn !== `🌭${n(bundlePrice(count))}`) badBanner.push(`${c.name}: ${btn}`);
}
check(total === 130, `tabs list all 130 characters (${total})`);
check(priced === 130, 'every character costs 🌭100');
check(!badBanner.length, `each tab shows its own bundle, priced for its size${badBanner.length ? ' — ' + badBanner.join(', ') : ''}`);
await tab('bundles');
const rows = await ev(() => [...document.querySelectorAll('#shop-grid .shop-bundle')].map(d => [d.dataset.bundle, d.querySelector('.shop-btn span').textContent.replace(/⁠/g, '')]));
const expected = [['all', 130], ...CATEGORIES.map(c => [c.id, ITEMS.filter(i => i.cat === c.id).length])].map(([id, k]) => [id, `🌭${n(bundlePrice(k))}`]);
check(JSON.stringify(rows) === JSON.stringify(expected), `Bundles tab: Everything + 7 tab bundles, proportional to their size (${rows.map(r => r[0] + ' ' + r[1]).join(', ')})`);
check(bundlePrice(130) === 130 * SKIN_PRICE * 0.8 && bundlePrice(9) === 720, 'bundle price = characters × 🌭100 − 20%');
await tab('owned');
check(await ev(() => document.querySelectorAll('.shop-card').length === 1 && document.querySelector('.shop-card[data-item="sausage"]').classList.contains('on')), 'Owned tab: just the sausage, equipped');
check(await ev(() => document.getElementById('shop-bundle-slot').children.length === 0), 'no bundle banner on the Owned tab');

// --- not enough Hot Dogs → the packs window, aimed at what the player wanted
await tab('food');
await tap(`${card('banana')} .shop-btn`);
check(!(await hidden('scr-hotdogs')) && await hidden('scr-confirm'), 'buying with 0 Hot Dogs opens "Get Hot Dogs"');
check(await text('#hd-need') === 'You need 🌭100 more for Banana.', 'it says how many more are needed, and for what');
const packs = await ev(() => [...document.querySelectorAll('.hd-pack')].map(b => [b.dataset.pack, b.querySelector('b').textContent, b.querySelector('.hp-price').textContent, b.classList.contains('fit')]));
check(JSON.stringify(packs.map(p => p.slice(0, 3))) === JSON.stringify(PACKS.map(p => [p.id, n(p.hotdogs), '$' + p.usd])), `6 packs: ${packs.map(p => p[1] + ' ' + p[2]).join(', ')}`);
check(packs.filter(p => p[3]).map(p => p[0]).join() === 'hotdogs_100', 'the smallest pack that covers it is highlighted');
check(/^100 Hot Dogs = \$0\.99 · every character is 🌭100/.test(await text('#hd-note')), 'the exchange rate is shown in the store\'s currency (100 Hot Dogs = $0.99)');
// cancel, then buy
await tap('.hd-pack[data-pack="hotdogs_100"]');
check(!(await hidden('scr-confirm')) && /TEST PURCHASE[\s\S]*100 Hot Dogs for \$0\.99/.test(await text('#confirm-text')), 'test store asks to confirm (clearly marked as a test)');
await tap('[data-act=confirm-no]');
check(await balance() === 0 && !(await hidden('scr-hotdogs')), 'cancelling credits nothing');
await tap('.hd-pack[data-pack="hotdogs_100"]');
await tap('[data-act=confirm-yes]', 500);
check(await hidden('scr-hotdogs') && !(await hidden('scr-confirm')) && /Buy Banana for 🌭100\?/.test(await text('#confirm-text')), 'after the pack, the banana is offered right away');
check(await balance() === 100 && await text('#shop-balance') === '100', '+100 Hot Dogs credited and shown');
await tap('[data-act=confirm-yes]', 400);
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.save.character === 'banana'), 'buying unlocks and equips the character');
check(await balance() === 0, '🌭100 spent');
check(await ev((s) => document.querySelector(s).classList.contains('on'), card('banana')), 'shop shows it as equipped');
check(await ev(() => /unlocked/.test(document.getElementById('toast').textContent)), 'player gets a confirmation');
check(await ev(() => window.__app.save.txSeen && Object.keys(window.__app.save.txSeen).length === 1), 'the purchase is recorded once by its transaction id');

// --- equip
await tab('owned');
check(await ev(() => document.querySelectorAll('.shop-card').length) === 2, 'Owned tab lists the sausage + the new character');
await tap(`${card('sausage')} .shop-btn`);
check(await ev(() => window.__app.save.character === 'sausage' && !window.__app.shop.characterItem()), 'switching back to the sausage');
await tap(`${card('banana')} .shop-btn`);
check(await ev(() => window.__app.shop.characterItem()?.id === 'banana'), 're-equipping an owned character is free');

// --- play with it: render + win through real drags
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

// --- persistence + reset progress keeps the wallet
await ev(() => window.__app.shop.credit({ productIdentifier: 'hotdogs_500', transactionId: 'e2e-keep' }));
await page.reload(); await page.waitForTimeout(1500);
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.shop.characterItem()?.id === 'banana') && await balance() === 500, 'characters, the equipped one and Hot Dogs survive a reload');
await ev(() => window.__app.resetProgress());
check(await ev(() => window.__app.shop.isOwned('banana') && window.__app.save.character === 'banana' && !window.__app.save.stars[0]) && await balance() === 500, '"Reset progress" keeps Hot Dogs and characters');
check(await ev(() => window.__app.shop.credit({ productIdentifier: 'hotdogs_500', transactionId: 'e2e-keep' })) === 0 && await balance() === 500, 'the same store transaction is never credited twice (also after a reset)');

// --- locker
await ev(() => { window.__app.save.stars = { 0: 3 }; window.__app.ui.show('scr-skins'); });
await page.waitForTimeout(400);
check(await ev(() => !document.querySelector('#skin-grid .skin.on')), 'locker shows no sausage skin equipped while a character is');
await tap('#skin-grid .skin');
check(await ev(() => window.__app.save.character === 'sausage'), 'equipping a skin in the locker switches back to the sausage');
check(/🌭100 each/.test(await text('#shop-banner-sub')), 'locker banner: 🌭100 each');
await tap('.shop-banner', 400);
check(!(await hidden('scr-shop')), 'locker banner opens the shop');
await tap('#scr-shop [data-act=back]');
check(!(await hidden('scr-skins')), 'back returns to the locker');

// --- bundles: short → packs → bundle; partly owned tabs; the last one
await ev(() => { window.__app.ui.shopTab = 'food'; window.__app.ui.show('scr-shop'); }); await page.waitForTimeout(300);
check(await text('#shop-bundle-slot .shop-btn') === `🌭${n(bundlePrice(26))}` && /The 26 missing/.test(await text('#shop-bundle-slot')), 'Food bundle now covers the 26 missing characters (🌭2,080)');
await tap('#shop-bundle-slot .shop-btn');
check(!(await hidden('scr-hotdogs')) && await text('#hd-need') === `You need 🌭${n(bundlePrice(26) - 500)} more for the Food Bundle.`, 'not enough for the bundle → packs window says how many more');
check(await ev(() => document.querySelector('.hd-pack.fit').dataset.pack) === 'hotdogs_2500', 'the 2,500 pack is highlighted (the smallest that covers 🌭1,580)');
await ev(() => window.__app.ui.onBack());
check(await hidden('scr-hotdogs') && !(await hidden('scr-shop')), 'back closes the packs window');
await tap('#shop-wallet', 400);
check(!(await hidden('scr-hotdogs')) && await hidden('hd-need'), 'the balance pill opens the packs window');
await tap('.hd-pack[data-pack="hotdogs_2500"]');
await tap('[data-act=confirm-yes]', 500);
check(await balance() === 3000 && await hidden('scr-confirm'), 'pack bought from the pill: no item was waiting, so nothing else is offered');
await tap('[data-act=hotdogs-close]');
await tap('#shop-bundle-slot .shop-btn');
check(/Buy the Food Bundle for 🌭2,080\?[\s\S]*26 missing Food characters[\s\S]*saves you 🌭520/.test(await text('#confirm-text')), 'bundle purchase asks to confirm, with the price and the saving');
await tap('[data-act=confirm-yes]', 500);
check(await ev((ids) => ids.every(id => window.__app.shop.isOwned(id)), ITEMS.filter(i => i.cat === 'food').map(i => i.id)), 'the Food Bundle unlocks every Food character');
check(await balance() === 3000 - bundlePrice(26), `🌭${n(bundlePrice(26))} spent (🌭${n(3000 - bundlePrice(26))} left)`);
check(await ev(() => document.getElementById('shop-bundle-slot').children.length === 0), 'the Food bundle banner is gone');
await tab('bundles');
check(await ev(() => document.querySelector('.shop-bundle[data-bundle="food"]').classList.contains('done')), 'Bundles tab marks the Food Bundle as owned');
check(await text('.shop-bundle[data-bundle="all"] .shop-btn') === `🌭${n(bundlePrice(130 - 27))}`, 'the Everything Bundle now covers only the 103 missing characters');
// one Sweets character, then the Sweets bundle shrinks
await tab('sweets');
const firstSweet = await ev(() => document.querySelector('.shop-card').dataset.item);
await tap(`${card(firstSweet)} .shop-btn`); await tap('[data-act=confirm-yes]', 400);
check(await text('#shop-bundle-slot .shop-btn') === `🌭${n(bundlePrice(20))}`, `buying one Sweets character makes the Sweets bundle 🌭${n(bundlePrice(20))} (20 left)`);
// one character left in a tab: no bundle (it would cost less than the character)
await ev((ids) => { const s = window.__app.shop; ids.forEach(id => { s.owned[id] = { at: 1, source: 'test' }; }); s.saveWallet(); window.__app.ui.shopTab = 'party'; window.__app.ui.renderShop(); }, ITEMS.filter(i => i.cat === 'party').slice(1).map(i => i.id));
await page.waitForTimeout(200);
check(await ev(() => document.getElementById('shop-bundle-slot').children.length === 0), 'no Party bundle with only one character left');
check(await ev(() => window.__app.shop.unlockBundle('party')) === 'unavailable', 'and it can\'t be bought');

// --- the Everything Bundle costs more than the biggest pack: the biggest pack is suggested
await ev(() => window.__app.shop.resetTestPurchases());
await ev(() => { window.__app.ui.shopTab = 'bundles'; window.__app.ui.renderShop(); }); await page.waitForTimeout(200);
await tap('.shop-bundle[data-bundle="all"] .shop-btn');
check(await text('#hd-need') === 'You need 🌭10,400 more for the Everything Bundle.' && await ev(() => document.querySelector('.hd-pack.fit')?.dataset.pack) === 'hotdogs_10000', 'Everything Bundle (🌭10,400) from zero: the 10,000 pack is suggested');
await tap('[data-act=hotdogs-close]');
// a bundle quoted in the confirmation is not charged at a different price
await ev(() => window.__app.shop.credit({ productIdentifier: 'hotdogs_2500', transactionId: 'e2e-quote' }));
check(await ev(() => window.__app.shop.unlockBundle('rides', 640)) === 'changed' && await balance() === 2500, 'a bundle whose price changed after the player saw it is not charged');
await ev(() => window.__app.shop.revoke({ productIdentifier: 'hotdogs_2500', transactionId: 'e2e-quote' }));
await ev(() => { const s = window.__app.save; s.owned = { banana: { at: 1 } }; s.hotdogs = 320; s.txSeen = { 'e2e-keep': { p: 'hotdogs_500', n: 500 } }; window.__app.shop.saveWallet(); });

// --- refunds, test reset, migration of the old $1 purchases
const before = await balance();
await ev(() => window.__app.shop.revoke({ productIdentifier: 'hotdogs_500', transactionId: 'e2e-keep' }));
check(await balance() === Math.max(0, before - 500), 'a refunded pack takes its Hot Dogs back');
await ev(() => window.__app.shop.resetTestPurchases());
check(await ev(() => !window.__app.shop.isOwned('banana') && window.__app.save.character === 'sausage' && window.__app.shop.balance === 0), 'testing panel can clear test Hot Dogs and characters');
await ev(() => { const s = JSON.parse(localStorage.getItem('sizzleflip.save.v1')); s.owned = { bundle: { at: 1, source: 'test' } }; localStorage.setItem('sizzleflip.save.v1', JSON.stringify(s)); });
await page.reload(); await page.waitForTimeout(1500);
check(await ev(() => window.__app.shop.ownedCount() === 130 && !window.__app.save.owned.bundle), 'an old Everything Bundle purchase (test builds) becomes all 130 characters');
await ev(() => window.__app.shop.resetTestPurchases());
await page.screenshot({ path: '/tmp/claude-0/shots/shop-end.png' }).catch(() => {});
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
