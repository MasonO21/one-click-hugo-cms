import { migrate } from '@/db/migrations';
import { serialized, transaction } from '@/db/queue';
import { countEntries, createEntry, listEntries, updateEntryTags } from '@/db/repository';
import { createTestDatabase } from '@/test/sqliteAdapter';

async function setup() {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}

describe('write queue', () => {
  it('runs writes one at a time, in the order they were started', async () => {
    const db = await setup();
    const order: string[] = [];
    const slow = serialized(db, async () => {
      order.push('slow:start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('slow:end');
    });
    const fast = serialized(db, async () => {
      order.push('fast');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['slow:start', 'slow:end', 'fast']);
    db.close();
  });

  it('keeps going after a failed write', async () => {
    const db = await setup();
    await expect(serialized(db, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(serialized(db, async () => 'next')).resolves.toBe('next');
    db.close();
  });

  // The test database, like expo-sqlite, runs queries issued during an open transaction
  // inside that transaction. Without the queue, the entry below would be rolled back
  // together with the failing transaction.
  it('keeps a failing transaction from rolling back an unrelated write', async () => {
    const db = await setup();
    const failing = transaction(db, async () => {
      await db.runAsync("INSERT INTO entries (created_at, transcript) VALUES (1, 'doomed')");
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error('boom');
    });
    const unrelated = createEntry(db, { transcript: 'keep me', createdAt: 2 });

    await expect(failing).rejects.toThrow('boom');
    await unrelated;
    expect((await listEntries(db)).map((e) => e.transcript)).toEqual(['keep me']);
    db.close();
  });

  it('handles a burst of concurrent saves and tag updates', async () => {
    const db = await setup();
    const first = await createEntry(db, { transcript: 'first', latitude: 1, longitude: 2 });
    await Promise.all([
      updateEntryTags(db, first.id, { place: 'Here' }),
      ...Array.from({ length: 10 }, (_, i) => createEntry(db, { transcript: `note ${i}` })),
      updateEntryTags(db, first.id, { tempC: 5, weatherCode: 0 }),
    ]);
    expect(await countEntries(db)).toBe(11);
    expect((await listEntries(db, { query: 'here' })).map((e) => e.id)).toEqual([first.id]);
    db.close();
  });
});
