import { useEffect, useState } from 'react';
import { getOuting, listEntries } from '@/db/repository';
import type { Entry, Outing } from '@/db/types';
import { useDatabase } from '@/providers/useDatabase';
import { useDataVersion } from './useDataVersion';

interface Loaded {
  id: number;
  outing: Outing | null;
  entries: Entry[];
}

export function useOutingDetail(id: number) {
  const db = useDatabase();
  const version = useDataVersion();
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const outing = await getOuting(db, id);
        const entries = outing ? await listEntries(db, { outingId: id, limit: 200 }) : [];
        if (!cancelled) setData({ id, outing, entries });
      } catch {
        if (!cancelled) setData({ id, outing: null, entries: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, id, version]);

  const current = data?.id === id ? data : null;
  return { outing: current?.outing ?? null, entries: current?.entries ?? [], loading: current === null };
}
