/**
 * ProgressionSystem — colony tier advancement (Wood -> ... -> Titanium) by upgrading the core,
 * colony radius expansion, and tier-unlock bookkeeping.
 *
 * OWNER: economy agent. Writes state.colony.
 * The construction system re-tiers facilities (and the core's look) on `colony:tierUp`.
 */
import { System } from './System';
import type { ResourceBag, TierDef } from '../data/schema';

export interface TierUpRequirements {
  tier: number;
  research: string | null;
  researchDone: boolean;
  cost: ResourceBag;
  affordable: boolean;
}

/** What reaching a tier unlocks (for "Next tier unlocks…" UI). */
export interface TierUnlocks {
  buildings: string[];
  recipes: string[];
  research: string[];
  vehicles: string[];
}

export class ProgressionSystem extends System {
  private readyNotified = false;
  private checkTimer = 0;

  override onLoad(): void {
    // Saves from older balance passes: never leave the radius below the tier's radius.
    const c = this.game.state.colony;
    c.radius = Math.max(c.radius, this.game.data.tier(c.tier).colonyRadius);
    this.readyNotified = this.canTierUp();
  }

  override update(dt: number): void {
    this.checkTimer += dt;
    if (this.checkTimer < 1) return;
    this.checkTimer = 0;
    // Gentle nudge once when the next tier becomes reachable.
    const ready = this.canTierUp();
    if (ready && !this.readyNotified) {
      const t = this.game.data.tiers[this.tier() + 1];
      this.game.toast(`${t.name} tier is ready! Upgrade your Command Center.`, 'success', '⬆️');
    }
    this.readyNotified = ready;
  }

  tier(): number {
    return this.game.state.colony.tier;
  }

  /** Current tier definition. */
  tierDef(): TierDef {
    return this.game.data.tier(this.tier());
  }

  /** Definition of the next tier, or null at the final tier. */
  nextTierDef(): TierDef | null {
    return this.game.data.tiers[this.tier() + 1] ?? null;
  }

  /** Requirements for the next tier, or null at Titanium. */
  next(): TierUpRequirements | null {
    const t = this.nextTierDef();
    if (!t) return null;
    const research = t.research ?? null;
    return {
      tier: t.index,
      research,
      researchDone: research === null || this.game.state.research.completed.includes(research),
      cost: { ...t.upgradeCost },
      affordable: this.game.sys.economy.canAfford(t.upgradeCost),
    };
  }

  canTierUp(): boolean {
    const n = this.next();
    return !!n && n.researchDone && n.affordable;
  }

  /** Content that becomes available at a tier (buildings, recipes, research, vehicles). */
  unlocksAt(tier: number): TierUnlocks {
    const d = this.game.data;
    return {
      buildings: d.buildings.filter((b) => b.unlockTier === tier && !b.core).map((b) => b.id),
      recipes: d.recipes.filter((r) => r.unlockTier === tier).map((r) => r.id),
      research: d.research.filter((r) => r.tier === tier).map((r) => r.id),
      vehicles: d.vehicles.filter((v) => v.unlockTier === tier).map((v) => v.id),
    };
  }

  /** Pay, advance colony tier, expand radius, transform the core. */
  tierUp(): boolean {
    const g = this.game;
    const n = this.next();
    const t = this.nextTierDef();
    if (!n || !t) return false;
    if (!n.researchDone) {
      const r = n.research ? g.data.researchDef(n.research) : undefined;
      g.toast(`Research ${r?.name ?? n.research} first.`, 'info', r?.icon);
      g.bus.emit('sfx', { id: 'ui_error' });
      return false;
    }
    if (!g.sys.economy.spend(t.upgradeCost, `tier:${t.id}`)) return false;

    const colony = g.state.colony;
    colony.tier = t.index;
    colony.radius = Math.max(colony.radius, t.colonyRadius);
    this.readyNotified = this.canTierUp();
    g.sys.economy.markDirty();

    const final = t.index >= g.data.tiers.length - 1;
    const unlocked = this.unlocksAt(t.index);
    const count = unlocked.buildings.length + unlocked.recipes.length + unlocked.research.length + unlocked.vehicles.length;
    g.bus.emit('colony:tierUp', { tier: t.index });
    g.bus.emit('colony:expanded', { radius: colony.radius });
    g.bus.emit('ui:celebrate', {
      title: final ? `${t.name.toUpperCase()} TIER REACHED!` : `${t.name} Tier Reached!`,
      text: final
        ? `${t.description} You built all of this.`
        : `${t.description}${count ? ` ${count} new unlocks — the colony expands!` : ' The colony expands!'}`,
      icon: final ? '🌟' : '⬆️',
    });
    g.bus.emit('sfx', { id: 'tier_up' });
    if (final) g.bus.emit('fx:shake', { strength: 0.6 });
    return true;
  }
}
