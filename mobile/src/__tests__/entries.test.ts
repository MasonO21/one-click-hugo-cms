import { migrate } from '@/db/migrations';
import { subscribeToDataChanges } from '@/db/events';
import { createEntry, getEntry } from '@/db/repository';
import { enrichEntry, saveNewEntry, type Enrichers } from '@/services/entries';
import { createTestDatabase } from '@/test/sqliteAdapter';

async function setup() {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}

const fix = { latitude: 40.01, longitude: -105.27, timestamp: 1, accuracy: 10 };

describe('saveNewEntry', () => {
  it('saves the transcript with a mood and the location', async () => {
    const db = await setup();
    const changes = jest.fn();
    const unsubscribe = subscribeToDataChanges(changes);
    const entry = await saveNewEntry(db, {
      transcript: '  So happy to be out here, the view is beautiful.  ',
      durationS: 20,
      fix,
      outingId: null,
    });
    unsubscribe();
    expect(entry).toMatchObject({
      transcript: 'So happy to be out here, the view is beautiful.',
      mood: 'happy',
      moodSource: 'auto',
      latitude: 40.01,
      longitude: -105.27,
      place: null,
      weatherCode: null,
    });
    expect(changes).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('saves without a location or mood', async () => {
    const db = await setup();
    const entry = await saveNewEntry(db, { transcript: 'Crossed the creek.', durationS: 4, fix: null, outingId: null });
    expect(entry).toMatchObject({ latitude: null, longitude: null, mood: null });
    db.close();
  });

  it('refuses an empty transcript', async () => {
    const db = await setup();
    await expect(saveNewEntry(db, { transcript: '   ', durationS: 0, fix, outingId: null })).rejects.toThrow('Nothing to save');
    db.close();
  });
});

describe('enrichEntry', () => {
  const working: Enrichers = {
    geocode: jest.fn(async () => 'Chautauqua Park, Boulder'),
    weather: jest.fn(async () => ({ tempC: 9, code: 2 })),
  };

  beforeEach(() => jest.clearAllMocks());

  it('adds place and weather', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'hi', latitude: 40.01, longitude: -105.27 });
    const changes = jest.fn();
    const unsubscribe = subscribeToDataChanges(changes);
    await expect(enrichEntry(db, entry.id, working)).resolves.toEqual({ place: 'added', weather: 'added' });
    unsubscribe();
    expect(await getEntry(db, entry.id)).toMatchObject({ place: 'Chautauqua Park, Boulder', tempC: 9, weatherCode: 2 });
    expect(changes).toHaveBeenCalledTimes(2);
    db.close();
  });

  it('keeps going when one lookup fails', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'hi', latitude: 40, longitude: -105 });
    const result = await enrichEntry(db, entry.id, {
      geocode: async () => {
        throw new Error('offline');
      },
      weather: working.weather,
    });
    expect(result).toEqual({ place: 'failed', weather: 'added' });
    expect(await getEntry(db, entry.id)).toMatchObject({ place: null, weatherCode: 2 });
    db.close();
  });

  it('marks a spot with no place name so it is not looked up again', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'hi', latitude: 40, longitude: -105 });
    const geocode = jest.fn(async () => null);
    const result = await enrichEntry(db, entry.id, { geocode, weather: working.weather });
    expect(result).toEqual({ place: 'none', weather: 'added' });
    expect((await getEntry(db, entry.id))?.place).toBe('');
    await expect(enrichEntry(db, entry.id, { geocode, weather: working.weather })).resolves.toEqual({
      place: 'skipped',
      weather: 'skipped',
    });
    expect(geocode).toHaveBeenCalledTimes(1);
    db.close();
  });

  it('reports lookups that could not reach their service as failures', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'hi', latitude: 40, longitude: -105 });
    const result = await enrichEntry(db, entry.id, {
      geocode: async () => {
        throw new Error('timed out');
      },
      weather: async () => {
        throw new Error('429');
      },
    });
    expect(result).toEqual({ place: 'failed', weather: 'failed' });
    expect((await getEntry(db, entry.id))?.place).toBeNull();
    db.close();
  });

  it('skips entries without a location and tags already present', async () => {
    const db = await setup();
    const noLocation = await createEntry(db, { transcript: 'hi' });
    await expect(enrichEntry(db, noLocation.id, working)).resolves.toEqual({ place: 'skipped', weather: 'skipped' });
    const done = await createEntry(db, {
      transcript: 'hi',
      latitude: 40,
      longitude: -105,
      place: 'Here',
      tempC: 1,
      weatherCode: 0,
    });
    await expect(enrichEntry(db, done.id, working)).resolves.toEqual({ place: 'skipped', weather: 'skipped' });
    await expect(enrichEntry(db, 12345, working)).resolves.toEqual({ place: 'skipped', weather: 'skipped' });
    expect(working.geocode).not.toHaveBeenCalled();
    expect(working.weather).not.toHaveBeenCalled();
    db.close();
  });

  it('can retry only the missing tag', async () => {
    const db = await setup();
    const entry = await createEntry(db, { transcript: 'hi', latitude: 40, longitude: -105, place: 'Here' });
    await expect(enrichEntry(db, entry.id, working)).resolves.toEqual({ place: 'skipped', weather: 'added' });
    expect(working.geocode).not.toHaveBeenCalled();
    db.close();
  });
});
