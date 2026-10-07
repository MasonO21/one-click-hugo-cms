/**
 * CraftPanel — crafting stations as tabs, recipes grouped by category with live affordability, and
 * the queue with progress bars. Jobs can be finished instantly with a rewarded ad (context = job id)
 * or Nova Crystals (CraftingSystem.finishCost).
 */
import { Panel, type PanelTitle } from './Panel';
import type { CraftJob } from '../../core/state';
import type { RecipeDef } from '../../data/schema';
import { bagCovers } from '../../core/bag';
import { fmt } from '../../core/format';
import { fmtHMS } from '../logic/time';
import { CRAFT_CATEGORIES, metaOf } from '../logic/categories';
import { adButton, btn, costChips, emptyState, section, tabs } from '../widgets';
import { fill, h } from '../dom';

export class CraftPanel extends Panel {
  readonly name = 'craft';
  private station = '';
  private cat = 'all';
  private acc = 0;

  title(): PanelTitle {
    return { icon: '🛠️', text: 'Crafting' };
  }

  override onOpen(arg: unknown): void {
    const want = this.pick<string>(arg, 'station');
    const stations = this.game.sys.crafting.stations();
    this.station = want && stations.includes(want) ? want : stations.includes('workbench') ? 'workbench' : stations[0] ?? 'hand';
  }

  override onArg(arg: unknown): void {
    const want = this.pick<string>(arg, 'station');
    if (want) {
      this.station = want;
      this.rev++;
    }
  }

  private stationInfo(id: string): { icon: string; label: string } {
    if (id === 'hand') return { icon: '✋', label: 'By hand' };
    const d = this.data.buildings.find((b) => b.station === id || b.factory === id);
    return { icon: d?.icon ?? '🛠️', label: d?.name ?? id };
  }

  override signature(): string {
    const g = this.game;
    const cr = g.sys.crafting;
    const recipes = cr.recipes(this.station);
    const mask = recipes.map((r) => (bagCovers(g.state.resources.amounts, r.inputs) ? 1 : 0)).join('');
    const q = g.state.crafting.queue.map((j) => j.id).join('.');
    return `${this.station}|${this.cat}|${recipes.length}|${mask}|${q}|${cr.stations().join(',')}|${g.state.liveops.nova >= 1 ? 1 : 0}`;
  }

  override live(dt: number): void {
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    for (const j of this.game.state.crafting.queue) {
      const row = this.body.querySelector(`[data-job="${j.id}"]`);
      if (!row) continue;
      const fillEl = row.querySelector<HTMLElement>('.bar > i');
      const t = row.querySelector('[data-time]');
      const frac = j.total > 0 ? 1 - j.remaining / j.total : 1;
      if (fillEl) fillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`;
      if (t) t.textContent = fmtHMS(j.remaining);
    }
  }

  render(): void {
    const g = this.game;
    const cr = g.sys.crafting;
    const stations = cr.stations();
    const wrap = h('div', { class: 'stack-v' });

    const queue = g.state.crafting.queue;
    if (queue.length) {
      wrap.appendChild(section(`In progress · ${queue.length}`));
      for (const job of queue) wrap.appendChild(this.queueRow(job));
    }

    wrap.appendChild(section('Recipes'));
    wrap.appendChild(
      tabs(
        stations.map((id) => {
          const i = this.stationInfo(id);
          return { id, icon: i.icon, label: i.label };
        }),
        this.station,
        (id) => {
          this.station = id;
          this.cat = 'all';
          this.rerender();
        },
      ),
    );

    const recipes = cr.recipes(this.station);
    const cats = [...new Set(recipes.map((r) => r.category))];
    if (cats.length > 1) {
      wrap.appendChild(
        tabs(
          [{ id: 'all', label: 'All' }, ...cats.map((c) => ({ id: c, icon: metaOf(CRAFT_CATEGORIES, c).icon, label: metaOf(CRAFT_CATEGORIES, c).label }))],
          this.cat,
          (id) => {
            this.cat = id;
            this.rerender();
          },
        ),
      );
    }
    const shown = recipes.filter((r) => this.cat === 'all' || r.category === this.cat);
    if (!shown.length) wrap.appendChild(emptyState('📜', 'No recipes here yet', 'Research and tier-ups unlock more things to craft.'));
    const grid = h('div', { class: 'stack-v tight' });
    for (const r of shown) grid.appendChild(this.recipeRow(r));
    wrap.appendChild(grid);
    fill(this.body, wrap);
  }

  private outputInfo(r: RecipeDef): { icon: string; text: string } {
    const o = r.outputs;
    if (o.items) {
      const [id, n] = Object.entries(o.items)[0];
      return { icon: this.data.item(id)?.icon ?? '🎁', text: `${this.data.item(id)?.name ?? id} ×${n}` };
    }
    if (o.resources) {
      const [id, n] = Object.entries(o.resources)[0];
      const d = this.data.resource(id);
      return { icon: d?.icon ?? '📦', text: `+${fmt(n ?? 0)} ${d?.name ?? id}` };
    }
    if (o.vehicle) return { icon: this.data.vehicle(o.vehicle)?.icon ?? '🚙', text: this.data.vehicle(o.vehicle)?.name ?? o.vehicle };
    return { icon: '⚙️', text: r.name };
  }

  private recipeRow(r: RecipeDef): HTMLElement {
    const g = this.game;
    const chk = g.sys.crafting.canCraft(r.id);
    const out = this.outputInfo(r);
    const owned = r.outputs.items ? Object.keys(r.outputs.items).map((id) => g.state.player.items[id] ?? 0)[0] : 0;
    return h(
      'div',
      { class: 'row recipe', data: { recipe: r.id } },
      h('span', { class: 'bi', text: out.icon }),
      h('div', { class: 'grow' }, h('div', { class: 'h3', text: r.name }), h('div', { class: 'mute small', text: `${out.text}${owned ? ` · you have ${owned}` : ''} · ⏱ ${fmtHMS(r.time)}` }), costChips(this.data, r.inputs, g.state.resources.amounts)),
      btn({
        label: 'Craft',
        cls: 'good small',
        disabled: chk.ok ? false : chk.reason ?? 'Not enough resources yet',
        onClick: () => {
          const id = g.sys.crafting.craft(r.id);
          if (id == null) this.ctx.toast("Couldn't craft that right now", 'info', '🛠️');
          else this.ctx.haptic('tap');
          this.rerender();
        },
      }),
    );
  }

  private queueRow(job: CraftJob): HTMLElement {
    const g = this.game;
    const r = this.data.recipe(job.recipe);
    const out = r ? this.outputInfo(r) : { icon: '⚙️', text: job.recipe };
    const frac = job.total > 0 ? 1 - job.remaining / job.total : 1;
    const cost = g.sys.crafting.finishCost(job.id);
    const row = h('div', { class: 'card qrow', data: { job: job.id } });
    const b = h('div', { class: 'bar blue thick' }, h('i'), h('span', { class: 'lbl' }));
    (b.firstChild as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, frac)).toFixed(3)})`;
    const actions = h(
      'div',
      { class: 'q-actions' },
      adButton(this.ctx, 'instant_craft', 'Finish free', () => this.rerender(), { context: job.id, cls: 'small', sub: undefined }),
      cost > 0
        ? btn({
            label: `Finish 💎 ${fmt(cost)}`,
            cls: 'nova small',
            disabled: g.state.liveops.nova >= cost ? false : 'Not enough Nova Crystals',
            onClick: () => {
              // finishNow may or may not charge Nova itself: only charge here if it did not
              const before = g.state.liveops.nova;
              if (g.sys.crafting.finishNow(job.id)) {
                if (g.state.liveops.nova === before) g.sys.liveops.spendNova(cost, 'instant_craft');
                this.ctx.haptic('success');
              } else this.ctx.toast("Couldn't finish that right now", 'info', '🛠️');
              this.rerender();
            },
          })
        : null,
    );
    row.append(
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'bi', text: out.icon }),
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: r?.name ?? job.recipe }), b, h('div', { class: 'mute small' }, 'Ready in ', h('b', { 'data-time': '1', text: fmtHMS(job.remaining) }))),
        actions,
      ),
    );
    return row;
  }
}
