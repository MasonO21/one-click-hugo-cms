/**
 * ResearchSystem — research points bank + instant unlocks ("easy to understand": spend RP to unlock).
 * RP come from research buildings (rate in derived.research.perMin), scientists, ruins, rewards.
 *
 * OWNER: economy agent. Writes state.research.
 */
import { System } from './System';
import type { ResearchDef } from '../data/schema';

export type ResearchStatus = 'done' | 'available' | 'locked_prereq' | 'locked_tier';

export class ResearchSystem extends System {
  isDone(id: string): boolean {
    return this.game.state.research.completed.includes(id);
  }

  status(_id: string): ResearchStatus {
    return 'locked_tier';
  }

  /** All research whose prerequisites are met and is not done. */
  available(): ResearchDef[] {
    return [];
  }

  canResearch(_id: string): boolean {
    return false;
  }

  /** Spend RP (+resources) and complete instantly. */
  research(_id: string): boolean {
    return false;
  }

  addPoints(n: number): void {
    this.game.state.research.points += n;
    this.game.bus.emit('research:points', { amount: n });
  }
}
