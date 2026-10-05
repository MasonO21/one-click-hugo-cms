import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AddItemField } from '../components/AddItemField';
import { AiConsentModal } from '../components/AiConsentModal';
import { Button } from '../components/Button';
import { FoodPicture } from '../components/FoodPicture';
import { IdentifyCard } from '../components/IdentifyCard';
import { FadeIn, stagger } from '../components/motion';
import { emojiFor, LOCATIONS, LOCATION_LABEL } from '../components/categories';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { Screen } from '../components/Screen';
import { Stepper } from '../components/Stepper';
import { Text } from '../components/Text';
import { UrgencyBadge } from '../components/UrgencyBadge';
import { isDemoMode } from '../lib/api';
import { addDays, daysBetween, formatShortDate, todayISO } from '../lib/dates';
import { confirm } from '../lib/dialogs';
import { canLookUp, MAX_AUTO_LOOKUPS, needsLookup } from '../lib/identify';
import { closeModals, goBack } from '../lib/nav';
import { requestPermission } from '../lib/notifications';
import { deviceCurrency, formatMoney } from '../lib/money';
import { draftToItem, newId, type DraftItem } from '../lib/scan';
import { usePictureFor } from '../store/foods';
import { useInventory } from '../store/inventory';
import { useLookups } from '../store/lookups';
import { placesPerItem, useScanDraft } from '../store/scanDraft';
import { useSettings } from '../store/settings';
import { useShopping } from '../store/shopping';
import { useSnackbar } from '../store/snackbar';
import { radius, useTheme } from '../theme';

function Tag({ label, tone }: { label: string; tone: 'good' | 'warn' | 'plain' }) {
  const { c } = useTheme();
  const bg = tone === 'good' ? c.primaryTint : tone === 'warn' ? c.urgency.soon.tint : c.surfaceAlt;
  const fg = tone === 'good' ? c.primary : tone === 'warn' ? c.urgency.soon.fg : c.inkMuted;
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text variant="caption" color={fg} style={{ fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}

/** The scanned photo an item was seen in, for looking it up. A receipt photo does not show the food. */
function photoFor(draft: DraftItem): string | undefined {
  const { photos, mode } = useScanDraft.getState();
  if (mode !== 'scan') return undefined;
  return photos[draft.photo ?? 0] ?? photos[0];
}

function DraftRow({
  draft,
  listLocation,
  ownPlace,
  onLookUp,
}: {
  draft: DraftItem;
  listLocation: (typeof LOCATIONS)[number];
  /** Each item picks its own place (a receipt), instead of the whole list sharing one. */
  ownPlace: boolean;
  onLookUp: (draft: DraftItem) => void;
}) {
  const { c } = useTheme();
  const update = useScanDraft((s) => s.update);
  const lookup = useLookups((s) => s.byKey[draft.key]);
  const picture = usePictureFor(draft.name);
  const remove = (key: string) => {
    useLookups.getState().cancel(key);
    useScanDraft.getState().remove(key);
  };
  const days = daysBetween(todayISO(), draft.expiresOn);
  const shift = (delta: number) => {
    const next = addDays(draft.expiresOn, delta);
    // Expiry can be adjusted freely into the past (already expired) but never absurdly far.
    if (daysBetween(todayISO(), next) > 1825) return;
    update(draft.key, { expiresOn: next, expirySource: 'manual' });
  };

  return (
    <Card style={{ gap: 12, opacity: draft.selected ? 1 : 0.55 }} testID={`draft-${draft.key}`}>
      <View style={styles.rowTop}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: draft.selected }}
          accessibilityLabel={`Include ${draft.name}`}
          onPress={() => update(draft.key, { selected: !draft.selected })}
          style={[styles.iconHit, { marginLeft: -8, marginRight: -4 }]}
        >
          <Ionicons name={draft.selected ? 'checkbox' : 'square-outline'} size={26} color={draft.selected ? c.primary : c.inkFaint} />
        </Pressable>
        <FoodPicture uri={picture} emoji={emojiFor(draft.name, draft.category)} emojiSize={24} style={[styles.thumb, picture ? { backgroundColor: '#FFFFFF' } : null]} />
        <Field
          value={draft.name}
          onChangeText={(name) => update(draft.key, { name })}
          accessibilityLabel="Item name"
          style={styles.name}
          maxLength={80}
        />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${draft.name}`} onPress={() => remove(draft.key)} style={styles.iconHit}>
          <Ionicons name="trash-outline" size={20} color={c.inkFaint} />
        </Pressable>
      </View>

      <View style={styles.tags}>
        <UrgencyBadge days={days} />
        {draft.expirySource === 'label' ? <Tag label="Date from label" tone="good" /> : null}
        {draft.expirySource === 'estimate' ? <Tag label="Estimated" tone="plain" /> : null}
        {draft.identified ? <Tag label="Identified online" tone="good" /> : null}
        {draft.confidence === 'low' && !lookup ? <Tag label="Double-check" tone="warn" /> : null}
        {draft.duplicate ? <Tag label="Already tracked" tone="plain" /> : null}
        {draft.price !== undefined ? <Tag label={formatMoney(draft.price, draft.currency ?? deviceCurrency())} tone="plain" /> : null}
        {!ownPlace && draft.location !== listLocation ? <Tag label={LOCATION_LABEL[draft.location]} tone="plain" /> : null}
      </View>

      {ownPlace ? (
        <View style={styles.place}>
          {LOCATIONS.map((l) => (
            <Chip key={l} testID={`place-${draft.key}-${l}`} label={LOCATION_LABEL[l]} selected={draft.location === l} onPress={() => useScanDraft.getState().moveDraft(draft.key, l)} />
          ))}
        </View>
      ) : null}

      {lookup ? (
        <IdentifyCard draftKey={draft.key} lookup={lookup} location={draft.location} onRetry={() => onLookUp(draft)} />
      ) : canLookUp(draft) || needsLookup(draft) ? (
        <Pressable
          testID={`look-up-${draft.key}`}
          accessibilityRole="button"
          accessibilityLabel={`Look up ${draft.name} online`}
          onPress={() => onLookUp(draft)}
          style={styles.lookUp}
        >
          <Ionicons name="search" size={16} color={c.primary} />
          <Text variant="bodyStrong" color={c.primary} style={{ fontSize: 14 }}>
            Not sure what this is? Look it up online
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.rowBottom}>
        <Field
          value={draft.quantity}
          onChangeText={(quantity) => update(draft.key, { quantity })}
          accessibilityLabel="Quantity"
          style={styles.qty}
          maxLength={30}
        />
        <Stepper label={formatShortDate(draft.expiresOn)} onDecrement={() => shift(-1)} onIncrement={() => shift(1)} />
      </View>
    </Card>
  );
}

export default function Review() {
  const { c } = useTheme();
  const drafts = useScanDraft((s) => s.drafts);
  const notes = useScanDraft((s) => s.notes);
  const location = useScanDraft((s) => s.location);
  const mode = useScanDraft((s) => s.mode);
  const manual = mode === 'manual';
  const receipt = mode === 'receipt';
  const ownPlaces = placesPerItem(mode);
  const bought = receipt ? drafts.find((d) => d.addedOn)?.addedOn : undefined;
  const title = mode === 'shopping' ? 'Put away' : manual ? 'Add items' : receipt ? 'Your receipt' : mode === 'barcode' ? 'Scanned items' : 'Review';
  const subtitle =
    mode === 'shopping'
      ? 'Each item is headed where it usually lives. Change anything, then save.'
      : manual
        ? 'Start typing and pick a suggestion, then save.'
        : ownPlaces
          ? `${bought ? `Bought ${formatShortDate(bought)}. ` : ''}Each item is headed where it keeps best. Change anything, then save.`
          : 'Fix anything that looks off, then save.';
  const places = ownPlaces ? LOCATIONS.map((l) => [l, drafts.filter((d) => d.selected && d.location === l).length] as const).filter(([, n]) => n > 0) : [];
  // Only the names matter to the suggestions; a new array each render would recompute them on every keystroke.
  const addedKey = drafts.map((d) => d.name).join('\n');
  const added = useMemo(() => (addedKey ? addedKey.split('\n') : []), [addedKey]);

  const chosen = drafts.filter((d) => d.selected && d.name.trim() !== '');
  const [askConsent, setAskConsent] = useState<DraftItem | null>(null);

  // Anything the app does not recognise in a scan is looked up online straight away, using the photo.
  useEffect(() => {
    const draft = useScanDraft.getState();
    if (draft.mode === 'scan' || draft.mode === 'receipt') {
      draft.drafts
        .filter(needsLookup)
        .slice(0, MAX_AUTO_LOOKUPS)
        .forEach((d) => useLookups.getState().start(d, photoFor(d)));
    }
    // Leaving the screen (saved or discarded) stops any search still running.
    return () => useLookups.getState().reset();
  }, []);

  const lookUp = (d: DraftItem) => {
    // A typed item has not been through a scan, so ask before its name leaves the phone.
    if (!isDemoMode && !useSettings.getState().aiConsent) {
      setAskConsent(d);
      return;
    }
    useLookups.getState().start(d, photoFor(d));
  };


  async function close() {
    // A scan or a half-typed list is work; do not throw it away on a stray tap.
    if (drafts.length > 0) {
      const ok = await confirm({
        title: `Discard ${drafts.length === 1 ? 'this item' : `these ${drafts.length} items`}?`,
        message: 'Nothing has been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!ok) return;
    }
    useScanDraft.getState().clear();
    goBack();
  }

  async function save() {
    const now = new Date();
    useInventory.getState().addItems(chosen.map((d) => draftToItem(d, newId(), now)));
    const bought = chosen.map((d) => d.shoppingId).filter((id): id is string => !!id);
    if (bought.length > 0) useShopping.getState().removeMany(bought);
    useScanDraft.getState().clear();
    useSnackbar.getState().show({ message: `${chosen.length} ${chosen.length === 1 ? 'item' : 'items'} added`, tone: 'plain' });

    // Ask once, in context, right after the first save. Notifications do not exist on web.
    const settings = useSettings.getState();
    if (Platform.OS !== 'web' && !settings.askedForReminders && settings.remindersEnabled) {
      settings.set({ askedForReminders: true });
      const turnOn = await confirm({
        title: 'Get expiry reminders?',
        message: 'Fridge Pulse can nudge you the day before food expires so nothing gets wasted, and remind you before your free trial ends.',
        confirmLabel: 'Turn on',
        cancelLabel: 'Not now',
      });
      if (!turnOn || !(await requestPermission())) useSettings.getState().set({ remindersEnabled: false });
    }
    // Back to wherever the person started (Pulse, Items or the shopping list).
    closeModals();
  }

  return (
    <Screen
      edges={['top', 'bottom']}
      footer={
        <View style={styles.footer}>
          <Button
            testID="save-items"
            label={chosen.length === 0 ? 'Nothing selected' : `Save ${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`}
            disabled={chosen.length === 0}
            onPress={() => void save()}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      }
    >
      <View style={styles.top}>
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text muted>{subtitle}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Discard and close" testID="review-close" onPress={() => void close()} style={styles.closeHit}>
          <View style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
            <Ionicons name="close" size={20} color={c.ink} />
          </View>
        </Pressable>
      </View>

      {notes ? (
        <Card style={{ backgroundColor: c.urgency.soon.tint, borderColor: c.urgency.soon.tint }}>
          <Text variant="caption" color={c.urgency.soon.fg} style={{ fontSize: 14, lineHeight: 20 }}>
            {notes}
          </Text>
        </Card>
      ) : null}

      {ownPlaces ? (
        places.length > 0 ? (
          <View style={styles.chips} testID="receipt-places">
            {places.map(([l, n]) => (
              <Tag key={l} label={`${n} to the ${LOCATION_LABEL[l].toLowerCase()}`} tone="plain" />
            ))}
          </View>
        ) : null
      ) : (
        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
            Stored in
          </Text>
          <View style={styles.chips}>
            {LOCATIONS.map((l) => (
              <Chip key={l} label={LOCATION_LABEL[l]} selected={location === l} onPress={() => useScanDraft.getState().setLocation(l)} />
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          {manual ? 'What do you have?' : 'Missing something?'}
        </Text>
        <AddItemField
          location={location}
          added={added}
          autoFocus={manual && drafts.length === 0}
          onAdd={(food) => useScanDraft.getState().addManual(food.name, { category: food.category, keptIn: food.keptIn })}
        />
      </View>

      {drafts.length > 0 ? (
        <Text variant="caption" muted style={{ fontSize: 13 }}>
          Dates marked &ldquo;Estimated&rdquo; are typical shelf lives, not guarantees. Check labels and use your judgment.
        </Text>
      ) : null}

      <View style={{ gap: 12 }}>
        {drafts.map((d, i) => (
          <FadeIn key={d.key} delay={mode === 'scan' || ownPlaces ? stagger(i, 35) : 0}>
            <DraftRow draft={d} listLocation={location} ownPlace={ownPlaces} onLookUp={lookUp} />
          </FadeIn>
        ))}
      </View>
      <AiConsentModal
        visible={askConsent !== null}
        onClose={() => setAskConsent(null)}
        onAgree={() => {
          const d = askConsent;
          setAskConsent(null);
          if (d) useLookups.getState().start(d, photoFor(d));
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  closeHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -4, marginTop: -4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, minWidth: 0, minHeight: 44, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  // Gives way on narrow phones so the date stepper stays inside the card.
  qty: { width: 120, flexShrink: 1, minWidth: 64, minHeight: 44 },
  footer: { width: '100%', maxWidth: 600 },
  thumb: { width: 36, height: 36, borderRadius: 10 },
  lookUp: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start' },
  place: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
