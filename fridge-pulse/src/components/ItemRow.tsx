import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { daysLeft, expiryLabel } from '../lib/expiry';
import type { PantryItem } from '../lib/types';
import { useBurst } from '../store/burst';
import { usePictureFor } from '../store/foods';
import { radius, useTheme } from '../theme';
import { emojiFor, LOCATION_LABEL } from './categories';
import { FoodPicture } from './FoodPicture';
import { NATIVE_DRIVER, prefersReducedMotion, useAnimatedValue } from './motion';
import { Text } from './Text';
import { UrgencyBadge } from './UrgencyBadge';

type Outcome = 'used' | 'wasted';

interface Props {
  item: PantryItem;
  onPress: () => void;
  /**
   * Marks the item used or thrown out. Enables the check button and swiping: right for used,
   * left for thrown out. Called once the row has animated away.
   */
  onResolve?: (outcome: Outcome) => void;
  now?: Date;
}

/** How far a swipe must travel, as a share of the row's width, to count. */
const SWIPE_SHARE = 0.33;

export function ItemRow({ item, onPress, onResolve, now }: Props) {
  const { c } = useTheme();
  const picture = usePictureFor(item.name);
  const days = daysLeft(item, now);

  const x = useAnimatedValue(0); // swipe offset
  const fade = useAnimatedValue(1); // exit
  const collapse = useAnimatedValue(1); // 1 = full height
  const pop = useAnimatedValue(1); // check button
  const rowHeight = useRef<number | null>(null);
  const rowWidth = useRef(0);
  const done = useRef(false);
  const armed = useRef<Outcome | null>(null);
  const check = useRef<View>(null);
  const [heightStyle, setHeightStyle] = useState<Animated.AnimatedInterpolation<number> | null>(null);

  // Gesture handlers are created once; they read the latest callbacks through these refs.
  const resolveRef = useRef(onResolve);
  useLayoutEffect(() => {
    resolveRef.current = onResolve;
  });

  const finish = (outcome: Outcome) => {
    const resolve = resolveRef.current;
    if (done.current || !resolve) return;
    done.current = true;
    if (prefersReducedMotion()) {
      resolve(outcome);
      return;
    }
    const away = (outcome === 'used' ? 1 : -1) * (rowWidth.current || 400);
    Animated.parallel([
      Animated.timing(x, { toValue: away, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: NATIVE_DRIVER }),
    ]).start(() => {
      const h = rowHeight.current;
      if (!h) {
        resolve(outcome);
        return;
      }
      // Close the gap smoothly before the list reflows.
      setHeightStyle(collapse.interpolate({ inputRange: [0, 1], outputRange: [0, h] }));
      Animated.timing(collapse, { toValue: 0, duration: 170, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => resolve(outcome));
    });
  };
  const finishRef = useRef(finish);
  useLayoutEffect(() => {
    finishRef.current = finish;
  });

  const springBack = () => Animated.spring(x, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 8, speed: 16 }).start();

  // The handlers read refs only when a gesture fires, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      // Only clearly horizontal drags; vertical ones stay with the list's scrolling.
      onMoveShouldSetPanResponderCapture: (_, g) => !!resolveRef.current && !done.current && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => {
        x.setValue(g.dx);
        const threshold = (rowWidth.current || 350) * SWIPE_SHARE;
        const now: Outcome | null = g.dx > threshold ? 'used' : g.dx < -threshold ? 'wasted' : null;
        if (now !== armed.current) {
          armed.current = now;
          if (now && Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
        }
      },
      onPanResponderRelease: (_, g) => {
        const threshold = (rowWidth.current || 350) * SWIPE_SHARE;
        armed.current = null;
        if (g.dx > threshold || (g.dx > 60 && g.vx > 0.6)) finishRef.current('used');
        else if (g.dx < -threshold || (g.dx < -60 && g.vx < -0.6)) finishRef.current('wasted');
        else springBack();
      },
      onPanResponderTerminate: () => {
        armed.current = null;
        springBack();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  );

  const tapCheck = () => {
    if (done.current) return;
    if (!prefersReducedMotion()) {
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.25, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.spring(pop, { toValue: 1, useNativeDriver: NATIVE_DRIVER, bounciness: 12 }),
      ]).start();
      check.current?.measureInWindow((bx, by, bw, bh) => {
        if (bw > 0) useBurst.getState().emit(bx + bw / 2, by + bh / 2);
      });
    }
    // Let the check pop register before the row slides away.
    setTimeout(() => finishRef.current('used'), prefersReducedMotion() ? 0 : 140);
  };

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === 'used') finish('used');
    else if (e.nativeEvent.actionName === 'wasted') finish('wasted');
    else if (e.nativeEvent.actionName === 'activate') onPress();
  };

  const usedOpacity = x.interpolate({ inputRange: [0, 70], outputRange: [0, 1], extrapolate: 'clamp' });
  const wastedOpacity = x.interpolate({ inputRange: [-70, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  // Icons grow as the swipe travels. Input ranges must increase, so the left swipe runs from -120 up to -20.
  const usedIcon = x.interpolate({ inputRange: [20, 120], outputRange: [0.6, 1.1], extrapolate: 'clamp' });
  const wastedIcon = x.interpolate({ inputRange: [-120, -20], outputRange: [1.1, 0.6], extrapolate: 'clamp' });

  return (
    <Animated.View
      style={heightStyle ? { height: heightStyle, overflow: 'hidden' } : null}
      onLayout={(e) => {
        if (!done.current) rowHeight.current = e.nativeEvent.layout.height;
        rowWidth.current = e.nativeEvent.layout.width;
      }}
    >
      {onResolve ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, heightStyle ? { opacity: collapse } : null]}
          pointerEvents="none"
          // Decoration for sighted swipers; screen readers use the row's actions instead.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
        >
          <Animated.View style={[styles.reveal, styles.revealLeft, { backgroundColor: c.success, opacity: usedOpacity }]}>
            <Animated.View style={{ transform: [{ scale: usedIcon }] }}>
              <Ionicons name="checkmark-circle" size={24} color={c.onSuccess} />
            </Animated.View>
            <Text variant="bodyStrong" color={c.onSuccess}>
              Used
            </Text>
          </Animated.View>
          <Animated.View style={[styles.reveal, styles.revealRight, { backgroundColor: c.danger, opacity: wastedOpacity }]}>
            <Text variant="bodyStrong" color={c.onDanger}>
              Thrown out
            </Text>
            <Animated.View style={{ transform: [{ scale: wastedIcon }] }}>
              <Ionicons name="trash" size={22} color={c.onDanger} />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.View
        {...(onResolve ? pan.panHandlers : null)}
        style={[styles.row, { backgroundColor: c.surface, borderColor: c.border, opacity: fade, transform: [{ translateX: x }] }]}
      >
        <Pressable
          testID={`item-${item.id}`}
          accessibilityRole="button"
          // The date is the point of the row, so it is read too ("Milk, expires tomorrow, 1, Fridge").
          accessibilityLabel={`${item.name}, ${expiryLabel(days)}, ${item.quantity}, ${LOCATION_LABEL[item.location]}`}
          // Screen readers use swipes to move between items, so the actions menu stands in for them.
          accessibilityHint={onResolve ? 'Opens it. Mark it used or thrown out from the actions.' : undefined}
          accessibilityActions={onResolve ? [{ name: 'activate' }, { name: 'used', label: 'Mark as used' }, { name: 'wasted', label: 'Threw it out' }] : undefined}
          onAccessibilityAction={onResolve ? onAction : undefined}
          onPress={onPress}
          style={({ pressed }) => [styles.main, pressed && { opacity: 0.7 }]}
        >
          <FoodPicture uri={picture} emoji={emojiFor(item.name, item.category)} emojiSize={22} style={[styles.icon, { backgroundColor: picture ? '#FFFFFF' : c.surfaceAlt }]} />
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
        {onResolve ? (
          <Pressable
            testID={`used-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.name} as used`}
            onPress={tapCheck}
            style={styles.usedHit}
          >
            <Animated.View ref={check} style={[styles.used, { backgroundColor: c.urgency.ok.tint, transform: [{ scale: pop }] }]}>
              <Ionicons name="checkmark" size={20} color={c.urgency.ok.fg} />
            </Animated.View>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingRight: 6,
    ...(Platform.OS === 'web' ? { userSelect: 'none' as const } : null),
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  icon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  usedHit: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  used: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reveal: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  revealLeft: { left: 0, right: 0, justifyContent: 'flex-start' },
  revealRight: { left: 0, right: 0, justifyContent: 'flex-end' },
});
