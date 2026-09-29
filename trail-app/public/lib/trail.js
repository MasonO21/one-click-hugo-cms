// Trail data model. Stored/serialised form uses compact point tuples:
//   points: [[lat, lng, ele|null, t|null], ...]   (t = epoch ms)
// The server re-validates and recomputes stats, so it never trusts what a client claims.

import { boundingBox, buildPath, elevationGain, simplify } from './geo.js';

export const KINDS = ['photo', 'hazard', 'water', 'view', 'note', 'junction'];
export const DIFFICULTIES = ['easy', 'moderate', 'hard'];
export const LIMITS = {
  maxPoints: 20000,
  maxWaypoints: 200,
  maxPhotoChars: 400_000, // ~300 KB of base64 JPEG
  maxNameChars: 80,
  maxTextChars: 500,
};

export const toPoints = (trail) =>
  trail.points.map(([lat, lng, ele, t]) => ({ lat, lng, ele: ele ?? undefined, t: t ?? undefined }));

export const fromPoints = (pts) => pts.map((p) => [p.lat, p.lng, p.ele ?? null, p.t ?? null]);

export function computeStats(points) {
  const path = buildPath(points);
  const { ascent, descent } = elevationGain(points);
  const first = points[0]?.t;
  const last = points[points.length - 1]?.t;
  return {
    distance: Math.round(path.total),
    ascent,
    descent,
    durationS: first != null && last != null ? Math.max(0, Math.round((last - first) / 1000)) : null,
  };
}

/** Shrink a raw recording (1 Hz GPS) to something cheap to store and share. */
export function compactRecording(points, toleranceM = 2) {
  return simplify(points, toleranceM);
}

export function makeTrail({ name, description = '', difficulty = 'moderate', author = '', source = 'phone', points, waypoints = [] }) {
  const pts = Array.isArray(points[0]) ? toPoints({ points }) : points;
  return {
    v: 1,
    id: globalThis.crypto?.randomUUID?.() ?? `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Untitled trail',
    description,
    difficulty,
    author,
    source,
    createdAt: new Date().toISOString(),
    points: fromPoints(pts),
    waypoints,
    ...summarize(pts),
  };
}

function summarize(pts) {
  return {
    stats: computeStats(pts),
    bbox: boundingBox(pts),
    start: { lat: pts[0].lat, lng: pts[0].lng },
  };
}

/** Walk the trail the other way (e.g. the way back). Waypoints are position-based so they stay put. */
export function reverseTrail(trail) {
  const pts = toPoints(trail).reverse();
  // timestamps no longer make sense once reversed
  return { ...trail, points: fromPoints(pts.map((p) => ({ ...p, t: undefined }))), name: `${trail.name} (reverse)` };
}

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/**
 * Validate untrusted input and return a normalised trail, or throw Error with a
 * message safe to show to the user. Used by the server on upload and by the client on import.
 */
export function validateTrail(input, { keepId = false } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Trail must be an object');
  const rawPts = input.points;
  if (!Array.isArray(rawPts) || rawPts.length < 2) throw new Error('A trail needs at least 2 points');
  if (rawPts.length > LIMITS.maxPoints) throw new Error(`Too many points (max ${LIMITS.maxPoints})`);

  const pts = rawPts.map((p, i) => {
    if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) throw new Error(`Point ${i} is malformed`);
    const [lat, lng, ele, t] = p;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new Error(`Point ${i} is out of range`);
    return { lat, lng, ele: isNum(ele) ? ele : undefined, t: isNum(t) ? t : undefined };
  });

  const rawWps = Array.isArray(input.waypoints) ? input.waypoints : [];
  if (rawWps.length > LIMITS.maxWaypoints) throw new Error(`Too many waypoints (max ${LIMITS.maxWaypoints})`);
  const waypoints = rawWps.map((w, i) => {
    if (!w || !isNum(w.lat) || !isNum(w.lng) || Math.abs(w.lat) > 90 || Math.abs(w.lng) > 180)
      throw new Error(`Waypoint ${i} is malformed`);
    const out = {
      lat: w.lat,
      lng: w.lng,
      kind: KINDS.includes(w.kind) ? w.kind : 'note',
      text: clean(w.text, LIMITS.maxTextChars),
    };
    if (isNum(w.ele)) out.ele = w.ele;
    if (typeof w.photo === 'string' && w.photo) {
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(w.photo) || w.photo.length > LIMITS.maxPhotoChars)
        throw new Error(`Waypoint ${i} photo must be a JPEG under ~300 KB`);
      out.photo = w.photo;
    }
    return out;
  });

  const trail = {
    v: 1,
    id: keepId && typeof input.id === 'string' ? input.id : undefined,
    name: clean(input.name, LIMITS.maxNameChars) || 'Untitled trail',
    description: clean(input.description, LIMITS.maxTextChars * 4),
    difficulty: DIFFICULTIES.includes(input.difficulty) ? input.difficulty : 'moderate',
    author: clean(input.author, 40),
    source: ['glasses', 'phone', 'gpx', 'demo'].includes(input.source) ? input.source : 'phone',
    createdAt: typeof input.createdAt === 'string' && !Number.isNaN(Date.parse(input.createdAt)) ? input.createdAt : new Date().toISOString(),
    points: fromPoints(pts),
    waypoints,
    ...summarize(pts),
  };
  if (!trail.id) delete trail.id;
  return trail;
}

/** Summary row for lists: everything except the heavy geometry and photos. */
export function toSummary(trail, distanceFromUserM) {
  return {
    id: trail.id,
    name: trail.name,
    description: trail.description,
    difficulty: trail.difficulty,
    author: trail.author,
    source: trail.source,
    createdAt: trail.createdAt,
    stats: trail.stats,
    start: trail.start,
    bbox: trail.bbox,
    waypointCount: trail.waypoints.length,
    ...(distanceFromUserM != null ? { distanceFromUserM: Math.round(distanceFromUserM) } : {}),
  };
}
