import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { isDemoMode } from '../lib/api';
import { SCREENSHOT_MODE } from '../lib/config';
import { displayName, durationLabel } from '../lib/identify';
import { learnedDays } from '../lib/shelfLife';
import type { FoodCandidate, StorageLocation } from '../lib/types';
import { useBurst } from '../store/burst';
import { useLookups, type Lookup } from '../store/lookups';
import { radius, useTheme } from '../theme';
import { Button } from './Button';
import { emojiFor, LOCATION_LABEL } from './categories';
import { FoodPicture } from './FoodPicture';
import { FadeIn, NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from './motion';
import { Text } from './Text';

/** A magnifier that gently pulses, and a light sweeping across a bar, while the web is searched. */
function Searching() {
  const { c } = useTheme();
  const still = useReducedMotion();
  const pulse = useAnimatedValue(0);
  const sweep = useAnimatedValue(0);

  useEffect(() => {
    if (still) return;
    const loop = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
          Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        ]),
      ),
      Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: NATIVE_DRIVER })),
    ]);
    loop.start();
    return () => loop.stop();
  }, [pulse, sweep, still]);

  return (
    <View style={{ gap: 10 }} testID="lookup-searching" accessibilityLiveRegion="polite">
      <View style={styles.headRow}>
        <Animated.View
          style={[
            styles.badge,
            { backgroundColor: c.primaryTint, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }] },
          ]}
        >
          <Ionicons name="search" size={16} color={c.primary} />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" style={{ fontSize: 15 }}>
            Looking this up online…
          </Text>
          <Text variant="caption" muted>
            Checking the photo and searching the web for the exact product.
          </Text>
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: c.surfaceAlt }]}>
        <Animated.View
          style={[
            styles.glint,
            { backgroundColor: c.primary, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, 320] }) }] },
          ]}
        />
      </View>
    </View>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function keepsLine(c: FoodCandidate, location: StorageLocation): string {
  const days = learnedDays(c, location);
  if (location === 'pantry' && days === 0) return 'Keep it in the fridge';
  if (location === 'freezer' && c.shelfLife.freezer == null) return 'Freezing is not recommended';
  return `Keeps about ${durationLabel(days)} in the ${LOCATION_LABEL[location].toLowerCase()}`;
}

function Candidate({ draftKey, candidate, index, total, location }: { draftKey: string; candidate: FoodCandidate; index: number; total: number; location: StorageLocation }) {
  const { c } = useTheme();
  const yesRef = useRef<View>(null);
  const title = displayName(candidate);

  const yes = () => {
    const food = useLookups.getState().confirm(draftKey);
    if (!food) return;
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility?.(`${food.name} saved to your foods`);
    yesRef.current?.measureInWindow((x, y, w, h) => {
      if (w > 0) useBurst.getState().emit(x + w / 2, y + h / 2);
    });
  };
  const no = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    useLookups.getState().next(draftKey);
  };

  return (
    <FadeIn key={index} distance={14} style={{ gap: 10 }} testID="lookup-found">
      <View style={styles.between}>
        <Text variant="label" color={c.primary}>
          Is this your item?
        </Text>
        {total > 1 ? (
          <Text variant="caption" muted>
            {index + 1} of {total}
          </Text>
        ) : null}
      </View>
      <FoodPicture
        uri={candidate.image?.url}
        emoji={emojiFor(candidate.name, candidate.category)}
        emojiSize={56}
        resizeMode="contain"
        accessibilityLabel={`Picture of ${title}`}
        testID="lookup-picture"
        style={[styles.picture, { borderColor: c.border }]}
      />
      <View style={{ gap: 2 }}>
        <Text variant="heading" testID="lookup-name">
          {title}
        </Text>
        {candidate.product && candidate.product !== title ? (
          <Text variant="caption" muted numberOfLines={2}>
            {candidate.product}
          </Text>
        ) : null}
      </View>
      <View style={styles.headRow}>
        <Ionicons name="time-outline" size={16} color={c.inkMuted} />
        <Text variant="caption" style={{ fontSize: 14, flex: 1 }}>
          {keepsLine(candidate, location)}
        </Text>
      </View>
      {candidate.why ? (
        <Text variant="caption" muted style={{ fontSize: 13, lineHeight: 18 }}>
          {candidate.why}
        </Text>
      ) : null}
      {/* Demo pictures are drawn samples; store screenshots leave out that note, like the other demo notes. */}
      <View style={[styles.credits, SCREENSHOT_MODE && { display: 'none' }]}>
        <Text variant="caption" faint style={{ fontSize: 12 }}>
          {candidate.image ? `Picture: ${candidate.image.credit}` : 'No picture found online'}
        </Text>
        {candidate.sourceUrl ? (
          <Pressable accessibilityRole="link" accessibilityLabel={`Open source, ${hostOf(candidate.sourceUrl)}`} onPress={() => void Linking.openURL(candidate.sourceUrl!)} hitSlop={8}>
            <Text variant="caption" color={c.primary} style={{ fontSize: 12, fontWeight: '600' }}>
              Source: {hostOf(candidate.sourceUrl)}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.buttons}>
        <View ref={yesRef} collapsable={false} style={{ flex: 1 }}>
          <Button testID="lookup-yes" label="Yes, that's it" icon="checkmark" size="sm" onPress={yes} />
        </View>
        <Button testID="lookup-no" label={index + 1 < total ? 'No, next' : 'No'} variant="secondary" size="sm" onPress={no} />
      </View>
    </FadeIn>
  );
}

interface Props {
  draftKey: string;
  lookup: Lookup;
  location: StorageLocation;
  onRetry: () => void;
}

/** What the online lookup found for one reviewed item, and the question "Is this your item?". */
export function IdentifyCard({ draftKey, lookup, location, onRetry }: Props) {
  const { c } = useTheme();
  const tint = lookup.status === 'confirmed' ? c.primaryTint : c.surface;

  return (
    <View style={[styles.card, { backgroundColor: tint, borderColor: lookup.status === 'confirmed' ? c.primaryTint : c.border }]}>
      {lookup.status === 'searching' ? <Searching /> : null}

      {lookup.status === 'found' ? (
        <Candidate
          draftKey={draftKey}
          candidate={lookup.candidates[lookup.index]!}
          index={lookup.index}
          total={lookup.candidates.length}
          location={location}
        />
      ) : null}

      {lookup.status === 'none' ? (
        <FadeIn style={styles.headRow} testID="lookup-none">
          <Ionicons name="help-circle-outline" size={20} color={c.inkMuted} />
          <Text variant="caption" muted style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
            {isDemoMode
              ? 'No match. This preview can only look up the sample item; the full app searches the web.'
              : 'No confident match online. Check the name above, or keep it as it is.'}
          </Text>
        </FadeIn>
      ) : null}

      {lookup.status === 'error' ? (
        <FadeIn style={{ gap: 8 }} testID="lookup-error">
          <View style={styles.headRow}>
            <Ionicons name="cloud-offline-outline" size={20} color={c.inkMuted} />
            <Text variant="caption" muted style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
              {lookup.message}
            </Text>
          </View>
          <Button testID="lookup-retry" label="Try again" variant="secondary" size="sm" icon="refresh" onPress={onRetry} style={{ alignSelf: 'flex-start' }} />
        </FadeIn>
      ) : null}

      {lookup.status === 'confirmed' ? (
        <FadeIn distance={6} style={styles.headRow} testID="lookup-confirmed">
          <Ionicons name="checkmark-circle" size={22} color={c.primary} />
          <Text variant="caption" color={c.primary} style={{ flex: 1, fontSize: 14, fontWeight: '600' }}>
            Identified as {lookup.name}. Saved to your foods.
          </Text>
        </FadeIn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, borderWidth: 1, padding: 12, gap: 10 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  glint: { width: 80, height: 6, borderRadius: 3, opacity: 0.55 },
  picture: { width: '100%', height: 180, borderRadius: radius.md, borderWidth: 1, backgroundColor: '#FFFFFF' },
  credits: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, alignItems: 'center' },
  buttons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
