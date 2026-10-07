/**
 * Model specs — the contract between procedural model builders and the actors that draw them.
 * A ModelSpec is a static body geometry plus animated sub-parts (turret heads, rotors, pump arms),
 * particle emitters and an optional light anchor. Builders register per ModelKey; unknown keys use
 * the generic tier-styled fallback.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';
import type { TierStyle } from '../core/palette';
import type { BuildingDef } from '../../data/schema';
import { CELL } from '../../core/constants';

export type PartAnim =
  | 'spinY' // continuous rotation about local Y
  | 'spinX'
  | 'spinZ'
  | 'turret' // yaw toward target (set by the actor)
  | 'bob' // float up & down
  | 'bobSpin' // float + slow spin
  | 'pump' // up & down linear (drill bits, pistons)
  | 'rock' // rocking rotation about X (pump arms, cranes)
  | 'sway' // gentle wind sway (plants, flags)
  | 'scroll' // translate along local X and wrap (conveyor items, mine carts)
  | 'slide' // ping-pong along local X (gantries)
  | 'wheel'; // spin about Z with slow pace (spin wheel)

export interface PartSpec {
  geometry: THREE.BufferGeometry;
  x: number;
  y: number;
  z: number;
  anim: PartAnim;
  speed: number;
  amp: number;
}

export type EmitterKind = 'smoke' | 'fire' | 'sparks' | 'steam' | 'motes' | 'drips' | 'dust';

export interface EmitterSpec {
  kind: EmitterKind;
  x: number;
  y: number;
  z: number;
  /** Particles per second at full efficiency. */
  rate: number;
  color?: string;
}

export interface LightSpec {
  x: number;
  y: number;
  z: number;
  color: string;
  intensity: number;
  range: number;
}

export interface ModelSpec {
  geometry: THREE.BufferGeometry;
  parts: PartSpec[];
  emitters: EmitterSpec[];
  light: LightSpec | null;
  /** Approximate top of the model (selection rings, markers, picking). */
  height: number;
  /** Footprint in world units (rot 0). */
  w: number;
  d: number;
  /** Muzzle offset in the turret part's local frame (barrel points +Z). */
  muzzle: { x: number; y: number; z: number } | null;
}

/** Builder context: geometry builder + tier style + footprint, with helpers to add parts/emitters. */
export class ModelCtx {
  readonly parts: PartSpec[] = [];
  readonly emitters: EmitterSpec[] = [];
  light: LightSpec | null = null;
  muzzleAt: { x: number; y: number; z: number } | null = null;
  /** Half extents of the footprint. */
  readonly hw: number;
  readonly hd: number;

  constructor(
    readonly b: GeoBuilder,
    readonly s: TierStyle,
    readonly level: number,
    readonly w: number,
    readonly d: number,
    readonly def: BuildingDef | undefined,
    readonly seed: number,
  ) {
    this.hw = w / 2;
    this.hd = d / 2;
  }

  get t(): number {
    return this.s.index;
  }

  /** Level factor 0 (level 1) .. ~1 (max level) used to grow details. */
  get lv(): number {
    const max = Math.max(1, this.def?.maxLevel ?? 1);
    return max <= 1 ? 0 : (this.level - 1) / (max - 1);
  }

  part(anim: PartAnim, x: number, y: number, z: number, build: (b: GeoBuilder) => void, speed = 1, amp = 1): void {
    const pb = new GeoBuilder(this.seed + this.parts.length * 17 + 3);
    build(pb);
    if (pb.isEmpty) return;
    this.parts.push({ geometry: pb.build(), x, y, z, anim, speed, amp });
  }

  emit(kind: EmitterKind, x: number, y: number, z: number, rate: number, color?: string): void {
    this.emitters.push({ kind, x, y, z, rate, color });
  }

  setLight(x: number, y: number, z: number, color: string, intensity = 1.2, range = 10): void {
    this.light = { x, y, z, color, intensity, range };
  }

  muzzle(x: number, y: number, z: number): void {
    this.muzzleAt = { x, y, z };
  }

  // -------------------------------------------------------------------- shared shapes

  /** Foundation slab slightly inset from the footprint. */
  foundation(inset = 0.12, h = 0.22, color?: THREE.Color): void {
    this.b.box(this.w - inset * 2, h + 0.3, this.d - inset * 2, 0, (h - 0.3) / 2, 0, color ?? this.s.floorAlt, { shade: 0.03 });
  }

  /** Simple hut: box walls in tier style, corner posts, roof variants. */
  hut(w: number, d: number, h: number, x = 0, z = 0, opts: { roof?: 'gable' | 'flat' | 'shed' | 'dome' | 'none'; windows?: boolean; door?: boolean; wallColor?: THREE.Color } = {}): void {
    const { b, s } = this;
    const wall = opts.wallColor ?? s.base;
    b.box(w, h, d, x, h / 2, z, wall, { shade: s.index <= 2 ? 0.04 : 0.015 });
    const pw = s.index <= 1 ? 0.22 : 0.26;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(pw, h + 0.05, pw, x + sx * (w / 2 - pw / 2), h / 2, z + sz * (d / 2 - pw / 2), s.trim);
    if (s.index >= 3) b.box(w + 0.04, 0.1, d + 0.04, x, h - 0.3, z, s.accent, { slot: SLOT_GLOW });
    if (opts.windows !== false) {
      b.box(Math.min(1.1, w * 0.35), 0.6, 0.08, x, h * 0.6, z + d / 2 + 0.02, '#ffffff', { slot: 2 });
      b.box(0.08, 0.6, Math.min(1.1, d * 0.35), x + w / 2 + 0.02, h * 0.6, z, '#ffffff', { slot: 2 });
    }
    if (opts.door !== false) {
      b.box(0.8, Math.min(1.6, h * 0.75), 0.1, x, Math.min(1.6, h * 0.75) / 2, z + d / 2 + 0.03, s.dark);
    }
    const roof = opts.roof ?? 'gable';
    if (roof === 'gable') {
      b.wedge(w + 0.5, Math.max(0.8, w * 0.28), d + 0.5, x, h - 0.02, z, s.roof, { shade: 0.04 });
    } else if (roof === 'flat') {
      b.box(w + 0.3, 0.22, d + 0.3, x, h + 0.1, z, s.roof, { shade: 0.02 });
      b.box(w + 0.34, 0.08, d + 0.34, x, h + 0.24, z, s.roofEdge);
    } else if (roof === 'shed') {
      b.box(w + 0.5, 0.18, d + 0.5, x, h + 0.2, z, s.roof, { rz: -0.22, shade: 0.04 });
    } else if (roof === 'dome') {
      b.sphere(Math.min(w, d) * 0.55, x, h, z, s.roof, 8, { sy: 0.6 });
    }
  }

  /** Cylindrical tank with bands. */
  tank(r: number, h: number, x: number, y: number, z: number, color: THREE.Color, bandColor?: THREE.Color, seg = 10): void {
    const { b } = this;
    b.cyl(r, r, h, x, y + h / 2, z, color, seg, { shade: 0.02 });
    b.cyl(r * 0.92, r * 0.92, 0.1, x, y + h + 0.02, z, color.clone().multiplyScalar(0.85), seg);
    const band = bandColor ?? this.s.metal;
    b.cyl(r + 0.04, r + 0.04, 0.12, x, y + h * 0.25, z, band, seg);
    b.cyl(r + 0.04, r + 0.04, 0.12, x, y + h * 0.75, z, band, seg);
  }

  /** Boxy machine body with a darker base and glowing status lights. */
  machine(w: number, h: number, d: number, x: number, y: number, z: number, lights = 2): void {
    const { b, s } = this;
    b.box(w, h * 0.3, d, x, y + h * 0.15, z, s.machineDark, { shade: 0.02 });
    b.box(w * 0.96, h * 0.7, d * 0.96, x, y + h * 0.3 + h * 0.35, z, s.machine, { shade: 0.02 });
    for (let i = 0; i < lights; i++) b.sphere(0.07, x - w / 2 + 0.25 + i * 0.3, y + h * 0.8, z + d / 2 + 0.02, i === 0 ? '#7cff6a' : s.accent, 5, { slot: SLOT_GLOW });
  }

  /** Chimney pipe with a smoke emitter. */
  chimney(x: number, y: number, z: number, h = 1.4, r = 0.18, rate = 3): void {
    this.b.cyl(r, r * 1.1, h, x, y + h / 2, z, this.s.metal, 7);
    this.b.cyl(r * 1.25, r * 1.25, 0.14, x, y + h, z, this.s.trim, 7);
    this.emit('smoke', x, y + h + 0.1, z, rate);
  }

  /** Thin antenna with a blinking light. */
  antenna(x: number, y: number, z: number, h = 1.6, color?: string): void {
    this.b.cyl(0.04, 0.05, h, x, y + h / 2, z, this.s.metal, 5);
    this.b.sphere(0.09, x, y + h + 0.05, z, color ?? '#ff4d5e', 5, { slot: SLOT_GLOW });
  }

  /** Decorative glow studs along the front edge showing the facility level. */
  levelPips(): void {
    const n = Math.min(9, this.level - 1);
    if (n <= 0) return;
    const span = Math.min(this.w - 0.6, n * 0.32);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      this.b.sphere(0.075, x, 0.34, this.hd - 0.02, this.s.accent, 5, { slot: SLOT_GLOW });
    }
  }

  /** Generic small plant (farm, garden). */
  plant(x: number, z: number, h: number, leaf: THREE.ColorRepresentation, fruit?: THREE.ColorRepresentation): void {
    const { b } = this;
    b.cyl(0.04, 0.06, h, x, h / 2, z, '#5d8f3c', 4);
    b.sphere(h * 0.42, x, h, z, leaf, 6, { sy: 0.8 });
    if (fruit) b.sphere(h * 0.14, x + 0.1, h + 0.1, z + 0.12, fruit, 5, { slot: SLOT_GLOW });
  }
}

export type ModelBuilder = (c: ModelCtx) => void;

const REGISTRY = new Map<string, ModelBuilder>();

export function registerModel(key: string, fn: ModelBuilder): void {
  REGISTRY.set(key, fn);
}

export function getBuilder(key: string): ModelBuilder | undefined {
  return REGISTRY.get(key);
}

export function hasModel(key: string): boolean {
  return REGISTRY.has(key);
}

/** Generic tier-styled block for unknown model keys. */
export function fallbackModel(c: ModelCtx): void {
  const { b, s, w, d } = c;
  const h = 1.6 + Math.min(w, d) * 0.3;
  c.foundation();
  b.box(w - 0.5, h, d - 0.5, 0, h / 2, 0, s.base, { shade: 0.03 });
  b.box(w - 0.3, 0.2, d - 0.3, 0, h, 0, s.trim);
  b.box(w - 0.9, 0.08, d - 0.9, 0, h + 0.12, 0, s.accent, { slot: SLOT_GLOW });
  b.sphere(0.16, 0, h + 0.4, 0, s.accent, 6, { slot: SLOT_GLOW });
  c.levelPips();
}

const specCache = new Map<string, ModelSpec>();

/** Build (cached) the model for a key at a tier/level. Footprint from the def (default 1x1). */
export function buildModel(key: string, s: TierStyle, level: number, def: BuildingDef | undefined): ModelSpec {
  const sz = def?.size ?? [1, 1];
  const ck = `${key}|${s.index}|${level}|${sz[0]}x${sz[1]}`;
  let spec = specCache.get(ck);
  if (spec) return spec;
  const w = sz[0] * CELL;
  const d = sz[1] * CELL;
  const seed = key.length * 131 + s.index * 7 + level;
  const b = new GeoBuilder(seed);
  const c = new ModelCtx(b, s, level, w, d, def, seed);
  const fn = REGISTRY.get(key) ?? fallbackModel;
  try {
    fn(c);
  } catch (e) {
    console.warn(`[render] model builder '${key}' failed, using fallback`, e);
    fallbackModel(c);
  }
  if (b.isEmpty) fallbackModel(c);
  const geometry = b.build();
  let height = geometry.boundingBox ? geometry.boundingBox.max.y : 2;
  for (const p of c.parts) {
    p.geometry.computeBoundingBox();
    height = Math.max(height, p.y + (p.geometry.boundingBox?.max.y ?? 0));
  }
  spec = { geometry, parts: c.parts, emitters: c.emitters, light: c.light, height: Math.max(0.5, height), w, d, muzzle: c.muzzleAt };
  specCache.set(ck, spec);
  return spec;
}

/** Keys for which a builder exists (dev showcase enumerates them). */
export function registeredModelKeys(): string[] {
  return [...REGISTRY.keys()];
}
