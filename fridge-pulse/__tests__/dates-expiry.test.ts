import { addDays, atHour, daysBetween, isValidISODate, toISODate } from '../src/lib/dates';
import { daysLeft, expiryLabel, normalizeName, sortByExpiry, summarize, urgencyOf, wasteStats } from '../src/lib/expiry';
import { mk, NOW } from '../test-utils/helpers';

describe('dates', () => {
  it('formats local dates without timezone drift', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days across DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-09-29', '2026-09-27')).toBe(-2);
  });

  it('validates real calendar dates only', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('10/12/2026')).toBe(false);
    expect(isValidISODate(20261012)).toBe(false);
  });

  it('builds a local date at a given hour', () => {
    const d = atHour('2026-09-30', 9);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 30, 9]);
  });
});

describe('expiry', () => {
  it('buckets urgency at the boundaries', () => {
    expect(urgencyOf(-1)).toBe('expired');
    expect(urgencyOf(0)).toBe('today');
    expect(urgencyOf(1)).toBe('soon');
    expect(urgencyOf(3)).toBe('soon');
    expect(urgencyOf(4)).toBe('week');
    expect(urgencyOf(7)).toBe('week');
    expect(urgencyOf(8)).toBe('ok');
  });

  it('labels days in plain language', () => {
    expect(expiryLabel(-3)).toBe('Expired 3 days ago');
    expect(expiryLabel(-1)).toBe('Expired yesterday');
    expect(expiryLabel(0)).toBe('Expires today');
    expect(expiryLabel(1)).toBe('Tomorrow');
    expect(expiryLabel(5)).toBe('In 5 days');
    expect(expiryLabel(21)).toBe('In 3 weeks');
    expect(expiryLabel(120)).toBe('In 4 months');
  });

  it('computes days left from the calendar date, not the clock time', () => {
    const lateEvening = new Date(2026, 8, 29, 23, 30);
    expect(daysLeft({ expiresOn: '2026-09-30' }, lateEvening)).toBe(1);
    expect(daysLeft({ expiresOn: '2026-09-29' }, lateEvening)).toBe(0);
  });

  it('sorts soonest first, then alphabetically', () => {
    const sorted = sortByExpiry([
      mk('1', 'Yogurt', '2026-10-05'),
      mk('2', 'Milk', '2026-09-30'),
      mk('3', 'Apples', '2026-09-30'),
    ]);
    expect(sorted.map((i) => i.name)).toEqual(['Apples', 'Milk', 'Yogurt']);
  });

  it('summarizes only active items', () => {
    const s = summarize(
      [
        mk('1', 'Old milk', '2026-09-27'),
        mk('2', 'Spinach', '2026-09-29'),
        mk('3', 'Eggs', '2026-10-15'),
        mk('4', 'Gone', '2026-09-28', { status: 'used', resolvedOn: '2026-09-28' }),
      ],
      NOW,
    );
    expect(s.total).toBe(3);
    expect(s.counts).toEqual({ expired: 1, today: 1, soon: 0, week: 0, ok: 1 });
  });

  it('counts an item as rescued only when used within 3 days of its date', () => {
    const stats = wasteStats(
      [
        mk('1', 'Spinach', '2026-09-30', { status: 'used', resolvedOn: '2026-09-29' }),
        mk('2', 'Rice', '2027-01-01', { status: 'used', resolvedOn: '2026-09-29' }),
        mk('3', 'Milk', '2026-09-20', { status: 'wasted', resolvedOn: '2026-09-29' }),
        mk('4', 'Old thing', '2026-08-01', { status: 'wasted', resolvedOn: '2026-08-05' }),
        mk('5', 'Still here', '2026-09-30'),
      ],
      '2026-09-01',
    );
    expect(stats).toEqual({ used: 2, wasted: 1, rescued: 1 });
  });

  it('normalizes names for comparison', () => {
    expect(normalizeName('  Baby   Spinach ')).toBe('baby spinach');
  });
});
