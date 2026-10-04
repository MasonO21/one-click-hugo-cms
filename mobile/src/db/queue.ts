import type { Database } from './types';

const tails = new WeakMap<object, Promise<unknown>>();

// expo-sqlite runs any query issued while a transaction is open inside that
// transaction. A background weather update could then be rolled back together with an
// unrelated failed write. Every write goes through this queue, one at a time.
export function serialized<T>(db: Database, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(db) ?? Promise.resolve();
  const run = previous.then(task);
  tails.set(
    db,
    run.catch(() => undefined),
  );
  return run;
}

export function transaction(db: Database, task: () => Promise<void>): Promise<void> {
  return serialized(db, () => db.withTransactionAsync(task));
}
