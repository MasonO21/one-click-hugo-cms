/**
 * VehiclesPanel — vehicles you own (Ride / Get off) and ones you can craft in a garage.
 */
import { Panel, type PanelTitle } from './Panel';
import type { VehicleDef } from '../../data/schema';
import { btn, emptyState, recipeChips } from '../widgets';
import { fill, h } from '../dom';
import { vehicleArt, vehicleIcon } from '../art';

export class VehiclesPanel extends Panel {
  readonly name = 'vehicles';

  title(): PanelTitle {
    return { icon: '🚙', art: vehicleArt('buggy'), text: 'Vehicles' };
  }

  override signature(): string {
    const p = this.st.player;
    const cr = this.game.sys.crafting;
    const craftable = this.data.vehicles.map((v) => {
      const r = this.recipeFor(v);
      return r ? `${cr.canCraft(r.id).ok ? 1 : 0}${this.queued(r.id) ? 'q' : ''}` : '-';
    });
    return `${p.vehicles.join(',')}|${p.vehicle}|${this.st.colony.tier}|${this.st.research.completed.length}|${craftable.join('')}`;
  }

  private recipeFor(v: VehicleDef) {
    return this.data.recipes.find((r) => r.outputs.vehicle === v.id);
  }

  /** A craft job for this recipe is already running (a second one would only waste materials). */
  private queued(recipeId: string): boolean {
    return this.st.crafting.queue.some((j) => j.recipe === recipeId);
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
          v ? vehicleIcon(v.id, v.icon, 'bi', 'span') : h('span', { class: 'bi', text: '🚙' }),
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
      const locked = !owned && (!tierOk || !resOk);
      const card = h('div', { class: 'card veh' + (owned ? ' owned' : '') + (locked ? ' locked' : ''), data: { vehicle: v.id } });
      card.append(
        // the vehicle's rendered picture is the hero of its card (greyscale while it is still locked)
        h('div', { class: 'veh-hero' }, vehicleIcon(v.id, v.icon, 'vpic', 'div'), locked ? h('span', { class: 'bbadge', text: '🔒' }) : riding ? h('span', { class: 'bbadge ok', text: '✔' }) : null),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'h3', text: v.name }), h('div', { class: 'chips' }, h('span', { class: 'chip good', text: `⚡ ${v.speed.toFixed(1)}× speed` }), h('span', { class: 'chip info', text: `🎒 +${v.storage}` })))),
        h('div', { class: 'mute small', text: v.description }),
      );
      if (owned) {
        card.appendChild(
          btn({
            label: riding ? 'Get off' : 'Ride',
            cls: (riding ? 'ghost' : 'good') + ' block',
            onClick: () => {
              if (riding) g.sys.player.dismount();
              else if (!g.sys.player.mount(v.id)) this.ctx.toast("Can't ride here right now", 'info', vehicleArt(v.id) ?? '🚙');
              this.rerender();
            },
          }),
        );
      } else if (!tierOk || !resOk) {
        const why = !tierOk ? `Requires ${this.data.tier(v.unlockTier).name} tier` : `Requires research: ${this.data.researchDef(v.research!)?.name ?? v.research}`;
        card.appendChild(h('div', { class: 'lock', text: '🔒 ' + why }));
      } else {
        const cost = recipe?.inputs ?? v.cost;
        card.appendChild(recipeChips(this.data, cost, recipe?.itemInputs, g.state.resources.amounts, g.state.player.items));
        const busy = !!recipe && this.queued(recipe.id);
        const chk = recipe ? g.sys.crafting.canCraft(recipe.id) : null;
        card.appendChild(
          btn({
            label: !recipe ? 'Build in a garage' : busy ? '🔧 Being built…' : 'Craft',
            cls: 'info block',
            disabled: !recipe ? 'Build a Garage to craft vehicles' : busy ? 'Already being built — check the Craft menu' : chk?.ok ? false : chk?.reason ?? 'Not enough resources yet',
            onClick: () => {
              if (recipe) {
                const id = g.sys.crafting.craft(recipe.id);
                if (id == null) this.ctx.toast("Couldn't start that right now", 'info', vehicleArt(v.id) ?? '🚙');
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
