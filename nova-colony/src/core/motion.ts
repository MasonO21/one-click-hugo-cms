/**
 * Reduced motion: the player's Settings toggle, or the phone's own accessibility preference
 * (`prefers-reduced-motion`). When on, camera shake stops and big UI flourishes calm down.
 */
let osReduce: boolean | null = null;

export function reducedMotion(settings: { reduceMotion?: boolean }): boolean {
  if (settings.reduceMotion) return true;
  if (osReduce === null) {
    try {
      osReduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      osReduce = false;
    }
  }
  return osReduce;
}

/** Tests: forget the cached OS preference. */
export function resetMotionCache(): void {
  osReduce = null;
}
