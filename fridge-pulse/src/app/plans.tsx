import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { DEFAULT_PLAN, HOUSEHOLD_MAX_PEOPLE, isUnlocked, PLANS, planName, TRIAL_NAME, TRIAL_SPAN, type PlanId } from '../billing/trial';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ModalTop } from '../components/ModalTop';
import { PlanPicker } from '../components/PlanPicker';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { MANAGE_SUBSCRIPTION_URL } from '../lib/config';
import { notify } from '../lib/dialogs';
import { getProvider, planPriceLabel, useBilling } from '../store/billing';
import { isCovered, sponsorName, useHousehold } from '../store/household';
import { useTheme } from '../theme';

/** Switching between yearly and monthly, or to the household plan, once the app is unlocked. */
export default function Plans() {
  const { c } = useTheme();
  const { entitlement, prices, busy, error } = useBilling();
  const household = useHousehold((s) => s.household);
  const subscribed = isUnlocked(entitlement);
  const current = subscribed ? entitlement.planId : undefined;
  const [plan, setPlan] = useState<PlanId>(current && !PLANS[current].household ? planFromCurrent(current) : (current ?? DEFAULT_PLAN));
  const sponsor = sponsorName(household);
  const firstTime = entitlement.status === 'none';
  // Starts a sentence in the small print.
  const store = Platform.OS === 'android' ? 'Google Play' : Platform.OS === 'ios' ? 'The App Store' : 'Your app store';

  const go = async () => {
    const ok = await useBilling.getState().purchase(plan);
    if (!ok) return;
    notify('Plan changed', PLANS[plan].household ? 'Your household plan now covers everyone in your shared household.' : `You are on the ${planName(plan).toLowerCase()} plan.`);
    router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalTop title="Plans" subtitle="Pay yearly for the best price, or cover your whole household with one plan." />

      {!subscribed && isCovered(household) ? (
        <Card style={{ gap: 6, backgroundColor: c.primaryTint, borderColor: c.primaryTint }} testID="plans-covered">
          <Text variant="bodyStrong">{`You are covered by ${sponsor ? `${sponsor}’s` : 'your household’s'} household plan`}</Text>
          <Text variant="caption" muted>
            You do not need a plan of your own while you are in this household. If you leave it, you can start one here.
          </Text>
        </Card>
      ) : null}

      <PlanPicker selected={plan} onSelect={setPlan} prices={prices} current={current} />

      <Card style={{ gap: 8 }}>
        <Text variant="bodyStrong">How the household plan works</Text>
        <Text variant="caption" muted>
          {`One person pays and everyone in their shared household gets Fridge Pulse, up to ${HOUSEHOLD_MAX_PEOPLE} people. Start a household in Settings > Household and share the invite code. Anyone who joins is covered for as long as the plan is active and they stay in the household.`}
        </Text>
      </Card>

      <View style={{ gap: 8 }}>
        <Button
          testID="plans-confirm"
          label={
            plan === current
              ? 'This is your plan'
              : subscribed
                ? `Switch to ${planName(plan).toLowerCase()}`
                : firstTime
                  ? `Start ${TRIAL_NAME} free trial`
                  : `Subscribe for ${planPriceLabel(prices, plan)}`
          }
          disabled={plan === current}
          loading={busy}
          onPress={() => void go()}
        />
        {error ? (
          <Text variant="caption" color={c.danger}>
            {error}
          </Text>
        ) : null}
        <Text variant="caption" faint style={{ fontSize: 12, lineHeight: 17 }}>
          {`${firstTime ? `Free for ${TRIAL_SPAN}, then ` : ''}${planPriceLabel(prices, plan)}, renewing automatically unless cancelled at least 24 hours before the end of the current period. ${
            subscribed ? `${store} decides when a change starts: a bigger plan usually starts straight away, with credit for the time left on this one, and a smaller one at your next renewal.` : ''
          }`}
        </Text>
        {Platform.OS !== 'web' && subscribed && getProvider().kind === 'revenuecat' ? (
          <Button label="Manage subscription" size="sm" variant="ghost" onPress={() => void Linking.openURL(MANAGE_SUBSCRIPTION_URL)} style={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </Screen>
  );
}

/** Someone on a plan just for themselves is most likely here for the household one with the same billing period. */
function planFromCurrent(current: PlanId): PlanId {
  return PLANS[current].period === 'year' ? 'household-annual' : 'household-monthly';
}
