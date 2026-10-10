/**
 * Pacing playthrough runner: drives the real Game with the PacingBot from a fresh colony to Titanium, with
 * realistic mobile sessions (online play, then the app closed for a few hours: save -> reload -> Welcome Back)
 * or one long online session, and records what a player would feel: time to each tier, the gaps between
 * accomplishments, bottlenecks, storage caps, raids, colonists, research backlog, missions, exploration and
 * expeditions. Not a test; see tests/pacing.bot.test.ts and scripts/pacing-bot.mjs.
 */
import { Game } from '../../src/core/Game';
import { createMockServices } from '../../src/platform/mock';
import { deserializeState, serializeState } from '../../src/core/state';
import { PacingBot, type Activity, type NovaPolicy } from './bot';

export interface RunOptions {
  seed: number;
  /** 'sessions': short sessions with offline gaps; 'online': one continuous session. */
  mode: 'sessions' | 'online';
  /** Minutes of play per session (sessions mode). */
  sessionMin: number;
  /** Sessions per day, spread over the waking day (07:30 .. 21:30); the night gap fills the rest. */
  sessionsPerDay: number;
  nova: NovaPolicy;
  /** Bot profile (see BotOptions.pace). */
  pace: 'human' | 'fast';
  /** Stop after this much online play (hours). */
  maxOnlineHours: number;
  /** Keep playing this long (online hours) after reaching Titanium (Frontier, post-game goals). */
  postTitaniumHours: number;
  /** Sim step (s); combat phases always step at <= 0.1 s. */
  dt: number;
  /** Print progress lines. */
  verbose: boolean;
  /** Called with the live game and bot when the run ends (debugging). */
  inspect?: (game: Game, bot: PacingBot) => void;
}

export const DEFAULTS: RunOptions = {
  seed: 20261012,
  mode: 'sessions',
  sessionMin: 20,
  sessionsPerDay: 5,
  nova: 'save',
  pace: 'human',
  maxOnlineHours: 80,
  postTitaniumHours: 0,
  dt: 0.25,
  verbose: false,
};

export interface EventRec {
  /** Online seconds. */
  t: number;
  /** Calendar hours since the install. */
  h: number;
  kind: string;
  what: string;
}

export interface Sample {
  t: number;
  h: number;
  tier: number;
  colonists: number;
  beds: number;
  happiness: number;
  rp: number;
  rpPerMin: number;
  researchDone: number;
  researchAvailable: number;
  researchAffordable: number;
  mainActive: number;
  sideActive: number;
  sideClaimable: number;
  dailyOpen: number;
  explored: number;
  regions: number;
  /** Mean survey meter (percent) over the unlocked regions, and survey milestones claimed so far. */
  survey: number;
  surveyClaimed: number;
  defense: number;
  turrets: number;
  buildings: number;
  expeditionsOut: number;
  power: number;
  nova: number;
  /** Fraction of capacity per resource with a cap. */
  fill: Record<string, number>;
  amounts: Record<string, number>;
  net: Record<string, number>;
  goal: string;
  binding: string;
  eta: number;
  activity: Activity;
  /** Colony Spirit meter 0..100 and its fill rate per online minute; lifetime festivals (sim/colony/spirit.ts). */
  spirit: number;
  spiritRate: number;
  festivals: number;
  /** Research Mastery levels by line (sim/mastery.ts) and whether one is affordable now. */
  mastery: Record<string, number>;
  masteryOpen: boolean;
  masteryAffordable: boolean;
  /** Lifetime season XP (liveops) and Nova balance earned so far. */
  seasonXp?: number;
  /** Lifetime mission counters the achievement lines read (gather:wood, loot:*, upgrade:*, kill:* ...). */
  counters?: Record<string, number>;
}

export interface RaidRec {
  t: number;
  h: number;
  tier: number;
  wave: number;
  aliens: number;
  kills: { turret: number; player: number; trap: number; drone: number };
  damage: number;
  broken: number;
  coreBroken: boolean;
  playerDowns: number;
  duration: number;
  defense: number;
  turrets: number;
  boss: string | null;
  rewardValue: number;
}

export interface SessionRec {
  index: number;
  startH: number;
  onlineMin: number;
  gapH: number;
  /** Offline seconds credited (after the 8 h cap and efficiency) for the gap BEFORE this session. */
  offlineCredited: number;
  offlineGainValue: number;
  /** Value the colony would have made over the whole gap at its online rates (no caps). */
  offlinePotential: number;
  tierAtStart: number;
}

export interface RunResult {
  opts: RunOptions;
  events: EventRec[];
  samples: Sample[];
  raids: RaidRec[];
  sessions: SessionRec[];
  tierAt: { tier: number; t: number; h: number }[];
  /** The colony's facilities when each tier was reached: def -> levels (tests/data.pacing.test.ts plans from these). */
  buildout?: Record<number, Record<string, number[]>>;
  /** Seconds (online) each resource sat at >= 99% of its cap, per tier. */
  capped: Record<number, Record<string, number>>;
  /** Seconds per tier the bot spent in each activity. */
  activity: Record<number, Record<string, number>>;
  /** Seconds per tier each resource was the binding one for the next goal. */
  binding: Record<number, Record<string, number>>;
  /** Value (wood-equivalents, RP x3) gained per tier by source: gather, production, offline, mission, crate... */
  income: Record<number, Record<string, number>>;
  /** Reward resources per tier: value announced (crates, missions, chests, medals...) vs value that fit in storage. */
  rewards: Record<number, { announced: number; received: number }>;
  /**
   * Taps and cards per tier: menu actions the bot took (level-ups and "upgrade all" among them), full-screen cards a
   * player would tap through (celebrations, tier-ups, victories, crate / cache scenes) as they come and once plain
   * celebrations within 10 s merge (ui/logic/modalMerge), and fixed-content crates opened from the backpack (with the
   * crate scene, or with a toast when small).
   */
  taps: Record<number, TapRow>;
  botStats: PacingBot['stats'];
  botLog: string[];
  final: { t: number; h: number; tier: number; colonists: number; buildings: number; research: number; explored: number; nova: number; novaEarned: number };
  wallMs: number;
}

export interface TapRow {
  actions: number;
  levelUps: number;
  upgradeAll: number;
  cardsRaw: number;
  cardsMerged: number;
  crateOpens: number;
  crateScenes: number;
}

// a festival and a claimed survey milestone count; Mastery levels are reported on their own (several quick taps per
// visit would flatter the gaps)
const ACCOMPLISHMENT = new Set(['build', 'research', 'recruit', 'mission', 'tier', 'raid', 'expedition', 'wish', 'discover', 'festival', 'survey']);

export function runPlaythrough(partial: Partial<RunOptions> = {}): RunResult {
  const opts: RunOptions = { ...DEFAULTS, ...partial };
  const t0 = Date.now();
  const install = Date.UTC(2026, 9, 12, 7, 30, 0); // a Monday morning
  let now = install;
  const clock = () => now;
  const services = createMockServices();
  let game = new Game({ seed: opts.seed, services, clock });
  game.start();
  const bot = new PacingBot({ nova: opts.nova, pace: opts.pace });
  bot.attach(game);

  const res: RunResult = {
    opts,
    events: [],
    samples: [],
    raids: [],
    sessions: [],
    tierAt: [{ tier: 0, t: 0, h: 0 }],
    capped: {},
    activity: {},
    binding: {},
    income: {},
    rewards: {},
    taps: {},
    botStats: bot.stats,
    botLog: bot.log,
    final: { t: 0, h: 0, tier: 0, colonists: 0, buildings: 0, research: 0, explored: 0, nova: 0, novaEarned: 0 },
    wallMs: 0,
  };
  const hours = () => (now - install) / 3_600_000;
  const T = () => game.state.playTime;
  const ev = (kind: string, what: string) => res.events.push({ t: T(), h: hours(), kind, what });
  let novaEarned = 0;
  let raid: RaidRec | null = null;

  const tapRow = (): TapRow => (res.taps[game.state.colony.tier] ??= { actions: 0, levelUps: 0, upgradeAll: 0, cardsRaw: 0, cardsMerged: 0, crateOpens: 0, crateScenes: 0 });
  bot.onAct = (what) => {
    const row = tapRow();
    row.actions++;
    if (what.startsWith('level up')) row.levelUps++;
    if (what.startsWith('upgrade all')) row.upgradeAll++;
  };
  /** A plain celebration card shown at this playTime (another one within 10 s merges into it). */
  let plainCardAt = -1e9;
  const card = (plain: boolean) => {
    const row = tapRow();
    row.cardsRaw++;
    if (plain && T() - plainCardAt <= 10) return;
    if (plain) plainCardAt = T();
    row.cardsMerged++;
  };
  const listen = (g: Game) => {
    const bus = g.bus;
    bus.on('ui:celebrate', (e) => {
      if (/\btier\b/i.test(`${e.title} ${e.text ?? ''}`)) return; // the tier-up card (counted below)
      card(!/discovered!$|awakened!$|joined/i.test(e.title)); // postcards, events and new faces keep their card
    });
    bus.on('colony:tierUp', () => card(false));
    bus.on('combat:ended', () => card(false));
    bus.on('chest:opened', (e) => {
      if (e.variant === 'crate') tapRow().crateScenes++;
      card(false);
    });
    bus.on('reward:granted', (e) => {
      if (e.reward.colonist) ev('colonist_from', e.source);
      if (e.reward.nova) ev('nova_from', `${e.source} ${e.reward.nova}`);
      // fixed-content crates from the backpack (Nova caches grant card by card and always get their scene)
      if (e.source === 'crate' && e.item && g.data.item(e.item)?.category === 'crate') tapRow().crateOpens++;
    });
    const val = g.data.expeditionRules.value;
    const inc = (src: string, v: number) => {
      const row = (res.income[g.state.colony.tier] ??= {});
      row[src] = (row[src] ?? 0) + v;
    };
    const rw = () => (res.rewards[g.state.colony.tier] ??= { announced: 0, received: 0 });
    bus.on('resource:gained', (e) => {
      if (e.source === 'reward') {
        rw().received += e.amount * (val[e.id] ?? 1);
        return; // counted per reward source below
      }
      inc(e.source, e.amount * (val[e.id] ?? 1));
    });
    bus.on('research:points', (e) => inc('rp', e.amount * 3));
    bus.on('reward:granted', (e) => {
      if (e.source === 'offline') return;
      let v = 0;
      for (const [k, n] of Object.entries(e.reward.resources ?? {})) v += (n ?? 0) * (val[k] ?? 1);
      if (v > 0) inc(`reward:${e.source}`, v);
      if (v > 0) rw().announced += v;
    });
    bus.on('building:completed', (e) => {
      const d = g.data.building(e.def);
      if (d && !d.piece) ev('build', e.def);
    });
    bus.on('building:upgraded', (e) => ev('upgrade', `${e.def} L${e.level}`));
    bus.on('research:completed', (e) => ev('research', e.id));
    bus.on('research:mastered', (e) => ev('mastery', `${e.line} ${e.level}`));
    bus.on('spirit:festival', (e) => ev('festival', String(e.n)));
    bus.on('colonist:recruited', (e) => ev('recruit', e.rarity));
    bus.on('mission:claimed', (e) => ev('mission', `${g.data.mission(e.id)?.chain}:${e.id}`));
    bus.on('colony:tierUp', (e) => {
      ev('tier', String(e.tier));
      res.tierAt.push({ tier: e.tier, t: T(), h: hours() });
      const out: Record<string, number[]> = {};
      for (const b of g.state.buildings.list) {
        const d = g.data.building(b.def);
        if (!d || d.piece || d.core || d.cosmetic) continue;
        (out[b.def] ??= []).push(b.level);
      }
      (res.buildout ??= {})[e.tier] = out;
    });
    bus.on('world:regionDiscovered', (e) => ev('discover', e.id));
    bus.on('world:poiLooted', (e) => ev('loot', e.poi));
    bus.on('survey:claimed', (e) => ev('survey', `${e.region} ${(e.step + 1) * 25}%`));
    bus.on('expedition:launched', (e) => ev('expedition_out', `${e.dest} ${Math.round(e.seconds / 60)}m`));
    bus.on('expedition:collected', (e) => {
      ev('expedition', `${e.dest}`);
      if (e.reward.colonist) ev('colonist_from', 'expedition');
      let v = 0;
      for (const [k, n] of Object.entries(e.reward.resources ?? {})) v += (n ?? 0) * (val[k] ?? 1);
      inc('reward:expedition', v);
      rw().announced += v;
    });
    bus.on('wish:granted', (e) => ev('wish', e.def));
    bus.on('wish:expired', (e) => ev('wish_expired', e.def));
    bus.on('craft:completed', (e) => {
      if (e.factory == null) ev('craft', e.recipe);
    });
    bus.on('world:eventStarted', (e) => ev('world_event', e.def));
    bus.on('nova:changed', (e) => {
      if (e.delta > 0) {
        novaEarned += e.delta;
        ev('nova', String(e.delta));
      }
    });
    // time-based meta: season levels and medals (the report charts when they land over the weeks)
    bus.on('season:levelUp', (e) => ev('season', String(e.level)));
    bus.on('achievement:unlocked', (e) => ev('medal', `${e.medal} ${e.id}`));
    bus.on('combat:started', (e) => {
      const st = g.state;
      raid = {
        t: T(),
        h: hours(),
        tier: st.colony.tier,
        wave: e.wave,
        aliens: e.aliens,
        kills: { turret: 0, player: 0, trap: 0, drone: 0 },
        damage: 0,
        broken: 0,
        coreBroken: false,
        playerDowns: 0,
        duration: 0,
        defense: g.derived.defense.rating,
        turrets: g.derived.defense.turrets,
        boss: null,
        rewardValue: 0,
      };
    });
    bus.on('alien:spawned', (e) => {
      if (raid && g.data.alien(e.def)?.boss) raid.boss = e.def;
    });
    bus.on('alien:killed', (e) => {
      if (raid) raid.kills[e.by] = (raid.kills[e.by] ?? 0) + 1;
    });
    bus.on('building:damaged', (e) => {
      if (raid && g.state.combat.phase === 'attack') raid.damage += e.amount;
    });
    bus.on('building:broken', (e) => {
      if (raid && g.state.combat.phase === 'attack') {
        raid.broken++;
        if (g.data.building(e.def)?.core) raid.coreBroken = true;
      }
    });
    bus.on('player:downed', () => {
      if (raid) raid.playerDowns++;
      ev('player_down', '');
    });
    bus.on('combat:ended', (e) => {
      if (raid) {
        raid.duration = T() - raid.t;
        raid.rewardValue = bot.value(e.reward.resources) + (e.reward.rp ?? 0) * 3;
        res.raids.push(raid);
        raid = null;
      }
      ev('raid', `wave ${e.wave} kills ${e.kills}`);
    });
  };
  listen(game);

  // ---------------------------------------------------------------- sessions
  const sessionStarts = (day: number): number[] => {
    const n = Math.max(1, opts.sessionsPerDay);
    const first = install + day * 86_400_000;
    const span = 14 * 3_600_000;
    return Array.from({ length: n }, (_, k) => first + (n === 1 ? 0 : (k * span) / (n - 1)));
  };
  const schedule: number[] = [];
  for (let d = 0; d < 60; d++) schedule.push(...sessionStarts(d));

  let lastSample = -1e9;
  let titanAt = -1;
  const maxT = opts.maxOnlineHours * 3600;
  let sIndex = 0;
  let pending: SessionRec | null = { index: 0, startH: 0, onlineMin: 0, gapH: 0, offlineCredited: 0, offlineGainValue: 0, offlinePotential: 0, tierAtStart: 0 };

  const sample = () => {
    const g = game;
    const st = g.state;
    const eco = g.sys.economy;
    const fill: Record<string, number> = {};
    const amounts: Record<string, number> = {};
    for (const r of g.data.resources) {
      const cap = eco.capacity(r.id);
      amounts[r.id] = Math.floor(eco.amount(r.id));
      if (cap > 0) fill[r.id] = eco.amount(r.id) / cap;
    }
    const avail = g.sys.research.available();
    res.samples.push({
      t: T(),
      h: hours(),
      tier: st.colony.tier,
      colonists: st.colonists.list.length,
      beds: g.derived.housing.beds,
      happiness: g.derived.happiness.average,
      rp: st.research.points,
      rpPerMin: g.derived.research.perMin,
      researchDone: st.research.completed.length,
      researchAvailable: avail.length,
      researchAffordable: avail.filter((d) => g.sys.research.canResearch(d.id)).length,
      mainActive: g.sys.missions.activeByChain('main').length,
      sideActive: g.sys.missions.activeByChain('side').length,
      sideClaimable: g.sys.missions.activeByChain('side').filter((m) => g.sys.missions.progress(m.id).done).length,
      dailyOpen: g.sys.missions.activeByChain('daily').length,
      explored: g.sys.world.explored(),
      regions: st.world.regionsDiscovered.length,
      ...(() => {
        const open = g.sys.survey.all().filter((p) => p.unlocked);
        return { survey: open.length ? open.reduce((a, p) => a + p.pct, 0) / open.length : 0, surveyClaimed: open.reduce((a, p) => a + p.claimed, 0) };
      })(),
      defense: g.derived.defense.rating,
      turrets: g.derived.defense.turrets,
      buildings: st.buildings.list.filter((b) => !g.data.building(b.def)?.piece).length,
      expeditionsOut: g.sys.expeditions.out().length,
      power: g.derived.power.produced - g.derived.power.consumed,
      nova: g.sys.liveops.nova(),
      fill,
      amounts,
      net: { ...g.derived.netPerMin, rp: g.derived.research.perMin },
      goal: bot.goal.label,
      binding: bot.goal.binding,
      eta: bot.goal.eta,
      activity: bot.activity,
      spirit: st.spirit.meter,
      spiritRate: g.sys.spirit.rate().perMinute,
      festivals: st.spirit.festivals,
      mastery: { ...st.research.mastery },
      masteryOpen: g.sys.research.masteryOpen(),
      masteryAffordable: g.sys.research.masteryInfo().some((m) => m.ready),
      seasonXp: st.liveops.season.xp,
      counters: Object.fromEntries(['gather:wood', 'loot:*', 'upgrade:*', 'kill:*', 'defend:*', 'wish:*', 'expedition:collect', 'build:*', 'craft:*'].map((k) => [k, Math.round(st.missions.counters[k] ?? 0)])),
    });
  };

  const onlineStep = (seconds: number) => {
    const end = T() + seconds;
    while (T() < end) {
      const st = game.state;
      const fight = st.combat.phase === 'attack' || st.combat.phase === 'victory' || (st.combat.phase === 'warning' && st.combat.nextAt - st.playTime < 3);
      const dt = fight ? Math.min(0.1, opts.dt) : opts.dt;
      bot.frame(dt);
      now += dt * 1000;
      game.update(dt);
      // per-tier accounting
      const tier = st.colony.tier;
      const act = (res.activity[tier] ??= {});
      act[bot.activity] = (act[bot.activity] ?? 0) + dt;
      const bind = (res.binding[tier] ??= {});
      bind[bot.goal.binding] = (bind[bot.goal.binding] ?? 0) + dt;
      if (Math.floor(T()) !== Math.floor(T() - dt)) {
        const cap = (res.capped[tier] ??= {});
        const eco = game.sys.economy;
        for (const r of game.data.resources) {
          const c = eco.capacity(r.id);
          if (c > 0 && eco.amount(r.id) >= c * 0.99) cap[r.id] = (cap[r.id] ?? 0) + 1;
        }
      }
      if (T() - lastSample >= 60) {
        lastSample = T();
        sample();
      }
      if (game.state.colony.tier >= 6 && titanAt < 0) titanAt = T();
    }
  };

  const done = () => T() >= maxT || (titanAt >= 0 && T() - titanAt >= opts.postTitaniumHours * 3600);

  if (opts.mode === 'online') {
    bot.sessionLeft = Infinity;
    bot.nextGap = 0;
    const chunk = 600;
    while (!done()) {
      onlineStep(chunk);
      if (opts.verbose) console.log(`[online] ${(T() / 3600).toFixed(2)}h tier ${game.state.colony.tier} colonists ${game.state.colonists.list.length} goal ${bot.goal.label}/${bot.goal.binding}`);
    }
    pending.onlineMin = T() / 60;
    res.sessions.push(pending);
  } else {
    // the very first session is longer: a new player stays for the guided start
    let first = true;
    while (!done() && sIndex < schedule.length - 1) {
      const start = schedule[sIndex];
      if (now < start) now = start; // (first session starts at install)
      const len = (first ? Math.max(opts.sessionMin, 25) : opts.sessionMin) * 60;
      first = false;
      const gap = (schedule[sIndex + 1] - (now + len * 1000)) / 1000;
      const sStart = T();
      // play the session in slices so the bot knows how much session is left
      while (T() - sStart < len && !done()) {
        const left = len - (T() - sStart);
        // a few ulps short after weeks of play (playTime ~1e5 s): T() + left rounds back to T(), so the session is over
        if (left < 1e-6) break;
        bot.sessionLeft = left;
        bot.nextGap = gap;
        onlineStep(Math.min(30, left));
      }
      pending!.onlineMin = (T() - sStart) / 60;
      res.sessions.push(pending!);
      if (opts.verbose) {
        console.log(`[session ${sIndex}] day ${(hours() / 24).toFixed(2)} online ${(T() / 3600).toFixed(2)}h tier ${game.state.colony.tier} colonists ${game.state.colonists.list.length} goal ${bot.goal.label}/${bot.goal.binding} eta ${bot.goal.eta.toFixed(0)}m`);
      }
      if (done()) break;
      // close the app: save, wait, reload, Welcome Back
      const potentialPerMin = Object.entries(game.derived.netPerMin).reduce((s, [k, v]) => s + Math.max(0, v) * (game.data.expeditionRules.value[k] ?? 1), 0) + game.derived.research.perMin * 3;
      const save = serializeState(game.state);
      game.dispose();
      sIndex++;
      now = schedule[sIndex];
      const gapH = gap / 3600;
      game = new Game({ state: deserializeState(save), services, clock });
      listen(game);
      bot.attach(game);
      game.start();
      const off = game.pendingOffline;
      pending = {
        index: sIndex,
        startH: hours(),
        onlineMin: 0,
        gapH,
        offlineCredited: off?.seconds ?? 0,
        offlineGainValue: off ? bot.value(off.gains) + off.rp * 3 : 0,
        offlinePotential: potentialPerMin * (gap / 60),
        tierAtStart: game.state.colony.tier,
      };
      if (off) game.sys.liveops.claimOffline(false);
      ev('session', `#${sIndex} after ${gapH.toFixed(1)}h`);
    }
  }
  sample();
  opts.inspect?.(game, bot);
  const st = game.state;
  res.final = {
    t: T(),
    h: hours(),
    tier: st.colony.tier,
    colonists: st.colonists.list.length,
    buildings: st.buildings.list.length,
    research: st.research.completed.length,
    explored: game.sys.world.explored(),
    nova: game.sys.liveops.nova(),
    novaEarned,
  };
  res.wallMs = Date.now() - t0;
  return res;
}

export function isAccomplishment(kind: string): boolean {
  return ACCOMPLISHMENT.has(kind);
}
