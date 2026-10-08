/**
 * WishSystem — colonists occasionally voice a small, cozy wish; granting it makes them happy, deepens your friendship
 * (hearts 0..5) and brings a little thank-you gift. Content and numbers: src/data/wishes.ts.
 *
 * Rules (cozy):
 *  - Wishes open once the opening tutorial is over (tutorial done or colony tier ≥ 1). About one every 8–12 minutes
 *    of online play, at most two open at once, one per colonist. Nobody wishes during an alien attack, while away on
 *    an expedition or asleep.
 *  - Timers are `playTime` (online seconds): nothing moves while the app is closed. An open wish quietly lapses after
 *    45 minutes of play: no penalty, no message. A colonist who leaves on an expedition lets their wish go the same way.
 *  - Every roll (when, who, what, the gift) is a pure function of the save seed and the wish counter, so reloading
 *    never re-rolls a wish.
 *  - Kinds: give (one tap from storage), build (one more of a small building, counted from when the wish was voiced;
 *    only voiced while the colony has fewer than `upTo`), craft (a hand-crafted recipe, counted from the wish), chat
 *    (walk up and tap Chat), explore (loot any point of interest). Build / craft / explore wishes come true by
 *    themselves the moment it happens.
 *  - Granting: "Wish granted!" happiness for a few real hours, +1 heart (3 hearts: +5% productivity, 5: Best friends,
 *    +3 happiness for good), the gift (a few minutes of colony output, sometimes 1–2 Nova), exactly once.
 *
 * Events: wish:offered / wish:granted / wish:expired (UI, missions, analytics hook in).
 *
 * OWNER: wishes. Writes state.wishes.
 */
import { System } from './System';
import type { Colonist, Id, Wish, WishState } from '../core/state';
import type { Reward, WishDef, WishKind } from '../data/schema';
import { countBuildings } from './meta/missionRules';
import { giveAmount, heartsOf, likeWeight, nextDelay, ROLL, thankYouGift, wishRng, wishRules, wishText } from './wish/rules';

declare module '../core/events' {
  interface GameEvents {
    'wish:offered': { id: Id; colonist: Id; def: string; kind: WishKind; tier: number };
    'wish:granted': { id: Id; colonist: Id; def: string; kind: WishKind; tier: number; hearts: number; reward: Reward };
    /** Lapsed after its time, or let go because the colonist left on an expedition. Never a penalty. */
    'wish:expired': { id: Id; colonist: Id; def: string; kind: WishKind; tier: number };
  }
}

/** Why the wish's action is not possible right now (null = go!). */
export type Refusal = string | null;

/** A lootable point of interest an explore wish can point at. */
export interface ExploreSpot {
  id: string;
  x: number;
  z: number;
}

const HOUR_MS = 3_600_000;

export function emptyWishState(): WishState {
  return { open: [], nextId: 1, nextAt: -1, offered: 0, granted: 0, expired: 0, bonds: {}, moods: {}, recent: [] };
}

export class WishSystem extends System {
  private acc = 0;

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const bus = this.game.bus;
    bus.on('building:completed', (e) => this.advance('build', e.def));
    // only the player's own crafting counts: a factory churning out the recipe is not a gift
    bus.on('craft:completed', (e) => {
      if (e.factory == null) this.advance('craft', e.recipe);
    });
    bus.on('world:poiLooted', () => this.advance('explore', ''));
  }

  override onLoad(_fresh: boolean): void {
    this.sanitize();
  }

  override update(dt: number): void {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc = 0;
    this.tick();
  }

  // ---------------------------------------------------------------- queries

  private get ws(): WishState {
    return (this.game.state.wishes ??= emptyWishState()); // lazily for a state built by hand (tests)
  }

  private get rules() {
    return wishRules(this.game.data);
  }

  /** Wishes have opened (the opening tutorial is over). */
  unlocked(): boolean {
    const st = this.game.state;
    return !!st.tutorial?.done || st.colony.tier >= 1;
  }

  /** At least one wish has been voiced in this colony (missions about wishes are offered from then on). */
  started(): boolean {
    return (this.ws?.offered ?? 0) > 0;
  }

  open(): Wish[] {
    return this.ws.open;
  }

  get(id: Id): Wish | undefined {
    return this.ws.open.find((w) => w.id === id);
  }

  /** The open wish of a colonist, if any. */
  of(colonistId: Id): Wish | undefined {
    return this.ws.open.find((w) => w.colonist === colonistId);
  }

  def(w: Pick<Wish, 'def'>): WishDef | undefined {
    return this.game.data.wish(w.def);
  }

  /** What the colonist says, amount filled in. */
  text(w: Wish): string {
    const d = this.def(w);
    return d ? wishText(d, w.need) : '';
  }

  /** Seconds of play before the wish lapses. */
  secondsLeft(w: Wish): number {
    return Math.max(0, w.expiresAt - this.game.state.playTime);
  }

  /** Seconds of play until the next wish may be voiced (Infinity before wishes open). */
  secondsToNext(): number {
    const ws = this.ws;
    return ws.nextAt < 0 ? Infinity : Math.max(0, ws.nextAt - this.game.state.playTime);
  }

  /** Friendship hearts with a colonist (0..5). */
  hearts(colonistId: Id): number {
    return heartsOf(this.game, colonistId);
  }

  maxHearts(): number {
    return this.rules.hearts;
  }

  /** Has the wish's colonist reached Best friends? */
  bestFriends(colonistId: Id): boolean {
    return this.hearts(colonistId) >= this.rules.perks.bestFriendsHearts;
  }

  /** Null when the wish's main action can be done right now (Give: enough in storage), else a friendly reason. */
  refusal(w: Wish): Refusal {
    const g = this.game;
    const d = this.def(w);
    if (!d) return 'That wish is gone';
    const c = g.sys.colonists.get(w.colonist);
    if (!c) return 'They are not in the colony';
    if (c.away) return `${firstName(c)} is away on an expedition`;
    if (d.kind === 'give') {
      const have = Math.floor(g.sys.economy.amount(d.target));
      if (have < w.need) return `Need ${(w.need - have).toLocaleString('en-US')} more ${g.data.resource(d.target)?.name ?? d.target}`;
    }
    return null;
  }

  /**
   * The nearest colonist with an open Chat wish within `range` world units of (x, z) (the player's context button):
   * not indoors, not away.
   */
  chatTarget(x: number, z: number, range = this.rules.chatRange): { wish: Wish; colonist: Colonist } | null {
    let best: { wish: Wish; colonist: Colonist } | null = null;
    let bestD = range;
    for (const w of this.ws.open) {
      if (this.def(w)?.kind !== 'chat') continue;
      const c = this.game.sys.colonists.get(w.colonist);
      if (!c || c.away || c.activity === 'sheltering') continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d <= bestD) {
        bestD = d;
        best = { wish: w, colonist: c };
      }
    }
    return best;
  }

  /** Lootable points of interest near the colony an explore wish can be granted at (nearest to (x, z) first). */
  exploreSpots(x?: number, z?: number): ExploreSpot[] {
    const g = this.game;
    const world = g.sys.world;
    const pois = world.gen?.pois;
    if (!pois) return [];
    const center = g.sys.buildings.colonyCenter();
    const range = this.rules.exploreRange;
    const st = g.state.world.pois;
    const out: (ExploreSpot & { d: number })[] = [];
    for (const p of pois) {
      const def = g.data.poi(p.def);
      if (!def || def.kind === 'nest' || def.kind === 'beacon') continue;
      if (st[p.id]?.looted) continue;
      if (!world.isUnlocked(p.region)) continue;
      if (Math.hypot(p.x - center.x, p.z - center.z) > range) continue;
      out.push({ id: p.id, x: p.x, z: p.z, d: Math.hypot(p.x - (x ?? center.x), p.z - (z ?? center.z)) });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map(({ id, x: px, z: pz }) => ({ id, x: px, z: pz }));
  }

  // ---------------------------------------------------------------- actions

  /** Hand over what a Give wish asks for. Returns true when the wish came true. */
  give(id: Id): boolean {
    const g = this.game;
    const w = this.get(id);
    const d = w ? this.def(w) : undefined;
    if (!w || d?.kind !== 'give') return false;
    const why = this.refusal(w);
    if (why) {
      g.toast(why, 'info', g.data.resource(d.target)?.icon ?? '💭');
      g.bus.emit('sfx', { id: 'ui_error' });
      return false;
    }
    if (!g.sys.economy.spend({ [d.target]: w.need }, `wish:${d.id}`)) return false;
    this.grantWish(w);
    return true;
  }

  /** The player chatted with a colonist (context button). Returns true when it granted their Chat wish. */
  chat(colonistId: Id): boolean {
    const w = this.of(colonistId);
    if (!w || this.def(w)?.kind !== 'chat') return false;
    const c = this.game.sys.colonists.get(colonistId);
    if (!c || c.away) return false;
    this.grantWish(w);
    return true;
  }

  /**
   * Dev / test hook: voice a wish now (optionally a specific one, for a specific colonist), ignoring the timer and
   * the cap but not whether it can be done. Returns the wish or null.
   */
  debugOffer(defId?: string, colonistId?: Id): Wish | null {
    const g = this.game;
    const people = this.wishers(true);
    const c = colonistId != null ? g.sys.colonists.get(colonistId) : people[0];
    if (!c || c.away || this.of(c.id)) return null;
    const choices = this.choicesFor(c, true).filter((x) => !defId || x.def.id === defId);
    if (!choices.length) return null;
    const pick = wishRng(g.state.seed, this.ws.offered, ROLL.wish).weighted(choices);
    return this.offer(c, pick.def, pick.need);
  }

  // ---------------------------------------------------------------- internals

  /** Once per second: moods wear off, wishes lapse, the next wish is voiced when its time comes. */
  private tick(): void {
    const g = this.game;
    const ws = this.ws;
    const now = g.state.playTime;
    this.pruneMoods();
    for (const w of [...ws.open]) {
      const c = g.sys.colonists.get(w.colonist);
      if (!c) this.drop(w); // the colonist is gone: so is the wish (no event, nothing to report)
      else if (c.away || now >= w.expiresAt) this.lapse(w);
    }
    if (!this.unlocked()) return;
    const r = this.rules;
    if (!(ws.nextAt >= 0)) {
      ws.nextAt = now + nextDelay(r, g.state.seed, ws.offered, true);
      return;
    }
    if (now < ws.nextAt) return;
    const w = this.tryOffer();
    ws.nextAt = now + (w ? nextDelay(r, g.state.seed, ws.offered, false) : r.retry);
  }

  /** Colonists who could voice a wish now: home, awake, not indoors, no wish yet (by id: deterministic). */
  private wishers(evenAsleep = false): Colonist[] {
    const busy = new Set(this.ws.open.map((w) => w.colonist));
    return this.game.state.colonists.list
      .filter((c) => !c.away && c.activity !== 'sheltering' && (evenAsleep || c.activity !== 'sleeping') && !busy.has(c.id))
      .sort((a, b) => a.id - b.id);
  }

  private tryOffer(): Wish | null {
    const g = this.game;
    const ws = this.ws;
    if (ws.open.length >= this.rules.maxOpen) return null;
    if (g.state.combat.phase !== 'peace') return null; // never during a raid (warning, attack or the victory chest)
    const people = this.wishers();
    if (!people.length) return null;
    const n = ws.offered;
    const c = wishRng(g.state.seed, n, ROLL.colonist).pick(people);
    const choices = this.choicesFor(c, false);
    if (!choices.length) return null;
    const pick = wishRng(g.state.seed, n, ROLL.wish).weighted(choices);
    return this.offer(c, pick.def, pick.need);
  }

  /** Every wish this colonist could voice now, weighted by what they like (recently voiced ones only as a fallback). */
  private choicesFor(c: Colonist, anyRecent: boolean): { def: WishDef; need: number; weight: number }[] {
    const g = this.game;
    const tier = g.state.colony.tier;
    const r = this.rules;
    const openDefs = new Set(this.ws.open.map((w) => w.def));
    const job = g.sys.colonists.jobOf(c);
    const all: { def: WishDef; need: number; weight: number; recent: boolean }[] = [];
    for (const def of g.data.wishes ?? []) {
      if (tier < def.minTier || (def.maxTier != null && tier > def.maxTier) || openDefs.has(def.id)) continue;
      const need = this.feasible(def);
      if (!(need > 0)) continue;
      const weight = likeWeight(r, def, c, job);
      if (weight > 0) all.push({ def, need, weight, recent: this.ws.recent.includes(def.id) });
    }
    const fresh = all.filter((x) => !x.recent);
    return fresh.length && !anyRecent ? fresh : all;
  }

  /** How many a wish would ask for now (give: amount; others: 1), or 0 when it cannot be done at the moment. */
  private feasible(def: WishDef): number {
    const g = this.game;
    const st = g.state;
    switch (def.kind) {
      case 'give': {
        const res = def.target;
        if (!g.data.resource(res)) return 0;
        // only what the colony already knows how to get
        const known = (st.resources.lifetime[res] ?? 0) > 0 || (st.resources.amounts[res] ?? 0) > 0 || (g.derived.producePerMin[res] ?? 0) > 0;
        return known ? giveAmount(g.data, def, st.colony.tier, g.sys.economy.capacity(res)) : 0;
      }
      case 'build': {
        const b = g.data.building(def.target);
        if (!b || !g.sys.buildings.isUnlocked(def.target)) return 0;
        const have = countBuildings(g, def.target);
        if (b.maxCount && g.sys.buildings.countOf(def.target) >= b.maxCount) return 0;
        return have < (def.upTo ?? this.rules.buildUpTo) ? 1 : 0;
      }
      case 'craft': {
        const r = g.data.recipe(def.target);
        const cr = g.sys.crafting;
        if (!r || r.outputs.vehicle || !cr.isUnlocked(r) || !cr.stations().includes(r.station)) return 0;
        for (const [id, n] of Object.entries(r.itemInputs ?? {})) if ((st.player.items[id] ?? 0) < n) return 0;
        return 1;
      }
      case 'chat':
        return 1;
      case 'explore':
        return this.exploreSpots().length ? 1 : 0;
      default:
        return 0;
    }
  }

  private offer(c: Colonist, def: WishDef, need: number): Wish {
    const g = this.game;
    const ws = this.ws;
    const r = this.rules;
    const n = ws.offered;
    const now = g.state.playTime;
    const w: Wish = {
      id: ws.nextId++,
      def: def.id,
      colonist: c.id,
      tier: g.state.colony.tier,
      need,
      done: 0,
      at: now,
      expiresAt: now + r.expire,
      seed: Math.floor(wishRng(g.state.seed, n, ROLL.gift).next() * 0x7fffffff),
    };
    ws.open.push(w);
    ws.offered++;
    ws.recent = [...ws.recent.filter((id) => id !== def.id), def.id].slice(-Math.max(0, r.recent));
    g.bus.emit('wish:offered', { id: w.id, colonist: c.id, def: def.id, kind: def.kind, tier: w.tier });
    g.toast(`${firstName(c)} has a wish: ${def.title}`, 'info', '💭');
    return w;
  }

  /** Build / craft / explore progress: every matching open wish moves on, and comes true once it is done. */
  private advance(kind: WishKind, target: string): void {
    const ws = this.game.state.wishes;
    if (!ws?.open?.length) return;
    for (const w of [...ws.open]) {
      const d = this.def(w);
      if (!d || d.kind !== kind || (kind !== 'explore' && d.target !== target)) continue;
      const c = this.game.sys.colonists.get(w.colonist);
      if (!c || c.away) continue;
      w.done = Math.min(w.need, w.done + 1);
      if (w.done >= w.need) this.grantWish(w);
    }
  }

  /** The wish comes true: hearts, mood, the gift (exactly once: the wish is removed first). */
  private grantWish(w: Wish): void {
    const g = this.game;
    const ws = this.ws;
    const i = ws.open.indexOf(w);
    if (i < 0) return;
    ws.open.splice(i, 1);
    const d = this.def(w);
    const c = g.sys.colonists.get(w.colonist);
    if (!d || !c) return;
    const r = this.rules;
    const before = heartsOf(g, c.id);
    const hearts = Math.min(r.hearts, before + 1);
    ws.bonds[c.id] = hearts;
    ws.moods[c.id] = g.now() + r.mood.hours * HOUR_MS;
    ws.granted++;
    const reward = thankYouGift(g.data, w.tier, w.seed);
    g.grant(reward, 'wish', c.x, c.z);
    g.bus.emit('wish:granted', { id: w.id, colonist: c.id, def: d.id, kind: d.kind, tier: w.tier, hearts, reward });
    g.bus.emit('ui:float', { text: '💛', x: c.x, z: c.z, color: '#ffd84a', big: true });
    g.bus.emit('sfx', { id: 'reward', x: c.x, z: c.z });
    const name = firstName(c);
    if (hearts > before && hearts === r.perks.bestFriendsHearts) {
      g.bus.emit('ui:celebrate', { title: 'Best friends!', text: `You and ${name} are best friends now. They will always be a little happier around you.`, icon: '💛' });
    } else if (hearts > before && hearts === r.perks.productivityHearts) {
      g.toast(`${name} trusts you completely and works ${Math.round(r.perks.productivity * 100)}% harder!`, 'reward', '💛');
    } else {
      g.toast(`${name} is so happy! Friendship ${hearts}/${r.hearts}`, 'reward', '💛');
    }
    if (hearts >= r.perks.productivityHearts) g.sys.economy.markDirty(); // productivity perk
  }

  /** The wish quietly lapses (or is let go when the colonist leaves on an expedition). No penalty. */
  private lapse(w: Wish): void {
    const ws = this.ws;
    const i = ws.open.indexOf(w);
    if (i < 0) return;
    ws.open.splice(i, 1);
    ws.expired++;
    const d = this.def(w);
    this.game.bus.emit('wish:expired', { id: w.id, colonist: w.colonist, def: w.def, kind: d?.kind ?? 'chat', tier: w.tier });
  }

  private drop(w: Wish): void {
    const i = this.ws.open.indexOf(w);
    if (i >= 0) this.ws.open.splice(i, 1);
  }

  private pruneMoods(): void {
    const moods = this.ws.moods;
    const now = this.game.now();
    for (const k of Object.keys(moods)) if (!(moods[k] > now)) delete moods[k];
  }

  // ---------------------------------------------------------------- save hygiene

  /** Fill an old save's missing slice and drop junk: unknown wishes, wishes of colonists who are gone, bad numbers. */
  private sanitize(): void {
    const st = this.game.state;
    const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!isObj(st.wishes)) st.wishes = emptyWishState();
    const ws = st.wishes;
    const def = emptyWishState();
    const r = this.rules;
    const known = new Set(st.colonists.list.map((c) => c.id));
    const seen = new Set<Id>();
    ws.open = (Array.isArray(ws.open) ? ws.open : []).filter((w): w is Wish => {
      if (!isObj(w) || !isNum(w.id) || typeof w.def !== 'string' || !this.game.data.wish(w.def)) return false;
      if (!isNum(w.colonist) || !known.has(w.colonist) || seen.has(w.colonist)) return false;
      if (!isNum(w.need) || w.need <= 0 || !isNum(w.at) || !isNum(w.expiresAt)) return false;
      seen.add(w.colonist);
      return true;
    });
    for (const w of ws.open) {
      if (!isNum(w.done) || w.done < 0) w.done = 0;
      if (!isNum(w.tier)) w.tier = st.colony.tier;
      if (!isNum(w.seed)) w.seed = w.id * 7919;
      w.expiresAt = Math.min(w.expiresAt, w.at + r.expire, st.playTime + r.expire);
    }
    ws.open = ws.open.slice(0, Math.max(r.maxOpen, 0));
    const nextId = 1 + ws.open.reduce((m, w) => Math.max(m, w.id), 0);
    if (!isNum(ws.nextId) || ws.nextId < nextId) ws.nextId = nextId;
    if (!isNum(ws.nextAt)) ws.nextAt = def.nextAt;
    for (const k of ['offered', 'granted', 'expired'] as const) if (!isNum(ws[k]) || ws[k] < 0) ws[k] = 0;
    const bonds: Record<string, number> = {};
    for (const [k, v] of Object.entries(isObj(ws.bonds) ? ws.bonds : {})) {
      if (isNum(v) && v > 0 && known.has(Number(k))) bonds[k] = Math.min(r.hearts, Math.floor(v));
    }
    ws.bonds = bonds;
    const moods: Record<string, number> = {};
    for (const [k, v] of Object.entries(isObj(ws.moods) ? ws.moods : {})) if (isNum(v) && known.has(Number(k))) moods[k] = v;
    ws.moods = moods;
    ws.recent = (Array.isArray(ws.recent) ? ws.recent : []).filter((x): x is string => typeof x === 'string').slice(-Math.max(0, r.recent));
  }
}

function firstName(c: Pick<Colonist, 'name'>): string {
  return c.name.split(' ')[0];
}
