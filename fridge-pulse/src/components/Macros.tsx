import { useEffect } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { energySplit, formatGrams, type MacroValues } from '../lib/nutrition';
import { radius, useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Text } from './Text';

/**
 * Calories and the three macros as four tiles, over a bar that shows where the energy comes from.
 * The bar grows in from the left.
 */
export function MacroTiles({ macros, testID }: { macros: MacroValues; testID?: string }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const grow = useAnimatedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) {
      grow.setValue(1);
      return;
    }
    const a = Animated.timing(grow, { toValue: 1, duration: 600, delay: 100, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
  }, [grow, still]);

  const colors = { protein: c.blue, carbs: c.urgency.soon.solid, fat: c.primary };
  const tiles = [
    { key: 'kcal', label: 'Calories', value: `${Math.round(macros.kcal)}`, spoken: `${Math.round(macros.kcal)} kilocalories`, dot: null },
    { key: 'protein', label: 'Protein', value: formatGrams(macros.protein), spoken: formatGrams(macros.protein).replace(/ g$/, ' grams'), dot: colors.protein },
    { key: 'carbs', label: 'Carbs', value: formatGrams(macros.carbs), spoken: formatGrams(macros.carbs).replace(/ g$/, ' grams'), dot: colors.carbs },
    { key: 'fat', label: 'Fat', value: formatGrams(macros.fat), spoken: formatGrams(macros.fat).replace(/ g$/, ' grams'), dot: colors.fat },
  ];
  const split = energySplit(macros);
  const hasEnergy = split.some((x) => x > 0);

  return (
    <View style={{ gap: 10 }} testID={testID}>
      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View
            key={t.key}
            style={[styles.tile, { backgroundColor: c.surfaceAlt }]}
            accessible
            accessibilityLabel={`${t.label}: ${t.spoken}`}
          >
            <Text variant="heading" style={styles.value} numberOfLines={1}>
              {t.value}
            </Text>
            <View style={styles.labelRow}>
              {t.dot ? <View style={[styles.dot, { backgroundColor: t.dot }]} /> : null}
              <Text variant="caption" muted>
                {t.label}
              </Text>
            </View>
          </View>
        ))}
      </View>
      {hasEnergy ? (
        <View
          style={[styles.bar, { backgroundColor: c.surfaceAlt }]}
          accessible
          accessibilityLabel={`Energy from protein ${split[0]}%, carbs ${split[1]}%, fat ${split[2]}%`}
        >
          <Animated.View style={[styles.fill, { transform: [{ scaleX: grow }] }]}>
            {split[0] > 0 ? <View style={{ flex: split[0], backgroundColor: colors.protein }} /> : null}
            {split[1] > 0 ? <View style={{ flex: split[1], backgroundColor: colors.carbs }} /> : null}
            {split[2] > 0 ? <View style={{ flex: split[2], backgroundColor: colors.fat }} /> : null}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minWidth: 0, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 8, gap: 2, alignItems: 'center' },
  value: { fontSize: 17, lineHeight: 22, textAlign: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { flex: 1, flexDirection: 'row', gap: 2, transformOrigin: 'left' },
});
