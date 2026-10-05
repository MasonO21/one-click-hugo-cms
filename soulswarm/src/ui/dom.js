// Shared DOM helpers: element creation, modals, toasts, reward popups and the purchase flow.
import { icon, RELIC_ICON } from './icons.js';
import { HEROES, RELICS, RARITY_COLOR, RARITY_LABEL, SKUS, SKINS, formatRelicValue } from '../game/data.js';
import { Store } from '../meta/store.js';
import { applyPurchase, commit, firstPurchaseBonus } from '../meta/economy.js';

export const uiRoot = () => document.getElementById('ui');

/** Create an element from an HTML string (single root). */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

export const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
};
export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (hh > 0) return `${hh}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export function toast(msg) {
  const el = h(`<div class="toast">${msg}</div>`);
  uiRoot().appendChild(el);
  setTimeout(() => el.remove(), 2300);
}

/**
 * Generic modal. actions: [{label, cls, onClick(close) -> bool|void (return false to keep open)}]
 * Returns { el, close }.
 */
export function modal({ title = '', body = '', actions = [], cls = '', dismissable = true, onClose } = {}) {
  const back = h(`<div class="modal-back"><div class="modal panel ${cls}">
    ${dismissable ? `<button class="modal-x" aria-label="Close">${icon('close')}</button>` : ''}
    ${title ? `<h2>${title}</h2>` : ''}<div class="modal-body"></div><div class="modal-actions"></div></div></div>`);
  const bodyEl = $(back, '.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const actEl = $(back, '.modal-actions');
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); onClose && onClose(); };
  for (const a of actions) {
    const b = h(`<button class="btn ${a.cls || 'btn-ghost'}">${a.label}</button>`);
    b.addEventListener('click', () => { if (a.onClick && a.onClick(close) === false) return; close(); });
    actEl.appendChild(b);
  }
  if (dismissable) {
    $(back, '.modal-x').addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
  }
  uiRoot().appendChild(back);
  return { el: back, close };
}

/** Visual tile for a granted item. */
export function rewardTile(it, i = 0) {
  let ic = '', label = '', color = '#eaf6ff', sub = '';
  switch (it.kind) {
    case 'gold': case 'gems': case 'sigils': case 'energy': case 'passXp':
      ic = icon(it.kind); label = '×' + fmt(it.amount);
      sub = { gold: 'Gold', gems: 'Gems', sigils: 'Sigils', energy: 'Energy', passXp: 'Pass XP' }[it.kind];
      break;
    case 'shards':
      ic = `<span style="color:${HEROES[it.hero].css}">${icon('shard')}</span>`; label = '×' + it.amount; sub = `${HEROES[it.hero].name} shards`;
      color = HEROES[it.hero].css; break;
    case 'hero':
      ic = `<span style="color:${HEROES[it.hero].css}">${icon('helm')}</span>`; label = HEROES[it.hero].name; sub = 'Hero unlocked!';
      color = HEROES[it.hero].css; break;
    case 'relic':
      color = RARITY_COLOR[it.rarity];
      ic = `<span style="color:${color}">${icon(RELIC_ICON[it.relic.type])}</span>`;
      label = RELICS[it.relic.type].name; sub = `${RARITY_LABEL[it.rarity]}${it.merged ? ' · Lv ' + it.relic.level : ''}`; break;
    case 'skin':
      ic = `<span style="color:#ffd04a">${icon('crown')}</span>`; label = SKINS[it.skin].name; sub = 'Exclusive skin'; color = '#ffd04a'; break;
    case 'pass':
      ic = icon('passXp'); label = 'Premium'; sub = 'Soul Pass unlocked'; color = '#ffcf4a'; break;
    default:
      ic = icon('chest'); label = String(it.amount || '');
  }
  return `<div class="rw-tile" style="--rw:${color};animation-delay:${i * 70}ms"><div class="rw-ic">${ic}</div><b>${label}</b><small>${sub}</small></div>`;
}

/** Celebratory popup listing granted items. */
export function rewardPopup(items, { title = 'Rewards', audio, onClose } = {}) {
  if (!items || !items.length) return;
  audio && audio.sfx('chest');
  const el = h(`<div class="rw-grid">${items.map((it, i) => rewardTile(it, i)).join('')}</div>`);
  return modal({ title, body: el, cls: 'modal-rewards', actions: [{ label: 'Claim', cls: 'btn-primary btn-lg' }], onClose });
}

/** Confirm, run the (simulated) store purchase, grant, and celebrate. */
export function purchaseFlow(app, skuId, { onDone } = {}) {
  const sku = SKUS[skuId];
  const p = app.profile;
  const bonus = firstPurchaseBonus(p, skuId);
  let contents = '';
  if (sku.kind === 'gems') contents = `<div class="pf-line">${icon('gems')} <b>${fmt(sku.gems * (bonus ? 2 : 1))}</b> Gems ${bonus ? '<span class="pill pill-hot">First-buy ×2</span>' : ''}</div>`;
  else if (sku.kind === 'bundle') contents = `<div class="pf-line">${icon('helm')} <b>Nyx Hollowborn</b> (Rare hero)</div><div class="pf-line">${icon('gems')} <b>300</b> Gems</div><div class="pf-line">${icon('gold')} <b>10,000</b> Gold</div><div class="pf-line">${icon('sigils')} <b>3</b> Altar Sigils</div>`;
  else if (sku.kind === 'sub') contents = `<div class="pf-line">${icon('gems')} <b>300</b> Gems right away</div><div class="pf-line">${icon('gems')} <b>+100</b> Gems every day for 30 days</div><div class="pf-line">${icon('ad')} Skip ads and still get ad rewards</div><div class="pf-line">${icon('gold')} <b>+20%</b> Gold from runs</div>`;
  else if (sku.kind === 'pass') contents = `<div class="pf-line">${icon('passXp')} Unlock the premium track for 30 tiers</div><div class="pf-line">${icon('crown')} Exclusive <b>Eclipse Vael</b> skin</div><div class="pf-line">${icon('gems')} 1,000+ Gems across the season</div>`;

  modal({
    title: sku.label,
    cls: 'modal-purchase',
    body: `<div class="pf">${contents}<div class="pf-note">${icon('info')} Demo build: purchases are simulated. Nothing is charged.</div></div>`,
    actions: [{
      label: `Buy ${Store.price(skuId)}`, cls: 'btn-primary btn-lg',
      onClick: (close) => {
        const btn = document.querySelector('.modal-purchase .btn-primary');
        if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
        Store.purchase(skuId).then((res) => {
          close();
          if (!res.ok) { toast('Purchase cancelled'); return; }
          const items = applyPurchase(p, skuId);
          commit(p);
          app.audio && app.audio.sfx('purchase');
          app.haptic && app.haptic('success');
          rewardPopup(items, { title: 'Thank you!', audio: app.audio, onClose: onDone });
        });
        return false;
      },
    }],
  });
}

/** Rewarded-ad wrapper: respects Soul Pact (ad-free rewards). */
export async function watchAd(app, placement) {
  const { pactActive } = await import('../meta/economy.js');
  if (pactActive(app.profile)) { toast('Soul Pact: reward granted, no ad needed'); return true; }
  app.audio && app.audio.setMuted && app.audio.setMuted(true);
  const ok = await Store.rewardedAd(placement);
  app.audio && app.audio.setMuted && app.audio.setMuted(!!app.profile.settings.muted);
  return ok;
}

// Styles for the shared components above.
const css = `
.modal-x { position:absolute; top:6px; right:6px; width:34px; height:34px; border:0; background:transparent; color:var(--ink-dim); cursor:pointer; display:grid; place-items:center; z-index:2; }
.modal-x svg { width:20px; height:20px; }
.modal-body { display:flex; flex-direction:column; gap:10px; }
.modal-actions { display:flex; flex-direction:column; gap:8px; margin-top:14px; }
.modal-actions:empty { display:none; }
.rw-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(92px, 1fr)); gap:8px; }
.rw-tile { --rw:#eaf6ff; display:flex; flex-direction:column; align-items:center; gap:2px; padding:12px 6px 10px; text-align:center;
  background: radial-gradient(80% 70% at 50% 30%, color-mix(in srgb, var(--rw) 28%, transparent), rgba(255,255,255,.03));
  clip-path: var(--bevel-sm); animation: rwpop .45s cubic-bezier(.2,1.6,.4,1) both; }
.rw-tile .rw-ic svg { width:40px; height:40px; filter: drop-shadow(0 0 8px var(--rw)); }
.rw-tile b { font-size:15px; color: var(--rw); }
.rw-tile small { font-size:10px; color: var(--ink-dim); letter-spacing:.06em; text-transform:uppercase; }
@keyframes rwpop { from { opacity:0; transform: scale(.4) translateY(10px); } }
.pf { display:flex; flex-direction:column; gap:8px; }
.pf-line { display:flex; align-items:center; gap:8px; font-size:15px; padding:8px 10px; background:rgba(255,255,255,.04); clip-path:var(--bevel-sm); }
.pf-line svg { width:22px; height:22px; flex:none; }
.pf-note { display:flex; gap:6px; align-items:flex-start; font-size:12px; color:var(--ink-dim); margin-top:4px; }
.pf-note svg { width:14px; height:14px; flex:none; margin-top:2px; }
`;
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
