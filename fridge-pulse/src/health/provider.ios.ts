import type * as HealthKitModule from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';
import { dayRange, emptyDay, type DayActivity, type HealthProvider } from './types';

const READ = ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierActiveEnergyBurned', 'HKWorkoutTypeIdentifier'] as const;
const WRITE = [
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFatTotal',
] as const;
type Written = (typeof WRITE)[number];

type HealthKit = typeof HealthKitModule;
let loaded: HealthKit | null | undefined;

/**
 * The HealthKit library, loaded on first use. It needs its native module, which a build without it
 * (Expo Go, tests) does not have: then health is simply unavailable instead of the app failing to start.
 */
function hk(): HealthKit | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('@kingstinct/react-native-healthkit') as HealthKit;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

const need = (): HealthKit => {
  const lib = hk();
  if (!lib) throw new Error('HealthKit is not available');
  return lib;
};

const sum = async (id: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'count' | 'kcal', start: Date, end: Date) => {
  const res = await need().queryStatisticsForQuantity(id, ['cumulativeSum'], { filter: { date: { startDate: start, endDate: end } }, unit });
  return res.sumQuantity?.quantity ?? 0;
};

/** Apple Health through HealthKit. HealthKit never says whether reading was allowed, so reads just come back empty when it was not. */
export function createProvider(): HealthProvider {
  return {
    kind: 'apple',
    name: 'Apple Health',
    isAvailable: async () => (hk() ? hk()!.isHealthDataAvailableAsync().catch(() => false) : false),
    requestAccess: async () => {
      try {
        await need().requestAuthorization({ toRead: [...READ], toShare: [...WRITE] });
        return true;
      } catch {
        return false;
      }
    },
    readDays: async (days) => {
      if (days.length === 0 || !hk()) return days.map(emptyDay);
      const first = dayRange(days[0]!).start;
      const last = dayRange(days[days.length - 1]!).end;
      const workouts = await need().queryWorkoutSamples({ limit: 0, filter: { date: { startDate: first, endDate: last } } }).catch(() => []);
      return Promise.all(
        days.map(async (day): Promise<DayActivity> => {
          const { start, end } = dayRange(day);
          try {
            const [steps, activeKcal] = await Promise.all([sum('HKQuantityTypeIdentifierStepCount', 'count', start, end), sum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end)]);
            const own = workouts.filter((w) => w.startDate >= start && w.startDate < end);
            const minutes = own.reduce((m, w) => m + Math.max(0, (w.endDate.getTime() - w.startDate.getTime()) / 60000), 0);
            return { day, steps: Math.round(steps), activeKcal: Math.round(activeKcal), workoutMinutes: Math.round(minutes), workouts: own.length };
          } catch {
            return emptyDay(day);
          }
        }),
      );
    },
    writeNutrition: async ({ at, kcal, protein, carbs, fat }) => {
      const values: [Written, 'kcal' | 'g', number][] = [
        ['HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', kcal],
        ['HKQuantityTypeIdentifierDietaryProtein', 'g', protein],
        ['HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', carbs],
        ['HKQuantityTypeIdentifierDietaryFatTotal', 'g', fat],
      ];
      const ids: string[] = [];
      const lib = hk();
      if (!lib) return ids;
      for (const [id, unit, value] of values) {
        if (!(value > 0)) continue;
        // Units are checked per identifier by the library's types; these four take kcal or grams.
        const saved = await lib.saveQuantitySample(id, unit as never, value, at, at).catch(() => undefined);
        if (saved?.uuid) ids.push(`${id}|${saved.uuid}`);
      }
      return ids;
    },
    deleteNutrition: async (ids) => {
      const lib = hk();
      if (!lib) return;
      for (const ref of ids) {
        const [id, uuid] = ref.split('|') as [Written, string];
        if (!uuid || !WRITE.includes(id)) continue;
        await lib.deleteObjects(id, { uuid }).catch(() => 0);
      }
    },
    // Health permissions live in the Health app; the app's own settings page links there.
    openSettings: () => void Linking.openSettings(),
  };
}
