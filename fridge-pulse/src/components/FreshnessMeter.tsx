import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BRAND, FONT } from '../theme';
import { useAnimatedValue, useReducedMotion } from './motion';
import { Text } from './Text';

const R = 48;
const STROKE = 12;
/** Room around the arc for its rounded ends and glow. */
const PAD = 10;
const W = 2 * R + STROKE + 2 * PAD;
const BASE = R + STROKE / 2 + PAD;
/** Half a circle: from the left end, over the top, to the right end. */
const ARC = `M ${W / 2 - R} ${BASE} A ${R} ${R} 0 0 1 ${W / 2 + R} ${BASE}`;
const LENGTH = Math.PI * R;
const H = BASE + STROKE / 2 + PAD / 2;

interface Props {
  /** 0 to 100. */
  score: number;
  /** Rendered width; the drawing scales. */
  width?: number;
}

/**
 * The freshness score as a half-circle meter: lime (the brand's "fresh" colour) on a dim lime
 * track, with the number in white. It fills up to the score when it first appears.
 */
export function FreshnessMeter({ score, width = 124 }: Props) {
  const target = Math.min(Math.max(Math.round(score), 0), 100);
  const still = useReducedMotion();
  const progress = useAnimatedValue(0);
  const [animated, setAnimated] = useState(0);
  const shown = still ? target : animated;

  useEffect(() => {
    if (still) return;
    // The arc is an SVG attribute, so it follows a JS-driven value (a short, one-off animation).
    const id = progress.addListener(({ value }) => setAnimated(value));
    const a = Animated.timing(progress, { toValue: target, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => {
      a.stop();
      progress.removeListener(id);
    };
  }, [progress, target, still]);

  const height = (width / W) * H;
  const filled = (shown / 100) * LENGTH;
  return (
    <View
      style={{ width, height: height + 4 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Freshness score ${target} out of 100`}
      accessibilityValue={{ min: 0, max: 100, now: target }}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
        <Path d={ARC} fill="none" stroke={BRAND.lime} strokeOpacity={0.18} strokeWidth={STROKE} strokeLinecap="round" />
        {filled > 0.5 ? (
          <>
            {/* Glow, then the fill. */}
            <Path d={ARC} fill="none" stroke={BRAND.lime} strokeOpacity={0.3} strokeWidth={STROKE + 8} strokeLinecap="round" strokeDasharray={`${filled} ${LENGTH}`} />
            <Path d={ARC} fill="none" stroke={BRAND.lime} strokeWidth={STROKE} strokeLinecap="round" strokeDasharray={`${filled} ${LENGTH}`} />
          </>
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text variant="title" color="#FFFFFF" style={[styles.number, { fontSize: Math.round(width * 0.24), lineHeight: Math.round(width * 0.28) }]}>
          {Math.round(shown)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 },
  number: { fontFamily: FONT.headingBlack, letterSpacing: -0.5 },
});
