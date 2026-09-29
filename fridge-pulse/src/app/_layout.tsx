import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { isUnlocked } from '../billing/trial';
import { DialogHost } from '../components/DialogHost';
import { ErrorScreen } from '../components/ErrorScreen';
import { useEmbeddedFonts } from '../lib/embeddedFonts';
import { configureNotifications, syncReminders } from '../lib/notifications';
import { useBilling } from '../store/billing';
import { useHydrated } from '../store/hydration';
import { useInventory } from '../store/inventory';
import { useMealsCache } from '../store/mealsCache';
import { useSettings } from '../store/settings';
import { useTheme } from '../theme';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotifications();

/** Keeps scheduled expiry reminders in step with the inventory and settings. */
function ReminderSync({ enabled }: { enabled: boolean }) {
  const items = useInventory((s) => s.items);
  const remindersEnabled = useSettings((s) => s.remindersEnabled);
  const reminderHour = useSettings((s) => s.reminderHour);
  const entitlement = useBilling((s) => s.entitlement);
  const priceString = useBilling((s) => s.priceString);
  const trialEndsOn = entitlement.status === 'trial' ? entitlement.endsOn : null;

  useEffect(() => {
    void syncReminders(items, {
      enabled: enabled && remindersEnabled,
      hour: reminderHour,
      trial: trialEndsOn ? { endsOn: trialEndsOn, price: priceString } : null,
    });
  }, [items, enabled, remindersEnabled, reminderHour, trialEndsOn, priceString]);

  // Reschedule when the app returns to the foreground: the window of upcoming days moves on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const settings = useSettings.getState();
      const billing = useBilling.getState();
      const endsOn = billing.entitlement.status === 'trial' ? billing.entitlement.endsOn : null;
      void syncReminders(useInventory.getState().items, {
        enabled: enabled && settings.remindersEnabled,
        hour: settings.reminderHour,
        trial: endsOn ? { endsOn, price: billing.priceString } : null,
      });
    });
    return () => sub.remove();
  }, [enabled]);

  return null;
}

/** Opens the meals tab when a reminder is tapped (including a cold start from one). */
function NotificationRouter() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const route = response.notification.request.content.data?.route;
    if (typeof route === 'string') router.push(route as never);
  }, [response, router]);
  return null;
}

/** Last line of defence: a render error shows a friendly screen instead of a blank or crashed app. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <ErrorScreen onRetry={() => void retry()} />;
}

export default function RootLayout() {
  const { c, scheme } = useTheme();
  const hydrated = useHydrated([useInventory, useSettings, useMealsCache]);
  const billingReady = useBilling((s) => s.ready);
  const unlocked = useBilling((s) => isUnlocked(s.entitlement));
  const onboarded = useSettings((s) => s.onboarded);

  useEffect(() => {
    void useBilling.getState().init();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useBilling.getState().refresh();
    });
    return () => sub.remove();
  }, []);

  const fontsReady = useEmbeddedFonts();
  const ready = hydrated && billingReady && fontsReady;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      background: c.bg,
      card: c.surface,
      text: c.ink,
      border: c.border,
      primary: c.primary,
    },
  };

  const app = (
    <>
      <ThemeProvider value={navTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
          <Stack.Protected guard={!onboarded}>
            <Stack.Screen name="onboarding" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded && !unlocked}>
            <Stack.Screen name="paywall" />
          </Stack.Protected>
          <Stack.Protected guard={onboarded && unlocked}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
            <Stack.Screen name="review" options={{ presentation: 'modal' }} />
            <Stack.Screen name="item/[id]" options={{ presentation: 'modal' }} />
            <Stack.Screen name="about" options={{ presentation: 'modal' }} />
          </Stack.Protected>
          {/* Legal text must be readable before onboarding and on the paywall, so it is never guarded. */}
          <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
        </Stack>
        <ReminderSync enabled={unlocked} />
        {unlocked && Platform.OS !== 'web' ? <NotificationRouter /> : null}
        <DialogHost />
      </ThemeProvider>
    </>
  );

  return (
    <SafeAreaProvider>
      {/* On web the hosting page already pads for device safe areas; padding here would double it. */}
      {Platform.OS === 'web' ? <SafeAreaInsetsContext.Provider value={NO_INSETS}>{app}</SafeAreaInsetsContext.Provider> : app}
    </SafeAreaProvider>
  );
}
