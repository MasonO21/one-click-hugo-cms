/**
 * What kept going while the player was away, for the Welcome Back card. Production slows to an easy pace after the
 * first minutes away (balance.offlineEfficiency), but the colony's absolute clocks did not: survivors answer the radio,
 * squads walk home, caches fill up again. Saying so keeps a modest haul from reading as an idle colony.
 *
 * Also the longer waits of the four-week economy, said kindly where they show: the recruitment board's next survivor
 * (days apart from Alloy on) and the tier-up card's goals, which outgrow the stores a tier starts with.
 */
import type { Game } from '../../core/Game';
import { fmt } from '../../core/format';

export interface AwayNews {
  /** Survivors waiting at a working recruitment board. */
  survivors: number;
  /** Squads home (or due) with a haul to collect. */
  squads: number;
  /** Restocking caches that were opened before and are full again. */
  caches: number;
}

export function awayNews(game: Game): AwayNews {
  const { colonists, expeditions, world } = game.sys;
  const survivors = colonists.boardAvailable() ? game.state.colonists.candidates.length : 0;
  let squads = 0;
  for (const e of expeditions.list()) if (expeditions.secondsLeft(e) <= 0) squads++;
  let caches = 0;
  for (const id in game.state.world.pois) if (world.poiRestocked(id)) caches++;
  return { survivors, squads, caches };
}

/** "Waiting for you: 2 survivors at the board · a squad home with its haul · 6 caches restocked", or null. */
export function awayNewsText(n: AwayNews): string | null {
  const parts: string[] = [];
  if (n.survivors > 0) parts.push(n.survivors === 1 ? 'a survivor at the board' : `${n.survivors} survivors at the board`);
  if (n.squads > 0) parts.push(n.squads === 1 ? 'a squad home with its haul' : `${n.squads} squads home with hauls`);
  if (n.caches > 0) parts.push(n.caches === 1 ? 'a cache restocked' : `${n.caches} caches restocked`);
  return parts.length ? `Waiting for you: ${parts.join(' · ')}` : null;
}

/**
 * The board's countdown: "12:41" or "3:05:10" under a day, "1d 4h" under two days, then whole days ("7 days": a
 * week-long wait counted to the second is clock-watching, not anticipation). "Board full" with every seat taken.
 */
export function recruitCountdownText(seconds: number | null, hms: (s: number) => string): string {
  if (seconds == null) return 'Board full';
  if (seconds <= 0) return 'Any moment';
  if (seconds < 86400) return hms(seconds);
  if (seconds < 2 * 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  return `${Math.round(seconds / 86400)} days`;
}

/** An empty seat waits at least this long before the board points to the other ways survivors arrive. */
export const LONG_RECRUIT_WAIT_S = 3600;

/** The recruitment board's note for a long wait (null for a short one or a full board). */
export function recruitWaitNote(secondsToNext: number | null): string | null {
  if (secondsToNext == null || !(secondsToNext > LONG_RECRUIT_WAIT_S)) return null;
  return '📻 Survivors are few and far between out here. They also turn up in daily supplies, region surveys, rescue camps and caches.';
}

/**
 * Tier-up resources that do not fit in storage yet ("Your stores hold 100 Iron and 80 Steel: build or upgrade
 * storage to fit the next tier."), or null when every goal fits.
 */
export function tierRoomNote(game: Game, cost: Readonly<Record<string, number | undefined>>): string | null {
  const eco = game.sys.economy;
  const short: string[] = [];
  for (const [id, need] of Object.entries(cost)) {
    if (!need || !(need > 0)) continue;
    const cap = eco.capacity(id);
    if (cap > 0 && cap < need) short.push(`${fmt(cap)} ${game.data.resource(id)?.name ?? id}`);
  }
  if (!short.length) return null;
  const top = short.slice(0, 3);
  const list = top.length === 1 ? top[0] : `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}`;
  return `📦 Your stores hold ${list}: build or upgrade storage to fit the next tier.`;
}
