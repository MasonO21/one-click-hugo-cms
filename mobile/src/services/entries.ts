import { classifyMood } from '@/domain/moods';
import type { Fix } from '@/domain/track';
import type { Weather } from '@/domain/weather';
import { notifyDataChanged } from '@/db/events';
import { createEntry, getEntry, updateEntryTags } from '@/db/repository';
import type { Database, Entry } from '@/db/types';

export interface SaveEntryInput {
  transcript: string;
  durationS: number;
  fix: Fix | null;
  outingId: number | null;
  createdAt?: number;
}

// Saves the entry straight away with the mood worked out from the words. Place and
// weather are added afterwards by enrichEntry, so saving never waits on the network.
export async function saveNewEntry(db: Database, input: SaveEntryInput): Promise<Entry> {
  const transcript = input.transcript.trim();
  if (!transcript) throw new Error('Nothing to save');

  const entry = await createEntry(db, {
    transcript,
    durationS: input.durationS,
    createdAt: input.createdAt,
    outingId: input.outingId,
    latitude: input.fix?.latitude ?? null,
    longitude: input.fix?.longitude ?? null,
    mood: classifyMood(transcript).mood,
    moodSource: 'auto',
  });
  notifyDataChanged();
  return entry;
}

export interface Enrichers {
  geocode: (latitude: number, longitude: number) => Promise<string | null>;
  weather: (latitude: number, longitude: number) => Promise<Weather>;
}

export interface EnrichResult {
  place: 'added' | 'skipped' | 'failed';
  weather: 'added' | 'skipped' | 'failed';
}

// Adds the place name and weather to an entry that has a location. Each lookup is
// independent, and a failure (usually no signal) leaves that tag empty so it can be
// retried later from the entry screen.
export async function enrichEntry(db: Database, entryId: number, enrichers: Enrichers): Promise<EnrichResult> {
  const result: EnrichResult = { place: 'skipped', weather: 'skipped' };
  const entry = await getEntry(db, entryId);
  if (!entry || entry.latitude === null || entry.longitude === null) return result;
  const { latitude, longitude } = entry;

  if (entry.place === null) {
    try {
      const place = await enrichers.geocode(latitude, longitude);
      if (place) {
        await updateEntryTags(db, entryId, { place });
        result.place = 'added';
        notifyDataChanged();
      } else {
        result.place = 'failed';
      }
    } catch {
      result.place = 'failed';
    }
  }

  if (entry.weatherCode === null) {
    try {
      const weather = await enrichers.weather(latitude, longitude);
      await updateEntryTags(db, entryId, { tempC: weather.tempC, weatherCode: weather.code });
      result.weather = 'added';
      notifyDataChanged();
    } catch {
      result.weather = 'failed';
    }
  }

  return result;
}
