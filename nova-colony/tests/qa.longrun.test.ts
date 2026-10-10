/**
 * Four weeks and beyond (QA9 soak follow-ups): real-world timers across long absences and device clock changes, on a
 * real save from the four-week economy (tests/fixtures/save-alloy-retuned.txt: the pacing bot's colony the moment it
 * reached Advanced Alloy, day 5.6, two squads out, two dozen caches restocking), and the QA save tools the pacing bot
 * writes its tier saves with (tests/pacing/qa.ts).
 *
 * Cozy rule for timers on an absolute clock (recruitment board, free crate, expeditions, cache restocks): a device
 * clock set back never makes a wait longer than the wait itself, and a long absence never pays more than the offline
 * cap or more survivors than the board has seats.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { unwrapSave, wrapSave } from '../src/platform/saveCodec';
import { migrateState } from '../src/platform/saveMigrate';
import { deserializeState, serializeState, type GameState } from '../src/core/state';
import { dateKey } from '../src/core/format';
import { creditedSeconds } from '../src/sim/econ/offline';
import { arrivalSeconds } from '../src/sim/colony/recruitBoard';
import { notifySnapshot, planNotifications, MIN_LEAD_MS } from '../src/platform/notifyPlan';
import { rebaseSave, scanState, shiftDayKey, exportSave } from './pacing/qa';

const FIXTURE = path.join(__dirname, 'fixtures', 'save-alloy-retuned.txt');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function loadFixture(): GameState {
  const u = unwrapSave(fs.readFileSync(FIXTURE, 'utf8'));
  if ('error' in u) throw new Error(u.error);
  return migrateState(JSON.parse(u.json));
}

/** Boot a state with the wall clock at `at` (epoch ms). */
function boot(state: GameState, at: number) {
  const clock = { now: at };
  const game = new Game({ state, services: createMockServices(), clock: () => clock.now });
  game.start();
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.25) {
      clock.now += 250;
      game.update(0.25);
    }
  };
  return { game, clock, run };
}

/** Save and load again (the app closed and reopened at `at`). */
function reopen(game: Game, at: number) {
  const json = serializeState(game.state);
  game.dispose();
  return boot(deserializeState(json), at);
}

describe('QA save tools (tests/pacing/qa.ts)', () => {
  it('rebaseSave moves every epoch timer and day key together and nothing else', () => {
    const s = loadFixture();
    const before = JSON.parse(serializeState(s)) as GameState;
    const target = before.lastTickAt - 9 * DAY + 3 * HOUR;
    const out = rebaseSave(JSON.parse(serializeState(s)) as GameState, target);
    const delta = target - before.lastTickAt;
    expect(out.lastTickAt).toBe(target);
    expect(out.createdAt).toBe(before.createdAt + delta);
    expect(out.colonists.refreshAt).toBe(before.colonists.refreshAt + delta);
    expect(out.liveops.freeCrateAt).toBe(before.liveops.freeCrateAt + delta);
    out.expeditions.list.forEach((e, i) => expect(e.endsAt).toBe(before.expeditions.list[i].endsAt + delta));
    // the local day of the last tick and the daily gift keep their relation (claimed "today")
    expect(before.liveops.daily.lastClaim).toBe(dateKey(before.lastTickAt));
    expect(out.liveops.daily.lastClaim).toBe(dateKey(target));
    // gameplay numbers stay put
    expect(out.playTime).toBe(before.playTime);
    expect(out.resources.amounts).toEqual(before.resources.amounts);
    expect(out.combat.nextAt).toBe(before.combat.nextAt);
    expect(shiftDayKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDayKey('not-a-day', 3)).toBe('not-a-day');
  });

  it('exportSave writes the localStorage envelope the game loads', () => {
    const { game } = boot(loadFixture(), loadFixture().lastTickAt + 60_000);
    const raw = exportSave(game, Date.UTC(2026, 9, 10, 12));
    const u = unwrapSave(raw);
    expect('json' in u).toBe(true);
    expect(JSON.parse((u as { json: string }).json).lastTickAt).toBe(Date.UTC(2026, 9, 10, 12));
    expect(exportSave(game)).toBe(wrapSave(serializeState(game.state)));
  });

  it('scanState finds NaN and stray Infinity, and sizes every list and record', () => {
    const s = loadFixture();
    expect(scanState(s).nonFinite).toEqual([]);
    s.colonists.list[0].happiness = Number.NaN;
    s.resources.amounts.wood = Number.POSITIVE_INFINITY;
    s.combat.nextAt = Number.POSITIVE_INFINITY; // "no raid scheduled" is allowed
    const scan = scanState(s);
    expect(scan.nonFinite).toEqual(expect.arrayContaining(['colonists.list[].happiness=NaN', 'resources.amounts{}=Infinity']));
    expect(scan.nonFinite.some((p) => p.startsWith('combat.nextAt'))).toBe(false);
    expect(scan.sizes['buildings.list']).toBe(s.buildings.list.length);
    expect(scan.sizes['world.pois{}']).toBe(Object.keys(s.world.pois).length);
  });
});

describe('timers across a long absence (real Alloy save)', () => {
  it('a month away: Welcome Back pays the offline cap at most, the board fills its seats, squads are home, caches restocked', () => {
    const s = loadFixture();
    const seats = 4;
    const at = s.lastTickAt + 30 * DAY;
    const { game, run } = boot(s, at);
    const bal = game.data.balance;
    const off = game.pendingOffline!;
    expect(off).toBeTruthy();
    expect(off.seconds).toBeCloseTo(creditedSeconds(30 * 86400, bal.offlineHours * 3600 * game.sys.economy.modifier('offlineHours'), bal.offlineEfficiency, (bal.offlineFullMinutes ?? 0) * 60), 0);
    game.sys.liveops.claimOffline(false);
    run(3);
    const cs = game.state.colonists;
    expect(cs.candidates.length).toBeLessThanOrEqual(Math.max(seats, game.sys.colonists.boardSeats()));
    expect(cs.candidates.length).toBeGreaterThan(0);
    const next = game.sys.colonists.nextArrivalIn();
    expect(next === null || next <= arrivalSeconds(game)).toBe(true);
    expect(game.sys.expeditions.out().every((e) => game.sys.expeditions.secondsLeft(e) === 0)).toBe(true);
    expect(Object.values(game.state.world.pois).filter((p) => p.looted && p.restockAt !== undefined)).toEqual([]);
    expect(game.sys.liveops.freeCrateReady()).toBe(true);
    expect(game.sys.liveops.dailyAvailable()).toBe(true);
    expect(scanState(game.state).nonFinite).toEqual([]);
  });

  for (const [label, back] of [
    ['three hours', 3 * HOUR],
    ['two days', 2 * DAY],
] as const) {
    it(`the device clock set back ${label}: no Welcome Back, and no wait grows past its own length`, () => {
      const s = loadFixture();
      const trips = new Map(s.expeditions.list.map((e) => [e.id, e.endsAt - e.startedAt]));
      expect(trips.size).toBeGreaterThan(0);
      const { game } = boot(s, s.lastTickAt - back);
      expect(game.pendingOffline).toBeNull();
      const next = game.sys.colonists.nextArrivalIn();
      expect(next === null || next <= arrivalSeconds(game)).toBe(true);
      expect(game.sys.liveops.freeCrateSeconds()).toBeLessThanOrEqual(game.data.balance.freeCrateHours * 3600);
      for (const e of game.sys.expeditions.out()) expect(game.sys.expeditions.secondsLeft(e) * 1000).toBeLessThanOrEqual(trips.get(e.id)! + 1000);
      expect(scanState(game.state).nonFinite).toEqual([]);
    });
  }

  it('timers started while the clock ran a week fast wait their normal length once it is corrected', () => {
    const s = loadFixture();
    const real = s.lastTickAt + HOUR;
    // the clock runs a week fast: survivors arrive (that is the clock's doing), then recruit one, send a squad, open the crate
    let { game } = boot(s, real + 7 * DAY);
    const cs = game.state.colonists;
    const g = game;
    g.state.resources.amounts.food = 1e9;
    g.state.resources.amounts.water = 1e9;
    for (const r of g.data.resources) g.state.resources.amounts[r.id] = Math.max(g.state.resources.amounts[r.id] ?? 0, g.sys.economy.capacity(r.id));
    if (game.pendingOffline) game.sys.liveops.claimOffline(false);
    game.update(0.25);
    expect(cs.candidates.length).toBeGreaterThan(0);
    // a bed for the recruit
    if (g.sys.colonists.freeBeds() <= 0) g.state.colonists.list.pop();
    expect(g.sys.colonists.recruit(0)).toBe(true);
    if (g.sys.liveops.freeCrateReady()) g.sys.liveops.openFreeCrate(false);
    const dest = g.sys.expeditions.destinations().find((d) => d.ok && d.def.duration <= HOUR);
    const crew = g.sys.expeditions.candidates().slice(0, 1).map((c) => c.id);
    const trip = dest ? g.sys.expeditions.launch(dest.def.id, crew) : null;
    // ... and the clock is put right
    ({ game } = reopen(game, real + 10 * 60_000));
    const next = game.sys.colonists.nextArrivalIn();
    expect(next).not.toBeNull();
    expect(next!).toBeLessThanOrEqual(arrivalSeconds(game));
    expect(game.sys.liveops.freeCrateSeconds()).toBeLessThanOrEqual(game.data.balance.freeCrateHours * 3600);
    if (trip) {
      const e = game.sys.expeditions.get(trip.id)!;
      expect(game.sys.expeditions.secondsLeft(e) * 1000).toBeLessThanOrEqual(trip.endsAt - trip.startedAt + 1000);
    }
  });

  it('back and forth across midnight and DST-sized jumps leaves nothing non-finite and never pays an absence twice', () => {
    const s = loadFixture();
    let at = s.lastTickAt;
    let { game } = boot(s, at);
    let credited = 0;
    for (const jump of [-HOUR, 26 * HOUR, -3 * DAY, 4 * DAY, 9 * HOUR, -1, 12 * HOUR]) {
      at += jump;
      ({ game } = reopen(game, at));
      if (game.pendingOffline) {
        credited += game.pendingOffline.away ?? game.pendingOffline.seconds;
        game.sys.liveops.claimOffline(false);
      }
      for (let i = 0; i < 40; i++) game.update(0.25);
      at += 10_000;
      expect(scanState(game.state).nonFinite).toEqual([]);
    }
    // credited absence never exceeds the real forward time that passed
    expect(credited / 3600).toBeLessThanOrEqual((26 + 4 * 24 + 9 + 12) * 1.001);
  });

  it('the reminder plan after a long session stays within the cozy rules', () => {
    const s = loadFixture();
    const { game } = boot(s, s.lastTickAt + 20 * 60_000);
    if (game.pendingOffline) game.sys.liveops.claimOffline(false);
    const now = game.now();
    const plan = planNotifications(notifySnapshot(game));
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThanOrEqual(3);
    for (const p of plan) {
      expect(Number.isFinite(p.at)).toBe(true);
      expect(p.at).toBeGreaterThanOrEqual(now + MIN_LEAD_MS - 1);
      expect(p.body).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
