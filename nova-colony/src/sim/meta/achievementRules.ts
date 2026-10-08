/**
 * Pure achievement rules: how an AchievementSource reads the game. Progress is never counted here; it is read from
 * what the game already keeps: the mission system's lifetime counters ("type:target" in state.missions.counters)
 * and plain state (colony tier, colonists, research, the Star Chart, play time, the daily-gift streak).
 * OWNER: meta agent.
 */
import type { Game } from '../../core/Game';
import type { AchievementDef, AchievementMetric, AchievementSource, MissionType } from '../../data/schema';

/** Mission types MissionSystem keeps lifetime counters for (the counters an achievement may read). */
export const COUNTED_TYPES: ReadonlySet<MissionType> = new Set<MissionType>([
  'gather', 'build', 'upgrade', 'recruit', 'rescue', 'discover', 'kill', 'defend', 'craft', 'research', 'loot', 'equip', 'spin', 'expedition', 'wish',
  'photo',
]);

/** Every metric the reader below knows. */
export const METRICS: readonly AchievementMetric[] = [
  'playHours', 'colonyTier', 'colonists', 'legendary', 'regions', 'research', 'loginDays', 'charted', 'buildingTypes', 'alienTypes',
  'bestFriends',
];

/** Lifetime mission counter, e.g. counter(game, 'gather', 'wood'). */
export function counterValue(game: Game, type: MissionType, target = '*'): number {
  return game.state.missions.counters[`${type}:${target}`] ?? 0;
}

/** Different building types ever built: lifetime build counters, plus anything standing (older saves). */
function buildingTypes(game: Game): number {
  const seen = new Set<string>();
  for (const b of game.state.buildings.list) if (b.status !== 'building') seen.add(b.def);
  for (const d of game.data.buildings) if (counterValue(game, 'build', d.id) > 0) seen.add(d.id);
  return seen.size;
}

/** Different alien types ever defeated (lifetime kill counters per alien id). */
function alienTypes(game: Game): number {
  let n = 0;
  for (const a of game.data.aliens) if (counterValue(game, 'kill', a.id) > 0) n++;
  return n;
}

export function metricValue(game: Game, m: AchievementMetric): number {
  const s = game.state;
  switch (m) {
    case 'playHours':
      return s.playTime / 3600;
    case 'colonyTier':
      return s.colony.tier;
    case 'colonists':
      return s.colonists.list.length;
    case 'legendary': {
      let n = 0;
      for (const c of s.colonists.list) if (c.rarity === 'legendary') n++;
      return n;
    }
    case 'regions':
      return s.world.regionsDiscovered.length;
    case 'research':
      return s.research.completed.length;
    case 'loginDays':
      return s.liveops.daily.streak;
    case 'charted':
      return s.expeditions.frontier.charted.length;
    case 'buildingTypes':
      return buildingTypes(game);
    case 'alienTypes':
      return alienTypes(game);
    case 'bestFriends': {
      let n = 0;
      for (const c of s.colonists.list) if (game.sys.wishes.bestFriends(c.id)) n++;
      return n;
    }
    default:
      return 0;
  }
}

/** Current value of a source (not capped at the target). */
export function sourceValue(game: Game, src: AchievementSource): number {
  const v = src.kind === 'counter' ? counterValue(game, src.type, src.target) : metricValue(game, src.metric);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Key two achievements share when they read the same number (a line's three medals). */
export function sourceKey(src: AchievementSource): string {
  return src.kind === 'counter' ? `${src.type}:${src.target}` : `metric:${src.metric}`;
}

export function isReached(value: number, def: Pick<AchievementDef, 'target'>): boolean {
  return value + 1e-9 >= def.target;
}
