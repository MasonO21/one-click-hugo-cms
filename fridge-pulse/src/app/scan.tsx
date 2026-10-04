import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { AiConsentModal } from '../components/AiConsentModal';
import { Button } from '../components/Button';
import { LOCATIONS, LOCATION_LABEL } from '../components/categories';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Logo } from '../components/Logo';
import { FadeIn, NATIVE_DRIVER, useAnimatedValue, useReducedMotion } from '../components/motion';
import { Screen } from '../components/Screen';
import { Emoji, Text } from '../components/Text';
import { friendlyError, isDemoMode, scanPhotos } from '../lib/api';
import { SCREENSHOT_MODE } from '../lib/config';
import { encodePhoto, MAX_PHOTOS, pickPhotos, takePhoto, type Photo } from '../lib/photos';
import { goBack } from '../lib/nav';
import { knownForScan } from '../lib/identify';
import { toDrafts } from '../lib/scan';
import type { ScanMode, StorageLocation } from '../lib/types';
import { getProvider, useBilling } from '../store/billing';
import { useFoods } from '../store/foods';
import { useInventory } from '../store/inventory';
import { useScanDraft } from '../store/scanDraft';
import { useSettings } from '../store/settings';
import { radius, useTheme } from '../theme';

const TIPS: Record<StorageLocation, string> = {
  fridge: 'Open the door, use good light, and shoot one shelf per photo with labels facing out.',
  freezer: 'Take the drawers out or lay items flat so labels are visible. One drawer per photo works best.',
  pantry: 'Photograph one shelf at a time, front row facing the camera. Printed dates help a lot.',
};

const RECEIPT_TIP =
  'Lay the receipt flat in good light and fit its full width in the frame. For a long receipt, take one photo per section, top to bottom. Fold over any card details first.';

const SCAN_SIZE = 200;

const STATUS: Record<ScanMode, string[]> = {
  shelf: ['Reading labels...', 'Spotting fresh food...', 'Estimating how long it keeps...', 'Almost there...'],
  receipt: ['Reading the receipt...', 'Decoding abbreviations...', 'Working out where each item goes...', 'Almost there...'],
};

/** The photo being read, with a scan line sweeping over it; or the beating logo when there is no photo. */
function Analyzing({ mode, location, photo, onCancel }: { mode: ScanMode; location: StorageLocation; photo: Photo | undefined; onCancel: () => void }) {
  const { c } = useTheme();
  const still = useReducedMotion();
  const sweep = useAnimatedValue(0);
  const [i, setI] = useState(0);
  const status = STATUS[mode];

  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STATUS.shelf.length - 1)), 2500);
    if (still || !photo) return () => clearInterval(t);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(sweep, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      clearInterval(t);
    };
  }, [sweep, still, photo]);

  return (
    <View style={[styles.analyzing, { backgroundColor: c.bg }]} testID="analyzing">
      {photo ? (
        <View style={[styles.scanFrame, { borderColor: c.primary }]}>
          <Image source={{ uri: photo.uri }} style={styles.scanPhoto} accessibilityLabel="Your photo" />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.scanLine,
              { backgroundColor: c.urgency.ok.solid, shadowColor: c.urgency.ok.solid, transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, SCAN_SIZE - 4] }) }] },
            ]}
          />
        </View>
      ) : (
        <View style={styles.logoWrap}>
          <Logo size={88} beat="quick" />
        </View>
      )}
      <Text variant="heading">Reading your {mode === 'receipt' ? 'receipt' : location}</Text>
      <FadeIn key={i} distance={4}>
        <Text muted>{status[i]}</Text>
      </FadeIn>
      <Button testID="cancel-scan" label="Cancel" variant="ghost" size="sm" onPress={onCancel} style={{ marginTop: 12 }} />
    </View>
  );
}

/** Shelf photos or a receipt: two halves of one pill. */
function ModeSwitch({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
  const { c } = useTheme();
  const options: { key: ScanMode; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
    { key: 'shelf', label: 'Shelf photos', icon: 'camera-outline' },
    { key: 'receipt', label: 'Receipt', icon: 'receipt-outline' },
  ];
  return (
    <View style={[styles.switch, { backgroundColor: c.surfaceAlt }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = mode === o.key;
        return (
          <Pressable
            key={o.key}
            testID={`mode-${o.key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={[styles.switchOption, on && { backgroundColor: c.primaryFill }]}
          >
            <Ionicons name={o.icon} size={17} color={on ? c.onPrimary : c.inkMuted} />
            <Text variant="bodyStrong" color={on ? c.onPrimary : c.inkMuted} style={{ fontSize: 15 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Scan() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<ScanMode>(params.mode === 'receipt' ? 'receipt' : 'shelf');
  const receipt = mode === 'receipt';
  const [location, setLocation] = useState<StorageLocation>('fridge');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askConsent, setAskConsent] = useState(false);
  // A scan in flight belongs to this screen: cancelling or leaving drops its result.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

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
    // Nothing is uploaded until the person has agreed to AI processing (demo mode never uploads).
    if (!isDemoMode && !useSettings.getState().aiConsent) {
      setAskConsent(true);
      return;
    }
    setAnalyzing(true);
    setError(null);
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      // Demo mode returns sample items and never uploads, so skip the (pointless) photo encoding.
      const images = sample || isDemoMode ? [] : await Promise.all(photos.map(encodePhoto));
      const userId = await getProvider().getUserId();
      const known = knownForScan(useFoods.getState().foods);
      const res = await scanPhotos({ userId, mode, location, images, known, signal: controller.signal });
      if (controller.signal.aborted) return;
      const drafts = toDrafts(res, location, useInventory.getState().items, new Date(), mode);
      if (drafts.length === 0) {
        setError(res.notes ?? (receipt ? 'No food found on that receipt. Try a flatter, brighter photo.' : 'No food found in those photos. Try a closer, brighter shot.'));
        return;
      }
      // The photos stay in memory so the review screen can look up anything the app does not know.
      useScanDraft.getState().start(location, drafts, res.notes, receipt ? 'receipt' : 'scan', images);
      router.replace('/review');
    } catch (e) {
      if (controller.signal.aborted) return;
      const { message, paywall } = friendlyError(e);
      setError(message);
      // The trial ran out mid-session: re-check, and the paywall takes over if so.
      if (paywall) void useBilling.getState().refresh();
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (!controller.signal.aborted) setAnalyzing(false);
    }
  }

  const cancel = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setAnalyzing(false);
  };

  if (analyzing) return <Analyzing mode={mode} location={location} photo={photos[0]} onCancel={cancel} />;

  const analyzeLabel =
    photos.length === 0 ? 'Add a photo to continue' : receipt ? 'Read receipt' : `Analyze ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`;

  return (
    <>
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            testID="analyze"
            variant={photos.length === 0 ? 'secondary' : 'cta'}
            label={analyzeLabel}
            icon="sparkles"
            disabled={photos.length === 0}
            onPress={() => void analyze()}
            style={{ alignSelf: 'stretch' }}
          />
          {isDemoMode && !SCREENSHOT_MODE ? (
            <Text variant="caption" faint style={{ textAlign: 'center' }}>
              {receipt ? 'Preview: receipts are not read here. Tap Read receipt to see sample items.' : 'Preview: photos are not analysed here. Tap Analyze to see sample items.'}
            </Text>
          ) : null}
          <View style={styles.footerLinks}>
            {isDemoMode ? (
              <Button label={receipt ? 'Try a sample receipt' : 'Try a sample scan'} variant="ghost" size="sm" onPress={() => void analyze(true)} testID="sample-scan" />
            ) : null}
            <Button
              label="Add items by hand"
              variant="ghost"
              size="sm"
              onPress={() => {
                useScanDraft.getState().start(location, [], null, 'manual');
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
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={goBack} style={styles.closeHit}>
          <View style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={20} color={c.ink} />
          </View>
        </Pressable>
      </View>

      <ModeSwitch
        mode={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

      {receipt ? (
        <Text muted style={{ fontSize: 15, lineHeight: 22 }}>
          Photograph a shopping receipt and Fridge Pulse adds the food on it, each item headed for the fridge, freezer or pantry, with dates counted from the day you shopped.
        </Text>
      ) : (
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
      )}

      <View style={styles.grid}>
        {photos.map((p, i) => (
          <View key={p.uri + i} style={styles.thumbWrap}>
            <Image source={{ uri: p.uri }} style={[styles.thumb, { backgroundColor: c.surfaceAlt }]} accessibilityLabel={`Photo ${i + 1}`} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${i + 1}`}
              onPress={() => setPhotos((all) => all.filter((_, j) => j !== i))}
              style={styles.removeHit}
            >
              <View style={[styles.remove, { backgroundColor: c.ink }]}>
                <Ionicons name="close" size={14} color={c.bg} />
              </View>
            </Pressable>
          </View>
        ))}
      </View>

      {photos.length < MAX_PHOTOS ? (
        <View style={[styles.drop, { borderColor: c.border, backgroundColor: c.surface }]}>
          <Emoji size={40}>{receipt ? '🧾' : '📷'}</Emoji>
          <Text variant="bodyStrong">
            {receipt ? (photos.length === 0 ? 'Add a photo of your receipt' : 'Add the next part of the receipt') : photos.length === 0 ? 'Add photos of your shelves' : 'Add another shelf'}
          </Text>
          <Text variant="caption" muted>
            {receipt ? `A long receipt can take up to ${MAX_PHOTOS} photos` : `Up to ${MAX_PHOTOS} photos`}
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
          {receipt ? RECEIPT_TIP : TIPS[location]}
        </Text>
      </Card>

      {error ? (
        <Text testID="scan-error" color={c.danger} variant="caption" style={{ fontSize: 14 }}>
          {error}
        </Text>
      ) : null}
    </Screen>
    <AiConsentModal
      visible={askConsent}
      onClose={() => setAskConsent(false)}
      onAgree={() => {
        setAskConsent(false);
        void analyze();
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  switch: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 4 },
  switchOption: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44, borderRadius: radius.pill, paddingHorizontal: 10 },
  dropActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 96, height: 96 },
  thumb: { width: 96, height: 96, borderRadius: radius.md },
  removeHit: { position: 'absolute', top: -16, right: -16, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  drop: { alignItems: 'center', gap: 6, padding: 20, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed' },
  footer: { width: '100%', maxWidth: 600, gap: 4, alignItems: 'center' },
  footerLinks: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  analyzing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  logoWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  scanFrame: { width: SCAN_SIZE, height: SCAN_SIZE, borderRadius: radius.lg, borderWidth: 3, overflow: 'hidden', marginBottom: 16 },
  scanPhoto: { width: '100%', height: '100%' },
  scanLine: { position: 'absolute', left: 0, right: 0, top: 0, height: 4, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
});
