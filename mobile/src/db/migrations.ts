import { indexMissingEntries } from './searchIndex';
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

// Letters, numbers and accent marks (M*) are word characters, so marks in Hindi or Thai
// words stay inside the word.
const TOKENIZER = `"unicode61 remove_diacritics 2 categories 'L* N* Co M*'"`;
const FTS = `
CREATE VIRTUAL TABLE entries_fts USING fts5(body, tokenize = ${TOKENIZER});
`;

// For SQLite builds too old for the categories option.
const FTS_BASIC = `
CREATE VIRTUAL TABLE entries_fts USING fts5(body, tokenize = 'unicode61 remove_diacritics 2');
`;

const ftsSupport = new WeakMap<object, boolean>();
let lastKnown = false;

export function hasFullTextSearch(db: Database): boolean {
  return ftsSupport.get(db) ?? lastKnown;
}

async function supportsCategories(db: Database): Promise<boolean> {
  try {
    await db.execAsync(`CREATE VIRTUAL TABLE temp.entries_fts_probe USING fts5(body, tokenize = ${TOKENIZER});`);
    await db.execAsync('DROP TABLE temp.entries_fts_probe;');
    return true;
  } catch {
    return false;
  }
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

  // Version 2: notes and outings remember the time zone they were made in.
  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync('ALTER TABLE entries ADD COLUMN time_zone TEXT; ALTER TABLE outings ADD COLUMN time_zone TEXT;');
      await db.execAsync('PRAGMA user_version = 2');
    });
  }

  // Full-text search is optional. If this SQLite build lacks FTS5, search falls back to
  // a slower substring match and everything else keeps working.
  try {
    const existing = await db.getFirstAsync<{ sql: string | null }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'entries_fts'",
    );
    // The first index split words at accent marks, which breaks Hindi, Thai and similar
    // scripts. Rebuild it with the current tokenizer, once, and only if this SQLite build
    // supports it (otherwise the basic index would be rebuilt on every launch).
    const current = Boolean(existing?.sql?.includes('categories'));
    if (!existing) {
      try {
        await db.execAsync(FTS);
      } catch {
        await db.execAsync(FTS_BASIC);
      }
    } else if (!current && (await supportsCategories(db))) {
      await db.execAsync('DROP TABLE entries_fts');
      await db.execAsync(FTS);
    }
    // The table can exist in a database restored onto a build without FTS5, so prove it works.
    await db.getFirstAsync('SELECT rowid FROM entries_fts LIMIT 1');
    await indexMissingEntries(db);
    ftsSupport.set(db, true);
    lastKnown = true;
  } catch {
    ftsSupport.set(db, false);
    lastKnown = false;
  }
}
