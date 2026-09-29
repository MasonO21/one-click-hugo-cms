import type { Entry, OutingWithTrack } from '@/db/types';
import { formatDuration } from './format';
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
        distanceMeters: Math.round(outing.distanceM),
        // Each point is [latitude, longitude, unix time in milliseconds].
        track: outing.track,
      })),
      entries: data.entries.map((entry) => ({
        id: entry.id,
        outingId: entry.outingId,
        createdAt: new Date(entry.createdAt).toISOString(),
        transcript: entry.transcript,
        durationSeconds: entry.durationS,
        latitude: entry.latitude,
        longitude: entry.longitude,
        place: entry.place,
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

export function toMarkdown(data: ExportData, units: ExportUnits, locale?: string): string {
  const outingById = new Map(data.outings.map((o) => [o.id, o]));
  const lines: string[] = ['# Trail Notes', ''];

  const newestFirst = [...data.entries].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id);
  let currentDay = '';

  for (const entry of newestFirst) {
    const date = new Date(entry.createdAt);
    const day = date.toLocaleDateString(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (day !== currentDay) {
      currentDay = day;
      lines.push(`## ${day}`, '');
    }

    lines.push(`### ${date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}`, '');
    lines.push(entry.transcript, '');

    const tags: string[] = [];
    const outing = entry.outingId === null ? undefined : outingById.get(entry.outingId);
    if (outing) {
      tags.push(
        `Route: ${outing.name}${outing.distanceM > 0 ? ` (${formatDistance(outing.distanceM, units.distance)}, ${formatDuration(((outing.endedAt ?? outing.startedAt) - outing.startedAt) / 1000)})` : ''}`,
      );
    }
    if (entry.place) tags.push(`Place: ${entry.place}`);
    const weather = weatherLabel(entry.weatherCode);
    if (weather) {
      tags.push(`Weather: ${weather}${entry.tempC !== null ? `, ${formatTemperature(entry.tempC, units.temperature)}` : ''}`);
    }
    if (entry.mood) tags.push(`Mood: ${MOOD_LABELS[entry.mood]}`);
    if (tags.length > 0) lines.push(tags.map((t) => `- ${t}`).join('\n'), '');
  }

  if (newestFirst.length === 0) lines.push('No entries yet.', '');
  return lines.join('\n');
}
