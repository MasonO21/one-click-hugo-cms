import { describe, expect, it } from 'vitest';
import { Sunup, type Action } from '../src/shared/service';
import { buildSnapshot } from '../src/shared/snapshot';
import { emptyState, type User } from '../src/shared/types';
import { MINUTE, HOUR, DAY, zonedToUtc, localParts, addDays } from '../src/shared/time';
import { streak, slotsBetween } from '../src/shared/schedule';
import { normalizePhone } from '../src/shared/util';

const TZ = 'America/New_York';
// Wednesday, March 4 2026, 06:00 local.
const T0 = zonedToUtc('2026-03-04', '06:00', TZ);
const at = (date: string, time: string) => zonedToUtc(date, time, TZ);

function setup() {
  const svc = new Sunup(emptyState(), { baseUrl: 'https://sunup.test' });
  const signupTime = T0 - 2 * DAY;
  // Both signed up with a texted code, so their numbers are confirmed.
  const maya = svc.createUser({ name: 'Maya Chen', phone: '555-201-0001', timezone: TZ, phoneVerified: true }, signupTime);
  const jordan = svc.createUser({ name: 'Jordan Lee', phone: '5552010002', timezone: TZ, phoneVerified: true }, signupTime);
  const act = (u: User, action: Action, now: number) => svc.dispatch(u.id, action, now);
  act(maya, { type: 'completeOnboarding' }, signupTime);
  act(jordan, { type: 'completeOnboarding' }, signupTime);
  act(jordan, { type: 'acceptInvite', code: maya.inviteCode, watch: true, mutual: false }, signupTime);
  act(maya, { type: 'addContact', name: 'Mom', phone: '(555) 201-0003', receivesPacket: true }, signupTime);
  svc.contactReply('+15552010003', 'Yes', signupTime);
  // Both kept their windows on the two days before the tests start.
  for (const date of ['2026-03-02', '2026-03-03']) {
    act(maya, { type: 'checkIn' }, at(date, '08:00'));
    act(jordan, { type: 'checkIn' }, at(date, '08:05'));
  }
  // Jordan is only here as a watcher; keep Jordan's own windows quiet.
  act(jordan, { type: 'pause', until: at('2026-03-10', '00:00') }, signupTime);
  svc.drain();
  return { svc, maya, jordan, act };
}

function tickThrough(svc: Sunup, from: number, to: number, step = MINUTE) {
  for (let t = from; t <= to; t += step) svc.tick(t);
}

describe('time zones', () => {
  it('converts local wall time to UTC across DST', () => {
    expect(new Date(zonedToUtc('2026-01-15', '07:00', TZ)).toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(new Date(zonedToUtc('2026-07-15', '07:00', TZ)).toISOString()).toBe('2026-07-15T11:00:00.000Z');
    // 02:30 doesn't exist on spring-forward day; it resolves to 03:30 EDT.
    expect(new Date(zonedToUtc('2026-03-08', '02:30', TZ)).toISOString()).toBe('2026-03-08T07:30:00.000Z');
    expect(localParts(zonedToUtc('2026-11-01', '09:15', TZ), TZ).time).toBe('09:15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('phone numbers', () => {
  it('normalizes US numbers and rejects junk', () => {
    expect(normalizePhone('(555) 201-0001')).toBe('+15552010001');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
    expect(() => normalizePhone('12345')).toThrow();
  });
});

describe('daily check-in', () => {
  it('a check-in inside the window satisfies it and opens no alert', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'checkIn', mood: 'good' }, at('2026-03-04', '08:12'));
    tickThrough(svc, at('2026-03-04', '09:55'), at('2026-03-04', '12:00'), 5 * MINUTE);
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
    const snap = buildSnapshot(svc, maya.id, at('2026-03-04', '12:00'));
    expect(snap.slots[0].status).toBe('done');
  });

  it('counts a check-in up to two hours before the window opens', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'checkIn' }, at('2026-03-04', '05:30'));
    svc.tick(at('2026-03-04', '11:00'));
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
  });

  it('escalates a missed window on the free plan, then stands everyone down', () => {
    const { svc, maya, jordan, act } = setup();
    tickThrough(svc, at('2026-03-04', '09:58'), at('2026-03-04', '10:29'));
    const alert = svc.alertsOf(maya.id)[0];
    expect(alert.kind).toBe('missed');
    expect(Object.keys(alert.steps)).toEqual(['nudge', 'alarm']);
    const before = svc.drain();
    expect(before.every((o) => o.to.id === maya.id)).toBe(true);
    expect(before.some((o) => o.channel === 'sms')).toBe(true);

    svc.tick(at('2026-03-04', '10:30'));
    const circle = svc.drain();
    expect(circle.map((o) => `${o.to.name}:${o.channel}`).sort()).toEqual(['Jordan Lee:push', 'Jordan Lee:sms', 'Mom:sms']);
    expect(circle[0].body).toContain('Maya was due by 10 AM');

    // Jordan now sees the alert; Maya checks in late.
    expect(buildSnapshot(svc, jordan.id, at('2026-03-04', '10:31')).circleAlerts).toHaveLength(1);
    act(maya, { type: 'checkIn' }, at('2026-03-04', '10:42'));
    expect(svc.alertsOf(maya.id)[0].resolution).toBe('checked_in');
    const standDown = svc.drain();
    expect(standDown.filter((o) => o.title === 'Maya is okay').map((o) => o.to.name).sort()).toEqual(['Jordan Lee', 'Mom']);
    expect(buildSnapshot(svc, maya.id, at('2026-03-04', '11:00')).slots[0].status).toBe('late');
  });

  it('runs the full premium ladder and releases the packet only while the alert is open', () => {
    const { svc, maya, jordan, act } = setup();
    act(maya, { type: 'startTrial' }, at('2026-03-04', '06:00'));
    act(maya, { type: 'savePacket', packet: { pets: 'Biscuit the cat: 1 scoop at 8am and 6pm.', home: 'Door code 4417' } }, at('2026-03-04', '06:00'));
    act(maya, { type: 'setPacketRecipient', ref: { type: 'user', id: jordan.id }, value: true }, at('2026-03-04', '06:00'));

    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '11:29'));
    const alert = svc.alertsOf(maya.id)[0];
    expect(Object.keys(alert.steps)).toEqual(['nudge', 'alarm', 'call_you', 'circle', 'call_circle', 'packet']);
    const sent = svc.drain();
    expect(sent.filter((o) => o.channel === 'call').map((o) => o.to.name).sort()).toEqual(['Jordan Lee', 'Maya Chen', 'Mom']);
    const momPacket = sent.find((o) => o.to.name === 'Mom' && o.body.includes('Biscuit'));
    expect(momPacket?.channel).toBe('sms');

    const jordanView = buildSnapshot(svc, jordan.id, at('2026-03-04', '11:29'));
    expect(jordanView.circleAlerts[0].packet?.home).toBe('Door code 4417');

    svc.tick(at('2026-03-04', '11:30'));
    expect(svc.alertsOf(maya.id)[0].steps.wellness).toBeDefined();

    act(jordan, { type: 'resolveAlert', id: alert.id }, at('2026-03-04', '11:45'));
    expect(svc.alertsOf(maya.id)[0].resolution).toBe('reached');
    expect(buildSnapshot(svc, jordan.id, at('2026-03-04', '11:46')).circleAlerts[0].packet).toBeUndefined();
    expect(svc.drain().some((o) => o.to.id === maya.id && o.body.includes('Jordan marked that they reached you'))).toBe(true);
  });

  it('does not enforce windows during a pause or right after a schedule change', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'pause', until: at('2026-03-06', '12:00') }, at('2026-03-04', '06:00'));
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-05', '12:00'), 30 * MINUTE);
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
    act(maya, { type: 'pause', until: null }, at('2026-03-05', '12:00'));
    act(maya, { type: 'setSchedule', schedule: { slots: [{ start: '12:00', deadline: '12:30' }], days: [0, 1, 2, 3, 4, 5, 6], smart: false } }, at('2026-03-05', '12:10'));
    svc.tick(at('2026-03-05', '13:00'));
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
    svc.tick(at('2026-03-06', '12:31'));
    expect(svc.alertsOf(maya.id)).toHaveLength(1);
  });

  it('only premium users get smart check-ins and extra windows', () => {
    const { svc, maya, act } = setup();
    const twoSlots = { slots: [{ start: '07:00', deadline: '10:00' }, { start: '20:00', deadline: '22:00' }], days: [0, 1, 2, 3, 4, 5, 6], smart: true };
    expect(() => act(maya, { type: 'setSchedule', schedule: twoSlots }, T0)).toThrow(/Premium/);
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'setSchedule', schedule: twoSlots }, T0 - 3 * HOUR);
    act(maya, { type: 'activity' }, at('2026-03-04', '08:00'));
    expect(svc.checkInsOf(maya.id).at(-1)?.source).toBe('smart');
    expect(() => act(maya, { type: 'setSchedule', schedule: { ...twoSlots, slots: [{ start: '07:00', deadline: '10:00' }, { start: '09:00', deadline: '11:00' }] } }, T0)).toThrow(/overlap/);
  });

  it('tracks a streak across days', () => {
    const { svc, maya, act } = setup();
    for (const date of ['2026-03-02', '2026-03-03', '2026-03-04']) act(maya, { type: 'checkIn' }, at(date, '08:00'));
    const user = svc.user(maya.id);
    expect(streak(user, svc.state.checkIns, svc.alertsOf(maya.id), at('2026-03-04', '09:00'))).toBe(3);
    expect(streak(user, svc.state.checkIns, svc.alertsOf(maya.id), at('2026-03-05', '09:00'))).toBe(3);
    expect(slotsBetween(user, '2026-03-04', '2026-03-05')).toHaveLength(2);
  });
});

describe('circle', () => {
  it('limits the free circle to two people', () => {
    const { svc, maya, act } = setup();
    expect(() => act(maya, { type: 'addContact', name: 'Dad', phone: '555-201-0009' }, T0)).toThrow(/free plan/);
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'addContact', name: 'Dad', phone: '555-201-0009' }, T0);
    expect(svc.watchersOf(maya.id)).toHaveLength(3);
  });

  it('accepts mutual invites within plan limits and rejects self-invites', () => {
    const { svc, maya, act } = setup();
    const sam = svc.createUser({ name: 'Sam', timezone: TZ }, T0);
    expect(() => act(maya, { type: 'acceptInvite', code: maya.inviteCode, watch: true, mutual: false }, T0)).toThrow(/own invite/);
    // Maya's free circle (Jordan + Mom) is full.
    expect(() => act(sam, { type: 'acceptInvite', code: maya.inviteCode, watch: true, mutual: true }, T0)).toThrow(/Maya's circle is full/);
    act(maya, { type: 'startTrial' }, T0);
    act(sam, { type: 'acceptInvite', code: maya.inviteCode.toUpperCase(), watch: true, mutual: true }, T0);
    expect(svc.isWatching(sam.id, maya.id)).toBe(true);
    expect(svc.isWatching(maya.id, sam.id)).toBe(true);
    expect(buildSnapshot(svc, maya.id, T0).watching.map((w) => w.person.name)).toEqual(['Sam']);
  });

  it('feeds watchers their circle\'s check-ins', () => {
    const { svc, maya, jordan, act } = setup();
    act(maya, { type: 'checkIn', mood: 'great', note: 'Coffee, then gym' }, at('2026-03-04', '07:40'));
    const feed = buildSnapshot(svc, jordan.id, at('2026-03-04', '08:00')).feed;
    expect(feed[0].person.name).toBe('Maya Chen');
    expect(feed[0].checkIn.note).toBe('Coffee, then gym');
  });
});

describe('daily reminders', () => {
  it('says good morning when the window opens and warns before the deadline, once each', () => {
    const { svc, maya } = setup();
    svc.tick(at('2026-03-04', '06:59'));
    expect(svc.drain()).toHaveLength(0);
    tickThrough(svc, at('2026-03-04', '07:00'), at('2026-03-04', '07:10'));
    const morning = svc.drain();
    expect(morning.map((o) => o.title)).toEqual(['Good morning, Maya']);
    expect(morning[0]).toMatchObject({ channel: 'push', kind: 'reminder', action: 'checkin' });
    tickThrough(svc, at('2026-03-04', '09:29'), at('2026-03-04', '09:40'));
    expect(svc.drain().map((o) => o.title)).toEqual(['30 minutes left to check in']);
    // Reminders don't clutter the activity log.
    expect(buildSnapshot(svc, maya.id, at('2026-03-04', '09:41')).outbox.some((o) => o.kind === 'reminder')).toBe(false);
  });

  it('stays quiet once you have checked in, and while paused', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'checkIn' }, at('2026-03-04', '06:30'));
    tickThrough(svc, at('2026-03-04', '07:00'), at('2026-03-04', '10:30'), 10 * MINUTE);
    expect(svc.drain().filter((o) => o.to.id === maya.id)).toHaveLength(0);
    act(maya, { type: 'pause', until: at('2026-03-06', '00:00') }, at('2026-03-04', '12:00'));
    tickThrough(svc, at('2026-03-05', '07:00'), at('2026-03-05', '10:30'), 10 * MINUTE);
    expect(svc.drain().filter((o) => o.to.id === maya.id)).toHaveLength(0);
  });

  it('puts an "I\'m okay" button on the alarm for a missed check-in', () => {
    const { svc } = setup();
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '10:15'));
    const alarm = svc.drain().find((o) => o.title === 'You missed your check-in' && o.channel === 'push');
    expect(alarm?.action).toBe('checkin');
  });
});

describe('contact consent', () => {
  it('texts new contacts for consent and never contacts someone who replied STOP', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'addContact', name: 'Dad', phone: '555-201-0009' }, T0);
    const invite = svc.drain().find((o) => o.to.name === 'Dad');
    expect(invite?.body).toContain('Reply YES to confirm');

    expect(svc.contactReply('+15552010009', 'yes!', T0 + 1000)).toContain('if Maya misses a check-in');
    expect(svc.watchersOf(maya.id).find((w) => w.name === 'Dad')?.consent).toBe('confirmed');
    expect(svc.drain().some((o) => o.to.id === maya.id && o.title === 'Dad said yes')).toBe(true);

    expect(svc.contactReply('+15552010009', 'STOP', T0 + 2000)).toBeNull();
    expect(svc.drain().some((o) => o.to.id === maya.id && o.title === 'Dad opted out')).toBe(true);

    // Mom and Jordan still hear about a missed check-in; Dad doesn't.
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '11:05'));
    const sent = svc.drain();
    expect(sent.some((o) => o.to.name === 'Mom')).toBe(true);
    expect(sent.some((o) => o.to.name === 'Dad')).toBe(false);

    expect(svc.contactReply('+15552010009', 'START', T0 + 3000)).toContain('back on');
    expect(svc.contactReply('+15552019999', 'hello?', T0 + 4000)).toBeNull();
    expect(svc.contactReply('+15552010009', 'is she ok??', T0 + 5000)).toContain('call them directly');
  });
});

describe('moments and SOS', () => {
  it('requires premium, then alerts only the people the timer was shared with', () => {
    const { svc, maya, jordan, act } = setup();
    const start: Action = { type: 'startMoment', kind: 'date', minutes: 90, details: { who: 'Alex from Hinge', where: 'Lucia\'s, 5th Ave' }, shareWith: [jordan.id] };
    expect(() => act(maya, start, at('2026-03-04', '19:00'))).toThrow(/Premium/);
    act(maya, { type: 'startTrial' }, at('2026-03-04', '19:00'));
    act(maya, { type: 'checkIn' }, at('2026-03-04', '08:00'));
    act(maya, start, at('2026-03-04', '19:00'));
    svc.drain();
    tickThrough(svc, at('2026-03-04', '20:30'), at('2026-03-04', '20:40'));
    const sent = svc.drain();
    expect(sent.find((o) => o.to.id === maya.id)?.title).toBe('Your "First date" timer is up');
    const circle = sent.filter((o) => o.to.id !== maya.id);
    expect(new Set(circle.map((o) => o.to.name))).toEqual(new Set(['Jordan Lee']));
    expect(circle[0].body).toContain('Alex from Hinge');

    // Adding time stands the alert down and re-arms the timer.
    const moment = buildSnapshot(svc, maya.id, at('2026-03-04', '20:41')).moment!;
    act(maya, { type: 'extendMoment', id: moment.id, minutes: 30 }, at('2026-03-04', '20:41'));
    expect(svc.alertsOf(maya.id).every((a) => a.resolvedAt)).toBe(true);
    svc.tick(at('2026-03-04', '21:12'));
    expect(svc.alertsOf(maya.id).filter((a) => !a.resolvedAt)).toHaveLength(1);
    act(maya, { type: 'endMoment', id: moment.id }, at('2026-03-04', '21:13'));
    expect(svc.alertsOf(maya.id).every((a) => a.resolvedAt)).toBe(true);
  });

  it('SOS alerts the circle immediately and is free', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'sos', location: { lat: 40.7, lng: -74 } }, T0);
    const sent = svc.drain();
    expect(sent.filter((o) => o.title === 'SOS from Maya').length).toBeGreaterThanOrEqual(2);
    expect(sent.some((o) => o.body.includes('maps.google.com/?q=40.7,-74'))).toBe(true);
  });
});

describe('postcards', () => {
  it('lets you edit a fresh check-in and remove its photo', () => {
    const { svc, maya, act } = setup();
    const photo = 'data:image/jpeg;base64,AAAA';
    act(maya, { type: 'checkIn', photo }, at('2026-03-04', '08:00'));
    const id = svc.checkInsOf(maya.id).at(-1)!.id;
    expect(svc.checkInsOf(maya.id).at(-1)!.photo).toBe(photo);
    act(maya, { type: 'updateCheckIn', id, mood: 'good', photo: '' }, at('2026-03-04', '08:05'));
    expect(svc.checkInsOf(maya.id).at(-1)).toMatchObject({ mood: 'good', photo: undefined });
    expect(() => act(maya, { type: 'updateCheckIn', id, note: 'late edit' }, at('2026-03-04', '11:00'))).toThrow(/two hours/);
  });
});

describe('review regressions', () => {
  it('does not treat paused windows as missed after resuming or extending the pause', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'pause', until: at('2026-03-10', '00:00') }, at('2026-03-03', '20:00'));
    tickThrough(svc, at('2026-03-04', '09:00'), at('2026-03-04', '14:00'), 15 * MINUTE);
    // Extend in the afternoon, then resume: this morning's paused window stays excused.
    act(maya, { type: 'pause', until: at('2026-03-12', '00:00') }, at('2026-03-04', '15:00'));
    expect(svc.user(maya.id).pause?.from).toBe(at('2026-03-03', '20:00'));
    act(maya, { type: 'pause', until: null }, at('2026-03-04', '15:05'));
    svc.drain();
    tickThrough(svc, at('2026-03-04', '15:05'), at('2026-03-04', '16:00'));
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
    expect(svc.drain()).toHaveLength(0);
    // Tomorrow is enforced again.
    svc.tick(at('2026-03-05', '10:01'));
    expect(svc.alertsOf(maya.id)).toHaveLength(1);
  });

  it('alerts the whole circle if everyone a timer was shared with has left', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, at('2026-03-04', '08:00'));
    act(maya, { type: 'checkIn' }, at('2026-03-04', '08:00'));
    const mom = svc.watchersOf(maya.id).find((w) => w.name === 'Mom')!;
    act(maya, { type: 'startMoment', kind: 'run', minutes: 60, shareWith: [mom.ref.id] }, at('2026-03-04', '18:00'));
    act(maya, { type: 'removeContact', id: mom.ref.id }, at('2026-03-04', '18:10'));
    svc.drain();
    tickThrough(svc, at('2026-03-04', '19:00'), at('2026-03-04', '19:10'));
    expect(svc.drain().some((o) => o.to.name === 'Jordan Lee' && o.title.includes('timer ran out'))).toBe(true);
  });

  it('texts the packet but keeps it out of the message log', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'savePacket', packet: { home: 'Door code 4417' } }, T0);
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '11:05'));
    expect(svc.drain().some((o) => o.to.name === 'Mom' && o.body.includes('4417'))).toBe(true);
    expect(svc.state.outbox.some((o) => o.body.includes('4417'))).toBe(false);
    expect(svc.state.outbox.some((o) => o.to.name === 'Mom' && o.body.includes('emergency info (home access)'))).toBe(true);
  });

  it('reports whether a tick changed anything', () => {
    const { svc } = setup();
    expect(svc.tick(at('2026-03-04', '06:00'))).toBe(false);
    // The window opens: a reminder goes out.
    expect(svc.tick(at('2026-03-04', '07:00'))).toBe(true);
    expect(svc.tick(at('2026-03-04', '07:01'))).toBe(false);
  });
});

describe('your data', () => {
  it('exports everything about a person and deletes it all without touching others', () => {
    const { svc, maya, jordan, act } = setup();
    act(maya, { type: 'savePacket', packet: { pets: 'Biscuit' } }, T0);
    act(jordan, { type: 'acceptInvite', code: maya.inviteCode, watch: false, mutual: true }, T0);
    act(maya, { type: 'checkIn', note: 'hello' }, at('2026-03-04', '08:00'));
    const data = svc.exportUser(maya.id, T0);
    expect(data.account.name).toBe('Maya Chen');
    expect(data.circle.watchingOverYou.map((w) => w.name).sort()).toEqual(['Jordan Lee', 'Mom']);
    expect(data.circle.youreWatching).toEqual(['Jordan Lee']);
    expect(data.packet?.pets).toBe('Biscuit');
    expect(data.checkIns.some((c) => c.note === 'hello')).toBe(true);

    svc.deleteUser(maya.id);
    expect(svc.state.users[maya.id]).toBeUndefined();
    expect(Object.values(svc.state.watches)).toHaveLength(0);
    expect(Object.values(svc.state.contacts)).toHaveLength(0);
    expect(svc.state.checkIns.every((c) => c.userId !== maya.id)).toBe(true);
    expect(svc.state.packets[maya.id]).toBeUndefined();
    expect(svc.state.outbox.every((o) => o.aboutUserId !== maya.id)).toBe(true);
    // Jordan is untouched and the clock keeps running.
    expect(svc.checkInsOf(jordan.id).length).toBeGreaterThan(0);
    svc.tick(at('2026-03-04', '12:00'));
    expect(buildSnapshot(svc, jordan.id, at('2026-03-04', '12:00')).watching).toHaveLength(0);
  });
});

describe('validation', () => {
  it('rejects oversized and malformed input', () => {
    const { maya, act } = setup();
    expect(() => act(maya, { type: 'checkIn', note: 'x'.repeat(200) }, T0)).toThrow(/140/);
    expect(() => act(maya, { type: 'checkIn', photo: 'javascript:alert(1)' }, T0)).toThrow(/image/);
    expect(() => act(maya, { type: 'setGrace', minutes: 5 }, T0)).toThrow();
    expect(() => act(maya, { type: 'nope' } as unknown as Action, T0)).toThrow(/Unknown/);
  });
});

describe('bug check regressions', () => {
  it('treats a check-in seconds after the deadline as late, not as an emergency', () => {
    const { svc, maya, act } = setup();
    svc.tick(at('2026-03-04', '09:59'));
    svc.drain();
    // The clock ticks every 15 seconds; Maya taps between ticks.
    act(maya, { type: 'checkIn' }, at('2026-03-04', '10:00') + 5000);
    svc.tick(at('2026-03-04', '10:00') + 15_000);
    tickThrough(svc, at('2026-03-04', '10:01'), at('2026-03-04', '11:00'));
    const [alert] = svc.alertsOf(maya.id);
    expect(alert).toMatchObject({ resolution: 'checked_in', steps: {} });
    expect(svc.drain()).toHaveLength(0);
    expect(buildSnapshot(svc, maya.id, at('2026-03-04', '11:00')).slots[0].status).toBe('late');
  });

  it('starts the ladder from the first step when an alert is opened late', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    // The server was down from 09:50 until 11:30.
    svc.tick(at('2026-03-04', '09:50'));
    svc.drain();
    svc.tick(at('2026-03-04', '11:30'));
    const [alert] = svc.alertsOf(maya.id);
    expect(alert.triggeredAt).toBe(at('2026-03-04', '10:00'));
    expect(Object.keys(alert.steps)).toEqual(['nudge']);
    expect(svc.drain().every((o) => o.to.id === maya.id)).toBe(true);
    tickThrough(svc, at('2026-03-04', '11:31'), at('2026-03-04', '12:09'));
    expect(alert.steps.circle).toBeUndefined();
    svc.tick(at('2026-03-04', '12:10'));
    expect(alert.steps.circle).toBe(at('2026-03-04', '12:10'));
  });

  it('keeps windows covered by an earlier pause excused when pausing again', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'pause', until: at('2026-03-04', '11:00') }, at('2026-03-03', '20:00'));
    tickThrough(svc, at('2026-03-04', '09:00'), at('2026-03-04', '12:00'), 5 * MINUTE);
    act(maya, { type: 'pause', until: at('2026-03-06', '12:00') }, at('2026-03-04', '12:00'));
    tickThrough(svc, at('2026-03-04', '12:00'), at('2026-03-04', '13:00'), 5 * MINUTE);
    expect(svc.alertsOf(maya.id)).toHaveLength(0);
    expect(buildSnapshot(svc, maya.id, at('2026-03-04', '13:00')).slots[0].status).toBe('paused');
  });

  it('sends the packet only to contacts who replied YES', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'savePacket', packet: { home: 'Door code 4417' } }, T0);
    act(maya, { type: 'addContact', name: 'Sam', phone: '555-201-0044', receivesPacket: true }, T0);
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '11:05'));
    const sent = svc.drain();
    expect(sent.some((o) => o.to.name === 'Mom' && o.body.includes('4417'))).toBe(true);
    expect(sent.some((o) => o.to.name === 'Sam' && o.title === "Maya hasn't checked in")).toBe(true);
    expect(sent.some((o) => o.to.name === 'Sam' && o.body.includes('4417'))).toBe(false);
  });

  it('never texts or calls a number the person has not confirmed', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'updateProfile', phone: '555-201-0099' }, T0);
    expect(svc.user(maya.id).phoneVerified).toBe(false);
    tickThrough(svc, at('2026-03-04', '10:00'), at('2026-03-04', '10:45'));
    const toMaya = svc.drain().filter((o) => o.to.id === maya.id);
    expect(toMaya.length).toBeGreaterThan(0);
    expect(toMaya.every((o) => o.channel === 'push')).toBe(true);
  });

  it('remembers STOP for the number, across circles and re-adds', () => {
    const { svc, maya, jordan, act } = setup();
    svc.contactReply('+15552010003', 'STOP', T0);
    act(jordan, { type: 'addContact', name: 'Linda', phone: '555-201-0003' }, T0);
    const mom = Object.values(svc.state.contacts).find((c) => c.ownerId === maya.id)!;
    act(maya, { type: 'removeContact', id: mom.id }, T0);
    act(maya, { type: 'addContact', name: 'Mom', phone: '555-201-0003' }, T0);
    expect(svc.drain().filter((o) => o.title === 'Circle invite')).toHaveLength(0);
    expect(svc.watchersOf(jordan.id).find((w) => w.name === 'Linda')?.consent).toBe('stopped');
    expect(svc.contactReply('+15552010003', 'yes', T0 + 1000)).toBeNull();

    expect(svc.contactReply('+15552010003', 'START', T0 + 2000)).toContain('back on');
    expect(svc.watchersOf(jordan.id).find((w) => w.name === 'Linda')?.consent).toBe('confirmed');
    expect(svc.watchersOf(maya.id).find((w) => w.name === 'Mom')?.consent).toBe('confirmed');
  });

  it('caps consent texts at ten a day and keeps links out of names', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    for (let i = 0; i < 10; i++) act(maya, { type: 'addContact', name: `Friend ${i}`, phone: `555-301-00${10 + i}` }, T0);
    expect(() => act(maya, { type: 'addContact', name: 'One more', phone: '555-301-0099' }, T0)).toThrow(/10 people by phone a day/);
    act(maya, { type: 'addContact', name: 'One more', phone: '555-301-0099' }, T0 + DAY);

    for (const name of ['Win at bit.ly/x', 'www.prize.example', 'Claim https://x.test', 'see scam.com', 'a@b']) {
      expect(() => act(maya, { type: 'addContact', name, phone: '555-301-0098' }, T0 + DAY), name).toThrow(/links/);
      expect(() => svc.createUser({ name, timezone: TZ }, T0), name).toThrow(/links/);
    }
    for (const name of ["Dr. Ann-Marie O'Neil", 'St. John', 'J.R. Smith', 'Zoë']) {
      expect(svc.createUser({ name, timezone: TZ }, T0).name).toBe(name);
    }
  });

  it('keeps a streak growing past the 60 days of kept check-ins', () => {
    const svc = new Sunup(emptyState(), { baseUrl: 'https://sunup.test' });
    const start = '2026-01-01';
    const ana = svc.createUser({ name: 'Ana', timezone: TZ }, zonedToUtc(start, '06:00', TZ));
    svc.dispatch(ana.id, { type: 'completeOnboarding' }, zonedToUtc(start, '06:00', TZ));
    let date = start;
    for (let i = 0; i < 90; i++, date = addDays(date, 1)) {
      svc.dispatch(ana.id, { type: 'checkIn' }, zonedToUtc(date, '08:00', TZ));
      for (const time of ['08:30', '12:00', '18:00']) svc.tick(zonedToUtc(date, time, TZ));
    }
    const now = zonedToUtc(addDays(date, -1), '20:00', TZ);
    expect(svc.checkInsOf(ana.id).length).toBeLessThan(62);
    expect(streak(ana, svc.checkInsOf(ana.id), svc.alertsOf(ana.id), now)).toBe(90);
  });

  it('only counts opening the app as a smart check-in once the window is open', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'setSchedule', schedule: { slots: [{ start: '07:00', deadline: '10:00' }], days: [0, 1, 2, 3, 4, 5, 6], smart: true } }, T0 - DAY);
    act(maya, { type: 'activity' }, at('2026-03-04', '05:30'));
    expect(svc.checkInsOf(maya.id).filter((c) => c.source === 'smart')).toHaveLength(0);
    act(maya, { type: 'activity' }, at('2026-03-04', '07:05'));
    expect(svc.checkInsOf(maya.id).filter((c) => c.source === 'smart')).toHaveLength(1);
  });

  it('ends the timer when a watcher marks that they reached the person', () => {
    const { svc, maya, jordan, act } = setup();
    act(maya, { type: 'startTrial' }, T0);
    act(maya, { type: 'startMoment', kind: 'run', minutes: 30 }, at('2026-03-04', '18:00'));
    tickThrough(svc, at('2026-03-04', '18:30'), at('2026-03-04', '18:41'));
    const alert = svc.alertsOf(maya.id).find((a) => a.kind === 'moment')!;
    act(jordan, { type: 'resolveAlert', id: alert.id }, at('2026-03-04', '18:42'));
    expect(buildSnapshot(svc, maya.id, at('2026-03-04', '18:43')).moment).toBeUndefined();
    act(maya, { type: 'startMoment', kind: 'night', minutes: 120 }, at('2026-03-04', '19:00'));
  });

  it('lets you clear a mood', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'checkIn', mood: 'meh' }, at('2026-03-04', '08:00'));
    const id = svc.checkInsOf(maya.id).at(-1)!.id;
    act(maya, { type: 'updateCheckIn', id, mood: null }, at('2026-03-04', '08:01'));
    expect(svc.checkInsOf(maya.id).at(-1)!.mood).toBeUndefined();
  });

  it("doesn't send SOS when nobody in the circle can be reached", () => {
    const svc = new Sunup(emptyState(), { baseUrl: 'https://sunup.test' });
    const ana = svc.createUser({ name: 'Ana', timezone: TZ }, T0);
    svc.dispatch(ana.id, { type: 'addContact', name: 'Lee', phone: '555-201-0077' }, T0);
    svc.contactReply('+15552010077', 'STOP', T0);
    expect(() => svc.dispatch(ana.id, { type: 'sos' }, T0)).toThrow(/Add someone/);
  });

  it('greets an evening window as evening', () => {
    const { svc, maya, act } = setup();
    act(maya, { type: 'setSchedule', schedule: { slots: [{ start: '19:00', deadline: '21:00' }], days: [0, 1, 2, 3, 4, 5, 6], smart: false } }, T0 - DAY);
    svc.drain();
    svc.tick(at('2026-03-04', '19:00'));
    expect(svc.drain().filter((o) => o.kind === 'reminder').map((o) => o.title)).toEqual(['Good evening, Maya']);
  });

  it("won't drop a paying subscriber to free without the payment provider", () => {
    const { svc, maya, act } = setup();
    svc.applyBilling(maya.id, { customerId: 'cus_1', subscriptionId: 'sub_1', status: 'active' }, T0);
    expect(() => act(maya, { type: 'cancelPremium' }, T0)).toThrow(/Manage subscription/);
    expect(svc.user(maya.id).plan).toBe('premium');
  });

  it('gives you a new invite link and retires the old one', () => {
    const { svc, maya, act } = setup();
    const old = maya.inviteCode;
    act(maya, { type: 'newInviteCode' }, T0);
    expect(maya.inviteCode).not.toBe(old);
    expect(svc.userByInviteCode(old)).toBeUndefined();
    expect(svc.userByInviteCode(maya.inviteCode)?.id).toBe(maya.id);
  });
});
