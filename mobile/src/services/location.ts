import * as Location from 'expo-location';
import { describePlace } from '@/domain/place';
import type { Fix } from '@/domain/track';

export type PermissionState = 'granted' | 'denied' | 'blocked';

function toPermissionState(response: Location.LocationPermissionResponse): PermissionState {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'denied' : 'blocked';
}

export async function getLocationPermission(): Promise<PermissionState> {
  return toPermissionState(await Location.getForegroundPermissionsAsync());
}

export async function requestLocationPermission(): Promise<PermissionState> {
  return toPermissionState(await Location.requestForegroundPermissionsAsync());
}

function toFix(location: Location.LocationObject): Fix {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

// Returns the current position, or null when there is no permission or no fix in time.
// Never prompts: ask with requestLocationPermission first.
export async function getCurrentFix(timeoutMs = 8000): Promise<Fix | null> {
  if ((await getLocationPermission()) !== 'granted') return null;

  const recent = await withTimeout(
    Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 200 }),
    1500,
  );
  if (recent) return toFix(recent);

  const current = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced }),
    timeoutMs,
  );
  return current ? toFix(current) : null;
}

export async function reverseGeocode(latitude: number, longitude: number, timeoutMs = 6000): Promise<string | null> {
  const addresses = await withTimeout(Location.reverseGeocodeAsync({ latitude, longitude }), timeoutMs);
  return describePlace(addresses);
}

// Follows the phone's position while the app is open.
export class LocationTracker {
  private subscription: Location.LocationSubscription | null = null;
  private starting = false;

  get isRunning(): boolean {
    return this.subscription !== null || this.starting;
  }

  async start(onFix: (fix: Fix) => void): Promise<void> {
    if (this.isRunning) return;
    this.starting = true;
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.LocationAccuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (location) => onFix(toFix(location)),
      );
      // stop() may have been called while the subscription was being created.
      if (this.starting) this.subscription = subscription;
      else subscription.remove();
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.starting = false;
    this.subscription?.remove();
    this.subscription = null;
  }
}

let promptedThisSession = false;

// Asks for location the first time a note is started, and not again until the app is
// reopened, so declining once does not turn into a prompt on every recording.
export async function promptForLocationOnce(): Promise<PermissionState> {
  const state = await getLocationPermission();
  if (state !== 'denied' || promptedThisSession) return state;
  promptedThisSession = true;
  return requestLocationPermission();
}
