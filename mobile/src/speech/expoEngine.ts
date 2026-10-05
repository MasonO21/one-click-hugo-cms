import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { SpeechEngine, SpeechEvents, SpeechStartOptions } from './controller';

// Counts recordings, so a delayed audio hand-back never cuts into a newer one.
let sessions = 0;
const RELEASE_RETRY_MS = 600;

function deactivateAudio() {
  try {
    ExpoSpeechRecognitionModule.setAudioSessionActiveIOS(false, { notifyOthersOnDeactivation: true });
  } catch {
    // Handing audio back is best effort.
  }
}

export const expoSpeechEngine: SpeechEngine = {
  start(options: SpeechStartOptions) {
    sessions += 1;
    ExpoSpeechRecognitionModule.start(options);
  },
  stop() {
    ExpoSpeechRecognitionModule.stop();
  },
  abort() {
    ExpoSpeechRecognitionModule.abort();
  },
  on<K extends keyof SpeechEvents>(event: K, handler: (payload: SpeechEvents[K]) => void) {
    const subscription = ExpoSpeechRecognitionModule.addListener(event, handler as never);
    return () => subscription.remove();
  },
  // The recognizer leaves the iOS audio session active after it stops, which keeps
  // music or a podcast that recording paused from resuming. Hand the audio back.
  release() {
    if (Platform.OS !== 'ios') return;
    deactivateAudio();
    // After Cancel the recognizer takes a moment to shut down, and iOS will not hand the
    // audio back while it is still in use. Try once more shortly after, unless a new
    // recording has started by then.
    const session = sessions;
    setTimeout(() => {
      if (session === sessions) deactivateAudio();
    }, RELEASE_RETRY_MS);
  },
};

export type SpeechPermission = 'granted' | 'denied' | 'blocked';

export async function requestSpeechPermission(): Promise<SpeechPermission> {
  const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (result.granted) return 'granted';
  return result.canAskAgain ? 'denied' : 'blocked';
}

export async function getSpeechPermission(): Promise<SpeechPermission> {
  const result = await ExpoSpeechRecognitionModule.getPermissionsAsync();
  if (result.granted) return 'granted';
  return result.canAskAgain ? 'denied' : 'blocked';
}

export function isSpeechAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export function canRecognizeOnDevice(): boolean {
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    return false;
  }
}

// Continuous recognition needs Android 13 (API 33) or newer. iOS supports it.
export function supportsContinuousRecognition(): boolean {
  return Platform.OS !== 'android' || Number(Platform.Version) >= 33;
}
