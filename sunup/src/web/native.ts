// The bridge to the native shell (Capacitor). On the web, nothing here runs: plugins are
// imported lazily and only inside native code paths.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;

/** True inside the iOS or Android app. */
export const IS_NATIVE = !!cap?.isNativePlatform?.();
export const PLATFORM = (IS_NATIVE ? cap?.getPlatform?.() : 'web') as 'ios' | 'android' | 'web';

/** Where the Sunup server lives. Empty on the web (same origin); set with VITE_SUNUP_API for app builds. */
export const API_BASE = ((import.meta.env.VITE_SUNUP_API as string | undefined) ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Whether the app can sell Premium. App stores have their own rules for digital
 * subscriptions, so native builds hide purchasing unless VITE_SUNUP_STORE_PURCHASES=web.
 * People who subscribe on the website still get Premium in the app.
 */
export const CAN_PURCHASE = !IS_NATIVE || import.meta.env.VITE_SUNUP_STORE_PURCHASES === 'web';

/** Asks for notification permission and returns this device's push token. */
export async function registerNativePush(): Promise<{ status: 'granted' | 'denied' | 'unsupported'; token?: string }> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return { status: 'denied' };
    if (PLATFORM === 'android') {
      // Android groups notifications into channels people can tune separately.
      await PushNotifications.createChannel({ id: 'alerts', name: 'Safety alerts', description: 'Missed check-ins, SOS and your circle', importance: 5, visibility: 1, vibration: true });
      await PushNotifications.createChannel({ id: 'reminders', name: 'Check-in reminders', description: 'Good morning and deadline reminders', importance: 3, visibility: 1 });
    }
    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Push registration timed out')), 20_000);
      void PushNotifications.addListener('registration', (t) => {
        clearTimeout(timer);
        resolve(t.value);
      });
      void PushNotifications.addListener('registrationError', (e) => {
        clearTimeout(timer);
        reject(new Error(e.error));
      });
      void PushNotifications.register();
    });
    return { status: 'granted', token };
  } catch {
    // e.g. an Android build without Firebase configured.
    return { status: 'unsupported' };
  }
}

/** Stops push to this device (on sign-out or account deletion). */
export async function unregisterNativePush(): Promise<void> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
    await PushNotifications.unregister();
  } catch {
    // Nothing registered.
  }
}

/** Wires up the native events the app cares about. Call once at startup. */
export async function initNative(handlers: { onPush: () => void }): Promise<void> {
  if (!IS_NATIVE) return;
  const [{ PushNotifications }, { App }] = await Promise.all([import('@capacitor/push-notifications'), import('@capacitor/app')]);

  // A push arrived while the app is open: refresh so the in-app toast and screens update.
  void PushNotifications.addListener('pushNotificationReceived', () => handlers.onPush());

  // Tapping a notification opens the screen it's about.
  void PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const link = (event.notification.data as { link?: string } | undefined)?.link;
    if (link) location.hash = link;
    handlers.onPush();
  });

  // Invite links (https://your-domain/?join=CODE) open the app when it's installed.
  void App.addListener('appUrlOpen', ({ url }) => {
    const code = new URL(url).searchParams.get('join');
    if (code) location.href = `${location.origin}/?join=${encodeURIComponent(code)}`;
  });
}

/** Opens a web page (like Stripe Checkout) in the system browser. */
export async function openExternal(url: string): Promise<void> {
  if (!IS_NATIVE) {
    location.assign(url);
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/** A short tap of haptic feedback (iOS has no navigator.vibrate). */
export async function hapticTap(): Promise<void> {
  if (!IS_NATIVE) {
    navigator.vibrate?.(30);
    return;
  }
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Haptics unavailable.
  }
}
