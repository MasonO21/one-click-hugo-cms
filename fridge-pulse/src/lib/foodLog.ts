import { addDays, todayISO } from './dates';
import type { FoodNutrition, MacroValues } from './nutrition';
import type { Meal } from './types';

/** One thing eaten, with its figures for a single serving. */
export interface LogEntry {
  id: string;
  /** Local calendar day it was eaten, YYYY-MM-DD. */
  day: string;
  /** When it was logged (ms since epoch). */
  at: number;
  title: string;
  /** A cooked meal idea, a portion of a tracked food, or figures typed in. */
  kind: 'meal' | 'food' | 'quick';
  /** What one serving is: "1 serving", "1 medium (118 g)". */
  portion: string;
  /** How many servings were eaten (halves allowed). */
  servings: number;
  perServing: MacroValues;
  /** Samples written to Apple Health / Health Connect for this entry, so they can be removed with it. */
  healthIds?: string[];
}

export type NewEntry = Omit<LogEntry, 'id' | 'day' | 'at'> & { day?: string; at?: number };

/** How long the log keeps entries: enough for monthly views and the weekly score. */
export const LOG_HISTORY_DAYS = 90;
export const MAX_SERVINGS = 20;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function clampServings(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SERVINGS, Math.max(0.5, Math.round(n * 2) / 2));
}

/** An entry's figures for everything eaten: one serving times the servings. */
export function entryTotals(e: Pick<LogEntry, 'perServing' | 'servings'>): MacroValues {
  const k = e.servings;
  return { kcal: Math.round(e.perServing.kcal * k), protein: round1(e.perServing.protein * k), carbs: round1(e.perServing.carbs * k), fat: round1(e.perServing.fat * k) };
}

export interface DayTotals extends MacroValues {
  entries: number;
}

/** Everything logged on a day, added up. */
export function dayTotals(entries: LogEntry[], day: string): DayTotals {
  const t: DayTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, entries: 0 };
  for (const e of entries) {
    if (e.day !== day) continue;
    const m = entryTotals(e);
    t.kcal += m.kcal;
    t.protein += m.protein;
    t.carbs += m.carbs;
    t.fat += m.fat;
    t.entries += 1;
  }
  return { ...t, protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

/** The last `n` days ending today, oldest first. */
export function lastDays(n: number, today: string = todayISO()): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/** A cooked meal idea, one serving by default. Null when the meal has no figures. */
export function entryFromMeal(meal: Pick<Meal, 'title' | 'nutrition'>, servings = 1): NewEntry | null {
  const n = meal.nutrition;
  if (!n) return null;
  return { title: meal.title, kind: 'meal', portion: '1 serving', servings: clampServings(servings), perServing: { kcal: n.kcal, protein: n.protein, carbs: n.carbs, fat: n.fat } };
}

/** A typical portion of a food with USDA figures. */
export function entryFromFood(name: string, n: FoodNutrition, servings = 1): NewEntry {
  const f = n.portion.grams / 100;
  return {
    title: name,
    kind: 'food',
    portion: `${n.portion.label} (${n.portion.grams} g)`,
    servings: clampServings(servings),
    perServing: { kcal: Math.round(n.per100g.kcal * f), protein: round1(n.per100g.protein * f), carbs: round1(n.per100g.carbs * f), fat: round1(n.per100g.fat * f) },
  };
}

/** Figures typed in by hand, checked so a slip of the finger cannot log 50,000 kcal. */
export function quickEntry(title: string, raw: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null }): NewEntry | null {
  const name = title.trim().replace(/\s+/g, ' ').slice(0, 60);
  const ok = (v: number | null, max: number) => v === null || (Number.isFinite(v) && v >= 0 && v <= max);
  if (!ok(raw.kcal, 5000) || !ok(raw.protein, 300) || !ok(raw.carbs, 600) || !ok(raw.fat, 300)) return null;
  const protein = raw.protein ?? 0;
  const carbs = raw.carbs ?? 0;
  const fat = raw.fat ?? 0;
  const kcal = raw.kcal ?? Math.round(protein * 4 + carbs * 4 + fat * 9);
  if (kcal <= 0 && protein <= 0) return null;
  return { title: name || 'Quick add', kind: 'quick', portion: '1 serving', servings: 1, perServing: { kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) } };
}

/** "1", "1½", "2½": servings the way people say them. */
export function formatServings(n: number): string {
  const whole = Math.floor(n);
  return n - whole >= 0.5 ? (whole === 0 ? '½' : `${whole}½`) : String(whole);
}
