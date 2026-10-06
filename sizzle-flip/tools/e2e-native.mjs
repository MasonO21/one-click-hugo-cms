// Native-behaviour test: runs the game with mocked Capacitor plugins (AdMob 7/8 event semantics, App back button)
// to check the AdMob provider and Android back handling. node tools/e2e-native.mjs   (dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const MOCK = () => {
  const L = {};
  const emit = (ev, data) => { (L[ev] ? [...L[ev]] : []).forEach(f => f(data || {})); };
  const calls = window.__calls = [];
  let rewardResolve = null;
  const on = (ev, fn) => { (L[ev] = L[ev] || new Set()).add(fn); return Promise.resolve({ remove: async () => { L[ev].delete(fn); } }); };
  const AdMob = {
    initialize: async () => { calls.push('initialize'); },
    requestConsentInfo: async () => ({ status: 'OBTAINED', isConsentFormAvailable: true, canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' }),
    showConsentForm: async () => ({}),
    showPrivacyOptionsForm: async () => { calls.push('showPrivacyOptionsForm'); },
    requestTrackingAuthorization: async () => {},
    prepareInterstitial: async () => { calls.push('prepareInterstitial'); if (window.__failPrepare) throw new Error('no fill'); },
    prepareRewardVideoAd: async () => { calls.push('prepareRewardVideoAd'); if (window.__failPrepare) throw new Error('no fill'); },
    showInterstitial: async () => { calls.push('showInterstitial'); setTimeout(() => emit('interstitialAdShowed'), 20); },
    // plugin semantics: resolves only when the reward is earned (never if closed early)
    showRewardVideoAd: () => { calls.push('showRewardVideoAd'); setTimeout(() => emit('onRewardedVideoAdShowed'), 20); return new Promise(res => { rewardResolve = res; }); },
    addListener: on,
  };
  // @capgo/native-purchases (Google Play Billing / StoreKit): one prior purchase on this account (banana)
  window.__store = { owned: [{ productIdentifier: 'item_banana', purchaseState: '1' }], next: {} };
  const NativePurchases = {
    getProducts: async ({ productIdentifiers }) => ({ products: productIdentifiers.map(id => ({ identifier: id, priceString: '1,09 €', price: 1.09 })) }),
    getPurchases: async () => ({ purchases: window.__store.owned.slice() }),
    restorePurchases: async () => { calls.push('restorePurchases'); },
    purchaseProduct: async ({ productIdentifier }) => {
      calls.push('purchase:' + productIdentifier);
      const how = window.__store.next[productIdentifier] || 'ok';
      if (how === 'cancel') throw new Error('User cancelled the purchase');
      if (how === 'error') throw new Error('Billing service unavailable');
      const tx = { productIdentifier, transactionId: 't' + Date.now(), purchaseState: how === 'pending' ? '0' : '1' };
      if (how === 'ok') window.__store.owned.push(tx);
      return tx;
    },
    addListener: on,
  };
  const App = { addListener: (ev, fn) => { if (ev === 'backButton') window.__back = fn; return on(ev, fn); }, minimizeApp: async () => { calls.push('minimizeApp'); } };
  window.__mock = {
    listeners: () => Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.size]).filter(([, n]) => n)),
    reward: () => { emit('onRewardedVideoAdReward', {}); rewardResolve && rewardResolve({}); },
    closeReward: () => emit('onRewardedVideoAdDismissed'),
    failReward: () => emit('onRewardedVideoAdFailedToShow', {}),
    closeInterstitial: () => emit('interstitialAdDismissed'),
    storeEvent: (tx) => emit('transactionUpdated', tx),
  };
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => 'android',
    registerPlugin: (n) => n === 'AdMob' ? AdMob : n === 'App' ? App : n === 'NativePurchases' ? NativePurchases : { hide: () => Promise.resolve(), impact: () => Promise.resolve() },
  };
};
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(MOCK);
let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const ev = (fn, a) => page.evaluate(fn, a);
const hidden = (id) => ev((id) => document.getElementById(id).hidden, id);
await page.goto('http://localhost:8123/?nosw');
await ev(() => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 30, stars: { 0: 3 }, seenTips: { a: 1 }, ads: { wins: 9, levelsSinceAd: 9, lastShownAt: 0, playSeconds: 900, freeHints: { 0: 1 } } })));
await page.reload(); await page.waitForTimeout(1500);
check(await ev(() => window.__app.ads.kind === 'admob' && window.__app.ads.testing), 'native build uses AdMob; test ids → test mode');
check(await ev(() => window.__calls.includes('prepareInterstitial') && window.__calls.includes('prepareRewardVideoAd')), 'ads preloaded after consent');
check(await ev(() => document.getElementById('install-hint').hidden), 'no "Add to Home Screen" tip in the app');

// 1. reward ad closed early: no reward, and nothing is left stuck
const startHintLevel = async () => { await ev(() => { window.__app.startLevel(5); const g = window.__app.game; g.pointerDown(0, 0); g.fails = 3; g.hud(); }); await page.waitForTimeout(300); };
await startHintLevel();
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(200);
check(await ev(() => window.__app.ads.showing && window.__app.game.paused), 'paid hint opens a reward ad; game paused');
await ev(() => window.__mock.closeReward());
await page.waitForTimeout(300);
check(await ev(() => !window.__app.ads.showing && !window.__app.game.paused && !window.__app.ui._adBusy && !window.__app.audio.ducked), 'closing early: game resumes, audio back, nothing stuck');
check(await ev(() => !window.__app.game.showHint), 'closing early gives no hint');
check(await ev(() => (window.__mock.listeners().onRewardedVideoAdReward || 0) === 0), 'reward listener removed');
// 2. watched to the end
await page.waitForTimeout(200);
await page.click('#hud-hint', { force: true });
await page.waitForTimeout(200);
await ev(() => { window.__mock.reward(); window.__mock.closeReward(); });
await page.waitForTimeout(300);
check(await ev(() => window.__app.game.showHint && !window.__app.ads.showing), 'watched reward ad unlocks the hint');
// 3. fails to show → reward granted anyway
await ev(() => { window.__app.save.longAimUntil = 0; });
await ev(() => { window.__app.ui.longAim(); });
await page.waitForTimeout(200);
await ev(() => window.__mock.failReward());
await page.waitForTimeout(300);
check(await ev(() => window.__app.ads.longAimActive() && !window.__app.ads.showing), 'ad that fails to show still grants the long aim guide');
// 4. forced ad after a win: resolves on dismiss, then continues (clear the cooldown the reward ads just started)
await ev(() => { window.__app.save.ads.lastShownAt = 0; window.__app.game.onWinEvent(400, 400); });
await page.waitForFunction(() => !document.getElementById('scr-win').hidden, null, { timeout: 6000 });
await page.waitForTimeout(500);
await page.click('#scr-win [data-act=next]', { force: true });
await page.waitForTimeout(300);
check(await ev(() => window.__calls.includes('showInterstitial') && window.__app.ads.showing), 'forced ad shows on NEXT');
await page.click('#scr-win [data-act=replay]', { force: true });
await page.waitForTimeout(100);
check(await ev(() => window.__app.game.info.index === 5 && window.__app.game.phase === 'win'), 'REPLAY is ignored while the ad is starting');
await ev(() => window.__mock.closeInterstitial());
await page.waitForTimeout(500);
check(await ev(() => !window.__app.ads.showing && window.__app.game.info.index === 6 && !window.__app.game.paused), 'after the ad the next level starts');
// 5. Android back button
await page.waitForTimeout(300);
await ev(() => window.__back());
check(!(await hidden('scr-pause')), 'back in a level opens the pause menu');
await ev(() => window.__back());
check(await hidden('scr-pause') && !(await ev(() => window.__app.game.paused)), 'back again resumes');
await ev(() => { window.__app.game.onWinEvent(400, 400); });
await page.waitForFunction(() => !document.getElementById('scr-win').hidden, null, { timeout: 6000 });
await ev(() => window.__back());
await page.waitForTimeout(500);
check(await ev(() => !document.getElementById('scr-levels').hidden && document.getElementById('scr-win').hidden), 'back on the level-complete card goes to the level list');
await ev(() => window.__back());
check(!(await hidden('scr-worlds')), 'back from levels → worlds');
await ev(() => window.__back());
check(!(await hidden('scr-title')), 'back from worlds → title');
await ev(() => window.__back());
check(await ev(() => window.__calls.includes('minimizeApp')), 'back on the title sends the app to the background');
// 6. privacy choices (EEA) and policy
await page.click('[data-act=settings]', { force: true });
await page.waitForTimeout(400);
check(!(await hidden('privacy-choices')), 'Options shows "Privacy choices" when consent rules apply');
await page.click('#privacy-choices', { force: true });
await page.waitForTimeout(200);
check(await ev(() => window.__calls.includes('showPrivacyOptionsForm')), 'it opens the consent form');
await page.click('[data-act=privacy]', { force: true });
await page.waitForTimeout(200);
check(!(await hidden('scr-privacy')) && await ev(() => /AdMob/.test(document.getElementById('privacy-text').textContent)), 'privacy policy opens in the app');
await ev(() => window.__back());
check(await hidden('scr-privacy'), 'back closes the policy');
// 8. shop with real store billing (mocked plugin)
await ev(() => window.__app.shop.ready);
check(await ev(() => window.__app.shop.kind === 'store'), 'app build uses the store (Google Play / App Store)');
check(await ev(() => window.__app.shop.isOwned('banana')), 'earlier purchase restored from the store at launch');
await ev(() => { document.getElementById('scr-privacy').hidden = true; window.__app.ui.show('scr-shop'); });
await page.waitForTimeout(300);
check(await ev(() => document.querySelector('.shop-card[data-item="carrot"] .shop-btn span').textContent === '1,09 €'), 'prices come from the store, localized (1,09 €)');
await page.click('.shop-card[data-item="carrot"] .shop-btn', { force: true }); await page.waitForTimeout(400);
check(await ev(() => window.__app.shop.isOwned('carrot') && window.__app.save.character === 'carrot'), 'buying through the store unlocks and equips');
await ev(() => { window.__store.next.item_pickle = 'pending'; });
await page.click('.shop-card[data-item="pickle"] .shop-btn', { force: true }); await page.waitForTimeout(400);
check(await ev(() => !window.__app.shop.isOwned('pickle') && /pending/.test(document.getElementById('toast').textContent)), 'pending payment: not unlocked yet, player told');
await ev(() => window.__mock.storeEvent({ productIdentifier: 'item_pickle', purchaseState: '1' }));
await page.waitForTimeout(200);
check(await ev(() => window.__app.shop.isOwned('pickle') && document.querySelector('.shop-card[data-item="pickle"] .shop-btn span').textContent === 'EQUIP'), 'pending payment unlocks when it completes');
await ev(() => { window.__store.next.item_corn = 'cancel'; });
await page.click('.shop-card[data-item="corn"] .shop-btn', { force: true }); await page.waitForTimeout(400);
check(await ev(() => !window.__app.shop.isOwned('corn') && !/didn/.test(document.getElementById('toast').textContent)), 'cancelled purchase: nothing unlocked, no error message');
await ev(() => { window.__store.next.item_corn = 'error'; });
await page.click('.shop-card[data-item="corn"] .shop-btn', { force: true }); await page.waitForTimeout(400);
check(await ev(() => !window.__app.shop.isOwned('corn') && /didn/.test(document.getElementById('toast').textContent)), 'store error: player asked to try again');
await ev(() => { window.__store.owned.push({ productIdentifier: 'item_rocket', purchaseState: '1' }); window.__app.save.owned = { banana: {}, carrot: {}, pickle: {} }; });
await page.click('#shop-restore', { force: true }); await page.waitForTimeout(500);
check(await ev(() => window.__calls.includes('restorePurchases') && window.__app.shop.isOwned('rocket')), 'Restore purchases brings back items bought on another device');
await ev(() => window.__mock.storeEvent({ productIdentifier: 'item_carrot', revocationDate: '2026-10-06' }));
check(await ev(() => !window.__app.shop.isOwned('carrot') && window.__app.save.character === 'sausage'), 'refunded (revoked) purchase is removed, sausage re-equipped');

// 7. no-fill retry loops stay bounded
await ev(() => { window.__failPrepare = true; window.__calls.length = 0; const a = window.__app.ads.provider; a.ready.interstitial = a.ready.rewarded = false; });
for (let k = 0; k < 12; k++) await ev((kind) => { window.__app.ads.provider.preload(kind); }, k % 2 ? 'interstitial' : 'rewarded');
await page.waitForTimeout(300);
const n = await ev(() => window.__calls.filter(c => c.startsWith('prepare')).length);
check(n <= 2, `12 ad opportunities while offline → ${n} load attempts (one per ad type)`);
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
