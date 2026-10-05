import { expoSpeechEngine } from '@/speech/expoEngine';
import { speechMock } from '@/test/speechMock';

const audio = speechMock.ExpoSpeechRecognitionModule.setAudioSessionActiveIOS;

beforeEach(() => {
  jest.useFakeTimers();
  audio.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('expoSpeechEngine.release', () => {
  it('hands the audio back, and again once the recognizer has shut down', () => {
    expoSpeechEngine.release?.();
    expect(audio).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(600);
    expect(audio).toHaveBeenCalledTimes(2);
    expect(audio).toHaveBeenLastCalledWith(false, { notifyOthersOnDeactivation: true });
  });

  it('does not take the audio from a recording that started in the meantime', () => {
    expoSpeechEngine.release?.();
    expoSpeechEngine.start({ lang: 'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: false, addsPunctuation: true, iosTaskHint: 'dictation' });
    jest.advanceTimersByTime(600);
    expect(audio).toHaveBeenCalledTimes(1);
  });

  it('keeps going if iOS refuses', () => {
    audio.mockImplementationOnce(() => {
      throw new Error('IsBusy');
    });
    expect(() => expoSpeechEngine.release?.()).not.toThrow();
    jest.advanceTimersByTime(600);
    expect(audio).toHaveBeenCalledTimes(2);
  });
});
