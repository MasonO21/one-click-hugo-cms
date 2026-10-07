// Trusted time for daily resets, energy and every timer. The device clock can be wound to farm daily rewards, so:
// - online, the clock is set from a time server (CLOCK in data.js) and then runs on performance.now(), which changing
//   the device clock cannot touch; it re-syncs on resume and every few minutes;
// - offline, it uses the device clock but never runs earlier than the last trusted time (kept in the save);
// - the day used for daily resets only ever moves forward, so winding the clock back (or a server correction after an
//   offline wind-forward) re-grants nothing: rewards claimed early simply wait for real time to catch up.
import { CLOCK } from '../game/data.js';

const nativeNow = Date.now;
let device = () => Date.now();
let base = 0, mark = 0, synced = false, floor = 0, maxDay = '', inflight = null;
const mono = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const qaTravel = () => Date.now !== nativeNow; // QA: tests that replace Date.now() travel in time freely

/** Local calendar day of t as 'YYYY-MM-DD' (string order is date order). */
export const dateKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Local midnight that starts the day `key`. */
export const dayTime = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

/** Trusted milliseconds since the epoch. */
export function now() {
  if (qaTravel()) return Date.now();
  if (synced) return base + (mono() - mark);
  floor = Math.max(device(), floor); // offline: never earlier than anything already handed out
  return floor;
}

/** Today for daily resets ('YYYY-MM-DD'): never earlier than the latest day already seen. */
export function today() {
  const k = dateKey(now());
  if (qaTravel()) return k;
  if (k > maxDay) maxDay = k;
  return maxDay;
}

export const isSynced = () => synced;

/** The save keeps the last trusted time and the latest day (profile.clock); restore() takes them back at load. */
export function snapshot() { return { t: now(), day: maxDay }; }
export function restore(c) {
  if (!c) return;
  if (Number.isFinite(+c.t)) floor = Math.max(floor, +c.t);
  if (typeof c.day === 'string' && /^\d{4}-\d\d-\d\d$/.test(c.day) && c.day > maxDay) maxDay = c.day;
}

// A source answers with a Cloudflare trace (ts=…), JSON ({ now } ms, unixtime s or a UTC dateTime) or a Date header.
function parse(res, text) {
  const ts = /(?:^|\n)ts=(\d+(?:\.\d+)?)/.exec(text);
  if (ts) return +ts[1] * 1000;
  try {
    const j = JSON.parse(text);
    if (Number.isFinite(j.now)) return j.now;
    if (Number.isFinite(j.unixtime)) return j.unixtime * 1000;
    if (typeof j.dateTime === 'string') return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(j.dateTime) ? j.dateTime : j.dateTime + 'Z');
  } catch (e) { /* not JSON */ }
  const h = res.headers && res.headers.get('date');
  return h ? Date.parse(h) + 500 : NaN; // a Date header has whole seconds
}

async function ask(url) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl && setTimeout(() => ctl.abort(), CLOCK.timeoutMs);
  try {
    const t0 = mono();
    const res = await fetch(url, { cache: 'no-store', signal: ctl && ctl.signal });
    const text = await res.text();
    const rtt = mono() - t0, t = parse(res, text);
    if (!res.ok || !(t > CLOCK.min && t < CLOCK.max) || rtt > CLOCK.maxRtt) return null;
    return { t: t + rtt / 2, at: mono() };
  } catch (e) {
    return null;
  } finally { if (timer) clearTimeout(timer); }
}

/** Ask the time sources in order. Resolves true once one answers; on a failed resume sync the clock falls back to
 *  the device (floored), since a suspended app's performance.now() may have stood still. */
export function sync({ resume = false } = {}) {
  if (inflight) return inflight;
  const urls = [CLOCK.server, ...CLOCK.sources].filter(Boolean);
  inflight = (async () => {
    for (const url of urls) {
      const r = await ask(url);
      if (r) { base = r.t + (mono() - r.at); mark = mono(); synced = true; return true; }
    }
    if (resume && synced) { floor = Math.max(floor, now()); synced = false; }
    return false;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** QA: a stand-in device clock (protections stay on, unlike replacing Date.now), and a full reset. */
export const qa = {
  device(fn) { device = fn || (() => Date.now()); },
  reset() { base = mark = floor = 0; synced = false; maxDay = ''; device = () => Date.now(); },
};
