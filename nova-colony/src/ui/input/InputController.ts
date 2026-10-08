/**
 * InputController — touch-first world input.
 *
 *  - Dynamic left-side virtual joystick (left 40% of the screen; only its lower part in build mode, where
 *    drags place the ghost / draw wall lines) -> game.input.moveX/moveY
 *  - One-finger drag elsewhere rotates the camera (view.camera.yaw); two fingers pinch-zoom + twist
 *  - Mouse wheel zooms; WASD/arrows move, Q/E rotate, Space interacts (desktop testing)
 *  - Quick taps pick things in the world (renderer.pick) — or, in build mode, are forwarded to the
 *    build controller (ghost placement / drag-to-draw lines).
 *  - A touch that began on a tappable overlay (a toast over the joystick) and turned out to be a drag or a hold is
 *    handed over (`adopt`): the world takes it as if it had started here, so a thumb put down to walk always walks.
 */
import type { Game } from '../../core/Game';
import { clamp } from '../../core/math';
import { inStickZone, isTap, stickUpdate, yawAfterDrag, zoomAfterPinch, zoomAfterWheel, type StickOrigin } from '../logic/input';

export interface BuildPointer {
  active(): boolean;
  down(x: number, y: number): void;
  move(x: number, y: number): void;
  up(x: number, y: number, tap: boolean): void;
}

export interface InputHooks {
  onTap(x: number, y: number): void;
  build: BuildPointer;
  /** Desktop shortcuts. Return true if handled. */
  shortcut(e: KeyboardEvent): boolean;
  /** First time the player used the stick (hide the hint). */
  moved(): void;
}

type Role = 'stick' | 'look' | 'place' | 'pinch' | 'right';

/** Build mode: the joystick only starts below this fraction of the screen height. */
const BUILD_STICK_TOP = 0.55;

interface Ptr {
  id: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  t0: number;
  role: Role;
  moved: number;
  type: string;
  /** Handed over from an overlay (`adopt`): it was never a tap, so its release never picks in the world. */
  noTap?: boolean;
}

export class InputController {
  private pointers = new Map<number, Ptr>();
  private stickId: number | null = null;
  private origin: StickOrigin = { x: 0, y: 0 };
  private stickShown = false;
  private pinch: { a: number; b: number; d0: number; ang0: number; zoom0: number; yaw0: number } | null = null;
  private keys = new Set<string>();
  private kbMoving = false;
  private usedStick = false;

  constructor(
    private readonly game: Game,
    private readonly layer: HTMLElement,
    private readonly stickEl: HTMLElement,
    private readonly knobEl: HTMLElement,
    private readonly hooks: InputHooks,
  ) {
    layer.addEventListener('pointerdown', (e) => this.onDown(e));
    layer.addEventListener('pointermove', (e) => this.onMove(e));
    layer.addEventListener('pointerup', (e) => this.onUp(e));
    layer.addEventListener('pointercancel', (e) => this.onUp(e, true));
    // A world tap can open a sheet right under the finger (tap the Command Center -> Colony). Unless the
    // touch's default is cancelled, the browser follows up with compatibility mouse events and a click,
    // hit-tested after the sheet mounted — on its backdrop, which closed it again at once on phones.
    // All input here is pointer events, which still fire; audio unlock listens to touchend in capture.
    layer.addEventListener('touchend', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
    layer.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
    // iOS pinch-zoom of the page itself
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  }

  /** Release everything (panel opened, app backgrounded). */
  reset(): void {
    this.pointers.clear();
    this.stickId = null;
    this.pinch = null;
    this.keys.clear();
    this.kbMoving = false;
    this.game.input.moveX = 0;
    this.game.input.moveY = 0;
    this.hideStick();
  }

  private get leftHanded(): boolean {
    return this.game.state.settings.leftHanded;
  }

  // ---------------------------------------------------------------- pointers

  private onDown(e: PointerEvent): void {
    try {
      this.layer.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    this.start(e.pointerId, e.pointerType, e.button, e.clientX, e.clientY, performance.now());
  }

  /**
   * Take over a touch that began on an overlay and turned out not to be a tap (a drag or a hold on a toast that sits
   * over the joystick): the world handles it as if it had started on this layer at (x0, y0) at `t0` — the joystick in
   * its zone, the camera elsewhere — and follows the finger, now at (x, y), from here on (pointer capture moves to this
   * layer). False when the pointer is no longer active.
   */
  adopt(id: number, type: string, x0: number, y0: number, t0: number, x: number, y: number): boolean {
    if (this.pointers.has(id)) return true;
    try {
      this.layer.setPointerCapture(id);
    } catch {
      return false; // lifted already
    }
    this.start(id, type, 0, x0, y0, t0).noTap = true;
    this.move(id, x, y);
    return true;
  }

  private start(id: number, type: string, button: number, x: number, y: number, t0: number): Ptr {
    const p: Ptr = { id, x, y, sx: x, sy: y, t0, role: 'look', moved: 0, type };
    const rightMouse = type === 'mouse' && button === 2;

    if (rightMouse) {
      p.role = 'right';
    } else if (
      this.stickId == null &&
      type !== 'mouse' &&
      inStickZone(x, window.innerWidth, this.leftHanded) &&
      // in build mode only the lower corner is the joystick: a drag anywhere else moves the ghost / draws walls
      (!this.hooks.build.active() || y > window.innerHeight * BUILD_STICK_TOP)
    ) {
      // (a mouse always orbits the camera — desktop players have WASD)
      p.role = 'stick';
      this.stickId = p.id;
      this.origin = { x, y };
    } else {
      // a second free finger turns the pair into a pinch gesture
      const other = [...this.pointers.values()].find((o) => (o.role === 'look' || o.role === 'place') && o.id !== p.id);
      if (other && !this.pinch) {
        other.role = 'pinch';
        p.role = 'pinch';
        if (this.hooks.build.active()) this.hooks.build.up(other.x, other.y, false);
        const d0 = Math.hypot(p.x - other.x, p.y - other.y);
        const cam = this.game.view.camera;
        this.pinch = { a: other.id, b: p.id, d0, ang0: Math.atan2(p.y - other.y, p.x - other.x), zoom0: cam.zoom, yaw0: cam.yaw };
      } else {
        p.role = this.hooks.build.active() ? 'place' : 'look';
        if (p.role === 'place') this.hooks.build.down(p.x, p.y);
      }
    }
    this.pointers.set(p.id, p);
    return p;
  }

  private onMove(e: PointerEvent): void {
    this.move(e.pointerId, e.clientX, e.clientY);
  }

  private move(id: number, x: number, y: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    p.moved += Math.hypot(dx, dy);
    p.x = x;
    p.y = y;
    const cam = this.game.view.camera;

    switch (p.role) {
      case 'stick': {
        if (p.moved < 5 && !this.stickShown) break;
        if (!this.stickShown) this.showStick();
        const out = stickUpdate(this.origin, p.x, p.y);
        this.game.input.moveX = out.x;
        this.game.input.moveY = out.y;
        this.placeStick(out.knobX, out.knobY);
        if (!this.usedStick) {
          this.usedStick = true;
          this.hooks.moved();
        }
        break;
      }
      case 'look':
      case 'right':
        cam.yaw = yawAfterDrag(cam.yaw, dx);
        break;
      case 'place':
        this.hooks.build.move(p.x, p.y);
        break;
      case 'pinch': {
        const pc = this.pinch;
        if (!pc) break;
        const a = this.pointers.get(pc.a);
        const b = this.pointers.get(pc.b);
        if (!a || !b) break;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        cam.zoom = zoomAfterPinch(pc.zoom0, pc.d0, d);
        cam.yaw = pc.yaw0 + (Math.atan2(b.y - a.y, b.x - a.x) - pc.ang0);
        break;
      }
    }
  }

  private onUp(e: PointerEvent, cancelled = false): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(p.id);
    const tap = !cancelled && !p.noTap && isTap(p.moved, performance.now() - p.t0);
    switch (p.role) {
      case 'stick':
        this.stickId = null;
        this.game.input.moveX = 0;
        this.game.input.moveY = 0;
        this.hideStick();
        if (tap) this.tap(p.x, p.y);
        break;
      case 'look':
        if (tap) this.tap(p.x, p.y);
        break;
      case 'place':
        this.hooks.build.up(p.x, p.y, tap);
        break;
      case 'pinch':
        this.pinch = null;
        // the remaining finger goes back to a normal role
        for (const o of this.pointers.values()) if (o.role === 'pinch') o.role = 'look';
        break;
      default:
        break;
    }
  }

  private tap(x: number, y: number): void {
    if (this.hooks.build.active()) {
      this.hooks.build.down(x, y);
      this.hooks.build.up(x, y, true);
    } else this.hooks.onTap(x, y);
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const cam = this.game.view.camera;
    cam.zoom = zoomAfterWheel(cam.zoom, e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY);
  }

  // ---------------------------------------------------------------- joystick visuals

  private showStick(): void {
    this.stickShown = true;
    this.stickEl.classList.add('on');
    this.placeStick(0, 0);
  }

  private hideStick(): void {
    this.stickShown = false;
    this.stickEl.classList.remove('on');
  }

  private placeStick(kx: number, ky: number): void {
    this.stickEl.style.transform = `translate(${this.origin.x.toFixed(1)}px, ${this.origin.y.toFixed(1)}px)`;
    this.knobEl.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;
  }

  // ---------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const code = e.code;
    if (down) {
      if (e.repeat && code !== 'KeyQ' && code !== 'KeyE') return;
      if (code === 'Space') {
        this.game.input.interact = true;
        this.game.input.interactHeld = true;
        e.preventDefault();
        return;
      }
      if (this.hooks.shortcut(e)) {
        e.preventDefault();
        return;
      }
      this.keys.add(code);
    } else {
      if (code === 'Space') {
        this.game.input.interactHeld = false;
        return;
      }
      this.keys.delete(code);
    }
  }

  /** Per-frame: keyboard movement + camera rotation. */
  update(dt: number): void {
    const k = this.keys;
    const inp = this.game.input;
    let mx = 0;
    let my = 0;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (mx || my) {
      const l = Math.hypot(mx, my);
      inp.moveX = mx / l;
      inp.moveY = my / l;
      this.kbMoving = true;
      if (!this.usedStick) {
        this.usedStick = true;
        this.hooks.moved();
      }
    } else if (this.kbMoving) {
      this.kbMoving = false;
      if (this.stickId == null) {
        inp.moveX = 0;
        inp.moveY = 0;
      }
    }
    const cam = this.game.view.camera;
    if (k.has('KeyE')) cam.yaw += 1.8 * dt;
    if (k.has('KeyQ')) cam.yaw -= 1.8 * dt;
    if (k.has('Equal') || k.has('NumpadAdd')) cam.zoom = clamp(cam.zoom - 0.8 * dt, 0, 1);
    if (k.has('Minus') || k.has('NumpadSubtract')) cam.zoom = clamp(cam.zoom + 0.8 * dt, 0, 1);
  }
}
