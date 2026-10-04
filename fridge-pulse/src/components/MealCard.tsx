import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';
import { uniqueUses } from '../lib/meals';
import { HIGH_PROTEIN_G, nutritionNote } from '../lib/nutrition';
import type { Meal } from '../lib/types';
import { radius, useTheme } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { MacroTiles } from './Macros';
import { FadeIn, NATIVE_DRIVER, prefersReducedMotion, useAnimatedValue } from './motion';
import { Text } from './Text';

interface Props {
  meal: Meal;
  defaultOpen?: boolean;
  /** "I made this": marks the tracked ingredients used. Gets the button's centre for a celebration. */
  onCooked?: (at?: { x: number; y: number }) => void;
  /** Protein still to eat today, when the person has a goal: the card says how much of it a serving covers. */
  proteinToGo?: number;
}

export function MealCard({ meal, defaultOpen = false, onCooked, proteinToGo }: Props) {
  const { c } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const turn = useAnimatedValue(defaultOpen ? 1 : 0);
  const cookButton = useRef<View>(null);
  const uses = uniqueUses(meal.uses);

  useEffect(() => {
    const a = Animated.timing(turn, { toValue: open ? 1 : 0, duration: prefersReducedMotion() ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [open, turn]);

  const toggle = () => {
    if (Platform.OS !== 'web' && !prefersReducedMotion()) LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
    setOpen((o) => !o);
  };

  return (
    <Card glow={open ? 'blue' : undefined} style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable
        testID={`meal-${meal.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        style={({ pressed }) => [styles.head, pressed && { backgroundColor: c.surfaceAlt }]}
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
            {meal.nutrition ? (
              <View style={styles.metaItem} testID={`kcal-${meal.id}`}>
                <Ionicons name="flame-outline" size={15} color={c.inkMuted} />
                <Text variant="caption" muted>
                  {meal.nutrition.kcal} kcal · {meal.nutrition.protein} g protein
                </Text>
              </View>
            ) : null}
            {meal.nutrition && meal.nutrition.protein >= HIGH_PROTEIN_G ? (
              <View style={[styles.tag, { backgroundColor: c.urgency.week.tint }]} testID={`high-protein-${meal.id}`}>
                <Text variant="caption" color={c.urgency.week.fg} style={{ fontWeight: '700' }}>
                  High protein
                </Text>
              </View>
            ) : null}
            {meal.source === 'local' ? (
              <Text variant="caption" faint>
                Quick idea
              </Text>
            ) : null}
          </View>
          {uses.length > 0 ? (
            <View style={styles.uses}>
              {uses.map((u, i) => (
                <View key={`${i}-${u}`} style={[styles.pill, { backgroundColor: c.primaryTint }]}>
                  <Text variant="caption" color={c.primary} style={{ fontWeight: '700' }}>
                    {u}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
          <Ionicons name="chevron-down" size={20} color={c.inkFaint} />
        </Animated.View>
      </Pressable>

      {open ? (
        <FadeIn distance={6} style={[styles.body, { borderTopColor: c.border }]}>
          {meal.nutrition ? (
            <View style={{ gap: 8 }} testID={`nutrition-${meal.id}`}>
              <Text variant="label" muted>
                Per serving
              </Text>
              <MacroTiles macros={meal.nutrition} />
              {proteinToGo !== undefined && proteinToGo > 0 ? (
                <Text variant="caption" color={c.blue} style={{ fontSize: 14 }}>
                  {`One serving covers ${Math.min(100, Math.round((meal.nutrition.protein / proteinToGo) * 100))}% of the ${Math.round(proteinToGo)} g protein you have left today.`}
                </Text>
              ) : null}
              <Text variant="caption" faint>
                {nutritionNote(meal)}
              </Text>
            </View>
          ) : null}
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
          {onCooked && uses.length > 0 ? (
            <View ref={cookButton} collapsable={false}>
              <Button
                testID={`cooked-${meal.id}`}
                label="I made this"
                icon="restaurant"
                variant="primary"
                size="sm"
                onPress={() => {
                  // measureInWindow answers through its callback (and returns nothing), so call once there.
                  const view = cookButton.current;
                  if (view) view.measureInWindow((x, y, w, h) => onCooked(w > 0 ? { x: x + w / 2, y: y + h / 2 } : undefined));
                  else onCooked();
                }}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          ) : null}
        </FadeIn>
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
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  body: { padding: 16, gap: 16, borderTopWidth: 1 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
