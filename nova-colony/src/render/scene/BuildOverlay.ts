/**
 * BuildOverlay — build-mode grid (terrain-following patch over the colony radius with a glowing
 * boundary ring), the ghost preview of the building being placed (green/red by validity, one ghost
 * per preview cell for drag-to-build lines), footprint cell highlights and the selection ring.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { Batch, composeYaw } from '../core/Batch';
import { buildModel, retainModel, releaseModel, type ModelSpec } from '../models/spec';
import { pieceGeometry, pieceFullKey } from '../models/pieces';
import { acrossOnly, lineAlong, snapsToEdge, wallEdgeShift } from '../models/wallSnap';
import { tierStyle } from '../core/palette';
import { CELL, cellCenter, cellMin, CENTER_CELL, footprintCenter, WORLD_CELLS } from '../../core/constants';
import { clamp } from '../../core/math';

const GRID_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const GRID_FRAG = /* glsl */ `
  uniform float uRadius; uniform vec2 uCenter; uniform vec3 uColor; uniform vec3 uRing; uniform float uTime; uniform float uCell;
  varying vec3 vWorld;
  void main() {
    vec2 g = (vWorld.xz + vec2(uCell * 0.5)) / uCell;
    vec2 f = abs(fract(g) - 0.5);
    vec2 fw = fwidth(g) * 1.2;
    vec2 l = smoothstep(0.5 - fw - 0.03, 0.5 - fw * 0.2, f);
    float line = max(l.x, l.y);
    float dist = length(vWorld.xz - uCenter);
    float fade = 1.0 - smoothstep(uRadius - 6.0, uRadius, dist);
    float ring = 1.0 - smoothstep(0.0, 0.5, abs(dist - uRadius));
    float pulse = 0.75 + 0.25 * sin(uTime * 2.0 - dist * 0.3);
    vec3 c = uColor * line * fade * 0.45 + uRing * ring * pulse * 1.4;
    float a = clamp(line * fade * 0.22 + ring * 0.9, 0.0, 1.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const _m = new THREE.Matrix4();
/** Pieces that join into lines: walls, fences and the openings set in them. */
const LINE_PIECES = new Set(['wall', 'fence', 'door', 'window', 'gate', 'pillar']);

export interface SelectionInfo {
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export class BuildOverlay {
  private group = new THREE.Group();
  private gridMat: THREE.ShaderMaterial;
  private grid: THREE.Mesh | null = null;
  private gridRadius = -1;
  private gridTerrain = -1;
  private ghostOk: Batch;
  private ghostBad: Batch;
  /** Faint see-through copies drawn without depth test so a ghost behind a tree/boulder stays visible. */
  private xrayOk: Batch;
  private xrayBad: Batch;
  private xrayMats: THREE.Material[];
  private cellsOk: Batch;
  private cellsBad: Batch;
  private ghostKey = '';
  /** The model the ghost shows (held in the model cache while shown); null for pieces and out of build mode. */
  private ghostSpec: ModelSpec | null = null;
  private readonly empty: THREE.BufferGeometry;
  private ring: THREE.Mesh;
  private ringMat: THREE.MeshBasicMaterial;
  private selection: SelectionInfo | null = null;
  /** Ghost wall cells (snap) and a reused offset pair. */
  private readonly ghostSet = new Set<number>();
  private readonly shiftTmp = [0, 0];

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    this.gridMat = new THREE.ShaderMaterial({
      uniforms: {
        uRadius: { value: 24 },
        uCenter: { value: new THREE.Vector2(0, 0) },
        uColor: { value: new THREE.Color('#ffffff') },
        uRing: { value: new THREE.Color('#5ef2ff') },
        uTime: { value: 0 },
        uCell: { value: CELL },
      },
      vertexShader: GRID_VERT,
      fragmentShader: GRID_FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      // grid, ghosts and the selection ring are UI affordances: shown as designed, never graded by ACES
      toneMapped: false,
    });
    const quad = new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2);
    const empty = new THREE.BufferGeometry();
    this.empty = empty;
    this.ghostOk = new Batch(this.group, empty, ctx.mats.ghostOk, 16, { renderOrder: 20 });
    this.ghostBad = new Batch(this.group, empty, ctx.mats.ghostBad, 16, { renderOrder: 20 });
    const xray = (m: THREE.MeshBasicMaterial) => {
      const x = m.clone();
      x.depthTest = false;
      x.opacity = 0.22;
      return x;
    };
    this.xrayMats = [xray(ctx.mats.ghostOk), xray(ctx.mats.ghostBad)];
    this.xrayOk = new Batch(this.group, empty, this.xrayMats[0], 16, { renderOrder: 22 });
    this.xrayBad = new Batch(this.group, empty, this.xrayMats[1], 16, { renderOrder: 22 });
    this.cellsOk = new Batch(this.group, quad, ctx.mats.ghostOk, 32, { renderOrder: 19 });
    this.cellsBad = new Batch(this.group, quad, ctx.mats.ghostBad, 32, { renderOrder: 19 });
    this.ringMat = new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 40).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.renderOrder = 21;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  setSelection(info: SelectionInfo | null): void {
    this.selection = info;
  }

  /** Bind one geometry to the four ghost batches and hold its model (if any) in the cache instead of the previous one. */
  private setGhost(geo: THREE.BufferGeometry, spec: ModelSpec | null): void {
    this.ghostOk.setGeometry(geo);
    this.ghostBad.setGeometry(geo);
    this.xrayOk.setGeometry(geo);
    this.xrayBad.setGeometry(geo);
    // retain before release: the same model stays held across a tier change that keeps its key
    if (spec) retainModel(spec);
    if (this.ghostSpec) releaseModel(this.ghostSpec);
    this.ghostSpec = spec;
  }

  private rebuildGrid(radiusCells: number): void {
    if (this.grid) {
      this.group.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid = null;
    }
    const R = Math.max(2, Math.min(WORLD_CELLS / 2 - 1, radiusCells + 2));
    const n = R * 2 + 1; // vertices per side (cell corners)
    const c0 = CENTER_CELL - R;
    const pos = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = cellMin(c0 + i);
        const z = cellMin(c0 + j);
        const o = (j * n + i) * 3;
        pos[o] = x;
        pos[o + 1] = this.ctx.heightAt(x, z) + 0.07;
        pos[o + 2] = z;
      }
    }
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        idx[k++] = a; idx[k++] = a + n; idx[k++] = a + 1;
        idx[k++] = a + 1; idx[k++] = a + n; idx[k++] = a + n + 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    this.grid = new THREE.Mesh(geo, this.gridMat);
    this.grid.renderOrder = 18;
    this.grid.matrixAutoUpdate = false;
    this.group.add(this.grid);
  }

  update(): void {
    const ctx = this.ctx;
    const game = ctx.game;
    const view = game.view;
    const env = ctx.env;
    const showGrid = view.mode === 'build' || view.showGrid;
    const radiusCells = game.state.colony.radius;
    if (showGrid) {
      if (radiusCells !== this.gridRadius || env.terrainVersion !== this.gridTerrain || !this.grid) {
        this.gridRadius = radiusCells;
        this.gridTerrain = env.terrainVersion;
        this.rebuildGrid(radiusCells);
      }
      this.gridMat.uniforms.uRadius.value = radiusCells * CELL;
      this.gridMat.uniforms.uTime.value = env.t;
      (this.gridMat.uniforms.uRing.value as THREE.Color).set(tierStyle(game.data.tier(game.state.colony.tier)).accent);
    }
    if (this.grid) this.grid.visible = showGrid;

    // ghost preview
    const b = view.build;
    this.ghostOk.begin();
    this.ghostBad.begin();
    this.xrayOk.begin();
    this.xrayBad.begin();
    this.cellsOk.begin();
    this.cellsBad.begin();
    if (view.mode === 'build' && b.def) {
      const def = game.data.building(b.def);
      const tier = clamp(b.tier | 0, 0, game.data.tiers.length - 1);
      const style = tierStyle(game.data.tier(tier));
      const key = `${b.def}|${tier}`;
      if (key !== this.ghostKey) {
        this.ghostKey = key;
        if (def?.piece) this.setGhost(pieceGeometry(pieceFullKey(def.piece), style), null);
        else {
          const spec = buildModel(def?.model ?? b.def, style, 1, def);
          this.setGhost(spec.geometry, spec);
        }
      }
      const ghost = b.valid ? this.ghostOk : this.ghostBad;
      const xray = b.valid ? this.xrayOk : this.xrayBad;
      const cells = b.valid ? this.cellsOk : this.cellsBad;
      const yaw = -(b.rot | 0) * (Math.PI / 2);
      const m = _m;
      // a wall, fence or opening previews how it will stand: turned along its line and, over a floor's edge, moved
      // out to the edge (models/wallSnap)
      const piece = def?.piece;
      const lined = !!piece && piece !== 'pillar' && LINE_PIECES.has(piece);
      if (lined) this.ghostCells(b.cells.length ? b.cells : [{ x: b.x, z: b.z }]);
      if (def?.piece && b.cells.length > 1) {
        for (const c of b.cells) {
          const [ox, oz, cyaw] = lined ? this.ghostPlace(piece, c.x, c.z, b.rot) : [0, 0, yaw];
          const x = cellCenter(c.x);
          const z = cellCenter(c.z);
          composeYaw(m, x + ox, ctx.heightAt(x, z) + 0.02, z + oz, cyaw);
          ghost.push(m);
          composeYaw(m, x, ctx.heightAt(x, z) + 0.1, z, 0);
          cells.push(m);
        }
      } else {
        const size = def?.size ?? [1, 1];
        const c = footprintCenter(b.x, b.z, size, b.rot);
        const y = ctx.heightAt(c.x, c.z);
        const bob = Math.sin(env.t * 4) * 0.05 + 0.05;
        const [ox, oz, cyaw] = lined ? this.ghostPlace(piece, b.x, b.z, b.rot) : [0, 0, yaw];
        composeYaw(m, c.x + ox, y + bob, c.z + oz, cyaw);
        ghost.push(m);
        xray.push(m);
        const list = b.cells.length ? b.cells : [{ x: b.x, z: b.z }];
        for (const cc of list) {
          const x = cellCenter(cc.x);
          const z = cellCenter(cc.z);
          composeYaw(m, x, ctx.heightAt(x, z) + 0.1, z, 0);
          cells.push(m);
        }
      }
    } else if (this.ghostKey) {
      // out of build mode: unbind the model so the cache may prune it (a bound geometry would be re-uploaded)
      this.ghostKey = '';
      this.setGhost(this.empty, null);
    }
    this.ghostOk.end();
    this.ghostBad.end();
    this.xrayOk.end();
    this.xrayBad.end();
    this.cellsOk.end();
    this.cellsBad.end();

    // selection ring
    const s = this.selection;
    if (s) {
      const pulse = 1 + Math.sin(env.t * 4) * 0.06;
      this.ring.position.set(s.x, s.y + 0.12, s.z);
      this.ring.scale.setScalar(Math.max(0.8, s.radius) * pulse);
      this.ring.visible = true;
      this.ringMat.opacity = 0.7 + Math.sin(env.t * 4) * 0.2;
    } else this.ring.visible = false;
  }

  /** The cells of the wall line being placed (they count as walls for each other's snap). */
  private ghostCells(cells: { x: number; z: number }[]): void {
    this.ghostSet.clear();
    for (const c of cells) this.ghostSet.add(c.z * WORLD_CELLS + c.x);
  }

  /**
   * How a ghost wall, fence or opening on (cx, cz) stands, as (x offset, z offset, yaw), like the placed piece
   * (actors/Buildings): turned along the line its neighbours form (a lone wall or fence keeps the player's rotation),
   * and on the floor's edge when it is over one.
   */
  private ghostPlace(piece: string, cx: number, cz: number, rot: number): [number, number, number] {
    const B = this.ctx.game.sys.buildings;
    const data = this.ctx.game.data;
    const kindAt = (dx: number, dz: number): string | undefined => {
      const x = cx + dx;
      const z = cz + dz;
      if (this.ghostSet.has(z * WORLD_CELLS + x)) return piece;
      const o = B.objectAt(x, z);
      return o ? data.building(o.def)?.piece : undefined;
    };
    const joins = (dx: number, dz: number): boolean => {
      const k = kindAt(dx, dz);
      return !!k && LINE_PIECES.has(k);
    };
    const opening = piece !== 'wall' && piece !== 'fence';
    const lone = !joins(1, 0) && !joins(-1, 0) && !joins(0, 1) && !joins(0, -1);
    // a lone wall or fence panel keeps the build rotation, as the placed one does; the rest turn like the placed piece
    const yaw = !opening && lone ? -(rot | 0) * (Math.PI / 2) : lineAlong(joins, rot);
    if (!snapsToEdge(piece, kindAt)) return [0, 0, yaw];
    const builtUp = (dx: number, dz: number): boolean => {
      if (B.floorAt(cx + dx, cz + dz)) return true;
      const k = kindAt(dx, dz);
      return !!k && k !== 'fence' && LINE_PIECES.has(k);
    };
    const [ox, oz] = acrossOnly(wallEdgeShift(!!B.floorAt(cx, cz), builtUp, this.shiftTmp), yaw);
    return [ox, oz, yaw];
  }

  dispose(): void {
    this.gridMat.dispose();
    this.grid?.geometry.dispose();
    if (this.ghostSpec) releaseModel(this.ghostSpec);
    this.ghostSpec = null;
    this.empty.dispose();
    this.ghostOk.dispose();
    this.ghostBad.dispose();
    this.xrayOk.dispose();
    this.xrayBad.dispose();
    for (const m of this.xrayMats) m.dispose();
    this.cellsOk.dispose();
    this.cellsBad.dispose();
    this.ring.geometry.dispose();
    this.ringMat.dispose();
    this.ctx.scene.remove(this.group);
  }
}
