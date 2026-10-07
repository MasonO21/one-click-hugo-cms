/**
 * InventoryPanel — equipment slots (tool, weapon, armor, backpack, utility), carried resources with a
 * deposit button, and every item you own with Equip / Use actions.
 */
import { Panel, type PanelTitle } from './Panel';
import type { EquipSlot, ItemDef } from '../../data/schema';
import { bagEntries } from '../../core/bag';
import { fmt } from '../../core/format';
import { bar, btn, emptyState, resChip, section } from '../widgets';
import { fill, h } from '../dom';
import { itemIcon } from '../art';

const SLOTS: { id: EquipSlot; icon: string; label: string }[] = [
  { id: 'tool', icon: '🪓', label: 'Tool' },
  { id: 'weapon', icon: '🔫', label: 'Weapon' },
  { id: 'armor', icon: '🦺', label: 'Armor' },
  { id: 'backpack', icon: '🎒', label: 'Backpack' },
  { id: 'utility', icon: '🔧', label: 'Utility' },
];

export function itemStatText(d: ItemDef): string {
  const s = d.stats;
  if (!s) return d.description;
  const bits: string[] = [];
  if (s.gatherYield) bits.push(`+${Math.round(s.gatherYield * 100)}% yield`);
  if (s.gatherSpeed) bits.push(`+${Math.round(s.gatherSpeed * 100)}% speed`);
  if (s.damage) bits.push(`${fmt(s.damage)} dmg`);
  if (s.fireRate) bits.push(`${fmt(s.fireRate)}/s`);
  if (s.range) bits.push(`${fmt(s.range)} range`);
  if (s.hp) bits.push(`+${fmt(s.hp)} HP`);
  if (s.capacity) bits.push(`carry ${fmt(s.capacity)}`);
  if (s.moveSpeed) bits.push(`+${Math.round(s.moveSpeed * 100)}% move`);
  return bits.join(' · ') || d.description;
}

export class InventoryPanel extends Panel {
  readonly name = 'inventory';
  private slot: EquipSlot | null = null;

  title(): PanelTitle {
    return { icon: '🎒', text: 'Inventory' };
  }

  override signature(): string {
    const p = this.st.player;
    return `${Object.entries(p.items).join(',')}|${Object.entries(p.equip).join(',')}|${Math.floor(this.game.sys.player.carried())}|${Math.round(p.hp)}|${this.slot}`;
  }

  render(): void {
    const g = this.game;
    const p = g.state.player;
    const wrap = h('div', { class: 'stack-v' });

    // backpack
    const carried = g.sys.player.carried();
    const cap = g.sys.player.capacity();
    const pack = h('div', { class: 'card tint' });
    pack.appendChild(h('div', { class: 'row' }, h('div', { class: 'h3 grow', text: `🎒 Backpack ${Math.floor(carried)} / ${cap}` }), btn({ label: 'Deposit all', cls: 'good small', disabled: carried > 0 ? false : 'Nothing to deposit', onClick: () => {
      g.sys.player.depositBackpack();
      this.rerender();
    } })));
    pack.appendChild(bar(cap > 0 ? carried / cap : 0, carried / Math.max(1, cap) > 0.9 ? 'orange' : 'good'));
    const chips = h('div', { class: 'chips', style: 'margin-top:.4em' });
    const entries = bagEntries(p.backpack);
    if (!entries.length) chips.appendChild(h('span', { class: 'mute small', text: 'Empty — gather resources and walk back to the colony to store them.' }));
    for (const [id, n] of entries) chips.appendChild(resChip(this.data, id, n));
    pack.appendChild(chips);
    wrap.appendChild(pack);

    // equipment
    wrap.appendChild(section('Equipment'));
    const slots = h('div', { class: 'slots' });
    for (const s of SLOTS) {
      const id = p.equip[s.id];
      const d = id ? this.data.item(id) : undefined;
      const el = h(
        'button',
        { class: 'slot-card' + (this.slot === s.id ? ' on' : '') + (d ? ' filled' : ''), type: 'button', data: { slot: s.id, sfx: 'ui_tab' } },
        h('div', { class: 'sl', text: s.label }),
        id && d ? itemIcon(id, d.icon, 'si', 'div') : h('div', { class: 'si', text: s.icon }),
        h('div', { class: 'sn', text: d?.name ?? 'Empty' }),
      );
      el.addEventListener('click', () => {
        this.slot = this.slot === s.id ? null : s.id;
        this.rerender();
      });
      slots.appendChild(el);
    }
    wrap.appendChild(slots);
    if (this.slot && p.equip[this.slot]) {
      const slot = this.slot;
      wrap.appendChild(btn({ label: `Unequip ${this.data.item(p.equip[slot]!)?.name ?? ''}`, cls: 'ghost small', onClick: () => {
        g.sys.player.unequip(slot);
        this.rerender();
      } }));
    }

    // items
    wrap.appendChild(section(this.slot ? `${SLOTS.find((s) => s.id === this.slot)?.label} items` : 'Items'));
    const items = Object.entries(p.items)
      .map(([id, n]) => ({ d: this.data.item(id), id, n }))
      .filter((x): x is { d: ItemDef; id: string; n: number } => !!x.d && x.n > 0)
      .filter((x) => !this.slot || x.d.slot === this.slot)
      .sort((a, z) => Number(!!z.d.slot) - Number(!!a.d.slot) || a.d.name.localeCompare(z.d.name));
    if (!items.length) wrap.appendChild(emptyState('🧰', this.slot ? 'Nothing for this slot yet' : 'No items yet', 'Craft tools and gear at a workbench.'));
    const list = h('div', { class: 'stack-v tight' });
    for (const { d, id, n } of items) {
      const equipped = d.slot ? p.equip[d.slot] === id : false;
      const actions = h('div', { class: 'row' });
      if (d.slot) {
        actions.appendChild(
          btn({
            label: equipped ? '✔ Equipped' : 'Equip',
            cls: equipped ? 'ghost small' : 'good small',
            disabled: equipped ? 'Already equipped' : false,
            onClick: () => {
              if (g.sys.player.equip(id)) this.ctx.haptic('tap');
              this.rerender();
            },
          }),
        );
      }
      if (d.use) {
        actions.appendChild(
          btn({
            label: d.category === 'crate' ? 'Open' : 'Use',
            cls: 'info small',
            onClick: () => {
              if (g.sys.player.useItem(id)) this.ctx.haptic('success');
              this.rerender();
            },
          }),
        );
      }
      list.appendChild(h('div', { class: 'row item-row', data: { item: id } }, itemIcon(id, d.icon, 'bi', 'span'), h('div', { class: 'grow' }, h('div', { class: 'h3', text: `${d.name}${n > 1 ? ` ×${n}` : ''}` }), h('div', { class: 'mute small', text: itemStatText(d) })), actions));
    }
    wrap.appendChild(list);
    fill(this.body, wrap);
  }
}
