import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AddItemField } from '../components/AddItemField';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { emojiFor } from '../components/categories';
import { Field } from '../components/Field';
import { GoalBar } from '../components/GoalBar';
import { MacroTiles } from '../components/Macros';
import { ModalTop } from '../components/ModalTop';
import { FadeIn, stagger } from '../components/motion';
import { Screen } from '../components/Screen';
import { Stepper } from '../components/Stepper';
import { Emoji, Text } from '../components/Text';
import { useToday } from '../hooks/useToday';
import { addDays, formatShortDate } from '../lib/dates';
import { notify } from '../lib/dialogs';
import { sortByExpiry } from '../lib/expiry';
import { dayTotals, entryFromFood, entryTotals, formatServings, quickEntry } from '../lib/foodLog';
import { parseNumber, targetsFor } from '../lib/goals';
import { nutritionFor, portionMacros, type FoodNutrition } from '../lib/nutrition';
import type { PantryItem } from '../lib/types';
import { useFoodLog } from '../store/foodLog';
import { todayActivity, useHealth } from '../store/health';
import { useInventory } from '../store/inventory';
import { changeServings, logWithUndo, removeFromLog } from '../store/logActions';
import { useSettings } from '../store/settings';
import { useSnackbar } from '../store/snackbar';
import { radius, useTheme } from '../theme';

const fmt = (n: number) => Math.round(n).toLocaleString();

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return formatShortDate(day);
}

/** Figures typed in by hand: a name and calories, with protein, carbs and fat if known. */
function QuickAdd({ day, onDone }: { day: string; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [values, setValues] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const field = (key: keyof typeof values, label: string) => (
    <View style={{ flex: 1, minWidth: 70, gap: 4 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Field
        testID={`quick-${key}`}
        value={values[key]}
        onChangeText={(t) => setValues((v) => ({ ...v, [key]: t }))}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        maxLength={5}
      />
    </View>
  );
  const add = () => {
    const n = (t: string) => (t.trim() === '' ? null : parseNumber(t));
    const raw = { kcal: n(values.kcal), protein: n(values.protein), carbs: n(values.carbs), fat: n(values.fat) };
    const bad = Object.entries(values).some(([k, t]) => t.trim() !== '' && raw[k as keyof typeof raw] === null);
    const entry = bad ? null : quickEntry(title, raw);
    if (!entry) {
      notify('Check the numbers', 'Enter calories or protein, as plain numbers (up to 5,000 kcal).');
      return;
    }
    logWithUndo({ ...entry, day });
    onDone();
  };
  return (
    <Card style={{ gap: 10 }} testID="quick-add">
      <Text variant="bodyStrong">Quick add</Text>
      <Field testID="quick-title" value={title} onChangeText={setTitle} placeholder="What was it?" accessibilityLabel="Name" maxLength={60} />
      <View style={styles.quickRow}>
        {field('kcal', 'kcal')}
        {field('protein', 'Protein g')}
        {field('carbs', 'Carbs g')}
        {field('fat', 'Fat g')}
      </View>
      <View style={styles.row}>
        <Button testID="quick-save" label="Add" size="sm" onPress={add} />
        <Button label="Cancel" size="sm" variant="ghost" onPress={onDone} />
      </View>
    </Card>
  );
}

/**
 * What you ate today (or another day): meals logged from "I made this", portions of tracked food and
 * quick entries, against your protein and calorie targets.
 */
export default function FoodLog() {
  const { c } = useTheme();
  const today = useToday();
  const [day, setDay] = useState(today);
  const entries = useFoodLog((s) => s.entries);
  const profile = useSettings((s) => s.profile);
  const targets = targetsFor(profile);
  const health = useHealth();
  const items = useInventory((s) => s.items);
  const [quick, setQuick] = useState(false);

  const shown = useMemo(() => entries.filter((e) => e.day === day).sort((a, b) => a.at - b.at), [entries, day]);
  const totals = dayTotals(entries, day);
  const activity = day === today ? todayActivity(health.days, today) : health.days.find((d) => d.day === day) ?? null;
  // Tracked food with figures, soonest to expire first: one tap logs a portion.
  const kitchen = useMemo(() => {
    const seen = new Set<string>();
    const out: { item: PantryItem; n: FoodNutrition }[] = [];
    for (const item of sortByExpiry(items.filter((i) => i.status === 'active'))) {
      const n = nutritionFor(item.name);
      if (!n || seen.has(n.food)) continue;
      seen.add(n.food);
      out.push({ item, n });
      if (out.length === 8) break;
    }
    return out;
  }, [items]);

  const logFood = (name: string) => {
    const n = nutritionFor(name);
    if (!n) {
      notify('No figures for this food', `Fridge Pulse has no nutrition figures for ${name}. Use Quick add to type them in.`);
      return;
    }
    logWithUndo({ ...entryFromFood(name, n), day });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalTop title="Food log" />

      <View style={styles.dayRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" onPress={() => setDay(addDays(day, -1))} style={styles.dayBtn} testID="log-prev-day">
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </Pressable>
        <Text variant="heading" testID="log-day">
          {dayLabel(day, today)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: day >= today }}
          disabled={day >= today}
          onPress={() => setDay(addDays(day, 1))}
          style={[styles.dayBtn, day >= today && { opacity: 0.3 }]}
        >
          <Ionicons name="chevron-forward" size={22} color={c.ink} />
        </Pressable>
      </View>

      <Card glow="blue" style={{ gap: 14 }} testID="log-totals">
        <MacroTiles macros={totals} />
        {targets ? (
          <View style={{ gap: 12 }}>
            <GoalBar testID="protein-bar" label="g protein" unit="g" value={totals.protein} target={targets.protein} color={c.blue} />
            {targets.kcal !== null ? <GoalBar testID="kcal-bar" label="kcal" unit="kcal" value={totals.kcal} target={targets.kcal} color={c.urgency.soon.solid} /> : null}
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/goals')} style={styles.link} testID="log-set-goals">
            <Text variant="bodyStrong" color={c.primary}>
              Set your protein goal
            </Text>
            <Ionicons name="arrow-forward" size={16} color={c.primary} />
          </Pressable>
        )}
        {activity ? (
          <Text variant="caption" muted style={{ fontSize: 14 }} testID="log-activity">
            {`${fmt(activity.steps)} steps · ${fmt(activity.activeKcal)} active kcal${activity.workouts > 0 ? ` · ${activity.workouts} ${activity.workouts === 1 ? 'workout' : 'workouts'}` : ''}`}
          </Text>
        ) : null}
      </Card>

      <View style={{ gap: 10 }}>
        {shown.length === 0 ? (
          <Text muted testID="log-empty">
            {day === today ? 'Nothing logged yet today. Tap "I made this" on a meal idea, or add food below.' : 'Nothing was logged on this day.'}
          </Text>
        ) : (
          shown.map((e, i) => {
            const t = entryTotals(e);
            return (
              <FadeIn key={e.id} delay={stagger(i, 40)}>
                <Card style={{ gap: 8 }} testID={`log-entry-${i}`}>
                  <View style={styles.entryTop}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="bodyStrong">{e.title}</Text>
                      <Text variant="caption" muted>
                        {`${e.portion === '1 serving' ? `${formatServings(e.servings)} ${e.servings === 1 ? 'serving' : 'servings'}` : `${formatServings(e.servings)} × ${e.portion}`} · ${fmt(t.kcal)} kcal · ${fmt(t.protein)} g protein`}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${e.title}`}
                      onPress={() => {
                        const gone = removeFromLog(e.id);
                        if (gone) {
                          const { id: _id, healthIds: _h, ...rest } = gone;
                          useSnackbar.getState().show({ message: `${gone.title} removed`, action: { label: 'Undo', onPress: () => logWithUndo(rest) } });
                        }
                      }}
                      style={styles.iconHit}
                    >
                      <Ionicons name="trash-outline" size={20} color={c.inkFaint} />
                    </Pressable>
                  </View>
                  <Stepper
                    label={`${formatServings(e.servings)} ${e.servings === 1 ? 'serving' : 'servings'}`}
                    onDecrement={() => changeServings(e.id, e.servings - 0.5)}
                    onIncrement={() => changeServings(e.id, e.servings + 0.5)}
                    decrementLabel="Half a serving less"
                    incrementLabel="Half a serving more"
                  />
                </Card>
              </FadeIn>
            );
          })
        )}
      </View>

      {kitchen.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" muted>
            From your kitchen
          </Text>
          <View style={styles.chips}>
            {kitchen.map(({ item, n }) => (
              <Pressable
                key={item.id}
                testID={`log-kitchen-${n.food}`}
                accessibilityRole="button"
                accessibilityLabel={`Log ${n.portion.label} of ${item.name}, ${portionMacros(n).kcal} kcal`}
                onPress={() => logFood(item.name)}
                style={({ pressed }) => [styles.kitchen, { backgroundColor: pressed ? c.border : c.surfaceAlt }]}
              >
                <Emoji size={16}>{emojiFor(item.name, item.category)}</Emoji>
                <Text variant="caption" style={{ fontSize: 14 }}>
                  {item.name}
                </Text>
                <Text variant="caption" muted>{`${portionMacros(n).kcal} kcal`}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Add food
        </Text>
        <AddItemField
          location="fridge"
          added={[]}
          placeholder="Type a food, like banana or eggs"
          caption={(s) => {
            const n = nutritionFor(s.name);
            return n ? `${portionMacros(n).kcal} kcal per ${n.portion.label}` : 'No figures yet';
          }}
          onAdd={(food) => logFood(food.name)}
        />
        {quick ? (
          <QuickAdd day={day} onDone={() => setQuick(false)} />
        ) : (
          <Button testID="quick-open" label="Quick add calories" icon="create-outline" variant="ghost" size="sm" onPress={() => setQuick(true)} style={{ alignSelf: 'flex-start' }} />
        )}
      </View>

      <Text variant="caption" faint>
        {health.connected && health.writeFood
          ? 'Food you log here is also saved to your health app.'
          : 'Your food log stays on this phone.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  entryTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10, marginTop: -10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kitchen: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, minHeight: 40 },
  quickRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
});
