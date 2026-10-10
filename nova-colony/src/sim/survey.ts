/**
 * SurveySystem — region completion (data/survey.ts). Each region has a survey meter:
 *  - charted: its dry land revealed from the fog (90% counts as all of it), weight 50%;
 *  - points of interest explored (opened, rescued, switched on — ever, restocks don't undo it), weight 35%;
 *  - field guide: its kinds of resource node the player has harvested by hand, weight 15%.
 * Milestones at 25 / 50 / 75 / 100% wait for a tap on Claim in the Map (one at a time, each with its card): a cache of
 * the region's goods scaled to the colony's tier, a survivor who lives out there, a keepsake cosmetic (Nova when it is
 * already owned) and a permanent perk (+5% of the region's goods, +5% research, +1 expedition squad).
 * Also suggests where to go next ("Survey"): a restocked cache, an unopened POI, a beacon to switch on, a signal not
 * found yet, or uncharted ground nearby.
 *
 * The meter only ever grows (fog, explored POIs and the field guide are never undone). Recomputed at most once a
 * second, and only when something it reads changed. A save from before surveys gets the field guide of the nodes it has
 * depleted right now, its milestones reached at once, and one toast.
 *
 * OWNER: exploration. Writes state.world.survey; grants through Game.grant.
 */
import { System } from './System';
import type { Reward } from '../data/schema';
import { SURVEY, regionSurveyDef, REGION_SURVEYS, type SurveyPerk } from '../data/survey';
import { FOG_SIZE } from './world/fog';
import { rollGoods } from './world/poiLoot';
import { WORLD_CELLS, cellCenter } from '../core/constants';

/** Persistent survey state (state.world.survey; saves from before surveys get it in onLoad). */
export interface SurveySave {
  /** NodeDef ids harvested by hand, by region (the field guide). */
  specimens: Record<string, string[]>;
  /** Milestones reached (0..4) by region: announced once. */
  reached: Record<string, number>;
  /** Milestones claimed (0..4) by region. */
  claimed: Record<string, number>;
}

declare module '../core/state' {
  interface WorldState {
    /** Region surveys (sim/survey.ts). Optional in the type: older saves get it on load. */
    survey?: SurveySave;
  }
}

declare module '../core/events' {
  interface GameEvents {
    /** A region's survey reached a milestone (step 0..3 = 25/50/75/100%); its reward waits on the Map. */
    'survey:milestone': { region: string; step: number; pct: number };
    /** A survey milestone's reward was claimed. */
    'survey:claimed': { region: string; step: number; reward: Reward; perk?: SurveyPerk };
    /** A new kind of node went into a region's field guide. */
    'survey:specimen': { region: string; node: string };
  }
}

export interface SurveyProgress {
  region: string;
  unlocked: boolean;
  /** 0..1 of the land that counts as fully charted. */
  charted: number;
  pois: { done: number; total: number };
  /** Field guide: node kinds harvested; `missing` lists the NodeDef ids still to find. */
  specimens: { done: number; total: number; missing: string[] };
  /** Survey meter, whole percent (100 only when everything is done). */
  pct: number;
  /** Milestones reached / claimed (0..4). */
  reached: number;
  claimed: number;
}

/** Where a "Survey" suggestion points. */
export interface SurveyTarget {
  kind: 'restocked' | 'unopened' | 'beacon' | 'signal' | 'uncharted';
  x: number;
  z: number;
  region: string;
  /** POI instance id (POI kinds). */
  poi?: string;
  /** "Restocked: Supply Cache" */
  label: string;
  dist: number;
}

/** What one claim handed out. */
export interface SurveyClaim {
  region: string;
  /** 0..3 = 25 / 50 / 75 / 100%. */
  step: number;
  pct: number;
  title: string;
  reward: Reward;
  perk?: SurveyPerk;
  /** The keepsake was already owned: Nova instead. */
  ownedCosmetic?: string;
  /** 50%: who joined. */
  colonist?: { id: number; name: string };
}

/** Suggestion search radius (world units). */
export const SURVEY_RANGE = 170;
/** Extra distance a kind of target "costs" (closer and surer things first). */
const KIND_COST: Record<SurveyTarget['kind'], number> = { restocked: 0, unopened: 0, beacon: 10, signal: 45, uncharted: 70 };

export class SurveySystem extends System {
  /** Region index per fog square (-1: water / nobody's). */
  private bitRegion = new Int8Array(FOG_SIZE * FOG_SIZE).fill(-1);
  private regionIds: string[] = [];
  private landBits: number[] = [];
  private poisByRegion = new Map<string, string[]>();
  private kindsByRegion = new Map<string, string[]>();
  private progress = new Map<string, SurveyProgress>();
  private dirty = true;
  /** A query between passes saw a new milestone: the next pass announces it. */
  private unannounced = false;
  private lastFog: string | null = null;
  private ready = false;
  /** Milestones reached by a save from before surveys: one toast on the first second of play. */
  private introCount = 0;
  /** Bumped whenever a meter or a claim changes (UI signatures). */
  version = 0;

  override init(): void {
    const bus = this.game.bus;
    const mark = () => {
      this.dirty = true;
    };
    bus.on('world:poiLooted', mark);
    bus.on('world:regionUnlocked', mark);
    bus.on('world:regionDiscovered', mark);
    bus.on('gather:hit', (e) => this.recordSpecimen(e.node));
    bus.on('tick:second', () => {
      if (!this.ready) return;
      if (this.game.state.world.fog !== this.lastFog) this.dirty = true;
      if (this.dirty || this.unannounced) this.refresh('announce');
      if (this.introCount > 0 && this.game.sys.liveops.offersUnlocked()) {
        const n = this.introCount;
        this.introCount = 0;
        this.game.toast(n === 1 ? '🧭 A survey reward is waiting on the Map' : `🧭 ${n} survey rewards are waiting on the Map`, 'reward', undefined, 'map');
      }
    });
  }

  override onLoad(fresh: boolean): void {
    const w = this.game.state.world;
    const migrated = !w.survey;
    const s = (w.survey ??= { specimens: {}, reached: {}, claimed: {} });
    // repair shapes (a hand-edited or damaged save)
    if (typeof s.specimens !== 'object' || !s.specimens) s.specimens = {};
    if (typeof s.reached !== 'object' || !s.reached) s.reached = {};
    if (typeof s.claimed !== 'object' || !s.claimed) s.claimed = {};
    for (const k of Object.keys(s.specimens)) if (!Array.isArray(s.specimens[k])) delete s.specimens[k];
    for (const rec of [s.reached, s.claimed]) {
      for (const k of Object.keys(rec)) {
        const v = rec[k];
        if (typeof v !== 'number' || !Number.isFinite(v)) delete rec[k];
        else rec[k] = Math.max(0, Math.min(SURVEY.milestones.length, Math.floor(v)));
      }
    }
    this.index();
    this.ready = !!this.game.sys.world.gen;
    if (!this.ready) return;
    if (migrated && !fresh) this.seedSpecimens();
    // milestones reached by now are not news: stored silently (a save from before surveys gets one toast below)
    this.refresh('store');
    // a save from before surveys reaches its milestones at once: one toast instead of one per milestone
    this.introCount = migrated && !fresh ? this.claimable() : 0;
  }

  // ---------------------------------------------------------------- static indexes

  /** Fog squares, POIs and node kinds per region (the world is generated from the seed: computed once per load). */
  private index(): void {
    const gen = this.game.sys.world.gen;
    this.progress.clear();
    this.poisByRegion.clear();
    this.kindsByRegion.clear();
    this.bitRegion.fill(-1);
    if (!gen) return;
    this.regionIds = gen.regionIds.slice();
    this.landBits = this.regionIds.map(() => 0);
    const N = WORLD_CELLS;
    const counts = new Int32Array(this.regionIds.length);
    for (let bz = 0; bz < FOG_SIZE; bz++) {
      for (let bx = 0; bx < FOG_SIZE; bx++) {
        counts.fill(0);
        let land = 0;
        for (let z = bz * 4; z < bz * 4 + 4; z++) {
          for (let x = bx * 4; x < bx * 4 + 4; x++) {
            const i = z * N + x;
            if (gen.water[i]) continue;
            land++;
            counts[gen.regionMap[i]]++;
          }
        }
        if (land < SURVEY.minLandCells) continue;
        let best = -1;
        let bn = 0;
        for (let r = 0; r < counts.length; r++) {
          if (counts[r] > bn) {
            bn = counts[r];
            best = r;
          }
        }
        if (best < 0) continue;
        this.bitRegion[bz * FOG_SIZE + bx] = best;
        this.landBits[best]++;
      }
    }
    for (const p of gen.pois) {
      if (p.id.startsWith('poi_s')) continue; // runtime survivor signals (the tutorial camp) are not part of a region
      if (!this.game.data.poi(p.def)) continue;
      const list = this.poisByRegion.get(p.region) ?? [];
      list.push(p.id);
      this.poisByRegion.set(p.region, list);
    }
    const kinds = new Map<string, Map<string, number>>();
    for (const n of gen.nodes) {
      const m = kinds.get(n.region) ?? new Map<string, number>();
      m.set(n.def, (m.get(n.def) ?? 0) + 1);
      kinds.set(n.region, m);
    }
    for (const [region, m] of kinds) {
      this.kindsByRegion.set(
        region,
        [...m.entries()].filter(([, n]) => n >= SURVEY.minSpecimens).map(([k]) => k).sort(),
      );
    }
  }

  /** A save from before surveys: the nodes depleted right now were harvested (not the ones under buildings). */
  private seedSpecimens(): void {
    const w = this.game.state.world;
    const gen = this.game.sys.world.gen;
    for (const key in w.depleted) {
      const t = w.depleted[+key];
      if (!(t < 1e299)) continue;
      const n = gen.nodes[+key];
      if (n) this.addSpecimen(n.region, n.def, false);
    }
  }

  private recordSpecimen(nodeIndex: number): void {
    const n = this.game.sys.world.gen?.nodes[nodeIndex];
    if (n) this.addSpecimen(n.region, n.def, true);
  }

  private addSpecimen(region: string, def: string, announce: boolean): void {
    if (!this.kindsByRegion.get(region)?.includes(def)) return;
    const s = this.save();
    const list = (s.specimens[region] ??= []);
    if (list.includes(def)) return;
    list.push(def);
    this.dirty = true;
    if (announce) this.game.bus.emit('survey:specimen', { region, node: def });
  }

  private save(): SurveySave {
    return (this.game.state.world.survey ??= { specimens: {}, reached: {}, claimed: {} });
  }

  // ---------------------------------------------------------------- meters

  /**
   * Recompute every meter. 'announce' (the once-a-second pass) stores newly reached milestones and announces them,
   * 'store' stores them quietly (load), 'peek' (a query between passes) leaves them for the next pass to announce.
   */
  private refresh(mode: 'announce' | 'store' | 'peek'): void {
    const g = this.game;
    const world = g.sys.world;
    if (!world.gen) return;
    const w = g.state.world;
    this.lastFog = w.fog;
    this.dirty = false;
    if (mode !== 'peek') this.unannounced = false;
    const revealed = this.regionIds.map(() => 0);
    for (let i = 0; i < this.bitRegion.length; i++) {
      const r = this.bitRegion[i];
      if (r >= 0 && world.fog.isRevealedBit(i % FOG_SIZE, (i / FOG_SIZE) | 0)) revealed[r]++;
    }
    const s = this.save();
    let changed = false;
    for (let ri = 0; ri < this.regionIds.length; ri++) {
      const id = this.regionIds[ri];
      const land = this.landBits[ri];
      const charted = land > 0 ? Math.min(1, revealed[ri] / (land * SURVEY.chartFull)) : 1;
      const poiIds = this.poisByRegion.get(id) ?? [];
      let done = 0;
      for (const pid of poiIds) if (this.explored(pid)) done++;
      const kinds = this.kindsByRegion.get(id) ?? [];
      const have = s.specimens[id] ?? [];
      const missing = kinds.filter((k) => !have.includes(k));
      const pf = poiIds.length ? done / poiIds.length : 1;
      const sf = kinds.length ? (kinds.length - missing.length) / kinds.length : 1;
      const W = SURVEY.weights;
      const raw = W.charted * charted + W.pois * pf + W.specimens * sf;
      const pct = charted >= 1 && pf >= 1 && sf >= 1 ? 100 : Math.min(99, Math.floor(raw * 100 + 1e-9));
      const unlocked = world.isUnlocked(id);
      const prev = this.progress.get(id);
      const reachedNow = unlocked ? SURVEY.milestones.filter((m) => pct >= m).length : 0;
      const stored = s.reached[id] ?? 0;
      if (reachedNow > stored && mode === 'peek') this.unannounced = true;
      else if (reachedNow > stored) {
        s.reached[id] = reachedNow;
        if (mode === 'announce') {
          for (let step = stored; step < reachedNow; step++) g.bus.emit('survey:milestone', { region: id, step, pct: SURVEY.milestones[step] });
          if (g.sys.liveops.offersUnlocked()) {
            const name = g.data.biome(id)?.name ?? id;
            const top = SURVEY.milestones[reachedNow - 1];
            g.toast(`🧭 ${name} ${top}% surveyed — a reward waits on the Map`, 'reward', undefined, 'map');
          }
        }
      }
      const p: SurveyProgress = {
        region: id,
        unlocked,
        charted,
        pois: { done, total: poiIds.length },
        specimens: { done: kinds.length - missing.length, total: kinds.length, missing },
        pct,
        reached: Math.max(stored, reachedNow),
        claimed: Math.min(s.claimed[id] ?? 0, SURVEY.milestones.length),
      };
      if (!prev || prev.pct !== p.pct || prev.reached !== p.reached || prev.claimed !== p.claimed || prev.unlocked !== p.unlocked || prev.charted !== p.charted) changed = true;
      this.progress.set(id, p);
    }
    if (changed) this.version++;
  }

  private explored(poiId: string): boolean {
    const w = this.game.state.world;
    return this.game.sys.world.poiExplored(poiId) || w.beacons.includes(poiId);
  }

  /** Bring the meters up to date between the once-a-second passes (milestones are still announced by the pass). */
  private peek(): void {
    if (this.ready && (this.dirty || this.game.state.world.fog !== this.lastFog)) this.refresh('peek');
  }

  /** Survey progress of a region (fresh if anything changed since the last second). */
  region(id: string): SurveyProgress | undefined {
    this.peek();
    return this.progress.get(id);
  }

  /** Every region, in data order. */
  all(): SurveyProgress[] {
    this.peek();
    return this.game.data.biomes.map((b) => this.progress.get(b.id)).filter((p): p is SurveyProgress => !!p);
  }

  /** Milestone rewards waiting for Claim (unlocked regions only). */
  claimable(): number {
    let n = 0;
    for (const p of this.all()) if (p.unlocked) n += Math.max(0, p.reached - p.claimed);
    return n;
  }

  /** The next milestone of a region (null once mastered). */
  next(id: string): { step: number; pct: number; title: string } | null {
    const p = this.region(id);
    if (!p) return null;
    const step = p.claimed < p.reached ? p.claimed : p.reached;
    if (step >= SURVEY.milestones.length) return null;
    return { step, pct: SURVEY.milestones[step], title: SURVEY.titles[step] };
  }

  // ---------------------------------------------------------------- rewards

  /** What a milestone hands out (the 25% cache is rolled at claim time, at the colony's tier; this is a preview). */
  preview(region: string, step: number): { reward: Reward; perk?: SurveyPerk; survivor?: string; cache?: boolean } {
    const def = regionSurveyDef(region);
    const reward: Reward = {};
    const nova = SURVEY.nova[step] ?? 0;
    if (nova) reward.nova = nova;
    reward.xp = SURVEY.xp[step] ?? 0;
    if (!def) return { reward };
    if (step === 0) return { reward, cache: true };
    if (step === 1) return { reward: { ...reward, colonist: def.colonist }, survivor: def.survivor };
    if (step === 2) {
      const owned = this.game.state.liveops.cosmetics.owned.includes(def.cosmetic) || !this.game.data.cosmetic(def.cosmetic);
      return { reward: owned ? { ...reward, nova: (reward.nova ?? 0) + SURVEY.ownedCosmeticNova } : { ...reward, cosmetic: def.cosmetic } };
    }
    return { reward, perk: def.perk };
  }

  /** Claim a region's next reached milestone. Returns what was granted, or null when nothing is waiting. */
  claim(region: string): SurveyClaim | null {
    const g = this.game;
    const p = this.region(region);
    if (!p || !p.unlocked || p.claimed >= p.reached) return null;
    const step = p.claimed;
    const def = regionSurveyDef(region);
    const pre = this.preview(region, step);
    let reward = pre.reward;
    if (step === 0 && def) {
      const eco = g.sys.economy;
      const goods = rollGoods({ data: g.data, tier: g.state.colony.tier, capacity: (id) => eco.capacity(id) }, { minutes: SURVEY.cacheMinutes, picks: def.cache.picks, yields: def.cache.yields }, g.rng);
      reward = { ...goods, ...reward };
    }
    const s = this.save();
    s.claimed[region] = step + 1;
    const center = g.sys.world.gen.regionCenters.find((c) => c.id === region);
    const nextId = g.state.colonists.nextId;
    g.grant(reward, 'survey', center?.x, center?.z);
    const joined = reward.colonist && g.state.colonists.nextId > nextId ? g.sys.colonists.get(g.state.colonists.nextId - 1) : undefined;
    if (pre.perk) g.sys.economy.markDirty();
    this.dirty = true;
    this.peek();
    this.version++;
    const claim: SurveyClaim = { region, step, pct: SURVEY.milestones[step], title: SURVEY.titles[step], reward, perk: pre.perk };
    if (step === 2 && def && !reward.cosmetic) claim.ownedCosmetic = def.cosmetic;
    if (joined) claim.colonist = { id: joined.id, name: joined.name };
    g.bus.emit('survey:claimed', { region, step, reward, perk: pre.perk });
    return claim;
  }

  /** Is a region's 100% perk active? */
  mastered(region: string): boolean {
    // read defensively: the economy asks before this system's onLoad has repaired a damaged slice
    const n = this.game.state.world.survey?.claimed?.[region];
    return typeof n === 'number' && n >= SURVEY.milestones.length;
  }

  /** Stat modifiers of every mastered region (EconomySystem's modifier table adds them). */
  perkModifiers(): { stat: string; add: number }[] {
    const out: { stat: string; add: number }[] = [];
    for (const r of REGION_SURVEYS) if (this.mastered(r.region)) for (const m of r.perk.stats ?? []) out.push(m);
    return out;
  }

  /** Extra expedition squads from mastered regions. */
  extraExpeditionSlots(): number {
    let n = 0;
    for (const r of REGION_SURVEYS) if (this.mastered(r.region)) n += r.perk.expeditionSlots ?? 0;
    return n;
  }

  // ---------------------------------------------------------------- suggestions

  /**
   * Somewhere worth a walk near (x, z) in an unlocked region: a restocked cache, an unopened point of interest, a
   * beacon to switch on, a signal not found yet, or uncharted ground. Nests only from the Steel tier. Linear scan of
   * the POIs and the fog squares: call it about once a second, not every frame.
   */
  suggest(x: number, z: number, range = SURVEY_RANGE, region?: string, skip?: (t: Omit<SurveyTarget, 'dist'>) => boolean): SurveyTarget | null {
    const g = this.game;
    const world = g.sys.world;
    const gen = world.gen;
    if (!gen) return null;
    const st = g.state;
    let best: SurveyTarget | null = null;
    let bestScore = Infinity;
    const consider = (t: Omit<SurveyTarget, 'dist'>) => {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d > range) return;
      const score = d + KIND_COST[t.kind];
      if (score < bestScore && !skip?.(t)) {
        bestScore = score;
        best = { ...t, dist: d };
      }
    };
    for (const p of gen.pois) {
      if (!world.isUnlocked(p.region) || (region && p.region !== region)) continue;
      const def = g.data.poi(p.def);
      if (!def) continue;
      if (def.kind === 'nest' && st.colony.tier < 3) continue;
      const ps = st.world.pois[p.id];
      if (def.kind === 'beacon') {
        if (st.world.beacons.includes(p.id)) continue;
        consider({ kind: ps?.discovered ? 'beacon' : 'signal', x: p.x, z: p.z, region: p.region, poi: p.id, label: ps?.discovered ? `Switch on the ${def.name}` : this.signalLabel(p.region) });
        continue;
      }
      if (ps?.looted) continue;
      if (!ps?.discovered) {
        consider({ kind: 'signal', x: p.x, z: p.z, region: p.region, poi: p.id, label: this.signalLabel(p.region) });
        continue;
      }
      const again = world.poiRestocked(p.id);
      const label = again ? `Restocked: ${def.name}` : def.kind === 'camp' ? `Survivors waiting: ${def.name}` : `Unopened: ${def.name}`;
      consider({ kind: again ? 'restocked' : 'unopened', x: p.x, z: p.z, region: p.region, poi: p.id, label });
    }
    if (!best || bestScore > KIND_COST.uncharted + 40) {
      // uncharted ground: the nearest fogged square of dry land in an unlocked region
      const N = FOG_SIZE;
      for (let i = 0; i < this.bitRegion.length; i++) {
        const r = this.bitRegion[i];
        if (r < 0) continue;
        const fx = i % N;
        const fz = (i / N) | 0;
        if (world.fog.isRevealedBit(fx, fz)) continue;
        const id = this.regionIds[r];
        if (!world.isUnlocked(id) || (region && id !== region)) continue;
        const wx = cellCenter(fx * 4 + 2) - 1;
        const wz = cellCenter(fz * 4 + 2) - 1;
        if (Math.abs(wx - x) > range || Math.abs(wz - z) > range) continue;
        consider({ kind: 'uncharted', x: wx, z: wz, region: id, label: `Uncharted ground in ${g.data.biome(id)?.name ?? 'the wilds'}` });
      }
    }
    return best;
  }

  private signalLabel(region: string): string {
    return `Something out there in ${this.game.data.biome(region)?.name ?? 'the wilds'}`;
  }
}
