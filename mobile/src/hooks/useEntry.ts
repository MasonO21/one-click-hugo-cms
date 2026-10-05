import { useEffect, useState } from 'react';
import { getEntry, getOuting } from '@/db/repository';
import type { Entry, Outing } from '@/db/types';
import { useDatabase } from '@/providers/useDatabase';
import { useDataVersion } from './useDataVersion';

interface Loaded {
  id: number;
  entry: Entry | null;
  outing: Outing | null;
}

export function useEntry(id: number) {
  const db = useDatabase();
  const version = useDataVersion();
  const [data, setData] = useState<Loaded | null>(null);

  const valid = Number.isInteger(id);

  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const entry = await getEntry(db, id);
        const outing = entry?.outingId ? await getOuting(db, entry.outingId) : null;
        if (!cancelled) setData({ id, entry, outing });
      } catch {
        if (!cancelled) setData({ id, entry: null, outing: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id, valid, version]);

  // An id that is not a number (a bad link) can never load: show it as gone right away.
  if (!valid) return { entry: null, outing: null, loading: false };
  const current = data?.id === id ? data : null;
  return { entry: current?.entry ?? null, outing: current?.outing ?? null, loading: current === null };
}
