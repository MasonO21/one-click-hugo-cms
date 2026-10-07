/**
 * LiveOpsSystem — Nova Crystals, daily login rewards (7-day), daily spin wheel, season pass,
 * Colony Pass VIP, timed boosts, rewarded-ad placements (limits/cooldowns + reward application),
 * shop purchases (IAP grants), free crate, offline "Welcome back" claim.
 *
 * OWNER: meta agent. Writes state.liveops.
 */
import { System } from './System';
import type { Reward } from '../data/schema';
import type { Boost } from '../core/state';

export class LiveOpsSystem extends System {
  // nova
  addNova(n: number, _source: string): void {
    this.game.state.liveops.nova += n;
    this.game.bus.emit('nova:changed', { amount: this.game.state.liveops.nova, delta: n });
  }
  spendNova(n: number, _reason: string): boolean {
    if (this.game.state.liveops.nova < n) return false;
    this.game.state.liveops.nova -= n;
    this.game.bus.emit('nova:changed', { amount: this.game.state.liveops.nova, delta: -n });
    return true;
  }

  // boosts
  activateBoost(kind: Boost['kind'], mult: number, minutes: number): void {
    this.game.state.liveops.boosts.push({ id: `${kind}_${Date.now()}`, kind, mult, until: this.game.now() + minutes * 60000 });
    this.game.bus.emit('boost:started', { kind, mult, minutes });
  }
  activeBoosts(): Boost[] {
    const now = this.game.now();
    return this.game.state.liveops.boosts.filter((b) => b.until > now);
  }
  isVip(): boolean {
    return this.game.state.liveops.vip.until > this.game.now();
  }

  // season
  addXp(_xp: number): void {}
  seasonLevel(): number {
    return 0;
  }
  claimSeason(_level: number, _premium: boolean): boolean {
    return false;
  }

  // daily
  dailyAvailable(): boolean {
    return false;
  }
  claimDaily(): Reward | null {
    return null;
  }

  // spin
  canSpinFree(): boolean {
    return false;
  }
  /** Returns the winning segment index (UI animates then calls grant via result event). */
  spin(_viaAd: boolean): Promise<number | null> {
    return Promise.resolve(null);
  }

  // ads
  canWatchAd(_placement: string): boolean {
    return false;
  }
  /** Show a rewarded ad and, if completed, apply the placement's reward. */
  watchAd(_placement: string, _context?: unknown): Promise<boolean> {
    return Promise.resolve(false);
  }

  // shop
  buy(_productId: string): Promise<boolean> {
    return Promise.resolve(false);
  }
  price(_productId: string): string {
    return '';
  }
  restorePurchases(): Promise<void> {
    return Promise.resolve();
  }

  // free crate
  freeCrateReady(): boolean {
    return false;
  }
  openFreeCrate(_viaAd: boolean): Reward | null {
    return null;
  }

  // offline
  claimOffline(_doubled: boolean): void {}
}
