/**
 * WardrobePanel (Menu › Wardrobe): every cosmetic the player owns or could own, by tab — Outfits · Hats · Pets ·
 * Colony (themes, colonist outfits, decorations) · Rides & Turrets · Frames.
 *
 * Cards show the painted icon in a rarity ring, owned / equipped state and one action (Equip, Unequip, Buy for Nova);
 * a locked one without a Nova price says where it comes from (season level, chest tier, pack). Tapping a card opens a
 * detail sheet over the panel: big icon, description, what it changes, every way to get it and a shortcut there.
 * Nova purchases of 300+ ask first. Android back closes the confirmation, then the sheet, then the panel.
 *
 * Pure parts (tabs, sources, sorting, filtering): logic/wardrobe.ts. Cards and the confirmation: wardrobe/cards.ts.
 */
import { Panel, type PanelTitle } from './Panel';
import type { CosmeticDef } from '../../data/schema';
import { fill, h, replay } from '../dom';
import { bigNum, btn, emptyState, tabs } from '../widgets';
import { hudArt, resIcon } from '../art';
import {
  KIND_LABEL,
  RARITY_STYLE,
  WARDROBE_TABS,
  cosmeticEffect,
  cosmeticSources,
  cosmeticState,
  filterCosmetics,
  sortCosmetics,
  tabOfKind,
  tabProgress,
  type CosmeticSource,
  type WardrobeFilter,
  type WardrobeTabId,
} from '../logic/wardrobe';
import { closeConfirm, confirmOpen, cosmeticAction, cosmeticCard, cosmeticIcon, novaLabel, type CardHandlers } from './wardrobe/cards';

export class WardrobePanel extends Panel {
  readonly name = 'wardrobe';
  private tab: WardrobeTabId = 'outfits';
  private filter: WardrobeFilter = 'all';
  /** Cosmetic shown in the detail sheet. */
  private detail: string | null = null;
  /** The sheet already slid in for this id (re-renders must not replay it). */
  private sheetShown: string | null = null;
  private sheetEl: HTMLElement | null = null;
  private readonly handlers: CardHandlers = {
    open: (def) => this.openDetail(def.id),
    changed: () => this.rerender(),
    host: () => this.card,
  };

  title(): PanelTitle {
    return { icon: '🧥', art: hudArt('wardrobe'), text: 'Wardrobe' };
  }

  /** `arg`: a tab id, `{ tab }`, or `{ id }` (a cosmetic: opens its tab and its sheet). */
  override onOpen(arg: unknown): void {
    this.applyArg(arg);
  }

  override onArg(arg: unknown): void {
    this.applyArg(arg);
    this.rev++;
  }

  private applyArg(arg: unknown): void {
    const id = this.pick<string>(arg, 'id');
    const def = id ? this.data.cosmetic(id) : undefined;
    if (def) {
      this.tab = tabOfKind(def.kind);
      this.detail = def.id;
      return;
    }
    const t = this.pick<string>(arg, 'tab');
    if (t && WARDROBE_TABS.some((x) => x.id === t)) this.tab = t as WardrobeTabId;
  }

  override onClose(): void {
    this.detail = null;
    this.sheetShown = null;
    this.sheetEl?.remove();
    this.sheetEl = null;
    closeConfirm(this.card);
  }

  override nestedView(): boolean {
    return this.detail != null || confirmOpen(this.card);
  }

  override leaveNested(): void {
    if (confirmOpen(this.card)) closeConfirm(this.card);
    else this.closeDetail();
  }

  override extras() {
    return h('div', { class: 'nova-bank' }, resIcon('nova', '💎', '', 'span'), h('b', { class: 'num', text: bigNum(this.st.liveops.nova) }));
  }

  override signature(): string {
    const lo = this.st.liveops;
    return `${this.tab}|${this.filter}|${this.detail}|${lo.nova}|${lo.cosmetics.owned.join(',')}|${Object.values(lo.cosmetics.equipped).join(',')}|${lo.season.premium}`;
  }

  private openDetail(id: string): void {
    this.detail = id;
    this.rerender();
  }

  private closeDetail(): void {
    if (!this.detail) return;
    this.detail = null;
    const el = this.sheetEl;
    this.sheetEl = null;
    this.sheetShown = null;
    if (el) {
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 200);
    }
    this.rerender();
  }

  render(): void {
    const all = this.data.cosmetics;
    const own = this.st.liveops.cosmetics;
    const wrap = h('div', { class: 'stack-v wd' });
    wrap.appendChild(
      tabs(
        WARDROBE_TABS.map((t) => ({ id: t.id, icon: t.icon, label: t.label })),
        this.tab,
        (id) => {
          this.tab = id as WardrobeTabId;
          this.rerender();
        },
      ),
    );

    const prog = tabProgress(all, this.tab, own);
    const seg = h('div', { class: 'wd-seg', role: 'radiogroup', 'aria-label': 'Show' });
    for (const [id, label] of [
      ['all', 'All'],
      ['owned', 'Owned'],
    ] as [WardrobeFilter, string][]) {
      const b = h('button', { class: 'wd-seg-b' + (this.filter === id ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': this.filter === id ? 'true' : 'false', data: { filter: id, sfx: 'ui_tab' }, text: label });
      b.addEventListener('click', () => {
        this.filter = id;
        this.rerender();
      });
      seg.appendChild(b);
    }
    wrap.appendChild(h('div', { class: 'wd-sum' }, h('div', { class: 'wd-count' }, h('b', { text: `${prog.owned}` }), ` of ${prog.total} collected`), seg));

    const list = sortCosmetics(filterCosmetics(all, this.tab, own, this.filter), own, this.tab);
    if (!list.length) {
      wrap.appendChild(emptyState('🧳', 'Nothing here yet', 'Switch to All to see what you can collect from Nova, caches and the season pass.'));
    } else {
      const grid = h('div', { class: 'wd-grid' });
      for (const c of list) grid.appendChild(cosmeticCard(this.ctx, c, this.handlers));
      wrap.appendChild(grid);
    }
    wrap.appendChild(h('div', { class: 'mute small center wd-foot', text: 'Cosmetics change how things look, never how the game plays.' }));
    fill(this.body, wrap);
    this.renderSheet();
  }

  // ---------------------------------------------------------------- detail sheet

  private renderSheet(): void {
    const def = this.detail ? this.data.cosmetic(this.detail) : undefined;
    this.sheetEl?.remove();
    this.sheetEl = null;
    if (!def) {
      this.detail = null;
      return;
    }
    const el = this.sheet(def);
    this.card.appendChild(el);
    this.sheetEl = el;
    if (this.sheetShown !== def.id) {
      this.sheetShown = def.id;
      replay(el, 'in');
    }
  }

  private sheet(def: CosmeticDef): HTMLElement {
    const st = RARITY_STYLE[def.rarity];
    const state = cosmeticState(def, this.st.liveops.cosmetics);
    const close = h('button', { class: 'icon-btn wd-sheet-x', type: 'button', 'aria-label': 'Close', text: '✕', data: { sfx: 'ui_close' } });
    close.addEventListener('click', () => this.closeDetail());
    const bd = h('div', { class: 'wd-sheet-bd' });
    bd.addEventListener('click', () => this.closeDetail());

    const body = h('div', { class: 'wd-sheet-body', data: { scroll: 'sheet' } });
    const hero = h('div', { class: `wd-hero r-${def.rarity}` }, cosmeticIcon(def, 'huge'));
    hero.style.setProperty('--tint', def.color);
    hero.style.setProperty('--tint2', def.accent ?? def.color);
    body.append(
      hero,
      h('div', { class: 'wd-pills' }, h('span', { class: `wd-rpill r-${def.rarity}`, text: st.label }), h('span', { class: 'wd-kpill', text: KIND_LABEL[def.kind] }), state === 'equipped' ? h('span', { class: 'wd-kpill on', text: '✓ Wearing' }) : state === 'owned' ? h('span', { class: 'wd-kpill own', text: 'Owned' }) : null),
      h('div', { class: 'wd-title', text: def.name }),
      h('div', { class: 'wd-desc', text: def.description }),
      h('div', { class: 'sec', text: 'What it changes' }),
      h('ul', { class: 'wd-effects' }, ...cosmeticEffect(def).map((t) => h('li', { text: t }))),
    );
    if (def.kind === 'base_theme' || def.kind === 'vehicle_skin' || def.kind === 'turret_skin' || def.kind === 'colonist_outfit' || def.kind === 'outfit') {
      const sw = (c: string) => {
        const s = h('span', { class: 'wd-sw' });
        s.style.background = c;
        return s;
      };
      body.appendChild(h('div', { class: 'wd-colors' }, h('span', { class: 'mute small', text: 'Colours' }), sw(def.color), def.accent ? sw(def.accent) : null));
    }

    const sources = cosmeticSources(this.data, def);
    if (state === 'locked' && sources.length) {
      body.appendChild(h('div', { class: 'sec', text: 'How to get it' }));
      const ul = h('div', { class: 'wd-sources' });
      for (const s of sources) ul.appendChild(this.sourceRow(s));
      body.appendChild(ul);
    }

    const actions = h('div', { class: 'wd-sheet-actions' });
    const main = cosmeticAction(this.ctx, def, this.handlers, true);
    if (main) actions.appendChild(main);
    if (state !== 'locked' && def.kind === 'photo_frame' && this.ctx.renderer.photo) {
      actions.appendChild(btn({ label: '📷 Take a photo', cls: 'good block', onClick: () => this.ctx.open('photo') }));
    }
    if (state !== 'locked' && def.kind === 'decoration') {
      actions.appendChild(btn({ label: '🔨 Open Build › Decor', cls: 'good block', onClick: () => this.ctx.open('build', { tab: 'decor' }) }));
    }
    if (actions.childElementCount) body.appendChild(actions);

    return h('div', { class: 'wd-sheet-wrap', data: { sheet: def.id } }, bd, h('div', { class: `wd-sheet r-${def.rarity}`, role: 'dialog', 'aria-label': def.name }, close, body));
  }

  private sourceRow(s: CosmeticSource): HTMLElement {
    const row = h('div', { class: `wd-srow k-${s.kind}` });
    let go: (() => void) | null = null;
    let goLabel = '';
    switch (s.kind) {
      case 'nova':
        row.append(h('span', { class: 'wd-srow-ic', text: '💎' }), h('span', { class: 'grow' }, 'Buy it for ', novaLabel(s.nova ?? 0)));
        break;
      case 'season':
        row.append(h('span', { class: 'wd-srow-ic', text: '🏆' }), h('span', { class: 'grow', text: s.premium ? `${s.label} (premium track)` : s.label }));
        go = () => this.ctx.open('season');
        goLabel = 'Season';
        break;
      case 'chest':
        row.append(h('span', { class: 'wd-srow-ic', text: '🧰' }), h('span', { class: 'grow', text: s.label }));
        go = () => this.ctx.open('shop', { tab: 'chests' });
        goLabel = 'Caches';
        break;
      case 'pack':
        row.append(h('span', { class: 'wd-srow-ic', text: '🛍️' }), h('span', { class: 'grow', text: s.label }));
        go = () => this.ctx.open('shop', { tab: 'packs' });
        goLabel = 'Shop';
        break;
      case 'mission':
        row.append(h('span', { class: 'wd-srow-ic', text: '🎯' }), h('span', { class: 'grow', text: s.label }));
        break;
    }
    if (go) row.appendChild(btn({ label: goLabel + ' ›', cls: 'ghost small', onClick: go }));
    return row;
  }
}
