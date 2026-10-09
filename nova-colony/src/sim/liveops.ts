/**
 * LiveOpsSystem — Nova Crystals, daily login rewards (7-day), daily spin wheel, season pass,
 * Colony Pass VIP, timed boosts, rewarded-ad placements (limits/cooldowns + reward application),
 * shop purchases (IAP grants), free crate, offline "Welcome back" claim.
 *
 * Cozy / fair rules baked in:
 *  - nothing here gates gameplay behind payment; ads and purchases only add speed and cosmetics
 *  - the daily-login streak never resets (it advances one step per day you claim)
 *  - boosts of the same kind and strength extend instead of stacking multiplicatively
 *  - a restored purchase re-grants entitlements (cosmetics, season premium, VIP) but never duplicates currency
 *
 * All real-world timers use `game.now()` (never `Date.now()`), so tests can drive the clock.
 *
 * OWNER: meta agent. Writes state.liveops.
 */
import { System } from './System';
import type { Reward, ProductDef, CosmeticDef, SeasonDef, ResourceBag } from '../data/schema';
import type { Boost } from '../core/state';
import type { AdResult, PurchaseResult } from '../platform/types';
import { CENTER_CELL } from '../core/constants';
import { dateKey } from '../core/format';
import { crateReward, researchGrantRp, scaleReward } from './meta/util';
import { seasonBonusEarned, seasonBonusReady } from './seasonBonus';

declare module '../core/events' {
  interface GameEvents {
    /** Nova was spent (`reason`: 'cosmetic:<id>', 'nova_shop:<id>', 'chest:<id>'…): analytics `nova_spent`. */
    'nova:spent': { amount: number; reason: string; balance: number };
  }
}

declare module '../core/state' {
  interface LiveOpsState {
    /** The free Lucky Wheel has been placed on a fresh colony (never re-placed if the player removes it). */
    wheelPlaced?: boolean;
    /** Spin rewards waiting for the wheel animation to finish (survives a quit mid-spin). */
    pendingSpins?: { index: number; at: number }[];
    /** Unclaimed "Welcome back" earnings, kept until claimed so quitting at that screen never loses them. */
    pendingOffline?: { seconds: number; away: number; gains: ResourceBag; rp: number } | null;
  }
}

/** Seconds between `spin:result` (UI starts animating) and the reward landing. */
export const SPIN_GRANT_DELAY = 3.6;
/** Give up on a rewarded ad that never answers (ms). */
const AD_TIMEOUT_MS = 120_000;
/** Refresh the store's subscription expiry this often (ms). */
const SUB_CHECK_MS = 30 * 60_000;

const DAY_MS = 86_400_000;

export interface SeasonProgress {
  level: number;
  maxLevel: number;
  xp: number;
  xpInLevel: number;
  xpPerLevel: number;
  premium: boolean;
}

const BOOST_NAMES: Record<Boost['kind'], string> = {
  production: 'Production',
  research: 'Research',
  gather: 'Gathering',
  drone: 'Helper drone',
};

export class LiveOpsSystem extends System {
  private acc = 0;
  private adBusy = false;
  private buyBusy = false;
  private seasonMuted = 0;
  private boostSeq = 0;
  private crateWasReady = true;
  private dailyPopupIn = -1;
  private dailyPopupTries = 0;
  private wheelTries = 0;
  private subCheckAt = 0;
  private iapReady: Promise<void> = Promise.resolve();
  private restoringOffline = false;
  /** Result of the spin granted by the extra_spin ad currently being applied. */
  private adSpin: number | null = null;

  // ================================================================ lifecycle

  override init(): void {
    const bus = this.game.bus;
    const xp = (kind: keyof SeasonDef['xp']) => () => {
      if (this.seasonMuted === 0) this.addXp(this.game.data.season.xp[kind] ?? 0);
    };
    bus.on('gather:hit', xp('gather'));
    bus.on('building:completed', xp('build'));
    bus.on('craft:completed', xp('craft'));
    bus.on('alien:killed', xp('kill'));
    bus.on('combat:ended', xp('defend'));
    bus.on('mission:claimed', xp('mission'));
    bus.on('world:regionDiscovered', xp('discover'));
    bus.on('research:completed', xp('research'));
    bus.on('offline:ready', () => this.stashOffline());
    bus.on('game:ready', () => this.restoreOffline());
  }

  override onLoad(fresh: boolean): void {
    const g = this.game;
    const lo = g.state.liveops;
    lo.boosts ??= [];
    lo.purchases ??= [];
    lo.pendingSpins ??= [];
    this.initSeason();
    if (fresh) {
      lo.season.xp = 0; // the core being placed on a new colony is not player progress
      lo.freeCrateAt = g.now();
      this.placeWheel();
    } else {
      if (!lo.freeCrateAt) lo.freeCrateAt = g.now();
      this.dailyPopupIn = 3;
    }
    this.crateWasReady = this.freeCrateReady();
    this.initStore();
    this.second(); // prune boosts, VIP daily Nova
  }

  override update(dt: number): void {
    this.acc += dt;
    if (this.acc < 1) return;
    this.acc -= 1;
    this.second();
  }

  /** Once-per-second housekeeping. */
  private second(): void {
    const g = this.game;
    const lo = g.state.liveops;
    const now = g.now();

    if (lo.boosts.some((b) => b.until <= now)) lo.boosts = lo.boosts.filter((b) => b.until > now);

    // VIP: daily Nova, granted automatically once per local day
    if (this.vipDailyAvailable()) this.claimVipDaily();

    // spin rewards whose wheel animation has finished
    const pending = lo.pendingSpins;
    if (pending && pending.length > 0) {
      const due = pending.filter((p) => g.state.playTime >= p.at);
      if (due.length > 0) {
        lo.pendingSpins = pending.filter((p) => g.state.playTime < p.at);
        for (const p of due) this.payoutSpin(p.index);
      }
    }

    // nudge: free crate became ready while playing
    const ready = this.freeCrateReady();
    if (ready && !this.crateWasReady) g.toast('🎁 Your free crate is ready!', 'info');
    this.crateWasReady = ready;

    // daily login popup shortly after launch (waits for the Welcome Back panel to be dealt with)
    if (this.dailyPopupIn > 0 && --this.dailyPopupIn <= 0) {
      if (g.pendingOffline && this.dailyPopupTries++ < 8) this.dailyPopupIn = 3;
      else if (this.dailyAvailable() && this.offersUnlocked()) g.bus.emit('ui:open', { panel: 'daily', arg: { auto: true } });
    }

    // retry placing the free wheel if the first attempt found no room
    if (!lo.wheelPlaced && this.wheelTries > 0 && this.wheelTries < 8) this.placeWheel();

    // keep VIP in sync with the store (renewals)
    if (now >= this.subCheckAt) {
      this.subCheckAt = now + SUB_CHECK_MS;
      void this.syncSubscription();
    }
  }

  // ================================================================ Nova

  addNova(n: number, _source: string): void {
    n = Math.floor(n);
    if (!(n > 0)) return;
    this.game.state.liveops.nova += n;
    this.game.bus.emit('nova:changed', { amount: this.game.state.liveops.nova, delta: n });
  }

  spendNova(n: number, reason: string): boolean {
    n = Math.floor(n);
    if (!(n > 0) || this.game.state.liveops.nova < n) return false;
    this.game.state.liveops.nova -= n;
    this.game.bus.emit('nova:changed', { amount: this.game.state.liveops.nova, delta: -n });
    this.game.bus.emit('nova:spent', { amount: n, reason, balance: this.game.state.liveops.nova });
    return true;
  }

  nova(): number {
    return this.game.state.liveops.nova;
  }

  // ================================================================ boosts & VIP

  /**
   * Start a timed boost. The same kind at the same strength extends the running boost instead of
   * stacking (so repeated ads/daily rewards just add time).
   */
  activateBoost(kind: Boost['kind'], mult: number, minutes: number): void {
    const lo = this.game.state.liveops;
    const now = this.game.now();
    const running = lo.boosts.find((b) => b.kind === kind && b.mult === mult && b.until > now);
    if (running) running.until += minutes * 60_000;
    else lo.boosts.push({ id: `${kind}_${now}_${this.boostSeq++}`, kind, mult, until: now + minutes * 60_000 });
    this.game.bus.emit('boost:started', { kind, mult, minutes });
    this.game.toast(
      kind === 'drone' ? `🤖 Helper drone active for ${minutes} min` : `⚡ ${mult}× ${BOOST_NAMES[kind]} for ${minutes} min`,
      'reward',
    );
  }

  activeBoosts(): Boost[] {
    const now = this.game.now();
    return this.game.state.liveops.boosts.filter((b) => b.until > now);
  }

  /** Strongest active multiplier for a kind (1 when none). */
  boostMultiplier(kind: Boost['kind']): number {
    let m = 1;
    for (const b of this.activeBoosts()) if (b.kind === kind && b.mult > m) m = b.mult;
    return m;
  }

  /** Seconds left on the longest boost of a kind (0 when none). */
  boostSecondsLeft(kind: Boost['kind']): number {
    const now = this.game.now();
    let until = now;
    for (const b of this.game.state.liveops.boosts) if (b.kind === kind && b.until > until) until = b.until;
    return Math.max(0, Math.ceil((until - now) / 1000));
  }

  isVip(): boolean {
    return this.game.state.liveops.vip.until > this.game.now();
  }

  vipDaysLeft(): number {
    return Math.max(0, Math.ceil((this.game.state.liveops.vip.until - this.game.now()) / DAY_MS));
  }

  vipDailyAvailable(): boolean {
    return this.isVip() && this.game.state.liveops.vip.lastDailyNova !== dateKey(this.game.now());
  }

  /** VIP daily Nova (once per local day). Returns the Nova granted. */
  claimVipDaily(): number {
    if (!this.vipDailyAvailable()) return 0;
    const n = this.game.data.vip.dailyNova;
    this.game.state.liveops.vip.lastDailyNova = dateKey(this.game.now());
    this.addNova(n, 'vip');
    this.game.toast(`👑 Colony Pass: +${n} Nova today`, 'reward');
    return n;
  }

  private extendVip(days: number): void {
    const vip = this.game.state.liveops.vip;
    vip.until = Math.max(vip.until, this.game.now()) + days * DAY_MS;
  }

  // ================================================================ season pass

  /** Add season XP (levels = xp / xpPerLevel). */
  addXp(xp: number): void {
    if (!(xp > 0)) return;
    const s = this.game.state.liveops.season;
    const before = this.seasonLevel();
    s.xp += xp;
    const after = this.seasonLevel();
    const bus = this.game.bus;
    bus.emit('season:xp', { xp: s.xp, level: after });
    if (after > before) {
      for (let l = before + 1; l <= after; l++) bus.emit('season:levelUp', { level: l });
      bus.emit('sfx', { id: 'level_up' });
      this.game.toast(`🏅 Season level ${after}! New rewards are waiting`, 'success');
    } else if (s.premium && seasonBonusEarned(this.game.data.season, s.xp) > seasonBonusEarned(this.game.data.season, s.xp - xp)) {
      bus.emit('sfx', { id: 'level_up' });
      const bonus = Object.keys(this.game.data.season.bonus?.reward.items ?? {})[0];
      this.game.toast(`🎁 Bonus ${this.game.data.chest(bonus ?? '')?.name ?? 'chest'} earned: claim it on the season pass`, 'success', undefined, 'season');
    }
  }

  seasonLevel(): number {
    const { season } = this.game.data;
    return Math.min(season.levels.length, Math.floor(this.game.state.liveops.season.xp / season.xpPerLevel));
  }

  seasonProgress(): SeasonProgress {
    const { season } = this.game.data;
    const s = this.game.state.liveops.season;
    const level = this.seasonLevel();
    const maxLevel = season.levels.length;
    return {
      level,
      maxLevel,
      xp: s.xp,
      xpInLevel: level >= maxLevel ? season.xpPerLevel : s.xp - level * season.xpPerLevel,
      xpPerLevel: season.xpPerLevel,
      premium: s.premium,
    };
  }

  /** Can this level's free/premium reward be claimed right now? (levels are 1-based) */
  canClaimSeason(level: number, premium: boolean): boolean {
    const s = this.game.state.liveops.season;
    if (!Number.isInteger(level) || level < 1 || level > this.game.data.season.levels.length) return false;
    if (level > this.seasonLevel()) return false;
    if (premium && !s.premium) return false;
    return !(premium ? s.claimedPremium : s.claimedFree).includes(level);
  }

  /** Claim the free or premium reward of a season level (1-based). Premium needs the premium track. */
  claimSeason(level: number, premium: boolean): boolean {
    if (!this.canClaimSeason(level, premium)) return false;
    const s = this.game.state.liveops.season;
    (premium ? s.claimedPremium : s.claimedFree).push(level);
    const entry = this.game.data.season.levels[level - 1];
    this.game.grant(premium ? entry.premium : entry.free, 'season');
    this.game.bus.emit('sfx', { id: 'reward' });
    return true;
  }

  /** Number of season rewards ready to claim (badge), bonus chests included. */
  seasonClaimable(): number {
    let n = seasonBonusReady(this.game);
    for (let l = 1; l <= this.seasonLevel(); l++) {
      if (this.canClaimSeason(l, false)) n++;
      if (this.canClaimSeason(l, true)) n++;
    }
    return n;
  }

  /** Claim everything claimable on the season track. */
  claimAllSeason(): number {
    let n = 0;
    for (let l = 1; l <= this.seasonLevel(); l++) {
      if (this.claimSeason(l, false)) n++;
      if (this.claimSeason(l, true)) n++;
    }
    return n;
  }

  private initSeason(): void {
    const s = this.game.state.liveops.season;
    const id = this.game.data.season.id;
    if (s.id === id) return;
    const hadSeason = s.id !== '';
    s.id = id;
    s.xp = 0;
    s.premium = false;
    s.claimedFree = [];
    s.claimedPremium = [];
    if (hadSeason) this.game.toast(`🌟 A new season has begun: ${this.game.data.season.name}`, 'info');
  }

  // ================================================================ daily login

  dailyAvailable(): boolean {
    return this.game.state.liveops.daily.lastClaim !== dateKey(this.game.now());
  }

  /**
   * Are the daily gift / free spin / free crate offered (HUD pills, launch popup)? Not during the guided
   * first session until the first invasion is won: a 200-wood windfall in minute one would skip the whole
   * gather -> build loop the tutorial teaches. The panels themselves stay reachable from the menu.
   */
  offersUnlocked(): boolean {
    const st = this.game.state;
    return st.tutorial.done || st.stats.wavesWon > 0;
  }

  /** The day (1..7) the next claim will pay out. */
  dailyDay(): number {
    const n = this.game.data.dailyRewards.length || 1;
    return (this.game.state.liveops.daily.streak % n) + 1;
  }

  /** Reward for a day of the cycle as the player would receive it now (VIP multiplier applied). */
  dailyPreview(day: number): Reward | null {
    const rewards = this.game.data.dailyRewards;
    const r = rewards[(day - 1 + rewards.length * 1000) % Math.max(1, rewards.length)];
    if (!r) return null;
    return this.isVip() ? scaleReward(r, this.game.data.vip.dailyRewardMult) : r;
  }

  /** Claim today's login reward (once per local day; the streak never resets). */
  claimDaily(): Reward | null {
    if (!this.dailyAvailable() || this.game.data.dailyRewards.length === 0) return null;
    const lo = this.game.state.liveops;
    const day = this.dailyDay();
    const reward = this.dailyPreview(day)!;
    lo.daily.streak++;
    lo.daily.lastClaim = dateKey(this.game.now());
    this.game.grant(reward, 'daily');
    this.game.bus.emit('daily:claimed', { day });
    this.game.bus.emit('sfx', { id: 'reward' });
    return reward;
  }

  // ================================================================ lucky wheel

  canSpinFree(): boolean {
    return this.game.state.liveops.spin.lastFree !== dateKey(this.game.now());
  }

  /** Extra (ad) spins still available today. */
  extraSpinsLeft(): number {
    const limit = this.game.data.ad('extra_spin')?.dailyLimit ?? 0;
    const spin = this.game.state.liveops.spin;
    const used = spin.adDate === dateKey(this.game.now()) ? spin.adSpins : 0;
    return limit > 0 ? Math.max(0, limit - used) : Infinity;
  }

  /**
   * Spin the wheel and return the winning segment index (null when not allowed).
   *  - `viaAd=false`: the daily free spin.
   *  - `viaAd=true`: an extra spin — the rewarded `extra_spin` ad is part of the call (shown here; null
   *    if it is skipped/unavailable or the daily extra-spin limit is used up). `watchAd('extra_spin')`
   *    reaches the same spin, so use one entry point, not both.
   * `spin:result` fires immediately so the UI can animate; the reward lands after SPIN_GRANT_DELAY
   * seconds of play.
   */
  async spin(viaAd: boolean): Promise<number | null> {
    if (!viaAd) return this.performSpin(false);
    if (this.extraSpinsLeft() <= 0) return null;
    this.adSpin = null;
    const rewarded = await this.watchAd('extra_spin');
    const index = this.adSpin;
    this.adSpin = null;
    return rewarded ? index : null;
  }

  /**
   * A spin outside the daily free / ad allowance (bought in the Nova Shop: sim/novaShop.ts charges and caps it).
   * Same flow as any spin: `spin:result` now, the reward after SPIN_GRANT_DELAY.
   */
  bonusSpin(): number | null {
    return this.performSpin('bonus');
  }

  /** The spin itself (after any ad). Sync so the result is recorded in the same tick the ad rewards. */
  private performSpin(viaAd: boolean | 'bonus'): number | null {
    const g = this.game;
    const segs = g.data.spinSegments;
    const spin = g.state.liveops.spin;
    const today = dateKey(g.now());
    if (segs.length === 0) return null;
    if (viaAd === 'bonus') {
      // paid for elsewhere: no daily bookkeeping
    } else if (viaAd) {
      if (spin.adDate !== today) {
        spin.adDate = today;
        spin.adSpins = 0;
      }
      if (this.extraSpinsLeft() <= 0) return null;
      spin.adSpins++;
    } else {
      if (!this.canSpinFree()) return null;
      spin.lastFree = today;
    }
    const index = segs.indexOf(g.rng.weighted(segs));
    (g.state.liveops.pendingSpins ??= []).push({ index, at: g.state.playTime + SPIN_GRANT_DELAY });
    g.bus.emit('spin:result', { index });
    return index;
  }

  private payoutSpin(index: number): void {
    const seg = this.game.data.spinSegments[index];
    if (!seg) return;
    this.game.grant(seg.reward, 'spin');
    this.game.bus.emit('sfx', { id: 'spin_win' });
    this.game.toast(`🎡 You won: ${seg.label}!`, 'reward');
  }

  /** Place the free Lucky Wheel near the core (fresh game). */
  private placeWheel(): void {
    const g = this.game;
    const lo = g.state.liveops;
    const def = g.data.buildings.find((b) => b.spinWheel);
    if (!def || lo.wheelPlaced) {
      this.wheelTries = 0;
      return;
    }
    if (g.sys.buildings.all().some((b) => b.def === def.id)) {
      lo.wheelPlaced = true;
      return;
    }
    this.wheelTries++;
    const core = g.sys.buildings.core();
    const cdef = core && g.data.building(core.def);
    const cx = core ? core.x : CENTER_CELL - 1;
    const cz = core ? core.z : CENTER_CELL - 1;
    const w = cdef ? cdef.size[0] : 3;
    const h = cdef ? cdef.size[1] : 3;
    // ring of cells around the core footprint, 5..7 cells out (far enough that taps on the core never hit the
    // wheel); prefer the side away from the player spawn (+x,+z)
    const cells: { x: number; z: number; score: number }[] = [];
    for (let dx = -8; dx <= w + 7; dx++) {
      for (let dz = -8; dz <= h + 7; dz++) {
        const ox = dx < 0 ? -dx : dx >= w ? dx - w + 1 : 0;
        const oz = dz < 0 ? -dz : dz >= h ? dz - h + 1 : 0;
        const ring = Math.max(ox, oz);
        if (ring < 5 || ring > 7) continue;
        cells.push({ x: cx + dx, z: cz + dz, score: ring * 2 + Math.max(0, dx + dz) * 0.5 + Math.abs(ox - oz) * 0.1 });
      }
    }
    cells.sort((a, b) => a.score - b.score);
    let placed = false;
    // the free wheel is system content: it must not count as the player's "build" progress or season XP
    g.sys.missions.quietly(() => {
      this.seasonMuted++;
      try {
        for (const c of cells.slice(0, 80)) {
          if (!g.sys.buildings.canPlace(def.id, c.x, c.z, 0).ok) continue;
          // quiet: the very first thing a new player sees must not be "Built Lucky Wheel!" (they didn't)
          if (g.sys.buildings.place(def.id, c.x, c.z, 0, { free: true, instant: true, quiet: true }) != null) {
            placed = true;
            break;
          }
        }
      } finally {
        this.seasonMuted--;
      }
    });
    if (placed) lo.wheelPlaced = true;
  }

  // ================================================================ rewarded ads

  /** Ads watched today for a placement. */
  adsToday(placement: string): number {
    const a = this.game.state.liveops.ads;
    return a.date === dateKey(this.game.now()) ? (a.counts[placement] ?? 0) : 0;
  }

  /** Views left today (Infinity when unlimited). */
  adsLeft(placement: string): number {
    const def = this.game.data.ad(placement);
    if (!def) return 0;
    return def.dailyLimit > 0 ? Math.max(0, def.dailyLimit - this.adsToday(placement)) : Infinity;
  }

  /** Seconds until the placement's cooldown ends (0 when ready). */
  adCooldownLeft(placement: string): number {
    const def = this.game.data.ad(placement);
    const last = this.game.state.liveops.ads.lastAt[placement];
    if (!def || !def.cooldown || last == null) return 0;
    const now = this.game.now();
    if (last > now + 60_000) return 0; // clock moved backwards: don't lock the player out
    return Math.max(0, Math.ceil((last + def.cooldown * 1000 - now) / 1000));
  }

  /**
   * Daily limit, cooldown, "is there something for this ad to do" and "can the ad service show one right
   * now" checks — a button that leads nowhere is never offered.
   */
  canWatchAd(placement: string): boolean {
    if (!this.game.data.ad(placement)) return false;
    if (this.adsLeft(placement) <= 0 || this.adCooldownLeft(placement) > 0) return false;
    return this.adHasTarget(placement) && this.game.services.ads.isReady(placement);
  }

  /** State-derivable preconditions (an ad is never offered when it would reward nothing). */
  private adHasTarget(placement: string, context?: unknown): boolean {
    const g = this.game;
    switch (placement) {
      case 'offline_double':
        return g.pendingOffline != null;
      case 'invasion_bonus':
        return g.state.combat.pendingReward != null;
      case 'instant_craft':
        return this.resolveJob(context) != null;
      case 'extra_spin':
        return this.extraSpinsLeft() > 0;
      default:
        return true;
    }
  }

  /** Job id for instant_craft: the given id, else the first queued job. */
  private resolveJob(context: unknown): number | null {
    const queue = this.game.state.crafting.queue;
    if (queue.length === 0) return null;
    if (context == null) return queue[0].id;
    const id = Number(context);
    return queue.some((j) => j.id === id) ? id : null;
  }

  /**
   * Show a rewarded ad and, if completed, apply the placement's reward.
   * `context` carries placement data (instant_craft: the craft job id).
   */
  async watchAd(placement: string, context?: unknown): Promise<boolean> {
    const g = this.game;
    const bus = g.bus;
    if (this.adBusy || !g.data.ad(placement)) return false;
    if (this.adsLeft(placement) <= 0 || this.adCooldownLeft(placement) > 0 || !this.adHasTarget(placement, context)) {
      bus.emit('sfx', { id: 'ui_error' });
      return false;
    }
    this.adBusy = true;
    bus.emit('ad:started', { placement });
    const wasPaused = g.isPaused();
    g.setPaused(true);
    let result: AdResult = 'unavailable';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      result = await Promise.race([
        g.services.ads.showRewarded(placement),
        new Promise<AdResult>((resolve) => {
          timer = setTimeout(() => resolve('unavailable'), AD_TIMEOUT_MS);
        }),
      ]);
    } catch (e) {
      console.warn('[liveops] ad failed', e);
      result = 'unavailable';
    } finally {
      if (timer) clearTimeout(timer);
      this.adBusy = false;
      g.setPaused(wasPaused);
    }
    if (result !== 'rewarded') {
      bus.emit('ad:failed', { placement });
      if (result === 'unavailable') g.toast('No video available right now — please try again in a moment', 'info', '📺');
      return false;
    }
    this.recordAd(placement);
    this.applyAdReward(placement, context);
    bus.emit('ad:rewarded', { placement });
    return true;
  }

  private recordAd(placement: string): void {
    const g = this.game;
    const a = g.state.liveops.ads;
    const now = g.now();
    const today = dateKey(now);
    if (a.date !== today) {
      a.date = today;
      a.counts = {};
    }
    a.counts[placement] = (a.counts[placement] ?? 0) + 1;
    a.lastAt[placement] = now;
    a.total++;
    g.state.stats.adsWatched++;
  }

  private applyAdReward(placement: string, context: unknown): void {
    const g = this.game;
    const { sys } = g;
    const tier = g.state.colony.tier;
    switch (placement) {
      case 'offline_double':
        this.claimOffline(true);
        break;
      case 'production_boost':
        this.activateBoost('production', 2, 10);
        break;
      case 'instant_craft': {
        const job = this.resolveJob(context);
        if (job != null) sys.crafting.finishNow(job);
        break;
      }
      case 'free_crate':
        this.openFreeCrate(true);
        break;
      case 'recruit_refresh':
        sys.colonists.refreshCandidates(true);
        g.toast('🧑‍🚀 New recruits have arrived', 'success');
        break;
      case 'invasion_bonus':
        sys.combat.claimReward(true);
        break;
      case 'research_bonus': {
        const rp = researchGrantRp(tier);
        sys.research.addPoints(rp);
        g.toast(`🔬 Research grant: +${rp} RP`, 'reward');
        break;
      }
      case 'extra_spin':
        this.adSpin = this.performSpin(true);
        break;
      case 'drone_assistant':
        this.activateBoost('drone', 1, 5);
        break;
    }
  }

  // ================================================================ shop / IAP

  /** Register the catalogue with the store. Never blocks the game; purchases wait for it. */
  private initStore(): void {
    const g = this.game;
    this.iapReady = (async () => {
      try {
        await g.services.iap.init(g.data.products.map((p) => ({ id: p.id, type: p.type })));
      } catch (e) {
        console.warn('[liveops] store init failed', e);
      }
    })();
  }

  /** Store-localized price, or the product's fallback price (web/dev builds, store unreachable). */
  price(productId: string): string {
    const def = this.game.data.product(productId);
    const sp = this.game.services.iap.products().find((p) => p.id === productId);
    if (sp && sp.available && sp.price) return sp.price;
    return def?.fallbackPrice ?? '';
  }

  purchaseCount(productId: string): number {
    return this.game.state.liveops.purchases.filter((p) => p.id === productId).length;
  }

  /** Has the account reached the product's purchase limit (season-premium: for the current season)? */
  limitReached(def: ProductDef): boolean {
    if (def.grants.seasonPremium) return this.game.state.liveops.season.premium;
    return def.limit > 0 && this.purchaseCount(def.id) >= def.limit;
  }

  canBuy(productId: string): boolean {
    const def = this.game.data.product(productId);
    return !!def && !this.limitReached(def);
  }

  /** Purchase a product through the store and grant it. Resolves true when the player now owns it. */
  async buy(productId: string): Promise<boolean> {
    const g = this.game;
    const bus = g.bus;
    const def = g.data.product(productId);
    if (!def) {
      bus.emit('iap:failed', { product: productId, reason: 'unknown_product' });
      return false;
    }
    if (this.buyBusy) return false;
    if (this.limitReached(def)) {
      bus.emit('iap:failed', { product: productId, reason: 'limit' });
      g.toast('You already own this', 'info');
      return false;
    }
    this.buyBusy = true;
    let res: PurchaseResult;
    try {
      await this.iapReady;
      res = await g.services.iap.purchase(productId);
    } catch (e) {
      res = { ok: false, productId, error: e instanceof Error ? e.message : String(e) };
    } finally {
      this.buyBusy = false;
    }
    if (!res.ok) {
      const reason = res.cancelled ? 'cancelled' : (res.error ?? 'failed');
      bus.emit('iap:failed', { product: productId, reason });
      if (!res.cancelled) g.toast("The purchase didn't go through — you have not been charged", 'warning');
      return false;
    }
    const lo = g.state.liveops;
    this.applyProduct(def, false);
    lo.purchases.push({ id: def.id, at: g.now() });
    g.state.stats.purchases++;
    bus.emit('iap:purchased', { product: def.id });
    bus.emit('sfx', { id: 'crate_open' });
    bus.emit('ui:celebrate', { title: 'Thank you!', text: def.name, icon: '💎' });
    return true;
  }

  /** Grant what a product contains. `entitlementsOnly` (restores) skips currency/resources. */
  private applyProduct(def: ProductDef, entitlementsOnly: boolean): void {
    const g = this.game;
    const grants = def.grants;
    if (entitlementsOnly) {
      const owned = g.state.liveops.cosmetics.owned;
      for (const c of grants.cosmetic ? [grants.cosmetic, ...(grants.cosmetics ?? [])] : (grants.cosmetics ?? [])) if (!owned.includes(c)) owned.push(c);
    } else {
      g.grant(grants, 'purchase');
    }
    if (grants.vipDays && !entitlementsOnly) this.extendVip(grants.vipDays);
    if (grants.seasonPremium) g.state.liveops.season.premium = true;
  }

  /** Restore non-consumables and subscriptions (store rule: always available to the player). */
  async restorePurchases(): Promise<void> {
    const g = this.game;
    let owned: string[] = [];
    try {
      await this.iapReady;
      owned = await g.services.iap.restore();
    } catch (e) {
      console.warn('[liveops] restore failed', e);
      g.toast("Couldn't reach the store to restore purchases", 'warning');
      return;
    }
    const lo = g.state.liveops;
    let restored = 0;
    for (const id of owned) {
      const def = g.data.product(id);
      if (!def || def.type !== 'non_consumable' || this.purchaseCount(id) > 0) continue;
      lo.purchases.push({ id, at: g.now() });
      this.applyProduct(def, true);
      restored++;
    }
    if (await this.syncSubscription()) restored++;
    g.toast(restored > 0 ? '✅ Purchases restored' : 'Nothing to restore', restored > 0 ? 'success' : 'info');
  }

  /** Pull the store's subscription expiry into `vip.until` (renewals / reinstalls). */
  private async syncSubscription(): Promise<boolean> {
    const g = this.game;
    const iap = g.services.iap;
    if (!iap.subscriptionExpiry) return false;
    try {
      await this.iapReady;
      const exp = await iap.subscriptionExpiry(g.data.vip.productId);
      const vip = g.state.liveops.vip;
      if (exp && exp > vip.until) {
        vip.until = exp;
        return true;
      }
    } catch (e) {
      console.warn('[liveops] subscription check failed', e);
    }
    return false;
  }

  // ---------------------------------------------------------------- cosmetics (Nova)

  ownsCosmetic(id: string): boolean {
    return this.game.state.liveops.cosmetics.owned.includes(id);
  }

  /** Buy a cosmetic with Nova (only those with a Nova price). */
  buyCosmetic(id: string): boolean {
    const def = this.game.data.cosmetic(id);
    if (!def || def.nova <= 0 || this.ownsCosmetic(id)) return false;
    if (!this.spendNova(def.nova, `cosmetic:${id}`)) return false;
    this.game.state.liveops.cosmetics.owned.push(id);
    this.game.bus.emit('sfx', { id: 'reward' });
    this.game.toast(`✨ ${def.name} unlocked!`, 'success');
    return true;
  }

  /** Wear / apply an owned cosmetic (one per kind). */
  equipCosmetic(id: string): boolean {
    const def: CosmeticDef | undefined = this.game.data.cosmetic(id);
    if (!def || !this.ownsCosmetic(id)) return false;
    this.game.state.liveops.cosmetics.equipped[def.kind] = id;
    return true;
  }

  unequipCosmetic(kind: CosmeticDef['kind']): void {
    delete this.game.state.liveops.cosmetics.equipped[kind];
  }

  // ================================================================ free crate

  freeCrateReady(): boolean {
    return this.game.now() >= this.game.state.liveops.freeCrateAt;
  }

  freeCrateSeconds(): number {
    return Math.max(0, Math.ceil((this.game.state.liveops.freeCrateAt - this.game.now()) / 1000));
  }

  /**
   * Open a crate. Without an ad it needs the timer (`freeCrateReady`). With an ad (called by
   * `watchAd('free_crate')`) a crate is granted any time; if the timed crate was also ready the ad
   * doubles it. Claiming a ready crate restarts the timer (`balance.freeCrateHours`).
   */
  openFreeCrate(viaAd: boolean): Reward | null {
    const g = this.game;
    const ready = this.freeCrateReady();
    if (!viaAd && !ready) return null;
    const base = crateReward(g.data, g.state.colony.tier);
    const reward = viaAd && ready ? scaleReward(base, 2) : base;
    if (ready) g.state.liveops.freeCrateAt = g.now() + g.data.balance.freeCrateHours * 3_600_000;
    this.crateWasReady = this.freeCrateReady();
    g.grant(reward, 'crate');
    g.bus.emit('sfx', { id: 'crate_open' });
    // short: the UI shows the full contents on a reward card (a 16-resource list does not fit a toast)
    g.toast('🎁 Supply crate opened!', 'reward');
    return reward;
  }

  // ================================================================ offline

  /**
   * Keep the unclaimed offline summary in the save. `Game.start()` resets `lastTickAt`, so without this a
   * player who quits at the Welcome Back screen would lose those earnings. Anything left over from an
   * earlier session is merged into the new summary (in place, so the UI sees the total).
   */
  private stashOffline(): void {
    const g = this.game;
    const cur = g.pendingOffline;
    if (!cur || this.restoringOffline) return; // (restoreOffline re-announces what is already stored)
    const lo = g.state.liveops;
    const left = lo.pendingOffline;
    if (left) {
      cur.seconds += left.seconds;
      cur.away += left.away;
      cur.rp += left.rp;
      for (const [k, v] of Object.entries(left.gains)) cur.gains[k] = (cur.gains[k] ?? 0) + (v ?? 0);
    }
    lo.pendingOffline = { seconds: cur.seconds, away: cur.away, gains: { ...cur.gains }, rp: cur.rp };
  }

  /** A previous session's unclaimed earnings with nothing new on top: offer them again. */
  private restoreOffline(): void {
    const g = this.game;
    const left = g.state.liveops.pendingOffline;
    if (g.pendingOffline || !left) return;
    g.pendingOffline = { seconds: left.seconds, away: left.away, gains: { ...left.gains }, rp: left.rp };
    this.restoringOffline = true;
    try {
      g.bus.emit('offline:ready', { seconds: left.seconds, gains: g.pendingOffline.gains, rp: left.rp });
    } finally {
      this.restoringOffline = false;
    }
  }

  /** Claim the "Welcome back" earnings; `doubled` after a rewarded ad. */
  claimOffline(doubled: boolean): void {
    const g = this.game;
    const summary = g.pendingOffline;
    if (!summary) return;
    g.pendingOffline = null;
    g.state.liveops.pendingOffline = null;
    g.sys.economy.applyOffline(summary, doubled ? 2 : 1);
    g.bus.emit('offline:claimed', { doubled });
    g.bus.emit('sfx', { id: 'collect' });
  }
}
