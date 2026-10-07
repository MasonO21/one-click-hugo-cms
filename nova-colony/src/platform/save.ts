/**
 * SaveManager — autosave, local backups (rotating), versioned migrations, cloud sync and
 * account-recovery codes. OWNER: meta agent. (Placeholder: single local slot.)
 */
import type { Game } from '../core/Game';
import { deserializeState, serializeState, type GameState } from '../core/state';
import type { PlatformServices } from './types';

const KEY = 'nova_colony_save_v1';

export class SaveManager {
  constructor(private readonly services: PlatformServices) {}

  async load(): Promise<GameState | null> {
    const raw = await this.services.store.get(KEY);
    return raw ? deserializeState(raw) : null;
  }

  async save(game: Game, auto = true): Promise<void> {
    await this.services.store.set(KEY, serializeState(game.state));
    game.bus.emit('game:saved', { auto });
  }

  /** Hook autosave timers / lifecycle events. */
  attach(_game: Game): void {}
}
