/**
 * ResearchPanel — the tech tree. Category tabs, nodes laid out by `pos` with connectors, status
 * colours (done / available / locked), the RP bank with a "+RP" ad button, and a detail card with
 * prerequisites, unlocks, effects and the Research button. From the Stone tier a Mastery tab lists the repeatable
 * research lines (sim/mastery.ts): level, total bonus, the next level's bonus and price, and a big Research button.
 * With nothing left to research in the tree, the panel opens on Mastery.
 */
import { Panel, type PanelTitle } from './Panel';
import type { ResearchDef } from '../../data/schema';
import type { ResearchStatus } from '../../sim/research';
import { fmt } from '../../core/format';
import { bagCovers } from '../../core/bag';
import { NODE_H, NODE_W, RESEARCH_CATEGORIES, layoutTree } from '../logic/categories';
import { buildingUnlock, modifierText, vehicleUnlock, type UnlockEntry } from '../logic/describe';
import { adButton, btn, costChips, emptyState, section, tabs, unlockChip } from '../widgets';
import { fill, h, s } from '../dom';
import { hudArt, researchArt, researchIcon } from '../art';
import type { MasteryInfo } from '../../sim/research';
import { nextBonus, pct } from '../../sim/mastery';
import '../styles/mastery.css';

/** The Mastery tab's id (not a ResearchCategory). */
const MASTERY = 'mastery';

export class ResearchPanel extends Panel {
  readonly name = 'research';
  private cat = '';
  private sel: string | null = null;
  private static lastCat = '';
  /** Mastery line icons, kept across re-renders so a level bought never makes the pictures blink. */
  private readonly mIcons = new Map<string, HTMLElement>();
  /** The line a level was just bought for (its level chip pops once). */
  private bumped = '';

  title(): PanelTitle {
    return { icon: '🔬', art: hudArt('tech'), text: 'Research' };
  }

  private categories(): string[] {
    const present = new Set(this.data.research.map((r) => r.category));
    const cats = RESEARCH_CATEGORIES.filter((c) => present.has(c.id as never)).map((c) => c.id);
    if (this.game.sys.research.masteryOpen()) cats.push(MASTERY);
    return cats;
  }

  override onOpen(arg: unknown): void {
    const id = this.pick<string>(arg, 'id');
    const cats = this.categories();
    // first visit: the first tab with something to research (an Alloy colony opened on Reinforced Wood, done long ago);
    // with nothing to research in the tree, Mastery (where the spare points go)
    const rs = this.game.sys.research;
    const open = cats.find((c) => this.data.research.some((r) => r.category === c && rs.status(r.id) === 'available'));
    const idle = !rs.available().some((r) => rs.canResearch(r.id)) && cats.includes(MASTERY);
    this.cat = idle && !id ? MASTERY : cats.includes(ResearchPanel.lastCat) ? ResearchPanel.lastCat : (open ?? cats[0] ?? '');
    // no node asked for: the research the main mission is waiting on (the guide points here for it)
    const focus = id ?? this.game.sys.tutorial.researchFocus();
    if (focus) this.focusNode(focus);
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
    if (this.cat === MASTERY) return null;
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
    if (this.cat === MASTERY) {
      const lv = rs.masteryInfo().map((m) => `${m.level}${m.ready ? '!' : ''}${m.open ? '' : 'x'}`).join(',');
      return `${this.cat}|${Math.floor(g.state.research.points)}|${g.state.colony.tier}|${lv}|${g.state.research.completed.length}`;
    }
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
      art: c.art,
      label: c.label,
      badge: this.data.research.filter((r) => r.category === c.id && rs.canResearch(r.id)).length || undefined,
    }));
    if (cats.includes(MASTERY)) items.push({ id: MASTERY, icon: '👑', art: researchArt('colony_mastery'), label: 'Mastery', badge: undefined });
    if (this.cat === MASTERY && !cats.includes(MASTERY)) this.cat = cats[0] ?? '';
    const tabBar = tabs(items, this.cat, (id) => {
      this.cat = id;
      this.sel = this.defaultSel();
      this.rerender();
    });
    if (this.cat === MASTERY) {
      fill(this.body, tabBar, this.mastery());
      return;
    }

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

  /** Mastery: one card per line (level, bonus now, next level's bonus and price, a big Research button). */
  private mastery(): HTMLElement {
    const rs = this.game.sys.research;
    const list = h('div', { class: 'mastery-list' });
    for (const m of rs.masteryInfo()) list.appendChild(this.masteryCard(m));
    this.bumped = '';
    return h(
      'div',
      { class: 'mastery' },
      h('div', { class: 'mastery-intro small', text: 'Spare research points buy lasting bonuses. Each level costs a little more than the last, and there is no cap.' }),
      list,
    );
  }

  private masteryIcon(id: string, art: string, emoji: string): HTMLElement {
    let el = this.mIcons.get(id);
    if (!el) this.mIcons.set(id, (el = researchIcon(art, emoji, 'mc-ic', 'span')));
    return el;
  }

  private masteryCard(m: MasteryInfo): HTMLElement {
    const g = this.game;
    const rs = g.sys.research;
    const { line } = m;
    const head = h(
      'div',
      { class: 'mc-head' },
      this.masteryIcon(line.id, line.art, line.icon),
      h('div', { class: 'grow' }, h('div', { class: 'mc-name' }, line.name, h('span', { class: 'mc-lv' + (this.bumped === line.id ? ' pop' : ''), text: m.level > 0 ? `Lv ${m.level}` : 'New' })), h('div', { class: 'mc-now', text: m.level > 0 ? `${pct(m.bonus)} ${line.label}` : line.blurb })),
    );
    const card = h('div', { class: 'card mc' + (m.open ? '' : ' locked') + (m.ready ? ' ready' : ''), data: { mastery: line.id } }, head);
    if (!m.open) {
      card.appendChild(h('div', { class: 'mc-lock small', text: `🔒 Opens at the ${this.data.tier(line.tier).name} tier` }));
      return card;
    }
    if (m.level > 0) card.appendChild(h('div', { class: 'mc-blurb small mute', text: line.blurb }));
    const need = Math.max(0, Math.ceil(m.cost - g.state.research.points));
    const step = nextBonus(line, m.level);
    card.appendChild(
      btn({
        label: `🔬 Research · ${pct(step)}`,
        sub: `${fmt(m.cost)} RP · Lv ${m.level + 1}`,
        cls: 'big good block mc-btn',
        disabled: m.ready ? false : `Need ${fmt(need)} more research points`,
        data: { action: 'master', line: line.id },
        onClick: () => {
          // no toast: a few quick taps in a row would stack them; the level chip pops instead
          if (rs.master(line.id)) {
            this.ctx.haptic('success');
            this.bumped = line.id;
          }
          this.rerender();
        },
      }),
    );
    return card;
  }

  private node(d: ResearchDef, x: number, y: number): HTMLElement {
    const rs = this.game.sys.research;
    const st = this.status(d.id);
    const can = rs.canResearch(d.id);
    const cls = ['rnode', st, can ? 'afford' : '', this.sel === d.id ? 'sel' : ''].join(' ');
    const badge = st === 'done' ? '✔' : st === 'locked_tier' ? `🔒 T${d.tier + 1}` : st === 'locked_prereq' ? '🔗' : `🔬 ${fmt(d.cost)}`;
    const el = h('button', { class: cls, type: 'button', style: { left: `${x}px`, top: `${y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }, data: { research: d.id, sfx: 'ui_click' } }, researchIcon(d.id, d.icon, 'ri', 'span'), h('span', { class: 'rn', text: d.name }), h('span', { class: 'rc', text: badge }));
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
    box.appendChild(h('div', { class: 'row' }, researchIcon(d.id, d.icon, 'bi r-pic', 'span'), h('div', { class: 'grow' }, h('div', { class: 'h3', text: d.name }), h('span', { class: 'chip ' + (st === 'done' ? 'good' : st === 'available' ? 'warn' : ''), text: st === 'done' ? 'Researched' : st === 'available' ? 'Ready to research' : st === 'locked_tier' ? 'Needs a higher tier' : 'Needs earlier tech' }))));
    box.appendChild(h('div', { class: 'small', style: 'margin:.4em 0', text: d.description }));

    if (st !== 'done') {
      const have = g.state.research.points;
      const costRow = h('div', { class: 'chips' }, h('span', { class: 'chip ' + (have >= d.cost ? 'good' : 'bad') }, h('i', { text: '🔬' }), `${fmt(d.cost)} RP`));
      if (d.resources) costRow.appendChild(costChips(this.data, d.resources, g.state.resources.amounts));
      box.appendChild(costRow);
      // the button sits right under the price: on a landscape phone the unlock list would push it below the fold
      box.appendChild(this.action(d.id));
    }
    // prerequisites
    if (d.requires.length || d.tier > g.state.colony.tier) {
      const req = h('div', { class: 'req-lines', style: 'margin-top:.5em' });
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
    // buildings and vehicles show their rendered thumbnail; everything else keeps its emoji
    const unlocks: (string | UnlockEntry)[] = [];
    for (const id of d.unlocks?.buildings ?? []) unlocks.push(buildingUnlock(this.data, id));
    for (const id of d.unlocks?.recipes ?? []) unlocks.push(`🛠️ ${this.data.recipe(id)?.name ?? id}`);
    for (const id of d.unlocks?.vehicles ?? []) unlocks.push(vehicleUnlock(this.data, id));
    for (const id of d.unlocks?.regions ?? []) unlocks.push(`🗺️ ${this.data.biome(id)?.name ?? id}`);
    for (const m of d.effects ?? []) unlocks.push(`📈 ${modifierText(m, this.data)}`);
    if (unlocks.length) {
      box.appendChild(section('Unlocks'));
      const chips = h('div', { class: 'chips unlocks' });
      for (const u of unlocks.slice(0, 10)) chips.appendChild(typeof u === 'string' ? h('span', { class: 'chip info', text: u }) : unlockChip(u));
      box.appendChild(chips);
    }
    if (st === 'done') box.appendChild(h('div', { class: 'chip good', style: 'margin-top:.7em', text: '✔ Researched' }));
    return box;
  }

  private action(id: string): HTMLElement {
    const g = this.game;
    const rs = g.sys.research;
    const d = this.data.researchDef(id)!;
    const st = this.status(d.id);
    const can = rs.canResearch(d.id);
    const need = Math.max(0, Math.ceil(d.cost - g.state.research.points));
    const reason = can ? false : st === 'locked_tier' ? 'Reach a higher colony tier first' : st === 'locked_prereq' ? 'Research the earlier tech first' : need > 0 ? `Need ${need} more research points` : d.resources && !bagCovers(g.state.resources.amounts, d.resources) ? 'Gather the extra resources first' : 'Not available yet';
    return h(
      'div',
      { style: 'margin:.6em 0 .2em' },
      btn({
        label: '🔬 Research',
        cls: 'big good block',
        disabled: reason,
        data: { action: 'research' },
        onClick: () => {
          if (rs.research(d.id)) {
            this.ctx.haptic('success');
            this.ctx.toast(`Researched ${d.name}!`, 'success', researchArt(d.id) ?? d.icon);
          } else this.ctx.toast("Couldn't research that yet", 'info', '🔬');
          this.rerender();
        },
      }),
    );
  }
}
