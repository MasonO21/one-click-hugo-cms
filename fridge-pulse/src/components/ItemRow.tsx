import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { daysLeft } from '../lib/expiry';
import type { PantryItem } from '../lib/types';
import { radius, useTheme } from '../theme';
import { emojiFor, LOCATION_LABEL } from './categories';
import { Emoji, Text } from './Text';
import { UrgencyBadge } from './UrgencyBadge';

interface Props {
  item: PantryItem;
  onPress: () => void;
  /** Quick "I used this" action. */
  onUsed?: () => void;
  now?: Date;
}

export function ItemRow({ item, onPress, onUsed, now }: Props) {
  const { c } = useTheme();
  const days = daysLeft(item, now);
  return (
    <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Pressable
        testID={`item-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.quantity}, ${LOCATION_LABEL[item.location]}`}
        onPress={onPress}
        style={styles.main}
      >
        <View style={[styles.icon, { backgroundColor: c.surfaceAlt }]}>
          <Emoji size={22}>{emojiFor(item.name, item.category)}</Emoji>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.name}
          </Text>
          <View style={styles.meta}>
            <UrgencyBadge days={days} />
            <Text variant="caption" muted numberOfLines={1} style={{ flexShrink: 1 }}>
              {item.quantity} · {LOCATION_LABEL[item.location]}
            </Text>
          </View>
        </View>
      </Pressable>
      {onUsed ? (
        <Pressable
          testID={`used-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Mark ${item.name} as used`}
          hitSlop={8}
          onPress={onUsed}
          style={[styles.used, { backgroundColor: c.primaryTint }]}
        >
          <Ionicons name="checkmark" size={20} color={c.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingRight: 12 },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  used: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
