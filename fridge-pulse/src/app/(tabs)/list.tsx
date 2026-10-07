import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Animated, Easing, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { AddItemField } from '../../components/AddItemField';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { emojiFor, LOCATION_LABEL } from '../../components/categories';
import { EmptyState } from '../../components/EmptyState';
import { Header } from '../../components/Header';
import { FadeIn, NATIVE_DRIVER, prefersReducedMotion, PressableScale, stagger, useAnimatedValue } from '../../components/motion';
import { Screen } from '../../components/Screen';
import { Emoji, Text } from '../../components/Text';
import { useToday } from '../../hooks/useToday';
import { addDays } from '../../lib/dates';
import { usualPlace } from '../../lib/shelfLife';
import { buyAgain, shoppingText } from '../../lib/shopping';
import type { ResolvedFood } from '../../lib/suggest';
import { useInventory } from '../../store/inventory';
import { useScanDraft } from '../../store/scanDraft';
import { useShopping, type ShoppingItem } from '../../store/shopping';
import { useSnackbar } from '../../store/snackbar';
import { radius, useTheme } from '../../theme';

const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');

function ShoppingRow({ item, index }: { item: ShoppingItem; index: number }) {
  const { c } = useTheme();
  const pop = useAnimatedValue(1);
  const where = item.keptIn ?? usualPlace(item.name, item.category);

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    if (!prefersReducedMotion()) {
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.3, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.spring(pop, { toValue: 1, bounciness: 14, useNativeDriver: NATIVE_DRIVER }),
      ]).start();
    }
    useShopping.getState().toggle(item.id);
  };

  return (
    <FadeIn delay={stagger(index, 30)}>
      <View style={[styles.row, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Pressable
          testID={`shop-${item.name}`}
          accessibilityRole="checkbox"
          aria-checked={item.checked}
          accessibilityLabel={item.name}
          onPress={toggle}
          style={styles.rowMain}
        >
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Ionicons name={item.checked ? 'checkmark-circle' : 'ellipse-outline'} size={28} color={item.checked ? c.primary : c.inkFaint} />
          </Animated.View>
          <Emoji size={22}>{emojiFor(item.name, item.category)}</Emoji>
          <View style={{ flex: 1 }}>
            <Text
              variant="bodyStrong"
              numberOfLines={1}
              color={item.checked ? c.inkMuted : undefined}
              style={item.checked ? { textDecorationLine: 'line-through' } : null}
            >
              {item.name}
            </Text>
            <Text variant="caption" muted>
              Goes in the {LOCATION_LABEL[where].toLowerCase()}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => useShopping.getState().remove(item.id)} style={styles.iconHit}>
          <Ionicons name="close" size={20} color={c.inkFaint} />
        </Pressable>
      </View>
    </FadeIn>
  );
}

export default function ShoppingList() {
  const { c } = useTheme();
  const list = useShopping((s) => s.items);
  const items = useInventory((s) => s.items);
  const today = useToday();

  const toBuy = list.filter((i) => !i.checked);
  const inBasket = list.filter((i) => i.checked);
  const names = useMemo(() => list.map((i) => i.name), [list]);
  const again = useMemo(() => buyAgain(items, names, addDays(today, -30)), [items, names, today]);

  const add = (food: ResolvedFood) => {
    if (!useShopping.getState().add(food)) useSnackbar.getState().show({ message: `${food.name} is already on your list` });
  };

  const share = async () => {
    try {
      await Share.share({ message: shoppingText(toBuy.map((i) => i.name)) });
    } catch {
      // Cancelled, or sharing is unavailable: nothing to do.
    }
  };

  const putAway = () => {
    useScanDraft.getState().startPutAway(inBasket);
    router.push('/review');
  };

  return (
    <Screen focusOnOpen="if-lost">
      <Header
        title="Shopping"
        subtitle={list.length === 0 ? 'Nothing on your list' : toBuy.length === 0 ? 'Everything is in the basket' : `${toBuy.length} to buy`}
        right={
          canShare && toBuy.length > 0 ? (
            <PressableScale accessibilityRole="button" accessibilityLabel="Share list" onPress={() => void share()} scaleTo={0.9} style={[styles.round, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name={Platform.OS === 'ios' ? 'share-outline' : 'share-social-outline'} size={22} color={c.ink} />
            </PressableScale>
          ) : undefined
        }
      />

      <AddItemField
        location="fridge"
        added={names}
        onAdd={add}
        placeholder="Add to your list"
        caption={(s) => `${s.fromHistory ? 'Bought before · ' : ''}Goes in the ${LOCATION_LABEL[s.keptIn ?? usualPlace(s.name, s.category)].toLowerCase()}`}
      />

      {again.length > 0 ? (
        <FadeIn style={{ gap: 8 }}>
          <Text variant="label" muted>
            Buy again
          </Text>
          <View style={styles.chips}>
            {again.map((f) => (
              <PressableScale
                key={f.name}
                testID={`again-${f.name}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${f.name} to your list`}
                onPress={() => add({ name: f.name, category: f.category })}
                style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}
              >
                <Emoji size={16}>{emojiFor(f.name, f.category)}</Emoji>
                <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                  {f.name}
                </Text>
                <Ionicons name="add" size={18} color={c.primary} />
              </PressableScale>
            ))}
          </View>
        </FadeIn>
      ) : null}

      {toBuy.length > 0 ? (
        <View style={{ gap: 8 }}>
          {toBuy.map((item, i) => (
            <ShoppingRow key={item.id} item={item} index={i} />
          ))}
        </View>
      ) : null}

      {inBasket.length > 0 ? (
        <FadeIn style={{ gap: 8 }}>
          <View style={styles.basketHead}>
            <Text variant="label" muted>
              In your basket · {inBasket.length}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => useShopping.getState().clearChecked()} style={styles.textHit}>
              <Text variant="bodyStrong" color={c.primary}>
                Clear
              </Text>
            </Pressable>
          </View>
          {inBasket.map((item, i) => (
            <ShoppingRow key={item.id} item={item} index={i} />
          ))}
          <Card style={{ gap: 10, backgroundColor: c.primaryTint, borderColor: c.primaryTint }}>
            <Text variant="bodyStrong">Home from the shop?</Text>
            <Text variant="caption" muted style={{ fontSize: 14, lineHeight: 20 }}>
              Put these away and Fridge Pulse starts tracking them, each with its own expiry date.
            </Text>
            <Button testID="put-away" label={`Put away ${inBasket.length} ${inBasket.length === 1 ? 'item' : 'items'}`} icon="home" onPress={putAway} />
          </Card>
        </FadeIn>
      ) : null}

      {list.length === 0 && again.length === 0 ? (
        <FadeIn>
          <EmptyState
            emoji="🛒"
            title="Your list is empty"
            message="Add what you need above. As you use food up, Fridge Pulse suggests what to buy again."
          />
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, paddingRight: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, minHeight: 60 },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  basketHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  textHit: { minHeight: 44, minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
