import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

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

export const persistStorage = () => createJSONStorage(() => safeStorage);
