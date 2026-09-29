import { migrate, hasFullTextSearch } from '@/db/migrations';
import {
  countEntries,
  createEntry,
  createOuting,
  deleteAllData,
  deleteEntry,
  deleteOuting,
  finishOuting,
  getActiveOuting,
  getEntry,
  getOuting,
  getSetting,
  listEntries,
  listMoodsInUse,
  listOutings,
  loadEverything,
  renameOuting,
  saveOutingProgress,
  setSetting,
  updateEntryTags,
  updateMood,
  updateTranscript,
} from '@/db/repository';
import { DEFAULT_SETTINGS, loadSettings, saveSetting } from '@/db/settings';
import { createTestDatabase } from '@/test/sqliteAdapter';

describe.each([
  ['with full-text search', true],
  ['without full-text search', false],
])('repository %s', (_name, withFts) => {
  const dbs: { close(): void }[] = [];
  async function setup() {
    const db = createTestDatabase({ withFts });
    dbs.push(db);
    await migrate(db);
    return db;
  }
  afterAll(() => dbs.forEach((db) => db.close()));

  it('reports whether search is available', async () => {
    const db = await setup();
    expect(hasFullTextSearch(db)).toBe(withFts);
  });

  it('migrating twice keeps the data', async () => {
    const db = await setup();
    await createEntry(db, { transcript: 'first' });
    await migrate(db);
    expect(await countEntries(db)).toBe(1);
  });

  it('creates and reads entries with all tags', async () => {
    const db = await setup();
    const entry = await createEntry(db, {
      transcript: 'Fog on the ridge',
      createdAt: 1000,
      durationS: 12.6,
      latitude: 40.01,
      longitude: -105.27,
      place: 'Chautauqua Park, Boulder',
      tempC: 9,
      weatherCode: 45,
      mood: 'calm',
    });
    expect(entry).toMatchObject({
      transcript: 'Fog on the ridge',
      createdAt: 1000,
      durationS: 13,
      place: 'Chautauqua Park, Boulder',
      tempC: 9,
      weatherCode: 45,
      mood: 'calm',
      moodSource: 'auto',
      outingId: null,
    });
    expect(await getEntry(db, entry.id)).toEqual(entry);
    expect(await getEntry(db, 999)).toBeNull();
  });

  it('lists newest first and pages', async () => {
    const db = await setup();
    for (let i = 1; i <= 5; i += 1) await createEntry(db, { transcript: `note ${i}`, createdAt: i * 1000 });
    expect((await listEntries(db)).map((e) => e.transcript)).toEqual(['note 5', 'note 4', 'note 3', 'note 2', 'note 1']);
    expect((await listEntries(db, { limit: 2, offset: 2 })).map((e) => e.transcript)).toEqual(['note 3', 'note 2']);
  });

  it('searches transcripts, prefixes and places', async () => {
    const db = await setup();
    await createEntry(db, { transcript: 'Foggy ridge this morning', createdAt: 1, place: 'Boulder' });
    await createEntry(db, { transcript: 'Sunny summit and a long lunch', createdAt: 2, place: 'Nederland' });
    expect((await listEntries(db, { query: 'foggy' })).map((e) => e.createdAt)).toEqual([1]);
    expect((await listEntries(db, { query: 'fog' })).map((e) => e.createdAt)).toEqual([1]);
    expect((await listEntries(db, { query: 'nederland lunch' })).map((e) => e.createdAt)).toEqual([2]);
    expect(await listEntries(db, { query: 'glacier' })).toEqual([]);
  });

  it('does not break on odd search input', async () => {
    const db = await setup();
    await createEntry(db, { transcript: '50% done, "quoted" text' });
    await expect(listEntries(db, { query: '"' })).resolves.toBeDefined();
    await expect(listEntries(db, { query: "') OR 1=1 --" })).resolves.toEqual([]);
    await expect(listEntries(db, { query: '%' })).resolves.toBeDefined();
    expect((await listEntries(db, { query: '   ' })).length).toBe(1);
  });

  it('filters by mood and outing', async () => {
    const db = await setup();
    const outing = await createOuting(db, { kind: 'hike', startedAt: 5 });
    await createEntry(db, { transcript: 'a', mood: 'happy', outingId: outing.id, createdAt: 1 });
    await createEntry(db, { transcript: 'b', mood: 'tired', createdAt: 2 });
    await createEntry(db, { transcript: 'c', mood: 'happy', createdAt: 3 });
    expect((await listEntries(db, { mood: 'happy' })).map((e) => e.transcript)).toEqual(['c', 'a']);
    expect((await listEntries(db, { outingId: outing.id })).map((e) => e.transcript)).toEqual(['a']);
    expect(await listMoodsInUse(db)).toEqual(['happy', 'tired']);
  });

  it('edits text, mood and tags and keeps search in sync', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'original words', mood: null });
    await updateTranscript(db, entry.id, 'brand new words', 'happy');
    expect((await getEntry(db, entry.id))?.mood).toBe('happy');
    if (withFts) {
      expect(await listEntries(db, { query: 'original' })).toEqual([]);
      expect(await listEntries(db, { query: 'brand' })).toHaveLength(1);
    }

    await updateMood(db, entry.id, 'tired', 'user');
    expect(await getEntry(db, entry.id)).toMatchObject({ mood: 'tired', moodSource: 'user' });
    if (withFts) expect(await listEntries(db, { query: 'tired' })).toHaveLength(1);

    await updateEntryTags(db, entry.id, { place: 'Boulder', tempC: 4, weatherCode: 63 });
    expect(await getEntry(db, entry.id)).toMatchObject({ place: 'Boulder', tempC: 4, weatherCode: 63 });
    if (withFts) expect(await listEntries(db, { query: 'rainy' })).toHaveLength(1);

    await updateEntryTags(db, entry.id, {});
    await updateTranscript(db, entry.id, 'same mood kept');
    expect((await getEntry(db, entry.id))?.mood).toBe('tired');
  });

  it('deletes entries and their search rows', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'delete me please' });
    await deleteEntry(db, entry.id);
    expect(await getEntry(db, entry.id)).toBeNull();
    expect(await listEntries(db, { query: 'delete' })).toEqual([]);
  });

  it('runs an outing from start to finish', async () => {
    const db = await setup();
    const started = new Date(2026, 8, 29, 7).getTime();
    const outing = await createOuting(db, { kind: 'hike', startedAt: started });
    expect(outing).toMatchObject({ kind: 'hike', name: 'Morning hike', endedAt: null, distanceM: 0, entryCount: 0 });
    expect((await getActiveOuting(db))?.id).toBe(outing.id);

    await saveOutingProgress(db, outing.id, { distanceM: 120.5, track: [[40, -105, 1]] });
    expect((await getOuting(db, outing.id))?.track).toEqual([[40, -105, 1]]);

    await createEntry(db, { transcript: 'on the trail', outingId: outing.id });
    await finishOuting(db, outing.id, { endedAt: started + 3600000, distanceM: 5000, track: [[40, -105, 1], [40.1, -105, 2]] });
    expect(await getActiveOuting(db)).toBeNull();
    expect(await getOuting(db, outing.id)).toMatchObject({ endedAt: started + 3600000, distanceM: 5000, entryCount: 1 });
    expect(await listOutings(db)).toHaveLength(1);
  });

  it('renames outings and keeps entries searchable by the new name', async () => {
    const db = await setup();
    const outing = await createOuting(db, { kind: 'run' });
    await createEntry(db, { transcript: 'legs are fine', outingId: outing.id });
    await renameOuting(db, outing.id, '  Green Mountain loop ');
    expect((await getOuting(db, outing.id))?.name).toBe('Green Mountain loop');
    await renameOuting(db, outing.id, '   ');
    expect((await getOuting(db, outing.id))?.name).toBe('Green Mountain loop');
    if (withFts) expect(await listEntries(db, { query: 'green mountain' })).toHaveLength(1);
  });

  it('deleting an outing keeps its entries', async () => {
    const db = await setup();
    const outing = await createOuting(db, { kind: 'hike' });
    const entry = await createEntry(db, { transcript: 'keep me', outingId: outing.id });
    await deleteOuting(db, outing.id);
    expect(await getOuting(db, outing.id)).toBeNull();
    expect((await getEntry(db, entry.id))?.outingId).toBeNull();
  });

  it('survives a corrupt saved route', async () => {
    const db = await setup();
    const outing = await createOuting(db, { kind: 'hike' });
    await db.runAsync('UPDATE outings SET track = ? WHERE id = ?', 'not json', outing.id);
    expect((await getOuting(db, outing.id))?.track).toEqual([]);
    await db.runAsync('UPDATE outings SET track = ? WHERE id = ?', '[[1,2,3],[1,"x",3],"bad"]', outing.id);
    expect((await getOuting(db, outing.id))?.track).toEqual([[1, 2, 3]]);
  });

  it('exports and deletes everything', async () => {
    const db = await setup();
    const outing = await createOuting(db, { kind: 'hike' });
    await createEntry(db, { transcript: 'one', outingId: outing.id });
    await createEntry(db, { transcript: 'two' });
    const all = await loadEverything(db);
    expect(all.entries.map((e) => e.transcript)).toEqual(['one', 'two']);
    expect(all.outings).toHaveLength(1);

    await deleteAllData(db);
    expect(await countEntries(db)).toBe(0);
    expect(await listOutings(db)).toEqual([]);
    expect(await listEntries(db, { query: 'one' })).toEqual([]);
  });

  it('stores settings', async () => {
    const db = await setup();
    expect(await loadSettings(db)).toEqual(DEFAULT_SETTINGS);
    await setSetting(db, 'k', 'v1');
    await setSetting(db, 'k', 'v2');
    expect(await getSetting(db, 'k')).toBe('v2');
    expect(await getSetting(db, 'missing')).toBeNull();

    await saveSetting(db, 'onboarded', true);
    await saveSetting(db, 'temperatureUnit', 'f');
    await saveSetting(db, 'distanceUnit', 'mi');
    await saveSetting(db, 'onDeviceSpeech', false);
    await saveSetting(db, 'keepScreenOn', false);
    expect(await loadSettings(db)).toEqual({
      onboarded: true,
      temperatureUnit: 'f',
      distanceUnit: 'mi',
      onDeviceSpeech: false,
      keepScreenOn: false,
    });
  });

  it('rolls back a failed transaction', async () => {
    const db = await setup();
    await expect(
      db.withTransactionAsync(async () => {
        await db.runAsync("INSERT INTO entries (created_at, transcript) VALUES (1, 'lost')");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await countEntries(db)).toBe(0);
  });
});
