// Ads: the pacing rules (when an ad may appear) and the provider that actually shows it.
//
//  • Forced ("interstitial") ads only appear when the player leaves a level-complete screen
//    (Next / Levels) — never during a level, on retry, on pause or after a fail.
//  • Opt-in ("rewarded") ads unlock hints after the free one per world, let a stuck player skip, and turn on
//    the long aim guide for 10 minutes.
//  • The Capacitor app uses AdMob (ids in src/ads-config.js — Google's public TEST ids until you replace them).
//  • The web build has no ad network. In test contexts (the Claude artifact, a localhost dev server, ?adtest)
//    a clearly labelled placeholder ad stands in so the whole flow can be tried; a deployed web build shows none.

import { NATIVE, PLATFORM, nativePlugin } from './native.js';
import { ADMOB_UNITS } from './ads-config.js';
export { ADMOB_UNITS, GOOGLE_TEST_PUB } from './ads-config.js';

export const AD_RULES = {
  firstAdAfterWins: 5,      // no forced ad until 5 levels have been beaten…
  firstAdAfterSeconds: 300, // …and 5 minutes have been played
  levelsBetween: 3,         // at most one forced ad every 3rd level beaten…
  secondsBetween: 180,      // …and at least 3 minutes since the previous ad
  graceFails: 10,           // no forced ad right after a level that took 10+ fails
  freeHintsPerWorld: 1,     // the first hint in each world is free; later ones cost an opt-in ad
  skipAfterFails: 8,        // offer "watch an ad to skip" after 8 fails on an unbeaten level
  longAimMinutes: 10,       // one reward ad = 10 minutes (real time) of the long aim guide
};

// Fast pacing for trying the flow (Settings → Ad testing, or ?adtest in the URL).
const FAST_RULES = { firstAdAfterWins: 1, firstAdAfterSeconds: 0, levelsBetween: 1, secondsBetween: 20, graceFails: 10, freeHintsPerWorld: 1, skipAfterFails: 2, longAimMinutes: 1 };

const AD_TEST_URL = /(^|[?&#])adtest\b/.test(location.search + location.hash);
const WEB_TEST_CONTEXT = !!window.__ARTIFACT || AD_TEST_URL || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const WEB_ADS = WEB_TEST_CONTEXT ? 'test' : 'off'; // 'test' = placeholder ads, 'off' = no ads on the web

export const DEFAULT_AD_STATE = () => ({ wins: 0, levelsSinceAd: 0, lastShownAt: 0, interstitials: 0, rewarded: 0, playSeconds: 0, freeHints: {} });

// Pure pacing decision (unit-testable). Returns [show, reason].
export function interstitialDecision(st, ctx, now, rules = AD_RULES) {
  if (st.removed) return [false, 'ads removed'];
  if (ctx.worldEnd) return [false, 'world-complete celebration'];
  if (st.wins < rules.firstAdAfterWins) return [false, `first ${rules.firstAdAfterWins} levels are ad-free`];
  if (st.playSeconds < rules.firstAdAfterSeconds) return [false, 'first minutes are ad-free'];
  if ((ctx.fails || 0) >= rules.graceFails) return [false, 'grace after a hard-won level'];
  if (st.levelsSinceAd < rules.levelsBetween) return [false, `only ${st.levelsSinceAd}/${rules.levelsBetween} levels since last ad`];
  const since = (now - (st.lastShownAt || 0)) / 1000;
  if (since < rules.secondsBetween) return [false, `cooldown (${Math.round(since)}s/${rules.secondsBetween}s)`];
  return [true, 'ok'];
}

export class AdManager {
  constructor(app) {
    this.app = app;
    this.fastUrl = AD_TEST_URL;
    this.provider = pickProvider(app);
    this.showing = false;
    this._saveT = 0;
    this.provider.init && this.provider.init().catch(() => {});
  }

  get st() {
    const s = this.app.save;
    if (!s.ads || !s.ads.freeHints) s.ads = { ...DEFAULT_AD_STATE(), ...(s.ads || {}), freeHints: (s.ads && s.ads.freeHints) || {} };
    return s.ads;
  }

  get rules() { return this.fastUrl || this.app.save.adFast ? FAST_RULES : AD_RULES; }
  get enabled() { return this.provider.kind !== 'none'; }
  get kind() { return this.provider.kind; }
  // the Settings "Ad testing" panel: only with placeholder ads or AdMob test ids, never in a release build
  get testing() { return this.kind === 'test' || (this.kind === 'admob' && ADMOB_UNITS.testing); }
  // "Remove ads" purchase (future IAP): forced ads stop, opt-in reward ads stay available.
  get removed() { return !!this.app.save.adsRemoved; }

  // Called every frame while a real level is being played (not paused, not on menus).
  tickPlay(dt) {
    this.st.playSeconds += dt;
    this._saveT += dt;
    if (this._saveT > 10) { this._saveT = 0; this.app.persist(); }
  }

  onLevelComplete() {
    this.st.wins++;
    this.st.levelsSinceAd++;
    this.app.persist();
  }

  // Forced ad at a natural break. Resolves when it's safe to continue (ad closed or skipped).
  async maybeInterstitial(ctx) {
    const [show, why] = interstitialDecision({ ...this.st, removed: this.removed }, ctx, Date.now(), this.rules);
    console.info(`[ads] interstitial ${show ? 'SHOW' : 'skip'} — ${why}`);
    if (!show || !this.enabled) return false;
    const shown = await this.present(() => this.provider.showInterstitial());
    if (shown !== false) {
      this.st.levelsSinceAd = 0;
      this.st.lastShownAt = Date.now();
      this.st.interstitials++;
      this.app.persist();
    }
    return shown !== false;
  }

  hintIsFree(worldIndex) {
    return (this.st.freeHints[worldIndex] || 0) < this.rules.freeHintsPerWorld;
  }

  useFreeHint(worldIndex) {
    this.st.freeHints[worldIndex] = (this.st.freeHints[worldIndex] || 0) + 1;
    this.app.persist();
  }

  canOfferSkip(game) {
    const i = game.info.index;
    const s = this.app.save;
    // never the final level — that flip has to be earned
    return i < this.app.levels.length - 1 && game.phase !== 'win' && (game.fails || 0) >= this.rules.skipAfterFails && !s.stars[i] && !(s.skipped && s.skipped[i]);
  }

  // Long aim guide: a timed booster. The expiry is a timestamp in the save, so it survives reloads.
  longAimLeft() { return Math.max(0, (this.app.save.longAimUntil || 0) - Date.now()); }
  longAimActive() { return this.longAimLeft() > 0; }

  // Resolves 'rewarded' / 'nofill' (both turn it on) or 'closed' (ad skipped early: nothing).
  async unlockLongAim() {
    if (this.longAimActive()) return 'active';
    const r = await this.rewarded('aim');
    if (r === 'closed' || r === false) return 'closed';
    this.app.save.longAimUntil = Date.now() + this.rules.longAimMinutes * 60000;
    this.app.persist();
    return r;
  }

  // Opt-in ad. Resolves 'rewarded' | 'closed' | 'nofill' (no ad available — callers grant the reward anyway).
  async rewarded(purpose) {
    if (!this.enabled) return 'nofill';
    const res = await this.present(() => this.provider.showRewarded(purpose));
    console.info(`[ads] rewarded (${purpose}) → ${res}`);
    if (res === 'rewarded') {
      this.st.rewarded++;
      this.st.lastShownAt = Date.now(); // keep forced ads from landing right after an opt-in one
      this.app.persist();
    }
    return res;
  }

  // Pause the game and silence its audio while any ad is on screen.
  async present(fn) {
    if (this.showing) return false;
    this.showing = true;
    const app = this.app;
    const wasPaused = app.game && app.game.paused;
    app.pause(true);
    app.audio.duck(true);
    try { return await fn(); } catch (e) { console.warn('[ads] provider error', e); return 'nofill'; } finally {
      app.audio.duck(false);
      if (!wasPaused) app.pause(false);
      this.showing = false;
    }
  }

  // Settings → Ad testing: show an ad without touching the pacing counters.
  preview(kind) {
    return this.present(() => kind === 'rewarded' ? this.provider.showRewarded('preview') : this.provider.showInterstitial());
  }

  get privacyOptionsAvailable() { return !!this.provider.privacyOptions; }
  showPrivacyOptions() { return this.provider.showPrivacyOptions ? this.provider.showPrivacyOptions() : Promise.resolve(); }

  setRemoved(on) { this.app.setSetting('adsRemoved', !!on); }

  // One-line pacing summary for the ad-testing panel.
  status() {
    const st = this.st, r = this.rules;
    const [show, why] = interstitialDecision({ ...st, removed: this.removed }, {}, Date.now(), r);
    return `Provider: ${this.kind} · levels beaten ${st.wins} · since last ad ${Math.min(st.levelsSinceAd, r.levelsBetween)}/${r.levelsBetween} · played ${Math.floor(st.playSeconds / 60)}m ${Math.floor(st.playSeconds % 60)}s\n` +
      `Ads shown: ${st.interstitials} forced, ${st.rewarded} reward · next level-complete: ${show ? 'ad will show' : 'no ad — ' + why}`;
  }
}

// ------------------------------------------------------------------ providers

function pickProvider(app) {
  if (NATIVE) return new AdMobProvider();
  if (WEB_ADS === 'test') return new TestAdProvider(app);
  return { kind: 'none', showInterstitial: async () => false, showRewarded: async () => 'nofill' };
}

// AdMob through @capacitor-community/admob (native plugin registered as "AdMob").
class AdMobProvider {
  constructor() {
    this.kind = 'admob';
    this.plugin = nativePlugin('AdMob');
    this.platform = PLATFORM;
    this.units = ADMOB_UNITS[this.platform === 'ios' ? 'ios' : 'android'];
    this.ready = { interstitial: false, rewarded: false };
    this.loading = { interstitial: false, rewarded: false };
    this.retry = {};
    this.canRequest = false;
    this.privacyOptions = false;
  }

  async init() {
    const A = this.plugin;
    await A.initialize({
      initializeForTesting: ADMOB_UNITS.testing, testingDevices: ADMOB_UNITS.testingDevices,
      maxAdContentRating: ADMOB_UNITS.maxAdContentRating, tagForChildDirectedTreatment: ADMOB_UNITS.childDirected,
    });
    // GDPR/UMP consent first; ads are only requested once the SDK says it may.
    let info = null;
    try {
      info = await A.requestConsentInfo();
      if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') info = await A.showConsentForm();
    } catch (e) { /* no consent message configured (e.g. test ids) */ }
    this.canRequest = !info || info.canRequestAds !== false;
    this.privacyOptions = !!(info && info.privacyOptionsRequirementStatus === 'REQUIRED');
    if (this.platform === 'ios') { try { await A.requestTrackingAuthorization(); } catch (e) { /* noop */ } }
    this.preload('interstitial');
    this.preload('rewarded');
  }

  // Settings → "Privacy choices" (required in the EEA/UK so players can change their consent).
  async showPrivacyOptions() {
    for (const k of ['interstitial', 'rewarded']) { clearTimeout(this.retry[k]); this.retry[k] = null; }
    try {
      const info = await this.plugin.showPrivacyOptionsForm().then(() => this.plugin.requestConsentInfo());
      if (info) this.canRequest = info.canRequestAds !== false;
    } catch (e) { /* noop */ }
    this.preload('interstitial');
    this.preload('rewarded');
  }

  // One load per ad type at a time, and a single 30 s retry timer after a failure.
  async preload(kind) {
    // skip while loaded, loading, or waiting for the scheduled retry after a failure
    if (!this.canRequest || this.ready[kind] || this.loading[kind] || this.retry[kind]) return;
    this.loading[kind] = true;
    const opts = { adId: this.units[kind], isTesting: ADMOB_UNITS.testing };
    try {
      if (kind === 'interstitial') await this.plugin.prepareInterstitial(opts);
      else await this.plugin.prepareRewardVideoAd(opts);
      this.ready[kind] = true;
    } catch (e) {
      this.retry[kind] = setTimeout(() => { this.retry[kind] = null; this.preload(kind); }, 30000);
    } finally { this.loading[kind] = false; }
  }

  // Resolves with the first end event. The safety timeout only covers an ad that never appears:
  // once it is on screen the player may watch it (or visit the store) for as long as they like.
  watch(endEvents, shownEvent) {
    const handles = [];
    let finish;
    const done = new Promise((resolve) => { finish = resolve; });
    let t = setTimeout(() => finish('timeout'), 15000);
    const end = (name) => { clearTimeout(t); handles.forEach(h => h && h.remove && h.remove()); finish(name); };
    const add = (ev, fn) => Promise.resolve(this.plugin.addListener(ev, fn)).then(h => handles.push(h));
    const ready = Promise.all([
      ...endEvents.map(ev => add(ev, () => end(ev))),
      add(shownEvent, () => { clearTimeout(t); t = setTimeout(() => end('timeout'), 30 * 60 * 1000); }),
    ]);
    return { ready, done, end };
  }

  async showInterstitial() {
    if (!this.ready.interstitial) { this.preload('interstitial'); return false; }
    this.ready.interstitial = false;
    const w = this.watch(['interstitialAdDismissed', 'interstitialAdFailedToShow'], 'interstitialAdShowed');
    await w.ready;
    this.plugin.showInterstitial().catch(() => w.end('error'));
    const r = await w.done;
    this.preload('interstitial');
    return r === 'interstitialAdDismissed';
  }

  async showRewarded() {
    if (!this.ready.rewarded) { this.preload('rewarded'); return 'nofill'; }
    this.ready.rewarded = false;
    let rewarded = false;
    const h = await this.plugin.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
    const w = this.watch(['onRewardedVideoAdDismissed', 'onRewardedVideoAdFailedToShow'], 'onRewardedVideoAdShowed');
    await w.ready;
    // showRewardVideoAd() only resolves when the reward is earned — never if the ad is closed early —
    // so don't wait on it: the dismiss event decides when the ad is over.
    this.plugin.showRewardVideoAd().then(() => { rewarded = true; }, () => w.end('error'));
    const r = await w.done;
    if (h && h.remove) h.remove();
    this.preload('rewarded');
    if (r === 'onRewardedVideoAdFailedToShow' || r === 'error') return 'nofill';
    return rewarded ? 'rewarded' : 'closed';
  }
}

// Placeholder ads for the browser build: a clearly labelled in-game card with the same timing as a
// real ad (forced: closable after 5 s; opt-in: reward after 6 s of watching).
const FAKE_ADS = [
  { emoji: '🟡', brand: 'MUSTARD MAX', line: 'Now 40% more yellow.', color: '#ffc93c' },
  { emoji: '🥫', brand: 'KETCHUP KINGDOM', line: 'Rule your bun.', color: '#ef4b3c' },
  { emoji: '🥒', brand: 'RELISH RUSH', line: 'Sweet. Green. Unstoppable.', color: '#6cc24a' },
  { emoji: '🍳', brand: 'PAN-TASTIC PANS', line: 'Non-stick. Very flippable.', color: '#4cc3ff' },
];

class TestAdProvider {
  constructor(app) { this.kind = 'test'; this.app = app; this.n = 0; }

  build(kind, purpose) {
    const ad = FAKE_ADS[this.n++ % FAKE_ADS.length];
    const el = document.createElement('section');
    el.className = 'adlayer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Advertisement');
    el.innerHTML = `
      <div class="ad-card" style="--adc:${ad.color}">
        <div class="ad-top"><span class="ad-pill">AD</span><span class="ad-kind">${kind === 'rewarded' ? 'Reward ad' : 'Ad'} · test placeholder</span>
          <button class="ad-close" aria-label="Close ad" disabled>5</button></div>
        <div class="ad-body"><div class="ad-emoji">${ad.emoji}</div><div class="ad-brand">${ad.brand}</div><div class="ad-line">${ad.line}</div></div>
        ${kind === 'rewarded' ? `<div class="ad-reward"><div class="ad-why">${{ skip: 'Watch to skip this level', hint: 'Watch to get a hint', aim: 'Watch to unlock the long aim guide' }[purpose] || 'Watch to earn the reward'}</div><div class="ad-bar"><i></i></div><button class="btn btn-relish ad-collect" hidden><span>COLLECT ✓</span></button></div>` : ''}
        <div class="ad-foot">Real ads come from AdMob in the app build.</div>
      </div>`;
    document.getElementById('ui').appendChild(el);
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    return el;
  }

  showInterstitial() {
    return new Promise((resolve) => {
      const el = this.build('interstitial');
      const close = el.querySelector('.ad-close');
      let left = 5;
      const iv = setInterval(() => {
        left--;
        if (left > 0) close.textContent = left;
        else { clearInterval(iv); close.disabled = false; close.textContent = '✕'; }
      }, 1000);
      close.addEventListener('click', () => { clearInterval(iv); el.remove(); resolve(true); });
    });
  }

  showRewarded(purpose) {
    return new Promise((resolve) => {
      const el = this.build('rewarded', purpose);
      const close = el.querySelector('.ad-close');
      const bar = el.querySelector('.ad-bar i');
      const collect = el.querySelector('.ad-collect');
      close.disabled = false; close.textContent = '✕';
      const total = 6000, t0 = performance.now();
      let done = false;
      const tick = () => {
        if (!el.isConnected) return;
        const u = Math.min(1, (performance.now() - t0) / total);
        bar.style.width = (u * 100) + '%';
        if (u < 1) requestAnimationFrame(tick);
        else { done = true; collect.hidden = false; el.querySelector('.ad-why').textContent = 'Reward earned!'; }
      };
      requestAnimationFrame(tick);
      collect.addEventListener('click', () => { el.remove(); resolve('rewarded'); });
      close.addEventListener('click', () => { el.remove(); resolve(done ? 'rewarded' : 'closed'); });
    });
  }
}
