export type TrackPoint = [latitude: number, longitude: number, timestamp: number];

export interface Fix {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number | null;
  // Speed over ground in m/s as the GPS measured it, when the phone reports one.
  speed?: number | null;
}

// Below this GPS speed the person is standing still.
const STILL_MPS = 0.3;

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface TrackOptions {
  // Fixes less accurate than this (in meters) are ignored.
  maxAccuracyM: number;
  // Movement smaller than this is treated as standing still.
  minStepM: number;
  // Faster than this (m/s) is treated as a GPS jump, not a person.
  maxSpeedMps: number;
}

export const DEFAULT_TRACK_OPTIONS: TrackOptions = {
  maxAccuracyM: 50,
  minStepM: 8,
  maxSpeedMps: 12,
};

// Collects GPS fixes into a route and its distance, dropping noisy fixes.
export class TrackRecorder {
  private readonly options: TrackOptions;
  private readonly recorded: TrackPoint[] = [];
  private meters = 0;
  private jumps = 0;

  constructor(initial: TrackPoint[] = [], distanceM = 0, options: Partial<TrackOptions> = {}) {
    this.options = { ...DEFAULT_TRACK_OPTIONS, ...options };
    this.recorded.push(...initial);
    this.meters = distanceM;
  }

  get points(): readonly TrackPoint[] {
    return this.recorded;
  }

  get distanceM(): number {
    return this.meters;
  }

  get last(): TrackPoint | null {
    return this.recorded.length > 0 ? this.recorded[this.recorded.length - 1] : null;
  }

  add(fix: Fix): boolean {
    if (![fix.latitude, fix.longitude, fix.timestamp].every(Number.isFinite)) return false;
    if (Math.abs(fix.latitude) > 90 || Math.abs(fix.longitude) > 180) return false;
    const accuracy = fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 ? fix.accuracy : null;
    const speed = typeof fix.speed === 'number' && Number.isFinite(fix.speed) && fix.speed >= 0 ? fix.speed : null;
    if (accuracy !== null && accuracy > this.options.maxAccuracyM) return false;

    const previous = this.last;
    if (!previous) {
      this.recorded.push([fix.latitude, fix.longitude, fix.timestamp]);
      this.jumps = 0;
      return true;
    }

    const seconds = (fix.timestamp - previous[2]) / 1000;
    if (seconds <= 0) return false;

    const step = haversineMeters(
      { latitude: previous[0], longitude: previous[1] },
      { latitude: fix.latitude, longitude: fix.longitude },
    );
    // Standing still must not add distance, but a moving route should keep its corners.
    // When the GPS says the phone is still, a step within the fix's accuracy is drift.
    // When it says the phone is moving, keep points close so switchbacks are not cut.
    // Without a speed reading, use part of the accuracy, capped.
    const minStep =
      speed === null
        ? Math.max(this.options.minStepM, Math.min((accuracy ?? 0) * 0.75, 20))
        : speed < STILL_MPS
          ? Math.max(this.options.minStepM, accuracy ?? 0)
          : this.options.minStepM;
    if (step < minStep) return false;

    if (step / seconds > this.options.maxSpeedMps) {
      this.jumps += 1;
      // The very first fix of a route is often stale or rough. When the next fixes keep
      // disagreeing with it, move the start to where the phone really is.
      if (this.recorded.length === 1 && this.jumps >= 2) {
        this.recorded[0] = [fix.latitude, fix.longitude, fix.timestamp];
        this.jumps = 0;
        return true;
      }
      return false;
    }

    this.jumps = 0;
    this.meters += step;
    this.recorded.push([fix.latitude, fix.longitude, fix.timestamp]);
    return true;
  }
}

// Thins a long route to at most `max` points, always keeping the first and last.
export function decimateTrack(points: readonly TrackPoint[], max: number): TrackPoint[] {
  if (points.length <= max || max < 2) return [...points];
  const step = (points.length - 1) / (max - 1);
  const result: TrackPoint[] = [];
  for (let i = 0; i < max; i += 1) result.push(points[Math.round(i * step)]);
  return result;
}
