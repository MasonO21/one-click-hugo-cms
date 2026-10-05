import { useEffect, useState } from 'react';
import { getOuting, listEntries } from '@/db/repository';
import type { Entry, OutingWithTrack } from '@/db/types';
import { useDatabase } from '@/providers/useDatabase';
import { useDataVersion } from './useDataVersion';

interface Loaded {
  id: number;
  outing: OutingWithTrack | null;
  entries: Entry[];
}

export function useOutingDetail(id: number) {
  const db = useDatabase();
  const version = useDataVersion();
  const [data, setData] = useState<Loaded | null>(null);

  const valid = Number.isInteger(id);

  useEffect(() => {
    if (!valid) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const outing = await getOuting(db, id);
        const entries = outing ? await listEntries(db, { outingId: id, limit: 1000 }) : [];
        if (!cancelled) setData({ id, outing, entries });
      } catch {
        if (!cancelled) setData({ id, outing: null, entries: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id, valid, version]);

  // An id that is not a number (a bad link) can never load: show it as gone right away.
  if (!valid) return { outing: null, entries: [], loading: false };
  const current = data?.id === id ? data : null;
  return { outing: current?.outing ?? null, entries: current?.entries ?? [], loading: current === null };
}
