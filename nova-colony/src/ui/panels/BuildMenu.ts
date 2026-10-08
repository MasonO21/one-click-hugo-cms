/**
 * BuildMenu — bottom drawer with category tabs and big building cards. Tapping a card enters build
 * mode (the world stays visible). Includes the material picker for structure pieces and the
 * Blueprints tab (saved layouts, rectangle-capture).
 */
import { Panel, type PanelTitle } from './Panel';
import type { BuildingDef } from '../../data/schema';
import { bagCovers } from '../../core/bag';
import { BUILD_CATEGORIES } from '../logic/categories';
import { buildCardOrder } from '../logic/buildOrder';
import { buildingEffects, lockInfo } from '../logic/describe';
import { blueprintThumb, btn, costChips, emptyState, tabs, tagChips } from '../widgets';
import { fill, h, setVar } from '../dom';
import { buildingIcon, hudArt } from '../art';

export class BuildMenuPanel extends Panel {
  readonly name = 'build';
  override readonly kind = 'drawer' as const;
  override readonly hasHeader = false;
  private static lastTab = '';
  private tab = '';
  private confirmDelete = '';

  title(): PanelTitle {
    return { icon: '🔨', art: hudArt('build'), text: 'Build' };
  }

  /** `arg` may be a tab id, a building id (opens its category) or `{ tab }`. */
  private tabFromArg(arg: unknown): string | undefined {
    const v = this.pick<string>(arg, 'tab') ?? this.pick<string>(arg, 'def');
    if (!v) return undefined;
    return this.data.building(v)?.category ?? v;
  }

  override onOpen(arg: unknown): void {
    const cats = this.categories();
    this.tab = this.tabFromArg(arg) ?? this.guideTab() ?? (BuildMenuPanel.lastTab && (cats.includes(BuildMenuPanel.lastTab) || BuildMenuPanel.lastTab === 'blueprints') ? BuildMenuPanel.lastTab : cats[0] ?? 'structure');
  }

  /** When the tutorial points at a build card, open its category so the highlight is visible. */
  private guideTab(): string | undefined {
    const id = this.guidedBuild();
    return id ? this.data.building(id)?.category : undefined;
  }

  /**
   * The building the guide hand / main mission is steering the player to build (its card opens the drawer's tab and
   * is pinned to the front of it), or undefined.
   */
  private guidedBuild(): string | undefined {
    const m = /data-build="([^"]+)"/.exec(this.game.sys.tutorial.guide()?.ui ?? '');
    if (m) return this.data.building(m[1]) ? m[1] : undefined;
    // the guide still points at #btn-build while the drawer is opening (or at the research a locked goal needs):
    // use the mission's target directly
    const cur = this.game.sys.missions.current();
    if (cur?.guide?.kind !== 'build_menu' || !cur.guide.ref || this.game.sys.missions.progress(cur.id).done) return undefined;
    return this.data.building(cur.guide.ref) ? cur.guide.ref : undefined;
  }

  override onArg(arg: unknown): void {
    const t = this.tabFromArg(arg);
    if (t) {
      this.tab = t;
      this.rev++;
    }
  }

  private categories(): string[] {
    const present = new Set(this.data.buildings.filter((b) => !b.core).map((b) => b.category));
    return BUILD_CATEGORIES.filter((c) => present.has(c.id as never)).map((c) => c.id);
  }

  /** The tab's cards: the guided one, then buildable (newest tier first), then locked; tier 0 keeps the old order. See buildCardOrder. */
  private defsOf(cat: string, pinned = this.guidedBuild()): BuildingDef[] {
    const bs = this.game.sys.buildings;
    const list = this.data.buildings.filter((b) => b.category === cat && !b.core);
    return buildCardOrder(list, this.game.state.colony.tier, (d) => bs.isUnlocked(d.id), pinned);
  }

  override signature(): string {
    const { game } = this;
    const bs = game.sys.buildings;
    let mask = '';
    const pinned = this.guidedBuild();
    if (this.tab !== 'blueprints') {
      for (const d of this.defsOf(this.tab, pinned)) {
        mask += bagCovers(game.state.resources.amounts, this.costOf(d)) ? '1' : '0';
        if (d.maxCount) mask += bs.countOf(d.id) >= d.maxCount ? 'm' : '-';
      }
    } else mask = String(game.state.buildings.blueprints.length);
    return `${this.tab}|${game.state.colony.tier}|${game.state.research.completed.length}|${mask}|${this.ctx.build.pieceTier}|${pinned ?? ''}`;
  }

  private costOf(d: BuildingDef) {
    return this.game.sys.buildings.cost(d.id, d.piece ? this.ctx.build.pieceTier : undefined);
  }

  render(): void {
    const cats = this.categories();
    const items = BUILD_CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => ({ id: c.id, icon: c.icon, art: c.art, label: c.label }));
    items.push({ id: 'blueprints', icon: '📐', art: null, label: 'Blueprints' });
    BuildMenuPanel.lastTab = this.tab;
    const tabBar = tabs(items, this.tab, (id) => {
      this.tab = id;
      this.confirmDelete = '';
      this.rerender();
    });
    const content = this.tab === 'blueprints' ? this.renderBlueprints() : this.renderCards(this.tab);
    const close = h('button', { class: 'icon-btn pm-close', type: 'button', 'aria-label': 'Close', text: '✕', data: { sfx: 'none' } });
    close.addEventListener('click', () => this.ctx.close(this.name));
    fill(this.body, h('div', { class: 'drawer-top' }, tabBar, close), content);
    this.body.classList.add('build-body');
  }

  private renderCards(cat: string): HTMLElement {
    const defs = this.defsOf(cat);
    const wrap = h('div', { class: 'stack-v' });
    if (defs.some((d) => d.piece)) wrap.appendChild(this.tierRow());
    if (!defs.length) return emptyState('🧱', 'Nothing here yet', 'Research and tier-ups unlock more.');
    const grid = h('div', { class: 'grid build-grid' });
    for (const d of defs) grid.appendChild(this.buildCard(d));
    wrap.appendChild(grid);
    return wrap;
  }

  private tierRow(): HTMLElement {
    const { game, data } = this;
    const max = game.state.colony.tier;
    const row = h('div', { class: 'tier-row' }, h('span', { class: 'mute', text: 'Material' }));
    for (const t of data.tiers) {
      const locked = t.index > max;
      const b = h(
        'button',
        { class: 'tier-chip' + (t.index === this.ctx.build.pieceTier ? ' on' : '') + (locked ? ' locked' : ''), type: 'button', data: { tier: t.index, sfx: 'ui_tab' } },
        h('i'),
        t.name,
        locked ? '🔒' : '',
      );
      setVar(b, '--tc', t.color);
      setVar(b, '--ta', t.accent);
      b.addEventListener('click', () => {
        if (locked) {
          this.ctx.toast(`Reach ${t.name} tier to build with it`, 'info', '🔒');
          return;
        }
        this.ctx.build.pieceTier = t.index;
        this.rerender();
      });
      row.appendChild(b);
    }
    return row;
  }

  private buildCard(d: BuildingDef): HTMLElement {
    const { game, data } = this;
    const bs = game.sys.buildings;
    const lock = lockInfo(d, data, game.state.colony.tier, game.state.research.completed);
    const maxed = !!d.maxCount && bs.countOf(d.id) >= d.maxCount;
    const cost = this.costOf(d);
    const tags = buildingEffects(d, data).slice(0, 2);
    const reason = lock.locked ? lock.text! : maxed ? 'Already built' : '';
    const el = h(
      'button',
      { class: 'bcard' + (lock.locked ? ' locked' : '') + (maxed ? ' maxed' : ''), type: 'button', title: d.description, data: { build: d.id, sfx: 'ui_click' } },
      this.hero(d, lock.locked, maxed),
      h('span', { class: 'bn', text: d.name }),
      tags.length ? tagChips(tags, 2) : h('div', { class: 'bdesc', text: d.description }),
      lock.locked ? h('div', { class: 'lock' }, '🔒 ', lock.text) : maxed ? h('div', { class: 'lock ok' }, '✔ Already built') : costChips(data, cost, game.state.resources.amounts),
    );
    el.addEventListener('click', (e) => {
      if (reason) {
        e.stopPropagation();
        // behind research the player can start now: take them to it instead of only saying so
        const step = lock.kind === 'research' && d.research ? game.sys.research.nextStep(d.research) : null;
        if (step) {
          this.ctx.open('research', { id: step });
          return;
        }
        this.ctx.toast(reason, 'info', lock.locked ? '🔒' : '✔');
        this.ctx.sfx('ui_error');
        return;
      }
      this.ctx.build.start(d.id);
      this.ctx.close('build');
    });
    return el;
  }

  /** The card's picture: the building's rendered thumbnail (emoji when there is none), with a lock / check badge. */
  private hero(d: BuildingDef, locked: boolean, maxed: boolean): HTMLElement {
    return h('div', { class: 'bhero' }, buildingIcon(d.id, d.icon, 'bpic', 'div'), locked ? h('span', { class: 'bbadge', text: '🔒' }) : maxed ? h('span', { class: 'bbadge ok', text: '✔' }) : null);
  }

  private renderBlueprints(): HTMLElement {
    const { game, data } = this;
    const bps = game.state.buildings.blueprints;
    const wrap = h('div', { class: 'stack-v' });
    wrap.appendChild(
      btn({
        label: '＋ Save a new blueprint',
        sub: 'Drag a box over pieces you already built',
        cls: 'info block',
        onClick: () => {
          this.ctx.close('build');
          this.ctx.build.startSelect();
        },
      }),
    );
    if (!bps.length) {
      wrap.appendChild(emptyState('📐', 'No blueprints yet', 'Build a cozy room, then save it to stamp it anywhere!'));
      return wrap;
    }
    for (const bp of bps) {
      const cost = game.sys.buildings.blueprintCost(bp.id);
      const del = this.confirmDelete === bp.id;
      wrap.appendChild(
        h(
          'div',
          { class: 'card bp-row', data: { blueprint: bp.id } },
          h('div', { class: 'row' }, blueprintThumb(data, bp.parts), h('div', { class: 'grow' }, h('div', { class: 'h3', text: bp.name }), h('div', { class: 'mute', text: `${bp.parts.length} pieces` })), costChips(data, cost, game.state.resources.amounts)),
          h(
            'div',
            { class: 'row', style: 'margin-top:.5em' },
            btn({
              label: 'Place',
              cls: 'good small grow',
              onClick: () => {
                this.ctx.close('build');
                this.ctx.build.startBlueprint(bp.id);
              },
            }),
            btn({
              label: del ? 'Really delete?' : '🗑',
              cls: (del ? 'bad' : 'ghost') + ' small',
              onClick: () => {
                if (!del) {
                  this.confirmDelete = bp.id;
                  this.rerender();
                  return;
                }
                game.sys.buildings.deleteBlueprint(bp.id);
                this.confirmDelete = '';
                this.rerender();
              },
            }),
          ),
        ),
      );
    }
    return wrap;
  }
}
