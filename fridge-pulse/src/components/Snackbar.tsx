import { Ionicons } from '@expo/vector-icons';
import { useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbar, type Snack } from '../store/snackbar';
import { radius, useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Emoji, Text } from './Text';

/** Height of the tab bar, so the message sits just above it on tab screens. */
const TAB_BAR = Platform.select({ web: 78, ios: 49, default: 56 }) ?? 56;

/**
 * The app's message bar: slides up, counts down its time with a thin line, and offers an action
 * (usually Undo). Mounted once at the root so it survives closing the screen that triggered it.
 */
export function SnackbarHost() {
  const { c } = useTheme();
  const snack = useSnackbar((s) => s.snack);
  const footer = useSnackbar((s) => s.footers[s.footers.length - 1]?.height ?? 0);
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const still = useReducedMotion();
  const route = segments.join('/');
  const inTabs = segments[0] === '(tabs)';
  // Where each message first appeared. Opening another screen on top dismisses it; coming back to
  // the tabs does not (an Undo after "I used it" on an item must survive closing that item).
  const [origin, setOrigin] = useState<{ id: number; route: string } | null>(null);
  if (snack && origin?.id !== snack.id) setOrigin({ id: snack.id, route });
  useEffect(() => {
    if (snack && origin?.id === snack.id && origin.route !== route && !inTabs) useSnackbar.getState().hide(snack.id);
  }, [route, inTabs, snack, origin]);
  // The last message stays on screen while it animates away.
  const [shown, setShown] = useState<Snack | null>(snack);
  if (snack && snack !== shown) setShown(snack);
  if (!snack && shown && still) setShown(null);
  const enter = useAnimatedValue(0);
  const clock = useAnimatedValue(1);

  useEffect(() => {
    if (snack) {
      enter.setValue(still ? 1 : 0);
      clock.setValue(1);
      if (!still) Animated.spring(enter, { toValue: 1, useNativeDriver: NATIVE_DRIVER, speed: 16, bounciness: 7 }).start();
      const countdown = Animated.timing(clock, { toValue: 0, duration: snack.durationMs, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER });
      countdown.start(({ finished }) => {
        if (finished) useSnackbar.getState().hide(snack.id);
      });
      return () => countdown.stop();
    }
    if (still) return;
    const leave = Animated.timing(enter, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    leave.start(({ finished }) => {
      if (finished) setShown(null);
    });
    return () => leave.stop();
  }, [snack, enter, clock, still]);

  if (!shown) return null;
  const bottom = inTabs ? TAB_BAR + (Platform.OS === 'web' ? 0 : insets.bottom) + 12 : footer > 0 ? footer + 8 : insets.bottom + 12;
  const icon =
    shown.tone === 'rescue' || shown.tone === 'freeze' ? (
      <Emoji size={20}>{shown.tone === 'rescue' ? '🌱' : '❄️'}</Emoji>
    ) : (
      <Ionicons name={shown.tone === 'waste' ? 'trash-outline' : 'checkmark-circle'} size={20} color={c.snackAction} />
    );

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Animated.View
        testID="snackbar"
        accessibilityLiveRegion="polite"
        style={[
          styles.bar,
          {
            backgroundColor: c.snackBg,
            opacity: enter,
            transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }, { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          },
        ]}
      >
        {icon}
        <Text variant="body" color={c.snackText} style={{ flex: 1 }} numberOfLines={2}>
          {shown.message}
        </Text>
        {shown.action ? (
          <Pressable
            testID="snackbar-action"
            accessibilityRole="button"
            accessibilityLabel={shown.action.label}
            onPress={() => {
              const run = shown.action?.onPress;
              useSnackbar.getState().hide(shown.id);
              run?.();
            }}
            style={styles.action}
          >
            <Text variant="bodyStrong" color={c.snackAction}>
              {shown.action.label}
            </Text>
          </Pressable>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[styles.clock, { backgroundColor: c.snackAction, transform: [{ scaleX: clock }] }]}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 560,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    minHeight: 56,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  action: { minHeight: 44, minWidth: 64, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  clock: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, opacity: 0.7, transformOrigin: 'left' },
});
