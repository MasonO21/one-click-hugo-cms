import { describe, expect, it, vi } from 'vitest';
import { AUTO_CLAIM_DELAY } from '../src/sim/missions';
import { pickDailies } from '../src/sim/meta/missionRules';
import { createDataRegistry, defaultData } from '../src/data';
import type { MissionDef } from '../src/data/schema';
import { DAY, T0, advanceMainTo, fakeBuilding, fakeColonist, fulfil, makeGame, tickMeta } from './meta.helpers';

describe('missions: setup', () => {
  it('activates the first main mission, the head of every side chain and today\'s dailies on a fresh game', () => {
    const { game } = makeGame();
    const m = game.sys.missions;
    expect(m.current()?.id).toBe(game.data.firstMission);
    const side = game.data.missions.filter((d) => d.chain === 'side');
    const followUps = new Set(side.flatMap((d) => d.next ?? []));
    for (const d of side) {
      // late chains wait for their tier; expedition chains until expeditions open (Stone tier + Radio Tower); the
      // wishes chain until the first colonist wish (after the tutorial)
      if (followUps.has(d.id) || d.minTier || d.type === 'expedition' || d.type === 'wish') expect(game.state.missions.active).not.toContain(d.id);
      else expect(game.state.missions.active).toContain(d.id);
    }
    expect(m.activeByChain('side').length).toBeGreaterThan(2);
    expect(m.activeByChain('side').length).toBeLessThan(side.length);
    expect(m.activeByChain('daily')).toHaveLength(game.state.missions.daily.length);
    expect(game.state.missions.daily.length).toBeGreaterThan(0);
    expect(game.state.missions.dailyDate).toBe('2026-06-15');
    // main first, then side, then daily
    const chains = m.active().map((d) => d.chain);
    expect(chains).toEqual([...chains].sort((a, b) => ['main', 'side', 'daily'].indexOf(a) - ['main', 'side', 'daily'].indexOf(b)));
  });

  it('tracks lifetime counters ("type:target" and "type:*") for every event type', () => {
    const { game } = makeGame();
    const bus = game.bus;
    bus.emit('resource:gained', { id: 'wood', amount: 4, source: 'gather' });
    bus.emit('resource:gained', { id: 'wood', amount: 6, source: 'production' });
    bus.emit('resource:gained', { id: 'wood', amount: 3, source: 'drop' });
    bus.emit('resource:gained', { id: 'wood', amount: 99, source: 'reward' }); // rewards/offline/etc. do not count as gathering
    bus.emit('resource:gained', { id: 'stone', amount: 2, source: 'gather' });
    bus.emit('building:completed', { id: 5, def: 'shelter' });
    bus.emit('building:upgraded', { id: 5, def: 'shelter', level: 2, tier: 0 });
    bus.emit('colonist:recruited', { id: 1, rarity: 'rare' });
    bus.emit('survivor:rescued', { poi: 'p', colonist: 2 });
    bus.emit('world:regionDiscovered', { id: 'pinewood_forest' });
    bus.emit('alien:killed', { id: 1, def: 'crawler', x: 0, z: 0, by: 'turret' });
    bus.emit('alien:killed', { id: 2, def: 'spitter', x: 0, z: 0, by: 'player' });
    bus.emit('combat:ended', { wave: 1, kills: 2, reward: {} });
    bus.emit('craft:completed', { recipe: 'stone_axe' });
    bus.emit('research:completed', { id: 'sharper_tools' });
    bus.emit('world:poiLooted', { id: 'poi_9', poi: 'supply_cache', reward: {} });
    bus.emit('player:equipped', { item: 'stone_axe', slot: 'tool' });
    bus.emit('spin:result', { index: 1 });
    const c = (k: string) => game.state.missions.counters[k];
    expect(c('gather:wood')).toBe(13);
    expect(c('gather:*')).toBe(15);
    expect(c('build:shelter')).toBe(1);
    expect(c('build:category:housing')).toBe(1);
    expect(c('build:*')).toBe(1);
    expect(c('upgrade:shelter')).toBe(1);
    expect(c('recruit:rare')).toBe(1);
    expect(c('rescue:*')).toBe(1);
    expect(c('discover:pinewood_forest')).toBe(1);
    expect(c('kill:crawler')).toBe(1);
    expect(c('kill:*')).toBe(2);
    expect(c('defend:*')).toBe(1);
    expect(c('craft:stone_axe')).toBe(1);
    expect(c('research:sharper_tools')).toBe(1);
    expect(c('loot:supply_cache')).toBe(1);
    expect(c('equip:stone_axe')).toBe(1);
    expect(c('spin:*')).toBe(1);
    expect(game.sys.missions.counter('gather', 'wood')).toBe(13);
  });
});

describe('missions: the first 15 minutes', () => {
  it('advances m01 -> m11 on simulated events, auto-claiming each main mission', () => {
    const g = makeGame();
    const { game } = g;
    const missions = game.sys.missions;
    const spawn = vi.spyOn(game.sys.world, 'spawnSurvivorNear').mockReturnValue('poi_survivor');
    const schedule = vi.spyOn(game.sys.combat, 'schedule').mockImplementation(() => {});
    const celebrations: string[] = [];
    game.bus.on('ui:celebrate', (e) => celebrations.push(e.title));
    const completed: string[] = [];
    const claimed: string[] = [];
    game.bus.on('mission:completed', (e) => completed.push(e.id));
    game.bus.on('mission:claimed', (e) => claimed.push(e.id));
    const sfx: string[] = [];
    game.bus.on('sfx', (e) => sfx.push(e.id));

    const order = ['m01_wood', 'm02_shelter', 'm03_campfire', 'm04_storage', 'm05_rescue', 'm06_logging', 'm07_assign', 'm08_turret', 'm09_defend', 'm10_research', 'm11_tier1'];
    expect(missions.current()?.id).toBe(order[0]);
    expect(missions.progress('m01_wood')).toEqual({ value: 0, target: game.data.mission('m01_wood')!.count, done: false });

    for (let i = 0; i < order.length; i++) {
      const cur = missions.current()!;
      expect(cur.id).toBe(order[i]);
      expect(missions.progress(cur.id).done).toBe(false);
      fulfil(g, cur);
      // complete immediately, claimed only after the auto-claim delay
      expect(missions.progress(cur.id).done).toBe(true);
      expect(completed.at(-1)).toBe(cur.id);
      expect(claimed).not.toContain(cur.id);
      tickMeta(g, AUTO_CLAIM_DELAY - 0.5);
      expect(claimed).not.toContain(cur.id);
      tickMeta(g, 1);
      expect(claimed.at(-1)).toBe(cur.id);
    }

    expect(claimed).toEqual(order);
    // the guided arc ends at m11, but the main chain goes on: the next story mission is simply the next head
    expect(game.data.mission('m11_tier1')!.next).toEqual(['m12_desk']);
    expect(missions.current()?.id).toBe('m12_desk');
    expect(missions.progress('m12_desk').done).toBe(false);
    expect(sfx.filter((s) => s === 'mission_done')).toHaveLength(order.length);
    expect(game.state.tutorial.done).toBe(true);
    // scripted triggers
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(0, 0);
    expect(schedule).toHaveBeenCalledTimes(1);
    const attack = game.data.mission('m08_turret')!.onComplete!.attack!; // the content decides the countdown
    expect(schedule).toHaveBeenCalledWith(attack.delay, attack.warning);
    expect(celebrations).toEqual(['Your first colonist joined!', 'Colony defended!', 'Reinforced Wood tier reached! The colony expands.']);
    // rewards were granted (m09: nova + rp; m11: nova)
    const novaOf = (id: string) => game.data.mission(id)!.reward.nova ?? 0;
    expect(novaOf('m09_defend')).toBeGreaterThan(0);
    expect(novaOf('m11_tier1')).toBeGreaterThan(0);
    expect(game.state.liveops.nova).toBe(order.reduce((n, id) => n + novaOf(id), 0));
    expect(game.state.research.points).toBeGreaterThanOrEqual(25);
  });

  it('runs onComplete triggers at completion time, not at claim time', () => {
    const g = makeGame();
    const spawn = vi.spyOn(g.game.sys.world, 'spawnSurvivorNear').mockReturnValue('poi_x');
    advanceMainTo(g, 'm04_storage');
    expect(spawn).not.toHaveBeenCalled();
    fulfil(g, g.game.sys.missions.current()!); // completes m04 — claim still pending
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(g.game.sys.missions.current()?.id).toBe('m04_storage');
  });

  it('keeps side and daily missions waiting for a tap', () => {
    const g = makeGame();
    const { game } = g;
    const m = game.sys.missions;
    game.bus.emit('building:completed', { id: 9, def: 'berry_patch' });
    expect(m.progress('s_farm').done).toBe(true);
    tickMeta(g, 5);
    expect(game.state.missions.active).toContain('s_farm');
    expect(m.claimable().map((d) => d.id)).toContain('s_farm');
    const food = game.state.resources.amounts.food ?? 0;
    const claimed = vi.fn();
    game.bus.on('mission:claimed', claimed);
    expect(m.claim('s_farm')).toBe(true);
    expect(claimed).toHaveBeenCalledWith({ id: 's_farm' });
    expect(game.state.resources.amounts.food ?? 0).toBeGreaterThan(food);
    expect(game.state.missions.active).not.toContain('s_farm');
    expect(m.isClaimed('s_farm')).toBe(true);
    expect(m.claim('s_farm')).toBe(false); // no double claim
  });

  it('cannot claim an unfinished mission and ignores unknown ids', () => {
    const { game } = makeGame();
    expect(game.sys.missions.claim(game.data.firstMission)).toBe(false);
    expect(game.sys.missions.claim('nope')).toBe(false);
    expect(game.sys.missions.progress('nope')).toEqual({ value: 0, target: 1, done: false });
  });

  it('claimAll collects every finished mission', () => {
    const { game } = makeGame();
    game.bus.emit('building:completed', { id: 9, def: 'berry_patch' });
    game.bus.emit('building:completed', { id: 10, def: 'rain_collector' });
    expect(game.sys.missions.claimAll()).toBe(2);
    expect(game.sys.missions.claimable()).toHaveLength(0);
  });

  it('one Claim all also collects follow-ups a claim opens that the colony has already finished', () => {
    const { game } = makeGame();
    // a late colony: the Steel chain heads open with their goals already met
    for (let i = 0; i < 6; i++) game.state.buildings.list.push(fakeBuilding('solar_panel', 900 + i));
    for (let i = 0; i < 2; i++) game.state.buildings.list.push(fakeBuilding('battery_bank', 910 + i));
    game.state.colony.tier = 3;
    game.bus.emit('colony:tierUp', { tier: 3 });
    expect(game.sys.missions.progress('s_grid_solar').done).toBe(true);
    // claiming the head opens s_grid_battery, already done: the same call claims it too (main chain untouched)
    const n = game.sys.missions.claimAllIn('side');
    expect(n).toBeGreaterThanOrEqual(2);
    expect(game.state.missions.completed).toEqual(expect.arrayContaining(['s_grid_solar', 's_grid_battery']));
    expect(game.sys.missions.claimable().filter((d) => d.chain === 'side')).toHaveLength(0);
  });
});

describe('missions: out-of-order play never strands the player', () => {
  it('credits a building that already exists when the mission activates', () => {
    const g = makeGame();
    const { game } = g;
    advanceMainTo(g, 'm02_shelter');
    // player builds the campfire before the shelter step is done
    game.state.buildings.list.push(fakeBuilding('campfire', 50));
    game.bus.emit('building:completed', { id: 50, def: 'campfire' });
    fulfil(g, game.sys.missions.current()!); // shelter
    tickMeta(g, 1.5);
    // the campfire step completed the moment it activated...
    expect(game.sys.missions.current()?.id).toBe('m03_campfire');
    expect(game.sys.missions.progress('m03_campfire').done).toBe(true);
    tickMeta(g, 1.5);
    // ...and was auto-claimed: now on the storage step
    expect(game.sys.missions.current()?.id).toBe('m04_storage');
  });

  it('credits research that was completed early', () => {
    const g = makeGame();
    const { game } = g;
    game.state.research.completed.push('tier_reinforced');
    advanceMainTo(g, 'm10_research');
    expect(game.sys.missions.progress('m10_research').done).toBe(true); // credited on activation
    tickMeta(g, 1.5);
    expect(game.sys.missions.current()?.id).toBe('m11_tier1');
  });

  it('does not give daily missions retroactive credit', () => {
    const g = makeGame();
    expect(g.game.sys.missions.progress('d_build').value).toBe(0);
  });
});

describe('missions: live (state-derived) types', () => {
  function liveGame() {
    const base = defaultData();
    const missions: MissionDef[] = [
      { id: 'l1', chain: 'main', name: 'Crew', description: '', type: 'colonists', target: '*', count: 2, reward: { nova: 1 }, next: ['l2'] },
      { id: 'l2', chain: 'main', name: 'Power', description: '', type: 'power', target: '*', count: 10, reward: { nova: 1 }, next: ['l3'] },
      { id: 'l3', chain: 'main', name: 'Defenses', description: '', type: 'have_building', target: 'category:defense', count: 2, reward: { nova: 1 }, next: ['l4'] },
      { id: 'l4', chain: 'main', name: 'Jobs', description: '', type: 'assign', target: '*', count: 1, reward: { nova: 1 }, next: ['l5'] },
      { id: 'l5', chain: 'main', name: 'Tier', description: '', type: 'tier', target: '*', count: 2, reward: { nova: 1 }, next: [] },
    ];
    const data = createDataRegistry({ ...base, missions: [...base.missions, ...missions], firstMission: 'l1' });
    return makeGame({ data });
  }

  it('completes colonists / power / have_building / assign / tier from state', () => {
    const g = liveGame();
    const { game } = g;
    const m = game.sys.missions;
    game.state.buildings.list.length = 0; // count only the buildings this test adds (not the core / Lucky Wheel)
    expect(m.current()?.id).toBe('l1');
    game.state.colonists.list.push(fakeColonist(1), fakeColonist(2));
    tickMeta(g, 1.5);
    expect(m.current()?.id).toBe('l2');
    expect(m.progress('l2').done).toBe(false);
    game.derived.power.produced = 12;
    tickMeta(g, 1.5);
    expect(m.current()?.id).toBe('l3');
    game.state.buildings.list.push(fakeBuilding('scrap_turret', 1), fakeBuilding('barricade', 2, { status: 'building' }));
    tickMeta(g, 1);
    expect(m.progress('l3').value).toBe(1); // the one under construction does not count yet
    game.state.buildings.list[1].status = 'active';
    tickMeta(g, 1.5);
    expect(m.current()?.id).toBe('l4');
    game.state.colonists.list[0].workplace = 1;
    tickMeta(g, 1.5);
    expect(m.current()?.id).toBe('l5');
    game.state.colony.tier = 2;
    tickMeta(g, 1.5);
    expect(m.current()).toBeNull();
    expect(game.state.liveops.nova).toBe(5);
  });

  it('a finished live mission stays finished if the state later drops', () => {
    const g = liveGame();
    const { game } = g;
    game.state.colonists.list.push(fakeColonist(1), fakeColonist(2));
    game.bus.emit('colonist:recruited', { id: 2, rarity: 'common' });
    expect(game.sys.missions.progress('l1').done).toBe(true);
    game.state.colonists.list.length = 0;
    tickMeta(g, 0.1); // before the auto-claim fires
    expect(game.sys.missions.progress('l1').done).toBe(true);
  });
});

describe('missions: daily missions', () => {
  it('picks the same dailies for the same date and varies across dates', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(pickDailies(pool, '2026-06-15')).toEqual(pickDailies(pool, '2026-06-15'));
    expect(pickDailies(pool, '2026-06-15')).toHaveLength(3);
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) seen.add(pickDailies(pool, `2026-07-${String(d).padStart(2, '0')}`).join());
    expect(seen.size).toBeGreaterThan(5);
    // never duplicates inside one day
    for (const s of seen) expect(new Set(s.split(',')).size).toBe(3);
  });

  it('is deterministic across two independent games on the same date', () => {
    const a = makeGame({ seed: 1 });
    const b = makeGame({ seed: 999 });
    expect(a.game.state.missions.daily).toEqual(b.game.state.missions.daily);
  });

  it('rolls over at local midnight: old dailies reset, finished-but-untapped ones are auto-collected', () => {
    // the real pool has 15 dailies and 3 are drawn per date, so pin the pool to exactly 3: the same three come
    // back every day and the rollover itself (not the luck of the draw) is what is under test
    const data = createDataRegistry({ ...defaultData(), dailyMissionPool: ['d_build', 'd_kill', 'd_gather_wood'] });
    const g = makeGame({ data });
    const { game, clock } = g;
    const m = game.sys.missions;
    const build = game.data.mission('d_build')!;
    expect(game.state.missions.daily).toContain('d_build');
    fulfil(g, build); // done, not claimed
    expect(m.progress('d_build').done).toBe(true);
    const nova = game.state.liveops.nova;
    clock.now += DAY;
    tickMeta(g, 1.5);
    expect(game.state.missions.dailyDate).toBe('2026-06-16');
    expect(game.state.liveops.nova).toBe(nova + build.reward.nova!); // collected for the player
    expect(m.progress('d_build')).toEqual({ value: 0, target: build.count, done: false }); // fresh daily
    expect(game.state.missions.active).toContain('d_build');
    expect(game.state.missions.completed).not.toContain('d_build');
  });

  it('counts a daily from its activation only and pays on tap', () => {
    const data = createDataRegistry({ ...defaultData(), dailyMissionPool: ['d_build', 'd_kill', 'd_gather_wood'] });
    const g = makeGame({ data });
    const { game } = g;
    // a veteran colony (first invasion won) can be offered fighting dailies: re-roll today's set
    game.state.stats.wavesWon = 1;
    game.state.missions.dailyDate = '';
    tickMeta(g, 1.5); // the date check runs once per second
    expect(game.state.missions.daily).toContain('d_kill');
    fulfil(g, game.data.mission('d_kill')!);
    expect(game.sys.missions.progress('d_kill').done).toBe(true);
    tickMeta(g, 3);
    expect(game.state.missions.active).toContain('d_kill');
    const nova = game.state.liveops.nova;
    expect(game.sys.missions.claim('d_kill')).toBe(true);
    expect(game.state.liveops.nova).toBe(nova + 3);
  });
});

describe('missions: daily feasibility', () => {
  it('never offers fighting, spin, research, upgrade or big dailies to a brand-new colony', () => {
    for (let day = 0; day < 30; day++) {
      const g = makeGame({ at: T0 + day * DAY });
      const ids = g.game.state.missions.daily;
      expect(ids.length).toBeGreaterThan(0);
      for (const id of ids) {
        const def = g.game.data.mission(id)!;
        expect(['kill', 'defend', 'spin', 'research', 'upgrade']).not.toContain(def.type);
        expect(id.endsWith('_big')).toBe(false);
      }
    }
  });
});

describe('missions: persistence & repair', () => {
  it('resumes the auto-claim of a finished main mission after a reload', () => {
    const g = makeGame();
    fulfil(g, g.game.sys.missions.current()!);
    const state = JSON.parse(JSON.stringify(g.game.state));
    const g2 = makeGame({ state, at: g.clock.now });
    expect(g2.game.sys.missions.progress('m01_wood').done).toBe(true);
    tickMeta(g2, 1.5);
    expect(g2.game.sys.missions.current()?.id).toBe('m02_shelter');
  });

  it('adds new side missions and a main mission to an old save that lacks them', () => {
    const g = makeGame();
    const state = JSON.parse(JSON.stringify(g.game.state));
    state.missions.active = state.missions.active.filter((id: string) => id !== 's_farm' && id !== 'm01_wood');
    state.missions.completed = [];
    state.missions.progress = {};
    state.missions.active.push('ghost_mission');
    const g2 = makeGame({ state, at: g.clock.now });
    expect(g2.game.state.missions.active).not.toContain('ghost_mission');
    expect(g2.game.state.missions.active).toContain('s_farm');
    expect(g2.game.sys.missions.current()?.id).toBe('m01_wood');
  });

  it('unlocks the next side mission of a chain when one is claimed; old saves drop unreachable ones', () => {
    const g = makeGame();
    const side = g.game.data.missions.filter((d) => d.chain === 'side');
    const head = side.find((d) => d.next?.length && !side.some((o) => o.next?.includes(d.id)))!;
    const follow = head.next![0];
    expect(g.game.state.missions.active).not.toContain(follow);
    g.game.state.missions.progress[head.id] = head.count;
    (g.game.sys.missions as any).isDone = () => true;
    expect(g.game.sys.missions.claim(head.id)).toBe(true);
    expect(g.game.state.missions.active).toContain(follow);

    // a save made when every side mission was active at once
    const g2 = makeGame();
    const state = JSON.parse(JSON.stringify(g2.game.state));
    for (const d of side) if (!state.missions.active.includes(d.id)) state.missions.active.push(d.id);
    const g3 = makeGame({ state, at: g2.clock.now });
    expect(g3.game.state.missions.active).not.toContain(follow);
    expect(g3.game.state.missions.active).toContain(head.id);
  });

  it('late side chains wait for their tier: heads open on tier-up, follow-ups wait for their own tier', () => {
    const g = makeGame();
    const { game } = g;
    const st = game.state.missions;
    const tierUp = (t: number) => {
      game.state.colony.tier = t;
      game.bus.emit('colony:tierUp', { tier: t });
    };
    const claimNow = (id: string) => {
      st.progress[id] = game.data.mission(id)!.count;
      expect(game.sys.missions.claim(id)).toBe(true);
    };
    const toasts: string[] = [];
    game.bus.on('ui:toast', (e) => toasts.push(e.text));
    expect(st.active).not.toContain('s_grid_solar');
    tierUp(2);
    expect(st.active).not.toContain('s_grid_solar');
    expect(toasts.filter((t) => t.includes('side mission'))).toEqual([]);
    tierUp(3);
    expect(st.active).toContain('s_grid_solar');
    expect(toasts).toContain('6 new side missions are ready');
    expect(st.active).toContain('s_fort_mg');
    expect(st.active).not.toContain('s_grid_battery');
    claimNow('s_grid_solar');
    expect(st.active).toContain('s_grid_battery'); // same tier: follows at once
    claimNow('s_grid_battery');
    expect(st.active).not.toContain('s_grid_geo'); // Alloy-tier step waits
    tierUp(4);
    expect(st.active).toContain('s_grid_geo');

    // a save made at tier 4 picks the waiting step up on load, and never re-offers claimed ones
    const g2 = makeGame({ state: JSON.parse(JSON.stringify(game.state)), at: g.clock.now });
    expect(g2.game.state.missions.active).toContain('s_grid_geo');
    expect(g2.game.state.missions.active).not.toContain('s_grid_solar');

    // a step already on the board stays there however far the colony moves on
    tierUp(6);
    expect(st.active).toContain('s_grid_geo');
    claimNow('s_grid_geo');
    expect(st.active).toContain('s_grid_mega');
  });

  it('a colony far past a chain picks it up at the first step that still fits its tier', () => {
    const { game } = makeGame();
    const st = game.state.missions;
    game.state.colony.tier = 6;
    game.bus.emit('colony:tierUp', { tier: 6 });
    const late = game.sys.missions.activeByChain('side').filter((d) => d.minTier).map((d) => d.id).sort();
    expect(late).toEqual(['s_fort_veteran', 's_grid_mega', 's_home_nano', 's_ind_matter', 's_sci_ten', 's_veh_rover']);
    // skipped steps are not marked completed (no reward was paid for them)
    expect(st.completed).not.toContain('s_grid_solar');
    // finales are never skipped, and the chain carries on normally from where it was picked up
    st.progress.s_grid_mega = game.data.mission('s_grid_mega')!.count;
    expect(game.sys.missions.claim('s_grid_mega')).toBe(true);
    expect(st.active).toContain('s_grid_core');
  });

  it('a boss goal the colony has outgrown is finished by the bigger boss that leads its raids now', () => {
    const { game } = makeGame();
    const st = game.state.missions;
    const tierUp = (t: number) => {
      game.state.colony.tier = t;
      game.bus.emit('colony:tierUp', { tier: t });
    };
    const kill = (def: string) => game.bus.emit('alien:killed', { id: 1, def, x: 0, z: 0, by: 'turret' } as never);
    // Elder Brutes only lead raids up to Steel: "Bullet Storm" claimed at Alloy hands over "Defeat an Elder Brute"
    expect(game.data.invasion(4).boss?.alien).toBe('hive_mother');
    tierUp(3);
    tierUp(4);
    st.progress.s_fort_mg = game.data.mission('s_fort_mg')!.count;
    expect(game.sys.missions.claim('s_fort_mg')).toBe(true);
    expect(st.active).toContain('s_fort_brute');
    kill('brute'); // an ordinary brute is not a boss
    expect(game.sys.missions.progress('s_fort_brute').done).toBe(false);
    kill('hive_mother');
    expect(game.sys.missions.progress('s_fort_brute').done).toBe(true);
    // the lifetime counters stay exact (no Elder Brute was beaten)
    expect(game.sys.missions.counter('kill', 'elder_brute')).toBe(0);
    expect(game.sys.missions.counter('kill', 'hive_mother')).toBe(1);
    // the same for "Defeat a Hive Mother" carried into Titanium, where Titan Prime leads the raids; never downwards
    expect(game.sys.missions.claim('s_fort_brute')).toBe(true);
    st.progress.s_fort_missile = game.data.mission('s_fort_missile')!.count;
    expect(game.sys.missions.claim('s_fort_missile')).toBe(true);
    expect(st.active).toContain('s_fort_queen');
    tierUp(6);
    kill('elder_brute');
    expect(game.sys.missions.progress('s_fort_queen').done).toBe(false);
    kill('titan_prime');
    expect(game.sys.missions.progress('s_fort_queen').done).toBe(true);
  });

  it('a gated mission gets credit for what the colony already has when it opens', () => {
    const { game } = makeGame();
    for (let i = 0; i < 6; i++) game.state.buildings.list.push(fakeBuilding('solar_panel', 900 + i));
    game.state.colony.tier = 3;
    game.bus.emit('colony:tierUp', { tier: 3 });
    expect(game.sys.missions.progress('s_grid_solar').done).toBe(true);
  });

  it('system-made progress can be muted (free wheel is not a player build)', () => {
    const { game } = makeGame();
    game.sys.missions.quietly(() => game.bus.emit('building:completed', { id: 77, def: 'spin_wheel' }));
    expect(game.sys.missions.counter('build', 'spin_wheel')).toBe(0);
    game.bus.emit('building:completed', { id: 78, def: 'spin_wheel' });
    expect(game.sys.missions.counter('build', 'spin_wheel')).toBe(1);
  });
});
