import type { Entry, OutingWithTrack } from '@/db/types';
import { toJson, toMarkdown } from '@/domain/export';
import { groupByDay } from '@/domain/group';
import { decimateTrack, type TrackPoint } from '@/domain/track';

const entry = (over: Partial<Entry> & { id: number; createdAt: number }): Entry => ({
  outingId: null,
  transcript: 'note',
  durationS: 0,
  latitude: null,
  longitude: null,
  place: null,
  tempC: null,
  weatherCode: null,
  mood: null,
  moodSource: 'auto',
  ...over,
});

describe('groupByDay', () => {
  it('starts a new section for each calendar day, keeping order', () => {
    const now = new Date(2026, 8, 29, 12).getTime();
    const items = [
      { createdAt: new Date(2026, 8, 29, 9).getTime(), id: 1 },
      { createdAt: new Date(2026, 8, 29, 8).getTime(), id: 2 },
      { createdAt: new Date(2026, 8, 28, 20).getTime(), id: 3 },
      { createdAt: new Date(2026, 8, 20, 7).getTime(), id: 4 },
    ];
    const sections = groupByDay(items, now);
    expect(sections.map((s) => s.title)).toEqual(['Today', 'Yesterday', expect.stringContaining('September 20')]);
    expect(sections.map((s) => s.data.map((i) => i.id))).toEqual([[1, 2], [3], [4]]);
  });

  it('returns nothing for no entries', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('decimateTrack', () => {
  const points = (n: number): TrackPoint[] => Array.from({ length: n }, (_, i) => [40 + i / 1000, -105, i]);

  it('leaves short routes alone', () => {
    expect(decimateTrack(points(5), 10)).toHaveLength(5);
  });

  it('thins long routes but keeps the first and last point', () => {
    const long = points(1000);
    const thin = decimateTrack(long, 100);
    expect(thin).toHaveLength(100);
    expect(thin[0]).toEqual(long[0]);
    expect(thin[99]).toEqual(long[999]);
    const times = thin.map((p) => p[2]);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('exports', () => {
  const outing: OutingWithTrack = {
    id: 7,
    kind: 'hike',
    name: 'Ridge loop',
    startedAt: new Date(2026, 8, 26, 7).getTime(),
    endedAt: new Date(2026, 8, 26, 9, 30).getTime(),
    distanceM: 9977,
    entryCount: 1,
    track: [[40, -105, 1]],
  };
  const entries = [
    entry({
      id: 1,
      createdAt: new Date(2026, 8, 26, 7, 42).getTime(),
      transcript: 'Fog on the ridge. So happy.',
      outingId: 7,
      place: 'Chautauqua Park, Boulder',
      tempC: 9,
      weatherCode: 45,
      mood: 'happy',
      latitude: 40.01,
      longitude: -105.27,
    }),
    entry({ id: 2, createdAt: new Date(2026, 8, 25, 18).getTime(), transcript: 'Plain note.' }),
  ];

  it('writes readable Markdown, newest first, with every tag', () => {
    const text = toMarkdown({ entries, outings: [outing] }, { temperature: 'f', distance: 'mi' }, 'en-US');
    expect(text.startsWith('# Trail Notes')).toBe(true);
    expect(text.indexOf('Fog on the ridge')).toBeLessThan(text.indexOf('Plain note.'));
    expect(text).toContain('## Saturday, September 26, 2026');
    expect(text).toContain('## Friday, September 25, 2026');
    expect(text).toContain('- Route: Ridge loop (6.2 mi, 2:30:00)');
    expect(text).toContain('- Place: Chautauqua Park, Boulder');
    expect(text).toContain('- Weather: Foggy, 48°F');
    expect(text).toContain('- Mood: Happy');
  });

  it('handles an empty journal', () => {
    expect(toMarkdown({ entries: [], outings: [] }, { temperature: 'c', distance: 'km' })).toContain('No entries yet.');
  });

  it('writes complete JSON with ISO dates and metric values', () => {
    const json = JSON.parse(toJson({ entries, outings: [outing] }, Date.UTC(2026, 8, 29, 12)));
    expect(json).toMatchObject({ app: 'Trail Notes', format: 1, exportedAt: '2026-09-29T12:00:00.000Z' });
    expect(json.outings[0]).toMatchObject({ id: 7, name: 'Ridge loop', distanceMeters: 9977, track: [[40, -105, 1]] });
    expect(json.entries[0]).toMatchObject({
      transcript: 'Fog on the ridge. So happy.',
      temperatureC: 9,
      weather: 'Foggy',
      weatherCode: 45,
      mood: 'happy',
      latitude: 40.01,
      outingId: 7,
    });
    expect(json.entries[1]).toMatchObject({ mood: null, weather: null, place: null });
  });
});
