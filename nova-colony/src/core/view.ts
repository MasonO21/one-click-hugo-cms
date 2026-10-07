/**
 * Non-persistent state shared between sim, render and UI.
 *
 * - InputState: written by UI (joystick/buttons), read by PlayerSystem.
 * - ViewState: camera + build-mode preview + selection; written by UI, read by render.
 * - DerivedState: caches recomputed by sim systems (capacity, rates, power...), read by UI.
 */
import type { Id } from './state';
import type { ResourceBag } from '../data/schema';

export interface InputState {
  /** Joystick vector in screen space, x right, y up, length 0..1. */
  moveX: number;
  moveY: number;
  /** Set true by UI for one frame when the context button is tapped; PlayerSystem consumes it. */
  interact: boolean;
  /** Context button held (continuous gather/attack). */
  interactHeld: boolean;
}

export type CameraMode = 'follow' | 'overview';

export interface BuildPreview {
  /** BuildingDef id being placed, or null when not in build mode. */
  def: string | null;
  rot: 0 | 1 | 2 | 3;
  /** Material tier for pieces. */
  tier: number;
  /** Cursor cell (min corner). */
  x: number;
  z: number;
  /** Drag-to-build line start (cells) for pieces; null when placing a single building. */
  lineFrom: { x: number; z: number } | null;
  /** Cells covered by the current preview (pieces in a line, or a footprint). */
  cells: { x: number; z: number }[];
  valid: boolean;
  reason: string | null;
  /** When moving an existing building. */
  moveId: Id | null;
  /** When placing a saved blueprint. */
  blueprint: string | null;
  /** Total cost of the preview. */
  cost: ResourceBag;
}

export interface Selection {
  kind: 'building' | 'colonist' | 'node' | 'poi' | 'alien' | 'event' | null;
  id: number | string | null;
}

export interface ViewState {
  mode: 'play' | 'build' | 'map';
  camera: {
    mode: CameraMode;
    /** Orbit yaw around the target, radians. 0 = camera looks toward -Z... see render. */
    yaw: number;
    /** 0..1 zoom (0 = closest). */
    zoom: number;
    /** Overview/free camera focus point (world units). */
    tx: number;
    tz: number;
  };
  build: BuildPreview;
  selection: Selection;
  /** Show build grid overlay. */
  showGrid: boolean;
  /** UI is showing a full-screen panel (render may lower its frame rate). */
  panelOpen: boolean;
}

export interface DerivedState {
  /** Storage capacity per resource. */
  capacity: Record<string, number>;
  /** Gross production / consumption / net per minute (including colonist upkeep). */
  producePerMin: Record<string, number>;
  consumePerMin: Record<string, number>;
  netPerMin: Record<string, number>;
  research: { perMin: number };
  power: { produced: number; consumed: number; /** 0..1 satisfaction */ ratio: number };
  housing: { beds: number; used: number };
  happiness: { average: number; productivity: number };
  defense: { rating: number; turrets: number };
  /** Cells of enclosed rooms (roofed). Key = cellIndex. */
  roofCells: Set<number>;
  /** Room id per roofed cell. */
  rooms: { id: number; cells: number[]; buildings: Id[] }[];
  /** Bumped whenever buildings change (render/UI cache key). */
  buildingsVersion: number;
}

export function createInput(): InputState {
  return { moveX: 0, moveY: 0, interact: false, interactHeld: false };
}

export function createView(): ViewState {
  return {
    mode: 'play',
    camera: { mode: 'follow', yaw: Math.PI * 0.25, zoom: 0.45, tx: 0, tz: 0 },
    build: {
      def: null,
      rot: 0,
      tier: 0,
      x: 0,
      z: 0,
      lineFrom: null,
      cells: [],
      valid: false,
      reason: null,
      moveId: null,
      blueprint: null,
      cost: {},
    },
    selection: { kind: null, id: null },
    showGrid: false,
    panelOpen: false,
  };
}

export function createDerived(): DerivedState {
  return {
    capacity: {},
    producePerMin: {},
    consumePerMin: {},
    netPerMin: {},
    research: { perMin: 0 },
    power: { produced: 0, consumed: 0, ratio: 1 },
    housing: { beds: 0, used: 0 },
    happiness: { average: 50, productivity: 1 },
    defense: { rating: 0, turrets: 0 },
    roofCells: new Set(),
    rooms: [],
    buildingsVersion: 0,
  };
}
