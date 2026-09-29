import type { DistanceUnit, TemperatureUnit } from '@/domain/units';
import { getAllSettings, setSetting } from './repository';
import type { Database } from './types';

export interface Settings {
  onboarded: boolean;
  temperatureUnit: TemperatureUnit | 'auto';
  distanceUnit: DistanceUnit | 'auto';
  // Ask the phone to keep speech recognition on the device when it can.
  onDeviceSpeech: boolean;
  keepScreenOn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  temperatureUnit: 'auto',
  distanceUnit: 'auto',
  onDeviceSpeech: true,
  keepScreenOn: true,
};

export function parseSettings(raw: Record<string, string>): Settings {
  const temperature = raw.temperatureUnit;
  const distance = raw.distanceUnit;
  return {
    onboarded: raw.onboarded === '1',
    temperatureUnit: temperature === 'c' || temperature === 'f' ? temperature : 'auto',
    distanceUnit: distance === 'km' || distance === 'mi' ? distance : 'auto',
    onDeviceSpeech: raw.onDeviceSpeech === undefined ? DEFAULT_SETTINGS.onDeviceSpeech : raw.onDeviceSpeech === '1',
    keepScreenOn: raw.keepScreenOn === undefined ? DEFAULT_SETTINGS.keepScreenOn : raw.keepScreenOn === '1',
  };
}

export async function loadSettings(db: Database): Promise<Settings> {
  return parseSettings(await getAllSettings(db));
}

export async function saveSetting<K extends keyof Settings>(db: Database, key: K, value: Settings[K]) {
  const stored = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
  await setSetting(db, key, stored);
}
