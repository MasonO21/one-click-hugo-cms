import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/core/constants';
import { addBuilding, addColonist, addCore, makeGame, removeBuilding } from './colonists.util';

describe('housing', () => {
  it('beds = sum of housing x level effect of active buildings', () => {
    const { game } = makeGame();
    const cs = game.sys.colonists;
    expect(cs.freeBeds()).toBe(0);
    const s = addBuilding(game, 'shelter', 130, 130); // housing 2, levelEffect 0.5
    cs.refresh();
    expect(game.derived.housing.beds).toBe(2);
    s.level = 2; // 2 x 1.5
    cs.refresh();
    expect(game.derived.housing.beds).toBe(3);
    s.level = 3; // 2 x 2
    cs.refresh();
    expect(game.derived.housing.beds).toBe(4);
    addBuilding(game, 'big_bunk', 140, 130); // 6 beds
    addCore(game); // the pod: 1 bed
    cs.refresh();
    expect(game.derived.housing.beds).toBe(11);
  });

  it('ignores buildings that are under construction or switched off', () => {
    const { game } = makeGame();
    addBuilding(game, 'shelter', 130, 130, { status: 'building' });
    addBuilding(game, 'shelter', 134, 130, { status: 'off' });
    game.sys.colonists.refresh();
    expect(game.derived.housing.beds).toBe(0);
    addBuilding(game, 'shelter', 138, 130, { status: 'damaged' }); // damaged still shelters (cozy)
    game.sys.colonists.refresh();
    expect(game.derived.housing.beds).toBe(2);
  });

  it('assigns bed ids and never overfills a building', () => {
    const { game } = makeGame();
    const a = addBuilding(game, 'shelter', 130, 130);
    const cs = game.sys.colonists;
    const c1 = addColonist(game);
    const c2 = addColonist(game);
    const c3 = addColonist(game);
    expect([c1.bed, c2.bed]).toEqual([a.id, a.id]);
    expect(c3.bed).toBeNull();
    expect(game.derived.housing).toEqual({ beds: 2, used: 2 });
    expect(cs.freeBeds()).toBe(0);

    const b = addBuilding(game, 'shelter', 134, 130);
    cs.refresh();
    expect(c3.bed).toBe(b.id);
    expect(game.derived.housing).toEqual({ beds: 4, used: 3 });
    expect(cs.freeBeds()).toBe(1);
  });

  it('keeps existing beds stable when more homes appear', () => {
    const { game } = makeGame();
    const a = addBuilding(game, 'shelter', 130, 130);
    const c = addColonist(game);
    addBuilding(game, 'shelter', 126, 130);
    game.sys.colonists.refresh();
    expect(c.bed).toBe(a.id);
  });

  it('prefers beds inside roofed rooms, and moves sleepers into new ones', () => {
    const { game } = makeGame();
    const open = addBuilding(game, 'shelter', 130, 130);
    const c = addColonist(game);
    expect(c.bed).toBe(open.id);
    const roofed = addBuilding(game, 'shelter', 150, 150);
    game.derived.roofCells.add(cellIndex(150, 150));
    game.sys.colonists.refresh();
    expect(c.bed).toBe(roofed.id);
    // a newcomer fills the remaining beds
    const d = addColonist(game);
    expect([c.bed, d.bed]).toEqual([roofed.id, roofed.id]);
  });

  it('removing a home clears beds and re-homes colonists elsewhere', () => {
    const { game, run } = makeGame();
    const a = addBuilding(game, 'shelter', 130, 130);
    const b = addBuilding(game, 'shelter', 134, 130);
    const c = addColonist(game);
    expect(c.bed).toBe(a.id);
    removeBuilding(game, a);
    expect(c.bed).toBeNull(); // immediate cleanup
    run(0.2);
    expect(c.bed).toBe(b.id);
    removeBuilding(game, b);
    run(0.2);
    expect(c.bed).toBeNull();
    expect(game.derived.housing).toEqual({ beds: 0, used: 0 });
  });
});
