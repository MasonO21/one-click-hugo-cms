/**
 * Alien models (AlienDef.model). Each model has a `body` geometry built in white/grey so the
 * instance color (AlienDef.color) tints it, and a `detail` geometry with fixed colors (eyes, teeth,
 * glowing spots). Cute-creepy, not horror. Ground at y = 0, facing +Z, unit scale ~ a crawler.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';

const W = '#ffffff';
const SHADE = '#cfcfcf';
const EYE_W = '#ffffff';
const PUPIL = '#141418';
const TOOTH = '#fff6e6';

export interface AlienGeo {
  body: THREE.BufferGeometry;
  detail: THREE.BufferGeometry;
  /** Approximate height at scale 1 (hit flash position, picking). */
  height: number;
}

function eye(d: GeoBuilder, x: number, y: number, z: number, r = 0.14): void {
  d.sphere(r, x, y, z, EYE_W, 6);
  d.sphere(r * 0.5, x, y, z + r * 0.72, PUPIL, 4);
}

const MODELS: Record<string, { build: (b: GeoBuilder, d: GeoBuilder) => void; height: number }> = {
  crawler: {
    height: 0.9,
    build: (b, d) => {
      b.sphere(0.55, 0, 0.5, 0, W, 8, { sy: 0.7, sz: 1.15, shade: 0.04 });
      b.sphere(0.32, 0, 0.6, 0.55, W, 7, { shade: 0.04 });
      for (let i = 0; i < 3; i++) {
        for (const sx of [-1, 1]) {
          b.box(0.1, 0.5, 0.1, sx * 0.55, 0.3, -0.35 + i * 0.35, SHADE, { rz: sx * 0.9, rx: (i - 1) * 0.3 });
          b.box(0.1, 0.4, 0.1, sx * 0.82, 0.15, -0.35 + i * 0.35, SHADE, { rz: -sx * 0.6 });
        }
      }
      b.sphere(0.12, 0, 0.75, -0.7, SHADE, 5);
      eye(d, -0.15, 0.72, 0.78, 0.12);
      eye(d, 0.15, 0.72, 0.78, 0.12);
      d.cone(0.05, 0.16, -0.12, 0.45, 0.78, TOOTH, 4, { rx: Math.PI });
      d.cone(0.05, 0.16, 0.12, 0.45, 0.78, TOOTH, 4, { rx: Math.PI });
    },
  },
  spitter: {
    height: 1.5,
    build: (b, d) => {
      b.sphere(0.5, 0, 0.8, 0, W, 8, { sy: 0.8, shade: 0.04 });
      b.sphere(0.6, 0, 0.9, -0.55, W, 8, { sy: 0.9, shade: 0.04 }); // sac
      b.sphere(0.3, 0, 1.1, 0.5, W, 7, { shade: 0.04 });
      b.cyl(0.08, 0.14, 0.4, 0, 1.0, 0.8, W, 6, { rx: Math.PI / 2 }); // spout
      for (let i = 0; i < 2; i++) {
        for (const sx of [-1, 1]) {
          b.box(0.1, 0.8, 0.1, sx * 0.5, 0.45, -0.3 + i * 0.5, SHADE, { rz: sx * 0.7 });
          b.box(0.1, 0.5, 0.1, sx * 0.85, 0.2, -0.3 + i * 0.5, SHADE, { rz: -sx * 0.5 });
        }
      }
      eye(d, -0.14, 1.25, 0.72, 0.1);
      eye(d, 0.14, 1.25, 0.72, 0.1);
      eye(d, 0, 1.4, 0.68, 0.08);
      d.sphere(0.22, 0, 1.0, -0.6, '#d9a6ff', 6, { slot: SLOT_GLOW });
      d.sphere(0.1, 0.3, 1.2, -0.7, '#d9a6ff', 4, { slot: SLOT_GLOW });
      d.cyl(0.07, 0.07, 0.1, 0, 1.0, 1.0, '#9be36b', 6, { rx: Math.PI / 2, slot: SLOT_GLOW });
    },
  },
  brute: {
    height: 2.1,
    build: (b, d) => {
      b.sphere(0.75, 0, 1.2, 0, W, 8, { sy: 0.9, sz: 0.9, shade: 0.04 });
      b.sphere(0.4, 0, 1.55, 0.55, W, 7, { shade: 0.04 });
      for (const sx of [-1, 1]) {
        b.box(0.32, 0.9, 0.32, sx * 0.85, 0.85, 0.15, SHADE, { rz: sx * 0.25 });
        b.sphere(0.26, sx * 0.98, 0.35, 0.22, SHADE, 6);
        b.box(0.3, 0.6, 0.3, sx * 0.4, 0.35, -0.2, SHADE);
        b.box(0.36, 0.14, 0.44, sx * 0.4, 0.07, -0.15, SHADE);
      }
      for (let i = 0; i < 3; i++) b.cone(0.12, 0.45, 0, 1.9 - i * 0.1, -0.2 - i * 0.3, SHADE, 4, { rx: -0.5 });
      eye(d, -0.16, 1.62, 0.9, 0.1);
      eye(d, 0.16, 1.62, 0.9, 0.1);
      d.box(0.5, 0.06, 0.05, 0, 1.78, 0.92, PUPIL, { rz: 0.0 });
      d.cone(0.07, 0.25, -0.22, 1.3, 0.85, TOOTH, 4);
      d.cone(0.07, 0.25, 0.22, 1.3, 0.85, TOOTH, 4);
    },
  },
  burrower: {
    height: 1.3,
    build: (b, d) => {
      b.sphere(0.5, 0, 0.6, 0.2, W, 8, { shade: 0.04 });
      b.sphere(0.42, 0, 0.5, -0.5, W, 7, { shade: 0.04 });
      b.sphere(0.32, 0, 0.4, -1.0, SHADE, 6, { shade: 0.04 });
      b.cone(0.3, 0.6, 0, 0.65, 0.8, SHADE, 6, { rx: Math.PI / 2 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        b.cone(0.05, 0.22, Math.cos(a) * 0.4, 0.65 + Math.sin(a) * 0.4, 0.55, TOOTH, 4, { rx: Math.PI / 2 });
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        eye(d, Math.cos(a) * 0.25, 0.75 + Math.sin(a) * 0.2, 0.62, 0.08);
      }
      d.sphere(0.08, 0, 0.9, -0.5, '#ffd84a', 4, { slot: SLOT_GLOW });
      d.sphere(0.07, 0.2, 0.75, -1.0, '#ffd84a', 4, { slot: SLOT_GLOW });
    },
  },
  flyer: {
    height: 1.6,
    build: (b, d) => {
      b.sphere(0.35, 0, 1.2, 0, W, 7, { sz: 1.3, shade: 0.04 });
      b.sphere(0.24, 0, 1.3, 0.45, W, 6, { shade: 0.04 });
      b.cone(0.08, 0.6, 0, 1.15, -0.65, SHADE, 4, { rx: -Math.PI / 2 });
      for (const sx of [-1, 1]) {
        b.box(1.3, 0.05, 0.6, sx * 0.85, 1.45, -0.05, W, { rz: sx * 0.35, shade: 0.03 });
        b.box(0.7, 0.05, 0.4, sx * 1.5, 1.7, 0.1, SHADE, { rz: sx * 0.5 });
        b.box(0.1, 0.5, 0.1, sx * 0.2, 0.9, 0.1, SHADE, { rz: sx * 0.3 });
      }
      eye(d, -0.11, 1.38, 0.6, 0.09);
      eye(d, 0.11, 1.38, 0.6, 0.09);
      d.sphere(0.07, -1.55, 1.75, 0.1, '#5ef2ff', 4, { slot: SLOT_GLOW });
      d.sphere(0.07, 1.55, 1.75, 0.1, '#5ef2ff', 4, { slot: SLOT_GLOW });
    },
  },
  queen: {
    height: 3.0,
    build: (b, d) => {
      b.sphere(1.0, 0, 1.3, -0.3, W, 9, { sy: 0.85, sz: 1.2, shade: 0.04 });
      b.sphere(1.1, 0, 1.2, -1.5, W, 9, { sy: 0.8, shade: 0.04 }); // abdomen
      b.sphere(0.5, 0, 1.9, 0.8, W, 7, { shade: 0.04 });
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.3;
        b.cone(0.12, 0.6, Math.sin(a) * 0.5, 2.4 + Math.cos(a) * 0.1, 0.7, SHADE, 4, { rz: -a });
      }
      for (let i = 0; i < 3; i++) {
        for (const sx of [-1, 1]) {
          b.box(0.14, 1.3, 0.14, sx * 1.0, 1.0, -0.6 + i * 0.5, SHADE, { rz: sx * 0.8 });
          b.box(0.12, 0.9, 0.12, sx * 1.55, 0.45, -0.6 + i * 0.5, SHADE, { rz: -sx * 0.5 });
        }
      }
      eye(d, -0.22, 2.05, 1.2, 0.12);
      eye(d, 0.22, 2.05, 1.2, 0.12);
      eye(d, -0.4, 1.9, 1.05, 0.07);
      eye(d, 0.4, 1.9, 1.05, 0.07);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26;
        d.sphere(0.16, Math.cos(a) * 0.8, 1.2 + Math.sin(a) * 0.6, -1.5, '#c56cf0', 5, { slot: SLOT_GLOW });
      }
      d.cone(0.08, 0.3, -0.25, 1.6, 1.2, TOOTH, 4);
      d.cone(0.08, 0.3, 0.25, 1.6, 1.2, TOOTH, 4);
    },
  },
  titan: {
    height: 4.6,
    build: (b, d) => {
      b.sphere(1.5, 0, 2.6, 0, W, 9, { sy: 0.95, shade: 0.04 });
      b.sphere(0.7, 0, 3.4, 1.1, W, 7, { shade: 0.04 });
      for (const sx of [-1, 1]) {
        b.box(0.6, 2.2, 0.6, sx * 1.6, 1.6, 0.2, SHADE, { rz: sx * 0.15 });
        b.sphere(0.5, sx * 1.8, 0.5, 0.4, SHADE, 6);
        b.box(0.6, 1.4, 0.6, sx * 0.7, 0.7, -0.4, SHADE);
        b.box(0.7, 0.3, 0.9, sx * 0.7, 0.15, -0.3, SHADE);
        b.cone(0.2, 1.0, sx * 0.6, 4.2, 0.9, SHADE, 5, { rz: -sx * 0.6 });
      }
      for (let i = 0; i < 4; i++) b.cone(0.22, 0.8, (i - 1.5) * 0.5, 3.9, -0.6, SHADE, 4, { rx: -0.6 });
      eye(d, -0.26, 3.5, 1.7, 0.13);
      eye(d, 0.26, 3.5, 1.7, 0.13);
      d.box(0.8, 0.08, 0.06, 0, 3.75, 1.72, PUPIL);
      for (let i = 0; i < 3; i++) d.box(0.12, 0.6, 0.1, (i - 1) * 0.5, 2.3, 1.42, '#ff6a3d', { slot: SLOT_GLOW });
      d.cone(0.1, 0.4, -0.35, 3.05, 1.6, TOOTH, 4);
      d.cone(0.1, 0.4, 0.35, 3.05, 1.6, TOOTH, 4);
    },
  },
};

const cache = new Map<string, AlienGeo>();

export function alienGeometry(model: string): AlienGeo {
  let g = cache.get(model);
  if (g) return g;
  const spec = MODELS[model];
  const b = new GeoBuilder(model.length * 41 + 7);
  const d = new GeoBuilder(model.length * 43 + 9);
  if (spec) spec.build(b, d);
  else {
    b.sphere(0.6, 0, 0.6, 0, W, 8, { sy: 0.9, shade: 0.04 });
    for (const sx of [-1, 1]) b.box(0.12, 0.5, 0.12, sx * 0.5, 0.25, 0, SHADE, { rz: sx * 0.5 });
    eye(d, -0.18, 0.75, 0.5, 0.12);
    eye(d, 0.18, 0.75, 0.5, 0.12);
  }
  g = { body: b.build(), detail: d.build(), height: spec?.height ?? 1.2 };
  cache.set(model, g);
  return g;
}

export const KNOWN_ALIEN_MODELS = Object.keys(MODELS);
