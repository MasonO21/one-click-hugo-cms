/**
 * ThemeFx — the ambient particles of the equipped colony theme (CosmeticDef.fx): drifting blossom
 * petals, quiet snowfall, tumbling autumn leaves, lazy fireflies (warm gold for Golden Hour, teal and
 * violet for the Bioluminescent Night, magenta and cyan motes for Neon Night), twinkling starlight,
 * warm dusk embers, and for the aurora theme a soft green-violet ribbon in the sky plus a few motes.
 *
 * Cost: ONE THREE.Points draw (a few hundred points, fewer on lower quality; see THEME_FX_COUNT)
 * and, for the aurora only, one ribbon mesh. Every particle's motion is computed in the vertex
 * shader from a per-point random seed and the clock, wrapped into a box that tiles world space
 * around the camera focus, so the CPU only writes a handful of uniforms per frame (no buffers, no
 * allocation) and the particles stay put in the world while the camera moves. With no theme
 * equipped (or a theme without fx) nothing is drawn at all.
 */
import * as THREE from 'three';
import type { RenderContext, Quality } from '../core/context';
import type { ThemeFx as FxKind } from '../../data/schema';

/** Points drawn per quality level (the buffer holds the high count; lower levels draw a prefix). */
export const THEME_FX_COUNT: Record<Quality, number> = { low: 90, medium: 200, high: 320 };

/** Half extents (x, height, z) of the world-tiling box the particles live in, around the focus. */
const BOX = new THREE.Vector3(24, 6, 24);

/** Per-fx look: palette, motion and sprite. */
interface FxStyle {
  /** 0 petal · 1 snow · 2 leaf · 3 firefly · 4 star · 5 ember · 6 mote */
  shape: number;
  colA: string;
  colB: string;
  /** World units per second (positive falls, negative rises). */
  fall: number;
  /** Side-to-side wobble amplitude (units) and a steady wind drift (units/s, x and z). */
  sway: number;
  drift: number;
  /** Sprite size in world units. */
  size: number;
  additive: boolean;
  /** How much brighter / more opaque the sprite gets at night (fireflies, stars). */
  nightBoost: number;
}

export const FX_STYLES: Record<FxKind, FxStyle> = {
  petals: { shape: 0, colA: '#f2c8cf', colB: '#d4909e', fall: 0.75, sway: 0.9, drift: 0.45, size: 0.3, additive: false, nightBoost: 0 },
  snow: { shape: 1, colA: '#ffffff', colB: '#dcebf6', fall: 1.0, sway: 0.5, drift: 0.2, size: 0.24, additive: false, nightBoost: 0 },
  leaves: { shape: 2, colA: '#d8903e', colB: '#a8442c', fall: 0.95, sway: 1.2, drift: 0.7, size: 0.36, additive: false, nightBoost: 0 },
  fireflies: { shape: 3, colA: '#ffe7a0', colB: '#d8f08a', fall: -0.05, sway: 1.1, drift: 0, size: 0.32, additive: true, nightBoost: 1 },
  stars: { shape: 4, colA: '#fff2cc', colB: '#c8bce8', fall: 0.3, sway: 0.3, drift: 0, size: 0.4, additive: true, nightBoost: 0.8 },
  embers: { shape: 5, colA: '#ffbe6a', colB: '#e8763a', fall: -0.55, sway: 0.7, drift: 0.25, size: 0.18, additive: true, nightBoost: 0.6 },
  aurora: { shape: 6, colA: '#7be0c8', colB: '#b49aff', fall: -0.12, sway: 0.8, drift: 0, size: 0.3, additive: true, nightBoost: 0.8 },
};

/**
 * Per-theme particle colours where a theme shares an fx kind with another but should not look alike
 * (sprite A / B, lerped per point). Themes not listed use their fx style's own colours.
 */
export const THEME_FX_COLORS: Record<string, readonly [string, string]> = {
  theme_golden_hour: ['#ffd27a', '#ffb05a'],
  theme_biolume: ['#6af0d8', '#b08cff'],
  theme_neon_night: ['#ff6ad0', '#5ad8ff'],
  theme_starfall: ['#fff0c0', '#d8ccff'],
  theme_titanium_dawn: ['#e8f4ff', '#7fe6f0'],
};

const PT_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime; uniform vec3 uFocus; uniform vec3 uBox; uniform float uFall; uniform float uSway;
  uniform float uDrift; uniform float uSize; uniform float uScale; uniform float uShape; uniform float uMaxPx;
  varying vec4 vSeed;
  varying float vRot;
  varying float vFade;
  void main() {
    vSeed = aSeed;
    float t = uTime * (0.7 + 0.6 * aSeed.w);
    // world-tiling: seeded position + motion, wrapped into the box around the focus
    vec3 p = (aSeed.xyz * 2.0 - 1.0) * uBox;
    p.y = aSeed.y * uBox.y * 2.0;
    p.x += uDrift * uTime + sin(t * 0.9 + aSeed.w * 6.28) * uSway;
    p.z += uDrift * 0.6 * uTime + cos(t * 0.7 + aSeed.x * 6.28) * uSway;
    p.y = mod(p.y - uFall * uTime * (0.7 + 0.6 * aSeed.z), uBox.y * 2.0);
    if (uShape > 2.5 && uShape < 3.5) p.y = 0.4 + aSeed.y * 2.6 + sin(t * 1.3 + aSeed.x * 9.0) * 0.5; // fireflies hover low
    vec3 w = vec3(uFocus.x + mod(p.x - uFocus.x + uBox.x, uBox.x * 2.0) - uBox.x, uFocus.y + p.y - 1.0, uFocus.z + mod(p.z - uFocus.z + uBox.z, uBox.z * 2.0) - uBox.z);
    // fade at the edges of the box (no popping when a point wraps) and near the top / ground
    vec2 edge = abs(w.xz - uFocus.xz) / uBox.xz;
    vFade = (1.0 - smoothstep(0.75, 1.0, max(edge.x, edge.y))) * smoothstep(0.0, 0.12, p.y / (uBox.y * 2.0)) * (1.0 - smoothstep(0.82, 1.0, p.y / (uBox.y * 2.0)));
    vRot = t * (0.6 + aSeed.x) + aSeed.z * 6.28;
    vec4 mv = viewMatrix * vec4(w, 1.0);
    gl_Position = projectionMatrix * mv;
    // points that drift right up to the lens fade out instead of filling the screen; the size is capped (fill rate)
    vFade *= smoothstep(6.0, 12.0, -mv.z);
    gl_PointSize = min(uMaxPx, uSize * (0.7 + 0.6 * aSeed.z) * uScale / max(1.0, -mv.z));
  }
`;

const PT_FRAG = /* glsl */ `
  uniform vec3 uColA; uniform vec3 uColB; uniform float uShape; uniform float uTime; uniform float uGlow; uniform float uOpacity;
  varying vec4 vSeed;
  varying float vRot;
  varying float vFade;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    float a = 0.0;
    vec3 col = mix(uColA, uColB, vSeed.w);
    if (uShape < 0.5) {
      // petal: a soft rounded teardrop that tumbles
      vec2 e = r * vec2(2.0, 1.25);
      a = 1.0 - smoothstep(0.32, 0.46, length(e + vec2(0.0, 0.08 * sign(e.y))));
      col *= 0.9 + 0.2 * (0.5 - r.y);
    } else if (uShape < 1.5) {
      a = 1.0 - smoothstep(0.18, 0.48, length(q)); // soft snowflake
    } else if (uShape < 2.5) {
      vec2 e = r * vec2(2.2, 1.0);
      a = 1.0 - smoothstep(0.34, 0.46, length(e)); // leaf with a darker midrib
      col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.04, abs(r.x)));
    } else if (uShape < 3.5) {
      float d = length(q);
      a = (1.0 - smoothstep(0.0, 0.5, d)) * (0.55 + 0.45 * sin(uTime * 2.4 + vSeed.x * 40.0));
      a += (1.0 - smoothstep(0.0, 0.12, d)) * 0.6; // firefly core
    } else if (uShape < 4.5) {
      float d = length(q);
      float rays = max(1.0 - abs(r.x) * 9.0, 0.0) * max(1.0 - abs(r.y) * 2.2, 0.0) + max(1.0 - abs(r.y) * 9.0, 0.0) * max(1.0 - abs(r.x) * 2.2, 0.0);
      a = (rays + (1.0 - smoothstep(0.0, 0.2, d))) * (0.45 + 0.55 * sin(uTime * 3.0 + vSeed.y * 50.0) * sin(uTime * 1.7 + vSeed.x * 20.0));
    } else {
      float d = length(q);
      a = (1.0 - smoothstep(0.05, 0.5, d)) * (0.7 + 0.3 * sin(uTime * 5.0 + vSeed.x * 30.0)); // ember / mote
    }
    a = clamp(a, 0.0, 1.0) * vFade * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * uGlow, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const AURORA_VERT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y += sin(uv.x * 7.0 + uTime * 0.35) * 2.2 + sin(uv.x * 17.0 - uTime * 0.5) * 0.8;
    p.z += sin(uv.x * 5.0 + uTime * 0.25) * 4.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const AURORA_FRAG = /* glsl */ `
  uniform float uTime; uniform float uStrength; uniform vec3 uColA; uniform vec3 uColB;
  varying vec2 vUv;
  void main() {
    float curtain = 0.55 + 0.45 * sin(vUv.x * 46.0 + sin(vUv.x * 9.0 + uTime * 0.6) * 3.0 + uTime * 0.4);
    float v = vUv.y;
    float body = smoothstep(0.0, 0.25, v) * (1.0 - smoothstep(0.35, 1.0, v));
    float ends = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
    vec3 col = mix(uColA, uColB, smoothstep(0.25, 0.9, v));
    float a = body * ends * curtain * uStrength;
    gl_FragColor = vec4(col * a, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class ThemeFx {
  private readonly points: THREE.Points;
  private readonly mat: THREE.ShaderMaterial;
  private readonly aurora: THREE.Mesh;
  private readonly auroraMat: THREE.ShaderMaterial;
  private fx: FxKind | null = null;
  private themeId = '';
  private style: FxStyle | null = null;
  /** Fade in/out when a theme is (un)equipped. */
  private level = 0;

  constructor(private readonly ctx: RenderContext) {
    const n = THEME_FX_COUNT.high;
    const seeds = new Float32Array(n * 4);
    let s = 0x2f6b;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < n * 4; i++) seeds[i] = rnd();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFocus: { value: new THREE.Vector3() },
        uBox: { value: BOX.clone() },
        uFall: { value: 1 },
        uSway: { value: 1 },
        uDrift: { value: 0 },
        uSize: { value: 0.3 },
        uScale: { value: 800 },
        uMaxPx: { value: 64 },
        uShape: { value: 0 },
        uColA: { value: new THREE.Color() },
        uColB: { value: new THREE.Color() },
        uGlow: { value: 1 },
        uOpacity: { value: 0 },
      },
      vertexShader: PT_VERT,
      fragmentShader: PT_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; // positions come from the shader
    this.points.renderOrder = 8;
    this.points.visible = false;
    ctx.scene.add(this.points);

    this.auroraMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0 }, uColA: { value: new THREE.Color('#5ff0b0') }, uColB: { value: new THREE.Color('#a07bff') } },
      vertexShader: AURORA_VERT,
      fragmentShader: AURORA_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.aurora = new THREE.Mesh(new THREE.PlaneGeometry(150, 26, 48, 1), this.auroraMat);
    this.aurora.frustumCulled = false;
    this.aurora.renderOrder = -15;
    this.aurora.visible = false;
    ctx.scene.add(this.aurora);
  }

  /** The fx currently drawn (null = none). */
  get current(): FxKind | null {
    return this.level > 0 ? this.fx : null;
  }

  /** Points drawn this frame (dev stats / tests). */
  get count(): number {
    return this.points.visible ? this.points.geometry.drawRange.count : 0;
  }

  private readTheme(): void {
    const game = this.ctx.game;
    const id = game.state.liveops?.cosmetics?.equipped?.base_theme ?? '';
    if (id === this.themeId) return;
    this.themeId = id;
    const def = id ? game.data.cosmetic(id) : undefined;
    const fx = def?.kind === 'base_theme' ? def.fx ?? null : null;
    // a different theme with the same fx kind keeps the fade level but takes its own colours
    if (fx !== this.fx) this.level = 0;
    this.fx = fx;
    this.style = fx ? FX_STYLES[fx] ?? null : null;
    const st = this.style;
    if (!st) return;
    const u = this.mat.uniforms;
    const cols = THEME_FX_COLORS[id];
    u.uShape.value = st.shape;
    (u.uColA.value as THREE.Color).set(cols?.[0] ?? st.colA);
    (u.uColB.value as THREE.Color).set(cols?.[1] ?? st.colB);
    u.uFall.value = st.fall;
    u.uSway.value = st.sway;
    u.uDrift.value = st.drift;
    u.uSize.value = st.size;
    this.mat.blending = st.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.mat.needsUpdate = true;
    if (fx === 'aurora' && def) {
      (this.auroraMat.uniforms.uColA.value as THREE.Color).set(def.color);
      (this.auroraMat.uniforms.uColB.value as THREE.Color).set(def.accent ?? def.color);
    }
  }

  /** Advance one frame; `bufferHeight` is the drawing buffer height in device pixels (point sizes). */
  update(dt: number, bufferHeight: number): void {
    this.readTheme();
    const st = this.style;
    const env = this.ctx.env;
    if (!st) {
      this.points.visible = false;
      this.aurora.visible = false;
      return;
    }
    this.level = Math.min(1, this.level + dt * 0.8);
    const u = this.mat.uniforms;
    u.uTime.value = env.t;
    (u.uFocus.value as THREE.Vector3).set(env.cx, this.ctx.heightAt(env.cx, env.cz), env.cz);
    // point size in pixels per world unit at distance 1: viewport height / (2 tan(fov / 2))
    const cam = this.ctx.camera;
    u.uScale.value = Math.max(1, bufferHeight) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    u.uMaxPx.value = Math.max(8, bufferHeight * 0.03);
    const night = env.night;
    u.uGlow.value = 1 + st.nightBoost * night * 0.6;
    u.uOpacity.value = this.level * (st.additive ? 0.55 + 0.45 * night * st.nightBoost + (1 - st.nightBoost) * 0.45 : 0.95);
    this.points.geometry.setDrawRange(0, THEME_FX_COUNT[env.quality] ?? THEME_FX_COUNT.medium);
    this.points.visible = true;

    const showAurora = this.fx === 'aurora';
    this.aurora.visible = showAurora;
    if (showAurora) {
      // a ribbon hung in the sky ahead of the camera, facing it (the follow camera looks down: keep it low and near)
      const fx = env.fwdX;
      const fz = env.fwdZ;
      const y = this.ctx.heightAt(env.cx, env.cz);
      this.aurora.position.set(env.cx + fx * 62, y + 26, env.cz + fz * 62);
      this.aurora.rotation.set(0, Math.atan2(-fx, -fz), 0);
      this.auroraMat.uniforms.uTime.value = env.t;
      this.auroraMat.uniforms.uStrength.value = this.level * (0.28 + 0.6 * night);
    }
  }

  dispose(): void {
    this.ctx.scene.remove(this.points);
    this.ctx.scene.remove(this.aurora);
    this.points.geometry.dispose();
    this.mat.dispose();
    this.aurora.geometry.dispose();
    this.auroraMat.dispose();
  }
}
