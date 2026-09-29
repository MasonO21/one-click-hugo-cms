import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { getProvider, useBilling } from '../../store/billing';
import { TRIAL_NAME } from '../../billing/trial';
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
import { useSettings } from '../../store/settings';
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

const formatHour = (h: number) => {
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" muted>
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

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.linkRow}>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={c.inkFaint} />
    </Pressable>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const settings = useSettings();
  const { entitlement, priceString } = useBilling();
  const provider = getProvider();

  const [askConsent, setAskConsent] = useState(false);

  const endsLabel = entitlement.endsOn ? formatShortDate(entitlement.endsOn) : null;
  const planLine =
    entitlement.status === 'trial'
      ? `Free trial: ${entitlement.daysRemaining} ${entitlement.daysRemaining === 1 ? 'day' : 'days'} left${endsLabel ? `. ${priceString}/month starts ${endsLabel} unless you cancel.` : '.'}`
      : entitlement.status === 'active'
        ? `Subscribed at ${priceString}/month${endsLabel ? `. Renews ${endsLabel}.` : '.'}`
        : 'No active plan';

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
      message: 'This removes every tracked item from this device. It cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    useInventory.getState().clear();
    useMealsCache.getState().clear();
  }

  return (
    <>
    <Screen>
      <Header title="Settings" />

      <Section title="Your plan">
        <Row
          label="Fridge Pulse"
          hint={planLine}
          right={
            entitlement.status === 'trial' || entitlement.status === 'active' ? (
              <Ionicons name="checkmark-circle" size={24} color={c.primary} />
            ) : null
          }
        />
        <Text variant="caption" muted>
          {TRIAL_NAME} free trial, then {priceString} per month. Cancel anytime in your {Platform.OS === 'android' ? 'Google Play' : 'Apple ID'} subscription settings.
        </Text>
        <View style={styles.buttons}>
          <Button label="Manage subscription" size="sm" variant="secondary" onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL)} />
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
                  testID="reminders-switch"
                  value={settings.remindersEnabled}
                  onValueChange={(v) => void toggleReminders(v)}
                  trackColor={{ true: c.primary, false: c.border }}
                  thumbColor="#FFFFFF"
                />
              }
            />
            {settings.remindersEnabled ? (
              <Row
                label="Time"
                right={
                  <Stepper
                    label={formatHour(settings.reminderHour)}
                    onDecrement={() => settings.set({ reminderHour: (settings.reminderHour + 23) % 24 })}
                    onIncrement={() => settings.set({ reminderHour: (settings.reminderHour + 1) % 24 })}
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
            />
          }
        />
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
                  ? 'On. Photos and item names are sent securely to an AI service when you scan or ask for meal ideas.'
                  : 'Off. Nothing is sent anywhere. Turn on to scan photos and get AI-written recipes.'
              }
              right={
                <Switch
                  testID="ai-switch"
                  accessibilityLabel="Use AI to read photos and suggest meals"
                  value={settings.aiConsent}
                  onValueChange={toggleAi}
                  trackColor={{ true: c.primary, false: c.border }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </>
        )}
        <Text variant="caption" muted>
          Your items and settings are stored on this device only. Fridge Pulse has no accounts and does not keep your photos.
        </Text>
        <Button label="Delete all my data" variant="danger" size="sm" onPress={() => void confirmDelete()} style={{ alignSelf: 'flex-start' }} />
      </Section>

      <Section title="About">
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
