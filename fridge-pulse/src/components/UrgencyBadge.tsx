import { StyleSheet, View } from 'react-native';
import { expiryLabel, urgencyOf } from '../lib/expiry';
import { radius, useTheme } from '../theme';
import { Text } from './Text';

export function UrgencyBadge({ days }: { days: number }) {
  const { c } = useTheme();
  const u = c.urgency[urgencyOf(days)];
  return (
    <View style={[styles.badge, { backgroundColor: u.tint }]}>
      <View style={[styles.dot, { backgroundColor: u.solid }]} />
      <Text variant="caption" color={u.fg} style={{ fontWeight: '700' }}>
        {expiryLabel(days)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
