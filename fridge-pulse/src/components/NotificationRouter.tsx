import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

/** Opens the screen a tapped reminder points to (including a cold start from one). */
export function NotificationRouter() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const route = response.notification.request.content.data?.route;
    // Handled once: this router is mounted again whenever access comes back (a renewed plan), and
    // the same old tap must not open its screen a second time.
    try {
      Notifications.clearLastNotificationResponse();
    } catch {
      // Not available on this platform (the web), where there are no taps to replay.
    }
    if (typeof route === 'string') router.push(route as never);
  }, [response, router]);
  return null;
}
