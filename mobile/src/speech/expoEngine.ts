import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { SpeechEngine, SpeechEvents, SpeechStartOptions } from './controller';

export const expoSpeechEngine: SpeechEngine = {
  start(options: SpeechStartOptions) {
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
