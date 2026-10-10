/**
 * Crafting discoverability: the Crafting Table side chain (build it, craft a Stone Axe, equip it), "equip X" missions
 * that also count a better item, the Craft panel's locked station tabs and its crafted-part chain line.
 */
import { describe, expect, it } from 'vitest';
import { makeGame } from './meta.helpers';
import { missingParts, stationBuilding } from '../src/sim/meta/craftParts';
import { betterItem, lesserItems } from '../src/sim/meta/missionRules';
import { lockedStations, partChainText } from '../src/ui/logic/craftChain';
import type { Game } from '../src/core/Game';

function placeDone(game: Game, def: string): void {
  const d = game.data.building(def)!;
  game.state.buildings.list.push({ id: 900 + game.state.buildings.list.length, def, x: 10, z: 10, rot: 0, level: 1, tier: 0, hp: d.hp, maxHp: d.hp, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 });
  game.bus.emit('building:completed', { id: 900, def } as never);
}

describe('the Crafting Table side chain', () => {
  it('is offered to a new colony and walks build -> craft -> equip', () => {
    const { game } = makeGame();
    const m = game.sys.missions;
    expect(m.activeByChain('side').map((d) => d.id)).toContain('s_craft_table');
    placeDone(game, 'workbench');
    expect(m.progress('s_craft_table').done).toBe(true);
    expect(m.claim('s_craft_table')).toBe(true);
    expect(m.activeByChain('side').map((d) => d.id)).toContain('s_craft_axe');
    game.bus.emit('craft:completed', { recipe: 'r_stone_axe' } as never);
    expect(m.progress('s_craft_axe').done).toBe(true);
    expect(m.claim('s_craft_axe')).toBe(true);
    expect(m.activeByChain('side').map((d) => d.id)).toContain('s_craft_equip');
    game.sys.player.addItem('stone_axe', 1);
    expect(game.sys.player.equip('stone_axe')).toBe(true);
    expect(m.progress('s_craft_equip').done).toBe(true);
  });

  it('a colony past Reinforced Wood is not handed the how-to chain', () => {
    const { game } = makeGame({ start: false });
    game.start();
    // reload as a Stone colony that never saw the chain
    const st = game.state;
    st.colony.tier = 2;
    st.missions.active = st.missions.active.filter((id) => !id.startsWith('s_craft'));
    const { game: g2 } = makeGame({ state: JSON.parse(JSON.stringify(st)) });
    expect(g2.sys.missions.activeByChain('side').map((d) => d.id)).not.toContain('s_craft_table');
  });

  it('"equip X" also counts a better item for the same slot', () => {
    const { game } = makeGame();
    const d = game.data;
    expect(betterItem(d, 'iron_pickaxe', 'stone_axe')).toBe(true);
    expect(betterItem(d, 'survival_tool', 'stone_axe')).toBe(false);
    expect(betterItem(d, 'assault_rifle', 'stone_axe')).toBe(false); // another slot
    expect(lesserItems(d, 'reinforced_axe')).toContain('stone_axe');
    const m = game.sys.missions;
    placeDone(game, 'workbench');
    m.claim('s_craft_table');
    game.bus.emit('craft:completed', { recipe: 'r_stone_axe' } as never);
    m.claim('s_craft_axe');
    game.sys.player.addItem('reinforced_axe', 1);
    game.sys.player.equip('reinforced_axe');
    expect(m.progress('s_craft_equip').done).toBe(true);
    // the counters stay exact: nobody equipped a Stone Axe
    expect(m.counter('equip', 'stone_axe')).toBe(0);
  });
});

describe('crafted-part chains', () => {
  it('walks the Hover Bike back to Machine Parts, stopping at parts already in the backpack', () => {
    const { game } = makeGame();
    const d = game.data;
    const bike = d.recipe('r_vehicle_hover_bike')!;
    const steps = missingParts(d, bike, {});
    expect(steps.map((s) => [s.item, s.station?.id, s.depth])).toEqual([
      ['robotic_core', 'fabricator', 0],
      ['machine_parts', 'workshop', 1],
    ]);
    expect(missingParts(d, bike, { robotic_core: 1 })).toEqual([]);
    expect(missingParts(d, bike, { machine_parts: 2 }).map((s) => s.item)).toEqual(['robotic_core']);
    expect(stationBuilding(d, 'workbench')?.id).toBe('workbench');
  });

  it('the Craft panel line names each part and where it is made', () => {
    const { game } = makeGame();
    game.state.colony.tier = 4;
    const text = partChainText(game, game.data.recipe('r_vehicle_hover_bike')!, ['hand']);
    expect(text).toBe('Needs Robotic Core → made at Fabricator Bench (research Field Robotics) · Machine Parts → made at Workshop (research Assembly Lines)');
    game.state.research.completed.push('field_robotics', 'assembly_lines');
    expect(partChainText(game, game.data.recipe('r_vehicle_hover_bike')!, ['hand', 'workshop'])).toBe('Needs Robotic Core → made at Fabricator Bench (not built yet) · Machine Parts → made at Workshop');
    expect(partChainText(game, game.data.recipe('r_stone_axe')!, ['hand'])).toBeNull();
  });
});

describe('locked crafting stations', () => {
  it('a new colony sees the Crafting Table (and the Campfire) as stations to build', () => {
    const { game } = makeGame();
    const locked = lockedStations(game, ['hand']);
    const table = locked.find((l) => l.station === 'workbench')!;
    expect(table.def.name).toBe('Crafting Table');
    expect(table.recipes).toBe(game.data.recipes.filter((r) => r.station === 'workbench' && r.unlockTier === 0).length);
    expect(table.buildable).toBe(true);
    expect(locked.map((l) => l.station)).toContain('campfire');
    // nothing from a later tier
    expect(locked.some((l) => l.def.unlockTier > 0)).toBe(false);
    // once built, it is a normal tab
    expect(lockedStations(game, ['hand', 'workbench']).some((l) => l.station === 'workbench')).toBe(false);
  });

  it('a station behind research names the research to start', () => {
    const { game } = makeGame();
    game.state.colony.tier = 2;
    const forge = lockedStations(game, ['hand', 'workbench']).find((l) => l.station === 'forge')!;
    expect(forge.buildable).toBe(false);
    expect(forge.research).toBeTruthy();
  });
});
