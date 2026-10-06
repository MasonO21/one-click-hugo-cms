// What one user's app shows, computed from the shared state.

import type { Alert, CheckIn, Consent, Id, Moment, Outbound, Packet, User } from './types';
import type { LadderStep } from './ladder';
import { limitsFor, type Limits } from './plans';
import { isPaused, slotStatus, slotsAround, checkInFor, streak, type SlotInstance, type SlotStatus } from './schedule';
import { DAY, localParts } from './time';
import { type Sunup } from './service';

export interface PersonView {
  id: Id;
  kind: 'user' | 'contact';
  name: string;
  color: string;
  phone?: string;
}

export interface WatcherView extends PersonView {
  receivesPacket: boolean;
  watchId?: Id;
  consent?: Consent;
}

export interface SlotView extends SlotInstance {
  status: SlotStatus;
  checkIn?: CheckIn;
}

export interface WatchedView {
  watchId: Id;
  person: PersonView;
  /** The window that matters most right now: open, just missed, or the latest one. */
  slot?: SlotView;
  lastCheckIn?: CheckIn;
  paused: boolean;
  timezone: string;
}

export interface LadderView extends LadderStep {
  at: number;
  firedAt?: number;
}

export interface AlertView {
  alert: Alert;
  subject: PersonView;
  ladder: LadderView[];
  moment?: Moment;
  /** Released emergency info, for recipients while the alert is open. */
  packet?: Packet;
  resolverName?: string;
}

export interface Postcard {
  checkIn: CheckIn;
  person: PersonView;
  mine: boolean;
}

export interface Snapshot {
  now: number;
  me: User;
  limits: Limits;
  /** Today's windows plus the next upcoming one. */
  slots: SlotView[];
  streak: number;
  watchers: WatcherView[];
  watching: WatchedView[];
  feed: Postcard[];
  myAlerts: AlertView[];
  circleAlerts: AlertView[];
  moment?: Moment;
  packet: Packet;
  outbox: Outbound[];
  history: CheckIn[];
}

export interface SnapshotOptions {
  /** Rewrites photos, e.g. to a URL the client fetches separately. */
  photo?: (checkIn: CheckIn) => string | undefined;
}

const EMPTY_PACKET: Packet = { pets: '', home: '', health: '', people: '', notes: '', updatedAt: 0 };

function person(u: User, withPhone: boolean): PersonView {
  return { id: u.id, kind: 'user', name: u.name, color: u.color, phone: withPhone ? u.phone : undefined };
}

export function buildSnapshot(service: Sunup, userId: Id, now: number, options: SnapshotOptions = {}): Snapshot {
  const state = service.state;
  const me = service.user(userId);
  const limits = limitsFor(me, now);
  const withPhoto = (c: CheckIn): CheckIn => (c.photo && options.photo ? { ...c, photo: options.photo(c) } : c);

  const myCheckIns = service.checkInsOf(me.id);
  const myAlerts = service.alertsOf(me.id);
  const today = localParts(now, me.timezone).date;
  const around = slotsAround(me, now);
  const slotView = (u: User, s: SlotInstance, checkIns: CheckIn[], alerts: Alert[]): SlotView => ({
    ...s,
    status: slotStatus(u, s, checkIns, alerts, now),
    checkIn: checkInFor(s, checkIns),
  });
  const slots = around.filter((s) => s.date === today).map((s) => slotView(me, s, myCheckIns, myAlerts));
  const next = around.find((s) => s.date > today && s.deadlineAt > now);
  if (next && !slots.some((s) => s.status === 'open' || s.status === 'upcoming')) {
    slots.push(slotView(me, next, myCheckIns, myAlerts));
  }

  const watchers: WatcherView[] = service.watchersOf(me.id).map((w) => ({
    id: w.ref.id,
    kind: w.ref.type,
    name: w.name,
    color: w.color,
    phone: w.phone,
    receivesPacket: w.receivesPacket,
    watchId: w.watchId,
    consent: w.consent,
  }));

  const watching: WatchedView[] = service.watchedBy(me.id).map((w) => {
    const u = state.users[w.watchedId];
    const theirs = service.checkInsOf(u.id);
    const alerts = service.alertsOf(u.id);
    const views = slotsAround(u, now)
      .filter((s) => s.acceptFrom <= now)
      .map((s) => slotView(u, s, theirs, alerts));
    const slot = views.find((v) => v.status === 'open') ?? views.findLast((v) => v.status !== 'untracked') ?? views.at(-1);
    return {
      watchId: w.id,
      person: person(u, true),
      slot,
      lastCheckIn: theirs.at(-1) && withPhoto(theirs.at(-1)!),
      paused: isPaused(u, now),
      timezone: u.timezone,
    };
  });

  const feedFrom = now - 2 * DAY;
  const feed: Postcard[] = [];
  for (const c of myCheckIns) if (c.at >= feedFrom) feed.push({ checkIn: withPhoto(c), person: person(me, false), mine: true });
  for (const w of watching) {
    for (const c of service.checkInsOf(w.person.id)) {
      if (c.at >= feedFrom) feed.push({ checkIn: withPhoto(c), person: w.person, mine: false });
    }
  }
  feed.sort((a, b) => b.checkIn.at - a.checkIn.at);

  const alertView = (alert: Alert, viewerIsSubject: boolean): AlertView => {
    const subject = state.users[alert.userId];
    const moment = alert.momentId ? state.moments[alert.momentId] : undefined;
    const circle = service.circleFor(alert);
    const meInCircle = circle.find((w) => w.ref.type === 'user' && w.ref.id === me.id);
    const resolver = alert.resolvedBy ? state.users[alert.resolvedBy] : undefined;
    return {
      alert,
      subject: person(subject, !viewerIsSubject),
      ladder: service.ladder(alert, now).map((step) => ({ ...step, at: service.stepTime(alert, step), firedAt: alert.steps[step.id] })),
      moment: viewerIsSubject || meInCircle ? moment : undefined,
      packet: !viewerIsSubject && !alert.resolvedAt && alert.steps.packet && meInCircle?.receivesPacket ? state.packets[alert.userId] : undefined,
      resolverName: resolver?.name,
    };
  };

  const recent = now - DAY;
  const isRecent = (a: Alert) => !a.resolvedAt || a.resolvedAt >= recent;
  const watchedIds = new Set(watching.map((w) => w.person.id));
  const circleAlerts = Object.values(state.alerts)
    .filter((a) => watchedIds.has(a.userId) && isRecent(a) && a.steps.circle)
    .filter((a) => service.circleFor(a).some((w) => w.ref.id === me.id))
    .sort((a, b) => b.triggeredAt - a.triggeredAt)
    .map((a) => alertView(a, false));

  const outbox = state.outbox
    .filter((o) => o.aboutUserId === me.id || (o.to.type === 'user' && o.to.id === me.id))
    .slice(-60)
    .reverse();

  const historyFrom = now - 30 * DAY;
  return {
    now,
    me,
    limits,
    slots,
    streak: streak(me, myCheckIns, myAlerts, now),
    watchers,
    watching,
    feed: feed.slice(0, 30),
    myAlerts: myAlerts.filter(isRecent).sort((a, b) => b.triggeredAt - a.triggeredAt).map((a) => alertView(a, true)),
    circleAlerts,
    moment: Object.values(state.moments).find((m) => m.userId === me.id && !m.endedAt),
    packet: state.packets[me.id] ?? EMPTY_PACKET,
    outbox,
    history: myCheckIns.filter((c) => c.at >= historyFrom).map(withPhoto).reverse(),
  };
}

