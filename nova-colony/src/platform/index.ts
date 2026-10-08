/**
 * Platform service factory: picks Capacitor native adapters on iOS/Android and web implementations
 * otherwise. Native plugins are imported lazily, so the web build never needs them at runtime.
 * OWNER: meta agent.
 */
import type { PlatformServices } from './types';
import { env, platformName, type PlatformName } from './env';
import { LocalStorageStore, PreferencesStore } from './store';
import { AdMobAds, DevAds } from './ads';
import { RevenueCatIap, WebMockIap } from './iap';
import { AnalyticsClient } from './analytics';
import { CapacitorHaptics, NoopHaptics } from './haptics';
import { HttpCloudSave } from './cloud';
import { CapacitorNotifications, NoopNotifications } from './notifications';
import { NoopAchievements } from './achievements';
import { CapacitorShare, WebShare } from './share';

export interface PlatformOptions {
  /** Force the web adapters even inside Capacitor (debugging). */
  forceWeb?: boolean;
}

export async function createPlatformServices(opts: PlatformOptions = {}): Promise<PlatformServices> {
  const platform: PlatformName = opts.forceWeb ? 'web' : platformName();
  const native = platform !== 'web';
  const store = native ? new PreferencesStore() : new LocalStorageStore();

  const analytics = new AnalyticsClient({ store, platform, appVersion: env('VITE_APP_VERSION') || '0.1.0' });
  const cloud = new HttpCloudSave(store);
  await Promise.all([analytics.init().catch(() => {}), cloud.init().catch(() => {})]);

  return {
    platform,
    store,
    ads: native ? new AdMobAds(platform as 'ios' | 'android') : new DevAds(),
    iap: native ? new RevenueCatIap(platform as 'ios' | 'android') : new WebMockIap(),
    analytics,
    haptics: native ? new CapacitorHaptics() : new NoopHaptics(),
    cloud,
    notifications: native ? new CapacitorNotifications(platform as 'ios' | 'android') : new NoopNotifications(),
    // Game Center / Play Games plug in here later (docs/MOBILE.md); today unlocks are only kept in the save
    achievements: new NoopAchievements(),
    // Photo Mode: the OS share sheet (cache file + @capacitor/share) natively, Web Share API / a download on the web
    share: native ? new CapacitorShare() : new WebShare(),
  };
}

export { SaveManager, activeSaveManager } from './save';
export { installPlatformHooks } from './hooks';
export { installAnalyticsHooks } from './analyticsHooks';
