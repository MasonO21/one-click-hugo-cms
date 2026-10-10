/**
 * Recruitment board pacing (docs/SPEC.md §6-7): the board holds a few survivors; recruiting one leaves the seat
 * empty, and a new survivor answers the radio every `balance.recruitArrivalMinutes[tier]` minutes on an absolute
 * clock (time away counts) until the board is full again. The board starts full, so the first recruits of the guided
 * session never wait. The interval grows with the colony tier, so the colony grows with the four-week journey
 * (about 10 colonists at Stone, 20-25 at Steel, 30-35 at Alloy, 40 at Nano, ~50 around Titanium) instead of filling
 * every bed the moment it is built. Rescues, expeditions, crates, surveys and rewards still bring people in on top.
 *
 * Pure helpers over plain state; ColonistSystem owns the clock.
 */
import type { Game } from '../../core/Game';

declare module '../../data/schema' {
  interface BalanceDef {
    /**
     * Minutes between survivors arriving at the recruitment board while a seat is free, by colony tier (absolute
     * clock). Missing = the board refills the moment someone is recruited (the old behaviour).
     */
    recruitArrivalMinutes?: number[];
  }
}

/** Seconds between arrivals at the colony's tier (0 = instant refill). */
export function arrivalSeconds(game: Game): number {
  const table = game.data.balance.recruitArrivalMinutes;
  if (!table || !table.length) return 0;
  const t = Math.max(0, Math.min(table.length - 1, game.state.colony.tier));
  return Math.max(0, (table[t] ?? 0) * 60);
}

/**
 * Seats on the board: `balance.recruitCandidates`, plus one per 'recruitSlots' research (the modifier is
 * `1 + Σadd`, and every +1 in the tree reads "one more candidate").
 */
export function boardSeats(game: Game): number {
  const extra = Math.max(0, Math.round(game.sys.economy.modifier('recruitSlots') - 1));
  return Math.max(1, game.data.balance.recruitCandidates + extra);
}

/** How many survivors arrive by `now` (ms) given the next arrival time and the free seats, and when the next one is due. */
export function arrivalsDue(nextAt: number, now: number, intervalMs: number, free: number): { n: number; nextAt: number } {
  if (free <= 0) return { n: 0, nextAt };
  if (intervalMs <= 0) return { n: free, nextAt: now };
  let n = 0;
  let at = nextAt;
  while (n < free && now >= at) {
    n++;
    at += intervalMs;
  }
  return { n, nextAt: at };
}
