import { describe, expect, it } from 'vitest';
import { Sunup, type Action } from '../src/shared/service';
import { buildSnapshot } from '../src/shared/snapshot';
import { emptyState, type Schedule, type User } from '../src/shared/types';
import { DAY, HOUR, MINUTE, addDays, localParts, zonedToUtc } from '../src/shared/time';
import { slotsBetween, streak } from '../src/shared/schedule';

const iso = (ts: number) => new Date(ts).toISOString();

/** A user in `tz` who signed up at noon the day before `date` and finished onboarding then. */
function person(tz: string, date: string, schedule?: Schedule, premium = false) {
  const svc = new Sunup(emptyState(), { baseUrl: 'https://sunup.test' });
  const signup = zonedToUtc(addDays(date, -1), '12:00', tz);
  const user = svc.createUser({ name: 'Ana Ruiz', timezone: tz }, signup);
  const act = (action: Action, now: number) => svc.dispatch(user.id, action, now);
  act({ type: 'completeOnboarding' }, signup);
  if (premium) act({ type: 'startTrial' }, signup);
  if (schedule) act({ type: 'setSchedule', schedule }, signup);
  svc.drain();
  return { svc, user, act, at: (d: string, t: string) => zonedToUtc(d, t, tz) };
}

/** The first minute the clock opens a missed alert for the window `slotKey`, scanning a range. */
function firstAlertMinute(svc: Sunup, user: User, slotKey: string, from: number, to: number): number | undefined {
  for (let t = from; t <= to; t += MINUTE) {
    svc.tick(t);
    if (svc.alertsOf(user.id).some((a) => a.kind === 'missed' && a.slotKey === slotKey)) return t;
  }
  return undefined;
}

// Days when clocks change in 2026.
const TRANSITIONS: [tz: string, date: string, kind: 'forward' | 'back'][] = [
  ['America/New_York', '2026-03-08', 'forward'],
  ['America/New_York', '2026-11-01', 'back'],
  ['America/Los_Angeles', '2026-03-08', 'forward'],
  ['America/Los_Angeles', '2026-11-01', 'back'],
  ['America/Santiago', '2026-04-05', 'back'],
  ['America/Santiago', '2026-09-06', 'forward'],
  ['Europe/London', '2026-03-29', 'forward'],
  ['Europe/London', '2026-10-25', 'back'],
  ['Europe/Berlin', '2026-03-29', 'forward'],
  ['Europe/Berlin', '2026-10-25', 'back'],
  ['Pacific/Auckland', '2026-04-05', 'back'],
  ['Pacific/Auckland', '2026-09-27', 'forward'],
  ['Australia/Lord_Howe', '2026-04-05', 'back'],
  ['Australia/Lord_Howe', '2026-10-04', 'forward'],
  ['Pacific/Chatham', '2026-09-27', 'forward'],
];

const ZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Pacific/Chatham', 'America/St_Johns', 'Australia/Adelaide', 'UTC'];

describe('zonedToUtc', () => {
  it('round-trips every quarter hour on clock-change days, and resolves skipped times forward', () => {
    for (const [tz, date] of TRANSITIONS) {
      let previous = -Infinity;
      for (let m = 0; m < 24 * 60; m += 15) {
        const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        const ts = zonedToUtc(date, time, tz);
        const back = localParts(ts, tz);
        const label = `${tz} ${date} ${time} -> ${iso(ts)} (${back.date} ${back.time})`;
        if (back.date !== date || back.time !== time) {
          // Only a time the clocks skipped may come back different, and then it's later.
          expect(back.date, label).toBe(date);
          expect(back.time > time, label).toBe(true);
          expect(ts - zonedToUtc(date, back.time, tz), label).toBe(0);
          continue;
        }
        // Later wall times that exist are never earlier instants.
        expect(ts, label).toBeGreaterThan(previous);
        previous = ts;
      }
    }
  });

  it('resolves a time that happens twice to its first occurrence', () => {
    expect(iso(zonedToUtc('2026-11-01', '01:30', 'America/New_York'))).toBe('2026-11-01T05:30:00.000Z');
    expect(iso(zonedToUtc('2026-10-25', '02:30', 'Europe/Berlin'))).toBe('2026-10-25T00:30:00.000Z');
    expect(iso(zonedToUtc('2026-04-05', '02:30', 'Pacific/Auckland'))).toBe('2026-04-04T13:30:00.000Z');
  });

  it('lands on the right hour after the change on spring-forward day', () => {
    // These used to come out an hour late.
    expect(iso(zonedToUtc('2026-03-08', '03:00', 'America/New_York'))).toBe('2026-03-08T07:00:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '07:00', 'America/Los_Angeles'))).toBe('2026-03-08T14:00:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '09:00', 'America/Los_Angeles'))).toBe('2026-03-08T16:00:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '02:30', 'America/New_York'))).toBe('2026-03-08T07:30:00.000Z');
    expect(iso(zonedToUtc('2026-03-29', '01:30', 'Europe/London'))).toBe('2026-03-29T01:30:00.000Z');
  });

  it('handles half-hour, quarter-hour and far-off zones', () => {
    expect(iso(zonedToUtc('2026-03-08', '07:00', 'Asia/Kolkata'))).toBe('2026-03-08T01:30:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '07:00', 'Asia/Kathmandu'))).toBe('2026-03-08T01:15:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '07:00', 'Pacific/Kiritimati'))).toBe('2026-03-07T17:00:00.000Z');
    expect(iso(zonedToUtc('2026-03-08', '07:00', 'Pacific/Pago_Pago'))).toBe('2026-03-08T18:00:00.000Z');
    expect(iso(zonedToUtc('2026-01-15', '07:00', 'Pacific/Chatham'))).toBe('2026-01-14T17:15:00.000Z');
    expect(iso(zonedToUtc('2026-12-31', '23:59', 'Pacific/Kiritimati'))).toBe('2026-12-31T09:59:00.000Z');
    expect(iso(zonedToUtc('2026-12-31', '00:00', 'Pacific/Pago_Pago'))).toBe('2026-12-31T11:00:00.000Z');
  });
});

describe('check-in windows across clock changes', () => {
  for (const [tz, date, kind] of TRANSITIONS) {
    it(`alerts at the local deadline in ${tz} on ${date} (clocks go ${kind})`, () => {
      const { svc, user, at } = person(tz, date);
      const deadline = at(date, '10:00');
      expect(localParts(deadline, tz).time).toBe('10:00');
      const found = firstAlertMinute(svc, user, `${date}@10:00`, at(date, '09:30'), deadline + 2 * HOUR);
      expect(found && iso(found)).toBe(iso(deadline));
    });
  }

  it('gives a window the real length it has on the day', () => {
    // 01:00–04:00 is two hours long when clocks spring forward, four when they fall back.
    const schedule = { slots: [{ start: '01:00', deadline: '04:00' }], days: [0, 1, 2, 3, 4, 5, 6], smart: false };
    const { user } = person('America/New_York', '2026-03-08', schedule);
    const [spring] = slotsBetween(user, '2026-03-08', '2026-03-08');
    const [fall] = slotsBetween(user, '2026-11-01', '2026-11-01');
    expect(spring.deadlineAt - spring.openAt).toBe(2 * HOUR);
    expect(fall.deadlineAt - fall.openAt).toBe(4 * HOUR);
  });

  it('keeps a streak going across both clock changes', () => {
    for (const [tz, date] of TRANSITIONS) {
      const { svc, user, act, at } = person(tz, addDays(date, -5));
      for (let d = addDays(date, -5); d <= addDays(date, 2); d = addDays(d, 1)) {
        act({ type: 'checkIn' }, at(d, '08:00'));
        svc.tick(at(d, '12:00'));
      }
      const now = at(addDays(date, 2), '12:00');
      expect(svc.alertsOf(user.id), `${tz} ${date}`).toHaveLength(0);
      expect(streak(user, svc.checkInsOf(user.id), svc.alertsOf(user.id), now), `${tz} ${date}`).toBe(8);
    }
  });

  it('sends the morning reminder when the window opens in local time', () => {
    const { svc, user, at } = person('America/Los_Angeles', '2026-03-08');
    svc.tick(at('2026-03-08', '06:59'));
    expect(svc.drain()).toHaveLength(0);
    svc.tick(at('2026-03-08', '07:00'));
    const sent = svc.drain();
    expect(sent.map((m) => m.title)).toEqual(['Good morning, Ana']);
    expect(user.reminded?.key).toBe('2026-03-08@10:00');
  });
});

describe('unusual zones', () => {
  for (const tz of ZONES) {
    it(`alerts at 10:00 local in ${tz}`, () => {
      const { svc, user, at } = person(tz, '2026-06-10');
      const deadline = at('2026-06-10', '10:00');
      const found = firstAlertMinute(svc, user, '2026-06-10@10:00', deadline - 30 * MINUTE, deadline + HOUR);
      expect(found && iso(found)).toBe(iso(deadline));
      expect(svc.alertsOf(user.id)[0].slotKey).toBe('2026-06-10@10:00');
    });
  }

  it('shows the right local day in the snapshot on the far side of the date line', () => {
    const { svc, user, act, at } = person('Pacific/Kiritimati', '2026-06-10');
    act({ type: 'checkIn' }, at('2026-06-10', '08:00'));
    const snap = buildSnapshot(svc, user.id, at('2026-06-10', '09:00'));
    const today = snap.slots.find((s) => s.key === '2026-06-10@10:00');
    expect(today?.status).toBe('done');
  });
});

describe('windows near midnight', () => {
  const late = { slots: [{ start: '22:00', deadline: '23:59' }], days: [0, 1, 2, 3, 4, 5, 6], smart: false };

  it('counts a check-in just before midnight and alerts at 23:59 when there is none', () => {
    const { svc, user, act, at } = person('Europe/Berlin', '2026-06-10', late);
    act({ type: 'checkIn' }, at('2026-06-10', '23:30'));
    svc.tick(at('2026-06-11', '00:30'));
    expect(svc.alertsOf(user.id)).toHaveLength(0);
    const found = firstAlertMinute(svc, user, '2026-06-11@23:59', at('2026-06-11', '23:50'), at('2026-06-12', '00:30'));
    expect(found && iso(found)).toBe(iso(at('2026-06-11', '23:59')));
  });

  it('lets a window starting at midnight take check-ins from the evening before', () => {
    const early = { slots: [{ start: '00:00', deadline: '01:00' }], days: [0, 1, 2, 3, 4, 5, 6], smart: false };
    const { svc, user, act, at } = person('America/Chicago', '2026-06-10', early);
    act({ type: 'checkIn' }, at('2026-06-09', '22:30'));
    svc.tick(at('2026-06-10', '02:00'));
    expect(svc.alertsOf(user.id)).toHaveLength(0);
  });

  it('never counts one check-in for two windows', () => {
    const both = {
      slots: [
        { start: '00:00', deadline: '01:00' },
        { start: '22:00', deadline: '23:59' },
      ],
      days: [0, 1, 2, 3, 4, 5, 6],
      smart: false,
    };
    const { svc, user, act, at } = person('America/Chicago', '2026-06-10', both, true);
    act({ type: 'checkIn' }, at('2026-06-10', '00:30'));
    act({ type: 'checkIn' }, at('2026-06-10', '23:30'));
    svc.tick(at('2026-06-11', '00:00'));
    expect(svc.alertsOf(user.id)).toHaveLength(0);
    // The 23:30 check-in is before the next window's two-hour early allowance, but it already
    // counted for the evening window, so the 00:00–01:00 window still needs its own.
    const found = firstAlertMinute(svc, user, '2026-06-11@01:00', at('2026-06-11', '00:30'), at('2026-06-11', '02:00'));
    expect(found && iso(found)).toBe(iso(at('2026-06-11', '01:00')));
  });

  it('only alerts for the window that was missed on a three-window day', () => {
    const three = {
      slots: [
        { start: '07:00', deadline: '09:00' },
        { start: '12:00', deadline: '13:00' },
        { start: '19:00', deadline: '21:00' },
      ],
      days: [0, 1, 2, 3, 4, 5, 6],
      smart: false,
    };
    const { svc, user, act, at } = person('America/Denver', '2026-06-10', three, true);
    act({ type: 'checkIn' }, at('2026-06-10', '08:00'));
    act({ type: 'checkIn' }, at('2026-06-10', '20:00'));
    for (let t = at('2026-06-10', '06:00'); t <= at('2026-06-10', '22:00'); t += 5 * MINUTE) svc.tick(t);
    const today = svc.alertsOf(user.id).filter((a) => a.slotKey?.startsWith('2026-06-10'));
    expect(today.map((a) => a.slotKey)).toEqual(['2026-06-10@13:00']);
  });
});

describe('changing time zone', () => {
  it('moves the deadline to the new zone', () => {
    const { svc, user, act, at } = person('America/New_York', '2026-06-10');
    // At 06:00 in New York (03:00 in Los Angeles) the person flies west.
    act({ type: 'updateProfile', timezone: 'America/Los_Angeles' }, at('2026-06-10', '06:00'));
    const laDeadline = zonedToUtc('2026-06-10', '10:00', 'America/Los_Angeles');
    const found = firstAlertMinute(svc, user, '2026-06-10@10:00', at('2026-06-10', '09:00'), laDeadline + HOUR);
    expect(found && iso(found)).toBe(iso(laDeadline));
  });

  it("doesn't count a window that had already passed in the new zone as missed", () => {
    const { svc, user, act } = person('America/Los_Angeles', '2026-06-10');
    const la = (t: string) => zonedToUtc('2026-06-10', t, 'America/Los_Angeles');
    act({ type: 'checkIn' }, la('08:00'));
    // At 08:30 in Los Angeles it's already 11:30 in New York, past today's 10:00 deadline there.
    act({ type: 'updateProfile', timezone: 'America/New_York' }, la('08:30'));
    for (let t = la('08:30'); t <= la('12:00'); t += 5 * MINUTE) svc.tick(t);
    expect(svc.alertsOf(user.id)).toHaveLength(0);
    // Tomorrow's window is enforced in the new zone.
    const nyDeadline = zonedToUtc('2026-06-11', '10:00', 'America/New_York');
    const found = firstAlertMinute(svc, user, '2026-06-11@10:00', nyDeadline - 10 * MINUTE, nyDeadline + 10 * MINUTE);
    expect(found && iso(found)).toBe(iso(nyDeadline));
  });

  it('gives a window less than an hour away a pass after a change', () => {
    const { svc, user, act, at } = person('America/New_York', '2026-06-10');
    act({ type: 'updateProfile', timezone: 'America/Chicago' }, at('2026-06-10', '10:30'));
    // 10:00 in Chicago is 11:00 in New York: only 30 minutes' notice, so it isn't enforced.
    for (let t = at('2026-06-10', '10:30'); t <= at('2026-06-10', '13:00'); t += 5 * MINUTE) svc.tick(t);
    expect(svc.alertsOf(user.id)).toHaveLength(0);
    expect(DAY).toBe(24 * HOUR);
  });
});
