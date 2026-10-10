/**
 * SpiritSystem — Colony Spirit and Festivals: what a happy colony is worth once happiness tops out.
 *
 *  - While the colony's average happiness is above SPIRIT_RULES.threshold, a meter fills during online play, faster
 *    with decor and entertainment, medical care and friendship hearts; every granted wish adds a chunk at once
 *    (spiritRules.ts has the formula, data/spirit.ts the numbers and why).
 *  - Full meter, and no alien attack on: a Festival. For 10 online minutes the colony makes +25% (a production
 *    modifier, online only like the ad boosts), everyone off duty gathers round the campfire nearest the core
 *    (colony/ai.ts), the camp is strung with lights (render/fx/Festival.ts), and a festival chest lands in the
 *    Inventory: the colony tier's supply crates and, from the Stone tier, a Supply Cache.
 *  - Nothing moves while the app is closed (times are `playTime`): no festival is missed, none waits at login.
 *  - Quiet during the guided first session (opens at SPIRIT_RULES.minTier with the tutorial done).
 *
 * Events: spirit:festival (UI toast, missions, render), spirit:festivalEnded.
 * OWNER: spirit. Writes state.spirit.
 */
import { System } from '../System';
import type { SpiritState } from '../../core/state';
import type { Reward } from '../../data/schema';
import { SPIRIT_RULES } from '../../data/spirit';
import { tierCrate } from '../chests';
import { heartsOf } from '../wish/rules';
import { festivalActive, festivalLeft, minutesToFull, spiritRate, type SpiritInputs, type SpiritRate } from './spiritRules';
import { cellOf } from '../../core/constants';

declare module '../../core/events' {
  interface GameEvents {
    /** A festival began (n = lifetime festivals, x/z = where the colony gathers). */
    'spirit:festival': { n: number; x: number; z: number; until: number; reward: Reward };
    'spirit:festivalEnded': { n: number };
  }
}

/** Spacing between colonists in the festival rings (world units) and the first ring's gap from the fire. */
const SLOT_GAP = 1.05;
const RING_GAP = 1.0;
const FIRST_RING = 1.1;
/** Most rings tried before giving up on free ground (colonists then stand where they can). */
const MAX_RINGS = 9;

export function emptySpirit(): SpiritState {
  return { meter: 0, festivalUntil: 0, fx: 0, fz: 0, festivals: 0 };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class SpiritSystem extends System {
  private acc = 0;
  private wasActive = false;
  /** Festival standing spots (x, z pairs), ring by ring outward; rebuilt per festival (runtime only). */
  private slots: number[] = [];
  private slotKey = '';
  private readonly inputs: SpiritInputs = { happiness: 0, amenity: 0, medical: 0, hearts: 0 };
  private rateCache: SpiritRate = spiritRate(this.inputs);

  override init(): void {
    this.game.bus.on('wish:granted', (e) => this.onWish(e.colonist));
  }

  override onLoad(): void {
    const g = this.game;
    const raw = (g.state as { spirit?: unknown }).spirit;
    const s: SpiritState = raw && typeof raw === 'object' ? (raw as SpiritState) : emptySpirit();
    if (!isNum(s.meter) || s.meter < 0) s.meter = 0;
    s.meter = Math.min(s.meter, SPIRIT_RULES.full);
    if (!isNum(s.festivals) || s.festivals < 0) s.festivals = 0;
    if (!isNum(s.fx)) s.fx = 0;
    if (!isNum(s.fz)) s.fz = 0;
    if (!isNum(s.festivalUntil) || s.festivalUntil < 0) s.festivalUntil = 0;
    // a festival never runs longer than one festival from now (a clock jump or a hand-edited save)
    s.festivalUntil = Math.min(s.festivalUntil, g.state.playTime + SPIRIT_RULES.festival.seconds);
    g.state.spirit = s;
    this.acc = 0;
    this.slots = [];
    this.slotKey = '';
    this.wasActive = festivalActive(g.state);
  }

  // ---------------------------------------------------------------- queries

  private get st(): SpiritState {
    return this.game.state.spirit;
  }

  /** The meter fills (and festivals happen) from the Reinforced tier: the guided first session ends there. */
  open(): boolean {
    return this.game.state.colony.tier >= SPIRIT_RULES.minTier;
  }

  active(): boolean {
    return festivalActive(this.game.state);
  }

  /** Online seconds left in the running festival. */
  left(): number {
    return festivalLeft(this.game.state);
  }

  /** The current fill rate and what it is made of (refreshed once per second). */
  rate(): SpiritRate {
    return this.rateCache;
  }

  /** Online minutes until the next festival at the current rate (0 when one is due, Infinity when not filling). */
  minutesToFestival(): number {
    return minutesToFull(this.st.meter, this.rateCache.perMinute);
  }

  /**
   * Where colonist `index` (their place in the colonists list) stands for the festival, written into `out`; false
   * when there is no festival. Rings of free ground round the fire, nearest first.
   */
  slotFor(index: number, out: { x: number; z: number }): boolean {
    if (!this.active()) return false;
    this.ensureSlots();
    const n = this.slots.length >> 1;
    if (n === 0) {
      out.x = this.st.fx;
      out.z = this.st.fz;
      return true;
    }
    const i = ((index % n) + n) % n;
    out.x = this.slots[i * 2];
    out.z = this.slots[i * 2 + 1];
    return true;
  }

  // ---------------------------------------------------------------- update

  override update(dt: number): void {
    this.acc += dt;
    if (this.acc < 1) return;
    const step = this.acc;
    this.acc = 0;
    const g = this.game;
    const st = this.st;
    const active = this.active();
    if (this.wasActive && !active) this.endFestival();
    this.wasActive = active;
    this.refreshRate();
    if (!this.open() || active) return;
    if (st.meter < SPIRIT_RULES.full) st.meter = Math.min(SPIRIT_RULES.full, st.meter + (this.rateCache.perMinute * step) / 60);
    // full: celebrate as soon as the colony is at peace (never during an alien attack or its warning)
    if (st.meter >= SPIRIT_RULES.full - 1e-9 && g.state.combat.phase === 'peace') this.startFestival();
  }

  /** Test / QA hook: fill the meter and start a festival now (when the colony is open for it). */
  startNow(): boolean {
    if (!this.open() || this.active()) return false;
    this.st.meter = SPIRIT_RULES.full;
    this.startFestival();
    return true;
  }

  // ---------------------------------------------------------------- internals

  private refreshRate(): void {
    const g = this.game;
    const list = g.state.colonists.list;
    let n = 0;
    let hearts = 0;
    for (const c of list) {
      if (c.away) continue;
      n++;
      hearts += heartsOf(g, c.id);
    }
    const inp = this.inputs;
    if (n === 0) {
      inp.happiness = 0;
      inp.amenity = inp.medical = inp.hearts = 0;
    } else {
      const a = g.sys.colonists.amenities();
      inp.happiness = g.derived.happiness.average;
      inp.amenity = (a.comfort + a.entertainment) / n;
      inp.medical = a.medical;
      inp.hearts = hearts;
    }
    this.rateCache = spiritRate(inp);
  }

  private onWish(_colonist: number): void {
    if (!this.open()) return;
    const st = this.st;
    const before = st.meter;
    st.meter = Math.min(SPIRIT_RULES.full, st.meter + SPIRIT_RULES.wish);
    const c = this.game.sys.colonists.get(_colonist);
    if (c && st.meter > before) this.game.bus.emit('ui:float', { text: `Spirit +${Math.round(st.meter - before)}`, x: c.x, z: c.z + 0.6, color: '#ffc66e' });
  }

  private startFestival(): void {
    const g = this.game;
    const st = this.st;
    const r = SPIRIT_RULES.festival;
    const spot = g.sys.colonists.gatherSpot() ?? { ...g.sys.world.coreCenter(), r: 2 };
    st.meter = 0;
    st.festivals++;
    st.festivalUntil = g.state.playTime + r.seconds;
    st.fx = spot.x;
    st.fz = spot.z;
    this.slots = [];
    this.slotKey = '';
    this.wasActive = true;
    g.sys.economy.markDirty();
    const reward = this.festivalChest();
    g.grant(reward, 'festival');
    g.bus.emit('spirit:festival', { n: st.festivals, x: spot.x, z: spot.z, until: st.festivalUntil, reward });
    g.bus.emit('sfx', { id: 'celebrate', x: spot.x, z: spot.z });
    g.bus.emit('ui:float', { text: 'Festival!', x: spot.x, z: spot.z, color: '#ffc66e', big: true });
    const pct = Math.round((r.production - 1) * 100);
    g.toast(`Festival! +${pct}% production for ${Math.round(r.seconds / 60)} min, and a chest in your Inventory`, 'reward', '🏮', 'inventory');
  }

  private endFestival(): void {
    this.slots = [];
    this.slotKey = '';
    this.game.sys.economy.markDirty();
    this.game.bus.emit('spirit:festivalEnded', { n: this.st.festivals });
  }

  /** The colony tier's supply crates and, from the Stone tier, a Supply Cache (rolled at the tier when opened). */
  festivalChest(): Reward {
    const g = this.game;
    const r = SPIRIT_RULES.festival;
    const tier = g.state.colony.tier;
    const items: Record<string, number> = {};
    const crate = tierCrate(tier);
    if (g.data.item(crate)) items[crate] = r.crates;
    if (tier >= r.cacheFromTier && g.data.item('chest_supply')) items.chest_supply = 1;
    const out: Reward = { xp: r.xp };
    if (Object.keys(items).length) out.items = items;
    return out;
  }

  /** Rings of free ground round the fire (skipping buildings and water), enough for everyone at home. */
  private ensureSlots(): void {
    const g = this.game;
    const st = this.st;
    const want = Math.max(1, g.state.colonists.list.length);
    const key = `${st.festivals}|${want}|${st.fx.toFixed(1)}|${st.fz.toFixed(1)}`;
    if (key === this.slotKey) return;
    this.slotKey = key;
    const spot = g.sys.colonists.gatherSpot();
    const r0 = (spot && Math.abs(spot.x - st.fx) < 0.01 && Math.abs(spot.z - st.fz) < 0.01 ? spot.r : 1) + FIRST_RING;
    const out: number[] = [];
    const bs = g.sys.buildings;
    const world = g.sys.world;
    for (let ring = 0; ring < MAX_RINGS && out.length < want * 2; ring++) {
      const rad = r0 + ring * RING_GAP;
      const n = Math.max(6, Math.floor((Math.PI * 2 * rad) / SLOT_GAP));
      const off = ring * 0.37;
      for (let k = 0; k < n && out.length < want * 2; k++) {
        const a = off + (k / n) * Math.PI * 2;
        const x = st.fx + Math.cos(a) * rad;
        const z = st.fz + Math.sin(a) * rad;
        const cx = cellOf(x);
        const cz = cellOf(z);
        if (bs.blocked(cx, cz, 'colonist')) continue;
        if (world.gen && world.terrainCode(cx, cz) !== 0) continue;
        out.push(x, z);
      }
    }
    this.slots = out;
  }
}
