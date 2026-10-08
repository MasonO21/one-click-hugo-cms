/**
 * Store rating prompt: the native in-app review sheet (iOS SKStoreReviewController / Google Play in-app review),
 * asked rarely and only right after a happy moment (a tier-up, a won raid's chest) once its celebration has closed,
 * and only from players who are clearly enjoying the game. The OS applies its own quota and may show nothing; we
 * never show a "rate us" dialog of our own and never gate anything on it. No-op on the web.
 * OWNER: platform.
 */
import type { Game } from '../core/Game';
import type { KeyValueStore } from './types';
import { isNative } from './env';

/** Where the ask history lives (platform store, outside the save: it is about this install, not the colony). */
export const REVIEW_KEY = 'nova_review_v1';

export interface ReviewRecord {
  /** How many times we asked the OS. */
  asks: number;
  /** When we last asked (epoch ms). */
  last: number;
}

export const REVIEW_RULES = {
  /** Colony tier index (0 = Wood): Stone or later, i.e. two tier-ups in. */
  minTier: 2,
  minSessions: 2,
  minPlaySeconds: 30 * 60,
  /** Days between asks, and asks per install. */
  gapDays: 120,
  maxAsks: 3,
  /** Seconds after the moment (and after its panels closed) before asking. */
  delayS: 2.5,
  /** Give up on a moment whose panels stay open longer than this. */
  waitS: 90,
} as const;

export interface ReviewState {
  tier: number;
  sessions: number;
  playTime: number;
  now: number;
  record: ReviewRecord | null;
}

/** Is this a good time to ask? */
export function shouldAskForReview(s: ReviewState): boolean {
  const r = REVIEW_RULES;
  if (s.tier < r.minTier || s.sessions < r.minSessions || s.playTime < r.minPlaySeconds) return false;
  if (!s.record) return true;
  if (s.record.asks >= r.maxAsks) return false;
  return s.now - s.record.last >= r.gapDays * 86_400_000;
}

export function parseReviewRecord(raw: string | null): ReviewRecord | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<ReviewRecord>;
    return typeof o.asks === 'number' && typeof o.last === 'number' ? { asks: o.asks, last: o.last } : null;
  } catch {
    return null;
  }
}

async function nativeRequest(): Promise<void> {
  const { InAppReview } = await import('@capacitor-community/in-app-review');
  await InAppReview.requestReview();
}

type ReviewGame = Pick<Game, 'bus' | 'state' | 'view' | 'now'>;

export class ReviewPrompt {
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;

  constructor(
    private readonly game: ReviewGame,
    private readonly store: KeyValueStore,
    private readonly request: () => Promise<void> = nativeRequest,
    private readonly native: () => boolean = isNative,
  ) {}

  /** Listen for happy moments. Returns an unsubscribe. */
  wire(): () => void {
    if (!this.native()) return () => {};
    const offs = [this.game.bus.on('colony:tierUp', () => this.moment()), this.game.bus.on('combat:rewardClaimed', () => this.moment())];
    return () => {
      offs.forEach((off) => off());
      this.stop();
    };
  }

  /** A happy moment just happened: ask once its panels have closed (polling once a second, never per frame). */
  moment(): void {
    if (this.timer || this.busy) return;
    let clearFor = 0;
    let waited = 0;
    this.timer = setInterval(() => {
      waited += 1;
      clearFor = this.game.view.panelOpen ? 0 : clearFor + 1;
      if (clearFor >= REVIEW_RULES.delayS) {
        this.stop();
        void this.ask();
      } else if (waited >= REVIEW_RULES.waitS) this.stop();
    }, 1000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Check the rules and, if they pass, ask the OS (recording the ask whatever the OS decides to show). */
  async ask(): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    try {
      const st = this.game.state;
      const record = parseReviewRecord(await this.store.get(REVIEW_KEY).catch(() => null));
      const now = this.game.now();
      if (!shouldAskForReview({ tier: st.colony.tier, sessions: st.stats.sessions, playTime: st.playTime, now, record })) return false;
      await this.store.set(REVIEW_KEY, JSON.stringify({ asks: (record?.asks ?? 0) + 1, last: now } satisfies ReviewRecord)).catch(() => undefined);
      await this.request().catch(() => undefined);
      return true;
    } finally {
      this.busy = false;
    }
  }
}
