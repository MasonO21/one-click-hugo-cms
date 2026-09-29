export type TemperatureUnit = 'c' | 'f';
export type DistanceUnit = 'km' | 'mi';

export const METERS_PER_MILE = 1609.344;

export function celsiusToFahrenheit(tempC: number): number {
  return (tempC * 9) / 5 + 32;
}

export function formatTemperature(tempC: number, unit: TemperatureUnit): string {
  const value = unit === 'f' ? celsiusToFahrenheit(tempC) : tempC;
  return `${Math.round(value)}°${unit === 'f' ? 'F' : 'C'}`;
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  const value = unit === 'mi' ? meters / METERS_PER_MILE : meters / 1000;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(1)} ${unit}`;
}

interface LocaleHints {
  measurementSystem?: 'metric' | 'us' | 'uk' | null;
  temperatureUnit?: 'celsius' | 'fahrenheit' | null;
}

export function defaultTemperatureUnit(locale: LocaleHints | undefined): TemperatureUnit {
  if (locale?.temperatureUnit === 'fahrenheit') return 'f';
  if (locale?.temperatureUnit === 'celsius') return 'c';
  return locale?.measurementSystem === 'us' ? 'f' : 'c';
}

export function defaultDistanceUnit(locale: LocaleHints | undefined): DistanceUnit {
  return locale?.measurementSystem === 'us' || locale?.measurementSystem === 'uk' ? 'mi' : 'km';
}
