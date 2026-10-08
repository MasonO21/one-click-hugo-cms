/**
 * Photo frames (src/ui/photo/frames.ts): every photo_frame cosmetic has a drawn frame, each draws without throwing and
 * differently from the others (a recording 2D context stands in for the canvas), the layout gives decorated frames a
 * wider border and a caption plate, and Photo Mode composes with the equipped frame and offers a picker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDataRegistry } from '../src/data';
import { DRAWN_FRAMES, drawFrameBack, drawFrameFront, drawPlate, framePlate, isDrawnFrame } from '../src/ui/photo/frames';
import { frameLayout } from '../src/ui/logic/photo';

const data = createDataRegistry();

/** A 2D context that records every call (and the colours it was given) instead of drawing. */
function recorder(): { c: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const gradient = { addColorStop: (_o: number, col: string) => calls.push(`stop:${col}`) };
  const target: Record<string, unknown> = {};
  const c = new Proxy(target, {
    get(_t, key: string) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      return (...args: unknown[]) => void calls.push(`${key}(${args.length})`);
    },
    set(_t, key: string, v: unknown) {
      target[key] = v;
      if (typeof v === 'string') calls.push(`${key}=${v}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { c, calls };
}

describe('photo frames', () => {
  it('every photo_frame cosmetic has a drawn frame (and nothing else does)', () => {
    const ids = data.cosmetics.filter((c) => c.kind === 'photo_frame').map((c) => c.id).sort();
    expect([...DRAWN_FRAMES].sort()).toEqual(ids);
    expect(isDrawnFrame('frame_sakura')).toBe(true);
    expect(isDrawnFrame('hat_beanie')).toBe(false);
    expect(isDrawnFrame(null)).toBe(false);
  });

  it('each frame draws its border, decorations and plate, all different from each other', () => {
    const L = frameLayout(900, 1600, true);
    const prints = new Map<string, string>();
    for (const id of DRAWN_FRAMES) {
      const { c, calls } = recorder();
      expect(() => {
        drawFrameBack(c, L, id);
        drawFrameFront(c, L, id);
        drawPlate(c, L, id);
      }, id).not.toThrow();
      expect(calls.length, id).toBeGreaterThan(200);
      const colours = calls.filter((x) => x.includes('#') || x.includes('rgba')).sort().join('|');
      prints.set(id, colours);
    }
    expect(new Set(prints.values()).size).toBe(DRAWN_FRAMES.length);
  });

  it('draws the same way every time (seeded scatter), at any resolution', () => {
    const a = recorder();
    const b = recorder();
    drawFrameBack(a.c, frameLayout(900, 1600, true), 'frame_starry');
    drawFrameBack(b.c, frameLayout(900, 1600, true), 'frame_starry');
    expect(a.calls).toEqual(b.calls);
    const small = recorder();
    expect(() => drawFrameFront(small.c, frameLayout(120, 80, true), 'frame_honey_gold')).not.toThrow();
  });

  it('a decorated frame gets a wider border and a caption plate; the classic one is unchanged', () => {
    const classic = frameLayout(945, 2048);
    const deco = frameLayout(945, 2048, true);
    expect(classic.plate).toBeNull();
    expect(deco.px).toBeGreaterThan(classic.px * 1.8);
    expect(deco.pw).toBe(945);
    expect(deco.ph).toBe(2048);
    expect(deco.w).toBe(945 + 2 * deco.px);
    const p = deco.plate!;
    expect(p.y).toBeGreaterThan(deco.py + deco.ph);
    expect(p.y + p.h).toBeLessThan(deco.h);
    expect(deco.titlePx + deco.linePx).toBeLessThan(p.h);
    // the rim and corner radius stay the classic size
    expect(deco.rim).toBe(classic.rim);
  });

  it('plates keep the caption readable (dark ink on a light plate, light ink on the night sky)', () => {
    const lum = (hex: string) => {
      const m = /^#([0-9a-f]{6})$/i.exec(hex);
      if (!m) return 0.1; // the starry plate's rgba navy
      const n = parseInt(m[1], 16);
      return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    };
    for (const id of DRAWN_FRAMES) {
      const p = framePlate(id);
      expect(Math.abs(lum(p.fill) - lum(p.title)), id).toBeGreaterThan(0.5);
    }
  });

  it('Photo Mode frames the shot in the equipped frame and lets the player switch before sharing', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'photo', 'PhotoMode.ts'), 'utf8');
    expect(src).toMatch(/composePhoto\(shot, caption, await frameAssets\(\), frame\)/);
    expect(src).toContain('ph-frames');
    expect(src).toContain("unequipCosmetic('photo_frame')");
  });
});
