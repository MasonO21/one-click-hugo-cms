/**
 * Housing: beds = sum of `housing x level effect` of usable buildings. A building with housing N holds N
 * colonists. Colonists without a bed simply sleep around the campfire / core — nobody is ever homeless
 * in a way that hurts.
 */
import type { Colonist, Id } from '../../core/state';
import type { Layout, Place } from './layout';

/** Which side of the colonist's life a new bed should be close to. */
function anchor(c: Colonist, layout: Layout): { x: number; z: number } {
  const wp = c.workplace != null ? layout.byId.get(c.workplace) : undefined;
  if (wp) return wp;
  return layout.core ?? { x: 0, z: 0 };
}

/**
 * Keep valid bed assignments, then give free beds to bedless colonists (enclosed rooms first, then the
 * home closest to their workplace), then move colonists out of open-air beds into free roofed ones.
 * Returns how many colonists have a bed afterwards.
 */
export function assignBeds(layout: Layout, colonists: Colonist[]): number {
  const left = new Map<Id, number>();
  let free = 0;
  for (const h of layout.homes) {
    left.set(h.id, h.cap);
    free += h.cap;
  }

  // 1. keep what is still valid
  for (const c of colonists) {
    if (c.bed == null) continue;
    const r = left.get(c.bed);
    if (r !== undefined && r > 0) {
      left.set(c.bed, r - 1);
      free--;
    } else c.bed = null;
  }

  const pick = (c: Colonist, roofedOnly: boolean): Place | null => {
    const a = anchor(c, layout);
    let best: Place | null = null;
    let bestScore = -Infinity;
    for (const h of layout.homes) {
      if ((left.get(h.id) ?? 0) <= 0) continue;
      if (roofedOnly && !h.roofed) continue;
      const dx = h.x - a.x;
      const dz = h.z - a.z;
      const score = (h.roofed ? 1000 : 0) - Math.sqrt(dx * dx + dz * dz);
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    return best;
  };

  // 2. bedless colonists
  if (free > 0) {
    for (const c of colonists) {
      if (c.bed != null) continue;
      const h = pick(c, false);
      if (!h) break;
      c.bed = h.id;
      left.set(h.id, (left.get(h.id) ?? 1) - 1);
      free--;
    }
  }

  // 3. upgrade open-air sleepers to free roofed beds
  if (free > 0) {
    for (const c of colonists) {
      if (c.bed == null) continue;
      const cur = layout.byId.get(c.bed);
      if (cur?.roofed) continue;
      const h = pick(c, true);
      if (!h) break;
      left.set(c.bed, (left.get(c.bed) ?? 0) + 1);
      c.bed = h.id;
      left.set(h.id, (left.get(h.id) ?? 1) - 1);
    }
  }

  let used = 0;
  for (const c of colonists) if (c.bed != null) used++;
  return used;
}
