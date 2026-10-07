/**
 * WorldEventSystem — random optional events (meteor crash, wreck, survivor rescue, alien nest,
 * supply drop, rare merchant, crystal storm, ancient structure) scheduled while online.
 *
 * OWNER: world agent. Writes state.world.events / nextEventAt.
 *
 * Every `eventIntervalMin..Max` seconds of play one weighted event (minTier <= colony tier) appears on
 * walkable ground 30-110 units from the core in an unlocked region, preferably within ~60 units of the
 * player. Events never punish: they expire quietly, nothing is lost.
 */
import { System } from './System';
import type { Game } from '../core/Game';
import type { ActiveWorldEvent, Id } from '../core/state';
import type { WorldEventDef } from '../data/schema';
import { CELL, cellOf } from '../core/constants';
import { bagEntries } from '../core/bag';

declare module '../core/events' {
  interface GameEvents {
    /** An event's reward was claimed (merchant: first visit). */
    'world:eventClaimed': { id: Id; def: string };
  }
}

/** Never more than this many unclaimed events at once. */
const MAX_ACTIVE = 3;
/** Distance (world units) within which the player may claim / trade. */
const CLAIM_RANGE = 9;
/** Nest guardians wake when the player gets this close. */
const NEST_WAKE = 24;
/** Fresh games get a quiet start: the tutorial owns the first ~14 minutes. */
const FIRST_EVENT_MIN = 840;

export class WorldEventSystem extends System {
  /** Nest events whose guardians have been spawned (transient: aliens are cleared on load). */
  private guarded = new Set<Id>();

  override onLoad(fresh: boolean): void {
    const w = this.game.state.world;
    if (fresh) w.nextEventAt = Math.max(w.nextEventAt, FIRST_EVENT_MIN);
  }

  override update(_dt: number): void {
    const g = this.game;
    const st = g.state;
    const w = st.world;
    const now = st.playTime;

    // expire
    for (let i = w.events.length - 1; i >= 0; i--) {
      const ev = w.events[i];
      if (now >= ev.endsAt) this.remove(i);
    }

    // wake nest guardians when the player comes close
    const p = st.player;
    for (const ev of w.events) {
      if (ev.claimed || this.guarded.has(ev.id)) continue;
      const def = g.data.worldEvent(ev.def);
      if (def?.kind !== 'nest') continue;
      const dx = ev.x - p.x;
      const dz = ev.z - p.z;
      if (dx * dx + dz * dz < NEST_WAKE * NEST_WAKE) this.wakeNest(ev, def);
    }

    // schedule
    if (now >= w.nextEventAt) {
      const bal = g.data.balance;
      let active = 0;
      for (const ev of w.events) if (!ev.claimed) active++;
      if (active >= MAX_ACTIVE) {
        w.nextEventAt = now + 60;
      } else if (this.spawn()) {
        w.nextEventAt = now + g.rng.range(bal.eventIntervalMin, bal.eventIntervalMax);
      } else {
        w.nextEventAt = now + 30; // no good spot right now: try again soon
      }
    }
  }

  /** Active crystal-storm style gather bonus: product of (1 + yieldBonus) over live `storm` events. */
  gatherBonus(): number {
    const g = this.game;
    const now = g.state.playTime;
    let m = 1;
    for (const ev of g.state.world.events) {
      if (ev.endsAt <= now) continue;
      const def = g.data.worldEvent(ev.def);
      if (def?.kind === 'storm' && def.yieldBonus) m *= 1 + def.yieldBonus;
    }
    return m;
  }

  /** Is a storm (gather bonus) active right now? */
  stormActive(): boolean {
    return this.gatherBonus() > 1;
  }

  /** Active, unexpired event by id. */
  get(id: Id): ActiveWorldEvent | undefined {
    const now = this.game.state.playTime;
    return this.game.state.world.events.find((e) => e.id === id && e.endsAt > now);
  }

  /** Seconds left before an event expires. */
  timeLeft(id: Id): number {
    const ev = this.get(id);
    return ev ? Math.max(0, ev.endsAt - this.game.state.playTime) : 0;
  }

  /**
   * Claim/visit an active event (player is near it). Merchants: pass `tradeIndex` to trade (stays open until
   * it leaves); without one it just greets (first visit gives the merchant's gift). Returns true when
   * something happened.
   */
  claim(eventId: Id, tradeIndex?: number): boolean {
    const g = this.game;
    const st = g.state;
    const ev = this.get(eventId);
    if (!ev) return false;
    const def = g.data.worldEvent(ev.def);
    if (!def) return false;
    const p = st.player;
    if (Math.hypot(ev.x - p.x, ev.z - p.z) > CLAIM_RANGE) {
      g.toast(`${def.icon} Get closer to ${def.name}!`, 'info');
      return false;
    }

    if (def.kind === 'merchant') {
      if (tradeIndex === undefined) {
        if (!ev.claimed) {
          ev.claimed = true;
          g.grant(def.reward, 'event', ev.x, ev.z);
          g.bus.emit('world:eventClaimed', { id: ev.id, def: def.id });
        }
        return true;
      }
      const trade = def.trades?.[tradeIndex];
      if (!trade) return false;
      if (!g.sys.economy.spend(trade.give, 'trade')) {
        g.toast('Not enough resources for that trade', 'warning');
        return false;
      }
      g.sys.economy.addBag(trade.get, 'trade', ev.x, ev.z);
      g.toast(`🤝 Trade complete: ${describe(trade.get, g)}`, 'reward');
      return true;
    }

    if (ev.claimed) return false;

    if (def.kind === 'nest') {
      if (!this.guarded.has(ev.id)) {
        this.wakeNest(ev, def);
        return false;
      }
      if (g.sys.combat.wildNear(ev.x, ev.z, 14) > 0) {
        g.toast('🪺 Clear the nest guardians first!', 'warning');
        return false;
      }
    }

    ev.claimed = true;
    const before = st.colonists.nextId;
    g.grant(def.reward, 'event', ev.x, ev.z);
    if (def.reward.colonist) {
      const colonist = st.colonists.nextId > before ? st.colonists.nextId - 1 : -1;
      g.bus.emit('survivor:rescued', { poi: `ev_${ev.id}`, colonist });
    }
    if (def.kind === 'ancient') {
      g.bus.emit('ui:celebrate', { title: `${def.name} awakened!`, text: def.description, icon: def.icon });
    } else {
      g.toast(`${def.icon} ${def.name} — reward claimed!`, 'reward');
    }
    g.bus.emit('world:eventClaimed', { id: ev.id, def: def.id });
    // storms keep boosting gathering until they fade; everything else is done
    if (def.kind !== 'storm') {
      const i = st.world.events.indexOf(ev);
      if (i >= 0) this.remove(i);
    }
    return true;
  }

  /** Force-start a random event, or a specific one by def id (debug / rewards). */
  trigger(defId?: string): void {
    this.spawn(defId);
  }

  /** Start an event now. Returns it, or null when no def / no suitable spot. */
  spawn(defId?: string): ActiveWorldEvent | null {
    const g = this.game;
    const st = g.state;
    const def = defId ? g.data.worldEvent(defId) : this.roll();
    if (!def) return null;
    const pos = this.findSpot();
    if (!pos) return null;
    const w = st.world;
    const ev: ActiveWorldEvent = { id: w.nextEventId++, def: def.id, x: pos.x, z: pos.z, endsAt: st.playTime + def.duration, claimed: false };
    w.events.push(ev);
    g.sys.world.revealAround(ev.x, ev.z, 14);
    g.bus.emit('world:eventStarted', { id: ev.id, def: def.id, x: ev.x, z: ev.z });
    g.toast(`${def.icon} ${def.name} spotted!`, 'info');
    return ev;
  }

  // ------------------------------------------------------------------ internals

  private roll(): WorldEventDef | null {
    const g = this.game;
    const tier = g.state.colony.tier;
    const last = g.state.world.events.length ? g.state.world.events[g.state.world.events.length - 1].def : '';
    const pool = g.data.worldEvents
      .filter((e) => e.minTier <= tier && e.weight > 0)
      // a little variety: the previous kind is less likely to repeat
      .map((e) => ({ def: e, weight: e.id === last ? e.weight * 0.35 : e.weight }));
    if (!pool.length) return null;
    return g.rng.weighted(pool).def;
  }

  private wakeNest(ev: ActiveWorldEvent, def: WorldEventDef): void {
    const g = this.game;
    this.guarded.add(ev.id);
    const guards = (def.poi ? g.data.poi(def.poi)?.guards : undefined) ?? { alien: g.data.aliens[0]?.id ?? '', count: 4 };
    if (guards.alien) g.sys.combat.spawnWild(guards.alien, guards.count, ev.x, ev.z);
    g.toast('⚠️ The nest guardians are awake!', 'warning');
  }

  private remove(index: number): void {
    const w = this.game.state.world;
    const ev = w.events[index];
    w.events.splice(index, 1);
    this.guarded.delete(ev.id);
    this.game.bus.emit('world:eventEnded', { id: ev.id, def: ev.def });
  }

  /** Find walkable ground 30-110 units from the core (outside the colony), preferably near the player. */
  private findSpot(): { x: number; z: number } | null {
    const g = this.game;
    const st = g.state;
    const rng = g.rng;
    const world = g.sys.world;
    const bs = g.sys.buildings;
    const core = world.coreCenter();
    const p = st.player;
    const dMin = Math.max(30, (st.colony.radius + 3) * CELL);
    const dMax = Math.max(110, dMin + 60);

    let best: { x: number; z: number } | null = null;
    let bestScore = Infinity;
    let valid = 0;
    for (let attempt = 0; attempt < 70 && valid < 18; attempt++) {
      // half the candidates cluster around the player, half around the core ring
      let a = 0;
      let b = 0;
      let l2 = 0;
      do {
        a = rng.next() * 2 - 1;
        b = rng.next() * 2 - 1;
        l2 = a * a + b * b;
      } while (l2 > 1 || l2 < 0.01);
      const inv = 1 / Math.sqrt(l2);
      let x: number;
      let z: number;
      if (attempt % 2 === 0) {
        const r = rng.range(20, 58);
        x = p.x + a * inv * r;
        z = p.z + b * inv * r;
      } else {
        const r = rng.range(dMin, dMax);
        x = core.x + a * inv * r;
        z = core.z + b * inv * r;
      }
      const dc = Math.hypot(x - core.x, z - core.z);
      if (dc < dMin || dc > dMax) continue;
      const cx = cellOf(x);
      const cz = cellOf(z);
      if (world.terrainCode(cx, cz) !== 0) continue;
      let wet = false;
      for (let zz = cz - 2; zz <= cz + 2 && !wet; zz++) for (let xx = cx - 2; xx <= cx + 2; xx++) if (world.isWaterCell(xx, zz)) wet = true;
      if (wet || bs.at(cx, cz) || bs.blocked(cx, cz, 'player')) continue;
      if (world.solidNear(x, z, 2.6)) continue;
      let crowded = false;
      for (const ev of st.world.events) if (Math.hypot(ev.x - x, ev.z - z) < 14) crowded = true;
      for (const poi of world.gen.pois) if (Math.hypot(poi.x - x, poi.z - z) < 8) crowded = true;
      if (crowded) continue;
      valid++;
      const dp = Math.hypot(x - p.x, z - p.z);
      const score = Math.max(0, dp - 60) + rng.next() * 8;
      if (score < bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best;
  }
}

function describe(bag: Record<string, number | undefined>, g: Game): string {
  return bagEntries(bag)
    .map(([id, n]) => `${n} ${g.data.resource(id)?.name ?? id}`)
    .join(', ');
}
