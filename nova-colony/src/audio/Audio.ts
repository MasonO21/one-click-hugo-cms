/**
 * AudioManager — procedural WebAudio SFX and adaptive ambient music (no audio files needed).
 * Listens to game.bus ('sfx' and gameplay events). Must be unlocked by a user gesture on mobile.
 *
 * OWNER: audio agent. (Placeholder.)
 */
import type { Game } from '../core/Game';

export class AudioManager {
  constructor(private readonly game: Game) {}
  init(): void {
    void this.game;
  }
  update(_dt: number): void {}
}
