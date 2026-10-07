/**
 * TutorialSystem — first-session guidance layered on the main mission chain: contextual hints,
 * guide-arrow targets (resolved to world positions / UI selectors), one-time popups,
 * and pacing safeguards (e.g. grant missing resources so nobody gets stuck).
 *
 * OWNER: meta agent. Writes state.tutorial.
 */
import { System } from './System';

export interface GuideTarget {
  text: string;
  /** World position to point at (arrow in 3D) — or null. */
  world: { x: number; z: number } | null;
  /** CSS selector of a UI element to highlight — or null. */
  ui: string | null;
}

export class TutorialSystem extends System {
  guide(): GuideTarget | null {
    return null;
  }
}
