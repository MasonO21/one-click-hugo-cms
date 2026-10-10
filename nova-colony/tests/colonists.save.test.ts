import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createDataRegistry, defaultData } from '../src/data';
import { deserializeState, serializeState } from '../src/core/state';
import { TEST_BUILDINGS, addBuilding, addColonist, addCore, makeGame } from './colonists.util';

describe('persistence & events', () => {
  it('colonists, manual locks and the candidate board survive a save/load round trip', () => {
    const h = makeGame();
    addCore(h.game);
    const camp = addBuilding(h.game, 'logging_camp', 140, 127);
    const desk = addBuilding(h.game, 'research_desk', 150, 127);
    addBuilding(h.game, 'shelter', 131, 131);
    const a = addColonist(h.game, 'rare', { specialty: 'gatherer', skill: 3 });
    const b = addColonist(h.game, 'common', { specialty: 'scientist' });
    h.game.sys.colonists.assign(b.id, camp.id);
    h.run(30);
    a.xp = 0.4;
    const board = h.game.state.colonists.candidates.map((k) => k.colonist.name);
    const json = serializeState(h.game.state);

    const d = defaultData();
    const data = createDataRegistry({ ...d, buildings: [...d.buildings, ...TEST_BUILDINGS] });
    const loaded = new Game({ state: deserializeState(json), clock: () => h.clock.now, data });
    loaded.start();
    const cs = loaded.sys.colonists;
    expect(cs.all()).toHaveLength(2);
    const a2 = cs.get(a.id)!;
    const b2 = cs.get(b.id)!;
    expect(a2.name).toBe(a.name);
    expect(a2.skill).toBe(3);
    expect(a2.xp).toBeCloseTo(0.4, 5);
    expect(b2.manual).toBe(true);
    expect(b2.workplace).toBe(camp.id);
    expect(loaded.state.colonists.candidates.map((k) => k.colonist.name)).toEqual(board); // not rerolled
    // the colony keeps living after the load
    h.clock.now += 5000;
    for (let i = 0; i < 100; i++) loaded.update(0.1);
    expect(loaded.state.buildings.list.find((x) => x.id === desk.id)).toBeTruthy();
    for (const c of cs.all()) expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true);
    expect(loaded.derived.housing.beds).toBeGreaterThan(0);
  });

  it('survivors who answered the radio while the app was closed are waiting after a load (only in free seats)', () => {
    const h = makeGame();
    const st = h.game.state.colonists;
    const full = st.candidates.map((k) => k.colonist.name);
    // a full board stays exactly as it was
    let json = serializeState(h.game.state);
    h.clock.now += 24 * 3600 * 1000;
    let loaded = new Game({ state: deserializeState(json), clock: () => h.clock.now });
    loaded.start();
    expect(loaded.state.colonists.candidates.map((k) => k.colonist.name)).toEqual(full);
    // two seats empty: one interval later one survivor is back, much later both seats are taken
    st.candidates.splice(0, 2);
    st.refreshAt = h.clock.now + 60_000;
    json = serializeState(h.game.state);
    h.clock.now += 61_000;
    loaded = new Game({ state: deserializeState(json), clock: () => h.clock.now });
    loaded.start();
    expect(loaded.state.colonists.candidates).toHaveLength(2);
    h.clock.now += 48 * 3600 * 1000;
    loaded = new Game({ state: deserializeState(json), clock: () => h.clock.now });
    loaded.start();
    expect(loaded.state.colonists.candidates).toHaveLength(loaded.data.balance.recruitCandidates);
  });

  it('reacts to building lifecycle events', () => {
    const h = makeGame();
    const camp = addBuilding(h.game, 'logging_camp', 140, 127, { status: 'building', progress: 0.5 });
    const c = addColonist(h.game, 'common', { specialty: 'gatherer' });
    expect(c.workplace).toBeNull();
    camp.status = 'active';
    h.game.bus.emit('building:completed', { id: camp.id, def: camp.def });
    h.run(0.2);
    expect(c.workplace).toBe(camp.id);

    const shelter = addBuilding(h.game, 'shelter', 131, 131);
    shelter.level = 2;
    h.game.bus.emit('building:upgraded', { id: shelter.id, def: shelter.def, level: 2, tier: 0 });
    h.run(0.2);
    expect(h.game.derived.housing.beds).toBe(3);
  });

  it('stays quiet and valid while the colony is empty', () => {
    const h = makeGame();
    addBuilding(h.game, 'shelter', 131, 131);
    h.run(10);
    expect(h.game.derived.housing).toEqual({ beds: 2, used: 0 });
    expect(h.game.derived.happiness.average).toBe(50);
    expect(h.game.derived.happiness.productivity).toBe(1);
  });
});
