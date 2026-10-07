/**
 * CombatSystem — invasion schedule (peace -> warning 2:00 -> attack -> victory chest), wave
 * composition from InvasionDef, alien spawning (edge / burrow / queen spawns), flow-field pathing to
 * the core, alien attacks on buildings & player, turrets/traps/shields/repair, projectiles, player
 * weapon auto-fire, kill drops, victory rewards (double via rewarded ad).
 *
 * Cozy rules: buildings are never destroyed (0 hp => 'damaged', auto-repaired for free afterwards);
 * if aliens overwhelm the core, the attack simply ends with a smaller chest.
 *
 * OWNER: combat agent. Writes state.combat.
 */
import { System } from './System';

export class CombatSystem extends System {
  /** Seconds until the next attack (warning included), or Infinity. */
  secondsToAttack(): number {
    return Infinity;
  }

  /** Schedule an attack: warning begins after `delay` seconds and lasts `warning` seconds. */
  schedule(_delay: number, _warning: number): void {}

  /** Skip the remaining warning and start immediately (small bonus reward). */
  startNow(): void {}

  /** Claim the pending victory chest (doubled = rewarded ad watched). */
  claimReward(_doubled: boolean): boolean {
    return false;
  }

  /**
   * Spawn "wild" aliens outside of invasions (alien nests, world events). They chase the player within a
   * leash radius and never path to the colony. Returns spawned ids.
   */
  spawnWild(_alienId: string, _count: number, _x: number, _z: number): number[] {
    return [];
  }

  /** Living wild aliens near a position (e.g. a nest is cleared when this reaches 0). */
  wildNear(_x: number, _z: number, _radius: number): number {
    return 0;
  }

  /** Rough defense strength for UI ("Defense rating"). */
  defenseRating(): number {
    return 0;
  }

  /** Player weapon damage per second against aliens nearby (for UI). */
  playerDps(): number {
    return 0;
  }
}
