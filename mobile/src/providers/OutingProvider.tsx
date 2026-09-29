import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { notifyDataChanged } from '@/db/events';
import {
  createOuting,
  deleteOuting,
  finishOuting,
  getActiveOuting,
  saveOutingProgress,
} from '@/db/repository';
import type { OutingWithTrack } from '@/db/types';
import type { OutingKind } from '@/domain/format';
import { decimateTrack, TrackRecorder, type Fix } from '@/domain/track';
import { LocationTracker, requestLocationPermission } from '@/services/location';
import { useSettings } from './SettingsProvider';
import { useDatabase } from './useDatabase';

const KEEP_AWAKE_TAG = 'trailnotes-outing';
const MAX_STORED_POINTS = 2000;
const SAVE_EVERY_POINTS = 20;
const SAVE_EVERY_MS = 60_000;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;
const RECENT_FIX_MS = 2 * 60 * 1000;

export type StartResult = { ok: true } | { ok: false; reason: 'denied' | 'blocked' | 'error' };

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
  const keepScreenOn = useRef(settings.keepScreenOn);
  useEffect(() => {
    keepScreenOn.current = settings.keepScreenOn;
  }, [settings.keepScreenOn]);

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
      recorder.current = track;
      latest.current = null;
      unsaved.current = 0;
      lastSavedAt.current = Date.now();
      setDistanceM(track.distanceM);
      setActive(outing);
      setNow(Date.now());

      await tracker.current.start((fix) => {
        latest.current = fix;
        if (!recorder.current?.add(fix)) return;
        setDistanceM(recorder.current.distanceM);
        unsaved.current += 1;
        if (unsaved.current >= SAVE_EVERY_POINTS || Date.now() - lastSavedAt.current >= SAVE_EVERY_MS) {
          persist(outing.id).catch(() => undefined);
        }
      });

      if (keepScreenOn.current) activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    },
    [persist],
  );

  const stopTracking = useCallback(() => {
    tracker.current.stop();
    deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, []);

  const start = useCallback(
    async (kind: OutingKind): Promise<StartResult> => {
      const permission = await requestLocationPermission();
      if (permission !== 'granted') return { ok: false, reason: permission };
      let createdId: number | null = null;
      try {
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
      }
    },
    [db, begin, stopTracking],
  );

  const finish = useCallback(async (): Promise<number | null> => {
    if (!active || !recorder.current) return null;
    stopTracking();
    const outing = active;
    const track = recorder.current;
    await finishOuting(db, outing.id, {
      distanceM: track.distanceM,
      track: decimateTrack(track.points, MAX_STORED_POINTS),
    });
    recorder.current = null;
    latest.current = null;
    setActive(null);
    setDistanceM(0);
    notifyDataChanged();
    return outing.id;
  }, [active, db, stopTracking]);

  const resume = useCallback(async (): Promise<StartResult> => {
    if (!recovering) return { ok: false, reason: 'error' };
    const permission = await requestLocationPermission();
    if (permission !== 'granted') return { ok: false, reason: permission };
    const outing = recovering;
    try {
      setRecovering(null);
      await begin(outing, new TrackRecorder(outing.track, outing.distanceM));
      return { ok: true };
    } catch {
      stopTracking();
      recorder.current = null;
      setActive(null);
      setRecovering(outing);
      return { ok: false, reason: 'error' };
    }
  }, [recovering, begin, stopTracking]);

  const endRecovered = useCallback(async () => {
    if (!recovering) return;
    const outing = recovering;
    const lastPoint = outing.track[outing.track.length - 1];
    setRecovering(null);
    await finishOuting(db, outing.id, {
      endedAt: lastPoint ? lastPoint[2] : outing.startedAt,
      distanceM: outing.distanceM,
      track: outing.track,
    });
    notifyDataChanged();
  }, [recovering, db]);

  // Pick up an outing that was open when the app last closed.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getActiveOuting(db)
      .then(async (outing) => {
        if (cancelled || !outing || tracker.current.isRunning) return;
        const lastPoint = outing.track[outing.track.length - 1];
        const lastActivity = lastPoint ? lastPoint[2] : outing.startedAt;
        if (Date.now() - lastActivity > STALE_AFTER_MS) {
          await finishOuting(db, outing.id, { endedAt: lastActivity, distanceM: outing.distanceM, track: outing.track });
          notifyDataChanged();
        } else {
          setRecovering(outing);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [db, loaded]);

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
