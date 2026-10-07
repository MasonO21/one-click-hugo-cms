/**
 * Privacy-conscious analytics client.
 *
 *  - Opt-in: nothing is recorded until `setConsent(true)` (driven by `settings.analytics`).
 *  - No PII: events carry only game facts; a random install id (not a device id) is the only identity,
 *    and it is deleted when consent is withdrawn. String values are length-limited and e-mail-like
 *    strings are redacted.
 *  - Batched in memory and flushed on size / timer / app pause. Failed flushes are re-queued (bounded).
 *  - Pluggable sink: console in dev, an HTTP endpoint when VITE_ANALYTICS_URL is set, otherwise events
 *    are dropped and nothing ever leaves the device.
 *
 * OWNER: meta agent.
 */
import type { AnalyticsService, KeyValueStore } from './types';
import { env, isDevBuild } from './env';

export type AnalyticsProps = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
  name: string;
  props?: AnalyticsProps;
  /** Epoch ms. */
  ts: number;
}

export interface AnalyticsBatch {
  v: 1;
  installId: string;
  session: string;
  platform: string;
  appVersion: string;
  events: AnalyticsEvent[];
}

/** Deliver a batch; resolve true when accepted (false => keep and retry later). */
export type AnalyticsSink = (batch: AnalyticsBatch) => Promise<boolean>;

const INSTALL_KEY = 'nova_install_id';
const NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;
const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_PROPS = 14;

export function consoleSink(): AnalyticsSink {
  return async (batch) => {
    for (const e of batch.events) console.debug(`[analytics] ${e.name}`, e.props ?? {});
    return true;
  };
}

export function httpSink(url: string, fetchImpl: typeof fetch | undefined = globalThis.fetch?.bind(globalThis)): AnalyticsSink {
  return async (batch) => {
    if (!fetchImpl) return false;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      return res.ok;
    } catch {
      return false;
    }
  };
}

/** Sink selection from the build environment. */
export function defaultSink(): AnalyticsSink | null {
  const url = env('VITE_ANALYTICS_URL');
  if (url) return httpSink(url);
  return isDevBuild() ? consoleSink() : null;
}

export interface AnalyticsOptions {
  store?: KeyValueStore;
  sink?: AnalyticsSink | null;
  platform?: string;
  appVersion?: string;
  /** Flush when this many events are queued (default 20). */
  batchSize?: number;
  /** Periodic flush (ms, default 30 000; 0 disables the timer). */
  flushIntervalMs?: number;
  /** Queue cap; oldest events drop first (default 300). */
  maxQueue?: number;
  now?: () => number;
}

function randomId(bytes = 16): string {
  const a = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Clean one property map: whitelisted shapes only, no free-form personal text. */
export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps | undefined {
  if (!props) return undefined;
  const out: AnalyticsProps = {};
  let n = 0;
  for (const [k, v] of Object.entries(props)) {
    if (n >= MAX_PROPS) break;
    if (!KEY_RE.test(k)) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      out[k] = Math.round(v * 1000) / 1000;
    } else if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.includes('@') ? '[redacted]' : v.slice(0, 64);
    else continue;
    n++;
  }
  return out;
}

export class AnalyticsClient implements AnalyticsService {
  private consent = false;
  private queue: AnalyticsEvent[] = [];
  private sink: AnalyticsSink | null;
  private id = '';
  private readonly session = randomId(6);
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private readonly batchSize: number;
  private readonly maxQueue: number;
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(private readonly opts: AnalyticsOptions = {}) {
    this.sink = opts.sink === undefined ? defaultSink() : opts.sink;
    this.batchSize = opts.batchSize ?? 20;
    this.maxQueue = opts.maxQueue ?? 300;
    this.intervalMs = opts.flushIntervalMs ?? 30_000;
    this.now = opts.now ?? (() => Date.now());
  }

  /** Load (or lazily create) the random install id. Safe to skip: an in-memory id is used instead. */
  async init(): Promise<void> {
    try {
      const stored = await this.opts.store?.get(INSTALL_KEY);
      if (stored) this.id = stored;
    } catch {
      /* ignore */
    }
  }

  setSink(sink: AnalyticsSink | null): void {
    this.sink = sink;
  }

  consented(): boolean {
    return this.consent;
  }

  /** The anonymous install id (empty until consent was given). */
  installId(): string {
    return this.id;
  }

  queued(): number {
    return this.queue.length;
  }

  setConsent(enabled: boolean): void {
    if (enabled === this.consent) return;
    this.consent = enabled;
    if (enabled) {
      if (!this.id) {
        this.id = randomId();
        void this.opts.store?.set(INSTALL_KEY, this.id).catch(() => {});
      }
      this.startTimer();
    } else {
      this.queue = [];
      this.stopTimer();
      this.id = '';
      void this.opts.store?.remove(INSTALL_KEY).catch(() => {});
    }
  }

  track(event: string, props?: Record<string, string | number | boolean>): void {
    if (!this.consent || !NAME_RE.test(event)) return;
    this.queue.push({ name: event, props: sanitizeProps(props), ts: this.now() });
    if (this.queue.length > this.maxQueue) this.queue.splice(0, this.queue.length - this.maxQueue);
    if (this.queue.length >= this.batchSize) void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.consent || this.queue.length === 0) return;
    if (!this.sink) {
      this.queue = []; // no destination configured: nothing is retained or sent
      return;
    }
    this.flushing = true;
    const events = this.queue.splice(0, this.queue.length);
    let ok = false;
    try {
      ok = await this.sink({
        v: 1,
        installId: this.id || 'anon',
        session: this.session,
        platform: this.opts.platform ?? 'web',
        appVersion: this.opts.appVersion ?? '0',
        events,
      });
    } catch {
      ok = false;
    } finally {
      this.flushing = false;
    }
    if (!ok && this.consent) {
      this.queue = [...events, ...this.queue].slice(-this.maxQueue);
    }
  }

  private startTimer(): void {
    if (this.timer || this.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Stop timers (tests / hot reload). */
  dispose(): void {
    this.stopTimer();
  }
}
