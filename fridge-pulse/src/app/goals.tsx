import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { ModalTop } from '../components/ModalTop';
import { FadeIn } from '../components/motion';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import {
  ACTIVITY,
  cmToFeetInches,
  feetInchesToCm,
  GOALS,
  kgToLb,
  lbToKg,
  LIMITS,
  NO_PROFILE,
  parseNumber,
  targetsFor,
  type Activity,
  type Goal,
  type Profile,
  type Sex,
  type Units,
} from '../lib/goals';
import { useSettings } from '../store/settings';
import { radius, useTheme } from '../theme';

const SEXES: { value: Sex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/** A number box that keeps what is typed and saves only numbers inside the allowed range. */
function NumberField({
  label,
  unit,
  initial,
  range,
  onValid,
  testID,
}: {
  label: string;
  unit: string;
  initial: string;
  range: readonly [number, number];
  onValid: (n: number | null) => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const [text, setText] = useState(initial);
  const n = parseNumber(text);
  const bad = text.trim() !== '' && (n === null || n < range[0] || n > range[1]);
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 96 }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <View style={styles.fieldRow}>
        <Field
          testID={testID}
          value={text}
          onChangeText={(t) => {
            setText(t);
            const v = parseNumber(t);
            // Anything that is not a usable number clears the value, so the targets below never show
            // figures from a number typed on the way while the box itself says it is wrong.
            onValid(t.trim() !== '' && v !== null && v >= range[0] && v <= range[1] ? v : null);
          }}
          keyboardType="decimal-pad"
          accessibilityLabel={`${label} in ${unit}`}
          style={[{ flex: 1, minWidth: 0 }, bad ? { borderColor: c.danger } : null]}
          maxLength={6}
        />
        <Text muted>{unit}</Text>
      </View>
      {bad ? (
        <Text variant="caption" color={c.danger}>
          {`Between ${fmt(range[0])} and ${fmt(range[1])}`}
        </Text>
      ) : null}
    </View>
  );
}

/** Protein and calorie goals from body weight and a few optional details, kept on the device. */
export default function Goals() {
  const { c } = useTheme();
  const profile = useSettings((s) => s.profile);
  const save = (patch: Partial<Profile>) => useSettings.getState().set({ profile: { ...useSettings.getState().profile, ...patch } });
  const targets = targetsFor(profile);
  const imperial = profile.units === 'imperial';
  // The number boxes keep their own text; switching units starts them again from the saved values.
  const [unitsKey, setUnitsKey] = useState(0);
  const height = profile.heightCm !== null ? cmToFeetInches(profile.heightCm) : null;

  const setUnits = (units: Units) => {
    save({ units });
    setUnitsKey((k) => k + 1);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalTop title="Your goals" subtitle="How much protein, and energy, to aim for each day. These details stay on this phone." />

      <View style={styles.chips}>
        <Chip testID="units-metric" label="kg and cm" selected={!imperial} onPress={() => setUnits('metric')} />
        <Chip testID="units-imperial" label="lb and ft" selected={imperial} onPress={() => setUnits('imperial')} />
      </View>

      <View key={unitsKey} style={styles.row}>
        <NumberField
          testID="goal-weight"
          label="Weight"
          unit={imperial ? 'lb' : 'kg'}
          initial={profile.weightKg === null ? '' : imperial ? String(Math.round(kgToLb(profile.weightKg))) : oneDecimal(profile.weightKg)}
          range={imperial ? [Math.round(kgToLb(LIMITS.weightKg[0])), Math.round(kgToLb(LIMITS.weightKg[1]))] : LIMITS.weightKg}
          onValid={(v) => save({ weightKg: v === null ? null : imperial ? lbToKg(v) : v })}
        />
        <NumberField testID="goal-age" label="Age" unit="years" initial={profile.age === null ? '' : String(profile.age)} range={LIMITS.age} onValid={(v) => save({ age: v === null ? null : Math.round(v) })} />
      </View>

      <View key={`h${unitsKey}`} style={styles.row}>
        {imperial ? (
          <>
            <NumberField
              testID="goal-feet"
              label="Height"
              unit="ft"
              initial={height ? String(height.feet) : ''}
              range={[4, 7]}
              onValid={(v) => save({ heightCm: v === null ? null : feetInchesToCm(Math.round(v), height?.inches ?? 0) })}
            />
            <NumberField
              testID="goal-inches"
              label=" "
              unit="in"
              initial={height ? String(height.inches) : ''}
              range={[0, 11]}
              onValid={(v) => save({ heightCm: feetInchesToCm(height?.feet ?? 5, v === null ? 0 : Math.round(v)) })}
            />
          </>
        ) : (
          <NumberField
            testID="goal-height"
            label="Height"
            unit="cm"
            initial={profile.heightCm === null ? '' : String(Math.round(profile.heightCm))}
            range={LIMITS.heightCm}
            onValid={(v) => save({ heightCm: v })}
          />
        )}
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Sex (for the calorie formula only)
        </Text>
        <View style={styles.chips}>
          {SEXES.map((s) => (
            <Chip key={s.value} label={s.label} selected={profile.sex === s.value} onPress={() => save({ sex: s.value })} />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          How active are you?
        </Text>
        <View style={{ gap: 8 }}>
          {(Object.keys(ACTIVITY) as Activity[]).map((a) => {
            const on = profile.activity === a;
            return (
              <Pressable
                key={a}
                testID={`activity-${a}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => save({ activity: a })}
                style={[styles.option, { borderColor: on ? c.primaryFill : c.border, backgroundColor: on ? c.primaryTint : c.surface }]}
              >
                <Text variant="bodyStrong">{ACTIVITY[a].label}</Text>
                <Text variant="caption" muted>
                  {ACTIVITY[a].hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label" muted>
          Your goal
        </Text>
        <View style={styles.chips}>
          {(Object.keys(GOALS) as Goal[]).map((g) => (
            <Chip key={g} testID={`goal-${g}`} label={GOALS[g].label} selected={profile.goal === g} onPress={() => save({ goal: g })} />
          ))}
        </View>
      </View>

      <FadeIn>
        <Card glow="blue" style={{ gap: 10 }} testID="goals-result">
          {targets ? (
            <>
              <Text variant="label" color={c.primary}>
                Each day
              </Text>
              <Text variant="title" testID="protein-target">
                {fmt(targets.protein)} g protein
              </Text>
              <Text muted style={{ fontSize: 15, lineHeight: 22 }}>
                {`${targets.proteinPerKg} g per kg of body weight. Anywhere from ${fmt(targets.proteinRange[0])} to ${fmt(targets.proteinRange[1])} g suits most people with your goal.`}
              </Text>
              {targets.kcal !== null ? (
                <Text variant="heading" testID="kcal-target">
                  About {fmt(targets.kcal)} kcal
                </Text>
              ) : (
                <Text variant="caption" muted style={{ fontSize: 14 }}>
                  {targets.kcalMissing}
                </Text>
              )}
            </>
          ) : (
            <Text muted style={{ fontSize: 15, lineHeight: 22 }}>
              Add your weight to see how much protein to aim for. Add height and age for a calorie target too.
            </Text>
          )}
          <Text variant="caption" faint>
            General estimates for healthy adults, based on the protein RDA and sports nutrition guidance, and the Mifflin-St Jeor
            equation for energy. Not medical advice: if you are pregnant, under 18 or have a medical condition, ask a doctor or
            dietitian.
          </Text>
        </Card>
      </FadeIn>

      {profile.weightKg !== null || profile.heightCm !== null || profile.age !== null ? (
        <Button
          label="Clear my details"
          variant="ghost"
          size="sm"
          onPress={() => {
            useSettings.getState().set({ profile: { ...NO_PROFILE, units: profile.units } });
            setUnitsKey((k) => k + 1);
          }}
          style={{ alignSelf: 'flex-start' }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  option: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
});
