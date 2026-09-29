import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import { getProvider, useBilling } from '../../store/billing';
import { TRIAL_DAYS } from '../../billing/trial';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Header } from '../../components/Header';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { Text } from '../../components/Text';
import { isDemoMode } from '../../lib/api';
import { MANAGE_SUBSCRIPTION_URL, PRIVACY_URL, TERMS_URL } from '../../lib/config';
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

export default function Settings() {
  const { c } = useTheme();
  const settings = useSettings();
  const { entitlement, priceString } = useBilling();
  const provider = getProvider();

  const trialLine =
    entitlement.status === 'trial'
      ? `Free trial: ${entitlement.daysRemaining} ${entitlement.daysRemaining === 1 ? 'day' : 'days'} left, then ${priceString}/month`
      : entitlement.status === 'active'
        ? `Subscribed: ${priceString}/month`
        : 'Not subscribed';

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
    <Screen>
      <Header title="Settings" />

      <Section title="Subscription">
        <Row
          label="Fridge Pulse"
          hint={trialLine}
          right={<Ionicons name="checkmark-circle" size={24} color={c.primary} />}
        />
        <Text variant="caption" muted>
          {TRIAL_DAYS}-day free trial, then {priceString} per month. Cancel anytime.
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

      <Section title="Privacy">
        <Text variant="caption" muted>
          {isDemoMode
            ? 'Demo mode: nothing leaves your phone.'
            : 'Photos are sent to an AI service to identify food, and Fridge Pulse does not keep them. Your item list stays on this device.'}
        </Text>
        <View style={styles.buttons}>
          <Button label="Privacy policy" size="sm" variant="ghost" onPress={() => void Linking.openURL(PRIVACY_URL)} />
          <Button label="Terms of use" size="sm" variant="ghost" onPress={() => void Linking.openURL(TERMS_URL)} />
        </View>
        <Button label="Delete all my data" variant="danger" size="sm" onPress={() => void confirmDelete()} style={{ alignSelf: 'flex-start' }} />
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
