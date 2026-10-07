/**
 * Rewarded ads.
 *  - AdMobAds : @capacitor-community/admob on iOS/Android. Ad unit ids come from
 *               VITE_ADMOB_REWARDED_IOS / VITE_ADMOB_REWARDED_ANDROID and fall back to Google's official
 *               TEST ids (so a build without ids can never serve live ads by accident).
 *  - DevAds   : web/dev — a clearly labelled DOM "DEV AD" overlay with a 3 s countdown. No network.
 *
 * Ads are always optional and always for a reward; the game never shows interstitials or banners.
 * OWNER: meta agent.
 */
import type { AdResult, AdService } from './types';
import { env, isDevBuild, withTimeout } from './env';

/** Google's published sample rewarded ad units (always return test ads). */
export const TEST_REWARDED_IDS = {
  ios: 'ca-app-pub-3940256099942544/1712485313',
  android: 'ca-app-pub-3940256099942544/5224354917',
} as const;

type AdMobModule = typeof import('@capacitor-community/admob');

export class AdMobAds implements AdService {
  private mod: Promise<AdMobModule> | null = null;
  private initP: Promise<boolean> | null = null;
  private initOk: boolean | null = null;
  private loaded = false;
  private loading: Promise<boolean> | null = null;
  private lastLoadFailedAt = 0;

  constructor(private readonly platform: 'ios' | 'android') {}

  /** Rewarded unit id + whether to request test ads. */
  unit(): { id: string; testing: boolean } {
    const configured = env(this.platform === 'ios' ? 'VITE_ADMOB_REWARDED_IOS' : 'VITE_ADMOB_REWARDED_ANDROID');
    const forceTest = env('VITE_ADMOB_TESTING') === 'true' || isDevBuild();
    if (!configured) return { id: TEST_REWARDED_IDS[this.platform], testing: true };
    return { id: configured, testing: forceTest };
  }

  private plugin(): Promise<AdMobModule> {
    this.mod ??= import('@capacitor-community/admob');
    return this.mod;
  }

  /**
   * One-time SDK init: consent (UMP), iOS tracking prompt, SDK start. Runs on the FIRST `showRewarded`
   * (never as a side effect of `isReady`), so the system prompts appear when the player asks for an ad —
   * not at launch, not during the tutorial.
   */
  private ensureInit(): Promise<boolean> {
    this.initP ??= (async () => {
      try {
        const { AdMob, AdmobConsentStatus } = await this.plugin();
        try {
          const info = await AdMob.requestConsentInfo();
          if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
        } catch (e) {
          console.warn('[ads] consent flow skipped', e);
        }
        if (this.platform === 'ios') {
          try {
            if ((await AdMob.trackingAuthorizationStatus()).status === 'notDetermined') await AdMob.requestTrackingAuthorization();
          } catch (e) {
            console.warn('[ads] tracking prompt skipped', e);
          }
        }
        await AdMob.initialize({ initializeForTesting: this.unit().testing });
        this.initOk = true;
        return true;
      } catch (e) {
        console.warn('[ads] AdMob unavailable', e);
        this.initOk = false;
        return false;
      }
    })();
    return this.initP;
  }

  /** Load the next rewarded ad in the background. */
  private preload(): Promise<boolean> {
    if (this.loaded) return Promise.resolve(true);
    this.loading ??= (async () => {
      try {
        if (!(await this.ensureInit())) return false;
        const { AdMob } = await this.plugin();
        const { id, testing } = this.unit();
        await AdMob.prepareRewardVideoAd({ adId: id, isTesting: testing });
        this.loaded = true;
        return true;
      } catch (e) {
        console.warn('[ads] rewarded ad failed to load', e);
        this.loaded = false;
        this.lastLoadFailedAt = Date.now();
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /**
   * Optimistic: true until the SDK has been initialised (the first show does that), then true while an
   * ad is loaded/loading and false briefly after a failed load. Never triggers prompts.
   */
  isReady(_placement: string): boolean {
    if (this.initOk === null) return true;
    if (!this.initOk) return false;
    if (this.loaded || this.loading) return true;
    if (Date.now() - this.lastLoadFailedAt < 30_000) return false;
    void this.preload();
    return true;
  }

  async showRewarded(_placement: string): Promise<AdResult> {
    if (!(await this.ensureInit())) return 'unavailable'; // consent / ATT prompts may take as long as the player needs
    if (!(await withTimeout(this.preload(), 8000, false))) return 'unavailable';
    const { AdMob, RewardAdPluginEvents } = await this.plugin();
    let earned = false;
    let failed = false;
    const handles: { remove: () => Promise<void> }[] = [];
    try {
      let onClosed: () => void = () => {};
      const closed = new Promise<void>((resolve) => {
        onClosed = resolve;
      });
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (earned = true)));
      handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => onClosed()));
      handles.push(
        await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => {
          failed = true;
          onClosed();
        }),
      );
      this.loaded = false;
      // Some plugin versions never resolve this promise when the ad is dismissed early, so the events drive the flow.
      AdMob.showRewardVideoAd().then(
        () => (earned = true),
        () => {
          failed = true;
          onClosed();
        },
      );
      await withTimeout(closed, 5 * 60_000, undefined);
      await new Promise((r) => setTimeout(r, 120)); // let a trailing Rewarded event land
      return failed && !earned ? 'unavailable' : earned ? 'rewarded' : 'skipped';
    } catch (e) {
      console.warn('[ads] rewarded ad error', e);
      return earned ? 'rewarded' : 'unavailable';
    } finally {
      handles.forEach((h) => void h.remove());
      void this.preload();
    }
  }
}

export interface DevAdOptions {
  /** Countdown length in seconds (default 3). */
  seconds?: number;
}

/**
 * Web / dev "ad": an unmistakable placeholder overlay. After the countdown the player can claim the
 * reward; closing early (Skip) gives nothing — exactly like a real rewarded ad. Outside a browser
 * (unit tests) it resolves 'rewarded' immediately.
 */
export class DevAds implements AdService {
  constructor(private readonly opts: DevAdOptions = {}) {}

  isReady(_placement: string): boolean {
    return true;
  }

  showRewarded(placement: string): Promise<AdResult> {
    if (typeof document === 'undefined' || !document.body) return Promise.resolve('rewarded');
    const seconds = this.opts.seconds ?? 3;
    return new Promise<AdResult>((resolve) => {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-label', 'Development placeholder ad');
      overlay.dataset.devAd = placement;
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(8,14,24,.92);font:600 16px system-ui,sans-serif;color:#fff;touch-action:manipulation;';
      overlay.innerHTML =
        '<div style="width:min(86vw,380px);padding:22px;border-radius:18px;background:#16263a;border:3px dashed #ffd84a;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.5)">' +
        '<div style="display:inline-block;padding:3px 12px;border-radius:99px;background:#ffd84a;color:#2a2200;font-weight:800;letter-spacing:.12em">DEV AD</div>' +
        '<div style="margin:14px 0 6px;font-size:20px">Pretend rewarded video</div>' +
        '<div style="opacity:.75;font-size:13px;line-height:1.4">Placeholder shown only in web/dev builds.<br>No real ad is loaded. Placement: <b data-p></b></div>' +
        '<div style="margin:18px 0 8px;height:8px;border-radius:99px;background:#0c1726;overflow:hidden"><div data-bar style="height:100%;width:0;background:#5ef2ff"></div></div>' +
        '<div data-label style="min-height:22px;font-size:14px"></div>' +
        '<div style="display:flex;gap:10px;justify-content:center;margin-top:14px">' +
        '<button data-skip style="padding:10px 16px;border:0;border-radius:12px;background:#33465c;color:#fff;font:inherit;cursor:pointer">Skip (no reward)</button>' +
        '<button data-claim disabled style="padding:10px 16px;border:0;border-radius:12px;background:#3fbf6a;color:#06210f;font:inherit;cursor:pointer;opacity:.4">Close &amp; claim reward</button>' +
        '</div></div>';
      (overlay.querySelector('[data-p]') as HTMLElement).textContent = placement;
      const bar = overlay.querySelector('[data-bar]') as HTMLElement;
      const label = overlay.querySelector('[data-label]') as HTMLElement;
      const skip = overlay.querySelector('[data-skip]') as HTMLButtonElement;
      const claim = overlay.querySelector('[data-claim]') as HTMLButtonElement;

      const startedAt = performance.now();
      let done = false;
      const finish = (r: AdResult) => {
        if (done) return;
        done = true;
        clearInterval(timer);
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(r);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') finish('skipped');
      };
      const tick = () => {
        const t = (performance.now() - startedAt) / 1000;
        bar.style.width = `${Math.min(100, (t / seconds) * 100)}%`;
        if (t >= seconds) {
          label.textContent = 'Reward ready!';
          claim.disabled = false;
          claim.style.opacity = '1';
        } else label.textContent = `Reward in ${Math.ceil(seconds - t)}…`;
      };
      const timer = setInterval(tick, 100);
      skip.onclick = () => finish('skipped');
      claim.onclick = () => finish('rewarded');
      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      tick();
    });
  }
}
