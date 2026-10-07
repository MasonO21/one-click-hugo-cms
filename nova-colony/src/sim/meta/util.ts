/**
 * Small pure helpers shared by the meta systems (missions, tutorial, live-ops).
 * OWNER: meta agent.
 */
import type { Reward, ResourceBag } from '../../data/schema';
import type { DataRegistry } from '../../data';
import { bagEntries } from '../../core/bag';
import { fmt } from '../../core/format';

/** FNV-1a 32-bit string hash (stable across platforms; used to seed per-date randomness). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Multiply every quantity in a reward (VIP double daily rewards, ad doubling...). Colonist grants stay single. */
export function scaleReward(r: Reward, mult: number): Reward {
  if (mult === 1) return r;
  const out: Reward = { ...r };
  if (r.resources) {
    const bag: ResourceBag = {};
    for (const [k, v] of bagEntries(r.resources)) bag[k] = Math.round(v * mult);
    out.resources = bag;
  }
  if (r.items) {
    const items: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.items)) items[k] = Math.round(v * mult);
    out.items = items;
  }
  if (r.nova) out.nova = Math.round(r.nova * mult);
  if (r.rp) out.rp = Math.round(r.rp * mult);
  if (r.xp) out.xp = Math.round(r.xp * mult);
  if (r.boost) out.boost = { ...r.boost, minutes: Math.round(r.boost.minutes * mult) };
  return out;
}

/** "120 Wood, 15 Nova, rare colonist" — short human text for toasts. */
export function describeReward(r: Reward, data: DataRegistry): string {
  const parts: string[] = [];
  for (const [k, v] of bagEntries(r.resources)) parts.push(`${fmt(v)} ${data.resource(k)?.name ?? k}`);
  if (r.nova) parts.push(`${fmt(r.nova)} Nova`);
  if (r.rp) parts.push(`${fmt(r.rp)} RP`);
  if (r.items) for (const [k, v] of Object.entries(r.items)) parts.push(`${v}× ${data.item(k)?.name ?? k}`);
  if (r.colonist) parts.push(`${r.colonist} colonist`);
  if (r.boost) parts.push(`${r.boost.mult}× ${r.boost.kind} boost`);
  if (r.cosmetic) parts.push(data.cosmetic(r.cosmetic)?.name ?? r.cosmetic);
  if (r.vehicle) parts.push(data.vehicle(r.vehicle)?.name ?? r.vehicle);
  return parts.join(', ');
}

/**
 * Tier-scaled "free crate" contents (rewarded ad crate and the timed free crate).
 * Basic resources always; intermediate from tier 2; advanced from tier 4. Capacity clamps on grant.
 */
export function crateReward(data: DataRegistry, tier: number): Reward {
  const base = Math.round(60 * (1 + tier * 1.2));
  const resources: ResourceBag = {};
  for (const r of data.resources) {
    if (r.category === 'basic') resources[r.id] = base;
    else if (r.category === 'intermediate' && tier >= 2) resources[r.id] = Math.round(base * 0.3);
    else if (r.category === 'advanced' && tier >= 4) resources[r.id] = Math.round(base * 0.15);
  }
  return { resources, xp: 5 };
}

/** Research points granted by the "research grant" ad, scaled with colony tier. */
export function researchGrantRp(tier: number): number {
  return Math.round(20 * Math.pow(1.9, Math.max(0, tier)));
}
