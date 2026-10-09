/**
 * ShopPanel — Nova Crystals, packs, the Colony Pass (VIP), the season pass and cosmetics. Prices come
 * from the store through LiveOpsSystem.price(); the free crate lives at the top. Never blocks
 * gameplay — everything is optional.
 */
import { Panel, type PanelTitle } from './Panel';
import type { ProductDef } from '../../data/schema';
import { fmtHMS } from '../logic/time';
import { adButton, bigNum, btn, emptyState, rewardChips, tabs } from '../widgets';
import { fill, h } from '../dom';
import { artOrEmoji, hudArt, itemArt, resIcon, rewardArt, shopArt } from '../art';
import { bundleArt, novaShopSignature, novaShopTab, wardrobeCta } from './shop/novaShopTab';
import { closeConfirm, confirmOpen, cosmeticCard, type CardHandlers } from './wardrobe/cards';
import { sortCosmetics } from '../logic/wardrobe';
import { chestsBadge, chestsSignature, chestsTab } from '../shop/ChestsTab';

type Tab = 'chests' | 'crystals' | 'packs' | 'nova' | 'vip' | 'season' | 'cosmetics';

const TAG_TEXT: Record<string, string> = { best_value: 'BEST VALUE', popular: 'POPULAR', limited: 'LIMITED', new: 'NEW' };
const SECTION_ICON: Record<string, string> = { chests: '🧰', crystals: '💎', packs: '🎁', bundles: '📦', nova: '✨', vip: '👑', season: '🏆', cosmetics: '👕' };

export class ShopPanel extends Panel {
  readonly name = 'shop';
  private tab: Tab = 'chests';
  private busy = '';
  private acc = 0;
  private readonly cosHandlers: CardHandlers = {
    open: (def) => this.ctx.open('wardrobe', { id: def.id }),
    changed: () => this.rerender(),
    host: () => this.card,
  };

  title(): PanelTitle {
    return { icon: '💎', art: hudArt('shop'), text: 'Shop' };
  }

  override onOpen(arg: unknown): void {
    const t = this.pick<Tab>(arg, 'tab');
    if (t) this.tab = t;
    // the Shop button's badge is the free crate (Crystals tab): a plain open goes where the badge points
    else if (this.game.sys.liveops.freeCrateReady() && this.game.sys.liveops.offersUnlocked()) this.tab = 'crystals';
  }

  override onArg(arg: unknown): void {
    const t = this.pick<Tab>(arg, 'tab');
    if (t) {
      this.tab = t;
      this.rev++;
    }
  }

  override extras() {
    return h('div', { class: 'nova-bank' }, resIcon('nova', '💎', '', 'span'), h('b', { class: 'num', text: bigNum(this.st.liveops.nova) }));
  }

  override signature(): string {
    const lo = this.st.liveops;
    const crate = this.game.sys.liveops.freeCrateReady() ? 1 : 0;
    return `${this.tab}|${this.tab === 'chests' ? chestsSignature(this.ctx) : ''}|${lo.nova}|${lo.purchases.length}|${lo.vip.until}|${lo.cosmetics.owned.length}|${Object.values(lo.cosmetics.equipped).join(',')}|${crate}|${this.busy}|${lo.season.premium}${this.tab === 'nova' ? '|' + novaShopSignature(this.ctx) : ''}`;
  }

  /** A Nova purchase confirmation is up: Android back closes it first. */
  override nestedView(): boolean {
    return confirmOpen(this.card);
  }

  override leaveNested(): void {
    closeConfirm(this.card);
  }

  override onClose(): void {
    closeConfirm(this.card);
  }

  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const el = this.body.querySelector('[data-crate-time]');
    if (el) el.textContent = this.crateText();
  }

  private crateText(): string {
    const ms = this.st.liveops.freeCrateAt - this.game.now();
    return ms > 0 ? fmtHMS(ms / 1000) : 'Ready!';
  }

  private owned(p: ProductDef): boolean {
    return p.limit > 0 && this.st.liveops.purchases.filter((x) => x.id === p.id).length >= p.limit;
  }

  render(): void {
    const wrap = h('div', { class: 'stack-v' });
    wrap.appendChild(
      tabs(
        (['chests', 'crystals', 'packs', 'nova', 'vip', 'season', 'cosmetics'] as Tab[]).map((id) => ({
          id,
          icon: SECTION_ICON[id],
          art: id === 'chests' ? itemArt('chest_prospector') : undefined,
          badge: id === 'chests' ? chestsBadge(this.ctx) : undefined,
          label: id === 'vip' ? 'Colony Pass' : id === 'season' ? 'Season' : id === 'nova' ? 'Nova Shop' : id === 'chests' ? 'Caches' : id[0].toUpperCase() + id.slice(1),
        })),
        this.tab,
        (id) => {
          this.tab = id as Tab;
          this.rerender();
        },
      ),
    );
    if (this.tab === 'crystals') wrap.appendChild(this.freeCrate());
    if (this.tab === 'chests') {
      wrap.appendChild(
        chestsTab(this.ctx, {
          goCrystals: () => {
            this.tab = 'crystals';
            this.rerender();
          },
          rerender: () => this.rerender(),
        }),
      );
    } else if (this.tab === 'nova') wrap.appendChild(novaShopTab(this.ctx, () => this.card, () => this.rerender()));
    else if (this.tab === 'vip') wrap.appendChild(this.vip());
    else if (this.tab === 'season') wrap.appendChild(this.season());
    else if (this.tab === 'cosmetics') wrap.appendChild(this.cosmetics());
    else {
      // the Packs tab opens with the bundles (cosmetics / chests + Nova)
      const prods = this.data.products.filter((p) => (p.section === this.tab || (this.tab === 'packs' && p.section === 'bundles')) && this.game.sys.liveops.offered(p)).sort((a, b) => +(b.section === 'bundles') - +(a.section === 'bundles'));
      if (!prods.length) wrap.appendChild(emptyState('🛍️', 'Nothing here right now', 'Check back soon for new goodies!'));
      const grid = h('div', { class: 'grid shop-grid' });
      for (const p of prods) grid.appendChild(this.productCard(p));
      wrap.appendChild(grid);
    }
    wrap.appendChild(
      h(
        'div',
        { class: 'row wrap center-row', style: 'margin-top:.8em' },
        btn({
          label: 'Restore purchases',
          cls: 'ghost small',
          onClick: async () => {
            await this.game.sys.liveops.restorePurchases();
            this.rerender();
          },
        }),
        h('span', { class: 'mute small', text: 'Nothing in the shop is ever required to play or reach Titanium.' }),
      ),
    );
    fill(this.body, wrap);
  }

  private productCard(p: ProductDef): HTMLElement {
    const lo = this.game.sys.liveops;
    const owned = this.owned(p);
    const price = lo.price(p.id) || p.fallbackPrice;
    const card = h('div', { class: 'card pcard' + (p.tag ? ' tagged' : ''), data: { product: p.id } });
    if (p.tag) card.appendChild(h('div', { class: 'ribbon', text: TAG_TEXT[p.tag] ?? p.tag.toUpperCase() }));
    const art = shopArt(p.id);
    const drawn = art ? null : bundleArt(this.ctx, p);
    card.append(
      art ? h('div', { class: 'pi art' }, artOrEmoji(art, SECTION_ICON[p.section] ?? '🎁', 'pi-img', p.name, true)) : drawn ?? h('div', { class: 'pi', text: SECTION_ICON[p.section] ?? '🎁' }),
      h('div', { class: 'h3', text: p.name }),
      h('div', { class: 'mute small', text: p.description }),
      rewardChips(this.data, p.grants, 'center'),
      btn({
        label: owned ? '✔ Owned' : price,
        cls: owned ? 'ghost block' : p.section === 'vip' ? 'nova block' : 'good block',
        disabled: owned ? 'You already have this!' : this.busy === p.id ? 'Working on it…' : false,
        onClick: () => this.buy(p),
      }),
    );
    return card;
  }

  private async buy(p: ProductDef): Promise<void> {
    if (this.busy) return;
    this.busy = p.id;
    this.rerender();
    let ok = false;
    try {
      ok = await this.game.sys.liveops.buy(p.id);
    } finally {
      this.busy = '';
    }
    if (ok) {
      this.ctx.haptic('success');
      this.ctx.showReward(`Thank you! ${p.name}`, p.grants, '🎉');
    }
    this.rerender();
  }

  private freeCrate(): HTMLElement {
    const lo = this.game.sys.liveops;
    const ready = lo.freeCrateReady();
    const card = h('div', { class: 'card crate-card' });
    card.append(
      h('div', { class: 'row' }, artOrEmoji(rewardArt('supply_crate'), '📦', 'bi crate-img', 'Supply crate'), h('div', { class: 'grow' }, h('div', { class: 'h3', text: 'Free supply crate' }), h('div', { class: 'mute small' }, ready ? 'A crate is waiting for you!' : 'Next free crate in ', ready ? null : h('b', { 'data-crate-time': '1', text: this.crateText() })))),
      h(
        'div',
        { class: 'row wrap', style: 'margin-top:.5em' },
        btn({
          label: '🎁 Open free crate',
          cls: 'good grow',
          disabled: ready ? false : 'Not ready yet — or watch a video!',
          onClick: () => {
            // the reward card opens from the crate's reward:granted event (same for ad crates)
            if (!lo.openFreeCrate(false)) this.ctx.toast("The crate isn't ready yet", 'info', '📦');
            this.rerender();
          },
        }),
        adButton(this.ctx, 'free_crate', 'Extra crate', () => this.rerender(), { cls: 'grow' }),
      ),
    );
    return card;
  }

  private vip(): HTMLElement {
    const g = this.game;
    const v = this.data.vip;
    const lo = g.sys.liveops;
    const active = lo.isVip();
    const days = Math.ceil((g.state.liveops.vip.until - g.now()) / 86400000);
    const prod = this.data.product(v.productId);
    const wrap = h('div', { class: 'stack-v' });
    wrap.appendChild(
      h(
        'div',
        { class: 'card vip-card' },
        shopArt(v.productId) ? h('div', { class: 'vip-crown art' }, artOrEmoji(shopArt(v.productId), '👑', 'vip-img', 'Colony Pass')) : h('div', { class: 'vip-crown', text: '👑' }),
        h('div', { class: 'h3 center', text: active ? `Colony Pass active · ${days} day${days === 1 ? '' : 's'} left` : 'Colony Pass' }),
        h('div', { class: 'stack-v tight' }, ...v.description.map((d) => h('div', { class: 'perk', text: '✔ ' + d }))),
        prod
          ? btn({
              label: `${active ? 'Extend' : 'Join'} · ${lo.price(prod.id) || prod.fallbackPrice}`,
              cls: 'nova block big',
              disabled: this.busy === prod.id ? 'Working on it…' : false,
              onClick: () => this.buy(prod),
            })
          : null,
        h('div', { class: 'mute small center', text: 'Cancel anytime in your store settings. Never required.' }),
      ),
    );
    return wrap;
  }

  private season(): HTMLElement {
    const g = this.game;
    const lo = g.sys.liveops;
    const s = this.data.season;
    const prod = this.data.products.find((p) => p.section === 'season');
    return h(
      'div',
      { class: 'stack-v' },
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'h3', text: s.name }),
        h('div', { class: 'mute small', text: `Level ${lo.seasonLevel()} of ${s.levels.length} · ${g.state.liveops.season.premium ? 'Premium track unlocked' : 'Free track'}` }),
        h('div', { class: 'row wrap', style: 'margin-top:.6em' }, btn({ label: '🏆 Open season pass', cls: 'info grow', onClick: () => this.ctx.open('season') })),
      ),
      prod && !g.state.liveops.season.premium
        ? h('div', { class: 'grid shop-grid' }, this.productCard(prod))
        : null,
    );
  }

  /** Cosmetics: a way into the Wardrobe, then everything Nova can buy (the Wardrobe has the rest). */
  private cosmetics(): HTMLElement {
    const lo = this.game.state.liveops;
    if (!this.data.cosmetics.length) return emptyState('👕', 'Cosmetics coming soon') as HTMLElement;
    const forSale = sortCosmetics(this.data.cosmetics.filter((c) => c.nova > 0 && !lo.cosmetics.owned.includes(c.id)), lo.cosmetics);
    const grid = h('div', { class: 'wd-grid' });
    for (const c of forSale) grid.appendChild(cosmeticCard(this.ctx, c, this.cosHandlers));
    return h('div', { class: 'stack-v' }, wardrobeCta(this.ctx), forSale.length ? grid : emptyState('🧥', 'You own every cosmetic Nova can buy', 'Chests and the season pass have the rest.'));
  }
}
