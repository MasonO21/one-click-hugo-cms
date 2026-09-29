import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { buildDigests } from './reminders';
import type { PantryItem } from './types';

const CHANNEL_ID = 'expiry';
const supported = Platform.OS !== 'web';

export function configureNotifications(): void {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function hasPermission(): Promise<boolean> {
  if (!supported) return false;
  const p = await Notifications.getPermissionsAsync();
  return p.granted;
}

/** Asks the OS for permission if it has not been decided yet. */
export async function requestPermission(): Promise<boolean> {
  if (!supported) return false;
  if (await hasPermission()) return true;
  const p = await Notifications.requestPermissionsAsync();
  return p.granted;
}

/**
 * Replaces all scheduled reminders with a fresh set derived from the inventory.
 * Safe to call on every change: it is one cancel plus at most ~15 schedules.
 */
export async function syncReminders(
  items: PantryItem[],
  { enabled, hour }: { enabled: boolean; hour: number },
): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!enabled || !(await hasPermission())) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Expiry reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const digest of buildDigests(items, new Date(), { hour })) {
      await Notifications.scheduleNotificationAsync({
        content: { title: digest.title, body: digest.body, data: { route: '/meals' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: digest.fireAt,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch {
    // Reminders are best-effort; never let a scheduling failure break the app.
  }
}
