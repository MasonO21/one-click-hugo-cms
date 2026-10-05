// Native bridges (Capacitor) with safe web fallbacks.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export const isNative = Capacitor.isNativePlatform();
let enabled = true;
export const setHapticsEnabled = (on) => { enabled = !!on; };

/** kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' */
export function haptic(kind = 'light') {
  if (!enabled) return;
  try {
    if (isNative) {
      if (kind === 'success' || kind === 'warning') Haptics.notification({ type: kind === 'success' ? NotificationType.Success : NotificationType.Warning });
      else Haptics.impact({ style: kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'heavy' ? 40 : kind === 'medium' ? 20 : kind === 'success' ? [15, 40, 25] : 8);
    }
  } catch (e) { /* not supported */ }
}
