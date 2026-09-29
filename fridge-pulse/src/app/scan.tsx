import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Animated, Easing, Image, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { LOCATIONS, LOCATION_LABEL } from '../components/categories';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Logo } from '../components/Logo';
import { Screen } from '../components/Screen';
import { Emoji, Text } from '../components/Text';
import { friendlyError, isDemoMode, scanPhotos } from '../lib/api';
import { encodePhoto, MAX_PHOTOS, pickPhotos, takePhoto, type Photo } from '../lib/photos';
import { toDrafts } from '../lib/scan';
import type { StorageLocation } from '../lib/types';
import { getProvider } from '../store/billing';
import { useInventory } from '../store/inventory';
import { useScanDraft } from '../store/scanDraft';
import { radius, useTheme } from '../theme';

const TIPS: Record<StorageLocation, string> = {
  fridge: 'Open the door, use good light, and shoot one shelf per photo with labels facing out.',
  freezer: 'Take the drawers out or lay items flat so labels are visible. One drawer per photo works best.',
  pantry: 'Photograph one shelf at a time, front row facing the camera. Printed dates help a lot.',
};

// The native animation driver does not exist on web.
const NATIVE_DRIVER = Platform.OS !== 'web';

const STATUS = ['Reading labels...', 'Spotting fresh food...', 'Estimating how long it keeps...', 'Almost there...'];

function Analyzing({ location }: { location: StorageLocation }) {
  const { c } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0));
  const [i, setI] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    const t = setInterval(() => setI((n) => Math.min(n + 1, STATUS.length - 1)), 2500);
    return () => {
      loop.stop();
      clearInterval(t);
    };
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0] });

  return (
    <View style={[styles.analyzing, { backgroundColor: c.bg }]} testID="analyzing">
      <View style={styles.logoWrap}>
        <Animated.View style={[styles.ring, { backgroundColor: c.primary, opacity, transform: [{ scale: Animated.multiply(scale, 1.6) }] }]} />
        <Animated.View style={{ transform: [{ scale }] }}>
          <Logo size={88} />
        </Animated.View>
      </View>
      <Text variant="heading">Reading your {location}</Text>
      <Text muted>{STATUS[i]}</Text>
    </View>
  );
}

export default function Scan() {
  const { c } = useTheme();
  const [location, setLocation] = useState<StorageLocation>('fridge');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(source: 'camera' | 'library') {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return;
    const result = source === 'camera' ? await takePhoto() : await pickPhotos(room);
    if ('denied' in result) {
      Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph your fridge, or choose photos from your library instead.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    setPhotos((p) => [...p, ...result.photos].slice(0, MAX_PHOTOS));
  }

  async function analyze(sample = false) {
    setAnalyzing(true);
    setError(null);
    try {
      const images = sample ? [] : await Promise.all(photos.map(encodePhoto));
      const userId = await getProvider().getUserId();
      const res = await scanPhotos({ userId, location, images });
      const drafts = toDrafts(res, location, useInventory.getState().items);
      if (drafts.length === 0) {
        setError(res.notes ?? 'No food found in those photos. Try a closer, brighter shot.');
        return;
      }
      useScanDraft.getState().start(location, drafts, res.notes);
      router.replace('/review');
    } catch (e) {
      setError(friendlyError(e).message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (analyzing) return <Analyzing location={location} />;

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            testID="analyze"
            label={photos.length === 0 ? 'Add a photo to continue' : `Analyze ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}
            icon="sparkles"
            disabled={photos.length === 0}
            onPress={() => void analyze()}
            style={{ alignSelf: 'stretch' }}
          />
          <View style={styles.footerLinks}>
            {isDemoMode ? <Button label="Try a sample scan" variant="ghost" size="sm" onPress={() => void analyze(true)} testID="sample-scan" /> : null}
            <Button
              label="Add items by hand"
              variant="ghost"
              size="sm"
              onPress={() => {
                useScanDraft.getState().start(location, [], null);
                router.replace('/review');
              }}
            />
          </View>
        </View>
      }
    >
      <View style={styles.top}>
        <Text variant="title" accessibilityRole="header">
          Scan
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={10} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <Ionicons name="close" size={20} color={c.ink} />
        </Pressable>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          What are you scanning?
        </Text>
        <View style={styles.chips}>
          {LOCATIONS.map((l) => (
            <Chip key={l} testID={`loc-${l}`} label={LOCATION_LABEL[l]} selected={location === l} onPress={() => setLocation(l)} />
          ))}
        </View>
      </View>

      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={p.uri + i} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${i + 1}`}
              onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
              style={[styles.remove, { backgroundColor: c.ink }]}
            >
              <Ionicons name="close" size={14} color={c.bg} />
            </Pressable>
          </View>
        ))}
      </View>

      {photos.length < MAX_PHOTOS ? (
        <View style={[styles.drop, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Emoji size={40}>📷</Emoji>
          <Text variant="bodyStrong">{photos.length === 0 ? 'Add photos of your shelves' : 'Add another shelf'}</Text>
          <Text variant="caption" muted>
            Up to {MAX_PHOTOS} photos
          </Text>
          <View style={styles.dropActions}>
            <Button testID="take-photo" label="Take photo" icon="camera" size="sm" onPress={() => void add('camera')} />
            <Button testID="choose-photos" label="Choose from library" icon="images" size="sm" variant="secondary" onPress={() => void add('library')} />
          </View>
        </View>
      ) : null}

      <Card style={{ flexDirection: 'row', gap: 10, backgroundColor: c.primaryTint, borderColor: c.primaryTint }}>
        <Ionicons name="bulb-outline" size={20} color={c.primary} />
        <Text variant="caption" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
          {TIPS[location]}
        </Text>
      </Card>

      {error ? (
        <Text testID="scan-error" color={c.danger} variant="caption" style={{ fontSize: 14 }}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dropActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 96, height: 96 },
  thumb: { width: 96, height: 96, borderRadius: radius.md },
  remove: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drop: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed' },
  footer: { width: '100%', maxWidth: 600, gap: 4, alignItems: 'center' },
  footerLinks: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  analyzing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  logoWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring: { position: 'absolute', width: 88, height: 88, borderRadius: 44 },
});
