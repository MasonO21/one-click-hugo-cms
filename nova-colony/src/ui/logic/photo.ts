/**
 * Photo Mode, the pure parts (DOM-free, unit-tested in tests/ui.photo.test.ts):
 *
 *  - the mode's phases and what the shutter, the preview and the back button do to them
 *  - the lighting presets (a day time handed to the renderer: visuals only, the sim's clock never moves)
 *  - the free camera: orbit / pan / pinch / twist gestures and the bounds it is kept in
 *  - the still's size (long side by graphics quality, capped by what the GPU can render)
 *  - the caption strip and the painted frame around the photo, the file name and the share text
 *
 * The DOM side is ui/photo/PhotoMode.ts (controls, gestures, preview sheet) and ui/photo/compose.ts (the 2D frame);
 * the renderer side is RendererApi.photo (render/api.ts).
 */
import { clamp } from '../../core/math';
import type { QualityLevel } from '../../core/state';

// ================================================================================================ phases

/**
 * off       : the game as usual
 * framing   : full-screen camera, HUD hidden, the player moves the camera and picks a light
 * capturing : the shutter fired: the still is being rendered and framed (input waits)
 * preview   : the framed photo with Share / Retake (and Download on the web)
 * sharing   : the OS share sheet (or the browser's) is up
 */
export type PhotoPhase = 'off' | 'framing' | 'capturing' | 'preview' | 'sharing';

export type PhotoEvent = 'enter' | 'shutter' | 'captured' | 'failed' | 'share' | 'shared' | 'retake' | 'exit';

/** Next phase for an event; an event that makes no sense in the current phase changes nothing. */
export function photoNext(phase: PhotoPhase, ev: PhotoEvent): PhotoPhase {
  switch (ev) {
    case 'enter':
      return phase === 'off' ? 'framing' : phase;
    case 'shutter':
      return phase === 'framing' ? 'capturing' : phase;
    case 'captured':
      return phase === 'capturing' ? 'preview' : phase;
    case 'failed':
      // a still that could not be made goes back to the camera; a share that failed back to the preview
      return phase === 'capturing' ? 'framing' : phase === 'sharing' ? 'preview' : phase;
    case 'share':
      return phase === 'preview' ? 'sharing' : phase;
    case 'shared':
      return phase === 'sharing' ? 'preview' : phase;
    case 'retake':
      return phase === 'preview' ? 'framing' : phase;
    case 'exit':
      // the ✕ (or back) leaves from the camera; the preview steps back to the camera first (photoBack)
      return phase === 'framing' || phase === 'preview' ? 'off' : phase;
  }
}

/**
 * Android back / Escape while Photo Mode is up: the preview closes first (back to the camera), then the mode ends.
 * While the shutter is busy or a share sheet is up the press is kept and nothing changes. `used: false` only when
 * Photo Mode is off (the rest of the back cascade decides).
 */
export function photoBack(phase: PhotoPhase): { next: PhotoPhase; used: boolean } {
  switch (phase) {
    case 'off':
      return { next: 'off', used: false };
    case 'preview':
      return { next: 'framing', used: true };
    case 'framing':
      return { next: 'off', used: true };
    default:
      return { next: phase, used: true };
  }
}

// ================================================================================================ lighting presets

export type PhotoPresetId = 'now' | 'golden' | 'midday' | 'night';

export interface PhotoPreset {
  id: PhotoPresetId;
  label: string;
  /** Emoji fallback for the chip. */
  icon: string;
  /** Painted HUD icon id (`hudArt`); 'now' shows the current day phase's icon instead. */
  hud: string | null;
  /**
   * Day time 0..1 the sky, sun, fog and night lights are drawn at (Atmosphere: 0 midnight, .25 sunrise, .5 noon,
   * .75 sunset), or null for the sim's own clock.
   */
  dayTime: number | null;
}

/**
 * Golden hour sits on the sunset side (the pinker sky) with the sun low and the first windows glowing; midday leaves
 * the sun a little east of noon so every box still shows a lit and a shaded side; night is the store screenshots'
 * night (dark enough for the lantern pools, still readable).
 */
export const PHOTO_PRESETS: readonly PhotoPreset[] = [
  { id: 'now', label: 'Now', icon: '🕰️', hud: null, dayTime: null },
  { id: 'golden', label: 'Golden hour', icon: '🌅', hud: 'sunset', dayTime: 0.72 },
  { id: 'midday', label: 'Midday', icon: '☀️', hud: 'day', dayTime: 0.45 },
  { id: 'night', label: 'Night lights', icon: '🏮', hud: 'night', dayTime: 0.94 },
];

export function photoPreset(id: string): PhotoPreset {
  return PHOTO_PRESETS.find((p) => p.id === id) ?? PHOTO_PRESETS[0];
}

/** The day time a preset shows right now ('now' follows the sim). */
export function presetDayTime(id: string, simDayTime: number): number {
  const p = photoPreset(id);
  return wrap01(p.dayTime ?? simDayTime);
}

function wrap01(t: number): number {
  return ((t % 1) + 1) % 1;
}

/**
 * One step of the light easing toward `target` (both day times 0..1) along the shorter way round the clock, so
 * switching chips sweeps the sun across the sky for a moment instead of cutting. `k` = fraction of the way (0..1).
 */
export function lightToward(from: number, target: number, k: number): number {
  const d = ((((target - from) % 1) + 1.5) % 1) - 0.5;
  if (Math.abs(d) < 1e-4) return wrap01(target);
  return wrap01(from + d * clamp(k, 0, 1));
}

// ================================================================================================ free camera

/** The free camera: ground target (world units), orbit yaw, distance and pitch (radians above the horizon). */
export interface PhotoCam {
  tx: number;
  tz: number;
  yaw: number;
  dist: number;
  pitch: number;
}

/** Where the camera may roam: within `radius` of where Photo Mode started and `edge` inside the world's border. */
export interface PhotoBounds {
  cx: number;
  cz: number;
  radius: number;
  /** Half the world size (the terrain spans -half..half). */
  half: number;
  edge: number;
}

export const PHOTO_CAM = {
  /** Close enough for a colonist's portrait, far enough for the whole late-game colony. */
  minDist: 5,
  maxDist: 85,
  /** Nearly at eye level (sky + horizon) up to almost straight down. */
  minPitch: 0.06,
  maxPitch: 1.32,
  /** Roaming radius around the starting point, and the margin kept from the end of the terrain. */
  radius: 120,
  edge: 24,
  /** Radians of yaw / pitch per pixel of one-finger drag (yaw matches the game's own camera drag). */
  orbitYaw: 0.0055,
  orbitPitch: 0.0045,
} as const;

export function photoBounds(cx: number, cz: number, half: number): PhotoBounds {
  return { cx, cz, radius: PHOTO_CAM.radius, half, edge: PHOTO_CAM.edge };
}

/** Keep the camera sane: distance and pitch in range, the target inside the roaming circle and the world. In place. */
export function clampPhotoCam(c: PhotoCam, b: PhotoBounds): PhotoCam {
  c.dist = clamp(Number.isFinite(c.dist) ? c.dist : 30, PHOTO_CAM.minDist, PHOTO_CAM.maxDist);
  c.pitch = clamp(Number.isFinite(c.pitch) ? c.pitch : 0.7, PHOTO_CAM.minPitch, PHOTO_CAM.maxPitch);
  if (!Number.isFinite(c.yaw)) c.yaw = 0;
  if (!Number.isFinite(c.tx)) c.tx = b.cx;
  if (!Number.isFinite(c.tz)) c.tz = b.cz;
  const dx = c.tx - b.cx;
  const dz = c.tz - b.cz;
  const d = Math.hypot(dx, dz);
  if (d > b.radius) {
    c.tx = b.cx + (dx / d) * b.radius;
    c.tz = b.cz + (dz / d) * b.radius;
  }
  const lim = Math.max(0, b.half - b.edge);
  c.tx = clamp(c.tx, -lim, lim);
  c.tz = clamp(c.tz, -lim, lim);
  return c;
}

/** One finger: drag sideways turns around the target (like the game's camera), up / down tilts. In place. */
export function orbitPhoto(c: PhotoCam, dx: number, dy: number): PhotoCam {
  c.yaw += dx * PHOTO_CAM.orbitYaw;
  // dragging down lifts the camera toward a top-down view (the ground follows the finger)
  c.pitch = clamp(c.pitch + dy * PHOTO_CAM.orbitPitch, PHOTO_CAM.minPitch, PHOTO_CAM.maxPitch);
  return c;
}

/**
 * Two fingers moving together: the ground follows the fingers. `viewH` = screen height in px, `fovDeg` = the
 * camera's vertical field of view. Up / down on an oblique view covers more ground, so it is scaled by 1/sin(pitch)
 * (capped, or a near-horizontal camera would fly off). In place.
 */
export function panPhoto(c: PhotoCam, dx: number, dy: number, viewH: number, fovDeg: number): PhotoCam {
  const perPx = (2 * c.dist * Math.tan(((fovDeg || 60) * Math.PI) / 360)) / Math.max(1, viewH);
  const deep = 1 / Math.max(0.35, Math.sin(c.pitch));
  const sy = Math.sin(c.yaw);
  const cy = Math.cos(c.yaw);
  // camera right on the ground = (cos yaw, -sin yaw); forward (away from the camera) = (-sin yaw, -cos yaw)
  c.tx += -cy * dx * perPx - sy * dy * perPx * deep;
  c.tz += sy * dx * perPx - cy * dy * perPx * deep;
  return c;
}

/** Pinch: fingers moving apart (d1 > d0) bring the camera closer. In place. */
export function pinchPhoto(c: PhotoCam, d0: number, d1: number): PhotoCam {
  if (d0 >= 1 && d1 >= 1) c.dist = clamp((c.dist * d0) / d1, PHOTO_CAM.minDist, PHOTO_CAM.maxDist);
  return c;
}

/** Mouse wheel / trackpad (desktop testing): positive deltaY zooms out. In place. */
export function wheelPhoto(c: PhotoCam, deltaY: number): PhotoCam {
  c.dist = clamp(c.dist * Math.exp(clamp(deltaY, -400, 400) * 0.0015), PHOTO_CAM.minDist, PHOTO_CAM.maxDist);
  return c;
}

// ================================================================================================ the still's size

/** Long side of the still by graphics quality (a phone's screen is ~2400 px tall; a share target rarely keeps more). */
export const PHOTO_LONG_SIDE: Readonly<Record<QualityLevel, number>> = { high: 2048, medium: 1600, low: 1280 };

export interface PhotoGlLimits {
  /** gl.MAX_TEXTURE_SIZE */
  maxTexture: number;
  /** gl.MAX_RENDERBUFFER_SIZE (the drawing buffer is a renderbuffer) */
  maxRenderbuffer?: number;
  /** gl.MAX_VIEWPORT_DIMS */
  maxViewport?: readonly [number, number];
}

/**
 * Pixel size of the still: the screen's aspect (what you framed is what you get) with the long side from the quality
 * level, scaled down as a whole when the GPU cannot render that big.
 */
export function captureSize(viewW: number, viewH: number, quality: QualityLevel, limits?: Partial<PhotoGlLimits>): { w: number; h: number } {
  const vw = Math.max(1, viewW || 1);
  const vh = Math.max(1, viewH || 1);
  const long = PHOTO_LONG_SIDE[quality] ?? PHOTO_LONG_SIDE.medium;
  const aspect = vw / vh;
  let w = aspect >= 1 ? long : long * aspect;
  let h = aspect >= 1 ? long / aspect : long;
  const cap = (v: number | undefined) => (v != null && v > 0 && Number.isFinite(v) ? v : Infinity);
  const capW = Math.min(cap(limits?.maxTexture), cap(limits?.maxRenderbuffer), cap(limits?.maxViewport?.[0]));
  const capH = Math.min(cap(limits?.maxTexture), cap(limits?.maxRenderbuffer), cap(limits?.maxViewport?.[1]));
  const k = Math.min(1, capW / w, capH / h);
  w = Math.max(1, Math.floor(w * k));
  h = Math.max(1, Math.floor(h * k));
  return { w, h };
}

// ================================================================================================ caption & frame

export interface PhotoCaption {
  /** The colony's name ("My colony" when it has none). */
  title: string;
  /** "Titanium tier · Day 42" */
  line: string;
  /** The little wordmark in the corner. */
  mark: string;
}

const MAX_TITLE = 28;

/** Trimmed, single-spaced, at most 28 characters (with an ellipsis). */
export function tidyName(name: string | null | undefined): string {
  const n = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (n.length <= MAX_TITLE) return n;
  return n.slice(0, MAX_TITLE - 1).trimEnd() + '…';
}

export function photoCaption(colonyName: string | null | undefined, tierName: string, day: number): PhotoCaption {
  const d = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const tier = String(tierName ?? '').trim();
  return {
    title: tidyName(colonyName) || 'My colony',
    line: tier ? `${tier} tier · Day ${d}` : `Day ${d}`,
    mark: 'Nova Colony',
  };
}

/** What goes into the share sheet with the picture. */
export function shareText(cap: PhotoCaption): { title: string; text: string; dialogTitle: string } {
  return { title: `${cap.title} · Nova Colony`, text: 'My colony on Nova Colony 🌱', dialogTitle: 'Share your photo' };
}

/** "nova-colony-new-hope-day-42.jpg" (+ "-<suffix>" when given: native cache files stay unique per shot). */
export function photoFileName(colonyName: string | null | undefined, day: number, suffix = '', ext = 'jpg'): string {
  const slug =
    tidyName(colonyName)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32)
      .replace(/-+$/g, '') || 'my-colony';
  const d = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const tail = suffix ? `-${suffix.replace(/[^a-z0-9]+/gi, '').slice(0, 12)}` : '';
  return `nova-colony-${slug}-day-${d}${tail}.${ext}`;
}

/**
 * The painted frame around a still of pw×ph px: a cream paper border, the photo with softly rounded corners, and
 * a caption strip under it (colony name, tier and day on the left, the wordmark on the right). Sizes scale with the
 * photo's short side so portrait and landscape shots get the same look.
 */
export interface FrameLayout {
  /** Whole picture. */
  w: number;
  h: number;
  /** Where the photo sits. */
  px: number;
  py: number;
  pw: number;
  ph: number;
  /** Photo corner radius and the gold rim's width. */
  radius: number;
  rim: number;
  /** Caption strip (below the photo). */
  stripY: number;
  stripH: number;
  /**
   * Decorated frames (a Wardrobe photo frame): the caption sits on a plate inside the strip, with a little border
   * below it. Null for the classic paper frame.
   */
  plate: { x: number; y: number; w: number; h: number } | null;
  /** Font sizes in px. */
  titlePx: number;
  linePx: number;
  markPx: number;
  /** Side of the little app icon next to the wordmark. */
  iconPx: number;
}

/**
 * `deco`: a decorated frame (knit, sakura, starry night…) gets a border about twice as wide for its pattern, and the
 * caption on a plate with a strip of border below it.
 */
export function frameLayout(pw: number, ph: number, deco = false): FrameLayout {
  const w0 = Math.max(1, Math.round(pw));
  const h0 = Math.max(1, Math.round(ph));
  const short = Math.min(w0, h0);
  const base = Math.max(8, Math.round(short * 0.036));
  const pad = deco ? Math.max(14, Math.round(short * 0.085)) : base;
  const stripH = Math.max(40, Math.round(short * 0.14));
  const below = deco ? Math.round(pad * 0.7) : 0;
  const gap = deco ? Math.round(pad * 0.35) : 0;
  return {
    w: w0 + pad * 2,
    h: h0 + pad + stripH + below,
    plate: deco ? { x: pad, y: pad + h0 + gap, w: w0, h: stripH - gap } : null,
    px: pad,
    py: pad,
    pw: w0,
    ph: h0,
    radius: Math.max(4, Math.round(base * (deco ? 0.7 : 0.45))),
    rim: Math.max(2, Math.round(base * 0.12)),
    stripY: pad + h0,
    stripH,
    titlePx: Math.max(14, Math.round(stripH * 0.34)),
    linePx: Math.max(10, Math.round(stripH * 0.2)),
    markPx: Math.max(10, Math.round(stripH * 0.19)),
    iconPx: Math.max(14, Math.round(stripH * 0.42)),
  };
}
