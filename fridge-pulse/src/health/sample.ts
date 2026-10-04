import type { DayActivity, HealthProvider, NutritionSample } from './types';

/** A steady number from a day, so the sample week looks the same every time it is drawn. */
function seed(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
}

/**
 * Made-up activity for the web preview, where there is no health store: a believable week of steps
 * and workouts. Nothing is read from or written to anywhere.
 */
export function sampleProvider(): HealthProvider {
  const written = new Map<string, NutritionSample>();
  let n = 0;
  return {
    kind: 'sample',
    name: 'Sample data',
    isAvailable: async () => true,
    requestAccess: async () => true,
    readDays: async (days) =>
      days.map((day): DayActivity => {
        const r = seed(day);
        const trained = r > 0.45;
        return {
          day,
          steps: Math.round(3500 + r * 8500),
          activeKcal: Math.round(180 + r * 420),
          workoutMinutes: trained ? Math.round(20 + seed(`${day}w`) * 40) : 0,
          workouts: trained ? 1 : 0,
        };
      }),
    writeNutrition: async (sample) => {
      const id = `sample-${++n}`;
      written.set(id, sample);
      return [id];
    },
    deleteNutrition: async (ids) => {
      for (const id of ids) written.delete(id);
    },
  };
}

/** No health store on this device. */
export function noProvider(): HealthProvider {
  return {
    kind: 'none',
    name: 'Health',
    isAvailable: async () => false,
    requestAccess: async () => false,
    readDays: async () => [],
    writeNutrition: async () => [],
    deleteNutrition: async () => {},
  };
}
