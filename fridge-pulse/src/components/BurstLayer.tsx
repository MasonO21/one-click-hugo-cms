import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useBurst, type Burst } from '../store/burst';
import { useTheme } from '../theme';
import { NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';

const PARTICLES = 12;
const LEAVES = ['🌱', '✨', '🌿'];

/** Small deterministic generator, so a burst's shape is a pure function of its id. */
function seeded(seed: number): () => number {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A ring and a spray of leaves and dots, played where food was rescued. */
function BurstView({ burst, origin }: { burst: Burst; origin: { x: number; y: number } }) {
  const { c } = useTheme();
  const t = useAnimatedValue(0);
  const colors = [c.urgency.ok.solid, c.primary, c.urgency.soon.solid, c.urgency.week.solid];
  const parts = useMemo(() => {
    const random = seeded(burst.id);
    return Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (i / PARTICLES) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const dist = 38 + random() * 36;
      return {
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 12,
        size: 6 + random() * 5,
        leaf: i % 4 === 0 ? LEAVES[(i / 4) % LEAVES.length] : null,
        spin: `${Math.round((random() - 0.5) * 240)}deg`,
        colorIndex: i % 4,
      };
    });
  }, [burst.id]);

  useEffect(() => {
    const a = Animated.timing(t, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    a.start(() => useBurst.getState().done(burst.id));
    return () => a.stop();
  }, [t, burst.id]);

  const cx = burst.x - origin.x;
  const cy = burst.y - origin.y;
  const fade = t.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] });

  return (
    <>
      <Animated.View
        style={[
          styles.ring,
          {
            left: cx - 22,
            top: cy - 22,
            borderColor: c.urgency.ok.solid,
            opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 0.3, 0] }),
            transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.2] }) }],
          },
        ]}
      />
      {parts.map((p, i) => {
        const move = [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
          // Rise, then drift down a little as if falling.
          { translateY: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, p.dy, p.dy + 16] }) },
          { scale: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1.2, 0.7] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', p.spin] }) },
        ];
        return p.leaf ? (
          <Animated.Text key={i} style={[styles.leaf, { left: cx - 8, top: cy - 10, opacity: fade, transform: move }]}>
            {p.leaf}
          </Animated.Text>
        ) : (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: cx - p.size / 2,
              top: cy - p.size / 2,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: colors[p.colorIndex],
              opacity: fade,
              transform: move,
            }}
          />
        );
      })}
    </>
  );
}

/** Full-screen, touch-through layer for celebration bursts. Mounted once at the root. */
export function BurstLayer() {
  const bursts = useBurst((s) => s.bursts);
  const still = useReducedMotion();
  const ref = useRef<View>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  if (still) return null;
  return (
    <View
      ref={ref}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={() => ref.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      {bursts.map((b) => (
        <BurstView key={b.id} burst={b} origin={origin} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  leaf: { position: 'absolute', fontSize: 16, lineHeight: 20 },
});
