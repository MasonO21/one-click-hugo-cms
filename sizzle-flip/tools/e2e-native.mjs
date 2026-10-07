// Native-behaviour test: runs the game with mocked Capacitor plugins (AdMob 7/8 event semantics, App back button,
// store billing for Android and iOS, Preferences) to check the AdMob provider, Android back handling and the shop. node tools/e2e-native.mjs   (dev server on :8123)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const MOCK = (platform) => {
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
  // @capgo/native-purchases (Google Play Billing / StoreKit) with consumable semantics. The store's state
  // survives reloads (like the real store). Android: getPurchases lists paid, unconsumed purchases; a cancel
  // rejects with "Purchase is not purchased" / USER_CANCELED. iOS: getPurchases lists unfinished transactions,
  // and transactionUpdated delivers them unfinished (patched plugin). Calls that overlap are recorded: on
  // Android they would cut each other's billing connection.
  const ios = platform === 'ios';
  const S = window.__store = JSON.parse(localStorage.getItem('__store') || 'null') || {
    unconsumed: ios ? [] : [{ productIdentifier: 'hotdogs_500', transactionId: 'tok-old', purchaseToken: 'tok-old', purchaseState: '1', quantity: 1, purchaseDate: new Date().toISOString() }],
    history: ios ? [{ productIdentifier: 'hotdogs_100', transactionId: '1001', quantity: 1, finished: false, purchaseDate: new Date().toISOString() }] : [],
    next: {}, seq: 0,
  };
  const keep = () => localStorage.setItem('__store', JSON.stringify(S));
  const bal = () => (window.__app ? window.__app.shop.balance : '?');
  const price = (id) => ({ hotdogs_100: '1,09 €', hotdogs_500: '5,49 €', hotdogs_1000: '10,99 €' }[id] || '99,99 €');
  let active = 0, gate = null;
  window.__gate = () => { let open; gate = new Promise(r => { open = r; }); window.__openGate = () => { gate = null; open(); }; };
  const err = (message, code) => Object.assign(new Error(message), code ? { code } : {});
  const raw = {
    getProducts: async ({ productIdentifiers }) => ({ products: productIdentifiers.map(id => ({ identifier: id, priceString: price(id) })) }),
    getPurchases: async () => ({ purchases: ios ? S.history.filter(h => !h.finished).map(({ finished, ...tx }) => tx) : S.unconsumed.map(t => ({ ...t })) }),
    purchaseProduct: async ({ productIdentifier: pid, isConsumable, autoAcknowledgePurchases, appAccountToken }) => {
      calls.push(`purchase:${pid}:${isConsumable}:${autoAcknowledgePurchases}`);
      window.__lastToken = appAccountToken;
      if (gate) await gate;
      const how = S.next[pid] || 'ok'; delete S.next[pid];
      if (how === 'cancel') throw ios ? err('User cancelled') : err('Purchase is not purchased', 'USER_CANCELED');
      if (how === 'error') throw err('Purchase is not purchased', 'SERVICE_UNAVAILABLE');
      if (how === 'owned') throw err('Purchase is not purchased', 'ITEM_ALREADY_OWNED');
      const id = ios ? String(2000 + ++S.seq) : 'gpa-' + ++S.seq;
      const token = ios ? String(appAccountToken || '').toUpperCase() : appAccountToken;
      const base = { productIdentifier: pid, transactionId: id, quantity: 1, purchaseDate: new Date().toISOString(), appAccountToken: token };
      const tx = ios ? base : { ...base, purchaseToken: id, purchaseState: how === 'pending' ? '2' : '1' };
      if (ios) { if (how !== 'pending') S.history.push({ ...tx, finished: false }); } else S.unconsumed.push(tx);
      keep();
      if (how === 'pending') throw err(ios ? 'Transaction pending' : 'Purchase is pending');
      return tx;
    },
    consumePurchase: async ({ purchaseToken }) => {
      if (ios) throw err('consumePurchase is only available on Android');
      calls.push(`consume:${purchaseToken}:${bal()}`);
      if (S.failConsume) throw err('Service disconnected');
      S.unconsumed = S.unconsumed.filter(t => t.purchaseToken !== purchaseToken); keep();
    },
    acknowledgePurchase: async ({ purchaseToken }) => {
      calls.push(`finish:${purchaseToken}:${bal()}`);
      const t = ios && S.history.find(h => h.transactionId === purchaseToken && !h.finished);
      if (!t) throw err('Transaction not found or already finished');
      t.finished = true; keep();
    },
  };
  const NativePurchases = { addListener: on };
  for (const [name, fn] of Object.entries(raw)) {
    NativePurchases[name] = async (o) => {
      if (++active > 1) calls.push('OVERLAP:' + name);
      await new Promise(r => setTimeout(r, 5));
      try { return await fn(o); } finally { active--; }
    };
  }
  const Preferences = {
    get: async ({ key }) => ({ value: JSON.parse(localStorage.getItem('__prefs') || '{}')[key] ?? null }),
    set: async ({ key, value }) => { const p = JSON.parse(localStorage.getItem('__prefs') || '{}'); p[key] = value; localStorage.setItem('__prefs', JSON.stringify(p)); },
  };
  const App = { addListener: (ev, fn) => { if (ev === 'backButton') window.__back = fn; return on(ev, fn); }, minimizeApp: async () => { calls.push('minimizeApp'); } };
  window.__mock = {
    listeners: () => Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.size]).filter(([, n]) => n)),
    reward: () => { emit('onRewardedVideoAdReward', {}); rewardResolve && rewardResolve({}); },
    closeReward: () => emit('onRewardedVideoAdDismissed'),
    failReward: () => emit('onRewardedVideoAdFailedToShow', {}),
    closeInterstitial: () => emit('interstitialAdDismissed'),
    storeEvent: (tx) => { if (!tx.revocationDate && !S.history.some(h => h.transactionId === tx.transactionId)) { S.history.push({ ...tx, finished: false }); keep(); } emit('transactionUpdated', tx); },
  };
  window.Capacitor = {
    isNativePlatform: () => true, getPlatform: () => platform || 'android',
    registerPlugin: (n) => n === 'AdMob' ? AdMob : n === 'App' ? App : n === 'NativePurchases' ? NativePurchases : n === 'Preferences' ? Preferences : { hide: () => Promise.resolve(), impact: () => Promise.resolve() },
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
await ev(() => window.__app.shop.ready); // the first page's launch sync must not write over the seeded save
await ev(() => localStorage.clear());
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
// 8. shop with real store billing (mocked plugin, Google Play semantics): Hot Dog packs are consumables,
// credited once by transaction id, then consumed
await ev(() => window.__app.shop.ready);
const bal = () => ev(() => window.__app.shop.balance);
const calls = (p) => ev((p) => window.__calls.filter(c => c.startsWith(p)), p);
const toast = () => ev(() => document.getElementById('toast').textContent);
const resume = async () => { await ev(() => { window.__app.shop._synced = 0; document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(400); };
const tapPack = async (id) => { await page.click(`.hd-pack[data-pack="${id}"]`, { force: true }); await page.waitForTimeout(400); };
check(await ev(() => window.__app.shop.kind === 'store'), 'app build uses the store (Google Play / App Store)');
check(await bal() === 500 && (await calls('consume:tok-old:500')).length === 1, 'a purchase the app never credited (killed mid-purchase) is credited at launch, and consumed only after that');
await ev(() => { document.getElementById('scr-privacy').hidden = true; window.__app.ui.show('scr-shop'); });
await page.waitForTimeout(300);
await page.click('#shop-wallet', { force: true }); await page.waitForTimeout(300);
check(await ev(() => document.querySelector('.hd-pack[data-pack="hotdogs_100"] .hp-price').textContent === '1,09 €'), 'pack prices come from the store, localized (1,09 €)');
await tapPack('hotdogs_1000');
check(await bal() === 1500 && /\+1,000 Hot Dogs/.test(await toast()), 'buying a pack credits it (+1,000)');
check((await calls('purchase:hotdogs_1000'))[0] === 'purchase:hotdogs_1000:false:false', 'bought without auto-consume or auto-acknowledge: the app does that itself');
check((await calls('consume:gpa-1:1500')).length === 1 && await ev(() => window.__store.unconsumed.length === 0), 'consumed after crediting, so the pack can be bought again');
await ev(() => { window.__store.failConsume = true; });
await tapPack('hotdogs_100');
check(await bal() === 1600 && await ev(() => window.__store.unconsumed.length === 1), 'consume fails (connection lost): Hot Dogs credited, the store still holds the purchase');
await ev(() => { window.__store.failConsume = false; });
await resume();
check(await bal() === 1600 && await ev(() => window.__store.unconsumed.length === 0), 'next sync (app resumed) consumes it without crediting it twice');
await ev(() => { window.__store.next.hotdogs_500 = 'pending'; });
await tapPack('hotdogs_500');
check(await bal() === 1600 && /pending/.test(await toast()), 'pending payment: nothing credited yet, player told');
await resume();
check(await bal() === 1600, 'still pending at the next sync: still nothing');
await ev(() => { window.__store.unconsumed.forEach(t => { t.purchaseState = '1'; }); });
await resume();
check(await bal() === 2100 && /\+500 Hot Dogs added/.test(await toast()) && await ev(() => window.__store.unconsumed.length === 0), 'the payment clears: credited at the next resume, player told, consumed');
await ev(() => { window.__store.next.hotdogs_100 = 'cancel'; });
await tapPack('hotdogs_100');
check(await bal() === 2100 && !/didn/.test(await toast()), 'cancelled purchase: nothing credited, no error message');
await ev(() => { window.__store.next.hotdogs_100 = 'error'; });
await tapPack('hotdogs_100');
check(await bal() === 2100 && /didn/.test(await toast()), 'store error: player asked to try again');
check(await ev(() => /^[0-9a-f-]{36}$/.test(window.__lastToken) && window.__lastToken === window.__app.save.walletId), 'purchases carry this install\'s wallet id (appAccountToken)');
// an earlier purchase of the same pack still waiting to be consumed → Play says ITEM_ALREADY_OWNED
await ev(() => { const S = window.__store; S.unconsumed.push({ productIdentifier: 'hotdogs_100', transactionId: 'gpa-stuck', purchaseToken: 'gpa-stuck', purchaseState: '1', quantity: 1, purchaseDate: new Date().toISOString(), appAccountToken: window.__app.save.walletId }); S.next.hotdogs_100 = 'owned'; });
await tapPack('hotdogs_100');
check(await bal() === 2200 && /still being delivered/.test(await toast()) && await ev(() => !window.__store.unconsumed.length), '"already owned": the waiting purchase is credited and consumed, player told');
// another phone on the same Google account, mid-purchase
await ev(() => { window.__store.unconsumed.push({ productIdentifier: 'hotdogs_500', transactionId: 'gpa-other', purchaseToken: 'gpa-other', purchaseState: '1', quantity: 1, purchaseDate: new Date().toISOString(), appAccountToken: 'another-install' }); });
await resume();
check(await bal() === 2200 && await ev(() => window.__store.unconsumed.length === 1) && !(await calls('consume:gpa-other')).length, 'another device\'s purchase is left to that device');
await ev(() => { window.__store.unconsumed[0].purchaseDate = new Date(Date.now() - 2 * 864e5).toISOString(); });
await resume();
check(await bal() === 2700 && await ev(() => !window.__store.unconsumed.length), '…unless it has waited over a day (that install is gone): then it is credited here');
// returning from a bank app mid-purchase: the resume sync waits, so it can't cut off the purchase
await ev(() => window.__gate());
await page.click('.hd-pack[data-pack="hotdogs_500"]', { force: true }); await page.waitForTimeout(200);
await resume();
await ev(() => window.__openGate()); await page.waitForTimeout(500);
check(await bal() === 3200 && !(await calls('OVERLAP')).length, 'no two store calls ever overlap (a resume during a purchase waits for it)');
await ev(() => { window.__app.save.hotdogs = 2100; window.__app.shop.saveWallet(); });
// spending: no store involved
await page.click('[data-act=hotdogs-close]', { force: true }); await page.waitForTimeout(200);
const buys = (await calls('purchase:')).length;
await page.click('.shop-card[data-item="carrot"] .shop-btn', { force: true }); await page.waitForTimeout(300);
await page.click('[data-act=confirm-yes]', { force: true }); await page.waitForTimeout(400);
check(await ev(() => window.__app.shop.isOwned('carrot') && window.__app.save.character === 'carrot') && await bal() === 2000, 'a character costs 🌭100 and is equipped');
await ev(() => { window.__app.ui.shopTab = 'rides'; window.__app.ui.renderShop(); }); await page.waitForTimeout(200);
await page.click('#shop-bundle-slot .shop-btn', { force: true }); await page.waitForTimeout(300);
await page.click('[data-act=confirm-yes]', { force: true }); await page.waitForTimeout(400);
check(await ev(() => window.__app.shop.bundleOffer('rides').n === 0) && await bal() === 1280, 'the Rides bundle (9 characters) costs 🌭720');
check((await calls('purchase:')).length === buys, 'spending Hot Dogs never calls the store');
// the OS clears the web view's storage: the native copy brings the wallet back
check(await ev(() => JSON.parse(JSON.parse(localStorage.getItem('__prefs'))['sizzleflip.wallet.v1']).hotdogs === 1280), 'the wallet is mirrored to native storage (Preferences)');
await ev(() => localStorage.removeItem('sizzleflip.save.v1'));
await page.reload(); await page.waitForTimeout(1500);
await ev(() => window.__app.shop.ready);
check(await bal() === 1280 && await ev(() => window.__app.shop.isOwned('carrot') && window.__app.shop.bundleOffer('rides').n === 0), 'web storage wiped: Hot Dogs and characters come back from the native copy');
check(await ev(() => window.__app.shop.credit({ productIdentifier: 'hotdogs_1000', purchaseToken: 'gpa-1', transactionId: 'gpa-1' })) === 0, 'and earlier purchases still can\'t be credited twice');

// 7. no-fill retry loops stay bounded
await ev(() => { window.__failPrepare = true; window.__calls.length = 0; const a = window.__app.ads.provider; a.ready.interstitial = a.ready.rewarded = false; });
for (let k = 0; k < 12; k++) await ev((kind) => { window.__app.ads.provider.preload(kind); }, k % 2 ? 'interstitial' : 'rewarded');
await page.waitForTimeout(300);
const n = await ev(() => window.__calls.filter(c => c.startsWith('prepare')).length);
check(n <= 2, `12 ad opportunities while offline → ${n} load attempts (one per ad type)`);
// 9. iOS (StoreKit semantics): transactions are finished after crediting; Transaction.updates arrive
// already finished by the plugin; with SKIncludeConsumableInAppPurchaseHistory the history lists finished ones too
const ip = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
ip.on('pageerror', e => errors.push('ios: ' + e.message));
await ip.addInitScript(MOCK, 'ios');
await ip.goto('http://localhost:8123/?nosw');
await ip.evaluate(() => window.__app.shop.ready);
await ip.evaluate(() => { localStorage.clear(); localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 2, seenTips: { a: 1 } })); });
await ip.reload(); await ip.waitForTimeout(1500);
const iev = (fn, a) => ip.evaluate(fn, a);
const ibal = () => iev(() => window.__app.shop.balance);
await iev(() => window.__app.shop.ready);
check(await ibal() === 100 && await iev(() => window.__calls.includes('finish:1001:100')), 'iOS: an unfinished purchase is credited at launch, then finished');
const r = await iev(() => window.__app.shop.buyPack('hotdogs_500'));
check(r.r === 'bought' && r.n === 500 && await ibal() === 600 && await iev(() => window.__calls.includes('finish:2001:600')), 'iOS: buying credits, then finishes the transaction (its token comes back upper-case and still matches)');
await ip.reload(); await ip.waitForTimeout(1500); await iev(() => window.__app.shop.ready);
check(await ibal() === 600 && await iev(() => !window.__calls.some(c => c.startsWith('finish:'))), 'iOS relaunch: finished purchases in the history are not credited or finished again');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_1000', transactionId: '3001', quantity: 1 }));
await ip.waitForTimeout(200);
check(await ibal() === 1600 && await iev(() => /\+1,000 Hot Dogs added/.test(document.getElementById('toast').textContent) && window.__calls.includes('finish:3001:1600')), 'iOS: an Ask to Buy approval is credited, then finished, player told');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_1000', transactionId: '3001', quantity: 1 }));
await ip.waitForTimeout(200);
check(await ibal() === 1600, 'iOS: the same transaction delivered twice is credited once');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_100', transactionId: '3002', quantity: 2 }));
await ip.waitForTimeout(200);
check(await ibal() === 1800, 'iOS: quantity 2 → 2 packs');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_1000', transactionId: '3001', revocationDate: '2026-10-07T10:00:00Z' }));
await ip.waitForTimeout(200);
check(await ibal() === 800, 'iOS: a refund takes those Hot Dogs back');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_1000', transactionId: '3001', revocationDate: '2026-10-07T10:00:00Z' }));
await ip.waitForTimeout(200);
check(await ibal() === 800, 'iOS: the refund is applied once');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_5000', transactionId: '3003', quantity: 1, appAccountToken: 'ANOTHER-DEVICE', purchaseDate: new Date().toISOString() }));
await ip.waitForTimeout(200);
check(await ibal() === 800 && await iev(() => !window.__calls.includes('finish:3003:800')), 'iOS: a purchase made on another device (same Apple ID) is not credited here');
await iev(() => window.__mock.storeEvent({ productIdentifier: 'hotdogs_500', transactionId: '3004', quantity: 1, appAccountToken: window.__app.save.walletId.toUpperCase(), purchaseDate: new Date().toISOString() }));
await ip.waitForTimeout(200);
check(await ibal() === 1300, 'iOS: this install\'s own purchase (upper-case token) is credited');
check(await iev(() => !window.__calls.some(c => c.startsWith('OVERLAP'))), 'iOS: no overlapping store calls');
await ip.close();

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
if (errors.length) console.log('PAGE ERRORS:\n' + [...new Set(errors)].join('\n'));
await browser.close();
process.exit(fails || errors.length ? 1 : 0);
