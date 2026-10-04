import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider } from 'react-native-safe-area-context';
import { isUnlocked } from '../billing/trial';
import { BurstLayer } from '../components/BurstLayer';
import { DialogHost } from '../components/DialogHost';
import { ErrorScreen } from '../components/ErrorScreen';
import { NotificationRouter } from '../components/NotificationRouter';
import { SnackbarHost } from '../components/Snackbar';
import { SCREENSHOT_MODE } from '../lib/config';
import { useEmbeddedFonts } from '../lib/embeddedFonts';
import { configureNotifications, syncReminders } from '../lib/notifications';
import { useBilling } from '../store/billing';
import { useFoodLog } from '../store/foodLog';
import { useFoods } from '../store/foods';
import { useHealth } from '../store/health';
import { useHousehold } from '../store/household';
import { useHydrated } from '../store/hydration';
import { useInventory } from '../store/inventory';
import { useMealsCache } from '../store/mealsCache';
import { useSettings } from '../store/settings';
import { useShopping } from '../store/shopping';
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

  // Waits for a pause in changes (typing a name updates the store on every keystroke), then reschedules.
  useEffect(() => {
    const t = setTimeout(() => {
      void syncReminders(items, {
        enabled: enabled && remindersEnabled,
        hour: reminderHour,
        trial: trialEndsOn ? { endsOn: trialEndsOn, price: priceString } : null,
      });
    }, 500);
    return () => clearTimeout(t);
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

/** Reads the week's activity from the health app at launch and whenever the app comes back. */
function HealthRefresh() {
  const connected = useHealth((s) => s.connected);
  useEffect(() => {
    if (!connected) return;
    void useHealth.getState().refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void useHealth.getState().refresh();
    });
    return () => sub.remove();
  }, [connected]);
  return null;
}

/** Keeps a shared household in step: on launch, every half minute, on return, and soon after local changes. */
function HouseholdSync() {
  const shared = useHousehold((s) => s.household !== null);
  useEffect(() => {
    if (!shared) return;
    const sync = () => void useHousehold.getState().sync();
    sync();
    const every = setInterval(() => {
      if (AppState.currentState === 'active') sync();
    }, 30_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    let soon: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      clearTimeout(soon);
      soon = setTimeout(sync, 2000);
    };
    const offItems = useInventory.subscribe((s, prev) => {
      if (s.items !== prev.items || s.deleted !== prev.deleted) later();
    });
    const offShopping = useShopping.subscribe((s, prev) => {
      if (s.items !== prev.items || s.deleted !== prev.deleted) later();
    });
    return () => {
      clearInterval(every);
      clearTimeout(soon);
      sub.remove();
      offItems();
      offShopping();
    };
  }, [shared]);
  return null;
}

/** Last line of defence: a render error shows a friendly screen instead of a blank or crashed app. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <ErrorScreen onRetry={() => void retry()} />;
}

export default function RootLayout() {
  const { c, scheme } = useTheme();
  const hydrated = useHydrated([useInventory, useSettings, useMealsCache, useShopping, useFoods, useFoodLog, useHealth, useHousehold]);
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
            <Stack.Screen name="foods" options={{ presentation: 'modal' }} />
            <Stack.Screen name="goals" options={{ presentation: 'modal' }} />
            <Stack.Screen name="log" options={{ presentation: 'modal' }} />
            <Stack.Screen name="household" options={{ presentation: 'modal' }} />
          </Stack.Protected>
          {/* Legal text must be readable before onboarding and on the paywall, so it is never guarded. */}
          <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
        </Stack>
        <ReminderSync enabled={unlocked} />
        {unlocked ? <HealthRefresh /> : null}
        {unlocked ? <HouseholdSync /> : null}
        {unlocked ? <NotificationRouter /> : null}
        <DialogHost />
        {/* Store screenshots should not catch a passing message. */}
        {SCREENSHOT_MODE ? null : <SnackbarHost />}
        <BurstLayer />
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
