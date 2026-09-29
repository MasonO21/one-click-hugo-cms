// Accumulates GPS fixes into a clean track. Fixes come from anywhere (phone geolocation,
// glasses companion, simulator); the recorder only decides which ones are worth keeping.

import { haversine } from './geo.js';
import { compactRecording, makeTrail } from './trail.js';

const DEFAULTS = {
  minMoveM: 4, // ignore jitter smaller than this
  maxAccuracyM: 30, // drop poor fixes
  maxSpeedMps: 12, // drop teleports (GPS glitches); nobody hikes at 43 km/h
  simplifyM: null, // final Douglas-Peucker tolerance; null = derive from the accuracy the GPS reported
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

export class Recorder {
  constructor(opts = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.points = [];
    this.waypoints = [];
    this.accuracies = [];
    this.rejected = 0;
    this.distance = 0;
    this.startedAt = null;
  }

  get last() {
    return this.points[this.points.length - 1] ?? null;
  }

  /** @returns {'kept'|'skipped'|'rejected'} */
  addFix(fix) {
    const o = this.opts;
    const t = fix.t ?? Date.now();
    if (this.startedAt == null) this.startedAt = t;
    if (fix.accuracy != null && fix.accuracy > o.maxAccuracyM) {
      this.rejected++;
      return 'rejected';
    }
    const p = { lat: fix.lat, lng: fix.lng, ele: fix.ele ?? undefined, t };
    const prev = this.last;
    if (prev) {
      const d = haversine(prev, p);
      const dt = Math.max(0.001, (t - prev.t) / 1000);
      if (d / dt > o.maxSpeedMps && dt < 60) {
        this.rejected++;
        return 'rejected';
      }
      // Movement smaller than the fix's own uncertainty is indistinguishable from noise.
      if (d < Math.max(o.minMoveM, (fix.accuracy ?? 0) * 0.6)) return 'skipped';
      this.distance += d;
    }
    this.points.push(p);
    if (fix.accuracy != null) this.accuracies.push(fix.accuracy);
    return 'kept';
  }

  addWaypoint({ kind = 'note', text = '', photo, at }) {
    const pos = at ?? this.last;
    if (!pos) throw new Error('No position yet: wait for a GPS fix before adding a waypoint');
    const wp = { lat: pos.lat, lng: pos.lng, ele: pos.ele, kind, text };
    if (photo) wp.photo = photo;
    this.waypoints.push(wp);
    return wp;
  }

  /** Serialisable state, so an in-progress recording survives the browser killing the tab. */
  snapshot() {
    const { points, waypoints, accuracies, rejected, distance, startedAt } = this;
    return { points, waypoints, accuracies, rejected, distance, startedAt };
  }

  static restore(snap, opts) {
    const r = new Recorder(opts);
    Object.assign(r, {
      points: snap.points ?? [],
      waypoints: snap.waypoints ?? [],
      accuracies: snap.accuracies ?? [],
      rejected: snap.rejected ?? 0,
      distance: snap.distance ?? 0,
      startedAt: snap.startedAt ?? null,
    });
    return r;
  }

  get canFinish() {
    return this.points.length >= 2;
  }

  finish(meta = {}) {
    if (!this.canFinish) throw new Error('Not enough movement recorded yet');
    // Noisy GPS makes a track wander around the true path; simplifying with a tolerance near the
    // typical error straightens that out instead of preserving (and over-counting) the wobble.
    const tolerance = this.opts.simplifyM ?? Math.min(8, Math.max(3, median(this.accuracies) * 0.7));
    return makeTrail({
      ...meta,
      points: compactRecording(this.points, tolerance),
      waypoints: this.waypoints,
    });
  }
}
