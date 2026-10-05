import { useCallback, useEffect, useState } from 'react';
import { countEntries, listEntries, listMoodsInUse, listOutings } from '@/db/repository';
import type { Entry, Outing } from '@/db/types';
import type { MoodId } from '@/domain/moods';
import { useDatabase } from '@/providers/useDatabase';
import { useDataVersion } from './useDataVersion';

const PAGE_SIZE = 40;
const SEARCH_DELAY_MS = 200;

interface Options {
  query: string;
  mood: MoodId | null;
}

interface Loaded {
  key: string;
  entries: Entry[];
  moods: MoodId[];
  outings: Map<number, Outing>;
  total: number;
  hasMore: boolean;
}

const NO_OUTINGS = new Map<number, Outing>();

export function useEntries({ query, mood }: Options) {
  const db = useDatabase();
  const version = useDataVersion();
  const key = `${query}\u0000${mood ?? ''}`;

  const [data, setData] = useState<Loaded | null>(null);
  const [paging, setPaging] = useState({ key, limit: PAGE_SIZE });
  // A new search starts again from the first page.
  const limit = paging.key === key ? paging.limit : PAGE_SIZE;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const [rows, inUse, count, outingRows] = await Promise.all([
            listEntries(db, { query, mood, limit }),
            listMoodsInUse(db),
            countEntries(db),
            listOutings(db, 500),
          ]);
          if (cancelled) return;
          setData({
            key,
            entries: rows,
            moods: inUse,
            outings: new Map(outingRows.map((o) => [o.id, o])),
            total: count,
            hasMore: rows.length >= limit,
          });
        } catch {
          // Show an empty result for this query rather than the previous query's notes
          // with a spinner that never stops.
          if (!cancelled) {
            setData((current) => ({
              key,
              entries: [],
              moods: current?.moods ?? [],
              outings: current?.outings ?? NO_OUTINGS,
              total: current?.total ?? 0,
              hasMore: false,
            }));
          }
        }
      },
      query ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [db, key, query, mood, limit, version]);

  const loadMore = useCallback(() => {
    if (data?.hasMore) setPaging({ key, limit: limit + PAGE_SIZE });
  }, [data?.hasMore, key, limit]);

  return {
    entries: data?.entries ?? [],
    moods: data?.moods ?? [],
    outings: data?.outings ?? NO_OUTINGS,
    total: data?.total ?? null,
    loading: data?.key !== key,
    loadMore,
  };
}
