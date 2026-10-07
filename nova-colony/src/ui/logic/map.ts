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
  label: string;
  /** Tapping offers fast travel. */
  travel: boolean;
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
