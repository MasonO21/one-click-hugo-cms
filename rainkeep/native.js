/*
 * Rainkeep native adapter: window.KHNative
 *
 * One small facade the game calls for everything that differs between the
 * browser build and the App Store / Play Store build:
 *   in-app purchases (RevenueCat), local notifications, haptics, share sheet,
 *   and the offline service worker (web only).
 *
 * Native setup assumptions (see NATIVE.md for the step-by-step):
 * - The store build is a Capacitor 8 shell (capacitor.config.json, webDir "www").
 *   There is no bundler, so this file never imports @capacitor/* modules. Inside
 *   the native shell, Capacitor injects window.Capacitor before any page script
 *   runs and exposes every installed native plugin as Capacitor.Plugins.<Name>:
 *     Purchases          <- @revenuecat/purchases-capacitor
 *     LocalNotifications <- @capacitor/local-notifications
 *     Haptics            <- @capacitor/haptics
 *     Share              <- @capacitor/share
 *   Any of them may be missing (plugin not installed, older shell), so every
 *   call is feature-detected and failures resolve to a harmless value.
 * - Products are one-time purchases (no auto-renewing subscriptions). The
 *   30-day Oasis Stipend is a consumable; the game counts the days itself.
 * - RevenueCat runs with anonymous app user IDs (we never pass appUserID), so
 *   nothing identifies the player. RevenueCat finishes store transactions.
 * - In a plain browser, everything works and reports "unavailable": purchases
 *   resolve { ok:false, error:'unavailable' }, notifications are no-ops.
 *
 * Load order: include native.js before core.js (see index.html). Nothing here
 * throws; every method returns a value or a Promise that always resolves.
 */
(function (root) {
  'use strict';

  // Game's internal shop ids -> store product ids (App Store Connect / Play Console).
  var SKUS = Object.freeze({
    founder: 'com.rainkeep.founder',          // non-consumable
    stipend: 'com.rainkeep.stipend30',        // consumable (game tracks the 30 days)
    ledger: 'com.rainkeep.ledger.s1',         // non-consumable, one per season
    sg1: 'com.rainkeep.starglass.120',        // consumables
    sg2: 'com.rainkeep.starglass.330',
    sg3: 'com.rainkeep.starglass.700',
    sg4: 'com.rainkeep.starglass.1500',
    sg5: 'com.rainkeep.starglass.4000',
    sg6: 'com.rainkeep.starglass.8500',
    oasis: 'com.rainkeep.skin.oasis',         // non-consumable
    obsidian: 'com.rainkeep.skin.obsidian',   // non-consumable
    growth: 'com.rainkeep.growthfund',        // non-consumable (game pays out by Rainwyrm level)
    stormkit: 'com.rainkeep.stormkit',        // consumable, once per day (game enforces)
    warchest: 'com.rainkeep.warchest',        // consumable
  });
  var NON_CONSUMABLE = { founder: 1, ledger: 1, oasis: 1, obsidian: 1, growth: 1 };
  var BY_STORE_ID = {};
  Object.keys(SKUS).forEach(function (k) { BY_STORE_ID[SKUS[k]] = k; });

  var state = {
    initPromise: null,
    configured: false,      // RevenueCat configure() succeeded
    products: {},           // store id -> RevenueCat StoreProduct object
    loading: null,          // in-flight product fetch
    buying: false,
    notifyGranted: false,
    notifyAsked: false,     // OS permission prompt already shown this session
    notifyAsking: null,     // in-flight requestPermissions()
  };

  // ---------- helpers ----------
  function noop() {}
  function cap() { try { return root.Capacitor || null; } catch (e) { return null; } }
  function isNative() {
    try {
      var c = cap();
      return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
    } catch (e) { return false; }
  }
  function platform() {
    try { var c = cap(); return (c && typeof c.getPlatform === 'function' && String(c.getPlatform())) || 'web'; }
    catch (e) { return 'web'; }
  }
  function plugin(name) {
    if (!isNative()) return null;
    try { var c = cap(); return (c && c.Plugins && c.Plugins[name]) || null; } catch (e) { return null; }
  }
  function has(p, method) { try { return !!p && typeof p[method] === 'function'; } catch (e) { return false; } }
  // Calls a plugin method and always returns a real Promise (sync throws become rejections).
  function call(p, method, arg) {
    return new Promise(function (resolve, reject) {
      try { Promise.resolve(p[method](arg)).then(resolve, reject); } catch (e) { reject(e); }
    });
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function withTimeout(promise, ms, fallback) {
    return Promise.race([promise, delay(ms).then(function () { return fallback; })]);
  }
  function errText(e) {
    try { return String((e && (e.message || e.errorMessage)) || e || 'error'); } catch (x) { return 'error'; }
  }
  function storeId(sku) { sku = String(sku || ''); return SKUS[sku] || (BY_STORE_ID[sku] ? sku : null); }
  // Stable positive 32-bit int for a string id (Android needs an int notification id).
  function hashId(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ((h >>> 0) % 2147483646) + 1;
  }
  // Wraps a public async method so it can never throw or reject.
  function safe(fn, fallback) {
    return function () {
      var args = arguments;
      return new Promise(function (resolve) {
        try { Promise.resolve(fn.apply(null, args)).then(resolve, function () { resolve(fallback()); }); }
        catch (e) { resolve(fallback()); }
      });
    };
  }

  // ---------- service worker (web only) ----------
  function registerServiceWorker(opts) {
    try {
      if (opts.serviceWorker === false || isNative()) return;
      var nav = root.navigator, loc = root.location;
      if (!nav || !('serviceWorker' in nav) || !loc) return;
      if (!/^https?:$/.test(loc.protocol) || loc.origin === 'null' || root.isSecureContext === false) return;
      var framed = true;
      try { framed = root.self !== root.top; } catch (e) { framed = true; }
      if (framed) return; // previews / sandboxes: registration fails or leaks into the host page
      // Skip on localhost unless asked, so cache-first never serves stale files while editing.
      if (opts.serviceWorker !== true && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname)) return;
      var reg = nav.serviceWorker.register('sw.js', { scope: './' });
      if (reg && typeof reg.catch === 'function') reg.catch(noop);
    } catch (e) { /* ignore: offline play is a bonus, never a requirement */ }
  }

  // ---------- RevenueCat ----------
  function pickKey(key) {
    // Accepts one key, or { ios: 'appl_...', android: 'goog_...' } for both stores.
    if (key && typeof key === 'object') key = key[platform()] || '';
    return typeof key === 'string' && key.trim() ? key.trim() : '';
  }

  function loadProducts() {
    var P = plugin('Purchases');
    if (!state.configured || !has(P, 'getProducts')) return Promise.resolve(false);
    if (state.loading) return state.loading;
    var ids = Object.keys(SKUS).map(function (k) { return SKUS[k]; });
    // type NON_SUBSCRIPTION matters on Android (default is SUBSCRIPTION); iOS ignores it.
    state.loading = call(P, 'getProducts', { productIdentifiers: ids, type: 'NON_SUBSCRIPTION' })
      .then(function (res) {
        var list = (res && res.products) || [];
        list.forEach(function (p) { if (p && p.identifier) state.products[p.identifier] = p; });
        return Object.keys(state.products).length > 0;
      })
      .catch(function () { return false; })
      .then(function (ok) { state.loading = null; return ok; });
    return state.loading;
  }

  function configurePurchases(opts) {
    var P = plugin('Purchases');
    var apiKey = pickKey(opts.revenueCatApiKey);
    if (!P || !apiKey || !has(P, 'configure')) return Promise.resolve(false);
    if (opts.debug && has(P, 'setLogLevel')) call(P, 'setLogLevel', { level: 'DEBUG' }).catch(noop);
    // configure() has no return value on iOS, so confirm with isConfigured() when available.
    return call(P, 'configure', { apiKey: apiKey })
      .then(function () {
        if (!has(P, 'isConfigured')) return true;
        var tries = 0;
        function check() {
          return call(P, 'isConfigured').then(function (r) {
            if (r && r.isConfigured) return true;
            if (++tries >= 10) return false;
            return delay(150).then(check);
          }, function () { return tries++ < 10 ? delay(150).then(check) : false; });
        }
        return check();
      })
      .then(function (ok) {
        state.configured = !!ok;
        // Don't keep up boot on a slow network; products keep loading in the background.
        return ok ? withTimeout(loadProducts(), 8000, false) : false;
      })
      .catch(function () { return false; });
  }

  function isCancel(e) {
    try {
      var d = (e && (e.data || e.userInfo)) || {};
      return String(e && e.code) === '1' || e.userCancelled === true || d.userCancelled === true ||
        /cancel/i.test(String(d.readableErrorCode || ''));
    } catch (x) { return false; }
  }

  // ---------- local notifications ----------
  // Asks at most once per session (on first notify()); later calls only re-check, so a
  // player who said no is never nagged, and one who enables it in Settings is picked up.
  function ensureNotifyPermission(LN) {
    if (state.notifyGranted) return Promise.resolve(true);
    if (state.notifyAsking) return state.notifyAsking;
    return (has(LN, 'checkPermissions') ? call(LN, 'checkPermissions') : Promise.resolve({}))
      .then(function (r) {
        var d = r && r.display;
        if (d === 'granted' || state.notifyGranted) return true;
        if (state.notifyAsking) return state.notifyAsking; // another call is showing the prompt
        if (d === 'denied' || state.notifyAsked || !has(LN, 'requestPermissions')) return false;
        state.notifyAsked = true;
        state.notifyAsking = call(LN, 'requestPermissions')
          .then(function (q) { return !!(q && q.display === 'granted'); }, function () { return false; })
          .then(function (ok) { state.notifyGranted = state.notifyGranted || ok; state.notifyAsking = null; return ok; });
        return state.notifyAsking;
      })
      .catch(function () { return false; })
      .then(function (ok) { if (ok) state.notifyGranted = true; return ok; });
  }

  // ---------- public API ----------
  var API = {
    SKUS: SKUS,

    init: function (opts) {
      if (state.initPromise) return state.initPromise;
      opts = opts || {};
      registerServiceWorker(opts);
      state.initPromise = safe(function () {
        return configurePurchases(opts).then(function () {
          return { native: isNative(), platform: platform(), purchases: API.purchasesAvailable };
        });
      }, function () { return { native: isNative(), platform: platform(), purchases: false }; })();
      return state.initPromise;
    },

    products: safe(function () {
      var ready = Object.keys(state.products).length ? Promise.resolve(true) : loadProducts();
      return ready.then(function () {
        return Object.keys(SKUS).filter(function (k) { return state.products[SKUS[k]]; }).map(function (k) {
          var p = state.products[SKUS[k]];
          return { sku: k, productId: p.identifier, title: p.title || '', priceString: p.priceString || '',
            price: p.price, currencyCode: p.currencyCode, consumable: !NON_CONSUMABLE[k] };
        });
      });
    }, function () { return []; }),

    purchase: safe(function (sku) {
      var id = storeId(sku), P = plugin('Purchases');
      if (!state.configured || !has(P, 'purchaseStoreProduct')) return { ok: false, error: 'unavailable' };
      if (!id) return { ok: false, error: 'unknown_sku' };
      if (state.buying) return { ok: false, error: 'busy' };
      state.buying = true;
      var done = function (r) { state.buying = false; return r; };
      var ready = state.products[id] ? Promise.resolve() : loadProducts();
      return ready.then(function () {
        var product = state.products[id];
        if (!product) return { ok: false, error: 'product_not_found' };
        return call(P, 'purchaseStoreProduct', { product: product }).then(function (res) {
          var tx = res && res.transaction;
          return { ok: true, sku: BY_STORE_ID[id], productId: id,
            transactionId: (tx && tx.transactionIdentifier) || null };
        }, function (e) {
          if (isCancel(e)) return { ok: false, cancelled: true };
          var code = String(e && e.code);
          if (code === '20') return { ok: false, error: 'pending' };         // Ask to Buy / deferred
          if (code === '6') return { ok: false, error: 'already_owned' };    // call restore()
          return { ok: false, error: errText(e) };
        });
      }).then(done, function (e) { return done({ ok: false, error: errText(e) }); });
    }, function () { state.buying = false; return { ok: false, error: 'unavailable' }; }),

    // Returns the game's internal ids (founder, ledger, oasis, obsidian) the store says this player owns.
    restore: safe(function () {
      var P = plugin('Purchases');
      if (!state.configured || !has(P, 'restorePurchases')) return { ok: false, skus: [], error: 'unavailable' };
      return call(P, 'restorePurchases').then(function (res) {
        var info = (res && res.customerInfo) || {}, seen = {};
        var ids = [].concat(info.allPurchasedProductIdentifiers || [],
          (info.nonSubscriptionTransactions || []).map(function (t) { return t && t.productIdentifier; }));
        var skus = ids.map(function (i) { return BY_STORE_ID[i]; })
          .filter(function (k) { return k && NON_CONSUMABLE[k] && !seen[k] && (seen[k] = 1); });
        return { ok: true, skus: skus };
      }, function (e) { return { ok: false, skus: [], error: errText(e) }; });
    }, function () { return { ok: false, skus: [] }; }),

    // Schedules (or replaces) a notification at absolute epoch ms. Resolves true when scheduled.
    notify: safe(function (id, title, body, atMs) {
      var LN = plugin('LocalNotifications');
      var at = Number(atMs);
      if (!has(LN, 'schedule') || !isFinite(at) || at < Date.now() + 1000) return false;
      return ensureNotifyPermission(LN).then(function (ok) {
        if (!ok) return false;
        return call(LN, 'schedule', { notifications: [{
          id: hashId(id), title: String(title || 'Rainkeep'), body: String(body || ''),
          schedule: { at: new Date(at), allowWhileIdle: true }, extra: { key: String(id) },
        }] }).then(function () { return true; }, function () { return false; });
      });
    }, function () { return false; }),

    // Optional: ask for notification permission at a moment the game chooses (after a
    // soft "Want a ping when the storm hits?" prompt). notify() asks by itself otherwise.
    notifyPermission: safe(function () {
      var LN = plugin('LocalNotifications');
      return LN ? ensureNotifyPermission(LN) : false;
    }, function () { return false; }),

    cancel: safe(function (id) {
      var LN = plugin('LocalNotifications');
      if (!has(LN, 'cancel')) return false;
      return call(LN, 'cancel', { notifications: [{ id: hashId(id) }] }).then(function () { return true; });
    }, function () { return false; }),

    haptic: function (kind) {
      try {
        var H = plugin('Haptics');
        if (H) {
          if (kind === 'success' || kind === 'warning') {
            if (has(H, 'notification')) call(H, 'notification', { type: kind.toUpperCase() }).catch(noop);
          } else if (has(H, 'impact')) {
            var style = kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT';
            call(H, 'impact', { style: style }).catch(noop);
          }
          return;
        }
        var nav = root.navigator;
        if (nav && typeof nav.vibrate === 'function') {
          var pattern = { light: 8, medium: 16, heavy: 30, success: [10, 40, 10], warning: [25, 50, 25] }[kind] || 8;
          nav.vibrate(pattern);
        }
      } catch (e) { /* haptics are decoration */ }
    },

    // Opens the native share sheet (or Web Share). Resolves true if the sheet completed.
    share: safe(function (text) {
      var S = plugin('Share');
      text = String(text == null ? '' : text);
      if (has(S, 'share')) {
        return call(S, 'share', { text: text, dialogTitle: 'Share Rainkeep' }).then(function () { return true; });
      }
      var nav = root.navigator;
      if (nav && typeof nav.share === 'function') return Promise.resolve(nav.share({ text: text })).then(function () { return true; });
      return false;
    }, function () { return false; }),
  };

  Object.defineProperty(API, 'isNative', { enumerable: true, get: isNative });
  Object.defineProperty(API, 'platform', { enumerable: true, get: platform });
  Object.defineProperty(API, 'purchasesAvailable', {
    enumerable: true,
    get: function () { return !!(state.configured && Object.keys(state.products).length && isNative()); },
  });

  try { root.KHNative = API; } catch (e) { /* nothing else we can do */ }
})(typeof window !== 'undefined' ? window : this);
