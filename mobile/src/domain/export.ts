import type { Entry, OutingWithTrack } from '@/db/types';
import { formatDuration, formatTime } from './format';
import { MOOD_LABELS } from './moods';
import { formatDistance, formatTemperature, type DistanceUnit, type TemperatureUnit } from './units';
import { weatherLabel } from './weather';

export interface ExportData {
  entries: Entry[];
  outings: OutingWithTrack[];
}

export interface ExportUnits {
  temperature: TemperatureUnit;
  distance: DistanceUnit;
}

export function toJson(data: ExportData, exportedAt: number = Date.now()): string {
  return JSON.stringify(
    {
      app: 'Trail Notes',
      format: 1,
      exportedAt: new Date(exportedAt).toISOString(),
      outings: data.outings.map((outing) => ({
        id: outing.id,
        kind: outing.kind,
        name: outing.name,
        startedAt: new Date(outing.startedAt).toISOString(),
        endedAt: outing.endedAt === null ? null : new Date(outing.endedAt).toISOString(),
        timeZone: outing.timeZone,
        distanceMeters: Math.round(outing.distanceM),
        // Each point is [latitude, longitude, unix time in milliseconds].
        track: outing.track,
      })),
      entries: data.entries.map((entry) => ({
        id: entry.id,
        outingId: entry.outingId,
        createdAt: new Date(entry.createdAt).toISOString(),
        timeZone: entry.timeZone,
        transcript: entry.transcript,
        durationSeconds: entry.durationS,
        latitude: entry.latitude,
        longitude: entry.longitude,
        place: entry.place || null,
        temperatureC: entry.tempC,
        weather: weatherLabel(entry.weatherCode),
        weatherCode: entry.weatherCode,
        mood: entry.mood,
      })),
    },
    null,
    2,
  );
}

function zoneOf(timeZone: string | null): { timeZone?: string } {
  if (!timeZone) return {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return { timeZone };
  } catch {
    return {};
  }
}

// Characters that change formatting anywhere in a line.
function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, (char) => `\\${char}`);
}

// Note text exactly as said or typed: a line that would become a heading, list, quote
// or rule in Markdown is escaped so it stays plain text.
function escapeNote(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      escapeInline(line)
        .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
        .replace(/^(\s*)([#>+=-])/, '$1\\$2'),
    )
    .join('\n');
}

export function toMarkdown(data: ExportData, units: ExportUnits, locale?: string): string {
  const outingById = new Map(data.outings.map((o) => [o.id, o]));
  const lines: string[] = ['# Trail Notes', ''];

  const newestFirst = [...data.entries].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  let currentDay = '';

  for (const entry of newestFirst) {
    const date = new Date(entry.createdAt);
    // Each note's day and time where it was made.
    const zone = zoneOf(entry.timeZone);
    const day = date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', ...zone });
    if (day !== currentDay) {
      currentDay = day;
      lines.push(`## ${day}`, '');
    }

    lines.push(`### ${formatTime(entry.createdAt, locale, entry.timeZone)}`, '');
    lines.push(escapeNote(entry.transcript), '');

    const tags: string[] = [];
    const outing = entry.outingId === null ? undefined : outingById.get(entry.outingId);
    if (outing) {
      // An outing still in progress has no duration yet.
      const details = [
        outing.distanceM > 0 ? formatDistance(outing.distanceM, units.distance) : null,
        outing.endedAt !== null && outing.distanceM > 0 ? formatDuration((outing.endedAt - outing.startedAt) / 1000) : null,
      ].filter(Boolean);
      tags.push(`Route: ${escapeInline(outing.name)}${details.length ? ` (${details.join(', ')})` : ''}`);
    }
    if (entry.place) tags.push(`Place: ${escapeInline(entry.place)}`);
    const weather = [
      weatherLabel(entry.weatherCode),
      entry.tempC !== null ? formatTemperature(entry.tempC, units.temperature) : null,
    ].filter(Boolean);
    if (weather.length) tags.push(`Weather: ${weather.join(', ')}`);
    if (entry.mood) tags.push(`Mood: ${MOOD_LABELS[entry.mood]}`);
    if (tags.length > 0) lines.push(tags.map((t) => `- ${t}`).join('\n'), '');
  }

  if (newestFirst.length === 0) lines.push('No entries yet.', '');
  return lines.join('\n');
}
