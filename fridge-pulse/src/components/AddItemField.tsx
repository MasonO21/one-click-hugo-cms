import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { estimateShelfLifeDays } from '../lib/shelfLife';
import { historyFrom, keepsLabel, resolveTyped, suggestFoods, type FoodSuggestion, type ResolvedFood } from '../lib/suggest';
import type { StorageLocation } from '../lib/types';
import { useInventory } from '../store/inventory';
import { radius, useTheme } from '../theme';
import { Button } from './Button';
import { emojiFor, LOCATION_LABEL } from './categories';
import { Field } from './Field';
import { Emoji, Text } from './Text';

interface Props {
  /** Where the list is stored; used for the "keeps about" estimate. */
  location: StorageLocation;
  /** Names already on the list, which are not suggested again. */
  added: string[];
  onAdd: (food: ResolvedFood) => void;
  autoFocus?: boolean;
}

/** The name with the typed part in bold, so it is clear why each suggestion matched. */
function MatchedName({ name, matches }: { name: string; matches: [number, number][] }) {
  const parts: { text: string; bold: boolean }[] = [];
  let at = 0;
  for (const [start, end] of matches) {
    if (start > at) parts.push({ text: name.slice(at, start), bold: false });
    parts.push({ text: name.slice(start, end), bold: true });
    at = end;
  }
  if (at < name.length) parts.push({ text: name.slice(at), bold: false });
  return (
    <Text numberOfLines={1}>
      {parts.map((p, i) => (
        <Text key={i} variant={p.bold ? 'bodyStrong' : 'body'}>
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

function describe(s: FoodSuggestion, location: StorageLocation): string {
  const kept = s.keptIn ?? location;
  return [
    s.fromHistory ? 'Added before' : null,
    kept !== location ? LOCATION_LABEL[kept] : null,
    keepsLabel(estimateShelfLifeDays(s.name, s.category, kept)),
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Item name input that suggests foods while you type: your own past items first, then common
 * groceries, with typos forgiven. Tapping a suggestion adds it; Add or the return key adds what was typed.
 */
export function AddItemField({ location, added, onAdd, autoFocus }: Props) {
  const { c } = useTheme();
  const items = useInventory((s) => s.items);
  const history = useMemo(() => historyFrom(items), [items]);
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const suggestions = useMemo(() => suggestFoods(text, { history, exclude: added }), [text, history, added]);

  function add(food: ResolvedFood) {
    onAdd(food);
    setText('');
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    // Keep the keyboard up for the next item (on web, tapping a suggestion moves focus away).
    input.current?.focus();
  }

  function submit() {
    if (text.trim()) add(resolveTyped(text, history));
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Field
          ref={input}
          testID="add-name"
          value={text}
          onChangeText={setText}
          placeholder="Type a food, like milk or eggs"
          accessibilityLabel="Item name"
          accessibilityHint="Suggestions appear below as you type"
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="next"
          autoFocus={autoFocus}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          importantForAutofill="no"
          clearButtonMode="while-editing"
          maxLength={80}
          style={{ flex: 1 }}
        />
        <Button label="Add" variant="secondary" onPress={submit} disabled={!text.trim()} style={{ minHeight: 48 }} testID="add-typed" />
      </View>

      {suggestions.length > 0 ? (
        <View testID="suggestions" style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
          {suggestions.map((s, i) => {
            const detail = describe(s, location);
            return (
              <Pressable
                key={s.name}
                testID={`suggestion-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Add ${s.name}`}
                accessibilityHint={detail}
                onPress={() => add(s)}
                style={({ pressed }) => [
                  styles.suggestion,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                  pressed && { backgroundColor: c.surfaceAlt },
                ]}
              >
                <View style={[styles.glyph, { backgroundColor: c.surfaceAlt }]}>
                  <Emoji size={20}>{emojiFor(s.name, s.category)}</Emoji>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <MatchedName name={s.name} matches={s.matches} />
                  <Text variant="caption" muted numberOfLines={1}>
                    {detail}
                  </Text>
                </View>
                <Ionicons name="add-circle" size={26} color={c.primary} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 8 },
  glyph: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
