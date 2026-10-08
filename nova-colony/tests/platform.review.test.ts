/** Store rating prompt: rare, only for invested players, only after a happy moment once its panels closed. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/core/events';
import { REVIEW_KEY, REVIEW_RULES, ReviewPrompt, parseReviewRecord, shouldAskForReview } from '../src/platform/review';

const DAY = 86_400_000;
const invested = { tier: 2, sessions: 3, playTime: 3600, now: 1_000 * DAY, record: null };

describe('when to ask', () => {
  it('asks invested players the first time', () => {
    expect(shouldAskForReview(invested)).toBe(true);
  });
  it('never asks new or brief players', () => {
    expect(shouldAskForReview({ ...invested, tier: 1 })).toBe(false);
    expect(shouldAskForReview({ ...invested, sessions: 1 })).toBe(false);
    expect(shouldAskForReview({ ...invested, playTime: 20 * 60 })).toBe(false);
  });
  it(`waits ${REVIEW_RULES.gapDays} days between asks and stops after ${REVIEW_RULES.maxAsks}`, () => {
    expect(shouldAskForReview({ ...invested, record: { asks: 1, last: invested.now - 30 * DAY } })).toBe(false);
    expect(shouldAskForReview({ ...invested, record: { asks: 1, last: invested.now - 121 * DAY } })).toBe(true);
    expect(shouldAskForReview({ ...invested, record: { asks: 3, last: 0 } })).toBe(false);
  });
  it('tolerates a missing or corrupt record', () => {
    expect(parseReviewRecord(null)).toBeNull();
    expect(parseReviewRecord('{oops')).toBeNull();
    expect(parseReviewRecord('{"asks":"x"}')).toBeNull();
    expect(parseReviewRecord('{"asks":1,"last":5}')).toEqual({ asks: 1, last: 5 });
  });
});

describe('ReviewPrompt', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function rig(over: Partial<typeof invested> = {}, native = true) {
    const bus = new EventBus();
    const kv = new Map<string, string>();
    const store = { get: async (k: string) => kv.get(k) ?? null, set: async (k: string, v: string) => void kv.set(k, v), remove: async (k: string) => void kv.delete(k) };
    const s = { ...invested, ...over };
    const game = { bus, now: () => s.now, view: { panelOpen: true }, state: { colony: { tier: s.tier }, stats: { sessions: s.sessions }, playTime: s.playTime } } as any;
    const request = vi.fn(async () => {});
    const off = new ReviewPrompt(game, store, request, () => native).wire();
    return { bus, game, kv, request, off };
  }

  it('after a tier-up, waits for the celebration to close, then asks once and records it', async () => {
    const r = rig();
    r.bus.emit('colony:tierUp', { tier: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).not.toHaveBeenCalled(); // celebration still open
    r.game.view.panelOpen = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(r.request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(r.kv.get(REVIEW_KEY)!).asks).toBe(1);
    // a second happy moment the same day does not ask again
    r.bus.emit('combat:rewardClaimed', { doubled: false });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).toHaveBeenCalledTimes(1);
  });

  it('gives up on a moment whose panels never close, and never asks a new player', async () => {
    const r = rig();
    r.bus.emit('colony:tierUp', { tier: 2 });
    await vi.advanceTimersByTimeAsync((REVIEW_RULES.waitS + 5) * 1000);
    r.game.view.panelOpen = false;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).not.toHaveBeenCalled();
    const fresh = rig({ tier: 1 });
    fresh.game.view.panelOpen = false;
    fresh.bus.emit('colony:tierUp', { tier: 1 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fresh.request).not.toHaveBeenCalled();
  });

  it('never in the same moment as the notifications card: the card goes first, the next moment may ask', async () => {
    const r = rig();
    let cardCanAsk = true;
    r.game.notifications = { canAsk: () => cardCanAsk };
    r.game.view.panelOpen = false;
    r.bus.emit('colony:tierUp', { tier: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).not.toHaveBeenCalled();
    expect(r.kv.get(REVIEW_KEY)).toBeUndefined(); // not spent
    cardCanAsk = false; // answered
    r.bus.emit('combat:rewardClaimed', { doubled: false });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).toHaveBeenCalledTimes(1);
  });

  it('time in the background does not count as the screen being free (the ask would be spent unseen)', async () => {
    const doc = { visibilityState: 'hidden' };
    (globalThis as { document?: unknown }).document = doc;
    try {
      const r = rig();
      r.game.view.panelOpen = false;
      r.bus.emit('colony:tierUp', { tier: 2 });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(r.request).not.toHaveBeenCalled();
      doc.visibilityState = 'visible';
      await vi.advanceTimersByTimeAsync(5_000);
      expect(r.request).toHaveBeenCalledTimes(1);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  it('does nothing on the web', async () => {
    const r = rig({}, false);
    r.game.view.panelOpen = false;
    r.bus.emit('colony:tierUp', { tier: 3 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(r.request).not.toHaveBeenCalled();
  });
});
