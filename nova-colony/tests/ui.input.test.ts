/**
 * World input. QA3: on phones, tapping the Command Center opened the Colony sheet on pointerup, then the browser's
 * compatibility click (touchend not cancelled) landed on the new sheet's backdrop and closed it again.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { InputController, type InputHooks } from '../src/ui/input/InputController';
import type { Game } from '../src/core/Game';
import { edgePointAvoiding, edgePointRect, joystickZone, slideAlongRect, THREAT_MARKER_PAD, threatSafeRect, type SafeRect } from '../src/ui/logic/input';

type Listener = { type: string; fn: (e: unknown) => void; opts?: AddEventListenerOptions | boolean };

function fakeTarget(): { listeners: Listener[]; addEventListener: (type: string, fn: (e: unknown) => void, opts?: AddEventListenerOptions | boolean) => void } {
  const listeners: Listener[] = [];
  return { listeners, addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }) };
}

const g = globalThis as unknown as { window?: unknown; document?: unknown };
const saved = { window: g.window, document: g.document };
afterEach(() => {
  g.window = saved.window;
  g.document = saved.document;
});

describe('world input layer', () => {
  it('cancels the touchend default so no ghost click reaches a sheet opened by the tap', () => {
    g.window = fakeTarget();
    g.document = { ...fakeTarget(), hidden: false };
    const layer = fakeTarget();
    const hooks = {} as InputHooks;
    new InputController({} as Game, layer as unknown as HTMLElement, {} as HTMLElement, {} as HTMLElement, hooks);
    const te = layer.listeners.find((l) => l.type === 'touchend');
    expect(te).toBeDefined();
    expect((te!.opts as AddEventListenerOptions | undefined)?.passive).toBe(false);
    let prevented = false;
    te!.fn({ cancelable: true, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    // a non-cancelable touchend (scroll in progress) is left alone instead of logging an intervention
    let prevented2 = false;
    te!.fn({ cancelable: false, preventDefault: () => (prevented2 = true) });
    expect(prevented2).toBe(false);
    // the game's own input is pointer events
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) expect(layer.listeners.some((l) => l.type === t)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Off-screen threat markers vs the joystick (QA6: during raids an edge marker sat inside the joystick ring in
// portrait; markers are buttons — tap to look — so it took the touch meant for walking)
// ------------------------------------------------------------------------------------------------

const PAD = THREAT_MARKER_PAD;
/** Does a marker centred at (x, y) overlap the rect? (touching is fine) */
const overlaps = (x: number, y: number, a: SafeRect): boolean => x - PAD < a.r - 1e-6 && x + PAD > a.l + 1e-6 && y - PAD < a.b - 1e-6 && y + PAD > a.t + 1e-6;
const onPerimeter = (x: number, y: number, r: SafeRect): boolean =>
  x >= r.l - 1e-6 && x <= r.r + 1e-6 && y >= r.t - 1e-6 && y <= r.b + 1e-6 && (Math.abs(x - r.l) < 1e-6 || Math.abs(x - r.r) < 1e-6 || Math.abs(y - r.t) < 1e-6 || Math.abs(y - r.b) < 1e-6);
const dirs = (n: number): [number, number][] => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2), Math.sin((i / n) * Math.PI * 2)]);

describe('threat markers stay out of the joystick zone', () => {
  // a 393x852 phone in portrait, as measured in the game: the hint ring, the mission card column, the banner bottom
  const ring = { l: 56, t: 631, r: 186, b: 760 };
  const safe = threatSafeRect(393, 852, 220, false);
  const zone = joystickZone(393, 852, ring, false);
  const column = { l: 8, t: 190, r: 255, b: 312 };
  const avoid = [zone, column];

  it('the thumb zone is the stick side (40% of the width, at least the ring) from a little above the ring to the bottom', () => {
    expect(safe).toEqual({ l: 40, t: 220, r: 285, b: 752 });
    expect(zone.l).toBe(0);
    expect(zone.r).toBe(186); // the ring reaches past 40% of 393
    expect(zone.b).toBe(852);
    expect(zone.t).toBeLessThan(ring.t);
    expect(zone.t).toBeGreaterThan(ring.t - 60);
    // a wide landscape screen: 40% of the width wins; no ring laid out: the lower 38%
    expect(joystickZone(852, 393, { l: 56, t: 239, r: 186, b: 363 }, false).r).toBeCloseTo(340.8);
    expect(joystickZone(393, 852, null, false)).toEqual({ l: 0, t: 852 * 0.62, r: 393 * 0.4, b: 852 });
    // left-handed: the other corner, and the rail side of the safe rect swaps too
    expect(joystickZone(393, 852, { l: 207, t: 631, r: 337, b: 760 }, true)).toMatchObject({ l: 207, r: 393, b: 852 });
    expect(threatSafeRect(393, 852, 220, true)).toEqual({ l: 108, t: 220, r: 353, b: 752 });
  });

  it('a marker headed for the ring slides up the left edge to just above the zone, its arrow still on target', () => {
    const plain = edgePointRect(-1, 1.2, safe);
    expect(plain.x).toBe(40);
    expect(overlaps(plain.x, plain.y, zone)).toBe(true); // the old placement: on the ring
    const e = edgePointAvoiding(-1, 1.2, safe, avoid, PAD);
    expect(e.moved).toBe(true);
    expect(e.x).toBe(40);
    expect(e.y).toBeCloseTo(zone.t - PAD);
    expect(e.angle).toBeCloseTo(plain.angle);
  });

  it('a marker on the bottom edge under the ring slides right, past the zone', () => {
    const e = edgePointAvoiding(-0.2, 1, safe, avoid, PAD);
    expect(e.moved).toBe(true);
    expect(e.y).toBe(safe.b);
    expect(e.x).toBeCloseTo(zone.r + PAD);
  });

  it('a marker behind the mission card slides out from under it (the shorter way)', () => {
    const p = slideAlongRect(40, 250, safe, avoid, PAD);
    expect(p).toEqual({ x: 40, y: column.b + PAD, moved: true });
    // near the top-left corner the top edge is the shorter way out
    const q = slideAlongRect(230, safe.t, safe, avoid, PAD);
    expect(q.moved).toBe(true);
    expect(q.y).toBe(safe.t);
    expect(q.x).toBeCloseTo(column.r + PAD);
  });

  it('a clear spot is left alone', () => {
    expect(edgePointAvoiding(1, 0, safe, avoid, PAD)).toMatchObject({ x: 285, moved: false });
    expect(slideAlongRect(40, 450, safe, avoid, PAD)).toEqual({ x: 40, y: 450, moved: false });
    expect(slideAlongRect(40, 700, safe, [], PAD)).toEqual({ x: 40, y: 700, moved: false });
  });

  it('whatever the direction, a marker never overlaps the zone or the card and stays on the edge (portrait)', () => {
    for (const [vx, vy] of dirs(240)) {
      const e = edgePointAvoiding(vx, vy, safe, avoid, PAD);
      expect(onPerimeter(e.x, e.y, safe), `${vx},${vy}`).toBe(true);
      for (const a of avoid) expect(overlaps(e.x, e.y, a), `${vx},${vy} -> ${e.x},${e.y}`).toBe(false);
    }
  });

  it('landscape 852x393: the left edge is all card and thumb zone, so markers go round to the top or bottom edge', () => {
    const lSafe = threatSafeRect(852, 393, 175, false);
    const lZone = joystickZone(852, 393, { l: 56, t: 239, r: 186, b: 363 }, false);
    const lCol = { l: 8, t: 96, r: 235, b: 198 };
    const e = edgePointAvoiding(-1, 0, lSafe, [lZone, lCol], PAD);
    expect(e.moved).toBe(true);
    expect(e.y).toBe(lSafe.t); // up and along the top: shorter than down and along the bottom
    expect(e.x).toBeCloseTo(lCol.r + PAD);
    for (const [vx, vy] of dirs(240)) {
      const p = edgePointAvoiding(vx, vy, lSafe, [lZone, lCol], PAD);
      expect(onPerimeter(p.x, p.y, lSafe)).toBe(true);
      expect(overlaps(p.x, p.y, lZone), `${vx},${vy} -> ${p.x},${p.y}`).toBe(false);
      expect(overlaps(p.x, p.y, lCol)).toBe(false);
    }
  });

  it('left-handed: the zone is in the right corner and markers keep out of it', () => {
    const hSafe = threatSafeRect(393, 852, 220, true);
    const hZone = joystickZone(393, 852, { l: 207, t: 631, r: 337, b: 760 }, true);
    for (const [vx, vy] of dirs(120)) {
      const p = edgePointAvoiding(vx, vy, hSafe, [hZone], PAD);
      expect(overlaps(p.x, p.y, hZone)).toBe(false);
    }
  });

  it('when the zones cover the whole edge the marker stays where it was rather than jumping around', () => {
    const all = { l: -100, t: -100, r: 1000, b: 1000 };
    expect(slideAlongRect(40, 500, safe, [all], PAD)).toEqual({ x: 40, y: 500, moved: false });
  });
});
