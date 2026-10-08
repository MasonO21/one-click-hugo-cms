/**
 * Shop › Nova Shop (little shortcuts bought with Nova) and the art for bundle cards (Shop › Packs), kept out of
 * ShopPanel.ts so the panel only needs a thin hook. Logic: sim/novaShop.ts; data: data/novaShop.ts.
 */
import type { UiCtx } from '../../ctx';
import type { ProductDef } from '../../../data/schema';
import type { NovaShopItemDef } from '../../../data/novaShop';
import { buyNovaItem, novaOffers, type NovaOffer } from '../../../sim/novaShop';
import { h } from '../../dom';
import { btn, rewardChips } from '../../widgets';
import { artOrEmoji, chestArt, hudArt, iconEl, itemArt, poiArt, resourceArt } from '../../art';
import type { Reward } from '../../../data/schema';
import { needsNovaConfirm } from '../../logic/wardrobe';
import { cosmeticIcon, novaConfirm, novaLabel } from '../wardrobe/cards';

/** The painted icon an item borrows (`hud:` / `item:` / `res:` / `poi:` / `chest:`). */
export function novaItemArt(def: NovaShopItemDef): string | null {
  const [kind, id] = (def.art ?? '').split(':');
  if (!id) return null;
  return kind === 'hud' ? hudArt(id) : kind === 'item' ? itemArt(id) : kind === 'res' ? resourceArt(id) : kind === 'poi' ? poiArt(id) : kind === 'chest' ? chestArt(id) : null;
}

const GROUPS: { title: string; kinds: NovaShopItemDef['kind'][] }[] = [
  { title: 'Boosts', kinds: ['boost'] },
  { title: 'Time savers', kinds: ['expedition', 'recruit_refresh', 'merchant', 'spin', 'season_level'] },
  { title: 'Goodies', kinds: ['cache', 'recruit'] },
];

/** Signature bits that change what the tab shows (daily counts, running boosts, trips out). */
export function novaShopSignature(ctx: UiCtx): string {
  return novaOffers(ctx.game)
    .map((o) => `${o.price}${o.ok ? 1 : 0}${o.left}${o.detail ?? ''}`)
    .join('|');
}

/** The Nova Shop tab. `changed` re-renders; `host` is where confirmations go (the panel card). */
export function novaShopTab(ctx: UiCtx, host: () => HTMLElement, changed: () => void): HTMLElement {
  const wrap = h('div', { class: 'stack-v' });
  wrap.appendChild(
    h(
      'div',
      { class: 'card ns-intro' },
      h('span', { class: 'big-ico', text: '✨' }),
      h('div', { class: 'grow' }, h('div', { class: 'h3', text: 'Little shortcuts' }), h('div', { class: 'mute small', text: 'Spend Nova to speed things up. Everything here also comes free with play: it only saves you time.' })),
    ),
  );
  const offers = novaOffers(ctx.game);
  for (const g of GROUPS) {
    const list = offers.filter((o) => g.kinds.includes(o.def.kind));
    if (!list.length) continue;
    wrap.appendChild(h('div', { class: 'sec ns-sec', text: g.title }));
    const grid = h('div', { class: 'ns-list' });
    for (const o of list) grid.appendChild(offerCard(ctx, o, host, changed));
    wrap.appendChild(grid);
  }
  return wrap;
}

function offerCard(ctx: UiCtx, o: NovaOffer, host: () => HTMLElement, changed: () => void): HTMLElement {
  const def = o.def;
  const meta = h('div', { class: 'ns-meta' });
  if (o.detail) meta.appendChild(h('span', { class: 'chip info', text: o.detail }));
  if (Number.isFinite(o.left) && def.dailyCap > 0) meta.appendChild(h('span', { class: 'chip' + (o.left === 0 ? ' warn' : ''), text: o.left === 0 ? 'Sold out today' : `${o.left} left today` }));
  const art = novaItemArt(def);
  const card = h(
    'div',
    { class: 'card ns-item', data: { nova: def.id } },
    art ? h('span', { class: 'ns-art' }, artOrEmoji(art, def.icon, 'ns-img', '')) : h('span', { class: 'ns-art emoji', text: def.icon }),
    h('div', { class: 'ns-txt' }, h('div', { class: 'ns-name', text: def.name }), h('div', { class: 'ns-desc', text: def.description }), o.reward ? cacheChips(ctx, o.reward) : null, meta.childElementCount ? meta : null),
    btn({
      label: novaLabel(o.price),
      cls: 'nova small',
      data: { act: 'nova-buy' },
      disabled: o.ok ? false : (o.reason ?? true),
      onClick: () => buy(ctx, o, host, changed),
    }),
  );
  return card;
}

/** A cache's contents, short: the first few resources and "+N more" (the reward card lists them all). */
function cacheChips(ctx: UiCtx, r: Reward): HTMLElement {
  const entries = Object.entries(r.resources ?? {});
  const shown: Reward = { resources: Object.fromEntries(entries.slice(0, 4)) };
  const el = rewardChips(ctx.data, shown, 'ns-chips');
  if (entries.length > 4) el.appendChild(h('span', { class: 'chip', text: `+${entries.length - 4} more` }));
  return el;
}

function buy(ctx: UiCtx, o: NovaOffer, host: () => HTMLElement, changed: () => void): void {
  const go = () => {
    const res = buyNovaItem(ctx.game, o.def.id);
    if (!res.ok) {
      ctx.toast(res.reason ?? 'Not available right now', 'info', '💎');
      changed();
      return;
    }
    ctx.haptic('success');
    if (o.def.kind === 'spin' && res.spin != null) ctx.open('spin', { animate: res.spin });
    else if (o.def.kind === 'cache' && res.reward) ctx.showReward(o.def.name, res.reward, '🎁');
    changed();
  };
  if (needsNovaConfirm(o.price)) {
    const art = novaItemArt(o.def);
    novaConfirm(host(), { title: o.def.name, icon: art ? h('span', { class: 'ns-art' }, artOrEmoji(art, o.def.icon, 'ns-img', '')) : h('span', { class: 'ns-art emoji', text: o.def.icon }), price: o.price, text: o.def.description, onConfirm: go });
  } else go();
}

/** A bundle card's picture, drawn from what is inside: its cosmetics in their rarity rings, or its chests. */
export function bundleArt(ctx: UiCtx, p: ProductDef): HTMLElement | null {
  const g = p.grants;
  const cos = [...(g.cosmetic ? [g.cosmetic] : []), ...(g.cosmetics ?? [])].map((id) => ctx.data.cosmetic(id)).filter((c) => !!c);
  const chests = Object.keys(g.items ?? {}).filter((id) => ctx.data.chest(id));
  const kids: HTMLElement[] = [];
  if (cos.length) for (const c of cos.slice(0, 3)) kids.push(cosmeticIcon(c));
  else if (chests.length) {
    // the best chest in the middle, the others either side
    const order = [...chests].sort((a, b) => ctx.data.chests.findIndex((c) => c.id === a) - ctx.data.chests.findIndex((c) => c.id === b));
    const best = order.pop()!;
    const pick = [order[order.length - 1] ?? null, best, order[0] !== order[order.length - 1] ? order[0] : null].filter((x): x is string => !!x);
    for (const id of pick) kids.push(artOrEmoji(chestArt(id), ctx.data.chest(id)?.icon ?? '🎁', 'bundle-chest', ctx.data.chest(id)?.name ?? ''));
  }
  if (!kids.length) return null;
  const el = h('div', { class: 'bundle-art' }, ...kids);
  if (g.nova) el.appendChild(h('span', { class: 'bundle-nova' }, iconEl(resourceArt('nova'), '💎'), ` +${g.nova}`));
  return el;
}

/** Shop › Cosmetics header: a way into the Wardrobe. */
export function wardrobeCta(ctx: UiCtx): HTMLElement {
  const own = ctx.game.state.liveops.cosmetics.owned.length;
  return h(
    'div',
    { class: 'card tint wd-shop-cta' },
    iconEl(hudArt('wardrobe'), '👗', 'big-ico', 'span'),
    h('div', { class: 'grow' }, h('div', { class: 'h3', text: 'Your Wardrobe' }), h('div', { class: 'mute small', text: `${own} of ${ctx.data.cosmetics.length} collected. Try things on, see where to find the rest.` })),
    btn({ label: 'Open', cls: 'info small', id: 'btn-open-wardrobe', onClick: () => ctx.open('wardrobe') }),
  );
}
