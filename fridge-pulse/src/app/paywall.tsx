import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { getProvider, useBilling } from '../store/billing';
import { TRIAL_DAYS, TRIAL_NAME, TRIAL_SPAN } from '../billing/trial';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Logo } from '../components/Logo';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { SCREENSHOT_MODE } from '../lib/config';
import { addDays, formatShortDate, todayISO } from '../lib/dates';
import { useTheme } from '../theme';


const FEATURES = [
  'Scan your fridge, freezer and pantry with your camera',
  'Expiry reminders before food goes off',
  'Meal ideas that use up what needs eating first',
  'Track how much food you rescue from the bin',
];

export default function Paywall() {
  const { c } = useTheme();
  const { entitlement, priceString, busy, error } = useBilling();
  const provider = getProvider();
  const returning = entitlement.status === 'expired';
  const store = Platform.OS === 'android' ? 'Google Play account' : Platform.OS === 'ios' ? 'Apple ID account' : 'app store account';
  const chargeDate = `${formatShortDate(addDays(todayISO(), TRIAL_DAYS))} (in ${TRIAL_SPAN})`;
  const cancelWhere = Platform.OS === 'android' ? 'Google Play' : Platform.OS === 'ios' ? 'your Apple ID settings' : 'your app store account settings';

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footerInner}>
          <Button
            testID="paywall-cta"
            label={returning ? `Subscribe for ${priceString}/month` : `Start ${TRIAL_NAME} free trial`}
            loading={busy}
            onPress={() => void useBilling.getState().purchase()}
            style={{ alignSelf: 'stretch' }}
          />
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {returning ? `${priceString} per month. Cancel anytime.` : `Free for ${TRIAL_SPAN}, then ${priceString} per month. Cancel anytime.`}
          </Text>
        </View>
      }
    >
      <View style={styles.header}>
        <Logo size={64} beat="calm" />
        <Text variant="title" style={{ textAlign: 'center' }}>
          {returning
            ? entitlement.lapsed === 'paid'
              ? 'Your subscription has ended'
              : 'Your free trial has ended'
            : `Try Fridge Pulse free for ${TRIAL_SPAN.replace(' ', '\u00A0')}`}
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          {returning
            ? 'Subscribe to keep scanning, tracking and cooking with what you have.'
            : 'Waste less food and save money. Everything is included.'}
        </Text>
      </View>

      <Card style={{ gap: 14 }}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Ionicons name="checkmark-circle" size={22} color={c.primary} />
            <Text style={{ flex: 1 }}>{f}</Text>
          </View>
        ))}
      </Card>

      {!returning ? (
        <Card style={{ gap: 12 }}>
          <View style={styles.step}>
            <View style={[styles.stepDot, { backgroundColor: c.primary }]} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Today</Text>
              <Text variant="caption" muted>
                Start your free trial with full access.
              </Text>
            </View>
          </View>
          <View style={styles.step}>
            <View style={[styles.stepDot, { backgroundColor: c.inkFaint }]} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{chargeDate}</Text>
              <Text variant="caption" muted>
                {priceString}/month begins. Cancel before then and you will not be charged. If notifications are on, we will remind you 2 days before.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {error ? (
        <Text testID="paywall-error" variant="caption" color={c.danger} style={{ textAlign: 'center' }}>
          {error}
        </Text>
      ) : null}
      {provider.kind === 'unconfigured' ? (
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          Purchases are not set up in this build.
        </Text>
      ) : null}
      {provider.kind === 'local' && !SCREENSHOT_MODE ? (
        <Text variant="caption" faint style={{ textAlign: 'center' }}>
          Demo billing: no real payment is taken.
        </Text>
      ) : null}

      <View style={styles.links}>
        <Pressable accessibilityRole="button" onPress={() => void useBilling.getState().restore()} style={styles.linkHit}>
          <Text variant="caption" color={c.primary} style={styles.link}>
            Restore purchases
          </Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/legal/terms')} style={styles.linkHit}>
          <Text variant="caption" color={c.primary} style={styles.link}>
            Terms
          </Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/legal/privacy')} style={styles.linkHit}>
          <Text variant="caption" color={c.primary} style={styles.link}>
            Privacy
          </Text>
        </Pressable>
      </View>

      <Text variant="caption" faint style={{ textAlign: 'center', fontSize: 11, lineHeight: 15 }}>
        {returning ? '' : `Your ${TRIAL_NAME} free trial starts when you confirm. `}
        Payment is charged to your {store} at confirmation of purchase. The subscription renews automatically at {priceString}/month
        unless it is cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in {cancelWhere}.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkHit: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 12, paddingTop: 8 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  footerInner: { width: '100%', maxWidth: 600, gap: 8, alignItems: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  link: { fontWeight: '600', fontSize: 14 },
});
