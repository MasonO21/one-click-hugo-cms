/**
 * RenderContext — what every render module receives: the game (read-only), the scene, camera,
 * shared materials, the per-frame environment (clock, night factor, culling center) and services
 * provided by sibling modules (terrain height sampling, particle emission).
 */
import type * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { Materials } from './materials';
import type { Particles } from '../fx/Particles';

export type Quality = 'low' | 'medium' | 'high';

export interface Env {
  /** Animation clock in seconds (render time, unaffected by pause). */
  t: number;
  dt: number;
  /** 0 = full day, 1 = deep night. */
  night: number;
  /** Sun elevation -1..1 (1 = noon). */
  sunElev: number;
  quality: Quality;
  /** Camera focus point (world) used for distance culling. */
  cx: number;
  cz: number;
  /** Actors/props farther than this from the focus are not animated/drawn. */
  viewRadius: number;
  camX: number;
  camY: number;
  camZ: number;
  /** Camera forward on the ground plane. */
  fwdX: number;
  fwdZ: number;
  /** Bumped whenever the terrain mesh / height field is rebuilt (actors re-sample heights). */
  terrainVersion: number;
}

export interface RenderContext {
  game: Game;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mats: Materials;
  env: Env;
  /** Terrain height at a world position (renderer-side bilinear sample of WorldGen.heights). */
  heightAt: (x: number, z: number) => number;
  particles: Particles;
}

/** Cheap "is this world point worth drawing" test against the focus radius (squared distance). */
export function inView(env: Env, x: number, z: number, extra = 0): boolean {
  const dx = x - env.cx;
  const dz = z - env.cz;
  const r = env.viewRadius + extra;
  return dx * dx + dz * dz < r * r;
}
