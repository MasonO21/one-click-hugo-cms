/**
 * Offline progress — a small fixed-step simulation of the colony's resource flows.
 *
 * Simple producers credit `rate × minutes` (identical to "positive net × time"), but stepping lets
 * converter chains (mine -> smelter -> factory) behave like they do online: a converter only runs
 * as far as its inputs allow, and capacity is respected along the way.
 *
 * Cozy rules:
 *  - Colonist upkeep is paid only from what the colony produced while away — the stockpile is never
 *    eaten offline, so nobody comes back to an empty pantry.
 *  - Converters may draw on the stockpile (the factories really were working); those inputs are
 *    reported in `spent` and deducted once when the summary is applied (never doubled).
 *  - Gains are clamped to free storage capacity.
 *  - Research points stop after `rpMinutes` of credited time (the labs bank about two hours, like a store fills up),
 *    so the research backlog stays something you come back to spend.
 */
import type { ResourceBag } from '../../data/schema';

export interface OfflineFlow {
  /** Inputs per minute at the flow's efficiency (empty for simple producers). */
  ins: [string, number][];
  /** Outputs per minute at the flow's efficiency. */
  outs: [string, number][];
}

export interface OfflineModel {
  flows: OfflineFlow[];
  /** Colonist upkeep per minute. */
  upkeep: [string, number][];
  /** Research points per minute. */
  rpPerMin: number;
  /** Most credited minutes that earn research points (undefined = no cap). */
  rpMinutes?: number;
}

export interface OfflineResult {
  gains: ResourceBag;
  spent: ResourceBag;
  rp: number;
  /** True when research stopped at `rpMinutes` before the time ran out. */
  rpCapped?: boolean;
}

/** Upper bound on simulation steps (one step per simulated minute until then). */
const MAX_STEPS = 240;

/**
 * Simulate `seconds` of offline production starting from `amounts` with storage `capacity`.
 * Pure: does not mutate its inputs.
 */
export function simulateOffline(
  model: OfflineModel,
  seconds: number,
  amounts: Readonly<Record<string, number>>,
  capacity: Readonly<Record<string, number>>,
): OfflineResult {
  const gains: ResourceBag = {};
  const spent: ResourceBag = {};
  const minutes = Math.max(0, seconds) / 60;
  const rpCap = model.rpMinutes !== undefined && model.rpMinutes >= 0 ? model.rpMinutes : Infinity;
  const rp = Math.floor(Math.max(0, model.rpPerMin) * Math.min(minutes, rpCap));
  const rpCapped = model.rpPerMin > 0 && minutes > rpCap;
  if (minutes <= 0) return { gains, spent, rp: 0 };

  // Aggregate simple producers per resource; keep converters as separate flows.
  const plain = new Map<string, number>();
  const converters: OfflineFlow[] = [];
  const touched = new Set<string>();
  for (const f of model.flows) {
    for (const [r] of f.ins) touched.add(r);
    for (const [r] of f.outs) touched.add(r);
    if (f.ins.length === 0) {
      for (const [r, n] of f.outs) if (n > 0) plain.set(r, (plain.get(r) ?? 0) + n);
    } else {
      converters.push(f);
    }
  }
  for (const [r] of model.upkeep) touched.add(r);

  const ids = [...touched];
  const init: Record<string, number> = {};
  const limit: Record<string, number> = {};
  const v: Record<string, number> = {};
  for (const r of ids) {
    const a = Math.max(0, amounts[r] ?? 0);
    init[r] = a;
    v[r] = a;
    // Never clamp below what is already stored (capacity may have shrunk).
    limit[r] = Math.max(capacity[r] ?? 0, a);
  }

  const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(minutes)));
  const dt = minutes / steps;

  for (let s = 0; s < steps; s++) {
    // 1. simple production
    for (const [r, n] of plain) v[r] += n * dt;

    // 2. upkeep, only from this session's surplus (never the stockpile)
    for (const [r, n] of model.upkeep) {
      const surplus = Math.max(0, v[r] - init[r]);
      v[r] -= Math.min(surplus, n * dt);
    }

    // 3. converters, limited by available inputs
    for (const f of converters) {
      let frac = 1;
      for (const [r, n] of f.ins) {
        const need = n * dt;
        if (need > 0) frac = Math.min(frac, Math.max(0, v[r]) / need);
      }
      if (frac <= 0) continue;
      if (frac > 1) frac = 1;
      for (const [r, n] of f.ins) v[r] -= n * dt * frac;
      for (const [r, n] of f.outs) v[r] += n * dt * frac;
    }

    // 4. storage capacity
    for (const r of ids) if (v[r] > limit[r]) v[r] = limit[r];
  }

  for (const r of ids) {
    const delta = v[r] - init[r];
    if (delta >= 1) gains[r] = Math.floor(delta + 1e-6);
    else if (delta <= -1) spent[r] = Math.floor(-delta + 1e-6);
  }
  return rpCapped ? { gains, spent, rp, rpCapped } : { gains, spent, rp };
}
