/**
 * VehiclesPanel — vehicles you own (Ride / Get off) and ones you can craft in a garage.
 */
import { Panel, type PanelTitle } from './Panel';
import type { VehicleDef } from '../../data/schema';
import { bagCovers } from '../../core/bag';
import { btn, costChips, emptyState } from '../widgets';
import { fill, h } from '../dom';

export class VehiclesPanel extends Panel {
  readonly name = 'vehicles';

  title(): PanelTitle {
    return { icon: '🚙', text: 'Vehicles' };
  }

  override signature(): string {
    const p = this.st.player;
    return `${p.vehicles.join(',')}|${p.vehicle}|${this.st.colony.tier}|${this.st.research.completed.length}`;
  }

  private recipeFor(v: VehicleDef) {
    return this.data.recipes.find((r) => r.outputs.vehicle === v.id);
  }

  render(): void {
    const g = this.game;
    const p = g.state.player;
    const wrap = h('div', { class: 'stack-v' });
    const vehicles = this.data.vehicles;
    if (!vehicles.length) {
      fill(this.body, emptyState('🚙', 'No vehicles yet', 'Unlock a garage to build rides.'));
      return;
    }
    if (p.vehicle) {
      const v = this.data.vehicle(p.vehicle);
      wrap.appendChild(
        h(
          'div',
          { class: 'card tint row' },
          h('span', { class: 'bi', text: v?.icon ?? '🚙' }),
          h('div', { class: 'grow' }, h('div', { class: 'h3', text: `Riding ${v?.name ?? 'vehicle'}` }), h('div', { class: 'mute small', text: 'Tap Get off to walk again.' })),
          btn({ label: 'Get off', cls: 'ghost small', onClick: () => {
            g.sys.player.dismount();
            this.rerender();
          } }),
        ),
      );
    }
    const grid = h('div', { class: 'grid veh-grid' });
    for (const v of vehicles) {
      const owned = p.vehicles.includes(v.id);
      const riding = p.vehicle === v.id;
      const tierOk = v.unlockTier <= g.state.colony.tier;
      const resOk = !v.research || g.state.research.completed.includes(v.research);
      const recipe = this.recipeFor(v);
      const card = h('div', { class: 'card veh' + (owned ? ' owned' : ''), data: { vehicle: v.id } });
      card.append(
        h('div', { class: 'row' }, h('span', { class: 'bi', text: v.icon }), h('div', { class: 'grow' }, h('div', { class: 'h3', text: v.name }), h('div', { class: 'chips' }, h('span', { class: 'chip good', text: `⚡ ${v.speed.toFixed(1)}× speed` }), h('span', { class: 'chip info', text: `🎒 +${v.storage}` })))),
        h('div', { class: 'mute small', text: v.description }),
      );
      if (owned) {
        card.appendChild(
          btn({
            label: riding ? 'Get off' : 'Ride',
            cls: (riding ? 'ghost' : 'good') + ' block',
            onClick: () => {
              if (riding) g.sys.player.dismount();
              else if (!g.sys.player.mount(v.id)) this.ctx.toast("Can't ride here right now", 'info', '🚙');
              this.rerender();
            },
          }),
        );
      } else if (!tierOk || !resOk) {
        const why = !tierOk ? `Requires ${this.data.tier(v.unlockTier).name} tier` : `Requires research: ${this.data.researchDef(v.research!)?.name ?? v.research}`;
        card.appendChild(h('div', { class: 'lock', text: '🔒 ' + why }));
      } else {
        const cost = recipe?.inputs ?? v.cost;
        card.appendChild(costChips(this.data, cost, g.state.resources.amounts));
        card.appendChild(
          btn({
            label: recipe ? 'Craft' : 'Build in a garage',
            cls: 'info block',
            disabled: !recipe ? 'Build a Garage to craft vehicles' : bagCovers(g.state.resources.amounts, cost) ? false : 'Not enough resources yet',
            onClick: () => {
              if (recipe) {
                const id = g.sys.crafting.craft(recipe.id);
                if (id == null) this.ctx.toast("Couldn't start that right now", 'info', '🚙');
                else this.ctx.open('craft', { station: recipe.station });
              }
            },
          }),
        );
      }
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    fill(this.body, wrap);
  }
}
