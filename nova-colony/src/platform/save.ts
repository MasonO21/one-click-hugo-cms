/**
 * SaveManager — autosave, rotating local backups, versioned migrations, cloud sync and
 * account-recovery codes. Goal: never lose hours of progress.
 *
 * Safety net, from the inside out:
 *  1. Every write is a checksummed envelope ("NCS1:<crc>:<json>"), so truncated writes are detected.
 *  2. Saves are refused (and the old good save kept) if the in-memory state is structurally broken.
 *  3. Three rotating compressed backups (one every 5 min). If the main save is corrupt, `load()`
 *     falls back to the newest backup that validates and heals the main slot.
 *  4. A corrupt payload is quarantined (not deleted) for support.
 *  5. Optional cloud copy every few minutes; at boot the save with the larger `playTime` wins (the
 *     loser is backed up first).
 *  6. Recovery codes: compressed, checksummed text the player can keep anywhere.
 *
 * Autosave triggers: every `balance.autosaveSeconds` of play, when the app is hidden/paused (browser
 * visibilitychange/pagehide and Capacitor App pause), and shortly after valuable moments
 * (purchases, ad rewards, daily claims, tier-ups).
 *
 * OWNER: meta agent.
 */
import type { Game } from '../core/Game';
import { deserializeState, serializeState, type GameState } from '../core/state';
import type { PlatformServices } from './types';
import { decodeRecovery, encodeRecovery, unwrapSave, wrapSave } from './saveCodec';
import { migrateState, validateState } from './saveMigrate';
import { onBackground } from './lifecycle';
import { installPlatformHooks } from './hooks';
import { withTimeout } from './env';

/** Main save slot (unchanged from the first placeholder so existing saves keep loading). */
export const SAVE_KEY = 'nova_colony_save_v1';
export const BACKUP_KEYS = ['nova_colony_backup_0', 'nova_colony_backup_1', 'nova_colony_backup_2'] as const;
const CORRUPT_KEY = 'nova_colony_save_corrupt';

export const BACKUP_INTERVAL_MS = 5 * 60_000;
export const CLOUD_INTERVAL_MS = 3 * 60_000;
/** Cloud wins at boot only when it is more than this many seconds of play ahead of the local save. */
const CLOUD_PREFER_MARGIN_S = 5;
const SAVE_SOON_MS = 1500;
const FLUSH_DEBOUNCE_MS = 400;
const CLOUD_BOOT_TIMEOUT_MS = 4000;

declare module '../core/Game' {
  interface Game {
    /** The attached SaveManager (set by `SaveManager.attach`). UI uses it for recovery codes / backups. */
    saves?: SaveManager;
  }
}

interface BackupRecord {
  at: number;
  playTime: number;
  reason: string;
  /** A recovery code (compressed + checksummed). */
  code: string;
}

export interface BackupInfo {
  slot: number;
  /** Epoch ms the backup was taken. */
  at: number;
  playTime: number;
  reason: string;
}

export interface SaveManagerOptions {
  /** Install analytics / haptics / native-chrome hooks in `attach` (default true). */
  hooks?: boolean;
  /** Reload the app ~1.5 s after a successful import/restore so it takes effect (default true; no-op outside a browser). */
  autoRestart?: boolean;
  /** Injectable clock for tests (default: the attached game's clock, else Date.now). */
  now?: () => number;
}

let activeManager: SaveManager | null = null;

/** The SaveManager attached to the running game (UI convenience; also available as `game.saves`). */
export function activeSaveManager(): SaveManager | null {
  return activeManager;
}

function parseState(json: string): GameState {
  let raw: unknown;
  try {
    raw = deserializeState(json);
  } catch {
    throw new Error('The data does not contain a valid save');
  }
  return migrateState(raw);
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class SaveManager {
  /** Human-readable reason the last import/restore failed (null when it succeeded). */
  lastError: string | null = null;

  private game: Game | null = null;
  private locked = false;
  private offs: Array<() => void> = [];
  private lastSavePlay = 0;
  private lastBackupAt: number | null = null;
  private lastCloudAt = 0;
  private lastFlushAt = 0;
  private backupBusy = false;
  private cloudBusy = false;
  private failureShown = false;
  private soonTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly services: PlatformServices,
    private readonly opts: SaveManagerOptions = {},
  ) {}

  private now(): number {
    return this.opts.now ? this.opts.now() : this.game ? this.game.now() : Date.now();
  }

  // ================================================================ load

  /**
   * Load the best available save: main slot, else newest valid backup; then compare with the cloud copy.
   * Returns null for a brand-new install (caller starts a fresh game).
   */
  async load(): Promise<GameState | null> {
    let best = await this.loadLocal();
    const cloud = await this.pullCloud();
    if (cloud && (!best || cloud.playTime > best.playTime + CLOUD_PREFER_MARGIN_S)) {
      if (best) await this.writeBackup(serializeState(best), 'before-cloud', best.playTime);
      best = cloud;
      await this.writeRaw(SAVE_KEY, wrapSave(serializeState(cloud)));
    }
    return best;
  }

  private parse(raw: string): { state?: GameState; error?: string } {
    const u = unwrapSave(raw);
    if ('error' in u) return { error: u.error };
    try {
      return { state: parseState(u.json) };
    } catch (e) {
      return { error: msg(e) };
    }
  }

  private async loadLocal(): Promise<GameState | null> {
    let raw: string | null = null;
    try {
      raw = await this.services.store.get(SAVE_KEY);
    } catch (e) {
      console.error('[save] could not read the main save', e);
    }
    if (raw) {
      const r = this.parse(raw);
      if (r.state) return r.state;
      console.error('[save] main save is unusable:', r.error);
      await this.quarantine(raw);
    }
    for (const { slot, rec } of await this.readBackups()) {
      try {
        const state = parseState(await decodeRecovery(rec.code));
        console.warn(`[save] recovered from backup slot ${slot} (taken ${new Date(rec.at).toISOString()})`);
        await this.writeRaw(SAVE_KEY, wrapSave(serializeState(state))); // heal the main slot
        return state;
      } catch (e) {
        console.error(`[save] backup slot ${slot} is unusable`, e);
      }
    }
    return null;
  }

  private async quarantine(raw: string): Promise<void> {
    try {
      await this.services.store.set(CORRUPT_KEY, raw);
    } catch {
      /* no room to keep it — fine */
    }
  }

  private async pullCloud(): Promise<GameState | null> {
    const cloud = this.services.cloud;
    if (!cloud.available()) return null;
    try {
      const code = await withTimeout(cloud.download(), CLOUD_BOOT_TIMEOUT_MS, null);
      return code ? parseState(await decodeRecovery(code)) : null;
    } catch (e) {
      console.warn('[save] cloud save unusable', e);
      return null;
    }
  }

  // ================================================================ save

  /** Write the main save now (then maybe a backup / cloud upload). The write is initiated synchronously. */
  async save(game: Game, auto = true): Promise<void> {
    if (this.locked) return;
    const problem = validateState(game.state);
    if (problem) {
      this.reportFailure(`state is invalid (${problem}) — keeping the previous save`);
      return;
    }
    let json: string;
    try {
      json = serializeState(game.state);
    } catch (e) {
      this.reportFailure(`could not serialize state: ${msg(e)}`);
      return;
    }
    this.lastSavePlay = game.state.playTime;
    const ok = await this.writeRaw(SAVE_KEY, wrapSave(json));
    if (!ok) {
      this.reportFailure('storage write failed');
      return;
    }
    this.failureShown = false;
    game.bus.emit('game:saved', { auto });
    await this.maybeBackup(json, game.state.playTime);
    void this.maybeCloud(json);
  }

  /** Save immediately (app going to background, before a reload). */
  flush(): Promise<void> {
    const game = this.game;
    if (!game || this.locked) return Promise.resolve();
    const now = this.now();
    if (now - this.lastFlushAt < FLUSH_DEBOUNCE_MS) return Promise.resolve();
    this.lastFlushAt = now;
    void this.services.analytics.flush();
    void this.uploadCloud(true);
    return this.save(game, false);
  }

  /** Is saving suspended (after an import/restore, until the app reloads)? */
  isLocked(): boolean {
    return this.locked;
  }

  /** Reload the app so an imported/restored save takes effect. */
  restart(): void {
    if (typeof location !== 'undefined') location.reload();
  }

  /** After a successful import/restore: let the UI show its confirmation, then reload into the new colony. */
  private scheduleRestart(): void {
    if (this.opts.autoRestart === false || typeof location === 'undefined') return;
    const t = setTimeout(() => this.restart(), 1500);
    (t as { unref?: () => void }).unref?.();
  }

  private reportFailure(why: string): void {
    this.lastError = why;
    console.error(`[save] ${why}`);
    if (!this.failureShown && this.game) {
      this.failureShown = true;
      this.game.toast("Couldn't save your progress — please free up some storage space", 'danger', '💾');
    }
  }

  /**
   * Write with quota recovery. The main save is the priority: if storage is full we sacrifice the
   * quarantined payload and then older backups (oldest first) until it fits. A backup write may only
   * displace one other backup — we never destroy the safety net to add to it.
   */
  private async writeRaw(key: string, value: string): Promise<boolean> {
    const isMain = key === SAVE_KEY;
    let freed = 0;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.services.store.set(key, value);
        return true;
      } catch (e) {
        if (attempt === 0) console.warn(`[save] write of ${key} failed, freeing space and retrying`, e);
        if (!(await this.freeSpace(key, freed++)) || (!isMain && freed > 2)) {
          console.error(`[save] write of ${key} failed`, e);
          return false;
        }
      }
    }
  }

  /** Free one more chunk of storage. Step 0 drops the quarantined payload, later steps the oldest backups. */
  private async freeSpace(writingKey: string, step: number): Promise<boolean> {
    try {
      if (step === 0) {
        await this.services.store.remove(CORRUPT_KEY);
        return true;
      }
      const others = (await this.readBackups()).filter((b) => BACKUP_KEYS[b.slot] !== writingKey);
      const oldest = others[others.length - 1];
      if (!oldest) return false;
      await this.services.store.remove(BACKUP_KEYS[oldest.slot]);
      return true;
    } catch {
      return false;
    }
  }

  // ================================================================ backups

  private async readBackups(): Promise<{ slot: number; rec: BackupRecord }[]> {
    const out: { slot: number; rec: BackupRecord }[] = [];
    for (let slot = 0; slot < BACKUP_KEYS.length; slot++) {
      try {
        const raw = await this.services.store.get(BACKUP_KEYS[slot]);
        if (!raw) continue;
        const rec = JSON.parse(raw) as BackupRecord;
        if (typeof rec?.code === 'string' && Number.isFinite(rec.at)) out.push({ slot, rec });
      } catch {
        /* unreadable slot is simply skipped */
      }
    }
    return out.sort((a, b) => b.rec.at - a.rec.at); // newest first
  }

  private async maybeBackup(json: string, playTime: number): Promise<void> {
    if (this.backupBusy) return;
    if (this.lastBackupAt === null) this.lastBackupAt = (await this.readBackups())[0]?.rec.at ?? 0;
    if (this.now() - this.lastBackupAt < BACKUP_INTERVAL_MS) return;
    await this.writeBackup(json, 'auto', playTime);
  }

  /** Write a backup into an empty slot, else over the oldest one (never `avoidSlot`). */
  private async writeBackup(json: string, reason: string, playTime: number, avoidSlot = -1): Promise<boolean> {
    this.backupBusy = true;
    try {
      const existing = await this.readBackups();
      let slot = BACKUP_KEYS.findIndex((_, i) => i !== avoidSlot && !existing.some((e) => e.slot === i));
      if (slot < 0) slot = [...existing].reverse().find((e) => e.slot !== avoidSlot)?.slot ?? 0;
      const at = this.now();
      const rec: BackupRecord = { at, playTime, reason, code: await encodeRecovery(json) };
      const ok = await this.writeRaw(BACKUP_KEYS[slot], JSON.stringify(rec));
      if (ok) this.lastBackupAt = at;
      return ok;
    } catch (e) {
      console.warn('[save] backup failed', e);
      return false;
    } finally {
      this.backupBusy = false;
    }
  }

  /** Backups currently on this device, newest first (Settings "Restore from backup"). */
  async listBackups(): Promise<BackupInfo[]> {
    return (await this.readBackups()).map(({ slot, rec }) => ({ slot, at: rec.at, playTime: rec.playTime, reason: rec.reason }));
  }

  /** Back up whatever the player has right now before something replaces it. */
  private async backupCurrent(reason: string, avoidSlot = -1): Promise<void> {
    try {
      if (this.game && !validateState(this.game.state)) {
        await this.writeBackup(serializeState(this.game.state), reason, this.game.state.playTime, avoidSlot);
        return;
      }
      const raw = await this.services.store.get(SAVE_KEY);
      const u = raw ? unwrapSave(raw) : null;
      if (u && 'json' in u) await this.writeBackup(u.json, reason, (JSON.parse(u.json) as { playTime?: number }).playTime ?? 0, avoidSlot);
    } catch (e) {
      console.warn('[save] could not back up the current save', e);
    }
  }

  /**
   * Replace the main save with a backup. The current save is backed up first, then saving is
   * suspended and the app reloads itself (`autoRestart`) to continue with the restored colony.
   */
  async restoreBackup(slot: number): Promise<boolean> {
    this.lastError = null;
    try {
      const found = (await this.readBackups()).find((b) => b.slot === slot);
      if (!found) throw new Error('That backup no longer exists');
      const state = parseState(await decodeRecovery(found.rec.code));
      await this.backupCurrent('before-restore', slot);
      if (!(await this.writeRaw(SAVE_KEY, wrapSave(serializeState(state))))) throw new Error('Could not write the restored save');
      this.locked = true;
      this.scheduleRestart();
      return true;
    } catch (e) {
      this.lastError = msg(e);
      return false;
    }
  }

  // ================================================================ recovery codes

  /** The current colony as a recovery code (compressed, checksummed text). */
  async exportRecoveryCode(): Promise<string> {
    if (this.game && !validateState(this.game.state)) return encodeRecovery(serializeState(this.game.state));
    const raw = await this.services.store.get(SAVE_KEY);
    const u = raw ? unwrapSave(raw) : null;
    if (!u || 'error' in u) throw new Error('There is no save to export yet');
    return encodeRecovery(u.json);
  }

  /**
   * Replace the save with the one inside a recovery code. The current save is backed up first and
   * saving is suspended so the running game cannot overwrite the import; the app then reloads itself
   * after ~1.5 s (`autoRestart`, or call `restart()`). Returns false and sets `lastError` if the code
   * is invalid.
   */
  async importRecoveryCode(code: string): Promise<boolean> {
    this.lastError = null;
    try {
      const state = parseState(await decodeRecovery(code));
      const bad = validateState(state);
      if (bad) throw new Error(`The save inside the code is not valid (${bad})`);
      await this.backupCurrent('before-import');
      if (!(await this.writeRaw(SAVE_KEY, wrapSave(serializeState(state))))) throw new Error('Could not write the imported save');
      this.locked = true;
      this.scheduleRestart();
      return true;
    } catch (e) {
      this.lastError = msg(e);
      return false;
    }
  }

  // ================================================================ cloud

  /** Cloud-save recovery id to show in Settings (null when cloud saves are not configured). */
  cloudRecoveryId(): string | null {
    return (this.services.cloud as { recoveryId?: () => string | null }).recoveryId?.() ?? null;
  }

  /** Point this device at another save's recovery id; the next launch pulls that save if it is further along. */
  async setCloudRecoveryId(id: string): Promise<boolean> {
    return (await (this.services.cloud as { setRecoveryId?: (id: string) => Promise<boolean> }).setRecoveryId?.(id)) ?? false;
  }

  private async maybeCloud(json: string): Promise<void> {
    if (this.now() - this.lastCloudAt < CLOUD_INTERVAL_MS) return;
    await this.uploadCloud(false, json);
  }

  private async uploadCloud(force: boolean, json?: string): Promise<void> {
    const cloud = this.services.cloud;
    if (this.cloudBusy || this.locked || !cloud.available() || !this.game) return;
    if (!force && this.now() - this.lastCloudAt < CLOUD_INTERVAL_MS) return;
    this.cloudBusy = true;
    try {
      const body = json ?? (validateState(this.game.state) ? null : serializeState(this.game.state));
      if (!body) return;
      if (await cloud.upload(await encodeRecovery(body))) this.lastCloudAt = this.now();
    } catch (e) {
      console.warn('[save] cloud upload failed', e);
    } finally {
      this.cloudBusy = false;
    }
  }

  // ================================================================ lifecycle

  /** Hook autosave timers / lifecycle events. Call once, after `game.start()`. */
  attach(game: Game): void {
    this.detach();
    this.game = game;
    game.saves = this;
    activeManager = this;
    this.lastSavePlay = game.state.playTime;
    if (typeof window !== 'undefined') (window as unknown as { saves?: SaveManager }).saves = this; // Settings panel + debugging
    const bus = game.bus;
    this.offs.push(
      bus.on('tick:second', ({ playTime }) => {
        if (playTime - this.lastSavePlay >= game.data.balance.autosaveSeconds) void this.save(game, true);
      }),
    );
    for (const ev of ['iap:purchased', 'ad:rewarded', 'daily:claimed', 'colony:tierUp', 'spin:result'] as const) {
      this.offs.push(bus.on(ev, () => this.saveSoon()));
    }
    this.offs.push(onBackground(() => void this.flush()));
    if (this.opts.hooks !== false) this.offs.push(installPlatformHooks(game));
  }

  /** Stop timers and listeners (tests / hot reload). */
  detach(): void {
    this.offs.forEach((f) => f());
    this.offs = [];
    if (this.soonTimer) clearTimeout(this.soonTimer);
    this.soonTimer = null;
    if (activeManager === this) activeManager = null;
    if (typeof window !== 'undefined' && (window as unknown as { saves?: SaveManager }).saves === this) delete (window as unknown as { saves?: SaveManager }).saves;
    this.game = null;
  }

  private saveSoon(): void {
    if (this.soonTimer || !this.game) return;
    this.soonTimer = setTimeout(() => {
      this.soonTimer = null;
      if (this.game) void this.save(this.game, false);
    }, SAVE_SOON_MS);
    (this.soonTimer as { unref?: () => void }).unref?.();
  }
}
