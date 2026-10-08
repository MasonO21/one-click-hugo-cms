/**
 * Local-notification plan: the few gentle reminders left behind when the app goes to the background.
 *
 * `planNotifications(snapshot)` is pure (no DOM, no Capacitor, no clock): it takes a `NotifySnapshot` (what the
 * colony has, what it makes while away, the daily gift, "now") and returns at most three notifications.
 * `notifySnapshot(game)` reads that snapshot from a running game. The platform adapter (notifications.ts) hands
 * the plan to the OS.
 *
 * The reminders, each only when it is true and useful:
 *  - storage  — the first resource stops filling while away. "Full" means what Welcome Back will credit: offline
 *               gains fill storage up to capacity × `balance.offlineStorageMult`, so that is when production of it
 *               really stops. Timed by running the economy's own offline model (`simulateOffline`), so converters,
 *               upkeep paid from fresh production and the 80% offline efficiency all count. Only when that is at
 *               least 30 minutes away and before the offline cap.
 *  - offline  — the offline cap (8 h × research/VIP bonuses): the colony stops producing until the player is back.
 *               Only when something is still being made at that point.
 *  - daily    — the daily gift resets at local midnight: only when today's gift is already claimed (a gift waiting
 *               right now needs no reminder) and gifts are offered (not during the guided first session).
 *  - miss     — one "we miss you" a day later. Nothing after that: no nagging chains.
 *
 * Cozy rules: nothing within 30 minutes of leaving, nothing between 22:00 and 08:00 local time (moved to 08:00 with
 * a "Good morning!"), reminders less than an hour apart become one notification, at most three in total, and
 * stable ids per kind so rescheduling replaces instead of duplicating.
 *
 * OWNER: meta agent (platform). Tests: tests/notify.plan.test.ts.
 */
import type { Game } from '../core/Game';
import { simulateOffline, type OfflineModel } from '../sim/econ/offline';

export type NotifyKind = 'storage' | 'offline' | 'daily' | 'miss';

/** Stable OS notification ids (Android needs 32-bit ints). A merged notification keeps its lead kind's id. */
export const NOTIFY_IDS: Readonly<Record<NotifyKind, number>> = { storage: 41_001, offline: 41_002, daily: 41_003, miss: 41_004 };
export const ALL_NOTIFY_IDS: readonly number[] = Object.values(NOTIFY_IDS);

/** Nothing fires sooner than this after leaving (an app switch is not an absence). */
export const MIN_LEAD_MS = 30 * 60_000;
/** Quiet hours, local time: nothing from QUIET_FROM:00 until QUIET_UNTIL:00. */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;
/** Reminders closer than this to the previous one are folded into it. */
export const MERGE_WINDOW_MS = 60 * 60_000;
export const MAX_SCHEDULED = 3;
/** The one "we miss you", this long after leaving. */
export const MISS_YOU_AFTER_MS = 24 * 3_600_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** A storage limit this large is no limit at all (never "full"). */
const UNLIMITED = 1e12;
/** Forecast resolution: the offline window is sampled this many times, then the first fill is refined (≈ 5 s). */
const SAMPLES = 24;
const REFINE_STEPS = 8;

export interface PlannedNotification {
  /** Stable id (NOTIFY_IDS of the lead kind). */
  id: number;
  /** The lead reminder; `kinds` lists everything folded into this notification. */
  kind: NotifyKind;
  kinds: NotifyKind[];
  /** Epoch ms. */
  at: number;
  title: string;
  body: string;
  /** Panel to open when the notification is tapped. */
  panel?: 'daily';
}

export interface NotifySnapshot {
  /** Epoch ms: the moment the player leaves. */
  now: number;
  colonyName: string;
  colonists: number;
  offline: {
    /** The economy's offline flow model (EconomySystem.offlineModel, after a recompute). */
    model: OfflineModel;
    /** Share of real time credited while away (balance.offlineEfficiency). */
    efficiency: number;
    /** Real seconds of absence that still produce (offlineHours × 3600 × the offlineHours modifier). */
    capSeconds: number;
    /** Welcome Back fills storage up to capacity × this (balance.offlineStorageMult). */
    storageMult: number;
  };
  /** Stockpile and storage capacity per resource. */
  amounts: Readonly<Record<string, number>>;
  capacity: Readonly<Record<string, number>>;
  /** Display names per resource id (used lower-cased in copy). */
  names: Readonly<Record<string, string>>;
  daily: {
    /** Today's gift is waiting right now (not claimed yet). */
    claimable: boolean;
    /** Gifts are offered at all (after the guided first session, and there are rewards). */
    offered: boolean;
    /** The day (1..7) the next claim pays out. */
    nextDay: number;
  };
}

/** Minutes east of UTC at an instant (DST aware). */
export type UtcOffset = (atMs: number) => number;

/** The device's local time zone (the same clock `dateKey` uses for the daily reset). */
export const deviceUtcOffset: UtcOffset = (at) => -new Date(at).getTimezoneOffset();

export interface PlanOptions {
  /** Local time zone (default: the device's). */
  utcOffset?: UtcOffset;
}

// ---------------------------------------------------------------------------------------------- local time

function localHour(at: number, tz: UtcOffset): number {
  const local = at + tz(at) * 60_000;
  return Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / HOUR_MS);
}

/** Epoch ms of `hour`:00 local time, `dayOffset` days after the local day containing `at`. */
export function localTimeOn(at: number, tz: UtcOffset, hour: number, dayOffset = 0): number {
  const off = tz(at) * 60_000;
  const target = Math.floor((at + off) / DAY_MS) * DAY_MS + dayOffset * DAY_MS + hour * HOUR_MS;
  const utc = target - off;
  const off2 = tz(utc) * 60_000; // a DST change in between
  return off2 === off ? utc : target - off2;
}

/** The next local midnight after `now` (when the daily gift resets). */
export function nextLocalMidnight(now: number, tz: UtcOffset = deviceUtcOffset): number {
  return localTimeOn(now, tz, 0, 1);
}

/** Move a time out of quiet hours (to the next QUIET_UNTIL:00). */
export function outsideQuietHours(at: number, tz: UtcOffset = deviceUtcOffset): { at: number; shifted: boolean } {
  const h = localHour(at, tz);
  if (h >= QUIET_FROM_HOUR) return { at: localTimeOn(at, tz, QUIET_UNTIL_HOUR, 1), shifted: true };
  if (h < QUIET_UNTIL_HOUR) return { at: localTimeOn(at, tz, QUIET_UNTIL_HOUR, 0), shifted: true };
  return { at, shifted: false };
}

// ---------------------------------------------------------------------------------------------- forecast

export interface StorageForecast {
  /** Real ms after `now` at which the first resource (filling no sooner than `minMs`) stops filling, or null. */
  firstFullMs: number | null;
  /** That resource plus any filling within MERGE_WINDOW_MS after it, earliest first. */
  resources: string[];
  /** Real ms after `now` at which each resource fills (sampled every 1/24 of the window; the first one refined). */
  fullAtMs: Record<string, number>;
  /** Something (a resource or research) is still being made at the offline cap. */
  producingAtCap: boolean;
}

type SimResult = ReturnType<typeof simulateOffline>;

/**
 * When does storage fill while the player is away? Runs the offline simulation Welcome Back uses at increasing
 * absences (real time × efficiency, storage up to capacity × storageMult) and reports the first resource that stops
 * filling no sooner than `minMs` after leaving. Resources already at their limit, with an effectively unlimited store
 * or with no net production never count.
 */
export function forecastStorage(snap: NotifySnapshot, minMs = 0): StorageForecast {
  const { model, efficiency, capSeconds, storageMult } = snap.offline;
  if (!(efficiency > 0) || !(capSeconds > 0)) return { firstFullMs: null, resources: [], fullAtMs: {}, producingAtCap: false };
  const mult = storageMult > 0 ? storageMult : 1;
  const cap: Record<string, number> = {};
  for (const r in snap.capacity) cap[r] = snap.capacity[r] * mult;

  const limitOf = (r: string): number => {
    const c = cap[r];
    return Number.isFinite(c) && c < UNLIMITED ? Math.max(c, snap.amounts[r] ?? 0) : Infinity;
  };
  const watched = new Set<string>();
  for (const f of model.flows) for (const [r] of f.outs) watched.add(r);
  // Room left, in the whole units the simulation reports gains in: the gain reaches it exactly when the store hits
  // its limit (for a whole-number stockpile; a fractional one at most a fraction of a unit early).
  const room: Record<string, number> = {};
  for (const r of watched) {
    const lim = limitOf(r);
    if (lim < Infinity) room[r] = Math.floor(lim - (snap.amounts[r] ?? 0) + 1e-6);
  }
  // a resource already at its limit is not news (the player just saw it)
  const candidates = [...watched].filter((r) => (room[r] ?? 0) >= 1);

  const sim = (realSeconds: number): SimResult => simulateOffline(model, realSeconds * efficiency, snap.amounts, cap);
  const levelOf = (res: SimResult, r: string) => (snap.amounts[r] ?? 0) + (res.gains[r] ?? 0) - (res.spent[r] ?? 0);
  const isFull = (res: SimResult, r: string) => (res.gains[r] ?? 0) - (res.spent[r] ?? 0) >= room[r];

  const fullAtMs: Record<string, number> = {};
  const sampleOf: Record<string, number> = {};
  const lateT = Math.max(0, capSeconds - 1800); // "still producing" = growth over the last half hour
  let late: SimResult | null = null;
  let last: SimResult | null = null;
  const tAt = (i: number) => (capSeconds * i) / SAMPLES;
  for (let i = 1; i <= SAMPLES; i++) {
    const t = tAt(i);
    const res = sim(t);
    for (const r of candidates) {
      if (sampleOf[r] === undefined && isFull(res, r)) {
        sampleOf[r] = i;
        fullAtMs[r] = t * 1000;
      }
    }
    if (late === null && t >= lateT && i < SAMPLES) late = res;
    last = res;
  }
  const early = late ?? sim(lateT);
  const producingAtCap = !!last && (last.rp > early.rp || Object.keys(last.gains).some((r) => levelOf(last!, r) > levelOf(early, r) + 0.5));

  const order = Object.keys(fullAtMs).sort((a, b) => fullAtMs[a] - fullAtMs[b] || a.localeCompare(b));
  const firstR = order.find((r) => fullAtMs[r] >= minMs) ?? null;
  if (firstR === null) return { firstFullMs: null, resources: [], fullAtMs, producingAtCap };

  // refine between the two samples around it
  let lo = tAt(sampleOf[firstR] - 1);
  let hi = tAt(sampleOf[firstR]);
  for (let k = 0; k < REFINE_STEPS; k++) {
    const mid = (lo + hi) / 2;
    if (isFull(sim(mid), firstR)) hi = mid;
    else lo = mid;
  }
  const first = Math.max(hi * 1000, minMs); // (sampled just after minMs, refined just before: still full by then)
  fullAtMs[firstR] = first;
  const resources = order.filter((r) => fullAtMs[r] >= first && fullAtMs[r] <= first + MERGE_WINDOW_MS);
  if (!resources.includes(firstR)) resources.unshift(firstR);
  resources.sort((a, b) => fullAtMs[a] - fullAtMs[b] || a.localeCompare(b));
  return { firstFullMs: first, resources, fullAtMs, producingAtCap };
}

// ---------------------------------------------------------------------------------------------- copy

/** "your colony" when the name is missing or unwieldy. */
function colonyLabel(name: string): string {
  const n = (name ?? '').trim();
  return n && n.length <= 24 ? n : '';
}

/** "wood", "wood and stone" (lower-case, as the in-game toasts say it). */
function resourceList(ids: string[], names: Readonly<Record<string, string>>): string {
  const words = ids.slice(0, 2).map((r) => {
    const w = (names[r] ?? r).toLowerCase();
    return /(cell|part|kit)$/.test(w) ? `${w}s` : w;
  });
  return words.join(' and ');
}

const DAILY_TOO = 'Your daily gift is ready too. 🎁';

interface Copy {
  title: string;
  body: string;
}

function copyFor(kind: NotifyKind, snap: NotifySnapshot, storage: StorageForecast): Copy {
  const colony = colonyLabel(snap.colonyName);
  switch (kind) {
    case 'storage': {
      const what = resourceList(storage.resources, snap.names);
      return { title: 'Your storehouses are bursting! 📦', body: `Come spend your ${what}. There's no room left for more!` };
    }
    case 'offline': {
      const hours = Math.round(snap.offline.capSeconds / 3600);
      const who = snap.colonists > 0 ? 'Your colonists have' : 'Your colony has';
      return { title: 'Time to collect! 🧺', body: `${who} been busy for ${hours} hours. Come collect!` };
    }
    case 'daily':
      return { title: 'Your daily gift is ready! 🎁', body: `Your day ${snap.daily.nextDay} gift is waiting${colony ? ` in ${colony}` : ''}. Come and unwrap it!` };
    case 'miss': {
      const body =
        snap.colonists > 0 ? "Your colonists keep looking up at the sky, hoping you'll visit. Pop in and say hello!" : 'Your little colony is waiting for you. Pop in and say hello!';
      return { title: `${colony || 'Your colony'} misses you 💛`, body: snap.daily.offered ? `${body} A daily gift is waiting too. 🎁` : body };
    }
  }
}

// ---------------------------------------------------------------------------------------------- plan

/** Which reminder leads a merged notification (and survives the cap): lower = more important. */
const PRIORITY: Readonly<Record<NotifyKind, number>> = { offline: 0, storage: 1, daily: 2, miss: 3 };

interface Timed {
  kind: NotifyKind;
  at: number;
  /** Moved out of quiet hours to the morning. */
  morning: boolean;
}

/** One notification: the reminders folded into it, in time order. */
type Slot = Timed[];

const leadOf = (s: Slot): NotifyKind => s.map((m) => m.kind).reduce((a, b) => (PRIORITY[b] < PRIORITY[a] ? b : a));

/**
 * The notifications to schedule when the player leaves now, earliest first. Pure: everything comes from the
 * snapshot (and the time zone, default the device's).
 */
export function planNotifications(snap: NotifySnapshot, opts: PlanOptions = {}): PlannedNotification[] {
  const tz = opts.utcOffset ?? deviceUtcOffset;
  const now = snap.now;
  const capMs = Math.max(0, snap.offline.capSeconds) * 1000;
  const storage = forecastStorage(snap, MIN_LEAD_MS);

  // 1. candidates at their earliest truthful time
  const raw: { kind: NotifyKind; at: number }[] = [];
  if (storage.firstFullMs !== null && storage.firstFullMs >= MIN_LEAD_MS && storage.firstFullMs < capMs) {
    raw.push({ kind: 'storage', at: now + storage.firstFullMs });
  }
  if (capMs >= MIN_LEAD_MS && storage.producingAtCap) raw.push({ kind: 'offline', at: now + capMs });
  if (!snap.daily.claimable && snap.daily.offered) raw.push({ kind: 'daily', at: Math.max(nextLocalMidnight(now, tz), now + MIN_LEAD_MS) });
  raw.push({ kind: 'miss', at: now + MISS_YOU_AFTER_MS });

  // 2. quiet hours -> the next morning
  const timed: Timed[] = raw
    .map((c) => {
      const q = outsideQuietHours(c.at, tz);
      return { kind: c.kind, at: q.at, morning: q.shifted };
    })
    .sort((a, b) => a.at - b.at || PRIORITY[a.kind] - PRIORITY[b.kind]);

  // 3. a reminder within an hour of the previous one joins its notification
  const slots: Slot[] = [];
  for (const c of timed) {
    const prev = slots[slots.length - 1];
    if (prev && c.at - prev[prev.length - 1].at <= MERGE_WINDOW_MS) prev.push(c);
    else slots.push([c]);
  }

  // 4. at most MAX_SCHEDULED, keeping the most useful
  const kept = slots.sort((a, b) => PRIORITY[leadOf(a)] - PRIORITY[leadOf(b)] || a[0].at - b[0].at).slice(0, MAX_SCHEDULED);

  // 5. the lead's words; a daily gift folded into another reminder adds a line, the rest is implied (storage by
  //    the offline cap, "we miss you" by anything). Sent once everything it says is true.
  return kept
    .map((slot) => {
      const kind = leadOf(slot);
      const withDaily = slot.some((m) => m.kind === 'daily');
      const voiced = slot.filter((m) => m.kind === kind || (m.kind === 'daily' && kind !== 'miss'));
      const last = voiced.reduce((a, b) => (b.at > a.at ? b : a));
      const c = copyFor(kind, snap, storage);
      let body = c.body;
      if (withDaily && kind !== 'daily' && kind !== 'miss') body = `${body} ${DAILY_TOO}`;
      if (last.morning) body = `Good morning! ${body}`;
      const n: PlannedNotification = { id: NOTIFY_IDS[kind], kind, kinds: slot.map((m) => m.kind), at: last.at, title: c.title, body };
      if (withDaily || (kind === 'miss' && snap.daily.offered)) n.panel = 'daily';
      return n;
    })
    .sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------------------------- snapshot

/** Read the planner's input from a running game (recomputes the economy, like Welcome Back does). */
export function notifySnapshot(game: Game): NotifySnapshot {
  const eco = game.sys.economy;
  const lo = game.sys.liveops;
  const bal = game.data.balance;
  eco.recompute();
  const names: Record<string, string> = {};
  for (const r of game.data.resources) names[r.id] = r.name;
  return {
    now: game.now(),
    colonyName: game.state.colony.name,
    colonists: game.state.colonists.list.length,
    offline: {
      model: eco.offlineModel(),
      efficiency: bal.offlineEfficiency,
      capSeconds: bal.offlineHours * 3600 * eco.modifier('offlineHours'),
      storageMult: bal.offlineStorageMult ?? 1,
    },
    amounts: { ...game.state.resources.amounts },
    capacity: { ...game.derived.capacity },
    names,
    daily: {
      claimable: lo.dailyAvailable(),
      offered: lo.offersUnlocked() && game.data.dailyRewards.length > 0,
      nextDay: lo.dailyDay(),
    },
  };
}
