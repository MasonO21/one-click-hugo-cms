/**
 * BuildingPanel — the inspector opened by tapping a building: status, HP, efficiency, effects,
 * workers (assign / unassign), factory recipe picker, level-up, material upgrades (single, whole
 * room, all of a kind), move / rotate / copy / toggle / remove (with full-refund preview).
 */
import { Panel, type PanelTitle } from './Panel';
import type { BuildingInstance, Colonist } from '../../core/state';
import type { BuildingDef, ResourceBag } from '../../data/schema';
import { WORLD_CELLS } from '../../core/constants';
import { bagCovers, bagIsEmpty } from '../../core/bag';
import { fmt } from '../../core/format';
import { buildingEffects } from '../logic/describe';
import { refundEstimate } from '../logic/build';
import { stars } from '../logic/colonist';
import { bar, btn, costChips, emptyState, portrait, section, tagChips } from '../widgets';
import { fill, h, replay, setVar } from '../dom';

const STATUS: Record<string, { text: string; cls: string }> = {
  building: { text: 'Under construction', cls: 'info' },
  active: { text: 'Working', cls: 'good' },
  damaged: { text: 'Damaged — repairing', cls: 'warn' },
  off: { text: 'Switched off', cls: '' },
};

export class BuildingPanel extends Panel {
  readonly name = 'building';
  override readonly kind = 'side' as const;
  private id = -1;
  private picking = false;
  private removing = false;

  title(): PanelTitle {
    const b = this.inst();
    const d = b ? this.data.building(b.def) : undefined;
    return { icon: d?.icon ?? '🏠', text: d?.name ?? 'Building' };
  }

  override onOpen(arg: unknown): void {
    this.id = Number(arg);
    this.select();
  }

  override onArg(arg: unknown): void {
    this.id = Number(arg);
    this.picking = false;
    this.removing = false;
    this.select();
    this.rev++;
  }

  override onClose(): void {
    const sel = this.game.view.selection;
    if (sel.kind === 'building' && sel.id === this.id) {
      sel.kind = null;
      sel.id = null;
    }
  }

  private select(): void {
    const sel = this.game.view.selection;
    sel.kind = 'building';
    sel.id = this.id;
  }

  private inst(): BuildingInstance | undefined {
    return this.game.sys.buildings.get(this.id);
  }

  override signature(): string {
    const b = this.inst();
    if (!b) return 'gone';
    const g = this.game;
    const idle = g.state.colonists.list.filter((c) => c.workplace == null).length;
    const afford = this.upgradeCosts(b)
      .map((c) => (c && bagCovers(g.state.resources.amounts, c) ? 1 : 0))
      .join('');
    return [b.level, b.tier, b.status, Math.round(b.hp / Math.max(1, b.maxHp) * 50), b.workers.join('.'), b.recipe, Math.round(b.eff * 20), Math.round(b.progress * 50), Math.round(b.craft), idle, afford, g.state.colony.tier, g.derived.buildingsVersion].join('|');
  }

  /** Costs whose affordability affects button states. */
  private upgradeCosts(b: BuildingInstance): (ResourceBag | null)[] {
    const bs = this.game.sys.buildings;
    const d = this.data.building(b.def);
    const out: (ResourceBag | null)[] = [bs.levelUpCost(b.id)];
    if (d?.piece && b.tier < this.game.state.colony.tier) out.push(bs.tierUpCost(b.id, b.tier + 1));
    return out;
  }

  render(): void {
    const b = this.inst();
    if (!b) {
      this.ctx.close(this.name);
      return;
    }
    const d = this.data.building(b.def);
    if (!d) return;
    const wrap = h('div', { class: 'stack-v insp' });
    wrap.append(this.headSection(b, d), this.vitals(b, d));
    const eff = buildingEffects(d, this.data, b.level);
    if (eff.length) wrap.appendChild(tagChips(eff, 8));
    if (d.workers && b.status !== 'building') wrap.appendChild(this.workers(b, d));
    if (d.factory) wrap.appendChild(this.recipes(b, d));
    const shortcuts = this.shortcuts(b, d);
    if (shortcuts) wrap.appendChild(shortcuts);
    wrap.appendChild(this.upgrades(b, d));
    wrap.appendChild(this.manage(b, d));
    fill(this.body, wrap);
  }

  // ---------------------------------------------------------------- sections

  private headSection(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const st = STATUS[b.status] ?? STATUS.active;
    const tier = this.data.tier(b.tier);
    const chips = h('div', { class: 'chips' });
    if (d.maxLevel > 1) chips.appendChild(h('span', { class: 'chip info', text: `Lv ${b.level}/${d.maxLevel}` }));
    const tierChip = h('span', { class: 'chip tier' }, h('i'), tier.name);
    setVar(tierChip, '--tc', tier.color);
    setVar(tierChip, '--ta', tier.accent);
    chips.appendChild(tierChip);
    chips.appendChild(h('span', { class: 'chip ' + st.cls, text: st.text }));
    return h('div', null, chips, h('div', { class: 'mute small', style: 'margin-top:.4em', text: d.description }));
  }

  private vitals(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const wrap = h('div', { class: 'stack-v tight' });
    if (b.status === 'building') {
      const p = bar(b.progress, 'orange thick', `Building… ${Math.round(b.progress * 100)}%`);
      wrap.appendChild(p);
      return wrap;
    }
    const hp = bar(b.hp / Math.max(1, b.maxHp), b.hp < b.maxHp * 0.35 ? 'red' : 'good', `❤ ${fmt(Math.ceil(b.hp))} / ${fmt(b.maxHp)}`);
    wrap.appendChild(hp);
    const hasEff = !!(d.produces || d.consumes || d.research_rate || d.workers || d.factory);
    if (hasEff && b.status !== 'off') {
      const e = Math.max(0, b.eff);
      wrap.appendChild(bar(Math.min(1, e), e >= 0.99 ? 'blue' : 'orange', `⚙ Efficiency ${Math.round(e * 100)}%`));
      const why = this.efficiencyHint(b, d);
      if (why && e < 0.99) wrap.appendChild(h('div', { class: 'hint-line', text: '💡 ' + why }));
    }
    return wrap;
  }

  private efficiencyHint(b: BuildingInstance, d: BuildingDef): string {
    const g = this.game;
    if (b.status === 'damaged') return 'Damaged — it repairs itself for free.';
    if (d.workers?.required && b.workers.length < d.workers.slots) return 'Needs workers — assign a colonist below.';
    if ((d.power ?? 0) < 0 && g.derived.power.ratio < 1) return 'Low power — build more generators.';
    if (d.consumes) return 'Waiting for ingredients.';
    return 'Running below full speed.';
  }

  private workers(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const w = d.workers!;
    const prof = this.data.profession(w.job);
    const wrap = h('div', { class: 'card tint' });
    wrap.appendChild(h('div', { class: 'row' }, h('div', { class: 'h3 grow', text: `${prof?.icon ?? '👷'} Workers · ${b.workers.length}/${w.slots}` }), h('span', { class: 'chip', text: w.required ? 'Required' : 'Automated +25% each' })));
    const list = h('div', { class: 'stack-v tight', style: 'margin-top:.5em' });
    for (let i = 0; i < w.slots; i++) {
      const cid = b.workers[i];
      const c = cid != null ? this.game.sys.colonists.get(cid) : undefined;
      if (c) {
        list.appendChild(
          h(
            'div',
            { class: 'row slot filled' },
            portrait(c),
            h('div', { class: 'grow' }, h('div', { class: 'h3', text: c.name }), h('div', { class: 'mute small' }, h('span', { class: 'stars', text: stars(c.skill) }), ` ${this.data.profession(c.specialty)?.name ?? ''}`)),
            btn({ label: '✕', cls: 'ghost small', onClick: () => this.unassign(c) }),
          ),
        );
      } else {
        list.appendChild(
          btn({
            label: `＋ Assign ${prof?.name ?? 'worker'}`,
            cls: 'ghost block slot empty',
            onClick: () => {
              this.picking = !this.picking;
              this.rerender();
            },
          }),
        );
      }
    }
    wrap.appendChild(list);
    if (this.picking) wrap.appendChild(this.picker(b, d));
    return wrap;
  }

  private picker(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const all = this.game.sys.colonists.all();
    const job = d.workers!.job;
    const sorted = [...all].filter((c) => !b.workers.includes(c.id)).sort((a, z) => Number(z.specialty === job) - Number(a.specialty === job) || Number(a.workplace != null) - Number(z.workplace != null) || z.skill - a.skill);
    const box = h('div', { class: 'picker' });
    if (!sorted.length) {
      box.appendChild(emptyState('🧑‍🚀', 'No colonists available', 'Recruit survivors to staff your buildings.'));
      box.appendChild(btn({ label: 'Open recruitment', cls: 'info small', onClick: () => this.ctx.open('recruit') }));
      return box;
    }
    for (const c of sorted) {
      const wp = c.workplace != null ? this.game.sys.buildings.get(c.workplace) : undefined;
      const wpName = wp ? this.data.building(wp.def)?.name : null;
      box.appendChild(
        h(
          'div',
          { class: 'row pick-row' },
          portrait(c),
          h('div', { class: 'grow' }, h('div', { class: 'h3', text: c.name }), h('div', { class: 'mute small' }, `${c.specialty === job ? '⭐ ' : ''}${this.data.profession(c.specialty)?.name ?? ''} · `, h('span', { class: 'stars', text: stars(c.skill) }), wpName ? ` · at ${wpName}` : ' · idle')),
          btn({ label: 'Assign', cls: 'good small', onClick: () => this.assign(c) }),
        ),
      );
    }
    return box;
  }

  private assign(c: Colonist): void {
    const ok = this.game.sys.colonists.assign(c.id, this.id);
    if (ok) {
      this.picking = false;
      this.ctx.haptic('success');
    } else this.ctx.toast(`${c.name} can't take that job right now`, 'info', '🧑‍🚀');
    this.rerender();
  }

  private unassign(c: Colonist): void {
    this.game.sys.colonists.assign(c.id, null);
    this.rerender();
  }

  private recipes(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const recipes = this.game.sys.crafting.recipes(d.factory!);
    const wrap = h('div', { class: 'card tint' });
    wrap.appendChild(h('div', { class: 'h3', text: '🏭 Production recipe' }));
    const cur = b.recipe ? this.data.recipe(b.recipe) : undefined;
    if (cur) wrap.appendChild(bar(cur.time > 0 ? b.craft / cur.time : 0, 'blue', `${cur.name} · ${Math.round((b.craft / Math.max(1, cur.time)) * 100)}%`));
    const list = h('div', { class: 'chips recipe-list', style: 'margin-top:.5em' });
    if (!recipes.length) list.appendChild(h('span', { class: 'mute', text: 'No recipes unlocked for this machine yet.' }));
    for (const r of recipes) {
      const on = r.id === b.recipe;
      const out = r.outputs.items ? Object.keys(r.outputs.items)[0] : r.outputs.resources ? Object.keys(r.outputs.resources)[0] : '';
      const icon = this.data.item(out)?.icon ?? this.data.resource(out)?.icon ?? '⚙️';
      const chip = h('button', { class: 'tab' + (on ? ' on' : ''), type: 'button', data: { recipe: r.id, sfx: 'ui_tab' } }, h('span', { class: 'ico', text: icon }), r.name);
      chip.addEventListener('click', () => {
        this.game.sys.buildings.setRecipe(b.id, on ? null : r.id);
        this.rerender();
      });
      list.appendChild(chip);
    }
    wrap.appendChild(list);
    return wrap;
  }

  private shortcuts(b: BuildingInstance, d: BuildingDef): HTMLElement | null {
    const row = h('div', { class: 'stack-v tight' });
    let n = 0;
    const add = (label: string, cls: string, fn: () => void) => {
      n++;
      row.appendChild(btn({ label, cls: cls + ' block', onClick: fn }));
    };
    if (d.recruit) add('🧑‍🤝‍🧑 Open recruitment board', 'info', () => this.ctx.open('recruit'));
    if (d.station) add('🛠️ Craft here', 'info', () => this.ctx.open('craft', { station: d.station }));
    if (d.garage) add('🚙 Open garage', 'info', () => this.ctx.open('vehicles'));
    if (d.teleporter) add('🌀 Open map & travel', 'info', () => this.ctx.open('map'));
    if (d.spinWheel) add('🎡 Spin the wheel', 'nova', () => this.ctx.open('spin'));
    if (d.research_rate) add('🔬 Open research', 'info', () => this.ctx.open('research'));
    return n ? row : null;
  }

  private act(icon: string, label: string, cost: ResourceBag | null | undefined, opts: { disabled?: string | false; cls?: string; onClick: () => void }): HTMLElement {
    const el = h('button', { class: 'act ' + (opts.cls ?? ''), type: 'button' }, h('span', { class: 'ai', text: icon }), h('span', { class: 'al', text: label }));
    if (cost && !bagIsEmpty(cost)) el.appendChild(costChips(this.data, cost, this.game.state.resources.amounts));
    if (opts.disabled) {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('data-why', opts.disabled);
    }
    el.addEventListener('click', () => {
      if (opts.disabled) return;
      opts.onClick();
    });
    return el;
  }

  private upgrades(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const g = this.game;
    const bs = g.sys.buildings;
    const wrap = h('div', null);
    const grid = h('div', { class: 'act-grid' });
    const have = g.state.resources.amounts;
    const colonyTier = g.state.colony.tier;
    let count = 0;

    if (d.maxLevel > 1) {
      const cost = bs.levelUpCost(b.id);
      count++;
      if (cost) {
        grid.appendChild(
          this.act('⬆️', `Level ${b.level} → ${b.level + 1}`, cost, {
            disabled: bagCovers(have, cost) ? false : 'Not enough resources yet',
            cls: 'good',
            onClick: () => {
              if (bs.levelUp(b.id)) {
                this.ctx.haptic('success');
                this.flash();
              } else this.ctx.toast("Couldn't upgrade that right now", 'info', '⬆️');
              this.rerender();
            },
          }),
        );
      } else grid.appendChild(this.act('⭐', 'Max level', null, { disabled: 'This building is fully upgraded!', onClick: () => {} }));
    }

    if (d.piece) {
      const next = b.tier + 1;
      count++;
      if (next > 6) grid.appendChild(this.act('💎', 'Top material', null, { disabled: 'Already the best material!', onClick: () => {} }));
      else {
        const nt = this.data.tier(next);
        const cost = bs.tierUpCost(b.id, next);
        const locked = next > colonyTier;
        grid.appendChild(
          this.act('🧱', `Upgrade to ${nt.name}`, locked ? null : cost, {
            disabled: locked ? `Reach ${nt.name} tier first` : cost && !bagCovers(have, cost) ? 'Not enough resources yet' : false,
            onClick: () => {
              if (bs.tierUp(b.id, next)) {
                this.ctx.haptic('success');
                this.flash();
              } else this.ctx.toast("Couldn't upgrade that right now", 'info', '🧱');
              this.rerender();
            },
          }),
        );
        // whole-room + all-of-kind upgrades
        const roomIds = this.roomIds(b);
        const sameIds = g.state.buildings.list.filter((x) => x.def === b.def && x.tier === b.tier).map((x) => x.id);
        if (roomIds.length > 1) {
          const rc = bs.massTierUpCost(roomIds, next);
          count++;
          grid.appendChild(
            this.act('🏠', `Upgrade entire room (${roomIds.length})`, locked ? null : rc, {
              disabled: locked ? `Reach ${nt.name} tier first` : !bagCovers(have, rc) ? 'Not enough resources yet' : false,
              onClick: () => this.mass(roomIds, next, 'room'),
            }),
          );
        }
        if (sameIds.length > 1) {
          const kind = d.name.toLowerCase();
          const rc = bs.massTierUpCost(sameIds, next);
          count++;
          grid.appendChild(
            this.act('🧰', `All ${kind}s of this tier (${sameIds.length})`, locked ? null : rc, {
              disabled: locked ? `Reach ${nt.name} tier first` : !bagCovers(have, rc) ? 'Not enough resources yet' : false,
              onClick: () => this.mass(sameIds, next, kind),
            }),
          );
        }
      }
    }
    if (!count) return wrap;
    wrap.append(section('Upgrade'), grid);
    return wrap;
  }

  private mass(ids: number[], tier: number, what: string): void {
    const n = this.game.sys.buildings.massTierUp(ids, tier);
    if (n > 0) {
      this.ctx.toast(`Upgraded ${n} ${what === 'room' ? 'pieces' : what + 's'} to ${this.data.tier(tier).name}!`, 'success', '✨');
      this.ctx.haptic('success');
      this.flash();
    } else this.ctx.toast("Couldn't upgrade those right now", 'info', '🧱');
    this.rerender();
  }

  /** Ids of every piece in the enclosed room containing this piece (if any). */
  private roomIds(b: BuildingInstance): number[] {
    const g = this.game;
    const room = g.derived.rooms.find((r) => r.buildings.includes(b.id));
    const cands: [number, number][] = [];
    if (room?.cells.length) cands.push([room.cells[0] % WORLD_CELLS, Math.floor(room.cells[0] / WORLD_CELLS)]);
    cands.push([b.x + 1, b.z], [b.x - 1, b.z], [b.x, b.z + 1], [b.x, b.z - 1]);
    for (const [cx, cz] of cands) {
      const ids = g.sys.buildings.roomPieces(cx, cz);
      if (ids.includes(b.id)) return ids;
    }
    return room ? room.buildings : [];
  }

  private manage(b: BuildingInstance, d: BuildingDef): HTMLElement {
    const g = this.game;
    const bs = g.sys.buildings;
    const wrap = h('div', null, section('Manage'));
    const grid = h('div', { class: 'act-grid small' });
    grid.appendChild(
      this.act('✋', 'Move', null, {
        onClick: () => {
          this.ctx.close(this.name);
          this.ctx.build.startMove(b.id);
        },
      }),
    );
    grid.appendChild(
      this.act('🔄', 'Rotate', null, {
        onClick: () => {
          bs.rotate(b.id);
          this.rerender();
        },
      }),
    );
    grid.appendChild(
      this.act('📋', 'Copy', null, {
        onClick: () => {
          this.ctx.close(this.name);
          this.ctx.build.start(b.def, { tier: b.tier, rot: b.rot });
        },
      }),
    );
    if (!d.piece && b.status !== 'building') {
      grid.appendChild(
        this.act(b.status === 'off' ? '🔌' : '⏻', b.status === 'off' ? 'Switch on' : 'Switch off', null, {
          onClick: () => {
            bs.toggle(b.id);
            this.rerender();
          },
        }),
      );
    }
    wrap.appendChild(grid);

    if (this.removing) {
      const base = d.piece ? bs.cost(d.id, b.tier) : bs.cost(d.id);
      const refund = refundEstimate(base, b.level, d.levelCostMult, this.data.balance.removeRefund);
      wrap.appendChild(
        h(
          'div',
          { class: 'card remove-confirm' },
          h('div', { class: 'h3', text: `Remove ${d.name}?` }),
          h('div', { class: 'mute small', text: 'You get everything back — nothing is ever lost.' }),
          costChips(this.data, refund, {}),
          h(
            'div',
            { class: 'row', style: 'margin-top:.5em' },
            btn({
              label: 'Yes, remove',
              cls: 'bad small grow',
              onClick: () => {
                if (bs.remove(b.id)) {
                  this.ctx.haptic('heavy');
                  this.ctx.close(this.name);
                } else this.ctx.toast("That one can't be removed", 'info', '🏠');
              },
            }),
            btn({
              label: 'Keep it',
              cls: 'ghost small grow',
              onClick: () => {
                this.removing = false;
                this.rerender();
              },
            }),
          ),
        ),
      );
    } else {
      wrap.appendChild(
        h(
          'div',
          { style: 'margin-top:.6em' },
          btn({
            label: '🗑️ Remove (full refund)',
            cls: 'ghost small block',
            onClick: () => {
              this.removing = true;
              this.rerender();
            },
          }),
        ),
      );
    }
    return wrap;
  }

  private flash(): void {
    replay(this.card, 'pop');
  }
}
