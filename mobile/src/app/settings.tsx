import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { notifyDataChanged } from '@/db/events';
import { deleteAllData, loadEverything } from '@/db/repository';
import { canRecognizeOnDevice } from '@/speech/expoEngine';
import { config } from '@/config';
import { useSettings } from '@/providers/SettingsProvider';
import { useDatabase } from '@/providers/useDatabase';
import { shareExport, type ExportKind } from '@/services/shareExport';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { warning } from '@/ui/haptics';
import { Screen } from '@/ui/Screen';
import { Segmented } from '@/ui/Segmented';
import { MIN_TOUCH, radius, spacing, usePalette } from '@/ui/theme';

export default function SettingsScreen() {
  const palette = usePalette();
  const db = useDatabase();
  const { settings, units, update } = useSettings();
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const onDeviceSupported = canRecognizeOnDevice();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  async function exportData(kind: ExportKind) {
    setExporting(kind);
    try {
      const result = await shareExport(kind, await loadEverything(db), units);
      if (result === 'unavailable') Alert.alert('Sharing is not available', 'This phone cannot share files from Trail Notes.');
    } catch {
      Alert.alert('Could not export', 'Something went wrong creating the file. Please try again.');
    } finally {
      setExporting(null);
    }
  }

  function confirmDeleteAll() {
    warning();
    Alert.alert(
      'Delete all notes?',
      'Every note and outing on this phone is deleted. Export first if you want a copy. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await deleteAllData(db);
            notifyDataChanged();
            Alert.alert('Deleted', 'All notes and outings were deleted from this phone.');
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Units">
          <AppText variant="bodyBold">Temperature</AppText>
          <Segmented
            label="Temperature unit"
            value={settings.temperatureUnit}
            onChange={(value) => update('temperatureUnit', value)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'c', label: '°C' },
              { value: 'f', label: '°F' },
            ]}
          />
          <AppText variant="bodyBold">Distance</AppText>
          <Segmented
            label="Distance unit"
            value={settings.distanceUnit}
            onChange={(value) => update('distanceUnit', value)}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'km', label: 'km' },
              { value: 'mi', label: 'mi' },
            ]}
          />
        </Section>

        <Section title="Recording">
          <SwitchRow
            label="Keep speech on this device"
            hint={
              onDeviceSupported
                ? 'Asks your phone to turn your voice into text without sending it online. If your language is not available this way, you can allow online recognition.'
                : 'This phone does not support on-device speech recognition, so your phone’s speech service may process your voice online.'
            }
            value={onDeviceSupported && settings.onDeviceSpeech}
            disabled={!onDeviceSupported}
            onChange={(value) => update('onDeviceSpeech', value)}
          />
          <SwitchRow
            label="Keep screen on during outings"
            hint="Tracking your route needs Trail Notes to stay open. This uses more battery."
            value={settings.keepScreenOn}
            onChange={(value) => update('keepScreenOn', value)}
          />
          <Button label="Open phone settings" variant="secondary" onPress={() => Linking.openSettings()} accessibilityHint="Change microphone and location permissions" />
        </Section>

        <Section title="Your data">
          <AppText tone="textMuted">Your notes are stored only on this phone. Export a copy to keep or move them.</AppText>
          <Button label="Export as text" icon="document-text-outline" variant="secondary" loading={exporting === 'markdown'} onPress={() => exportData('markdown')} />
          <Button label="Export everything (JSON)" icon="share-outline" variant="secondary" loading={exporting === 'json'} onPress={() => exportData('json')} />
          <Button label="Delete all notes" variant="danger" onPress={confirmDeleteAll} />
        </Section>

        <Section title="About">
          <AppText tone="textMuted">Trail Notes {version}</AppText>
          {config.privacyUrl ? <Button label="Privacy policy" variant="ghost" onPress={() => Linking.openURL(config.privacyUrl)} /> : null}
          {config.supportUrl ? <Button label="Contact support" variant="ghost" onPress={() => Linking.openURL(config.supportUrl)} /> : null}
          <View style={[styles.rule, { backgroundColor: palette.border }]} />
          <AppText variant="small" tone="textMuted">
            Weather comes from Open-Meteo. Place names come from your phone&apos;s built-in map service.
          </AppText>
        </Section>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

interface SwitchRowProps {
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

function SwitchRow({ label, hint, value, disabled, onChange }: SwitchRowProps) {
  const palette = usePalette();
  return (
    <View style={styles.switchRow}>
      <View style={styles.switchText}>
        <AppText variant="bodyBold">{label}</AppText>
        <AppText variant="small" tone="textMuted">
          {hint}
        </AppText>
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: palette.primary, false: palette.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl, padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
  section: { gap: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minHeight: MIN_TOUCH },
  switchText: { flex: 1, gap: 2 },
  rule: { height: 1, borderRadius: radius.sm },
});
