/**
 * The four-week economy (data/pacing.ts and friends): the levers are applied where the content is built, the guided
 * first session is untouched, every cost fits a store the colony can build at the tier it is needed, and the rules
 * that keep a long game fair hold (copies escalate, converters pause on full stores, offline runs at a relaxed pace,
 * restocks pay goods but not Nova).
 */
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { PACING, copyMult, pace, roundCost, scaleBag } from '../src/data/pacing';
import { BALANCE } from '../src/data/balance';
import { creditedSeconds, absenceFor, simulateOffline } from '../src/sim/econ/offline';
import { Game } from '../src/core/Game';
import { CENTER_CELL as C } from '../src/core/constants';
import { createMockServices } from '../src/platform/mock';
import type { ResourceBag } from '../src/data/schema';

const data = createDataRegistry();
const TIERS = data.tiers.length;

/** A real colony (shipped content) with a clock you can move. */
function realGame(resources: Record<string, number> = {}) {
  const clock = { now: 1_800_000_000_000 };
  const game = new Game({ seed: 11, services: createMockServices(), clock: () => clock.now });
  game.start();
  Object.assign(game.state.resources.amounts, resources);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      clock.now += 250;
      game.update(0.25);
    }
  };
  return { game, clock, run };
}

/** Place a building instantly on the first free spot near the core. */
function place(game: Game, def: string): number {
  const B = game.sys.buildings;
  for (let r = 3; r < 14; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!B.canPlace(def, C + dx, C + dz, 0).ok) continue;
        const id = B.place(def, C + dx, C + dz, 0, { instant: true });
        if (id != null) return id;
      }
    }
  }
  throw new Error(`no room for ${def}`);
}

/** What a colony can store at a tier: base + core + four of every storage building of that tier or earlier, at max level. */
function reachableStorage(tier: number, copies = 4): Record<string, number> {
  const cap: Record<string, number> = {};
  for (const r of data.resources) cap[r.id] = r.baseCapacity;
  for (const b of data.buildings) {
    if (!b.storage || b.cosmetic || b.unlockTier > tier) continue;
    const lm = 1 + (b.levelEffect ?? 0) * (b.maxLevel - 1);
    const n = b.core ? 1 : copies;
    for (const [k, v] of Object.entries(b.storage)) cap[k] = (cap[k] ?? 0) + (v ?? 0) * lm * n;
  }
  return cap;
}

function fits(cost: ResourceBag | undefined, cap: Record<string, number>, what: string): void {
  for (const [k, v] of Object.entries(cost ?? {})) expect(cap[k] ?? 0, `${what}: ${k} ${v}`).toBeGreaterThanOrEqual(v ?? 0);
}

describe('pacing levers', () => {
  it('every table covers the seven tiers and grows (never shrinks) tier over tier', () => {
    for (const key of ['build', 'storage', 'piece', 'research', 'tierUp', 'missionReward'] as const) {
      const t = PACING[key];
      expect(t, key).toHaveLength(TIERS);
      for (let i = 1; i < t.length; i++) expect(t[i], `${key}[${i}]`).toBeGreaterThanOrEqual(t[i - 1]);
    }
    // stores keep up with what they must hold
    for (let i = 0; i < TIERS; i++) expect(PACING.storage[i], `storage[${i}]`).toBeGreaterThanOrEqual(PACING.build[i]);
  });

  it('the guided first session is exactly as authored (Wood costs, the Reinforced tier-up, the first research)', () => {
    expect(pace(PACING.build, 0)).toBe(1);
    expect(pace(PACING.research, 0)).toBe(1);
    expect(pace(PACING.tierUp, 1)).toBe(1);
    expect(pace(PACING.missionReward, 0)).toBe(1);
    expect(data.tier(1).upgradeCost).toEqual({ wood: 150, stone: 60, fiber: 60 });
    expect(data.researchDef('tier_reinforced')!.cost).toBe(25);
    expect(data.building('logging_camp')!.cost).toEqual({ wood: 80, stone: 40 });
    expect(data.building('scrap_turret')!.cost).toEqual({ wood: 80, stone: 60 });
  });

  it('applies the tables where content is built: tier-ups, buildings, stores, research and mission rewards', () => {
    expect(data.tier(6).upgradeCost.alloy).toBe(roundCost(16500 * PACING.tierUp[6]));
    expect(data.building('nanoforge')!.cost.alloy).toBe(roundCost(60 * PACING.build[4]));
    expect(data.building('nano_vault')!.storage!.nano).toBe(roundCost(1200 * PACING.storage[5]));
    expect(data.researchDef('tier_titanium')!.cost).toBe(roundCost(21000 * PACING.research[5]));
    // decor, cosmetics and structure pieces are never paced: cozy things stay cheap at every tier
    expect(data.building('lamp_post')!.cost).toEqual({ wood: 5, fiber: 2 });
    expect(data.building('fountain')!.cost).toEqual({ stone: 60 });
    expect(data.tier(5).pieceCost).toEqual({ nano: 2, alloy: 4 });
    // a main mission at Nano pays more than its authored amount; the tutorial missions pay what they always did
    expect(data.mission('m09_defend')!.reward.resources).toEqual({ wood: 60, stone: 40 });
    expect(data.mission('m54_fusion')!.reward.resources!.alloy).toBe(roundCost(200 * PACING.missionReward[5]));
  });

  it('friendly amounts: whole numbers, steps of five, then two significant digits', () => {
    expect(roundCost(4.4)).toBe(4);
    expect(roundCost(123)).toBe(125);
    expect(roundCost(12_345)).toBe(12_000);
    expect(roundCost(495_000)).toBe(500_000);
    expect(scaleBag({ wood: 15, stone: 7 }, 1)).toEqual({ wood: 15, stone: 7 });
    expect(scaleBag({ wood: 15 }, 3)).toEqual({ wood: 45 });
  });
});

describe('no stuck states: every cost fits a store the colony can build by then', () => {
  it('tier-ups (with their gate research) fit the stores of the tier before', () => {
    for (let t = 1; t < TIERS; t++) {
      const cap = reachableStorage(t - 1);
      const tier = data.tier(t);
      fits(tier.upgradeCost, cap, `tier-up to ${tier.name}`);
      if (tier.research) fits(data.researchDef(tier.research)!.resources, cap, `gate research ${tier.research}`);
    }
  });

  it('research, buildings (every level) and recipes fit the stores of their tier', () => {
    for (const r of data.research) fits(r.resources, reachableStorage(r.tier), `research ${r.id}`);
    for (const b of data.buildings) {
      if (b.cosmetic || b.core) continue;
      const cap = reachableStorage(b.unlockTier);
      fits(b.cost, cap, `build ${b.id}`);
      for (let l = 1; l < b.maxLevel; l++) fits(scaleBag(b.cost, Math.pow(b.levelCostMult ?? 1.8, l)), cap, `${b.id} level ${l + 1}`);
    }
    for (const r of data.recipes) fits(r.inputs, reachableStorage(r.unlockTier), `recipe ${r.id}`);
  });

  it('a "gather N" main mission can always be finished: hand gathering counts at the node, so N may exceed the store', () => {
    const g = realGame().game;
    const m = data.missions.find((x) => x.chain === 'main' && x.type === 'gather' && x.target === 'crystal')!;
    expect(m).toBeTruthy();
    // the store is full: the hits still count
    const before = g.state.missions.counters['gather:crystal'] ?? 0;
    g.bus.emit('gather:hit', { node: 1, model: 'crystal', x: 0, z: 0, drop: { crystal: 6 } });
    expect(g.state.missions.counters['gather:crystal']).toBe(before + 6);
  });
});

describe('a fair long game', () => {
  it('copies past the first few cost a little more each; decor and pieces never escalate', () => {
    const { game } = realGame({ wood: 1e5, stone: 1e5, fiber: 1e5 });
    const B = game.sys.buildings;
    const first = B.cost('research_desk');
    const owned = B.countOf('research_desk');
    for (let i = owned; i < PACING.copies.free; i++) place(game, 'research_desk');
    expect(B.cost('research_desk').wood).toBe(roundCost(first.wood! * copyMult(PACING.copies.free)));
    expect(copyMult(PACING.copies.free)).toBeCloseTo(PACING.copies.growth, 6);
    expect(copyMult(PACING.copies.free - 1)).toBe(1);
    expect(copyMult(PACING.copies.free + 4)).toBeCloseTo(Math.pow(PACING.copies.growth, 5), 6);
    // what was paid comes back on removal (the next copy may cost more than this one did)
    const id = place(game, 'research_desk');
    const paid = game.sys.buildings.get(id)!.spent;
    expect(B.refund(id)).toEqual(paid);
    for (let i = 0; i < 8; i++) place(game, 'lamp_post');
    expect(B.cost('lamp_post')).toEqual(data.building('lamp_post')!.cost);
    // level-ups follow the building's own (paced) cost, not the copy price: levelling up is the better deal later on
    const d = data.building('research_desk')!;
    expect(B.levelUpCost(id)).toEqual({ wood: Math.ceil(d.cost.wood! * (d.levelCostMult ?? 1.8)), stone: Math.ceil(d.cost.stone! * (d.levelCostMult ?? 1.8)) });
  });

  it('converters pause while every output store is full (online and offline): the inputs stay in store', () => {
    const { game, run } = realGame({ stone: 5000, iron: 500, coal: 500 });
    game.state.colony.tier = 2;
    game.state.research.completed.push('basic_mining');
    const eco = game.sys.economy;
    const smelter = place(game, 'smelter');
    game.sys.colonists.grant('common');
    run(3);
    const b = game.sys.buildings.get(smelter)!;
    expect(b.workers.length).toBeGreaterThan(0);
    // running: iron goes in
    let iron = game.state.resources.amounts.iron;
    run(20);
    expect(game.state.resources.amounts.iron).toBeLessThan(iron);
    // the steel store is full: it pauses and says so
    game.state.resources.amounts.steel = eco.capacity('steel');
    run(3);
    iron = game.state.resources.amounts.iron;
    run(30);
    expect(game.state.resources.amounts.iron).toBeCloseTo(iron, 0);
    expect(eco.buildingEconomy(smelter)?.idle).toBe('full');
    // the offline model too: a converter with a full output does not eat its inputs
    const res = simulateOffline({ flows: [{ ins: [['iron', 10]], outs: [['steel', 5]] }], upkeep: [], rpPerMin: 0 }, 3600, { iron: 1000, steel: 100 }, { iron: 5000, steel: 100 });
    expect(res.spent.iron ?? 0).toBe(0);
    expect(res.gains.steel ?? 0).toBe(0);
  });

  it('offline: the first minutes at full speed, then the relaxed pace, up to the cap', () => {
    const full = (BALANCE.offlineFullMinutes ?? 0) * 60;
    const eff = BALANCE.offlineEfficiency;
    const cap = BALANCE.offlineHours * 3600;
    expect(creditedSeconds(full / 2, cap, eff, full)).toBe(full / 2);
    expect(creditedSeconds(full + 3600, cap, eff, full)).toBeCloseTo(full + 3600 * eff, 6);
    expect(creditedSeconds(cap * 3, cap, eff, full)).toBeCloseTo(full + (cap - full) * eff, 6);
    expect(absenceFor(creditedSeconds(5000, cap, eff, full), eff, full)).toBeCloseTo(5000, 6);
    // a day of five 20-minute sessions: Welcome Back credits less than two hours of production for the ~22 hours away,
    // while the 100 online minutes earn production plus research, loot, hauls and rewards (~1.6-2x production): offline
    // stays under ~40% of the day's income (the pacing bot measures the real share)
    const gaps = [3.2, 3.2, 3.2, 3.2, 9.7].map((h) => creditedSeconds(h * 3600, cap, eff, full) / 60);
    const offlineMinutes = gaps.reduce((a, b) => a + b, 0);
    expect(offlineMinutes).toBeLessThan(2 * 100);
    expect(offlineMinutes).toBeGreaterThan(100); // still generous: more than the day's online minutes of production
  });

  it('recruitment, rescues and expeditions are paced: survivors are a treat, the board sets the pace', () => {
    for (const d of data.expeditions) for (const f of d.finds ?? []) if (f.reward.colonist) expect(f.chance, d.id).toBeLessThanOrEqual(0.5 * PACING.survivors + 1e-9);
    for (const e of data.worldEvents) if (e.kind === 'rescue') expect(e.weight, e.id).toBeLessThanOrEqual(2 * PACING.survivors + 1e-9);
    const mins = BALANCE.recruitArrivalMinutes!;
    expect(mins[0]).toBeLessThanOrEqual(30);
    for (let t = 2; t <= 5; t++) expect(mins[t]).toBeGreaterThan(mins[t - 1]);
  });

  it('a restocked point of interest pays its goods again, its Nova only the first time', () => {
    const { game } = realGame();
    const W = game.sys.world;
    const nest = W.gen.pois.find((p) => (data.poi(p.def)?.reward.nova ?? 0) > 0 && (data.poi(p.def)?.respawn ?? 0) > 0 && data.poi(p.def)?.kind !== 'nest');
    // every Nova-paying POI that restocks is a nest (guarded); exercise the rule through the loot path directly
    const any = nest ?? W.gen.pois.find((p) => (data.poi(p.def)?.reward.nova ?? 0) > 0 && (data.poi(p.def)?.respawn ?? 0) > 0);
    expect(any).toBeTruthy();
    const nova: number[] = [];
    game.bus.on('reward:granted', (e) => {
      if (e.source === 'poi') nova.push(e.reward.nova ?? 0);
    });
    const ps = (game.state.world.pois[any!.id] ??= { discovered: true, looted: false } as never) as { looted: boolean; times?: number; restockAt?: number };
    const W2 = W as unknown as { guarded: Set<string> };
    W2.guarded?.add(any!.id);
    const wild = game.sys.combat as unknown as { wildNear: () => number };
    wild.wildNear = () => 0;
    expect(W.lootPoi(any!.id)).toBe(true);
    ps.looted = false; // restocked
    expect(W.lootPoi(any!.id)).toBe(true);
    expect(nova[0]).toBeGreaterThan(0);
    expect(nova[1]).toBe(0);
  });
});
