import { useEffect, useId, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { BRAND } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';

/** One beat of an ECG trace, 120 wide, baseline at y=20 in a 32-high strip. */
const UNIT = 120;
const BEAT = 'h40 l4 -3 l4 3 l6 2 l4 -18 l4 24 l4 -8 l8 -5 l8 5 h38';

interface Props {
  /** "quick" when food needs using: the trace runs faster. */
  pace?: 'calm' | 'quick';
  height?: number;
}

/**
 * A neon heart-monitor trace that scrolls across, like the bottom of the brand's dashboard.
 * Decorative only (hidden from screen readers); still when Reduce Motion is on.
 */
export function HeartbeatLine({ pace = 'calm', height = 32 }: Props) {
  const still = useReducedMotion();
  const [width, setWidth] = useState(0);
  const shift = useAnimatedValue(0);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const scale = height / 32;
  const unit = UNIT * scale;

  useEffect(() => {
    if (still || width === 0) {
      shift.setValue(0);
      return;
    }
    // Moving by exactly one beat makes the loop seamless.
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: 1, duration: pace === 'quick' ? 900 : 1500, easing: Easing.linear, useNativeDriver: NATIVE_DRIVER }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift, still, width, pace]);

  const beats = Math.ceil(width / unit) + 2;
  const d = `M0 20 ${Array.from({ length: beats }, () => BEAT).join(' ')}`;
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  return (
    <View
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      pointerEvents="none"
      style={{ height, overflow: 'hidden' }}
    >
      {width > 0 ? (
        <Animated.View style={{ transform: [{ translateX: shift.interpolate({ inputRange: [0, 1], outputRange: [0, -unit] }) }] }}>
          <Svg width={beats * unit} height={height} viewBox={`0 0 ${beats * UNIT} 32`}>
            <Defs>
              <LinearGradient id={`ecg-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={BRAND.blue} />
                <Stop offset="0.5" stopColor={BRAND.magenta} />
                <Stop offset="1" stopColor={BRAND.blue} />
              </LinearGradient>
            </Defs>
            <Path d={d} fill="none" stroke={BRAND.magenta} strokeOpacity={0.28} strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />
            <Path d={d} fill="none" stroke={`url(#ecg-${uid})`} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
