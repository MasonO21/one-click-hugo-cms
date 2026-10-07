/**
 * EconomySystem — resources, storage capacity, production/consumption, power, food & water upkeep,
 * modifiers, and offline-progress calculation.
 *
 * OWNER: economy agent. Writes state.resources and game.derived.{capacity, *PerMin, power, research}.
 */
import { System } from './System';
import type { ModifierStat, ResourceBag } from '../data/schema';
import type { GainSource } from '../core/events';
import { bagCovers, bagEntries, bagMissing } from '../core/bag';

export interface OfflineSummary {
  /** Seconds credited (after cap). */
  seconds: number;
  /** Seconds actually away. */
  away: number;
  gains: ResourceBag;
  rp: number;
}

export class EconomySystem extends System {
  // ---------------------------------------------------------------- resources

  amount(id: string): number {
    return this.game.state.resources.amounts[id] ?? 0;
  }

  capacity(id: string): number {
    return this.game.derived.capacity[id] ?? this.game.data.resource(id)?.baseCapacity ?? 0;
  }

  canAfford(cost: ResourceBag | undefined): boolean {
    return bagCovers(this.game.state.resources.amounts, cost);
  }

  missing(cost: ResourceBag | undefined): ResourceBag {
    return bagMissing(this.game.state.resources.amounts, cost);
  }

  /** Deduct cost if affordable. Emits resource:spent or resource:insufficient. */
  spend(cost: ResourceBag | undefined, reason: string): boolean {
    if (!this.canAfford(cost)) {
      this.game.bus.emit('resource:insufficient', { missing: this.missing(cost) });
      return false;
    }
    const a = this.game.state.resources.amounts;
    for (const [k, v] of bagEntries(cost)) a[k] = (a[k] ?? 0) - v;
    this.game.bus.emit('resource:spent', { bag: cost ?? {}, reason });
    return true;
  }

  /**
   * Add resources (clamped to capacity). Returns the amount actually added.
   * `x/z` (world units) lets UI/render animate resources flying from that spot.
   */
  add(id: string, amount: number, source: GainSource, x?: number, z?: number): number {
    const st = this.game.state.resources;
    const cur = st.amounts[id] ?? 0;
    const cap = this.capacity(id);
    const added = Math.max(0, Math.min(amount, cap - cur));
    st.amounts[id] = cur + added;
    st.lifetime[id] = (st.lifetime[id] ?? 0) + added;
    if (added > 0) this.game.bus.emit('resource:gained', { id, amount: added, source, x, z });
    return added;
  }

  addBag(bag: ResourceBag | undefined, source: GainSource, x?: number, z?: number): ResourceBag {
    const out: ResourceBag = {};
    for (const [k, v] of bagEntries(bag)) out[k] = this.add(k, v, source, x, z);
    return out;
  }

  // ---------------------------------------------------------------- modifiers

  /**
   * Aggregated multiplier for a stat: (1 + sum of adds) * product of mults, from completed research,
   * equipped items, VIP, active boosts and colony happiness (for 'production').
   */
  modifier(_stat: ModifierStat): number {
    return 1;
  }

  // ---------------------------------------------------------------- derived

  /** Recompute capacity, rates, power, housing, research rate. Call after building changes. */
  recompute(): void {
    const d = this.game.derived;
    for (const r of this.game.data.resources) d.capacity[r.id] = r.baseCapacity;
  }

  // ---------------------------------------------------------------- offline

  /** Compute (but do not apply) offline gains for `awaySeconds`, respecting caps. */
  computeOffline(awaySeconds: number): OfflineSummary {
    return { seconds: 0, away: awaySeconds, gains: {}, rp: 0 };
  }

  /** Apply an offline summary (optionally multiplied, e.g. x2 from a rewarded ad). */
  applyOffline(summary: OfflineSummary, mult = 1): void {
    for (const [k, v] of bagEntries(summary.gains)) this.add(k, v * mult, 'offline');
    if (summary.rp > 0) this.game.sys.research.addPoints(summary.rp * mult);
  }

  override onLoad(): void {
    this.recompute();
  }
}
