/**
 * Pure math for touch input (joystick, camera drag, pinch, off-screen indicators).
 * Kept DOM-free so it can be unit-tested headlessly.
 */
import { clamp } from '../../core/math';

export const STICK_RADIUS = 56;
export const STICK_DEADZONE = 0.14;

export interface StickOrigin {
  x: number;
  y: number;
}

export interface StickOutput {
  /** Joystick vector for `game.input` (x right, y up, length 0..1). */
  x: number;
  y: number;
  /** Knob offset from the origin in screen px (clamped to the radius). */
  knobX: number;
  knobY: number;
}

/**
 * Update a floating joystick: the knob follows the pointer; when the pointer leaves the radius the
 * origin is dragged along so the thumb never runs out of room.
 */
export function stickUpdate(origin: StickOrigin, px: number, py: number, radius = STICK_RADIUS, deadzone = STICK_DEADZONE): StickOutput {
  let dx = px - origin.x;
  let dy = py - origin.y;
  let len = Math.hypot(dx, dy);
  if (len > radius) {
    const k = (len - radius) / len;
    origin.x += dx * k;
    origin.y += dy * k;
    dx = px - origin.x;
    dy = py - origin.y;
    len = radius;
  }
  const m = len / radius;
  if (m <= deadzone || len === 0) return { x: 0, y: 0, knobX: dx, knobY: dy };
  const mag = (m - deadzone) / (1 - deadzone);
  return { x: (dx / len) * mag, y: -(dy / len) * mag, knobX: dx, knobY: dy };
}

/** Camera-relative joystick -> world direction (ARCHITECTURE.md "Camera & movement convention"). */
export function worldDirection(moveX: number, moveY: number, yaw: number): { dx: number; dz: number } {
  return {
    dx: moveX * Math.cos(yaw) - moveY * Math.sin(yaw),
    dz: -moveX * Math.sin(yaw) - moveY * Math.cos(yaw),
  };
}

/** Which side of the screen owns the joystick (left 40%, or right 40% for left-handed play). */
export function inStickZone(x: number, width: number, leftHanded: boolean): boolean {
  return leftHanded ? x > width * 0.6 : x < width * 0.4;
}

/**
 * Dragging the finger right increases yaw: at the camera's focus depth and beyond, the scene
 * sweeps to the right, i.e. the world follows the finger (see camera convention in ARCHITECTURE.md).
 */
export function yawAfterDrag(yaw: number, dx: number, sensitivity = 0.0055): number {
  return yaw + dx * sensitivity;
}

/** Two-finger gesture: spreading the fingers zooms in (zoom 0 = closest). */
export function zoomAfterPinch(zoom0: number, dist0: number, dist1: number): number {
  if (dist0 < 1 || dist1 < 1) return zoom0;
  return clamp(zoom0 - Math.log(dist1 / dist0) * 0.75, 0, 1);
}

export function zoomAfterWheel(zoom: number, deltaY: number): number {
  return clamp(zoom + deltaY * 0.0011, 0, 1);
}

/**
 * World offset (target - player) expressed in screen space for a camera at `yaw`
 * (x right, y DOWN). Used for off-screen tutorial indicators.
 */
export function relativeScreenDir(dx: number, dz: number, yaw: number): { x: number; y: number } {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return { x: dx * rx + dz * rz, y: -(dx * fx + dz * fz) };
}

/** Project a screen-space direction onto the viewport edge (inset by `margin`). */
export function edgePoint(vx: number, vy: number, w: number, h: number, margin: number): { x: number; y: number; angle: number } {
  const cx = w / 2;
  const cy = h / 2;
  const ax = Math.abs(vx) < 1e-6 ? 1e-6 : Math.abs(vx);
  const ay = Math.abs(vy) < 1e-6 ? 1e-6 : Math.abs(vy);
  const t = Math.min((cx - margin) / ax, (cy - margin) / ay);
  return { x: cx + vx * t, y: cy + vy * t, angle: Math.atan2(vy, vx) };
}

export interface SafeRect {
  l: number;
  t: number;
  r: number;
  b: number;
}

/**
 * Like `edgePoint` but onto an arbitrary safe rectangle (so indicators stay clear of the HUD):
 * the direction is applied from the rectangle's centre.
 */
export function edgePointRect(vx: number, vy: number, rect: SafeRect): { x: number; y: number; angle: number } {
  const cx = (rect.l + rect.r) / 2;
  const cy = (rect.t + rect.b) / 2;
  const hx = Math.max(1, (rect.r - rect.l) / 2);
  const hy = Math.max(1, (rect.b - rect.t) / 2);
  const ax = Math.abs(vx) < 1e-6 ? 1e-6 : Math.abs(vx);
  const ay = Math.abs(vy) < 1e-6 ? 1e-6 : Math.abs(vy);
  const t = Math.min(hx / ax, hy / ay);
  return { x: cx + vx * t, y: cy + vy * t, angle: Math.atan2(vy, vx) };
}

/** Off-screen threat markers: half their size plus the count badge that sticks out (styles/fx.css `.threat-edge`). */
export const THREAT_MARKER_PAD = 26;

/**
 * The rectangle threat markers run along: clear of the right-hand rail and context button, the dock below and the
 * banners above (`top`). Mirrored for left-handed play, where the rail and the buttons move to the left.
 */
export function threatSafeRect(vw: number, vh: number, top: number, leftHanded: boolean): SafeRect {
  return leftHanded ? { l: 108, t: top, r: vw - 40, b: vh - 100 } : { l: 40, t: top, r: vw - 108, b: vh - 100 };
}

/**
 * Where a thumb lands to walk: the joystick's side of the screen (`inStickZone`: 40% of the width, and at least the
 * whole hint ring) from a little above the ring down to the bottom edge. `ring` is the hint ring's screen rect (null:
 * not laid out, assume the lower 38% of the screen).
 */
export function joystickZone(vw: number, vh: number, ring: SafeRect | null, leftHanded: boolean): SafeRect {
  const top = ring ? ring.t - (ring.b - ring.t) * 0.25 : vh * 0.62;
  if (leftHanded) return { l: Math.min(vw * 0.6, ring ? ring.l : vw), t: top, r: vw, b: vh };
  return { l: 0, t: top, r: Math.max(vw * 0.4, ring ? ring.r : 0), b: vh };
}

/**
 * Slide a point on the edge of `rect` along that edge until a marker of half-size `pad` centred there overlaps none
 * of the `avoid` rectangles (the joystick's thumb zone, the HUD column), the shorter way round. The point comes back
 * unchanged when it is already clear, or when the avoid zones cover the whole edge. Pure: see tests/ui.input.test.ts.
 */
export function slideAlongRect(x: number, y: number, rect: SafeRect, avoid: readonly SafeRect[], pad: number): { x: number; y: number; moved: boolean } {
  const { l, t, r, b } = rect;
  const W = Math.max(0, r - l);
  const H = Math.max(0, b - t);
  const P = 2 * (W + H);
  if (P <= 0 || !avoid.length) return { x, y, moved: false };
  // perimeter position, clockwise from the top-left corner: top, right, bottom, left edge
  const dist = [Math.abs(y - t), Math.abs(x - r), Math.abs(y - b), Math.abs(x - l)];
  const edge = dist.indexOf(Math.min(...dist));
  const s0 = edge === 0 ? clamp(x - l, 0, W) : edge === 1 ? W + clamp(y - t, 0, H) : edge === 2 ? W + H + clamp(r - x, 0, W) : 2 * W + H + clamp(b - y, 0, H);
  // the stretches of the perimeter a marker centre must not be on (inside a zone grown by `pad`)
  const iv: [number, number][] = [];
  const span = (lo: number, hi: number, base: number, flip: number): void => {
    if (hi <= lo) return;
    iv.push(flip ? [base + flip - hi, base + flip - lo] : [base + lo, base + hi]);
  };
  for (const a of avoid) {
    const e = { l: a.l - pad, t: a.t - pad, r: a.r + pad, b: a.b + pad };
    if (e.t < t && t < e.b) span(Math.max(l, e.l) - l, Math.min(r, e.r) - l, 0, 0);
    if (e.l < r && r < e.r) span(Math.max(t, e.t) - t, Math.min(b, e.b) - t, W, 0);
    if (e.t < b && b < e.b) span(Math.max(l, e.l) - l, Math.min(r, e.r) - l, W + H, W);
    if (e.l < l && l < e.r) span(Math.max(t, e.t) - t, Math.min(b, e.b) - t, 2 * W + H, H);
  }
  if (!iv.length) return { x, y, moved: false };
  iv.sort((p, q) => p[0] - q[0]);
  const merged: [number, number][] = [];
  for (const [lo, hi] of iv) {
    const last = merged[merged.length - 1];
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }
  // a stretch through the top-left corner (the end of the left edge meets the start of the top edge)
  if (merged.length > 1 && merged[0][0] <= 1e-6 && merged[merged.length - 1][1] >= P - 1e-6) {
    const first = merged.shift()!;
    merged[merged.length - 1][1] = P + first[1];
  } else if (merged.length === 1 && merged[0][0] <= 1e-6 && merged[0][1] >= P - 1e-6) {
    return { x, y, moved: false }; // nowhere to go
  }
  const hit = merged.find(([lo, hi]) => (s0 > lo + 1e-6 && s0 < hi - 1e-6) || (s0 + P > lo + 1e-6 && s0 + P < hi - 1e-6));
  if (!hit) return { x, y, moved: false };
  const s = s0 > hit[0] && s0 < hit[1] ? s0 : s0 + P;
  const to = hit[1] - s <= s - hit[0] ? hit[1] : hit[0];
  let u = ((to % P) + P) % P;
  let px: number;
  let py: number;
  if (u <= W) [px, py] = [l + u, t];
  else if ((u -= W) <= H) [px, py] = [r, t + u];
  else if ((u -= H) <= W) [px, py] = [r - u, b];
  else [px, py] = [l, b - (u - W)];
  return { x: px, y: py, moved: true };
}

/** `edgePointRect`, then slid clear of the `avoid` zones (`slideAlongRect`). The angle still points at the target. */
export function edgePointAvoiding(vx: number, vy: number, rect: SafeRect, avoid: readonly SafeRect[], pad: number): { x: number; y: number; angle: number; moved: boolean } {
  const e = edgePointRect(vx, vy, rect);
  const p = slideAlongRect(e.x, e.y, rect, avoid, pad);
  return { x: p.x, y: p.y, angle: e.angle, moved: p.moved };
}

/** A touch on a tappable overlay (a toast) that moves further than this is a drag the world takes over... */
export const OVERLAY_DRAG_PX = 10;
/** ...and one held longer than this is a thumb put down to walk, not a tap. */
export const OVERLAY_HOLD_MS = 350;

/**
 * A touch on a tappable overlay that may sit over the joystick (a toast in portrait): still a possible tap, or a drag /
 * hold the world takes over (InputController.adopt) as if it had started on the world. Only a short, still touch
 * opens the toast.
 */
export function overlayGesture(moved: number, ms: number): 'tap' | 'world' {
  return moved > OVERLAY_DRAG_PX || ms > OVERLAY_HOLD_MS ? 'world' : 'tap';
}

/** Is a pointer gesture short & still enough to count as a tap? */
export function isTap(dist: number, ms: number): boolean {
  return dist < 12 && ms < 320;
}
