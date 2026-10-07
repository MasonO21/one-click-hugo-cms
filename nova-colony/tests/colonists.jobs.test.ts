import { describe, expect, it } from 'vitest';
import { addBuilding, addColonist, makeGame, removeBuilding } from './colonists.util';

describe('job assignment', () => {
  it('auto-assigns on add and keeps BuildingInstance.workers in sync', () => {
    const { game } = makeGame();
    const camp = addBuilding(game, 'logging_camp', 130, 130); // 2 gatherer slots, required
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(a.workplace).toBe(camp.id);
    expect(camp.workers).toEqual([a.id]);
    const b = addColonist(game, 'common', { specialty: 'gatherer' });
    const c = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(camp.workers).toEqual([a.id, b.id]);
    expect(c.workplace).toBeNull();
    expect(camp.workers.length).toBeLessThanOrEqual(2);
  });

  it('fills required buildings before optional ones (even by pulling someone off an optional job)', () => {
    const { game } = makeGame();
    const farm = addBuilding(game, 'berry_patch', 130, 130); // optional, farmer
    const f = addColonist(game, 'common', { specialty: 'farmer' });
    expect(f.workplace).toBe(farm.id);
    const camp = addBuilding(game, 'logging_camp', 136, 130); // required, gatherer
    expect(game.sys.colonists.autoAssign()).toBeGreaterThan(0);
    expect(f.workplace).toBe(camp.id);
    expect(farm.workers).toEqual([]);
  });

  it('prefers specialty matches over raw skill', () => {
    const { game } = makeGame();
    const camp = addBuilding(game, 'logging_camp', 130, 130); // 2 slots
    const farmer = addColonist(game, 'epic', { specialty: 'farmer', skill: 4 });
    const g1 = addColonist(game, 'common', { specialty: 'gatherer', skill: 1 });
    const g2 = addColonist(game, 'common', { specialty: 'gatherer', skill: 2 });
    game.sys.colonists.autoAssign();
    expect(new Set(camp.workers)).toEqual(new Set([g1.id, g2.id]));
    expect(farmer.workplace).toBeNull();
  });

  it('prefers higher skill when no specialty matches', () => {
    const { game } = makeGame();
    addColonist(game, 'common', { specialty: 'cook', skill: 1 });
    const best = addColonist(game, 'epic', { specialty: 'doctor', skill: 4 });
    const mid = addColonist(game, 'rare', { specialty: 'guard', skill: 2 });
    const quarry = addBuilding(game, 'quarry', 130, 130); // miner, 2 slots
    game.sys.colonists.autoAssign();
    expect(new Set(quarry.workers)).toEqual(new Set([best.id, mid.id]));
  });

  it('incumbents are only displaced by a clearly better worker (two stars or more)', () => {
    const { game } = makeGame();
    const quarry = addBuilding(game, 'quarry', 130, 130);
    const a = addColonist(game, 'common', { specialty: 'cook', skill: 1 });
    const b = addColonist(game, 'common', { specialty: 'cook', skill: 1 });
    expect(new Set(quarry.workers)).toEqual(new Set([a.id, b.id]));
    const slightlyBetter = addColonist(game, 'rare', { specialty: 'cook', skill: 2 });
    expect(slightlyBetter.workplace).toBeNull();
    const muchBetter = addColonist(game, 'epic', { specialty: 'cook', skill: 3 });
    expect(muchBetter.workplace).toBe(quarry.id);
    expect(quarry.workers).toHaveLength(2);
  });

  it('does not flip-flop: repeated auto-assign changes nothing', () => {
    const { game } = makeGame();
    addBuilding(game, 'logging_camp', 130, 130);
    addBuilding(game, 'quarry', 134, 130);
    addBuilding(game, 'berry_patch', 138, 130);
    for (let i = 0; i < 6; i++) addColonist(game, 'common');
    const events: number[] = [];
    game.bus.on('colonist:assigned', (e) => events.push(e.id));
    for (let i = 0; i < 5; i++) expect(game.sys.colonists.autoAssign()).toBe(0);
    expect(events).toEqual([]);
  });

  it('manual assignment is respected and locked against auto-assign', () => {
    const { game } = makeGame();
    const camp = addBuilding(game, 'logging_camp', 130, 130); // required
    const desk = addBuilding(game, 'research_desk', 134, 130); // optional scientist, 1 slot
    const cs = game.sys.colonists;
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    const b = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(cs.assign(a.id, desk.id)).toBe(true);
    expect(a.workplace).toBe(desk.id);
    expect(a.manual).toBe(true);
    cs.autoAssign();
    expect(a.workplace).toBe(desk.id); // the empty camp slot does not steal a manual colonist
    expect(b.workplace).toBe(camp.id);
    expect(desk.workers).toEqual([a.id]);

    // a deliberately idle colonist stays idle
    expect(cs.assign(a.id, null)).toBe(true);
    expect(a.workplace).toBeNull();
    cs.autoAssign();
    expect(a.workplace).toBeNull();
    expect(desk.workers).toEqual([]);

    // handing control back lets automation pick them up again
    cs.releaseManual(a.id);
    expect(a.manual).toBe(false);
    expect(a.workplace).not.toBeNull();
  });

  it('validates slots: full of manual workers refuses; otherwise bumps an auto worker', () => {
    const { game } = makeGame();
    const desk = addBuilding(game, 'research_desk', 130, 130); // 1 slot
    const cs = game.sys.colonists;
    const a = addColonist(game, 'common', { specialty: 'scientist' });
    const b = addColonist(game, 'common', { specialty: 'scientist' });
    expect(a.workplace).toBe(desk.id); // auto worker
    expect(b.workplace).toBeNull();
    // b takes the slot from the auto worker
    expect(cs.assign(b.id, desk.id)).toBe(true);
    expect(desk.workers).toEqual([b.id]);
    expect(a.workplace).toBeNull();
    // now the slot holds a manual worker: nobody can bump them
    let warned = false;
    game.bus.on('ui:toast', (e) => (warned ||= e.kind === 'warning'));
    expect(cs.assign(a.id, desk.id)).toBe(false);
    expect(warned).toBe(true);
    expect(desk.workers).toEqual([b.id]);
    // not a job building / unknown building
    expect(cs.assign(a.id, 9999)).toBe(false);
    expect(cs.assign(12345, desk.id)).toBe(false);
  });

  it('emits colonist:assigned with the new workplace', () => {
    const { game } = makeGame();
    const events: { id: number; workplace: number | null }[] = [];
    game.bus.on('colonist:assigned', (e) => events.push(e));
    const camp = addBuilding(game, 'logging_camp', 130, 130);
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(events).toContainEqual({ id: a.id, workplace: camp.id });
    game.sys.colonists.assign(a.id, null);
    expect(events).toContainEqual({ id: a.id, workplace: null });
  });

  it('building removal cleans up workplaces and re-employs elsewhere', () => {
    const { game, run } = makeGame();
    const campA = addBuilding(game, 'logging_camp', 130, 130);
    const campB = addBuilding(game, 'logging_camp', 136, 130);
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(a.workplace).toBe(campA.id);
    game.sys.colonists.assign(a.id, campA.id);
    expect(a.manual).toBe(true);
    removeBuilding(game, campA);
    expect(a.workplace).toBeNull(); // immediate
    expect(a.manual).toBe(false); // lock released: the building is gone
    run(0.2);
    expect(a.workplace).toBe(campB.id);
    expect(campB.workers).toEqual([a.id]);
    removeBuilding(game, campB);
    run(0.2);
    expect(a.workplace).toBeNull();
  });

  it('switching a workplace off or leaving it under construction releases its workers', () => {
    const { game } = makeGame();
    const camp = addBuilding(game, 'logging_camp', 130, 130);
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(a.workplace).toBe(camp.id);
    camp.status = 'off';
    game.sys.colonists.autoAssign();
    expect(a.workplace).toBeNull();
    expect(camp.workers).toEqual([]);
    camp.status = 'active';
    game.sys.colonists.autoAssign();
    expect(a.workplace).toBe(camp.id);
  });

  it('periodically re-checks assignments while the game runs', () => {
    const { game, run } = makeGame();
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    expect(a.workplace).toBeNull();
    const camp = addBuilding(game, 'logging_camp', 130, 130);
    run(3);
    expect(a.workplace).toBe(camp.id);
  });

  it('openSlots / workersOf / jobOf reflect the assignment', () => {
    const { game } = makeGame();
    const camp = addBuilding(game, 'logging_camp', 130, 130);
    const a = addColonist(game, 'common', { specialty: 'gatherer' });
    const cs = game.sys.colonists;
    expect(cs.openSlots(camp.id)).toBe(1);
    expect(cs.workersOf(camp.id)).toEqual([a]);
    expect(cs.jobOf(a)).toBe('gatherer');
    cs.assign(a.id, null);
    expect(cs.jobOf(a)).toBeNull();
    expect(cs.openSlots(camp.id)).toBe(2);
  });
});
