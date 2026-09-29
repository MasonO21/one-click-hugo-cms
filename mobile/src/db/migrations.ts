import type { Database } from './types';

const V1 = `
CREATE TABLE outings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('hike', 'run')),
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  distance_m REAL NOT NULL DEFAULT 0,
  track TEXT
);

CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outing_id INTEGER REFERENCES outings(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  transcript TEXT NOT NULL,
  duration_s INTEGER NOT NULL DEFAULT 0,
  latitude REAL,
  longitude REAL,
  place TEXT,
  temp_c REAL,
  weather_code INTEGER,
  mood TEXT,
  mood_source TEXT NOT NULL DEFAULT 'auto'
);

CREATE INDEX entries_created_at ON entries (created_at DESC);
CREATE INDEX entries_outing ON entries (outing_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const FTS = `
CREATE VIRTUAL TABLE entries_fts USING fts5(body, tokenize = 'unicode61 remove_diacritics 2');
`;

const ftsSupport = new WeakMap<object, boolean>();
let lastKnown = false;

export function hasFullTextSearch(db: Database): boolean {
  return ftsSupport.get(db) ?? lastKnown;
}

// Creates or upgrades the schema. Runs every time the app opens the database.
export async function migrate(db: Database): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(V1);
      await db.execAsync('PRAGMA user_version = 1');
    });
  }

  // Full-text search is optional. If this SQLite build lacks FTS5, search falls back to
  // a slower substring match and everything else keeps working.
  try {
    const existing = await db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'",
    );
    if (!existing) await db.execAsync(FTS);
    ftsSupport.set(db, true);
    lastKnown = true;
  } catch {
    ftsSupport.set(db, false);
    lastKnown = false;
  }
}
