import BetterSqlite3 from 'better-sqlite3';
import type { Database, SqlValue } from '@/db/types';

// Runs the app's database code against a real SQLite engine in Jest. Mirrors the
// parts of expo-sqlite's API that the app uses.
export function createTestDatabase(options: { withFts?: boolean } = {}): Database & { close(): void } {
  const raw = new BetterSqlite3(':memory:');
  let depth = 0;

  const db: Database & { close(): void } = {
    async execAsync(source) {
      raw.exec(source);
    },
    async runAsync(source, ...params: SqlValue[]) {
      const result = raw.prepare(source).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: result.changes };
    },
    async getAllAsync<T>(source: string, ...params: SqlValue[]) {
      return raw.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: SqlValue[]) {
      const row = raw.prepare(source).get(...params);
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(task) {
      const outer = depth === 0;
      if (outer) raw.exec('BEGIN');
      depth += 1;
      try {
        await task();
        depth -= 1;
        if (outer) raw.exec('COMMIT');
      } catch (error) {
        depth -= 1;
        if (outer) raw.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      raw.close();
    },
  };

  if (options.withFts === false) {
    // Simulate a SQLite build without FTS5.
    const exec = db.execAsync.bind(db);
    db.execAsync = async (source) => {
      if (source.includes('fts5')) throw new Error('no such module: fts5');
      return exec(source);
    };
  }

  return db;
}
