/**
 * AchievementSystem — the Colony Journal's brain. Progress is never counted here: it is read from the mission system's
 * lifetime counters and from plain state (see meta/achievementRules.ts), re-evaluated cheaply — a second after
 * something relevant happened, and at least every few seconds — never every frame.
 *
 *  - A reached achievement is unlocked for good (it is never taken back if, say, the colonist count drops) and waits
 *    for the player to tap Claim, exactly like a mission. Rewards go through `game.grant(reward, 'achievement')`.
 *  - A save that is loaded earns everything it already earned *silently*: no per-achievement events or toasts, one
 *    summary (`achievement:retro` + a single toast) instead. Same for a fresh colony (it simply has nothing yet).
 *  - Platform hook: every unlock is reported to `game.services.achievements` (Game Center / Google Play Games adapter,
 *    a no-op today — see platform/achievements.ts and docs/MOBILE.md).
 *
 *  - The guided first session stays quiet (like the daily gift): unlocks are kept, their toast and the menu badge come
 *    once the tutorial is done or the first raid is won.
 *
 * Events: achievement:unlocked / achievement:claimed / achievement:retro. Toasts are `ui:toast` with `open: 'journal'`
 * (the UI makes them tappable and holds them back while a modal is up).
 *
 * OWNER: meta agent. Writes state.achievements.
 */
import { System } from './System';
import type { AchievementDef, AchievementMedal, Reward } from '../data/schema';
import { isReached, sourceKey, sourceValue } from './meta/achievementRules';

declare module '../core/events' {
  interface GameEvents {
    'achievement:unlocked': { id: string; line: string; medal: AchievementMedal; name: string };
    'achievement:claimed': { id: string; line: string; medal: AchievementMedal; name: string };
    /** A loaded save already deserved `count` achievements (announced once, instead of one toast each). */
    'achievement:retro': { count: number };
  }
}

/** Seconds between evaluations right after something relevant happened / when nothing did (slow stats, play time). */
export const EVAL_DIRTY_GAP = 1;
export const EVAL_IDLE_GAP = 8;
/**
 * Seconds of play before the "already earned" summary toast: launch cards (Welcome Back, "The Frontier is open") open
 * in the first moments and clear whatever toast is up, so it waits until they are on screen (the UI then holds it).
 */
export const RETRO_TOAST_DELAY = 3;

export interface AchievementProgress {
  /** Current value, capped at the target. */
  value: number;
  target: number;
  done: boolean;
}

export interface AchievementSummary {
  total: number;
  unlocked: number;
  claimed: number;
  /** Unlocked and waiting for Claim. */
  claimable: number;
  /** Earned medals by kind. */
  medals: Record<AchievementMedal, number>;
}

export const MEDAL_ICON: Record<AchievementMedal, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', special: '🏆' };
export const MEDAL_NAME: Record<AchievementMedal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', special: 'Special' };

export class AchievementSystem extends System {
  private dirty = true;
  private acc = 0;
  private loaded = false;
  /** Catch-up count whose summary toast is still waiting for its moment. */
  private retroPending = 0;
  private retroDelay = 0;
  /** Unlocked during the guided first session: their toast waits until the colony's offers open (see `quietNow`). */
  private held: AchievementDef[] = [];

  // ---------------------------------------------------------------- lifecycle

  override init(): void {
    const bus = this.game.bus;
    const mark = () => {
      this.dirty = true;
    };
    // everything an achievement can be about (a flag only: the next update() does the work)
    bus.on('resource:gained', (e) => {
      if (e.source === 'gather' || e.source === 'production' || e.source === 'drop') mark();
    });
    bus.on('building:completed', mark);
    bus.on('building:upgraded', mark);
    bus.on('colony:tierUp', mark);
    bus.on('research:completed', mark);
    bus.on('colonist:recruited', mark);
    bus.on('survivor:rescued', mark);
    bus.on('alien:killed', mark);
    bus.on('combat:ended', mark);
    bus.on('craft:completed', mark);
    bus.on('world:poiLooted', mark);
    bus.on('world:regionDiscovered', mark);
    bus.on('expedition:collected', mark);
    bus.on('expedition:charted', mark);
    bus.on('daily:claimed', mark);
    bus.on('wish:granted', mark);
    bus.on('photo:taken', mark);
  }

  override onLoad(fresh: boolean): void {
    this.sanitize();
    const earned = this.evaluate(true);
    this.loaded = true;
    this.dirty = false;
    this.acc = 0;
    if (earned.length > 0 && !fresh) {
      this.game.bus.emit('achievement:retro', { count: earned.length });
      this.retroPending = earned.length;
      this.retroDelay = RETRO_TOAST_DELAY;
    }
  }

  override update(dt: number): void {
    if (!this.loaded) return;
    if (this.retroPending > 0) {
      this.retroDelay -= dt;
      if (this.retroDelay <= 0 && !this.quietNow()) {
        const n = this.retroPending;
        this.retroPending = 0;
        this.game.bus.emit('ui:toast', { text: n === 1 ? '1 achievement already earned!' : `${n} achievements already earned!`, kind: 'success', icon: '📔', open: 'journal' });
      }
    }
    if (this.held.length > 0 && !this.quietNow()) {
      const held = this.held;
      this.held = [];
      this.toastUnlocked(held);
    }
    this.acc += dt;
    if (this.acc < (this.dirty ? EVAL_DIRTY_GAP : EVAL_IDLE_GAP)) return;
    this.acc = 0;
    this.dirty = false;
    this.evaluate(false);
  }

  // ---------------------------------------------------------------- queries

  list(): AchievementDef[] {
    return this.game.data.achievements;
  }

  isUnlocked(id: string): boolean {
    return this.game.state.achievements.unlocked[id] != null;
  }

  isClaimed(id: string): boolean {
    return this.game.state.achievements.claimed[id] != null;
  }

  /** Epoch ms it was earned / claimed (null if not yet). */
  unlockedAt(id: string): number | null {
    return this.game.state.achievements.unlocked[id] ?? null;
  }

  claimedAt(id: string): number | null {
    return this.game.state.achievements.claimed[id] ?? null;
  }

  /** The live number behind an achievement (not capped; an earned one may read lower than its target). */
  value(id: string): number {
    const d = this.game.data.achievement(id);
    return d ? sourceValue(this.game, d.source) : 0;
  }

  progress(id: string): AchievementProgress {
    const d = this.game.data.achievement(id);
    if (!d) return { value: 0, target: 1, done: false };
    if (this.isUnlocked(id)) return { value: d.target, target: d.target, done: true };
    const v = sourceValue(this.game, d.source);
    return { value: Math.min(v, d.target), target: d.target, done: isReached(v, d) };
  }

  /** Earned and waiting for the player to tap Claim, in journal order. */
  claimable(): AchievementDef[] {
    return this.list().filter((d) => this.isUnlocked(d.id) && !this.isClaimed(d.id));
  }

  claimableCount(): number {
    const a = this.game.state.achievements;
    let n = 0;
    for (const id of Object.keys(a.unlocked)) if (a.claimed[id] == null && this.game.data.achievement(id)) n++;
    return n;
  }

  summary(): AchievementSummary {
    const medals: Record<AchievementMedal, number> = { bronze: 0, silver: 0, gold: 0, special: 0 };
    let unlocked = 0;
    let claimed = 0;
    for (const d of this.list()) {
      if (!this.isUnlocked(d.id)) continue;
      unlocked++;
      medals[d.medal]++;
      if (this.isClaimed(d.id)) claimed++;
    }
    return { total: this.list().length, unlocked, claimed, claimable: unlocked - claimed, medals };
  }

  // ---------------------------------------------------------------- claiming

  /** Claim one earned achievement: grant its reward (once). */
  claim(id: string): boolean {
    const d = this.game.data.achievement(id);
    return !!d && this.claimMany([d]) > 0;
  }

  /** Claim every earned medal of one line (the card's Claim button). Returns how many were claimed. */
  claimLine(line: string): number {
    return this.claimMany(this.claimable().filter((d) => d.line === line));
  }

  /** Claim everything waiting (the Journal's "Claim all"). Returns how many were claimed. */
  claimAll(): number {
    return this.claimMany(this.claimable());
  }

  /**
   * Claim each of `defs` that is earned and not yet claimed. The rewards are granted as ONE sum, so a batch is one
   * "Season level N!" toast and one crate card rather than a pile of them. Returns how many were claimed.
   */
  private claimMany(defs: readonly AchievementDef[]): number {
    const a = this.game.state.achievements;
    const now = this.game.now();
    const taken = defs.filter((d) => a.unlocked[d.id] != null && a.claimed[d.id] == null);
    if (taken.length === 0) return 0;
    for (const d of taken) a.claimed[d.id] = now;
    try {
      this.game.grant(taken.length === 1 ? taken[0].reward : AchievementSystem.sumRewards(taken), 'achievement');
    } catch (e) {
      console.error('[achievements] reward grant failed', taken.map((d) => d.id), e);
    }
    for (const d of taken) this.game.bus.emit('achievement:claimed', { id: d.id, line: d.line, medal: d.medal, name: d.name });
    return taken.length;
  }

  /** What claiming these would hand out, summed (reward chips for a card with several medals waiting). */
  static sumRewards(defs: readonly AchievementDef[]): Reward {
    const out: Reward = {};
    for (const d of defs) {
      const r = d.reward;
      if (r.xp) out.xp = (out.xp ?? 0) + r.xp;
      if (r.nova) out.nova = (out.nova ?? 0) + r.nova;
      if (r.rp) out.rp = (out.rp ?? 0) + r.rp;
      for (const [k, v] of Object.entries(r.resources ?? {})) {
        out.resources ??= {};
        out.resources[k] = (out.resources[k] ?? 0) + (v ?? 0);
      }
      for (const [k, v] of Object.entries(r.items ?? {})) {
        out.items ??= {};
        out.items[k] = (out.items[k] ?? 0) + v;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- internals

  private sanitize(): void {
    const a = this.game.state.achievements;
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    for (const k of Object.keys(a.unlocked)) if (!ok(a.unlocked[k])) delete a.unlocked[k];
    for (const k of Object.keys(a.claimed)) if (!ok(a.claimed[k])) delete a.claimed[k];
    // a claimed one is an earned one
    for (const k of Object.keys(a.claimed)) a.unlocked[k] ??= a.claimed[k];
  }

  /**
   * Unlock everything that has been reached. `silent` (the load pass) skips the per-achievement events and toasts.
   * Returns the achievements unlocked by this pass.
   */
  private evaluate(silent: boolean): AchievementDef[] {
    const g = this.game;
    const a = g.state.achievements;
    const cache = new Map<string, number>();
    const earned: AchievementDef[] = [];
    const now = g.now();
    for (const d of this.list()) {
      if (a.unlocked[d.id] != null) continue;
      const key = sourceKey(d.source);
      let v = cache.get(key);
      if (v === undefined) {
        v = sourceValue(g, d.source);
        cache.set(key, v);
      }
      if (isReached(v, d)) {
        a.unlocked[d.id] = now;
        earned.push(d);
      }
    }
    for (const d of earned) {
      try {
        g.services.achievements?.report(d.id);
      } catch (e) {
        console.error('[achievements] platform report failed', d.id, e);
      }
    }
    if (silent || earned.length === 0) return earned;
    for (const d of earned) g.bus.emit('achievement:unlocked', { id: d.id, line: d.line, medal: d.medal, name: d.name });
    if (this.quietNow()) this.held.push(...earned);
    else {
      g.bus.emit('sfx', { id: 'mission_done' });
      this.toastUnlocked(earned);
    }
    return earned;
  }

  /**
   * The guided first session (until the tutorial is done or the first raid won) stays free of side announcements,
   * like the daily gift and the free crate: unlocks are kept, their toast and menu badge come once the colony's
   * offers open (LiveOpsSystem.offersUnlocked).
   */
  private quietNow(): boolean {
    return !this.game.sys.liveops.offersUnlocked();
  }

  /** One toast for a pass: the achievement's name, or a count when several landed together. */
  private toastUnlocked(list: readonly AchievementDef[]): void {
    const bus = this.game.bus;
    if (list.length === 1) {
      const d = list[0];
      const text = d.medal === 'special' ? `Achievement: ${d.name}` : `Achievement: ${d.name} · ${MEDAL_NAME[d.medal]}`;
      bus.emit('ui:toast', { text, kind: 'success', icon: MEDAL_ICON[d.medal], open: 'journal' });
    } else if (list.length > 1) {
      bus.emit('ui:toast', { text: `${list.length} achievements earned!`, kind: 'success', icon: '🏅', open: 'journal' });
    }
  }
}
