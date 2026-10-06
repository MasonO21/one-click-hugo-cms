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
  const maya = svc.createUser({ name: 'Maya Chen', phone: '555-201-0001', timezone: TZ }, signupTime);
  const jordan = svc.createUser({ name: 'Jordan Lee', phone: '5552010002', timezone: TZ }, signupTime);
  const act = (u: User, action: Action, now: number) => svc.dispatch(u.id, action, now);
  act(maya, { type: 'completeOnboarding' }, signupTime);
  act(jordan, { type: 'completeOnboarding' }, signupTime);
  act(jordan, { type: 'acceptInvite', code: maya.inviteCode, watch: true, mutual: false }, signupTime);
  act(maya, { type: 'addContact', name: 'Mom', phone: '(555) 201-0003', receivesPacket: true }, signupTime);
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
    expect(() => act(sam, { type: 'acceptInvite', code: maya.inviteCode, watch: true, mutual: true }, T0)).toThrow(/free plan/);
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
