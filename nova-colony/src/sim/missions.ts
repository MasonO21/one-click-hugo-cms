/**
 * MissionSystem — main story chain (drives the first 15 minutes), side missions, daily missions.
 * Listens to bus events and maintains lifetime counters "<type>:<target>". Claiming grants rewards
 * and activates `next` missions; `onComplete` scripted triggers (first attack, survivor spawn).
 *
 * OWNER: meta agent. Writes state.missions.
 */
import { System } from './System';
import type { MissionDef } from '../data/schema';

export class MissionSystem extends System {
  active(): MissionDef[] {
    return [];
  }

  progress(_id: string): { value: number; target: number; done: boolean } {
    return { value: 0, target: 1, done: false };
  }

  claim(_id: string): boolean {
    return false;
  }

  /** The main-chain mission currently guiding the player (tutorial hint/arrow). */
  current(): MissionDef | null {
    return null;
  }
}
