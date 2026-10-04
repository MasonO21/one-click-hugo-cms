import { isDemoMode } from '../lib/api';
import { noProvider, sampleProvider } from './sample';
import type { HealthProvider } from './types';

/**
 * Web (and anything that is not iOS or Android): the preview shows sample data so the screens can be
 * tried; a real web build has no health store. iOS and Android use provider.ios.ts / provider.android.ts.
 */
export function createProvider(): HealthProvider {
  return isDemoMode ? sampleProvider() : noProvider();
}
