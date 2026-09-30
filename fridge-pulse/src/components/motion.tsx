import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SCREENSHOT_MODE } from '../lib/config';

/** The native animation driver does not exist on web; there animations run in JS. */
export const NATIVE_DRIVER = Platform.OS !== 'web';

// One shared subscription to the system "reduce motion" setting for the whole app.
let reduced = SCREENSHOT_MODE;
const listeners = new Set<() => void>();
let subscribed = false;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscribed && !SCREENSHOT_MODE) {
    subscribed = true;
    const set = (v: boolean) => {
      if (v === reduced) return;
      reduced = v;
      listeners.forEach((l) => l());
    };
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(set)
      .catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceMotionChanged', set);
  }
  return () => listeners.delete(listener);
}

/**
 * True when the person asked their phone for less motion (and in screenshot builds). Animations
 * then jump straight to their end state.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, () => reduced, () => reduced);
}

/** An Animated.Value that lives as long as the component (react-native-web lacks RN's own hook). */
export function useAnimatedValue(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}

/** Current value outside React, for event handlers. */
export function prefersReducedMotion(): boolean {
  return reduced;
}

interface FadeInProps {
  children: ReactNode;
  /** Milliseconds to wait before appearing, for staggered lists. */
  delay?: number;
  /** How far it rises while fading in. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Fades and rises content into place when it first mounts. */
export function FadeIn({ children, delay = 0, distance = 10, style, testID }: FadeInProps) {
  const still = useReducedMotion();
  const v = useAnimatedValue(still ? 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      v.setValue(1);
      return;
    }
    const a = Animated.timing(v, { toValue: 1, duration: 280, delay, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start();
    return () => a.stop();
    // Runs once: it is an entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] });
  return (
    <Animated.View testID={testID} style={[style, { opacity: v, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/** Staggered entrance delay for the nth item in a list, capped so long lists do not drag. */
export const stagger = (index: number, step = 45) => Math.min(index, 8) * step;

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** Layout for the outer box: margins, alignSelf, flex. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Look of the pressable itself; may be a function of `pressed`. */
  style?: PressableProps['style'];
  /** Scale while held down. */
  scaleTo?: number;
};

/** A Pressable that dips slightly while held and springs back on release. */
export function PressableScale({ containerStyle, style, scaleTo = 0.97, onPressIn, onPressOut, disabled, children, ...rest }: PressableScaleProps) {
  const scale = useAnimatedValue(1);
  const to = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: NATIVE_DRIVER, speed: 40, bounciness: toValue === 1 ? 8 : 0 }).start();
  return (
    <Animated.View style={[containerStyle, { transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        disabled={disabled}
        style={style}
        onPressIn={(e: GestureResponderEvent) => {
          if (!disabled && !prefersReducedMotion()) to(scaleTo);
          onPressIn?.(e);
        }}
        onPressOut={(e: GestureResponderEvent) => {
          to(1);
          onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
