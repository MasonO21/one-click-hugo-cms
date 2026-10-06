/**
 * Daily protein and calorie targets from a person's body weight and a few details they choose to give.
 *
 * Protein: grams per kilogram of body weight. The RDA for adults is 0.8 g/kg; sports nutrition guidance
 * (ACSM, ISSN) puts active people at 1.2-2.0 g/kg, about 1.6 g/kg for building muscle (Morton et al.
 * 2018), and higher while losing weight to keep muscle. Older adults are advised at least 1.0-1.2 g/kg
 * (PROT-AGE). Calories: the Mifflin-St Jeor equation times an activity factor, with a moderate
 * adjustment for the goal and never below a floor. These are general estimates for healthy adults, not
 * advice for pregnancy, children or medical conditions.
 */

export type Sex = 'female' | 'male' | 'unspecified';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active';
export type Goal = 'maintain' | 'lose' | 'gain' | 'muscle';
export type Units = 'metric' | 'imperial';

export interface Profile {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: Sex;
  activity: Activity;
  goal: Goal;
  units: Units;
}

export const NO_PROFILE: Profile = { weightKg: null, heightCm: null, age: null, sex: 'unspecified', activity: 'light', goal: 'maintain', units: 'metric' };

export interface Targets {
  /** Grams of protein a day. */
  protein: number;
  /** The sensible range around it, in grams. */
  proteinRange: [number, number];
  /** The grams per kilogram the target uses. */
  proteinPerKg: number;
  /** Calories a day, or null when height, age or an adult age is missing. */
  kcal: number | null;
  /** Why there is no calorie target, when there is none. */
  kcalMissing: string | null;
}

export const LIMITS = {
  weightKg: [30, 300],
  heightCm: [120, 230],
  age: [13, 100],
} as const;

export const ACTIVITY: Record<Activity, { label: string; hint: string; factor: number }> = {
  sedentary: { label: 'Mostly sitting', hint: 'Desk job, little exercise', factor: 1.2 },
  light: { label: 'Lightly active', hint: 'Walks, exercise 1-3 days a week', factor: 1.375 },
  moderate: { label: 'Active', hint: 'Exercise 3-5 days a week', factor: 1.55 },
  active: { label: 'Very active', hint: 'Hard exercise 6-7 days a week', factor: 1.725 },
  'very-active': { label: 'Athlete', hint: 'Training twice a day or a physical job', factor: 1.9 },
};

export const GOALS: Record<Goal, { label: string; perKg: number; range: [number, number]; kcalDelta: number }> = {
  maintain: { label: 'Stay healthy', perKg: 1.0, range: [0.8, 1.6], kcalDelta: 0 },
  lose: { label: 'Lose weight', perKg: 1.6, range: [1.2, 2.0], kcalDelta: -500 },
  gain: { label: 'Gain weight', perKg: 1.4, range: [1.2, 1.8], kcalDelta: 300 },
  muscle: { label: 'Build muscle', perKg: 1.6, range: [1.4, 2.0], kcalDelta: 250 },
};

/** Lowest calorie target the app will suggest. Below this, people should be guided by a professional. */
const KCAL_FLOOR: Record<Sex, number> = { female: 1200, male: 1500, unspecified: 1350 };

const within = (v: number | null, [lo, hi]: readonly [number, number]) => v !== null && Number.isFinite(v) && v >= lo && v <= hi;
const round5 = (n: number) => Math.round(n / 5) * 5;

/** Protein per kilogram for this person: the goal's figure, a little more when active or older. */
/** Above this a daily protein target stops being useful advice. */
const PROTEIN_CAP_G = 250;
const PROTEIN_RANGE_MAX_G = 300;

function proteinPerKg(p: Profile): number {
  let perKg = GOALS[p.goal].perKg;
  if (p.goal === 'maintain' && (p.activity === 'moderate' || p.activity === 'active' || p.activity === 'very-active')) perKg = 1.3;
  if (p.age !== null && p.age >= 65) perKg = Math.max(perKg, 1.2);
  return perKg;
}

/** Resting energy (Mifflin-St Jeor). Without a sex, the average of the two equations. */
export function restingKcal(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return base + (sex === 'male' ? 5 : sex === 'female' ? -161 : -78);
}

/** Targets for a profile, or null without a usable weight. */
export function targetsFor(p: Profile): Targets | null {
  if (!within(p.weightKg, LIMITS.weightKg)) return null;
  const weight = p.weightKg!;
  const [lo, hi] = GOALS[p.goal].range;
  const uncapped = round5(weight * proteinPerKg(p));
  const protein = Math.min(PROTEIN_CAP_G, uncapped);
  // At a very high weight the target is capped, so the per-kg figure and the range follow the cap:
  // the range always holds the target, and never runs backwards.
  const perKg = protein < uncapped ? Math.round((protein / weight) * 10) / 10 : proteinPerKg(p);
  const low = Math.min(protein, round5(weight * Math.min(lo, perKg)));
  const high = Math.max(protein, Math.min(PROTEIN_RANGE_MAX_G, round5(weight * Math.max(hi, perKg))));
  const proteinRange: [number, number] = [low, high];

  let kcal: number | null = null;
  let kcalMissing: string | null = null;
  if (!within(p.heightCm, LIMITS.heightCm) || !within(p.age, LIMITS.age)) {
    kcalMissing = 'Add your height and age for a calorie target.';
  } else if (p.age! < 18) {
    kcalMissing = 'Calorie targets are for adults. Ask a doctor or dietitian what suits you.';
  } else {
    const rest = restingKcal(weight, p.heightCm!, p.age!, p.sex);
    const daily = rest * ACTIVITY[p.activity].factor + GOALS[p.goal].kcalDelta;
    // Eating below resting energy, or below the floor, is not something an app should suggest.
    const floor = Math.max(KCAL_FLOOR[p.sex], p.goal === 'lose' ? rest : 0);
    kcal = Math.round(Math.max(daily, floor) / 10) * 10;
  }
  return { protein, proteinRange, proteinPerKg: perKg, kcal, kcalMissing };
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { feet: Math.floor(total / 12), inches: total % 12 };
}
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * CM_PER_IN;

/** A typed number ("72", "72.5", "72,5"), or null when it is not one. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  // "3.49", ".99" and "3." are all numbers people type.
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "72 kg" or "159 lb", the way the person chose. */
export function formatWeight(kg: number, units: Units): string {
  return units === 'imperial' ? `${Math.round(kgToLb(kg))} lb` : `${Math.round(kg * 10) / 10} kg`;
}
