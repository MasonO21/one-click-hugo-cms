import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../../components/Button';
import { emojiFor, LOCATIONS, LOCATION_LABEL } from '../../components/categories';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { FadeIn } from '../../components/motion';
import { Screen } from '../../components/Screen';
import { Stepper } from '../../components/Stepper';
import { Emoji, Text } from '../../components/Text';
import { UrgencyBadge } from '../../components/UrgencyBadge';
import { useToday } from '../../hooks/useToday';
import { addDays, daysBetween, formatShortDate } from '../../lib/dates';
import { confirm } from '../../lib/dialogs';
import { daysLeft } from '../../lib/expiry';
import { goBack } from '../../lib/nav';
import { estimateShelfLifeDays, freezeRescueDays, freezesWell } from '../../lib/shelfLife';
import { keepsLabel } from '../../lib/suggest';
import { storageTips } from '../../lib/tips';
import type { PantryItem, StorageLocation } from '../../lib/types';
import { resolveItems } from '../../store/actions';
import { useBurst } from '../../store/burst';
import { useInventory } from '../../store/inventory';
import { useShopping } from '../../store/shopping';
import { useSnackbar } from '../../store/snackbar';
import { radius, useTheme } from '../../theme';

/**
 * A text field that edits a local copy and saves when you leave it, so clearing a name to retype it
 * never saves a blank item. Empty names go back to what they were; an empty quantity becomes "1".
 */
function CommitField({ value, onCommit, fallback, ...rest }: { value: string; onCommit: (v: string) => void; fallback: string } & Omit<React.ComponentProps<typeof Field>, 'value' | 'onChangeText'>) {
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  // Follow outside changes (another screen renamed it) while not editing.
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }
  const latest = useRef({ draft, value, onCommit, fallback });
  useEffect(() => {
    latest.current = { draft, value, onCommit, fallback };
  });
  const commit = () => {
    const { draft: d, value: v, onCommit: save, fallback: fb } = latest.current;
    const clean = d.trim().replace(/\s+/g, ' ') || fb;
    if (clean !== v) save(clean);
    setDraft(clean);
  };
  // Leaving the screen with the keyboard still up also saves.
  useEffect(() => () => commit(), []);
  return <Field {...rest} value={draft} onChangeText={setDraft} onEndEditing={commit} onBlur={commit} />;
}

export default function ItemDetail() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useInventory((s) => s.items.find((i) => i.id === id));
  const update = useInventory((s) => s.updateItem);
  const today = useToday();
  const freezeButton = useRef<View>(null);

  // Leave exactly once, whether we removed the item ourselves or it vanished (data cleared elsewhere).
  const leaving = useRef(false);
  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    goBack();
  };
  useEffect(() => {
    if (!item || item.status !== 'active') leave();
  });

  if (!item || item.status !== 'active') return <Screen><View /></Screen>;

  const days = daysLeft(item, new Date(`${today}T12:00:00`));
  const rescueDays = freezeRescueDays(item, days);
  const tips = storageTips(item.name, item.category, item.location);
  const typical = addDays(item.addedOn, estimateShelfLifeDays(item.name, item.category, item.location));

  const shift = (delta: number) => {
    const next = addDays(item.expiresOn, delta);
    if (daysBetween(today, next) > 1825) return;
    update(item.id, { expiresOn: next, expirySource: 'manual' });
  };

  const moveTo = async (location: StorageLocation) => {
    if (location === item.location) return;
    // Moving between fridge, freezer and pantry changes how long food keeps, so offer to re-estimate.
    const estimate = addDays(today, estimateShelfLifeDays(item.name, item.category, location));
    const badFreeze = location === 'freezer' && !freezesWell(item.name, item.category);
    const updateDate = await confirm({
      title: `Move to ${LOCATION_LABEL[location].toLowerCase()}`,
      message: `${badFreeze ? `${item.name} does not freeze well: the texture suffers once thawed. ` : ''}It typically keeps until about ${formatShortDate(estimate)} there. Update the expiry date to match?`,
      confirmLabel: 'Update date',
      cancelLabel: 'Keep date',
    });
    update(item.id, updateDate ? { location, expiresOn: estimate, expirySource: 'estimate' } : { location });
  };

  const freeze = () => {
    if (!rescueDays) return;
    const before: Partial<PantryItem> = { location: item.location, expiresOn: item.expiresOn, expirySource: item.expirySource };
    const until = addDays(today, rescueDays);
    update(item.id, { location: 'freezer', expiresOn: until, expirySource: 'estimate' });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    freezeButton.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) useBurst.getState().emit(x + w / 2, y + h / 2);
    });
    useSnackbar.getState().show({
      message: `${item.name} is in the freezer. Good until ${formatShortDate(until)}.`,
      tone: 'freeze',
      action: { label: 'Undo', onPress: () => useInventory.getState().updateItem(item.id, before) },
    });
  };

  const addToList = () => {
    const added = useShopping.getState().add({ name: item.name, category: item.category });
    useSnackbar.getState().show({ message: added ? `${item.name} added to your shopping list` : `${item.name} is already on your list` });
  };

  const finish = (status: 'used' | 'wasted') => {
    resolveItems([item], status);
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

  const source =
    item.expirySource === 'label' ? 'Date read from the label' : item.expirySource === 'estimate' ? 'Estimated from typical shelf life' : 'Date set by you';

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button testID="mark-used" label="I used it" icon="checkmark" onPress={() => finish('used')} style={{ alignSelf: 'stretch' }} />
          <View style={styles.footerRow}>
            <Button testID="mark-wasted" label="Threw it out" variant="secondary" size="sm" onPress={() => finish('wasted')} />
            <Button label="Delete" variant="danger" size="sm" onPress={() => void confirmDelete()} />
          </View>
        </View>
      }
    >
      <View style={styles.top}>
        <FadeIn distance={14}>
          <View style={[styles.hero, { backgroundColor: c.surfaceAlt }]}>
            <Emoji size={40}>{emojiFor(item.name, item.category)}</Emoji>
          </View>
        </FadeIn>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={leave} style={styles.closeHit}>
          <View style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={20} color={c.ink} />
          </View>
        </Pressable>
      </View>

      <CommitField value={item.name} fallback={item.name} onCommit={(name) => update(item.id, { name })} accessibilityLabel="Item name" style={styles.name} maxLength={80} testID="item-name" />

      <Card style={{ gap: 12 }}>
        <View style={styles.between}>
          <View style={{ gap: 6, flexShrink: 1 }}>
            <Text variant="label" muted>
              Expires
            </Text>
            <UrgencyBadge days={days} />
          </View>
          <Stepper label={formatShortDate(item.expiresOn)} onDecrement={() => shift(-1)} onIncrement={() => shift(1)} decrementLabel="One day earlier" incrementLabel="One day later" />
        </View>
        <View style={styles.footerRow}>
          <Button label="-1 week" variant="secondary" size="sm" onPress={() => shift(-7)} />
          <Button label="+1 week" variant="secondary" size="sm" onPress={() => shift(7)} />
          {item.expirySource === 'manual' && typical !== item.expiresOn ? (
            <Button label="Use typical date" variant="ghost" size="sm" onPress={() => update(item.id, { expiresOn: typical, expirySource: 'estimate' })} />
          ) : null}
        </View>
        <Text variant="caption" muted>
          {source} · added {formatShortDate(item.addedOn)}
        </Text>
      </Card>

      {rescueDays ? (
        <FadeIn delay={120}>
          <Card style={{ gap: 10, backgroundColor: c.urgency.week.tint, borderColor: c.urgency.week.tint }} testID="freeze-rescue">
            <View style={styles.rescueHead}>
              <Emoji size={24}>❄️</Emoji>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                Won&apos;t get to it in time?
              </Text>
            </View>
            <Text color={c.urgency.week.fg} variant="caption" style={{ fontSize: 14, lineHeight: 20 }}>
              Freeze it today and it keeps for {keepsLabel(rescueDays).replace('Keeps ', '')} instead of going to waste.
            </Text>
            <View ref={freezeButton} collapsable={false}>
              <Button testID="freeze-it" label="Move to freezer" icon="snow" onPress={freeze} />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {tips.length > 0 ? (
        <FadeIn delay={160}>
          <Card style={{ gap: 8 }} testID="tips">
            <View style={styles.rescueHead}>
              <Ionicons name="bulb-outline" size={18} color={c.primary} />
              <Text variant="label" color={c.primary}>
                Keep it fresh
              </Text>
            </View>
            {tips.map((t) => (
              <Text key={t} style={{ fontSize: 15, lineHeight: 21 }}>
                {t}
              </Text>
            ))}
          </Card>
        </FadeIn>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Quantity
        </Text>
        <CommitField value={item.quantity} fallback="1" onCommit={(quantity) => update(item.id, { quantity })} accessibilityLabel="Quantity" maxLength={30} />
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

      <Button testID="add-to-list" label="Add to shopping list" icon="cart-outline" variant="secondary" onPress={addToList} style={{ alignSelf: 'flex-start' }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '700', minHeight: 56 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  rescueHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { width: '100%', maxWidth: 600, gap: 8, alignItems: 'center' },
  footerRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
});
