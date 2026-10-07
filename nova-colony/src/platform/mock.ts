/**
 * In-memory / no-op platform services. Used by unit tests and as the fallback on web.
 * (The meta agent provides real web + Capacitor implementations in src/platform/index.ts.)
 */
import type { PlatformServices, KeyValueStore } from './types';

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  async get(key: string) {
    return this.m.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.m.set(key, value);
  }
  async remove(key: string) {
    this.m.delete(key);
  }
}

export function createMockServices(opts: { adResult?: 'rewarded' | 'skipped' | 'unavailable' } = {}): PlatformServices {
  const owned = new Set<string>();
  let txn = 0;
  let ids: string[] = [];
  return {
    platform: 'web',
    store: new MemoryStore(),
    ads: {
      isReady: () => true,
      showRewarded: async () => opts.adResult ?? 'rewarded',
    },
    iap: {
      init: async (products) => {
        ids = products.map((p) => p.id);
      },
      products: () => ids.map((id) => ({ id, price: '', available: true })),
      purchase: async (productId) => {
        owned.add(productId);
        return { ok: true, productId, transactionId: `mock_${Date.now()}_${++txn}` };
      },
      restore: async () => [...owned],
    },
    analytics: {
      setConsent: () => {},
      track: () => {},
      flush: async () => {},
    },
    haptics: { tap: () => {}, success: () => {}, warning: () => {}, heavy: () => {} },
    cloud: {
      available: () => false,
      upload: async () => false,
      download: async () => null,
    },
  };
}
