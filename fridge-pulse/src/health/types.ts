/** One day of activity from the phone's health store. */
export interface DayActivity {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  steps: number;
  /** Active energy burned, kcal. */
  activeKcal: number;
  workoutMinutes: number;
  workouts: number;
}

/** What is written to the health store for a logged food. */
export interface NutritionSample {
  title: string;
  at: Date;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Apple Health on iPhone, Health Connect on Android, sample data in the web preview. Every call is
 * safe to make when access was not given: reads come back empty and writes do nothing.
 */
export interface HealthProvider {
  kind: 'apple' | 'google' | 'sample' | 'none';
  /** "Apple Health", "Health Connect". */
  name: string;
  isAvailable(): Promise<boolean>;
  /** Shows the system permission sheet. True when the app may now read (as far as it can tell). */
  requestAccess(): Promise<boolean>;
  /** Activity for each day asked for, in the same order. */
  readDays(days: string[]): Promise<DayActivity[]>;
  /** Saves a food's figures and returns ids for removing them again. */
  writeNutrition(sample: NutritionSample): Promise<string[]>;
  deleteNutrition(ids: string[]): Promise<void>;
  /** Where to change the permissions later. */
  openSettings?(): void;
}

/** Midnight at the start of a local day, and of the next one. */
export function dayRange(day: string): { start: Date; end: Date } {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return { start: new Date(y, m - 1, d, 0, 0, 0, 0), end: new Date(y, m - 1, d + 1, 0, 0, 0, 0) };
}

export const emptyDay = (day: string): DayActivity => ({ day, steps: 0, activeKcal: 0, workoutMinutes: 0, workouts: 0 });
