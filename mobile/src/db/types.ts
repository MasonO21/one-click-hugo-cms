import type { MoodId } from '@/domain/moods';
import type { OutingKind } from '@/domain/format';
import type { TrackPoint } from '@/domain/track';

// The slice of expo-sqlite's SQLiteDatabase that the app uses. Tests provide the same
// interface on top of better-sqlite3.
export interface Database {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, ...params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export type SqlValue = string | number | null;

export type MoodSource = 'auto' | 'user';

export interface Entry {
  id: number;
  outingId: number | null;
  createdAt: number;
  transcript: string;
  durationS: number;
  latitude: number | null;
  longitude: number | null;
  place: string | null;
  tempC: number | null;
  weatherCode: number | null;
  mood: MoodId | null;
  moodSource: MoodSource;
}

export interface NewEntry {
  transcript: string;
  createdAt?: number;
  durationS?: number;
  outingId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  place?: string | null;
  tempC?: number | null;
  weatherCode?: number | null;
  mood?: MoodId | null;
  moodSource?: MoodSource;
}

export interface Outing {
  id: number;
  kind: OutingKind;
  name: string;
  startedAt: number;
  endedAt: number | null;
  distanceM: number;
  entryCount: number;
}

export interface OutingWithTrack extends Outing {
  track: TrackPoint[];
}
