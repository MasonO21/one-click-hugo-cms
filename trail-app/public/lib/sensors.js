// Thin wrappers over the browser sensors. Everything degrades gracefully: no GPS -> use the
// simulator, no compass -> north-up arrow, no wake lock -> the OS may dim the screen.

import { normalizeDeg } from './geo.js';

export const hasGeolocation = () => 'geolocation' in navigator;

/** Stream of {lat,lng,ele,accuracy,heading,speed,t}. Returns a stop() function. */
export function watchPosition(onFix, onError) {
  if (!hasGeolocation()) {
    onError?.(new Error('Geolocation is not available in this browser'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords;
      onFix({
        lat: c.latitude,
        lng: c.longitude,
        ele: c.altitude ?? undefined,
        accuracy: c.accuracy,
        heading: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
        speed: c.speed ?? null,
        t: pos.timestamp,
      });
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Convert W3C device orientation angles to a compass heading for a phone held roughly flat. */
export function headingFromOrientation(e) {
  // iOS Safari reports a ready-made, tilt-compensated compass heading
  if (typeof e.webkitCompassHeading === 'number') return normalizeDeg(e.webkitCompassHeading);
  // Android / Chrome: only trust the absolute (magnetic-north) event, not the arbitrary-zero one
  if (e.absolute !== true || e.alpha == null) return null;
  return normalizeDeg(360 - e.alpha);
}

export class Compass {
  constructor() {
    this.heading = null;
    this.listeners = new Set();
    this.active = false;
    this.handler = (e) => {
      const h = headingFromOrientation(e);
      if (h == null) return;
      this.heading = h;
      for (const fn of this.listeners) fn(h);
    };
  }

  /** Must be called from a user gesture on iOS (permission prompt). Resolves to true if usable. */
  async start() {
    if (this.active) return true;
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientationabsolute', this.handler, true);
    window.addEventListener('deviceorientation', this.handler, true);
    this.active = true;
    return true;
  }

  stop() {
    window.removeEventListener('deviceorientationabsolute', this.handler, true);
    window.removeEventListener('deviceorientation', this.handler, true);
    this.active = false;
    this.heading = null;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

/** Keep the screen on while recording/guiding. Returns a release() function. */
export async function keepAwake() {
  let lock = null;
  const acquire = async () => {
    try {
      lock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      lock = null;
    }
  };
  await acquire();
  // the lock is dropped when the tab is hidden; take it again on return
  const onVis = () => document.visibilityState === 'visible' && acquire();
  document.addEventListener('visibilitychange', onVis);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    lock?.release?.().catch(() => {});
  };
}

/** Downscale a photo File to a small JPEG data URL (<= ~300 KB) suitable for a trail waypoint. */
export async function photoToDataUrl(file, maxSide = 960) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  for (let q = 0.75; q >= 0.3; q -= 0.15) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= 380_000) return url; // canvas re-encoding also strips EXIF (incl. GPS tags)
  }
  throw new Error('Photo is too large even after compression');
}
