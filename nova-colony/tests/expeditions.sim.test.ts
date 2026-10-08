/**
 * Expeditions in the real Game: unlock, launch rules, away colonists, timers across an absence, deterministic hauls,
 * survivors, collecting (with the storage allowance) and the post-Titanium Frontier / Star Chart.
 */
import { describe, expect, it } from 'vitest';
import { isTierCelebration } from '../src/ui/logic/describe';
import { createDataRegistry, defaultData } from '../src/data';
import type { ExpeditionDef } from '../src/data/schema';
import { planHaul, regionalSpec, rollHaul } from '../src/sim/expedition/rules';
import { HOUR, MIN, collect, crew, makeColony, placeNear, reload } from './expeditions.helpers';

describe('expeditions: unlock', () => {
  it('opens at the Stone tier with a Radio Tower, and says why not before', () => {
    const early = makeColony({ tier: 1 });
    expect(early.game.sys.expeditions.unlocked()).toBe(false);
    expect(early.game.sys.expeditions.lockReason()).toMatch(/Stone tier/);

    const noTower = makeColony({ tier: 2, tower: false });
    expect(noTower.game.sys.expeditions.lockReason()).toMatch(/Radio Tower/);

    const ok = makeColony({ tier: 2 });
    expect(ok.game.sys.expeditions.unlocked()).toBe(true);
    expect(ok.game.data.building('radio_tower')!.expeditions).toBe(true);
  });

  it('runs more squads at once as the colony grows (1 → 2 at Alloy → 3 at Titanium)', () => {
    expect(makeColony({ tier: 2 }).game.sys.expeditions.slots()).toBe(1);
    expect(makeColony({ tier: 4 }).game.sys.expeditions.slots()).toBe(2);
    expect(makeColony({ tier: 6 }).game.sys.expeditions.slots()).toBe(3);
  });

  it('locks destinations behind their region and tier', () => {
    const rig = makeColony({ tier: 2, regions: false });
    const ex = rig.game.sys.expeditions;
    const st = (id: string) => ex.destinationStatus(rig.game.data.expedition(id)!);
    expect(st('cv_debris').ok).toBe(true); // Crash Valley is home
    expect(st('rd_scrap').reason).toMatch(/Discover Red Desert/);
    rig.game.state.world.regionsDiscovered.push('red_desert');
    expect(st('rd_scrap').ok).toBe(true);
    expect(st('rd_outpost').reason).toMatch(/Steel tier/);
  });
});

describe('expeditions: launch rules', () => {
  it('needs 1–3 distinct colonists at home, a free slot and a real destination', () => {
    const rig = makeColony({ tier: 2 });
    const ex = rig.game.sys.expeditions;
    const ids = crew(rig.game).map((c) => c.id);
    expect(ex.canLaunch('cv_debris', [])).toMatch(/at least one/);
    expect(ex.canLaunch('cv_debris', ids.slice(0, 4))).toMatch(/at most 3/);
    expect(ex.canLaunch('cv_debris', [ids[0], ids[0]])).toMatch(/only go once/);
    expect(ex.canLaunch('nowhere', [ids[0]])).toMatch(/out of reach/);
    expect(ex.canLaunch('cv_debris', [999])).toMatch(/not in the colony/);
    expect(ex.canLaunch('cv_debris', ids.slice(0, 3))).toBeNull();
    expect(ex.launch('cv_debris', ids.slice(0, 3))).toBeTruthy();
    // one slot at Stone: the next squad has to wait
    expect(ex.canLaunch('pf_berries', [ids[3]])).toMatch(/Every squad is out/);
    expect(ex.launch('pf_berries', [ids[3]])).toBeNull();
    // already away
    rig.game.state.colony.tier = 4;
    expect(ex.canLaunch('pf_berries', [ids[0]])).toMatch(/already away/);
  });

  it('takes an owned vehicle along, but not one that is out or being ridden', () => {
    const rig = makeColony({ tier: 4 });
    const ex = rig.game.sys.expeditions;
    const p = rig.game.state.player;
    const ids = crew(rig.game).map((c) => c.id);
    expect(ex.canLaunch('cv_debris', [ids[0]], 'buggy')).toMatch(/don't own/);
    p.vehicles.push('buggy', 'atv');
    rig.game.sys.player.mount('atv');
    expect(ex.canLaunch('cv_debris', [ids[0]], 'atv')).toMatch(/riding/);
    expect(ex.launch('cv_debris', [ids[0]], 'buggy')).toBeTruthy();
    expect(ex.vehicleAway('buggy')).toBe(true);
    expect(ex.canLaunch('pf_berries', [ids[1]], 'buggy')).toMatch(/already out/);
    expect(ex.vehicles().map((v) => v.id)).toEqual(['atv']);
    // a vehicle on a trip can't be ridden at home either
    expect(rig.game.sys.player.mount('buggy')).toBe(false);
  });

  it('vehicles make the trip shorter and the haul a little bigger', () => {
    const rig = makeColony({ tier: 2 });
    const ex = rig.game.sys.expeditions;
    const ids = crew(rig.game).map((c) => c.id).slice(0, 3);
    rig.game.state.player.vehicles.push('mining_truck');
    const foot = ex.preview('rd_wreck', ids)!;
    const truck = ex.preview('rd_wreck', ids, 'mining_truck')!;
    expect(truck.seconds).toBeLessThan(foot.seconds);
    expect(truck.value).toBeGreaterThan(foot.value);
  });
});

describe('expeditions: away colonists', () => {
  it('leave their jobs (the automation refills them), eat nothing, vanish from the world and come back to their post', () => {
    const rig = makeColony({ tier: 2, crew: ['gatherer', 'gatherer', 'gatherer'] });
    const g = rig.game;
    const camp = placeNear(g, 'logging_camp');
    g.sys.colonists.refresh();
    const workers = crew(g).filter((c) => c.workplace === camp);
    expect(workers).toHaveLength(2);
    const idle = crew(g).find((c) => c.workplace == null)!;
    const leaver = workers[0];
    g.sys.economy.recompute();
    const upkeepBefore = g.sys.economy.upkeep('food');

    const assigned = collect<{ id: number; workplace: number | null }>(g, 'colonist:assigned');
    const e = g.sys.expeditions.launch('cv_debris', [leaver.id])!;
    expect(e.prevWork).toEqual([camp]);
    expect(leaver.away).toBe(true);
    expect(leaver.workplace).toBeNull();
    // the idle colonist took the free slot ("their jobs fall back to the existing logic")
    expect(idle.workplace).toBe(camp);
    expect(assigned.some((a) => a.id === leaver.id && a.workplace === null)).toBe(true);
    g.sys.economy.recompute();
    expect(g.sys.economy.upkeep('food')).toBeCloseTo(upkeepBefore - g.data.balance.foodPerColonistPerMin);
    // nobody can put them to work while they are away; the AI leaves them alone
    expect(g.sys.colonists.assign(leaver.id, camp)).toBe(false);
    const x = leaver.x;
    rig.step(5);
    expect(leaver.x).toBe(x);
    expect(leaver.workplace).toBeNull();
    expect(g.sys.colonists.present()).not.toContain(leaver);
    // happiness is frozen while away
    leaver.happiness = 12;
    rig.step(3);
    expect(leaver.happiness).toBe(12);

    // back after 15 minutes: their old job is theirs again, with an adventure glow
    rig.wait(15 * MIN);
    expect(leaver.away).toBe(false);
    expect(g.sys.expeditions.get(e.id)!.status).toBe('back');
    expect(leaver.workplace).toBe(camp);
    expect(leaver.trip!.mood).toBeGreaterThan(0);
    expect(g.sys.colonists.happinessFactors(leaver).some((f) => f.label === 'Great adventure!')).toBe(true);
    // the stand-in went back to being free (or found other work)
    expect(crew(g).filter((c) => c.workplace === camp)).toHaveLength(2);
  });

  it('a long trip on foot leaves the squad a little tired; a vehicle keeps it an adventure', () => {
    const rig = makeColony({ tier: 6 });
    const g = rig.game;
    const [a, b] = crew(g);
    g.state.player.vehicles.push('titanium_hovercraft');
    g.sys.expeditions.launch('th_summit', [a.id]);
    g.sys.expeditions.launch('cc_wreck', [b.id], 'titanium_hovercraft');
    rig.wait(8 * HOUR + 2 * MIN);
    expect(a.trip!.mood).toBeLessThan(0);
    expect(b.trip!.mood).toBeGreaterThan(0);
  });
});

describe('expeditions: timers and hauls', () => {
  it('finishes while the app is closed (absolute timers) and the haul waits until Collect', () => {
    const rig = makeColony({ tier: 3 });
    const ids = crew(rig.game).slice(0, 3).map((c) => c.id);
    const e = rig.game.sys.expeditions.launch('rd_outpost', ids)!;
    expect(e.endsAt - e.startedAt).toBe(4 * HOUR);
    // the app closes; 5 hours later it boots from the save
    const back = reload(rig, rig.clock.now + 5 * HOUR);
    const ex = back.game.sys.expeditions;
    const trip = ex.get(e.id)!;
    expect(trip.status).toBe('back');
    expect(trip.haul?.resources?.iron).toBeGreaterThan(0);
    for (const id of ids) expect(back.game.sys.colonists.get(id)!.away).toBe(false);
    const ironBefore = back.game.state.resources.amounts.iron ?? 0;
    const res = ex.collect(e.id)!;
    expect(res.reward).toEqual(trip.haul);
    expect((back.game.state.resources.amounts.iron ?? 0) - ironBefore + (res.leftBehind.iron ?? 0)).toBe(trip.haul!.resources!.iron);
    expect(ex.list()).toHaveLength(0);
    expect(back.game.state.expeditions.collected).toBe(1);
  });

  it('a squad still out when the game loads keeps walking (and is still away)', () => {
    const rig = makeColony({ tier: 2 });
    const id = crew(rig.game)[0].id;
    rig.game.sys.expeditions.launch('cv_stash', [id]);
    const back = reload(rig, rig.clock.now + 20 * MIN);
    expect(back.game.sys.expeditions.out()).toHaveLength(1);
    expect(back.game.sys.colonists.get(id)!.away).toBe(true);
    expect(back.game.sys.colonists.get(id)!.workplace).toBeNull();
    back.wait(41 * MIN);
    expect(back.game.sys.expeditions.ready()).toHaveLength(1);
  });

  it('rolls the same haul for the same seed, within ±10% of the plan', () => {
    const data = createDataRegistry();
    const spec = regionalSpec(data.expedition('rd_wreck')!);
    const plan = planHaul(data, spec, [{ specialty: 'miner', skill: 3 }, { specialty: 'farmer', skill: 1 }]);
    const a = rollHaul(data, plan, 12345);
    const b = rollHaul(data, plan, 12345);
    expect(a).toEqual(b);
    const c = rollHaul(data, plan, 777);
    expect(c.reward).not.toEqual(a.reward);
    for (let seed = 1; seed < 60; seed++) {
      const r = rollHaul(data, plan, seed).reward;
      for (const [k, n] of Object.entries(plan.resources)) {
        expect(r.resources![k]).toBeGreaterThanOrEqual(Math.floor(n * 0.88));
        expect(r.resources![k]).toBeLessThanOrEqual(Math.ceil(n * 1.12));
      }
    }
  });

  it('the haul grows with tier, duration, profession match and skill', () => {
    const data = createDataRegistry();
    const v = (id: string, crew: { specialty: string; skill: number }[]) => planHaul(data, regionalSpec(data.expedition(id)!), crew).value;
    const plain = [{ specialty: 'farmer', skill: 1 }];
    expect(v('rd_wreck', plain)).toBeGreaterThan(v('rd_scrap', plain)); // 1 h vs 15 min
    expect(v('rd_outpost', plain)).toBeGreaterThan(v('rd_wreck', plain)); // Steel tier, 4 h
    expect(v('rd_wreck', [{ specialty: 'mechanic', skill: 1 }])).toBeGreaterThan(v('rd_wreck', plain)); // knows the terrain
    expect(v('rd_wreck', [{ specialty: 'farmer', skill: 5 }])).toBeGreaterThan(v('rd_wreck', plain)); // seasoned
  });

  it('a returning squad may overfill storage like Welcome Back; anything past that is reported', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const e = g.sys.expeditions.launch('rd_wreck', crew(g).slice(0, 3).map((c) => c.id))!;
    rig.wait(61 * MIN);
    const haul = g.sys.expeditions.get(e.id)!.haul!;
    const cap = g.sys.economy.capacity('steel');
    g.state.resources.amounts.steel = cap * 3 - 10; // nearly at the allowance already
    const res = g.sys.expeditions.collect(e.id)!;
    expect(g.state.resources.amounts.steel).toBe(cap * 3);
    expect(res.leftBehind.steel).toBe(haul.resources!.steel! - 10);
  });

  it('squads earn a little work experience on the road', () => {
    const rig = makeColony({ tier: 3 });
    const c = crew(rig.game)[0];
    c.skill = 1;
    c.xp = 0;
    rig.game.sys.expeditions.launch('pf_camp', [c.id]);
    rig.wait(4 * HOUR + MIN);
    expect(c.skill > 1 || c.xp > 0).toBe(true);
  });
});

describe('expeditions: survivors and finds', () => {
  /** Content with a survivor and a crate that always turn up. */
  function luckyData() {
    const d = defaultData();
    const lucky: ExpeditionDef = { ...d.expeditions.find((x) => x.id === 'pf_camp')!, id: 'test_lucky', tier: 2, duration: 900, finds: [{ chance: 1, reward: { colonist: 'rare' } }, { chance: 1, reward: { items: { alloy_crate: 1 } } }] };
    return createDataRegistry({ ...d, expeditions: [...d.expeditions, lucky] });
  }

  it('a survivor found on the trip joins the colony at Collect; finds land in the inventory', () => {
    const rig = makeColony({ tier: 2, data: luckyData() });
    const g = rig.game;
    const before = g.state.colonists.list.length;
    const e = g.sys.expeditions.launch('test_lucky', [crew(g)[0].id])!;
    rig.wait(16 * MIN);
    const haul = g.sys.expeditions.get(e.id)!.haul!;
    expect(haul.colonist).toBe('rare');
    expect(haul.items?.alloy_crate).toBe(1);
    const joined = collect<{ rarity: string }>(g, 'colonist:recruited');
    g.sys.expeditions.collect(e.id);
    expect(g.state.colonists.list.length).toBe(before + 1);
    expect(joined[0].rarity).toBe('rare');
    expect(g.state.player.items.alloy_crate).toBe(1);
  });

  it('at most one survivor per trip (the rarest one rolled)', () => {
    const data = createDataRegistry();
    const spec = { ...regionalSpec(data.expedition('pf_camp')!), finds: [{ chance: 1, reward: { colonist: 'common' as const } }, { chance: 1, reward: { colonist: 'epic' as const } }] };
    const r = rollHaul(data, planHaul(data, spec, [{ specialty: 'doctor', skill: 2 }]), 9).reward;
    expect(r.colonist).toBe('epic');
  });
});

describe('expeditions: events', () => {
  it('emits launched / returned / collected for toasts, analytics and missions', () => {
    const rig = makeColony({ tier: 2 });
    const g = rig.game;
    const launched = collect<{ dest: string; squad: number[]; seconds: number }>(g, 'expedition:launched');
    const returned = collect<{ dest: string }>(g, 'expedition:returned');
    const collected = collect<{ dest: string; region: string; reward: unknown }>(g, 'expedition:collected');
    const toasts = collect<{ text: string; icon?: string }>(g, 'ui:toast');
    const ids = crew(g).slice(0, 2).map((c) => c.id);
    const e = g.sys.expeditions.launch('pf_berries', ids)!;
    expect(launched).toEqual([expect.objectContaining({ dest: 'pf_berries', squad: ids, seconds: 900 })]);
    rig.wait(15 * MIN);
    expect(returned).toEqual([expect.objectContaining({ dest: 'pf_berries' })]);
    const back = toasts.find((t) => /back from Glowberry Picking/.test(t.text))!;
    expect(back).toBeTruthy();
    // the icon is shown next to the text: "🧭 🧭 Your squad…" for a Frontier site, which has no painting to swap in
    expect(back.icon).toBe('🧭');
    expect(back.text.startsWith('🧭')).toBe(false);
    g.sys.expeditions.collect(e.id);
    expect(collected).toEqual([expect.objectContaining({ dest: 'pf_berries', region: 'pinewood_forest' })]);
  });
});

describe('expeditions: the Frontier and the Star Chart', () => {
  it('opens after Titanium with a board of three uncharted sites (1 h, 4 h, 8 h), stable until one is visited', () => {
    expect(makeColony({ tier: 5 }).game.sys.expeditions.frontierSites()).toEqual([]);
    const rig = makeColony({ tier: 6 });
    const ex = rig.game.sys.expeditions;
    const board = ex.frontierSites();
    expect(board.map((s) => s.duration)).toEqual([HOUR / 1000, (4 * HOUR) / 1000, (8 * HOUR) / 1000]);
    expect(ex.frontierSites()).toEqual(board);
    for (const s of board) expect(rig.game.data.biome(s.biome)).toBeTruthy();
    ex.launch(board[0].id, [crew(rig.game)[0].id]);
    expect(ex.frontierSites()[0].id).not.toBe(board[0].id); // fresh signals
    expect(ex.out()[0].site).toEqual(board[0]);
  });

  it('charts a site on Collect and pays milestone rewards on the Star Chart (endless past the last one)', () => {
    const rig = makeColony({ tier: 6 });
    const g = rig.game;
    const ex = g.sys.expeditions;
    const charted = collect<{ count: number }>(g, 'expedition:charted');
    for (let i = 0; i < 5; i++) {
      const site = ex.frontierSites()[0];
      const e = ex.launch(site.id, [crew(g)[i % 3].id])!;
      rig.wait(HOUR + MIN);
      const res = ex.collect(e.id)!;
      expect(res.charted!.name).toBe(site.name);
      expect(res.charted!.depth).toBe(i + 1);
      if (i === 4) expect(res.milestone?.count).toBe(5);
    }
    expect(charted.map((c) => c.count)).toEqual([1, 2, 3, 4, 5]);
    expect(ex.charted()).toHaveLength(5);
    expect(ex.claimableMilestones().map((m) => m.count)).toEqual([5]);
    const crates = g.state.player.items.titan_crate ?? 0;
    const nova = g.state.liveops.nova;
    expect(ex.claimMilestone(5)).toBeTruthy();
    expect(g.state.player.items.titan_crate).toBe(crates + 2);
    expect(g.state.liveops.nova).toBe(nova + 10);
    expect(ex.claimMilestone(5)).toBeNull(); // once
    expect(ex.nextMilestone()?.count).toBe(10);
    // past the authored ladder a "Frontier Legend" waits every 10 sites
    g.state.expeditions.frontier.charted = Array.from({ length: 63 }, (_, i) => ({ id: `x${i}`, name: 'X', biome: 'crash_valley', depth: i + 1, at: 0 }));
    const ms = ex.milestones();
    expect(ms.filter((m) => m.title.startsWith('Frontier Legend')).map((m) => m.count)).toEqual([60, 70]);
    expect(ex.nextMilestone()!.count).toBe(70);
  });

  it('rare finds escalate the deeper the chart goes', () => {
    const rig = makeColony({ tier: 6 });
    const ex = rig.game.sys.expeditions;
    const ids = [crew(rig.game)[0].id];
    const shallow = ex.preview(ex.frontierSites()[0].id, ids)!;
    rig.game.state.expeditions.frontier.charted = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: 'X', biome: 'crash_valley', depth: i + 1, at: 0 }));
    const deep = ex.preview(ex.frontierSites()[0].id, ids)!;
    expect(deep.finds.length).toBeGreaterThan(shallow.finds.length);
    const crate = (p: typeof deep) => p.finds.find((f) => f.reward.items?.titan_crate)!.chance;
    expect(crate(deep)).toBeGreaterThan(crate(shallow));
  });

  it('announces the Frontier once when the colony stands at Titanium', () => {
    const rig = makeColony({ tier: 6 });
    const cards = collect<{ title: string }>(rig.game, 'ui:celebrate');
    rig.step(2);
    rig.step(2);
    expect(cards.filter((c) => /Frontier is open/.test(c.title))).toHaveLength(1);
    expect(rig.game.state.expeditions.frontier.announced).toBe(true);
  });

  it('the Frontier card is news, not a repeat of the Titanium tier card (the UI drops repeats right after a tier-up)', () => {
    // the Titanium tier-up and the Frontier opening land in the same second on a phone (the UI opens the tier card
    // 1.8 s in): only the tier repeats may be dropped
    const rig = makeColony({ tier: 5 });
    const g = rig.game;
    rig.step(2);
    const cards = collect<{ title: string; text?: string }>(g, 'ui:celebrate');
    for (const r of g.data.resources) g.state.resources.amounts[r.id] = 1e7;
    expect(g.sys.progression.tierUp()).toBe(true);
    rig.step(1.5, 0.05);
    const frontier = cards.find((c) => /Frontier is open/.test(c.title))!;
    expect(frontier).toBeTruthy();
    expect(isTierCelebration(frontier.title, frontier.text)).toBe(false);
    const repeats = cards.filter((c) => c !== frontier);
    expect(repeats.length).toBeGreaterThan(0); // progression's own "TITANIUM TIER REACHED!"
    for (const c of repeats) expect(isTierCelebration(c.title, c.text), c.title).toBe(true);
    // the story steps that close a tier say so too
    for (const m of g.data.missions) if (m.type === 'tier' && m.onComplete?.celebrate) expect(isTierCelebration(m.onComplete.celebrate, m.name), m.id).toBe(true);
  });
});
