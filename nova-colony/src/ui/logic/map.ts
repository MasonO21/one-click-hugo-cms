/** World-map viewport math (pan/zoom, marker hit testing, region label placement). */
import { WORLD_CELLS, WORLD_SIZE, HALF_WORLD, cellCenter } from '../../core/constants';
import { clamp } from '../../core/math';

export interface MapViewport {
  /** Canvas size in CSS px. */
  w: number;
  h: number;
  /** 1 = whole world fits. */
  zoom: number;
  /** World point at the canvas centre. */
  cx: number;
  cz: number;
}

export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 5;

/** CSS px per world unit. */
export function mapScale(vp: MapViewport): number {
  return (Math.min(vp.w, vp.h) / WORLD_SIZE) * vp.zoom;
}

export function worldToMap(vp: MapViewport, x: number, z: number): { x: number; y: number } {
  const k = mapScale(vp);
  return { x: (x - vp.cx) * k + vp.w / 2, y: (z - vp.cz) * k + vp.h / 2 };
}

export function mapToWorld(vp: MapViewport, px: number, py: number): { x: number; z: number } {
  const k = mapScale(vp);
  return { x: (px - vp.w / 2) / k + vp.cx, z: (py - vp.h / 2) / k + vp.cz };
}

/** Keep the viewport inside the world and zoom in range. */
export function clampViewport(vp: MapViewport): MapViewport {
  vp.zoom = clamp(vp.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const half = HALF_WORLD / vp.zoom;
  vp.cx = clamp(vp.cx, -HALF_WORLD + half, HALF_WORLD - half);
  vp.cz = clamp(vp.cz, -HALF_WORLD + half, HALF_WORLD - half);
  return vp;
}

export interface MapMarker {
  id: string;
  kind: 'core' | 'player' | 'poi' | 'beacon' | 'event' | 'teleporter';
  x: number;
  z: number;
  icon: string;
  /** Painted icon URL (art/pois, art/hud), drawn instead of the emoji once loaded. */
  art?: string | null;
  label: string;
  /** Tapping offers fast travel. */
  travel: boolean;
  /**
   * Points of interest already explored: 'restocked' (a cache that filled up again: a green pip), 'waiting' (looted,
   * restocking: dimmed), 'done' (one-off, explored: dimmed with a tick). Unset: not opened yet.
   */
  loot?: 'restocked' | 'waiting' | 'done';
}

/** Closest marker within `maxPx` of a map point, preferring travel targets. */
export function nearestMarker(markers: MapMarker[], vp: MapViewport, px: number, py: number, maxPx = 28): MapMarker | null {
  let best: MapMarker | null = null;
  let bestD = maxPx;
  for (const m of markers) {
    const p = worldToMap(vp, m.x, m.z);
    let d = Math.hypot(p.x - px, p.y - py);
    if (m.travel) d -= 6;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return best;
}

/** Centroid (world units) of every region in a region map (indices into `ids`). */
export function regionCentroids(regionMap: Uint8Array, ids: string[]): Record<string, { x: number; z: number }> {
  const sums = ids.map(() => ({ x: 0, z: 0, n: 0 }));
  for (let cz = 0; cz < WORLD_CELLS; cz += 2) {
    for (let cx = 0; cx < WORLD_CELLS; cx += 2) {
      const i = regionMap[cz * WORLD_CELLS + cx];
      const s = sums[i];
      if (!s) continue;
      s.x += cx;
      s.z += cz;
      s.n++;
    }
  }
  const out: Record<string, { x: number; z: number }> = {};
  ids.forEach((id, i) => {
    const s = sums[i];
    if (s.n > 0) out[id] = { x: cellCenter(Math.round(s.x / s.n)), z: cellCenter(Math.round(s.z / s.n)) };
  });
  return out;
}

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where to draw a centred region label of size w x h wanted at (x, y) on a map of size `bounds`: off the markers
 * it would hide (moved just below them), out of the blocked rects (the zoom buttons) and fully inside the map, so a
 * name is never cut at the edge ("Crystal Canyo") or drawn under a beacon.
 */
export function placeLabel(
  x: number,
  y: number,
  w: number,
  h: number,
  bounds: { w: number; h: number },
  markers: readonly { x: number; y: number; r: number }[] = [],
  blocked: readonly LabelRect[] = [],
  pad = 4,
): { x: number; y: number } {
  const hits = (cx: number, cy: number, m: { x: number; y: number; r: number }) =>
    Math.abs(m.x - cx) < w / 2 + m.r && Math.abs(m.y - cy) < h / 2 + m.r;
  for (let i = 0; i < 3; i++) {
    const m = markers.find((k) => hits(x, y, k));
    if (!m) break;
    y = m.y + m.r + h / 2 + 2;
  }
  const clampX = (v: number) => (w + 2 * pad >= bounds.w ? bounds.w / 2 : Math.min(bounds.w - pad - w / 2, Math.max(pad + w / 2, v)));
  const clampY = (v: number) => (h + 2 * pad >= bounds.h ? bounds.h / 2 : Math.min(bounds.h - pad - h / 2, Math.max(pad + h / 2, v)));
  x = clampX(x);
  y = clampY(y);
  for (const b of blocked) {
    const overlaps = x + w / 2 > b.x - pad && x - w / 2 < b.x + b.w + pad && y + h / 2 > b.y - pad && y - h / 2 < b.y + b.h + pad;
    if (!overlaps) continue;
    const left = b.x - pad - w / 2;
    if (left - w / 2 >= pad) x = left;
    else y = clampY(b.y - pad - h / 2);
  }
  return { x, y };
}
