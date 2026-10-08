/**
 * Shared types for the colonist subsystem. Persistent extensions of core state are declared here via
 * declaration merging (no edits to src/core/state.ts).
 */
declare module '../../core/state' {
  interface Colonist {
    /**
     * True when the player manually assigned (or manually un-assigned) this colonist. Auto-assign never
     * moves a manual colonist; `releaseManual()` hands them back to the automation.
     *
     * NOTE: `xp` is stored as a 0..1 fraction of the current skill level (1 at max skill) so any UI can
     * render a progress bar without knowing the level thresholds.
     */
    manual?: boolean;
    /**
     * Out on an expedition (sim/expeditions.ts owns this flag): no job, no meals, no bed time and no AI; hidden in
     * the world. They keep their bed, and their old job is offered back to them when they return.
     */
    away?: boolean;
    /** Mood from the last trip ("Great adventure!" / "Travel-weary"), until epoch ms `until`. */
    trip?: { mood: number; until: number };
  }
  interface ColonistState {
    /** Number of candidate slots last generated for the recruitment board (detects 'recruitSlots' growth). */
    slots?: number;
  }
}

declare module '../../core/events' {
  interface GameEvents {
    /**
     * A colonist swung a tool at a resource node near the player (chopping, mining...). Purely presentational:
     * render can bounce the node / spawn chips and audio can play the matching gather sound. It deliberately
     * is NOT `gather:hit`, which also awards season XP and mission progress (colonists' output is the
     * economy's job). Throttled to ~1 per colonist per second and only emitted close to the player.
     */
    'colonist:workHit': { id: number; node: number; model: string; x: number; z: number };
  }
}

export interface HappinessFactor {
  label: string;
  value: number;
  ok: boolean;
}

export {};
