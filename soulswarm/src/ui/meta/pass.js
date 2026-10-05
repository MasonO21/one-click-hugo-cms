// Soul Pass tab: season header, premium upsell (Eclipse Vael), and the 30-tier free/premium track.
import { h, $, purchaseFlow } from '../dom.js';
import { icon } from '../icons.js';
import { PASS_SEASON, PASS_TIERS, HEROES, SKINS } from '../../game/data.js';
import { commit, passState, claimPass } from '../../meta/economy.js';
import { cd, bundleItems, rewardChip, popRewards, bar, tap, delegate, keepScroll, portrait } from './util.js';

const DAY = 864e5;
/** Season = 28 days counted from profile creation, repeating. */
export function seasonEnd(p, now = Date.now()) {
  const len = PASS_SEASON.days * DAY;
  const start = p.createdAt || now;
  return start + (Math.floor(Math.max(0, now - start) / len) + 1) * len;
}

export function createPass(ctx) {
  const { app } = ctx;
  const el = h('<section class="pane pane-pass" data-tab="pass"><div class="pane-scroll scroll" data-keep="pass"><div class="ps"></div></div></section>');
  const scroller = $(el, '.pane-scroll');
  const root = $(el, '.ps');
  let scrolledOnce = false;

  const tile = (t, prem, s) => {
    const bundle = prem ? t.prem : t.free;
    const claimed = prem ? t.premClaimed : t.freeClaimed;
    const locked = prem && !s.premium;
    const can = t.reached && !claimed && !locked;
    const special = prem && bundle.skin;
    const cls = [prem ? 'prem' : 'free', claimed ? 'is-claimed' : '', can ? 'is-ready' : '', locked ? 'is-locked' : '', special ? 'is-special' : '', !t.reached ? 'is-future' : ''].join(' ');
    return `<button class="ps-tile ${cls}" ${can ? `data-act="claim" data-t="${t.tier}" data-p="${prem ? 1 : 0}"` : 'data-act="peek"'}>
      ${special ? `<span class="ps-skin"><span class="ic-tint">${icon('crown')}</span><b>${SKINS[bundle.skin]?.name || 'Skin'}</b></span>` : ''}
      <span class="ps-chips">${bundleItems(special ? { ...bundle, skin: undefined } : bundle).map((it) => rewardChip(it)).join('')}</span>
      ${can ? '<span class="ps-claim">Claim</span>' : ''}
      ${claimed ? `<span class="ps-check">${icon('check')}</span>` : ''}
      ${locked ? `<span class="ps-lock">${icon('lock')}</span>` : ''}
    </button>`;
  };

  function render() {
    const p = app.profile;
    const s = passState(p);
    const maxed = s.tier >= PASS_TIERS;
    const claimable = s.tiers.filter((t) => t.reached && (!t.freeClaimed || (s.premium && !t.premClaimed))).length;
    const nextTier = maxed ? PASS_TIERS : s.tier + 1;
    const eclipseColor = '#ffd04a';

    const head = `<div class="ps-head panel">
      <div class="ps-badge-big"><small>Tier</small><b class="tnum">${s.tier}</b></div>
      <div class="ps-head-main">
        <div class="ps-season t-label">Soul Pass · ${icon('hourglass')} ${cd(seasonEnd(p))} left</div>
        <div class="ps-name t-display">${PASS_SEASON.name.replace(/^Season I: /, '')}</div>
        <div class="ps-xp">${bar(s.into / s.perTier, 'mbar-pass')}<span class="tnum">${maxed ? 'Max tier' : `${s.into}/${s.perTier} XP`}</span></div>
      </div>
    </div>
    ${claimable ? `<button class="btn btn-ad btn-block ps-all" data-act="all">Claim all (${claimable})</button>` : ''}`;

    const prem = s.premium
      ? `<div class="ps-premon"><span class="ic-tint" style="color:${eclipseColor}">${icon('crown')}</span><b>Premium track active</b><span class="t-dim">Eclipse Vael awaits at tier ${PASS_TIERS}</span></div>`
      : `<div class="ps-prem">
        <div class="ps-prem-art">${portrait(app, 'vael', 'ps-eclipse', { color: eclipseColor, eye: '#fff3c4', noImg: true })}<span class="ps-prem-t30">Tier ${PASS_TIERS}</span></div>
        <div class="ps-prem-body">
          <div class="t-label glow-gold">Exclusive skin</div>
          <div class="ps-prem-name t-display">Eclipse Vael</div>
          <ul><li>${icon('gems')} 1,000+ gems</li><li><span class="ic-tint" style="color:#ffb52e">${icon('chest')}</span> Legendary relic</li><li><span class="ic-tint" style="color:${HEROES.seraphine.css}">${icon('shard')}</span> Seraphine shards</li></ul>
          <button class="btn btn-primary btn-block" data-act="premium">Unlock Premium <span class="price">${app.store.price('soul_pass')}</span></button>
        </div>
      </div>`;

    const rows = s.tiers.map((t) => `<div class="ps-row ${t.reached ? 'is-reached' : ''} ${t.tier === nextTier && !maxed ? 'is-next' : ''} ${t.tier === s.tier ? 'is-cur' : ''}" data-tier="${t.tier}">
        ${tile(t, false, s)}
        <div class="ps-tier"><span class="ps-tb tnum">${t.tier}</span>${t.tier === nextTier && !maxed ? `<span class="ps-tprog">${bar(s.into / s.perTier)}</span>` : ''}</div>
        ${tile(t, true, s)}
      </div>`).join('');

    keepScroll(el, () => {
      root.innerHTML = `${head}${prem}
        <div class="ps-cols"><span>Free</span><span>Tier</span><span class="ps-cols-prem">${icon('crown')} Premium</span></div>
        <div class="ps-track">${rows}</div>
        <div class="mhint t-dim">${icon('info')} Earn Pass XP from runs and daily quests. ${PASS_TIERS} tiers, ${s.perTier} XP each.</div>`;
    });
  }

  function claimAll() {
    const p = app.profile; const s = passState(p);
    let items = [];
    for (const t of s.tiers) {
      if (!t.reached) continue;
      if (!t.freeClaimed) items = items.concat(claimPass(p, t.tier, false) || []);
      if (s.premium && !t.premClaimed) items = items.concat(claimPass(p, t.tier, true) || []);
    }
    if (!items.length) return;
    commit(p);
    popRewards(app, items, { title: 'Soul Pass rewards' });
  }

  delegate(root, {
    claim: (b) => {
      const p = app.profile;
      const items = claimPass(p, +b.dataset.t, b.dataset.p === '1');
      if (!items) return;
      commit(p);
      popRewards(app, items, { title: `Tier ${b.dataset.t} reward` });
    },
    all: () => { tap(app, 'medium', null); claimAll(); },
    premium: () => { tap(app, 'medium'); purchaseFlow(app, 'soul_pass'); },
    peek: (b) => {
      tap(app);
      if (b.classList.contains('is-locked')) purchaseFlow(app, 'soul_pass');
      else b.animate([{ transform: 'scale(1)' }, { transform: 'scale(.96)' }, { transform: 'scale(1)' }], { duration: 180 });
    },
  });

  /** On first show, bring the current tier into view. */
  function onShow() {
    if (scrolledOnce) return;
    scrolledOnce = true;
    const s = passState(app.profile);
    const row = root.querySelector(`[data-tier="${Math.max(1, Math.min(PASS_TIERS, s.tier + 1))}"]`);
    // Only scroll when the next tier would sit below the fold, so the season header stays visible early on.
    if (row && row.offsetTop > scroller.clientHeight * 1.4) scroller.scrollTop = Math.max(0, row.offsetTop - scroller.clientHeight * 0.55);
  }

  return { el, render, onShow };
}
