/**
 * Automatic graphics quality — the first-launch device pick (platform/deviceQuality.ts). Renderer strings are the
 * ones real browsers report through WEBGL_debug_renderer_info (Safari/WKWebView, Chrome/Android WebView, ANGLE on
 * desktop, Firefox's RENDERER).
 */
import { describe, expect, it } from 'vitest';
import { deviceKey, gpuRendererString, highLevelMegapixels, isMobileDevice, pickQuality, readDeviceSignals, type DeviceSignals } from '../src/platform/deviceQuality';

/** A typical phone: 412×915 CSS px at DPR 2.625, 8 cores, memory reported only by Chromium. */
const phone = (gpu: string, extra: Partial<DeviceSignals> = {}): DeviceSignals => ({ gpu, memoryGB: 8, cores: 8, dpr: 2.625, screenW: 412, screenH: 915, mobile: true, ...extra });
/** iOS: no deviceMemory. */
const iphone = (extra: Partial<DeviceSignals> = {}): DeviceSignals => ({ gpu: 'Apple GPU', cores: 6, dpr: 3, screenW: 390, screenH: 844, mobile: true, ...extra });
const desktop = (gpu: string, extra: Partial<DeviceSignals> = {}): DeviceSignals => ({ gpu, memoryGB: 8, cores: 8, dpr: 1, screenW: 1920, screenH: 1080, mobile: false, ...extra });

const q = (s: DeviceSignals) => pickQuality(s).quality;

describe('device pick: iPhone and iPad', () => {
  it('a current iPhone (Apple GPU, 6 cores) gets high', () => {
    expect(q(iphone())).toBe('high');
    expect(pickQuality(iphone()).reason).toMatch(/Apple GPU/);
  });

  it('an iPhone SE-sized screen with the same GPU still gets high', () => {
    expect(q(iphone({ dpr: 2, screenW: 375, screenH: 667 }))).toBe('high');
  });

  it('an old dual-core iPhone (6s/7 class) starts at medium', () => {
    expect(q(iphone({ cores: 2 }))).toBe('medium');
  });

  it('an iPad Pro 12.9" (5.6 MP at the high pixel ratio) stays high', () => {
    expect(q(iphone({ screenW: 1024, screenH: 1366, dpr: 2, cores: 8 }))).toBe('high');
  });

  it('an iPhone with the GPU name hidden falls back to medium', () => {
    expect(q(iphone({ gpu: '' }))).toBe('medium');
  });
});

describe('device pick: Pixel', () => {
  it.each([
    ['Pixel 8 (Tensor G3)', 'Mali-G715'],
    ['Pixel 7 (Tensor G2)', 'Mali-G710'],
    ['Pixel 6 (Tensor)', 'Mali-G78'],
    ['Pixel 9 via ANGLE', 'ANGLE (ARM, Mali-G715, OpenGL ES 3.2)'],
  ])('%s → high', (_name, gpu) => {
    expect(q(phone(gpu))).toBe('high');
  });

  it.each([
    ['Pixel 4a (Snapdragon 730G)', 'Adreno (TM) 618', 4],
    ['Pixel 3 (Snapdragon 845)', 'Adreno (TM) 630', 4],
  ])('%s → medium', (_name, gpu, mem) => {
    expect(q(phone(gpu, { memoryGB: mem }))).toBe('medium');
  });
});

describe('device pick: Galaxy', () => {
  it.each([
    ['Galaxy S23 (Snapdragon 8 Gen 2)', 'Adreno (TM) 740'],
    ['Galaxy S24 (Exynos 2400)', 'Samsung Xclipse 940'],
    ['Galaxy A55 (Exynos 1480)', 'Samsung Xclipse 530'],
    ['Galaxy S10 (Exynos 9820)', 'Mali-G76'],
    ['Galaxy S22 (Snapdragon 8 Gen 1)', 'Adreno (TM) 730'],
  ])('%s → high', (_name, gpu) => {
    expect(q(phone(gpu))).toBe('high');
  });

  it.each([
    ['Galaxy A54 (Exynos 1380)', 'Mali-G68', 8],
    ['Galaxy A35 (Exynos 1380)', 'Mali-G68', 4],
    ['Galaxy A52 (Snapdragon 720G)', 'Adreno (TM) 618', 4],
    ['Galaxy A25 (Exynos 1280)', 'Mali-G68', 4],
  ])('%s → medium', (_name, gpu, mem) => {
    expect(q(phone(gpu, { memoryGB: mem }))).toBe('medium');
  });

  it.each([
    ['Galaxy A15 (Helio G99)', 'Mali-G57', 4],
    ['Galaxy A14 (Helio G80)', 'Mali-G52', 4],
    ['Galaxy A13 (Exynos 850)', 'Mali-G52', 4],
    ['Galaxy A12 (Helio P35)', 'PowerVR Rogue GE8320', 4],
    ['Galaxy A10 (Exynos 7884, 2 GB)', 'Mali-G71', 2],
  ])('%s → low', (_name, gpu, mem) => {
    expect(q(phone(gpu, { memoryGB: mem, dpr: 2, screenW: 360, screenH: 800 }))).toBe('low');
  });

  it('a budget Mali-G7x whose string names only 2–4 shader cores starts at medium', () => {
    expect(q(phone('Mali-G72 MP3'))).toBe('medium');
    expect(q(phone('Mali-G76 MC4'))).toBe('medium');
    expect(q(phone('Mali-G78 MP14'))).toBe('high');
  });
});

describe('device pick: budget Mali / Adreno / PowerVR', () => {
  it.each([
    'Mali-400 MP',
    'Mali-450 MP',
    'Mali-T720',
    'Mali-T760',
    'Mali-G31',
    'Mali-G51',
    'Mali-G52 MC2',
    'Mali-G57 MC2',
    'Mali-G310',
    'Adreno (TM) 308',
    'Adreno (TM) 405',
    'Adreno (TM) 505',
    'Adreno (TM) 506',
    'PowerVR SGX 544MP',
    'PowerVR Rogue G6200',
    'PowerVR Rogue GX6250',
    'PowerVR Rogue GE8100',
  ])('%s → low (even with 4 GB)', (gpu) => {
    const p = pickQuality(phone(gpu, { memoryGB: 4 }));
    expect(p.quality).toBe('low');
    expect(p.reason).toMatch(/entry-level GPU/);
  });

  it.each(['Adreno (TM) 610', 'Adreno (TM) 512', 'Adreno (TM) 619', 'Mali-T880', 'Mali-G610', 'Mali-G615', 'PowerVR B-Series BXM-8-256', 'Maleoon 910'])(
    '%s → medium (mid-range or unknown)',
    (gpu) => {
      expect(q(phone(gpu, { memoryGB: 4 }))).toBe('medium');
    },
  );

  it.each(['Adreno (TM) 642L', 'Adreno (TM) 650', 'Adreno (TM) 690', 'Adreno (TM) 830', 'Immortalis-G720', 'Immortalis-G925'])('%s → high', (gpu) => {
    expect(q(phone(gpu))).toBe('high');
  });
});

describe('device pick: memory', () => {
  it('≤ 3 GB is low even with a GPU that would be high', () => {
    const p = pickQuality(phone('Adreno (TM) 650', { memoryGB: 2 }));
    expect(p.quality).toBe('low');
    expect(p.reason).toMatch(/2 GB/);
    expect(q(phone('Adreno (TM) 650', { memoryGB: 1 }))).toBe('low');
    expect(q(phone('Adreno (TM) 650', { memoryGB: 0.5 }))).toBe('low');
  });

  it('4 GB (what Chromium reports for 4–6 GB phones) does not lower anything', () => {
    expect(q(phone('Adreno (TM) 650', { memoryGB: 4 }))).toBe('high');
  });

  it('unknown memory (Safari, Firefox) is not held against the device', () => {
    expect(q(phone('Adreno (TM) 740', { memoryGB: undefined }))).toBe('high');
  });
});

describe('device pick: software renderers', () => {
  it.each([
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    'Google SwiftShader',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)',
    'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
  ])('%s → low', (gpu) => {
    const p = pickQuality(desktop(gpu, { memoryGB: 32, cores: 16 }));
    expect(p.quality).toBe('low');
    expect(p.reason).toMatch(/software/);
  });
});

describe('device pick: desktop', () => {
  it.each([
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (AMD, AMD Radeon RX 6700 XT (0x000073DF) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (ATI Technologies Inc., AMD Radeon Pro 5500M OpenGL Engine, OpenGL 4.1)',
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
    'NVIDIA GeForce GTX 980, or similar', // Firefox's sanitised RENDERER
  ])('%s → high', (gpu) => {
    expect(q(desktop(gpu))).toBe('high');
  });

  it.each([
    'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    'NVIDIA Tegra X1',
    'Qualcomm(R) Adreno(TM) X1-85 GPU',
  ])('%s → medium', (gpu) => {
    expect(q(desktop(gpu))).toBe('medium');
  });

  it('a 5K Retina screen (>6 MP at the high pixel ratio) starts a strong GPU at medium', () => {
    const imac = desktop('ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', { dpr: 2, screenW: 2560, screenH: 1440 });
    expect(highLevelMegapixels(imac)).toBeCloseTo(14.7, 1);
    expect(q(imac)).toBe('medium');
  });

  it('a dual-core laptop with Iris graphics starts at medium', () => {
    expect(q(desktop('Intel(R) Iris(R) Xe Graphics', { cores: 2 }))).toBe('medium');
  });

  it('a hidden GPU name ("WebKit WebGL" never reaches the pick) is medium', () => {
    expect(pickQuality(desktop('')).quality).toBe('medium');
    expect(pickQuality(desktop('')).reason).toMatch(/hidden/);
  });
});

describe('device key', () => {
  it('is stable across driver and API version bumps', () => {
    const a = deviceKey(desktop('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)'));
    const b = deviceKey(desktop('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.101.4502)'));
    expect(a).toBe(b);
    expect(deviceKey(desktop('llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(deviceKey(desktop('llvmpipe (LLVM 17.0.6, 256 bits)')));
  });

  it('differs between devices (a save restored onto another phone gets its own pick)', () => {
    expect(deviceKey(phone('Adreno (TM) 740'))).not.toBe(deviceKey(phone('Mali-G52', { memoryGB: 4 })));
    expect(deviceKey(phone('Mali-G68', { memoryGB: 4 }))).not.toBe(deviceKey(phone('Mali-G68', { memoryGB: 8 })));
    expect(deviceKey(iphone())).not.toBe(deviceKey(desktop('Apple GPU')));
  });

  it('is never empty, even with nothing known', () => {
    expect(deviceKey({ gpu: '', dpr: 1, screenW: 0, screenH: 0, mobile: false })).toMatch(/^v\d+\|d\|\?\|\?$/);
  });
});

describe('reading the signals', () => {
  /** A stand-in WebGL context: Chrome/Safari mask RENDERER, Firefox does not. */
  const fakeGl = (renderer: string, unmasked: string | null) =>
    ({
      RENDERER: 0x1f01,
      getParameter: (p: number) => (p === 0x1f01 ? renderer : p === 0x9246 ? unmasked : null),
      getExtension: (name: string) => (name === 'WEBGL_debug_renderer_info' && unmasked !== null ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    }) as unknown as WebGLRenderingContext;

  it('prefers the unmasked renderer when RENDERER is the generic "WebKit WebGL"', () => {
    expect(gpuRendererString(fakeGl('WebKit WebGL', 'Apple GPU'))).toBe('Apple GPU');
  });

  it("uses Firefox's RENDERER as is (no deprecated extension call)", () => {
    expect(gpuRendererString(fakeGl('Mali-G78, or similar', null))).toBe('Mali-G78, or similar');
  });

  it('returns "" when the name is hidden, missing or the context throws', () => {
    expect(gpuRendererString(fakeGl('WebKit WebGL', null))).toBe('');
    expect(gpuRendererString(null)).toBe('');
    const broken = { getParameter: () => { throw new Error('lost'); } } as unknown as WebGLRenderingContext;
    expect(gpuRendererString(broken)).toBe('');
  });

  it('detects phones and tablets, including iPadOS asking for the desktop site', () => {
    expect(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15', 5)).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36', 5)).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 5)).toBe(true);
    expect(isMobileDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15', 0)).toBe(false);
    expect(isMobileDevice('Mozilla/5.0 (X11; Linux x86_64) Chrome/126 Safari/537.36', 0)).toBe(false);
    expect(isMobileDevice('', 0, false, true)).toBe(true); // inside the Capacitor shell
  });

  it('works without a browser (Node): nothing known, nothing thrown', () => {
    const s = readDeviceSignals(null);
    expect(s.gpu).toBe('');
    expect(s.dpr).toBe(1);
    expect(pickQuality(s).quality).toBe('medium');
  });
});
