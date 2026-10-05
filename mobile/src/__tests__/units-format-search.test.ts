import { currentTimeZone, dayKey, defaultOutingName, formatDay, formatDuration, formatTime, partOfDay } from '@/domain/format';
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

  it('uses the region when the phone does not report a measurement system', () => {
    expect(defaultDistanceUnit({ measurementSystem: null, regionCode: 'US' })).toBe('mi');
    expect(defaultDistanceUnit({ measurementSystem: null, regionCode: 'gb' })).toBe('mi');
    expect(defaultDistanceUnit({ measurementSystem: null, regionCode: 'DE' })).toBe('km');
    expect(defaultDistanceUnit({ measurementSystem: 'metric', regionCode: 'US' })).toBe('km');
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
  it('splits input into words, keeping case and accent marks for the index to fold', () => {
    expect(searchTerms('Foggy  Ridge!')).toEqual(['Foggy', 'Ridge']);
    expect(searchTerms('café 3.5km')).toEqual(['café', '3', '5km']);
    expect(searchTerms('E\u0301ric')).toEqual(['Éric']);
    expect(searchTerms('İstanbul')).toEqual(['İstanbul']);
    expect(searchTerms('हिन्दी ภูเขา')).toEqual(['हिन्दी', 'ภูเขา']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('builds a safe prefix query', () => {
    expect(buildFtsQuery('foggy rid')).toBe('"foggy"* "rid"*');
    expect(buildFtsQuery('"; DROP TABLE entries; --')).toBe('"DROP"* "TABLE"* "entries"*');
    expect(buildFtsQuery('***')).toBeNull();
  });

  it('limits the number of words', () => {
    expect(searchTerms('a b c d e f g h i j')).toHaveLength(8);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});

describe('time zones', () => {
  // Noon UTC on 26 September: already 27 September at UTC+14, still 26 September at UTC-11.
  const moment = Date.UTC(2026, 8, 26, 12, 0);

  it('puts a note on the calendar day where it was made', () => {
    expect(dayKey(moment, 'Pacific/Kiritimati')).toBe('2026-09-27');
    expect(dayKey(moment, 'Pacific/Pago_Pago')).toBe('2026-09-26');
  });

  it('shows the local time where the note was made, with the zone when it is not the phone\'s', () => {
    const time = formatTime(Date.UTC(2026, 8, 26, 22, 42), 'en-US', 'Asia/Tokyo');
    expect(time).toMatch(/^7:42\sAM/);
    if (currentTimeZone() !== 'Asia/Tokyo') expect(time).toMatch(/GMT\+9|JST/);
  });

  it('leaves out the zone name for notes made in the phone\'s own zone', () => {
    const zone = currentTimeZone();
    expect(formatTime(moment, 'en-US', zone)).toBe(formatTime(moment, 'en-US'));
  });

  it('falls back to the phone\'s zone for an unknown zone name', () => {
    expect(formatTime(moment, 'en-US', 'Not/A_Zone')).toBe(formatTime(moment, 'en-US'));
    expect(dayKey(moment, 'Not/A_Zone')).toBe(dayKey(moment));
  });

  it('names the date where the note was made', () => {
    const monthLater = Date.UTC(2026, 9, 27, 12, 0);
    expect(formatDay(moment, monthLater, 'en-US', 'Pacific/Kiritimati')).toBe('Sunday, September 27');
    expect(formatDay(moment, monthLater, 'en-US', 'Pacific/Pago_Pago')).toBe('Saturday, September 26');
  });
});
