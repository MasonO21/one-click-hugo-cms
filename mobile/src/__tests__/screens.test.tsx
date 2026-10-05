import { Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import { act, cleanup, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { createEntry, createOuting, finishOuting, getEntry, listEntries, listOutings } from '@/db/repository';
import { loadSettings } from '@/db/settings';
import { freshDb, type TestDb } from '@/test/routerHarness';
import { speechMock } from '@/test/speechMock';

/* eslint-disable @typescript-eslint/no-require-imports */
let mockDb: TestDb;
const mockWatchers: ((location: unknown) => void)[] = [];
const mockPosition = () => ({
  coords: { latitude: 40.01, longitude: -105.27, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
  timestamp: Date.now(),
});

jest.mock('expo-sqlite', () => {
  const React = require('react');
  return {
    SQLiteProvider: ({ children, onInit }: { children: React.ReactNode; onInit?: (db: unknown) => Promise<void> }) => {
      const [ready, setReady] = React.useState(false);
      React.useEffect(() => {
        Promise.resolve(onInit?.(mockDb)).then(() => setReady(true));
      }, [onInit]);
      return ready ? children : null;
    },
    useSQLiteContext: () => mockDb,
  };
});
jest.mock('expo-location', () => ({
  LocationAccuracy: { Balanced: 3, High: 4 },
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getLastKnownPositionAsync: jest.fn(async () => mockPosition()),
  getCurrentPositionAsync: jest.fn(async () => mockPosition()),
  watchPositionAsync: jest.fn(async (_options: unknown, callback: (location: unknown) => void) => {
    mockWatchers.push(callback);
    return { remove: jest.fn() };
  }),
  reverseGeocodeAsync: jest.fn(async () => [
    { name: 'Chautauqua Park', street: null, streetNumber: null, district: null, city: 'Boulder', subregion: null, region: 'CO' },
  ]),
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', measurementSystem: 'us', temperatureUnit: 'fahrenheit' }],
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hideAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
  isLoaded: () => true,
  loadAsync: async () => undefined,
}));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
const mockWritten: { name: string; content: string }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string;
    name: string;
    constructor(_dir: string, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    write(content: string) {
      mockWritten.push({ name: this.name, content });
    }
  },
}));

const sharing = jest.requireMock('expo-sharing') as { shareAsync: jest.Mock };
const location = jest.requireMock('expo-location') as Record<string, jest.Mock>;
const keepAwake = jest.requireMock('expo-keep-awake') as { activateKeepAwakeAsync: jest.Mock; deactivateKeepAwake: jest.Mock };

const APP = './src/app';
const weatherResponse = { current: { temperature_2m: 9, weather_code: 2 } };

// Every handler in the app does async work (database, permissions), so each interaction
// is awaited inside act.
type Target = Parameters<typeof fireEvent.press>[0];
const press = (target: Target) =>
  act(async () => {
    fireEvent.press(target);
  });
const type = (target: Target, text: string) =>
  act(async () => {
    fireEvent.changeText(target, text);
  });
const fire = (target: Target, event: string, ...args: unknown[]) =>
  act(async () => {
    fireEvent(target, event, ...args);
  });

// Polls until a check passes, advancing the fake clock between tries. Each step is a
// separate act, so React never sees overlapping act scopes.
async function eventually(check: () => unknown, tries = 40) {
  let last: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      await check();
      return;
    } catch (error) {
      last = error;
    }
    await act(async () => {
      await jest.advanceTimersByTimeAsync(50);
    });
  }
  throw last;
}

async function openApp(url = '/') {
  const view = renderRouter(APP, { initialUrl: url });
  return view;
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  mockWatchers.length = 0;
  mockWritten.length = 0;
  speechMock.__reset();
  const granted = async () => ({ granted: true, canAskAgain: true });
  location.getForegroundPermissionsAsync.mockImplementation(granted);
  location.requestForegroundPermissionsAsync.mockImplementation(granted);
  location.getLastKnownPositionAsync.mockImplementation(async () => mockPosition());
  location.getCurrentPositionAsync.mockImplementation(async () => mockPosition());
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => weatherResponse })) as unknown as typeof fetch;
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(async () => {
  // Unmount before closing the database, and undo the fake timers renderRouter installs.
  cleanup();
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  jest.useRealTimers();
  alertSpy.mockRestore();
  jest.clearAllMocks();
  mockDb?.close();
});

describe('first launch', () => {
  it('shows the welcome screen, then the empty log', async () => {
    mockDb = await freshDb({ onboarded: false });
    await openApp();

    expect(await screen.findByText('Journal with your voice on the trail')).toBeOnTheScreen();
    expect(screen.getByText(/Notes are stored only on this device/)).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Get started' }));

    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Record' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write' })).toBeOnTheScreen();
    expect((await loadSettings(mockDb)).onboarded).toBe(true);
  });

  it('goes straight to the log once welcomed', async () => {
    mockDb = await freshDb();
    await openApp();
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(screen.queryByText('Journal with your voice on the trail')).toBeNull();
  });
});

describe('log', () => {
  it('lists notes by day with their tags, and searches and filters them', async () => {
    mockDb = await freshDb();
    const now = Date.now();
    await createEntry(mockDb, {
      transcript: 'Fog on the ridge and legs feel heavy.',
      createdAt: now - 1000,
      place: 'Chautauqua Park, Boulder',
      tempC: 9,
      weatherCode: 45,
      mood: 'tired',
    });
    await createEntry(mockDb, { transcript: 'Sunny summit, so happy to be here.', createdAt: now - 2000, weatherCode: 0, tempC: 15, mood: 'happy' });
    await openApp();

    expect(await screen.findByText('Fog on the ridge and legs feel heavy.')).toBeOnTheScreen();
    expect(screen.getByText('TODAY')).toBeOnTheScreen();
    expect(screen.getByText('Foggy · 48°F')).toBeOnTheScreen();
    expect(screen.getByText('Chautauqua Park, Boulder')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mood: Tired')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Show Tired notes' })).toBeOnTheScreen();

    await type(screen.getByLabelText('Search your notes'), 'summit');
    await eventually(() => expect(screen.queryByText('Fog on the ridge and legs feel heavy.')).toBeNull());
    expect(screen.getByText('Sunny summit, so happy to be here.')).toBeOnTheScreen();

    await type(screen.getByLabelText('Search your notes'), 'glacier');
    expect(await screen.findByText('Nothing found')).toBeOnTheScreen();
    await press(screen.getByRole('button', { name: 'Show all notes' }));
    expect(await screen.findByText('Fog on the ridge and legs feel heavy.')).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Show Happy notes' }));
    await eventually(() => expect(screen.queryByText('Fog on the ridge and legs feel heavy.')).toBeNull());
    expect(screen.getByText('Sunny summit, so happy to be here.')).toBeOnTheScreen();
  });

  it('opens an entry and edits, re-moods and deletes it', async () => {
    mockDb = await freshDb();
    const entry = await createEntry(mockDb, { transcript: 'Original words.', mood: null });
    await openApp();

    await press(await screen.findByRole('button', { name: /Original words/ }));
    const input = await screen.findByLabelText('Note text');
    expect(input.props.value).toBe('Original words.');

    await type(input, 'So happy with these new words.');
    await press(await screen.findByRole('button', { name: 'Save changes' }));
    await eventually(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
    expect((await getEntry(mockDb, entry.id))?.transcript).toBe('So happy with these new words.');
    expect((await getEntry(mockDb, entry.id))?.mood).toBe('happy');

    await press(screen.getByRole('button', { name: 'Change mood' }));
    await press(await screen.findByRole('button', { name: 'Calm' }));
    await eventually(async () => expect(await getEntry(mockDb, entry.id)).toMatchObject({ mood: 'calm', moodSource: 'user' }));

    // Editing the text later must not overwrite a mood the person chose.
    await type(screen.getByLabelText('Note text'), 'Exhausted and drained now.');
    await press(await screen.findByRole('button', { name: 'Save changes' }));
    await eventually(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
    expect((await getEntry(mockDb, entry.id))?.transcript).toBe('Exhausted and drained now.');
    expect((await getEntry(mockDb, entry.id))?.mood).toBe('calm');

    await press(screen.getByRole('button', { name: 'Delete note' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    await eventually(async () => expect(await getEntry(mockDb, entry.id)).toBeNull());
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
  });

  it('can add a missing place and weather to a note', async () => {
    mockDb = await freshDb();
    const entry = await createEntry(mockDb, { transcript: 'No signal earlier.', latitude: 40.01, longitude: -105.27 });
    await openApp(`/entry/${entry.id}`);

    await press(await screen.findByRole('button', { name: 'Add place and weather' }));
    await eventually(async () => expect(await getEntry(mockDb, entry.id)).toMatchObject({ place: 'Chautauqua Park, Boulder', weatherCode: 2, tempC: 9 }));
    expect(await screen.findByText('Partly cloudy · 48°F')).toBeOnTheScreen();
  });

  it('stops offering a retry when the map has no name for the spot', async () => {
    mockDb = await freshDb();
    location.reverseGeocodeAsync.mockImplementationOnce(async () => []);
    const entry = await createEntry(mockDb, { transcript: 'Deep in the woods.', latitude: 40.01, longitude: -105.27, weatherCode: 2, tempC: 9 });
    await openApp(`/entry/${entry.id}`);
    await press(await screen.findByRole('button', { name: 'Add place and weather' }));
    await eventually(() => expect(screen.queryByRole('button', { name: 'Add place and weather' })).toBeNull());
    expect(screen.queryByText(/Could not reach/)).toBeNull();
    expect((await getEntry(mockDb, entry.id))?.place).toBe('');
  });

  it('says so when a note has no location', async () => {
    mockDb = await freshDb();
    const entry = await createEntry(mockDb, { transcript: 'Indoors.' });
    await openApp(`/entry/${entry.id}`);
    expect(await screen.findByText(/No location was saved/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add place and weather' })).toBeNull();
  });

  it('shows a friendly message for a note that does not exist', async () => {
    mockDb = await freshDb();
    await openApp('/entry/999');
    expect(await screen.findByText('This note is gone')).toBeOnTheScreen();
  });

  it('labels the route of a note from an old outing', async () => {
    mockDb = await freshDb();
    // More outings than any fixed list would hold; the note belongs to the oldest one.
    await mockDb.execAsync(`
      WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 600)
      INSERT INTO outings (kind, name, started_at, ended_at, distance_m) SELECT 'hike', 'Hike ' || i, i * 1000, i * 1000 + 1, 5000 FROM n;
    `);
    await createEntry(mockDb, { transcript: 'From the very first hike.', outingId: 1 });
    await openApp();
    expect(await screen.findByText(/^Hike 1 · /)).toBeOnTheScreen();
  });

  it('keeps showing "Nothing found" while a search is refined', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Fog on the ridge.' });
    await openApp();
    await type(await screen.findByLabelText('Search your notes'), 'zz');
    await act(async () => jest.advanceTimersByTimeAsync(300));
    expect(await screen.findByText('Nothing found')).toBeOnTheScreen();
    await type(screen.getByLabelText('Search your notes'), 'zzz');
    expect(screen.queryByLabelText('Loading notes')).toBeNull();
    expect(screen.getByText('Nothing found')).toBeOnTheScreen();
  });

  it('treats a broken link to a note as gone', async () => {
    mockDb = await freshDb();
    await openApp('/entry/abc');
    expect(await screen.findByText('This note is gone')).toBeOnTheScreen();
  });

  it('treats a broken link to an outing as gone', async () => {
    mockDb = await freshDb();
    await openApp('/outing/xyz');
    expect(await screen.findByText('This outing is gone')).toBeOnTheScreen();
  });

  it('goes back to the same log from a note that is gone', async () => {
    mockDb = await freshDb();
    await openApp();
    await screen.findByText('No notes yet');
    await act(async () => {
      router.push('/entry/999');
    });
    await press(await screen.findByRole('button', { name: 'Back to your notes' }));
    await screen.findByText('No notes yet');
    expect(router.canGoBack()).toBe(false);
  });

  it('keeps the mood filter visible after its last note changes mood', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'So tired now.', mood: 'tired' });
    await createEntry(mockDb, { transcript: 'Such a happy day.', mood: 'happy' });
    await openApp();
    await press(await screen.findByRole('button', { name: 'Show Tired notes' }));
    await press(await screen.findByText('So tired now.'));
    await press(await screen.findByRole('button', { name: 'Change mood' }));
    await press(await screen.findByRole('button', { name: 'Calm' }));
    await act(async () => {
      router.back();
    });
    const chip = await screen.findByRole('button', { name: 'Show Tired notes' });
    expect(chip).toBeSelected();
    expect(await screen.findByText('Nothing found')).toBeOnTheScreen();
  });

  it('moves notes from Today to Yesterday when the app is opened the next morning', async () => {
    mockDb = await freshDb();
    const appStateListeners: ((state: string) => void)[] = [];
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const lateTonight = new Date();
    lateTonight.setHours(23, 50, 0, 0);
    await createEntry(mockDb, { transcript: 'Late walk.', createdAt: lateTonight.getTime() });
    await openApp();
    expect(await screen.findByText('TODAY')).toBeOnTheScreen();

    jest.setSystemTime(lateTonight.getTime() + 8 * 3600 * 1000);
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    expect(await screen.findByText('YESTERDAY')).toBeOnTheScreen();
    appStateSpy.mockRestore();
  });

  it('describes a note card and its tags to screen readers', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Fog on the ridge.', place: 'Chautauqua Park', mood: 'calm' });
    await openApp();
    expect(await screen.findByRole('button', { name: /\. Fog on the ridge\. Place: Chautauqua Park\. Mood: Calm$/ })).toBeOnTheScreen();
  });

  it('says clearly when the person chose no mood', async () => {
    mockDb = await freshDb();
    const entry = await createEntry(mockDb, { transcript: 'Just a note.', mood: 'happy' });
    await openApp(`/entry/${entry.id}`);
    await press(await screen.findByRole('button', { name: 'Change mood' }));
    await press(await screen.findByRole('button', { name: 'No mood' }));
    expect(await screen.findByText('You chose no mood for this note.')).toBeOnTheScreen();
    expect(screen.queryByText('No mood was picked up from this note.')).toBeNull();
  });
});

describe('unsaved words', () => {
  const discardPrompt = (title: string) =>
    (Alert.alert as jest.Mock).mock.calls.find(([t]) => t === title) as [string, string, { text: string; onPress?: () => void }[]] | undefined;

  it('asks before throwing away a typed note, and leaves when told to', async () => {
    mockDb = await freshDb();
    await openApp();
    await screen.findByText('No notes yet');
    await press(screen.getByRole('button', { name: 'Write' }));
    await type(await screen.findByLabelText('Your note'), 'Half a thought');
    await act(async () => {
      router.back();
    });
    const prompt = discardPrompt('Discard this note?');
    expect(prompt).toBeDefined();
    expect(screen.getByLabelText('Your note')).toBeOnTheScreen();

    await act(async () => {
      prompt?.[2].find((b) => b.text === 'Discard')?.onPress?.();
    });
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(await listEntries(mockDb)).toHaveLength(0);
  });

  it('leaves without asking after saving', async () => {
    mockDb = await freshDb();
    await openApp();
    await screen.findByText('No notes yet');
    await press(screen.getByRole('button', { name: 'Write' }));
    await type(await screen.findByLabelText('Your note'), 'Saved properly.');
    await press(screen.getByRole('button', { name: 'Save note' }));
    expect(await screen.findByText('Saved properly.')).toBeOnTheScreen();
    expect(discardPrompt('Discard this note?')).toBeUndefined();
  });

  it('asks before throwing away edits to a note', async () => {
    mockDb = await freshDb();
    const entry = await createEntry(mockDb, { transcript: 'Original.' });
    await openApp();
    await press(await screen.findByText('Original.'));
    await type(await screen.findByLabelText('Note text'), 'Original, with more.');
    await act(async () => {
      router.back();
    });
    expect(discardPrompt('Discard your changes?')).toBeDefined();
    expect(screen.getByLabelText('Note text')).toBeOnTheScreen();
    expect((await getEntry(mockDb, entry.id))?.transcript).toBe('Original.');
  });

  it('does not ask when the edited note is deleted', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Delete me.' });
    await openApp();
    await press(await screen.findByText('Delete me.'));
    await type(await screen.findByLabelText('Note text'), 'Delete me, edited.');
    await press(screen.getByRole('button', { name: 'Delete note' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
    expect(discardPrompt('Discard your changes?')).toBeUndefined();
  });
});

describe('writing a note', () => {
  it('saves once on a double tap', async () => {
    mockDb = await freshDb();
    await openApp('/write');
    await type(await screen.findByLabelText('Your note'), 'Double tap note.');
    const save = screen.getByRole('button', { name: 'Save note' });
    await press(save);
    await press(save);
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    await act(async () => jest.advanceTimersByTimeAsync(1000));
    expect(await listEntries(mockDb)).toHaveLength(1);
  });

  it('saves typed text with the mood, then adds place and weather', async () => {
    mockDb = await freshDb();
    await openApp('/write');

    const save = await screen.findByRole('button', { name: 'Save note' });
    expect(save).toBeDisabled();
    await type(screen.getByLabelText('Your note'), 'So happy to see the sunrise from the ridge.');
    await press(screen.getByRole('button', { name: 'Save note' }));

    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    const [entry] = await listEntries(mockDb);
    expect(entry).toMatchObject({ transcript: 'So happy to see the sunrise from the ridge.', mood: 'happy', latitude: 40.01, longitude: -105.27 });
    await eventually(async () => expect(await getEntry(mockDb, entry.id)).toMatchObject({ place: 'Chautauqua Park, Boulder', weatherCode: 2 }));
  });

  it('still saves when the weather service is unreachable', async () => {
    mockDb = await freshDb();
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await openApp('/write');
    await type(await screen.findByLabelText('Your note'), 'No signal out here.');
    await press(screen.getByRole('button', { name: 'Save note' }));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    const [entry] = await listEntries(mockDb);
    await eventually(async () => expect((await getEntry(mockDb, entry.id))?.place).toBe('Chautauqua Park, Boulder'));
    expect((await getEntry(mockDb, entry.id))?.weatherCode).toBeNull();
  });
});

describe('recording a note', () => {
  const result = (transcript: string, isFinal: boolean) => act(async () => speechMock.__emit('result', { results: [{ transcript }], isFinal }));

  it('listens, shows the words live, and saves them when stopped', async () => {
    mockDb = await freshDb();
    await openApp('/record');

    expect(await screen.findByText('Listening')).toBeOnTheScreen();
    expect(speechMock.ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US', continuous: true, interimResults: true, requiresOnDeviceRecognition: true, iosTaskHint: 'dictation' }),
    );

    await result('the fog is lifting', false);
    expect(await screen.findByText('The fog is lifting')).toBeOnTheScreen();
    await result('the fog is lifting off the ridge', true);

    await press(screen.getByRole('button', { name: 'Stop and save' }));
    expect(speechMock.ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
    await act(async () => speechMock.__emit('end'));

    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    const [entry] = await listEntries(mockDb);
    expect(entry.transcript).toBe('The fog is lifting off the ridge');
    // Music or a podcast paused by recording can resume.
    expect(speechMock.ExpoSpeechRecognitionModule.setAudioSessionActiveIOS).toHaveBeenCalledWith(false, { notifyOthersOnDeactivation: true });
    expect(entry.latitude).toBe(40.01);
    expect(await screen.findByText('No notes yet', {}, { timeout: 200 }).catch(() => null)).toBeNull();
    await eventually(async () => expect(await getEntry(mockDb, entry.id)).toMatchObject({ place: 'Chautauqua Park, Boulder', weatherCode: 2 }));
  });

  it('does not save when nothing was said', async () => {
    mockDb = await freshDb();
    await openApp('/record');
    await screen.findByText('Listening');
    await press(screen.getByRole('button', { name: 'Stop and save' }));
    await act(async () => speechMock.__emit('end'));
    expect(await screen.findByText("We didn't catch anything")).toBeOnTheScreen();
    expect(await listEntries(mockDb)).toHaveLength(0);
  });

  it('discards the recording on cancel', async () => {
    mockDb = await freshDb();
    await openApp('/record');
    await screen.findByText('Listening');
    await result('this should not be kept', true);
    await press(screen.getByRole('button', { name: 'Cancel' }));
    expect(speechMock.ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
    await eventually(() => expect(speechMock.__listenerCount()).toBe(0));
    expect(await listEntries(mockDb)).toHaveLength(0);
  });

  it('asks for the microphone first when permission has not been given', async () => {
    mockDb = await freshDb();
    speechMock.ExpoSpeechRecognitionModule.getPermissionsAsync.mockImplementation(async () => ({ granted: false, canAskAgain: true }));
    await openApp('/record');

    expect(await screen.findByText('Allow the microphone')).toBeOnTheScreen();
    expect(speechMock.ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    await press(screen.getByRole('button', { name: 'Allow microphone' }));
    expect(await screen.findByText('Listening')).toBeOnTheScreen();
    expect(speechMock.ExpoSpeechRecognitionModule.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('points to Settings when the microphone is blocked', async () => {
    mockDb = await freshDb();
    speechMock.ExpoSpeechRecognitionModule.getPermissionsAsync.mockImplementation(async () => ({ granted: false, canAskAgain: false }));
    await openApp('/record');
    expect(await screen.findByText('Microphone is turned off')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Open Settings' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Write a note instead' })).toBeOnTheScreen();
  });

  it('offers typing when speech recognition is unavailable', async () => {
    mockDb = await freshDb();
    speechMock.ExpoSpeechRecognitionModule.isRecognitionAvailable.mockImplementation(() => false);
    await openApp('/record');
    expect(await screen.findByText('Voice notes are not available')).toBeOnTheScreen();
    await press(screen.getByRole('button', { name: 'Write a note' }));
    expect(await screen.findByLabelText('Your note')).toBeOnTheScreen();
  });

  it('lets the person allow online recognition when on-device fails, and then listens again', async () => {
    mockDb = await freshDb();
    await openApp('/record');
    await screen.findByText('Listening');
    await act(async () => speechMock.__emit('error', { error: 'language-not-supported' }));

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    speechMock.ExpoSpeechRecognitionModule.start.mockClear();
    await press(screen.getByRole('button', { name: 'Allow online recognition' }));

    await eventually(() => expect(speechMock.ExpoSpeechRecognitionModule.start).toHaveBeenCalled());
    expect(speechMock.ExpoSpeechRecognitionModule.start).toHaveBeenLastCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
    expect((await loadSettings(mockDb)).onDeviceSpeech).toBe(false);
  });

  it('shows that it is saving right after Stop, even while the location is still coming', async () => {
    mockDb = await freshDb();
    location.getLastKnownPositionAsync.mockImplementation(async () => null);
    location.getCurrentPositionAsync.mockImplementation(() => new Promise(() => undefined));
    await openApp('/record');
    await screen.findByText('Listening');
    await result('short note at the creek', true);
    await press(screen.getByRole('button', { name: 'Stop and save' }));
    await act(async () => speechMock.__emit('end'));
    expect(await screen.findByText('Saving your note')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Stop and save' })).toBeNull();

    await act(async () => jest.advanceTimersByTimeAsync(9000));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    expect((await listEntries(mockDb))[0].latitude).toBeNull();
  });

  it('does not start the microphone if the person leaves while it is getting ready', async () => {
    mockDb = await freshDb();
    speechMock.ExpoSpeechRecognitionModule.getPermissionsAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ granted: true, canAskAgain: true }), 300)),
    );
    await openApp();
    await screen.findByText('No notes yet');
    await act(async () => {
      router.push('/record');
    });
    expect(await screen.findByText('Getting ready')).toBeOnTheScreen();
    await act(async () => {
      router.back();
    });
    await act(async () => jest.advanceTimersByTimeAsync(500));
    expect(speechMock.ExpoSpeechRecognitionModule.start).not.toHaveBeenCalled();
    expect(speechMock.__listenerCount()).toBe(0);
  });

  it('shows the problem when the recognizer cannot start', async () => {
    mockDb = await freshDb();
    speechMock.ExpoSpeechRecognitionModule.start.mockImplementationOnce(() => {
      throw new Error('cannot start');
    });
    await openApp('/record');
    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.queryByText('Listening')).toBeNull();
  });

  it('explains an interruption that came before any words', async () => {
    mockDb = await freshDb();
    await openApp('/record');
    await screen.findByText('Listening');
    await act(async () => speechMock.__emit('error', { error: 'interrupted' }));
    await act(async () => speechMock.__emit('end'));
    expect(await screen.findByText(/something else needed the microphone/)).toBeOnTheScreen();
  });

  it('checks the microphone again after the person comes back from Settings', async () => {
    mockDb = await freshDb();
    const appStateListeners: ((state: string) => void)[] = [];
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    speechMock.ExpoSpeechRecognitionModule.getPermissionsAsync.mockImplementation(async () => ({ granted: false, canAskAgain: false }));
    await openApp('/record');
    expect(await screen.findByText('Microphone is turned off')).toBeOnTheScreen();

    speechMock.ExpoSpeechRecognitionModule.getPermissionsAsync.mockImplementation(async () => ({ granted: true, canAskAgain: true }));
    await act(async () => appStateListeners.forEach((listener) => listener('active')));
    expect(await screen.findByText('Listening')).toBeOnTheScreen();
    appStateSpy.mockRestore();
  });

  it('starts listening once when permission dialogs make the app inactive and active', async () => {
    mockDb = await freshDb();
    const appStateListeners: ((state: string) => void)[] = [];
    const appStateSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListeners.push(listener as (state: string) => void);
      return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const module = speechMock.ExpoSpeechRecognitionModule;
    // System dialogs send the app to the background and back.
    const dialog = () => {
      appStateListeners.forEach((listener) => listener('inactive'));
      appStateListeners.forEach((listener) => listener('active'));
    };
    let micGranted = false;
    module.getPermissionsAsync.mockImplementation(async () => ({ granted: micGranted, canAskAgain: true }));
    module.requestPermissionsAsync.mockImplementation(async () => {
      micGranted = true;
      dialog();
      return { granted: true, canAskAgain: true };
    });
    // The first recording also asks for location, with its own dialog.
    let locationGranted = false;
    location.getForegroundPermissionsAsync.mockImplementation(async () => ({ granted: locationGranted, canAskAgain: true }));
    location.requestForegroundPermissionsAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            locationGranted = true;
            dialog();
            resolve({ granted: true, canAskAgain: true });
          }, 100);
        }),
    );
    await openApp('/record');
    await press(await screen.findByRole('button', { name: 'Allow microphone' }));
    expect(await screen.findByText('Listening')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTimeAsync(500));
    expect(module.start).toHaveBeenCalledTimes(1);
    expect(module.abort).not.toHaveBeenCalled();
    appStateSpy.mockRestore();
  });

  it('still saves the note when the location lookup fails', async () => {
    mockDb = await freshDb();
    location.getLastKnownPositionAsync.mockImplementation(async () => {
      throw new Error('location unavailable');
    });
    location.getCurrentPositionAsync.mockImplementation(async () => {
      throw new Error('location unavailable');
    });
    location.getForegroundPermissionsAsync.mockImplementation(async () => {
      throw new Error('permission check failed');
    });
    await openApp('/record');
    await screen.findByText('Listening');
    await result('the creek is high', true);
    await press(screen.getByRole('button', { name: 'Stop and save' }));
    await act(async () => speechMock.__emit('end'));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    expect((await listEntries(mockDb))[0].latitude).toBeNull();
  });

  it('carries a note that could not be saved over to writing', async () => {
    mockDb = await freshDb();
    const runAsync = mockDb.runAsync.bind(mockDb);
    let failNext = true;
    mockDb.runAsync = (async (source: string, ...params: never[]) => {
      if (failNext && source.includes('INSERT INTO entries')) {
        failNext = false;
        throw new Error('disk full');
      }
      return runAsync(source, ...params);
    }) as typeof mockDb.runAsync;
    await openApp('/record');
    await screen.findByText('Listening');
    await result('the lake is frozen', true);
    await press(screen.getByRole('button', { name: 'Stop and save' }));
    await act(async () => speechMock.__emit('end'));
    expect(await screen.findByRole('button', { name: 'Save again' })).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Write a note instead' }));
    expect(await screen.findByDisplayValue('The lake is frozen')).toBeOnTheScreen();
  });
});

describe('outings', () => {
  // Sends a GPS fix `seconds` after the first one, moving the clock forward to match.
  let fixStart = 0;
  const fixAt = async (latitude: number, seconds: number) => {
    if (seconds === 0) fixStart = Date.now();
    const wait = fixStart + seconds * 1000 - Date.now();
    if (wait > 0) await act(async () => jest.advanceTimersByTimeAsync(wait));
    await act(async () => {
      mockWatchers.at(-1)?.({ coords: { latitude, longitude: -105.27, accuracy: 5 }, timestamp: Date.now() });
    });
  };

  it('starts, tracks distance, and finishes an outing with notes attached', async () => {
    mockDb = await freshDb();
    await openApp();

    await press(await screen.findByRole('button', { name: 'Start hike' }));
    expect(await screen.findByText('Recording your route. Keep Trail Notes open while you are out.')).toBeOnTheScreen();
    expect(location.watchPositionAsync).toHaveBeenCalled();

    await fixAt(40.0, 0);
    await fixAt(40.001, 100);
    expect(await screen.findByText(/0\.1 mi/)).toBeOnTheScreen();

    // A note written during the outing belongs to it.
    await press(screen.getByRole('button', { name: 'Write' }));
    await type(await screen.findByLabelText('Your note'), 'Halfway up the climb.');
    await press(screen.getByRole('button', { name: 'Save note' }));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
    const [entry] = await listEntries(mockDb);
    const [outing] = await listOutings(mockDb);
    expect(entry.outingId).toBe(outing.id);

    await press(await screen.findByRole('button', { name: 'Finish outing' }));
    await eventually(async () => expect((await listOutings(mockDb))[0].endedAt).not.toBeNull());
    const [finished] = await listOutings(mockDb);
    expect(finished.distanceM).toBeGreaterThan(100);
    expect(await screen.findByLabelText('Outing name')).toBeOnTheScreen();
    expect(screen.getByText('Halfway up the climb.')).toBeOnTheScreen();
  });

  it('renames and deletes an outing but keeps its notes', async () => {
    mockDb = await freshDb();
    const outing = await createOuting(mockDb, { kind: 'run', startedAt: Date.now() - 3600000 });
    await finishOuting(mockDb, outing.id, { distanceM: 5000, track: [] });
    const entry = await createEntry(mockDb, { transcript: 'Felt strong the whole way.', outingId: outing.id });
    await openApp(`/outing/${outing.id}`);

    const name = await screen.findByLabelText('Outing name');
    await type(name, 'River loop');
    await fire(name, 'blur');
    await eventually(async () => expect((await listOutings(mockDb))[0].name).toBe('River loop'));

    await press(screen.getByRole('button', { name: 'Delete outing' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      buttons.find((b) => b.text === 'Delete')?.onPress?.();
    });
    await eventually(async () => expect(await listOutings(mockDb)).toHaveLength(0));
    expect(await getEntry(mockDb, entry.id)).toMatchObject({ outingId: null });
  });

  it('explains when location permission is refused', async () => {
    mockDb = await freshDb();
    location.requestForegroundPermissionsAsync.mockImplementation(async () => ({ granted: false, canAskAgain: false }));
    await openApp();
    await press(await screen.findByRole('button', { name: 'Start run' }));
    await eventually(() => expect(Alert.alert).toHaveBeenCalledWith('Location is turned off', expect.any(String), expect.any(Array)));
    expect(await listOutings(mockDb)).toHaveLength(0);
  });

  it('offers to continue or finish an outing that was left open', async () => {
    mockDb = await freshDb();
    const outing = await createOuting(mockDb, { kind: 'hike', startedAt: Date.now() - 30 * 60 * 1000 });
    await mockDb.runAsync('UPDATE outings SET distance_m = 800, track = ? WHERE id = ?', JSON.stringify([[40, -105.27, Date.now() - 10 * 60 * 1000]]), outing.id);
    await openApp();

    expect(await screen.findByText('Outing still open')).toBeOnTheScreen();
    await press(screen.getByRole('button', { name: 'Finish outing' }));
    await eventually(async () => expect((await listOutings(mockDb))[0].endedAt).not.toBeNull());
    expect(await screen.findByText('Heading out?')).toBeOnTheScreen();
  });

  it('quietly finishes an outing left open for more than half a day', async () => {
    mockDb = await freshDb();
    const outing = await createOuting(mockDb, { kind: 'hike', startedAt: Date.now() - 20 * 3600 * 1000 });
    await openApp();
    expect(await screen.findByText('Heading out?')).toBeOnTheScreen();
    await eventually(async () => expect((await listOutings(mockDb)).find((o) => o.id === outing.id)?.endedAt).not.toBeNull());
  });
});

describe('outing edge cases', () => {
  it('starts only one outing on a double tap', async () => {
    mockDb = await freshDb();
    await openApp();
    // The permission check takes a moment, so the second tap lands while the first is busy.
    location.requestForegroundPermissionsAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ granted: true, canAskAgain: true }), 300)),
    );
    const start = await screen.findByRole('button', { name: 'Start hike' });
    await press(start);
    await press(start);
    await act(async () => jest.advanceTimersByTimeAsync(400));
    expect(await screen.findByText('Recording your route. Keep Trail Notes open while you are out.')).toBeOnTheScreen();
    expect(await listOutings(mockDb)).toHaveLength(1);
  });

  it('applies the keep-screen-on setting to the outing in progress', async () => {
    mockDb = await freshDb();
    await openApp();
    await press(await screen.findByRole('button', { name: 'Start hike' }));
    await eventually(() => expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('trailnotes-outing'));

    await press(screen.getByRole('button', { name: 'Settings' }));
    await fire(await screen.findByLabelText('Keep screen on during outings'), 'valueChange', false);
    await eventually(() => expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith('trailnotes-outing'));
  });

  it('stops the outing when everything is deleted, so new notes still save', async () => {
    mockDb = await freshDb();
    await openApp();
    await press(await screen.findByRole('button', { name: 'Start hike' }));
    await screen.findByText('Recording your route. Keep Trail Notes open while you are out.');

    await press(screen.getByRole('button', { name: 'Settings' }));
    await press(await screen.findByRole('button', { name: 'Delete all notes' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete everything')?.onPress?.();
    });
    await act(async () => {
      router.back();
    });
    expect(await screen.findByText('Heading out?')).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Write' }));
    await type(await screen.findByLabelText('Your note'), 'After the reset.');
    await press(screen.getByRole('button', { name: 'Save note' }));
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(1));
  });

  it('shows a new name for the outing in progress', async () => {
    mockDb = await freshDb();
    await openApp();
    await press(await screen.findByRole('button', { name: 'Start hike' }));
    await screen.findByText('Recording your route. Keep Trail Notes open while you are out.');
    const [outing] = await listOutings(mockDb);

    await act(async () => {
      router.push(`/outing/${outing.id}`);
    });
    const name = await screen.findByLabelText('Outing name');
    await type(name, 'Mesa Trail');
    await fire(name, 'blur');
    await act(async () => {
      router.back();
    });
    expect(await screen.findByText('Mesa Trail')).toBeOnTheScreen();
  });

  it('stops offering to continue an open outing that was deleted', async () => {
    mockDb = await freshDb();
    const outing = await createOuting(mockDb, { kind: 'hike', startedAt: Date.now() - 30 * 60 * 1000 });
    await openApp();
    expect(await screen.findByText('Outing still open')).toBeOnTheScreen();

    await act(async () => {
      router.push(`/outing/${outing.id}`);
    });
    await press(await screen.findByRole('button', { name: 'Delete outing' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      await buttons.find((b) => /Delete/.test(b.text))?.onPress?.();
    });
    await eventually(async () => expect(await listOutings(mockDb)).toHaveLength(0));
    await act(async () => {
      if (router.canGoBack()) router.back();
    });
    expect(await screen.findByText('Heading out?')).toBeOnTheScreen();
    expect(screen.queryByText('Outing still open')).toBeNull();
  });

  it('ends a long-forgotten outing at its last note', async () => {
    mockDb = await freshDb();
    const startedAt = Date.now() - 20 * 3600 * 1000;
    const outing = await createOuting(mockDb, { kind: 'hike', startedAt });
    await createEntry(mockDb, { transcript: 'Summit.', outingId: outing.id, createdAt: startedAt + 3 * 3600 * 1000 });
    await openApp();
    await eventually(async () => expect((await listOutings(mockDb))[0].endedAt).toBe(startedAt + 3 * 3600 * 1000));
  });

  it('explains when only approximate location is allowed', async () => {
    mockDb = await freshDb();
    location.getForegroundPermissionsAsync.mockImplementation(async () => ({ granted: true, canAskAgain: true, ios: { scope: 'whenInUse', accuracy: 'reduced' } }));
    await openApp();
    await press(await screen.findByRole('button', { name: 'Start hike' }));
    await eventually(() => expect(Alert.alert).toHaveBeenCalledWith('Precise location is off', expect.any(String), expect.any(Array)));
    expect(await listOutings(mockDb)).toHaveLength(0);
  });
});

describe('settings', () => {
  it('changes units and the log follows', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Cold morning.', tempC: 9, weatherCode: 3 });
    await openApp();
    expect(await screen.findByText('Overcast · 48°F')).toBeOnTheScreen();

    await press(screen.getByRole('button', { name: 'Settings' }));
    await press(await screen.findByRole('radio', { name: '°C' }));
    await eventually(async () => expect((await loadSettings(mockDb)).temperatureUnit).toBe('c'));

    await act(async () => {
      router.back();
    });
    expect(await screen.findByText('Overcast · 9°C')).toBeOnTheScreen();
  });

  it('exports a text and a JSON copy through the share sheet', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Export me.', createdAt: new Date(2026, 8, 26, 7, 42).getTime(), mood: 'calm' });
    await openApp('/settings');

    await press(await screen.findByRole('button', { name: 'Export as text' }));
    await eventually(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(1));
    expect(mockWritten[0].name).toMatch(/^trail-notes-\d{4}-\d{2}-\d{2}\.md$/);
    expect(mockWritten[0].content).toContain('# Trail Notes');
    expect(mockWritten[0].content).toContain('Export me.');
    expect(mockWritten[0].content).toContain('Mood: Calm');

    await press(screen.getByRole('button', { name: 'Export everything (JSON)' }));
    await eventually(() => expect(sharing.shareAsync).toHaveBeenCalledTimes(2));
    const json = JSON.parse(mockWritten[1].content);
    expect(json.entries).toHaveLength(1);
    expect(json.entries[0]).toMatchObject({ transcript: 'Export me.', mood: 'calm' });
  });

  it('deletes everything only after confirmation', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Keep or delete.' });
    await openApp('/settings');

    await press(await screen.findByRole('button', { name: 'Delete all notes' }));
    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Delete all notes?');
    expect(await listEntries(mockDb)).toHaveLength(1);

    await act(async () => {
      await buttons.find((b) => b.text === 'Delete everything')?.onPress?.();
    });
    await eventually(async () => expect(await listEntries(mockDb)).toHaveLength(0));
  });

  it('shows the empty log after deleting everything while searching', async () => {
    mockDb = await freshDb();
    await createEntry(mockDb, { transcript: 'Fog everywhere.' });
    await openApp();
    await type(await screen.findByLabelText('Search your notes'), 'fog');
    await act(async () => jest.advanceTimersByTimeAsync(300));
    await press(screen.getByRole('button', { name: 'Settings' }));
    await press(await screen.findByRole('button', { name: 'Delete all notes' }));
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1) as [string, string, { text: string; onPress?: () => void }[]];
    await act(async () => {
      await buttons.find((b) => b.text === 'Delete everything')?.onPress?.();
    });
    await act(async () => {
      router.back();
    });
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen();
  });

  it('says there is nothing to export when there are no notes', async () => {
    mockDb = await freshDb();
    await openApp('/settings');
    await press(await screen.findByRole('button', { name: 'Export as text' }));
    await eventually(() => expect(Alert.alert).toHaveBeenCalledWith('Nothing to export yet', expect.any(String)));
    expect(sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('turns off the on-device speech switch', async () => {
    mockDb = await freshDb();
    await openApp('/settings');
    const toggle = await screen.findByLabelText('Keep speech on this device');
    await fire(toggle, 'valueChange', false);
    await eventually(async () => expect((await loadSettings(mockDb)).onDeviceSpeech).toBe(false));
  });
});
