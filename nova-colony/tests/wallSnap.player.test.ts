import { describe, expect, it } from 'vitest';
import { cellCenter, cellMin } from '../src/core/constants';
import { makeGame } from './world.helpers';

/**
 * A wall on a floor's edge is drawn moved out to the edge (build/wallSnap): the player walks up to the panel where it is
 * drawn instead of stopping a tile short of it, and still cannot pass through.
 */
describe('walls on floors: the player meets the panel where it is drawn', () => {
  it('walks right up to a straight edge wall from inside a floored room, and no further', () => {
    const { game, step } = makeGame();
    const B = game.sys.buildings;
    const core = B.core()!;
    const fits = (x0: number, z0: number) => {
      for (let z = z0 - 1; z <= z0 + 5; z++) for (let x = x0 - 1; x <= x0 + 5; x++) if (!B.canPlace('floor', x, z, 0).ok) return false;
      return true;
    };
    let ox = -1;
    let oz = -1;
    for (let r = 6; r < 30 && ox < 0; r++) {
      for (let a = 0; a < 24; a++) {
        const x = core.x + Math.round(Math.cos((a / 24) * Math.PI * 2) * r);
        const z = core.z + Math.round(Math.sin((a / 24) * Math.PI * 2) * r);
        if (fits(x, z)) {
          ox = x;
          oz = z;
          break;
        }
      }
    }
    expect(ox).toBeGreaterThan(0);
    // a 5×5 floor, walls on its border tiles
    for (let z = oz; z < oz + 5; z++) for (let x = ox; x < ox + 5; x++) B.place('floor', x, z, 0, { free: true, instant: true, quiet: true });
    for (let z = oz; z < oz + 5; z++) {
      for (let x = ox; x < ox + 5; x++) {
        if (x === ox || x === ox + 4 || z === oz || z === oz + 4) B.place('wall', x, z, 0, { free: true, instant: true, quiet: true });
      }
    }
    B.flush();
    // the east wall's middle cell: only the band at its outer edge is solid
    const box = B.playerBox(ox + 4, oz + 2, [0, 0, 0, 0]);
    expect(box[0]).toBeCloseTo(cellCenter(ox + 4) + 0.7 - 0.4, 5);
    expect(box[2]).toBeCloseTo(cellCenter(ox + 4) + 0.7 + 0.4, 5);
    // a corner keeps its whole cell
    expect(B.playerBox(ox + 4, oz + 4, [0, 0, 0, 0])).toEqual([cellMin(ox + 4), cellMin(oz + 4), cellMin(ox + 4) + 2, cellMin(oz + 4) + 2]);

    const p = game.state.player;
    game.sys.player.teleport(cellCenter(ox + 2), cellCenter(oz + 2));
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    step(4);
    // stopped against the drawn panel: past the old stop (a radius before the wall cell), short of the panel itself
    expect(p.x).toBeGreaterThan(cellMin(ox + 4) + 0.5);
    expect(p.x).toBeLessThanOrEqual(box[0] + 1e-6);
    // pushing hard at big time steps never gets through, and the player is not popped out as "stuck"
    for (let i = 0; i < 60; i++) game.update(0.25);
    expect(p.x).toBeLessThanOrEqual(box[0] + 1e-6);
    expect(p.x).toBeGreaterThan(cellMin(ox + 4) + 0.5);
  });
});
