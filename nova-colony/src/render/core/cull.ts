/**
 * ViewCull — software frustum culling for static instanced content (nature, POIs). Actors keep their
 * instance buffers in sync with the camera by rebuilding when `stale()` says the camera moved or
 * turned enough; between rebuilds the margin-expanded frustum guarantees nothing pops at the screen
 * edge. Allocation-free after construction.
 */
import * as THREE from 'three';
import type { Env } from './context';

export class ViewCull {
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sph = new THREE.Sphere();
  private readonly bx = new THREE.Box3();
  private lastCamX = NaN;
  private lastCamY = NaN;
  private lastCamZ = NaN;
  private lastFwdX = 0;
  private lastFwdZ = 0;
  private lastRadius = 0;
  private lastAspect = 0;

  /**
   * @param margin  world units the frustum planes are pushed outward
   * @param move    camera translation (units) that makes the cull stale
   * @param turn    camera yaw change (radians) that makes the cull stale
   * @param radius  view-radius change (units, zoom) that makes the cull stale
   */
  constructor(private readonly margin: number, private readonly move = 3, private readonly turn = 0.08, private readonly radius = 10) {}

  /** Has the camera moved / turned / zoomed enough since the last sync() to warrant a rebuild? */
  stale(env: Env, camera: THREE.PerspectiveCamera): boolean {
    if (Number.isNaN(this.lastCamX)) return true;
    const dx = env.camX - this.lastCamX;
    const dy = env.camY - this.lastCamY;
    const dz = env.camZ - this.lastCamZ;
    if (dx * dx + dy * dy + dz * dz > this.move * this.move) return true;
    if (env.fwdX * this.lastFwdX + env.fwdZ * this.lastFwdZ < Math.cos(this.turn)) return true;
    return Math.abs(env.viewRadius - this.lastRadius) > this.radius || camera.aspect !== this.lastAspect;
  }

  /** Recompute the planes from the camera's current placement and remember it for stale(). */
  sync(env: Env, camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    for (const p of this.frustum.planes) p.constant += this.margin;
    this.lastCamX = env.camX;
    this.lastCamY = env.camY;
    this.lastCamZ = env.camZ;
    this.lastFwdX = env.fwdX;
    this.lastFwdZ = env.fwdZ;
    this.lastRadius = env.viewRadius;
    this.lastAspect = camera.aspect;
  }

  sphere(x: number, y: number, z: number, r: number): boolean {
    this.sph.center.set(x, y, z);
    this.sph.radius = r;
    return this.frustum.intersectsSphere(this.sph);
  }

  box(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    this.bx.min.set(minX, minY, minZ);
    this.bx.max.set(maxX, maxY, maxZ);
    return this.frustum.intersectsBox(this.bx);
  }
}
