/**
 * Photo Mode, the pure parts (src/ui/logic/photo.ts): phases and back handling, lighting presets, the free camera's
 * gestures and bounds, the still's size, the caption / frame / file name. Plus the Photo tile, the HUD icon and the
 * "Say Cheese!" achievement wiring.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHOTO_CAM,
  PHOTO_LONG_SIDE,
  PHOTO_PRESETS,
  captureSize,
  clampPhotoCam,
  frameLayout,
  lightToward,
  orbitPhoto,
  panPhoto,
  photoBack,
  photoBounds,
  photoCaption,
  photoFileName,
  photoNext,
  pinchPhoto,
  presetDayTime,
  shareText,
  tidyName,
  wheelPhoto,
  type PhotoCam,
  type PhotoPhase,
} from '../src/ui/logic/photo';
import { backAction } from '../src/ui/logic/back';
import { hudArt } from '../src/ui/art';
import { createDataRegistry } from '../src/data';
import { makeGame } from './meta.helpers';

const cam = (o: Partial<PhotoCam> = {}): PhotoCam => ({ tx: 0, tz: 0, yaw: 0, dist: 30, pitch: 0.7, ...o });

describe('photo mode — phases', () => {
  it('walks framing -> capturing -> preview -> sharing -> preview -> framing -> off', () => {
    let p: PhotoPhase = 'off';
    p = photoNext(p, 'enter');
    expect(p).toBe('framing');
    p = photoNext(p, 'shutter');
    expect(p).toBe('capturing');
    p = photoNext(p, 'captured');
    expect(p).toBe('preview');
    p = photoNext(p, 'share');
    expect(p).toBe('sharing');
    p = photoNext(p, 'shared');
    expect(p).toBe('preview');
    p = photoNext(p, 'retake');
    expect(p).toBe('framing');
    p = photoNext(p, 'exit');
    expect(p).toBe('off');
  });

  it('ignores events that make no sense where it is', () => {
    expect(photoNext('off', 'shutter')).toBe('off');
    expect(photoNext('off', 'exit')).toBe('off');
    expect(photoNext('framing', 'enter')).toBe('framing');
    expect(photoNext('framing', 'captured')).toBe('framing');
    expect(photoNext('framing', 'share')).toBe('framing');
    expect(photoNext('preview', 'shutter')).toBe('preview');
    // a second tap while the shutter works or while the share sheet is up changes nothing
    expect(photoNext('capturing', 'shutter')).toBe('capturing');
    expect(photoNext('sharing', 'share')).toBe('sharing');
    // the ✕ is hidden while busy: nothing leaves mid-capture or mid-share
    expect(photoNext('capturing', 'exit')).toBe('capturing');
    expect(photoNext('sharing', 'exit')).toBe('sharing');
  });

  it('a failed still goes back to the camera, a failed share back to the preview', () => {
    expect(photoNext('capturing', 'failed')).toBe('framing');
    expect(photoNext('sharing', 'failed')).toBe('preview');
    expect(photoNext('preview', 'failed')).toBe('preview');
  });
});

describe('photo mode — back button', () => {
  it('closes the preview first, then leaves photo mode, then hands the press on', () => {
    expect(photoBack('preview')).toEqual({ next: 'framing', used: true });
    expect(photoBack('framing')).toEqual({ next: 'off', used: true });
    expect(photoBack('off')).toEqual({ next: 'off', used: false });
  });

  it('keeps the press while the shutter works or the share sheet is up', () => {
    expect(photoBack('capturing')).toEqual({ next: 'capturing', used: true });
    expect(photoBack('sharing')).toEqual({ next: 'sharing', used: true });
  });

  it('photo mode comes first in the back cascade (panels that opened meanwhile wait under it)', () => {
    expect(backAction({ photoMode: true, panelOpen: true, modalPending: true, cardShown: true, buildActive: true, hasSelection: true })).toBe('photo');
    expect(backAction({ photoMode: false, panelOpen: true, buildActive: false, hasSelection: false })).toBe('panel');
    expect(backAction({ panelOpen: false, buildActive: false, hasSelection: false })).toBe('none');
  });
});

describe('photo mode — lighting presets', () => {
  it('offers Now, Golden hour, Midday and Night lights', () => {
    expect(PHOTO_PRESETS.map((p) => p.label)).toEqual(['Now', 'Golden hour', 'Midday', 'Night lights']);
    expect(PHOTO_PRESETS[0].dayTime).toBeNull();
    for (const p of PHOTO_PRESETS.slice(1)) {
      expect(p.dayTime!).toBeGreaterThanOrEqual(0);
      expect(p.dayTime!).toBeLessThan(1);
      expect(hudArt(p.hud!), p.id).not.toBeNull();
    }
  });

  it('"Now" follows the sim clock, the others are fixed; the right times of day', () => {
    expect(presetDayTime('now', 0.31)).toBeCloseTo(0.31);
    expect(presetDayTime('now', 1.25)).toBeCloseTo(0.25);
    expect(presetDayTime('nope', 0.6)).toBeCloseTo(0.6); // unknown -> Now
    const golden = presetDayTime('golden', 0.1);
    expect(golden).toBeGreaterThan(0.7); // evening side of the clock (Atmosphere: .75 sunset)
    expect(golden).toBeLessThan(0.76);
    expect(Math.abs(presetDayTime('midday', 0.9) - 0.5)).toBeLessThan(0.08);
    const night = presetDayTime('night', 0.5);
    expect(night > 0.85 || night < 0.15).toBe(true);
  });

  it('never touches the sim clock (presets are data only)', () => {
    const g = makeGame();
    const before = g.game.state.time.dayTime;
    for (const p of PHOTO_PRESETS) presetDayTime(p.id, g.game.state.time.dayTime);
    expect(g.game.state.time.dayTime).toBe(before);
  });

  it('eases the light the short way round the clock', () => {
    expect(lightToward(0.2, 0.3, 0.5)).toBeCloseTo(0.25);
    // 0.94 -> 0.05 goes forward through midnight, not back through the whole day
    expect(lightToward(0.94, 0.04, 0.5)).toBeCloseTo(0.99);
    expect(lightToward(0.04, 0.94, 0.5)).toBeCloseTo(0.99);
    expect(lightToward(0.4, 0.73, 1)).toBeCloseTo(0.73);
    expect(lightToward(0.4, 0.73, 0)).toBeCloseTo(0.4);
    // arrived: snaps exactly onto the target
    expect(lightToward(0.73, 0.73, 0.1)).toBe(0.73);
  });
});

describe('photo mode — free camera', () => {
  const b = photoBounds(10, -20, 256);

  it('clamps distance, pitch and the roaming circle', () => {
    expect(clampPhotoCam(cam({ dist: 1 }), b).dist).toBe(PHOTO_CAM.minDist);
    expect(clampPhotoCam(cam({ dist: 999 }), b).dist).toBe(PHOTO_CAM.maxDist);
    expect(clampPhotoCam(cam({ pitch: -1 }), b).pitch).toBe(PHOTO_CAM.minPitch);
    expect(clampPhotoCam(cam({ pitch: 3 }), b).pitch).toBe(PHOTO_CAM.maxPitch);
    const far = clampPhotoCam(cam({ tx: 10 + 500, tz: -20 }), b);
    expect(Math.hypot(far.tx - 10, far.tz + 20)).toBeCloseTo(PHOTO_CAM.radius);
    // never off the end of the terrain, even inside the roaming circle
    const edge = clampPhotoCam(cam({ tx: 250, tz: 250 }), photoBounds(220, 220, 256));
    expect(edge.tx).toBeLessThanOrEqual(256 - PHOTO_CAM.edge);
    expect(edge.tz).toBeLessThanOrEqual(256 - PHOTO_CAM.edge);
  });

  it('repairs broken numbers instead of flying off', () => {
    const c = clampPhotoCam(cam({ tx: NaN, tz: Infinity, yaw: NaN, dist: NaN, pitch: NaN }), b);
    for (const v of Object.values(c)) expect(Number.isFinite(v)).toBe(true);
  });

  it('one finger: sideways turns (same sign as the game camera), down tilts toward top-down', () => {
    const c = orbitPhoto(cam({ yaw: 1 }), 100, 0);
    expect(c.yaw).toBeCloseTo(1 + 100 * PHOTO_CAM.orbitYaw);
    expect(orbitPhoto(cam({ pitch: 0.7 }), 0, 50).pitch).toBeGreaterThan(0.7);
    expect(orbitPhoto(cam({ pitch: 0.7 }), 0, -50).pitch).toBeLessThan(0.7);
    expect(orbitPhoto(cam({ pitch: 0.7 }), 0, 10000).pitch).toBe(PHOTO_CAM.maxPitch);
  });

  it('two fingers: the ground follows the fingers', () => {
    // yaw 0: the camera stands at +z looking toward -z, screen right = +x
    const right = panPhoto(cam(), 100, 0, 800, 60);
    expect(right.tx).toBeLessThan(0); // dragging right moves the view left (the world follows the finger)
    expect(right.tz).toBeCloseTo(0);
    const down = panPhoto(cam(), 0, 100, 800, 60);
    expect(down.tz).toBeLessThan(0); // dragging down reveals what is further away (toward -z)
    expect(down.tx).toBeCloseTo(0);
    // further away = the same drag covers more ground
    expect(Math.abs(panPhoto(cam({ dist: 60 }), 100, 0, 800, 60).tx)).toBeCloseTo(2 * Math.abs(right.tx));
    // turned half way round, the same drag goes the other way
    expect(panPhoto(cam({ yaw: Math.PI }), 100, 0, 800, 60).tx).toBeGreaterThan(0);
  });

  it('pinch: spreading the fingers comes closer; the wheel zooms out with positive delta', () => {
    expect(pinchPhoto(cam({ dist: 40 }), 100, 200).dist).toBeCloseTo(20);
    expect(pinchPhoto(cam({ dist: 40 }), 200, 100).dist).toBeCloseTo(80);
    expect(pinchPhoto(cam({ dist: 40 }), 0, 100).dist).toBe(40); // degenerate pinch ignored
    expect(pinchPhoto(cam({ dist: 40 }), 100, 10000).dist).toBe(PHOTO_CAM.minDist);
    expect(wheelPhoto(cam({ dist: 30 }), 100).dist).toBeGreaterThan(30);
    expect(wheelPhoto(cam({ dist: 30 }), -100).dist).toBeLessThan(30);
  });
});

describe('photo mode — the still', () => {
  it('keeps the screen aspect with a 2048 px long side on high quality', () => {
    expect(captureSize(393, 852, 'high')).toEqual({ w: Math.floor((2048 * 393) / 852), h: 2048 });
    expect(captureSize(852, 393, 'high')).toEqual({ w: 2048, h: Math.floor((2048 * 393) / 852) });
    expect(captureSize(1000, 1000, 'high')).toEqual({ w: 2048, h: 2048 });
  });

  it('smaller on lower graphics quality', () => {
    expect(PHOTO_LONG_SIDE.high).toBe(2048);
    expect(captureSize(393, 852, 'medium').h).toBe(PHOTO_LONG_SIDE.medium);
    expect(captureSize(393, 852, 'low').h).toBe(PHOTO_LONG_SIDE.low);
    expect(PHOTO_LONG_SIDE.low).toBeLessThan(PHOTO_LONG_SIDE.medium);
    expect(PHOTO_LONG_SIDE.medium).toBeLessThan(PHOTO_LONG_SIDE.high);
  });

  it('never bigger than the GPU can render (texture, renderbuffer and viewport caps), aspect kept', () => {
    const s = captureSize(393, 852, 'high', { maxTexture: 1024 });
    expect(s.h).toBe(1024);
    expect(s.w).toBe(Math.floor((1024 * 393) / 852));
    expect(captureSize(852, 393, 'high', { maxTexture: 4096, maxRenderbuffer: 1500 }).w).toBe(1500);
    const vp = captureSize(1000, 500, 'high', { maxTexture: 8192, maxViewport: [4096, 800] });
    expect(vp.h).toBe(800);
    expect(vp.w).toBe(1600);
    // nonsense caps are ignored
    expect(captureSize(393, 852, 'high', { maxTexture: 0, maxRenderbuffer: NaN }).h).toBe(2048);
  });

  it('survives a zero-sized view', () => {
    const s = captureSize(0, 0, 'high');
    expect(s.w).toBeGreaterThan(0);
    expect(s.h).toBeGreaterThan(0);
  });
});

describe('photo mode — caption, frame, file name, share text', () => {
  it('colony name, tier and day', () => {
    expect(photoCaption('New Hope', 'Titanium', 42)).toEqual({ title: 'New Hope', line: 'Titanium tier · Day 42', mark: 'Nova Colony' });
    expect(photoCaption('  ', 'Wood', 1).title).toBe('My colony');
    expect(photoCaption(undefined, 'Stone', 3.7).line).toBe('Stone tier · Day 3');
    expect(photoCaption('A', '', 0).line).toBe('Day 1');
  });

  it('long names are trimmed with an ellipsis', () => {
    const t = tidyName('The   Very Long Name Of A Colony That Goes On');
    expect(t.length).toBeLessThanOrEqual(28);
    expect(t.endsWith('…')).toBe(true);
    expect(tidyName(' New   Hope ')).toBe('New Hope');
  });

  it('the caption reads the game: name, tier name, day', () => {
    const g = makeGame();
    const st = g.game.state;
    st.colony.tier = 6;
    st.time.day = 12;
    const cap = photoCaption(st.colony.name, createDataRegistry().tier(6).name, st.time.day);
    expect(cap.title).toBe(st.colony.name);
    expect(cap.line).toBe('Titanium tier · Day 12');
  });

  it('a file name that is safe everywhere', () => {
    expect(photoFileName('New Hope', 42)).toBe('nova-colony-new-hope-day-42.jpg');
    expect(photoFileName('Ünïcödé ✨ Base!', 3)).toBe('nova-colony-unicode-base-day-3.jpg');
    expect(photoFileName('', 1)).toBe('nova-colony-my-colony-day-1.jpg');
    expect(photoFileName('New Hope', 2, 'k3j9a1')).toBe('nova-colony-new-hope-day-2-k3j9a1.jpg');
    expect(photoFileName('a/b\\c', 1)).toMatch(/^[a-z0-9-]+\.jpg$/);
  });

  it('share text', () => {
    const t = shareText(photoCaption('New Hope', 'Stone', 2));
    expect(t.text).toBe('My colony on Nova Colony 🌱');
    expect(t.title).toContain('New Hope');
  });

  it('the frame: a border, the photo, a caption strip under it, scaled to the photo', () => {
    const p = frameLayout(945, 2048);
    expect(p.px).toBeGreaterThan(0);
    expect(p.w).toBe(945 + 2 * p.px);
    expect(p.h).toBe(p.py + 2048 + p.stripH);
    expect(p.stripY).toBe(p.py + 2048);
    expect(p.stripH).toBeGreaterThan(p.px * 2);
    expect(p.titlePx).toBeGreaterThan(p.linePx);
    expect(p.titlePx + p.linePx).toBeLessThan(p.stripH);
    // landscape gets the same proportions (short side drives it)
    const l = frameLayout(2048, 945);
    expect(l.px).toBe(p.px);
    expect(l.stripH).toBe(p.stripH);
    // a tiny still still gets readable text
    expect(frameLayout(100, 60).titlePx).toBeGreaterThanOrEqual(14);
  });
});

describe('photo mode — wiring', () => {
  const root = path.resolve(__dirname, '..');
  const src = (f: string) => fs.readFileSync(path.join(root, 'src', f), 'utf8');

  it('has a painted Photo tile in the Menu (camera emoji fallback)', () => {
    expect(hudArt('photo')).toBe('art/hud/photo.webp');
    const menu = src('ui/panels/MenuPanel.ts');
    expect(menu).toMatch(/hudArt\('photo'\)/);
    expect(menu).toContain("panel: 'photo'");
    expect(menu).toContain('📷');
  });

  it('"Say Cheese!" is earned by the first photo', () => {
    const d = createDataRegistry().achievement('ach_say_cheese');
    expect(d).toBeDefined();
    expect(d!.name).toBe('Say Cheese!');
    expect(d!.medal).toBe('special');
    expect(d!.target).toBe(1);
    expect(d!.source).toEqual({ kind: 'counter', type: 'photo', target: '*' });
    const g = makeGame();
    g.game.bus.emit('photo:taken', { preset: 'golden', width: 1011, height: 2232 });
    expect(g.game.state.missions.counters['photo:*']).toBe(1);
  });

  it('photo.css loads with the other feature sheets, after the skin', () => {
    const ui = src('ui/UI.ts');
    expect(ui.indexOf("styles/photo.css")).toBeGreaterThan(ui.indexOf("styles/skin.css"));
    expect(ui.indexOf("styles/photo.css")).toBeGreaterThan(ui.indexOf("styles/wishes.css"));
  });

  it('photo controls are at least 44px', () => {
    const css = fs.readFileSync(path.join(root, 'src', 'ui', 'styles', 'photo.css'), 'utf8');
    const block = (sel: string) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(css);
      if (!m) throw new Error(`no rule for ${sel}`);
      return m[1];
    };
    expect(Number(/width:\s*(\d+)px/.exec(block('.nv-photo .ph-close'))![1])).toBeGreaterThanOrEqual(44);
    expect(Number(/height:\s*(\d+)px/.exec(block('.nv-photo .ph-close'))![1])).toBeGreaterThanOrEqual(44);
    expect(Number(/min-height:\s*(\d+)px/.exec(block('.nv-photo .ph-chip'))![1])).toBeGreaterThanOrEqual(44);
    expect(Number(/--ph-shutter:\s*(\d+)px/.exec(block('.nv-photo'))![1])).toBeGreaterThanOrEqual(44);
    expect(Number(/min-height:\s*(\d+)px/.exec(block('.nv-photo .ph-actions .btn'))![1])).toBeGreaterThanOrEqual(44);
    // safe areas
    expect(css).toMatch(/--safe-t/);
    expect(css).toMatch(/--safe-b/);
  });
});
