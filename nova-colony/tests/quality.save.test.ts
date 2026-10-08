/**
 * Automatic graphics quality — the save side: v1 saves (no `qualityMode`) migrate to v2 without the player losing
 * a level they picked, new saves start in auto mode, and junk values are repaired instead of reaching the renderer.
 */
import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SaveManager } from '../src/platform/save';
import { wrapSave } from '../src/platform/saveCodec';
import { MIGRATIONS, migrateState } from '../src/platform/saveMigrate';
import { SAVE_VERSION } from '../src/core/constants';
import { createInitialState, serializeState } from '../src/core/state';
import { MemoryStore } from '../src/platform/mock';
import { makeGame, makeServices } from './meta.helpers';

/** A save exactly as a v1 build wrote it: version 1 and settings without the auto-quality fields. */
function v1Save(quality: unknown): Record<string, any> {
  const raw = JSON.parse(serializeState(createInitialState(42, 1_700_000_000_000)));
  raw.version = 1;
  delete raw.settings.qualityMode;
  delete raw.settings.qualityDevice;
  raw.settings.quality = quality;
  raw.settings.music = 0.25; // a setting the player changed, to prove the rest survives
  raw.playTime = 3600;
  raw.liveops.nova = 42;
  return raw;
}

describe('quality settings: new saves', () => {
  it('a new colony starts in auto mode with no device decided yet', () => {
    const s = createInitialState(1, 0).settings;
    expect(s.qualityMode).toBe('auto');
    expect(s.qualityDevice).toBe('');
    expect(s.quality).toBe('medium'); // placeholder until the boot-time device check
  });

  it('a new game (no save) is in auto mode', () => {
    const { game } = makeGame();
    expect(game.fresh).toBe(true);
    expect(game.state.settings.qualityMode).toBe('auto');
  });

  it('the current format is v2 and registers the v1 -> v2 migration', () => {
    expect(SAVE_VERSION).toBe(2);
    expect(MIGRATIONS[1]).toBeTypeOf('function');
  });
});

describe('quality settings: v1 -> v2 migration', () => {
  it('an untouched default (medium) becomes auto, with the device check still to run', () => {
    const out = migrateState(v1Save('medium'));
    expect(out.version).toBe(2);
    expect(out.settings.qualityMode).toBe('auto');
    expect(out.settings.qualityDevice).toBe('');
    expect(out.settings.quality).toBe('medium');
  });

  it.each(['low', 'high'] as const)('a hand-picked %s stays manual at that level', (q) => {
    const out = migrateState(v1Save(q));
    expect(out.settings.qualityMode).toBe('manual');
    expect(out.settings.quality).toBe(q);
  });

  it.each([undefined, 'ultra', 7, null])('an unreadable level (%s) falls back to medium + auto', (q) => {
    const raw = v1Save(q);
    if (q === undefined) delete raw.settings.quality;
    const out = migrateState(raw);
    expect(out.settings.quality).toBe('medium');
    expect(out.settings.qualityMode).toBe('auto');
  });

  it('keeps the rest of the old save intact', () => {
    const out = migrateState(v1Save('high'));
    expect(out.settings.music).toBe(0.25);
    expect(out.settings.haptics).toBe(true);
    expect(out.playTime).toBe(3600);
    expect(out.liveops.nova).toBe(42);
  });

  it('a v1 save with no settings slice at all loads with default (auto) settings', () => {
    const raw = v1Save('medium');
    delete raw.settings;
    const out = migrateState(raw);
    expect(out.settings.qualityMode).toBe('auto');
    expect(out.settings.music).toBe(0.6);
  });

  it('does not touch a v2 save: manual medium stays manual, a decided device stays decided', () => {
    const raw = JSON.parse(serializeState(createInitialState(42, 1_700_000_000_000)));
    raw.settings.quality = 'medium';
    raw.settings.qualityMode = 'manual';
    const out = migrateState(raw);
    expect(out.settings.qualityMode).toBe('manual');

    const raw2 = JSON.parse(serializeState(createInitialState(42, 1_700_000_000_000)));
    raw2.settings.quality = 'low';
    raw2.settings.qualityDevice = 'm|4|adreno (tm) 740';
    const out2 = migrateState(raw2);
    expect(out2.settings.qualityMode).toBe('auto');
    expect(out2.settings.quality).toBe('low'); // a persisted auto downgrade is kept
    expect(out2.settings.qualityDevice).toBe('m|4|adreno (tm) 740');
  });

  it('repairs a junk qualityMode in a v2 save to auto', () => {
    const raw = JSON.parse(serializeState(createInitialState(42, 1_700_000_000_000)));
    raw.settings.qualityMode = 'sometimes';
    raw.settings.qualityDevice = 'x';
    const out = migrateState(raw);
    expect(out.settings.qualityMode).toBe('auto');
    expect(out.settings.qualityDevice).toBe('');
  });
});

describe('quality settings: old saves still load end to end', () => {
  it.each([
    ['medium', 'auto'],
    ['high', 'manual'],
    ['low', 'manual'],
  ] as const)('a checksummed v1 save at %s loads through SaveManager as %s', async (quality, mode) => {
    const services = makeServices();
    const store = new MemoryStore();
    services.store = store;
    await store.set(SAVE_KEY, wrapSave(JSON.stringify(v1Save(quality))));
    const loaded = (await new SaveManager(services, { hooks: false }).load())!;
    expect(loaded).not.toBeNull();
    expect(loaded.version).toBe(2);
    expect(loaded.settings.quality).toBe(quality);
    expect(loaded.settings.qualityMode).toBe(mode);
    // and it boots a game that continues from it
    const g = makeGame({ state: loaded, services });
    expect(g.game.fresh).toBe(false);
    expect(g.game.state.liveops.nova).toBe(42);
    expect(g.game.state.settings.qualityMode).toBe(mode);
  });
});
