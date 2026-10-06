// Domain model shared by the web app (demo mode) and the server.

export type Id = string;
export type Plan = 'free' | 'premium';
export type Mood = 'great' | 'good' | 'okay' | 'meh' | 'rough';

/** A daily check-in window, in the user's local time ("HH:MM"). */
export interface Slot {
  start: string;
  deadline: string;
}

export interface Schedule {
  slots: Slot[];
  /** Days the schedule applies to, 0 = Sunday. */
  days: number[];
  /** Premium: opening the app during an open window counts as a check-in. */
  smart: boolean;
}

export interface Pause {
  from: number;
  until: number;
}

export interface User {
  id: Id;
  name: string;
  /** E.164, used for alarm texts and escalation calls. */
  phone?: string;
  color: string;
  timezone: string;
  createdAt: number;
  onboarded: boolean;
  plan: Plan;
  trialEndsAt?: number;
  schedule: Schedule;
  /** When the current schedule took effect; earlier windows are never enforced. */
  scheduleSince: number;
  /** Minutes after a missed deadline before the circle is alerted. */
  graceMinutes: number;
  pause?: Pause;
  inviteCode: string;
}

/** Someone without the app who watches over the user who added them, by text and phone call. */
export interface Contact {
  id: Id;
  ownerId: Id;
  name: string;
  phone: string;
  color: string;
  receivesPacket: boolean;
  createdAt: number;
}

/** An app user (watcher) watching over another app user (watched). */
export interface Watch {
  id: Id;
  watcherId: Id;
  watchedId: Id;
  receivesPacket: boolean;
  createdAt: number;
}

export type CheckInSource = 'tap' | 'smart';

export interface CheckIn {
  id: Id;
  userId: Id;
  at: number;
  source: CheckInSource;
  mood?: Mood;
  note?: string;
  /** Small JPEG data URL. */
  photo?: string;
}

export type AlertKind = 'missed' | 'moment' | 'sos';
export type StepId = 'nudge' | 'alarm' | 'call_you' | 'circle' | 'call_circle' | 'packet' | 'wellness';
export type Resolution = 'checked_in' | 'reached';

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface Alert {
  id: Id;
  userId: Id;
  kind: AlertKind;
  /** For missed check-ins: `${date}@${deadline}`. */
  slotKey?: string;
  momentId?: Id;
  /** The missed deadline, the moment's end, or when SOS was pressed. */
  triggeredAt: number;
  /** When each escalation step fired. */
  steps: Partial<Record<StepId, number>>;
  /** Ladder time multiplier, used by the demo to play an hour-long ladder in about a minute. */
  speed?: number;
  location?: GeoPoint;
  resolvedAt?: number;
  resolvedBy?: Id;
  resolution?: Resolution;
}

export type MomentKind = 'date' | 'run' | 'night' | 'travel' | 'custom';

export interface MomentDetails {
  who?: string;
  where?: string;
  link?: string;
  notes?: string;
}

export interface Moment {
  id: Id;
  userId: Id;
  kind: MomentKind;
  title: string;
  startedAt: number;
  endsAt: number;
  details: MomentDetails;
  /** Watcher ids (users or contacts) who get the details if the timer runs out. Empty = everyone. */
  shareWith: Id[];
  endedAt?: number;
}

export interface Packet {
  pets: string;
  home: string;
  health: string;
  people: string;
  notes: string;
  updatedAt: number;
}

export type RecipientRef = { type: 'user' | 'contact'; id: Id };

export type Channel = 'push' | 'sms' | 'call';

/** A message Sunup sends (push, text or phone call). Kept as an activity log. */
export interface Outbound {
  id: Id;
  at: number;
  to: RecipientRef & { name: string; phone?: string };
  channel: Channel;
  urgent: boolean;
  title: string;
  body: string;
  /** In-app path to open, e.g. "#circle". */
  link?: string;
  aboutUserId: Id;
  alertId?: Id;
}

export interface State {
  version: 1;
  users: Record<Id, User>;
  contacts: Record<Id, Contact>;
  watches: Record<Id, Watch>;
  checkIns: CheckIn[];
  alerts: Record<Id, Alert>;
  moments: Record<Id, Moment>;
  packets: Record<Id, Packet>;
  outbox: Outbound[];
}

export function emptyState(): State {
  return {
    version: 1,
    users: {},
    contacts: {},
    watches: {},
    checkIns: [],
    alerts: {},
    moments: {},
    packets: {},
    outbox: [],
  };
}
