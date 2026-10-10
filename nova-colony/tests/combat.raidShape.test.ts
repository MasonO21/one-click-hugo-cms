import { describe, expect, it } from 'vitest';
import { addBuilding, makeGame } from './combat.helpers';
import { newAlienTypes, previewCount, RAID_GROWTH, scoutLine, scoutReport, scoutToast, shapeCounts } from '../src/sim/combat/raidShape';
import { TUNE } from '../src/sim/combat/types';
import { deserializeState, serializeState } from '../src/core/state';

/** Start the next raid at once and return the planned queue by alien type. */
function nextRaid(t: ReturnType<typeof makeGame>): { total: number; by: Record<string, number> } {
  const started = t.record('combat:started');
  t.game.sys.combat.schedule(0, 0);
  t.step(0.05);
  const by: Record<string, number> = {};
  const c = t.game.state.combat;
  for (const q of c.spawnQueue) by[q.alien] = (by[q.alien] ?? 0) + 1;
  for (const a of c.aliens) if (!a.wild) by[a.def] = (by[a.def] ?? 0) + 1;
  return { total: started[0].aliens, by };
}

function atTier(tier: number, wave: number, waveAtTier: number, lastWaveSize?: number) {
  const t = makeGame();
  const c = t.game.state.combat;
  t.game.state.colony.tier = tier;
  c.wave = wave;
  c.waveAtTier = waveAtTier;
  if (lastWaveSize != null) c.lastWaveSize = lastWaveSize;
  return t;
}

describe('first raid of a tier (raid shaping)', () => {
  it('new alien types are the ones no lower tier brings', () => {
    const t = makeGame();
    const d = t.game.data;
    expect(newAlienTypes(d, d.invasion(0))).toEqual([]); // the tutorial raid needs no scouts
    expect(newAlienTypes(d, d.invasion(1))).toEqual(['spitter', 'brute']);
    expect(newAlienTypes(d, d.invasion(2))).toEqual([]);
    expect(newAlienTypes(d, d.invasion(3))).toEqual(['razor_crawler', 'burrower']);
    expect(newAlienTypes(d, d.invasion(4))).toEqual(['acid_spitter', 'flyer', 'queen']);
    expect(previewCount(d.alien('razor_crawler'))).toBe(2);
    expect(previewCount(d.alien('titan'))).toBe(1);
  });

  it('Steel after a 20-alien Stone raid: at most 25 aliens, with new types as two scouts each', () => {
    const t = atTier(3, 4, 0, 20);
    const r = nextRaid(t);
    expect(r.total).toBeLessThanOrEqual(Math.floor(20 * RAID_GROWTH));
    expect(r.total).toBeGreaterThanOrEqual(20);
    expect(r.by.razor_crawler).toBe(2);
    expect(r.by.burrower).toBe(2);
    // the familiar groups still come
    expect(r.by.crawler).toBeGreaterThan(5);
    expect(r.by.spitter).toBeGreaterThan(0);
    expect(r.by.brute).toBeGreaterThan(0);
    expect(t.game.state.combat.lastWaveSize).toBe(r.total);
  });

  it('the next raids ease into the full table, never more than 25% bigger than the last', () => {
    const t = atTier(3, 5, 1, 25);
    const r = nextRaid(t);
    expect(r.total).toBe(Math.floor(25 * RAID_GROWTH));
    expect(r.by.razor_crawler).toBeGreaterThan(2); // no longer previews
    // and a raid already below the cap is untouched (within a tier, waveScaling grows raids by a few percent)
    const big = atTier(3, 6, 2, 200);
    const scale = 1 + big.game.data.balance.waveScaling * 2;
    const full = big.game.data.invasion(3).groups.reduce((n, g) => n + Math.max(1, Math.round(g.count * scale)), 0);
    expect(nextRaid(big).total).toBe(full);
  });

  it('a save from before raid shaping falls back to the previous table for its first raid at a tier', () => {
    const t = atTier(3, 4, 0);
    const prev = t.game.data.invasion(2).groups.reduce((n, g) => n + g.count, 0);
    expect(nextRaid(t).total).toBeLessThanOrEqual(Math.floor(prev * RAID_GROWTH));
    // ...and the field survives a save round trip (optional field: older saves simply lack it)
    t.game.state.combat.lastWaveSize = 31;
    const back = deserializeState(serializeState(t.game.state));
    expect(back.combat.lastWaveSize).toBe(31);
    const old = JSON.parse(serializeState(t.game.state));
    delete old.combat.lastWaveSize;
    expect(deserializeState(JSON.stringify(old)).combat.lastWaveSize).toBeUndefined();
  });

  it('Reinforced right after the tutorial raid: at most 10 aliens, one Brute and two Spitters', () => {
    const t = atTier(1, 1, 0, 8);
    const r = nextRaid(t);
    expect(r.total).toBeLessThanOrEqual(10);
    expect(r.by.spitter).toBe(2);
    expect(r.by.brute).toBe(1);
  });

  it('shapeCounts keeps every group alive and counts the boss against the cap', () => {
    const t = atTier(5, 9, 0, 50);
    const inv = t.game.data.invasion(5);
    const counts = shapeCounts(t.game, inv, inv.groups.map((g) => g.count), 1);
    expect(counts.every((n) => n >= 1)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0) + 1).toBeLessThanOrEqual(Math.floor(50 * RAID_GROWTH));
    const i = inv.groups.findIndex((g) => g.alien === 'titan');
    expect(counts[i]).toBe(1);
  });
});

describe('scouting report', () => {
  it('names the new types and a counter the colony can build at its tier', () => {
    const t = atTier(3, 4, 0, 20);
    const rep = scoutReport(t.game);
    expect(rep.map((e) => e.alien)).toEqual(['razor_crawler', 'burrower']);
    expect(scoutLine(rep[0])).toBe('Razor Crawlers ahead: Machine-Gun Turrets help');
    expect(scoutLine(rep[1])).toBe('Burrowers ahead: keep a turret near the core');
    expect(scoutToast(rep)).toBe('Scouts spotted Razor Crawlers (Machine-Gun Turrets help) and Burrowers (keep a turret near the core).');
  });

  it('a single heavy scout reads naturally; nothing to report after the first raid of a tier', () => {
    const t = atTier(5, 9, 0, 50);
    const rep = scoutReport(t.game);
    expect(rep.map((e) => e.alien)).toEqual(['deep_burrower', 'stormwing', 'titan']);
    expect(rep[2].label).toBe('A Titan');
    expect(scoutToast(rep)).toBe('Scouts spotted a Deep Burrower (keep turrets near the core), a Stormwing (Flak Batteries help) and a Titan (Heavy Cannons help).');
    t.game.state.combat.waveAtTier = 1;
    expect(scoutReport(t.game)).toEqual([]);
  });

  it('prefers a counter that is already unlocked', () => {
    const t = atTier(4, 6, 0, 45);
    const rep = scoutReport(t.game);
    const flyer = rep.find((e) => e.alien === 'flyer')!;
    expect(flyer.counter).toBe('aa_gun'); // nothing researched yet: the first one buildable at Alloy
    t.game.state.research.completed.push('machine_guns');
    const again = scoutReport(t.game).find((e) => e.alien === 'flyer')!;
    expect(again.counter).toBe('mg_turret');
  });

  it('the warning toasts the report', () => {
    const t = atTier(3, 4, 0, 20);
    const toasts = t.record('ui:toast');
    t.game.sys.combat.schedule(0, 30);
    t.step(0.1);
    expect(t.game.state.combat.phase).toBe('warning');
    expect(toasts.some((x) => x.icon === '🔭' && x.text.includes('Razor Crawlers'))).toBe(true);
  });
});

describe('swarm queens and long raids', () => {
  it('an invasion queen summons a few broods, and none late in the attack', () => {
    const t = makeGame();
    const { game, step } = t;
    const c = game.state.combat;
    c.phase = 'attack';
    c.attackStartedAt = game.state.playTime;
    game.sys.combat.spawnInvader('t_queen', 40, 40); // every 2 s, 2 crawlers
    step(30);
    const minions = c.aliens.filter((a) => a.def === 'crawler' && !a.wild).length;
    expect(minions).toBeLessThanOrEqual(TUNE.QUEEN_BROODS * 2);
    expect(minions).toBeGreaterThanOrEqual(2);
    // a fresh queen joining late in the attack stays quiet
    const late = makeGame();
    const lc = late.game.state.combat;
    lc.phase = 'attack';
    lc.attackStartedAt = late.game.state.playTime - TUNE.QUEEN_QUIET_AFTER - 1;
    late.game.sys.combat.spawnInvader('t_queen', 40, 40);
    late.step(10);
    expect(lc.aliens.filter((a) => a.def === 'crawler').length).toBe(0);
  });

  it('a raid that cannot be finished ends within three minutes', () => {
    const t = makeGame();
    const { game, step } = t;
    addBuilding(game, 'shelter', 140, 140);
    game.sys.combat.schedule(0, 0);
    step(0.1);
    const c = game.state.combat;
    expect(c.phase).toBe('attack');
    // aliens that never die and never reach anything: only the safety net can end it
    for (const a of c.aliens) a.hp = 1e9;
    const dur = step(400, () => {
      for (const a of c.aliens) a.hp = Math.max(a.hp, 1e9);
      return c.phase === 'victory';
    });
    expect(c.phase).toBe('victory');
    expect(dur).toBeLessThanOrEqual(TUNE.ATTACK_TIMEOUT + 5);
    expect(TUNE.ATTACK_TIMEOUT).toBeLessThanOrEqual(180);
  });
});
