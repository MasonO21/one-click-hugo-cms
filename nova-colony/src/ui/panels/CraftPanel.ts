/**
 * CraftPanel — crafting stations as tabs, recipes grouped by category with live affordability, and
 * the queue with progress bars. Jobs can be finished instantly with a rewarded ad (context = job id)
 * or Nova Crystals (CraftingSystem.finishCost).
 *
 * Stations the colony has not built yet are locked tabs: their page offers "Build a Crafting Table" (or the research
 * it needs) over the recipes it will make. A recipe that consumes crafted parts the backpack lacks names the chain
 * ("Needs Robotic Core → made at Fabricator Bench").
 */
import { Panel, type PanelTitle } from './Panel';
import type { CraftJob } from '../../core/state';
import type { RecipeDef } from '../../data/schema';
import { bagCovers } from '../../core/bag';
import { fmt } from '../../core/format';
import { fmtHMS } from '../logic/time';
import { CRAFT_CATEGORIES, metaOf } from '../logic/categories';
import { adButton, btn, costChips, emptyState, recipeChips, section, tabs } from '../widgets';
import { fill, h } from '../dom';
import { buildingArt, buildingIcon, hudArt, iconEl, itemArt, resIcon, resourceArt, vehicleArt } from '../art';
import { LOCKED_PREFIX, lockedStations, partChainText, type LockedStation } from '../logic/craftChain';

export class CraftPanel extends Panel {
  readonly name = 'craft';
  private station = '';
  private cat = 'all';
  private acc = 0;

  title(): PanelTitle {
    return { icon: '🛠️', art: hudArt('craft'), text: 'Crafting' };
  }

  override onOpen(arg: unknown): void {
    const want = this.pick<string>(arg, 'station');
    const stations = this.game.sys.crafting.stations();
    if (want && !stations.includes(want) && this.locked().some((l) => l.station === want)) this.station = LOCKED_PREFIX + want;
    else this.station = want && stations.includes(want) ? want : stations.includes('workbench') ? 'workbench' : stations[0] ?? 'hand';
  }

  override onArg(arg: unknown): void {
    const want = this.pick<string>(arg, 'station');
    if (want) {
      this.station = this.game.sys.crafting.stations().includes(want) ? want : LOCKED_PREFIX + want;
      this.rev++;
    }
  }

  /** Stations the colony could build at its tier but has not (locked tabs). */
  private locked(): LockedStation[] {
    return lockedStations(this.game, this.game.sys.crafting.stations());
  }

  /** A station tab: the building that provides it (its thumbnail, emoji fallback). */
  private stationInfo(id: string): { icon: string; art: string | null; label: string } {
    if (id === 'hand') return { icon: '✋', art: itemArt('survival_tool'), label: 'By hand' };
    const d = this.data.buildings.find((b) => b.station === id || b.factory === id);
    return { icon: d?.icon ?? '🛠️', art: d ? buildingArt(d.id) : null, label: d?.name ?? id };
  }

  override signature(): string {
    const g = this.game;
    const cr = g.sys.crafting;
    const recipes = cr.recipes(this.station.startsWith(LOCKED_PREFIX) ? this.station.slice(LOCKED_PREFIX.length) : this.station);
    const mask = recipes.map((r) => (g.sys.crafting.canCraft(r.id).ok ? 1 : bagCovers(g.state.resources.amounts, r.inputs) ? 2 : 0)).join('');
    const q = g.state.crafting.queue.map((j) => j.id).join('.');
    const locked = this.locked()
      .map((l) => `${l.station}${l.buildable ? 1 : 0}${l.recipes}`)
      .join(',');
    const items = Object.values(g.state.player.items).join('.');
    return `${this.station}|${this.cat}|${recipes.length}|${mask}|${q}|${cr.stations().join(',')}|${g.state.liveops.nova >= 1 ? 1 : 0}|${locked}|${items}`;
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
    const locked = this.locked();
    // a station that was built meanwhile (or one that is gone): back to a real tab
    if (this.station.startsWith(LOCKED_PREFIX) && !locked.some((l) => LOCKED_PREFIX + l.station === this.station)) {
      const st = this.station.slice(LOCKED_PREFIX.length);
      this.station = stations.includes(st) ? st : stations[0] ?? 'hand';
    }
    wrap.appendChild(
      tabs(
        [
          ...stations.map((id) => {
            const i = this.stationInfo(id);
            return { id, icon: i.icon, art: i.art, label: i.label };
          }),
          ...locked.map((l) => ({ id: LOCKED_PREFIX + l.station, icon: l.def.icon, art: buildingArt(l.def.id), label: l.def.name, locked: true })),
        ],
        this.station,
        (id) => {
          this.station = id;
          this.cat = 'all';
          this.rerender();
        },
      ),
    );

    const lock = locked.find((l) => LOCKED_PREFIX + l.station === this.station);
    if (lock) wrap.appendChild(this.lockedCard(lock));
    const recipes = cr.recipes(lock ? lock.station : this.station);
    const cats = [...new Set(recipes.map((r) => r.category))];
    if (cats.length > 1) {
      wrap.appendChild(
        tabs(
          [{ id: 'all', label: 'All' }, ...cats.map((c) => ({ id: c, icon: metaOf(CRAFT_CATEGORIES, c).icon, art: metaOf(CRAFT_CATEGORIES, c).art, label: metaOf(CRAFT_CATEGORIES, c).label }))],
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

  /** A station not built yet: what it is, how many recipes it brings, and one tap to build it (or its research). */
  private lockedCard(l: LockedStation): HTMLElement {
    const g = this.game;
    const n = l.recipes;
    const sub = `${n} recipe${n === 1 ? '' : 's'} to craft here`;
    const rname = l.research ? this.data.researchDef(l.research)?.name ?? l.research : null;
    const action = l.buildable
      ? btn({
          label: 'Build',
          cls: 'good small',
          id: 'btn-craft-build-station',
          onClick: () => {
            this.ctx.close(this.name);
            this.ctx.open('build', { def: l.def.id });
          },
        })
      : rname
        ? btn({
            label: 'Research',
            cls: 'info small',
            id: 'btn-craft-build-station',
            onClick: () => this.ctx.open('research', { id: l.research }),
          })
        : null;
    return h(
      'div',
      { class: 'card craft-locked', data: { station: l.station } },
      h(
        'div',
        { class: 'row' },
        buildingIcon(l.def.id, l.def.icon, 'bi', 'span'),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'h3', text: l.buildable ? `Build a ${l.def.name}` : `${l.def.name}: research ${rname ?? 'needed'}` }),
          h('div', { class: 'mute small', text: sub }),
          l.buildable ? costChips(this.data, g.sys.buildings.cost(l.def.id), g.state.resources.amounts) : null,
        ),
        action,
      ),
    );
  }

  private outputInfo(r: RecipeDef): { icon: string; text: string; art?: string | null } {
    const o = r.outputs;
    if (o.items) {
      const [id, n] = Object.entries(o.items)[0];
      return { icon: this.data.item(id)?.icon ?? '🎁', art: itemArt(id), text: `${this.data.item(id)?.name ?? id} ×${n}` };
    }
    if (o.resources) {
      const [id, n] = Object.entries(o.resources)[0];
      const d = this.data.resource(id);
      return { icon: d?.icon ?? '📦', art: resourceArt(id), text: `+${fmt(n ?? 0)} ${d?.name ?? id}` };
    }
    if (o.vehicle) return { icon: this.data.vehicle(o.vehicle)?.icon ?? '🚙', art: vehicleArt(o.vehicle), text: this.data.vehicle(o.vehicle)?.name ?? o.vehicle };
    return { icon: '⚙️', text: r.name };
  }

  private recipeRow(r: RecipeDef): HTMLElement {
    const g = this.game;
    const chk = g.sys.crafting.canCraft(r.id);
    const out = this.outputInfo(r);
    const owned = r.outputs.items ? Object.keys(r.outputs.items).map((id) => g.state.player.items[id] ?? 0)[0] : 0;
    const chain = r.itemInputs ? partChainText(g, r, g.sys.crafting.stations()) : null;
    return h(
      'div',
      { class: 'row recipe', data: { recipe: r.id } },
      out.art ? iconEl(out.art, out.icon, 'bi', 'span') : h('span', { class: 'bi', text: out.icon }),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'h3', text: r.name }),
        h('div', { class: 'mute small', text: `${out.text}${owned ? ` · you have ${owned}` : ''} · ⏱ ${fmtHMS(r.time)}` }),
        recipeChips(this.data, r.inputs, r.itemInputs, g.state.resources.amounts, g.state.player.items),
        chain ? h('div', { class: 'small part-chain', text: `🧩 ${chain}` }) : null,
      ),
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
    const out: { icon: string; text: string; art?: string | null } = r ? this.outputInfo(r) : { icon: '⚙️', text: job.recipe };
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
            label: h('span', null, 'Finish ', resIcon('nova', '💎'), ` ${fmt(cost)}`),
            cls: 'nova small',
            disabled: g.state.liveops.nova >= cost ? false : 'Not enough Nova Crystals',
            onClick: () => {
              // pay first, then finish (finishNow itself is free — ads and Nova both route through it)
              if (g.sys.liveops.spendNova(cost, 'instant_craft')) {
                if (g.sys.crafting.finishNow(job.id)) this.ctx.haptic('success');
                else {
                  g.sys.liveops.addNova(cost, 'refund');
                  this.ctx.toast("Couldn't finish that right now", 'info', '🛠️');
                }
              }
              this.rerender();
            },
          })
        : null,
    );
    row.append(
      h(
        'div',
        { class: 'row' },
        out.art ? iconEl(out.art, out.icon, 'bi', 'span') : h('span', { class: 'bi', text: out.icon }),
        h('div', { class: 'grow' }, h('div', { class: 'h3', text: r?.name ?? job.recipe }), b, h('div', { class: 'mute small' }, 'Ready in ', h('b', { 'data-time': '1', text: fmtHMS(job.remaining) }))),
        actions,
      ),
    );
    return row;
  }
}
