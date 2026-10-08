/**
 * Achievements — the system: progress from counters and state, unlock on threshold, retro unlock on load without
 * toast spam, claim once, save round trip, old saves, platform + analytics hooks.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createInitialState, deserializeState, serializeState, type GameState } from '../src/core/state';
import { AchievementSystem, EVAL_IDLE_GAP, RETRO_TOAST_DELAY } from '../src/sim/achievements';
import { RecordingAchievements } from '../src/platform/achievements';
import { migrateState } from '../src/platform/saveMigrate';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';
import type { AchievementDef } from '../src/data/schema';
import { fakeBuilding, fakeColonist, makeGame, makeServices, type TestGame } from './meta.helpers';

type Counter = Extract<AchievementDef['source'], { kind: 'counter' }>;

/** Advance the clock and the achievement system (and nothing else). */
function tick(g: TestGame, seconds = EVAL_IDLE_GAP + 1): void {
  g.clock.now += seconds * 1000;
  g.game.sys.achievements.update(seconds);
}

function withRecorder(): { g: TestGame; rec: RecordingAchievements } {
  const rec = new RecordingAchievements();
  const services = makeServices();
  services.achievements = rec;
  const g = makeGame({ services });
  g.game.state.tutorial.done = true; // past the guided first session (it keeps announcements quiet)
  return { g, rec };
}

function listen(game: Game) {
  const unlocked: string[] = [];
  const toasts: { text: string; open?: string; icon?: string }[] = [];
  const retro: number[] = [];
  game.bus.on('achievement:unlocked', (e) => unlocked.push(e.id));
  game.bus.on('ui:toast', (e) => toasts.push({ text: e.text, open: e.open, icon: e.icon }));
  game.bus.on('achievement:retro', (e) => retro.push(e.count));
  return { unlocked, toasts, journalToasts: () => toasts.filter((t) => t.open === 'journal'), retro };
}

/** Make the world do what an achievement's counter asks, through the same bus events the real systems emit. */
function produce(game: Game, src: Counter, n: number): void {
  const bus = game.bus;
  const t = src.target;
  switch (src.type) {
    case 'gather':
      bus.emit('resource:gained', { id: t === '*' ? 'wood' : t, amount: n, source: 'gather' });
      break;
    case 'build': {
      const def = t === '*' ? 'floor' : t.startsWith('category:') ? game.data.buildings.find((b) => b.category === t.slice(9))!.id : t;
      for (let i = 0; i < n; i++) bus.emit('building:completed', { id: 5000 + i, def });
      break;
    }
    case 'upgrade':
      for (let i = 0; i < n; i++) bus.emit('building:upgraded', { id: 1, def: t === '*' ? 'shelter' : t, level: 2, tier: 0 });
      break;
    case 'kill':
      for (let i = 0; i < n; i++) bus.emit('alien:killed', { id: i, def: t === '*' ? 'crawler' : t, x: 0, z: 0, by: 'turret' });
      break;
    case 'defend':
      for (let i = 0; i < n; i++) bus.emit('combat:ended', { wave: i + 1, kills: 1, reward: {} });
      break;
    case 'craft':
      for (let i = 0; i < n; i++) bus.emit('craft:completed', { recipe: t === '*' ? 'r_bandage' : t });
      break;
    case 'research':
      for (let i = 0; i < n; i++) bus.emit('research:completed', { id: t === '*' ? 'sharper_tools' : t });
      break;
    case 'loot':
      for (let i = 0; i < n; i++) bus.emit('world:poiLooted', { id: `p${i}`, poi: t === '*' ? 'supply_cache' : t, reward: {} });
      break;
    case 'rescue':
      for (let i = 0; i < n; i++) bus.emit('survivor:rescued', { poi: `p${i}`, colonist: i });
      break;
    case 'expedition':
      for (let i = 0; i < n; i++) {
        if (t === 'launch') bus.emit('expedition:launched', { id: i, dest: 'cv_debris', region: 'crash_valley', squad: [], vehicle: null, seconds: 60, frontier: false });
        else bus.emit('expedition:collected', { id: i, dest: t === 'frontier' ? 'frontier' : 'cv_debris', region: 'crash_valley', name: 'x', reward: {}, frontier: t === 'frontier', leftBehind: {} });
      }
      break;
    default:
      throw new Error(`produce: unsupported counter ${src.type}`);
  }
}

/** Put state-backed achievements at `n` (a metric). */
function setMetric(game: Game, metric: string, n: number): void {
  const s = game.state;
  switch (metric) {
    case 'playHours': s.playTime = n * 3600; break;
    case 'colonyTier': s.colony.tier = n; break;
    case 'colonists': while (s.colonists.list.length < n) s.colonists.list.push(fakeColonist(s.colonists.nextId++)); break;
    case 'legendary': {
      for (let i = 0; i < n; i++) s.colonists.list.push({ ...fakeColonist(s.colonists.nextId++), rarity: 'legendary' });
      break;
    }
    case 'regions': s.world.regionsDiscovered = game.data.biomes.slice(0, n).map((b) => b.id); break;
    case 'research': s.research.completed = game.data.research.slice(0, n).map((r) => r.id); break;
    case 'loginDays': s.liveops.daily.streak = n; break;
    case 'charted':
      s.expeditions.frontier.charted = Array.from({ length: n }, (_, i) => ({ id: `f${i}`, name: 'Site', biome: 'red_desert', depth: i + 1, at: 0 }));
      break;
    case 'buildingTypes': game.data.buildings.slice(0, n).forEach((b) => (s.missions.counters[`build:${b.id}`] = 1)); break;
    case 'alienTypes': game.data.aliens.slice(0, n).forEach((a) => (s.missions.counters[`kill:${a.id}`] = 1)); break;
    default: throw new Error(`setMetric: ${metric}`);
  }
}

/** Do everything an achievement asks for. */
function fulfil(game: Game, d: AchievementDef): void {
  if (d.source.kind === 'counter') produce(game, d.source, d.target - (game.state.missions.counters[`${d.source.type}:${d.source.target}`] ?? 0));
  else setMetric(game, d.source.metric, d.target);
}

describe('achievements — progress & unlock', () => {
  it('starts empty on a fresh colony, with nothing claimable and no toast', () => {
    const g = makeGame({ start: false });
    const ev = listen(g.game);
    g.game.start();
    const a = g.game.sys.achievements;
    expect(a.summary()).toMatchObject({ total: g.game.data.achievements.length, unlocked: 0, claimed: 0, claimable: 0 });
    expect(a.claimable()).toEqual([]);
    expect(ev.unlocked).toEqual([]);
    expect(ev.journalToasts()).toEqual([]);
    expect(ev.retro).toEqual([]);
  });

  it('reads progress from the mission counters (a gather event moves the Lumberjack bar)', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 120, source: 'gather' });
    expect(a.progress('ach_lumberjack_bronze')).toEqual({ value: 120, target: 500, done: false });
    expect(a.value('ach_lumberjack_gold')).toBe(120);
    // production and drops count like gathering, offline earnings and refunds do not
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 30, source: 'production' });
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 5000, source: 'offline' });
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 5000, source: 'refund' });
    expect(a.value('ach_lumberjack_bronze')).toBe(150);
  });

  it('unlocks on the threshold: one event, one toast that opens the Journal, one platform report', () => {
    const { g, rec } = withRecorder();
    const ev = listen(g.game);
    const a = g.game.sys.achievements;
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 499, source: 'gather' });
    tick(g);
    expect(a.isUnlocked('ach_lumberjack_bronze')).toBe(false);
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 1, source: 'gather' });
    tick(g, 1.1); // an event marks it dirty: noticed within a second
    expect(a.isUnlocked('ach_lumberjack_bronze')).toBe(true);
    expect(a.unlockedAt('ach_lumberjack_bronze')).toBe(g.clock.now);
    expect(ev.unlocked).toEqual(['ach_lumberjack_bronze']);
    expect(ev.journalToasts()).toEqual([{ text: 'Achievement: Lumberjack · Bronze', open: 'journal', icon: '🥉' }]);
    expect(rec.reported).toEqual(['ach_lumberjack_bronze']);
    // nothing more happens on later passes
    tick(g);
    tick(g);
    expect(ev.unlocked).toHaveLength(1);
    expect(rec.reported).toHaveLength(1);
  });

  it('several unlocks in one pass make one toast', () => {
    const { g } = withRecorder();
    const ev = listen(g.game);
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 6000, source: 'gather' }); // bronze + silver
    tick(g, 1.1);
    expect(ev.unlocked).toEqual(['ach_lumberjack_bronze', 'ach_lumberjack_silver']);
    expect(ev.journalToasts()).toEqual([{ text: '2 achievements earned!', open: 'journal', icon: '🏅' }]);
  });

  it('an unlock is latched: it stays earned when the number drops again', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    setMetric(g.game, 'colonists', 3);
    tick(g);
    expect(a.isUnlocked('ach_welcome_home_bronze')).toBe(true);
    g.game.state.colonists.list.length = 0;
    tick(g);
    expect(a.isUnlocked('ach_welcome_home_bronze')).toBe(true);
    expect(a.progress('ach_welcome_home_bronze')).toEqual({ value: 3, target: 3, done: true });
  });

  it('bosses, tiers and a legendary colonist are one-off trophies', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    g.game.bus.emit('alien:killed', { id: 1, def: 'elder_brute', x: 0, z: 0, by: 'turret' });
    g.game.state.colony.tier = 2;
    g.game.state.colonists.list.push({ ...fakeColonist(1), rarity: 'legendary' });
    tick(g);
    for (const id of ['ach_boss_elder_brute', 'ach_tier_1', 'ach_tier_2', 'ach_legend']) expect(a.isUnlocked(id), id).toBe(true);
    expect(a.isUnlocked('ach_boss_hive_mother')).toBe(false);
    expect(a.isUnlocked('ach_tier_3')).toBe(false);
  });

  it('every achievement can be earned through the events and state the game really produces', () => {
    const { g, rec } = withRecorder();
    const a = g.game.sys.achievements;
    for (const d of g.game.data.achievements) {
      fulfil(g.game, d);
      tick(g);
      expect(a.isUnlocked(d.id), `${d.id} (${d.description}) never unlocked`).toBe(true);
    }
    const s = a.summary();
    expect(s.unlocked).toBe(s.total);
    expect(s.medals.special).toBe(g.game.data.achievements.filter((d) => d.medal === 'special').length);
    expect(rec.reported).toHaveLength(s.total);
    expect(new Set(rec.reported).size).toBe(s.total);
  });

  it('keeps its work small: evaluation is rate-limited, not per frame', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements as unknown as { evaluate: (silent: boolean) => unknown; update: (dt: number) => void };
    let calls = 0;
    const real = a.evaluate.bind(a);
    a.evaluate = (silent: boolean) => {
      calls++;
      return real(silent);
    };
    for (let i = 0; i < 600; i++) a.update(0.016); // ~10 s of frames
    expect(calls).toBeLessThanOrEqual(2);
  });
});

describe('achievements — the guided first session', () => {
  it('keeps unlocking but stays quiet: no toast until the tutorial is done, then one', () => {
    const g = makeGame();
    const ev = listen(g.game);
    expect(g.game.sys.liveops.offersUnlocked()).toBe(false);
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 600, source: 'gather' });
    setMetric(g.game, 'colonists', 3);
    tick(g, 1.1);
    expect(ev.unlocked.sort()).toEqual(['ach_lumberjack_bronze', 'ach_welcome_home_bronze']); // analytics and platform still hear
    expect(g.game.sys.achievements.claimableCount()).toBe(2);
    tick(g);
    expect(ev.journalToasts()).toEqual([]);
    g.game.state.tutorial.done = true;
    tick(g, 1.1);
    expect(ev.journalToasts()).toEqual([{ text: '2 achievements earned!', open: 'journal', icon: '🏅' }]);
    tick(g);
    expect(ev.journalToasts()).toHaveLength(1);
  });

  it('the catch-up summary also waits for the offers to open', () => {
    const state = richState();
    state.tutorial.done = false;
    state.stats.wavesWon = 0;
    const g = makeGame({ start: false, state });
    const ev = listen(g.game);
    g.game.start();
    tick(g);
    expect(ev.retro).toHaveLength(1);
    expect(ev.journalToasts()).toEqual([]);
    g.game.state.stats.wavesWon = 1;
    tick(g, 1);
    expect(ev.journalToasts()).toHaveLength(1);
  });
});

describe('achievements — claiming', () => {
  it('claims once: grants the reward, refuses a second claim and an unearned one', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    const st = g.game.state;
    const before = { wood: st.resources.amounts.wood ?? 0, xp: st.liveops.season.xp, bundles: st.player.items.timber_bundle ?? 0 };
    expect(a.claim('ach_lumberjack_bronze')).toBe(false); // not earned yet
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 500, source: 'gather' });
    tick(g);
    const claims: string[] = [];
    g.game.bus.on('achievement:claimed', (e) => claims.push(e.id));
    expect(a.claimable().map((d) => d.id)).toEqual(['ach_lumberjack_bronze']);
    expect(a.claim('ach_lumberjack_bronze')).toBe(true);
    expect(a.claim('ach_lumberjack_bronze')).toBe(false);
    expect(claims).toEqual(['ach_lumberjack_bronze']);
    expect(st.liveops.season.xp - before.xp).toBe(30);
    expect(st.player.items.timber_bundle).toBe(before.bundles + 1);
    expect(a.isClaimed('ach_lumberjack_bronze')).toBe(true);
    expect(a.claimedAt('ach_lumberjack_bronze')).toBe(g.clock.now);
    expect(a.claimable()).toEqual([]);
    expect(st.resources.amounts.wood ?? 0).toBeGreaterThanOrEqual(before.wood); // sanity: nothing was taken away
  });

  it('pays Nova on silver and gold, and the summed reward of a line matches claimLine', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    const st = g.game.state;
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 5000, source: 'gather' });
    tick(g, 1.1);
    const waiting = a.claimable().filter((d) => d.line === 'lumberjack');
    expect(waiting.map((d) => d.medal)).toEqual(['bronze', 'silver']);
    const sum = AchievementSystem.sumRewards(waiting);
    expect(sum.nova).toBe(3);
    expect(sum.xp).toBe(180);
    expect(sum.items).toEqual({ timber_bundle: 3, supply_crate: 1 });
    const nova0 = st.liveops.nova;
    const xp0 = st.liveops.season.xp;
    expect(a.claimLine('lumberjack')).toBe(2);
    expect(st.liveops.nova - nova0).toBe(3);
    expect(st.liveops.season.xp - xp0).toBe(180);
    expect(a.claimLine('lumberjack')).toBe(0);
  });

  it('claim all takes everything waiting, once', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    setMetric(g.game, 'colonists', 15);
    setMetric(g.game, 'colonyTier', 3);
    tick(g);
    const waiting = a.claimable().length;
    expect(waiting).toBe(2 + 3);
    expect(a.claimAll()).toBe(waiting);
    expect(a.claimAll()).toBe(0);
    expect(a.summary().claimed).toBe(waiting);
    expect(a.claimableCount()).toBe(0);
  });

  it('a batch is granted as one sum: one reward event and one level-up announcement, not a pile', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    const st = g.game.state;
    setMetric(g.game, 'colonists', 15);
    setMetric(g.game, 'colonyTier', 3);
    tick(g);
    const waiting = a.claimable();
    const grants: { source: string; xp?: number }[] = [];
    const levelToasts: string[] = [];
    g.game.bus.on('reward:granted', (e) => grants.push({ source: e.source, xp: e.reward.xp }));
    g.game.bus.on('ui:toast', (e) => {
      if (e.text.includes('Season level')) levelToasts.push(e.text);
    });
    const xp0 = st.liveops.season.xp;
    expect(a.claimAll()).toBe(waiting.length);
    expect(grants.filter((x) => x.source === 'achievement')).toHaveLength(1);
    expect(st.liveops.season.xp - xp0).toBe(waiting.reduce((n, d) => n + (d.reward.xp ?? 0), 0));
    expect(levelToasts.length).toBeLessThanOrEqual(1);
  });

  it('a failing reward never blocks the claim flow', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    setMetric(g.game, 'colonists', 3);
    tick(g);
    const orig = g.game.grant.bind(g.game);
    g.game.grant = () => {
      throw new Error('boom');
    };
    expect(a.claim('ach_welcome_home_bronze')).toBe(true);
    g.game.grant = orig;
    expect(a.isClaimed('ach_welcome_home_bronze')).toBe(true);
  });

  it('summary counts medals earned, not just claimed', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    setMetric(g.game, 'colonists', 15);
    tick(g);
    a.claim('ach_welcome_home_bronze');
    expect(a.summary()).toMatchObject({ unlocked: 2, claimed: 1, claimable: 1, medals: { bronze: 1, silver: 1, gold: 0, special: 0 } });
  });
});

/** A state that has already done a lot, as a save from before the Journal would. */
function richState(): GameState {
  const { game } = makeGame({ start: false });
  const st = game.state;
  st.missions.counters = { 'gather:wood': 6200, 'gather:*': 9000, 'build:*': 300, 'kill:*': 40, 'kill:crawler': 40, 'defend:*': 2, 'loot:*': 6 };
  st.colony.tier = 3;
  st.playTime = 2 * 3600;
  st.research.completed = game.data.research.slice(0, 8).map((r) => r.id);
  st.world.regionsDiscovered = ['crash_valley', 'pinewood_forest', 'red_desert'];
  st.colonists.list.push(fakeColonist(1), fakeColonist(2), fakeColonist(3), fakeColonist(4));
  st.colonists.nextId = 5;
  st.tutorial.done = true;
  st.buildings.list.push(fakeBuilding('shelter', 1), fakeBuilding('campfire', 2));
  st.buildings.nextId = 3;
  return st;
}

describe('achievements — retroactive on load', () => {
  it('an existing save earns what it already earned, claimable, with ONE summary toast and no per-achievement events', () => {
    const state = richState();
    const rec = new RecordingAchievements();
    const services = makeServices();
    services.achievements = rec;
    const g = makeGame({ start: false, state, services });
    const ev = listen(g.game);
    g.game.start();
    const a = g.game.sys.achievements;
    const n = a.summary().unlocked;
    expect(n).toBeGreaterThanOrEqual(12);
    expect(a.claimableCount()).toBe(n);
    expect(ev.unlocked).toEqual([]); // no spam
    expect(ev.retro).toEqual([n]);
    // the summary toast waits for the launch cards to be up, then comes once
    expect(ev.journalToasts()).toEqual([]);
    tick(g, RETRO_TOAST_DELAY + 0.1);
    tick(g);
    tick(g);
    expect(ev.journalToasts()).toEqual([{ text: `${n} achievements already earned!`, open: 'journal', icon: '📔' }]);
    expect(ev.unlocked).toEqual([]);
    expect(rec.reported).toHaveLength(n); // the platform still hears about each one
    for (const id of ['ach_lumberjack_bronze', 'ach_lumberjack_silver', 'ach_handy_hands_bronze', 'ach_handy_hands_silver', 'ach_tier_1', 'ach_tier_3', 'ach_welcome_home_bronze', 'ach_raid_survivor_bronze', 'ach_cartographer_bronze', 'ach_time_well_spent_bronze', 'ach_researcher_bronze', 'ach_treasure_hunter_bronze', 'ach_alien_hunter_bronze']) {
      expect(a.isUnlocked(id), id).toBe(true);
    }
    expect(a.isUnlocked('ach_lumberjack_gold')).toBe(false);
    expect(a.isUnlocked('ach_tier_4')).toBe(false);
  });

  it('after the catch-up, new progress announces itself normally and the summary never repeats', () => {
    const state = richState();
    const g = makeGame({ start: false, state });
    const ev = listen(g.game);
    g.game.start();
    const first = ev.retro.length;
    expect(first).toBe(1);
    tick(g);
    tick(g);
    expect(ev.retro).toHaveLength(1);
    g.game.bus.emit('colony:tierUp', { tier: 4 });
    g.game.state.colony.tier = 4;
    tick(g, 1.1);
    expect(ev.unlocked).toEqual(['ach_tier_4']);
    expect(ev.journalToasts().map((t) => t.text)).toEqual([expect.stringContaining('already earned'), 'Achievement: Alloy Allies']);
  });

  it('a single catch-up reads naturally', () => {
    const { game } = makeGame({ start: false });
    game.state.colonists.list.push(fakeColonist(1), fakeColonist(2), fakeColonist(3));
    game.state.tutorial.done = true;
    const g = makeGame({ start: false, state: game.state });
    const ev = listen(g.game);
    g.game.start();
    tick(g);
    expect(ev.journalToasts().map((t) => t.text)).toEqual(['1 achievement already earned!']);
  });

  it('a reloaded save is quiet: nothing new, no toast', () => {
    const state = richState();
    const first = makeGame({ start: false, state });
    first.game.start();
    const json = serializeState(first.game.state);
    const second = makeGame({ start: false, state: deserializeState(json) });
    const ev = listen(second.game);
    second.game.start();
    expect(ev.journalToasts()).toEqual([]);
    expect(ev.retro).toEqual([]);
    expect(second.game.sys.achievements.summary().unlocked).toBe(first.game.sys.achievements.summary().unlocked);
  });
});

describe('achievements — saves', () => {
  it('round-trips unlocked and claimed ids with their timestamps', () => {
    const { g } = withRecorder();
    const a = g.game.sys.achievements;
    setMetric(g.game, 'colonists', 15);
    tick(g);
    a.claim('ach_welcome_home_bronze');
    const json = serializeState(g.game.state);
    const back = deserializeState(json);
    expect(back.achievements.unlocked).toEqual(g.game.state.achievements.unlocked);
    expect(back.achievements.claimed).toEqual(g.game.state.achievements.claimed);
    const again = makeGame({ state: back });
    const b = again.game.sys.achievements;
    expect(b.isClaimed('ach_welcome_home_bronze')).toBe(true);
    expect(b.isClaimed('ach_welcome_home_silver')).toBe(false);
    expect(b.claimable().map((d) => d.id)).toEqual(['ach_welcome_home_silver']);
    expect(b.claim('ach_welcome_home_bronze')).toBe(false); // can never be paid twice across a reload
    expect(b.claimedAt('ach_welcome_home_bronze')).toBe(a.claimedAt('ach_welcome_home_bronze'));
  });

  it('an old save without the slice loads (deepFill adds it) and plays on', () => {
    const raw = JSON.parse(serializeState(createInitialState(11, 1_700_000_000_000)));
    delete raw.achievements;
    raw.version = 2;
    const state = migrateState(raw);
    expect(state.achievements).toEqual({ unlocked: {}, claimed: {} });
    const g = makeGame({ state });
    expect(g.game.sys.achievements.summary().unlocked).toBe(0);
    tick(g);
  });

  it('a damaged slice is repaired: junk timestamps dropped, a claimed id counts as earned', () => {
    const state = createInitialState(5, 1_700_000_000_000);
    (state.achievements.unlocked as Record<string, unknown>).ach_maker_bronze = 'yesterday';
    (state.achievements.unlocked as Record<string, unknown>).ach_tier_1 = null;
    state.achievements.claimed.ach_tier_2 = 1_700_000_100_000;
    const g = makeGame({ state });
    const a = g.game.sys.achievements;
    expect(a.isUnlocked('ach_maker_bronze')).toBe(false);
    expect(a.isUnlocked('ach_tier_1')).toBe(false);
    expect(a.isUnlocked('ach_tier_2')).toBe(true);
    expect(a.isClaimed('ach_tier_2')).toBe(true);
  });

  it('ids the content no longer has are ignored, not crashed on', () => {
    const state = createInitialState(5, 1_700_000_000_000);
    state.achievements.unlocked.ach_gone_forever = 1;
    const g = makeGame({ state });
    expect(g.game.sys.achievements.claimableCount()).toBe(0);
    expect(g.game.sys.achievements.summary().unlocked).toBe(0);
  });
});

describe('achievements — hooks', () => {
  it('reports each unlock to analytics with the id and the medal tier (consent-gated by the client)', () => {
    const events: { name: string; props?: Record<string, unknown> }[] = [];
    const services = makeServices();
    services.analytics = { setConsent: () => {}, track: (name, props) => events.push({ name, props }), flush: async () => {} };
    const g = makeGame({ services });
    installAnalyticsHooks(g.game);
    g.game.bus.emit('resource:gained', { id: 'wood', amount: 500, source: 'gather' });
    tick(g, 1.1);
    const hit = events.filter((e) => e.name === 'achievement_unlocked');
    expect(hit).toHaveLength(1);
    expect(hit[0].props).toMatchObject({ id: 'ach_lumberjack_bronze', tier: 'bronze' });
  });

  it('a catch-up on load is one aggregate analytics event, not one per achievement', () => {
    const events: { name: string; props?: Record<string, unknown> }[] = [];
    const services = makeServices();
    services.analytics = { setConsent: () => {}, track: (name, props) => events.push({ name, props }), flush: async () => {} };
    const g = makeGame({ start: false, state: richState(), services });
    installAnalyticsHooks(g.game);
    g.game.start();
    expect(events.filter((e) => e.name === 'achievement_unlocked')).toHaveLength(0);
    const retro = events.filter((e) => e.name === 'achievements_retro');
    expect(retro).toHaveLength(1);
    expect(retro[0].props!.count).toBeGreaterThanOrEqual(12);
  });

  it('a platform adapter that throws never breaks an unlock', () => {
    const services = makeServices();
    services.achievements = {
      name: 'bad',
      report: () => {
        throw new Error('no network');
      },
    };
    const g = makeGame({ services });
    setMetric(g.game, 'colonists', 3);
    tick(g);
    expect(g.game.sys.achievements.isUnlocked('ach_welcome_home_bronze')).toBe(true);
  });

  it('works without any platform adapter (older mock services)', () => {
    const g = makeGame();
    expect(g.services.achievements).toBeUndefined();
    setMetric(g.game, 'colonists', 3);
    tick(g);
    expect(g.game.sys.achievements.isUnlocked('ach_welcome_home_bronze')).toBe(true);
  });
});
