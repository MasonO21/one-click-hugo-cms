/** Crash reports stay off without a Sentry DSN, and carry nothing about the person when on. */
const mockSentry = { init: jest.fn(), captureException: jest.fn() };
jest.mock('@sentry/react-native', () => mockSentry);

type Module = typeof import('../src/lib/crashReports');
const g = globalThis as unknown as { __DEV__: boolean };

function load(dsn: string | undefined, dev = false): Module {
  const before = g.__DEV__;
  g.__DEV__ = dev;
  if (dsn === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  else process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
  let mod!: Module;
  jest.isolateModules(() => {
    mod = jest.requireActual('../src/lib/crashReports');
  });
  mod.startCrashReports();
  g.__DEV__ = before;
  return mod;
}

beforeEach(() => {
  mockSentry.init.mockClear();
  mockSentry.captureException.mockClear();
});
afterAll(() => {
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
});

it('sends nothing without a DSN, or in development', () => {
  load(undefined).reportError(new Error('boom'));
  load('https://key@o1.ingest.mockSentry.io/1', true).reportError(new Error('boom'));
  expect(mockSentry.init).not.toHaveBeenCalled();
  expect(mockSentry.captureException).not.toHaveBeenCalled();
});

it('starts with no personal data, drops log lines and strips the user', () => {
  const mod = load('https://key@o1.ingest.mockSentry.io/1');
  expect(mockSentry.init).toHaveBeenCalledTimes(1);
  const options = mockSentry.init.mock.calls[0][0];
  expect(options).toMatchObject({ dsn: 'https://key@o1.ingest.mockSentry.io/1', sendDefaultPii: false, attachScreenshot: false, attachViewHierarchy: false });
  expect(options.beforeBreadcrumb({ category: 'console', message: 'Saved Greek yogurt' })).toBeNull();
  expect(options.beforeBreadcrumb({ category: 'navigation' })).toEqual({ category: 'navigation' });
  expect(options.beforeSend({ message: 'x', user: { id: 'someone' } })).toEqual({ message: 'x' });
  const error = new Error('boom');
  mod.reportError(error);
  expect(mockSentry.captureException).toHaveBeenCalledWith(error);
});
