import { describe, expect, it } from 'vitest';
import { CELL, WORLD_CELLS, cellOf } from '../src/core/constants';
import { deserializeState, serializeState } from '../src/core/state';
import { Game } from '../src/core/Game';
import { BIOMES } from '../src/data/world';
import { createDataRegistry, defaultData } from '../src/data';
import { collectEvents, makeGame } from './world.helpers';

function tierUp(game: ReturnType<typeof makeGame>['game'], tier: number) {
  game.state.colony.tier = tier;
  game.bus.emit('colony:tierUp', { tier });
}

describe('regions: unlock, discovery, locks', () => {
  it('a fresh game unlocks and discovers Crash Valley and every region without requirements', () => {
    const { game } = makeGame();
    const w = game.sys.world;
    for (const b of game.data.biomes) {
      const open = Object.keys(b.unlock).length === 0;
      expect(w.isUnlocked(b.id), b.id).toBe(open);
      expect(game.state.world.regionsDiscovered.includes(b.id), b.id).toBe(open);
    }
    expect(w.regionAt(0, 5)).toBe('crash_valley');
    expect(w.walkable(0, 5)).toBe(true);
  });

  it('explains what a locked region needs', () => {
    const { game } = makeGame();
    const w = game.sys.world;
    expect(w.lockReason('crystal_canyon')).toBe('Reach Stone tier');
    expect(w.lockReason('red_desert')).toBe('Reach Reinforced Wood tier');
    expect(w.lockReason('crash_valley')).toBeNull();
    expect(w.lockReason('nope')).toBeNull();
  });

  it('unlocks regions when the colony tier rises, with an event and a toast', () => {
    const { game } = makeGame();
    const unlocked = collectEvents(game, 'world:regionUnlocked');
    const toasts = collectEvents(game, 'ui:toast');
    tierUp(game, 1);
    expect(unlocked).toEqual([{ id: 'red_desert' }]);
    expect(toasts.map((t) => t.text)).toContain('🔓 Red Desert is now accessible!');
    expect(game.sys.world.isUnlocked('red_desert')).toBe(true);
    expect(game.sys.world.isUnlocked('crystal_canyon')).toBe(false);
    tierUp(game, 2);
    expect(unlocked.map((e) => e.id)).toEqual(['red_desert', 'crystal_canyon']);
    tierUp(game, 2); // idempotent
    expect(unlocked).toHaveLength(2);
    expect(game.sys.world.lockReason('crystal_canyon')).toBeNull();
  });

  it('honours research and mission requirements too', () => {
    // private copy of the biome defs so other tests keep the stock requirements
    const biomes = structuredClone(BIOMES);
    biomes.find((b) => b.id === 'crystal_canyon')!.unlock = { tier: 1, research: 'sharper_tools', mission: 'm01_wood' };
    const data = createDataRegistry({ ...defaultData(), biomes });
    const game = new Game({ seed: 5, data, clock: () => 1_700_000_000_000 });
    game.start();
    const w = game.sys.world;
    expect(w.lockReason('crystal_canyon')).toBe('Reach Reinforced Wood tier · Research Sharper Tools · Complete "Timber!"');
    game.state.colony.tier = 1;
    game.bus.emit('colony:tierUp', { tier: 1 });
    expect(w.isUnlocked('crystal_canyon')).toBe(false);
    game.state.research.completed.push('sharper_tools');
    game.bus.emit('research:completed', { id: 'sharper_tools' });
    expect(w.isUnlocked('crystal_canyon')).toBe(false);
    expect(w.lockReason('crystal_canyon')).toBe('Complete "Timber!"');
    game.state.missions.completed.push('m01_wood');
    game.bus.emit('mission:claimed', { id: 'm01_wood' });
    expect(w.isUnlocked('crystal_canyon')).toBe(true);
  });

  it('discovers a region the first time the player enters it (celebration, stats, once)', () => {
    const rig = makeGame();
    const { game } = rig;
    const discovered = collectEvents(game, 'world:regionDiscovered');
    const celebrate = collectEvents(game, 'ui:celebrate');
    const entered = collectEvents(game, 'world:regionEntered');
    tierUp(game, 2);
    const canyon = game.sys.world.gen.regionCenters.find((r) => r.id === 'crystal_canyon')!;
    const explored = game.state.stats.explored;
    game.sys.player.teleport(canyon.x, canyon.z);
    rig.step(0.2);
    expect(discovered).toEqual([{ id: 'crystal_canyon' }]);
    expect(celebrate).toHaveLength(1);
    expect(celebrate[0].title).toContain('Crystal Canyon');
    expect(game.state.stats.explored).toBe(explored + 1);
    expect(game.state.world.regionsDiscovered).toContain('crystal_canyon');
    expect(entered.at(-1)).toEqual({ id: 'crystal_canyon' });
    expect(game.sys.world.currentRegion).toBe('crystal_canyon');
    // leave and come back: no second celebration
    game.sys.player.teleport(0, 5);
    rig.step(0.2);
    game.sys.player.teleport(canyon.x, canyon.z);
    rig.step(0.2);
    expect(discovered).toHaveLength(1);
  });

  it('keeps the player out of locked regions (push back, one toast per cooldown) until they unlock', () => {
    const rig = makeGame();
    const { game } = rig;
    const w = game.sys.world;
    const locked = collectEvents(game, 'world:regionLocked');
    const toasts = collectEvents(game, 'ui:toast');
    // find a straight-ish valley|locked border: valley for 4 cells to the left, one locked region for 4 cells to the right
    let spot: { x: number; z: number; cx: number; cz: number } | null = null;
    for (let cz = 20; cz < WORLD_CELLS - 20 && !spot; cz++) {
      for (let cx = 24; cx < WORLD_CELLS - 24 && !spot; cx++) {
        const right = w.regionAtCell(cx + 1, cz);
        if (right === 'crash_valley' || w.isUnlocked(right)) continue;
        let ok = true;
        for (let dz = -2; dz <= 2 && ok; dz++) {
          for (let dx = -4; dx <= 0 && ok; dx++) if (w.regionAtCell(cx + dx, cz + dz) !== 'crash_valley') ok = false;
          for (let dx = 1; dx <= 4 && ok; dx++) if (w.regionAtCell(cx + dx, cz + dz) !== right) ok = false;
        }
        for (let dz = -5; dz <= 5 && ok; dz++) for (let dx = -6; dx <= 6 && ok; dx++) if (w.isWaterCell(cx + dx, cz + dz)) ok = false;
        if (ok) spot = { x: (cx + 1) * CELL - 256 - 3, z: (cz + 0.5) * CELL - 256, cx, cz };
      }
    }
    expect(spot, 'a straight border to test against').not.toBeNull();
    w.clearNodesInRect(spot!.cx - 8, spot!.cz - 4, spot!.cx + 8, spot!.cz + 4); // nothing but the border in the way
    const lockedRegion = w.regionAt(spot!.x + 6, spot!.z);
    game.view.camera.yaw = 0;
    game.sys.player.teleport(spot!.x, spot!.z);
    game.input.moveX = 1;
    rig.step(4);
    expect(w.regionAt(game.state.player.x, game.state.player.z)).toBe('crash_valley');
    expect(w.isUnlocked(lockedRegion)).toBe(false);
    expect(locked.length).toBe(1); // 4 s < the toast cooldown + one bump
    expect(locked[0].id).toBe(lockedRegion);
    const lockToasts = toasts.filter((t) => String(t.text).startsWith('🔒'));
    expect(lockToasts).toHaveLength(1);
    expect(lockToasts[0].text).toMatch(/🔒 .+ — Reach .+ tier/);
    rig.step(6);
    expect(locked.length).toBeGreaterThanOrEqual(2); // cooldown elapsed -> reminded again
    // unlocking lets the player through
    game.state.colony.tier = 6;
    game.bus.emit('colony:tierUp', { tier: 6 });
    rig.step(3);
    expect(w.regionAt(game.state.player.x, game.state.player.z)).toBe(lockedRegion);
  });
});

describe('fog of war', () => {
  it('reveals around the player as they move and round-trips through the save', () => {
    const rig = makeGame();
    const { game } = rig;
    const w = game.sys.world;
    expect(w.revealed(0, 5)).toBe(true);
    expect(w.revealed(100, 100)).toBe(false);
    const start = w.explored();
    game.view.camera.yaw = 0;
    game.input.moveX = 1;
    rig.step(6);
    game.input.moveX = 0;
    expect(w.explored()).toBeGreaterThan(start);
    const px = game.state.player.x;
    expect(w.revealed(px + 20, game.state.player.z)).toBe(true);
    expect(game.state.world.fog.length).toBeGreaterThan(10);
    expect(() => atob(game.state.world.fog)).not.toThrow();
    expect(atob(game.state.world.fog).length).toBe(512);

    const copy = deserializeState(serializeState(game.state));
    const again = makeGame(1234, { state: copy });
    const w2 = again.game.sys.world;
    // a reload also reveals around the player's exact position, so it can be a hair larger — never smaller
    expect(w2.explored()).toBeGreaterThanOrEqual(w.explored());
    expect(w2.explored() - w.explored()).toBeLessThan(0.002);
    for (const [x, z] of [[0, 5], [px, 5], [px + 20, 5], [100, 100], [-200, 200]]) expect(w2.revealed(x, z)).toBe(w.revealed(x, z));
    // malformed fog must not crash a load
    copy.world.fog = '!!!not base64!!!';
    expect(() => makeGame(1234, { state: copy })).not.toThrow();
  });

  it('only re-encodes when a new fog cell reveals something', () => {
    const rig = makeGame();
    const { game } = rig;
    const before = game.state.world.fog;
    rig.step(3); // standing still
    expect(game.state.world.fog).toBe(before);
    game.sys.world.revealAround(0, 5);
    expect(game.state.world.fog).toBe(before);
  });
});

describe('points of interest', () => {
  const byDef = (game: ReturnType<typeof makeGame>['game'], def: string, region?: string) =>
    game.sys.world.gen.pois.find((p) => p.def === def && (!region || p.region === region))!;

  it('discovers a POI within ~25 units and loots a supply cache, which later restocks', () => {
    const rig = makeGame();
    const { game } = rig;
    const found = collectEvents(game, 'world:poiDiscovered');
    const looted = collectEvents(game, 'world:poiLooted');
    const cache = byDef(game, 'supply_cache', 'crash_valley');
    game.sys.player.teleport(cache.x + 40, cache.z);
    rig.step(0.5);
    expect(found).toHaveLength(0);
    game.sys.player.teleport(cache.x + 22, cache.z);
    rig.step(0.5);
    expect(found).toEqual([{ id: cache.id, poi: 'supply_cache' }]);
    expect(game.state.world.pois[cache.id].discovered).toBe(true);

    const wood = game.state.resources.amounts.wood ?? 0;
    expect(game.sys.world.lootPoi(cache.id)).toBe(true);
    expect(game.state.resources.amounts.wood).toBe(wood + 30);
    expect(looted).toHaveLength(1);
    expect(looted[0]).toMatchObject({ id: cache.id, poi: 'supply_cache' });
    expect(game.sys.world.lootPoi(cache.id)).toBe(false); // already looted
    rig.step(1790, 0.25);
    expect(game.sys.world.lootPoi(cache.id)).toBe(false);
    rig.step(20, 0.25);
    expect(game.state.world.pois[cache.id].looted).toBe(false);
    expect(game.sys.world.lootPoi(cache.id)).toBe(true);
  });

  it('rescues a colonist from a survivor camp (one-time) and emits survivor:rescued', () => {
    const rig = makeGame();
    const { game } = rig;
    const rescued = collectEvents(game, 'survivor:rescued');
    const granted: string[] = [];
    const orig = game.sys.colonists.grant.bind(game.sys.colonists);
    game.sys.colonists.grant = (r) => {
      granted.push(r);
      return orig(r);
    };
    const camp = byDef(game, 'survivor_camp', 'pinewood_forest');
    expect(game.sys.world.lootPoi(camp.id)).toBe(true);
    expect(granted).toEqual(['common']);
    expect(rescued).toHaveLength(1);
    expect(rescued[0].poi).toBe(camp.id);
    expect(game.sys.world.lootPoi(camp.id)).toBe(false);
    rig.step(5000, 0.25);
    expect(game.sys.world.lootPoi(camp.id)).toBe(false); // camps never restock
  });

  it('activates beacons for fast travel; fast travel moves you next to the beacon and back to base', () => {
    const rig = makeGame();
    const { game } = rig;
    const travelled = collectEvents(game, 'world:fastTravel');
    const beacon = byDef(game, 'beacon', 'pinewood_forest');
    expect(game.sys.world.fastTravelTargets().map((t) => t.id)).toEqual(['base']);
    expect(game.sys.player.fastTravel(beacon.id)).toBe(false); // not activated yet
    expect(game.sys.world.lootPoi(beacon.id)).toBe(true);
    expect(game.state.world.beacons).toEqual([beacon.id]);
    const targets = game.sys.world.fastTravelTargets();
    expect(targets.map((t) => t.id)).toEqual(['base', beacon.id]);
    expect(targets[1].name).toBe('Pinewood Forest Beacon');
    expect(game.sys.player.fastTravel(beacon.id)).toBe(true);
    expect(Math.hypot(game.state.player.x - beacon.x, game.state.player.z - beacon.z)).toBeLessThan(8);
    expect(game.sys.world.walkable(game.state.player.x, game.state.player.z)).toBe(true);
    expect(game.sys.world.currentRegion).toBe('pinewood_forest');
    expect(game.sys.player.fastTravel('base')).toBe(true);
    expect(Math.hypot(game.state.player.x, game.state.player.z)).toBeLessThan(12);
    expect(travelled).toEqual([{ to: beacon.id }, { to: 'base' }]);
    expect(game.sys.player.fastTravel('nowhere')).toBe(false);
  });

  it('nests wake their guardians when approached and only open once they are defeated', () => {
    const rig = makeGame();
    const { game } = rig;
    tierUp(game, 3);
    const nest = byDef(game, 'alien_nest', 'toxic_marsh');
    const spawned: unknown[][] = [];
    let alive = 0;
    game.sys.combat.spawnWild = (alien, count, x, z) => {
      spawned.push([alien, count, x, z]);
      alive = count;
      return [];
    };
    game.sys.combat.wildNear = () => alive;
    game.sys.player.teleport(nest.x + 40, nest.z);
    rig.step(0.5);
    expect(spawned).toHaveLength(0);
    game.sys.player.teleport(nest.x + 14, nest.z);
    rig.step(0.5);
    expect(spawned).toEqual([['crawler', 4, nest.x, nest.z]]);
    rig.step(2);
    expect(spawned).toHaveLength(1); // only once
    expect(game.sys.world.lootPoi(nest.id)).toBe(false);
    const biomass = game.state.resources.amounts.biomass ?? 0;
    alive = 0;
    expect(game.sys.world.lootPoi(nest.id)).toBe(true);
    expect(game.state.resources.amounts.biomass).toBe(biomass + 30);
  });

  it('spawns a discovered, persistent survivor camp 10-16 cells away on walkable ground', () => {
    const rig = makeGame();
    const { game } = rig;
    const spawned = collectEvents(game, 'world:poiSpawned');
    const ver = game.sys.world.gen.version;
    const id = game.sys.world.spawnSurvivorNear(0, 0)!;
    expect(id).toBeTruthy();
    const poi = game.sys.world.poi(id)!;
    expect(poi.def).toBe('survivor_camp');
    const d = Math.hypot(poi.x, poi.z) / CELL;
    expect(d).toBeGreaterThanOrEqual(10);
    expect(d).toBeLessThanOrEqual(16);
    expect(game.sys.world.walkable(poi.x, poi.z)).toBe(true);
    expect(game.sys.world.solidNear(poi.x, poi.z, 2.5)).toBe(false);
    expect(game.state.world.pois[id].discovered).toBe(true);
    expect(game.sys.world.gen.version).toBe(ver + 1);
    expect(spawned).toEqual([{ id, poi: 'survivor_camp' }]);
    expect(cellOf(poi.x)).toBeGreaterThan(0);
    // second one gets its own id; both survive a reload
    const id2 = game.sys.world.spawnSurvivorNear(0, 0)!;
    expect(id2).not.toBe(id);
    const copy = deserializeState(serializeState(game.state));
    const again = makeGame(1234, { state: copy });
    expect(again.game.sys.world.poi(id)).toMatchObject({ x: poi.x, z: poi.z, def: 'survivor_camp' });
    expect(again.game.sys.world.poi(id2)).toBeTruthy();
    expect(again.game.sys.world.gen.pois.length).toBe(game.sys.world.gen.pois.length);
    // the camp is interactable like any other
    const rescued = collectEvents(again.game, 'survivor:rescued');
    expect(again.game.sys.world.lootPoi(id)).toBe(true);
    expect(rescued).toHaveLength(1);
  });
});
