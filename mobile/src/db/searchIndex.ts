import { isMoodId, MOOD_LABELS } from '@/domain/moods';
import { weatherSearchTerms } from '@/domain/weather';
import type { Database } from './types';

interface IndexRow {
  id: number;
  transcript: string;
  place: string | null;
  weather_code: number | null;
  mood: string | null;
  outing_name: string | null;
}

const INDEX_ROWS = `SELECT e.id, e.transcript, e.place, e.weather_code, e.mood, o.name AS outing_name
  FROM entries e LEFT JOIN outings o ON o.id = e.outing_id`;

// The words a note can be found by: what was said, where, the weather, the mood, and
// the outing it belongs to.
function searchBody(row: IndexRow): string {
  const mood = isMoodId(row.mood) ? MOOD_LABELS[row.mood] : '';
  return [row.transcript, row.place, weatherSearchTerms(row.weather_code), mood, row.outing_name].filter(Boolean).join(' ');
}

// Rewrites one note's search entry. Call only when full-text search is available.
export async function indexEntry(db: Database, entryId: number): Promise<void> {
  await db.runAsync('DELETE FROM entries_fts WHERE rowid = ?', entryId);
  const row = await db.getFirstAsync<IndexRow>(`${INDEX_ROWS} WHERE e.id = ?`, entryId);
  if (row) await db.runAsync('INSERT INTO entries_fts (rowid, body) VALUES (?, ?)', row.id, searchBody(row));
}

// Adds notes saved while full-text search was unavailable (or before the index was
// rebuilt), and drops entries for notes that no longer exist.
export async function indexMissingEntries(db: Database): Promise<void> {
  const missing = await db.getAllAsync<IndexRow>(`${INDEX_ROWS} WHERE e.id NOT IN (SELECT rowid FROM entries_fts)`);
  const orphans = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries_fts WHERE rowid NOT IN (SELECT id FROM entries)');
  if (missing.length === 0 && !orphans?.n) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM entries_fts WHERE rowid NOT IN (SELECT id FROM entries)');
    for (const row of missing) {
      await db.runAsync('INSERT INTO entries_fts (rowid, body) VALUES (?, ?)', row.id, searchBody(row));
    }
  });
}
