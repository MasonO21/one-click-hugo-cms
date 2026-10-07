import { useEffect, useId } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Polyline, Rect, Stop } from 'react-native-svg';
import { BRAND, glow, useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';

interface Props {
  size?: number;
  /**
   * Beats like a heart: "calm" when everything is fresh, "quick" when food needs using. The fridge's
   * pulse, literally. Off by default.
   */
  beat?: 'calm' | 'quick';
}

/** Heartbeat across the fridge, in the 100x100 drawing. */
export const HEARTBEAT_POINTS = '26,60 40,60 45.5,49 51.5,71 56.5,54 60.5,60 74,60';

/**
 * The brand mark: a neon fridge (magenta-to-orange frame, electric blue door) with a heartbeat
 * running across it, on a dark body so it reads on light and dark screens alike.
 */
export function FridgeMark({ size }: { size: number }) {
  // Gradient ids must be unique per drawing on web, where every <svg> shares one document.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const frame = `frame-${uid}`;
  const door = `door-${uid}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={frame} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={BRAND.magenta} />
          <Stop offset="1" stopColor={BRAND.orange} />
        </LinearGradient>
        <LinearGradient id={door} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#38D6FF" />
          <Stop offset="1" stopColor={BRAND.blue} />
        </LinearGradient>
      </Defs>
      {/* Soft glow under the outlines. */}
      <Rect x="24" y="6" width="52" height="80" rx="11" fill="none" stroke={BRAND.magenta} strokeOpacity={0.28} strokeWidth="10" />
      <Polyline points={HEARTBEAT_POINTS} fill="none" stroke={BRAND.magenta} strokeOpacity={0.35} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      {/* Body and feet. */}
      <Rect x="24" y="6" width="52" height="80" rx="11" fill={BRAND.navy} stroke={`url(#${frame})`} strokeWidth="4" />
      <Line x1="33" y1="87" x2="33" y2="94" stroke={BRAND.magenta} strokeWidth="4" strokeLinecap="round" />
      <Line x1="67" y1="87" x2="67" y2="94" stroke={BRAND.orange} strokeWidth="4" strokeLinecap="round" />
      {/* Door, freezer line and handles. */}
      <Rect x="31" y="13" width="38" height="66" rx="6" fill="none" stroke={`url(#${door})`} strokeWidth="2.6" />
      {/* Solid: a gradient sized to a flat line has no height and would not draw. */}
      <Line x1="31" y1="34" x2="69" y2="34" stroke="#38D6FF" strokeWidth="2.6" />
      <Line x1="37" y1="19" x2="37" y2="28" stroke="#38D6FF" strokeWidth="2.6" strokeLinecap="round" />
      <Line x1="37" y1="40" x2="37" y2="50" stroke="#38D6FF" strokeWidth="2.6" strokeLinecap="round" />
      {/* The pulse. */}
      <Polyline points={HEARTBEAT_POINTS} fill="none" stroke="#FF3D9E" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Logo({ size = 56, beat }: Props) {
  const { scheme } = useTheme();
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

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden style={{ width: size, height: size }}>
      {beat ? (
        // A magenta halo that flares with each beat.
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: size * 0.18,
              top: size * 0.1,
              width: size * 0.64,
              height: size * 0.8,
              borderRadius: size * 0.16,
              backgroundColor: `${BRAND.magenta}55`,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, scheme === 'dark' ? 0.8 : 0.45] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
            },
            glow(BRAND.magenta, size * 0.3, 0.7),
          ]}
        />
      ) : null}
      <Animated.View style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }}>
        <FridgeMark size={size} />
      </Animated.View>
    </View>
  );
}
