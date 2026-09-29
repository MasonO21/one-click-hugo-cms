// A stand-in for expo-speech-recognition that tests can drive: register listeners like
// the real module, then call __emit to play back recognizer events.
type Handler = (payload: unknown) => void;

const handlers = new Map<string, Set<Handler>>();

export const speechMock = {
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)?.add(handler);
      return { remove: () => handlers.get(event)?.delete(handler) };
    }),
    requestPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
    isRecognitionAvailable: jest.fn(() => true),
    supportsOnDeviceRecognition: jest.fn(() => true),
  },
  __emit(event: string, payload: unknown = null) {
    [...(handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  },
  __listenerCount() {
    return [...handlers.values()].reduce((n, set) => n + set.size, 0);
  },
  __reset() {
    handlers.clear();
    const module = speechMock.ExpoSpeechRecognitionModule;
    module.start.mockClear();
    module.stop.mockClear();
    module.abort.mockClear();
    module.requestPermissionsAsync.mockImplementation(async () => ({ granted: true, canAskAgain: true }));
    module.getPermissionsAsync.mockImplementation(async () => ({ granted: true, canAskAgain: true }));
    module.isRecognitionAvailable.mockImplementation(() => true);
    module.supportsOnDeviceRecognition.mockImplementation(() => true);
  },
};
