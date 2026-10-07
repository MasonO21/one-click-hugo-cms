/**
 * Key-value stores: Capacitor Preferences on iOS/Android (survives WebView storage eviction),
 * localStorage on the web (with an in-memory fallback when storage is blocked, e.g. private mode).
 * OWNER: meta agent.
 */
import type { KeyValueStore } from './types';

/**
 * localStorage-backed store. IMPORTANT: `set` performs the write synchronously (before its first
 * await) so the SaveManager can flush inside `pagehide` / `visibilitychange` handlers.
 * Quota errors are re-thrown so the caller can free space; a missing/blocked localStorage silently
 * degrades to memory for this session.
 */
export class LocalStorageStore implements KeyValueStore {
  private readonly mem = new Map<string, string>();
  private readonly ls: Storage | null;

  constructor() {
    let ls: Storage | null = null;
    try {
      const s = (globalThis as { localStorage?: Storage }).localStorage;
      if (s) {
        s.setItem('__nova_probe__', '1');
        s.removeItem('__nova_probe__');
        ls = s;
      }
    } catch {
      ls = null;
    }
    this.ls = ls;
  }

  /** True when data actually persists across sessions. */
  get persistent(): boolean {
    return this.ls !== null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.ls) return this.mem.get(key) ?? null;
    try {
      return this.ls.getItem(key);
    } catch {
      return this.mem.get(key) ?? null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.ls) {
      this.mem.set(key, value);
      return;
    }
    this.ls.setItem(key, value); // may throw QuotaExceededError — deliberate
  }

  async remove(key: string): Promise<void> {
    this.mem.delete(key);
    try {
      this.ls?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

type PreferencesPlugin = typeof import('@capacitor/preferences').Preferences;

/** Capacitor Preferences (UserDefaults / SharedPreferences). The plugin is loaded lazily. */
export class PreferencesStore implements KeyValueStore {
  private plugin: Promise<PreferencesPlugin> | null = null;

  private load(): Promise<PreferencesPlugin> {
    this.plugin ??= import('@capacitor/preferences').then((m) => m.Preferences);
    return this.plugin;
  }

  async get(key: string): Promise<string | null> {
    const p = await this.load();
    return (await p.get({ key })).value;
  }

  async set(key: string, value: string): Promise<void> {
    const p = await this.load();
    await p.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    const p = await this.load();
    await p.remove({ key });
  }
}
