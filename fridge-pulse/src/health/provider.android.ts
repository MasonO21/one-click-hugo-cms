import type * as HealthConnectModule from 'react-native-health-connect';
import { dayRange, emptyDay, type DayActivity, type HealthProvider } from './types';

type HealthConnect = typeof HealthConnectModule;
let loaded: HealthConnect | null | undefined;

/** The Health Connect library, loaded on first use; null in a build without its native module. */
function hc(): HealthConnect | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('react-native-health-connect') as HealthConnect;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

const lib = (): HealthConnect => {
  const m = hc();
  if (!m) throw new Error('Health Connect is not available');
  return m;
};

let ready: Promise<boolean> | null = null;

/** Health Connect has to be installed (built in from Android 14) and initialised once. */
function init(): Promise<boolean> {
  ready ??= (async () => {
    try {
      const m = hc();
      if (!m || (await m.getSdkStatus()) !== m.SdkAvailabilityStatus.SDK_AVAILABLE) return false;
      return await m.initialize();
    } catch {
      return false;
    }
  })();
  return ready;
}

const between = (start: Date, end: Date) => ({ operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() });

/** Health Connect on Android. */
export function createProvider(): HealthProvider {
  return {
    kind: 'google',
    name: 'Health Connect',
    isAvailable: init,
    requestAccess: async () => {
      if (!(await init())) return false;
      try {
        const granted = await lib().requestPermission([
          { accessType: 'read', recordType: 'Steps' },
          { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
          { accessType: 'read', recordType: 'ExerciseSession' },
          { accessType: 'write', recordType: 'Nutrition' },
        ]);
        return granted.some((p) => p.recordType === 'Steps' && p.accessType === 'read');
      } catch {
        return false;
      }
    },
    readDays: async (days) => {
      if (!(await init())) return days.map(emptyDay);
      return Promise.all(
        days.map(async (day): Promise<DayActivity> => {
          const { start, end } = dayRange(day);
          const range = between(start, end);
          try {
            const [steps, energy, exercise, sessions] = await Promise.all([
              lib().aggregateRecord({ recordType: 'Steps', timeRangeFilter: range }),
              lib().aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range }),
              lib().aggregateRecord({ recordType: 'ExerciseSession', timeRangeFilter: range }),
              lib().readRecords('ExerciseSession', { timeRangeFilter: range }),
            ]);
            return {
              day,
              steps: Math.round(steps.COUNT_TOTAL ?? 0),
              activeKcal: Math.round(energy.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0),
              workoutMinutes: Math.round((exercise.EXERCISE_DURATION_TOTAL?.inSeconds ?? 0) / 60),
              workouts: sessions.records.length,
            };
          } catch {
            return emptyDay(day);
          }
        }),
      );
    },
    writeNutrition: async ({ title, at, kcal, protein, carbs, fat }) => {
      if (!(await init())) return [];
      const end = new Date(at.getTime() + 60_000);
      try {
        return await lib().insertRecords([
          {
            recordType: 'Nutrition',
            startTime: at.toISOString(),
            endTime: end.toISOString(),
            name: title.slice(0, 100),
            // 0: unknown meal type.
            mealType: 0,
            energy: { value: kcal, unit: 'kilocalories' },
            protein: { value: protein, unit: 'grams' },
            totalCarbohydrate: { value: carbs, unit: 'grams' },
            totalFat: { value: fat, unit: 'grams' },
          },
        ]);
      } catch {
        return [];
      }
    },
    deleteNutrition: async (ids) => {
      if (ids.length === 0 || !(await init())) return;
      await lib().deleteRecordsByUuids('Nutrition', ids, []).catch(() => {});
    },
    openSettings: () => hc()?.openHealthConnectSettings(),
  };
}
