/**
 * Native adapters exercised against faked Capacitor plugin modules (no device needed):
 * AdMob event flow, RevenueCat purchase/restore flow, Preferences store, Haptics.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  type Fn = (...a: any[]) => any;
  const listeners = new Map<string, Set<Fn>>();
  const emit = (name: string, payload?: unknown) => listeners.get(name)?.forEach((f) => f(payload));
  return {
    listeners,
    emit,
    /** What the fake ad does when shown. */
    scenario: { current: 'rewarded' as 'rewarded' | 'skipped' | 'failed' | 'reject' },
    consent: { status: 'REQUIRED', available: true },
    tracking: { status: 'notDetermined' },
    prepareFails: { current: false },
    rcProducts: [] as any[],
    rcCustomer: {
      allPurchasedProductIdentifiers: [] as string[],
      activeSubscriptions: [] as string[],
      allExpirationDates: {} as Record<string, string | null>,
    },
    purchase: { current: 'ok' as 'ok' | 'cancelled' | 'error' },
    prefs: new Map<string, string>(),
  };
});

vi.mock('@capacitor-community/admob', () => {
  const AdMob = {
    requestConsentInfo: vi.fn(async () => ({ isConsentFormAvailable: h.consent.available, status: h.consent.status })),
    showConsentForm: vi.fn(async () => ({})),
    trackingAuthorizationStatus: vi.fn(async () => h.tracking),
    requestTrackingAuthorization: vi.fn(async () => {}),
    initialize: vi.fn(async () => {}),
    prepareRewardVideoAd: vi.fn(async () => {
      if (h.prepareFails.current) throw new Error('no fill');
      return { adUnitId: 'x' };
    }),
    // Like the real plugin (android RewardedAdCallbackAndListeners / ios AdRewardExecutor): the promise
    // resolves ONLY when the user earns the reward, and never settles if the ad is closed early.
    showRewardVideoAd: vi.fn(() => {
      const s = h.scenario.current;
      if (s === 'reject') return Promise.reject(new Error('Reward Video is Not Ready Yet'));
      return new Promise((resolve) => {
        queueMicrotask(() => {
          if (s === 'rewarded') {
            h.emit('onRewardedVideoAdReward', { type: 'coin', amount: 1 });
            resolve({ type: 'coin', amount: 1 });
          }
          if (s === 'failed') h.emit('onRewardedVideoAdFailedToShow', { code: 1, message: 'x' });
          else h.emit('onRewardedVideoAdDismissed');
        });
      });
    }),
    addListener: vi.fn(async (name: string, fn: (...a: any[]) => any) => {
      if (!h.listeners.has(name)) h.listeners.set(name, new Set());
      h.listeners.get(name)!.add(fn);
      return { remove: async () => void h.listeners.get(name)?.delete(fn) };
    }),
  };
  return {
    AdMob,
    AdmobConsentStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED', OBTAINED: 'OBTAINED', UNKNOWN: 'UNKNOWN' },
    RewardAdPluginEvents: {
      Rewarded: 'onRewardedVideoAdReward',
      Dismissed: 'onRewardedVideoAdDismissed',
      FailedToShow: 'onRewardedVideoAdFailedToShow',
    },
  };
});

vi.mock('@revenuecat/purchases-capacitor', () => {
  const Purchases = {
    setLogLevel: vi.fn(async () => {}),
    configure: vi.fn(async () => {}),
    getProducts: vi.fn(async ({ productIdentifiers }: { productIdentifiers: string[] }) => ({
      products: h.rcProducts.filter((p) => productIdentifiers.includes(p.identifier.split(':')[0])),
    })),
    getCustomerInfo: vi.fn(async () => ({ customerInfo: h.rcCustomer })),
    purchaseStoreProduct: vi.fn(async ({ product }: { product: { identifier: string } }) => {
      if (h.purchase.current === 'cancelled') throw { userCancelled: true, code: '1', message: 'cancelled' };
      if (h.purchase.current === 'error') throw { userCancelled: false, code: '5', message: 'billing unavailable' };
      return { productIdentifier: product.identifier, customerInfo: h.rcCustomer, transaction: { transactionIdentifier: 'tx-123' } };
    }),
    restorePurchases: vi.fn(async () => ({ customerInfo: h.rcCustomer })),
  };
  return {
    Purchases,
    LOG_LEVEL: { DEBUG: 'DEBUG' },
    PRODUCT_CATEGORY: { NON_SUBSCRIPTION: 'NON_SUBSCRIPTION', SUBSCRIPTION: 'SUBSCRIPTION' },
  };
});

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: h.prefs.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void h.prefs.set(key, value)),
    remove: vi.fn(async ({ key }: { key: string }) => void h.prefs.delete(key)),
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Heavy: 'HEAVY' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}));

import { AdMob } from '@capacitor-community/admob';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { Haptics } from '@capacitor/haptics';
import { AdMobAds, TEST_REWARDED_IDS } from '../src/platform/ads';
import { RevenueCatIap } from '../src/platform/iap';
import { PreferencesStore } from '../src/platform/store';
import { CapacitorHaptics } from '../src/platform/haptics';

beforeEach(() => {
  h.listeners.clear();
  h.scenario.current = 'rewarded';
  h.consent.status = 'REQUIRED';
  h.consent.available = true;
  h.tracking.status = 'notDetermined';
  h.prepareFails.current = false;
  h.purchase.current = 'ok';
  h.prefs.clear();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('AdMobAds (faked plugin)', () => {
  it('shows no prompts and loads nothing until the first ad is requested; isReady is optimistic', () => {
    const ads = new AdMobAds('ios');
    expect(ads.isReady('x')).toBe(true);
    expect(ads.isReady('x')).toBe(true);
    expect(AdMob.requestConsentInfo).not.toHaveBeenCalled();
    expect(AdMob.initialize).not.toHaveBeenCalled();
    expect(AdMob.requestTrackingAuthorization).not.toHaveBeenCalled();
  });

  it('first ad: consent form, tracking prompt (iOS), init with test mode, loads the test unit, rewards', async () => {
    const ads = new AdMobAds('ios');
    expect(await ads.showRewarded('offline_double')).toBe('rewarded');
    expect(AdMob.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(AdMob.showConsentForm).toHaveBeenCalledTimes(1);
    expect(AdMob.requestTrackingAuthorization).toHaveBeenCalledTimes(1);
    expect(AdMob.initialize).toHaveBeenCalledWith({ initializeForTesting: true });
    expect(AdMob.prepareRewardVideoAd).toHaveBeenCalledWith({ adId: TEST_REWARDED_IDS.ios, isTesting: true });
    expect(AdMob.showRewardVideoAd).toHaveBeenCalledTimes(1);
    // listeners are always cleaned up, and the next ad is preloaded
    await vi.waitFor(() => expect(AdMob.prepareRewardVideoAd).toHaveBeenCalledTimes(2));
    for (const set of h.listeners.values()) expect(set.size).toBe(0);
    // second ad: no second consent/ATT/init
    expect(await ads.showRewarded('production_boost')).toBe('rewarded');
    expect(AdMob.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(AdMob.initialize).toHaveBeenCalledTimes(1);
  });

  it('Android: no tracking prompt; consent form only when required', async () => {
    h.consent.status = 'NOT_REQUIRED';
    const ads = new AdMobAds('android');
    expect(await ads.showRewarded('x')).toBe('rewarded');
    expect(AdMob.showConsentForm).not.toHaveBeenCalled();
    expect(AdMob.trackingAuthorizationStatus).not.toHaveBeenCalled();
    expect(AdMob.prepareRewardVideoAd).toHaveBeenCalledWith({ adId: TEST_REWARDED_IDS.android, isTesting: true });
  });

  it('closing the ad before the reward is "skipped"', async () => {
    h.scenario.current = 'skipped';
    expect(await new AdMobAds('android').showRewarded('x')).toBe('skipped');
  });

  it('a failure to show is "unavailable"; so is a rejected show call', async () => {
    h.scenario.current = 'failed';
    expect(await new AdMobAds('android').showRewarded('x')).toBe('unavailable');
    h.scenario.current = 'reject';
    expect(await new AdMobAds('android').showRewarded('x')).toBe('unavailable');
  });

  it('no fill: "unavailable", isReady turns false for a while instead of hammering the network', async () => {
    h.prepareFails.current = true;
    const ads = new AdMobAds('android');
    expect(await ads.showRewarded('x')).toBe('unavailable');
    expect(ads.isReady('x')).toBe(false);
    const calls = vi.mocked(AdMob.prepareRewardVideoAd).mock.calls.length;
    expect(ads.isReady('x')).toBe(false);
    expect(vi.mocked(AdMob.prepareRewardVideoAd).mock.calls.length).toBe(calls);
  });

  it('a consent-flow error never blocks ads from loading', async () => {
    vi.mocked(AdMob.requestConsentInfo).mockRejectedValueOnce(new Error('offline'));
    expect(await new AdMobAds('android').showRewarded('x')).toBe('rewarded');
  });
});

describe('RevenueCatIap (faked plugin)', () => {
  const catalogue = [
    { id: 'nova_crystals_small', type: 'consumable' as const },
    { id: 'nova_starter_pack', type: 'non_consumable' as const },
    { id: 'colony_pass_monthly', type: 'subscription' as const },
  ];
  const product = (identifier: string, price: number, priceString: string) => ({ identifier, price, priceString, currencyCode: 'EUR' });

  it('configures with the key, loads localized store prices and exposes them', async () => {
    h.rcProducts = [product('nova_crystals_small', 4.99, '4,99 €'), product('colony_pass_monthly:monthly', 7.99, '7,99 €')];
    const iap = new RevenueCatIap('ios', 'appl_test_key');
    await iap.init(catalogue);
    expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: 'appl_test_key' });
    expect(iap.products()).toEqual([
      { id: 'nova_crystals_small', price: '4,99 €', priceMicros: 4_990_000, currency: 'EUR', available: true },
      { id: 'nova_starter_pack', price: '', available: false },
      { id: 'colony_pass_monthly', price: '7,99 €', priceMicros: 7_990_000, currency: 'EUR', available: true },
    ]);
  });

  it('purchases a store product and reports the transaction id', async () => {
    h.rcProducts = [product('nova_crystals_small', 4.99, '$4.99')];
    const iap = new RevenueCatIap('android', 'goog_key');
    await iap.init(catalogue);
    expect(await iap.purchase('nova_crystals_small')).toEqual({ ok: true, productId: 'nova_crystals_small', transactionId: 'tx-123' });
    expect(await iap.purchase('nova_starter_pack')).toMatchObject({ ok: false, error: 'store_unavailable' }); // not in the store
  });

  it('distinguishes a cancelled purchase from a failed one', async () => {
    h.rcProducts = [product('nova_crystals_small', 4.99, '$4.99')];
    const iap = new RevenueCatIap('android', 'goog_key');
    await iap.init(catalogue);
    h.purchase.current = 'cancelled';
    expect(await iap.purchase('nova_crystals_small')).toEqual({ ok: false, productId: 'nova_crystals_small', cancelled: true });
    h.purchase.current = 'error';
    expect(await iap.purchase('nova_crystals_small')).toEqual({ ok: false, productId: 'nova_crystals_small', error: 'billing unavailable' });
  });

  it('restores owned products (Google base-plan suffix stripped) and reads the subscription expiry', async () => {
    h.rcProducts = [];
    h.rcCustomer.allPurchasedProductIdentifiers = ['nova_starter_pack', 'colony_pass_monthly:monthly'];
    h.rcCustomer.activeSubscriptions = ['colony_pass_monthly:monthly'];
    h.rcCustomer.allExpirationDates = { 'colony_pass_monthly:monthly': '2026-07-20T10:00:00Z' };
    const iap = new RevenueCatIap('android', 'goog_key');
    await iap.init(catalogue);
    expect((await iap.restore()).sort()).toEqual(['colony_pass_monthly', 'nova_starter_pack']);
    expect(await iap.subscriptionExpiry('colony_pass_monthly')).toBe(Date.parse('2026-07-20T10:00:00Z'));
    expect(await iap.subscriptionExpiry('nova_starter_pack')).toBeNull();
  });

  it('survives an SDK that fails to configure', async () => {
    vi.mocked(Purchases.configure).mockRejectedValueOnce(new Error('bad key'));
    const iap = new RevenueCatIap('ios', 'appl_bad');
    await iap.init(catalogue);
    expect(iap.products().every((p) => !p.available)).toBe(true);
    expect(await iap.purchase('nova_crystals_small')).toMatchObject({ ok: false });
  });
});

describe('PreferencesStore & CapacitorHaptics (faked plugins)', () => {
  it('stores through Capacitor Preferences', async () => {
    const s = new PreferencesStore();
    expect(await s.get('k')).toBeNull();
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
    await s.remove('k');
    expect(await s.get('k')).toBeNull();
  });

  it('maps haptic calls and respects the settings toggle', async () => {
    const hp = new CapacitorHaptics();
    hp.success();
    await vi.waitFor(() => expect(Haptics.notification).toHaveBeenCalledWith({ type: 'SUCCESS' }));
    hp.setEnabled(false);
    hp.heavy();
    hp.warning();
    await new Promise((r) => setTimeout(r, 20));
    expect(Haptics.impact).not.toHaveBeenCalled();
    expect(Haptics.notification).toHaveBeenCalledTimes(1);
    hp.setEnabled(true);
    await new Promise((r) => setTimeout(r, 200)); // rate limit window
    hp.heavy();
    await vi.waitFor(() => expect(Haptics.impact).toHaveBeenCalledWith({ style: 'HEAVY' }));
  });

  it("a button's own success / heavy is not swallowed by the press tap just before it; repeats still are", async () => {
    const hp = new CapacitorHaptics();
    // tapping "Collect" / "Upgrade to Stone": the UI's press tap, then the button's own feedback, then a sim listener
    hp.tap();
    hp.success();
    hp.heavy();
    // the same moment reported again inside the gap (two listeners, a burst of events)
    hp.heavy();
    hp.success();
    hp.warning();
    hp.tap();
    await new Promise((r) => setTimeout(r, 20));
    expect(vi.mocked(Haptics.impact).mock.calls.map((c) => c[0])).toEqual([{ style: 'LIGHT' }, { style: 'HEAVY' }]);
    expect(vi.mocked(Haptics.notification).mock.calls.map((c) => c[0])).toEqual([{ type: 'SUCCESS' }]);
  });
});
