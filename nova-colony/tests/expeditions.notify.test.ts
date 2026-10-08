/**
 * The "your explorers are home" reminder in the local-notification planner: timing from the absolute expedition
 * timers, the 30-minute lead, quiet hours, merging with other reminders, the cap of three, the panel it opens, and
 * the snapshot read from a running game.
 */
import { describe, expect, it } from 'vitest';
import { MAX_SCHEDULED, MERGE_WINDOW_MS, MIN_LEAD_MS, NOTIFY_IDS, notifySnapshot, planNotifications, type NotifySnapshot, type UtcOffset } from '../src/platform/notifyPlan';
import { readTap } from '../src/platform/notifications';
import { HOUR, MIN, crew, makeColony } from './expeditions.helpers';

const UTC: UtcOffset = () => 0;
/** 2026-10-08 09:00 UTC. */
const MORNING = Date.UTC(2026, 9, 8, 9, 0);
const at = (h: number, m = 0, day = 8) => Date.UTC(2026, 9, day, h, m);

/** A quiet colony (nothing fills, daily gift waiting) with squads out. */
function snap(squads: { at: number; name: string }[], o: Partial<NotifySnapshot> = {}): NotifySnapshot {
  return {
    now: MORNING,
    colonyName: 'New Hope',
    colonists: 5,
    offline: { model: { flows: [], upkeep: [], rpPerMin: 0 }, efficiency: 1, capSeconds: 8 * 3600, storageMult: 1 },
    amounts: {},
    capacity: {},
    names: { wood: 'Wood' },
    daily: { claimable: true, offered: true, nextDay: 2 },
    expeditions: squads,
    ...o,
  };
}

describe('expeditions × notifications', () => {
  it('reminds when the first squad still out is back, and opens the Expeditions panel', () => {
    const p = planNotifications(snap([{ at: MORNING + 3 * HOUR, name: 'Wreck Salvage' }]), { utcOffset: UTC });
    const n = p.find((x) => x.kind === 'expedition')!;
    expect(n).toMatchObject({ id: NOTIFY_IDS.expedition, at: MORNING + 3 * HOUR, panel: 'expeditions', title: 'Your explorers are home! 🧭' });
    expect(n.body).toContain('Wreck Salvage');
  });

  it('never within 30 minutes of leaving: a squad back sooner is announced at the 30-minute mark', () => {
    const p = planNotifications(snap([{ at: MORNING + 10 * MIN, name: 'Pod Debris Sweep' }]), { utcOffset: UTC });
    expect(p.find((x) => x.kind === 'expedition')!.at).toBe(MORNING + MIN_LEAD_MS);
  });

  it('a haul already waiting needs no reminder', () => {
    const p = planNotifications(snap([{ at: MORNING - MIN, name: 'Shard Hunt' }]), { utcOffset: UTC });
    expect(p.some((x) => x.kind === 'expedition')).toBe(false);
    expect(planNotifications(snap([]), { utcOffset: UTC }).some((x) => x.kind === 'expedition')).toBe(false);
    const legacy = snap([]);
    delete legacy.expeditions; // snapshots without the field (older callers) still plan
    expect(planNotifications(legacy, { utcOffset: UTC }).length).toBeGreaterThan(0);
  });

  it('respects quiet hours: a squad back at 23:30 is announced at 08:00 with a good morning', () => {
    const s = snap([{ at: at(23, 30), name: 'Silver Summit' }], { now: at(16, 0) });
    const n = planNotifications(s, { utcOffset: UTC }).find((x) => x.kind === 'expedition')!;
    expect(n.at).toBe(at(8, 0, 9));
    expect(n.body.startsWith('Good morning!')).toBe(true);
  });

  it('squads back within the hour share one notification', () => {
    const s = snap([
      { at: MORNING + 2 * HOUR, name: 'Wreck Salvage' },
      { at: MORNING + 2 * HOUR + 40 * MIN, name: 'Glyph Rubbings' },
      { at: MORNING + 7 * HOUR, name: 'Frozen Lab Recovery' },
    ]);
    const exp = planNotifications(s, { utcOffset: UTC }).filter((x) => x.kinds.includes('expedition'));
    expect(exp).toHaveLength(1);
    expect(exp[0].body).toMatch(/^2 squads are back/);
    expect(exp[0].at).toBe(MORNING + 2 * HOUR + 40 * MIN); // sent once both are home (only true things)
  });

  it('merges with a reminder an hour apart, leads it (a haul beats a full storehouse) and keeps the cap of three', () => {
    // wood fills at ~2 h; the squad is back 30 min later -> one notification, led by the squad, at the later time
    const s = snap([{ at: MORNING + 2 * HOUR + 30 * MIN, name: 'Wreck Salvage' }], {
      offline: { model: { flows: [{ ins: [], outs: [['wood', 10]] }, { ins: [], outs: [['stone', 1]] }], upkeep: [], rpPerMin: 0 }, efficiency: 1, capSeconds: 8 * 3600, storageMult: 1 },
      amounts: { wood: 0 },
      capacity: { wood: 1200, stone: 1e15 },
      names: { wood: 'Wood', stone: 'Stone' },
      daily: { claimable: false, offered: true, nextDay: 3 },
    });
    const p = planNotifications(s, { utcOffset: UTC });
    expect(p.length).toBeLessThanOrEqual(MAX_SCHEDULED);
    const lead = p.find((x) => x.kinds.includes('expedition'))!;
    expect(lead.kind).toBe('expedition');
    expect(lead.kinds).toContain('storage');
    expect(lead.at - MORNING).toBeLessThanOrEqual(2 * HOUR + 30 * MIN);
    expect(lead.at - MORNING).toBeGreaterThanOrEqual(2 * HOUR + 30 * MIN - MERGE_WINDOW_MS);
    // every plan stays an hour apart and earliest first
    for (let i = 1; i < p.length; i++) expect(p[i].at - p[i - 1].at).toBeGreaterThan(MERGE_WINDOW_MS);
  });

  it('a squad folded into another reminder adds a line and lands on the Expeditions panel', () => {
    // the offline cap (8 h) leads; the squad is back 20 minutes before it
    const s = snap([{ at: MORNING + 8 * HOUR - 20 * MIN, name: 'Hive Nest Raid' }], {
      offline: { model: { flows: [{ ins: [], outs: [['stone', 1]] }], upkeep: [], rpPerMin: 0 }, efficiency: 1, capSeconds: 8 * 3600, storageMult: 1 },
      capacity: { stone: 1e15 },
      names: { stone: 'Stone' },
    });
    const n = planNotifications(s, { utcOffset: UTC }).find((x) => x.kinds.includes('expedition'))!;
    expect(n.kind).toBe('offline');
    expect(n.body).toContain('Your expedition squad is home too.');
    expect(n.panel).toBe('expeditions');
  });

  it('the snapshot of a running game lists the squads still out', () => {
    const rig = makeColony({ tier: 4 });
    const g = rig.game;
    const [a, b] = crew(g);
    const e1 = g.sys.expeditions.launch('fr_lab', [a.id])!;
    g.sys.expeditions.launch('cv_debris', [b.id]);
    rig.wait(16 * MIN); // the short one is back (haul waiting): no longer "out"
    const s = notifySnapshot(g);
    expect(s.expeditions).toEqual([{ at: e1.endsAt, name: 'Frozen Lab Recovery' }]);
    const n = planNotifications(s).find((x) => x.kind === 'expedition');
    expect(n?.body).toContain('Frozen Lab Recovery');
  });

  it('a tapped reminder asks for the Expeditions panel', () => {
    expect(readTap({ kind: 'expedition', panel: 'expeditions' })).toEqual({ kind: 'expedition', panel: 'expeditions' });
    expect(readTap({ kind: 'expedition', panel: 'shop' })).toEqual({ kind: 'expedition' });
  });
});
