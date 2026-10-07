/**
 * Analytics hooks: subscribes to the game bus and reports the product questions the spec cares about
 * (§39) through `game.services.analytics`:
 *
 *   tutorial completion   tutorial_step / tutorial_complete        (main-chain missions)
 *   session duration      session_start / session_end
 *   retention             retention_day                            (calendar days since install)
 *   tech progression      tier_up (+ time-to-tier), research_done
 *   building usage        building_usage                           (aggregated, flushed every 5 min / on pause)
 *   ad engagement         ad_started / ad_rewarded / ad_failed
 *   purchase funnel       shop_opened -> iap_purchased / iap_failed
 *   quit points           quit_point                               (current main mission when the app is paused)
 *   slow progression      progression_stall                        (no mission completed for 10 min of play)
 *
 * Events carry game facts only (no PII). Consent is read from `settings.analytics` every second, so
 * toggling it in Settings takes effect immediately. OWNER: meta agent.
 */
import type { Game } from '../core/Game';
import type { GameEvents } from '../core/events';
import { dateKey } from '../core/format';
import { onBackground, onForeground } from './lifecycle';

/** Seconds of play without a completed mission before `progression_stall` fires. */
export const STALL_SECONDS = 600;
const BUILDING_FLUSH_SECONDS = 300;
const RETENTION_KEY = 'nova_analytics_last_retention_day';

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Whole calendar days between two epoch timestamps in local time (install day = 0). */
export function daysBetween(fromMs: number, toMs: number): number {
  const a = dateKey(fromMs).split('-').map(Number);
  const b = dateKey(toMs).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000);
}

export function installAnalyticsHooks(game: Game): () => void {
  const a = game.services.analytics;
  const offs: Array<() => void> = [];
  const on = <K extends keyof GameEvents>(type: K, fn: (p: GameEvents[K]) => void) => {
    offs.push(game.bus.on(type, fn));
  };
  const st = () => game.state;

  // ---- consent follows the in-game setting
  let consent: boolean | null = null;
  const syncConsent = () => {
    const v = !!st().settings.analytics;
    if (v !== consent) {
      consent = v;
      a.setConsent(v);
    }
  };
  syncConsent();

  const buildingCounts = new Map<string, number>();
  let lastMissionPlay = st().playTime;
  let lastBuildingFlush = st().playTime;

  // ---- sessions & retention
  let sessionStartedAt = game.now();
  let sessionStartPlay = st().playTime;
  let backgroundedAt = 0;
  let sessionOpen = false;
  const startSession = (resumed: boolean) => {
    sessionOpen = true;
    sessionStartedAt = game.now();
    sessionStartPlay = st().playTime;
    a.track('session_start', {
      session_no: st().stats.sessions,
      resumed,
      fresh: game.fresh,
      platform: game.services.platform,
      retention_day: daysBetween(st().createdAt, game.now()),
      tier: st().colony.tier,
    });
  };
  const flushBuildings = () => {
    for (const [def, count] of buildingCounts) a.track('building_usage', { def, count });
    buildingCounts.clear();
  };
  const endSession = () => {
    if (!sessionOpen) return;
    sessionOpen = false;
    flushBuildings();
    const cur = game.sys.missions.current();
    const prog = cur ? game.sys.missions.progress(cur.id) : null;
    a.track('quit_point', {
      mission: cur?.id ?? 'none',
      mission_pct: prog ? Math.round((prog.value / Math.max(1, prog.target)) * 100) : 100,
      tier: st().colony.tier,
      play_time_s: Math.round(st().playTime),
      tutorial_done: st().tutorial.done,
    });
    a.track('session_end', {
      duration_s: Math.round(st().playTime - sessionStartPlay),
      wall_s: Math.round((game.now() - sessionStartedAt) / 1000),
      play_time_s: Math.round(st().playTime),
    });
    void a.flush();
  };

  startSession(false);
  const day = daysBetween(st().createdAt, game.now());
  if (day > 0) {
    // one retention_day event per distinct day since install (remembered across launches)
    void game.services.store
      .get(RETENTION_KEY)
      .then((last) => {
        if (Number(last ?? '-1') < day) {
          a.track('retention_day', { day, d1: day === 1, d7: day === 7, d30: day === 30 });
          return game.services.store.set(RETENTION_KEY, String(day));
        }
      })
      .catch(() => {});
  }
  offs.push(onBackground(() => {
    if (!sessionOpen) return;
    backgroundedAt = game.now();
    endSession();
  }));
  offs.push(onForeground(() => {
    if (sessionOpen || backgroundedAt === 0) return;
    a.track('app_resumed', { gap_s: Math.round((game.now() - backgroundedAt) / 1000) });
    startSession(true);
  }));

  // ---- tutorial & missions
  let tutorialReported = st().tutorial.done;
  on('mission:claimed', ({ id }) => {
    lastMissionPlay = st().playTime;
    const def = game.data.mission(id);
    if (!def) return;
    if (def.chain === 'main') {
      const step = st().missions.completed.filter((c) => game.data.mission(c)?.chain === 'main').length;
      a.track('tutorial_step', { mission: id, step, play_time_s: Math.round(st().playTime), session_s: Math.round(st().playTime - sessionStartPlay) });
      if (st().tutorial.done && !tutorialReported) {
        tutorialReported = true;
        a.track('tutorial_complete', { play_time_s: Math.round(st().playTime), steps: step });
      }
    } else {
      a.track('mission_claimed', { mission: id, chain: def.chain });
    }
  });

  // ---- progression stall (no mission completed for 10 minutes of play)
  on('mission:completed', () => {
    lastMissionPlay = st().playTime;
  });
  on('tick:second', ({ playTime }) => {
    syncConsent();
    if (playTime - lastMissionPlay >= STALL_SECONDS) {
      lastMissionPlay = playTime; // report again after another 10 minutes of the same stall
      const cur = game.sys.missions.current();
      a.track('progression_stall', { mission: cur?.id ?? 'none', minutes: Math.round(STALL_SECONDS / 60), tier: st().colony.tier, play_time_s: Math.round(playTime) });
    }
    if (playTime - lastBuildingFlush >= BUILDING_FLUSH_SECONDS) {
      lastBuildingFlush = playTime;
      flushBuildings();
    }
  });

  // ---- tech progression
  let lastTierPlay = 0;
  on('colony:tierUp', ({ tier }) => {
    const now = st().playTime;
    a.track('tier_up', { tier, play_time_s: Math.round(now), since_prev_s: Math.round(now - lastTierPlay) });
    lastTierPlay = now;
  });
  on('research:completed', ({ id }) => a.track('research_done', { id, tier: st().colony.tier, play_time_s: Math.round(st().playTime) }));

  // ---- building usage (aggregated)
  on('building:completed', ({ def }) => buildingCounts.set(def, (buildingCounts.get(def) ?? 0) + 1));

  // ---- exploration & combat milestones
  on('world:regionDiscovered', ({ id }) => a.track('region_discovered', { id, play_time_s: Math.round(st().playTime) }));
  on('combat:ended', ({ wave, kills }) => a.track('wave_won', { wave, kills, tier: st().colony.tier }));

  // ---- ads
  on('ad:started', ({ placement }) => a.track('ad_started', { placement }));
  on('ad:rewarded', ({ placement }) => a.track('ad_rewarded', { placement, total: st().liveops.ads.total }));
  on('ad:failed', ({ placement }) => a.track('ad_failed', { placement }));
  on('offline:claimed', ({ doubled }) => a.track('offline_claimed', { doubled }));

  // ---- purchase funnel
  on('ui:open', ({ panel }) => {
    if (panel === 'shop') a.track('shop_opened', { tier: st().colony.tier, tutorial_done: st().tutorial.done });
  });
  on('iap:purchased', ({ product }) => a.track('iap_purchased', { product, purchases: st().stats.purchases }));
  on('iap:failed', ({ product, reason }) => a.track('iap_failed', { product, reason: reason.slice(0, 40) }));

  // ---- retention features
  on('daily:claimed', ({ day: d }) => a.track('daily_claimed', { day: d, streak: st().liveops.daily.streak }));
  on('season:levelUp', ({ level }) => a.track('season_level', { level }));

  return () => {
    offs.forEach((f) => f());
  };
}
