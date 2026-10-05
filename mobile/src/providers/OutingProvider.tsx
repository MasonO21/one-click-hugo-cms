import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { notifyDataChanged, subscribeToDataChanges } from '@/db/events';
import {
  createOuting,
  deleteOuting,
  finishOuting,
  getActiveOuting,
  getOuting,
  latestEntryTime,
  saveOutingProgress,
} from '@/db/repository';
import type { Database, OutingWithTrack } from '@/db/types';
import type { OutingKind } from '@/domain/format';
import { decimateTrack, TrackRecorder, type Fix } from '@/domain/track';
import { checkRouteTracking, LocationTracker, requestLocationPermission } from '@/services/location';
import { useSettings } from './SettingsProvider';
import { useDatabase } from './useDatabase';

const KEEP_AWAKE_TAG = 'trailnotes-outing';
const MAX_STORED_POINTS = 2000;
const SAVE_EVERY_POINTS = 20;
const SAVE_EVERY_MS = 60_000;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const RECENT_FIX_MS = 2 * 60 * 1000;
// Phones often hand over a cached position first. Anything older than this before the
// outing started (or resumed) is not where the person is now.
const FIX_MAX_AGE_AT_START_MS = 10_000;
const FIX_MAX_CLOCK_SKEW_MS = 60_000;

export type StartResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'blocked' | 'services-off' | 'approximate' | 'error' };

interface OutingContextValue {
  active: OutingWithTrack | null;
  distanceM: number;
  elapsedS: number;
  // An outing that was still open when the app started, waiting for a decision.
  recovering: OutingWithTrack | null;
  start: (kind: OutingKind) => Promise<StartResult>;
  finish: () => Promise<number | null>;
  resume: () => Promise<StartResult>;
  endRecovered: () => Promise<void>;
  latestFix: () => Fix | null;
}

const OutingContext = createContext<OutingContextValue | null>(null);

// The last sign of activity in an outing that was left open: its last route point or
// its last note, whichever is later.
async function lastActivity(db: Database, outing: OutingWithTrack): Promise<number> {
  const lastPoint = outing.track[outing.track.length - 1];
  const lastNote = await latestEntryTime(db, outing.id).catch(() => null);
  return Math.max(outing.startedAt, lastPoint ? lastPoint[2] : 0, lastNote ?? 0);
}

async function readiness(): Promise<StartResult> {
  const permission = await requestLocationPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };
  const route = await checkRouteTracking();
  if (route !== 'ready') return { ok: false, reason: route };
  return { ok: true };
}

export function OutingProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const { settings, loaded } = useSettings();

  const [active, setActive] = useState<OutingWithTrack | null>(null);
  const [recovering, setRecovering] = useState<OutingWithTrack | null>(null);
  const [distanceM, setDistanceM] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const recorder = useRef<TrackRecorder | null>(null);
  const tracker = useRef(new LocationTracker());
  const latest = useRef<Fix | null>(null);
  const unsaved = useRef(0);
  const lastSavedAt = useRef(0);
  // A start, resume or finish is in progress. A second tap waits for nothing and does nothing.
  const busy = useRef(false);

  const persist = useCallback(
    async (outingId: number) => {
      const current = recorder.current;
      if (!current) return;
      unsaved.current = 0;
      lastSavedAt.current = Date.now();
      await saveOutingProgress(db, outingId, {
        distanceM: current.distanceM,
        track: decimateTrack(current.points, MAX_STORED_POINTS),
      });
    },
    [db],
  );

  const begin = useCallback(
    async (outing: OutingWithTrack, track: TrackRecorder) => {
      const since = Date.now();
      recorder.current = track;
      latest.current = null;
      unsaved.current = 0;
      lastSavedAt.current = since;
      setDistanceM(track.distanceM);
      setActive(outing);
      setNow(since);

      await tracker.current.start((fix) => {
        const age = Date.now() - fix.timestamp;
        if (fix.timestamp < since - FIX_MAX_AGE_AT_START_MS || age < -FIX_MAX_CLOCK_SKEW_MS) return;
        // Ignore a late fix from an outing that has already finished.
        if (recorder.current !== track) return;
        latest.current = fix;
        if (!track.add(fix)) return;
        setDistanceM(track.distanceM);
        unsaved.current += 1;
        if (unsaved.current >= SAVE_EVERY_POINTS || Date.now() - lastSavedAt.current >= SAVE_EVERY_MS) {
          persist(outing.id).catch(() => undefined);
        }
      });
    },
    [persist],
  );

  const stopTracking = useCallback(() => {
    tracker.current.stop();
  }, []);

  const start = useCallback(
    async (kind: OutingKind): Promise<StartResult> => {
      if (busy.current || recorder.current) return { ok: true };
      busy.current = true;
      let createdId: number | null = null;
      try {
        const ready = await readiness();
        if (!ready.ok) return ready;
        const outing = await createOuting(db, { kind });
        createdId = outing.id;
        await begin({ ...outing, track: [] }, new TrackRecorder());
        notifyDataChanged();
        return { ok: true };
      } catch {
        stopTracking();
        recorder.current = null;
        setActive(null);
        if (createdId !== null) await deleteOuting(db, createdId).catch(() => undefined);
        return { ok: false, reason: 'error' };
      } finally {
        busy.current = false;
      }
    },
    [db, begin, stopTracking],
  );

  const finish = useCallback(async (): Promise<number | null> => {
    const track = recorder.current;
    if (busy.current || !active || !track) return null;
    busy.current = true;
    const outing = active;
    stopTracking();
    recorder.current = null;
    latest.current = null;
    try {
      await finishOuting(db, outing.id, {
        distanceM: track.distanceM,
        track: decimateTrack(track.points, MAX_STORED_POINTS),
      });
      return outing.id;
    } catch {
      // The outing stays open in the database with its last saved progress, so the
      // next launch offers to continue or finish it.
      return null;
    } finally {
      setActive(null);
      setDistanceM(0);
      notifyDataChanged();
      busy.current = false;
    }
  }, [active, db, stopTracking]);

  const resume = useCallback(async (): Promise<StartResult> => {
    if (busy.current || !recovering) return { ok: true };
    busy.current = true;
    const outing = recovering;
    try {
      const ready = await readiness();
      if (!ready.ok) return ready;
      // It may have been deleted or finished from its own screen in the meantime.
      const current = await getOuting(db, outing.id);
      if (!current || current.endedAt !== null) {
        setRecovering(null);
        return { ok: true };
      }
      setRecovering(null);
      await begin(current, new TrackRecorder(current.track, current.distanceM));
      return { ok: true };
    } catch {
      stopTracking();
      recorder.current = null;
      setActive(null);
      setRecovering(outing);
      return { ok: false, reason: 'error' };
    } finally {
      busy.current = false;
    }
  }, [recovering, db, begin, stopTracking]);

  const endRecovered = useCallback(async () => {
    if (busy.current || !recovering) return;
    busy.current = true;
    const outing = recovering;
    setRecovering(null);
    try {
      const current = await getOuting(db, outing.id);
      if (current && current.endedAt === null) {
        await finishOuting(db, current.id, {
          endedAt: await lastActivity(db, current),
          distanceM: current.distanceM,
          track: current.track,
        });
      }
    } finally {
      notifyDataChanged();
      busy.current = false;
    }
  }, [recovering, db]);

  // Pick up an outing that was open when the app last closed.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getActiveOuting(db)
      .then(async (outing) => {
        if (cancelled || !outing || tracker.current.isRunning) return;
        const endedAt = await lastActivity(db, outing);
        if (Date.now() - endedAt > STALE_AFTER_MS) {
          await finishOuting(db, outing.id, { endedAt, distanceM: outing.distanceM, track: outing.track });
          notifyDataChanged();
        } else if (!cancelled) {
          setRecovering(outing);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [db, loaded]);

  // Keep the shown outing in step with the database: a rename on the outing screen, or
  // an outing waiting for a decision that was deleted or finished there.
  const activeId = active?.id ?? null;
  const recoveringId = recovering?.id ?? null;
  useEffect(() => {
    if (activeId === null && recoveringId === null) return undefined;
    return subscribeToDataChanges(() => {
      if (activeId !== null) {
        getOuting(db, activeId)
          .then((row) => {
            if (row) {
              setActive((current) => (current?.id === row.id && current.name !== row.name ? { ...current, name: row.name } : current));
            } else if (recorder.current && !busy.current) {
              // Deleted, for example by "Delete all notes". Stop recording into a row
              // that no longer exists, or every new note would fail to save.
              stopTracking();
              recorder.current = null;
              latest.current = null;
              setActive(null);
              setDistanceM(0);
            }
          })
          .catch(() => undefined);
      }
      if (recoveringId !== null) {
        getOuting(db, recoveringId)
          .then((row) => {
            if (!row || row.endedAt !== null) setRecovering((current) => (current?.id === recoveringId ? null : current));
          })
          .catch(() => undefined);
      }
    });
  }, [db, activeId, recoveringId, stopTracking]);

  // The screen stays on during an outing when the setting is on. Changing the setting
  // mid-outing applies right away.
  const keepAwake = activeId !== null && settings.keepScreenOn;
  useEffect(() => {
    if (!keepAwake) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [keepAwake]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => stopTracking, [stopTracking]);

  const latestFix = useCallback((): Fix | null => {
    const fix = latest.current;
    return fix && Date.now() - fix.timestamp < RECENT_FIX_MS ? fix : null;
  }, []);

  const value = useMemo<OutingContextValue>(
    () => ({
      active,
      distanceM,
      elapsedS: active ? Math.max(0, Math.floor((now - active.startedAt) / 1000)) : 0,
      recovering,
      start,
      finish,
      resume,
      endRecovered,
      latestFix,
    }),
    [active, distanceM, now, recovering, start, finish, resume, endRecovered, latestFix],
  );

  return <OutingContext.Provider value={value}>{children}</OutingContext.Provider>;
}

export function useOuting(): OutingContextValue {
  const value = useContext(OutingContext);
  if (!value) throw new Error('useOuting must be used inside OutingProvider');
  return value;
}
