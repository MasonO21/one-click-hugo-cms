// Shop tab: starter pack, Soul Pact, daily gem deals and the six gem tiers.
import { canPurchase } from '../../meta/privacy.js';
import { h, $, fmt, toast, purchaseFlow, watchAd } from '../dom.js';
import { icon } from '../icons.js';
import { GEM_ART } from '../art.js';
import { SKUS, GEM_SKUS, GEM_SHOP, HEROES } from '../../game/data.js';
import {
  commit, starterAvailable, pactActive, pactDailyAvailable, firstPurchaseBonus, freeChestAvailable, claimFreeChest,
} from '../../meta/economy.js';
import { cd, nextMidnight, bundleItems, rewardChip, popRewards, tap, portrait, delegate, keepScroll } from './util.js';
import { confirmGemShop, pactBenefits, pactDaysLeft, claimPact } from './panels.js';

// Gem pile layouts per tier: [x%, y%, size(em)]. Later tiers stack more, bigger, brighter gems.
const PILES = [
  [[50, 58, 2.6]],
  [[38, 62, 2.2], [60, 56, 2.6]],
  [[50, 46, 2.5], [32, 64, 2.2], [68, 64, 2.2]],
  [[50, 40, 2.5], [30, 58, 2.2], [70, 58, 2.2], [50, 70, 2.4]],
  [[50, 34, 2.4], [30, 50, 2.1], [70, 50, 2.1], [20, 70, 1.9], [50, 66, 2.6], [80, 70, 1.9]],
  [[50, 28, 2.5], [28, 44, 2.1], [72, 44, 2.1], [14, 66, 1.8], [38, 62, 2.3], [62, 62, 2.3], [86, 66, 1.8], [50, 78, 2.2]],
];
const DAILY_ICON = { sigil_1: ['sigils', 1], sigil_10: ['sigils', 3], gold_s: ['gold', 1], gold_l: ['gold', 3], energy: ['energy', 1] };

function gemPile(tier) {
  const pile = PILES[tier];
  const sparks = tier >= 3 ? Array.from({ length: tier }, (_, i) => `<i class="spark" style="left:${12 + ((i * 37) % 76)}%;top:${10 + ((i * 53) % 70)}%;animation-delay:${(i * 0.37).toFixed(2)}s"></i>`).join('') : '';
  if (GEM_ART[tier]) return `<div class="pile t${tier + 1} is-painted"><img class="gem-art" src="${GEM_ART[tier]}" alt="" draggable="false">${sparks}</div>`;
  return `<div class="pile t${tier + 1}">${pile.map(([x, y, s], i) => `<span class="pile-gem" style="left:${x}%;top:${y}%;font-size:${s}em;z-index:${Math.round(y)};animation-delay:${i * 0.15}s">${icon('gems')}</span>`).join('')}${sparks}</div>`;
}
function stackIcon(name, n) {
  return `<span class="stack s${n}">${Array.from({ length: n }, () => icon(name)).join('')}</span>`;
}

export function createShop(ctx) {
  const { app } = ctx;
  const el = h('<section class="pane pane-shop" data-tab="shop"><div class="pane-scroll scroll" data-keep="shop"><div class="shop"></div></div></section>');
  const scroller = $(el, '.pane-scroll');
  const root = $(el, '.shop');
  let busy = false;

  function render() {
    const p = app.profile;
    const parts = [];

    // Starter pack hero banner
    if (starterAvailable(p)) {
      const nyx = HEROES.nyx;
      parts.push(`<div class="sp-banner" data-sec="starter">
        <div class="sp-banner-glow"></div>
        <div class="sp-banner-art">${portrait(app, 'nyx', 'sp-banner-portrait')}</div>
        <div class="sp-banner-rib"><b>${SKUS.starter_pack.value}</b><small>value</small></div>
        <div class="sp-banner-body">
          <div class="t-label glow-gold">One-time offer</div>
          <div class="sp-banner-title t-display">Starter Pack</div>
          <div class="sp-banner-hero"><span class="ic-tint" style="color:${nyx.css}">${icon('helm')}</span><b>${nyx.name} ${nyx.title}</b><span class="pill" style="background:#3fb0ff;color:#001a2e">Rare</span></div>
          <div class="sp-banner-items">${bundleItems({ gems: 300, gold: 10000, sigils: 3 }).map((it) => rewardChip(it)).join('')}</div>
          <div class="sp-banner-foot">
            <span class="sp-banner-cd">${icon('hourglass')} ${cd(p.purchases.starterExpires)}</span>
            <button class="btn btn-primary" data-act="buy" data-sku="starter_pack"><span class="price">${app.store.price('starter_pack')}</span></button>
          </div>
        </div>
      </div>`);
    }

    // Soul Pact (subscription-style pass)
    const active = pactActive(p);
    parts.push(`<div class="pact-card ${active ? 'is-active' : ''}" data-sec="pact">
      <div class="pact-card-head">
        <div class="pact-card-emb">${icon('gems')}</div>
        <div class="pact-card-txt"><div class="pact-card-title t-display">Soul Pact</div><div class="t-dim pact-card-sub">${active ? `<span class="pill pill-soul">Active · ${pactDaysLeft(p)} days left</span>` : '30 days · best daily value'}</div></div>
        ${active ? '' : '<span class="pact-card-val">3,300<small>gems total</small></span>'}
      </div>
      ${pactBenefits()}
      ${active
        ? (pactDailyAvailable(p)
          ? '<button class="btn btn-gem btn-block" data-act="pactClaim">Claim today\'s 100 gems</button>'
          : `<div class="pact-card-next"><span class="t-dim">Next tribute in</span> ${cd(nextMidnight(), 0, 'cd-strong')}<button class="btn btn-ghost btn-sm" data-act="buy" data-sku="soul_pact">Extend ${app.store.price('soul_pact')}</button></div>`)
        : `<button class="btn btn-primary btn-block" data-act="buy" data-sku="soul_pact"><span class="price">${app.store.price('soul_pact')}</span>&nbsp;/ 30 days</button>`}
    </div>`);

    // Daily deals (gem-priced)
    const chestFree = freeChestAvailable(p);
    const dailyTiles = Object.entries(GEM_SHOP).map(([key, it]) => {
      const [ic, n] = DAILY_ICON[key] || ['chest', 1];
      const amount = it.rewards.sigils || it.rewards.gold || it.rewards.energy;
      const name = it.rewards.sigils ? (it.rewards.sigils > 1 ? 'Sigils' : 'Sigil') : it.rewards.gold ? 'Gold' : 'Energy';
      const poor = p.gems < it.cost;
      return `<button class="deal" data-act="gemshop" data-key="${key}">
        ${key === 'sigil_10' ? '<span class="deal-tag">Save 10%</span>' : ''}
        <span class="deal-ic">${stackIcon(ic, n)}</span>
        <span class="deal-amt tnum">${key === 'energy' ? 'Full' : (it.rewards.sigils ? '×' : '') + fmt(amount)}</span>
        <span class="deal-name">${name}</span>
        <span class="deal-cost ${poor ? 'is-poor' : ''}">${icon('gems')}<b class="tnum">${fmt(it.cost)}</b></span>
      </button>`;
    });
    dailyTiles.unshift(`<button class="deal deal-free ${chestFree ? '' : 'is-spent'}" data-act="chest">
      ${chestFree ? '<span class="deal-tag deal-tag-free">Free</span><i class="badge-dot"></i>' : ''}
      <span class="deal-ic">${stackIcon('chest', 1)}</span>
      <span class="deal-amt">Chest</span>
      <span class="deal-name">Gold · Gems · Relic</span>
      <span class="deal-cost deal-cost-ad">${chestFree ? `${icon('ad')}<b>Watch</b>` : cd(nextMidnight())}</span>
    </button>`);
    parts.push(`<div class="sec-h" data-sec="daily"><span class="sec-t t-display">Daily Deals</span><span class="sec-r t-dim">${icon('hourglass')} ${cd(nextMidnight())}</span></div>
      <div class="deals">${dailyTiles.join('')}</div>`);

    // Gems
    parts.push(`<div class="sec-h" data-sec="gems"><span class="sec-t t-display">Soul Gems</span><span class="sec-r t-dim">First buy of each tier ×2</span></div>
      <div class="gems">${GEM_SKUS.map((id, i) => {
        const s = SKUS[id]; const bonus = firstPurchaseBonus(p, id);
        return `<button class="gem-tile t${i + 1} ${s.tag ? 'has-tag' : ''}" data-act="buy" data-sku="${id}">
          ${s.tag ? `<span class="gem-tag ${s.tag === 'Best Value' ? 'gem-tag-best' : ''}">${s.tag}</span>` : ''}
          ${bonus ? '<span class="gem-x2"><b>×2</b><small>1st buy</small></span>' : ''}
          ${gemPile(i)}
          <span class="gem-amt tnum">${fmt(s.gems)}</span>
          ${bonus ? `<span class="gem-bonus tnum">+${fmt(s.gems)} bonus</span>` : `<span class="gem-label">${s.label}</span>`}
          <span class="gem-price"><span class="price">${app.store.price(id)}</span></span>
        </button>`;
      }).join('')}</div>`);

    // restricted mode (meta/privacy.js): a younger player's store stays visible but closed
    if (!canPurchase(app.profile)) parts.unshift(`<div class="shop-locked">${icon('lock')} Purchases are switched off for younger players. Everything in SOULSWARM can be earned by playing.</div>`);
    // Footer
    parts.push(`<div class="shop-foot">
      <button class="btn btn-ghost btn-sm" data-act="restore">Restore purchases</button>
      <div class="t-dim">Prices in USD. Demo build: purchases are simulated.</div>
    </div>`);

    keepScroll(el, () => { root.innerHTML = parts.join(''); });
  }

  delegate(root, {
    buy: (b) => { tap(app, 'medium'); purchaseFlow(app, b.dataset.sku); },
    gemshop: (b) => { tap(app); confirmGemShop(ctx, b.dataset.key); },
    pactClaim: () => { tap(app, 'medium', null); claimPact(ctx); },
    chest: async () => {
      const p = app.profile;
      if (!freeChestAvailable(p)) { tap(app); toast('Come back tomorrow for another free chest'); return; }
      if (busy) return; busy = true; tap(app);
      try {
        const ok = await watchAd(app, 'free_chest');
        const items = ok ? claimFreeChest(p) : null;
        if (items) { commit(p); popRewards(app, items, { title: 'Free Chest' }); }
      } finally { busy = false; }
    },
    restore: async (b) => {
      tap(app); b.disabled = true;
      try { await app.store.restore(); toast('Purchases restored'); } catch (e) { toast('Restore failed. Try again later.'); }
      b.disabled = false;
    },
  });

  /** Scroll to a named section ('gems', 'daily', 'pact', 'starter'). */
  function scrollTo(sec) {
    const target = sec && root.querySelector(`[data-sec="${sec}"]`);
    scroller.scrollTo({ top: target ? Math.max(0, target.offsetTop - 8) : 0, behavior: target ? 'smooth' : 'auto' });
  }

  return { el, render, scrollTo };
}
