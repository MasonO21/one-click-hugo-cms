/**
 * Shop › Chests: the five Nova caches as painted cards (each on a slice of its own opening backdrop), with the number
 * of finds, the guarantee, the price, an Odds sheet (shown before purchase: App Store 3.1.1 / Google Play) and
 * "Buy & open". Short of Nova, the button points to the Crystals tab. Caches already owned open from here too (and
 * from the Inventory).
 */
import type { ChestDef } from '../../data/schema';
import type { UiCtx } from '../ctx';
import { guaranteeLine } from '../../sim/chests';
import { COSMETIC_PITY } from '../../data/chestLoot';
import { artOrEmoji, chestArt, chestBgArt, itemArt, resIcon } from '../art';
import { h } from '../dom';
import { bigNum, btn } from '../widgets';
import { PEDESTAL } from '../chest/layout';
import { RARITY_LABEL, findsLabel } from '../chest/logic';

export interface ChestsTabHost {
  /** Switch the Shop to its Crystals tab (not enough Nova). */
  goCrystals(): void;
  rerender(): void;
}

/** What the tab shows changes with: owned caches, the pity counter (Nova is in the Shop's own signature). */
export function chestsSignature(ctx: UiCtx): string {
  const g = ctx.game;
  return `${g.data.chests.map((c) => g.sys.chests.owned(c.id)).join(',')}|${g.state.liveops.chests?.pity ?? 0}`;
}

/** Unopened caches (the tab's badge). */
export function chestsBadge(ctx: UiCtx): number {
  return ctx.game.sys.chests.ownedTotal();
}

/** The pity line: how close the guaranteed cosmetic is (Explorer's Case and up count). */
export function pityText(left: number): string {
  if (left <= 1) return 'Your next cache brings a new cosmetic';
  return `A new cosmetic within ${left} caches, guaranteed`;
}

export function chestsTab(ctx: UiCtx, host: ChestsTabHost): HTMLElement {
  const g = ctx.game;
  const wrap = h('div', { class: 'stack-v' });
  const left = g.sys.chests.pityLeft();
  const pips = h('span', { class: 'ci-pips', 'aria-hidden': 'true' });
  for (let i = 0; i < COSMETIC_PITY; i++) pips.appendChild(h('i', { class: i < COSMETIC_PITY - left ? 'on' : '' }));
  wrap.appendChild(
    h(
      'div',
      { class: 'card chest-intro' },
      artOrEmoji(itemArt('chest_prospector'), '🧰', 'ci-art', ''),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'h3', text: 'Caches' }),
        h('div', { class: 'ci-text mute', text: "Sealed caches from the supply line: goods sized to your colony's tier, boosts, gear, new colonists and cosmetics you never get twice." }),
        h('div', { class: 'ci-pity' }, h('b', { text: pityText(left) }), h('div', { class: 'ci-pity-m' }, pips, h('span', { class: 'mute', text: "Explorer's Case and up" }))),
      ),
    ),
  );
  const list = h('div', { class: 'chest-list' });
  for (const def of g.data.chests) list.appendChild(chestCard(ctx, host, def));
  wrap.appendChild(list);
  wrap.appendChild(
    h(
      'div',
      { class: 'card chest-earn mute' },
      h('b', { text: 'Free caches: ' }),
      "day 7 of the login calendar brings an Explorer's Case, and the first raid you repel at each colony tier leaves a Supply Cache in the spoils. The season pass has more.",
    ),
  );
  return wrap;
}

function chestCard(ctx: UiCtx, host: ChestsTabHost, def: ChestDef): HTMLElement {
  const g = ctx.game;
  const chests = g.sys.chests;
  const owned = chests.owned(def.id);
  const afford = chests.canAfford(def.id);
  const bg = chestBgArt(def.id);
  const stage = h(
    'div',
    { class: 'cc-stage', style: { '--ped': `${((PEDESTAL[def.id] ?? 0.6) * 100).toFixed(0)}%`, '--cg': def.accent } },
    h('div', { class: 'cc-glow' }),
    artOrEmoji(chestArt(def.id), def.icon, 'cc-art', def.name, true),
    h('div', { class: `cc-ribbon r-${def.rarity}`, text: RARITY_LABEL[def.rarity] }),
    owned > 0 ? h('div', { class: 'cc-own', text: `×${owned}` }) : null,
  );
  if (bg) stage.style.backgroundImage = `url("${bg}")`;
  const price = h('span', { class: 'cc-price' }, resIcon('nova', '💎'), bigNum(def.nova));
  const buy = btn({
    label: afford ? 'Buy & open' : 'Get Nova',
    sub: price,
    cls: 'nova cc-buy' + (afford ? '' : ' short'),
    data: { buy: def.id },
    onClick: () => {
      if (!chests.canAfford(def.id)) {
        const need = def.nova - g.state.liveops.nova;
        ctx.toast(`You need ${bigNum(need)} more Nova for the ${def.name}`, 'info', '💎');
        host.goCrystals();
        return;
      }
      // the scene opens from chest:opened; everything is already granted
      if (chests.buy(def.id)) ctx.haptic('success');
      host.rerender();
    },
  });
  const odds = btn({ label: 'Odds', cls: 'ghost cc-odds', data: { odds: def.id }, onClick: () => ctx.open('chest_odds', { chest: def.id }) });
  const info = h(
    'div',
    { class: 'cc-info' },
    h('div', { class: 'h3', text: def.name }),
    h('div', { class: 'cc-line' }, h('span', { class: 'cc-tag', text: findsLabel(def.cards) }), h('span', { class: 'cc-tag guar', text: guaranteeLine(def) })),
    h('div', { class: 'mute cc-desc', text: def.description }),
    // where paid random items are restricted, caches are earned only: no buy button, the odds stay visible
    chests.forSale(def.id) ? h('div', { class: 'cc-buttons' }, odds, buy) : h('div', { class: 'cc-buttons' }, odds, h('div', { class: 'mute small cc-region', text: 'Not sold in your region. Earn caches from the login calendar, raids and the season pass.' })),
  );
  if (owned > 0) {
    info.appendChild(
      btn({
        label: owned > 1 ? `Open one (${owned} owned)` : 'Open yours',
        cls: 'good small block',
        data: { open: def.id },
        onClick: () => {
          if (chests.open(def.id)) ctx.haptic('success');
          host.rerender();
        },
      }),
    );
  } else if (afford && chests.forSale(def.id)) {
    const keep = h('button', { class: 'cc-keep', type: 'button', text: 'Buy now, open later' });
    keep.addEventListener('click', () => {
      if (chests.buy(def.id, false)) ctx.toast(`${def.name} stored in your Inventory`, 'success', itemArt(def.id) ?? def.icon);
      host.rerender();
    });
    info.appendChild(keep);
  }
  return h('div', { class: `card chest-card r-${def.rarity}`, data: { chest: def.id } }, stage, info);
}
