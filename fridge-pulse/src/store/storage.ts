import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware';

const memory = new Map<string, string>();

/**
 * AsyncStorage that never throws. In a browser, storage can be blocked or unavailable
 * (private windows, sandboxed frames). A rejected read would leave a persisted store
 * "not hydrated" forever and the app would never leave its splash screen, so failures
 * fall back to memory: state then lasts for the session instead of breaking the app.
 */
export const safeStorage: StateStorage = {
  async getItem(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  async setItem(key, value) {
    memory.set(key, value);
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // Kept in memory above.
    }
  },
  async removeItem(key) {
    memory.delete(key);
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Nothing else to do.
    }
  },
};

/**
 * JSON storage for a persisted store that always finishes loading. A saved value that cannot be
 * read (cut short, or damaged) would otherwise leave the store "not hydrated" and the app on its
 * splash screen at every launch; instead it is set aside under `<name>.unreadable` and the store
 * starts afresh.
 */
export function persistStorage<S>(): PersistStorage<S> {
  const json = createJSONStorage<S>(() => safeStorage)!;
  return {
    getItem: async (name) => {
      try {
        return await json.getItem(name);
      } catch {
        const raw = await safeStorage.getItem(name);
        if (raw != null) await safeStorage.setItem(`${name}.unreadable`, raw);
        return null;
      }
    },
    setItem: (name, value) => json.setItem(name, value),
    removeItem: (name) => json.removeItem(name),
  };
}
