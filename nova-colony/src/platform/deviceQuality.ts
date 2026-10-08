/**
 * First-launch graphics level from device signals: a small, conservative and pure heuristic (`pickQuality`),
 * plus the one impure helper that reads those signals from the browser (`readDeviceSignals`, never throws).
 *
 * What the levels cost (render/Renderer.ts → applyQuality): low = pixel ratio 1, no shadows, no clouds, no
 * building lamps, half the particles; medium = pixel ratio ≤ 1.5, 3 lamps; high = pixel ratio ≤ 2 + sun shadows,
 * 4 lamps. So the pick is mostly "how much fill rate does this GPU have".
 *
 * Rules, first match wins:
 *   1. software rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render…)                → low
 *   2. navigator.deviceMemory ≤ 3 GB (Chromium rounds to 0.25/0.5/1/2/4/8, so this is ≤ 2) → low
 *   3. a clearly weak GPU family (Mali-4xx/T6xx/T7xx/G3x/G5x, Adreno ≤ 50x, old PowerVR)  → low
 *   4. a clearly strong GPU family (Apple, Adreno ≥ 640, Mali-G7x/G7xx/G9xx, Immortalis,
 *      Xclipse, desktop NVIDIA / AMD, Intel Iris / Arc)                                    → high, unless
 *        - the browser reports ≤ 2 CPU cores (iPhone 6s/7-class, tiny laptops), or
 *        - the string names a Mali with ≤ 4 shader cores ("MP3", "MC4": budget G7x parts), or
 *        - the high level would draw more than 6 MP (5K/4K Retina desktops, the biggest tablets)
 *      in which case → medium
 *   5. anything else: mid-range families (Adreno 51x–63x, Mali-G6x/G5xx/G6xx, Intel HD/UHD…), an unknown
 *      or hidden GPU name                                                                    → medium
 *
 * Mistakes are cheap in only one direction: too high stutters for ~20 s until the runtime governor
 * (qualityGovernor.ts) steps down, too low just looks plainer until the player raises it. So "high" needs a
 * positive match and "low" only catches what is clearly weak; everything in between starts at medium.
 *
 * OWNER: meta agent (platform). Tests: tests/quality.device.test.ts.
 */
import type { QualityLevel } from '../core/state';

/** Bump to make every auto-mode install re-run the pick once (only after changing the rules). */
export const PICK_VERSION = 1;

/** The high level renders at min(devicePixelRatio, 2); beyond this many megapixels it starts at medium. */
export const HIGH_PIXEL_BUDGET_MP = 6;

export interface DeviceSignals {
  /** Unmasked GPU renderer string ('' when the browser hides it). */
  gpu: string;
  /** navigator.deviceMemory in GB (Chromium only; undefined elsewhere). */
  memoryGB?: number;
  /** navigator.hardwareConcurrency (undefined when not reported). */
  cores?: number;
  /** window.devicePixelRatio. */
  dpr: number;
  /** screen.width / screen.height in CSS px (0 when unknown). */
  screenW: number;
  screenH: number;
  /** Phone or tablet (touch-first) rather than a desktop browser. */
  mobile: boolean;
}

export interface QualityPick {
  quality: QualityLevel;
  /** Human-readable why, for the console and bug reports. */
  reason: string;
}

// ------------------------------------------------------------------------------------------ GPU families

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|gdi generic/;

/** "Adreno (TM) 650" / "ANGLE (Qualcomm, Adreno (TM) 690 …" → 650 / 690; "642L" → 642. */
function adrenoNumber(g: string): number | null {
  const m = /adreno\D{0,8}(\d{3})/.exec(g);
  return m ? Number(m[1]) : null;
}

/** "Mali-G78" → 78, "Mali-G710" → 710 (null for Utgard/Midgard parts and non-Mali GPUs). */
function maliGNumber(g: string): number | null {
  const m = /mali-?g(\d{2,3})/.exec(g);
  return m ? Number(m[1]) : null;
}

/** Shader-core count when the string carries one ("Mali-G72 MP3", "Mali-G76 MC4"); null otherwise. */
function maliCores(g: string): number | null {
  if (!g.includes('mali')) return null;
  const m = /\bm[pc](\d{1,2})\b/.exec(g);
  return m ? Number(m[1]) : null;
}

/** A clearly weak GPU family, or null. `g` is lower-case. */
function weakGpu(g: string): string | null {
  let m: RegExpExecArray | null;
  // Mali Utgard (Mali-400 MP, Mali-450, Mali-470): GLES2-era, cheapest phones and TV boxes
  if ((m = /mali-?([1-4]\d\d)\b/.exec(g))) return `Mali-${m[1]}`;
  // first Midgard generations (Mali-T604…T760): 2012–2015 phones
  if ((m = /mali-?t([67]\d\d)/.exec(g))) return `Mali-T${m[1]}`;
  // entry Bifrost/Valhall: G31, G51, G52, G57 (Galaxy A1x/A0x, Helio G-series) and the G310
  const mg = maliGNumber(g);
  if (mg !== null) {
    const series = mg < 100 ? Math.floor(mg / 10) : Math.floor(mg / 100);
    if (mg < 100 ? series === 3 || series === 5 : series === 3) return `Mali-G${mg}`;
  }
  // Adreno 2xx/3xx/4xx and 504–509 (Snapdragon 4xx-class)
  const ad = adrenoNumber(g);
  if (ad !== null && ad < 510) return `Adreno ${ad}`;
  // old PowerVR: SGX (pre-2014), Rogue G6xxx/GX6xxx, and the GE8xxx in budget MediaTek Helio A/P parts
  if (g.includes('powervr') && (m = /\b(sgx ?\d*|g6\d{3}|gx6\d{3}|ge8\d{3})/.exec(g))) return `PowerVR ${m[1].toUpperCase()}`;
  return null;
}

/** A clearly strong GPU family, or null. `g` is lower-case. */
function strongGpu(g: string): string | null {
  let m: RegExpExecArray | null;
  // every iPhone/iPad reports "Apple GPU"; Macs report "Apple M1/M2…"
  if ((m = /\bapple (gpu|m\d+)/.exec(g))) return m[1] === 'gpu' ? 'Apple GPU' : `Apple ${m[1].toUpperCase()}`;
  const ad = adrenoNumber(g);
  if (ad !== null && ad >= 640) return `Adreno ${ad}`; // 6[4-9]x, 7xx, 8xx
  const mg = maliGNumber(g);
  if (mg !== null && (mg < 100 ? Math.floor(mg / 10) === 7 : mg >= 700)) return `Mali-G${mg}`; // G7x, G7xx, G9xx
  if (g.includes('immortalis')) return 'Immortalis';
  if (g.includes('xclipse')) return 'Xclipse'; // Samsung Exynos, AMD RDNA
  if (/nvidia|geforce|quadro|\brtx\b/.test(g) && !g.includes('tegra')) return 'NVIDIA';
  if (/\bamd\b|radeon|\bati\b/.test(g)) return 'AMD';
  if (g.includes('intel') && (m = /\b(iris|arc)\b/.exec(g))) return m[1] === 'iris' ? 'Intel Iris' : 'Intel Arc';
  return null;
}

/** Physical megapixels the high level would draw at full screen (pixel ratio capped at 2 like the renderer). */
export function highLevelMegapixels(sig: Pick<DeviceSignals, 'dpr' | 'screenW' | 'screenH'>): number {
  const r = Math.min(Math.max(sig.dpr || 1, 1), 2);
  return (sig.screenW * r * sig.screenH * r) / 1e6;
}

const shortName = (gpu: string): string => (gpu.length > 60 ? gpu.slice(0, 57) + '…' : gpu);

/** The first-launch graphics level for a device. Pure; see the rule table at the top of the file. */
export function pickQuality(sig: DeviceSignals): QualityPick {
  const gpu = (sig.gpu ?? '').trim();
  const g = gpu.toLowerCase();

  if (g && SOFTWARE_GPU.test(g)) return { quality: 'low', reason: `software renderer (${shortName(gpu)})` };
  if (sig.memoryGB !== undefined && sig.memoryGB <= 3) return { quality: 'low', reason: `${sig.memoryGB} GB device memory` };
  const weak = weakGpu(g);
  if (weak) return { quality: 'low', reason: `entry-level GPU (${weak})` };

  const strong = strongGpu(g);
  if (!strong) return { quality: 'medium', reason: gpu ? `mid-range or unrecognised GPU (${shortName(gpu)})` : 'GPU name hidden by the browser' };
  if (sig.cores !== undefined && sig.cores <= 2) return { quality: 'medium', reason: `${strong}, but only ${sig.cores} CPU cores` };
  const cores = maliCores(g);
  if (cores !== null && cores <= 4) return { quality: 'medium', reason: `${strong} with only ${cores} shader cores` };
  const mp = highLevelMegapixels(sig);
  if (mp > HIGH_PIXEL_BUDGET_MP) return { quality: 'medium', reason: `${strong}, but a ${mp.toFixed(1)} MP screen` };
  return { quality: 'high', reason: `strong GPU (${strong})` };
}

/**
 * Identity of the device an auto pick was made for (stored in `settings.qualityDevice`). Stable across launches and
 * driver updates (version numbers and PCI ids are stripped), different on another device — so a save restored from
 * the cloud or a recovery code onto a new phone gets its own pick instead of the old phone's level.
 */
export function deviceKey(sig: DeviceSignals): string {
  const gpu = (sig.gpu ?? '')
    .toLowerCase()
    .replace(/\(0x[0-9a-f]+\)/g, ' ')
    .replace(/\d+(?:\.\d+){2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `v${PICK_VERSION}|${sig.mobile ? 'm' : 'd'}|${sig.memoryGB ?? '?'}|${gpu || '?'}`;
}

// ------------------------------------------------------------------------------------------ browser signals

type AnyGl = WebGLRenderingContext | WebGL2RenderingContext;

/** WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL */
const UNMASKED_RENDERER_WEBGL = 0x9246;

/** The GPU's renderer string from a live WebGL context, or '' when the browser hides it. Never throws. */
export function gpuRendererString(gl: AnyGl | null | undefined): string {
  if (!gl) return '';
  try {
    // Firefox puts the (sanitised) real name in RENDERER and deprecates the debug extension; Chrome and Safari
    // answer "WebKit WebGL" there and give the real one only through WEBGL_debug_renderer_info
    const plain = String(gl.getParameter(gl.RENDERER) ?? '').trim();
    if (plain && !/^(webkit webgl|mozilla)$/i.test(plain)) return plain;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(UNMASKED_RENDERER_WEBGL) ?? '').trim() : '';
  } catch {
    return '';
  }
}

/** Phone or tablet? UA first (iPadOS Safari claims to be a Mac, but a Mac has no multi-touch screen). */
export function isMobileDevice(ua: string, maxTouchPoints: number, uaDataMobile = false, native = false, shortSide = 0): boolean {
  if (native || uaDataMobile) return true;
  if (/android|iphone|ipad|ipod|mobile|silk|kindle/i.test(ua)) return true;
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return true;
  return maxTouchPoints > 1 && shortSide > 0 && shortSide <= 600;
}

const posNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/**
 * Read the device signals the pick uses. Safe anywhere (Node tests, old WebViews): every read is guarded and a
 * missing value is simply left out, which steers the pick toward medium.
 */
export function readDeviceSignals(gl?: AnyGl | null, native = false): DeviceSignals {
  const sig: DeviceSignals = { gpu: '', dpr: 1, screenW: 0, screenH: 0, mobile: native };
  try {
    sig.gpu = gpuRendererString(gl);
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
      | (Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } })
      | undefined;
    const win = typeof window !== 'undefined' ? window : undefined;
    sig.memoryGB = posNum(nav?.deviceMemory);
    sig.cores = posNum(nav?.hardwareConcurrency);
    sig.dpr = posNum(win?.devicePixelRatio) ?? 1;
    sig.screenW = posNum(win?.screen?.width) ?? 0;
    sig.screenH = posNum(win?.screen?.height) ?? 0;
    sig.mobile = isMobileDevice(nav?.userAgent ?? '', nav?.maxTouchPoints ?? 0, !!nav?.userAgentData?.mobile, native, Math.min(sig.screenW, sig.screenH));
  } catch {
    /* keep what we have */
  }
  return sig;
}
