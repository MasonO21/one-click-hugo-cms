/**
 * UiCtx — the service object handed to every panel/widget. It is the only thing panels need to
 * reach the game, the renderer and shared UI services (toasts, sfx, ads, build mode).
 */
import type { Game } from '../core/Game';
import type { DataRegistry } from '../data';
import type { Reward } from '../data/schema';
import type { RendererApi } from '../render/api';
import type { Badges } from './logic/badges';

export type ToastKind = 'info' | 'success' | 'warning' | 'reward' | 'danger';
export type HapticKind = 'tap' | 'success' | 'warning' | 'heavy';

/** Build-mode controller surface used by the build menu, inspector and build bar. */
export interface BuildApi {
  readonly active: boolean;
  /** Material tier chosen for structure pieces (<= colony tier). */
  pieceTier: number;
  /** Enter build mode with a building definition. */
  start(defId: string, opts?: { tier?: number; rot?: 0 | 1 | 2 | 3 }): void;
  /** Move an existing building (free). */
  startMove(buildingId: number): void;
  /** Place a saved blueprint. */
  startBlueprint(blueprintId: string): void;
  /** Rectangle-select pieces to save as a blueprint. */
  startSelect(): void;
  cancel(): void;
  confirm(): void;
  rotate(): void;
  setTier(tier: number): void;
}

export interface UiCtx {
  readonly game: Game;
  readonly renderer: RendererApi;
  readonly data: DataRegistry;
  readonly root: HTMLElement;
  readonly build: BuildApi;
  open(panel: string, arg?: unknown): void;
  close(panel?: string): void;
  isOpen(panel: string): boolean;
  toast(text: string, kind?: ToastKind, icon?: string): void;
  sfx(id: string): void;
  haptic(kind: HapticKind): void;
  /** Show a rewarded ad (with friendly failure toasts). Resolves true if the reward was earned. */
  watchAd(placement: string, context?: unknown): Promise<boolean>;
  /** Generic "you got these!" popup. */
  showReward(title: string, reward: Reward, icon?: string): void;
  /** Latest notification badge counts (refreshed ~2x/s). */
  badges(): Badges;
}
