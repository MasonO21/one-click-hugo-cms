/**
 * Terrain — chunked height-field mesh from WorldGen (vertex colors from a painted per-biome palette,
 * blended at region borders, sandy shores, warm dirt paths around buildings, locked regions
 * desaturated), stylized animated water and the shimmering energy-storm wall along the border of
 * locked regions. Falls back to a flat coloured ground when the world system has not generated anything.
 *
 * The cozy look (the painted world map): smooth normals from the whole height field (soft rolling
 * hills, no seams between chunks), broad warm / cool painted patches, and a sprinkle of flower
 * specks drawn by the fragment shader from a world-space hash grid — no geometry, no texture: the
 * per-vertex `aBloom` weight says how flowery the meadow is (biome, paths, shores and locked land
 * have none) and the specks fade out with distance so they never shimmer. Water gets turquoise
 * shallows, a breathing foam line along the shore (per-vertex distance to land) and sun glints.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { WATER_LEVEL, type WorldGen } from '../../sim/world';
import { CELL, HALF_WORLD, WORLD_CELLS, cellIndex, footprintCenter, rotatedSize } from '../../core/constants';
import { fbm } from '../../core/rng';
import { clamp } from '../../core/math';
import { dimColor } from '../core/palette';
import { patchLambert } from '../core/materials';

const VERTS = WORLD_CELLS + 1;
const SHORE = new THREE.Color('#e6d49a');
/** Shores that are not sand: the marsh's mossy mud, the ridge's packed snow. */
const SHORE_BY_BIOME: Record<string, THREE.Color> = {
  toxic_marsh: new THREE.Color('#7c8a44'),
  frozen_ridge: new THREE.Color('#dde7f2'),
};
const FALLBACK_GROUND: [string, string] = ['#6fbf5a', '#9bd66b'];

/**
 * Painted ground per biome (the data colours were picked as UI chips): valley `low` -> hill `high`
 * by height, then broad sunny `warm` and shady `cool` patches, and how flowery the meadow is
 * (`bloom`, the density of the shader's flower specks). Unknown biomes use their data colours.
 */
interface GroundPaint {
  low: string;
  high: string;
  warm: string;
  cool: string;
  bloom: number;
}
export const GROUND_PAINT: Record<string, GroundPaint> = {
  crash_valley: { low: '#4fa646', high: '#8cc84c', warm: '#b8d254', cool: '#38925a', bloom: 1 },
  pinewood_forest: { low: '#356f38', high: '#5e9040', warm: '#98a446', cool: '#285e44', bloom: 0.4 },
  crystal_canyon: { low: '#aa8cbe', high: '#8eaa62', warm: '#94b45c', cool: '#9884d4', bloom: 0.35 },
  red_desert: { low: '#d27844', high: '#eeaa6c', warm: '#f6c086', cool: '#be6446', bloom: 0.05 },
  toxic_marsh: { low: '#557e38', high: '#86a848', warm: '#a8be56', cool: '#40704a', bloom: 0.3 },
  frozen_ridge: { low: '#cddcee', high: '#f4f8fd', warm: '#fffaf0', cool: '#b8cce6', bloom: 0 },
  alien_ruins: { low: '#5e8c5e', high: '#94b672', warm: '#acc27e', cool: '#76809e', bloom: 0.55 },
  titanium_highlands: { low: '#7e9a70', high: '#b6c4ac', warm: '#a8be78', cool: '#8ea2b4', bloom: 0.35 },
};
/**
 * Worn ground around buildings: the biome colour is pulled this far toward its trodden version
 * (sun-dried golden grass, a shade darker) right at a footprint, fading out over WEAR_REACH world
 * units (per footprint side, so a shed wears a smaller ring than a warehouse) with a ragged noisy
 * edge. Kept narrow and light on purpose: the painted map is lush, and a dense Titanium colony must
 * not turn into one big dirt floor. The fade goes through a contrast curve (WEAR_EDGE) so the ring
 * has a crisp ragged edge instead of a muddy halfway tone.
 */
const WEAR_MAX = 0.42;
const WEAR_REACH = 1.3;
const WEAR_REACH_PER_CELL = 0.3;
/** The wear weight maps to the path blend through smoothstep(WEAR_EDGE[0], WEAR_EDGE[1], w). */
const WEAR_EDGE: readonly [number, number] = [0.12, 0.6];
/** Structure pieces (walls, fences, floors) wear a narrower ring than facilities. */
const WEAR_REACH_PIECE = 1.0;
/**
 * Without a shadow map (medium / low) the worn ring doubles as the contact shadow: this much extra
 * darkening right at the footprint grounds buildings that would otherwise float on the grass.
 */
const CONTACT_SHADE = 0.2;
/** Ground grade on top of the palette: a touch warmer (the sun does the rest). */
const GROUND_DESAT = 0.0;
const GROUND_TINT = new THREE.Color(1.03, 1.01, 0.94);
const GROUND_VALUE = 1.0;
/** Water colour depth (world units) of a water cell's corners at least, and of dry ring corners at most (negative). */
const WET_DEPTH = 0.16;
const DRY_DEPTH = 0.1;
/** Regions whose pools are the painting's glowing lime-green toxic water. */
export const TOXIC_WATER: ReadonlySet<string> = new Set(['toxic_marsh']);
/** Flower specks fade out between these view distances (world units) so they never shimmer far away. */
export const BLOOM_NEAR = 26;
export const BLOOM_FAR = 46;

const WATER_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  attribute float aShore;
  attribute float aToxic;
  varying vec3 vWorld;
  varying float vWave;
  varying float vShore;
  varying float vToxic;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.55 + uTime * 1.3) * 0.5 + sin(p.z * 0.7 - uTime * 1.1) * 0.5;
    p.y += w * 0.05;
    vWave = w;
    vShore = aShore;
    vToxic = aToxic;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
/**
 * Painted water: turquoise shallows -> blue depths by the depth below the surface (vShore, world
 * units, from the height field), a thin foam line that breathes along the shore contour (thin enough
 * that a shallow marsh pool is water, not one sheet of foam), soft drifting wavelets and a few
 * twinkling sun glints (a hash grid, day only). Night darkens it to a moonlit blue. Toxic Marsh
 * pools (vToxic, per vertex) glow lime green like the painting and keep some of that glow at night.
 */
const WATER_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform float uTime; uniform float uNight;
  varying vec3 vWorld;
  varying float vWave;
  varying float vShore;
  varying float vToxic;
  // sin-free hash on small, wrapped inputs: sin() of world-sized arguments loses precision on mobile GPUs and turns
  // the rare glints into a polka-dot sheet
  float novaHash(vec2 p) {
    vec3 p3 = fract(vec3(mod(p.xyx, 997.0)) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    float depth = vShore;
    vec3 c = mix(uShallow, uDeep, smoothstep(0.08, 1.1, depth));
    c = mix(c, mix(vec3(0.62, 0.95, 0.18), vec3(0.26, 0.62, 0.12), smoothstep(0.05, 0.9, depth)), vToxic);
    c = mix(c, c * 1.08, 0.5 + 0.5 * vWave);
    // soft wavelets: thin, wavy streaks drifting across the surface, brighter in slow patches (the product of two
    // crossing sines used before peaked on a regular lattice and read as a sheet of polka dots)
    float bend = sin(vWorld.z * 0.35 + vWorld.x * 0.12 + uTime * 0.4) * 2.2;
    float streak = smoothstep(0.9, 0.995, sin(vWorld.x * 0.8 + vWorld.z * 0.55 + uTime * 1.1 + bend));
    float patchy = smoothstep(0.1, 0.9, sin(vWorld.x * 0.21 - vWorld.z * 0.29 + uTime * 0.35) * 0.5 + 0.5);
    float ripple = streak * patchy;
    c = mix(c, uFoam, ripple * 0.3);
    float edge = depth + 0.035 * sin(uTime * 1.4 + vWorld.x * 0.9 + vWorld.z * 0.7);
    float foam = 1.0 - smoothstep(0.012, 0.06, edge);
    c = mix(c, mix(uFoam, vec3(0.86, 1.0, 0.6), vToxic), foam * 0.75);
    vec2 gp = vWorld.xz * 2.2;
    vec2 g = floor(gp);
    float tw = novaHash(g + mod(floor(uTime * 1.5), 331.0) * vec2(17.0, 29.0));
    // a round sparkle in the middle of its grid cell, not a square flake
    float glint = step(0.992, tw) * (1.0 - smoothstep(0.06, 0.18, length(fract(gp) - 0.5))) * (1.0 - uNight) * (1.0 - foam);
    c += vec3(glint * 0.9);
    c *= 1.0 - uNight * 0.5 * (1.0 - vToxic * 0.5);
    c += vec3(0.02, 0.04, 0.08) * uNight * (1.0 - vToxic) + vec3(0.04, 0.1, 0.0) * uNight * vToxic;
    // past the shoreline (negative depth) the water fades out: flat ground no longer shows the ring cells' edges
    gl_FragColor = vec4(c, (0.86 + foam * 0.12) * smoothstep(-0.04, 0.0, edge));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const WALL_VERT = /* glsl */ `
  attribute float aH;
  varying float vH;
  varying vec3 vWorld;
  void main() {
    vH = aH;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const WALL_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uColorA; uniform vec3 uColorB;
  varying float vH;
  varying vec3 vWorld;
  void main() {
    float s = sin(vWorld.x * 0.9 + vWorld.z * 0.7 + uTime * 2.5) * 0.5 + 0.5;
    float stripes = smoothstep(0.3, 0.9, sin(vH * 14.0 - uTime * 3.0 + vWorld.x * 0.3) * 0.5 + 0.5);
    float fade = pow(1.0 - vH, 1.6);
    vec3 c = mix(uColorA, uColorB, s);
    float a = fade * (0.28 + 0.3 * stripes) ;
    gl_FragColor = vec4(c * (1.0 + stripes * 0.6), a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _worn = new THREE.Color();
const _wornGrey = new THREE.Color();
/** Trodden-ground tone (the painted map's sunny dry grass and warm earth); only its hue is used, scaled to the ground's value. */
const PATH_TONE = new THREE.Color('#b8964a');
const PATH_LUM = PATH_TONE.r * 0.3 + PATH_TONE.g * 0.59 + PATH_TONE.b * 0.11;
/** Pull a ground colour toward its trodden version in place: warm dry grass / earth a shade darker (any biome). */
export function wornColor(c: THREE.Color, amount: number): THREE.Color {
  const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
  // the trodden hue at 88 % of the ground's value, with a little of the ground's own grey so snow and sand stay in family
  _worn.copy(PATH_TONE).multiplyScalar((l * 0.88) / PATH_LUM).lerp(_wornGrey.setRGB(l * 0.95, l * 0.85, l * 0.7), 0.25);
  c.lerp(_worn, clamp(amount, 0, 1));
  return c;
}

/** Contrast curve of the wear weight (0..1 -> 0..1): ragged, decisive path edges. */
export function wearBlend(w: number): number {
  const t = clamp((w - WEAR_EDGE[0]) / (WEAR_EDGE[1] - WEAR_EDGE[0]), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Signature of everything the worn-ground field depends on — each building's def, min cell and
 * rotation — and nothing else: a break / repair / level / status change bumps buildingsVersion but
 * must not recolour the whole height field (it did, once per broken or repaired building in a raid).
 */
export function wearSignature(list: readonly { def: string; x: number; z: number; rot: number }[]): number {
  let h = (list.length * 7919) | 0;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    let d = 0;
    for (let k = 0; k < b.def.length; k++) d = (d * 31 + b.def.charCodeAt(k)) | 0;
    h = (h * 31 + b.x * 131 + b.z * 137 + b.rot * 7 + d) | 0;
  }
  return h;
}

/**
 * Flower specks on the meadow: one candidate per world-space grid cell (~0.6 units) at a hashed spot,
 * kept when its hash clears the vertex's bloom weight, coloured from a small cozy palette (daisy
 * white, buttercup yellow, blossom pink, lilac) with a sunny centre. A dozen ALU ops, no texture;
 * faded out by view distance (BLOOM_NEAR..BLOOM_FAR) so far meadows never sparkle.
 */
export function patchBloom(shader: { uniforms: Record<string, THREE.IUniform>; vertexShader: string; fragmentShader: string }, uBloom: THREE.IUniform<number>): void {
  shader.uniforms.uBloom = uBloom;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aBloom;\nvarying float vBloom;\nvarying vec2 vNovaXZ;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBloom = aBloom;\nvNovaXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uBloom;\nvarying float vBloom;\nvarying vec2 vNovaXZ;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{
  float novaFade = uBloom * vBloom * (1.0 - smoothstep(${BLOOM_NEAR.toFixed(1)}, ${BLOOM_FAR.toFixed(1)}, length(vViewPosition)));
  if (novaFade > 0.01) {
    vec2 novaP = vNovaXZ * 1.7;
    vec2 novaCell = floor(novaP);
    vec2 novaF = fract(novaP);
    float novaH1 = fract(sin(dot(novaCell, vec2(127.1, 311.7))) * 43758.5453);
    float novaH2 = fract(sin(dot(novaCell, vec2(269.5, 183.3))) * 43758.5453);
    float novaKeep = step(1.0 - vBloom * 0.5, fract(novaH1 * 7.13 + novaH2 * 3.71));
    float novaD = length(novaF - vec2(0.2 + 0.6 * novaH1, 0.2 + 0.6 * novaH2));
    float novaR = 0.12 + 0.07 * novaH2;
    float novaM = novaKeep * (1.0 - smoothstep(novaR * 0.55, novaR, novaD)) * novaFade;
    vec3 novaC = novaH1 < 0.4 ? vec3(1.0, 0.98, 0.94) : novaH1 < 0.62 ? vec3(1.0, 0.8, 0.12) : novaH1 < 0.82 ? vec3(1.0, 0.5, 0.7) : vec3(0.72, 0.56, 1.0);
    novaC = mix(novaC, vec3(1.0, 0.75, 0.15), (1.0 - smoothstep(0.0, novaR * 0.45, novaD)) * step(novaH1, 0.4));
    diffuseColor.rgb = mix(diffuseColor.rgb, novaC, novaM);
  }
}`,
    );
}

interface Chunk {
  mesh: THREE.Mesh;
  /** Vertex grid indices (vx0, vz0, count per side). */
  vx0: number;
  vz0: number;
  n: number;
  step: number;
  baseColors: Float32Array;
  /** Flower-speck weight per vertex before paths / locked land take theirs away. */
  baseBloom: Float32Array;
}

export class Terrain {
  private group = new THREE.Group();
  private chunks: Chunk[] = [];
  private material = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** Flower speck strength: 1 = on, 0 = off (low quality skips the specks). */
  private readonly uBloom: THREE.IUniform<number> = { value: 1 };
  /** Per-vertex wear 0..1 for the whole height field (worn ground around buildings). */
  private wear = new Float32Array(VERTS * VERTS);
  private wearKey = NaN;
  private waterMat: THREE.ShaderMaterial;
  private water: THREE.Mesh | null = null;
  private wallMat: THREE.ShaderMaterial;
  private wall: THREE.Mesh | null = null;
  private gen: WorldGen | null = null;
  private flat = true;
  private unlockedKey = '';
  /** Per-cell locked flag (1 = locked) for the current unlock set. */
  private locked: Uint8Array = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
  private biomeCache = new Map<string, { low: THREE.Color; high: THREE.Color; warm: THREE.Color; cool: THREE.Color; bloom: number; relief: number }>();
  private tmp = new THREE.Color();
  private tmp2 = new THREE.Color();
  private tmp3 = new THREE.Color();

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    // the ground is lit like everything standing on it (wrapped Lambert, no rim: it has no silhouette)
    this.material.onBeforeCompile = (shader) => {
      patchLambert(shader, ctx.mats.lambert, false);
      patchBloom(shader, this.uBloom);
    };
    this.material.customProgramCacheKey = () => 'nova-terrain-bloom';
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uNight: { value: 0 },
          uDeep: { value: new THREE.Color('#1f6ccc') },
          uShallow: { value: new THREE.Color('#3aa6e6') },
          uFoam: { value: new THREE.Color('#f2fcff') },
        },
      ]),
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      fog: true,
    });
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color('#b48cff') }, uColorB: { value: new THREE.Color('#5ef2ff') } },
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  /** Is the terrain built from a real WorldGen (false = flat fallback)? */
  get hasGen(): boolean {
    return !this.flat;
  }

  /** Bilinear terrain height sample (world units). 0 when no generation data exists. */
  heightAt = (x: number, z: number): number => {
    const g = this.gen;
    if (!g || this.flat) return 0;
    const fx = clamp((x + HALF_WORLD) / CELL, 0, WORLD_CELLS - 0.001);
    const fz = clamp((z + HALF_WORLD) / CELL, 0, WORLD_CELLS - 0.001);
    const ix = fx | 0;
    const iz = fz | 0;
    const tx = fx - ix;
    const tz = fz - iz;
    const h = g.heights;
    const i00 = iz * VERTS + ix;
    const h00 = h[i00];
    const h10 = h[i00 + 1];
    const h01 = h[i00 + VERTS];
    const h11 = h[i00 + VERTS + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  /** Rebuild from the world system's generation (or the flat fallback when undefined). */
  setGen(gen: WorldGen | undefined | null): void {
    this.clear();
    const valid = !!gen && gen.heights && gen.heights.length === VERTS * VERTS && gen.regionMap && gen.regionMap.length === WORLD_CELLS * WORLD_CELLS;
    this.flat = !valid;
    this.gen = valid ? gen! : null;
    this.unlockedKey = '';
    if (this.flat) {
      this.buildChunks(1, 8);
    } else {
      this.buildChunks(8, 1); // 32x32-cell chunks: the frustum rejects most of the world off screen
      this.buildWater();
    }
    this.refreshLocked(true);
  }

  private clear(): void {
    for (const c of this.chunks) {
      this.group.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks = [];
    if (this.water) {
      this.group.remove(this.water);
      this.water.geometry.dispose();
      this.water = null;
    }
    if (this.wall) {
      this.group.remove(this.wall);
      this.wall.geometry.dispose();
      this.wall = null;
    }
  }

  private biome(regionId: string) {
    let b = this.biomeCache.get(regionId);
    if (!b) {
      const def = this.ctx.game.data.biome(regionId);
      const g = def?.ground ?? FALLBACK_GROUND;
      const paint = GROUND_PAINT[regionId];
      const low = new THREE.Color(paint?.low ?? g[0]);
      const high = new THREE.Color(paint?.high ?? g[1]);
      b = {
        low,
        high,
        warm: paint ? new THREE.Color(paint.warm) : high.clone(),
        cool: paint ? new THREE.Color(paint.cool) : low.clone(),
        bloom: paint?.bloom ?? 0,
        relief: Math.max(0.5, def?.relief ?? 1.5),
      };
      this.biomeCache.set(regionId, b);
    }
    return b;
  }

  private regionOfCell(cx: number, cz: number): string {
    const g = this.gen;
    if (!g) return 'crash_valley';
    cx = clamp(cx, 0, WORLD_CELLS - 1);
    cz = clamp(cz, 0, WORLD_CELLS - 1);
    return g.regionIds[g.regionMap[cellIndex(cx, cz)]] ?? g.regionIds[0] ?? 'crash_valley';
  }

  private heightOfVertex(vx: number, vz: number): number {
    const g = this.gen;
    if (!g || this.flat) return 0;
    return g.heights[clamp(vz, 0, VERTS - 1) * VERTS + clamp(vx, 0, VERTS - 1)];
  }

  private isWaterCell(cx: number, cz: number): boolean {
    const g = this.gen;
    if (!g || !g.water || cx < 0 || cz < 0 || cx >= WORLD_CELLS || cz >= WORLD_CELLS) return false;
    return g.water[cellIndex(cx, cz)] !== 0;
  }

  /** Compute the lit (unlocked) color of a terrain vertex; returns its flower-speck weight (0..1). */
  private vertexColor(vx: number, vz: number, out: THREE.Color): number {
    const h = this.heightOfVertex(vx, vz);
    // broad painted patches (sunny yellow-green / shady blue-green) and mid-size clumps, shared by the 4 cells
    // (two scales: hill-sized drifts and smaller sunlit / shady pools that show within one screen)
    const patch = (fbm(vx * 0.045, vz * 0.045, 123, 2) - 0.5) * 0.6 + (fbm(vx * 0.16, vz * 0.16, 211, 2) - 0.5) * 0.8;
    const clump = fbm(vx * 0.14, vz * 0.14, 91, 2) - 0.5;
    const grain = fbm(vx * 0.37, vz * 0.37, 77, 2) - 0.5;
    const n = fbm(vx * 0.07, vz * 0.07, 31, 3);
    // blend the biomes of the 4 cells around the vertex
    out.setRGB(0, 0, 0);
    let shore = 0;
    let shoreCol = SHORE;
    let bloom = 0;
    for (let dz = -1; dz <= 0; dz++) {
      for (let dx = -1; dx <= 0; dx++) {
        const cx = vx + dx;
        const cz = vz + dz;
        const region = this.regionOfCell(cx, cz);
        const b = this.biome(region);
        const t = clamp(h / b.relief + (n - 0.5) * 0.9 + 0.15, 0, 1);
        this.tmp2.lerpColors(b.low, b.high, t);
        if (patch > 0) this.tmp2.lerp(b.warm, Math.min(1, patch * 2.6) * 0.7);
        else this.tmp2.lerp(b.cool, Math.min(1, -patch * 2.6) * 0.55);
        out.add(this.tmp2);
        bloom += b.bloom;
        if (this.isWaterCell(cx, cz)) {
          shore++;
          shoreCol = SHORE_BY_BIOME[region] ?? shoreCol;
        }
      }
    }
    out.multiplyScalar(0.25);
    bloom *= 0.25;
    if (shore > 0) {
      out.lerp(shoreCol, shore >= 4 ? 0.85 : 0.55);
      bloom = 0;
    }
    // mid-size clumps of brighter / darker grass and a fine grain: the ground never reads as one flat tone
    out.multiplyScalar(1 + clump * 0.22 + grain * 0.14);
    const l = out.r * 0.3 + out.g * 0.59 + out.b * 0.11;
    out.lerp(this.tmp2.setRGB(l, l, l), GROUND_DESAT).multiply(GROUND_TINT).multiplyScalar(GROUND_VALUE);
    // flowers gather in drifts: denser in the sunny patches, sparse in the shade
    return clamp(bloom * (0.55 + patch * 1.4 + clump * 0.6), 0, 1);
  }

  /**
   * Rebuild the per-vertex wear field from the buildings: every footprint tramples the ground in and
   * around it (facilities wider than structure pieces). Cheap (a few dozen vertices per building),
   * only runs when the building set changes.
   */
  private rebuildWear(): void {
    const wear = this.wear;
    wear.fill(0);
    if (this.flat) return;
    const game = this.ctx.game;
    for (const b of game.state.buildings.list) {
      const def = game.data.building(b.def);
      const size = def?.size ?? [1, 1];
      const c = footprintCenter(b.x, b.z, size, b.rot);
      const [rw, rd] = rotatedSize(size, b.rot);
      const hw = (rw * CELL) / 2;
      const hd = (rd * CELL) / 2;
      const reach = def?.piece ? WEAR_REACH_PIECE : WEAR_REACH + WEAR_REACH_PER_CELL * (Math.max(rw, rd) - 1);
      const vx0 = Math.max(0, Math.floor((c.x - hw - reach + HALF_WORLD) / CELL));
      const vx1 = Math.min(VERTS - 1, Math.ceil((c.x + hw + reach + HALF_WORLD) / CELL));
      const vz0 = Math.max(0, Math.floor((c.z - hd - reach + HALF_WORLD) / CELL));
      const vz1 = Math.min(VERTS - 1, Math.ceil((c.z + hd + reach + HALF_WORLD) / CELL));
      for (let vz = vz0; vz <= vz1; vz++) {
        for (let vx = vx0; vx <= vx1; vx++) {
          const dx = Math.max(0, Math.abs(vx * CELL - HALF_WORLD - c.x) - hw);
          const dz = Math.max(0, Math.abs(vz * CELL - HALF_WORLD - c.z) - hd);
          // ragged edge: the reach wobbles ±35% with a per-vertex noise so rings never look stamped
          const r = reach * (0.75 + 0.5 * fbm(vx * 0.41, vz * 0.41, 57, 2));
          const k = clamp(1 - Math.hypot(dx, dz) / r, 0, 1);
          const w = k * k * (3 - 2 * k);
          const i = vz * VERTS + vx;
          if (w > wear[i]) wear[i] = w;
        }
      }
    }
  }

  /** Cheap signature of what changes the wear field (footprints only, not status / hp). */
  private wearSignature(): number {
    return wearSignature(this.ctx.game.state.buildings.list);
  }

  private buildChunks(perSide: number, step: number): void {
    const cellsPerChunk = WORLD_CELLS / perSide;
    for (let cj = 0; cj < perSide; cj++) {
      for (let ci = 0; ci < perSide; ci++) {
        const vx0 = ci * cellsPerChunk;
        const vz0 = cj * cellsPerChunk;
        const n = cellsPerChunk / step + 1; // vertices per side
        const pos = new Float32Array(n * n * 3);
        const nor = new Float32Array(n * n * 3);
        const col = new Float32Array(n * n * 3);
        const bloom = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const vx = vx0 + i * step;
            const vz = vz0 + j * step;
            const o = (j * n + i) * 3;
            pos[o] = vx * CELL - HALF_WORLD;
            pos[o + 1] = this.heightOfVertex(vx, vz);
            pos[o + 2] = vz * CELL - HALF_WORLD;
            // smooth normal from the whole height field (central differences): soft hills, no seams at chunk edges
            const nx = this.heightOfVertex(vx - step, vz) - this.heightOfVertex(vx + step, vz);
            const nz = this.heightOfVertex(vx, vz - step) - this.heightOfVertex(vx, vz + step);
            const ny = 2 * CELL * step;
            const inv = 1 / Math.hypot(nx, ny, nz);
            nor[o] = nx * inv;
            nor[o + 1] = ny * inv;
            nor[o + 2] = nz * inv;
            bloom[j * n + i] = this.vertexColor(vx, vz, this.tmp);
            col[o] = this.tmp.r;
            col[o + 1] = this.tmp.g;
            col[o + 2] = this.tmp.b;
          }
        }
        const idx = new Uint32Array((n - 1) * (n - 1) * 6);
        let k = 0;
        for (let j = 0; j < n - 1; j++) {
          for (let i = 0; i < n - 1; i++) {
            const a = j * n + i;
            const b = a + 1;
            const c = a + n;
            const d = c + 1;
            // alternate diagonal for a nicer low-poly look
            if ((i + j) & 1) {
              idx[k++] = a; idx[k++] = c; idx[k++] = b;
              idx[k++] = b; idx[k++] = c; idx[k++] = d;
            } else {
              idx[k++] = a; idx[k++] = c; idx[k++] = d;
              idx[k++] = a; idx[k++] = d; idx[k++] = b;
            }
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col.slice(), 3));
        geo.setAttribute('aBloom', new THREE.BufferAttribute(bloom.slice(), 1));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.chunks.push({ mesh, vx0, vz0, n, step, baseColors: col, baseBloom: bloom });
      }
    }
  }

  private buildWater(): void {
    const g = this.gen;
    if (!g || !g.water) return;
    const W = WORLD_CELLS;
    // flood fill water components to find a flat level per lake
    const comp = new Int32Array(W * W).fill(-1);
    const levels: number[] = [];
    const stack: number[] = [];
    let count = 0;
    for (let i = 0; i < W * W; i++) {
      if (!g.water[i] || comp[i] !== -1) continue;
      const id = levels.length;
      stack.push(i);
      comp[i] = id;
      let sum = 0;
      let n = 0;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % W;
        const cz = (c / W) | 0;
        count++;
        // shore cell? average its corner heights
        let shore = false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
          const ni = nz * W + nx;
          if (!g.water[ni]) shore = true;
          else if (comp[ni] === -1) {
            comp[ni] = id;
            stack.push(ni);
          }
        }
        if (shore) {
          sum += Math.max(this.heightOfVertex(cx, cz), this.heightOfVertex(cx + 1, cz), this.heightOfVertex(cx, cz + 1), this.heightOfVertex(cx + 1, cz + 1));
          n++;
        }
      }
      // The generator carves every corner of a water cell down to the bed and keeps land at 0 or above, so the water
      // stands at its WATER_LEVEL, well above the bed: the shoreline then falls inside the bank cells, on the smooth
      // terrain contour. (Sitting just over the bed, the water filled a square-cornered pit cut into the ground.)
      levels.push(Math.max(n ? sum / n + 0.04 : WATER_LEVEL, WATER_LEVEL));
    }
    if (count === 0) return;
    // Draw every water cell plus the ring of land cells around it at the lake's level: the terrain
    // hides the water wherever the ground rises above it, so the visible shoreline follows the smooth
    // terrain contour instead of the cell grid. Each corner carries its depth below the surface
    // (aShore, world units; negative under dry land): the shader puts the foam line and the turquoise
    // shallows on that contour.
    const level = new Float32Array(W * W).fill(NaN);
    for (let i = 0; i < W * W; i++) if (g.water[i]) level[i] = levels[comp[i]];
    for (let i = 0; i < W * W; i++) {
      if (!g.water[i]) continue;
      const cx = i % W;
      const cz = (i / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
          const ni = nz * W + nx;
          if (g.water[ni]) continue;
          const l = levels[comp[i]];
          if (Number.isNaN(level[ni]) || l > level[ni]) level[ni] = l;
        }
      }
    }
    // corners of water cells are "wet": they always read as water (at least WET_DEPTH deep for the colour and
    // foam), while ring corners that touch no water cell read as dry shore (at most -DRY_DEPTH). On dead-flat
    // ground (a marsh) the pool would otherwise be ~0.04 deep everywhere — one sheet of foam with the ring
    // cells' square edges showing; this way the foam line and the fade-out fall inside the ring cells.
    const C = W + 1;
    const wet = new Uint8Array(C * C);
    for (let i = 0; i < W * W; i++) {
      if (!g.water[i]) continue;
      const cx = i % W;
      const cz = (i / W) | 0;
      wet[cz * C + cx] = wet[cz * C + cx + 1] = wet[(cz + 1) * C + cx] = wet[(cz + 1) * C + cx + 1] = 1;
    }
    const depthAt = (y: number, vx: number, vz: number): number => {
      const d = y - this.heightOfVertex(vx, vz);
      return wet[vz * C + vx] ? Math.max(d, WET_DEPTH) : Math.min(d, -DRY_DEPTH);
    };
    let quads = 0;
    for (let i = 0; i < W * W; i++) if (!Number.isNaN(level[i])) quads++;
    const pos = new Float32Array(quads * 4 * 3);
    const shoreAttr = new Float32Array(quads * 4);
    const toxicAttr = new Float32Array(quads * 4);
    const idx = new Uint32Array(quads * 6);
    let v = 0;
    let k = 0;
    for (let i = 0; i < W * W; i++) {
      const y = level[i];
      if (Number.isNaN(y)) continue;
      const cx = i % W;
      const cz = (i / W) | 0;
      const x0 = cx * CELL - HALF_WORLD;
      const z0 = cz * CELL - HALF_WORLD;
      const base = v / 3;
      shoreAttr[base] = depthAt(y, cx, cz);
      shoreAttr[base + 1] = depthAt(y, cx + 1, cz);
      shoreAttr[base + 2] = depthAt(y, cx, cz + 1);
      shoreAttr[base + 3] = depthAt(y, cx + 1, cz + 1);
      const toxic = TOXIC_WATER.has(g.regionIds[g.regionMap[i]] ?? '') ? 1 : 0;
      toxicAttr[base] = toxicAttr[base + 1] = toxicAttr[base + 2] = toxicAttr[base + 3] = toxic;
      pos[v++] = x0; pos[v++] = y; pos[v++] = z0;
      pos[v++] = x0 + CELL; pos[v++] = y; pos[v++] = z0;
      pos[v++] = x0; pos[v++] = y; pos[v++] = z0 + CELL;
      pos[v++] = x0 + CELL; pos[v++] = y; pos[v++] = z0 + CELL;
      idx[k++] = base; idx[k++] = base + 2; idx[k++] = base + 1;
      idx[k++] = base + 1; idx[k++] = base + 2; idx[k++] = base + 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aShore', new THREE.BufferAttribute(shoreAttr, 1));
    geo.setAttribute('aToxic', new THREE.BufferAttribute(toxicAttr, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.renderOrder = 2;
    this.water.matrixAutoUpdate = false;
    this.group.add(this.water);
  }

  /**
   * Re-apply locked-region dimming and worn ground, rebuild the border wall — when the unlock set or
   * the building footprints changed (or on `force`, after a terrain rebuild).
   */
  private refreshLocked(force = false): void {
    const world = this.ctx.game.state.world;
    const key = world.regionsUnlocked.join('|');
    const shadows = this.ctx.env.quality === 'high';
    const wearKey = this.wearSignature() + (shadows ? 0.5 : 0);
    if (!force && key === this.unlockedKey && wearKey === this.wearKey) return;
    const wallDirty = force || key !== this.unlockedKey;
    this.unlockedKey = key;
    this.wearKey = wearKey;
    this.rebuildWear();
    const contact = shadows ? 0 : CONTACT_SHADE;
    const g = this.gen;
    const W = WORLD_CELLS;
    const unlocked = new Set(world.regionsUnlocked);
    // regions with an empty unlock requirement count as unlocked (world agent convention)
    for (const b of this.ctx.game.data.biomes) if (!b.unlock || Object.keys(b.unlock).length === 0) unlocked.add(b.id);
    let anyLocked = false;
    if (!g || this.flat) {
      this.locked.fill(0);
    } else {
      for (let i = 0; i < W * W; i++) {
        const id = g.regionIds[g.regionMap[i]];
        const l = id && !unlocked.has(id) ? 1 : 0;
        this.locked[i] = l;
        if (l) anyLocked = true;
      }
    }
    // recolor vertices
    for (const c of this.chunks) {
      const attr = c.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const battr = c.mesh.geometry.getAttribute('aBloom') as THREE.BufferAttribute;
      const barr = battr.array as Float32Array;
      const n = c.n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const vx = c.vx0 + i * c.step;
          const vz = c.vz0 + j * c.step;
          const o = (j * n + i) * 3;
          let lockedCount = 0;
          if (anyLocked) {
            for (let dz = -1; dz <= 0; dz++) {
              for (let dx = -1; dx <= 0; dx++) {
                const cx = clamp(vx + dx, 0, W - 1);
                const cz = clamp(vz + dz, 0, W - 1);
                lockedCount += this.locked[cz * W + cx];
              }
            }
          }
          this.tmp3.setRGB(c.baseColors[o], c.baseColors[o + 1], c.baseColors[o + 2]);
          const w = this.wear[vz * VERTS + vx];
          if (w > 0) wornColor(this.tmp3, wearBlend(w) * WEAR_MAX).multiplyScalar(1 - w * w * contact);
          if (lockedCount) dimColor(this.tmp3, 0.2 * lockedCount);
          arr[o] = this.tmp3.r;
          arr[o + 1] = this.tmp3.g;
          arr[o + 2] = this.tmp3.b;
          // paths and locked land have no flowers
          barr[j * n + i] = lockedCount ? 0 : c.baseBloom[j * n + i] * (1 - Math.min(1, w * 1.6));
        }
      }
      attr.needsUpdate = true;
      battr.needsUpdate = true;
    }
    if (wallDirty) this.buildWall(anyLocked);
  }

  private buildWall(anyLocked: boolean): void {
    if (this.wall) {
      this.group.remove(this.wall);
      this.wall.geometry.dispose();
      this.wall = null;
    }
    if (!anyLocked) return;
    const W = WORLD_CELLS;
    const H = 7;
    const pos: number[] = [];
    const hh: number[] = [];
    const idx: number[] = [];
    const addQuad = (x0: number, z0: number, x1: number, z1: number) => {
      const y0 = Math.min(this.heightOfVertex(Math.round((x0 + HALF_WORLD) / CELL), Math.round((z0 + HALF_WORLD) / CELL)), this.heightOfVertex(Math.round((x1 + HALF_WORLD) / CELL), Math.round((z1 + HALF_WORLD) / CELL))) - 0.5;
      const b = pos.length / 3;
      pos.push(x0, y0, z0, x1, y0, z1, x0, y0 + H, z0, x1, y0 + H, z1);
      hh.push(0, 0, 1, 1);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    };
    for (let cz = 0; cz < W; cz++) {
      for (let cx = 0; cx < W; cx++) {
        const i = cz * W + cx;
        if (!this.locked[i]) continue;
        const x0 = cx * CELL - HALF_WORLD;
        const z0 = cz * CELL - HALF_WORLD;
        if (cx > 0 && !this.locked[i - 1]) addQuad(x0, z0, x0, z0 + CELL);
        if (cx < W - 1 && !this.locked[i + 1]) addQuad(x0 + CELL, z0, x0 + CELL, z0 + CELL);
        if (cz > 0 && !this.locked[i - W]) addQuad(x0, z0, x0 + CELL, z0);
        if (cz < W - 1 && !this.locked[i + W]) addQuad(x0, z0 + CELL, x0 + CELL, z0 + CELL);
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    this.wall = new THREE.Mesh(geo, this.wallMat);
    this.wall.renderOrder = 5;
    this.wall.frustumCulled = false;
    this.wall.matrixAutoUpdate = false;
    this.group.add(this.wall);
  }

  /** Region id at a world position according to the generation data (fallback: start region). */
  regionAt(x: number, z: number): string {
    const cx = clamp(Math.floor((x + HALF_WORLD) / CELL), 0, WORLD_CELLS - 1);
    const cz = clamp(Math.floor((z + HALF_WORLD) / CELL), 0, WORLD_CELLS - 1);
    return this.regionOfCell(cx, cz);
  }

  isLockedAt(x: number, z: number): boolean {
    const cx = clamp(Math.floor((x + HALF_WORLD) / CELL), 0, WORLD_CELLS - 1);
    const cz = clamp(Math.floor((z + HALF_WORLD) / CELL), 0, WORLD_CELLS - 1);
    return this.locked[cz * WORLD_CELLS + cx] === 1;
  }

  update(): void {
    const env = this.ctx.env;
    this.waterMat.uniforms.uTime.value = env.t;
    this.waterMat.uniforms.uNight.value = env.night;
    this.wallMat.uniforms.uTime.value = env.t;
    this.uBloom.value = env.quality === 'low' ? 0 : 1;
    this.refreshLocked();
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
    this.waterMat.dispose();
    this.wallMat.dispose();
    this.ctx.scene.remove(this.group);
  }
}
