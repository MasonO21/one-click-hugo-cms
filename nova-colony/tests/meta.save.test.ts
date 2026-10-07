import { afterEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, BACKUP_KEYS, BACKUP_INTERVAL_MS, CLOUD_INTERVAL_MS, SaveManager, activeSaveManager } from '../src/platform/save';
import { base64UrlToBytes, bytesToBase64Url, crcHex, decodeRecovery, encodeRecovery, unwrapSave, wrapSave } from '../src/platform/saveCodec';
import { MIGRATIONS, deepFill, migrateState, validateMarkers } from '../src/platform/saveMigrate';
import { createInitialState, deserializeState, serializeState, type GameState } from '../src/core/state';
import { MemoryStore } from '../src/platform/mock';
import type { KeyValueStore } from '../src/platform/types';
import { fakeBuilding, makeGame, makeServices, type TestGame } from './meta.helpers';

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** A store with a byte quota, like localStorage. */
class QuotaStore implements KeyValueStore {
  readonly m = new Map<string, string>();
  constructor(public limit = Infinity) {}
  async get(k: string) {
    return this.m.get(k) ?? null;
  }
  async set(k: string, v: string) {
    let total = v.length;
    for (const [key, val] of this.m) if (key !== k) total += val.length;
    if (total > this.limit) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this.m.set(k, v);
  }
  async remove(k: string) {
    this.m.delete(k);
  }
  usage() {
    let t = 0;
    for (const v of this.m.values()) t += v.length;
    return t;
  }
}

function setup(store: KeyValueStore = new MemoryStore()) {
  const g = makeGame();
  g.services.store = store;
  // give the colony some substance
  g.game.state.resources.amounts.wood = 123;
  g.game.state.resources.lifetime.wood = 999;
  g.game.state.buildings.list.push(fakeBuilding('shelter', 11), fakeBuilding('campfire', 12));
  g.game.state.buildings.nextId = 13;
  g.game.state.liveops.nova = 77;
  g.game.state.playTime = 1234.5;
  const saves = new SaveManager(g.services, { hooks: false, now: () => g.clock.now });
  return { ...g, saves, store };
}

const plain = (s: GameState) => JSON.parse(serializeState(s));

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { location?: unknown }).location;
});

describe('save: round trip', () => {
  it('saves and loads an identical state (including Infinity timers)', async () => {
    const t = setup();
    expect(t.game.state.combat.nextAt).toBe(Infinity);
    const saved = vi.fn();
    t.game.bus.on('game:saved', saved);
    await t.saves.save(t.game, true);
    expect(saved).toHaveBeenCalledWith({ auto: true });
    const raw = (await t.store.get(SAVE_KEY))!;
    expect(raw.startsWith('NCS1:')).toBe(true);
    const loaded = (await new SaveManager(t.services, { hooks: false }).load())!;
    expect(loaded.combat.nextAt).toBe(Infinity);
    expect(plain(loaded)).toEqual(plain(t.game.state));
  });

  it('returns null for a brand-new install', async () => {
    expect(await new SaveManager(makeServices()).load()).toBeNull();
  });

  it('a loaded save boots a game that continues from it', async () => {
    const t = setup();
    await t.saves.save(t.game);
    const loaded = (await new SaveManager(t.services).load())!;
    const g2 = makeGame({ state: loaded, at: t.clock.now + 3600_000 });
    expect(g2.game.fresh).toBe(false);
    expect(g2.game.state.liveops.nova).toBe(77);
    expect(g2.game.state.buildings.list.map((b) => b.def).slice(-2)).toEqual(['shelter', 'campfire']);
    expect(g2.game.state.stats.sessions).toBe(2);
  });

  it('accepts legacy raw-JSON saves written by the earlier placeholder manager', async () => {
    const t = setup();
    await t.store.set(SAVE_KEY, serializeState(t.game.state));
    const loaded = (await t.saves.load())!;
    expect(loaded.liveops.nova).toBe(77);
  });

  it('refuses to overwrite a good save with a structurally broken state', async () => {
    const t = setup();
    await t.saves.save(t.game);
    const before = await t.store.get(SAVE_KEY);
    delete (t.game.state as { buildings?: unknown }).buildings;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const toasts: string[] = [];
    t.game.bus.on('ui:toast', (e) => toasts.push(e.text));
    t.saves.attach(t.game);
    await t.saves.save(t.game);
    expect(await t.store.get(SAVE_KEY)).toBe(before);
    expect(t.saves.lastError).toContain('invalid');
    expect(errors).toHaveBeenCalled();
    expect(toasts).toHaveLength(1);
    await t.saves.save(t.game);
    expect(toasts).toHaveLength(1); // only warned once
    t.saves.detach();
  });
});

describe('save: corruption and backups', () => {
  it('detects a tampered/truncated save via the checksum', () => {
    const wrapped = wrapSave('{"hello":"world"}');
    expect(unwrapSave(wrapped)).toEqual({ json: '{"hello":"world"}' });
    expect('error' in unwrapSave(wrapped.slice(0, -3))).toBe(true);
    expect('error' in unwrapSave(wrapped.replace('world', 'wxrld'))).toBe(true);
    expect('error' in unwrapSave('garbage')).toBe(true);
    expect('error' in unwrapSave('NCS1:deadbeef')).toBe(true);
  });

  it('falls back to the newest valid backup when the main save is corrupt, and heals the main slot', async () => {
    const t = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await t.saves.save(t.game); // writes main + first backup
    expect((await t.saves.listBackups()).length).toBe(1);
    t.game.state.playTime = 2000;
    t.game.state.liveops.nova = 500;
    t.clock.now += BACKUP_INTERVAL_MS + 1000;
    await t.saves.save(t.game); // main + second (newer) backup
    t.game.state.playTime = 3000;
    await t.saves.save(t.game); // main only (backup is not due)

    // corrupt the main save: flip digits in the payload (checksum no longer matches)
    const raw = (await t.store.get(SAVE_KEY))!;
    await t.store.set(SAVE_KEY, raw.replace('"nova":500', '"nova":501'));
    const loaded = (await new SaveManager(t.services, { hooks: false }).load())!;
    expect(loaded.playTime).toBe(2000); // newest valid backup
    expect(loaded.liveops.nova).toBe(500);
    // main slot healed, corrupt payload quarantined for support
    const healed = unwrapSave((await t.store.get(SAVE_KEY))!);
    expect('json' in healed).toBe(true);
    expect(await t.store.get('nova_colony_save_corrupt')).toBe(raw.replace('"nova":500', '"nova":501'));
  });

  it('skips a corrupt backup and uses the next one', async () => {
    const t = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 1; i <= 3; i++) {
      t.game.state.playTime = i * 1000;
      t.clock.now += BACKUP_INTERVAL_MS + 1000;
      await t.saves.save(t.game);
    }
    const infos = await t.saves.listBackups();
    expect(infos.map((b) => b.playTime)).toEqual([3000, 2000, 1000]);
    await t.store.set(SAVE_KEY, 'not a save at all');
    await t.store.set(BACKUP_KEYS[infos[0].slot], '{"at": 1, "code": "NC1-00000000-AAAA"}'); // newest backup is garbage
    const loaded = (await new SaveManager(t.services, { hooks: false }).load())!;
    expect(loaded.playTime).toBe(2000);
  });

  it('returns null (fresh start) only when the main save and every backup are unusable', async () => {
    const t = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await t.store.set(SAVE_KEY, '{"oops": true}'); // valid JSON, not a save: must NOT be "repaired" into a blank colony
    expect(await t.saves.load()).toBeNull();
  });

  it('an empty/foreign JSON object is never mistaken for a save', () => {
    expect(validateMarkers({})).not.toBeNull();
    expect(validateMarkers([])).not.toBeNull();
    expect(validateMarkers(null)).not.toBeNull();
    expect(() => migrateState({ seed: 1 })).toThrow();
  });

  it('keeps 3 rotating backups, one per 5 minutes, newest first', async () => {
    const t = setup();
    for (let i = 1; i <= 5; i++) {
      t.game.state.playTime = i * 100;
      t.clock.now += BACKUP_INTERVAL_MS + 1000;
      await t.saves.save(t.game);
    }
    const infos = await t.saves.listBackups();
    expect(infos).toHaveLength(3);
    expect(infos.map((b) => b.playTime)).toEqual([500, 400, 300]);
    expect(infos.every((b) => b.reason === 'auto')).toBe(true);
    expect(new Set(infos.map((b) => b.slot)).size).toBe(3);
  });

  it('does not take another backup inside the 5 minute window', async () => {
    const t = setup();
    await t.saves.save(t.game);
    t.clock.now += BACKUP_INTERVAL_MS - 5000;
    t.game.state.playTime += 100;
    await t.saves.save(t.game);
    expect(await t.saves.listBackups()).toHaveLength(1);
    t.clock.now += 6000;
    await t.saves.save(t.game);
    expect(await t.saves.listBackups()).toHaveLength(2);
    // a restart does not reset the window (it reads the newest backup time)
    const again = new SaveManager(t.services, { hooks: false, now: () => t.clock.now });
    t.clock.now += 1000;
    await again.save(t.game);
    expect(await again.listBackups()).toHaveLength(2);
  });

  it('restoreBackup swaps the main save, backs up the current one first and suspends saving', async () => {
    const t = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    t.game.state.playTime = 111;
    await t.saves.save(t.game);
    t.game.state.playTime = 999;
    t.clock.now += BACKUP_INTERVAL_MS + 1000;
    await t.saves.save(t.game);
    const oldest = (await t.saves.listBackups()).at(-1)!;
    expect(oldest.playTime).toBe(111);
    expect(await t.saves.restoreBackup(oldest.slot)).toBe(true);
    expect(t.saves.isLocked()).toBe(true);
    const loaded = (await new SaveManager(t.services).load())!;
    expect(loaded.playTime).toBe(111);
    expect((await t.saves.listBackups()).some((b) => b.reason === 'before-restore' && b.playTime === 999)).toBe(true);
    // the running game can no longer overwrite what was restored
    t.game.state.playTime = 5000;
    await t.saves.save(t.game);
    expect((await new SaveManager(t.services).load())!.playTime).toBe(111);
    expect(await t.saves.restoreBackup(7)).toBe(false);
    expect(t.saves.lastError).toBeTruthy();
  });

  it('survives storage quota pressure by dropping the oldest backup', async () => {
    const store = new QuotaStore();
    const t = setup(store);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 1; i <= 3; i++) {
      t.game.state.playTime = i * 100;
      t.clock.now += BACKUP_INTERVAL_MS + 1000;
      await t.saves.save(t.game);
    }
    expect(store.m.size).toBe(4); // main + 3 backups
    // make the next main save bigger than the remaining room
    for (let i = 0; i < 400; i++) t.game.state.resources.lifetime[`filler_${i}`] = i + 1;
    // room for the bigger main save only if at least one (the oldest) backup is dropped
    const mainSize = wrapSave(serializeState(t.game.state)).length;
    const backupsTotal = BACKUP_KEYS.reduce((n, k) => n + (store.m.get(k)?.length ?? 0), 0);
    store.limit = mainSize + backupsTotal - 100;
    await t.saves.save(t.game);
    const raw = (await store.get(SAVE_KEY))!;
    expect(deserializeState((unwrapSave(raw) as { json: string }).json).resources.lifetime.filler_399).toBe(400);
    const left = await t.saves.listBackups();
    expect(left.length).toBeLessThan(3);
    expect(left.length).toBeGreaterThan(0); // only as many as needed were sacrificed
    expect(left[0].playTime).toBe(300); // the newest survived
    expect(t.saves.lastError).toBeNull();
  });
});

describe('save: migrations and repair', () => {
  const base = () => JSON.parse(serializeState(createInitialState(42, 1_700_000_000_000)));

  it('runs versioned migrations in order and stamps the final version', () => {
    const raw = base();
    raw.version = 1;
    const order: number[] = [];
    const out = migrateState(raw, {
      target: 4,
      migrations: {
        1: (s) => {
          order.push(1);
          s.settings.renamed = s.settings.music;
          return s;
        },
        2: (s) => {
          order.push(2);
          s.stats.legacy = 5;
          return s;
        },
        // 3 -> 4 has no migration: version is simply advanced
      },
    });
    expect(order).toEqual([1, 2]);
    expect(out.version).toBe(4);
    expect((out.settings as unknown as { renamed: number }).renamed).toBe(0.6);
    expect((out.stats as unknown as { legacy: number }).legacy).toBe(5);
  });

  it('ships an (empty) migration table for the current format', () => {
    expect(MIGRATIONS).toBeTypeOf('object');
    expect(migrateState(base()).version).toBeGreaterThanOrEqual(1);
  });

  it('fills fields added by newer builds and keeps unknown extras', () => {
    const raw = base();
    delete raw.liveops;
    delete raw.settings.haptics;
    delete raw.missions.counters;
    raw.somethingNew = { keep: true };
    raw.colony.name = 'Mine';
    const out = migrateState(raw);
    expect(out.liveops.nova).toBe(0);
    expect(out.liveops.boosts).toEqual([]);
    expect(out.settings.haptics).toBe(true);
    expect(out.missions.counters).toEqual({});
    expect(out.colony.name).toBe('Mine');
    expect((out as unknown as { somethingNew: unknown }).somethingNew).toEqual({ keep: true });
  });

  it('repairs NaN-ed numbers and junk entries instead of failing the whole save', () => {
    const raw = base();
    raw.resources.amounts = { wood: null, stone: 5, fiber: 'x' };
    raw.buildings.list = [{ id: 1, def: 'shelter', x: 3, z: 4 }, { id: 2, x: 1, z: 1 }, null, { id: 3, def: 'wall', x: NaN, z: 2 }];
    raw.liveops.nova = null;
    raw.playTime = 10;
    const out = migrateState(raw);
    expect(out.resources.amounts).toEqual({ stone: 5 });
    expect(out.buildings.list.map((b) => b.id)).toEqual([1]);
    expect(out.liveops.nova).toBe(0);
    expect(out.buildings.nextId).toBeGreaterThanOrEqual(2);
  });

  it('loads a save from a newer version best-effort rather than discarding it', () => {
    const raw = base();
    raw.version = 99;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(migrateState(raw).version).toBe(99);
  });

  it('deepFill replaces wrongly-typed slices with defaults', () => {
    const t: Record<string, any> = { a: 'x', b: [], c: { d: 1 } };
    deepFill(t, { a: 1, b: {}, c: { d: 2, e: 3 }, f: [1] });
    expect(t).toEqual({ a: 1, b: {}, c: { d: 1, e: 3 }, f: [1] });
  });
});

describe('save: recovery codes', () => {
  it('encodes to compressed ASCII and decodes back byte-for-byte', async () => {
    const json = serializeState(setup().game.state);
    const code = await encodeRecovery(json);
    expect(code).toMatch(/^NC1-[0-9a-f]{8}-[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(json.length);
    expect(await decodeRecovery(code)).toBe(json);
    // unicode survives
    const uni = JSON.stringify({ name: 'Nova — 新しい世界 🚀' });
    expect(await decodeRecovery(await encodeRecovery(uni))).toBe(uni);
  });

  it('exports from one device and imports on another with the same colony', async () => {
    const a = setup();
    a.saves.attach(a.game);
    const code = await a.saves.exportRecoveryCode();
    a.saves.detach();

    const b = setup(new MemoryStore());
    const bSaves = new SaveManager(b.services, { hooks: false });
    expect(await bSaves.importRecoveryCode(code)).toBe(true);
    expect(bSaves.lastError).toBeNull();
    const loaded = (await new SaveManager(b.services).load())!;
    expect(plain(loaded)).toEqual(plain(a.game.state));
  });

  it('exports the stored save when no game is attached', async () => {
    const t = setup();
    await t.saves.save(t.game);
    const code = await new SaveManager(t.services).exportRecoveryCode();
    const other = new SaveManager(makeServices());
    expect(await other.importRecoveryCode(code)).toBe(true);
    await expect(new SaveManager(makeServices()).exportRecoveryCode()).rejects.toThrow(/no save/i);
  });

  it('tolerates whitespace and line wrapping when pasted', async () => {
    const t = setup();
    t.saves.attach(t.game);
    const code = await t.saves.exportRecoveryCode();
    t.saves.detach();
    const wrapped = `  ${code.replace(/(.{64})/g, '$1\n')}  \n`;
    const into = new SaveManager(makeServices());
    expect(await into.importRecoveryCode(wrapped)).toBe(true);
  });

  it('rejects damaged, truncated and foreign codes with a readable reason and writes nothing', async () => {
    const t = setup();
    t.saves.attach(t.game);
    const code = await t.saves.exportRecoveryCode();
    t.saves.detach();
    const services = makeServices();
    const into = new SaveManager(services);
    const flipped = code.slice(0, 40) + (code[40] === 'A' ? 'B' : 'A') + code.slice(41);
    for (const bad of [flipped, code.slice(0, -10), 'hello', '', `NC1-${crcHex('!!')}-!!`]) {
      expect(await into.importRecoveryCode(bad)).toBe(false);
      expect(into.lastError).toBeTruthy();
    }
    expect(into.lastError).toMatch(/recovery code|unpack|valid/i);
    expect(await services.store.get(SAVE_KEY)).toBeNull();
    expect(into.isLocked()).toBe(false);
  });

  it('a well-formed code containing something that is not a save is rejected', async () => {
    const into = new SaveManager(makeServices());
    expect(await into.importRecoveryCode(await encodeRecovery('{"hello":1}'))).toBe(false);
    expect(await into.importRecoveryCode(await encodeRecovery('not json'))).toBe(false);
    expect(into.lastError).toMatch(/valid/i);
  });

  it('decodes the uncompressed NC0 form (devices without CompressionStream)', async () => {
    const json = JSON.stringify({ a: 1 });
    const body = bytesToBase64Url(new TextEncoder().encode(json));
    expect(await decodeRecovery(`NC0-${crcHex(body)}-${body}`)).toBe(json);
    expect(new TextDecoder().decode(base64UrlToBytes(body))).toBe(json);
  });

  it('import keeps the player\'s current colony as a backup and locks the running game out of saving', async () => {
    const donor = setup();
    donor.game.state.liveops.nova = 4242;
    donor.saves.attach(donor.game);
    const code = await donor.saves.exportRecoveryCode();
    donor.saves.detach();

    const mine = setup();
    mine.saves.attach(mine.game);
    await mine.saves.save(mine.game);
    expect(await mine.saves.importRecoveryCode(code)).toBe(true);
    expect(mine.saves.isLocked()).toBe(true);
    const backups = await mine.saves.listBackups();
    expect(backups.some((b) => b.reason === 'before-import')).toBe(true);
    // the running game's autosave must not clobber the import
    mine.game.state.liveops.nova = 1;
    await mine.saves.save(mine.game);
    mine.game.bus.emit('game:saved', { auto: true });
    expect((await new SaveManager(mine.services).load())!.liveops.nova).toBe(4242);
    mine.saves.detach();
  });
});

describe('save: UI integration', () => {
  it('exposes the manager on window.saves (Settings panel) while attached', () => {
    (globalThis as Record<string, unknown>).window = new EventTarget();
    const t = setup();
    t.saves.attach(t.game);
    expect((globalThis as { window: { saves?: unknown } }).window.saves).toBe(t.saves);
    t.saves.detach();
    expect((globalThis as { window: { saves?: unknown } }).window.saves).toBeUndefined();
  });

  it('reloads the app shortly after a successful import so the colony is actually restored', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const reload = vi.fn();
      (globalThis as Record<string, unknown>).location = { reload };
      const donor = setup();
      donor.saves.attach(donor.game);
      const code = await donor.saves.exportRecoveryCode();
      donor.saves.detach();

      const mine = setup();
      expect(await mine.saves.importRecoveryCode('garbage')).toBe(false);
      await vi.advanceTimersByTimeAsync(3000);
      expect(reload).not.toHaveBeenCalled(); // a failed import never reloads
      expect(await mine.saves.importRecoveryCode(code)).toBe(true);
      expect(reload).not.toHaveBeenCalled(); // the UI gets a moment to show "Colony restored!"
      await vi.advanceTimersByTimeAsync(1600);
      expect(reload).toHaveBeenCalledTimes(1);

      // opt-out
      const manual = new SaveManager(makeServices(), { hooks: false, autoRestart: false });
      expect(await manual.importRecoveryCode(code)).toBe(true);
      await vi.advanceTimersByTimeAsync(3000);
      expect(reload).toHaveBeenCalledTimes(1);
      manual.restart();
      expect(reload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('save: cloud', () => {
  function cloudServices(remote: GameState | null, opts: { available?: boolean } = {}) {
    const services = makeServices();
    let stored: string | null = null;
    const upload = vi.fn(async (data: string) => {
      stored = data;
      return true;
    });
    services.cloud = {
      available: () => opts.available ?? true,
      upload,
      download: async () => (remote ? await encodeRecovery(serializeState(remote)) : stored),
    };
    return { services, upload, getStored: () => stored };
  }

  it('the save with more play time wins at boot; the loser is backed up', async () => {
    const t = setup();
    await t.saves.save(t.game); // local: playTime 1234.5
    const remote = JSON.parse(serializeState(t.game.state)) as GameState;
    remote.playTime = 9000;
    remote.liveops.nova = 888;
    const { services } = cloudServices(remote);
    services.store = t.store;
    const loaded = (await new SaveManager(services, { hooks: false, now: () => t.clock.now }).load())!;
    expect(loaded.liveops.nova).toBe(888);
    expect((await new SaveManager(makeServices({} as never) && { ...t.services, cloud: t.services.cloud }).load())!.liveops.nova).toBe(888); // stored locally too
    const backups = await new SaveManager(services, { hooks: false }).listBackups();
    expect(backups.some((b) => b.reason === 'before-cloud' && b.playTime === 1234.5)).toBe(true);
  });

  it('local wins when it is ahead, when the cloud is unavailable, or when the cloud copy is garbage', async () => {
    const t = setup();
    await t.saves.save(t.game);
    const older = JSON.parse(serializeState(t.game.state)) as GameState;
    older.playTime = 10;
    older.liveops.nova = 1;
    for (const c of [cloudServices(older), cloudServices(older, { available: false })]) {
      c.services.store = t.store;
      const loaded = (await new SaveManager(c.services, { hooks: false }).load())!;
      expect(loaded.liveops.nova).toBe(77);
    }
    const bad = cloudServices(null);
    bad.services.store = t.store;
    bad.services.cloud.download = async () => 'NC1-zzzz';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await new SaveManager(bad.services, { hooks: false }).load())!.liveops.nova).toBe(77);
  });

  it('a new device with only a cloud save restores it', async () => {
    const donor = setup();
    const remote = JSON.parse(serializeState(donor.game.state)) as GameState;
    const { services } = cloudServices(remote);
    const loaded = (await new SaveManager(services, { hooks: false }).load())!;
    expect(loaded.liveops.nova).toBe(77);
  });

  it('uploads a recovery code every few minutes while playing', async () => {
    const t = setup();
    const { services, upload, getStored } = cloudServices(null);
    services.store = t.store;
    const saves = new SaveManager(services, { hooks: false, now: () => t.clock.now });
    saves.attach(t.game);
    await saves.save(t.game);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(getStored()).toMatch(/^NC[01]-/);
    expect(JSON.parse(await decodeRecovery(getStored()!)).playTime).toBe(1234.5);
    t.clock.now += CLOUD_INTERVAL_MS - 10_000;
    await saves.save(t.game);
    await new Promise((r) => setTimeout(r, 50));
    expect(upload).toHaveBeenCalledTimes(1);
    t.clock.now += 11_000;
    await saves.save(t.game);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    saves.detach();
  });
});

describe('save: autosave and lifecycle', () => {
  async function attached(): Promise<ReturnType<typeof setup>> {
    const t = setup();
    t.saves.attach(t.game);
    return t;
  }

  it('attach registers the manager on the game', async () => {
    const t = await attached();
    expect(t.game.saves).toBe(t.saves);
    expect(activeSaveManager()).toBe(t.saves);
    t.saves.detach();
    expect(activeSaveManager()).toBeNull();
  });

  it('autosaves every balance.autosaveSeconds of play', async () => {
    const t = await attached();
    const every = t.game.data.balance.autosaveSeconds;
    const saved = vi.fn();
    t.game.bus.on('game:saved', saved);
    t.game.state.playTime += every - 1;
    t.game.bus.emit('tick:second', { playTime: t.game.state.playTime });
    await flush();
    expect(saved).not.toHaveBeenCalled();
    t.game.state.playTime += 2;
    t.game.bus.emit('tick:second', { playTime: t.game.state.playTime });
    await flush();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith({ auto: true });
    t.game.bus.emit('tick:second', { playTime: t.game.state.playTime + 1 });
    await flush();
    expect(saved).toHaveBeenCalledTimes(1); // interval restarts from the save
    t.saves.detach();
  });

  it('saves shortly after valuable moments (purchase, ad reward, daily claim, tier-up)', async () => {
    vi.useFakeTimers();
    try {
      const t = await attached();
      const saved = vi.fn();
      t.game.bus.on('game:saved', saved);
      t.game.bus.emit('iap:purchased', { product: 'x' });
      t.game.bus.emit('ad:rewarded', { placement: 'x' }); // coalesced into the same save
      await vi.advanceTimersByTimeAsync(2000);
      expect(saved).toHaveBeenCalledTimes(1);
      expect(saved).toHaveBeenCalledWith({ auto: false });
      t.saves.detach();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes when the page is hidden or the app is paused', async () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    const win = new EventTarget();
    (globalThis as Record<string, unknown>).document = doc;
    (globalThis as Record<string, unknown>).window = win;
    const t = await attached();
    const saved = vi.fn();
    t.game.bus.on('game:saved', saved);
    doc.dispatchEvent(new Event('visibilitychange')); // still visible: nothing
    await flush();
    expect(saved).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith({ auto: false });
    // pagehide right after is de-duplicated, a later one saves again
    win.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(saved).toHaveBeenCalledTimes(1);
    t.clock.now += 1000;
    win.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(saved).toHaveBeenCalledTimes(2);
    // detach removes the listeners
    t.saves.detach();
    t.clock.now += 5000;
    win.dispatchEvent(new Event('pagehide'));
    await flush();
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('the write on hide is initiated synchronously (works inside pagehide)', async () => {
    const order: string[] = [];
    const t = setup({
      get: async () => null,
      set: async (k: string) => {
        order.push(`set:${k}`);
      },
      remove: async () => {},
    });
    t.saves.attach(t.game);
    void t.saves.flush();
    order.push('after-flush-call');
    expect(order[0]).toBe(`set:${SAVE_KEY}`); // stored before control returned to the caller
    await flush();
    t.saves.detach();
  });
});

describe('save: full-game round trip with systems running', () => {
  it('a game that played for a while saves, reloads and keeps simulating', async () => {
    const t: TestGame = makeGame();
    for (let i = 0; i < 100; i++) {
      t.clock.now += 100;
      t.game.update(0.1);
    }
    const saves = new SaveManager(t.services, { hooks: false, now: () => t.clock.now });
    await saves.save(t.game);
    const loaded = (await saves.load())!;
    expect(loaded.playTime).toBeCloseTo(t.game.state.playTime, 5);
    const playedBefore = loaded.playTime;
    const g2 = makeGame({ state: loaded, at: t.clock.now + 5000 });
    for (let i = 0; i < 50; i++) g2.game.update(0.1);
    expect(g2.game.state.playTime).toBeGreaterThan(playedBefore + 4.9);
  });
});
