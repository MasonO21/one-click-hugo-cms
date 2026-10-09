import { describe, expect, it } from 'vitest';
import { NEWS } from '../src/data/news';
import { createInitialState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';

describe("what's new card", () => {
  it('has an id, a title and a short list of notes', () => {
    expect(NEWS.id).toMatch(/^\d{4}-\d{2}-[a-z-]+$/);
    expect(NEWS.title.length).toBeGreaterThan(4);
    expect(NEWS.items.length).toBeGreaterThanOrEqual(3);
    expect(NEWS.items.length).toBeLessThanOrEqual(6);
    for (const i of NEWS.items) expect(i.text.length).toBeLessThan(110);
  });

  it('new colonies start unseen and older saves load as unseen (shown once to players who update)', () => {
    expect(createInitialState(1, 0).liveops.newsSeen).toBe('');
    const old = JSON.parse(JSON.stringify(createInitialState(2, 0)));
    delete old.liveops.newsSeen;
    expect(migrateState(old).liveops.newsSeen).toBe('');
  });
});
