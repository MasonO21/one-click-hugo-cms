/**
 * Expeditions × the meta layer: the teaching mission and side chain, save round-trips and old-save migration,
 * consent-gated analytics, and a full expedition cycle run through the real Game loop.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialState, deserializeState, serializeState } from '../src/core/state';
import { SAVE_VERSION } from '../src/core/constants';
import { migrateState } from '../src/platform/saveMigrate';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { HOUR, MIN, T0, crew, makeColony, placeNear, reload } from './expeditions.helpers';
import { makeGame as makeWorldGame } from './world.helpers';

const tapClaim = (rig: ReturnType<typeof makeColony>, id: string) => {
  const m = rig.game.sys.missions;
  expect(m.progress(id).done).toBe(true);
  expect(m.claim(id)).toBe(true);
};

describe('expeditions: missions', () => {
  it('the Away Team step completes on the first launch and hands over to the next story mission', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const ms = g.sys.missions;
    (ms as unknown as { activate(id: string): boolean }).activate('m23b_expedition');
    expect(g.data.mission('m23b_expedition')!.guide).toEqual({ kind: 'building', ref: 'radio_tower' });
    expect(ms.progress('m23b_expedition').done).toBe(false);
    g.sys.expeditions.launch('cv_debris', [crew(g)[0].id]);
    expect(ms.progress('m23b_expedition').done).toBe(true);
    rig.step(2); // main missions claim themselves
    expect(ms.isClaimed('m23b_expedition')).toBe(true);
    expect(g.state.missions.active).toContain('m24_forge');
  });

  it('gives retroactive credit when the step activates after a squad already left', () => {
    const rig = makeColony({ tier: 2 });
    rig.game.sys.expeditions.launch('cv_debris', [crew(rig.game)[0].id]);
    (rig.game.sys.missions as unknown as { activate(id: string): boolean }).activate('m23b_expedition');
    expect(rig.game.sys.missions.progress('m23b_expedition').done).toBe(true);
  });

  it('offers the expedition side chain only once expeditions open, then follows the hauls', () => {
    const fresh = makeColony({ tier: 0, tower: false });
    expect(fresh.game.state.missions.active).not.toContain('s_exp_home');

    const rig = makeColony({ tier: 2, tower: false });
    expect(rig.game.state.missions.active).not.toContain('s_exp_home');
    placeNear(rig.game, 'radio_tower'); // building:completed -> offered
    expect(rig.game.state.missions.active).toContain('s_exp_home');

    const e = rig.game.sys.expeditions.launch('cv_debris', [crew(rig.game)[0].id])!;
    rig.wait(16 * MIN);
    rig.game.sys.expeditions.collect(e.id);
    tapClaim(rig, 's_exp_home');
    expect(rig.game.state.missions.active).toContain('s_exp_veteran');
    expect(rig.game.sys.missions.progress('s_exp_veteran').value).toBe(1); // counted from the lifetime counter
    // the last link waits for the Frontier
    rig.game.state.missions.progress.s_exp_veteran = 10;
    tapClaim(rig, 's_exp_veteran');
    expect(rig.game.state.missions.active).not.toContain('s_exp_frontier');
    rig.game.state.colony.tier = 6;
    rig.game.bus.emit('colony:tierUp', { tier: 6 });
    expect(rig.game.state.missions.active).toContain('s_exp_frontier');
  });

  it('counts collects per region and Frontier charts for mission targets', () => {
    const rig = makeColony({ tier: 6 });
    const g = rig.game;
    const ms = g.sys.missions;
    const e1 = g.sys.expeditions.launch('rd_scrap', [crew(g)[0].id])!;
    const site = g.sys.expeditions.frontierSites()[0];
    const e2 = g.sys.expeditions.launch(site.id, [crew(g)[1].id])!;
    rig.wait(HOUR + MIN);
    g.sys.expeditions.collect(e1.id);
    g.sys.expeditions.collect(e2.id);
    expect(ms.counter('expedition', 'launch')).toBe(2);
    expect(ms.counter('expedition', 'collect')).toBe(2);
    expect(ms.counter('expedition', 'red_desert')).toBe(1);
    expect(ms.counter('expedition', 'rd_scrap')).toBe(1);
    expect(ms.counter('expedition', 'frontier')).toBe(1);
  });
});

describe('expeditions: saves', () => {
  it('round-trips a colony with squads out, back and charted', () => {
    const rig = makeColony({ tier: 6 });
    const g = rig.game;
    const [a, b, c] = crew(g);
    const short = g.sys.expeditions.launch('cv_debris', [a.id])!;
    g.sys.expeditions.launch('th_summit', [b.id, c.id])!;
    const site = g.sys.expeditions.frontierSites()[0];
    g.sys.expeditions.launch(site.id, [crew(g)[3].id]);
    rig.wait(16 * MIN);
    expect(g.sys.expeditions.get(short.id)!.status).toBe('back');
    const before = JSON.parse(JSON.stringify(g.state.expeditions));
    const back = reload(rig);
    expect(back.game.state.expeditions).toEqual(before);
    expect(back.game.sys.colonists.get(b.id)!.away).toBe(true);
    expect(back.game.sys.colonists.get(a.id)!.away).toBe(false);
    // the save string itself carries it (what SaveManager writes)
    const parsed = migrateState(deserializeState(serializeState(back.game.state)));
    expect(parsed.expeditions.list).toHaveLength(3);
  });

  it('an old save without expeditions loads with safe defaults (and v1 saves migrate as before)', () => {
    const old = JSON.parse(serializeState(createInitialState(99, Date.UTC(2026, 0, 1)))) as Record<string, any>;
    delete old.expeditions;
    old.version = 1;
    delete old.settings.qualityMode;
    old.colonists.list.push({ id: 1, name: 'Old Timer', away: true }); // a stale flag from nowhere
    const s = migrateState(old);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.expeditions).toEqual({ list: [], nextId: 1, launched: 0, collected: 0, frontier: { charted: [], signal: 0, claimed: [], announced: false } });
    expect(s.settings.qualityMode).toBe('auto');
  });

  it('a trip launched while the device clock ran ahead does not keep its squad away for days once the clock is fixed', () => {
    const ahead = makeColony({ tier: 3, at: T0 + 3 * 24 * HOUR });
    const g = ahead.game;
    const [a] = crew(g);
    g.sys.expeditions.launch('cv_debris', [a.id]); // 15 min, by the wrong clock
    const back = makeColony({ state: migrateState(JSON.parse(serializeState(g.state))), at: T0 + MIN });
    const ex = back.game.sys.expeditions;
    const e = ex.list()[0];
    expect(e.status).toBe('out');
    expect(ex.secondsLeft(e)).toBeLessThanOrEqual(15 * 60);
    expect(back.game.sys.colonists.get(a.id)!.away).toBe(true);
    back.wait(16 * MIN);
    expect(ex.list()[0].status).toBe('back');
    expect(back.game.sys.colonists.get(a.id)!.away).toBe(false);
  });

  it('repairs junk and stale flags on load: unknown trips come home, nobody stays lost', () => {
    const rig = makeColony({ tier: 3 });
    const g = rig.game;
    const [a, b] = crew(g);
    g.sys.expeditions.launch('rd_outpost', [a.id]);
    const st = JSON.parse(serializeState(g.state));
    st.expeditions.list.push({ id: 'junk' }, null, { id: 77, dest: 'retired_destination', squad: [b.id], startedAt: rig.clock.now, endsAt: rig.clock.now + 9 * HOUR, status: 'out' });
    st.colonists.list.find((c: { id: number }) => c.id === b.id).away = true;
    st.colonists.list.find((c: { id: number }) => c.id === crew(g)[2].id).away = true; // not on any trip
    st.expeditions.frontier = { charted: 'oops', signal: -3 };
    const back = makeColony({ state: migrateState(st), at: rig.clock.now + MIN });
    const ex = back.game.sys.expeditions;
    expect(ex.list().map((e) => e.dest).sort()).toEqual(['rd_outpost', 'retired_destination']);
    expect(ex.get(77)!.status).toBe('back'); // came home at once, empty-handed
    expect(back.game.sys.colonists.get(b.id)!.away).toBe(false);
    expect(back.game.sys.colonists.get(crew(g)[2].id)!.away).toBe(false);
    expect(back.game.sys.colonists.get(a.id)!.away).toBe(true);
    expect(back.game.state.expeditions.frontier.charted).toEqual([]);
    expect(back.game.state.expeditions.frontier.signal).toBe(0);
    expect(ex.collect(77)!.reward).toEqual({});
  });
});

describe('expeditions: analytics', () => {
  it('reports launches, returns and collects only with consent', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const track = vi.spyOn(g.services.analytics, 'track');
    const off = installAnalyticsHooks(g);
    const names = () => track.mock.calls.map((c) => c[0]).filter((n) => n.startsWith('expedition'));
    // the mock service records whatever it is told; consent gating lives in the real service, the hook passes it on
    const consent = vi.spyOn(g.services.analytics, 'setConsent');
    g.state.settings.analytics = true;
    g.state.settings.analyticsAsked = true;
    rig.step(1.5);
    expect(consent).toHaveBeenLastCalledWith(true);
    const e = g.sys.expeditions.launch('rd_scrap', [crew(g)[0].id])!;
    rig.wait(16 * MIN);
    g.sys.expeditions.collect(e.id);
    expect(names()).toEqual(['expedition_launched', 'expedition_returned', 'expedition_collected']);
    const launched = track.mock.calls.find((c) => c[0] === 'expedition_launched')![1] as Record<string, unknown>;
    expect(launched).toMatchObject({ dest: 'rd_scrap', region: 'red_desert', squad: 1, vehicle: 'none', minutes: 15, frontier: false });
    off();
  });
});

describe('expeditions: smoke — a full cycle inside the real Game loop', () => {
  it('recruit, build the Radio Tower, send a squad, keep playing, bring them home, collect', () => {
    const rig = makeWorldGame(2024);
    const g = rig.game;
    rig.step(2);
    // fast-forward the colony to Stone the way the sim stores it
    g.state.colony.tier = 2;
    g.state.colony.radius = g.data.tier(2).colonyRadius;
    for (const r of g.data.research) if (!g.state.research.completed.includes(r.id)) g.state.research.completed.push(r.id);
    placeNear(g, 'radio_tower');
    const ids = [g.sys.colonists.grant('common'), g.sys.colonists.grant('rare'), g.sys.colonists.grant('common')];
    rig.step(3);
    expect(g.sys.expeditions.unlocked()).toBe(true);
    const plan = g.sys.expeditions.preview('pf_berries', ids)!;
    expect(plan.squad.size).toBe(3);
    const e = g.sys.expeditions.launch('pf_berries', ids)!;
    rig.step(10); // the colony carries on without them
    for (const id of ids) expect(g.sys.colonists.get(id)!.away).toBe(true);
    // the app sleeps for 20 minutes (the injectable clock), then the loop runs on
    for (let i = 0; i < 20; i++) rig.step(60, 1); // 1 s steps keep the test quick
    const trip = g.sys.expeditions.get(e.id)!;
    expect(trip.status).toBe('back');
    const food = g.state.resources.amounts.food ?? 0;
    const res = g.sys.expeditions.collect(e.id)!;
    expect(res.reward.resources?.food).toBeGreaterThan(0);
    expect((g.state.resources.amounts.food ?? 0) + (res.leftBehind.food ?? 0)).toBeGreaterThanOrEqual(food + res.reward.resources!.food! - 1);
    for (const id of ids) expect(g.sys.colonists.get(id)!.away).toBe(false);
    rig.step(5);
    expect(g.sys.expeditions.list()).toHaveLength(0);
  });
});
