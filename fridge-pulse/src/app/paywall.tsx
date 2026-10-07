import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { getProvider, planPriceLabel, useBilling } from '../store/billing';
import { DEFAULT_PLAN, HOUSEHOLD_MAX_PEOPLE, PLANS, TRIAL_DAYS, TRIAL_NAME, TRIAL_SPAN, type PlanId } from '../billing/trial';
import { ErrorText } from '../components/ErrorText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Logo } from '../components/Logo';
import { PlanPicker } from '../components/PlanPicker';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { isDemoMode } from '../lib/api';
import { confirm } from '../lib/dialogs';
import { SCREENSHOT_MODE } from '../lib/config';
import { addDays, formatShortDate, todayISO } from '../lib/dates';
import { useHousehold } from '../store/household';
import { useTheme } from '../theme';

const FEATURES = [
  'Scan your fridge, freezer and pantry with your camera',
  'Expiry reminders before food goes off',
  'Meal ideas that use up what needs eating first',
  'Protein goals, a food log that fills itself and a weekly score',
  'Share the fridge and shopping list with your household',
];

/** For someone whose household already has the household plan: join with the invite code instead of paying. */
function JoinHousehold() {
  const { c } = useTheme();
  const memberName = useHousehold((s) => s.memberName);
  const error = useHousehold((s) => s.error);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(memberName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    await useHousehold.getState().join(code.trim(), name.trim());
    setBusy(false);
  };

  if (!open) {
    return (
      <Pressable testID="paywall-join-open" accessibilityRole="button" onPress={() => setOpen(true)} style={styles.linkHit}>
        <Text variant="caption" color={c.primary} style={[styles.link, { textAlign: 'center' }]}>
          Someone at home has the household plan? Join with their code
        </Text>
      </Pressable>
    );
  }
  return (
    <Card style={{ gap: 10 }} testID="paywall-join">
      <Text variant="heading">Join your household</Text>
      <Text variant="caption" muted>
        {`If someone you live with has the household plan, it covers you too. Ask them for the invite code in Settings > Household.`}
      </Text>
      <Field testID="paywall-join-name" value={name} onChangeText={setName} placeholder="Your name" maxLength={40} accessibilityLabel="Your name" />
      <Field
        testID="paywall-join-code"
        value={code}
        onChangeText={setCode}
        placeholder="ABCD-EF23"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
        accessibilityLabel="Invite code"
      />
      <Button
        testID="paywall-join-button"
        label="Join household"
        variant="secondary"
        icon="people"
        disabled={!name.trim() || (!isDemoMode && code.replace(/[^a-z0-9]/gi, '').length < 8) || busy}
        loading={busy}
        onPress={() => void join()}
      />
      {error ? (
        <ErrorText style={{ fontSize: 14 }}>{error}</ErrorText>
      ) : null}
      <Text variant="caption" faint>
        {isDemoMode
          ? 'Preview: any code joins a sample household whose housemate has the household plan.'
          : 'Sharing stores your household’s food and shopping lists on the Fridge Pulse server so the others can see them.'}
      </Text>
    </Card>
  );
}

/** In a household that no household plan covers right now. */
function HouseholdNotCovered({ name }: { name: string }) {
  const [checking, setChecking] = useState(false);
  const check = async () => {
    setChecking(true);
    await useHousehold.getState().refresh();
    setChecking(false);
  };
  // Joined the wrong one, or moved out: leaving needs no plan.
  const leave = async () => {
    const ok = await confirm({
      title: 'Leave the household?',
      message: 'This phone keeps its copy of the lists, but stops sharing. The others keep theirs.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) await useHousehold.getState().leave();
  };
  return (
    <Card style={{ gap: 8 }} testID="paywall-household">
      <Text variant="bodyStrong">{`You are in ${name}`}</Text>
      <Text variant="caption" muted>
        Nobody there has the household plan right now. Start your own plan below, or ask whoever pays to switch to the household plan, which covers
        everyone.
      </Text>
      <View style={styles.row}>
        <Button label="Check again" size="sm" variant="ghost" icon="refresh" loading={checking} onPress={() => void check()} />
        <Button testID="paywall-household-leave" label="Leave household" size="sm" variant="danger" onPress={() => void leave()} />
      </View>
    </Card>
  );
}

/** Taps this soon after the paywall appears belong to the screen before it. */
const GHOST_TAP_MS = 700;

export default function Paywall() {
  const { c } = useTheme();
  const { entitlement, prices, busy, error } = useBilling();
  const household = useHousehold((s) => s.household);
  const [plan, setPlan] = useState<PlanId>(entitlement.planId ?? DEFAULT_PLAN);
  const priceString = planPriceLabel(prices, plan);
  const provider = getProvider();
  const returning = entitlement.status === 'expired';
  const shownAt = useRef(Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  // Someone in the household may have started a household plan since the last look.
  const inHousehold = household !== null;
  useEffect(() => {
    if (inHousehold) void useHousehold.getState().refresh();
  }, [inHousehold]);
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
            label={returning ? `Subscribe for ${priceString}` : `Start ${TRIAL_NAME} free trial`}
            loading={busy}
            onPress={() => {
              // A double tap on "Get started" lands its second tap here as the screen appears; it must not
              // start a trial (or open the store's purchase sheet) the person never saw.
              if (Date.now() - shownAt.current < GHOST_TAP_MS) return;
              void useBilling.getState().purchase(plan);
            }}
            style={{ alignSelf: 'stretch' }}
          />
          <Text variant="caption" muted style={{ textAlign: 'center' }}>
            {returning ? `${priceString}. Cancel anytime.` : `Free for ${TRIAL_SPAN}, then ${priceString}. Cancel anytime.`}
          </Text>
        </View>
      }
    >
      <View style={styles.header}>
        <Logo size={64} beat="calm" />
        <Text variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
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

      {household ? <HouseholdNotCovered name={household.name} /> : null}

      <Card glow="blue" style={{ gap: 14 }}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.feature}>
            <Ionicons name="checkmark-circle" size={22} color={c.primary} />
            <Text style={{ flex: 1 }}>{f}</Text>
          </View>
        ))}
      </Card>

      <PlanPicker selected={plan} onSelect={setPlan} prices={prices} />

      {!returning ? (
        <Card style={{ gap: 12 }}>
          <View style={styles.step}>
            <View style={[styles.stepDot, { backgroundColor: c.primaryFill }]} />
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
                {priceString} begins. Cancel before then and you will not be charged. If notifications are on, we will remind you 2 days before.
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {household ? null : <JoinHousehold />}

      {error ? (
        <ErrorText testID="paywall-error" style={{ textAlign: 'center' }}>
          {error}
        </ErrorText>
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
        Payment is charged to your {store} at confirmation of purchase. The subscription renews automatically at {priceString}
        unless it is cancelled at least 24 hours before the end of the current period. Manage or cancel anytime in {cancelWhere}.
        {PLANS[plan].household ? ` The household plan also covers up to ${HOUSEHOLD_MAX_PEOPLE} people in your shared household on Fridge Pulse.` : ''}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  linkHit: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  header: { alignItems: 'center', gap: 12, paddingTop: 8 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  footerInner: { width: '100%', maxWidth: 600, gap: 8, alignItems: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  link: { fontWeight: '600', fontSize: 14 },
});
