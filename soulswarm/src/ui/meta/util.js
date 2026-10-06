// Shared helpers for the meta UI: countdown markup, reward-bundle visuals, hero portraits and small widgets.
import { fmt, fmtTime, rewardPopup } from '../dom.js';
import { icon, RELIC_ICON } from '../icons.js';
import { HEROES, RARITY_COLOR, RARITY_LABEL, RELICS, SKINS, ENERGY_MAX, ENERGY_REGEN_SEC } from '../../game/data.js';
import { energyNextIn } from '../../meta/economy.js';
import { HERO_ART } from '../art.js';

export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const pct = (a, b) => (b > 0 ? Math.round(clamp01(a / b) * 1000) / 10 : 100);

/** Epoch ms of the next local midnight (daily resets use local dates, see save.todayKey). */
export function nextMidnight(t = Date.now()) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Seconds until energy is full (0 when full). */
export const energyFullIn = (p) => (p.energy >= ENERGY_MAX ? 0 : energyNextIn(p) + (ENERGY_MAX - p.energy - 1) * ENERGY_REGEN_SEC);

/** "2d 05h" for long spans, otherwise fmtTime ("47h 59m" / "05:12"). */
export function fmtLeft(sec) {
  sec = Math.max(0, Math.floor(sec));
  if (sec >= 172800) return `${Math.floor(sec / 86400)}d ${String(Math.floor((sec % 86400) / 3600)).padStart(2, '0')}h`;
  return fmtTime(sec);
}

/**
 * Live countdown markup. `target` is an epoch-ms timestamp, or 'energy' / 'energy-full'.
 * The shared 1 s ticker in index.js updates every [data-cd] node inside #ui.
 */
export function cd(target, initialSec, cls = '') {
  const sec = typeof target === 'number' ? (target - Date.now()) / 1000 : initialSec || 0;
  return `<span class="cd ${cls}" data-cd="${target}">${fmtLeft(sec)}</span>`;
}

/** Tap feedback shared by every button. */
export function tap(app, kind = 'light', sfx = 'click') {
  try { sfx && app.audio && app.audio.sfx(sfx); } catch (e) { /* audio optional */ }
  try { app.haptic && app.haptic(kind); } catch (e) { /* haptics optional */ }
}

// ---------------------------------------------------------------- hero portraits
const portraitCache = new Map();
const portraitTried = new Map();

/** The painted splash stands in for the 3D render, except for a hero wearing a skin (only the render shows it). */
export const paintedArt = (app, id) => (SKINS[app.profile.equippedSkin]?.hero === id ? '' : HERO_ART[id] || '');

/** Portrait URL (painted splash or cached 3D render), or '' while the renderer is not ready yet. */
export function portraitURL(app, id, force = false) {
  const art = paintedArt(app, id);
  if (art) return art;
  const key = id + ':' + (app.profile.equippedSkin || '');
  if (portraitCache.has(key)) return portraitCache.get(key);
  const last = portraitTried.get(key) || 0;
  if (!force && Date.now() - last < 2500) return '';
  portraitTried.set(key, Date.now());
  let url = '';
  try { url = app.heroPortrait(id) || ''; } catch (e) { url = ''; }
  if (url) portraitCache.set(key, url);
  return url;
}
export const clearPortraitCache = () => { portraitCache.clear(); portraitTried.clear(); };

let silId = 0;
/** Fallback hooded-shepherd silhouette tinted with the hero colour. */
export function silhouette(color, opts = {}) {
  const i = ++silId;
  const eye = opts.eye || color;
  return `<svg class="sil" viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
  <defs>
    <radialGradient id="sg${i}" cx="50%" cy="48%" r="55%"><stop offset="0" stop-color="${color}" stop-opacity=".55"/><stop offset=".55" stop-color="${color}" stop-opacity=".14"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <linearGradient id="sb${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26324f"/><stop offset=".5" stop-color="#121a2c"/><stop offset="1" stop-color="#05070d"/></linearGradient>
    <linearGradient id="sr${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${color}" stop-opacity=".0"/><stop offset=".5" stop-color="${color}" stop-opacity=".9"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>
  </defs>
  <ellipse cx="50" cy="60" rx="50" ry="60" fill="url(#sg${i})"/>
  <ellipse cx="50" cy="114" rx="34" ry="4.5" fill="none" stroke="${color}" stroke-opacity=".55" stroke-width="1.2"/>
  <ellipse cx="50" cy="114" rx="22" ry="2.6" fill="${color}" fill-opacity=".25"/>
  <path d="M81 30 L87 116" stroke="#3a4766" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="80.4" cy="25" r="10" fill="${color}" opacity=".22"/>
  <circle cx="80.4" cy="25" r="4.6" fill="${color}"/>
  <circle cx="79" cy="23.6" r="1.6" fill="#fff" opacity=".9"/>
  <path d="M50 14C38 14 31 24 30 37c-1 10 1 17 4 22-10 7-17 23-21 57h74c-4-34-11-50-21-57 3-5 5-12 4-22-1-13-8-23-20-23z" fill="url(#sb${i})" stroke="${color}" stroke-opacity=".55" stroke-width="1.1"/>
  <path d="M27 66c6 4 14 6 23 6s17-2 23-6" fill="none" stroke="url(#sr${i})" stroke-width="1.4"/>
  <path d="M40 72 35 116M60 72l5 44M50 64v52" stroke="${color}" stroke-opacity=".18" stroke-width="1"/>
  <path d="M50 76l4 6-4 6-4-6z" fill="none" stroke="${color}" stroke-opacity=".85" stroke-width="1.2"/>
  <path d="M50 26c-7 0-11.5 7-11.5 15 0 9 5 15 11.5 15s11.5-6 11.5-15c0-8-4.5-15-11.5-15z" fill="#020306"/>
  <ellipse cx="45.4" cy="42" rx="4.5" ry="3" fill="${eye}" opacity=".35"/>
  <ellipse cx="54.6" cy="42" rx="4.5" ry="3" fill="${eye}" opacity=".35"/>
  <ellipse cx="45.4" cy="42" rx="2.1" ry="1.3" fill="${eye}"/>
  <ellipse cx="54.6" cy="42" rx="2.1" ry="1.3" fill="${eye}"/>
</svg>`;
}

/** Portrait block: <img> when the renderer has one, otherwise the silhouette. */
export function portrait(app, id, cls = '', opts = {}) {
  const hero = HEROES[id];
  const color = opts.color || hero.css;
  const url = opts.noImg ? '' : portraitURL(app, id);
  const inner = url ? `<img src="${url}" alt="${hero.name}" draggable="false">` : silhouette(color, opts);
  const painted = !opts.noImg && !!paintedArt(app, id);
  return `<div class="portrait ${cls}${painted ? ' is-painted' : ''}" ${url || opts.noImg ? '' : `data-portrait="${id}"`} style="--hc:${color}">${inner}</div>`;
}

/** Swap silhouettes for real portraits once the renderer can provide them (called by the ticker). */
export function fillPortraits(root, app) {
  for (const n of root.querySelectorAll('[data-portrait]')) {
    const url = portraitURL(app, n.dataset.portrait);
    if (!url) continue;
    n.removeAttribute('data-portrait');
    n.innerHTML = `<img src="${url}" alt="" draggable="false">`;
  }
}

// ---------------------------------------------------------------- reward bundles
const CUR_LABEL = { gold: 'Gold', gems: 'Gems', sigils: 'Sigils', energy: 'Energy', passXp: 'Pass XP' };

/** Turn a reward bundle (grant() input) into display items, most valuable first. */
export function bundleItems(b = {}) {
  const out = [];
  if (b.skin) out.push({ kind: 'skin', skin: b.skin, amount: 1 });
  if (b.hero) out.push({ kind: 'hero', hero: b.hero, amount: 1 });
  if (b.relic) out.push({ kind: 'relicChest', rarity: b.relic === 'epic+' ? 'epic' : b.relic, plus: b.relic === 'epic+', amount: 1 });
  if (b.shards) for (const [hero, n] of Object.entries(b.shards)) out.push({ kind: 'shards', hero, amount: n });
  for (const k of ['gems', 'gold', 'sigils', 'energy', 'passXp']) if (b[k]) out.push({ kind: k, amount: b[k] });
  return out;
}

/** Icon / colour / labels for a display item (granted items or bundle previews). */
export function itemVisual(it) {
  switch (it.kind) {
    case 'gold': case 'gems': case 'sigils': case 'energy': case 'passXp':
      return { ic: icon(it.kind), amt: fmt(it.amount) + (it.kind === 'passXp' ? ' XP' : ''), name: CUR_LABEL[it.kind], color: { gold: '#ffcf4a', gems: '#d36bff', sigils: '#7fd0ff', energy: '#6dffb0', passXp: '#ffcf4a' }[it.kind] };
    case 'shards': {
      const hr = HEROES[it.hero];
      return { ic: `<span class="ic-tint" style="color:${hr.css}">${icon('shard')}</span>`, amt: '×' + it.amount, name: `${hr.name} shards`, color: hr.css };
    }
    case 'hero': {
      const hr = HEROES[it.hero];
      return { ic: `<span class="ic-tint" style="color:${hr.css}">${icon('helm')}</span>`, amt: hr.name, name: 'Hero', color: hr.css };
    }
    case 'relicChest': {
      const c = RARITY_COLOR[it.rarity];
      return { ic: `<span class="ic-tint" style="color:${c}">${icon('chest')}</span>`, amt: it.plus ? 'Epic+' : RARITY_LABEL[it.rarity], name: 'Relic', color: c };
    }
    case 'relic': {
      const c = RARITY_COLOR[it.rarity];
      return { ic: `<span class="ic-tint" style="color:${c}">${icon(RELIC_ICON[it.relic.type])}</span>`, amt: RARITY_LABEL[it.rarity], name: RELICS[it.relic.type].name, color: c };
    }
    case 'skin':
      return { ic: `<span class="ic-tint" style="color:#ffd04a">${icon('crown')}</span>`, amt: 'Skin', name: SKINS[it.skin]?.name || 'Skin', color: '#ffd04a' };
    default:
      return { ic: icon('chest'), amt: String(it.amount || ''), name: '', color: '#eaf6ff' };
  }
}

/** Compact reward chip: icon + amount (used in pass, quests, login, packs). */
export function rewardChip(it, cls = '') {
  const v = itemVisual(it);
  return `<span class="rchip ${cls}" style="--rw:${v.color}" title="${v.name}">${v.ic}<b>${v.amt}</b></span>`;
}

/** Merge granted items so big batches (Claim all) stay readable: currencies and shards are summed. */
export function mergeItems(items) {
  const out = []; const idx = new Map();
  for (const it of items || []) {
    const key = ['gold', 'gems', 'sigils', 'energy', 'passXp'].includes(it.kind) ? it.kind : it.kind === 'shards' ? 'shards:' + it.hero : null;
    if (key && idx.has(key)) { idx.get(key).amount += it.amount; continue; }
    const copy = { ...it };
    if (key) idx.set(key, copy);
    out.push(copy);
  }
  return out;
}

/** rewardPopup with merging and a scrollable body for long lists. */
export function popRewards(app, items, opts = {}) {
  const merged = mergeItems(items);
  if (!merged.length) return null;
  const m = rewardPopup(merged, { audio: app.audio, ...opts });
  if (m) m.el.querySelector('.modal')?.classList.add('scroll');
  try { app.haptic && app.haptic('success'); } catch (e) { /* optional */ }
  return m;
}

/** Thin progress bar markup. */
export const bar = (frac, cls = '') => `<div class="mbar ${cls}"><i style="width:${(clamp01(frac) * 100).toFixed(1)}%"></i></div>`;

/** Star row: filled up to `n` of `max`. */
export const stars = (n, max = 5) => `<span class="stars">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">${icon('star')}</i>`).join('')}</span>`;

/** Run `fn` (which re-renders inside root) and keep the scroll offset of every [data-keep] scroller. */
export function keepScroll(root, fn) {
  const saved = {};
  for (const n of root.querySelectorAll('[data-keep]')) saved[n.dataset.keep] = n.scrollTop;
  fn();
  for (const n of root.querySelectorAll('[data-keep]')) if (saved[n.dataset.keep] != null) n.scrollTop = saved[n.dataset.keep];
}

/** One delegated click handler for [data-act] buttons inside a persistent root. */
export function delegate(root, handlers) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !root.contains(b) || b.disabled || b.classList.contains('is-disabled')) return;
    const fn = handlers[b.dataset.act];
    if (fn) fn(b, e);
  });
}
