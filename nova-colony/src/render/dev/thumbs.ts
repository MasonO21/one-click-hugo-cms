/**
 * Thumbnail baker (dev only — served from /thumbs.html, driven headless by scripts/bake-thumbs.mjs,
 * never part of the production bundle). Renders every building and vehicle with the game's own
 * procedural models, shared slot-aware materials and the Buildings actor itself (so structure pieces
 * compose exactly as placed, animated parts sit where they do in game and tier colours apply) on a
 * transparent background, auto-framed in a square, and hands back straight-alpha RGBA pixels.
 *
 * Look: the game's default camera yaw (view.camera.yaw = π/4) at a 3/4 pitch (steeper for flat
 * pieces so floors and farm plots stay legible), warm key + cool fill modelled on the noon sky keys
 * in Atmosphere, a gentle cool rim so dark tiers read on the dark HUD, emissive slots lit as at dusk,
 * an optional soft contact blob, and a supersampled render that is box-filtered in premultiplied
 * space (no halos on either card colour).
 *
 * URL params: blob=0 · size=192 · scale=4 · night=0.2 · ids=a,b,c (preview grid). Bake API: window.__thumbs.
 */
import * as THREE from 'three';
import { Game } from '../../core/Game';
import { createDataRegistry, defaultData } from '../../data';
import type { BuildingDef, VehicleDef } from '../../data/schema';
import type { BuildingInstance } from '../../core/state';
import { Materials } from '../core/materials';
import { Particles } from '../fx/Particles';
import { Buildings } from '../actors/Buildings';
import type { Env, RenderContext } from '../core/context';
import { vehicleGeometry, vehicleHovers } from '../models/characters';
import { CENTER_CELL } from '../../core/constants';
import { clamp } from '../../core/math';
import '../models';

export type ThumbKind = 'building' | 'vehicle';

export interface ThumbEntry {
  kind: ThumbKind;
  id: string;
}

export interface BakeOptions {
  /** Output icon size in pixels. */
  size: number;
  /** Supersampling factor (rendered at size × scale, box-filtered down). */
  scale: number;
  /** Soft contact shadow blob under the model. */
  blob: boolean;
  /** Fraction of the square the model's projected bounds fill. */
  fill: number;
  /** Emissive strength as the game's night factor (Materials.setNight): 0 = day neon, 1 = full night. */
  night: number;
}

const DEFAULTS: BakeOptions = { size: 192, scale: 4, blob: true, fill: 0.86, night: 0.2 };

/** Camera: the game's default orbit yaw, a 3/4 pitch, and a steeper one for flat models. */
const YAW = Math.PI * 0.25;
const PITCH = 0.6;
const PITCH_FLAT = 0.98;
/** Height / footprint ratio below which a model counts as flat (floors, farm plots, solar panels). */
const FLAT_RATIO = 0.3;
const FOV = 26;
/** Animation clock for the snapshot: turrets settle on their idle scan angle (about −0.4 rad). */
const CLOCK = 11.4;
/** Hover vehicles ride this high in Characters. */
const HOVER_Y = 0.35;

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class ThumbBaker {
  readonly opts: BakeOptions;
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly blob: THREE.Mesh;
  private readonly vehicle: THREE.Mesh;
  private readonly game: Game;
  private readonly buildings: Buildings;
  private readonly env: Env;
  private readonly mats = new Materials();
  private readonly px: number;
  private readonly readBuf: Uint8Array;
  /** How the last render was framed (bake log / dev page). */
  last: { flat: boolean; size: [number, number, number] } = { flat: false, size: [0, 0, 0] };

  constructor(opts: Partial<BakeOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
    this.px = this.opts.size * this.opts.scale;
    this.readBuf = new Uint8Array(this.px * this.px * 4);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(this.px, this.px, false);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.scene.background = null;

    // lights (Atmosphere's noon keys, a touch warmer / brighter for icons)
    this.sun = new THREE.DirectionalLight('#fff1d6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // the map covers only the subject, so texels are tiny: small biases keep eave / overhang shadows
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight('#bfe0ff', 0.45);
    this.scene.add(this.fill);
    this.rim = new THREE.DirectionalLight('#a8dcff', 0.7);
    this.scene.add(this.rim);
    this.scene.add(new THREE.HemisphereLight('#dbeeff', '#8ea86a', 0.95));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.22));
    this.mats.setNight(this.opts.night);

    // a headless Game (never started: the actor only reads data / state / view and the bus). Shield
    // domes are stripped — in game they idle as a barely visible shimmer and would swallow the frame.
    const base = defaultData();
    const data = createDataRegistry({ ...base, buildings: base.buildings.map((b) => (b.shield ? { ...b, shield: undefined } : b)) });
    this.game = new Game({ seed: 1, data });
    this.game.state.settings.quality = 'low';
    // map mode: no sight-line targets, so the actor never dithers away a building that happens to
    // stand between the camera and the (headless) player at the origin
    this.game.view.mode = 'map';
    this.env = { t: CLOCK, dt: 0, night: 0, sunElev: 1, quality: 'low', cx: 0, cz: 0, viewRadius: 1000, camX: 0, camY: 30, camZ: 30, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
    // particles get their own scene so emitters (smoke, steam) never reach the thumbnail
    const particles = new Particles(new THREE.Scene(), this.mats, 'low');
    const ctx: RenderContext = { game: this.game, scene: this.scene, camera: this.camera, mats: this.mats, env: this.env, particles, heightAt: () => 0 };
    this.buildings = new Buildings(ctx);

    this.vehicle = new THREE.Mesh(vehicleGeometry('atv'), this.mats.set);
    this.vehicle.castShadow = true;
    this.vehicle.visible = false;
    this.scene.add(this.vehicle);

    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0.3 }, uColor: { value: new THREE.Color('#2a1e16') } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv; void main() { float r = length(vUv * 2.0 - 1.0); gl_FragColor = vec4(uColor, uAlpha * smoothstep(1.0, 0.2, r)); }',
      transparent: true,
      depthWrite: false,
    }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = -1;
    this.blob.userData.noBounds = true;
    this.blob.visible = false;
    this.scene.add(this.blob);
  }

  /** Everything the build menu needs a picture of: every BuildingDef and every VehicleDef. */
  list(): ThumbEntry[] {
    const d = this.game.data;
    return [...d.buildings.map((b) => ({ kind: 'building' as const, id: b.id })), ...d.vehicles.map((v) => ({ kind: 'vehicle' as const, id: v.id }))];
  }

  /** Render one entry; straight-alpha RGBA, size × size, top row first. */
  render(kind: ThumbKind, id: string): Uint8ClampedArray<ArrayBuffer> {
    if (kind === 'building') {
      const def = this.game.data.building(id);
      if (!def) throw new Error(`unknown building ${id}`);
      this.stageBuilding(def);
    } else {
      const def = this.game.data.vehicle(id);
      if (!def) throw new Error(`unknown vehicle ${id}`);
      this.stageVehicle(def);
    }
    return this.shoot();
  }

  // ------------------------------------------------------------------------------ staging

  /** Fully built, level 1, active, in the material tier it unlocks at; the actor composes it. */
  private stageBuilding(def: BuildingDef): void {
    const st = this.game.state;
    const b: BuildingInstance = {
      id: 1,
      def: def.id,
      x: CENTER_CELL - Math.floor(def.size[0] / 2),
      z: CENTER_CELL - Math.floor(def.size[1] / 2),
      rot: 0,
      level: 1,
      tier: clamp(def.unlockTier | 0, 0, this.game.data.tiers.length - 1),
      hp: def.hp,
      maxHp: def.hp,
      status: 'active',
      progress: 1,
      workers: [],
      recipe: null,
      craft: 0,
      eff: 1,
    };
    st.buildings.list.length = 0;
    st.buildings.list.push(b);
    this.game.derived.buildingsVersion++;
    this.vehicle.visible = false;
    // a few frames at a fixed clock: turrets swing onto their idle scan angle, parts take their pose
    for (let i = 0; i < 12; i++) this.buildings.update(0.1);
  }

  private stageVehicle(def: VehicleDef): void {
    const st = this.game.state;
    st.buildings.list.length = 0;
    this.game.derived.buildingsVersion++;
    this.buildings.update(0.1);
    this.vehicle.geometry = vehicleGeometry(def.model);
    this.vehicle.position.set(0, vehicleHovers(def.model) ? HOVER_Y : 0, 0);
    this.vehicle.visible = true;
    this.vehicle.updateMatrixWorld();
  }

  // ------------------------------------------------------------------------------ framing

  /** World-space positions of every drawn vertex (instances expanded) — exact projected bounds. */
  private collectPoints(): Float32Array {
    this.scene.updateMatrixWorld(true);
    const chunks: Float32Array[] = [];
    let total = 0;
    this.scene.traverse((o) => {
      if (!o.visible || o.userData.noBounds) return;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined;
      if (!pos || pos.count === 0) return;
      const inst = o as THREE.InstancedMesh;
      const n = inst.isInstancedMesh ? inst.count : 1;
      if (n === 0) return;
      const out = new Float32Array(n * pos.count * 3);
      let k = 0;
      for (let i = 0; i < n; i++) {
        if (inst.isInstancedMesh) {
          inst.getMatrixAt(i, _m);
          _m.premultiply(o.matrixWorld);
        } else _m.copy(o.matrixWorld);
        for (let v = 0; v < pos.count; v++) {
          _v.fromBufferAttribute(pos, v).applyMatrix4(_m);
          out[k++] = _v.x;
          out[k++] = _v.y;
          out[k++] = _v.z;
        }
      }
      chunks.push(out);
      total += out.length;
    });
    const all = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      all.set(c, off);
      off += c.length;
    }
    return all;
  }

  /** Place the camera so the projected points fill `fill` of the square, centred; returns the AABB. */
  private frame(points: Float32Array): THREE.Box3 {
    const box = new THREE.Box3();
    for (let i = 0; i < points.length; i += 3) box.expandByPoint(_v.set(points[i], points[i + 1], points[i + 2]));
    const size = box.getSize(new THREE.Vector3());
    const flat = size.y / Math.max(size.x, size.z, 0.01) < FLAT_RATIO;
    this.last = { flat, size: [size.x, size.y, size.z] };
    const pitch = flat ? PITCH_FLAT : PITCH;
    const dir = new THREE.Vector3(Math.sin(YAW) * Math.cos(pitch), Math.sin(pitch), Math.cos(YAW) * Math.cos(pitch));
    const target = box.getCenter(new THREE.Vector3());
    const radius = Math.max(0.5, size.length() / 2);
    let dist = radius * 4;
    const cam = this.camera;
    const tanHalf = Math.tan((FOV * Math.PI) / 360);
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    for (let iter = 0; iter < 10; iter++) {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.near = Math.max(0.1, dist - radius * 2);
      cam.far = dist + radius * 2;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < points.length; i += 3) {
        _v.set(points[i], points[i + 1], points[i + 2]).project(cam);
        if (_v.x < minX) minX = _v.x;
        if (_v.x > maxX) maxX = _v.x;
        if (_v.y < minY) minY = _v.y;
        if (_v.y > maxY) maxY = _v.y;
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const extent = Math.max(maxX - minX, maxY - minY) / 2;
      // NDC → world at the target plane: shift the target so the bounds centre; scale the distance to fit
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(right, cx * dist * tanHalf).addScaledVector(up, cy * dist * tanHalf);
      const k = extent / this.opts.fill;
      dist *= k;
      if (Math.abs(k - 1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
    }
    // lights follow the subject: warm key from the front-right-top, cool fill from the front-left,
    // cool rim from behind-left-top (roof slopes, cylinders and dark tiers get an edge)
    const c = box.getCenter(new THREE.Vector3());
    this.sun.position.set(c.x + 0.62 * 40, c.y + 0.72 * 40, c.z + 0.45 * 40);
    this.sun.target.position.copy(c);
    this.sun.target.updateMatrixWorld();
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -radius * 1.3;
    sc.right = sc.top = radius * 1.3;
    sc.near = 1;
    sc.far = 40 * 1.3 + radius * 3;
    sc.updateProjectionMatrix();
    this.fill.position.set(c.x - 0.45 * 40, c.y + 0.5 * 40, c.z + 0.8 * 40);
    this.rim.position.set(c.x - 0.55 * 40, c.y + 0.7 * 40, c.z - 0.6 * 40);
    return box;
  }

  // ------------------------------------------------------------------------------ shooting

  private shoot(): Uint8ClampedArray<ArrayBuffer> {
    const points = this.collectPoints();
    const box = this.frame(points);
    if (this.opts.blob) {
      const w = box.max.x - box.min.x;
      const d = box.max.z - box.min.z;
      this.blob.scale.set(w * 1.2 + 0.5, d * 1.2 + 0.5, 1);
      this.blob.position.set((box.min.x + box.max.x) / 2, 0.01, (box.min.z + box.max.z) / 2);
      this.blob.visible = true;
      this.blob.updateMatrixWorld();
    } else this.blob.visible = false;
    this.renderer.render(this.scene, this.camera);
    return this.downsample();
  }

  /**
   * Read the supersampled frame and box-filter it to the icon size. The drawing buffer is
   * premultiplied (MSAA resolve and alpha blending both land there), so the filter averages RGBA as
   * is and only then divides the colour by the coverage — straight alpha with no dark or light halos.
   */
  private downsample(): Uint8ClampedArray<ArrayBuffer> {
    const { size, scale } = this.opts;
    const px = this.px;
    const gl = this.renderer.getContext();
    const src = this.readBuf;
    gl.readPixels(0, 0, px, px, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const out = new Uint8ClampedArray(size * size * 4);
    const n = scale * scale;
    for (let oy = 0; oy < size; oy++) {
      for (let ox = 0; ox < size; ox++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let ky = 0; ky < scale; ky++) {
          // readPixels rows run bottom-up
          const sy = px - 1 - (oy * scale + ky);
          let si = (sy * px + ox * scale) * 4;
          for (let kx = 0; kx < scale; kx++) {
            r += src[si];
            g += src[si + 1];
            b += src[si + 2];
            a += src[si + 3];
            si += 4;
          }
        }
        const oi = (oy * size + ox) * 4;
        if (a > 0) {
          out[oi] = (r * 255) / a;
          out[oi + 1] = (g * 255) / a;
          out[oi + 2] = (b * 255) / a;
          out[oi + 3] = a / n;
        }
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------------------ page

const CHUNK = 0x8000;
function toBase64(bytes: Uint8ClampedArray<ArrayBuffer>): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  return btoa(s);
}

function boot(): void {
  const params = new URLSearchParams(location.search);
  const num = (k: string, d: number) => (params.has(k) ? Number(params.get(k)) : d);
  const baker = new ThumbBaker({ size: num('size', DEFAULTS.size), scale: num('scale', DEFAULTS.scale), blob: params.get('blob') !== '0', fill: num('fill', DEFAULTS.fill), night: num('night', DEFAULTS.night) });
  const api = {
    ready: true,
    size: baker.opts.size,
    /** The baker itself, for poking at the scene from the console / dev tooling. */
    baker,
    list: () => baker.list(),
    /** Base64 of straight-alpha RGBA (size × size) for the headless bake, plus how it was framed. */
    render: (kind: ThumbKind, id: string) => {
      const data = toBase64(baker.render(kind, id));
      return { data, ...baker.last };
    },
  };
  (window as unknown as { __thumbs: typeof api }).__thumbs = api;

  // preview grid for humans: every icon on the light card and the dark HUD colour
  if (params.get('bake')) return;
  const grid = document.getElementById('grid');
  if (!grid) return;
  const only = params.get('ids')?.split(',').filter(Boolean);
  const entries = baker.list().filter((e) => !only || only.includes(e.id));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = baker.opts.size;
  const c2d = canvas.getContext('2d')!;
  let i = 0;
  const step = () => {
    const e = entries[i++];
    if (!e) return;
    const t0 = performance.now();
    const rgba = baker.render(e.kind, e.id);
    c2d.putImageData(new ImageData(rgba, baker.opts.size, baker.opts.size), 0, 0);
    const url = canvas.toDataURL('image/png');
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.innerHTML = `<div class="pair"><img class="light" src="${url}"><img class="dark" src="${url}"></div><label>${e.id} <small>${(performance.now() - t0).toFixed(0)} ms</small></label>`;
    grid.appendChild(tile);
    requestAnimationFrame(step);
  };
  step();
}

boot();
