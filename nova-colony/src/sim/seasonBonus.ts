/**
 * Season pass bonus levels: once the 50 levels are done, the premium track keeps paying. Every further
 * `season.bonus.xp` season XP earns `season.bonus.reward` (an Explorer’s Case), as often as the player keeps playing.
 *
 * State: `liveops.seasonBonus = { id, claimed }`, keyed by the season id, so a new season starts the count again
 * without any reset code. Older saves have no `seasonBonus` at all and simply read as "none claimed yet".
 * XP earned past level 50 before buying premium counts once premium is bought (like the rest of the premium track).
 */
import type { Game } from '../core/Game';
import type { SeasonDef } from '../data/schema';

declare module '../core/state' {
  interface LiveOpsState {
    /** Bonus chests claimed past the end of the season track (sim/seasonBonus.ts). */
    seasonBonus?: { id: string; claimed: number };
  }
}

/** XP at which the track ends and bonus levels start. */
export function seasonTrackXp(season: SeasonDef): number {
  return season.levels.length * season.xpPerLevel;
}

/** Bonus levels earned with `xp` season XP (premium or not). */
export function seasonBonusEarned(season: SeasonDef, xp: number): number {
  const b = season.bonus;
  if (!b || !(b.xp > 0)) return 0;
  const past = xp - seasonTrackXp(season);
  return past > 0 ? Math.floor(past / b.xp + 1e-9) : 0;
}

/** Bonus chests claimed this season. */
export function seasonBonusClaimed(game: Game): number {
  const sb = game.state.liveops.seasonBonus;
  return sb && sb.id === game.data.season.id && Number.isFinite(sb.claimed) ? Math.max(0, Math.floor(sb.claimed)) : 0;
}

/** Bonus chests waiting to be claimed (0 without the premium track). */
export function seasonBonusReady(game: Game): number {
  const s = game.state.liveops.season;
  if (!s.premium) return 0;
  return Math.max(0, seasonBonusEarned(game.data.season, s.xp) - seasonBonusClaimed(game));
}

export interface SeasonBonusView {
  /** The season defines bonus levels at all. */
  enabled: boolean;
  /** The 50 levels are done. */
  unlocked: boolean;
  premium: boolean;
  earned: number;
  claimed: number;
  ready: number;
  /** XP into the next bonus level, and the size of one. */
  xpInto: number;
  xpPer: number;
}

export function seasonBonusView(game: Game): SeasonBonusView {
  const season = game.data.season;
  const s = game.state.liveops.season;
  const per = season.bonus?.xp ?? 0;
  const past = s.xp - seasonTrackXp(season);
  const earned = seasonBonusEarned(season, s.xp);
  const claimed = seasonBonusClaimed(game);
  return {
    enabled: per > 0,
    unlocked: past >= 0,
    premium: s.premium,
    earned,
    claimed,
    ready: seasonBonusReady(game),
    xpInto: per > 0 && past > 0 ? past - earned * per : 0,
    xpPer: per,
  };
}

/** Claim every waiting bonus chest. Returns how many were granted. */
export function claimSeasonBonus(game: Game): number {
  const n = seasonBonusReady(game);
  const reward = game.data.season.bonus?.reward;
  if (n <= 0 || !reward) return 0;
  const lo = game.state.liveops;
  lo.seasonBonus = { id: game.data.season.id, claimed: seasonBonusClaimed(game) + n };
  for (let i = 0; i < n; i++) game.grant(reward, 'season');
  game.bus.emit('sfx', { id: 'reward' });
  return n;
}
