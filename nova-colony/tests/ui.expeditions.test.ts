/**
 * Expedition presentation logic (src/ui/logic/expeditions.ts): destination groups, squad picker order, the vehicle
 * line, the HUD chip state, badges and the Star Chart layout.
 */
import { describe, expect, it } from 'vitest';
import { chanceText, chartLayout, destinationGroups, durationLabel, expeditionBadge, hudExpedition, squadRows, vehicleLine } from '../src/ui/logic/expeditions';
import { computeBadges, idleWithJobs } from '../src/ui/logic/badges';
import { regionalSpec } from '../src/sim/expedition/rules';
import { HOUR, MIN, crew, makeColony } from './expeditions.helpers';

describe('ui.expeditions', () => {
  it('labels durations and chances the way the panel shows them', () => {
    expect(durationLabel(900)).toBe('15 min');
    expect(durationLabel(3600)).toBe('1 h');
    expect(durationLabel(4 * 3600 + 1800)).toBe('4 h 30 min');
    expect(chanceText(0.42)).toBe('42%');
    expect(chanceText(0.004)).toBe('<1%');
  });

  it('describes what a vehicle does for a trip', () => {
    const rig = makeColony({ tier: 2 });
    const rules = rig.game.data.expeditionRules;
    expect(vehicleLine(rules, rig.game.data.vehicle('titanium_hovercraft')!)).toBe('−20% time · +15% haul');
    expect(vehicleLine(rules, rig.game.data.vehicle('mining_truck')!)).toMatch(/−4% time · \+11% haul/);
  });

  it('groups destinations by region, open regions first, and says why the rest are locked', () => {
    const rig = makeColony({ tier: 2, regions: false });
    const groups = destinationGroups(rig.game);
    expect(groups).toHaveLength(8);
    expect(groups[0].open).toBe(true);
    const cv = groups.find((g) => g.biome === 'crash_valley')!;
    expect(cv.discovered).toBe(true);
    expect(cv.entries.map((e) => e.ok)).toEqual([true, true, false]);
    const marsh = groups.find((g) => g.biome === 'toxic_marsh')!;
    expect(marsh.open).toBe(false);
    expect(marsh.entries[0].reason).toMatch(/Discover Toxic Marsh/);
  });

  it('puts terrain experts first in the squad picker, then the most skilled, and leaves out whoever is away', () => {
    const rig = makeColony({ tier: 2, crew: ['farmer', 'miner', 'mechanic', 'farmer'] });
    const g = rig.game;
    const [farmer, miner, mechanic, farmer2] = crew(g);
    farmer2.skill = 5;
    const spec = regionalSpec(g.data.expedition('rd_wreck')!); // mechanic, engineer
    const rows = squadRows(g, spec);
    expect(rows[0].c).toBe(mechanic);
    expect(rows[0].match).toBe(true);
    expect(rows[0].bonusPct).toBe(23); // +20% match, +3% for the second star
    expect(rows[1].c).toBe(farmer2); // five stars beat two
    g.sys.expeditions.launch('cv_debris', [miner.id]);
    expect(squadRows(g, spec).map((r) => r.c)).not.toContain(miner);
    expect(squadRows(g, spec).map((r) => r.c)).toContain(farmer);
  });

  it('drives the HUD chip: hidden, then a countdown, then "haul ready" with a badge', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    expect(hudExpedition(g).state).toBeNull();
    g.sys.expeditions.launch('cv_stash', [crew(g)[0].id]);
    const out = hudExpedition(g);
    expect(out.state).toBe('out');
    expect(out.seconds).toBeCloseTo(3600, -1);
    expect(expeditionBadge(g)).toBe(0);
    rig.wait(HOUR + MIN);
    expect(hudExpedition(g)).toMatchObject({ state: 'ready', ready: 1 });
    expect(computeBadges(g).expeditions).toBe(1);
  });

  it('counts a colonist away on a trip as neither idle nor available for a job', () => {
    const rig = makeColony({ tier: 2, crew: ['gatherer'] });
    const g = rig.game;
    const c = crew(g)[0];
    g.state.buildings.list.push({ id: 900, def: 'logging_camp', x: 100, z: 100, rot: 0, level: 1, tier: 2, hp: 100, maxHp: 100, status: 'active', progress: 1, workers: [], recipe: null, craft: 0, eff: 1 });
    c.workplace = null;
    expect(idleWithJobs(g)).toBe(1);
    g.sys.expeditions.launch('cv_debris', [c.id]);
    expect(idleWithJobs(g)).toBe(0);
  });

  it('lays the Star Chart out as a spiral journey: inside the box, apart, each stop near the one before', () => {
    expect(chartLayout(0)).toEqual([]);
    for (const n of [1, 5, 12, 40, 120]) {
      const pts = chartLayout(n);
      expect(pts).toHaveLength(n);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(0.02);
        expect(p.x).toBeLessThan(0.98);
        expect(p.y).toBeGreaterThan(0.02);
        expect(p.y).toBeLessThan(0.98);
        expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeGreaterThan(0.02); // never on top of home
      }
      // consecutive stops are close compared with the chart (a road, not a web)
      const steps = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
      const spread = Math.max(...pts.map((p) => Math.hypot(p.x - 0.5, p.y - 0.5)));
      for (const s of steps) expect(s).toBeLessThan(spread * 0.9);
      // nobody overlaps
      let minGap = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      if (n > 1) expect(minGap).toBeGreaterThan(0.01);
    }
    // stable: charting a new site zooms out but keeps the shape
    const a = chartLayout(10);
    const b = chartLayout(11);
    const ratio = (p: { x: number; y: number }[], i: number, j: number) => Math.hypot(p[i].x - 0.5, p[i].y - 0.5) / Math.hypot(p[j].x - 0.5, p[j].y - 0.5);
    expect(ratio(a, 3, 7)).toBeCloseTo(ratio(b, 3, 7), 5);
  });
});
