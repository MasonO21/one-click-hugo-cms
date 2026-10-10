/**
 * POIs actor — points of interest from gen.pois (instanced per model, only the ones inside the
 * camera frustum: rebuilt when the camera moves or turns) with a bobbing marker over
 * discovered-but-unlooted ones, plus beam markers for active world events (state.world.events).
 * A cache that restocked (opened before, full again) also wears a slow survey ring on the ground and lets off a
 * rare glint, so a returning player can tell it from one never opened.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeYaw, composeEuler } from '../core/Batch';
import { ViewCull } from '../core/cull';
import { poiGeometry, poiHeight, markerGeometry, eventMarkerGeometry, restockGeometry } from '../models/pois';
import type { WorldGen, WorldPoi } from '../../sim/world';
import { raySphere } from './Nature';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

export class Pois {
  private group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private markers: Batch;
  private events: Batch;
  private restock: Batch;
  private glintAcc = 0;
  private gen: WorldGen | null = null;
  private models: string[] = [];
  private smokeAcc = 0;
  private lastTerrain = -1;
  /** POI count when last built: runtime POIs (e.g. the tutorial survivor camp) are appended to gen.pois. */
  private lastPoiCount = -1;
  private readonly cull = new ViewCull(10);
  private refresh = 0;
  private readonly unsub: (() => void)[] = [];
  /** Photo Mode: no markers in the picture (the bobbing POI diamonds and event beams are markers, like the HUD). */
  hidden = false;

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    this.markers = new Batch(this.group, markerGeometry(), ctx.mats.set, 16, { color: true });
    this.events = new Batch(this.group, eventMarkerGeometry(), ctx.mats.set, 4, { color: true });
    this.restock = new Batch(this.group, restockGeometry(), ctx.mats.set, 8, { color: true });
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('world:poiLooted', (e) => {
        const p = this.find(e.id);
        if (p) {
          const y = ctx.heightAt(p.x, p.z);
          ctx.particles.sparkles(p.x, y + 0.5, p.z, '#ffd84a', 24, 1.5);
          ctx.particles.confetti(p.x, y + 1.5, p.z, 20);
        }
      }),
      bus.on('world:poiDiscovered', (e) => {
        const p = this.find(e.id);
        if (p) ctx.particles.ring(p.x, ctx.heightAt(p.x, p.z) + 0.5, p.z, 2, '#ffd84a', 16);
      }),
      bus.on('world:eventStarted', (e) => {
        ctx.particles.flash(e.x, ctx.heightAt(e.x, e.z) + 2, e.z, 3, '#5ef2ff', 0.4);
        ctx.particles.ring(e.x, ctx.heightAt(e.x, e.z) + 0.3, e.z, 3, '#5ef2ff', 24);
      }),
    );
  }

  private find(id: string): WorldPoi | undefined {
    return this.gen?.pois.find((p) => p.id === id);
  }

  private setGen(gen: WorldGen | null): void {
    this.gen = gen;
    this.models = [];
    if (gen?.pois) {
      const data = this.ctx.game.data;
      for (const p of gen.pois) this.models.push(data.poi(p.def)?.model ?? p.def);
    }
    this.rebuild();
  }

  /** Refill the static batches with the POIs the camera can see (landmarks: generous 220-unit range). */
  private rebuild(): void {
    const ctx = this.ctx;
    const env = ctx.env;
    this.cull.sync(env, ctx.camera);
    for (const b of this.batches.values()) b.begin();
    const pois = this.gen?.pois;
    if (pois) {
      for (let i = 0; i < pois.length; i++) {
        const p = pois[i];
        const dx = p.x - env.cx;
        const dz = p.z - env.cz;
        if (dx * dx + dz * dz > 220 * 220) continue;
        const model = this.models[i];
        const y = ctx.heightAt(p.x, p.z);
        const h = poiHeight(model);
        if (!this.cull.sphere(p.x, y + h * 0.5, p.z, Math.max(3, h))) continue;
        let b = this.batches.get(model);
        if (!b) {
          b = new Batch(this.group, poiGeometry(model), ctx.mats.set, 8, { castShadow: true, receiveShadow: true });
          this.batches.set(model, b);
        }
        composeYaw(_m, p.x, y - 0.05, p.z, p.rot || 0);
        b.push(_m);
      }
    }
    for (const b of this.batches.values()) {
      b.end();
      b.setVisible(b.count > 0);
    }
    this.refresh = 0;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const gen = (ctx.game.sys.world.gen as WorldGen | undefined) ?? null;
    const env = ctx.env;
    const poiCount = gen?.pois?.length ?? -1;
    if (gen !== this.gen || env.terrainVersion !== this.lastTerrain || poiCount !== this.lastPoiCount) {
      this.lastTerrain = env.terrainVersion;
      this.lastPoiCount = poiCount;
      this.setGen(gen);
    }
    this.refresh += dt;
    if (this.refresh > 5 || this.cull.stale(env, ctx.camera)) this.rebuild();
    const t = env.t;
    const st = ctx.game.state.world;

    // markers over discovered, unlooted POIs (+ the ring of a restocked cache)
    this.markers.begin();
    this.restock.begin();
    this.smokeAcc += dt;
    const puff = this.smokeAcc > 0.5;
    if (puff) this.smokeAcc = 0;
    this.glintAcc += dt;
    const glint = this.glintAcc > 1.6;
    if (glint) this.glintAcc = 0;
    const world = ctx.game.sys.world;
    if (this.gen?.pois) {
      for (let i = 0; i < this.gen.pois.length; i++) {
        const p = this.gen.pois[i];
        if (!inView(env, p.x, p.z, 20)) continue;
        const s = st.pois[p.id];
        const model = this.models[i];
        if (puff && model === 'wreck') ctx.particles.smoke(p.x + 0.4, ctx.heightAt(p.x, p.z) + 2.2, p.z - 0.2, 0.35, '#5a5560', 2.2);
        if (!s || !s.discovered || s.looted || this.hidden) continue;
        const y = ctx.heightAt(p.x, p.z) + poiHeight(model) + 0.9 + Math.sin(t * 2.2 + i) * 0.2;
        composeEuler(_m, p.x, y, p.z, 0, t * 1.4 + i, 0, 1.1);
        const def = ctx.game.data.poi(p.def);
        _c.set(def?.kind === 'camp' ? '#8dff9a' : def?.kind === 'beacon' ? '#5ef2ff' : '#ffd84a');
        this.markers.push(_m, _c);
        if (world.poiRestocked(p.id)) {
          const gy = ctx.heightAt(p.x, p.z);
          const k = 1 + Math.sin(t * 1.6 + i) * 0.05;
          composeEuler(_m, p.x, gy, p.z, 0, t * 0.25 + i, 0, k, 1, k);
          _c.set('#a8f08a');
          this.restock.push(_m, _c);
          if (glint) ctx.particles.sparkles(p.x, gy + 0.4, p.z, '#d8ffb8', 3, 1.6);
        }
      }
    }
    this.markers.end();
    this.restock.end();

    // world event beams
    this.events.begin();
    for (let i = 0; i < st.events.length; i++) {
      const e = st.events[i];
      if (e.claimed || this.hidden) continue;
      const y = ctx.heightAt(e.x, e.z);
      const pulse = 1 + Math.sin(t * 3 + i) * 0.08;
      composeEuler(_m, e.x, y, e.z, 0, t * 0.8, 0, pulse, 1, pulse);
      const def = ctx.game.data.worldEvent(e.def);
      _c.set(def?.kind === 'merchant' ? '#ffd84a' : def?.kind === 'nest' ? '#c56cf0' : def?.kind === 'meteor' ? '#ff9a2e' : '#5ef2ff');
      this.events.push(_m, _c);
      if (inView(env, e.x, e.z) && Math.random() < dt * 3) ctx.particles.emit('glow', e.x + (Math.random() - 0.5) * 2, y + Math.random() * 2, e.z + (Math.random() - 0.5) * 2, 0, 1.5, 0, 1.2, 0.14, _c, { curve: 'grow' });
    }
    this.events.end();
  }

  poiInfo(id: string): { x: number; y: number; z: number; radius: number; height: number } | null {
    const i = this.gen?.pois.findIndex((p) => p.id === id) ?? -1;
    if (i < 0 || !this.gen) return null;
    const p = this.gen.pois[i];
    return { x: p.x, y: this.ctx.heightAt(p.x, p.z), z: p.z, radius: 1.8, height: poiHeight(this.models[i]) };
  }

  eventInfo(id: number): { x: number; y: number; z: number; radius: number; height: number } | null {
    const e = this.ctx.game.state.world.events.find((x) => x.id === id);
    if (!e) return null;
    return { x: e.x, y: this.ctx.heightAt(e.x, e.z), z: e.z, radius: 1.5, height: 3 };
  }

  pick(ray: THREE.Ray, maxT: number): { kind: 'poi' | 'event'; id: string | number; t: number } | null {
    let best: { kind: 'poi' | 'event'; id: string | number; t: number } | null = null;
    let bestT = maxT;
    const o = ray.origin;
    const d = ray.direction;
    if (this.gen?.pois) {
      for (let i = 0; i < this.gen.pois.length; i++) {
        const p = this.gen.pois[i];
        const h = poiHeight(this.models[i]);
        const t = raySphere(o, d, p.x, this.ctx.heightAt(p.x, p.z) + h * 0.5, p.z, Math.max(1.4, h * 0.5));
        if (t >= 0 && t < bestT) {
          bestT = t;
          best = { kind: 'poi', id: p.id, t };
        }
      }
    }
    for (const e of this.ctx.game.state.world.events) {
      if (e.claimed) continue;
      const t = raySphere(o, d, e.x, this.ctx.heightAt(e.x, e.z) + 1.5, e.z, 1.8);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = { kind: 'event', id: e.id, t };
      }
    }
    return best;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of this.batches.values()) b.dispose();
    this.markers.dispose();
    this.events.dispose();
    this.restock.dispose();
    this.ctx.scene.remove(this.group);
  }
}
