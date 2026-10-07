/**
 * ResearchPanel — the tech tree. Category tabs, nodes laid out by `pos` with connectors, status
 * colours (done / available / locked), the RP bank with a "+RP" ad button, and a detail card with
 * prerequisites, unlocks, effects and the Research button.
 */
import { Panel, type PanelTitle } from './Panel';
import type { ResearchDef } from '../../data/schema';
import type { ResearchStatus } from '../../sim/research';
import { fmt } from '../../core/format';
import { bagCovers } from '../../core/bag';
import { NODE_H, NODE_W, RESEARCH_CATEGORIES, layoutTree } from '../logic/categories';
import { modifierText } from '../logic/describe';
import { adButton, btn, costChips, emptyState, section, tabs } from '../widgets';
import { fill, h, s } from '../dom';

export class ResearchPanel extends Panel {
  readonly name = 'research';
  private cat = '';
  private sel: string | null = null;
  private static lastCat = '';

  title(): PanelTitle {
    return { icon: '🔬', text: 'Research' };
  }

  private categories(): string[] {
    const present = new Set(this.data.research.map((r) => r.category));
    return RESEARCH_CATEGORIES.filter((c) => present.has(c.id as never)).map((c) => c.id);
  }

  override onOpen(arg: unknown): void {
    const id = this.pick<string>(arg, 'id');
    const cats = this.categories();
    this.cat = cats.includes(ResearchPanel.lastCat) ? ResearchPanel.lastCat : cats[0] ?? '';
    if (id) this.focusNode(id);
    else this.sel = this.defaultSel();
  }

  override onArg(arg: unknown): void {
    const id = this.pick<string>(arg, 'id');
    if (id) {
      this.focusNode(id);
      this.rev++;
    }
  }

  private focusNode(id: string): void {
    const d = this.data.researchDef(id);
    if (!d) return;
    this.cat = d.category;
    this.sel = id;
  }

  private defaultSel(): string | null {
    const rs = this.game.sys.research;
    const inCat = this.data.research.filter((r) => r.category === this.cat);
    return (inCat.find((r) => rs.status(r.id) === 'available') ?? inCat[0])?.id ?? null;
  }

  private status(id: string): ResearchStatus {
    return this.game.sys.research.status(id);
  }

  override signature(): string {
    const g = this.game;
    const rs = g.sys.research;
    const inCat = this.data.research.filter((r) => r.category === this.cat);
    const mask = inCat.map((r) => rs.status(r.id)[0] + (rs.canResearch(r.id) ? '!' : '')).join('');
    return `${this.cat}|${this.sel}|${Math.floor(g.state.research.points)}|${g.state.research.completed.length}|${g.state.colony.tier}|${mask}`;
  }

  override extras() {
    const g = this.game;
    return h(
      'div',
      { class: 'row' },
      h('div', { class: 'rp-bank' }, h('span', { class: 'ico', text: '🔬' }), h('b', { class: 'num', text: fmt(Math.floor(g.state.research.points)) }), h('small', { text: `+${fmt(g.derived.research.perMin)}/min` })),
      adButton(this.ctx, 'research_bonus', '+RP', () => this.rerender(), { cls: 'small' }),
    );
  }

  render(): void {
    ResearchPanel.lastCat = this.cat;
    const rs = this.game.sys.research;
    const cats = this.categories();
    if (!cats.length) {
      fill(this.body, emptyState('🔬', 'No research yet', 'Build a Research Desk and put a scientist to work!'));
      return;
    }
    const items = RESEARCH_CATEGORIES.filter((c) => cats.includes(c.id)).map((c) => ({
      id: c.id,
      icon: c.icon,
      label: c.label,
      badge: this.data.research.filter((r) => r.category === c.id && rs.canResearch(r.id)).length || undefined,
    }));
    const tabBar = tabs(items, this.cat, (id) => {
      this.cat = id;
      this.sel = this.defaultSel();
      this.rerender();
    });

    const layout = layoutTree(this.data.research, this.cat);
    const tree = h('div', { class: 'tree', style: { width: `${layout.width}px`, height: `${layout.height}px` } });
    const svg = s('svg', { class: 'edges', width: layout.width, height: layout.height, viewBox: `0 0 ${layout.width} ${layout.height}` });
    for (const e of layout.edges) {
      const done = rs.isDone(e.from);
      const mx = (e.x1 + e.x2) / 2;
      svg.appendChild(s('path', { d: `M${e.x1} ${e.y1} C${mx} ${e.y1} ${mx} ${e.y2} ${e.x2} ${e.y2}`, class: 'edge' + (done ? ' done' : ''), fill: 'none' }));
    }
    tree.appendChild(svg as unknown as Node);
    for (const n of layout.nodes) tree.appendChild(this.node(n.def, n.x, n.y));
    const scroll = h('div', { class: 'tree-scroll', data: { scroll: 'tree' } }, tree);

    const detail = this.detail();
    fill(this.body, tabBar, h('div', { class: 'research-layout' }, scroll, detail));
  }

  private node(d: ResearchDef, x: number, y: number): HTMLElement {
    const rs = this.game.sys.research;
    const st = this.status(d.id);
    const can = rs.canResearch(d.id);
    const cls = ['rnode', st, can ? 'afford' : '', this.sel === d.id ? 'sel' : ''].join(' ');
    const badge = st === 'done' ? '✔' : st === 'locked_tier' ? `🔒 T${d.tier + 1}` : st === 'locked_prereq' ? '🔗' : `🔬 ${fmt(d.cost)}`;
    const el = h('button', { class: cls, type: 'button', style: { left: `${x}px`, top: `${y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }, data: { research: d.id, sfx: 'ui_click' } }, h('span', { class: 'ri', text: d.icon }), h('span', { class: 'rn', text: d.name }), h('span', { class: 'rc', text: badge }));
    el.addEventListener('click', () => {
      this.sel = d.id;
      this.rerender();
    });
    return el;
  }

  private detail(): HTMLElement {
    const g = this.game;
    const rs = g.sys.research;
    const box = h('div', { class: 'card r-detail' });
    const d = this.sel ? this.data.researchDef(this.sel) : undefined;
    if (!d) {
      box.appendChild(h('div', { class: 'mute', text: 'Pick a technology to see what it unlocks.' }));
      return box;
    }
    const st = this.status(d.id);
    const can = rs.canResearch(d.id);
    box.appendChild(h('div', { class: 'row' }, h('span', { class: 'bi', text: d.icon }), h('div', { class: 'grow' }, h('div', { class: 'h3', text: d.name }), h('span', { class: 'chip ' + (st === 'done' ? 'good' : st === 'available' ? 'warn' : ''), text: st === 'done' ? 'Researched' : st === 'available' ? 'Ready to research' : st === 'locked_tier' ? 'Needs a higher tier' : 'Needs earlier tech' }))));
    box.appendChild(h('div', { class: 'small', style: 'margin:.4em 0', text: d.description }));

    if (st !== 'done') {
      const have = g.state.research.points;
      const costRow = h('div', { class: 'chips' }, h('span', { class: 'chip ' + (have >= d.cost ? 'good' : 'bad') }, h('i', { text: '🔬' }), `${fmt(d.cost)} RP`));
      if (d.resources) costRow.appendChild(costChips(this.data, d.resources, g.state.resources.amounts));
      box.appendChild(costRow);
    }
    // prerequisites
    if (d.requires.length || d.tier > g.state.colony.tier) {
      const req = h('div', { class: 'stack-v tight', style: 'margin-top:.5em' });
      if (d.tier > g.state.colony.tier) req.appendChild(h('div', { class: 'req-line no', text: `✖ Requires ${this.data.tier(d.tier).name} tier` }));
      for (const r of d.requires) {
        const rd = this.data.researchDef(r);
        const ok = rs.isDone(r);
        const line = h('button', { class: 'req-line ' + (ok ? 'ok' : 'no'), type: 'button', text: `${ok ? '✔' : '✖'} ${rd?.name ?? r}` });
        line.addEventListener('click', () => {
          this.focusNode(r);
          this.rerender();
        });
        req.appendChild(line);
      }
      box.appendChild(req);
    }
    // unlocks
    const unlocks: string[] = [];
    for (const id of d.unlocks?.buildings ?? []) unlocks.push(`${this.data.building(id)?.icon ?? '🏠'} ${this.data.building(id)?.name ?? id}`);
    for (const id of d.unlocks?.recipes ?? []) unlocks.push(`🛠️ ${this.data.recipe(id)?.name ?? id}`);
    for (const id of d.unlocks?.vehicles ?? []) unlocks.push(`${this.data.vehicle(id)?.icon ?? '🚙'} ${this.data.vehicle(id)?.name ?? id}`);
    for (const id of d.unlocks?.regions ?? []) unlocks.push(`🗺️ ${this.data.biome(id)?.name ?? id}`);
    for (const m of d.effects ?? []) unlocks.push(`📈 ${modifierText(m, this.data)}`);
    if (unlocks.length) {
      box.appendChild(section('Unlocks'));
      const chips = h('div', { class: 'chips' });
      for (const u of unlocks.slice(0, 10)) chips.appendChild(h('span', { class: 'chip info', text: u }));
      box.appendChild(chips);
    }
    // action
    if (st === 'done') box.appendChild(h('div', { class: 'chip good', style: 'margin-top:.7em', text: '✔ Researched' }));
    else {
      const need = Math.max(0, Math.ceil(d.cost - g.state.research.points));
      const reason = can ? false : st === 'locked_tier' ? 'Reach a higher colony tier first' : st === 'locked_prereq' ? 'Research the earlier tech first' : need > 0 ? `Need ${need} more research points` : d.resources && !bagCovers(g.state.resources.amounts, d.resources) ? 'Gather the extra resources first' : 'Not available yet';
      box.appendChild(
        h(
          'div',
          { style: 'margin-top:.7em' },
          btn({
            label: '🔬 Research',
            cls: 'big good block',
            disabled: reason,
            data: { action: 'research' },
            onClick: () => {
              if (rs.research(d.id)) {
                this.ctx.haptic('success');
                this.ctx.toast(`Researched ${d.name}!`, 'success', d.icon);
              } else this.ctx.toast("Couldn't research that yet", 'info', '🔬');
              this.rerender();
            },
          }),
        ),
      );
    }
    return box;
  }
}
