/**
 * ProgressionSystem — colony tier advancement (Wood -> ... -> Titanium) by upgrading the core,
 * colony radius expansion, and tier-unlock bookkeeping.
 *
 * OWNER: economy agent. Writes state.colony.
 */
import { System } from './System';
import type { ResourceBag } from '../data/schema';

export interface TierUpRequirements {
  tier: number;
  research: string | null;
  researchDone: boolean;
  cost: ResourceBag;
  affordable: boolean;
}

export class ProgressionSystem extends System {
  tier(): number {
    return this.game.state.colony.tier;
  }

  /** Requirements for the next tier, or null at Titanium. */
  next(): TierUpRequirements | null {
    return null;
  }

  canTierUp(): boolean {
    return false;
  }

  /** Pay, advance colony tier, expand radius, transform the core. */
  tierUp(): boolean {
    return false;
  }
}
