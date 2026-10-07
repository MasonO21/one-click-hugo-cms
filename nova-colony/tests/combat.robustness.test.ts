import { describe, expect, it } from 'vitest';
import { addBuilding, makeGame, testData } from './combat.helpers';
import { defaultData } from '../src/data';
import { TUNE } from '../src/sim/combat/types';

describe('combat robustness', () => {
  it('mixed late-game waves against a walled base always resolve cleanly', () => {
    const base = defaultData();
    const data = testData({
      invasions: [
        {
          tier: 0,
          groups: [
            { alien: 'crawler', count: 14, delay: 0 },
            { alien: 'spitter', count: 5, delay: 4 },
            { alien: 't_brute', count: 3, delay: 8 },
            { alien: 't_flyer', count: 4, delay: 10 },
            { alien: 't_burrower', count: 4, delay: 12 },
            { alien: 't_queen', count: 1, delay: 14 },
          ],
          reward: base.invasions[0].reward,
        },
      ],
    });
    for (const seed of [11, 22, 33, 44]) {
      const t = makeGame({ seed, data, armed: true });
      const { game, step } = t;
      game.state.player.x = 6;
      game.state.player.z = 6;
      // a walled compound with a gate gap, turrets inside, traps outside, a shield and some buildings
      for (let i = 120; i <= 136; i++) {
        addBuilding(game, 'wall', i, 120);
        if (i !== 128) addBuilding(game, 'wall', i, 136);
        addBuilding(game, 'wall', 120, i);
        addBuilding(game, 'wall', 136, i);
      }
      for (const [x, z] of [[124, 124], [132, 124], [124, 132], [132, 132]]) addBuilding(game, 'scrap_turret', x, z, { level: 4 });
      addBuilding(game, 't_aa', 128, 124);
      addBuilding(game, 't_cannon', 126, 133);
      addBuilding(game, 't_drone', 131, 128);
      addBuilding(game, 't_shield', 128, 131);
      addBuilding(game, 'shelter', 122, 127);
      for (let x = 125; x <= 131; x += 2) addBuilding(game, 'spike_trap', x, 138);

      game.sys.combat.schedule(0, 0);
      let maxAliens = 0;
      let bad = false;
      const dur = step(TUNE.ATTACK_TIMEOUT + 60, () => {
        const c = game.state.combat;
        maxAliens = Math.max(maxAliens, c.aliens.length);
        for (const a of c.aliens) if (!Number.isFinite(a.x) || !Number.isFinite(a.z) || !Number.isFinite(a.y)) bad = true;
        for (const p of c.projectiles) if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) bad = true;
        return c.phase === 'victory';
      });
      expect(bad).toBe(false);
      expect(game.state.combat.phase).toBe('victory');
      expect(dur).toBeLessThan(TUNE.ATTACK_TIMEOUT + 30);
      expect(maxAliens).toBeLessThanOrEqual(TUNE.MAX_ALIENS);
      expect(game.state.buildings.list.length).toBeGreaterThan(60); // nothing is ever removed
      // everything gets cleaned up after the celebration
      step(TUNE.VICTORY_LINGER + TUNE.RETREAT_TIME + 1);
      expect(game.state.combat.aliens.filter((a) => !a.wild)).toHaveLength(0);
      expect(game.state.combat.phase).toBe('peace');
    }
  });
});
