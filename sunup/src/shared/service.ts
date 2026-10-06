// The Sunup engine: every rule about check-ins, alerts and circles lives here.
// The server runs it over a JSON file; the demo runs it over localStorage.

import type {
  Alert,
  Billing,
  AlertKind,
  CheckIn,
  Consent,
  Contact,
  GeoPoint,
  Id,
  Moment,
  MomentDetails,
  MomentKind,
  Mood,
  Outbound,
  Packet,
  Plan,
  RecipientRef,
  Resolution,
  Schedule,
  State,
  StepId,
  User,
  Watch,
} from './types';
import { DEFAULT_GRACE, GRACE_OPTIONS, ladderFor, type LadderStep } from './ladder';
import { TRIAL_MS, isPremium, limitsFor } from './plans';
import { checkInFor, isEnforced, isPaused, scheduleProblem, slotsAround } from './schedule';
import { DAY, MINUTE, isTimeZone } from './time';
import {
  cleanText,
  colorFor,
  fail,
  firstName,
  formatClock,
  formatDuration,
  formatHM,
  formatPhone,
  normalizePhone,
  randomId,
} from './util';

export const MOODS: Mood[] = ['great', 'good', 'okay', 'meh', 'rough'];
export const MOMENT_KINDS: MomentKind[] = ['date', 'run', 'night', 'travel', 'custom'];
export const MOMENT_TITLES: Record<MomentKind, string> = {
  date: 'First date',
  run: 'Run or hike',
  night: 'Night out',
  travel: 'Travel',
  custom: 'Timer',
};
const MAX_PHOTO_CHARS = 400_000;
const PACKET_FIELDS = ['pets', 'home', 'health', 'people', 'notes'] as const;

export const DEFAULT_SCHEDULE: Schedule = {
  slots: [{ start: '07:00', deadline: '10:00' }],
  days: [0, 1, 2, 3, 4, 5, 6],
  smart: false,
};

export type Action =
  | { type: 'checkIn'; mood?: Mood; note?: string; photo?: string }
  | { type: 'updateCheckIn'; id: Id; mood?: Mood; note?: string; photo?: string }
  | { type: 'activity' }
  | { type: 'updateProfile'; name?: string; phone?: string; timezone?: string }
  | { type: 'setSchedule'; schedule: Schedule }
  | { type: 'setGrace'; minutes: number }
  | { type: 'pause'; until: number | null }
  | { type: 'completeOnboarding' }
  | { type: 'addContact'; name: string; phone: string; receivesPacket?: boolean }
  | { type: 'removeContact'; id: Id }
  | { type: 'setPacketRecipient'; ref: RecipientRef; value: boolean }
  | { type: 'acceptInvite'; code: string; watch: boolean; mutual: boolean }
  | { type: 'removeWatch'; id: Id }
  | { type: 'savePacket'; packet: Partial<Packet> }
  | { type: 'startMoment'; kind: MomentKind; minutes: number; title?: string; details?: MomentDetails; shareWith?: Id[] }
  | { type: 'extendMoment'; id: Id; minutes: number }
  | { type: 'endMoment'; id: Id }
  | { type: 'sos'; location?: GeoPoint }
  | { type: 'resolveAlert'; id: Id }
  | { type: 'startTrial' }
  | { type: 'cancelPremium' };

export interface Watcher {
  ref: RecipientRef;
  name: string;
  phone?: string;
  color: string;
  receivesPacket: boolean;
  /** The Watch record, for app users. */
  watchId?: Id;
  /** For contacts: their reply to the consent text. */
  consent?: Consent;
}

export interface ServiceOptions {
  /** Absolute URL of the app, used in texts. */
  baseUrl: string;
}

export class Sunup {
  private pending: Outbound[] = [];
  /** The time of the action or tick being processed. */
  private now = 0;

  constructor(
    public state: State,
    private options: ServiceOptions,
  ) {}

  /** Messages created since the last drain, for delivery. */
  drain(): Outbound[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  // ---------------------------------------------------------------- lookups

  user(id: Id): User {
    const user = this.state.users[id];
    if (!user) fail('not_found', 'Account not found.');
    return user;
  }

  userByInviteCode(code: string): User | undefined {
    const wanted = code.trim().toLowerCase();
    return Object.values(this.state.users).find((u) => u.inviteCode === wanted);
  }

  checkInsOf(userId: Id): CheckIn[] {
    return this.state.checkIns.filter((c) => c.userId === userId);
  }

  alertsOf(userId: Id): Alert[] {
    return Object.values(this.state.alerts).filter((a) => a.userId === userId);
  }

  /** Everyone watching over `userId`: app users first, then text-only contacts. */
  watchersOf(userId: Id): Watcher[] {
    const out: Watcher[] = [];
    for (const w of Object.values(this.state.watches)) {
      if (w.watchedId !== userId) continue;
      const u = this.state.users[w.watcherId];
      if (!u) continue;
      out.push({ ref: { type: 'user', id: u.id }, name: u.name, phone: u.phone, color: u.color, receivesPacket: w.receivesPacket, watchId: w.id });
    }
    for (const c of Object.values(this.state.contacts)) {
      if (c.ownerId !== userId) continue;
      out.push({ ref: { type: 'contact', id: c.id }, name: c.name, phone: c.phone, color: c.color, receivesPacket: c.receivesPacket, consent: c.consent ?? 'pending' });
    }
    return out;
  }

  watchedBy(userId: Id): Watch[] {
    return Object.values(this.state.watches).filter((w) => w.watcherId === userId && this.state.users[w.watchedId]);
  }

  isWatching(watcherId: Id, watchedId: Id): boolean {
    return Object.values(this.state.watches).some((w) => w.watcherId === watcherId && w.watchedId === watchedId);
  }

  // ---------------------------------------------------------------- accounts

  createUser(input: { name: unknown; phone?: unknown; timezone: unknown; phoneVerified?: boolean }, now: number): User {
    const name = cleanText(input.name, 40, 'Name', true);
    const phone = input.phone ? normalizePhone(input.phone) : undefined;
    if (phone && input.phoneVerified && this.userByVerifiedPhone(phone)) fail('phone_taken', 'That number already has a Sunup account. Sign in instead.');
    const timezone = isTimeZone(input.timezone) ? input.timezone : 'America/New_York';
    const id = `u_${randomId()}`;
    let inviteCode = randomId(8);
    while (this.userByInviteCode(inviteCode)) inviteCode = randomId(8);
    const user: User = {
      id,
      name,
      phone,
      phoneVerified: phone ? input.phoneVerified === true : undefined,
      color: colorFor(id),
      timezone,
      createdAt: now,
      onboarded: false,
      plan: 'free',
      schedule: structuredClone(DEFAULT_SCHEDULE),
      scheduleSince: now,
      graceMinutes: DEFAULT_GRACE,
      inviteCode,
    };
    this.state.users[id] = user;
    return user;
  }

  userByVerifiedPhone(phone: string): User | undefined {
    return Object.values(this.state.users).find((u) => u.phoneVerified && u.phone === phone);
  }

  /** Marks a user's number as confirmed by a texted code. A number signs in to one account only. */
  verifyPhone(userId: Id, phone: string): void {
    const user = this.user(userId);
    const owner = this.userByVerifiedPhone(phone);
    if (owner && owner.id !== userId) fail('phone_taken', 'That number is already linked to another Sunup account. Sign in with it instead.');
    user.phone = phone;
    user.phoneVerified = true;
  }

  /** Billing hook: the server's payment webhook (or the demo) sets the plan. */
  setPlan(userId: Id, plan: Plan): void {
    this.user(userId).plan = plan;
  }

  /** Everything stored about one person, for "Download my data". */
  exportUser(userId: Id, now: number) {
    const user = this.user(userId);
    const watching = this.watchedBy(userId).map((w) => this.state.users[w.watchedId]?.name).filter(Boolean);
    return {
      exportedAt: new Date(now).toISOString(),
      account: user,
      circle: {
        watchingOverYou: this.watchersOf(userId).map((w) => ({ name: w.name, phone: w.phone, type: w.ref.type, receivesPacket: w.receivesPacket, consent: w.consent })),
        youreWatching: watching,
      },
      checkIns: this.checkInsOf(userId),
      packet: this.state.packets[userId] ?? null,
      alerts: this.alertsOf(userId),
      moments: Object.values(this.state.moments).filter((m) => m.userId === userId),
      messages: this.state.outbox.filter((o) => o.aboutUserId === userId || (o.to.type === 'user' && o.to.id === userId)),
    };
  }

  /** Erases a person and everything about them: check-ins, circle links, packet, alerts and message log. */
  deleteUser(userId: Id): void {
    this.user(userId);
    const s = this.state;
    delete s.users[userId];
    delete s.packets[userId];
    for (const [id, w] of Object.entries(s.watches)) if (w.watcherId === userId || w.watchedId === userId) delete s.watches[id];
    for (const [id, c] of Object.entries(s.contacts)) if (c.ownerId === userId) delete s.contacts[id];
    for (const [id, a] of Object.entries(s.alerts)) if (a.userId === userId) delete s.alerts[id];
    for (const [id, m] of Object.entries(s.moments)) if (m.userId === userId) delete s.moments[id];
    s.checkIns = s.checkIns.filter((c) => c.userId !== userId);
    s.outbox = s.outbox.filter((o) => o.aboutUserId !== userId && !(o.to.type === 'user' && o.to.id === userId));
  }

  userByCustomerId(customerId: string): User | undefined {
    return Object.values(this.state.users).find((u) => u.billing?.customerId === customerId);
  }

  /** Records a subscription change from the payment provider and sets the plan from its status. */
  applyBilling(userId: Id, patch: Billing, now: number): void {
    const user = this.user(userId);
    user.billing = { ...user.billing, ...patch };
    const status = user.billing.status;
    if (status) user.plan = ['active', 'trialing', 'past_due'].includes(status) ? 'premium' : 'free';
    // A paid trial uses up the card-free one.
    user.trialEndsAt ??= now;
  }

  // ---------------------------------------------------------------- actions

  dispatch(userId: Id, action: Action, now: number): void {
    this.now = now;
    const user = this.user(userId);
    if (!action || typeof action !== 'object') fail('invalid', 'Unknown action.');
    switch (action.type) {
      case 'checkIn':
        this.checkIn(user, action, now);
        return;
      case 'updateCheckIn':
        this.updateCheckIn(user, action, now);
        return;
      case 'activity':
        this.activity(user, now);
        return;
      case 'updateProfile':
        this.updateProfile(user, action, now);
        return;
      case 'setSchedule': {
        const problem = scheduleProblem(action.schedule, limitsFor(user, now).maxSlots);
        if (problem) fail('invalid', problem);
        if (action.schedule.smart && !limitsFor(user, now).smartCheckIn) fail('premium', 'Smart check-in is a Premium feature.');
        user.schedule = {
          slots: action.schedule.slots.map((s) => ({ start: s.start, deadline: s.deadline })),
          days: [...new Set(action.schedule.days)].sort((a, b) => a - b),
          smart: action.schedule.smart,
        };
        user.scheduleSince = now;
        return;
      }
      case 'setGrace':
        if (!(GRACE_OPTIONS as readonly number[]).includes(action.minutes)) fail('invalid', 'Pick 15, 30 or 60 minutes.');
        user.graceMinutes = action.minutes;
        return;
      case 'pause':
        if (action.until === null) {
          user.pause = undefined;
          return;
        }
        if (typeof action.until !== 'number' || action.until <= now || action.until > now + 60 * DAY) {
          fail('invalid', 'Pause for up to 60 days.');
        }
        user.pause = { from: now, until: action.until };
        return;
      case 'completeOnboarding':
        user.onboarded = true;
        user.scheduleSince = now;
        return;
      case 'addContact':
        this.addContact(user, action, now);
        return;
      case 'removeContact': {
        const contact = this.state.contacts[action.id];
        if (!contact || contact.ownerId !== user.id) fail('not_found', 'Contact not found.');
        delete this.state.contacts[action.id];
        return;
      }
      case 'setPacketRecipient':
        this.setPacketRecipient(user, action.ref, action.value === true);
        return;
      case 'acceptInvite':
        this.acceptInvite(user, action, now);
        return;
      case 'removeWatch': {
        const watch = this.state.watches[action.id];
        if (!watch || (watch.watcherId !== user.id && watch.watchedId !== user.id)) fail('not_found', 'Connection not found.');
        delete this.state.watches[action.id];
        return;
      }
      case 'savePacket':
        this.savePacket(user, action.packet, now);
        return;
      case 'startMoment':
        this.startMoment(user, action, now);
        return;
      case 'extendMoment':
        this.extendMoment(user, action.id, action.minutes, now);
        return;
      case 'endMoment':
        this.endMoment(user, action.id, now);
        return;
      case 'sos':
        this.sos(user, action.location, now);
        return;
      case 'resolveAlert':
        this.resolveAlert(user, action.id, now);
        return;
      case 'startTrial':
        if (user.trialEndsAt) fail('trial_used', 'Your free trial has already been used.');
        user.trialEndsAt = now + TRIAL_MS;
        return;
      case 'cancelPremium':
        user.plan = 'free';
        if (user.trialEndsAt && user.trialEndsAt > now) user.trialEndsAt = now;
        return;
      default:
        fail('invalid', 'Unknown action.');
    }
  }

  private checkIn(user: User, input: { mood?: unknown; note?: unknown; photo?: unknown }, now: number): CheckIn {
    const details = this.checkInDetails(input);
    const last = this.checkInsOf(user.id).at(-1);
    let checkIn: CheckIn;
    if (last && now - last.at < MINUTE) {
      // A double tap: keep one check-in.
      Object.assign(last, details);
      checkIn = last;
    } else {
      checkIn = { id: `k_${randomId()}`, userId: user.id, at: now, source: 'tap', ...details };
      this.state.checkIns.push(checkIn);
    }
    // "I'm up" also means "I'm okay": it ends every open alert and any overdue timer.
    for (const alert of this.alertsOf(user.id)) {
      if (alert.resolvedAt) continue;
      if (alert.kind === 'moment' && alert.momentId) {
        const moment = this.state.moments[alert.momentId];
        if (moment && !moment.endedAt) moment.endedAt = now;
      }
      this.resolve(alert, user.id, 'checked_in', now);
    }
    return checkIn;
  }

  private checkInDetails(input: { mood?: unknown; note?: unknown; photo?: unknown }): Partial<CheckIn> {
    const out: Partial<CheckIn> = {};
    if (input.mood !== undefined) {
      if (!MOODS.includes(input.mood as Mood)) fail('invalid', 'Unknown mood.');
      out.mood = input.mood as Mood;
    }
    if (input.note !== undefined) out.note = cleanText(input.note, 140, 'Note') || undefined;
    if (input.photo === '') {
      out.photo = undefined;
    } else if (input.photo !== undefined) {
      if (typeof input.photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(input.photo)) {
        fail('invalid', 'Photo must be an image.');
      }
      if (input.photo.length > MAX_PHOTO_CHARS) fail('invalid', 'Photo is too large.');
      out.photo = input.photo;
    }
    return out;
  }

  private updateCheckIn(user: User, input: { id: Id; mood?: unknown; note?: unknown; photo?: unknown }, now: number): void {
    const checkIn = this.state.checkIns.find((c) => c.id === input.id && c.userId === user.id);
    if (!checkIn) fail('not_found', 'Check-in not found.');
    if (now - checkIn.at > 2 * 60 * MINUTE) fail('invalid', 'Check-ins can only be edited for two hours.');
    Object.assign(checkIn, this.checkInDetails(input));
  }

  /** Smart check-in: the app was opened during an open window. */
  private activity(user: User, now: number): void {
    if (!user.onboarded || !user.schedule.smart || !limitsFor(user, now).smartCheckIn) return;
    const mine = this.checkInsOf(user.id);
    const open = slotsAround(user, now).find((s) => s.acceptFrom <= now && now <= s.deadlineAt);
    if (!open || checkInFor(open, mine)) return;
    this.state.checkIns.push({ id: `k_${randomId()}`, userId: user.id, at: now, source: 'smart' });
  }

  private updateProfile(user: User, input: { name?: unknown; phone?: unknown; timezone?: unknown }, now: number): void {
    if (input.name !== undefined) user.name = cleanText(input.name, 40, 'Name', true);
    if (input.phone !== undefined) {
      const phone = input.phone === '' ? undefined : normalizePhone(input.phone);
      if (phone !== user.phone) {
        user.phone = phone;
        user.phoneVerified = phone ? false : undefined;
      }
    }
    if (input.timezone !== undefined && input.timezone !== user.timezone) {
      if (!isTimeZone(input.timezone)) fail('invalid', 'Unknown time zone.');
      user.timezone = input.timezone;
      user.scheduleSince = now;
    }
  }

  private assertRoom(user: User, now: number): void {
    const max = limitsFor(user, now).maxWatchers;
    if (this.watchersOf(user.id).length >= max) {
      fail('premium', `The free plan covers ${max} people in your circle. Go Premium to add more.`);
    }
  }

  private addContact(user: User, input: { name: unknown; phone: unknown; receivesPacket?: unknown }, now: number): Contact {
    const name = cleanText(input.name, 40, 'Name', true);
    const phone = normalizePhone(input.phone);
    if (Object.values(this.state.contacts).some((c) => c.ownerId === user.id && c.phone === phone)) {
      fail('duplicate', `${formatPhone(phone)} is already in your circle.`);
    }
    this.assertRoom(user, now);
    const id = `c_${randomId()}`;
    const contact: Contact = { id, ownerId: user.id, name, phone, color: colorFor(id), receivesPacket: input.receivesPacket === true, createdAt: now, consent: 'pending' };
    this.state.contacts[id] = contact;
    const owner = firstName(user.name);
    this.send(
      { ref: { type: 'contact', id }, name, phone, color: contact.color, receivesPacket: false, consent: 'pending' },
      'sms',
      {
        aboutUserId: user.id,
        urgent: false,
        title: 'Circle invite',
        body: `Sunup: ${user.name} added you as someone to contact if ${owner} misses a daily safety check-in. Reply YES to confirm, or STOP to opt out. Msg & data rates may apply.`,
      },
    );
    return contact;
  }

  /**
   * A text from a contact's phone (YES, STOP, START, HELP or anything else).
   * Returns the reply to text back, or null for no reply.
   */
  contactReply(phone: string, text: string, now: number): string | null {
    this.now = now;
    const contacts = Object.values(this.state.contacts).filter((c) => c.phone === phone);
    const word = text.toUpperCase().replace(/[^A-Z]/g, ' ').trim().split(/\s+/)[0] ?? '';
    const owners = (list: Contact[]) => [...new Set(list.map((c) => this.state.users[c.ownerId]).filter(Boolean).map((u) => firstName(u!.name)))];
    const tellOwners = (list: Contact[], title: (c: Contact) => string, body: (c: Contact) => string) => {
      for (const c of list) {
        const owner = this.state.users[c.ownerId];
        if (!owner) continue;
        const ref: Watcher = { ref: { type: 'user', id: owner.id }, name: owner.name, color: owner.color, receivesPacket: false };
        this.notify(ref, { aboutUserId: owner.id, urgent: false, link: '#circle', title: title(c), body: body(c) });
      }
    };

    if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'].includes(word)) {
      const changed = contacts.filter((c) => c.consent !== 'stopped');
      changed.forEach((c) => (c.consent = 'stopped'));
      tellOwners(changed, (c) => `${firstName(c.name)} opted out`, (c) => `${firstName(c.name)} replied STOP, so Sunup won't text or call them. Add someone else to your circle.`);
      // The carrier sends the standard opt-out confirmation.
      return null;
    }
    if (['START', 'UNSTOP'].includes(word)) {
      const changed = contacts.filter((c) => c.consent === 'stopped');
      changed.forEach((c) => (c.consent = 'confirmed'));
      tellOwners(changed, (c) => `${firstName(c.name)} is back in your circle`, (c) => `${firstName(c.name)} turned Sunup texts back on.`);
      return contacts.length ? 'Sunup: texts are back on. Reply STOP to opt out.' : null;
    }
    if (['YES', 'Y', 'YEP', 'YEAH', 'OK', 'OKAY', 'CONFIRM', 'SURE'].includes(word)) {
      const changed = contacts.filter((c) => c.consent === 'pending' || c.consent === undefined);
      changed.forEach((c) => (c.consent = 'confirmed'));
      tellOwners(changed, (c) => `${firstName(c.name)} said yes`, (c) => `${firstName(c.name)} confirmed. They'll get texts and calls if you go quiet.`);
      const names = owners(contacts.filter((c) => c.consent === 'confirmed'));
      return names.length
        ? `Thank you. You'll only hear from Sunup if ${names.join(' or ')} misses a check-in. Reply STOP to opt out.`
        : null;
    }
    if (word === 'HELP' || word === 'INFO') {
      return 'Sunup sends safety alerts when someone in your circle misses a daily check-in. Reply STOP to opt out.';
    }
    const names = owners(contacts);
    return names.length
      ? `Sunup can't read replies. To check on ${names.join(' or ')}, call them directly. Reply STOP to opt out.`
      : null;
  }

  private setPacketRecipient(user: User, ref: RecipientRef, value: boolean): void {
    if (ref?.type === 'contact') {
      const contact = this.state.contacts[ref.id];
      if (!contact || contact.ownerId !== user.id) fail('not_found', 'Contact not found.');
      contact.receivesPacket = value;
      return;
    }
    const watch = Object.values(this.state.watches).find((w) => w.watchedId === user.id && w.watcherId === ref?.id);
    if (!watch) fail('not_found', 'That person isn\'t in your circle.');
    watch.receivesPacket = value;
  }

  private acceptInvite(user: User, input: { code: unknown; watch: unknown; mutual: unknown }, now: number): void {
    const inviter = typeof input.code === 'string' ? this.userByInviteCode(input.code) : undefined;
    if (!inviter) fail('not_found', 'That invite link isn\'t valid.');
    if (inviter.id === user.id) fail('invalid', 'That\'s your own invite link.');
    const watch = input.watch === true && !this.isWatching(user.id, inviter.id);
    const mutual = input.mutual === true && !this.isWatching(inviter.id, user.id);
    if (input.watch !== true && input.mutual !== true) fail('invalid', 'Choose at least one way to connect.');
    if (watch) this.assertRoom(inviter, now);
    if (mutual) this.assertRoom(user, now);
    if (watch) this.addWatch(user.id, inviter.id, now);
    if (mutual) this.addWatch(inviter.id, user.id, now);
  }

  private addWatch(watcherId: Id, watchedId: Id, now: number): Watch {
    const watch: Watch = { id: `w_${randomId()}`, watcherId, watchedId, receivesPacket: false, createdAt: now };
    this.state.watches[watch.id] = watch;
    return watch;
  }

  private savePacket(user: User, input: Partial<Packet>, now: number): void {
    if (!input || typeof input !== 'object') fail('invalid', 'Packet is invalid.');
    const packet = this.state.packets[user.id] ?? { pets: '', home: '', health: '', people: '', notes: '', updatedAt: now };
    for (const field of PACKET_FIELDS) {
      if (input[field] !== undefined) packet[field] = cleanText(input[field], 1500, 'Each section');
    }
    packet.updatedAt = now;
    this.state.packets[user.id] = packet;
  }

  private startMoment(
    user: User,
    input: { kind: unknown; minutes: unknown; title?: unknown; details?: MomentDetails; shareWith?: unknown },
    now: number,
  ): Moment {
    if (!limitsFor(user, now).moments) fail('premium', 'Moments are a Premium feature.');
    if (!MOMENT_KINDS.includes(input.kind as MomentKind)) fail('invalid', 'Unknown moment type.');
    const kind = input.kind as MomentKind;
    if (typeof input.minutes !== 'number' || input.minutes < 5 || input.minutes > 24 * 60) {
      fail('invalid', 'Timers run from 5 minutes to 24 hours.');
    }
    if (Object.values(this.state.moments).some((m) => m.userId === user.id && !m.endedAt)) {
      fail('invalid', 'You already have a timer running.');
    }
    const d = input.details ?? {};
    const link = cleanText(d.link, 300, 'Link');
    if (link && !/^https?:\/\/\S+$/i.test(link)) fail('invalid', 'Links must start with http:// or https://');
    const watcherIds = new Set(this.watchersOf(user.id).map((w) => w.ref.id));
    const shareWith = Array.isArray(input.shareWith) ? input.shareWith.filter((id): id is Id => typeof id === 'string' && watcherIds.has(id)) : [];
    const moment: Moment = {
      id: `m_${randomId()}`,
      userId: user.id,
      kind,
      title: cleanText(input.title, 40, 'Title') || MOMENT_TITLES[kind],
      startedAt: now,
      endsAt: now + Math.round(input.minutes) * MINUTE,
      details: {
        who: cleanText(d.who, 80, 'Who') || undefined,
        where: cleanText(d.where, 120, 'Where') || undefined,
        link: link || undefined,
        notes: cleanText(d.notes, 300, 'Notes') || undefined,
      },
      shareWith,
    };
    this.state.moments[moment.id] = moment;
    return moment;
  }

  private ownMoment(user: User, id: Id): Moment {
    const moment = this.state.moments[id];
    if (!moment || moment.userId !== user.id) fail('not_found', 'Timer not found.');
    return moment;
  }

  private extendMoment(user: User, id: Id, minutes: unknown, now: number): void {
    const moment = this.ownMoment(user, id);
    if (moment.endedAt) fail('invalid', 'That timer has already ended.');
    if (typeof minutes !== 'number' || minutes < 5 || minutes > 240) fail('invalid', 'Add between 5 minutes and 4 hours.');
    moment.endsAt = Math.max(moment.endsAt, now) + Math.round(minutes) * MINUTE;
    this.resolveMomentAlerts(moment, user.id, now);
  }

  private endMoment(user: User, id: Id, now: number): void {
    const moment = this.ownMoment(user, id);
    if (!moment.endedAt) moment.endedAt = now;
    this.resolveMomentAlerts(moment, user.id, now);
  }

  private resolveMomentAlerts(moment: Moment, actorId: Id, now: number): void {
    for (const alert of this.alertsOf(moment.userId)) {
      if (alert.momentId === moment.id && !alert.resolvedAt) this.resolve(alert, actorId, 'checked_in', now);
    }
  }

  private sos(user: User, location: unknown, now: number): void {
    let point: GeoPoint | undefined;
    if (location !== undefined && location !== null) {
      const l = location as GeoPoint;
      if (typeof l.lat !== 'number' || typeof l.lng !== 'number' || Math.abs(l.lat) > 90 || Math.abs(l.lng) > 180) {
        fail('invalid', 'Location is invalid.');
      }
      point = { lat: l.lat, lng: l.lng, accuracy: typeof l.accuracy === 'number' ? Math.round(l.accuracy) : undefined };
    }
    if (this.watchersOf(user.id).length === 0) fail('no_circle', 'Add someone to your circle first so SOS has someone to reach.');
    const alert = this.openAlert(user, 'sos', now, { location: point });
    this.escalate(alert, now);
  }

  private resolveAlert(actor: User, id: Id, now: number): void {
    const alert = this.state.alerts[id];
    if (!alert) fail('not_found', 'Alert not found.');
    if (alert.resolvedAt) return;
    if (alert.userId === actor.id) {
      this.checkIn(actor, {}, now);
      return;
    }
    if (!this.isWatching(actor.id, alert.userId)) fail('forbidden', 'You aren\'t watching over this person.');
    this.resolve(alert, actor.id, 'reached', now);
  }

  // ---------------------------------------------------------------- alerts

  /** Opens an alert. `speed` compresses the ladder for demos. */
  openAlert(user: User, kind: AlertKind, triggeredAt: number, extra: Partial<Alert> = {}): Alert {
    const alert: Alert = { id: `a_${randomId()}`, userId: user.id, kind, triggeredAt, steps: {}, ...extra };
    this.state.alerts[alert.id] = alert;
    return alert;
  }

  ladder(alert: Alert, now: number): LadderStep[] {
    const user = this.state.users[alert.userId];
    if (!user) return [];
    return ladderFor(alert.kind, isPremium(user, now), user.graceMinutes);
  }

  /** When a ladder step is (or was) due. */
  stepTime(alert: Alert, step: LadderStep): number {
    return alert.triggeredAt + (step.offset * MINUTE) / (alert.speed ?? 1);
  }

  /** Runs the clock: opens alerts for missed windows and expired timers, then escalates. */
  tick(now: number): void {
    this.now = now;
    const users = Object.values(this.state.users);
    for (const user of users) {
      if (!user.onboarded) continue;
      const mine = this.checkInsOf(user.id);
      const alerts = this.alertsOf(user.id);
      for (const slot of slotsAround(user, now)) {
        if (slot.deadlineAt > now || slot.deadlineAt < now - DAY) continue;
        if (!isEnforced(user, slot) || checkInFor(slot, mine)) continue;
        if (alerts.some((a) => a.kind === 'missed' && a.slotKey === slot.key)) continue;
        this.openAlert(user, 'missed', slot.deadlineAt, { slotKey: slot.key });
      }
      this.remind(user, mine, now);
    }
    for (const moment of Object.values(this.state.moments)) {
      if (moment.endedAt || moment.endsAt > now) continue;
      const user = this.state.users[moment.userId];
      if (!user) continue;
      const exists = this.alertsOf(user.id).some((a) => a.momentId === moment.id && (!a.resolvedAt || a.triggeredAt === moment.endsAt));
      if (!exists) this.openAlert(user, 'moment', moment.endsAt, { momentId: moment.id });
    }
    for (const alert of Object.values(this.state.alerts)) {
      if (!alert.resolvedAt) this.escalate(alert, now);
    }
    this.prune(now);
  }

  /** "Good morning" when a window opens, then a heads-up shortly before the deadline. */
  private remind(user: User, mine: CheckIn[], now: number): void {
    if (isPaused(user, now)) return;
    const slot = slotsAround(user, now).find((s) => s.openAt <= now && now < s.deadlineAt);
    if (!slot || !isEnforced(user, slot) || checkInFor(slot, mine)) return;
    if (user.reminded?.key !== slot.key) user.reminded = { key: slot.key };
    const sent = user.reminded!;
    const me: Watcher = { ref: { type: 'user', id: user.id }, name: user.name, color: user.color, receivesPacket: false };
    const deadline = formatHM(slot.deadline);
    const lead = Math.min(30 * MINUTE, Math.round((slot.deadlineAt - slot.openAt) / 2));
    const base = { aboutUserId: user.id, urgent: false, link: '#today', kind: 'reminder' as const, action: 'checkin' as const };
    if (now >= slot.deadlineAt - lead) {
      if (!sent.soon) {
        sent.soon = sent.open = true;
        this.send(me, 'push', { ...base, title: `${Math.round(lead / MINUTE)} minutes left to check in`, body: `Your circle is expecting you by ${deadline}.` });
      }
      return;
    }
    if (!sent.open) {
      sent.open = true;
      this.send(me, 'push', { ...base, title: `Good morning, ${firstName(user.name)}`, body: `Tap "I'm up" to check in. Your window closes at ${deadline}.` });
    }
  }

  private escalate(alert: Alert, now: number): void {
    const user = this.state.users[alert.userId];
    if (!user) return;
    for (const step of this.ladder(alert, now)) {
      if (alert.steps[step.id] || this.stepTime(alert, step) > now) continue;
      alert.steps[step.id] = now;
      this.fire(alert, user, step.id, now);
    }
  }

  /** Who hears about an alert: everyone, or only the people a timer was shared with. */
  circleFor(alert: Alert): Watcher[] {
    const watchers = this.watchersOf(alert.userId);
    const moment = alert.momentId ? this.state.moments[alert.momentId] : undefined;
    if (alert.kind === 'moment' && moment && moment.shareWith.length > 0) {
      return watchers.filter((w) => moment.shareWith.includes(w.ref.id));
    }
    return watchers;
  }

  private fire(alert: Alert, user: User, step: StepId, now: number): void {
    const name = firstName(user.name);
    const reach = user.phone ? ` at ${formatPhone(user.phone)}` : '';
    const me: Watcher = { ref: { type: 'user', id: user.id }, name: user.name, phone: user.phone, color: user.color, receivesPacket: false };
    const circle = this.circleFor(alert);
    const base = { aboutUserId: user.id, alertId: alert.id };

    if (alert.kind === 'sos') {
      const where = alert.location ? ` Location: https://maps.google.com/?q=${alert.location.lat},${alert.location.lng}` : '';
      if (step === 'circle') {
        for (const w of circle) {
          this.notify(w, { ...base, urgent: true, link: '#circle', title: `SOS from ${name}`, body: `${name} pressed SOS. Call ${name}${reach} now. If you think ${name} is in danger, call 911.${where}` });
        }
      } else if (step === 'call_circle') {
        for (const w of circle) {
          this.call(w, base, `This is Sunup with an emergency alert. ${name} just pressed the S O S button. Please call ${name} right now. If you believe ${name} is in danger, call 9 1 1.`);
        }
      }
      return;
    }

    if (alert.kind === 'moment') {
      const moment = alert.momentId ? this.state.moments[alert.momentId] : undefined;
      if (!moment) return;
      const title = moment.title;
      if (step === 'nudge') {
        const names = circle.map((w) => firstName(w.name)).join(', ') || 'your circle';
        this.notify(me, { ...base, urgent: true, link: '#moments', action: 'checkin', title: `Your "${title}" timer is up`, body: `Are you safe? Tap "I'm safe" or add time. We'll alert ${names} in 10 minutes.` });
      } else if (step === 'circle') {
        const d = moment.details;
        const facts = [d.who && `With: ${d.who}`, d.where && `Where: ${d.where}`, d.link && `Link: ${d.link}`, d.notes && `Notes: ${d.notes}`].filter(Boolean).join('. ');
        const length = formatDuration(moment.endsAt - moment.startedAt);
        for (const w of circle) {
          this.notify(w, {
            ...base,
            urgent: true,
            link: '#circle',
            title: `${name}'s "${title}" timer ran out`,
            body: `${name} set a ${length} safety timer and hasn't checked in since it ended. Try to reach ${name}${reach}.${facts ? ` ${facts}.` : ''}`,
          });
        }
      } else if (step === 'call_circle') {
        for (const w of circle) {
          this.call(w, base, `This is Sunup with a safety alert about ${name}. ${name} set a safety timer for ${title} that ran out, and hasn't checked in. Please try to reach ${name} now. The details ${name} saved were sent to you by text.`);
        }
      }
      return;
    }

    // Missed check-in.
    const deadline = alert.slotKey ? formatHM(alert.slotKey.split('@')[1]) : formatClock(alert.triggeredAt, user.timezone);
    const circleStep = this.ladder(alert, now).find((s) => s.id === 'circle');
    const circleAt = circleStep ? formatClock(this.stepTime(alert, circleStep), user.timezone) : '';
    switch (step) {
      case 'nudge':
        this.notify(me, { ...base, urgent: false, link: '#today', action: 'checkin', title: `Still with us, ${name}?`, body: `Tap to check in. Your circle is expecting you by ${deadline}.` });
        break;
      case 'alarm':
        this.notify(me, {
          ...base,
          urgent: true,
          link: '#today',
          action: 'checkin',
          title: 'You missed your check-in',
          body: `Open Sunup and tap "I'm okay". We'll alert your circle at ${circleAt}.`,
          sms: `Sunup: you missed your ${deadline} check-in. Tap ${this.options.baseUrl} to tell your circle you're OK. We'll alert them at ${circleAt}.`,
        });
        break;
      case 'call_you':
        this.call(me, base, `Hi ${name}. This is Sunup. You missed your ${deadline} check-in. Please open Sunup and tap, I'm okay. If we don't hear from you soon, we'll alert your circle.`);
        break;
      case 'circle':
        for (const w of circle) {
          this.notify(w, {
            ...base,
            urgent: true,
            link: '#circle',
            title: `${name} hasn't checked in`,
            body: `${name} was due by ${deadline} and hasn't answered reminders. Try to reach ${name}${reach}.`,
          });
        }
        break;
      case 'call_circle':
        for (const w of circle) {
          this.call(w, base, `This is Sunup with a safety alert about ${name}. ${name} missed a check-in at ${deadline} and hasn't answered reminders or a phone call. Please try to reach ${name} now. If you can't, consider asking someone to check on ${name} in person.`);
        }
        break;
      case 'packet': {
        const packet = this.state.packets[user.id];
        const sections = packet ? packetSections(packet) : [];
        if (sections.length === 0) break;
        for (const w of circle.filter((r) => r.receivesPacket)) {
          if (w.ref.type === 'user') {
            this.notify(w, { ...base, urgent: true, link: '#circle', title: `${name}'s emergency info is unlocked`, body: `${name} chose you to receive pet care, home access and health details. Open Sunup to see them.` });
          } else {
            const text = sections.map((s) => `${s.label}: ${s.text}`).join('\n');
            this.send(w, 'sms', { ...base, urgent: true, title: `${name}'s emergency info`, body: `Sunup: ${name} chose you to receive this if they went quiet.\n${text}`.slice(0, 1500) });
          }
        }
        break;
      }
      case 'wellness':
        for (const w of circle) {
          this.notify(w, {
            ...base,
            urgent: true,
            link: '#circle',
            title: `Still no word from ${name}`,
            body: `It's been ${formatDuration(now - alert.triggeredAt)} since ${name}'s check-in was due. If nobody can reach ${name}, ask someone nearby to check in person or request a wellness check from local police. Call 911 if you think it's an emergency.`,
          });
        }
        break;
    }
  }

  private resolve(alert: Alert, actorId: Id, resolution: Resolution, now: number): void {
    alert.resolvedAt = now;
    alert.resolvedBy = actorId;
    alert.resolution = resolution;
    if (!alert.steps.circle) return;
    const user = this.state.users[alert.userId];
    if (!user) return;
    const name = firstName(user.name);
    const actor = this.state.users[actorId];
    const body =
      resolution === 'reached' && actor
        ? `${firstName(actor.name)} reached ${name}. All good.`
        : `${name} checked in at ${formatClock(now, user.timezone)}. All good.`;
    for (const w of this.circleFor(alert)) {
      if (w.ref.id === actorId) continue;
      this.notify(w, { aboutUserId: user.id, alertId: alert.id, urgent: false, link: '#circle', title: `${name} is okay`, body });
    }
    if (resolution === 'reached' && actor) {
      const me: Watcher = { ref: { type: 'user', id: user.id }, name: user.name, color: user.color, receivesPacket: false };
      this.notify(me, { aboutUserId: user.id, alertId: alert.id, urgent: false, link: '#today', title: 'Your circle stood down', body: `${firstName(actor.name)} marked that they reached you.` });
    }
  }

  // ---------------------------------------------------------------- delivery

  /** App users get a push (plus a text if urgent); contacts get a text. */
  private notify(
    to: Watcher,
    msg: { title: string; body: string; urgent: boolean; link?: string; sms?: string; aboutUserId: Id; alertId?: Id; action?: Outbound['action'] },
  ): void {
    if (to.ref.type === 'user') {
      this.send(to, 'push', msg);
      if (msg.urgent && to.phone) this.send(to, 'sms', { ...msg, body: msg.sms ?? `Sunup: ${msg.title}. ${msg.body}` });
    } else {
      this.send(to, 'sms', { ...msg, body: msg.sms ?? `Sunup: ${msg.title}. ${msg.body}` });
    }
  }

  private call(to: Watcher, base: { aboutUserId: Id; alertId?: Id }, script: string): void {
    if (!to.phone) return;
    this.send(to, 'call', { ...base, urgent: true, title: `Call to ${to.name}`, body: script });
  }

  private send(
    to: Watcher,
    channel: Outbound['channel'],
    msg: { title: string; body: string; urgent: boolean; link?: string; aboutUserId: Id; alertId?: Id; kind?: Outbound['kind']; action?: Outbound['action'] },
  ): void {
    // People who replied STOP never get another text or call.
    if (to.consent === 'stopped') return;
    const out: Outbound = {
      id: `o_${randomId()}`,
      at: this.now || Date.now(),
      to: { ...to.ref, name: to.name, phone: to.phone },
      channel,
      urgent: msg.urgent,
      title: msg.title,
      body: msg.body,
      link: msg.link,
      aboutUserId: msg.aboutUserId,
      alertId: msg.alertId,
      kind: msg.kind,
      action: msg.action,
    };
    this.state.outbox.push(out);
    this.pending.push(out);
  }

  private prune(now: number): void {
    const keep = now - 60 * DAY;
    if (this.state.checkIns.length && this.state.checkIns[0].at < keep) {
      this.state.checkIns = this.state.checkIns.filter((c) => c.at >= keep);
    }
    for (const [id, alert] of Object.entries(this.state.alerts)) {
      if (alert.resolvedAt && alert.resolvedAt < keep) delete this.state.alerts[id];
    }
    for (const [id, moment] of Object.entries(this.state.moments)) {
      if (moment.endedAt && moment.endedAt < keep) delete this.state.moments[id];
    }
    const outboxKeep = now - 30 * DAY;
    if (this.state.outbox.length > 5000 || (this.state.outbox[0] && this.state.outbox[0].at < outboxKeep)) {
      this.state.outbox = this.state.outbox.filter((o) => o.at >= outboxKeep).slice(-5000);
    }
  }
}

export const PACKET_LABELS: Record<(typeof PACKET_FIELDS)[number], string> = {
  pets: 'Pets',
  home: 'Home access',
  health: 'Health',
  people: 'People to tell',
  notes: 'Anything else',
};

export function packetSections(packet: Packet): { key: (typeof PACKET_FIELDS)[number]; label: string; text: string }[] {
  return PACKET_FIELDS.filter((k) => packet[k].trim()).map((k) => ({ key: k, label: PACKET_LABELS[k], text: packet[k].trim() }));
}
