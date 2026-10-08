/**
 * Field error reports. On a phone nobody sees the console, so failures the game survives (a sim step the loop guard
 * skipped, a UI piece `safe()` caught, an uncaught error or rejected promise) are sent as `error` events through
 * the analytics pipeline — which means only with the player's analytics consent, sanitised like every other event.
 * Each distinct (where, message) is sent once per session and a session sends at most MAX_REPORTS, so a broken
 * frame loop can't flood the queue.
 * OWNER: platform.
 */
import { onLoopError } from '../core/guard';
import { onUiError } from '../ui/dom';

export const MAX_REPORTS = 25;

export interface ErrorSignature {
  /** Where it happened: a loop step ('sim crafting', 'render'), a UI label ('panel shop render') or 'uncaught'. */
  where: string;
  /** The first line of the message, whitespace-collapsed (analytics truncates strings to 64 chars). */
  msg: string;
  /** Top stack frame as file:line:col (bundle file name only, no paths), or '' when unknown. */
  at: string;
}

export function errorSignature(where: string, e: unknown): ErrorSignature {
  const err = e as { message?: unknown; stack?: unknown } | null;
  const raw = err && typeof err === 'object' && 'message' in err ? String(err.message) : String(e);
  const msg = raw.split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 120) || 'unknown';
  let at = '';
  const stack = err && typeof err === 'object' && typeof err.stack === 'string' ? err.stack : '';
  for (const line of stack.split('\n').slice(0, 6)) {
    const m = /([^/\\\s()]+\.(?:m?js|ts)):(\d+):(\d+)/.exec(line);
    if (m) {
      at = `${m[1]}:${m[2]}:${m[3]}`;
      break;
    }
  }
  return { where: where.slice(0, 48), msg, at };
}

export class ErrorReporter {
  private readonly seen = new Set<string>();
  private sent = 0;

  constructor(private readonly track: (event: string, props: Record<string, string | number | boolean>) => void) {}

  report(where: string, e: unknown): boolean {
    if (this.sent >= MAX_REPORTS) return false;
    const s = errorSignature(where, e);
    const key = `${s.where}|${s.msg}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.sent++;
    try {
      this.track('error', { where: s.where, msg: s.msg, at: s.at, n: this.sent });
    } catch {
      /* reporting must never throw */
    }
    return true;
  }
}

/** Route loop, UI and uncaught failures to analytics (consent-gated there). Returns an unsubscribe. */
export function installErrorReporting(track: (event: string, props: Record<string, string | number | boolean>) => void): () => void {
  const r = new ErrorReporter(track);
  const offs: Array<() => void> = [onLoopError((label, e) => r.report(label, e)), onUiError((label, e) => r.report(label, e))];
  if (typeof window !== 'undefined') {
    const onErr = (ev: ErrorEvent) => r.report('uncaught', ev.error ?? ev.message);
    const onRej = (ev: PromiseRejectionEvent) => r.report('rejection', ev.reason);
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    offs.push(() => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRej);
    });
  }
  return () => offs.forEach((f) => f());
}
