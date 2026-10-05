import { haversineMeters, TrackRecorder, type Fix } from '@/domain/track';

const fix = (latitude: number, longitude: number, seconds: number, accuracy: number | null = 5): Fix => ({
  latitude,
  longitude,
  timestamp: seconds * 1000,
  accuracy,
});

describe('haversineMeters', () => {
  it('measures a degree of latitude at about 111 km', () => {
    expect(haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111195, -2);
  });

  it('is zero for the same point', () => {
    expect(haversineMeters({ latitude: 40, longitude: -105 }, { latitude: 40, longitude: -105 })).toBe(0);
  });
});

describe('TrackRecorder', () => {
  it('records the first fix and adds distance for later ones', () => {
    const recorder = new TrackRecorder();
    expect(recorder.add(fix(40, -105, 0))).toBe(true);
    expect(recorder.distanceM).toBe(0);
    // About 111 m north, 100 seconds later: a normal walking pace.
    expect(recorder.add(fix(40.001, -105, 100))).toBe(true);
    expect(recorder.distanceM).toBeCloseTo(111.2, 0);
    expect(recorder.points).toHaveLength(2);
  });

  it('drops inaccurate fixes', () => {
    const recorder = new TrackRecorder();
    expect(recorder.add(fix(40, -105, 0, 120))).toBe(false);
    expect(recorder.points).toHaveLength(0);
    expect(recorder.add(fix(40, -105, 1, null))).toBe(true);
  });

  it('ignores tiny movements while standing still', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 0));
    expect(recorder.add(fix(40.00002, -105, 10))).toBe(false);
    expect(recorder.distanceM).toBe(0);
  });

  it('ignores GPS jumps faster than a person can move', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 0));
    // About 1.1 km in 5 seconds.
    expect(recorder.add(fix(40.01, -105, 5))).toBe(false);
    expect(recorder.distanceM).toBe(0);
  });

  it('ignores fixes that are not newer than the last one', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 100));
    expect(recorder.add(fix(40.001, -105, 100))).toBe(false);
    expect(recorder.add(fix(40.001, -105, 50))).toBe(false);
  });

  it('does not add distance while standing still with GPS drift', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 0, 30));
    // Ten minutes of fixes bouncing between two spots 15 m apart, each accurate to 30 m.
    for (let i = 1; i <= 60; i += 1) recorder.add(fix(i % 2 ? 40.000135 : 40, -105, i * 10, 30));
    expect(recorder.distanceM).toBe(0);
  });

  it('still measures real walking when accuracy is rough', () => {
    const recorder = new TrackRecorder();
    // 10 m every 10 s, accurate to 30 m: about 1 m/s for 300 m.
    for (let i = 0; i <= 30; i += 1) recorder.add(fix(40 + i * 0.00009, -105, i * 10, 30));
    expect(recorder.distanceM).toBeGreaterThan(250);
    expect(recorder.distanceM).toBeLessThan(320);
  });

  it('moves a stale first fix to where the phone really is', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40.27, -105, 0)); // a cached position 30 km away
    expect(recorder.add(fix(40, -105, 10))).toBe(false);
    expect(recorder.add(fix(40.00001, -105, 15))).toBe(true); // second disagreement: re-anchor
    expect(recorder.distanceM).toBe(0);
    recorder.add(fix(40.001, -105, 115));
    expect(recorder.distanceM).toBeCloseTo(110, -1);
  });

  it('keeps a route when a jump happens mid-way', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 0));
    recorder.add(fix(40.001, -105, 100));
    expect(recorder.add(fix(41, -105, 110))).toBe(false);
    expect(recorder.add(fix(41.0001, -105, 115))).toBe(false);
    expect(recorder.points).toHaveLength(2);
  });

  it('ignores fixes with impossible values', () => {
    const recorder = new TrackRecorder();
    recorder.add(fix(40, -105, 0));
    expect(recorder.add(fix(Number.NaN, -105, 100))).toBe(false);
    expect(recorder.add(fix(40.001, 200, 100))).toBe(false);
    expect(recorder.add(fix(40.001, -105, Number.NaN))).toBe(false);
    expect(recorder.add(fix(40.001, -105, 100, Number.NaN))).toBe(true);
    expect(Number.isFinite(recorder.distanceM)).toBe(true);
  });

  it('continues a saved route', () => {
    const recorder = new TrackRecorder([[40, -105, 0]], 500);
    recorder.add(fix(40.001, -105, 100));
    expect(recorder.distanceM).toBeCloseTo(611.2, 0);
    expect(recorder.points).toHaveLength(2);
  });
});
