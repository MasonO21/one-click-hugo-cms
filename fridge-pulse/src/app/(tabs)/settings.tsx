import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { getProvider, planPriceLabel, useBilling } from '../../store/billing';
import { HOUSEHOLD_MAX_PEOPLE, isUnlocked, planName, TRIAL_NAME } from '../../billing/trial';
import { AiConsentModal } from '../../components/AiConsentModal';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { Text } from '../../components/Text';
import { isDemoMode } from '../../lib/api';
import { MANAGE_SUBSCRIPTION_URL } from '../../lib/config';
import { formatShortDate } from '../../lib/dates';
import { confirm, notify } from '../../lib/dialogs';
import { hasPermission, requestPermission } from '../../lib/notifications';
import type { Diet } from '../../lib/types';
import { useInventory } from '../../store/inventory';
import { useMealsCache } from '../../store/mealsCache';
import { useSettings, type Appearance } from '../../store/settings';
import { useBarcodes } from '../../store/barcodes';
import { useFoods } from '../../store/foods';
import { useShopping } from '../../store/shopping';
import { clearLog } from '../../store/logActions';
import { getHealth, useHealth } from '../../store/health';
import { isCovered, sponsorName, useHousehold } from '../../store/household';
import { NO_PROFILE, targetsFor } from '../../lib/goals';
import { useTheme } from '../../theme';

const DIETS: { value: Diet; label: string }[] = [
  { value: 'none', label: 'Anything' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'dairy-free', label: 'Dairy-free' },
];

// Phone notifications only exist in the native app.
const remindersSupported = Platform.OS !== 'web';

/** "9 AM" or "09:00", however the phone shows times. */
const formatHour = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** React Native Web draws switches at 40x20, too small to tap reliably; this makes them 56x28 there. */
const WEB_SWITCH = Platform.OS === 'web' ? { height: 28 } : undefined;
const STORE_NAME = Platform.OS === 'android' ? 'Google Play' : Platform.OS === 'ios' ? 'Apple ID' : 'app store';

const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Match phone' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" muted accessibilityRole="header">
        {title}
      </Text>
      <Card style={{ gap: 14 }}>{children}</Card>
    </View>
  );
}

function Row({ label, hint, right }: { label: string; hint?: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function LinkRow({ label, hint, onPress, testID }: { label: string; hint?: string; onPress: () => void; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkRow} testID={testID}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" muted>
            {hint}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.inkFaint} />
    </Pressable>
  );
}

/** Goals, the food log and the phone's health app. */
function HealthSection() {
  const { c } = useTheme();
  const profile = useSettings((s) => s.profile);
  const targets = targetsFor(profile);
  const connected = useHealth((s) => s.connected);
  const writeFood = useHealth((s) => s.writeFood);
  const error = useHealth((s) => s.error);
  const health = getHealth();
  const goalHint = targets ? `${targets.protein} g protein${targets.kcal !== null ? ` · ${targets.kcal.toLocaleString()} kcal` : ''} a day` : 'Protein and calories from your weight';
  return (
    <Section title="Health and goals">
      <LinkRow testID="settings-goals" label="Your goals" hint={goalHint} onPress={() => router.push('/goals')} />
      <LinkRow testID="settings-log" label="Food log" hint="What you ate, logged from meals and food" onPress={() => router.push('/log')} />
      {health.kind === 'none' ? (
        <Text variant="caption" muted>
          Apple Health and Health Connect sync is in the iPhone and Android app.
        </Text>
      ) : (
        <>
          <Row
            label={health.kind === 'sample' ? 'Health app (sample data)' : health.name}
            hint={connected ? 'Reading steps, active energy and workouts for your active days.' : 'Connect to count your active days and save the food you log.'}
            right={
              <Switch
                style={WEB_SWITCH}
                testID="health-switch"
                accessibilityLabel={`Connect ${health.name}`}
                value={connected}
                onValueChange={(on) => (on ? void useHealth.getState().connect() : useHealth.getState().disconnect())}
                trackColor={{ true: c.primary, false: c.switchOff }}
                ios_backgroundColor={c.switchOff}
                thumbColor="#FFFFFF"
              />
            }
          />
          {connected ? (
            <Row
              label="Save logged food"
              hint={`Calories, protein, carbs and fat go to ${health.kind === 'sample' ? 'the health app' : health.name}.`}
              right={
                <Switch
                  style={WEB_SWITCH}
                  testID="health-write-switch"
                  accessibilityLabel="Save logged food to the health app"
                  value={writeFood}
                  onValueChange={(on) => useHealth.getState().setWriteFood(on)}
                  trackColor={{ true: c.primary, false: c.switchOff }}
                  ios_backgroundColor={c.switchOff}
                  thumbColor="#FFFFFF"
                />
              }
            />
          ) : null}
          {error ? (
            <Text variant="caption" color={c.urgency.today.fg} style={{ fontSize: 14 }}>
              {error}
            </Text>
          ) : null}
          {health.openSettings ? (
            <Text variant="caption" muted>
              {`Turning this off stops Fridge Pulse using ${health.name}. To remove its access completely, change it in ${health.name}.`}
            </Text>
          ) : null}
        </>
      )}
    </Section>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const settings = useSettings();
  const foodCount = useFoods((s) => s.foods.length);
  const household = useHousehold((s) => s.household);
  const { entitlement, prices } = useBilling();
  const priceString = planPriceLabel(prices, entitlement.planId ?? 'monthly');
  const covered = isCovered(household);
  const sponsor = sponsorName(household);
  const provider = getProvider();

  const [askConsent, setAskConsent] = useState(false);
  // Reminders can be on here while the phone has notifications off for the app; say so.
  const [blocked, setBlocked] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!remindersSupported || !settings.remindersEnabled) {
        setBlocked(false);
        return;
      }
      let alive = true;
      void hasPermission().then((ok) => alive && setBlocked(!ok));
      return () => {
        alive = false;
      };
    }, [settings.remindersEnabled]),
  );

  const endsLabel = entitlement.endsOn ? formatShortDate(entitlement.endsOn) : null;
  const left = entitlement.daysRemaining;
  const trialPart = left === 0 ? 'Last day of your free trial' : left != null ? `Free trial: ${left} ${left === 1 ? 'day' : 'days'} left` : 'Free trial';
  const planLine =
    entitlement.status === 'trial'
      ? entitlement.willRenew === false
        ? `${trialPart}. It will not renew, so you will not be charged.`
        : `${trialPart}${endsLabel ? `. ${priceString} starts ${endsLabel} unless you cancel.` : '.'}`
      : entitlement.status === 'active'
        ? entitlement.willRenew === false
          ? `Subscribed${endsLabel ? ` until ${endsLabel}` : ''}. It will not renew.`
          : `Subscribed at ${priceString}${endsLabel ? `. Renews ${endsLabel}.` : '.'}`
        : covered
          ? `Included in ${sponsor ? `${sponsor}’s` : 'your household’s'} household plan.`
          : 'No active plan'
  const planLabel = isUnlocked(entitlement) && entitlement.planId ? `Fridge Pulse · ${planName(entitlement.planId)}` : 'Fridge Pulse'

  function toggleAi(on: boolean) {
    if (on) {
      setAskConsent(true);
      return;
    }
    // Withdrawing consent stops all uploads immediately; AI results already saved are discarded.
    settings.set({ aiConsent: false, aiConsentAt: null });
    useMealsCache.getState().clear();
  }

  async function toggleReminders(on: boolean) {
    if (on && !(await hasPermission())) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('Notifications are off', 'Turn on notifications for Fridge Pulse in your phone settings to get expiry reminders.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open settings', onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
    }
    settings.set({ remindersEnabled: on });
  }

  async function restore() {
    const granted = await useBilling.getState().restore();
    if (granted) notify('Purchases restored', 'Your subscription is active on this device.');
    else notify('Nothing to restore', useBilling.getState().error ?? 'No active subscription was found for this account.');
  }

  async function confirmDelete() {
    const ok = await confirm({
      title: 'Delete all data?',
      message: `This removes every tracked item, your shopping list, the foods you have taught the app, your food log${useHealth.getState().connected ? ` (and the meals it added to ${getHealth().name})` : ''}, your goals and your impact history from this device. It cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    // Leave a shared household first, so the others keep their lists and this phone stops sharing.
    if (useHousehold.getState().household && !(await useHousehold.getState().leave())) {
      notify('Could not leave your household', 'Check your connection and try again, so your data can be removed.');
      return;
    }
    useInventory.getState().clear();
    useMealsCache.getState().clear();
    useShopping.getState().clear();
    useFoods.getState().clear();
    useBarcodes.getState().clear();
    clearLog();
    useHealth.getState().disconnect();
    useSettings.getState().set({ profile: NO_PROFILE });
  }

  return (
    <>
    <Screen>
      <Header title="Settings" />

      <Section title="Your plan">
        <Row
          label={planLabel}
          hint={planLine}
          right={isUnlocked(entitlement) || covered ? <Ionicons name="checkmark-circle" size={24} color={c.primary} /> : null}
        />
        <Text variant="caption" muted testID="settings-plan-caption">
          {`${TRIAL_NAME} free trial, then ${planPriceLabel(prices, 'annual')} or ${planPriceLabel(prices, 'monthly')}. The household plan covers up to ${HOUSEHOLD_MAX_PEOPLE} people for ${planPriceLabel(prices, 'household-annual')} or ${planPriceLabel(prices, 'household-monthly')}. Cancel anytime in your ${STORE_NAME} subscription settings.`}
        </Text>
        <View style={styles.buttons}>
          <Button testID="settings-plans" label={entitlement.household ? 'Change plan' : 'Plans and household plan'} size="sm" variant="secondary" onPress={() => router.push('/plans')} />
          {Platform.OS !== 'web' ? (
            <Button label="Manage subscription" size="sm" variant="secondary" onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL)} />
          ) : null}
          <Button label="Restore purchases" size="sm" variant="ghost" onPress={() => void restore()} />
        </View>
      </Section>

      <Section title="Reminders">
        {remindersSupported ? (
          <>
            <Row
              label="Expiry reminders"
              hint="A daily note about food expiring today or tomorrow"
              right={
                <Switch
                  style={WEB_SWITCH}
                  accessibilityLabel="Expiry reminders"
                  testID="reminders-switch"
                  value={settings.remindersEnabled}
                  onValueChange={(v) => void toggleReminders(v)}
                  trackColor={{ true: c.primary, false: c.switchOff }}
                  ios_backgroundColor={c.switchOff}
                  thumbColor="#FFFFFF"
                />
              }
            />
            {settings.remindersEnabled && blocked ? (
              <View style={{ gap: 8 }} testID="notifications-blocked">
                <Text variant="caption" color={c.urgency.today.fg} style={{ fontSize: 14, lineHeight: 20 }}>
                  Notifications are turned off for Fridge Pulse in your phone settings, so reminders cannot arrive.
                </Text>
                <Button label="Open phone settings" size="sm" variant="secondary" onPress={() => void Linking.openSettings()} style={{ alignSelf: 'flex-start' }} />
              </View>
            ) : null}
            {settings.remindersEnabled ? (
              <Row
                label="Time"
                right={
                  <Stepper
                    label={formatHour(settings.reminderHour)}
                    onDecrement={() => settings.set({ reminderHour: (settings.reminderHour + 23) % 24 })}
                    onIncrement={() => settings.set({ reminderHour: (settings.reminderHour + 1) % 24 })}
                    decrementLabel="Remind me an hour earlier"
                    incrementLabel="Remind me an hour later"
                  />
                }
              />
            ) : null}
          </>
        ) : (
          <Text variant="caption" muted>
            Expiry reminders are sent as phone notifications, so they are available in the mobile app.
          </Text>
        )}
      </Section>

      <HealthSection />

      <Section title="Household">
        <LinkRow
          testID="settings-household"
          label="Household sharing"
          hint={
            household
              ? `${household.name} · ${household.members.length} ${household.members.length === 1 ? 'person' : 'people'}${covered ? ' · household plan' : ''}`
              : 'Share your fridge and shopping list'
          }
          onPress={() => router.push('/household')}
        />
      </Section>

      <Section title="Meal preferences">
        <View style={styles.chips}>
          {DIETS.map((d) => (
            <Chip key={d.value} label={d.label} selected={settings.diet === d.value} onPress={() => settings.set({ diet: d.value })} />
          ))}
        </View>
        <Row
          label="Servings"
          right={
            <Stepper
              label={`${settings.servings} ${settings.servings === 1 ? 'person' : 'people'}`}
              onDecrement={() => settings.set({ servings: Math.max(1, settings.servings - 1) })}
              onIncrement={() => settings.set({ servings: Math.min(12, settings.servings + 1) })}
              decrementLabel="One person fewer"
              incrementLabel="One person more"
            />
          }
        />
      </Section>

      <Section title="Appearance">
        <View style={styles.chips}>
          {APPEARANCES.map((a) => (
            <Chip key={a.value} testID={`appearance-${a.value}`} label={a.label} selected={settings.appearance === a.value} onPress={() => settings.set({ appearance: a.value })} />
          ))}
        </View>
        <Text variant="caption" muted>
          {settings.appearance === 'dark' ? 'The neon look. Easy on the eyes in a dim kitchen.' : settings.appearance === 'light' ? 'The same colours on a bright background.' : 'Follows your phone’s light or dark setting.'}
        </Text>
      </Section>

      <Section title="Privacy and data">
        {isDemoMode ? (
          <Text variant="caption" muted>
            Preview mode: nothing leaves your phone.
          </Text>
        ) : (
          <>
            <Row
              label="Use AI to read photos and suggest meals"
              hint={
                settings.aiConsent
                  ? 'On. Photos and item names are sent securely to an AI service when you scan, look up an item or ask for meal ideas.'
                  : 'Off. Nothing is sent anywhere. Turn on to scan photos and get AI-written recipes.'
              }
              right={
                <Switch
                  style={WEB_SWITCH}
                  testID="ai-switch"
                  accessibilityLabel="Use AI to read photos and suggest meals"
                  value={settings.aiConsent}
                  onValueChange={toggleAi}
                  trackColor={{ true: c.primary, false: c.switchOff }}
                  ios_backgroundColor={c.switchOff}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </>
        )}
        <Text variant="caption" muted>
          {household
            ? 'Your food and shopping lists are shared with your household through the Fridge Pulse server. Your food log, goals and health data stay on this device. Fridge Pulse does not keep your photos.'
            : 'Your items and settings are stored on this device only. Fridge Pulse has no accounts and does not keep your photos.'}
        </Text>
        <Button label="Delete all my data" variant="danger" size="sm" onPress={() => void confirmDelete()} style={{ alignSelf: 'flex-start' }} />
      </Section>

      <Section title="About">
        <LinkRow label={`Your foods${foodCount > 0 ? ` (${foodCount})` : ''}`} onPress={() => router.push('/foods')} />
        <LinkRow label="Food safety and about" onPress={() => router.push('/about')} />
        <LinkRow label="Privacy Policy" onPress={() => router.push('/legal/privacy')} />
        <LinkRow label="Terms of Use" onPress={() => router.push('/legal/terms')} />
      </Section>

      {provider.simulateTrialDaysLeft ? (
        <Section title="Demo billing (testing)">
          <Text variant="caption" muted>
            On-device trial simulation. Use these to see how the paywall behaves.
          </Text>
          <View style={styles.buttons}>
            {[
              { label: 'Trial ends in 3 days', days: 3 },
              { label: 'Expire trial now', days: 0 },
            ].map((b) => (
              <Button
                key={b.label}
                label={b.label}
                size="sm"
                variant="secondary"
                onPress={async () => {
                  await provider.simulateTrialDaysLeft?.(b.days);
                  await useBilling.getState().refresh();
                }}
              />
            ))}
          </View>
        </Section>
      ) : null}

      <Text variant="caption" faint style={{ textAlign: 'center' }}>
        Fridge Pulse {Constants.expoConfig?.version ?? ''}
      </Text>
    </Screen>
    <AiConsentModal visible={askConsent} onClose={() => setAskConsent(false)} onAgree={() => setAskConsent(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
