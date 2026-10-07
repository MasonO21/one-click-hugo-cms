import type { ResourceBag } from '../data/schema';

/** Helpers for ResourceBag = Partial<Record<resourceId, number>>. All functions are pure. */
export function bagEntries(bag: ResourceBag | undefined): [string, number][] {
  if (!bag) return [];
  return Object.entries(bag).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0);
}
export function bagAdd(a: ResourceBag, b: ResourceBag | undefined, scale = 1): ResourceBag {
  const out: ResourceBag = { ...a };
  for (const [k, v] of bagEntries(b)) out[k] = (out[k] ?? 0) + v * scale;
  return out;
}
export function bagScale(a: ResourceBag | undefined, s: number, round = false): ResourceBag {
  const out: ResourceBag = {};
  for (const [k, v] of bagEntries(a)) out[k] = round ? Math.ceil(v * s) : v * s;
  return out;
}
export function bagIsEmpty(a: ResourceBag | undefined): boolean {
  return bagEntries(a).length === 0;
}
export function bagSum(a: ResourceBag | undefined): number {
  return bagEntries(a).reduce((s, [, v]) => s + v, 0);
}
/** True if `have` contains at least `need` of every resource. */
export function bagCovers(have: Record<string, number>, need: ResourceBag | undefined): boolean {
  for (const [k, v] of bagEntries(need)) if ((have[k] ?? 0) < v - 1e-9) return false;
  return true;
}
/** What is still missing from `have` to pay `need`. */
export function bagMissing(have: Record<string, number>, need: ResourceBag | undefined): ResourceBag {
  const out: ResourceBag = {};
  for (const [k, v] of bagEntries(need)) {
    const miss = v - (have[k] ?? 0);
    if (miss > 1e-9) out[k] = miss;
  }
  return out;
}
