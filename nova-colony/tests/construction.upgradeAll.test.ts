import { describe, expect, it } from 'vitest';
import { C, count, makeGame } from './construction.helpers';
import { upgradeAll, upgradeAllPlan } from '../src/sim/build/upgradeAll';
import { plural } from '../src/sim/meta/words';

describe('construction: upgrade all of a kind', () => {
  it('levels every crate one step, lowest level first, through the normal level-up', () => {
    const { game, b, events } = makeGame({ resources: { wood: 1000 } });
    const ids = [0, 1, 2].map((i) => b.place('storage_crate', C + 3 + i * 2, C + 4, 0, { instant: true })!);
    b.levelUp(ids[0]); // one is ahead: level 2
    const before = game.state.resources.amounts.wood;
    const plan = upgradeAllPlan(game, 'storage_crate');
    expect(plan.ids).toEqual([ids[1], ids[2], ids[0]]);
    expect(plan.affordable).toEqual(plan.ids);
    expect(plan.total.wood).toBe(27 + 27 + 49);
    const ups = count(events, 'building:upgraded');
    expect(upgradeAll(game, 'storage_crate')).toBe(3);
    expect(ids.map((id) => b.get(id)!.level)).toEqual([3, 2, 2]);
    expect(game.state.resources.amounts.wood).toBe(before - 103);
    expect(count(events, 'building:upgraded') - ups).toBe(3); // missions and achievements see three upgrades
  });

  it('with too few resources it upgrades what it can (lowest first) and leaves the rest', () => {
    const { game, b } = makeGame({ resources: { wood: 1000 } });
    const ids = [0, 1, 2].map((i) => b.place('storage_crate', C + 3 + i * 2, C + 4, 0, { instant: true })!);
    game.state.resources.amounts.wood = 60;
    const plan = upgradeAllPlan(game, 'storage_crate');
    expect(plan.affordable).toHaveLength(2);
    expect(plan.affordableTotal.wood).toBe(54);
    expect(upgradeAll(game, 'storage_crate')).toBe(2);
    expect(ids.map((id) => b.get(id)!.level).sort()).toEqual([1, 2, 2]);
    expect(game.state.resources.amounts.wood).toBe(6);
    game.state.resources.amounts.wood = 0;
    expect(upgradeAll(game, 'storage_crate')).toBe(0);
  });

  it('skips buildings under construction or at max level; pieces and the core have no plan', () => {
    const { game, b } = makeGame({ resources: { wood: 5000 } });
    const done = b.place('storage_crate', C + 3, C + 4, 0, { instant: true })!;
    b.place('storage_crate', C + 6, C + 4, 0); // still going up
    while (b.levelUpCost(done)) b.levelUp(done);
    expect(upgradeAllPlan(game, 'storage_crate').ids).toEqual([]);
    expect(upgradeAllPlan(game, 'wall').ids).toEqual([]);
    expect(upgradeAllPlan(game, 'command_center').ids).toEqual([]);
  });

  it('names read as plurals', () => {
    expect(plural('Logging Camp')).toBe('Logging Camps');
    expect(plural('Heavy Sentry')).toBe('Heavy Sentries');
    expect(plural('Fabricator Bench')).toBe('Fabricator Benches');
    expect(plural('Hydroponics Bay')).toBe('Hydroponics Bays');
  });
});
