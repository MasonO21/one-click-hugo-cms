import { Alert } from 'react-native';
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
});

describe('writing a note', () => {
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
});

describe('outings', () => {
  const fixAt = (latitude: number, seconds: number) =>
    act(async () => {
      mockWatchers.at(-1)?.({ coords: { latitude, longitude: -105.27, accuracy: 5 }, timestamp: 1_000_000 + seconds * 1000 });
    });

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

  it('turns off the on-device speech switch', async () => {
    mockDb = await freshDb();
    await openApp('/settings');
    const toggle = await screen.findByLabelText('Keep speech on this device');
    await fire(toggle, 'valueChange', false);
    await eventually(async () => expect((await loadSettings(mockDb)).onDeviceSpeech).toBe(false));
  });
});
