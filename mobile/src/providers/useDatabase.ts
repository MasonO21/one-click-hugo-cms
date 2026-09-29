import { useSQLiteContext } from 'expo-sqlite';
import type { Database } from '@/db/types';

export function useDatabase(): Database {
  return useSQLiteContext() as unknown as Database;
}
