// Gameplay analytics (Update 14, GDD §19, LIVEOPS.md §5): a small event queue the store build's SDK drains.
// track() records an event only with the player's consent (meta/privacy.js canTrack) and only the properties its
// ANALYTICS.events entry lists, as numbers, booleans or short ids (no free text, no birth year). Events queue on the
// device, at most ANALYTICS.queueMax, and flush every flushEvery s to the transport. This build has none (no analytics
// service: ANALYTICS.endpoint is empty), so the queue is all there is; Settings → Privacy shows it, and withdrawing
// consent or deleting your data empties it. The store build calls setTransport(batch => Promise<boolean>).
import { ANALYTICS } from '../game/data.js';
import { canTrack } from './privacy.js';
import { now as clockNow } from './clock.js';

const KEY = 'soulswarm.events.v1';
let profile = null, queue = [], session = '', seq = 0, transport = null, timer = 0, sending = false;

const load = () => { try { const q = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(q) ? q.slice(-ANALYTICS.queueMax) : []; } catch (e) { return []; } };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch (e) { /* storage full or blocked: the queue lives in memory */ } };

/** A value an event may carry: finite numbers (rounded to 2 places), booleans, and short ids (letters, digits, _ . - +). */
function clean(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : undefined;
  if (typeof v === 'string') return /^[\w.+-]{0,32}$/.test(v) ? v : undefined;
  return undefined;
}

export const analytics = {
  /** Called once at boot with the live profile. */
  init(p) {
    profile = p; queue = load();
    session = Math.floor(clockNow()).toString(36) + Math.random().toString(36).slice(2, 6);
    clearInterval(timer);
    timer = setInterval(() => analytics.flush(), ANALYTICS.flushEvery * 1000);
  },

  /** Records `name` with the allowed `props`. Returns whether it was recorded. */
  track(name, props = {}) {
    if (!profile || !canTrack(profile)) return false;
    const keys = ANALYTICS.events[name];
    if (!keys) { if (import.meta.env && import.meta.env.DEV) console.warn('analytics: unknown event', name); return false; }
    const p = {};
    for (const k of keys) { const v = clean(props[k]); if (v !== undefined) p[k] = v; }
    queue.push({ n: name, t: Math.floor(clockNow()), s: session, i: ++seq, u: profile.privacy.id, p });
    if (queue.length > ANALYTICS.queueMax) queue.splice(0, queue.length - ANALYTICS.queueMax);
    persist();
    return true;
  },

  /** Sends up to `batch` queued events through the transport; they leave the queue only once it confirms. */
  async flush() {
    if (!transport || sending || !queue.length || !profile || !canTrack(profile)) return 0;
    sending = true;
    const batch = queue.slice(0, ANALYTICS.batch);
    try {
      if (await transport(batch)) { queue.splice(0, batch.length); persist(); return batch.length; }
    } catch (e) { /* offline: try again next time */ } finally { sending = false; }
    return 0;
  },

  /** The store build's SDK hook: fn(batch) resolves true once the events are accepted. */
  setTransport(fn) { transport = typeof fn === 'function' ? fn : null; },

  /** Empties the queue (consent withdrawn, data deleted). */
  clear() { queue = []; persist(); },

  /** QA and Settings → Privacy: a copy of the queue. */
  events: () => queue.slice(),
  get session() { return session; },
};
