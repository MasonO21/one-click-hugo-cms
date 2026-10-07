/**
 * CameraRig — third-person orbit camera following the player (view.camera.yaw / zoom), an
 * 'overview' mode targeting (tx, tz) for map/build, smooth damping, gentle tilt that flattens when
 * zooming in, terrain clearance, a transient focus() framing, combat framing (leans toward nearby
 * attacking aliens) and camera shake.
 *
 * Convention (ARCHITECTURE.md): camera = target + (sin(yaw)·d, h, cos(yaw)·d), looking at target.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { clamp, lerp } from '../../core/math';

/** Aliens within this many world units of the player pull the follow camera toward the fight. */
const COMBAT_FRAME_R = 26;
/** During an attack the follow camera looks this fraction of its distance ahead of the player. */
const COMBAT_LOOK_AHEAD = 0.14;

export class CameraRig {
  private tx = 0;
  private ty = 0;
  private tz = 0;
  private dist = 30;
  private yaw = 0;
  private pitch = 0.75;
  private shake = 0;
  private focusUntil = -1;
  private fx = 0;
  private fz = 0;
  private snap = true;
  /** Extra pitch (radians) added to the zoom-derived tilt; negative = flatter view of the horizon. */
  pitchBias = 0;
  private readonly look = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private lastMode = '';

  constructor(private readonly ctx: RenderContext) {}

  /** Current orbit distance (fog scaling, culling). */
  get distance(): number {
    return this.dist;
  }

  /** Smoothed focus point on the ground. */
  get target(): { x: number; z: number } {
    return { x: this.tx, z: this.tz };
  }

  focus(x: number, z: number, seconds = 2.2): void {
    this.fx = x;
    this.fz = z;
    this.focusUntil = this.ctx.env.t + seconds;
  }

  addShake(strength: number): void {
    this.shake = Math.min(1.5, this.shake + strength);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const game = ctx.game;
    const view = game.view;
    const cam = ctx.camera;
    const env = ctx.env;
    const vc = view.camera;

    // desired target
    let gx: number;
    let gz: number;
    let distMul = 1;
    let pitchAdd = 0;
    const mode = view.mode === 'map' ? 'map' : vc.mode;
    if (env.t < this.focusUntil) {
      gx = this.fx;
      gz = this.fz;
    } else if (mode === 'overview' || mode === 'map') {
      gx = vc.tx;
      gz = vc.tz;
    } else {
      gx = game.state.player.x;
      gz = game.state.player.z;
      // during an attack, lean toward the nearby alien front and pull back a little so the player sees
      // the aliens coming and the turrets at work (instead of the fight happening under the HUD)
      const combat = game.state.combat;
      if (combat.phase === 'attack' && view.mode === 'play') {
        let sx = 0;
        let sz = 0;
        let n = 0;
        for (const a of combat.aliens) {
          if (a.state === 'dying') continue;
          const ax = a.x - gx;
          const az = a.z - gz;
          if (ax * ax + az * az > COMBAT_FRAME_R * COMBAT_FRAME_R) continue;
          sx += ax;
          sz += az;
          n++;
        }
        if (n > 0) {
          // mostly a pull-back (the fight fits on screen); only a slight lean so the player never slides
          // up under the attack banner / hint bubble
          let ox = (sx / n) * 0.3;
          let oz = (sz / n) * 0.3;
          const l = Math.hypot(ox, oz);
          if (l > 3) {
            ox *= 3 / l;
            oz *= 3 / l;
          }
          gx += ox;
          gz += oz;
          distMul = 1.35;
        }
        // look a little past the player so they (and the turret beside them) sit below the attack banner
        const wantD = lerp(9, 46, Math.pow(clamp(vc.zoom, 0, 1), 1.15)) * distMul;
        gx -= Math.sin(vc.yaw) * wantD * COMBAT_LOOK_AHEAD;
        gz -= Math.cos(vc.yaw) * wantD * COMBAT_LOOK_AHEAD;
      }
    }
    if (mode === 'overview') {
      distMul = 1.55;
      pitchAdd = 0.12;
    } else if (mode === 'map') {
      distMul = 2.6;
      pitchAdd = 0.4;
    }
    const zoom = clamp(vc.zoom, 0, 1);
    const wantDist = lerp(9, 46, Math.pow(zoom, 1.15)) * distMul;
    const wantPitch = clamp(lerp(0.52, 0.95, zoom) + pitchAdd + this.pitchBias, 0.12, 1.4);
    const gy = ctx.heightAt(gx, gz) + (mode === 'follow' ? 1.1 : 0.4);

    const far = (gx - this.tx) * (gx - this.tx) + (gz - this.tz) * (gz - this.tz) > 90 * 90;
    if (this.snap || far || this.lastMode !== mode && mode === 'map') {
      this.tx = gx;
      this.ty = gy;
      this.tz = gz;
      this.dist = wantDist;
      this.pitch = wantPitch;
      this.yaw = vc.yaw;
      this.snap = false;
    }
    this.lastMode = mode;

    const kT = 1 - Math.exp(-dt * (mode === 'follow' ? 7 : 11));
    const kD = 1 - Math.exp(-dt * 6);
    const kY = 1 - Math.exp(-dt * 18);
    this.tx += (gx - this.tx) * kT;
    this.ty += (gy - this.ty) * kT;
    this.tz += (gz - this.tz) * kT;
    this.dist += (wantDist - this.dist) * kD;
    this.pitch += (wantPitch - this.pitch) * kD;
    // shortest-path yaw damping
    let dy = vc.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * kY;

    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    let cx = this.tx + Math.sin(this.yaw) * this.dist * cp;
    let cy = this.ty + this.dist * sp;
    let cz = this.tz + Math.cos(this.yaw) * this.dist * cp;
    // never clip into terrain
    const ground = ctx.heightAt(cx, cz);
    if (cy < ground + 1.6) cy = ground + 1.6;

    // shake
    if (this.shake > 0.001) {
      const s = this.shake;
      const t = env.t;
      cx += Math.sin(t * 47.0) * s * 0.5;
      cy += Math.sin(t * 53.0 + 1.3) * s * 0.35;
      cz += Math.cos(t * 41.0) * s * 0.5;
      this.shake *= Math.exp(-dt * 6.5);
    } else this.shake = 0;

    cam.position.set(cx, cy, cz);
    this.look.set(this.tx, this.ty, this.tz);
    cam.up.copy(this.up);
    cam.lookAt(this.look);

    // portrait phones need a wider vertical FOV
    const wantFov = cam.aspect < 1 ? 64 : cam.aspect < 1.4 ? 56 : 50;
    if (Math.abs(cam.fov - wantFov) > 0.1) {
      cam.fov = wantFov;
      cam.updateProjectionMatrix();
    }

    env.cx = this.tx;
    env.cz = this.tz;
    env.camX = cx;
    env.camY = cy;
    env.camZ = cz;
    env.fwdX = -Math.sin(this.yaw);
    env.fwdZ = -Math.cos(this.yaw);
    env.viewRadius = this.dist * 2.3 + 45;
  }
}
