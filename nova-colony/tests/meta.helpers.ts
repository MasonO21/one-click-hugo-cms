/**
 * Shared helpers for the meta (missions / tutorial / live-ops / platform) tests.
 * They drive systems through bus events and plain state so they keep working as the other systems
 * (buildings, combat, world, ...) get real implementations.
 */
import { vi } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import type { AdResult, PlatformServices } from '../src/platform/types';
import type { BuildingInstance, Colonist } from '../src/core/state';
import type { DataRegistry } from '../src/data';
import type { MissionDef } from '../src/data/schema';

/** 2026-06-15 10:00 local time. */
export const T0 = new Date(2026, 5, 15, 10, 0, 0).getTime();
export const DAY = 86_400_000;

export interface Clock {
  now: number;
}

export interface TestServices extends PlatformServices {
  /** Ad result for the next showRewarded calls. */
  adResult: AdResult;
  showRewarded: ReturnType<typeof vi.fn>;
}

/** Mock services with a controllable ad result and a spy on showRewarded. */
export function makeServices(adResult: AdResult = 'rewarded'): TestServices {
  const base = createMockServices();
  const svc = base as TestServices;
  svc.adResult = adResult;
  svc.showRewarded = vi.fn(async () => svc.adResult);
  svc.ads = { isReady: () => true, showRewarded: svc.showRewarded as never };
  return svc;
}

export interface TestGame {
  game: Game;
  clock: Clock;
  services: TestServices;
}

export function makeGame(opts: { seed?: number; start?: boolean; data?: DataRegistry; state?: Game['state']; services?: TestServices; at?: number } = {}): TestGame {
  const clock: Clock = { now: opts.at ?? T0 };
  const services = opts.services ?? makeServices();
  const game = new Game({ seed: opts.seed ?? 7, services, clock: () => clock.now, data: opts.data, state: opts.state });
  if (opts.start !== false) game.start();
  return { game, clock, services };
}

/** Advance only the meta systems (fast, independent of other agents' systems). */
export function tickMeta(g: TestGame, seconds: number, dt = 0.25): void {
  for (let t = 0; t < seconds; t += dt) {
    g.clock.now += dt * 1000;
    g.game.state.playTime += dt;
    g.game.sys.missions.update(dt);
    g.game.sys.tutorial.update(dt);
    g.game.sys.liveops.update(dt);
  }
}

export function fakeBuilding(def: string, id: number, extra: Partial<BuildingInstance> = {}): BuildingInstance {
  return { id, def, x: 130, z: 130, rot: 0, level: 1, tier: 0, hp: 100, maxHp: 100, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1, ...extra };
}

export function fakeColonist(id: number, workplace: number | null = null): Colonist {
  return {
    id, name: `C${id}`, bio: '', rarity: 'common', appearance: { skin: 0, hair: 0, hairColor: 0, outfit: 0, height: 1 }, trait: 'x',
    specialty: 'gatherer', skill: 1, xp: 0, happiness: 60, workplace, bed: null, x: 0, z: 0, rot: 0, activity: 'idle', tx: 0, tz: 0, joinedAt: 0,
  };
}

/** Make the world do what a mission asks, through the same bus events the real systems emit. */
export function fulfil(g: TestGame, def: MissionDef): void {
  const { game } = g;
  const bus = game.bus;
  switch (def.type) {
    case 'gather':
      bus.emit('resource:gained', { id: def.target === '*' ? 'wood' : def.target, amount: def.count, source: 'gather' });
      break;
    case 'build': {
      const id = def.target.startsWith('category:') || def.target === '*' ? 'shelter' : def.target;
      for (let i = 0; i < def.count; i++) bus.emit('building:completed', { id: 1000 + i, def: id });
      break;
    }
    case 'rescue':
      bus.emit('survivor:rescued', { poi: 'poi_1', colonist: 1 });
      break;
    case 'assign':
      game.state.colonists.list.push(fakeColonist(game.state.colonists.nextId++, 1));
      bus.emit('colonist:assigned', { id: game.state.colonists.list.at(-1)!.id, workplace: 1 });
      break;
    case 'defend':
      bus.emit('combat:ended', { wave: 1, kills: 8, reward: {} });
      break;
    case 'research':
      bus.emit('research:completed', { id: def.target });
      break;
    case 'tier':
      game.state.colony.tier = Math.max(game.state.colony.tier, def.count);
      bus.emit('colony:tierUp', { tier: game.state.colony.tier });
      break;
    case 'kill':
      for (let i = 0; i < def.count; i++) bus.emit('alien:killed', { id: i, def: def.target === '*' ? 'crawler' : def.target, x: 0, z: 0, by: 'turret' });
      break;
    default:
      throw new Error(`fulfil: unsupported mission type ${def.type}`);
  }
}

/** Complete + claim main-chain missions in order until `untilId` is the current mission. */
export function advanceMainTo(g: TestGame, untilId: string): void {
  for (let guard = 0; guard < 40; guard++) {
    const cur = g.game.sys.missions.current();
    if (!cur || cur.id === untilId) return;
    fulfil(g, cur);
    tickMeta(g, 1.5); // auto-claim
  }
  throw new Error(`advanceMainTo: never reached ${untilId}`);
}
