import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import type { BuildingDef } from '../src/data/schema';

/**
 * DEFENSE SANITY MODEL
 * --------------------
 * For every colony tier: take a "reasonably upgraded" turret loadout (what an engaged player has by then), compute its
 * effective damage output, and compare it with the HP of the invasion at the tier's expected wave number
 * (counts scale by 1 + waveScaling x waves, bosses join every Nth wave).  A tier is "comfortable" when the defense
 * deals at least COMFORT x the wave HP during the time aliens spend inside turret range.
 * Flyers are checked against anti-air-capable turrets only. Prints a table.
 */
const data = createDataRegistry();

interface Load { id: string; n: number; lvl: number }
const L = (id: string, n: number, lvl = 1): Load => ({ id, n, lvl });

const LOADOUT: Load[][] = [
  [L('scrap_turret', 3, 2)],
  [L('scrap_turret', 3, 3), L('guard_tower', 3, 2)],
  [L('sentry_gun', 4, 2), L('crossfire_tower', 3, 3), L('guard_tower', 3, 3), L('scrap_turret', 2, 3)],
  [L('mg_turret', 6, 3), L('flamethrower', 3, 2), L('crossfire_tower', 3, 3), L('sentry_gun', 4, 3)],
  [L('missile_turret', 4, 2), L('heavy_sentry', 4, 2), L('cannon_turret', 3, 2), L('aa_gun', 4, 2), L('mg_turret', 6, 3), L('flamethrower', 3, 3)],
  [L('laser_turret', 10, 3), L('drone_pad', 4, 3), L('missile_turret', 4, 3), L('heavy_sentry', 4, 3), L('flak_battery', 3, 2), L('aa_gun', 4, 3), L('cannon_turret', 3, 3)],
  [L('plasma_turret', 6, 2), L('railgun', 4, 2), L('titan_cannon', 4, 2), L('drone_swarm', 4, 2), L('sky_lance', 3, 2), L('laser_turret', 8, 3), L('missile_turret', 4, 3), L('heavy_sentry', 4, 3)],
];
/** Colony shield capacity available (absorbs damage, i.e. extra effective HP for the base — reported only). */
const SHIELDS: Load[][] = [[], [], [], [], [L('shield_generator', 1)], [L('shield_generator', 2), L('energy_barrier', 1)], [L('titan_shield', 2), L('energy_barrier', 2)]];

/** Expected number of invasions survived at each tier when the player is about 60% through it. */
const WAVES = [1, 2, 4, 6, 10, 12, 16];
const WINDOW = 30; // seconds aliens spend inside turret range before reaching the core
const COVERAGE = 0.6; // fraction of turrets that can reach any given spot
const COMFORT = 2;

const def = (id: string): BuildingDef => { const b = data.building(id); if (!b) throw new Error(id); return b; };
const lvl = (b: BuildingDef, l: number) => 1 + (b.levelEffect ?? 0) * (l - 1);
const dmgMod = [1, 1.05, 1.1, 1.18, 1.3, 1.45, 1.7]; // cumulative turretDamage research by tier (rounded from the tree)

function dps(load: Load[], tier: number, airOnly: boolean): number {
  let sum = 0;
  for (const l of load) {
    const b = def(l.id);
    const t = b.turret;
    if (!t) continue;
    if (airOnly && !t.antiAir) continue;
    if (!airOnly && t.airOnly) continue;
    let d = t.damage * t.fireRate * lvl(b, l.lvl) * dmgMod[tier];
    if (t.splash) d *= 1 + Math.min(2, t.splash * 0.7); // crowds
    if (t.pierce) d *= 1 + t.pierce * 0.5;
    if (t.mannedBy) d *= 1.25; // some of the guards are home
    sum += d * l.n;
  }
  return sum;
}

function waveHp(tier: number, waves: number, flyersOnly = false): number {
  const inv = data.invasion(tier);
  const scale = 1 + data.balance.waveScaling * waves;
  let hp = 0;
  const addAlien = (id: string, count: number, depth = 0) => {
    const a = data.alien(id)!;
    if (flyersOnly && !a.flying) return;
    hp += a.hp * count;
    // queens / hive mothers keep summoning while they live (assume ~20s alive)
    if (a.spawns && depth < 2) addAlien(a.spawns.alien, Math.round((a.spawns.count * 20) / a.spawns.every), depth + 1);
  };
  for (const g of inv.groups) addAlien(g.alien, g.count * scale);
  if (inv.boss && waves % inv.boss.every === 0) addAlien(inv.boss.alien, 1);
  return hp;
}

describe('data.defense — a reasonably upgraded base wins comfortably at every tier', () => {
  const rows: string[] = [];
  rows.push('tier              waves  waveHP   groundDPS  ratio  | boss-wave ratio | flyerHP  AA-DPS  ratio | shield');
  const results: { tier: number; ratio: number; bossRatio: number; air?: number }[] = [];
  for (let tier = 0; tier <= 6; tier++) {
    const w = WAVES[tier];
    const inv = data.invasion(tier);
    // regular wave: pick a wave number that is NOT a boss wave; boss wave: next multiple of `every`
    let regular = w;
    if (inv.boss && regular % inv.boss.every === 0) regular += 1;
    const bossWave = inv.boss ? Math.max(w, inv.boss.every) - (Math.max(w, inv.boss.every) % inv.boss.every) + (Math.max(w, inv.boss.every) % inv.boss.every === 0 ? 0 : inv.boss.every) : regular;
    const hp = waveHp(tier, regular);
    const bossHp = waveHp(tier, bossWave);
    const g = dps(LOADOUT[tier], tier, false);
    const out = g * WINDOW * COVERAGE;
    const ratio = out / hp;
    const bossRatio = out / bossHp;
    const fly = waveHp(tier, regular, true);
    const air = dps(LOADOUT[tier], tier, true);
    const airRatio = fly > 0 ? (air * WINDOW * COVERAGE) / fly : Infinity;
    const shield = SHIELDS[tier].reduce((s, l) => s + (def(l.id).shield?.capacity ?? 0) * l.n, 0);
    rows.push(`${data.tier(tier).name.padEnd(16)} ${String(regular).padStart(5)} ${hp.toFixed(0).padStart(7)} ${g.toFixed(0).padStart(10)} ${ratio.toFixed(1).padStart(6)}  | ${inv.boss ? bossRatio.toFixed(1).padStart(8) : '    n/a '} (w${bossWave}) | ${fly.toFixed(0).padStart(6)} ${air.toFixed(0).padStart(7)} ${fly > 0 ? airRatio.toFixed(1).padStart(6) : '   n/a'} | ${shield}`);
    results.push({ tier, ratio, bossRatio: inv.boss ? bossRatio : Infinity, air: fly > 0 ? airRatio : undefined });
  }

  it('prints the defense table', () => {
    console.log('\n' + rows.join('\n') + '\n');
  });

  it(`ground defense deals at least ${COMFORT}x the wave HP in range (comfortable) but is not absurdly overpowered`, () => {
    for (const r of results) {
      expect(r.ratio, `tier ${r.tier} regular wave`).toBeGreaterThanOrEqual(COMFORT);
      expect(r.ratio, `tier ${r.tier} should still feel like a fight`).toBeLessThanOrEqual(40);
    }
  });

  it('boss waves are beatable too (bosses are a spectacle, not a wall)', () => {
    for (const r of results) expect(r.bossRatio, `tier ${r.tier} boss wave`).toBeGreaterThanOrEqual(1.2);
  });

  it('flyers are handled by anti-air-capable turrets from the tier they appear', () => {
    for (const r of results) if (r.air !== undefined) expect(r.air, `tier ${r.tier} flyers`).toBeGreaterThanOrEqual(COMFORT);
  });

  it('victory chests grow with tier and the first one fits the opening economy', () => {
    const worth: Record<string, number> = { wood: 1, stone: 1, fiber: 1, food: 1, water: 1, iron: 2, copper: 2, coal: 2, steel: 6, electronics: 8, biomass: 4, crystal: 10, alloy: 25, energy_cell: 20, nano: 50, titanium: 80 };
    const value = (t: number) => Object.entries(data.invasion(t).reward.resources ?? {}).reduce((s, [k, v]) => s + (v ?? 0) * (worth[k] ?? 1), 0);
    for (let t = 1; t <= 6; t++) expect(value(t), `invasion chest worth at tier ${t}`).toBeGreaterThan(value(t - 1));
    expect(data.invasion(0).reward.rp).toBeGreaterThanOrEqual(20);
  });

  it('the very first attack is trivial for one scrap turret plus the player', () => {
    const inv = data.invasion(0);
    const hp = inv.groups.reduce((s, g) => s + g.count * data.alien(g.alien)!.hp, 0);
    const turret = def('scrap_turret').turret!;
    const oneTurret = turret.damage * turret.fireRate * (turret.manual ? 2 : 1) * 45;
    expect(oneTurret).toBeGreaterThan(hp * 1.5);
  });
});
