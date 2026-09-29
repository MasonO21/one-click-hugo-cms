// Shared setup for tests that render the real app screens with Expo Router.
// Each test file must call jest.mock for the modules below (see screens.test.tsx),
// because jest.mock calls are only hoisted inside the file that contains them.
import { createTestDatabase } from './sqliteAdapter';
import { migrate } from '@/db/migrations';
import { setSetting } from '@/db/repository';
import type { Database } from '@/db/types';

export type TestDb = Database & { close(): void };

export async function freshDb(options: { onboarded?: boolean; settings?: Record<string, string> } = {}): Promise<TestDb> {
  const db = createTestDatabase();
  await migrate(db);
  if (options.onboarded ?? true) await setSetting(db, 'onboarded', '1');
  for (const [key, value] of Object.entries(options.settings ?? {})) await setSetting(db, key, value);
  return db;
}
