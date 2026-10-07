/**
 * CraftingSystem — manual crafting queue at stations, automated factories (BuildingDef.factory with a
 * selected recipe), instant-finish via ad/nova.
 *
 * OWNER: economy agent. Writes state.crafting. Item inventory lives in state.player.items and is
 * modified through PlayerSystem.addItem().
 */
import { System } from './System';
import type { RecipeDef } from '../data/schema';
import type { Id } from '../core/state';

export class CraftingSystem extends System {
  /** Recipes unlocked (tier + research) for a station type ('hand', 'workbench', ...), or all. */
  recipes(_station?: string): RecipeDef[] {
    return [];
  }

  /** Station types currently available (built stations + 'hand'). */
  stations(): string[] {
    return ['hand'];
  }

  canCraft(_recipeId: string): { ok: boolean; reason?: string } {
    return { ok: false, reason: 'not implemented' };
  }

  /** Pay inputs and queue. Returns job id. */
  craft(_recipeId: string): Id | null {
    return null;
  }

  /** Complete a queued job immediately (rewarded ad or nova). */
  finishNow(_jobId: Id): boolean {
    return false;
  }

  /** Nova cost to finish a job now. */
  finishCost(_jobId: Id): number {
    return 0;
  }
}
