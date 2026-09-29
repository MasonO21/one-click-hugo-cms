// Pure geometry helpers shared by the browser app, the server and the tests.
// Points are plain {lat, lng, ele?, t?} objects. Distances are metres, angles degrees.

export const EARTH_RADIUS_M = 6371008.8;

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export function normalizeDeg(d) {
  return ((d % 360) + 360) % 360;
}

/** Signed smallest difference a - b in (-180, 180]. Positive = a is clockwise of b. */
export function angleDiff(a, b) {
  const d = normalizeDeg(a - b);
  return d > 180 ? d - 360 : d;
}

export function haversine(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial compass bearing from a to b, 0 = north, 90 = east. */
export function bearing(a, b) {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Point reached by travelling `distance` metres from `p` on `bearingDeg`. */
export function destination(p, bearingDeg, distance) {
  const δ = distance / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(p.lat);
  const λ1 = toRad(p.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

/** Local equirectangular projection around `origin`: fine for anything trail-sized. */
export function toLocal(origin, p) {
  const k = Math.cos(toRad(origin.lat));
  return {
    x: toRad(p.lng - origin.lng) * EARTH_RADIUS_M * k,
    y: toRad(p.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

export function fromLocal(origin, { x, y }) {
  const k = Math.cos(toRad(origin.lat));
  return {
    lat: origin.lat + toDeg(y / EARTH_RADIUS_M),
    lng: origin.lng + toDeg(x / (EARTH_RADIUS_M * k)),
  };
}

/** Build a path with cumulative distances so we can ask "how far along?" cheaply. */
export function buildPath(points) {
  const cum = new Array(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += haversine(points[i - 1], points[i]);
    cum[i] = total;
  }
  return { points, cum, total };
}

/** Point `d` metres along the path (clamped), with the bearing of the segment it sits on. */
export function pointAtDistance(path, d) {
  const { points, cum, total } = path;
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0], bearing: 0, index: 0 };
  const dist = Math.max(0, Math.min(total, d));
  // binary search for the segment containing `dist`
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen > 0 ? (dist - cum[lo]) / segLen : 0;
  const a = points[lo];
  const b = points[hi];
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
    ele: a.ele != null && b.ele != null ? a.ele + (b.ele - a.ele) * t : undefined,
    bearing: bearing(a, b),
    index: lo,
  };
}

/**
 * Closest point on the path to `p`, restricted to the along-track window
 * [fromDist, toDist] so out-and-back or looping trails don't make us jump to the
 * wrong leg. Returns {distance (to path), along (metres from start), point, index}.
 */
export function closestOnPath(path, p, fromDist = 0, toDist = Infinity) {
  const { points, cum } = path;
  if (points.length === 0) return null;
  if (points.length === 1) {
    return { distance: haversine(p, points[0]), along: 0, point: points[0], index: 0 };
  }
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    if (cum[i + 1] < fromDist) continue;
    if (cum[i] > toDist) break;
    const a = points[i];
    const b = points[i + 1];
    const B = toLocal(a, b);
    const P = toLocal(a, p);
    const len2 = B.x * B.x + B.y * B.y;
    let t = len2 > 0 ? (P.x * B.x + P.y * B.y) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = P.x - B.x * t;
    const dy = P.y - B.y * t;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) {
      const segLen = cum[i + 1] - cum[i];
      best = {
        distance,
        along: cum[i] + segLen * t,
        index: i,
        point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
      };
    }
  }
  return best;
}

/** Douglas-Peucker simplification (iterative, tolerance in metres). */
export function simplify(points, toleranceM) {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const A = points[s];
    const B = toLocal(A, points[e]);
    const len2 = B.x * B.x + B.y * B.y;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const P = toLocal(A, points[i]);
      let d;
      if (len2 === 0) d = Math.hypot(P.x, P.y);
      else {
        const t = Math.max(0, Math.min(1, (P.x * B.x + P.y * B.y) / len2));
        d = Math.hypot(P.x - B.x * t, P.y - B.y * t);
      }
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function boundingBox(points) {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

/** Total ascent/descent in metres with a small dead-band so GPS noise doesn't inflate it. */
export function elevationGain(points, deadBandM = 3) {
  let ascent = 0;
  let descent = 0;
  let ref = null;
  for (const p of points) {
    if (p.ele == null) continue;
    if (ref == null) {
      ref = p.ele;
      continue;
    }
    const diff = p.ele - ref;
    if (diff >= deadBandM) {
      ascent += diff;
      ref = p.ele;
    } else if (diff <= -deadBandM) {
      descent -= diff;
      ref = p.ele;
    }
  }
  return { ascent: Math.round(ascent), descent: Math.round(descent) };
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassName(deg) {
  return COMPASS[Math.round(normalizeDeg(deg) / 45) % 8];
}

export function formatDistance(m) {
  if (m < 1000) return `${Math.round(m / 5) * 5 || Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
}
