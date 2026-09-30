import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Card } from '../components/Card';
import { emojiFor } from '../components/categories';
import { EmptyState } from '../components/EmptyState';
import { FoodPicture } from '../components/FoodPicture';
import { FadeIn, stagger } from '../components/motion';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { formatShortDate } from '../lib/dates';
import { confirm } from '../lib/dialogs';
import { displayName, shelfLifeSummary } from '../lib/identify';
import { goBack } from '../lib/nav';
import type { LearnedFood } from '../lib/types';
import { useFoods } from '../store/foods';
import { radius, useTheme } from '../theme';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function FoodRow({ food, index }: { food: LearnedFood; index: number }) {
  const { c } = useTheme();
  const title = displayName(food);

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${food.name}?`,
      message: 'Fridge Pulse will go back to its general estimate for it. Items you are tracking keep their dates.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (ok) useFoods.getState().remove(food.id);
  };

  return (
    <FadeIn delay={stagger(index, 35)}>
      <Card style={styles.row} testID={`food-${food.name}`}>
        <FoodPicture
          uri={food.imageUrl}
          emoji={emojiFor(food.name, food.category)}
          emojiSize={30}
          resizeMode="contain"
          accessibilityLabel={food.imageUrl ? `Picture of ${title}` : undefined}
          style={[styles.picture, { backgroundColor: food.imageUrl ? '#FFFFFF' : c.surfaceAlt, borderColor: c.border }]}
        />
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {title}
          </Text>
          <Text variant="caption" muted style={{ fontSize: 13, lineHeight: 18 }}>
            {shelfLifeSummary(food.shelfLife)}
          </Text>
          <View style={styles.meta}>
            <Text variant="caption" faint style={{ fontSize: 12 }}>
              Added {formatShortDate(food.addedOn)}
            </Text>
            {food.sourceUrl ? (
              <Pressable accessibilityRole="link" accessibilityLabel={`Open source for ${food.name}`} onPress={() => void Linking.openURL(food.sourceUrl!)} hitSlop={8}>
                <Text variant="caption" color={c.primary} style={{ fontSize: 12, fontWeight: '600' }}>
                  {hostOf(food.sourceUrl)}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${food.name}`} onPress={() => void remove()} style={styles.iconHit}>
          <Ionicons name="trash-outline" size={20} color={c.inkFaint} />
        </Pressable>
      </Card>
    </FadeIn>
  );
}

/** The foods the person has taught Fridge Pulse by confirming an online lookup. */
export default function Foods() {
  const { c } = useTheme();
  const foods = useFoods((s) => s.foods);

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            Your foods
          </Text>
          <Text muted>
            {foods.length === 0 ? 'Nothing added yet' : `${foods.length} ${foods.length === 1 ? 'food' : 'foods'} Fridge Pulse has learned from you`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" testID="foods-close" onPress={goBack} style={styles.closeHit}>
          <View style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={20} color={c.ink} />
          </View>
        </Pressable>
      </View>

      <Text variant="caption" muted style={{ fontSize: 14, lineHeight: 20 }}>
        When a scan finds something Fridge Pulse does not know, it looks it up online and shows you a picture. Once you confirm it, it
        is saved here and recognised next time, with its own shelf life. This list stays on your phone.
      </Text>

      {foods.length === 0 ? (
        <FadeIn>
          <EmptyState emoji="🔎" title="No foods yet" message="Scan your fridge or pantry. Anything unfamiliar is looked up and added here once you confirm it." />
        </FadeIn>
      ) : (
        <View style={{ gap: 10 }}>
          {foods.map((f, i) => (
            <FoodRow key={f.id} food={f} index={i} />
          ))}
        </View>
      )}

      {foods.length > 0 ? (
        <Card style={{ backgroundColor: c.surfaceAlt, borderColor: c.surfaceAlt }}>
          <Text variant="caption" muted style={{ fontSize: 13, lineHeight: 18 }}>
            Shelf lives here come from web sources found during the lookup. Like every date in Fridge Pulse they are estimates: check the
            packaging and trust your senses.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -4, marginTop: -4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 4 },
  picture: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2 },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
