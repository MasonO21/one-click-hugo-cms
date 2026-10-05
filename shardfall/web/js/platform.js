/* Native platform bridge for the iOS / Android builds (Capacitor). On a phone it replaces the test
   stand-ins in store.js with real purchases (RevenueCat → StoreKit / Google Play Billing) and rewarded
   video (Google AdMob), and adds haptics, a hidden status bar, keep-awake and the Android back button.
   On the web it only registers the offline service worker where the browser allows it. */
(function (SF) {
  // ---- Fill these in before release (see docs/APP_STORE.md) ----------------------------------
  const CONFIG = {
    revenueCatKey: { ios: 'appl_REPLACE_ME', android: 'goog_REPLACE_ME' },
    // While the RevenueCat keys above are placeholders, purchases fall back to the free test sheet so
    // development builds stay playable. Set to false for any build you submit.
    devTestPurchases: true,
    productPrefix: 'com.shardfall.arena.',
    products: {
      gems_60: 'gems60', gems_300: 'gems300', gems_680: 'gems680', gems_1280: 'gems1280', gems_3280: 'gems3280', gems_6480: 'gems6480',
      starter_pack: 'starterpack', aether_card: 'aethercard'
    },
    admob: {
      testing: true, // Google test ads. Set false once your real ad unit ids are below.
      childDirected: false,
      rewarded: { ios: 'ca-app-pub-3940256099942544/1712485313', android: 'ca-app-pub-3940256099942544/5224354917' }
    }
  };

  SF.platform = { native: false, os: 'web', config: CONFIG, storeId: id => CONFIG.productPrefix + (CONFIG.products[id] || id) };
  SF.haptics = { tap() {}, impact() {}, success() {} };
  const quiet = p => { if (p && p.catch) p.catch(() => {}); };

  function sheet(title, text) {
    const el = document.createElement('div');
    el.className = 'sdk-overlay';
    el.innerHTML = `<div class="sdk-sheet"><h3></h3><p class="sdk-note"></p><div class="sdk-actions"><button class="btn primary">OK</button></div></div>`;
    el.querySelector('h3').textContent = title;
    el.querySelector('p').textContent = text;
    el.querySelector('button').onclick = () => el.remove();
    document.getElementById('modalRoot').appendChild(el);
    return el;
  }

  const C = window.Capacitor;
  let native = false;
  try { native = !!(C && C.isNativePlatform && C.isNativePlatform()); } catch (e) { native = false; }

  if (!native) {
    if (navigator.vibrate) SF.haptics = { tap() {}, impact() { try { navigator.vibrate(18); } catch (e) { /* ignore */ } }, success() { try { navigator.vibrate([8, 40, 8]); } catch (e) { /* ignore */ } } };
    try {
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window) {
        window.addEventListener('load', () => quiet(navigator.serviceWorker.register('sw.js')));
      }
    } catch (e) { /* sandboxed frame: no offline cache */ }
    return;
  }

  // Plugins are reached through the bridge Capacitor injects into the app's web view (no bundler needed).
  const cache = {};
  const P = new Proxy({}, { get: (_, name) => cache[name] || (cache[name] = (C.Plugins && C.Plugins[name]) || (C.registerPlugin ? C.registerPlugin(name) : null)) });
  const os = C.getPlatform();
  SF.platform.native = true; SF.platform.os = os;

  // ---- Feel ----
  if (P.Haptics) SF.haptics = {
    tap: () => quiet(P.Haptics.impact({ style: 'LIGHT' })),
    impact: () => quiet(P.Haptics.impact({ style: 'HEAVY' })),
    success: () => quiet(P.Haptics.notification({ type: 'SUCCESS' }))
  };
  if (P.StatusBar) quiet(P.StatusBar.hide());
  if (P.KeepAwake) quiet(P.KeepAwake.keepAwake());

  // Android back button: close the topmost sheet, or pause a match. Never quits by accident.
  if (P.App) quiet(P.App.addListener('backButton', () => {
    const $ = id => document.getElementById(id);
    if (document.querySelector('.sdk-overlay')) return;
    const modal = $('modal');
    if (modal) { modal.remove(); return; }
    for (const id of ['shop', 'board']) if ($(id) && !$(id).hidden) { $(id).hidden = true; return; }
    if (!$('match').hidden && $('pause').hidden) $('btnPause').click();
  }));

  // ---- In-app purchases (RevenueCat) ----
  const Purchases = P.Purchases;
  const key = os === 'ios' ? CONFIG.revenueCatKey.ios : CONFIG.revenueCatKey.android;
  const configured = !!Purchases && !/REPLACE_ME/.test(key);
  const iapReady = configured ? Purchases.configure({ apiKey: key }).then(() => true, () => false) : Promise.resolve(false);
  const testBuy = SF.iap.buy;

  SF.iap.buy = async product => {
    if (!SF.store.capAllows(product.usd)) return testBuy(product); // shows the spending-limit message
    if (!configured) {
      if (CONFIG.devTestPurchases) return testBuy(product);
      sheet('Store unavailable', 'Purchases are not set up in this build.');
      return false;
    }
    try {
      if (!(await iapReady)) throw new Error('store not ready');
      const { products } = await Purchases.getProducts({ productIdentifiers: [SF.platform.storeId(product.id)], type: 'NON_SUBSCRIPTION' });
      if (!products || !products.length) throw new Error('product not found');
      await Purchases.purchaseStoreProduct({ product: products[0] });
      SF.store.recordPurchase(product.id, product.name, products[0].price || product.usd);
      SF.sfx.play('coin');
      return true;
    } catch (e) {
      if (e && (e.userCancelled || e.code === '1' || e.code === 1)) return false;
      sheet('Purchase not completed', 'The store could not complete this purchase, and you have not been charged. Please try again later.');
      return false;
    }
  };
  // Restores the one-time Starter Pack on a new device. Gems are consumable and are not restored.
  SF.iap.restore = async () => {
    if (!configured || !(await iapReady)) throw new Error('store not ready');
    const { customerInfo } = await Purchases.restorePurchases();
    const owned = (customerInfo.nonSubscriptionTransactions || []).map(t => t.productIdentifier);
    if (owned.includes(SF.platform.storeId('starter_pack')) && !SF.store.d.starter) {
      SF.store.d.starter = true;
      SF.store.grant(SF.OFFERS.starter.rewards);
    }
    return owned;
  };

  // ---- Rewarded video (AdMob) ----
  const AdMob = P.AdMob;
  if (AdMob) {
    const unit = os === 'ios' ? CONFIG.admob.rewarded.ios : CONFIG.admob.rewarded.android;
    let init = null, prepared = false;
    const start = () => init || (init = (async () => {
      // Apple requires the App Tracking Transparency prompt before ads may use the advertising id.
      if (os === 'ios') {
        try { const st = await AdMob.trackingAuthorizationStatus(); if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization(); } catch (e) { /* older iOS */ }
      }
      await AdMob.initialize({ initializeForTesting: CONFIG.admob.testing, tagForChildDirectedTreatment: CONFIG.admob.childDirected });
      return true;
    })().catch(() => { init = null; return false; }));
    const prepare = async () => {
      if (prepared) return true;
      try { await AdMob.prepareRewardVideoAd({ adId: unit, isTesting: CONFIG.admob.testing }); prepared = true; } catch (e) { prepared = false; }
      return prepared;
    };

    SF.ads.showRewarded = async () => {
      const loading = sheet('Loading video…', 'One moment.');
      loading.querySelector('.sdk-actions').remove();
      const ok = (await start()) && (await prepare());
      loading.remove();
      if (!ok) return false;
      prepared = false;
      return new Promise(resolve => {
        let rewarded = false, done = false;
        const handles = [];
        const finish = () => {
          if (done) return;
          done = true;
          handles.forEach(h => { try { h.remove(); } catch (e) { /* ignore */ } });
          setTimeout(prepare, 1000); // preload the next one
          resolve(rewarded);
        };
        Promise.all([
          AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; }),
          AdMob.addListener('onRewardedVideoAdDismissed', finish),
          AdMob.addListener('onRewardedVideoAdFailedToShow', finish)
        ]).then(hs => {
          handles.push(...hs);
          AdMob.showRewardVideoAd().then(item => { if (item) rewarded = true; }, finish);
        });
        setTimeout(finish, 180000);
      });
    };
  }
})(window.SF);
