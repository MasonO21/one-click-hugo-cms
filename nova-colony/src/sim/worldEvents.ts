/**
 * WorldEventSystem — random optional events (meteor crash, wreck, survivor rescue, alien nest,
 * supply drop, rare merchant, crystal storm, ancient structure) scheduled while online.
 *
 * OWNER: world agent. Writes state.world.events / nextEventAt.
 */
import { System } from './System';
import type { Id } from '../core/state';

export class WorldEventSystem extends System {
  /** Claim/visit an active event (player is near it, or merchant trade index). */
  claim(_eventId: Id, _tradeIndex?: number): boolean {
    return false;
  }

  /** Force-start a random event (debug / rewards). */
  trigger(_defId?: string): void {}
}
