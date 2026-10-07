/**
 * Keeps the main loop alive: one step of the frame that throws (a sim system, the renderer, the UI, audio) is logged
 * once per label and skipped for that frame, instead of unwinding the requestAnimationFrame callback and freezing
 * the whole game for good.
 */
const failures = new Map<string, number>();

/** Record a failed loop step; logs the first failure of each label (later ones are only counted). */
export function reportLoopError(label: string, e: unknown): void {
  const n = failures.get(label) ?? 0;
  failures.set(label, n + 1);
  if (n === 0) console.error(`[loop] ${label} failed (later failures of this step are counted, not logged)`, e);
}

/** Run one step of the frame; true when it completed without throwing. */
export function guarded(label: string, fn: () => void): boolean {
  try {
    fn();
    return true;
  } catch (e) {
    reportLoopError(label, e);
    return false;
  }
}

/** How many times each step has failed since boot (debugging, tests). */
export function loopFailures(): ReadonlyMap<string, number> {
  return failures;
}

/** Forget recorded failures (tests). */
export function resetLoopFailures(): void {
  failures.clear();
}
