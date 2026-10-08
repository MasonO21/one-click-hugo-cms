/**
 * Haptics: @capacitor/haptics on iOS/Android, silent no-op on the web.
 * `setEnabled` is driven by `settings.haptics` (see hooks.ts). Calls are rate-limited so a burst of
 * game events never turns into a buzzing phone.
 * OWNER: meta agent.
 */
import type { HapticsService } from './types';

export interface ToggleableHaptics extends HapticsService {
  setEnabled(enabled: boolean): void;
}

export class NoopHaptics implements ToggleableHaptics {
  setEnabled(_enabled: boolean): void {}
  tap(): void {}
  success(): void {}
  warning(): void {}
  heavy(): void {}
}

type HapticsModule = typeof import('@capacitor/haptics');

/** How strong each kind feels: within the rate-limit gap only a stronger buzz may follow. */
const STRENGTH = { tap: 0, success: 1, warning: 1, heavy: 2 } as const;

export class CapacitorHaptics implements ToggleableHaptics {
  private enabled = true;
  private last = 0;
  private lastStrength = 0;
  private mod: Promise<HapticsModule> | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Rate limit: inside the gap after a buzz, only a stronger one plays. Every button press buzzes a light tap first
   * (UI click handler, capture phase), so the button's own success / heavy arrives a millisecond later and must not
   * be swallowed by it; equal or lighter repeats (a burst of events, two listeners for one moment) still are.
   */
  private fire(fn: (m: HapticsModule) => Promise<void>, minGapMs: number, strength: number): void {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.last < minGapMs && strength <= this.lastStrength) return;
    this.last = now;
    this.lastStrength = strength;
    this.mod ??= import('@capacitor/haptics');
    this.mod.then(fn).catch(() => {
      /* device without a haptic engine */
    });
  }

  tap(): void {
    this.fire((m) => m.Haptics.impact({ style: m.ImpactStyle.Light }), 45, STRENGTH.tap);
  }

  success(): void {
    this.fire((m) => m.Haptics.notification({ type: m.NotificationType.Success }), 150, STRENGTH.success);
  }

  warning(): void {
    this.fire((m) => m.Haptics.notification({ type: m.NotificationType.Warning }), 150, STRENGTH.warning);
  }

  heavy(): void {
    this.fire((m) => m.Haptics.impact({ style: m.ImpactStyle.Heavy }), 150, STRENGTH.heavy);
  }
}
