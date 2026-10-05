import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { emojiFor } from '../components/categories';
import { Field } from '../components/Field';
import { FoodPicture } from '../components/FoodPicture';
import { ModalTop } from '../components/ModalTop';
import { FadeIn } from '../components/motion';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { friendlyError, isDemoMode, lookupBarcode } from '../lib/api';
import { barcodeDrafts, demoProduct, FOOD_BARCODES, normalizeBarcode, SAMPLE_BARCODES, type BarcodeProduct } from '../lib/barcode';
import { confirm } from '../lib/dialogs';
import { guessCategory } from '../lib/shelfLife';
import { useBarcodes } from '../store/barcodes';
import { getProvider, useBilling } from '../store/billing';
import { useInventory } from '../store/inventory';
import { useScanDraft } from '../store/scanDraft';
import { radius, useTheme } from '../theme';

interface Entry {
  code: string;
  status: 'looking' | 'found' | 'missing' | 'failed';
  product?: BarcodeProduct;
  count: number;
  /** For a barcode nobody knows: what the person says it is. */
  typed: string;
}

/** The camera sees a barcode many times a second; the same one again this soon is the same pack. */
const SAME_PACK_MS = 2500;

const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

function Camera({ onScanned }: { onScanned: (result: BarcodeScanningResult) => void }) {
  const { c } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  if (permission?.granted) {
    return (
      <View style={[styles.camera, { backgroundColor: c.surfaceAlt }]} testID="barcode-camera">
        <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }} onBarcodeScanned={onScanned} />
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={[styles.frame, { borderColor: c.glow }]} />
          <Text variant="caption" color="#FFFFFF" style={styles.frameHint}>
            Hold a barcode inside the frame
          </Text>
        </View>
      </View>
    );
  }
  const blocked = permission && !permission.canAskAgain;
  return (
    <Card style={{ gap: 10, alignItems: 'flex-start' }} testID="barcode-camera-off">
      <View style={styles.row}>
        <Ionicons name="barcode-outline" size={26} color={c.primary} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          Point your camera at a barcode
        </Text>
      </View>
      <Text variant="caption" muted>
        {blocked
          ? 'Camera access is off for Fridge Pulse. Turn it on in your phone settings, or type the numbers below.'
          : 'Scan each product as you unpack. The same product twice counts as two.'}
      </Text>
      {blocked ? (
        Platform.OS !== 'web' ? <Button label="Open phone settings" size="sm" variant="secondary" onPress={() => void Linking.openSettings()} /> : null
      ) : (
        <Button testID="barcode-allow-camera" label="Use camera" icon="camera" size="sm" onPress={() => void requestPermission().catch(() => {})} />
      )}
    </Card>
  );
}

/** Scan product barcodes, then review them like a receipt. Only the barcode number is looked up. */
export default function Barcode() {
  const { c } = useTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const lastSeen = useRef(new Map<string, number>());
  // The codes on the list, known at once (a state update is applied later).
  const listed = useRef(new Set<string>());
  const sample = useRef(0);

  const patch = (code: string, change: Partial<Entry>) => setEntries((all) => all.map((e) => (e.code === code ? { ...e, ...change } : e)));

  async function resolve(code: string) {
    const known = useBarcodes.getState().known[code];
    if (known) {
      patch(code, { status: 'found', product: known });
      return;
    }
    try {
      const product = isDemoMode ? demoProduct(code) : await lookupBarcode(await getProvider().getUserId(), code);
      if (product) useBarcodes.getState().remember(product);
      patch(code, product ? { status: 'found', product } : { status: 'missing' });
    } catch (e) {
      patch(code, { status: 'failed' });
      // The trial ran out mid-session: re-check, and the paywall takes over if so.
      if (friendlyError(e).paywall) void useBilling.getState().refresh();
    }
  }

  /** A scanned or typed barcode: a new line, or one more of a product already scanned. */
  function add(raw: string, type?: string, fromCamera = false): boolean {
    const code = normalizeBarcode(raw, type);
    if (!code) return false;
    const now = Date.now();
    if (fromCamera && now - (lastSeen.current.get(code) ?? 0) < SAME_PACK_MS) {
      lastSeen.current.set(code, now);
      return true;
    }
    lastSeen.current.set(code, now);
    tap();
    if (listed.current.has(code)) {
      setEntries((all) => all.map((e) => (e.code === code ? { ...e, count: e.count + 1 } : e)));
      return true;
    }
    listed.current.add(code);
    setEntries((all) => [{ code, status: 'looking', count: 1, typed: '' }, ...all]);
    void resolve(code);
    return true;
  }

  const addTyped = () => {
    if (add(typed)) {
      setTyped('');
      setError(null);
    } else {
      setError('That does not look like a product barcode. Check the numbers under the lines.');
    }
  };

  const ready = entries.filter((e) => e.status === 'found' || (e.status !== 'looking' && e.typed.trim() !== ''));
  const looking = entries.filter((e) => e.status === 'looking').length;

  const review = () => {
    const scanned = ready.map((e) => {
      const product: BarcodeProduct = e.product ?? {
        code: e.code,
        name: e.typed.trim(),
        brand: null,
        quantity: null,
        category: guessCategory(e.typed.trim()),
        frozen: false,
        picture: null,
      };
      // Next time this barcode is scanned, the name the person gave it comes straight back.
      if (!e.product) useBarcodes.getState().remember(product);
      return { product, count: e.count };
    });
    useScanDraft.getState().start('fridge', barcodeDrafts(scanned, useInventory.getState().items), null, 'barcode');
    router.replace('/review');
  };

  const close = async () => {
    if (entries.length > 0) {
      const ok = await confirm({
        title: `Discard ${entries.length === 1 ? 'this product' : `these ${entries.length} products`}?`,
        message: 'Nothing has been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep scanning',
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            testID="barcode-review"
            variant={ready.length > 0 ? 'cta' : 'secondary'}
            label={ready.length > 0 ? `Review ${ready.length} ${ready.length === 1 ? 'item' : 'items'}` : 'Scan a product to continue'}
            icon="checkmark-circle"
            disabled={ready.length === 0}
            onPress={review}
            style={{ alignSelf: 'stretch' }}
          />
          {looking > 0 ? (
            <Text variant="caption" muted style={{ textAlign: 'center' }}>
              {`Looking up ${looking} ${looking === 1 ? 'product' : 'products'}...`}
            </Text>
          ) : null}
        </View>
      }
    >
      <ModalTop title="Scan barcodes" subtitle="Scan your shopping as you unpack it. Only the barcode number is looked up." onClose={() => void close()} />

      <Camera onScanned={(r) => void add(r.data, r.type, true)} />

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Or type the numbers
        </Text>
        <View style={styles.row}>
          <Field
            testID="barcode-input"
            value={typed}
            onChangeText={(t) => {
              setTyped(t.replace(/[^\d ]/g, ''));
              setError(null);
            }}
            onSubmitEditing={addTyped}
            placeholder="5 012345 678900"
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={20}
            accessibilityLabel="Barcode number"
            style={{ flex: 1 }}
          />
          <Button testID="barcode-add" label="Add" size="sm" variant="secondary" disabled={typed.replace(/\D/g, '').length < 8} onPress={addTyped} />
        </View>
        {error ? (
          <Text variant="caption" color={c.danger} testID="barcode-error" style={{ fontSize: 14 }}>
            {error}
          </Text>
        ) : null}
        {isDemoMode ? (
          <View style={styles.row}>
            <Text variant="caption" faint style={{ flex: 1 }}>
              Preview: barcodes give sample products here.
            </Text>
            <Button
              testID="barcode-sample"
              label="Try a sample barcode"
              size="sm"
              variant="ghost"
              onPress={() => {
                add(SAMPLE_BARCODES[sample.current % SAMPLE_BARCODES.length]!);
                sample.current += 1;
              }}
            />
          </View>
        ) : null}
      </View>

      {entries.length > 0 ? (
        <View style={{ gap: 8 }} testID="barcode-list">
          {entries.map((e, i) => {
            const name = e.product?.name ?? (e.typed.trim() || 'Unknown product');
            const details = e.product ? [e.product.brand, e.product.quantity].filter(Boolean).join(' · ') : e.code;
            return (
              <FadeIn key={e.code}>
                <View style={[styles.item, { backgroundColor: c.surface, borderColor: c.border }]} testID={`barcode-item-${i}`}>
                  <FoodPicture
                    uri={e.product?.picture?.url}
                    emoji={e.status === 'found' ? emojiFor(name, e.product?.category ?? guessCategory(name)) : '📦'}
                    emojiSize={22}
                    style={[styles.thumb, { backgroundColor: c.surfaceAlt }]}
                  />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.row}>
                      <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={2}>
                        {e.status === 'looking' ? 'Looking up...' : name}
                      </Text>
                      {e.count > 1 ? (
                        <View style={[styles.count, { backgroundColor: c.primaryFill }]}>
                          <Text variant="caption" color={c.onPrimary} style={styles.countText}>
                            {`×${e.count}`}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {e.status === 'found' ? (
                      <Text variant="caption" muted numberOfLines={1}>
                        {details || e.code}
                      </Text>
                    ) : null}
                    {e.status === 'missing' || e.status === 'failed' ? (
                      <>
                        <Text variant="caption" muted>
                          {e.status === 'missing' ? 'Not in Open Food Facts yet. What is it?' : 'Could not look this up. Try again, or say what it is.'}
                        </Text>
                        <View style={styles.row}>
                          <Field
                            testID={`barcode-name-${i}`}
                            value={e.typed}
                            onChangeText={(t) => patch(e.code, { typed: t })}
                            placeholder="Name, like Greek yogurt"
                            maxLength={60}
                            accessibilityLabel={`Name for barcode ${e.code}`}
                            style={{ flex: 1, minHeight: 40 }}
                          />
                          {e.status === 'failed' ? (
                            <Button
                              label="Retry"
                              size="sm"
                              variant="ghost"
                              onPress={() => {
                                patch(e.code, { status: 'looking' });
                                void resolve(e.code);
                              }}
                            />
                          ) : null}
                        </View>
                      </>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${name}`}
                    onPress={() => {
                      listed.current.delete(e.code);
                      setEntries((all) => all.filter((x) => x.code !== e.code));
                    }}
                    style={styles.removeHit}
                  >
                    <Ionicons name="close" size={18} color={c.inkMuted} />
                  </Pressable>
                </View>
              </FadeIn>
            );
          })}
        </View>
      ) : null}

      {entries.some((e) => e.product?.picture) ? (
        <Text variant="caption" faint>
          Product details and pictures from Open Food Facts.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  camera: { height: 220, borderRadius: radius.lg, overflow: 'hidden' },
  frameWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 10 },
  frame: { width: '78%', height: 110, borderWidth: 2, borderRadius: radius.md },
  frameHint: { textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, fontSize: 13 },
  footer: { width: '100%', maxWidth: 600, gap: 6, alignItems: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, borderWidth: 1 },
  thumb: { width: 48, height: 48, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  count: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  countText: { fontWeight: '700', fontSize: 12 },
  removeHit: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
