/**
 * Research Mastery rules (pure): level costs, the bonus a level count is worth, and the modifier adds the
 * ModifierTable applies. Content in data/mastery.ts; ResearchSystem spends the points (sim/research.ts).
 */
import { MASTERY_GROWTH, MASTERY_LINES, MASTERY_SOFT_CAP, MASTERY_SOFT_FACTOR, type MasteryLine } from '../data/mastery';

export type { MasteryLine } from '../data/mastery';

export function masteryLine(id: string): MasteryLine | undefined {
  return MASTERY_LINES.find((l) => l.id === id);
}

/** RP cost of reaching `level` (1 = the first level). */
export function masteryCost(line: MasteryLine, level: number): number {
  const n = Math.max(1, Math.floor(level));
  return Math.round(line.base * MASTERY_GROWTH ** (n - 1));
}

/** Levels' worth of bonus: full up to the soft cap, half per level after it. */
export function effectiveLevels(level: number): number {
  const n = Math.max(0, Math.floor(level) || 0);
  return Math.min(n, MASTERY_SOFT_CAP) + Math.max(0, n - MASTERY_SOFT_CAP) * MASTERY_SOFT_FACTOR;
}

/** Total modifier add at `level` (0.21 = +21%). */
export function masteryBonus(line: MasteryLine, level: number): number {
  return line.per * effectiveLevels(level);
}

/** What the next level adds on top (+3%, or +1.5% past the soft cap). */
export function nextBonus(line: MasteryLine, level: number): number {
  return masteryBonus(line, level + 1) - masteryBonus(line, level);
}

/** Read a saved level defensively (old saves have no entry; junk reads as 0). */
export function levelOf(mastery: Record<string, number> | undefined, id: string): number {
  const v = mastery?.[id];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Calls `add(stat, value)` for every line with levels (ModifierTable.rebuild). */
export function forEachMasteryAdd(mastery: Record<string, number> | undefined, add: (stat: string, v: number) => void): void {
  if (!mastery) return;
  for (const line of MASTERY_LINES) {
    const lv = levelOf(mastery, line.id);
    if (lv > 0) add(line.stat, masteryBonus(line, lv));
  }
}

/** Sum of all mastery levels (missions, stats). */
export function totalMasteryLevels(mastery: Record<string, number> | undefined): number {
  let n = 0;
  for (const line of MASTERY_LINES) n += levelOf(mastery, line.id);
  return n;
}

/** "+21%" (one decimal under 10% past the soft cap: "+1.5%"). */
export function pct(v: number): string {
  const p = v * 100;
  const r = Math.abs(p - Math.round(p)) < 0.05 ? String(Math.round(p)) : p.toFixed(1);
  return `+${r}%`;
}
