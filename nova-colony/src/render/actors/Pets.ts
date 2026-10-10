/**
 * The player's pet (equipped `pet` cosmetic): one body mesh plus instanced legs and one instanced
 * moving-part kind (tail / ears / wings / fluke / rotors), animated procedurally from the follow
 * motion in petMotion.ts. Purely visual — the sim never sees it, nothing can block or target it.
 * Owned and driven by the Characters actor, so it shows wherever the player does (Photo Mode too).
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeEuler } from '../core/Batch';
import { emptyGeometry } from '../core/GeoBuilder';
import { PETS, petGeometry, type PetSpec, type PetMount } from '../models/pets';
import { newPetMotion, stepPet, type PetMotion } from './petMotion';
import { clamp } from '../../core/math';

const _root = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _p = new THREE.Matrix4();
const _v = new THREE.Vector3();
const EMPTY = emptyGeometry();

export class PetActor {
  private readonly body: THREE.Mesh;
  private readonly legs: Batch;
  private readonly parts: Batch;
  private readonly partsL: Batch;
  private key = '';
  private id: string | undefined = '\u0000';
  private moteColor = '#ffd27a';
  private spec: PetSpec | null = null;
  readonly motion: PetMotion = newPetMotion();
  private moteT = 0;

  constructor(
    private readonly ctx: RenderContext,
    parent: THREE.Object3D,
  ) {
    const mats = ctx.mats.set;
    this.body = new THREE.Mesh(EMPTY, ctx.mats.litPlain);
    this.body.matrixAutoUpdate = false;
    this.body.castShadow = true;
    this.body.visible = false;
    parent.add(this.body);
    this.legs = new Batch(parent, EMPTY, mats, 4, { castShadow: true, name: 'pet-legs' });
    this.parts = new Batch(parent, EMPTY, mats, 4, { castShadow: false, name: 'pet-parts' });
    this.partsL = new Batch(parent, EMPTY, mats, 2, { castShadow: false, name: 'pet-parts-l' });
  }

  /** Swap models when the equipped pet (or its colours) changes; null hides the pet. */
  private setPet(id: string | undefined): void {
    if (id === this.id) return;
    this.id = id;
    const def = id ? this.ctx.game.data.cosmetic(id) : undefined;
    const key = def && PETS[def.id] ? `${def.id}|${def.color}|${def.accent}` : '';
    if (key === this.key) return;
    this.key = key;
    const geo = def && key ? petGeometry(def.id, def.color ?? '#c8c8c8', def.accent ?? '#ffffff') : null;
    this.spec = geo && def ? PETS[def.id] : null;
    const motes = this.spec?.motes;
    this.moteColor = (motes?.color === 'accent' ? def?.accent : def?.color) ?? '#ffd27a';
    this.body.geometry = geo?.body ?? EMPTY;
    this.legs.setGeometry(geo?.leg ?? EMPTY);
    this.parts.setGeometry(geo?.part ?? EMPTY);
    this.partsL.setGeometry(geo?.partL ?? EMPTY);
    this.motion.init = false;
  }

  /**
   * One frame: follow the player at (px, pz) facing `prot` at planar speed `pSpeed`. `show` = false
   * hides the pet (no pet equipped, or the player is not in the world).
   */
  update(dt: number, petId: string | undefined, px: number, pz: number, prot: number, pSpeed: number, show: boolean): void {
    this.setPet(petId);
    const spec = this.spec;
    this.legs.begin();
    this.parts.begin();
    this.partsL.begin();
    if (!spec || !show) {
      this.body.visible = false;
      this.legs.end();
      this.parts.end();
      this.partsL.end();
      return;
    }
    const ctx = this.ctx;
    const env = ctx.env;
    const t = env.t;
    const m = this.motion;
    stepPet(m, px, pz, prot, pSpeed, dt, { side: spec.side, back: spec.back, lag: spec.lag, stride: spec.stride, personal: spec.fly ? 0 : 0.75 });
    const ground = ctx.heightAt(m.x, m.z);
    const move = clamp(m.speed / 1.6, 0, 1);
    const sit = m.sit;
    let x = m.x;
    let z = m.z;
    let y = ground;
    let pitch = 0;
    let roll = 0;
    const yaw = m.rot;
    const fwd = m.vx * Math.sin(yaw) + m.vz * Math.cos(yaw);
    const side = m.vx * Math.cos(yaw) - m.vz * Math.sin(yaw);
    switch (spec.gait) {
      case 'walk': {
        y += Math.abs(Math.sin(m.phase)) * 0.025 * move;
        pitch = (spec.sit?.pitch ?? 0) * sit;
        y -= (spec.sit?.drop ?? 0) * sit;
        break;
      }
      case 'hop': {
        const hop = Math.max(0, Math.sin(m.phase));
        y += hop * 0.16 * move;
        pitch = -Math.cos(m.phase) * 0.22 * move + (spec.sit?.pitch ?? 0) * (1 - move);
        y -= (spec.sit?.drop ?? 0) * sit;
        break;
      }
      case 'hover': {
        y += (spec.fly ?? 1.5) + Math.sin(t * 2.1) * 0.06;
        pitch = clamp(fwd * 0.07, -0.35, 0.35);
        roll = clamp(-side * 0.08, -0.35, 0.35);
        break;
      }
      case 'flutter': {
        // lazy figure-eight drift around its spot
        x += Math.sin(t * 0.7) * 0.35 * (1 - move * 0.7);
        z += Math.sin(t * 1.4) * 0.18 * (1 - move * 0.7);
        y += (spec.fly ?? 1.6) + Math.sin(t * 1.3) * 0.14 + Math.abs(Math.sin(t * 7.5)) * 0.03;
        pitch = clamp(fwd * 0.05, -0.3, 0.3) - 0.1;
        roll = Math.sin(t * 0.7) * 0.12;
        break;
      }
      case 'swim': {
        y += (spec.fly ?? 3) + Math.sin(t * 0.6) * 0.25;
        pitch = Math.sin(t * 0.8) * 0.07 + clamp(fwd * 0.03, -0.15, 0.15);
        roll = clamp(-side * 0.06, -0.25, 0.25);
        break;
      }
    }
    composeEuler(_root, x, y, z, pitch, yaw, roll);
    this.body.matrix.copy(_root);
    this.body.visible = true;

    // legs
    const leg = spec.leg;
    if (leg) {
      for (let i = 0; i < leg.mounts.length; i++) {
        const mt = leg.mounts[i];
        const ph = m.phase + (mt.phase ?? 0);
        let rx: number;
        if (spec.gait === 'hop') {
          // hind legs push back on take-off and tuck under in the air; front legs reach forward
          rx = mt.hind ? (Math.sin(m.phase) > 0 ? 0.65 : -0.35) * move : -Math.sin(m.phase) * 0.5 * move;
          if (mt.hind) rx = rx * (1 - sit) + (-1.1 - pitch) * sit * (1 - move);
        } else {
          rx = Math.sin(ph) * 0.55 * move;
          if (mt.hind) rx = rx * (1 - sit) + (-1.35 - pitch) * sit;
          else rx = rx * (1 - sit) - pitch * sit;
        }
        this.mount(_p, mt, rx, 0, 0);
        _m.multiplyMatrices(_root, _p);
        this.legs.push(_m);
      }
    }

    // moving parts
    const part = spec.part;
    if (part) {
      for (let i = 0; i < part.mounts.length; i++) {
        const mt = part.mounts[i];
        const sgn = mt.flip ? -1 : 1;
        let rx = 0;
        let ry = 0;
        let rz = 0;
        switch (part.kind) {
          case 'tail': {
            const happy = sit > 0.5 ? 1 : 0.4;
            ry = Math.sin(t * (spec.gait === 'walk' && spec.side > 0.95 ? 6 : 2.2) + i) * 0.35 * happy;
            rx = -0.15 * move;
            break;
          }
          case 'ears': {
            const twitch = Math.max(0, Math.sin(t * 0.9 + i * 1.7) - 0.92) * 6;
            rx = 0.35 * move * Math.max(0, Math.sin(m.phase)) - 0.05 + twitch * 0.25;
            rz = sgn * (-0.12 - 0.08 * move);
            break;
          }
          case 'wings': {
            const beat = 0.15 + 0.95 * Math.abs(Math.sin(t * 7.5));
            rz = sgn * beat;
            break;
          }
          case 'fluke':
            rx = Math.sin(t * 1.7) * 0.4;
            break;
          case 'rotor':
            ry = t * 38 * sgn;
            break;
        }
        this.mount(_p, mt, rx, ry, rz);
        _m.multiplyMatrices(_root, _p);
        (mt.flip ? this.partsL : this.parts).push(_m);
      }
    }
    this.legs.end();
    this.parts.end();
    this.partsL.end();

    // ambient motes (embers off the fox's tail, glow off the moth)
    const motes = spec.motes;
    if (motes && inView(env, m.x, m.z, -20)) {
      this.moteT += dt * motes.rate;
      if (this.moteT > 1) {
        this.moteT -= 1 + Math.random() * 0.5;
        _v.set(motes.at[0], motes.at[1], motes.at[2]).applyMatrix4(_root);
        const col = this.moteColor;
        ctx.particles.emit('glow', _v.x + (Math.random() - 0.5) * 0.15, _v.y, _v.z + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.2, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.2, 1.2, 0.07, col, { curve: 'grow' });
      }
    }
  }

  private mount(out: THREE.Matrix4, mt: PetMount, rx: number, ry: number, rz: number): THREE.Matrix4 {
    const s = mt.s ?? 1;
    composeEuler(out, mt.x, mt.y, mt.z, rx, ry, rz, s, s, s);
    return out;
  }

  /** Where the pet is now (world), for tests and debugging. */
  position(): { x: number; z: number; visible: boolean } {
    return { x: this.motion.x, z: this.motion.z, visible: this.body.visible };
  }

  dispose(): void {
    this.body.removeFromParent();
    this.legs.dispose();
    this.parts.dispose();
    this.partsL.dispose();
  }
}
