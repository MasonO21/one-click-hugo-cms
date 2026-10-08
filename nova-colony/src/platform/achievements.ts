/**
 * Platform achievements adapter. The sim reports every unlock by its stable `ach_*` id (src/data/achievements.ts) to
 * `game.services.achievements`; today that is a no-op, so Game Center (iOS) and Google Play Games (Android) can be
 * plugged in later without touching the game: implement `AchievementsService`, map the ids (docs/MOBILE.md) and return
 * it from `createPlatformServices`.
 * OWNER: meta agent.
 */
import type { AchievementsService } from './types';

/** Reports nothing. Used on the web and until a store integration exists. */
export class NoopAchievements implements AchievementsService {
  readonly name = 'none';
  report(_id: string): void {}
}

/**
 * Records what it was told (tests, debugging). A real adapter would map `id` through a table like
 * `{ ach_lumberjack_bronze: '<Game Center id / Play Games id>' }` and call the native plugin.
 */
export class RecordingAchievements implements AchievementsService {
  readonly name = 'recording';
  readonly reported: string[] = [];
  report(id: string): void {
    this.reported.push(id);
  }
}
