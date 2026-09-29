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

  it('continues a saved route', () => {
    const recorder = new TrackRecorder([[40, -105, 0]], 500);
    recorder.add(fix(40.001, -105, 100));
    expect(recorder.distanceM).toBeCloseTo(611.2, 0);
    expect(recorder.points).toHaveLength(2);
  });
});
