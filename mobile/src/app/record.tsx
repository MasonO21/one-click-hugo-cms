import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Animated, AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getLocales } from 'expo-localization';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Fix } from '@/domain/track';
import { formatDuration } from '@/domain/format';
import { useOuting } from '@/providers/OutingProvider';
import { useSettings } from '@/providers/SettingsProvider';
import { useDatabase } from '@/providers/useDatabase';
import { enrichers } from '@/services/enrichers';
import { enrichEntry, saveNewEntry } from '@/services/entries';
import { getCurrentFix, promptForLocationOnce } from '@/services/location';
import type { SessionResult, SpeechFailure } from '@/speech/controller';
import {
  canRecognizeOnDevice,
  expoSpeechEngine,
  getSpeechPermission,
  isSpeechAvailable,
  requestSpeechPermission,
  supportsContinuousRecognition,
} from '@/speech/expoEngine';
import { useSpeechSession } from '@/speech/useSpeechSession';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { success } from '@/ui/haptics';
import { goBack } from '@/ui/navigation';
import { Screen } from '@/ui/Screen';
import { radius, spacing, usePalette } from '@/ui/theme';

type Phase = 'checking' | 'listening' | 'saving' | 'needs-permission' | 'blocked' | 'unavailable' | 'nothing-heard' | 'failed';

interface Pending {
  text: string;
  durationS: number;
  fix: Fix | null;
}

export default function RecordScreen() {
  const router = useRouter();
  const palette = usePalette();
  const db = useDatabase();
  const outing = useOuting();
  const { settings, update } = useSettings();

  const [available] = useState(() => isSpeechAvailable());
  const [phase, setPhase] = useState<Phase>(available ? 'checking' : 'unavailable');
  const [failure, setFailure] = useState<SpeechFailure | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [unsaved, setUnsaved] = useState<Pending | null>(null);
  const fixPromise = useRef<Promise<Fix | null>>(Promise.resolve(null));
  const startedAt = useRef(0);
  // Set when the person leaves the screen. Work still running (permission checks, a
  // save waiting for GPS) must not start the microphone or navigate after that.
  const leaving = useRef(false);
  const saving = useRef(false);
  const [pulse] = useState(() => new Animated.Value(1));
  const [reduceMotion, setReduceMotion] = useState(false);
  const activeOutingId = outing.active?.id ?? null;

  const onDevice = useMemo(() => settings.onDeviceSpeech && canRecognizeOnDevice(), [settings.onDeviceSpeech]);
  const lang = getLocales()[0]?.languageTag ?? 'en-US';

  const save = useCallback(
    async (note: Pending, speechFailure: SpeechFailure | null) => {
      if (saving.current) return;
      saving.current = true;
      setPhase('saving');
      try {
        const entry = await saveNewEntry(db, {
          transcript: note.text,
          durationS: note.durationS,
          fix: note.fix,
          outingId: activeOutingId,
        });
        setUnsaved(null);
        enrichEntry(db, entry.id, enrichers).catch(() => undefined);
        success();
        if (!leaving.current) {
          goBack(router);
          if (speechFailure) Alert.alert('Saved what we heard', speechFailure.message);
        }
      } catch {
        setUnsaved(note);
        setFailure({ code: 'save', message: 'Your note could not be saved. Try saving it again.' });
        setPhase('failed');
      } finally {
        saving.current = false;
      }
    },
    [db, activeOutingId, router],
  );

  const onDone = useCallback(
    async (result: SessionResult) => {
      if (result.reason === 'cancelled') return;
      const text = result.text.trim();
      if (!text) {
        if (!result.failure && result.reason === 'interrupted') {
          setFailure({
            code: 'interrupted',
            message: 'Recording stopped because something else needed the microphone, such as a call. Try again when you are ready.',
          });
          setPhase('failed');
          return;
        }
        setFailure(result.failure);
        setPhase(result.failure ? 'failed' : 'nothing-heard');
        return;
      }
      // Show that the note is being saved while the location (if still coming) arrives.
      setPhase('saving');
      const fix = outing.latestFix() ?? (await fixPromise.current);
      await save({ text, durationS: result.durationMs / 1000, fix }, result.failure);
    },
    [outing, save],
  );

  const [continuous] = useState(() => supportsContinuousRecognition());
  const session = useSpeechSession({ lang, onDevice, continuous, engine: expoSpeechEngine, onDone });
  const { begin: beginListening, cancel: cancelListening, stop: stopListening, text: liveText } = session;

  const begin = useCallback(async () => {
    setFailure(null);
    // Ask for location before listening: the system prompt would interrupt the microphone.
    await promptForLocationOnce().catch(() => undefined);
    if (leaving.current) return;
    // Keep the outing's latest position now: if the person stands still while talking,
    // no newer one may arrive before the note is saved.
    const recent = outing.latestFix();
    fixPromise.current = recent ? Promise.resolve(recent) : getCurrentFix();
    startedAt.current = Date.now();
    setElapsed(0);
    // Before starting: if the recognizer fails to start, its error must win.
    setPhase('listening');
    beginListening();
  }, [outing, beginListening]);

  const checkPermission = useCallback(async () => {
    const permission = await getSpeechPermission();
    if (leaving.current) return;
    if (permission === 'granted') await begin();
    else setPhase(permission === 'blocked' ? 'blocked' : 'needs-permission');
  }, [begin]);

  const prepare = useCallback(async () => {
    if (!isSpeechAvailable()) {
      setPhase('unavailable');
      return;
    }
    await checkPermission();
  }, [checkPermission]);

  // Start listening as soon as the screen opens. Retries call prepare directly.
  useEffect(() => {
    if (!available) return;
    (async () => {
      try {
        await checkPermission();
      } catch {
        setPhase('unavailable');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function askForPermission() {
    const permission = await requestSpeechPermission().catch(() => 'denied' as const);
    if (leaving.current) return;
    if (permission === 'granted') await begin();
    else setPhase(permission === 'blocked' ? 'blocked' : 'needs-permission');
  }

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    return () => {
      leaving.current = true;
    };
  }, []);

  // After the person turns on the microphone in Settings and comes back, check again.
  const waitingForPermission = phase === 'blocked' || phase === 'needs-permission';
  useEffect(() => {
    if (!waitingForPermission) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') prepare().catch(() => setPhase('unavailable'));
    });
    return () => subscription?.remove();
  }, [waitingForPermission, prepare]);

  useEffect(() => {
    if (phase !== 'listening') return undefined;
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 500);
    activateKeepAwakeAsync('trailnotes-record').catch(() => undefined);
    return () => {
      clearInterval(timer);
      deactivateKeepAwake('trailnotes-record').catch(() => undefined);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'listening' || reduceMotion) {
      pulse.setValue(1);
      return undefined;
    }
    // A small decorative pulse: the JS driver is plenty and avoids native driver setup.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.1, duration: 900, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: false }),
      ]),
    );
    try {
      loop.start();
    } catch {
      // The animation is only decoration. Recording works without it.
    }
    return () => loop.stop();
  }, [phase, reduceMotion, pulse]);

  function close() {
    leaving.current = true;
    cancelListening();
    goBack(router);
  }

  function writeInstead() {
    leaving.current = true;
    cancelListening();
    // A note that could not be saved goes to the write screen instead of being lost.
    router.replace(unsaved ? { pathname: '/write', params: { text: unsaved.text } } : '/write');
  }

  const offerOnline =
    onDevice && (failure?.code === 'language-not-supported' || failure?.code === 'network' || failure?.code === 'service-not-allowed');
  const offerSettings = failure?.code === 'not-allowed' || (failure?.code === 'service-not-allowed' && !onDevice);

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {phase === 'listening' || phase === 'saving' || phase === 'checking' ? (
          <>
            <Animated.View
              style={[styles.mic, { backgroundColor: palette.primary, transform: [{ scale: pulse }] }]}
              accessible
              accessibilityLabel={phase === 'listening' ? 'Listening' : phase === 'saving' ? 'Saving' : 'Getting ready'}
            >
              <Ionicons name="mic" size={56} color={palette.onPrimary} />
            </Animated.View>

            <View accessibilityLiveRegion="polite" style={styles.status}>
              <AppText variant="heading">
                {phase === 'listening' ? 'Listening' : phase === 'saving' ? 'Saving your note' : 'Getting ready'}
              </AppText>
              {phase === 'listening' ? (
                <AppText tone="textMuted">{formatDuration(elapsed)}</AppText>
              ) : null}
            </View>

            {phase === 'listening' ? (
              <View style={[styles.transcript, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <AppText tone={liveText ? 'text' : 'textMuted'}>
                  {liveText || 'Start talking. Your words appear here.'}
                </AppText>
              </View>
            ) : null}

            {phase === 'listening' ? (
              <View style={styles.actions}>
                <Button label="Stop and save" icon="stop" onPress={stopListening} />
                <Button label="Cancel" variant="ghost" onPress={close} />
              </View>
            ) : null}
          </>
        ) : null}

        {phase === 'needs-permission' ? (
          <Message
            title="Allow the microphone"
            text="Trail Notes listens only while you are recording a note. Your phone will ask for permission to use the microphone and speech recognition."
          >
            <Button label="Allow microphone" onPress={askForPermission} />
            <Button label="Write a note instead" variant="secondary" onPress={writeInstead} />
            <Button label="Close" variant="ghost" onPress={close} />
          </Message>
        ) : null}

        {phase === 'blocked' ? (
          <Message
            title="Microphone is turned off"
            text="Turn on the microphone and speech recognition for Trail Notes in Settings to record by voice. You can still write notes."
          >
            <Button label="Open Settings" onPress={() => Linking.openSettings()} />
            <Button label="Write a note instead" variant="secondary" onPress={writeInstead} />
            <Button label="Close" variant="ghost" onPress={close} />
          </Message>
        ) : null}

        {phase === 'unavailable' ? (
          <Message
            title="Voice notes are not available"
            text="Speech recognition is not available on this phone right now. Check that it is turned on in your phone's settings, or write a note instead."
          >
            <Button label="Write a note" onPress={writeInstead} />
            <Button label="Close" variant="ghost" onPress={close} />
          </Message>
        ) : null}

        {phase === 'nothing-heard' ? (
          <Message title="We didn't catch anything" text="Hold the phone closer, or try again in a quieter spot.">
            <Button label="Try again" onPress={() => prepare()} />
            <Button label="Write a note instead" variant="secondary" onPress={writeInstead} />
            <Button label="Close" variant="ghost" onPress={close} />
          </Message>
        ) : null}

        {phase === 'failed' ? (
          <Message title="Something went wrong" text={failure?.message ?? 'Please try again.'}>
            {unsaved ? (
              <Button label="Save again" onPress={() => save(unsaved, null)} />
            ) : (
              <Button label="Try again" onPress={() => prepare()} />
            )}
            {offerOnline ? (
              <Button
                label="Allow online recognition"
                variant="secondary"
                accessibilityHint="Lets your phone's speech service process your voice online"
                onPress={async () => {
                  await update('onDeviceSpeech', false);
                  setPhase('checking');
                  // Give the new setting a render to take effect before listening again.
                  setTimeout(() => prepare().catch(() => setPhase('unavailable')), 0);
                }}
              />
            ) : null}
            {offerSettings ? <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} /> : null}
            <Button label="Write a note instead" variant="secondary" onPress={writeInstead} />
            <Button label="Close" variant="ghost" onPress={close} />
          </Message>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function Message({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <View style={styles.message}>
      <AppText variant="title" style={styles.centered} accessibilityRole="header">
        {title}
      </AppText>
      <AppText tone="textMuted" style={styles.centered}>
        {text}
      </AppText>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.xl, padding: spacing.xl },
  mic: { alignSelf: 'center', width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  status: { alignItems: 'center', gap: spacing.xs },
  transcript: { minHeight: 140, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1 },
  actions: { gap: spacing.md },
  message: { gap: spacing.lg },
  centered: { textAlign: 'center' },
});
