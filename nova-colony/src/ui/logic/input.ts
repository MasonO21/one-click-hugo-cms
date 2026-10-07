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

/** Is a pointer gesture short & still enough to count as a tap? */
export function isTap(dist: number, ms: number): boolean {
  return dist < 12 && ms < 320;
}
