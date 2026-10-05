import { defaultOutingName, type OutingKind } from '@/domain/format';
import { isMoodId, type MoodId } from '@/domain/moods';
import { buildFtsQuery, escapeLike, searchTerms } from '@/domain/search';
import type { TrackPoint } from '@/domain/track';
import { hasFullTextSearch } from './migrations';
import { indexEntry } from './searchIndex';
import { serialized, transaction } from './queue';
import type { Database, Entry, MoodSource, NewEntry, Outing, OutingWithTrack, SqlValue } from './types';

interface EntryRow {
  id: number;
  outing_id: number | null;
  created_at: number;
  transcript: string;
  duration_s: number;
  latitude: number | null;
  longitude: number | null;
  place: string | null;
  temp_c: number | null;
  weather_code: number | null;
  mood: string | null;
  mood_source: string;
}

interface OutingRow {
  id: number;
  kind: string;
  name: string;
  started_at: number;
  ended_at: number | null;
  distance_m: number;
  track?: string | null;
  entry_count?: number;
}

function toEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    outingId: row.outing_id,
    createdAt: row.created_at,
    transcript: row.transcript,
    durationS: row.duration_s,
    latitude: row.latitude,
    longitude: row.longitude,
    place: row.place,
    tempC: row.temp_c,
    weatherCode: row.weather_code,
    mood: isMoodId(row.mood) ? row.mood : null,
    moodSource: row.mood_source === 'user' ? 'user' : 'auto',
  };
}

function toOuting(row: OutingRow): Outing {
  return {
    id: row.id,
    kind: row.kind === 'run' ? 'run' : 'hike',
    name: row.name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceM: row.distance_m,
    entryCount: row.entry_count ?? 0,
  };
}

function parseTrack(raw: string | null | undefined): TrackPoint[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is TrackPoint => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number'),
    );
  } catch {
    return [];
  }
}

const OUTING_COLUMNS = `o.id, o.kind, o.name, o.started_at, o.ended_at, o.distance_m,
  (SELECT COUNT(*) FROM entries e WHERE e.outing_id = o.id) AS entry_count`;

// ---------------------------------------------------------------------------
// Search index
// ---------------------------------------------------------------------------

async function rebuildSearch(db: Database, entryId: number): Promise<void> {
  if (hasFullTextSearch(db)) await indexEntry(db, entryId);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function createEntry(db: Database, input: NewEntry): Promise<Entry> {
  let id = 0;
  await transaction(db, async () => {
    const result = await db.runAsync(
      `INSERT INTO entries (outing_id, created_at, transcript, duration_s, latitude, longitude,
         place, temp_c, weather_code, mood, mood_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.outingId ?? null,
      input.createdAt ?? Date.now(),
      input.transcript,
      Math.max(0, Math.round(input.durationS ?? 0)),
      input.latitude ?? null,
      input.longitude ?? null,
      input.place ?? null,
      input.tempC ?? null,
      input.weatherCode ?? null,
      input.mood ?? null,
      input.moodSource ?? 'auto',
    );
    id = result.lastInsertRowId;
    await rebuildSearch(db, id);
  });
  const entry = await getEntry(db, id);
  if (!entry) throw new Error('Entry was not saved');
  return entry;
}

export async function getEntry(db: Database, id: number): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>('SELECT * FROM entries WHERE id = ?', id);
  return row ? toEntry(row) : null;
}

export interface EntryFilter {
  query?: string;
  mood?: MoodId | null;
  outingId?: number;
  limit?: number;
  offset?: number;
}

export async function listEntries(db: Database, filter: EntryFilter = {}): Promise<Entry[]> {
  const params: SqlValue[] = [];
  const where: string[] = [];
  let from = 'entries e';

  const query = filter.query?.trim() ?? '';
  if (query) {
    const terms = searchTerms(query);
    // A search for only punctuation or emoji has no words to match: it finds nothing,
    // rather than every note.
    if (terms.length === 0) return [];
    if (hasFullTextSearch(db)) {
      from = 'entries e JOIN entries_fts ON entries_fts.rowid = e.id';
      where.push('entries_fts MATCH ?');
      params.push(buildFtsQuery(query) ?? '');
    } else {
      // LIKE ignores case only for A to Z, so also try the word in lowercase: "École"
      // then finds "école", and "Österreich" still finds itself.
      for (const term of terms) {
        const variants = [...new Set([term, term.toLowerCase()])].map((t) => `%${escapeLike(t)}%`);
        where.push(
          `(${variants.map(() => "e.transcript LIKE ? ESCAPE '\\' OR coalesce(e.place, '') LIKE ? ESCAPE '\\'").join(' OR ')})`,
        );
        for (const pattern of variants) params.push(pattern, pattern);
      }
    }
  }
  if (filter.mood) {
    where.push('e.mood = ?');
    params.push(filter.mood);
  }
  if (filter.outingId !== undefined) {
    where.push('e.outing_id = ?');
    params.push(filter.outingId);
  }

  params.push(filter.limit ?? 50, filter.offset ?? 0);
  const rows = await db.getAllAsync<EntryRow>(
    `SELECT e.* FROM ${from} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    ...params,
  );
  return rows.map(toEntry);
}

export async function countEntries(db: Database): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries');
  return row?.n ?? 0;
}

// Moods that appear in the log, for the filter row.
export async function listMoodsInUse(db: Database): Promise<MoodId[]> {
  const rows = await db.getAllAsync<{ mood: string }>(
    'SELECT mood FROM entries WHERE mood IS NOT NULL GROUP BY mood ORDER BY COUNT(*) DESC',
  );
  return rows.map((r) => r.mood).filter(isMoodId);
}

export async function updateTranscript(db: Database, id: number, transcript: string, mood?: MoodId | null) {
  await transaction(db, async () => {
    if (mood !== undefined) {
      await db.runAsync(
        "UPDATE entries SET transcript = ?, mood = ?, mood_source = 'auto' WHERE id = ?",
        transcript,
        mood,
        id,
      );
    } else {
      await db.runAsync('UPDATE entries SET transcript = ? WHERE id = ?', transcript, id);
    }
    await rebuildSearch(db, id);
  });
}

export async function updateMood(db: Database, id: number, mood: MoodId | null, source: MoodSource) {
  await transaction(db, async () => {
    await db.runAsync('UPDATE entries SET mood = ?, mood_source = ? WHERE id = ?', mood, source, id);
    await rebuildSearch(db, id);
  });
}

export interface EntryTags {
  place?: string | null;
  tempC?: number | null;
  weatherCode?: number | null;
}

export async function updateEntryTags(db: Database, id: number, tags: EntryTags) {
  const sets: string[] = [];
  const params: SqlValue[] = [];
  if (tags.place !== undefined) {
    sets.push('place = ?');
    params.push(tags.place);
  }
  if (tags.tempC !== undefined) {
    sets.push('temp_c = ?');
    params.push(tags.tempC);
  }
  if (tags.weatherCode !== undefined) {
    sets.push('weather_code = ?');
    params.push(tags.weatherCode);
  }
  if (sets.length === 0) return;
  await transaction(db, async () => {
    await db.runAsync(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
    await rebuildSearch(db, id);
  });
}

export async function deleteEntry(db: Database, id: number) {
  await transaction(db, async () => {
    await db.runAsync('DELETE FROM entries WHERE id = ?', id);
    if (hasFullTextSearch(db)) await db.runAsync('DELETE FROM entries_fts WHERE rowid = ?', id);
  });
}

// ---------------------------------------------------------------------------
// Outings
// ---------------------------------------------------------------------------

export async function createOuting(
  db: Database,
  input: { kind: OutingKind; startedAt?: number; name?: string },
): Promise<Outing> {
  const startedAt = input.startedAt ?? Date.now();
  const result = await serialized(db, () =>
    db.runAsync(
      'INSERT INTO outings (kind, name, started_at) VALUES (?, ?, ?)',
      input.kind,
      input.name?.trim() || defaultOutingName(input.kind, startedAt),
      startedAt,
    ),
  );
  const outing = await getOuting(db, result.lastInsertRowId);
  if (!outing) throw new Error('Outing was not saved');
  return outing;
}

export async function getOuting(db: Database, id: number): Promise<OutingWithTrack | null> {
  const row = await db.getFirstAsync<OutingRow>(
    `SELECT ${OUTING_COLUMNS}, o.track FROM outings o WHERE o.id = ?`,
    id,
  );
  return row ? { ...toOuting(row), track: parseTrack(row.track) } : null;
}

export async function getActiveOuting(db: Database): Promise<OutingWithTrack | null> {
  const row = await db.getFirstAsync<OutingRow>(
    `SELECT ${OUTING_COLUMNS}, o.track FROM outings o
     WHERE o.ended_at IS NULL ORDER BY o.started_at DESC LIMIT 1`,
  );
  return row ? { ...toOuting(row), track: parseTrack(row.track) } : null;
}

// When the last note of an outing was made, so an outing left open can end at its
// last sign of activity even when no route points were saved.
export async function latestEntryTime(db: Database, outingId: number): Promise<number | null> {
  const row = await db.getFirstAsync<{ latest: number | null }>(
    'SELECT MAX(created_at) AS latest FROM entries WHERE outing_id = ?',
    outingId,
  );
  return row?.latest ?? null;
}

export async function listOutings(db: Database, limit = 50): Promise<Outing[]> {
  const rows = await db.getAllAsync<OutingRow>(
    `SELECT ${OUTING_COLUMNS} FROM outings o ORDER BY o.started_at DESC LIMIT ?`,
    limit,
  );
  return rows.map(toOuting);
}

export async function saveOutingProgress(
  db: Database,
  id: number,
  progress: { distanceM: number; track: TrackPoint[] },
) {
  await serialized(db, () =>
    db.runAsync(
      'UPDATE outings SET distance_m = ?, track = ? WHERE id = ?',
      progress.distanceM,
      JSON.stringify(progress.track),
      id,
    ),
  );
}

export async function finishOuting(
  db: Database,
  id: number,
  result: { endedAt?: number; distanceM: number; track: TrackPoint[] },
) {
  await serialized(db, () =>
    db.runAsync(
      'UPDATE outings SET ended_at = ?, distance_m = ?, track = ? WHERE id = ?',
      result.endedAt ?? Date.now(),
      result.distanceM,
      JSON.stringify(result.track),
      id,
    ),
  );
}

export async function renameOuting(db: Database, id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  await transaction(db, async () => {
    await db.runAsync('UPDATE outings SET name = ? WHERE id = ?', trimmed, id);
    const ids = await db.getAllAsync<{ id: number }>('SELECT id FROM entries WHERE outing_id = ?', id);
    for (const { id: entryId } of ids) await rebuildSearch(db, entryId);
  });
}

// Deletes an outing and its route. Entries stay in the log, just without a route.
export async function deleteOuting(db: Database, id: number) {
  await transaction(db, async () => {
    const ids = await db.getAllAsync<{ id: number }>('SELECT id FROM entries WHERE outing_id = ?', id);
    await db.runAsync('UPDATE entries SET outing_id = NULL WHERE outing_id = ?', id);
    await db.runAsync('DELETE FROM outings WHERE id = ?', id);
    for (const { id: entryId } of ids) await rebuildSearch(db, entryId);
  });
}

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

export async function deleteAllData(db: Database) {
  await transaction(db, async () => {
    if (hasFullTextSearch(db)) await db.runAsync('DELETE FROM entries_fts');
    await db.runAsync('DELETE FROM entries');
    await db.runAsync('DELETE FROM outings');
  });
}

export async function loadEverything(db: Database): Promise<{ entries: Entry[]; outings: OutingWithTrack[] }> {
  const entryRows = await db.getAllAsync<EntryRow>('SELECT * FROM entries ORDER BY created_at ASC, id ASC');
  const outingRows = await db.getAllAsync<OutingRow>(
    `SELECT ${OUTING_COLUMNS}, o.track FROM outings o ORDER BY o.started_at ASC`,
  );
  return {
    entries: entryRows.map(toEntry),
    outings: outingRows.map((row) => ({ ...toOuting(row), track: parseTrack(row.track) })),
  };
}

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: Database, key: string, value: string) {
  await serialized(db, () =>
    db.runAsync(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      value,
    ),
  );
}

export async function getAllSettings(db: Database): Promise<Record<string, string>> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
