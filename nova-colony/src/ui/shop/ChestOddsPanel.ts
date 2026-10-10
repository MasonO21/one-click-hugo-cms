/**
 * The odds sheet for a Nova cache (Shop › Chests › Odds), shown before purchase as App Store guideline 3.1.1 and Google
 * Play require for loot boxes. Every number comes from `chestOdds`, which reads the very tables the roller uses
 * (data/chestLoot.ts → sim/chests.ts), so the sheet can never drift from the game.
 */
import { Panel, type PanelTitle } from '../panels/Panel';
import { CARD_RARITIES, chestOdds, guaranteeLine, rarityRank, type ChestCardKind } from '../../sim/chests';
import { COSMETIC_PITY, DUPLICATE_SHARE } from '../../data/chestLoot';
import type { CosmeticRarity } from '../../data/schema';
import { artOrEmoji, chestArt, hudArt, iconEl, itemArt, resourceArt } from '../art';
import { fill, h } from '../dom';
import { bigNum, btn } from '../widgets';
import { RARITY_LABEL } from '../chest/logic';

const RARITY_DOT: Record<CosmeticRarity, string> = { common: '#b8a27a', rare: '#3c6fa4', epic: '#654aa8', legendary: '#c8953c', mythic: 'linear-gradient(135deg, #b98ac0, #7d86d0, #5aa4b8)' };

const KIND_ROW: Record<ChestCardKind, { label: string; art: () => string | null; emoji: string; hint: string }> = {
  resources: { label: 'Resources', art: () => resourceArt('wood'), emoji: '🪵', hint: 'Sized to your colony tier' },
  boost: { label: 'Boost', art: () => hudArt('power'), emoji: '⚡', hint: 'Production, research or gathering' },
  item: { label: 'Helpful item', art: () => itemArt('worker_drone'), emoji: '🤖', hint: 'Crates, medkits, drones, research chips' },
  colonist: { label: 'Colonist', art: () => hudArt('crew'), emoji: '🧑‍🚀', hint: 'Of the find’s rarity' },
  nova: { label: 'A little Nova', art: () => resourceArt('nova'), emoji: '💎', hint: '' },
  cosmetic: { label: 'Cosmetic', art: () => null, emoji: '✨', hint: 'Never one you already own' },
};

/** "12.5%" / "0.8%" / "<0.1%". */
export function pctText(p: number): string {
  if (p > 0 && p < 0.1) return '<0.1%';
  const r = Math.round(p * 10) / 10;
  return `${Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)}%`;
}

export class ChestOddsPanel extends Panel {
  readonly name = 'chest_odds';
  override readonly kind = 'modal' as const;

  private chest(): string {
    return this.pick<string>(this.arg, 'chest') ?? 'chest_supply';
  }

  title(): PanelTitle {
    return { icon: '🎲', text: 'Cache odds' };
  }

  override signature(): string {
    const id = this.chest();
    return `${id}|${this.st.liveops.nova}|${this.game.sys.chests.owned(id)}|${this.st.liveops.chests?.pity ?? 0}`;
  }

  render(): void {
    const g = this.game;
    const def = this.data.chest(this.chest());
    if (!def) {
      fill(this.body, h('div', { class: 'mute', text: 'This cache is not available.' }));
      return;
    }
    const o = chestOdds(def);
    const wrap = h('div', { class: 'chest-odds', data: { chest: def.id } });
    wrap.appendChild(
      h(
        'div',
        { class: 'co-head' },
        artOrEmoji(chestArt(def.id), def.icon, 'co-art', def.name),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'co-name', text: def.name }),
          h('div', { class: `co-ribbon r-${def.rarity}`, text: RARITY_LABEL[def.rarity] }),
          h('div', { class: 'mute small', text: `${def.cards} finds in every cache` }),
        ),
      ),
    );

    // guarantees, in words
    const guar: string[] = [];
    if (o.core) guar.push('1 find is always a mythic cosmetic while there is one you don’t own yet (then the best one left).');
    if (o.guaranteed > 0) {
      const better = o.quality.some((q) => rarityRank(q.rarity) > o.guaranteed);
      guar.push(`At least 1 ${o.core ? 'other ' : ''}find is ${RARITY_LABEL[CARD_RARITIES[o.guaranteed]].toLowerCase()}${better ? ' or better' : ''}.`);
    }
    if (o.pity) guar.push(`Every ${COSMETIC_PITY}th cache in a row (Explorer's Case or better) without a new cosmetic brings one. Yours: within ${g.sys.chests.pityLeft()}.`);
    wrap.appendChild(h('div', { class: 'co-guar' }, h('b', { text: `★ ${guaranteeLine(def)}` }), ...guar.map((t) => h('div', { text: t }))));

    const note = o.core ? ` (the other ${o.rolled})` : '';
    wrap.appendChild(h('div', { class: 'co-sec', text: `Rarity of each find${note}` }));
    wrap.appendChild(h('div', { class: 'co-rows', data: { odds: 'rarity' } }, ...o.quality.map((q) => this.row(this.dot(q.rarity), RARITY_LABEL[q.rarity], '', q.pct, RARITY_DOT[q.rarity]))));

    wrap.appendChild(h('div', { class: 'co-sec', text: `What each find${note} is` }));
    wrap.appendChild(
      h(
        'div',
        { class: 'co-rows', data: { odds: 'kind' } },
        ...o.kinds.map((k) => {
          const r = KIND_ROW[k.kind];
          return this.row(iconEl(r.art(), r.emoji), r.label, r.hint, k.pct, '#8a7350');
        }),
      ),
    );

    wrap.appendChild(h('div', { class: 'co-sec', text: `Cosmetic odds per find${note}` }));
    wrap.appendChild(h('div', { class: 'co-rows', data: { odds: 'cosmetic' } }, ...o.cosmetics.map((c) => this.row(this.dot(c.rarity), `${RARITY_LABEL[c.rarity]} cosmetic`, '', c.pct, RARITY_DOT[c.rarity]))));

    const top = RARITY_LABEL[def.rarity].toLowerCase();
    wrap.appendChild(
      h(
        'div',
        { class: 'co-fine' },
        h('p', { text: cosmeticFine(def.rarity, top) }),
        h('p', { text: 'Odds are per find. When a cache rolls nothing good enough for its guarantee, one find is lifted to it. Resources are sized to your colony’s current tier.' }),
        h('p', { text: 'Everything in a cache only speeds things up or is cosmetic: every building, every tier and Titanium itself can be reached for free.' }),
      ),
    );

    const afford = g.sys.chests.canAfford(def.id);
    // not sold here (paid random items restricted in this region): the odds stay, without a way to buy
    if (g.sys.chests.forSale(def.id)) {
      wrap.appendChild(
        btn({
          label: afford ? `Buy & open · ${bigNum(def.nova)} Nova` : `${bigNum(def.nova)} Nova · Get more Nova`,
          cls: 'big nova block co-buy',
          onClick: () => {
            if (!g.sys.chests.canAfford(def.id)) {
              this.ctx.close(this.name);
              this.ctx.open('shop', { tab: 'crystals' });
              return;
            }
            this.ctx.close(this.name);
            if (g.sys.chests.buy(def.id)) this.ctx.haptic('success');
          },
        }),
      );
    }
    fill(this.body, wrap);
  }

  private dot(r: CosmeticRarity): HTMLElement {
    const d = h('span', { class: 'co-dot' });
    d.style.background = RARITY_DOT[r];
    return d;
  }

  private row(icon: HTMLElement, label: string, hint: string, pct: number, color: string): HTMLElement {
    const bar = h('i');
    bar.style.width = `${Math.max(1.5, Math.min(100, pct))}%`;
    bar.style.setProperty('--c', color);
    return h(
      'div',
      { class: 'co-row' },
      h('span', { class: 'co-ic' }, icon),
      h('span', { class: 'co-lbl' }, h('span', null, label, hint ? h('span', { class: 'mute small', text: ` · ${hint}` }) : null), h('span', { class: 'co-bar' }, bar)),
      h('span', { class: 'co-pct', text: pctText(pct) }),
    );
  }
}

/** The fine print on cosmetics: never repeated, stepping down a rarity, Nova back once there is nothing new. */
export function cosmeticFine(rarity: CosmeticRarity, top: string): string {
  const back = `you get Nova back instead (about ${Math.round(DUPLICATE_SHARE * 100)}% of a typical price)`;
  if (rarity === 'common') return `Cosmetics in this cache are common and never repeated: once you own every one, ${back}.`;
  return `Cosmetics go up to ${top} in this cache and are never repeated: if you own every one of a rarity you get the next rarity down; if you own them all, ${back}.`;
}
