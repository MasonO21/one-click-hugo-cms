/**
 * Pure Colony Spirit rules (no state mutation): how fast the meter fills, whether a festival is running and what it
 * is worth. Shared by the SpiritSystem (sim/colony/spirit.ts), the modifier table, the HUD chip and the tests.
 * Content and the reasoning behind the numbers: data/spirit.ts.
 */
import type { GameState } from '../../core/state';
import { SPIRIT_RULES, type SpiritRules } from '../../data/spirit';

/** What the fill rate is made of (the HUD popover shows it). */
export interface SpiritInputs {
  /** Average colony happiness 0..100. */
  happiness: number;
  /** Decor + entertainment points per colonist (Layout comfort + entertainment ÷ colonists). */
  amenity: number;
  /** Medical points in the colony (Layout medical). */
  medical: number;
  /** Friendship hearts across the colony. */
  hearts: number;
}

export interface SpiritRate {
  /** Meter points per online minute. */
  perMinute: number;
  /** 0..1: how far above the threshold happiness is. */
  excess: number;
  /** Boosts (0.2 = +20%). */
  amenity: number;
  medical: number;
  friendship: number;
}

const clamp01 = (v: number): number => (v > 0 ? (v < 1 ? v : 1) : 0);
const num = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/** Meter points per online minute for a colony (0 while happiness is at or below the threshold). */
export function spiritRate(inp: SpiritInputs, r: SpiritRules = SPIRIT_RULES): SpiritRate {
  const excess = clamp01((num(inp.happiness) - r.threshold) / (100 - r.threshold));
  const amenity = Math.min(r.amenityMax, num(inp.amenity) * r.amenityPerPoint);
  const medical = Math.min(r.medicalMax, num(inp.medical) * r.medicalPerPoint);
  const friendship = Math.min(r.heartsMax, num(inp.hearts) * r.perHeart);
  return { perMinute: r.perMinute * excess * (1 + amenity + medical + friendship), excess, amenity, medical, friendship };
}

/** Is a festival running right now (online play time)? */
export function festivalActive(state: Pick<GameState, 'spirit' | 'playTime'>): boolean {
  const s = state.spirit;
  return !!s && s.festivalUntil > state.playTime;
}

/** Online seconds left in the current festival (0 when none). */
export function festivalLeft(state: Pick<GameState, 'spirit' | 'playTime'>): number {
  return festivalActive(state) ? state.spirit.festivalUntil - state.playTime : 0;
}

/** The production multiplier a running festival gives (1 when none). */
export function festivalProductionMult(state: Pick<GameState, 'spirit' | 'playTime'>, r: SpiritRules = SPIRIT_RULES): number {
  return festivalActive(state) ? r.festival.production : 1;
}

/** Meter share 0..1. */
export function spiritShare(state: Pick<GameState, 'spirit'>, r: SpiritRules = SPIRIT_RULES): number {
  const m = state.spirit?.meter ?? 0;
  return clamp01(m / r.full);
}

/** Online minutes until the meter is full at `perMinute` (Infinity when it is not filling). */
export function minutesToFull(meter: number, perMinute: number, r: SpiritRules = SPIRIT_RULES): number {
  const left = Math.max(0, r.full - meter);
  if (left <= 0) return 0;
  return perMinute > 1e-9 ? left / perMinute : Infinity;
}
