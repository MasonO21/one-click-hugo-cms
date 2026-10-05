import type * as SentryModule from '@sentry/react-native';

/**
 * Crash reports, through Sentry. Off unless EXPO_PUBLIC_SENTRY_DSN is set at build time, and never in
 * development. Reports carry the error, the device model, the OS and app versions, and nothing about
 * the person: no user id, no IP address kept by the SDK, no food list, photos or health data.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() ?? '';

let sentry: typeof SentryModule | null = null;

export function startCrashReports(): void {
  if (sentry || !DSN || __DEV__) return;
  try {
    // Loaded only when reports are on, so a build without the native module still starts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require('@sentry/react-native') as typeof SentryModule;
    sentry.init({
      dsn: DSN,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      attachScreenshot: false,
      attachViewHierarchy: false,
      // Log lines can mention food names; the rest (navigation, network calls to our server) is kept.
      beforeBreadcrumb: (b) => (b.category === 'console' ? null : b),
      beforeSend: (event) => {
        delete event.user;
        return event;
      },
    });
  } catch {
    sentry = null;
  }
}

/** Sends an error the app caught (the error screen) when reports are on. */
export function reportError(error: unknown): void {
  sentry?.captureException(error);
}
