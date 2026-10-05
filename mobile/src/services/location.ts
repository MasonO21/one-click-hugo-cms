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

export type RouteReadiness = 'ready' | 'services-off' | 'approximate';

// Recording a route needs the phone's location services on and precise location.
// With approximate location every fix is kilometers off, so the route would stay empty.
export async function checkRouteTracking(): Promise<RouteReadiness> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return 'services-off';
  } catch {
    // Unknown: let tracking try.
  }
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.ios?.accuracy === 'reduced' || permission.android?.accuracy === 'coarse') return 'approximate';
  } catch {
    // Unknown: let tracking try.
  }
  return 'ready';
}

function toFix(location: Location.LocationObject): Fix {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy,
    speed: location.coords.speed,
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

// Returns the place name, or null when the map service has no name for this spot (common
// in the backcountry). Throws when the service could not be reached in time, so the
// lookup can be tried again later.
export async function reverseGeocode(latitude: number, longitude: number, timeoutMs = 6000): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Place lookup timed out')), timeoutMs);
  });
  try {
    const addresses = await Promise.race([Location.reverseGeocodeAsync({ latitude, longitude }), timeout]);
    return describePlace(addresses);
  } finally {
    clearTimeout(timer);
  }
}

// Follows the phone's position while the app is open.
export class LocationTracker {
  private subscription: Location.LocationSubscription | null = null;
  // Each start() gets a number. A watch that finishes starting after stop() or a newer
  // start() is removed, so an old outing's callback can never stay live.
  private generation = 0;
  private starting = false;

  get isRunning(): boolean {
    return this.subscription !== null || this.starting;
  }

  async start(onFix: (fix: Fix) => void): Promise<void> {
    if (this.isRunning) return;
    const generation = ++this.generation;
    this.starting = true;
    try {
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.LocationAccuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (location) => onFix(toFix(location)),
      );
      if (generation === this.generation) this.subscription = subscription;
      else subscription.remove();
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }

  stop(): void {
    this.generation += 1;
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
