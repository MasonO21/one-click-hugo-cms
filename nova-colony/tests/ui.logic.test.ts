import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { CELL, HALF_WORLD, WORLD_CELLS, cellCenter } from '../src/core/constants';
import { edgePoint, inStickZone, isTap, relativeScreenDir, stickUpdate, worldDirection, yawAfterDrag, zoomAfterPinch, zoomAfterWheel } from '../src/ui/logic/input';
import { footprintCells, missingText, pointInRect, rectFrom, refundEstimate, rotateOffset, scaleBag, snapFootprint, sumBags } from '../src/ui/logic/build';
import { easeOutQuart, segmentAtRotation, spinTarget } from '../src/ui/logic/spin';
import { clockText, dayPhase, fmtHMS, fmtLong, msUntilLocalMidnight, offlineWorkedText } from '../src/ui/logic/time';
import { buildingEffects, levelMult, lockInfo, modifierText } from '../src/ui/logic/describe';
import { autoDailyStep } from '../src/ui/logic/autoDaily';
import { RARITY_COLOR, rewardParts } from '../src/ui/logic/rewards';
import { MAP_MAX_ZOOM, clampViewport, mapScale, mapToWorld, nearestMarker, placeLabel, regionCentroids, worldToMap, type MapMarker } from '../src/ui/logic/map';
import { BUILD_CATEGORIES, NODE_H, NODE_W, layoutTree } from '../src/ui/logic/categories';
import { claimableMissions, claimableSeason, computeBadges, idleWithJobs } from '../src/ui/logic/badges';
import { happinessFace, portraitSvg, stars } from '../src/ui/logic/colonist';
import type { MissionDef, ResearchDef } from '../src/data/schema';
import { sideOrder } from '../src/ui/logic/missionOrder';

function mkGame(): Game {
  let now = 1_700_000_000_000;
  const g = new Game({ seed: 7, services: createMockServices(), clock: () => now });
  g.start();
  return g;
}

describe('ui input math', () => {
  it('joystick has a deadzone, normalises and drags its origin along', () => {
    const o = { x: 100, y: 100 };
    expect(stickUpdate(o, 103, 101)).toMatchObject({ x: 0, y: 0 });
    const right = stickUpdate(o, 156, 100);
    expect(right.x).toBeCloseTo(1, 1);
    expect(right.y).toBeCloseTo(0, 5);
    // screen y is down; joystick y is up
    const up = stickUpdate({ x: 100, y: 100 }, 100, 44);
    expect(up.y).toBeGreaterThan(0.95);
    // overshoot: knob is clamped to the radius and the origin follows the thumb
    const o2 = { x: 100, y: 100 };
    const far = stickUpdate(o2, 300, 100);
    expect(Math.hypot(far.knobX, far.knobY)).toBeCloseTo(56, 5);
    expect(o2.x).toBeCloseTo(244, 5);
    expect(far.x).toBeCloseTo(1, 5);
  });

  it('joystick -> world direction follows the camera convention', () => {
    // yaw 0: camera looks toward -Z, joystick up = forward = -Z, right = +X
    expect(worldDirection(0, 1, 0).dz).toBeCloseTo(-1, 6);
    expect(worldDirection(1, 0, 0).dx).toBeCloseTo(1, 6);
    // yaw 90deg: camera sits on +X looking at -X: forward = -X, right = -Z
    const f = worldDirection(0, 1, Math.PI / 2);
    expect(f.dx).toBeCloseTo(-1, 6);
    const r = worldDirection(1, 0, Math.PI / 2);
    expect(r.dz).toBeCloseTo(-1, 6);
  });

  it('left 40% (or right 40% when left-handed) owns the stick', () => {
    expect(inStickZone(100, 1000, false)).toBe(true);
    expect(inStickZone(500, 1000, false)).toBe(false);
    expect(inStickZone(900, 1000, true)).toBe(true);
    expect(inStickZone(100, 1000, true)).toBe(false);
  });

  it('camera drag, pinch and wheel map to yaw/zoom and clamp', () => {
    expect(yawAfterDrag(0, 100)).toBeGreaterThan(0);
    expect(yawAfterDrag(1, -100)).toBeLessThan(1);
    expect(zoomAfterPinch(0.5, 100, 200)).toBeLessThan(0.5); // spread = zoom in
    expect(zoomAfterPinch(0.5, 200, 100)).toBeGreaterThan(0.5);
    expect(zoomAfterPinch(0.1, 100, 1000)).toBe(0);
    expect(zoomAfterPinch(0.9, 1000, 100)).toBe(1);
    expect(zoomAfterWheel(0.5, 100)).toBeGreaterThan(0.5);
    expect(zoomAfterWheel(0.99, 5000)).toBe(1);
  });

  it('taps are short and still', () => {
    expect(isTap(3, 120)).toBe(true);
    expect(isTap(30, 120)).toBe(false);
    expect(isTap(3, 900)).toBe(false);
  });

  it('off-screen indicators point toward the target in screen space', () => {
    // camera yaw 0: forward is -Z (up on screen), right is +X
    const ahead = relativeScreenDir(0, -10, 0);
    expect(ahead.y).toBeLessThan(0);
    expect(Math.abs(ahead.x)).toBeLessThan(1e-9);
    const right = relativeScreenDir(10, 0, 0);
    expect(right.x).toBeGreaterThan(0);
    const e = edgePoint(right.x, right.y, 800, 400, 50);
    expect(e.x).toBeCloseTo(750, 3);
    expect(e.y).toBeCloseTo(200, 3);
    const diag = edgePoint(1, 1, 800, 400, 50);
    expect(diag.x).toBeLessThanOrEqual(750.0001);
    expect(diag.y).toBeLessThanOrEqual(350.0001);
  });
});

describe('ui build helpers', () => {
  it('snaps footprints around the cursor cell and rotates sizes', () => {
    expect(snapFootprint(10, 10, [1, 1], 0)).toEqual({ x: 10, z: 10 });
    expect(snapFootprint(10, 10, [3, 3], 0)).toEqual({ x: 9, z: 9 });
    expect(snapFootprint(10, 10, [2, 1], 0)).toEqual({ x: 10, z: 10 }); // even sizes: cursor is the first cell
    expect(snapFootprint(10, 10, [4, 2], 0)).toEqual({ x: 9, z: 10 });
    expect(snapFootprint(10, 10, [4, 2], 1)).toEqual({ x: 10, z: 9 });
    expect(footprintCells(4, 5, [2, 1], 0)).toHaveLength(2);
    expect(footprintCells(4, 5, [2, 1], 1)).toEqual([
      { x: 4, z: 5 },
      { x: 4, z: 6 },
    ]);
  });

  it('rotates blueprint offsets in quarter turns (4 turns = identity)', () => {
    expect(rotateOffset(2, 1, 0)).toEqual({ x: 2, z: 1 });
    const r = rotateOffset(2, 1, 1);
    expect(Math.abs(r.x) + Math.abs(r.z)).toBe(3);
    const full = rotateOffset(2, 1, 4);
    expect(full.x).toBe(2);
    expect(full.z).toBe(1);
  });

  it('scales and sums resource bags', () => {
    expect(scaleBag({ wood: 4, stone: 1 }, 3)).toEqual({ wood: 12, stone: 3 });
    expect(sumBags([{ wood: 1 }, { wood: 2, stone: 5 }])).toEqual({ wood: 3, stone: 5 });
  });

  it('explains what is missing', () => {
    expect(missingText({}, (id) => id)).toBeNull();
    expect(missingText({ wood: 12.2 }, () => 'Wood')).toBe('Need 13 more Wood');
    expect(missingText({ wood: 5, stone: 3 }, () => 'Wood')).toContain('(+1 more)');
  });

  it('refund estimate includes every level of upgrades', () => {
    expect(refundEstimate({ wood: 10 }, 1, 2)).toEqual({ wood: 10 });
    expect(refundEstimate({ wood: 10 }, 3, 2)).toEqual({ wood: 70 }); // 10 + 20 + 40
    expect(refundEstimate({ wood: 10 }, 2, 2, 0.5)).toEqual({ wood: 15 });
  });

  it('rect helpers', () => {
    const r = rectFrom(50, 40, 10, 90);
    expect(r).toEqual({ x: 10, y: 40, w: 40, h: 50 });
    expect(pointInRect(20, 50, r)).toBe(true);
    expect(pointInRect(5, 50, r)).toBe(false);
  });
});

describe('ui spin wheel geometry', () => {
  it('always lands the requested segment under the pointer', () => {
    for (const count of [4, 6, 8, 12]) {
      for (let idx = 0; idx < count; idx++) {
        for (const start of [0, 133.7, 720.2, -50]) {
          for (const jit of [-0.3, 0, 0.3]) {
            const to = spinTarget(start, idx, count, 5, jit);
            expect(to).toBeGreaterThan(start + 5 * 360 - 1);
            expect(segmentAtRotation(to, count)).toBe(idx);
          }
        }
      }
    }
  });
  it('ease out is monotonic from 0 to 1', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const e = easeOutQuart(Math.min(1, t));
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(easeOutQuart(1)).toBe(1);
  });
});

describe('ui time helpers', () => {
  it('formats the in-game clock and phases', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(0.5)).toBe('12:00');
    expect(clockText(0.4325)).toBe('10:22');
    expect(dayPhase(0.5).name).toBe('Day');
    expect(dayPhase(0.9).name).toBe('Night');
    expect(dayPhase(0.25).name).toBe('Sunrise');
    expect(dayPhase(0.75).name).toBe('Sunset');
  });
  it('formats countdowns', () => {
    expect(fmtHMS(125)).toBe('2:05');
    expect(fmtHMS(4932)).toBe('1:22:12');
    expect(fmtHMS(-4)).toBe('0:00');
    expect(fmtLong(16320)).toBe('4h 32m');
    expect(fmtLong(90)).toBe('1m');
  });
  it('knows how long until local midnight', () => {
    const noon = new Date(2026, 5, 15, 12, 0, 0).getTime();
    expect(msUntilLocalMidnight(noon)).toBe(12 * 3600 * 1000);
  });
});

describe('ui content descriptions', () => {
  const g = mkGame();
  it('describes building effects with level scaling', () => {
    const def = g.data.building('berry_patch')!;
    const l1 = buildingEffects(def, g.data, 1).map((t) => t.text).join(' ');
    expect(l1).toContain('+3/min');
    const l3 = buildingEffects(def, g.data, 3);
    expect(levelMult(def, 3)).toBeCloseTo(2, 5);
    expect(l3.some((t) => t.text.includes('+6/min'))).toBe(true);
    expect(buildingEffects(g.data.building('shelter')!, g.data).some((t) => t.text.includes('bed'))).toBe(true);
    expect(buildingEffects(g.data.building('scrap_turret')!, g.data).some((t) => t.icon === '🎯')).toBe(true);
  });
  it('explains why a building is locked', () => {
    const fake = { ...g.data.building('shelter')!, unlockTier: 2 };
    const l = lockInfo(fake, g.data, 0, []);
    expect(l).toEqual({ locked: true, kind: 'tier', text: 'Requires Stone tier' });
    const r = lockInfo({ ...fake, unlockTier: 0, research: 'tier_reinforced' }, g.data, 0, []);
    expect(r.kind).toBe('research');
    expect(r.text).toContain('Reinforced Wood');
    expect(lockInfo(fake, g.data, 2, []).locked).toBe(false);
  });
  it('words research modifiers', () => {
    expect(modifierText({ stat: 'gatherYield', add: 0.25 }, g.data)).toBe('Gather yield +25%');
    expect(modifierText({ stat: 'production:wood', mult: 1.5 }, g.data)).toBe('Wood production ×1.5');
    expect(modifierText({ stat: 'recruitSlots', add: 2 }, g.data)).toBe('Recruit slots +2');
  });
  it('flattens rewards for display', () => {
    const parts = rewardParts({ resources: { wood: 120 }, nova: 5, rp: 20, xp: 50, items: { bandage: 2 }, colonist: 'epic', boost: { kind: 'production', mult: 2, minutes: 15 } }, g.data);
    expect(parts.map((p) => p.kind)).toEqual(['resource', 'nova', 'rp', 'xp', 'item', 'colonist', 'boost']);
    expect(parts[0].amount).toBe('+120');
    expect(parts[4].amount).toBe('×2');
    expect(parts[5].color).toBe(RARITY_COLOR.epic);
    expect(rewardParts(null, g.data)).toEqual([]);
  });
  it('colonist presentation helpers', () => {
    expect(happinessFace(90).icon).toBe('😄');
    expect(happinessFace(10).icon).toBe('😟');
    expect(stars(3)).toBe('★★★☆☆');
    const svg = portraitSvg({ appearance: { skin: 1, hair: 4, hairColor: 2, outfit: 9, height: 1 } });
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});

describe('ui map math', () => {
  it('projects world <-> map and keeps the viewport inside the world', () => {
    const vp = { w: 400, h: 300, zoom: 1, cx: 0, cz: 0 };
    expect(mapScale(vp)).toBeCloseTo(300 / (CELL * WORLD_CELLS), 8);
    const p = worldToMap(vp, 100, -50);
    const w = mapToWorld(vp, p.x, p.y);
    expect(w.x).toBeCloseTo(100, 6);
    expect(w.z).toBeCloseTo(-50, 6);
    vp.zoom = 100;
    vp.cx = 10_000;
    clampViewport(vp);
    expect(vp.zoom).toBe(MAP_MAX_ZOOM);
    expect(vp.cx).toBeLessThanOrEqual(HALF_WORLD - HALF_WORLD / MAP_MAX_ZOOM + 1e-9);
  });
  it('finds the nearest marker, preferring travel targets', () => {
    const vp = { w: 400, h: 400, zoom: 1, cx: 0, cz: 0 };
    const markers: MapMarker[] = [
      { id: 'a', kind: 'poi', x: 0, z: 0, icon: 'a', label: 'a', travel: false },
      { id: 'b', kind: 'beacon', x: 8, z: 0, icon: 'b', label: 'b', travel: true },
    ];
    const c = worldToMap(vp, 3, 0);
    expect(nearestMarker(markers, vp, c.x, c.y, 30)?.id).toBe('b');
    expect(nearestMarker(markers, vp, 0, 0, 5)).toBeNull();
  });
  it('computes region centroids', () => {
    const map = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
    for (let z = 0; z < WORLD_CELLS; z++) for (let x = WORLD_CELLS / 2; x < WORLD_CELLS; x++) map[z * WORLD_CELLS + x] = 1;
    const c = regionCentroids(map, ['west', 'east']);
    expect(c.west.x).toBeLessThan(0);
    expect(c.east.x).toBeGreaterThan(0);
    expect(c.east.x).toBeCloseTo(cellCenter(Math.round(WORLD_CELLS * 0.75)), -1);
  });
});

describe('ui tree layout', () => {
  const mk = (id: string, pos: [number, number], requires: string[] = [], category = 'power'): ResearchDef => ({ id, name: id, description: '', icon: '•', category: category as never, tier: 0, cost: 1, requires, pos });
  it('lays out nodes on a grid, connects in-category prerequisites and never overlaps', () => {
    const defs = [mk('a', [0, 0]), mk('b', [1, 0], ['a']), mk('c', [1, 0], ['a']), mk('x', [0, 0], [], 'food'), mk('d', [2, 1], ['b', 'x'])];
    const t = layoutTree(defs, 'power');
    expect(t.nodes.map((n) => n.def.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    const seen = new Set(t.nodes.map((n) => `${n.x},${n.y}`));
    expect(seen.size).toBe(t.nodes.length); // duplicate pos is pushed to a free row
    expect(t.edges.map((e) => e.from + e.to).sort()).toEqual(['ab', 'ac', 'bd']); // x is in another category
    const b = t.nodes.find((n) => n.def.id === 'b')!;
    const e = t.edges.find((q) => q.to === 'b')!;
    expect(e.x2).toBe(b.x);
    expect(e.y2).toBe(b.y + NODE_H / 2);
    expect(t.width).toBeGreaterThan(NODE_W * 3);
  });
  it('lists every build category once', () => {
    const ids = BUILD_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('defense');
    expect(ids).toContain('decor');
  });
});

describe('ui badges', () => {
  it('counts claimable missions, idle workers and season rewards from the game state', () => {
    const g = mkGame();
    // a fresh colony has its daily reward, free spin and crate ready, but they are not advertised during
    // the guided first session...
    const lo = g.sys.liveops;
    expect(lo.dailyAvailable() && lo.canSpinFree() && lo.freeCrateReady()).toBe(true);
    expect(computeBadges(g)).toMatchObject({ missions: 0, research: 0, daily: false, spin: false, crate: false });
    // ...and the badges mirror the live-ops state once the first invasion is won
    g.state.stats.wavesWon = 1;
    expect(computeBadges(g)).toMatchObject({ missions: 0, research: 0, daily: true, spin: true, crate: true });
    // fake a claimable mission
    const m = g.data.missions[0];
    (g.sys.missions as any).active = () => [m];
    (g.sys.missions as any).progress = () => ({ value: m.count, target: m.count, done: true });
    expect(claimableMissions(g)).toEqual([m.id]);
    expect(computeBadges(g).missions).toBe(1);

    // idle colonists only count when a job slot is open
    expect(idleWithJobs(g)).toBe(0);
    g.state.colonists.list.push({ id: 1, workplace: null } as never);
    expect(idleWithJobs(g)).toBe(0);
    g.state.buildings.list.push({ id: 5, def: 'logging_camp', status: 'active', workers: [] } as never);
    expect(idleWithJobs(g)).toBe(1);

    // season: levels reached but not yet claimed
    (g.sys.liveops as any).seasonLevel = () => 3;
    expect(claimableSeason(g)).toBe(3);
    g.state.liveops.season.claimedFree = [1, 2];
    g.state.liveops.season.premium = true;
    expect(claimableSeason(g)).toBe(1 + 3);
  });
});

describe('Welcome Back worked-time line (QA3: "kept busy for 3h 37m" after a 4h 32m absence, no cap hit)', () => {
  const fmt = (s: number) => `${Math.round(s / 60)}m`;
  it('an absence under the offline cap just says the colony produced (efficiency is not a shorter shift)', () => {
    const away = 4 * 3600 + 32 * 60;
    expect(offlineWorkedText(away, away * 0.8, 0.8, fmt)).toBe('Your colony produced:');
  });
  it('an absence past the cap names the capped wall-clock time', () => {
    const cap = 8 * 3600;
    expect(offlineWorkedText(20 * 3600, cap * 0.8, 0.8, fmt)).toBe(`Your colony kept busy for ${cap / 60}m while you were gone:`);
  });
});

describe('ui.logic — side mission order', () => {
  const m = (id: string, minTier?: number) => ({ id, minTier }) as unknown as MissionDef;
  it('claimable first, then the newest tier, then board order', () => {
    const list = [m('a'), m('b'), m('c', 3), m('d', 5), m('e', 3)];
    expect(sideOrder(list, new Set(['b'])).map((x) => x.id)).toEqual(['b', 'd', 'c', 'e', 'a']);
    expect(sideOrder(list, new Set()).map((x) => x.id)).toEqual(['d', 'c', 'e', 'a', 'b']);
  });
});

describe('automatic daily-gift popup', () => {
  const base = { available: true, open: false, busy: false, shownDay: '', today: '2026-10-09' };
  it('opens once the screen is free, waits while it is busy', () => {
    expect(autoDailyStep(base)).toBe('open');
    expect(autoDailyStep({ ...base, busy: true })).toBe('wait');
    expect(autoDailyStep({ ...base, available: false })).toBe('skip');
    expect(autoDailyStep({ ...base, open: true })).toBe('skip');
  });
  it('a tapped gift reminder and the launch popup open it once a day: closed is closed', () => {
    expect(autoDailyStep({ ...base, shownDay: '2026-10-09' })).toBe('skip');
    expect(autoDailyStep({ ...base, shownDay: '2026-10-09', busy: true })).toBe('skip');
    expect(autoDailyStep({ ...base, shownDay: '2026-10-08' })).toBe('open'); // a new day (warm resume after midnight)
  });
});

describe('ui.logic — map label placement', () => {
  const map = { w: 320, h: 320 };
  it('keeps a label wholly inside the map (no "Crystal Canyo")', () => {
    const p = placeLabel(310, 100, 120, 16, map);
    expect(p.x + 60).toBeLessThanOrEqual(316);
    expect(placeLabel(2, 100, 120, 16, map).x - 60).toBeGreaterThanOrEqual(4);
    expect(placeLabel(160, 318, 80, 16, map).y + 8).toBeLessThanOrEqual(316);
    expect(placeLabel(160, 160, 80, 16, map)).toEqual({ x: 160, y: 160 }); // a label with room stays put
  });
  it('moves off a beacon it would hide, to just below it', () => {
    const p = placeLabel(160, 160, 90, 16, map, [{ x: 165, y: 158, r: 15 }]);
    expect(p.x).toBe(160);
    expect(p.y - 8).toBeGreaterThanOrEqual(158 + 15);
  });
  it('steps out from under the zoom buttons', () => {
    const zoom = { x: 270, y: 200, w: 44, h: 110 };
    const p = placeLabel(290, 250, 70, 16, map, [], [zoom]);
    expect(p.x + 35).toBeLessThanOrEqual(270);
    expect(p.y).toBe(250);
  });
});
