import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { createDataRegistry } from '../src/data';

describe('smoke', () => {
  it('boots a fresh game and simulates a few minutes without throwing', () => {
    let now = 1_700_000_000_000;
    const game = new Game({ seed: 1234, services: createMockServices(), clock: () => now });
    game.start();
    for (let i = 0; i < 60 * 30; i++) {
      now += 100;
      game.update(0.1);
    }
    expect(game.state.playTime).toBeGreaterThan(170);
  });

  it('data registry indexes content and anchor ids exist', () => {
    const data = createDataRegistry();
    expect(data.building('command_center')?.core).toBe(true);
    for (const id of ['wood', 'stone', 'fiber', 'food', 'water']) expect(data.resource(id)).toBeTruthy();
    expect(data.tiers).toHaveLength(7);
    expect(data.biome('crash_valley')).toBeTruthy();
    expect(data.mission(data.firstMission)).toBeTruthy();
  });
});
