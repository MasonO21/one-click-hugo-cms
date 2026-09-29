import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getLocales } from 'expo-localization';
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from '@/db/settings';
import { defaultDistanceUnit, defaultTemperatureUnit, type DistanceUnit, type TemperatureUnit } from '@/domain/units';
import { useDatabase } from './useDatabase';

interface SettingsContextValue {
  loaded: boolean;
  settings: Settings;
  units: { temperature: TemperatureUnit; distance: DistanceUnit };
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings(db)
      .then((value) => {
        if (!cancelled) setSettings(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  const update = useCallback(
    async <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
      await saveSetting(db, key, value);
    },
    [db],
  );

  const value = useMemo<SettingsContextValue>(() => {
    const locale = getLocales()[0];
    return {
      loaded,
      settings,
      units: {
        temperature: settings.temperatureUnit === 'auto' ? defaultTemperatureUnit(locale) : settings.temperatureUnit,
        distance: settings.distanceUnit === 'auto' ? defaultDistanceUnit(locale) : settings.distanceUnit,
      },
      update,
    };
  }, [loaded, settings, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside SettingsProvider');
  return value;
}
