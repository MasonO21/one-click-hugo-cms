import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';

function setup() {
  let now = Date.UTC(2026, 9, 7, 12);
  const game = new Game({ seed: 5, services: createMockServices(), clock: () => now });
  game.start();
  const toasts: string[] = [];
  game.bus.on('ui:toast', (e) => toasts.push(e.text));
  const flyer = game.data.aliens.find((a) => a.flying)!;
  const spawnFlyer = (id: number) => {
    game.state.combat.aliens.push({ id, def: flyer.id } as never);
    game.bus.emit('alien:spawned', { id, def: flyer.id, x: 0, z: 0 });
  };
  return { game, toasts, spawnFlyer, tick: () => (now += 1000) };
}

describe('combat hints', () => {
  it('tells the player to build anti-air once per wave when flyers attack an undefended colony', () => {
    const { game, toasts, spawnFlyer } = setup();
    game.state.combat.phase = 'attack';
    spawnFlyer(9001);
    spawnFlyer(9002);
    const hints = toasts.filter((t) => t.includes('Flyers incoming'));
    expect(hints).toHaveLength(1);
    game.state.combat.wave++;
    spawnFlyer(9003);
    expect(toasts.filter((t) => t.includes('Flyers incoming'))).toHaveLength(2);
  });

  it('stays quiet when an anti-air defense is working', () => {
    const { game, toasts, spawnFlyer } = setup();
    const aa = game.data.buildings.find((d) => d.turret?.antiAir)!;
    game.state.buildings.list.push({ id: 777, def: aa.id, x: 140, z: 140, rot: 0, level: 1, tier: 0, hp: 100, maxHp: 100, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 });
    game.state.combat.phase = 'attack';
    spawnFlyer(9001);
    expect(toasts.some((t) => t.includes('Flyers incoming'))).toBe(false);
  });
});
