// Store adapter: in-app purchases + rewarded ads.
//
// The prototype SIMULATES both: no payment details are collected and nothing is charged.
// For production, swap the two marked functions for real SDK calls:
//   purchase()   -> RevenueCat `Purchases.purchaseStoreProduct()` (or StoreKit 2 / Play Billing),
//                   then validate the receipt server-side BEFORE calling economy.applyPurchase().
//   rewardedAd() -> AppLovin MAX `showRewardedAd()`; resolve true only on the reward callback.
// See docs/PRODUCTION_ROADMAP.md.
import { SKUS } from '../game/data.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const Store = {
  simulated: true,

  price(skuId) {
    const s = SKUS[skuId];
    return s ? `$${s.price.toFixed(2)}` : '';
  },

  /** Resolves { ok, simulated } after the platform purchase sheet completes. */
  async purchase(skuId) {
    if (!SKUS[skuId]) return { ok: false, error: 'unknown_sku' };
    await delay(650); // stands in for the App Store / Play sheet
    return { ok: true, simulated: true, transactionId: 'demo-' + Date.now().toString(36) };
  },

  async restore() {
    await delay(400);
    return { ok: true, restored: [] };
  },

  /** Shows a stand-in rewarded video. Resolves true when the reward should be granted. */
  rewardedAd(placement = 'generic') {
    return new Promise((resolve) => {
      const root = document.getElementById('ui') || document.body;
      const el = document.createElement('div');
      el.className = 'ad-sim';
      el.innerHTML = `
        <div class="ad-sim-card">
          <div class="t-label">Rewarded video · demo</div>
          <div class="ad-sim-title t-display">Your reward is on its way</div>
          <div class="ad-sim-ring"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><circle class="p" cx="32" cy="32" r="28"/></svg><b>3</b></div>
          <div class="t-dim ad-sim-note">In the store build, a 15–30 second opt-in video plays here.</div>
          <button class="btn btn-ad btn-block" disabled>Claim reward</button>
          <button class="btn btn-ghost btn-sm ad-sim-x">No thanks</button>
        </div>`;
      root.appendChild(el);
      const b = el.querySelector('.ad-sim-ring b');
      const claim = el.querySelector('.btn-ad');
      let n = 3;
      const iv = setInterval(() => {
        n -= 1; b.textContent = Math.max(0, n);
        if (n <= 0) { clearInterval(iv); claim.disabled = false; b.textContent = '✓'; }
      }, 1000);
      const done = (ok) => { clearInterval(iv); el.remove(); resolve(ok); };
      claim.addEventListener('click', () => done(true));
      el.querySelector('.ad-sim-x').addEventListener('click', () => done(false));
    });
  },
};

// Styles for the ad stand-in (kept beside the code that uses them).
const css = `
.ad-sim { position:absolute; inset:0; z-index:80; display:flex; align-items:center; justify-content:center; padding:16px;
  background: radial-gradient(70% 50% at 50% 40%, rgba(20,80,60,.55), rgba(2,4,8,.94)); animation: fadein .2s ease; }
.ad-sim-card { width:100%; max-width:320px; display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; }
.ad-sim-title { font-size:22px; }
.ad-sim-ring { position:relative; width:84px; height:84px; }
.ad-sim-ring svg { width:100%; height:100%; transform:rotate(-90deg); }
.ad-sim-ring circle { fill:none; stroke:rgba(255,255,255,.12); stroke-width:5; }
.ad-sim-ring circle.p { stroke:var(--ok); stroke-dasharray:176; stroke-dashoffset:176; animation: adring 3s linear forwards; filter: drop-shadow(0 0 6px var(--ok)); }
.ad-sim-ring b { position:absolute; inset:0; display:grid; place-items:center; font-size:28px; }
.ad-sim-note { font-size:12px; max-width:240px; }
@keyframes adring { to { stroke-dashoffset: 0; } }`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
