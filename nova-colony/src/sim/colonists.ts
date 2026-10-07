/**
 * ColonistSystem — generation (names, looks, traits, specialties, rarity), recruitment board,
 * survivor rescue, housing/bed assignment, job auto-assignment, needs & happiness, skills,
 * and lightweight movement AI (walk to workplace, work, eat, sleep at night, shelter during attacks).
 *
 * OWNER: colonists agent. Writes state.colonists and game.derived.{housing, happiness}.
 */
import { System } from './System';
import type { Rarity } from '../data/schema';
import type { Colonist, Id } from '../core/state';

export interface HappinessFactor {
  label: string;
  value: number;
  ok: boolean;
}

export class ColonistSystem extends System {
  get(id: Id): Colonist | undefined {
    return this.game.state.colonists.list.find((c) => c.id === id);
  }

  all(): Colonist[] {
    return this.game.state.colonists.list;
  }

  /** Generate a colonist (not added to the colony). */
  generate(_rarity: Rarity): Colonist {
    throw new Error('not implemented');
  }

  /** Add a generated colonist to the colony at a world position (defaults to near the core). */
  add(_c: Colonist, _x?: number, _z?: number): Id {
    return -1;
  }

  /** Grant a new colonist of a rarity (rewards, packs). */
  grant(_rarity: Rarity): Id {
    return -1;
  }

  /** Free beds available. */
  freeBeds(): number {
    return 0;
  }

  /** Recruit candidate at index from the board. */
  recruit(_index: number): boolean {
    return false;
  }

  /** Refresh the candidate pool (free when timer elapsed, or via ad/nova). */
  refreshCandidates(_force: boolean): void {}

  /** Assign to a workplace (or null to unassign). */
  assign(_colonistId: Id, _buildingId: Id | null): boolean {
    return false;
  }

  /** Fill empty worker slots with idle colonists, preferring matching specialties. */
  autoAssign(): number {
    return 0;
  }

  happinessFactors(_c: Colonist): HappinessFactor[] {
    return [];
  }

  /** Productivity multiplier for a colonist at their workplace (>= 1 — cozy). */
  productivity(_c: Colonist): number {
    return 1;
  }
}
