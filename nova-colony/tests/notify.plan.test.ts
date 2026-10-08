/**
 * Local-notification planning (src/platform/notifyPlan.ts): timing from the economy's real offline model, quiet
 * hours, merging, the cap of three, stable ids, the daily gift and the snapshot read from a running game.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createInitialState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';
import { msUntilLocalMidnight } from '../src/ui/logic/time';
import type { OfflineModel } from '../src/sim/econ/offline';
import {
  ALL_NOTIFY_IDS,
  MAX_SCHEDULED,
  MIN_LEAD_MS,
  MISS_YOU_AFTER_MS,
  NOTIFY_IDS,
  QUIET_FROM_HOUR,
  QUIET_UNTIL_HOUR,
  deviceUtcOffset,
  forecastStorage,
  nextLocalMidnight,
  notifySnapshot,
  outsideQuietHours,
  planNotifications,
  type NotifySnapshot,
  type UtcOffset,
} from '../src/platform/notifyPlan';
import { addBuilding, addColonist, makeGame, resetColony } from './economy.helpers';

const MIN = 60_000;
const HOUR = 3_600_000;
const UTC: UtcOffset = () => 0;
/** 2026-10-08 09:00 UTC (a Thursday morning). */
const MORNING = Date.UTC(2026, 9, 8, 9, 0);
const at = (h: number, m = 0, day = 8) => Date.UTC(2026, 9, day, h, m);
const localHourOf = (ms: number, tz: UtcOffset) => new Date(ms + tz(ms) * MIN).getUTCHours();

type SnapOpts = Partial<NotifySnapshot> & { flows?: OfflineModel['flows']; perMin?: number; eff?: number; capH?: number; mult?: number; busy?: boolean };

/**
 * Wood at `perMin` filling `capacity` (storageMult 1, efficiency 1 unless overridden). `busy` adds stone at 1/min
 * into an unlimited store, so the colony is still producing at the offline cap.
 */
function snap(o: SnapOpts = {}): NotifySnapshot {
  const flows: OfflineModel['flows'] = o.flows ?? [{ ins: [], outs: [['wood', o.perMin ?? 10]] }];
  if (o.busy) flows.push({ ins: [], outs: [['stone', 1]] });
  return {
    now: o.now ?? MORNING,
    colonyName: o.colonyName ?? 'New Hope',
    colonists: o.colonists ?? 3,
    offline: {
      model: o.offline?.model ?? { flows, upkeep: [], rpPerMin: 0 },
      efficiency: o.eff ?? 1,
      capSeconds: (o.capH ?? 8) * 3600,
      storageMult: o.mult ?? 1,
    },
    amounts: o.amounts ?? { wood: 0 },
    capacity: { ...(o.capacity ?? { wood: 600 }), ...(o.busy ? { stone: 1e15 } : {}) },
    names: o.names ?? { wood: 'Wood', stone: 'Stone', food: 'Food', water: 'Water', energy_cell: 'Energy Cell' },
    daily: o.daily ?? { claimable: true, offered: true, nextDay: 3 },
  };
}

describe('notify plan: storage full', () => {
  it('times "storage full" from the shipped balance: real producer, 80% offline efficiency, Welcome Back 3× storage', () => {
    const clock = { now: MORNING };
    const game = new Game({ seed: 7, clock: () => clock.now }); // real content + real balance
    game.start();
    resetColony(game);
    // a self-running producer from the real catalogue (no workers, inputs or power)
    const def = game.data.buildings.find((b) => b.produces && !b.consumes && !b.workers && !b.power && !b.factory && Object.keys(b.produces).length === 1)!;
    expect(def).toBeTruthy();
    const [res, perMin] = Object.entries(def.produces!)[0] as [string, number];
    addBuilding(game, def.id);
    const s = notifySnapshot(game);
    const bal = game.data.balance;
    expect(s.offline.efficiency).toBe(bal.offlineEfficiency);
    expect(s.offline.storageMult).toBe(bal.offlineStorageMult ?? 1);
    expect(s.offline.capSeconds).toBe(bal.offlineHours * 3600);
    const limit = game.derived.capacity[res] * (bal.offlineStorageMult ?? 1);
    const expectedMin = limit / (perMin * bal.offlineEfficiency);
    const f = forecastStorage(s);
    expect(f.resources).toEqual([res]);
    expect(Math.abs(f.firstFullMs! / MIN - expectedMin)).toBeLessThan(0.5);

    const plan = planNotifications(s, { utcOffset: UTC });
    const storage = plan.find((n) => n.kind === 'storage')!;
    expect(storage).toBeTruthy();
    expect(Math.abs((storage.at - MORNING) / MIN - expectedMin)).toBeLessThan(0.5); // 09:00 + a few hours: daytime
    expect(storage.body.toLowerCase()).toContain(game.data.resource(res)!.name.toLowerCase());
    // and it agrees with what Welcome Back would actually credit at that moment
    const credited = game.sys.economy.computeOffline((storage.at - MORNING) / 1000 + 60);
    expect(Math.floor((game.state.resources.amounts[res] ?? 0) + (credited.gains[res] ?? 0))).toBeGreaterThanOrEqual(Math.floor(limit) - 1);
  });

  it('follows the colony: staffing, upkeep from fresh production and research bonuses change the timing', () => {
    const { game, clock } = makeGame();
    clock.now = MORNING;
    addBuilding(game, 't_mine'); // 6 ore / min
    game.state.resources.amounts.t_ore = 1500;
    const capOre = () => game.derived.capacity.t_ore;
    const s1 = notifySnapshot(game);
    const mult = s1.offline.storageMult;
    const eff = s1.offline.efficiency;
    const m1 = forecastStorage(s1).firstFullMs! / MIN;
    expect(m1).toBeCloseTo((capOre() * mult - 1500) / (6 * eff), 0);
    game.state.research.completed.push('t_res_ore'); // ×1.5 ore
    game.sys.economy.markDirty();
    const m2 = forecastStorage(notifySnapshot(game)).firstFullMs! / MIN;
    expect(m2).toBeCloseTo((capOre() * mult - 1500) / (9 * eff), 0);

    // food: farm 6/min, two colonists eat 0.5/min each -> net 5/min (upkeep is paid from what the farm makes)
    resetColony(game);
    addBuilding(game, 't_farm');
    addColonist(game);
    addColonist(game);
    game.state.resources.amounts.food = 0;
    const s3 = notifySnapshot(game);
    const m3 = forecastStorage(s3).firstFullMs! / MIN;
    expect(m3).toBeCloseTo((game.derived.capacity.food * mult) / (5 * eff), 0);
  });

  it('never for a resource that does not grow, or whose store is effectively unlimited', () => {
    // no production
    let p = planNotifications(snap({ flows: [] }), { utcOffset: UTC });
    expect(p.map((n) => n.kind)).toEqual(['miss']);
    // production ≤ 0: everything eaten by upkeep (which is only ever paid from fresh production)
    p = planNotifications(snap({ offline: { model: { flows: [{ ins: [], outs: [['food', 1]] }], upkeep: [['food', 2]], rpPerMin: 0 }, efficiency: 1, capSeconds: 8 * 3600, storageMult: 1 }, amounts: { food: 10 }, capacity: { food: 100 } }), { utcOffset: UTC });
    expect(p.some((n) => n.kind === 'storage')).toBe(false);
    expect(p.some((n) => n.kind === 'offline')).toBe(false);
    // a zero-rate flow
    expect(forecastStorage(snap({ perMin: 0 })).firstFullMs).toBeNull();
    // unlimited storage: never "full", but the colony is still busy at the offline cap
    p = planNotifications(snap({ capacity: { wood: 1e15 } }), { utcOffset: UTC });
    expect(p.some((n) => n.kind === 'storage')).toBe(false);
    expect(p.some((n) => n.kind === 'offline')).toBe(true);
    p = planNotifications(snap({ capacity: { wood: Infinity } }), { utcOffset: UTC });
    expect(p.some((n) => n.kind === 'storage')).toBe(false);
  });

  it('only when at least 30 minutes away, and before the offline cap', () => {
    // 600 wood at 10/min = 60 min: fine
    const s60 = planNotifications(snap(), { utcOffset: UTC }).find((n) => n.kind === 'storage')!;
    expect(Math.abs(s60.at - (MORNING + 60 * MIN))).toBeLessThan(MIN); // within one unit of wood (6 s)
    // full in 20 min: too soon for a reminder
    expect(planNotifications(snap({ capacity: { wood: 200 } }), { utcOffset: UTC }).some((n) => n.kind === 'storage')).toBe(false);
    // fills after the 8 h cap (production stops first): the offline reminder covers it
    const late = planNotifications(snap({ capacity: { wood: 10 * 60 * 9 } }), { utcOffset: UTC });
    expect(late.some((n) => n.kind === 'storage')).toBe(false);
    expect(late.some((n) => n.kind === 'offline')).toBe(true);
  });

  it('a resource that is (nearly) full already is not news: the next one to fill is', () => {
    const s = snap({
      flows: [{ ins: [], outs: [['wood', 10], ['stone', 10]] }],
      amounts: { wood: 590, stone: 0 },
      capacity: { wood: 600, stone: 1200 },
    });
    const f = forecastStorage(s, MIN_LEAD_MS);
    expect(f.resources).toEqual(['stone']);
    expect(f.firstFullMs! / MIN).toBeCloseTo(120, 0);
    const n = planNotifications(s, { utcOffset: UTC }).find((x) => x.kind === 'storage')!;
    expect(n.body).toBe("Come spend your stone. There's no room left for more!");
    expect(n.at - MORNING).toBeGreaterThanOrEqual(MIN_LEAD_MS);
  });

  it('names the resources that fill together (up to two)', () => {
    const s = snap({
      flows: [{ ins: [], outs: [['wood', 10], ['stone', 10], ['food', 10]] }],
      amounts: { wood: 0, stone: 0, food: 0 },
      capacity: { wood: 600, stone: 900, food: 3000 },
    });
    const n = planNotifications(s, { utcOffset: UTC }).find((x) => x.kind === 'storage')!;
    expect(n.title).toBe('Your storehouses are bursting! 📦');
    expect(n.body).toBe("Come spend your wood and stone. There's no room left for more!");
    expect(forecastStorage(s).resources).toEqual(['wood', 'stone']); // food fills 4 h later
    // countable names read as plurals
    const cells = snap({ flows: [{ ins: [], outs: [['energy_cell', 10]] }], amounts: {}, capacity: { energy_cell: 600 } });
    expect(planNotifications(cells, { utcOffset: UTC })[0].body).toContain('your energy cells.');
  });

  it('converters only run while their inputs last (the same simulation Welcome Back runs)', () => {
    // a smelter turning a 300-ore stockpile into bars: bars stop at 150, long before their 1000 capacity
    const model: OfflineModel = { flows: [{ ins: [['ore', 6]], outs: [['bar', 3]] }], upkeep: [], rpPerMin: 0 };
    const s = snap({ offline: { model, efficiency: 1, capSeconds: 8 * 3600, storageMult: 1 }, amounts: { ore: 300, bar: 0 }, capacity: { ore: 1000, bar: 1000 } });
    expect(forecastStorage(s).firstFullMs).toBeNull();
    expect(forecastStorage(s).producingAtCap).toBe(false); // nothing left to do after 50 min
    expect(planNotifications(s, { utcOffset: UTC }).some((n) => n.kind === 'offline')).toBe(false);
  });
});

describe('notify plan: offline cap, daily gift, "we miss you"', () => {
  it('offline cap: when production stops (8 h, longer with bonuses), only while something is still being made', () => {
    const p = planNotifications(snap({ capacity: { wood: 1e9 } }), { utcOffset: UTC });
    const off = p.find((n) => n.kind === 'offline')!;
    expect(off.at).toBe(MORNING + 8 * HOUR); // 17:00
    expect(off.id).toBe(NOTIFY_IDS.offline);
    expect(off.title).toBe('Time to collect! 🧺');
    expect(off.body).toBe('Your colonists have been busy for 8 hours. Come collect!');
    const vip = planNotifications(snap({ capH: 12, capacity: { wood: 1e9 }, colonists: 0 }), { utcOffset: UTC }).find((n) => n.kind === 'offline')!;
    expect(vip.at).toBe(MORNING + 12 * HOUR);
    expect(vip.body).toBe('Your colony has been busy for 12 hours. Come collect!');
    // everything full long before the cap and no research: nothing more happens at 8 h
    const full = planNotifications(snap({ capacity: { wood: 900 } }), { utcOffset: UTC });
    expect(full.map((n) => n.kind)).toEqual(['storage', 'miss']);
    // research keeps going even with full stores
    const rp = snap({ capacity: { wood: 900 } });
    rp.offline.model = { ...rp.offline.model, rpPerMin: 2 };
    expect(planNotifications(rp, { utcOffset: UTC }).some((n) => n.kind === 'offline')).toBe(true);
  });

  it('the cap follows offline-hours research / Colony Pass in a real game', () => {
    const { game, clock } = makeGame();
    clock.now = MORNING;
    expect(notifySnapshot(game).offline.capSeconds).toBe(8 * 3600);
    game.state.liveops.vip.until = clock.now + 86_400_000; // +4 h (test data)
    game.sys.economy.markDirty();
    expect(notifySnapshot(game).offline.capSeconds).toBe(12 * 3600);
  });

  it('daily gift: only once today’s is claimed, at the reset (local midnight) moved to 08:00, opening the gift panel', () => {
    const claimed = { claimable: false, offered: true, nextDay: 4 };
    const p = planNotifications(snap({ flows: [], daily: claimed }), { utcOffset: UTC });
    const d = p.find((n) => n.kind === 'daily')!;
    expect(d.at).toBe(at(8, 0, 9));
    expect(d.title).toBe('Your daily gift is ready! 🎁');
    expect(d.body).toBe('Good morning! Your day 4 gift is waiting in New Hope. Come and unwrap it!');
    expect(d.panel).toBe('daily');
    expect(d.id).toBe(NOTIFY_IDS.daily);
    // waiting right now: no reminder
    expect(planNotifications(snap({ flows: [], daily: { claimable: true, offered: true, nextDay: 4 } }), { utcOffset: UTC }).some((n) => n.kinds.includes('daily'))).toBe(false);
    // not offered yet (guided first session): no reminder
    expect(planNotifications(snap({ flows: [], daily: { claimable: false, offered: false, nextDay: 1 } }), { utcOffset: UTC }).some((n) => n.kinds.includes('daily'))).toBe(false);
    // the reset follows the local calendar: 23:50 in UTC+2 is 21:50 UTC
    const tz2: UtcOffset = () => 120;
    const late = planNotifications(snap({ flows: [], now: at(21, 50), daily: claimed }), { utcOffset: tz2 }).find((n) => n.kind === 'daily')!;
    expect(late.at).toBe(at(6, 0, 9)); // 08:00 local on the 9th
  });

  it('one "we miss you" a day later and nothing beyond it', () => {
    const p = planNotifications(snap({ flows: [] }), { utcOffset: UTC });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ kind: 'miss', id: NOTIFY_IDS.miss, at: MORNING + MISS_YOU_AFTER_MS, title: 'New Hope misses you 💛', panel: 'daily' });
    expect(p[0].body).toBe("Your colonists keep looking up at the sky, hoping you'll visit. Pop in and say hello! A daily gift is waiting too. 🎁");
    const lonely = planNotifications(snap({ flows: [], colonists: 0, colonyName: '', daily: { claimable: true, offered: false, nextDay: 1 } }), { utcOffset: UTC })[0];
    expect(lonely.title).toBe('Your colony misses you 💛');
    expect(lonely.body).toBe('Your little colony is waiting for you. Pop in and say hello!');
    expect(lonely.panel).toBeUndefined();
    // whatever the colony, nothing is planned past the day-after reminder (+ its quiet-hours move)
    for (let h = 0; h < 24; h++) {
      for (const n of planNotifications(snap({ now: at(h), daily: { claimable: false, offered: true, nextDay: 2 } }), { utcOffset: UTC })) {
        expect(n.at - at(h)).toBeLessThanOrEqual(MISS_YOU_AFTER_MS + 10 * HOUR);
      }
    }
  });
});

describe('notify plan: quiet hours, merging, cap, ids', () => {
  it('quiet hours: nothing from 22:00 to 08:00 local time; moved to 08:00 with a good morning', () => {
    const tz: UtcOffset = () => 120; // UTC+2
    // leave at 21:30 local (19:30 UTC): storage at 22:30 local -> 08:00 local next day
    const s = snap({ now: at(19, 30), capacity: { wood: 600 }, busy: true, daily: { claimable: true, offered: true, nextDay: 2 } });
    const p = planNotifications(s, { utcOffset: tz });
    for (const n of p) {
      const h = localHourOf(n.at, tz);
      expect(h >= QUIET_UNTIL_HOUR && h < QUIET_FROM_HOUR).toBe(true);
    }
    // storage (22:30) and offline cap (05:30) both land at 08:00: one notification, led by the offline cap
    expect(p[0].at).toBe(at(6, 0, 9));
    expect(p[0].kind).toBe('offline');
    expect(p[0].kinds.sort()).toEqual(['offline', 'storage']);
    expect(p[0].body).toBe('Good morning! Your colonists have been busy for 8 hours. Come collect!');
    expect(outsideQuietHours(at(7, 59), UTC)).toEqual({ at: at(8, 0), shifted: true });
    expect(outsideQuietHours(at(22, 0), UTC)).toEqual({ at: at(8, 0, 9), shifted: true });
    expect(outsideQuietHours(at(21, 59), UTC)).toEqual({ at: at(21, 59), shifted: false });
    expect(outsideQuietHours(at(8, 0), UTC)).toEqual({ at: at(8, 0), shifted: false });
  });

  it('the evening case: storage, offline cap and daily gift become one good-morning notification', () => {
    // wood full at 22:30, offline cap at 04:00, gift reset at midnight
    const s = snap({ now: at(20, 0), capacity: { wood: 1500 }, busy: true, daily: { claimable: false, offered: true, nextDay: 5 } });
    const p = planNotifications(s, { utcOffset: UTC });
    expect(p[0]).toMatchObject({ kind: 'offline', id: NOTIFY_IDS.offline, at: at(8, 0, 9), panel: 'daily' });
    expect(p[0].kinds.sort()).toEqual(['daily', 'offline', 'storage']);
    expect(p[0].body).toBe('Good morning! Your colonists have been busy for 8 hours. Come collect! Your daily gift is ready too. 🎁');
    expect(p.map((n) => n.kind)).toEqual(['offline', 'miss']);
  });

  it('reminders under an hour apart merge, sent once all of it is true', () => {
    // storage at 16:20, offline cap at 17:00 (left at 09:00)
    const s = snap({ capacity: { wood: 10 * 440 }, busy: true });
    const p = planNotifications(s, { utcOffset: UTC });
    expect(p[0].kinds).toEqual(['storage', 'offline']);
    expect(p[0].kind).toBe('offline');
    expect(p[0].at).toBe(MORNING + 8 * HOUR);
    // 90 minutes apart: two notifications
    const apart = planNotifications(snap({ capacity: { wood: 10 * 390 }, busy: true }), { utcOffset: UTC });
    expect(apart.map((n) => n.kind)).toEqual(['storage', 'offline', 'miss']);
  });

  it('never more than three; the "we miss you" goes first', () => {
    // left at noon: storage 13:00, offline cap 20:00, daily 08:00 tomorrow, miss 12:00 tomorrow — four reasons
    const s = snap({ now: at(12, 0), capacity: { wood: 600 }, busy: true, daily: { claimable: false, offered: true, nextDay: 2 } });
    const p = planNotifications(s, { utcOffset: UTC });
    expect(p).toHaveLength(MAX_SCHEDULED);
    expect(p.map((n) => n.kind)).toEqual(['storage', 'offline', 'daily']);
    expect(Math.abs(p[0].at - at(13, 0))).toBeLessThan(MIN);
    expect(p.slice(1).map((n) => n.at)).toEqual([at(20, 0), at(8, 0, 9)]);
  });

  it('stable ids: one per kind, the same on every reschedule, so the OS replaces instead of duplicating', () => {
    const s = snap({ now: at(12, 0), daily: { claimable: false, offered: true, nextDay: 2 } });
    const a = planNotifications(s, { utcOffset: UTC });
    const b = planNotifications({ ...s, now: s.now + 7 * MIN }, { utcOffset: UTC });
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(new Set(ALL_NOTIFY_IDS).size).toBe(Object.keys(NOTIFY_IDS).length);
    for (const n of a) {
      expect(ALL_NOTIFY_IDS).toContain(n.id);
      expect(n.id).toBe(NOTIFY_IDS[n.kind]);
      expect(Number.isInteger(n.id) && n.id > 0 && n.id < 2 ** 31).toBe(true);
    }
    expect(new Set(a.map((n) => n.id)).size).toBe(a.length);
  });

  it('every plan, any hour, any time zone: ≤ 3, ≥ 30 min out, outside quiet hours, an hour apart, earliest first', () => {
    const zones = [-300, 0, 330, 780];
    const shapes: SnapOpts[] = [
      {},
      { busy: true },
      { capacity: { wood: 1500 }, busy: true },
      { capacity: { wood: 1200 } },
      { capacity: { wood: 4200 } },
      { capacity: { wood: 1e15 } },
      { flows: [] },
      { amounts: { wood: 599.5 } },
    ];
    for (const off of zones) {
      const tz: UtcOffset = () => off;
      for (let q = 0; q < 48; q++) {
        const now = at(0) + q * 30 * MIN + (off % 60) * MIN;
        for (const shape of shapes) {
          for (const claimable of [true, false]) {
            const p = planNotifications(snap({ ...shape, now, daily: { claimable, offered: true, nextDay: 1 } }), { utcOffset: tz });
            expect(p.length).toBeLessThanOrEqual(MAX_SCHEDULED);
            p.forEach((n, i) => {
              expect(n.at - now).toBeGreaterThanOrEqual(MIN_LEAD_MS);
              const h = localHourOf(n.at, tz);
              expect(h >= QUIET_UNTIL_HOUR && h < QUIET_FROM_HOUR).toBe(true);
              if (i > 0) expect(n.at - p[i - 1].at).toBeGreaterThan(60 * MIN);
              expect(n.title.length).toBeGreaterThan(0);
              expect(n.body).not.toMatch(/undefined|NaN/);
            });
          }
        }
      }
    }
  });

  it('local midnight matches the daily reset clock the game uses', () => {
    for (const t of [MORNING, at(23, 59), at(0, 0, 9), Date.UTC(2026, 2, 29, 0, 30), Date.UTC(2026, 9, 25, 0, 30)]) {
      expect(nextLocalMidnight(t, deviceUtcOffset)).toBe(t + msUntilLocalMidnight(t));
    }
  });
});

describe('notify plan: snapshot from a running game', () => {
  it('reads the colony, its resources and the daily gift state', () => {
    const clock = { now: MORNING };
    const game = new Game({ seed: 3, clock: () => clock.now });
    game.start();
    const s = notifySnapshot(game);
    expect(s.now).toBe(MORNING);
    expect(s.colonyName).toBe(game.state.colony.name);
    expect(s.names.wood).toBe('Wood');
    expect(s.capacity.wood).toBe(game.derived.capacity.wood);
    expect(s.daily).toEqual({ claimable: true, offered: false, nextDay: 1 }); // guided first session: gifts not offered yet
    game.state.tutorial.done = true;
    game.sys.liveops.claimDaily();
    expect(notifySnapshot(game).daily).toEqual({ claimable: false, offered: true, nextDay: 2 });
    // the snapshot is a copy: planning never touches the game
    const before = JSON.stringify(game.state.resources);
    planNotifications(notifySnapshot(game));
    expect(JSON.stringify(game.state.resources)).toBe(before);
  });
});

describe('notification settings', () => {
  it('new colonies: off and never asked', () => {
    const s = createInitialState(1, MORNING).settings;
    expect(s.notifications).toBe(false);
    expect(s.notifyAsked).toBe(false);
  });

  it('old saves get the new fields from the default fill; answers already given survive', () => {
    const old = createInitialState(1, MORNING) as any;
    delete old.settings.notifications;
    delete old.settings.notifyAsked;
    old.version = 1;
    const m = migrateState(JSON.parse(JSON.stringify(old)));
    expect(m.settings.notifications).toBe(false);
    expect(m.settings.notifyAsked).toBe(false);
    expect(m.settings.music).toBe(old.settings.music);

    const answered = createInitialState(1, MORNING) as any;
    answered.settings.notifications = true;
    answered.settings.notifyAsked = true;
    const kept = migrateState(JSON.parse(JSON.stringify(answered)));
    expect(kept.settings.notifications).toBe(true);
    expect(kept.settings.notifyAsked).toBe(true);

    const junk = createInitialState(1, MORNING) as any;
    junk.settings.notifications = 'yes';
    junk.settings.notifyAsked = null;
    const fixed = migrateState(JSON.parse(JSON.stringify(junk)));
    expect(fixed.settings.notifications).toBe(false);
    expect(fixed.settings.notifyAsked).toBe(false);
  });
});
