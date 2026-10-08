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

/** Photo Mode's free camera (world units / radians; see ui/logic/photo.ts `PhotoCam`). */
export interface PhotoCamera {
  tx: number;
  tz: number;
  yaw: number;
  dist: number;
  /** Radians above the horizon. */
  pitch: number;
}

/**
 * Photo Mode's hold on the renderer (ui/photo/PhotoMode.ts). Everything here is visual: the sim, its clock and
 * `game.view` are never touched, so ending the mode puts the game's own camera and light straight back.
 */
export interface PhotoRenderApi {
  /** Take over the camera (no follow / focus / combat framing, no portrait HUD shift); returns the current framing. */
  begin(): PhotoCamera;
  /** Hand the camera and the light back to the game. */
  end(): void;
  /** Where the free camera should go (eased over the next frames). */
  setCamera(c: PhotoCamera): void;
  /** Draw sky, sun, fog and night lights at this day time (0..1, 0.5 noon), or null for the sim's own clock. */
  setLighting(dayTime: number | null): void;
  /**
   * Render one still of the current view at w×h px and copy it into a new 2D canvas, in the same task (works with
   * preserveDrawingBuffer: false). The canvas may be smaller if the browser capped the drawing buffer; null on
   * failure (context lost…).
   */
  capture(w: number, h: number): HTMLCanvasElement | null;
  /** GPU caps for the still's size. */
  limits(): { maxTexture: number; maxRenderbuffer: number; maxViewport: [number, number] };
  /** Size of the 3D view in CSS px (the still keeps its aspect). */
  viewSize(): { w: number; h: number };
  /** Vertical field of view in degrees (gesture math). */
  fov(): number;
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
  /** Photo Mode (optional: a renderer without it has no Photo tile). */
  readonly photo?: PhotoRenderApi;
}
