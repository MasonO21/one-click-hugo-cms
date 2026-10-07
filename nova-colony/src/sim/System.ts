import type { Game } from '../core/Game';

/**
 * Base class for simulation systems. Lifecycle:
 *   constructor(game)  -> all systems constructed
 *   init()             -> subscribe to bus events (other systems exist now)
 *   onLoad(fresh)      -> state is loaded/created; rebuild caches, seed fresh-game content
 *   update(dt)         -> every frame, dt in seconds (clamped to <= 0.25), in Game.order
 *
 * Systems must be headless (no DOM / three.js) so they run in unit tests.
 */
export abstract class System {
  constructor(protected readonly game: Game) {}
  init(): void {}
  onLoad(_fresh: boolean): void {}
  update(_dt: number): void {}
}
