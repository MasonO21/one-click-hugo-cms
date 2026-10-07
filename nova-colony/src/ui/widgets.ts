/**
 * Shared widgets: buttons, resource/cost/reward chips, progress bars, tabs, portraits, ad buttons.
 */
import type { DataRegistry } from '../data';
import type { ResourceBag, Reward } from '../data/schema';
import type { Colonist } from '../core/state';
import type { UiCtx } from './ctx';
import { fmt } from '../core/format';
import { bagEntries } from '../core/bag';
import { h, type Child } from './dom';
import { rewardParts, RARITY_COLOR } from './logic/rewards';
import { portraitSvg } from './logic/colonist';

export interface BtnOpts {
  label?: Child;
  icon?: string;
  sub?: Child;
  cls?: string;
  id?: string;
  /** true = disabled; a string = disabled with a reason shown when tapped. */
  disabled?: boolean | string;
  onClick?: (e: MouseEvent) => void;
  data?: Record<string, string | number | boolean | undefined>;
}

/** Chunky game button. Disabled buttons stay tappable to explain *why* (data-why -> toast). */
export function btn(o: BtnOpts): HTMLButtonElement {
  const kids: Child[] = [];
  if (o.icon) kids.push(h('span', { class: 'ico', text: o.icon }));
  if (o.sub != null) kids.push(h('span', { class: 'stack' }, h('span', null, o.label), h('span', { class: 'sub' }, o.sub)));
  else if (o.label != null) kids.push(o.label);
  const el = h<HTMLButtonElement>('button', { class: 'btn ' + (o.cls ?? ''), id: o.id, data: o.data, type: 'button' }, ...kids);
  setDisabled(el, o.disabled);
  if (o.onClick) el.addEventListener('click', o.onClick);
  return el;
}

export function setDisabled(el: HTMLElement, disabled: boolean | string | undefined): void {
  if (disabled) {
    el.setAttribute('aria-disabled', 'true');
    if (typeof disabled === 'string') el.setAttribute('data-why', disabled);
    else el.removeAttribute('data-why');
  } else {
    el.removeAttribute('aria-disabled');
    el.removeAttribute('data-why');
  }
}

/** A resource amount chip. Red when `have` is below `amount`. */
export function resChip(data: DataRegistry, id: string, amount: number, have?: number): HTMLElement {
  const d = data.resource(id);
  const bad = have != null && have + 1e-9 < amount;
  return h('span', { class: 'chip' + (bad ? ' bad' : ''), title: d?.name ?? id }, h('i', { text: d?.icon ?? '•' }), fmt(Math.ceil(amount)));
}

/**
 * Item-ingredient chips ("🧩 ×2 Machine Parts"), red when the player holds fewer than needed. Appended to
 * `into` (e.g. a costChips row) or returned in their own row. Recipes with `itemInputs` need these, or a
 * Craft button looks affordable while it isn't.
 */
export function itemChips(data: DataRegistry, items: Record<string, number> | null | undefined, have: Record<string, number>, into?: HTMLElement): HTMLElement {
  const wrap = into ?? h('div', { class: 'chips cost' });
  for (const [id, n] of Object.entries(items ?? {})) {
    if (!(n > 0)) continue;
    const d = data.item(id);
    const bad = (have[id] ?? 0) < n;
    wrap.appendChild(h('span', { class: 'chip' + (bad ? ' bad' : ''), title: `${d?.name ?? id} (you have ${have[id] ?? 0})` }, h('i', { text: d?.icon ?? '🧩' }), `${n}× ${d?.name ?? id}`));
  }
  return wrap;
}

/** Resource + item ingredients of a recipe in one chip row ("Free" only when it needs nothing at all). */
export function recipeChips(data: DataRegistry, inputs: ResourceBag | null | undefined, itemInputs: Record<string, number> | null | undefined, haveRes: Record<string, number>, haveItems: Record<string, number>): HTMLElement {
  const hasItems = Object.values(itemInputs ?? {}).some((n) => n > 0);
  if (hasItems && !bagEntries(inputs ?? {}).length) return itemChips(data, itemInputs, haveItems);
  return itemChips(data, itemInputs, haveItems, costChips(data, inputs, haveRes));
}

/** Cost chips (red for what the player lacks). */
export function costChips(data: DataRegistry, cost: ResourceBag | null | undefined, have: Record<string, number>): HTMLElement {
  const wrap = h('div', { class: 'chips cost' });
  const e = bagEntries(cost ?? {});
  if (!e.length) wrap.appendChild(h('span', { class: 'chip good', text: 'Free' }));
  for (const [id, v] of e) wrap.appendChild(resChip(data, id, v, have[id] ?? 0));
  return wrap;
}

/** Reward chips (colored per kind). */
export function rewardChips(data: DataRegistry, reward: Reward | null | undefined, cls = ''): HTMLElement {
  const wrap = h('div', { class: 'chips reward ' + cls });
  for (const p of rewardParts(reward, data)) {
    wrap.appendChild(h('span', { class: 'chip', title: p.label, style: { background: p.color + '33' } }, h('i', { text: p.icon }), p.amount));
  }
  return wrap;
}

export interface BarEl extends HTMLElement {
  set(v: number, label?: string): void;
}

/** Progress bar driven with `transform: scaleX` (no layout). */
export function bar(v: number, cls = '', label?: string): BarEl {
  const fillEl = h('i');
  const lbl = h('span', { class: 'lbl' });
  const el = h('div', { class: 'bar ' + cls }, fillEl, lbl) as BarEl;
  el.set = (value: number, text?: string) => {
    fillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, value)).toFixed(3)})`;
    lbl.textContent = text ?? '';
  };
  el.set(v, label);
  return el;
}

export interface TabItem {
  id: string;
  icon?: string;
  label: string;
  badge?: number;
}

export function tabs(items: TabItem[], active: string, onSelect: (id: string) => void): HTMLElement {
  const wrap = h('div', { class: 'tabs', data: { scroll: 'tabs' } });
  for (const t of items) {
    const b = h<HTMLButtonElement>(
      'button',
      { class: 'tab' + (t.id === active ? ' on' : ''), type: 'button', data: { tab: t.id, sfx: 'ui_tab' } },
      t.icon ? h('span', { class: 'ico', text: t.icon }) : null,
      t.label,
      t.badge ? h('span', { class: 'dot', text: String(t.badge) }) : null,
    );
    b.addEventListener('click', () => onSelect(t.id));
    wrap.appendChild(b);
  }
  return wrap;
}

export function portrait(c: Pick<Colonist, 'appearance' | 'rarity'>, large = false): HTMLElement {
  return h('div', { class: 'portrait' + (large ? ' lg' : ''), style: { '--rar': RARITY_COLOR[c.rarity] ?? '#fff' }, html: portraitSvg(c) });
}

export function emptyState(icon: string, text: string, sub?: string): HTMLElement {
  return h('div', { class: 'empty' }, h('div', { class: 'big-ico', text: icon }), h('div', { class: 'h3', text }), sub ? h('div', { class: 'mute', text: sub }) : null);
}

export function section(text: string): HTMLElement {
  return h('div', { class: 'sec', text });
}

/** "▶ label" rewarded-ad button honouring daily limits/cooldowns. */
export function adButton(ctx: UiCtx, placement: string, label: string, onDone?: (ok: boolean) => void, opts: { context?: unknown; cls?: string; sub?: string; run?: () => Promise<boolean> } = {}): HTMLButtonElement {
  const game = ctx.game;
  const def = ctx.data.ad(placement);
  const can = game.sys.liveops.canWatchAd(placement);
  let sub = opts.sub;
  if (!sub && def && def.dailyLimit > 0) {
    const used = game.state.liveops.ads.counts[placement] ?? 0;
    sub = `${Math.max(0, def.dailyLimit - used)} left today`;
  }
  return btn({
    label,
    sub,
    cls: 'ad ' + (opts.cls ?? ''),
    disabled: can ? false : 'Video not ready yet — come back in a bit!',
    data: { ad: placement },
    onClick: async (e) => {
      const el = e.currentTarget as HTMLElement;
      if (el.getAttribute('aria-busy')) return;
      el.setAttribute('aria-busy', '1');
      const ok = opts.run ? await opts.run() : await ctx.watchAd(placement, opts.context);
      el.removeAttribute('aria-busy');
      onDone?.(ok);
    },
  });
}

/** Effect-tone chip row used by cards. */
export function tagChips(tags: { icon: string; text: string; tone?: string }[], max = 3): HTMLElement {
  const wrap = h('div', { class: 'chips tags' });
  for (const t of tags.slice(0, max)) {
    wrap.appendChild(h('span', { class: 'chip ' + (t.tone ?? ''), }, t.icon ? h('i', { text: t.icon }) : null, t.text));
  }
  return wrap;
}

/** Big number formatting for premium currency & counters. */
export function bigNum(n: number): string {
  n = Math.floor(n);
  return n < 100000 ? n.toLocaleString('en-US') : fmt(n);
}
