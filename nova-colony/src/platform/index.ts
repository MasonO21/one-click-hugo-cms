/**
 * Platform service factory: picks Capacitor native adapters on iOS/Android and web implementations
 * otherwise. OWNER: meta agent. (Placeholder returns mocks.)
 */
import type { PlatformServices } from './types';
import { createMockServices } from './mock';

export async function createPlatformServices(): Promise<PlatformServices> {
  return createMockServices();
}
