/**
 * Projectiles actor — state.combat.projectiles pooled per kind (bullet tracer, arrow, flame
 * particles, missile + smoke trail, laser beam, plasma orb, rail beam, cannon ball, drone).
 * Impacts/explosions are handled by Effects (projectile:impact).
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeAlong, composeEuler } from '../core/Batch';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

const GEOS: Record<string, (b: GeoBuilder) => void> = {
  bullet: (b) => {
    b.box(0.1, 0.1, 0.9, 0, 0, 0, '#ffe08a', { slot: SLOT_GLOW });
    b.box(0.05, 0.05, 1.3, 0, 0, -0.2, '#fff6d0', { slot: SLOT_GLOW });
  },
  arrow: (b) => {
    b.box(0.05, 0.05, 1.0, 0, 0, 0, '#9c6b3c');
    b.cone(0.06, 0.2, 0, 0, 0.58, '#aeb9c7', 4, { rx: Math.PI / 2 });
    b.box(0.16, 0.02, 0.2, 0, 0, -0.42, '#e86f4d');
    b.box(0.02, 0.16, 0.2, 0, 0, -0.42, '#e86f4d');
  },
  missile: (b) => {
    b.cyl(0.12, 0.12, 0.8, 0, 0, 0, '#c7d0da', 7, { rx: Math.PI / 2 });
    b.cone(0.12, 0.3, 0, 0, 0.55, '#ff4d5e', 7, { rx: Math.PI / 2 });
    for (let i = 0; i < 4; i++) b.box(0.03, 0.22, 0.2, 0, 0, -0.35, '#8d97a3', { rz: (i * Math.PI) / 2 + Math.PI / 4, sx: 1 });
    b.cone(0.1, 0.35, 0, 0, -0.55, '#ff9a2e', 6, { rx: -Math.PI / 2, slot: SLOT_GLOW });
  },
  laser: (b) => {
    b.box(0.12, 0.12, 2.8, 0, 0, 0, '#ff4d7a', { slot: SLOT_GLOW });
    b.box(0.05, 0.05, 2.8, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
  },
  plasma: (b) => {
    b.sphere(0.32, 0, 0, 0, '#58d0ff', 7, { slot: SLOT_GLOW });
    b.sphere(0.18, 0, 0, 0, '#ffffff', 6, { slot: SLOT_GLOW });
    b.sphere(0.14, 0, 0, -0.45, '#58d0ff', 5, { slot: SLOT_GLOW });
  },
  rail: (b) => {
    b.box(0.09, 0.09, 6.0, 0, 0, 0, '#9fdcff', { slot: SLOT_GLOW });
    b.box(0.04, 0.04, 6.0, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
    b.sphere(0.2, 0, 0, 3.0, '#ffffff', 5, { slot: SLOT_GLOW });
  },
  cannon: (b) => {
    b.sphere(0.32, 0, 0, 0, '#3a3f47', 7);
    b.sphere(0.1, 0, 0, -0.3, '#ff9a2e', 4, { slot: SLOT_GLOW });
  },
  drone: (b) => {
    b.box(0.5, 0.16, 0.5, 0, 0, 0, '#6b7482');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.4, 0.04, 0.04, sx * 0.3, 0.04, sz * 0.3, '#3a3f47', { ry: Math.PI / 4 });
      b.cyl(0.22, 0.22, 0.03, sx * 0.4, 0.08, sz * 0.4, '#5ef2ff', 8, { slot: SLOT_GLOW });
    }
    b.sphere(0.06, 0, -0.06, 0.25, '#ff4d5e', 4, { slot: SLOT_GLOW });
    b.cyl(0.03, 0.03, 0.3, 0, -0.1, 0.1, '#3a3f47', 4, { rx: Math.PI / 2 });
  },
  acid: (b) => {
    b.sphere(0.22, 0, 0, 0, '#9be36b', 6, { slot: SLOT_GLOW });
    b.sphere(0.12, 0.1, 0.1, -0.2, '#c56cf0', 5, { slot: SLOT_GLOW });
  },
  fallback: (b) => {
    b.sphere(0.2, 0, 0, 0, '#ffffff', 6, { slot: SLOT_GLOW });
  },
};

export class Projectiles {
  private group = new THREE.Group();
  private batches = new Map<string, Batch>();
  private geoCache = new Map<string, THREE.BufferGeometry>();

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
  }

  private batch(kind: string): Batch {
    let b = this.batches.get(kind);
    if (!b) {
      let geo = this.geoCache.get(kind);
      if (!geo) {
        const gb = new GeoBuilder(kind.length * 3 + 1);
        (GEOS[kind] ?? GEOS.fallback)(gb);
        geo = gb.build();
        this.geoCache.set(kind, geo);
      }
      b = new Batch(this.group, geo, this.ctx.mats.set, 32, { renderOrder: 8 });
      this.batches.set(kind, b);
    }
    return b;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const list = ctx.game.state.combat.projectiles;
    for (const b of this.batches.values()) b.begin();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!inView(env, p.x, p.z, 20)) continue;
      const kind = p.kind;
      const y = p.y; // projectiles carry absolute world y
      if (kind === 'flame') {
        // flame cone: particles only
        const n = Math.random() < dt * 45 * ctx.particles.scale ? 2 : 0;
        for (let k = 0; k < n; k++) {
          ctx.particles.emit('glow', p.x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3, p.vx * 0.4 + (Math.random() - 0.5) * 2, 1 + Math.random(), p.vz * 0.4 + (Math.random() - 0.5) * 2, 0.35 + Math.random() * 0.25, 0.3 + Math.random() * 0.3, Math.random() < 0.5 ? '#ff9a2e' : '#ffd36b', { drag: 1.5, curve: 'grow' });
        }
        continue;
      }
      const kindKey = p.team === 'hostile' && (kind === 'bullet' || kind === 'plasma') ? 'acid' : kind;
      const b = this.batch(kindKey);
      const speed = Math.hypot(p.vx, p.vy, p.vz);
      if (kind === 'drone') {
        const yaw = Math.atan2(p.vx, p.vz);
        composeEuler(_m, p.x, y + Math.sin(env.t * 4 + p.id) * 0.1, p.z, 0, yaw, Math.sin(env.t * 6) * 0.1);
        b.push(_m);
        continue;
      }
      if (kind === 'plasma') {
        const s = 1 + Math.sin(env.t * 14 + p.id) * 0.15;
        composeAlong(_m, p.x, y, p.z, p.vx, p.vy, p.vz, s, s, s);
        b.push(_m);
        if (Math.random() < dt * 20) ctx.particles.emit('glow', p.x, y, p.z, (Math.random() - 0.5), 0.3, (Math.random() - 0.5), 0.35, 0.14, '#58d0ff');
        continue;
      }
      // stretch tracers with speed
      const stretch = kind === 'bullet' ? Math.min(1.8, 0.8 + speed / 40) : 1;
      composeAlong(_m, p.x, y, p.z, p.vx, p.vy, p.vz, 1, 1, stretch);
      if (kind === 'cannon') {
        composeEuler(_m2, 0, 0, 0, env.t * 7, 0, 0);
        _m.multiply(_m2);
      }
      b.push(_m);
      if (kind === 'missile' && Math.random() < dt * 30) ctx.particles.smoke(p.x - p.vx * 0.03, y - p.vy * 0.03, p.z - p.vz * 0.03, 0.22, '#c9c9cf', 0.9);
      if (kind === 'rail' && Math.random() < dt * 20) ctx.particles.sparks(p.x, y, p.z, 1, '#bfe6ff', 2);
    }
    for (const b of this.batches.values()) b.end();
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    for (const g of this.geoCache.values()) g.dispose();
    this.ctx.scene.remove(this.group);
  }
}
