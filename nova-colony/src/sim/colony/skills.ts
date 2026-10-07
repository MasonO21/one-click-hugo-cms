/**
 * Skills: working earns xp; xp is a 0..1 fraction of the current level. Max skill is 5.
 */
import type { Game } from '../../core/Game';
import type { Colonist } from '../../core/state';

export const MAX_SKILL = 5;

/** Seconds of work needed to go from skill N to N+1 (cozy: the first star comes within a couple of minutes). */
const SECONDS_PER_LEVEL: Record<number, number> = { 1: 150, 2: 300, 3: 600, 4: 1200 };

/** Seconds of work still needed for the next skill level (Infinity at max skill). */
export function secondsToNextSkill(c: Colonist): number {
  if (c.skill >= MAX_SKILL) return Infinity;
  const per = SECONDS_PER_LEVEL[c.skill] ?? 1200;
  return per * (1 - c.xp);
}

/** Add `seconds` of work experience; emits skillUp + float text on level-up. */
export function gainWorkXp(game: Game, c: Colonist, seconds: number): void {
  if (c.skill >= MAX_SKILL) {
    c.xp = 1;
    return;
  }
  c.xp += seconds / (SECONDS_PER_LEVEL[c.skill] ?? 1200);
  while (c.xp >= 1 && c.skill < MAX_SKILL) {
    c.xp -= 1;
    c.skill++;
    game.bus.emit('colonist:skillUp', { id: c.id, skill: c.skill });
    game.bus.emit('ui:float', { text: `${c.name.split(' ')[0]} skill ${'★'.repeat(c.skill)}`, x: c.x, z: c.z, color: '#ffd84a', big: true });
    game.bus.emit('sfx', { id: 'level_up', x: c.x, z: c.z, volume: 0.6 });
  }
  if (c.skill >= MAX_SKILL) c.xp = 1;
}
