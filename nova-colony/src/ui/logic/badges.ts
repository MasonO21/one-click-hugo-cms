/** Notification badge computation for the HUD rail (claimable missions, free spin, research...). */
import type { Game } from '../../core/Game';
import { expeditionBadge } from './expeditions';

export interface Badges {
  missions: number;
  research: number;
  daily: boolean;
  spin: boolean;
  crate: boolean;
  season: number;
  /** Idle colonists that could take an open job. */
  colonists: number;
  /** Expedition hauls waiting to be collected + Star Chart milestones to claim. */
  expeditions: number;
}

export function claimableMissions(game: Game): string[] {
  const ms = game.sys.missions;
  return ms.active().filter((m) => ms.progress(m.id).done).map((m) => m.id);
}

/** Season rewards that can be claimed right now. */
export function claimableSeason(game: Game): number {
  const lo = game.state.liveops;
  const lvl = game.sys.liveops.seasonLevel();
  const levels = game.data.season.levels;
  let n = 0;
  for (let l = 1; l <= Math.min(lvl, levels.length); l++) {
    if (!lo.season.claimedFree.includes(l)) n++;
    if (lo.season.premium && !lo.season.claimedPremium.includes(l)) n++;
  }
  return n;
}

/** Idle colonists that could be put to work in a building with a free slot. */
export function idleWithJobs(game: Game): number {
  const idle = game.state.colonists.list.filter((c) => c.workplace == null && !c.away).length;
  if (!idle) return 0;
  let slots = 0;
  for (const b of game.state.buildings.list) {
    if (b.status === 'building') continue;
    const w = game.data.building(b.def)?.workers;
    if (w) slots += Math.max(0, w.slots - b.workers.length);
  }
  return Math.min(idle, slots);
}

export function computeBadges(game: Game): Badges {
  const rs = game.sys.research;
  const lo = game.sys.liveops;
  return {
    missions: claimableMissions(game).length,
    research: rs.available().filter((r) => rs.canResearch(r.id)).length,
    // meta offers stay out of the way during the guided first session (see LiveOpsSystem.offersUnlocked)
    daily: lo.dailyAvailable() && lo.offersUnlocked(),
    spin: lo.canSpinFree() && lo.offersUnlocked(),
    crate: lo.freeCrateReady() && lo.offersUnlocked(),
    season: claimableSeason(game),
    colonists: idleWithJobs(game),
    expeditions: expeditionBadge(game),
  };
}
