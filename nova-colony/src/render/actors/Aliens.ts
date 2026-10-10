/**
 * Aliens actor — state.combat.aliens drawn through two instanced batches per model (body tinted
 * by AlienDef.color, fixed-color detail; bosses get their own pair with the boss regalia).
 * Procedural animation from the alien state: a bouncy, waddling walk, lunging attacks, burrowers
 * emerging from the ground with dirt and swaying in their mound, flyers gliding with a lazy bank,
 * hit flashes, squash-pop deaths with goo.
 *
 * Cost: aliens outside the camera frustum are skipped, and aliens the camera sees from afar (FAR_LOD_D, scaled by the
 * alien's size, with hysteresis) are drawn from the far geometry (models/aliens.ts lod 1: the same shapes at about
 * half the triangles), so a 100-alien raid seen from the raid camera costs a fraction of the full models.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeEuler } from '../core/Batch';
import { alienGeometry, type AlienGeo, type AlienLod } from '../models/aliens';
import type { Alien } from '../../core/state';
import { raySphere } from './Nature';
import { clamp } from '../../core/math';

interface AlienBatch {
  geo: AlienGeo;
  body: Batch;
  detail: Batch;
}

const _m = new THREE.Matrix4();
const _pv = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere();
const _c = new THREE.Color();
/** Camera distance (world units, per unit of alien scale) beyond which an alien uses its far geometry. */
export const FAR_LOD_D = 26;
/** Hysteresis band around FAR_LOD_D, so an alien walking along the boundary does not flip every frame. */
const LOD_HYST = 2;
const WHITE = new THREE.Color(1, 1, 1);
const FLASH = new THREE.Color(3, 3, 3);

export class Aliens {
  private group = new THREE.Group();
  private batches = new Map<string, AlienBatch>();
  /** Per model (and boss variant): batch keys per LOD [near, far] and the model height, resolved once. */
  private kinds = new Map<string, { keys: [string, string]; height: number }>();
  private bossKinds = new Map<string, { keys: [string, string]; height: number }>();
  /** Alien id → LOD it was last drawn at (hysteresis). */
  private lods = new Map<number, AlienLod>();
  private flashUntil = new Map<number, number>();
  private colorCache = new Map<string, THREE.Color>();
  private seen = new Set<number>();
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('alien:hit', (e) => {
        this.flashUntil.set(e.id, ctx.env.t + 0.12);
        const a = this.find(e.id);
        const def = a ? ctx.game.data.alien(a.def) : undefined;
        const y = (a ? a.y + ctx.heightAt(a.x, a.z) : ctx.heightAt(e.x, e.z)) + 0.6 * (def?.scale ?? 1);
        if (inView(ctx.env, e.x, e.z)) ctx.particles.sparks(e.x, y, e.z, 3, def?.color ?? '#9be36b', 3);
      }),
      bus.on('alien:killed', (e) => {
        const def = ctx.game.data.alien(e.def);
        const y = ctx.heightAt(e.x, e.z);
        const s = def?.scale ?? 1;
        if (!inView(ctx.env, e.x, e.z, 10)) return;
        ctx.particles.goo(e.x, y + 0.3 * s, e.z, def?.color ?? '#9be36b', 10 + s * 6);
        ctx.particles.flash(e.x, y + 0.6 * s, e.z, 0.8 * s, def?.color ?? '#9be36b', 0.18);
        if (def?.boss) ctx.particles.confetti(e.x, y + 2 * s, e.z, 40);
        this.flashUntil.delete(e.id);
      }),
      bus.on('alien:spawned', (e) => {
        const def = ctx.game.data.alien(e.def);
        if (!inView(ctx.env, e.x, e.z, 10)) return;
        const y = ctx.heightAt(e.x, e.z);
        if (def?.burrow) {
          ctx.particles.dust(e.x, y, e.z, 18, 1.2 * (def.scale ?? 1), '#6e5a44');
          ctx.particles.ring(e.x, y + 0.2, e.z, 1.2 * (def.scale ?? 1), '#8a6a44', 14);
        } else if (def?.flying) ctx.particles.sparkles(e.x, y + 2, e.z, def.color, 6, 0.6);
      }),
    );
  }

  private find(id: number): Alien | undefined {
    return this.ctx.game.state.combat.aliens.find((a) => a.id === id);
  }

  private kind(model: string, boss: boolean): { keys: [string, string]; height: number } {
    const map = boss ? this.bossKinds : this.kinds;
    let k = map.get(model);
    if (!k) {
      const mk = boss ? model + ':boss' : model;
      k = { keys: [mk, mk + ':far'], height: alienGeometry(model, boss).height };
      map.set(model, k);
    }
    return k;
  }

  private batch(model: string, boss: boolean, lod: AlienLod): AlienBatch {
    const key = this.kind(model, boss).keys[lod];
    let b = this.batches.get(key);
    if (!b) {
      const geo = alienGeometry(model, boss, lod);
      b = {
        geo,
        body: new Batch(this.group, geo.body, this.ctx.mats.set, 16, { color: true, castShadow: true }),
        detail: new Batch(this.group, geo.detail, this.ctx.mats.set, 16, { color: true }),
      };
      this.batches.set(key, b);
    }
    return b;
  }

  private color(hex: string): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const t = env.t;
    const aliens = ctx.game.state.combat.aliens;
    for (const b of this.batches.values()) {
      b.body.begin();
      b.detail.begin();
    }
    if (aliens.length) {
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      _pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
    }
    for (let i = 0; i < aliens.length; i++) {
      const a = aliens[i];
      const def = ctx.game.data.alien(a.def);
      const model = def?.model ?? a.def;
      if (!inView(env, a.x, a.z, 15)) continue;
      const scale = def?.scale ?? 1;
      const ground = ctx.heightAt(a.x, a.z);
      // off screen: nothing to draw (a generous sphere: lunges, bounces and squash stay inside it)
      const h = this.kind(model, !!def?.boss).height * scale;
      _sphere.center.set(a.x, ground + (a.y || 0) + h * 0.5, a.z);
      _sphere.radius = Math.max(h * 0.75, 1.2 * scale) + 0.8;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const cdx = a.x - env.camX;
      const cdy = ground - env.camY;
      const cdz = a.z - env.camZ;
      const d = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz) / scale;
      const prev = this.lods.get(a.id);
      const lod: AlienLod = prev === undefined ? (d > FAR_LOD_D ? 1 : 0) : prev === 1 ? (d < FAR_LOD_D - LOD_HYST ? 0 : 1) : d > FAR_LOD_D + LOD_HYST ? 1 : 0;
      if (lod !== prev) this.lods.set(a.id, lod);
      const b = this.batch(model, !!def?.boss, lod);
      const phase = a.id * 0.77;
      let sx = 1;
      let sy = 1;
      let sz = 1;
      let y = ground + (a.y || 0);
      let rx = 0;
      let rz = 0;
      let fwd = 0;
      const speed = def?.speed ?? 1.5;
      switch (a.state) {
        case 'spawning': {
          const k = clamp(a.t / 0.6, 0, 1);
          if (def?.burrow) {
            y = ground - (1 - k) * 1.6 * scale;
            if (Math.random() < dt * 12 && k < 0.9) ctx.particles.dust(a.x, ground, a.z, 1, 0.8 * scale, '#6e5a44');
          } else {
            sx = sz = sy = 0.2 + k * 0.8;
          }
          break;
        }
        case 'moving': {
          const w = Math.sin(t * speed * 5 + phase);
          const bounce = Math.abs(w);
          if (def?.flying) y += Math.sin(t * 3 + phase) * 0.25;
          else y += bounce * 0.12 * scale;
          sy = 1 + w * 0.06;
          sx = sz = 1 - w * 0.04;
          rx = def?.flying ? Math.sin(t * 3 + phase) * 0.06 : 0.08;
          // waddle (walkers), sway (burrowers in their mound), lazy bank (flyers)
          rz = def?.flying ? Math.sin(t * 1.3 + phase) * 0.12 : def?.burrow ? Math.sin(t * speed * 2.5 + phase) * 0.1 : Math.cos(t * speed * 5 + phase) * 0.07;
          break;
        }
        case 'attacking': {
          const lunge = Math.max(0, Math.sin(t * 7 + phase));
          fwd = lunge * 0.35 * scale;
          sz = 1 + lunge * 0.15;
          sy = 1 - lunge * 0.08;
          rx = lunge * 0.25;
          if (def?.flying) y += Math.sin(t * 3 + phase) * 0.2;
          break;
        }
        case 'dying': {
          const k = clamp(a.t / 0.45, 0, 1);
          sy = Math.max(0.02, 1 - k) * (1 + k * 0.3);
          sx = sz = 1 + k * 0.5;
          break;
        }
      }
      const yaw = a.rot || 0;
      const px = a.x + Math.sin(yaw) * fwd;
      const pz = a.z + Math.cos(yaw) * fwd;
      // slowed aliens get a subtle blue tint
      const flash = (this.flashUntil.get(a.id) ?? 0) > t;
      const base = this.color(def?.color ?? '#9be36b');
      if (flash) _c.copy(FLASH);
      else if (a.slowT > 0) _c.copy(base).lerp(this.color('#6fd8ff'), 0.4);
      else _c.copy(base);
      composeEuler(_m, px, y, pz, rx, yaw, rz, sx * scale, sy * scale, sz * scale);
      b.body.push(_m, _c);
      b.detail.push(_m, flash ? FLASH : WHITE);
      // first sight of a burrower underground: dirt mound
      if (!this.seen.has(a.id)) {
        this.seen.add(a.id);
      }
    }
    for (const b of this.batches.values()) {
      b.body.end();
      b.detail.end();
    }
    // cleanup
    if (this.flashUntil.size > 64) for (const [id, until] of this.flashUntil) if (until < t) this.flashUntil.delete(id);
    if (this.seen.size > 512) this.seen.clear();
    if (this.lods.size > 512) this.lods.clear();
  }

  alienInfo(id: number): { x: number; y: number; z: number; radius: number; height: number } | null {
    const a = this.find(id);
    if (!a) return null;
    const def = this.ctx.game.data.alien(a.def);
    const s = def?.scale ?? 1;
    const geo = alienGeometry(def?.model ?? a.def, !!def?.boss);
    return { x: a.x, y: this.ctx.heightAt(a.x, a.z) + (a.y || 0), z: a.z, radius: 0.8 * s, height: geo.height * s };
  }

  pick(ray: THREE.Ray, maxT: number): { id: number; t: number } | null {
    let best = -1;
    let bestT = maxT;
    const o = ray.origin;
    const d = ray.direction;
    for (const a of this.ctx.game.state.combat.aliens) {
      if (a.state === 'dying') continue;
      const def = this.ctx.game.data.alien(a.def);
      const s = def?.scale ?? 1;
      const geo = alienGeometry(def?.model ?? a.def, !!def?.boss);
      const t = raySphere(o, d, a.x, this.ctx.heightAt(a.x, a.z) + (a.y || 0) + geo.height * s * 0.5, a.z, Math.max(0.7, geo.height * s * 0.55));
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = a.id;
      }
    }
    return best >= 0 ? { id: best, t: bestT } : null;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of this.batches.values()) {
      b.body.dispose();
      b.detail.dispose();
    }
    this.ctx.scene.remove(this.group);
  }
}
