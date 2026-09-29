import { dayKey, defaultOutingName, formatDay, formatDuration, partOfDay } from '@/domain/format';
import { buildFtsQuery, escapeLike, searchTerms } from '@/domain/search';
import {
  celsiusToFahrenheit,
  defaultDistanceUnit,
  defaultTemperatureUnit,
  formatDistance,
  formatTemperature,
} from '@/domain/units';

describe('units', () => {
  it('converts and formats temperature', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(formatTemperature(8.9, 'c')).toBe('9°C');
    expect(formatTemperature(8.9, 'f')).toBe('48°F');
    expect(formatTemperature(-3.2, 'c')).toBe('-3°C');
  });

  it('formats distance', () => {
    expect(formatDistance(0, 'km')).toBe('0.0 km');
    expect(formatDistance(1500, 'km')).toBe('1.5 km');
    expect(formatDistance(9977, 'mi')).toBe('6.2 mi');
  });

  it('picks defaults from the locale', () => {
    expect(defaultTemperatureUnit({ temperatureUnit: 'fahrenheit' })).toBe('f');
    expect(defaultTemperatureUnit({ temperatureUnit: 'celsius', measurementSystem: 'us' })).toBe('c');
    expect(defaultTemperatureUnit({ temperatureUnit: null, measurementSystem: 'us' })).toBe('f');
    expect(defaultTemperatureUnit(undefined)).toBe('c');
    expect(defaultDistanceUnit({ measurementSystem: 'us' })).toBe('mi');
    expect(defaultDistanceUnit({ measurementSystem: 'uk' })).toBe('mi');
    expect(defaultDistanceUnit({ measurementSystem: 'metric' })).toBe('km');
    expect(defaultDistanceUnit(undefined)).toBe('km');
  });
});

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('names days relative to now', () => {
    const now = new Date(2026, 8, 29, 12).getTime();
    expect(formatDay(new Date(2026, 8, 29, 7).getTime(), now)).toBe('Today');
    expect(formatDay(new Date(2026, 8, 28, 23).getTime(), now)).toBe('Yesterday');
    expect(formatDay(new Date(2026, 8, 20, 9).getTime(), now, 'en-US')).toBe('Sunday, September 20');
    expect(formatDay(new Date(2025, 11, 25, 9).getTime(), now, 'en-US')).toBe('Thursday, December 25, 2025');
  });

  it('groups by local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });

  it('names outings by time of day', () => {
    expect(partOfDay(new Date(2026, 8, 29, 7).getTime())).toBe('Morning');
    expect(partOfDay(new Date(2026, 8, 29, 13).getTime())).toBe('Afternoon');
    expect(partOfDay(new Date(2026, 8, 29, 18).getTime())).toBe('Evening');
    expect(partOfDay(new Date(2026, 8, 29, 23).getTime())).toBe('Night');
    expect(defaultOutingName('run', new Date(2026, 8, 29, 6).getTime())).toBe('Morning run');
  });
});

describe('search', () => {
  it('splits input into lowercase words', () => {
    expect(searchTerms('Foggy  Ridge!')).toEqual(['foggy', 'ridge']);
    expect(searchTerms('café 3.5km')).toEqual(['café', '3', '5km']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('builds a safe prefix query', () => {
    expect(buildFtsQuery('foggy rid')).toBe('"foggy"* "rid"*');
    expect(buildFtsQuery('"; DROP TABLE entries; --')).toBe('"drop"* "table"* "entries"*');
    expect(buildFtsQuery('***')).toBeNull();
  });

  it('limits the number of words', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
