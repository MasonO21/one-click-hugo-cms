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

export class CapacitorHaptics implements ToggleableHaptics {
  private enabled = true;
  private last = 0;
  private mod: Promise<HapticsModule> | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private fire(fn: (m: HapticsModule) => Promise<void>, minGapMs = 45): void {
    if (!this.enabled) return;
    const now = Date.now();
    if (now - this.last < minGapMs) return;
    this.last = now;
    this.mod ??= import('@capacitor/haptics');
    this.mod.then(fn).catch(() => {
      /* device without a haptic engine */
    });
  }

  tap(): void {
    this.fire((m) => m.Haptics.impact({ style: m.ImpactStyle.Light }));
  }

  success(): void {
    this.fire((m) => m.Haptics.notification({ type: m.NotificationType.Success }), 150);
  }

  warning(): void {
    this.fire((m) => m.Haptics.notification({ type: m.NotificationType.Warning }), 150);
  }

  heavy(): void {
    this.fire((m) => m.Haptics.impact({ style: m.ImpactStyle.Heavy }), 150);
  }
}
