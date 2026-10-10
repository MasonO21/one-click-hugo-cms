/**
 * ExpeditionSystem — squads of colonists (and optionally a vehicle) leave from the expedition headquarters (the Radio
 * Tower: `BuildingDef.expeditions`) for a destination in a discovered region and come back after a fixed time with
 * a haul. After Titanium the Frontier opens: endless trips to generated, uncharted sites that fill a persistent Star
 * Chart with milestone rewards.
 *
 * Rules (cozy):
 *  - Nobody gets hurt. A squad is simply away: no job (the automation refills their slots), no meals, no bed time,
 *    hidden in the world. They keep their beds and take their old jobs back when they return.
 *  - Timers are absolute (`game.now()` epoch ms), so trips finish while the app is closed. The squad walks home on
 *    its own at the end of the timer; the haul waits at the headquarters until the player taps Collect.
 *  - The haul is rolled from a seed stored at launch: deterministic, no save-scumming, no surprises.
 *  - Collect may overflow storage up to `balance.offlineStorageMult` × capacity like Welcome Back; anything past
 *    that is reported, never silently lost.
 *
 * Events: expedition:launched / expedition:returned / expedition:collected / expedition:charted /
 * expedition:milestone (toasts, analytics, missions hook in).
 *
 * OWNER: expeditions. Writes state.expeditions and the colonists' `away` / `trip` flags (through ColonistSystem).
 */
import { System } from './System';
import type { BuildingInstance, ChartedSite, Colonist, Expedition, FrontierSite, Id } from '../core/state';
import type { ExpeditionDef, FrontierMilestone, Rarity, Reward, VehicleDef } from '../data/schema';
import { gainWorkXp } from './colony/skills';
import { describeReward } from './meta/util';
import {
  frontierSites,
  frontierSpec,
  planHaul,
  regionalSpec,
  rollHaul,
  type HaulPlan,
  type Member,
  type TripSpec,
} from './expedition/rules';

declare module '../core/events' {
  interface GameEvents {
    'expedition:launched': { id: Id; dest: string; region: string; squad: Id[]; vehicle: string | null; seconds: number; frontier: boolean };
    'expedition:returned': { id: Id; dest: string; region: string; name: string };
    'expedition:collected': { id: Id; dest: string; region: string; name: string; reward: Reward; frontier: boolean; leftBehind: Record<string, number> };
    'expedition:charted': { site: ChartedSite; count: number };
    'expedition:milestone': { count: number; title: string; reward: Reward };
  }
}

/** Why a destination or a launch is not possible right now (null = go!). */
export type Refusal = string | null;

export interface DestinationStatus {
  def: ExpeditionDef;
  ok: boolean;
  /** Lock reason ("Reach the Steel tier", "Discover Toxic Marsh first"). */
  reason: Refusal;
}

export interface CollectResult {
  reward: Reward;
  name: string;
  /** Resources that did not fit even with the Welcome Back allowance. */
  leftBehind: Record<string, number>;
  charted?: ChartedSite;
  /** A Star Chart milestone became claimable. */
  milestone?: MilestoneView;
}

export interface MilestoneView extends FrontierMilestone {
  reached: boolean;
  claimed: boolean;
}

const SECOND = 1;

export class ExpeditionSystem extends System {
  private acc = 0;
  private announceChecked = false;

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    this.game.bus.on('colony:tierUp', () => {
      this.announceChecked = false;
    });
  }

  override onLoad(_fresh: boolean): void {
    this.sanitize();
    this.syncAway();
    this.checkReturns(); // trips that ended while the app was closed
  }

  override update(dt: number): void {
    this.acc += dt;
    if (this.acc < SECOND) return;
    this.acc = 0;
    this.checkReturns();
    if (!this.announceChecked) {
      this.announceChecked = true;
      this.announceFrontier();
    }
  }

  // ---------------------------------------------------------------- unlock & capacity

  private get rules() {
    return this.game.data.expeditionRules;
  }

  /** The expedition headquarters (a finished building with `expeditions`), if any. */
  hq(): BuildingInstance | null {
    for (const b of this.game.state.buildings.list) {
      if (b.status === 'building') continue;
      if (this.game.data.building(b.def)?.expeditions) return b;
    }
    return null;
  }

  /** The building type that hosts expeditions (for "build a Radio Tower" hints). */
  hqDef() {
    return this.game.data.buildings.find((d) => d.expeditions);
  }

  /** Null when squads can be sent out, else why not. */
  lockReason(): Refusal {
    const st = this.game.state;
    if (st.colony.tier < this.rules.unlockTier) return `Expeditions open at the ${this.game.data.tier(this.rules.unlockTier).name} tier`;
    if (!this.hq()) return `Build a ${this.hqDef()?.name ?? 'Radio Tower'} to send expeditions`;
    return null;
  }

  unlocked(): boolean {
    return this.lockReason() === null;
  }

  frontierUnlocked(): boolean {
    return this.game.state.colony.tier >= this.rules.frontier.unlockTier;
  }

  /** Squads that may be out at once at the current tier. */
  slots(): number {
    const tier = this.game.state.colony.tier;
    let n = 0;
    for (const s of this.rules.slots) if (tier >= s.tier) n = Math.max(n, s.slots);
    // a mastered Frozen Ridge survey adds a squad (sim/survey.ts), once the Radio Tower sends any
    return n > 0 ? n + (this.game.sys.survey?.extraExpeditionSlots() ?? 0) : n;
  }

  /** The tier where one more squad slot opens (null at the maximum). */
  nextSlotTier(): number | null {
    const tier = this.game.state.colony.tier;
    const s = this.rules.slots.filter((x) => x.tier > tier).sort((a, b) => a.tier - b.tier)[0];
    return s ? s.tier : null;
  }

  // ---------------------------------------------------------------- queries

  list(): Expedition[] {
    return this.game.state.expeditions.list;
  }

  out(): Expedition[] {
    return this.list().filter((e) => e.status === 'out');
  }

  /** Back home with a haul waiting to be collected. */
  ready(): Expedition[] {
    return this.list().filter((e) => e.status === 'back');
  }

  /** Slots in use (a squad back home with an uncollected haul still holds its slot). */
  busySlots(): number {
    return this.list().length;
  }

  freeSlots(): number {
    return Math.max(0, this.slots() - this.busySlots());
  }

  get(id: Id): Expedition | undefined {
    return this.list().find((e) => e.id === id);
  }

  /** Seconds until the squad is back (0 when it is). */
  secondsLeft(e: Expedition): number {
    return e.status === 'back' ? 0 : Math.max(0, (e.endsAt - this.game.now()) / 1000);
  }

  isAway(colonistId: Id): boolean {
    return this.out().some((e) => e.squad.includes(colonistId));
  }

  /** The trip a colonist is on (null when home). */
  tripOf(colonistId: Id): Expedition | null {
    return this.out().find((e) => e.squad.includes(colonistId)) ?? null;
  }

  vehicleAway(vehicleId: string): boolean {
    return this.out().some((e) => e.vehicle === vehicleId);
  }

  /** Owned vehicles that could go along (not out on another trip). */
  vehicles(): VehicleDef[] {
    const p = this.game.state.player;
    return p.vehicles.map((id) => this.game.data.vehicle(id)).filter((v): v is VehicleDef => !!v && !this.vehicleAway(v.id));
  }

  /** Colonists at home who could join a squad. */
  candidates(): Colonist[] {
    return this.game.state.colonists.list.filter((c) => !c.away);
  }

  /** Every regional destination with whether it can be visited and why not. */
  destinations(): DestinationStatus[] {
    return this.game.data.expeditions.map((def) => ({ def, ...this.destinationStatus(def) }));
  }

  destinationStatus(def: ExpeditionDef): { ok: boolean; reason: Refusal } {
    const st = this.game.state;
    const g = this.game;
    if (!st.world.regionsDiscovered.includes(def.region)) return { ok: false, reason: `Discover ${g.data.biome(def.region)?.name ?? def.region} first` };
    if (st.colony.tier < def.tier) return { ok: false, reason: `Reach the ${g.data.tier(def.tier).name} tier` };
    return { ok: true, reason: null };
  }

  /** The current Frontier signal board (one uncharted site per duration rung). */
  frontierSites(): FrontierSite[] {
    if (!this.frontierUnlocked()) return [];
    const fr = this.game.state.expeditions.frontier;
    return frontierSites(this.game.data, this.game.state.seed, fr.signal, fr.charted.length);
  }

  /** Resolve a destination id or a Frontier site id to its trip. */
  spec(target: string): TripSpec | null {
    const def = this.game.data.expedition(target);
    if (def) return regionalSpec(def);
    const site = this.frontierSites().find((s) => s.id === target);
    return site ? frontierSpec(this.game.data, site) : null;
  }

  /** Expected haul for a squad (UI preview); also what the roll is based on. */
  preview(target: string, squad: readonly Id[], vehicle: string | null = null): HaulPlan | null {
    const spec = this.spec(target);
    if (!spec) return null;
    return planHaul(this.game.data, spec, this.members(squad), vehicle ? this.game.data.vehicle(vehicle) : null, this.haulMod());
  }

  /** Expeditions mastery (sim/mastery.ts): the haul is valued when the squad gets home. */
  private haulMod(): number {
    return this.game.sys.economy.modifier('expeditionHaul');
  }

  private members(ids: readonly Id[]): Member[] {
    const out: Member[] = [];
    for (const id of ids) {
      const c = this.game.sys.colonists.get(id);
      if (c) out.push({ specialty: c.specialty, skill: c.skill });
    }
    return out;
  }

  // ---------------------------------------------------------------- launch

  /** Null when this squad can leave for `target` now, else a friendly reason. */
  canLaunch(target: string, squad: readonly Id[], vehicle: string | null = null): Refusal {
    const lock = this.lockReason();
    if (lock) return lock;
    const spec = this.spec(target);
    if (!spec) return 'That destination is out of reach';
    if (spec.dest !== 'frontier') {
      const st = this.destinationStatus(this.game.data.expedition(spec.dest)!);
      if (!st.ok) return st.reason;
    }
    if (this.freeSlots() <= 0) return this.ready().length ? 'Collect the squad that is back first' : 'Every squad is out: wait for one to come home';
    if (!squad.length) return 'Pick at least one colonist';
    if (squad.length > this.rules.squadMax) return `A squad has at most ${this.rules.squadMax} colonists`;
    if (new Set(squad).size !== squad.length) return 'Each colonist can only go once';
    for (const id of squad) {
      const c = this.game.sys.colonists.get(id);
      if (!c) return 'That colonist is not in the colony';
      if (c.away) return `${c.name.split(' ')[0]} is already away`;
    }
    if (vehicle) {
      const p = this.game.state.player;
      if (!p.vehicles.includes(vehicle) || !this.game.data.vehicle(vehicle)) return "You don't own that vehicle yet";
      if (this.vehicleAway(vehicle)) return 'That vehicle is already out on a trip';
      if (p.vehicle === vehicle) return "You're riding it: hop off first";
    }
    return null;
  }

  /** Send a squad out. Returns the trip, or null (with a toast) when it cannot leave. */
  launch(target: string, squad: readonly Id[], vehicle: string | null = null): Expedition | null {
    const g = this.game;
    const why = this.canLaunch(target, squad, vehicle);
    if (why) {
      g.toast(why, 'info', '🧭');
      g.bus.emit('sfx', { id: 'ui_error' });
      return null;
    }
    const spec = this.spec(target)!;
    const plan = planHaul(g.data, spec, this.members(squad), vehicle ? g.data.vehicle(vehicle) : null, this.haulMod());
    const st = g.state.expeditions;
    const now = g.now();
    const ids = [...squad];
    const crew = ids.map((id) => g.sys.colonists.get(id)!);
    const site = spec.dest === 'frontier' ? this.frontierSites().find((s) => s.id === target) : undefined;
    const e: Expedition = {
      id: st.nextId++,
      dest: spec.dest,
      ...(site ? { site: { ...site } } : {}),
      squad: ids,
      prevWork: crew.map((c) => c.workplace),
      prevManual: crew.map((c) => !!c.manual),
      vehicle,
      startedAt: now,
      endsAt: now + plan.seconds * 1000,
      tier: g.state.colony.tier,
      seed: Math.floor(g.rng.next() * 0x7fffffff) ^ (st.nextId * 0x9e37),
      status: 'out',
      haul: null,
    };
    st.list.push(e);
    st.launched++;
    if (site) st.frontier.signal++; // the board fills with fresh signals
    g.sys.colonists.sendAway(ids);
    g.bus.emit('expedition:launched', { id: e.id, dest: e.dest, region: spec.region, squad: ids, vehicle, seconds: plan.seconds, frontier: !!site });
    g.bus.emit('sfx', { id: vehicle ? 'vehicle_start' : 'discover' });
    return e;
  }

  // ---------------------------------------------------------------- return & collect

  /** Bring home every squad whose timer ran out (also used after an absence). */
  checkReturns(): number {
    const now = this.game.now();
    let n = 0;
    // everyone welcomed home in this pass: they are not stand-ins, so a squad mate from the same workshop can't bump them
    const home = new Set<Id>();
    for (const e of this.list()) {
      if (e.status === 'out' && now >= e.endsAt) {
        this.returnHome(e, home);
        n++;
      }
    }
    return n;
  }

  /** Display name of a trip. */
  nameOf(e: Pick<Expedition, 'dest' | 'site'>): string {
    if (e.dest === 'frontier') return e.site?.name ?? 'the Frontier';
    return this.game.data.expedition(e.dest)?.name ?? 'an expedition';
  }

  regionOf(e: Pick<Expedition, 'dest' | 'site'>): string {
    if (e.dest === 'frontier') return e.site?.biome ?? '';
    return this.game.data.expedition(e.dest)?.region ?? '';
  }

  private specOf(e: Expedition): TripSpec | null {
    if (e.dest === 'frontier') return e.site ? frontierSpec(this.game.data, e.site) : null;
    const def = this.game.data.expedition(e.dest);
    return def ? regionalSpec(def) : null;
  }

  /** Where returning squads appear: just outside the headquarters (else by the core). */
  private homeSpot(i: number): { x: number; z: number } {
    const bs = this.game.sys.buildings;
    const b = this.hq() ?? bs.core() ?? null;
    const c = b ? bs.center(b) : { x: 0, z: 0 };
    return { x: c.x + (i - 1) * 1.1, z: c.z + 2.6 };
  }

  private returnHome(e: Expedition, home: Set<Id> = new Set()): void {
    const g = this.game;
    const spec = this.specOf(e);
    const vehicle = e.vehicle ? g.data.vehicle(e.vehicle) : null;
    const members = this.members(e.squad);
    if (spec && members.length) {
      const plan = planHaul(g.data, spec, members, vehicle, this.haulMod());
      e.haul = rollHaul(g.data, plan, e.seed).reward;
      e.mood = plan.mood;
    } else {
      e.haul = {};
      e.mood = 0;
    }
    e.status = 'back';
    const rules = this.rules;
    const hours = Math.max(0, (e.endsAt - e.startedAt) / 3_600_000);
    const xp = Math.min(rules.xpMax, hours * rules.xpPerHour);
    const moodHours = (e.mood ?? 0) >= 0 ? rules.mood.adventureHours : rules.mood.wearyHours;
    e.squad.forEach((id, i) => {
      const c = g.sys.colonists.get(id);
      if (!c) return;
      const at = this.homeSpot(i);
      g.sys.colonists.welcomeHome(id, at.x, at.z, { building: e.prevWork[i] ?? null, manual: !!e.prevManual[i], keep: home });
      home.add(id);
      if (e.mood) c.trip = { mood: e.mood, until: e.endsAt + moodHours * 3_600_000 };
      if (xp > 0) gainWorkXp(g, c, xp);
    });
    const name = this.nameOf(e);
    g.bus.emit('expedition:returned', { id: e.id, dest: e.dest, region: this.regionOf(e), name });
    const who = e.squad.length === 1 ? (g.sys.colonists.get(e.squad[0])?.name.split(' ')[0] ?? 'Your explorer') + ' is' : 'Your squad is';
    // the icon carries the 🧭 (the UI swaps in the destination's painting when it has one)
    // tappable: it opens Expeditions, and waits behind Welcome Back however long that is read
    g.toast(`${who} back from ${name}! Collect the haul at the ${this.hqDef()?.name ?? 'Radio Tower'}.`, 'success', '🧭', 'expeditions');
  }

  /** Unpack a returned squad's haul. Returns what was granted (null if there is nothing to collect). */
  collect(id: Id): CollectResult | null {
    const g = this.game;
    const st = g.state.expeditions;
    const e = this.get(id);
    if (!e || e.status !== 'back') return null;
    const reward = e.haul ?? {};
    const name = this.nameOf(e);
    const region = this.regionOf(e);
    // resources: like Welcome Back, a returning squad may overfill storage up to capacity × offlineStorageMult
    const leftBehind = this.addResources(reward.resources ?? {});
    const rest: Reward = {};
    if (reward.items) rest.items = reward.items;
    if (reward.nova) rest.nova = reward.nova;
    if (reward.rp) rest.rp = reward.rp;
    if (reward.xp) rest.xp = reward.xp;
    if (Object.keys(rest).length) g.grant(rest, 'expedition');
    if (reward.colonist) {
      const at = this.homeSpot(1);
      g.sys.colonists.grant(reward.colonist as Rarity, at.x, at.z + 1.2);
    }
    st.list = st.list.filter((x) => x !== e);
    st.collected++;
    const out: CollectResult = { reward, name, leftBehind };
    if (e.dest === 'frontier') {
      const before = this.milestones().filter((m) => m.reached).length;
      out.charted = this.chart(e, reward);
      const reached = this.milestones().filter((m) => m.reached);
      if (reached.length > before) out.milestone = reached[reached.length - 1];
    }
    g.bus.emit('expedition:collected', { id: e.id, dest: e.dest, region, name, reward, frontier: e.dest === 'frontier', leftBehind });
    g.bus.emit('sfx', { id: 'collect' });
    return out;
  }

  /** Collect every squad that is back. Returns how many. */
  collectAll(): number {
    let n = 0;
    for (const e of this.ready()) if (this.collect(e.id)) n++;
    return n;
  }

  /** Add resources allowing the Welcome Back overflow; returns what did not fit. */
  private addResources(bag: Record<string, number | undefined>): Record<string, number> {
    const g = this.game;
    const res = g.state.resources;
    const mult = Math.max(1, g.data.balance.offlineStorageMult ?? 1);
    const left: Record<string, number> = {};
    for (const [k, v] of Object.entries(bag)) {
      const n = Math.floor(v ?? 0);
      if (!(n > 0)) continue;
      const cur = res.amounts[k] ?? 0;
      const room = Math.max(0, Math.floor(g.sys.economy.capacity(k) * mult - cur));
      const add = Math.min(n, room);
      if (add > 0) {
        res.amounts[k] = cur + add;
        res.lifetime[k] = (res.lifetime[k] ?? 0) + add;
        g.bus.emit('resource:gained', { id: k, amount: add, source: 'reward' });
      }
      if (n > add) left[k] = n - add;
    }
    return left;
  }

  // ---------------------------------------------------------------- Frontier & Star Chart

  private chart(e: Expedition, reward: Reward): ChartedSite {
    const g = this.game;
    const fr = g.state.expeditions.frontier;
    const site = e.site;
    const best = this.bestFind(reward);
    const charted: ChartedSite = {
      id: site?.id ?? `f?-${e.id}`,
      name: site?.name ?? 'Uncharted site',
      biome: site?.biome ?? 'crash_valley',
      depth: fr.charted.length + 1,
      at: g.now(),
      ...(best ? { find: best } : {}),
    };
    fr.charted.push(charted);
    g.bus.emit('expedition:charted', { site: charted, count: fr.charted.length });
    const m = this.milestones().find((x) => x.count === fr.charted.length);
    if (m) g.toast(`Star Chart milestone: ${m.title}! Claim it on the Frontier tab.`, 'reward', '🏅');
    return charted;
  }

  /** The most notable thing in a haul ("Quantum Chip", "Epic survivor"). */
  private bestFind(r: Reward): string | undefined {
    if (r.colonist) return `${r.colonist.charAt(0).toUpperCase()}${r.colonist.slice(1)} survivor`;
    const items = Object.keys(r.items ?? {});
    const rank = (id: string) => this.game.data.item(id)?.tier ?? 0;
    const top = items.sort((a, b) => rank(b) - rank(a))[0];
    if (top) return this.game.data.item(top)?.name ?? top;
    if (r.nova) return `${r.nova} Nova`;
    return undefined;
  }

  charted(): ChartedSite[] {
    return this.game.state.expeditions.frontier.charted;
  }

  /** Star Chart milestones up to (and including) the next unreached one, with their state. */
  milestones(): MilestoneView[] {
    const fr = this.rules.frontier;
    const st = this.game.state.expeditions.frontier;
    const n = st.charted.length;
    const list: FrontierMilestone[] = [...fr.milestones];
    const last = fr.milestones[fr.milestones.length - 1]?.count ?? 0;
    // endless: another legend every `repeat.every` sites past the last authored milestone
    for (let c = last + fr.repeat.every, k = 1; c <= Math.max(n, last) + fr.repeat.every; c += fr.repeat.every, k++) {
      list.push({ count: c, title: `${fr.repeat.title} ${toRoman(k)}`, reward: fr.repeat.reward });
    }
    return list.map((m) => ({ ...m, reached: n >= m.count, claimed: st.claimed.includes(m.count) }));
  }

  /** The next milestone not reached yet. */
  nextMilestone(): MilestoneView | null {
    return this.milestones().find((m) => !m.reached) ?? null;
  }

  claimableMilestones(): MilestoneView[] {
    return this.milestones().filter((m) => m.reached && !m.claimed);
  }

  claimMilestone(count: number): Reward | null {
    const g = this.game;
    const m = this.milestones().find((x) => x.count === count);
    const st = g.state.expeditions.frontier;
    if (!m || !m.reached || m.claimed) return null;
    st.claimed.push(count);
    g.grant(m.reward, 'expedition');
    g.bus.emit('expedition:milestone', { count, title: m.title, reward: m.reward });
    return m.reward;
  }

  /** "The Frontier is open" once, the first time a colony stands at Titanium (also for older saves). */
  private announceFrontier(): void {
    const fr = this.game.state.expeditions.frontier;
    if (fr.announced || !this.frontierUnlocked()) return;
    fr.announced = true;
    this.game.bus.emit('ui:celebrate', {
      title: 'The Frontier is open!',
      text: `Your ${this.hqDef()?.name ?? 'Radio Tower'} picked up signals from beyond the map. Send squads to chart uncharted sites on your Star Chart.`,
      icon: '🌌',
    });
  }

  // ---------------------------------------------------------------- save hygiene

  /** Drop junk entries from an old or damaged save; trips to content that no longer exists come home empty-handed. */
  private sanitize(): void {
    const st = this.game.state.expeditions;
    const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    st.list = (Array.isArray(st.list) ? st.list : []).filter(
      (e) => !!e && typeof e === 'object' && isNum(e.id) && typeof e.dest === 'string' && Array.isArray(e.squad) && isNum(e.startedAt) && isNum(e.endsAt),
    );
    const known = new Set(this.game.state.colonists.list.map((c) => c.id));
    // no trip lasts longer than the longest destination: one ending further ahead left while the device clock was
    // set forward (the squad would be "back in 2,000 h"). It keeps its own length, counted from now.
    const longest = 1000 * Math.max(0, ...this.game.data.expeditions.map((d) => d.duration), ...this.rules.frontier.durations);
    const now = this.game.now();
    for (const e of st.list) {
      e.squad = e.squad.filter((id) => isNum(id) && known.has(id));
      e.prevWork = Array.isArray(e.prevWork) ? e.prevWork : e.squad.map(() => null);
      e.prevManual = Array.isArray(e.prevManual) ? e.prevManual : e.squad.map(() => false);
      if (e.status !== 'out' && e.status !== 'back') e.status = 'out';
      if (e.vehicle !== null && typeof e.vehicle !== 'string') e.vehicle = null;
      if (!isNum(e.seed)) e.seed = e.id * 7919;
      if (!isNum(e.tier)) e.tier = this.game.state.colony.tier;
      if (e.haul === undefined) e.haul = null;
      // the same for a trip that left "later than now" (the clock was set back since): it walks its own length from now
      if (e.status === 'out' && ((longest > 0 && e.endsAt - now > longest) || e.startedAt > now)) {
        const len = Math.max(0, Math.min(e.endsAt - e.startedAt, longest > 0 ? longest : Infinity));
        e.startedAt = now;
        e.endsAt = now + len;
      }
      if (e.status === 'out' && (!this.specOf(e) || !e.squad.length)) {
        // the destination vanished from the content (or the squad did): come home now with whatever was found
        e.endsAt = Math.min(e.endsAt, this.game.now());
      }
    }
    const nextId = 1 + st.list.reduce((m, e) => Math.max(m, e.id), 0);
    if (!isNum(st.nextId) || st.nextId < nextId) st.nextId = nextId;
    const fr = st.frontier;
    fr.charted = (Array.isArray(fr.charted) ? fr.charted : []).filter((s) => !!s && typeof s.name === 'string');
    fr.claimed = (Array.isArray(fr.claimed) ? fr.claimed : []).filter(isNum);
    if (!isNum(fr.signal) || fr.signal < 0) fr.signal = 0;
    if (!isNum(st.launched)) st.launched = 0;
    if (!isNum(st.collected)) st.collected = 0;
  }

  /** The colonists' `away` flags mirror the trips that are out (the trip list is the source of truth). */
  private syncAway(): void {
    const g = this.game;
    const away = new Set<Id>();
    for (const e of this.out()) for (const id of e.squad) away.add(id);
    const leaving: Id[] = [];
    for (const c of g.state.colonists.list) {
      if (away.has(c.id) && !c.away) leaving.push(c.id);
      else if (!away.has(c.id) && c.away) {
        const at = this.homeSpot(0);
        g.sys.colonists.welcomeHome(c.id, at.x, at.z);
      }
    }
    if (leaving.length) g.sys.colonists.sendAway(leaving);
  }

  /** Human text for a reward (toasts / tests). */
  describe(r: Reward): string {
    return describeReward(r, this.game.data);
  }
}

function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}
