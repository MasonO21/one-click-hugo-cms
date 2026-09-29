import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Meal } from '../lib/types';
import { radius, useTheme } from '../theme';
import { Card } from './Card';
import { Text } from './Text';

export function MealCard({ meal, defaultOpen = false }: { meal: Meal; defaultOpen?: boolean }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        testID={`meal-${meal.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={styles.head}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="heading">{meal.title}</Text>
          {meal.summary ? (
            <Text muted variant="caption" style={{ fontSize: 14, lineHeight: 20 }}>
              {meal.summary}
            </Text>
          ) : null}
          <View style={styles.meta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={15} color={c.inkMuted} />
              <Text variant="caption" muted>
                {meal.minutes} min
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={15} color={c.inkMuted} />
              <Text variant="caption" muted>
                Serves {meal.servings}
              </Text>
            </View>
            {meal.source === 'local' ? (
              <Text variant="caption" faint>
                Quick idea
              </Text>
            ) : null}
          </View>
          {meal.uses.length > 0 ? (
            <View style={styles.uses}>
              {meal.uses.map((u) => (
                <View key={u} style={[styles.pill, { backgroundColor: c.primaryTint }]}>
                  <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                    {u}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.inkFaint} />
      </Pressable>

      {open ? (
        <View style={[styles.body, { borderTopColor: c.border }]}>
          {meal.extras.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Text variant="label" muted>
                You will also need
              </Text>
              <Text>{meal.extras.join(', ')}</Text>
            </View>
          ) : null}
          <View style={{ gap: 8 }}>
            <Text variant="label" muted>
              Method
            </Text>
            {meal.steps.map((step, i) => (
              <View key={i} style={styles.step}>
                <View style={[styles.num, { backgroundColor: c.surfaceAlt }]}>
                  <Text variant="caption" style={{ fontWeight: '700' }}>
                    {i + 1}
                  </Text>
                </View>
                <Text style={{ flex: 1 }}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: 12, padding: 16, alignItems: 'flex-start' },
  meta: { flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  uses: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  body: { padding: 16, gap: 16, borderTopWidth: 1 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
