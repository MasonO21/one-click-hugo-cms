/**
 * Renderer — three.js presentation layer. Reads game.state / game.derived / game.view every frame and
 * listens to game.bus for VFX. Never mutates game.state.
 *
 * Composition: Atmosphere (sky/lights/fog) · Terrain · CameraRig · actors (Buildings, Nature, Pois,
 * Characters, Aliens, Projectiles) · Particles + Effects · BuildOverlay. Implements RendererApi for
 * the UI (picking, projection, focus, stats).
 *
 * OWNER: render agent.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { Selection } from '../core/view';
import type { RendererApi, ScreenPoint } from './api';
import { Materials } from './core/materials';
import type { Env, Quality, RenderContext } from './core/context';
import { Particles } from './fx/Particles';
import { Effects } from './fx/Effects';
import { Atmosphere } from './scene/Atmosphere';
import { Terrain } from './scene/Terrain';
import { CameraRig } from './scene/CameraRig';
import { BuildOverlay, type SelectionInfo } from './scene/BuildOverlay';
import { Buildings } from './actors/Buildings';
import { Nature } from './actors/Nature';
import { Pois } from './actors/Pois';
import { Characters } from './actors/Characters';
import { Aliens } from './actors/Aliens';
import { Projectiles } from './actors/Projectiles';
import { WishBubbles } from './actors/WishBubbles';
import './models'; // registers all procedural building models
import type { WorldGen } from '../sim/world';

const _ndc = new THREE.Vector2();
const _v3 = new THREE.Vector3();
const _ray = new THREE.Raycaster();

export class Renderer implements RendererApi {
  private renderer!: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1800);
  private readonly mats = new Materials();
  private ctx!: RenderContext;
  private env: Env = { t: 0, dt: 0, night: 0, sunElev: 1, quality: 'medium', cx: 0, cz: 0, viewRadius: 120, camX: 0, camY: 30, camZ: 30, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
  private atmosphere!: Atmosphere;
  private terrain!: Terrain;
  private rig!: CameraRig;
  private overlay!: BuildOverlay;
  private particles!: Particles;
  private effects!: Effects;
  private buildings!: Buildings;
  private nature!: Nature;
  private pois!: Pois;
  private characters!: Characters;
  private aliens!: Aliens;
  private projectiles!: Projectiles;
  private wishBubbles!: WishBubbles;
  private container!: HTMLElement;
  private width = 1;
  private height = 1;
  private fps = 60;
  private quality: Quality = 'medium';
  private contextLost = false;
  private frame = 0;
  /** Time of frames skipped behind an open panel, still owed to the animations. */
  private heldDt = 0;
  private lastGen: WorldGen | undefined | null = null;
  private lastBiome = '';
  private ready = false;
  private onResize = () => this.resize();

  constructor(private readonly game: Game) {}

  /**
   * Create the WebGL renderer and build the scene at `settings.quality`.
   * `onContext` runs once the WebGL context exists and before anything is built: the boot-time auto-quality check
   * (platform/autoQuality.ts, wired in main.ts) reads the GPU name there and may set the level first. Its errors are
   * logged, never fatal.
   */
  init(container: HTMLElement, onContext?: (gl: WebGLRenderingContext | WebGL2RenderingContext) => void): void {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    // ACES: deeper shadows and richer mid-tones than Neutral for the toy look (the palette and the
    // Atmosphere keys are tuned against it); the thumbnail baker keeps its own flatter rig
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor('#1b2a3a', 1);
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      console.warn('[render] WebGL context lost');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      console.warn('[render] WebGL context restored');
    });
    container.appendChild(canvas);
    if (onContext) {
      try {
        onContext(this.renderer.getContext());
      } catch (e) {
        console.warn('[render] onContext failed', e);
      }
    }

    this.quality = this.game.state.settings.quality;
    this.env.quality = this.quality;
    this.particles = new Particles(this.scene, this.mats, this.quality);
    const base = { game: this.game, scene: this.scene, camera: this.camera, mats: this.mats, env: this.env, particles: this.particles };
    // the terrain provides the height sampler; everything else reads it through the context
    this.ctx = { ...base, heightAt: () => 0 };
    this.terrain = new Terrain(this.ctx);
    this.ctx.heightAt = this.terrain.heightAt;
    this.atmosphere = new Atmosphere(this.ctx);
    this.rig = new CameraRig(this.ctx);
    this.buildings = new Buildings(this.ctx);
    this.nature = new Nature(this.ctx);
    this.pois = new Pois(this.ctx);
    this.characters = new Characters(this.ctx);
    this.aliens = new Aliens(this.ctx);
    this.projectiles = new Projectiles(this.ctx);
    this.wishBubbles = new WishBubbles(this.ctx);
    this.overlay = new BuildOverlay(this.ctx);
    this.effects = new Effects(this.ctx, this.rig);
    this.applyQuality(this.quality, true);
    this.terrain.setGen(this.game.sys.world.gen);
    this.lastGen = this.game.sys.world.gen ?? null;
    this.resize();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    this.ready = true;
  }

  private applyQuality(q: Quality, force = false): void {
    if (!force && q === this.quality) return;
    this.quality = q;
    this.env.quality = q;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const ratio = q === 'low' ? 1 : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = q === 'high';
    this.atmosphere.applyQuality(q);
    this.particles.setQuality(q);
    // materials must recompile when the shadow map toggles
    this.mats.invalidate();
    this.resize();
  }

  resize(): void {
    if (!this.renderer) return;
    const rect = this.container?.getBoundingClientRect?.();
    const w = Math.max(1, Math.floor(rect && rect.width > 0 ? rect.width : window.innerWidth));
    const h = Math.max(1, Math.floor(rect && rect.height > 0 ? rect.height : window.innerHeight));
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    if (!this.ready || this.contextLost) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    const env = this.env;
    env.t += dt;
    env.dt = dt;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.frame++;
    const game = this.game;
    const st = game.state;

    const q = st.settings.quality;
    if (q !== this.quality) this.applyQuality(q);

    // world generation may appear/replace after boot (world system onLoad / fast reload)
    const gen = game.sys.world.gen ?? null;
    if (gen !== this.lastGen) {
      this.lastGen = gen;
      this.terrain.setGen(gen);
      env.terrainVersion++;
    }

    // panels open: halve the frame rate; the skipped frame's time is carried into the next drawn one so particles,
    // characters and buildings behind the sheet keep their real speed instead of moving at half speed
    if (game.view.panelOpen && this.frame % 2 === 1) {
      this.heldDt += dt;
      return;
    }
    if (this.heldDt > 0) {
      dt = Math.min(dt + this.heldDt, 0.2);
      env.dt = dt;
      this.heldDt = 0;
    }

    this.rig.update(dt);
    const region = this.terrain.regionAt(st.player.x, st.player.z);
    if (region !== this.lastBiome) {
      this.lastBiome = region;
      this.atmosphere.setBiomeTint(game.data.biome(region)?.tint);
    }
    this.atmosphere.update(st.time.dayTime, this.rig.distance);
    this.terrain.update();
    this.buildings.update(dt);
    this.nature.update(dt);
    this.pois.update(dt);
    this.characters.update(dt);
    this.wishBubbles.update(dt);
    this.aliens.update(dt);
    this.projectiles.update(dt);
    this.particles.update(dt);
    this.overlay.setSelection(this.selectionInfo(game.view.selection));
    this.overlay.update();

    this.renderer.render(this.scene, this.camera);
  }

  private selectionInfo(sel: Selection): SelectionInfo | null {
    if (!sel || sel.kind == null || sel.id == null) return null;
    switch (sel.kind) {
      case 'building': return this.buildings.centerOf(sel.id as number);
      case 'colonist': return this.characters.colonistInfo(sel.id as number);
      case 'node': return this.nature.nodeInfo(sel.id as number);
      case 'poi': return this.pois.poiInfo(String(sel.id));
      case 'alien': return this.aliens.alienInfo(sel.id as number);
      case 'event': return this.pois.eventInfo(sel.id as number);
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------ RendererApi

  private setRay(sx: number, sy: number): void {
    _ndc.set((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    _ray.setFromCamera(_ndc, this.camera);
  }

  pickGround(sx: number, sy: number): { x: number; z: number } | null {
    if (!this.ready) return null;
    this.setRay(sx, sy);
    const o = _ray.ray.origin;
    const d = _ray.ray.direction;
    // iterate: intersect the plane at the terrain height under the previous estimate
    let y = this.ctx.heightAt(o.x, o.z);
    let x = o.x;
    let z = o.z;
    for (let i = 0; i < 5; i++) {
      if (Math.abs(d.y) < 1e-5) return null;
      const t = (y - o.y) / d.y;
      if (t < 0) return null;
      x = o.x + d.x * t;
      z = o.z + d.z * t;
      const ny = this.ctx.heightAt(x, z);
      if (Math.abs(ny - y) < 0.02) break;
      y = ny;
    }
    return { x, z };
  }

  pick(sx: number, sy: number): Selection | null {
    if (!this.ready) return null;
    this.setRay(sx, sy);
    const ray = _ray.ray;
    const maxT = 400;
    let best: Selection | null = null;
    let bestT = maxT;
    // characters & aliens are small: give them a priority bias
    const al = this.aliens.pick(ray, maxT);
    if (al && al.t * 0.85 < bestT) {
      bestT = al.t * 0.85;
      best = { kind: 'alien', id: al.id };
    }
    const co = this.characters.pick(ray, maxT);
    if (co && co.t * 0.85 < bestT) {
      bestT = co.t * 0.85;
      best = { kind: 'colonist', id: co.id };
    }
    // a wish bubble over a colonist's head selects that colonist
    const wb = this.wishBubbles.pick(ray, maxT);
    if (wb && wb.t * 0.8 < bestT) {
      bestT = wb.t * 0.8;
      best = { kind: 'colonist', id: wb.id };
    }
    const pe = this.pois.pick(ray, maxT);
    if (pe && pe.t * 0.95 < bestT) {
      bestT = pe.t * 0.95;
      best = { kind: pe.kind, id: pe.id };
    }
    const bu = this.buildings.pick(ray, maxT);
    if (bu && bu.t < bestT) {
      bestT = bu.t;
      best = { kind: 'building', id: bu.id };
    }
    const no = this.nature.pick(ray, maxT);
    if (no && no.t < bestT) {
      bestT = no.t;
      best = { kind: 'node', id: no.index };
    }
    return best;
  }

  worldToScreen(x: number, y: number, z: number): ScreenPoint {
    _v3.set(x, y, z).project(this.camera);
    return {
      x: (_v3.x * 0.5 + 0.5) * this.width,
      y: (-_v3.y * 0.5 + 0.5) * this.height,
      visible: _v3.z < 1 && _v3.z > -1 && Math.abs(_v3.x) <= 1.05 && Math.abs(_v3.y) <= 1.05,
    };
  }

  cameraYaw(): number {
    return this.game.view.camera.yaw;
  }

  focus(x: number, z: number): void {
    this.rig?.focus(x, z);
  }

  stats(): { fps: number; drawCalls: number; triangles: number } {
    const info = this.renderer?.info.render;
    return { fps: Math.round(this.fps), drawCalls: info?.calls ?? 0, triangles: info?.triangles ?? 0 };
  }

  // ------------------------------------------------------------------------------ extras

  /** Terrain height sampler (UI may want it for marker placement). */
  heightAt(x: number, z: number): number {
    return this.ctx ? this.ctx.heightAt(x, z) : 0;
  }

  /** Tilt the camera flatter (negative) or steeper (positive), in radians. Cinematic views / dev. */
  setPitchBias(rad: number): void {
    if (this.rig) this.rig.pitchBias = rad;
  }

  /** Night factor 0..1 (UI theming). */
  nightFactor(): number {
    return this.env.night;
  }

  /** Underlying three.js objects for tooling / the dev showcase. */
  get three(): { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
    return { renderer: this.renderer, scene: this.scene, camera: this.camera };
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.effects?.dispose();
    this.overlay?.dispose();
    this.projectiles?.dispose();
    this.wishBubbles?.dispose();
    this.aliens?.dispose();
    this.characters?.dispose();
    this.pois?.dispose();
    this.nature?.dispose();
    this.buildings?.dispose();
    this.terrain?.dispose();
    this.atmosphere?.dispose();
    this.particles?.dispose();
    this.mats.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.ready = false;
  }
}
