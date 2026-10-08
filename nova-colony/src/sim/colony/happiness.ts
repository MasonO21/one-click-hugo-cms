/**
 * Happiness & productivity. Cozy rules: every factor is a BONUS (a missing factor just means "not yet");
 * nobody ever leaves, and productivity is never below 1.
 *
 * target = base + bed + food + water + power + comfort + cozy room + entertainment + safety + medical + trait
 */
import type { Game } from '../../core/Game';
import type { Colonist } from '../../core/state';
import { ANCHOR_IDS } from '../../data/schema';
import { clamp } from '../../core/math';
import type { Layout } from './layout';
import type { HappinessFactor } from './types';
import { friendHappiness, friendProductivity, wishMood } from '../wish/rules';

/** Extra happiness for sleeping in an enclosed, roofed room (not part of BalanceDef). */
export const ROOF_BONUS = 4;

/** Colony-wide snapshot used by every colonist's happiness target (computed once per second). */
export interface Mood {
  n: number;
  food: boolean;
  water: boolean;
  power: boolean;
  /** Final (already capped) contributions. */
  comfort: number;
  entertainment: number;
  medical: number;
  safety: boolean;
  /** EconomySystem.modifier('happiness'). */
  mult: number;
}

export function emptyMood(): Mood {
  return { n: 0, food: true, water: true, power: true, comfort: 0, entertainment: 0, medical: 0, safety: false, mult: 1 };
}

/** Is a resource plentiful enough? Uses EconomySystem.isShort when the economy provides it. */
function supplied(game: Game, id: string): boolean {
  const eco = game.sys.economy as unknown as { isShort?: (id: string) => boolean };
  if (typeof eco.isShort === 'function') return !eco.isShort(id);
  return game.sys.economy.amount(id) > 0;
}

export function computeMood(game: Game, layout: Layout): Mood {
  const h = game.data.balance.happiness;
  const n = Math.max(1, game.state.colonists.list.length);
  const p = game.derived.power;
  return {
    n,
    food: supplied(game, ANCHOR_IDS.food),
    water: supplied(game, ANCHOR_IDS.water),
    power: p.consumed <= 0 || p.ratio >= 1,
    comfort: Math.min(h.comfortMax, (h.comfortPerPoint * layout.comfort) / n),
    entertainment: Math.min(h.entertainmentMax, (h.entertainmentPerPoint * layout.entertainment) / n),
    medical: Math.min(h.medical * 3, h.medical * layout.medical),
    safety: layout.turrets > 0,
    mult: Math.max(0.5, game.sys.economy.modifier('happiness')),
  };
}

/** Breakdown shown in the colonist panel: what each source currently contributes. */
export function happinessFactors(game: Game, layout: Layout, mood: Mood, c: Colonist): HappinessFactor[] {
  const h = game.data.balance.happiness;
  const out: HappinessFactor[] = [];
  const add = (label: string, value: number, ok = value > 0) => out.push({ label, value, ok });
  add('Cozy start', h.base, true);
  add('Has a bed', c.bed != null ? h.bed : 0);
  add('Well fed', mood.food ? h.food : 0);
  add('Fresh water', mood.water ? h.water : 0);
  add('Power on', mood.power ? h.power : 0);
  add('Comfort', mood.comfort);
  const home = c.bed != null ? layout.byId.get(c.bed) : undefined;
  add('Cozy room', home?.roofed ? ROOF_BONUS : 0);
  add('Entertainment', mood.entertainment);
  add('Feels safe', mood.safety ? h.safety : 0);
  add('Medical care', mood.medical);
  const trait = game.data.trait(c.trait);
  if (trait?.happiness) add(trait.name, trait.happiness, trait.happiness > 0);
  const trip = tripMood(game, c);
  if (trip) add(trip > 0 ? 'Great adventure!' : 'Travel-weary', trip, trip > 0);
  const wish = wishMood(game, c);
  if (wish) add('Wish granted!', wish, true);
  const friend = friendHappiness(game, c);
  if (friend) add('Best friends', friend, true);
  if (mood.mult > 1.001) {
    const sum = out.reduce((s, f) => s + f.value, 0);
    add('Colony bonus', sum * (mood.mult - 1));
  }
  return out;
}

/** Happiness the colonist is drifting toward (0..100). */
export function happinessTarget(game: Game, layout: Layout, mood: Mood, c: Colonist): number {
  const h = game.data.balance.happiness;
  const trait = game.data.trait(c.trait);
  const home = c.bed != null ? layout.byId.get(c.bed) : undefined;
  const sum =
    h.base +
    (c.bed != null ? h.bed : 0) +
    (mood.food ? h.food : 0) +
    (mood.water ? h.water : 0) +
    (mood.power ? h.power : 0) +
    mood.comfort +
    (home?.roofed ? ROOF_BONUS : 0) +
    mood.entertainment +
    (mood.safety ? h.safety : 0) +
    mood.medical +
    (trait?.happiness ?? 0) +
    tripMood(game, c) +
    wishMood(game, c) +
    friendHappiness(game, c);
  return clamp(sum * mood.mult, 0, 100);
}

/** Mood a colonist brought home from an expedition (0 once it has worn off). */
export function tripMood(game: Game, c: Colonist): number {
  const t = c.trip;
  return t && Number.isFinite(t.mood) && game.now() < t.until ? t.mood : 0;
}

/**
 * Productivity multiplier at the colonist's workplace (>= 1):
 * (1 + specialtyMatch + (skill-1) x perLevel + trait) x (1 + max(0, happiness - 50) / 100)
 */
export function productivityOf(game: Game, layout: Layout, c: Colonist): number {
  const b = game.data.balance;
  const job = c.workplace != null ? layout.byId.get(c.workplace)?.def.workers?.job : undefined;
  const trait = game.data.trait(c.trait);
  const skill = 1 + (job && job === c.specialty ? b.specialtyBonus : 0) + (c.skill - 1) * b.skillBonusPerLevel + (trait?.productivity ?? 0);
  // friendship: from three hearts the colonist works a little harder (sim/wishes.ts)
  return Math.max(1, skill * (1 + Math.max(0, c.happiness - 50) / 100) * (1 + friendProductivity(game, c)));
}
