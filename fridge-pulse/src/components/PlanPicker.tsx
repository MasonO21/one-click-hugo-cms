import { Pressable, StyleSheet, View } from 'react-native';
import { HOUSEHOLD_MAX_PEOPLE, PLANS, planFor, priceLabel, yearlySaving, type Period, type PlanId } from '../billing/trial';
import { radius, useTheme } from '../theme';
import { Chip } from './Chip';
import { Text } from './Text';

interface Props {
  selected: PlanId;
  onSelect: (plan: PlanId) => void;
  /** Each plan's price as the store shows it. */
  prices: Record<PlanId, string>;
  /** The plan the person is on now, marked as theirs. */
  current?: PlanId;
}

const PERIODS: Period[] = ['year', 'month'];

/** Just me or the household, then yearly or monthly. Prices come from the store. */
export function PlanPicker({ selected, onSelect, prices, current }: Props) {
  const { c } = useTheme();
  const household = PLANS[selected].household;
  const pick = (h: boolean, period: Period) => onSelect(planFor(h, period).id);

  return (
    <View style={{ gap: 10 }} testID="plan-picker">
      <View style={styles.chips}>
        <Chip testID="plan-just-me" label="Just me" selected={!household} onPress={() => pick(false, PLANS[selected].period)} />
        <Chip testID="plan-household" label={`Household · up to ${HOUSEHOLD_MAX_PEOPLE}`} selected={household} onPress={() => pick(true, PLANS[selected].period)} />
      </View>
      {PERIODS.map((period) => {
        const plan = planFor(household, period);
        const on = plan.id === selected;
        const saving = period === 'year' ? yearlySaving(prices[planFor(household, 'month').id], prices[plan.id]) : null;
        return (
          <Pressable
            key={plan.id}
            testID={`plan-${plan.id}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${period === 'year' ? 'Yearly' : 'Monthly'}, ${priceLabel(prices[plan.id], period)}${saving ? `, save ${saving} percent` : ''}${current === plan.id ? ', your plan' : ''}`}
            onPress={() => onSelect(plan.id)}
            style={[styles.option, { borderColor: on ? c.primaryFill : c.border, backgroundColor: on ? c.primaryTint : c.surface }]}
          >
            <View style={[styles.radio, { borderColor: on ? c.primaryFill : c.inkFaint }]}>{on ? <View style={[styles.dot, { backgroundColor: c.primaryFill }]} /> : null}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.titleRow}>
                <Text variant="bodyStrong">{period === 'year' ? 'Yearly' : 'Monthly'}</Text>
                {saving ? (
                  <View style={[styles.badge, { backgroundColor: c.success }]}>
                    <Text variant="caption" color={c.onSuccess} style={styles.badgeText}>
                      {`Save ${saving}%`}
                    </Text>
                  </View>
                ) : null}
                {current === plan.id ? (
                  <Text variant="caption" color={c.primary} style={styles.badgeText}>
                    Your plan
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" muted>
                {household ? `Covers everyone in your shared household, billed ${period === 'year' ? 'yearly' : 'monthly'}` : period === 'year' ? 'One payment a year' : 'Billed every month'}
              </Text>
            </View>
            <Text variant="bodyStrong" testID={`plan-price-${plan.id}`}>
              {priceLabel(prices[plan.id], period)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontWeight: '700', fontSize: 12 },
});
