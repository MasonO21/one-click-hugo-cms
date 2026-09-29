import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { emojiFor, LOCATIONS, LOCATION_LABEL } from '../../components/categories';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { Emoji, Text } from '../../components/Text';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { addDays, formatShortDate, todayISO, daysBetween } from '../../lib/dates';
import { confirm } from '../../lib/dialogs';
import { daysLeft } from '../../lib/expiry';
import { estimateShelfLifeDays } from '../../lib/shelfLife';
import type { StorageLocation } from '../../lib/types';
import { useInventory } from '../../store/inventory';
import { useTheme } from '../../theme';

export default function ItemDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useInventory((s) => s.items.find((i) => i.id === id));
  const update = useInventory((s) => s.updateItem);

  // Leave exactly once, whether we removed the item ourselves or it vanished (data cleared elsewhere).
  const leaving = useRef(false);
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (router.canGoBack()) router.back();
  };
  useEffect(() => {
    if (!item) leave();
  }, [item]);

  if (!item) return <Screen><View /></Screen>;

  const days = daysLeft(item);
  const shift = (delta: number) => {
    const next = addDays(item.expiresOn, delta);
    if (daysBetween(todayISO(), next) > 1825) return;
    update(item.id, { expiresOn: next, expirySource: 'manual' });
  };
  const moveTo = async (location: StorageLocation) => {
    if (location === item.location) return;
    // Moving between fridge, freezer and pantry changes how long food keeps, so offer to re-estimate.
    const estimate = addDays(todayISO(), estimateShelfLifeDays(item.name, item.category, location));
    const updateDate = await confirm({
      title: `Move to ${LOCATION_LABEL[location].toLowerCase()}`,
      message: `Food typically keeps until about ${formatShortDate(estimate)} there. Update the expiry date to match?`,
      confirmLabel: 'Update date',
      cancelLabel: 'Keep date',
    });
    update(
      item.id,
      updateDate ? { location, expiresOn: estimate, expirySource: 'estimate' } : { location },
    );
  };
  const finish = (status: 'used' | 'wasted') => {
    useInventory.getState().resolveItem(item.id, status);
    leave();
  };
  const confirmDelete = async () => {
    const ok = await confirm({
      title: 'Delete item?',
      message: `Remove ${item.name} without counting it as used or thrown out.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    useInventory.getState().removeItem(item.id);
    leave();
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button testID="mark-used" label="I used it" icon="checkmark" onPress={() => finish('used')} style={{ alignSelf: 'stretch' }} />
          <View style={styles.footerRow}>
            <Button label="Threw it out" variant="secondary" size="sm" onPress={() => finish('wasted')} />
            <Button label="Delete" variant="danger" size="sm" onPress={() => void confirmDelete()} />
          </View>
        </View>
      }
    >
      <View style={styles.top}>
        <Emoji size={44}>{emojiFor(item.name, item.category)}</Emoji>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={leave} hitSlop={10} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={c.ink} />
        </Pressable>
      </View>

      <Field value={item.name} onChangeText={(name) => update(item.id, { name })} accessibilityLabel="Item name" style={styles.name} maxLength={80} />

      <Card style={{ gap: 14 }}>
        <View style={styles.between}>
          <View style={{ gap: 6 }}>
            <Text variant="label" muted>
              Expires
            </Text>
            <Text variant="heading">{formatShortDate(item.expiresOn)}</Text>
            <UrgencyBadge days={days} />
          </View>
          <View style={{ gap: 8, alignItems: 'flex-end' }}>
            <Stepper label="1 day" onDecrement={() => shift(-1)} onIncrement={() => shift(1)} />
            <View style={styles.footerRow}>
              <Button label="-1 week" variant="secondary" size="sm" onPress={() => shift(-7)} />
              <Button label="+1 week" variant="secondary" size="sm" onPress={() => shift(7)} />
            </View>
          </View>
        </View>
        <Text variant="caption" muted>
          {item.expirySource === 'label' ? 'Date read from the label.' : item.expirySource === 'estimate' ? 'Estimated from typical shelf life.' : 'Set by you.'}
        </Text>
      </Card>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Quantity
        </Text>
        <Field value={item.quantity} onChangeText={(quantity) => update(item.id, { quantity })} accessibilityLabel="Quantity" maxLength={30} />
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Stored in
        </Text>
        <View style={styles.footerRow}>
          {LOCATIONS.map((l) => (
            <Chip key={l} label={LOCATION_LABEL[l]} selected={item.location === l} onPress={() => void moveTo(l)} />
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '700', minHeight: 56 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  footer: { width: '100%', maxWidth: 600, gap: 8, alignItems: 'center' },
  footerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
