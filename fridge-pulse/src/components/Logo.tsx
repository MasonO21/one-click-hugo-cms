import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';

interface Props {
  size?: number;
  /**
   * Beats like a heart: "calm" when everything is fresh, "quick" when food needs using. The fridge's
   * pulse, literally. Off by default.
   */
  beat?: 'calm' | 'quick';
}

export function Logo({ size = 56, beat }: Props) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const pulse = useAnimatedValue(0);

  useEffect(() => {
    if (!beat || still) {
      pulse.setValue(0);
      return;
    }
    // Lub-dub, then rest. The rest is shorter when something needs attention.
    const rest = beat === 'quick' ? 520 : 1250;
    const t = (toValue: number, duration: number) =>
      Animated.timing(pulse, { toValue, duration, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    const loop = Animated.loop(Animated.sequence([t(1, 110), t(0.35, 120), t(0.8, 100), t(0, 220), Animated.delay(rest)]));
    loop.start();
    return () => loop.stop();
  }, [beat, still, pulse]);

  const radius = size * 0.3;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      {beat ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: c.primary,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
          }}
        />
      ) : null}
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
        }}
      >
        <Ionicons name="pulse" size={size * 0.6} color={c.onPrimary} />
      </Animated.View>
    </View>
  );
}
