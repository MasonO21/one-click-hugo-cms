// Synthetic trail + simulated walker. Lets you demo and test the whole record -> guide
// loop from a desktop browser (or CI) with no GPS and no glasses.

import { buildPath, destination, fromLocal, pointAtDistance } from './geo.js';
import { makeTrail } from './trail.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A loop with a few clear turns, in metres east/north of the start.
const DEMO_VERTICES = [
  [0, 0], [0, 160], [110, 250], [260, 262], [340, 370], [310, 520],
  [190, 610], [40, 590], [-90, 480], [-110, 330], [-60, 190], [0, 60], [0, 0],
];

/** Demo loop anchored at `origin` ({lat,lng}); ~2 km with elevation and waypoints. */
export function makeDemoTrail(origin = { lat: 39.9784, lng: -105.2895 }, seed = 7) {
  const rand = mulberry32(seed);
  const raw = [];
  for (let i = 0; i < DEMO_VERTICES.length - 1; i++) {
    const [x1, y1] = DEMO_VERTICES[i];
    const [x2, y2] = DEMO_VERTICES[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.round(len / 6));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // a little lateral wobble so it looks hand-walked, not ruled
      const wob = (rand() - 0.5) * 2.2;
      const nx = -(y2 - y1) / len;
      const ny = (x2 - x1) / len;
      raw.push({ x: x1 + (x2 - x1) * t + nx * wob, y: y1 + (y2 - y1) * t + ny * wob });
    }
  }
  raw.push({ x: 0, y: 0 });

  const t0 = Date.parse('2026-06-14T15:00:00Z');
  const cum = raw.reduce((acc, p, i) => [...acc, i ? acc[i - 1] + Math.hypot(p.x - raw[i - 1].x, p.y - raw[i - 1].y) : 0], []);
  const total = cum[cum.length - 1];
  const points = raw.map((p, i) => {
    const f = cum[i] / total;
    return {
      ...fromLocal(origin, p),
      // closed profile (starts and ends at the same height), like a real loop
      ele: Math.round((1650 + 70 * Math.sin(2 * Math.PI * f) + 22 * Math.sin(2 * Math.PI * 7 * f)) * 10) / 10,
      t: t0 + Math.round((cum[i] / 1.2) * 1000),
    };
  });

  const path = buildPath(points);
  const at = (f) => pointAtDistance(path, path.total * f);
  const waypoints = [
    { f: 0.18, kind: 'junction', text: 'Keep left at the fork' },
    { f: 0.4, kind: 'water', text: 'Creek crossing, stepping stones' },
    { f: 0.6, kind: 'view', text: 'Overlook: worth the pause' },
    { f: 0.8, kind: 'hazard', text: 'Loose rock on the descent' },
  ].map(({ f, kind, text }) => {
    const p = at(f);
    return { lat: p.lat, lng: p.lng, ele: p.ele, kind, text };
  });

  return makeTrail({
    name: 'Demo Ridge Loop',
    description: 'A synthetic 2 km loop for trying Waypath without hitting the trail. Not a real route.',
    difficulty: 'easy',
    author: 'Waypath',
    source: 'demo',
    points,
    waypoints,
  });
}

/**
 * Walks along a list of points at `speedMps`, emitting one fix per `next(dtS)` call.
 * `lateralM` shifts the walker sideways (positive = right of travel) to simulate wandering off.
 */
export class Walker {
  constructor(points, { speedMps = 1.3, noiseM = 2, seed = 1, startAlong = 0, t0 = Date.now() } = {}) {
    this.path = buildPath(points);
    this.speed = speedMps;
    this.noiseM = noiseM;
    this.rand = mulberry32(seed);
    this.along = startAlong;
    this.t = t0;
    this.lateralM = 0;
  }

  get done() {
    return this.along >= this.path.total;
  }

  next(dtS = 1) {
    this.along = Math.min(this.path.total, this.along + this.speed * dtS);
    this.t += dtS * 1000;
    const p = pointAtDistance(this.path, this.along);
    let pos = { lat: p.lat, lng: p.lng };
    if (this.lateralM) pos = destination(pos, p.bearing + 90, this.lateralM);
    if (this.noiseM) {
      pos = destination(pos, this.rand() * 360, this.rand() * this.noiseM);
    }
    return { ...pos, ele: p.ele, heading: p.bearing, accuracy: 5 + this.rand() * 4, t: this.t };
  }
}

/** Record-side helper: turn a walker's fixes into a raw recording, as the phone would. */
export function recordWalk(points, opts) {
  const w = new Walker(points, opts);
  const out = [];
  while (!w.done) out.push(w.next(1));
  return out;
}
