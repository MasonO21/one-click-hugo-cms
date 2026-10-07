/**
 * The renderer's public surface used by UI (input picking, projections for DOM overlays).
 * Camera parameters live in game.view.camera (UI writes yaw/zoom; renderer reads them).
 */
import type { Selection } from '../core/view';

export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

export interface RendererApi {
  /** Screen pixel -> point on the ground plane (world units), or null if none. */
  pickGround(sx: number, sy: number): { x: number; z: number } | null;
  /** Screen pixel -> game object under the pointer (building, colonist, node, poi, alien, event). */
  pick(sx: number, sy: number): Selection | null;
  /** World -> screen pixels (for floating numbers, markers, tutorial arrows). */
  worldToScreen(x: number, y: number, z: number): ScreenPoint;
  /** Current horizontal camera yaw (radians) — joystick input is camera-relative. */
  cameraYaw(): number;
  /** Briefly frame a world position (e.g. "show me the survivor camp"). */
  focus(x: number, z: number): void;
  /** Rendering stats for the debug overlay. */
  stats(): { fps: number; drawCalls: number; triangles: number };
}
