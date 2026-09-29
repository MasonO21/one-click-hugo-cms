import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { TRIAL_NAME } from '../billing/trial';
import { formatShortDate } from './dates';
import { buildDigests, buildTrialReminder } from './reminders';
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
 * Replaces all scheduled reminders with a fresh set derived from the inventory and trial state.
 * Safe to call on every change: it is one cancel plus at most ~16 schedules.
 *
 * The trial-ending reminder is separate from the expiry reminders: it only needs notification
 * permission, so someone who turns expiry reminders off still hears before a charge.
 */
export async function syncReminders(
  items: PantryItem[],
  {
    enabled,
    hour,
    trial = null,
  }: {
    enabled: boolean;
    hour: number;
    trial?: { endsOn: string; price: string } | null;
  },
): Promise<void> {
  if (!supported) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!(await hasPermission())) return;

    const now = new Date();
    const digests = enabled ? buildDigests(items, now, { hour }) : [];
    const trialReminder = trial
      ? buildTrialReminder(trial.endsOn, now, {
          price: trial.price,
          endsLabel: formatShortDate(trial.endsOn),
          trialName: TRIAL_NAME,
        })
      : null;
    if (digests.length === 0 && !trialReminder) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Expiry and trial reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    for (const digest of digests) {
      await Notifications.scheduleNotificationAsync({
        content: { title: digest.title, body: digest.body, data: { route: '/meals' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: digest.fireAt, channelId: CHANNEL_ID },
      });
    }
    if (trialReminder) {
      await Notifications.scheduleNotificationAsync({
        content: { title: trialReminder.title, body: trialReminder.body, data: { route: '/settings' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trialReminder.fireAt, channelId: CHANNEL_ID },
      });
    }
  } catch {
    // Reminders are best-effort; never let a scheduling failure break the app.
  }
}
