/**
 * Terrain — chunked height-field mesh from WorldGen (vertex colors from BiomeDef.ground, blended at
 * region borders, sandy shores, locked regions desaturated), stylized animated water and the
 * shimmering energy-storm wall along the border of locked regions. Falls back to a flat coloured
 * ground when the world system has not generated anything.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import type { WorldGen } from '../../sim/world';
import { CELL, HALF_WORLD, WORLD_CELLS, cellIndex } from '../../core/constants';
import { fbm } from '../../core/rng';
import { clamp } from '../../core/math';
import { dimColor } from '../core/palette';

const VERTS = WORLD_CELLS + 1;
const SHORE = new THREE.Color('#d9c98f');
const FALLBACK_GROUND: [string, string] = ['#6fbf5a', '#9bd66b'];

const WATER_VERT = /* glsl */ `
  #include <fog_pars_vertex>
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    vec3 p = position;
    float w = sin(p.x * 0.55 + uTime * 1.3) * 0.5 + sin(p.z * 0.7 - uTime * 1.1) * 0.5;
    p.y += w * 0.06;
    vWave = w;
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const WATER_FRAG = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform float uTime; uniform float uNight;
  varying vec3 vWorld;
  varying float vWave;
  void main() {
    float r1 = sin(vWorld.x * 1.9 + vWorld.z * 1.3 + uTime * 1.7);
    float r2 = sin(vWorld.x * 1.1 - vWorld.z * 2.3 - uTime * 1.2);
    float ripple = smoothstep(0.78, 0.95, r1 * r2);
    vec3 c = mix(uDeep, uShallow, 0.5 + 0.5 * vWave);
    c = mix(c, uFoam, ripple * 0.55);
    c *= 1.0 - uNight * 0.55;
    gl_FragColor = vec4(c, 0.88);
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

interface Chunk {
  mesh: THREE.Mesh;
  /** Vertex grid indices (vx0, vz0, count per side). */
  vx0: number;
  vz0: number;
  n: number;
  step: number;
  baseColors: Float32Array;
}

export class Terrain {
  private group = new THREE.Group();
  private chunks: Chunk[] = [];
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private waterMat: THREE.ShaderMaterial;
  private water: THREE.Mesh | null = null;
  private wallMat: THREE.ShaderMaterial;
  private wall: THREE.Mesh | null = null;
  private gen: WorldGen | null = null;
  private flat = true;
  private unlockedKey = '';
  /** Per-cell locked flag (1 = locked) for the current unlock set. */
  private locked: Uint8Array = new Uint8Array(WORLD_CELLS * WORLD_CELLS);
  private biomeCache = new Map<string, { low: THREE.Color; high: THREE.Color; relief: number }>();
  private tmp = new THREE.Color();
  private tmp2 = new THREE.Color();
  private tmp3 = new THREE.Color();

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uNight: { value: 0 },
          uDeep: { value: new THREE.Color('#2a7fc9') },
          uShallow: { value: new THREE.Color('#5ec8ea') },
          uFoam: { value: new THREE.Color('#dff7ff') },
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
      b = { low: new THREE.Color(g[0]), high: new THREE.Color(g[1]), relief: Math.max(0.5, def?.relief ?? 1.5) };
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

  /** Compute the lit (unlocked) color of a terrain vertex. */
  private vertexColor(vx: number, vz: number, out: THREE.Color): void {
    const h = this.heightOfVertex(vx, vz);
    // blend the biomes of the 4 cells around the vertex
    out.setRGB(0, 0, 0);
    let shore = 0;
    for (let dz = -1; dz <= 0; dz++) {
      for (let dx = -1; dx <= 0; dx++) {
        const cx = vx + dx;
        const cz = vz + dz;
        const b = this.biome(this.regionOfCell(cx, cz));
        const n = fbm(vx * 0.07, vz * 0.07, 31, 3);
        const t = clamp(h / b.relief + (n - 0.5) * 0.9 + 0.15, 0, 1);
        this.tmp2.lerpColors(b.low, b.high, t);
        out.add(this.tmp2);
        if (this.isWaterCell(cx, cz)) shore++;
      }
    }
    out.multiplyScalar(0.25);
    if (shore > 0) out.lerp(SHORE, shore >= 4 ? 0.85 : 0.55);
    // slight per-vertex brightness variation (hand-painted look)
    const v = fbm(vx * 0.35, vz * 0.35, 77, 2);
    const w = fbm(vx * 0.11, vz * 0.11, 91, 2);
    out.multiplyScalar(0.9 + v * 0.14 + (w - 0.5) * 0.16);
  }

  private buildChunks(perSide: number, step: number): void {
    const cellsPerChunk = WORLD_CELLS / perSide;
    for (let cj = 0; cj < perSide; cj++) {
      for (let ci = 0; ci < perSide; ci++) {
        const vx0 = ci * cellsPerChunk;
        const vz0 = cj * cellsPerChunk;
        const n = cellsPerChunk / step + 1; // vertices per side
        const pos = new Float32Array(n * n * 3);
        const col = new Float32Array(n * n * 3);
        for (let j = 0; j < n; j++) {
          for (let i = 0; i < n; i++) {
            const vx = vx0 + i * step;
            const vz = vz0 + j * step;
            const o = (j * n + i) * 3;
            pos[o] = vx * CELL - HALF_WORLD;
            pos[o + 1] = this.heightOfVertex(vx, vz);
            pos[o + 2] = vz * CELL - HALF_WORLD;
            this.vertexColor(vx, vz, this.tmp);
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
        geo.setAttribute('color', new THREE.BufferAttribute(col.slice(), 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        this.chunks.push({ mesh, vx0, vz0, n, step, baseColors: col });
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
          // shore cells sit right under the generator's water threshold: their highest corner ~ the level
          sum += Math.max(this.heightOfVertex(cx, cz), this.heightOfVertex(cx + 1, cz), this.heightOfVertex(cx, cz + 1), this.heightOfVertex(cx + 1, cz + 1));
          n++;
        }
      }
      levels.push(n ? sum / n + 0.04 : -0.3);
    }
    if (count === 0) return;
    const pos = new Float32Array(count * 4 * 3);
    const idx = new Uint32Array(count * 6);
    let v = 0;
    let k = 0;
    for (let i = 0; i < W * W; i++) {
      if (!g.water[i]) continue;
      const cx = i % W;
      const cz = (i / W) | 0;
      const y = levels[comp[i]];
      const x0 = cx * CELL - HALF_WORLD;
      const z0 = cz * CELL - HALF_WORLD;
      const base = v / 3;
      pos[v++] = x0; pos[v++] = y; pos[v++] = z0;
      pos[v++] = x0 + CELL; pos[v++] = y; pos[v++] = z0;
      pos[v++] = x0; pos[v++] = y; pos[v++] = z0 + CELL;
      pos[v++] = x0 + CELL; pos[v++] = y; pos[v++] = z0 + CELL;
      idx[k++] = base; idx[k++] = base + 2; idx[k++] = base + 1;
      idx[k++] = base + 1; idx[k++] = base + 2; idx[k++] = base + 3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.water = new THREE.Mesh(geo, this.waterMat);
    this.water.renderOrder = 2;
    this.water.matrixAutoUpdate = false;
    this.group.add(this.water);
  }

  /** Re-apply locked-region dimming + rebuild the border wall when the unlock set changed. */
  private refreshLocked(force = false): void {
    const world = this.ctx.game.state.world;
    const key = world.regionsUnlocked.join('|');
    if (!force && key === this.unlockedKey) return;
    this.unlockedKey = key;
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
          if (lockedCount) dimColor(this.tmp3, 0.2 * lockedCount);
          arr[o] = this.tmp3.r;
          arr[o + 1] = this.tmp3.g;
          arr[o + 2] = this.tmp3.b;
        }
      }
      attr.needsUpdate = true;
    }
    this.buildWall(anyLocked);
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
