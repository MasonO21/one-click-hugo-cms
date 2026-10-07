/**
 * PlayerSystem — joystick movement (camera-relative) with collision against solid buildings, nodes,
 * water and locked regions; vehicles; contextual interaction (gather, loot, rescue, use building,
 * mount vehicle); auto-gather; backpack + auto-deposit inside the colony; equipment & items;
 * knock-out/respawn (no loss).
 *
 * OWNER: world agent. Writes state.player.
 */
import { System } from './System';
import type { EquipSlot } from '../data/schema';

export interface Interaction {
  kind: 'gather' | 'loot' | 'rescue' | 'building' | 'vehicle' | 'event' | 'deposit' | 'beacon' | 'attack';
  /** Button label, e.g. "Chop", "Mine", "Open", "Rescue". */
  label: string;
  icon: string;
  target: number | string | null;
  x: number;
  z: number;
}

export class PlayerSystem extends System {
  /** Best interaction available near the player (drives the context button). */
  interaction(): Interaction | null {
    return null;
  }

  /** Total resources currently carried. */
  carried(): number {
    return 0;
  }

  capacity(): number {
    return this.game.data.balance.backpackCapacity;
  }

  depositBackpack(): void {}

  addItem(id: string, count = 1): void {
    const items = this.game.state.player.items;
    items[id] = (items[id] ?? 0) + count;
    this.game.bus.emit('item:gained', { item: id, count });
  }

  removeItem(id: string, count = 1): boolean {
    const items = this.game.state.player.items;
    if ((items[id] ?? 0) < count) return false;
    items[id] -= count;
    if (items[id] <= 0) delete items[id];
    return true;
  }

  equip(_itemId: string): boolean {
    return false;
  }

  unequip(_slot: EquipSlot): void {}

  useItem(_itemId: string): boolean {
    return false;
  }

  mount(_vehicleId: string): boolean {
    return false;
  }

  dismount(): void {}

  /** Teleport to a beacon/teleporter POI id or 'base'. */
  fastTravel(_to: string): boolean {
    return false;
  }

  /** Effective walking speed (world units / s) including vehicle & modifiers. */
  speed(): number {
    return this.game.data.balance.playerSpeed;
  }
}
