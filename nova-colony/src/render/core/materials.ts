/**
 * Shared materials. All procedural geometry uses ONE slot-aware Lambert material: the `aSlot`
 * vertex attribute selects lit (0), emissive glow (1) or window glass (2) per vertex, so any model
 * is a single draw call and day/night only touches two uniforms.
 *
 * Dither variants are the same shader plus a 4x4 Bayer screen-door `discard` driven by a per-fragment
 * window `vFade = (lo, hi)`: a fragment survives when lo <= bayer < hi. Opaque, sort-free and
 * instancing friendly. A `discard` costs early-Z on tile GPUs, so the shared material stays free of
 * it and only the few fading batches use a variant:
 *  - `litFade`  window (aFade, 1): per-instance fade 0 solid .. 1 gone (buildings that stand between
 *               the camera and the player, see Batch `fade`);
 *  - `lodNear`  window (t, 1): near nature geometry fades out over the LOD band below the near
 *               radius (t = 0 inside the band .. 1 at the near radius), computed per instance in the
 *               vertex shader from the live focus / radii uniforms (`setLod`);
 *  - `lodFar`   window (t2, t): the far geometry of the same instance fades in over that band —
 *               exactly complementary to `lodNear`, so every pixel is covered by one of the two and
 *               nothing pops — and out again over the band below the mid cutoff (t2).
 * Every variant has a MeshDepthMaterial twin for the shadow pass (`*Depth`, attach through Batch
 * `depthMaterial`) applying the same window in shadow-map space, so shadows fade with their caster
 * and the near/far shadow stipples stay complementary. The shadow window is pushed a little harder
 * (`SHADOW_FADE_GAIN`), so a shadow is completely gone before its building reaches the faint ghost
 * stipple it keeps (Buildings FADE_MAX) — no sparse crawling stipple shadow under an invisible wall.
 */
import * as THREE from 'three';

const DAY_GLASS = new THREE.Color('#9fd8ff');
const NIGHT_GLASS = new THREE.Color('#ffcf7a');

/** How a dither variant obtains its (lo, hi) window. */
export type DitherMode = 'attr' | 'uniform' | 'lodNear' | 'lodFar';

/** Shadow windows are scaled by this: a caster's shadow vanishes at fade 0.8 instead of 1. */
export const SHADOW_FADE_GAIN = 1.25;

const BAYER_FRAG_PARS = /* glsl */ `
varying vec2 vFade;
const int NOVA_BAYER[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
float novaBayer(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  return (float(NOVA_BAYER[ip.x + ip.y * 4]) + 0.5) / 16.0;
}
`;

/** Per-instance distance to the focus -> LOD band parameter (vertex shader, instance origin). */
const LOD_VERT = /* glsl */ `
#ifdef USE_INSTANCING
vec2 novaIp = (modelMatrix * instanceMatrix[3]).xz;
#else
vec2 novaIp = modelMatrix[3].xz;
#endif
float novaD = distance(novaIp, uLodFocus);
float novaT = clamp((novaD - uLod.x) * uLod.y, 0.0, 1.0);
`;

function ditherVertexPars(mode: DitherMode): string {
  switch (mode) {
    case 'attr': return '\nattribute float aFade;\nvarying vec2 vFade;';
    case 'uniform': return '\nuniform float uFade;\nvarying vec2 vFade;';
    default: return '\nuniform vec2 uLodFocus;\nuniform vec4 uLod;\nvarying vec2 vFade;';
  }
}

function ditherVertexMain(mode: DitherMode): string {
  switch (mode) {
    case 'attr': return '\nvFade = vec2(aFade, 1.0);';
    case 'uniform': return '\nvFade = vec2(uFade, 1.0);';
    case 'lodNear': return LOD_VERT + 'vFade = vec2(novaT, 1.0);';
    case 'lodFar': return LOD_VERT + 'vFade = vec2(clamp((novaD - uLod.z) * uLod.w, 0.0, 1.0), novaT);';
  }
}

function ditherFragmentMain(shadow: boolean): string {
  return shadow
    ? `\n{ float novaB = novaBayer(gl_FragCoord.xy); vec2 novaF = min(vFade * ${SHADOW_FADE_GAIN.toFixed(3)}, 1.0); if (novaB < novaF.x || novaB >= novaF.y) discard; }`
    : '\n{ float novaB = novaBayer(gl_FragCoord.xy); if (novaB < vFade.x || novaB >= vFade.y) discard; }';
}

export class Materials {
  /** Shared shader uniforms (glow brightness, glass color). */
  private readonly uGlow = { value: 1 };
  private readonly uGlass = { value: DAY_GLASS.clone() };
  /** LOD band uniforms: focus (x, z) and (near - band, 1 / band, mid - band, 1 / band). */
  private readonly uLodFocus = { value: new THREE.Vector2() };
  private readonly uLod = { value: new THREE.Vector4(1e9, 1, 1e9, 1) };
  /** Opaque, lit, vertex-colored, slot-aware. */
  readonly lit: THREE.MeshLambertMaterial;
  /** Alias kept for callers that think in "material sets" — it is the same single material. */
  readonly set: THREE.Material;
  /** `lit` + per-instance dither fade (buildings that occlude the player). */
  readonly litFade: THREE.MeshLambertMaterial;
  /** Shadow-pass twin of `litFade`. */
  readonly litFadeDepth: THREE.MeshDepthMaterial;
  /** `lit` for near nature geometry inside the LOD band (fades out toward the near radius). */
  readonly lodNear: THREE.MeshLambertMaterial;
  readonly lodNearDepth: THREE.MeshDepthMaterial;
  /** `lit` for far nature geometry (fades in over the LOD band, out below the mid cutoff). */
  readonly lodFar: THREE.MeshLambertMaterial;
  readonly lodFarDepth: THREE.MeshDepthMaterial;
  /** Build-mode ghosts. */
  readonly ghostOk = new THREE.MeshBasicMaterial({ color: '#56ff9a', transparent: true, opacity: 0.55, depthWrite: false });
  readonly ghostBad = new THREE.MeshBasicMaterial({ color: '#ff5c6a', transparent: true, opacity: 0.55, depthWrite: false });
  /** Soft particles (dust, smoke, chips, goo) — lit, tinted per instance. */
  readonly particleSoft = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  /** Sparks / fire / magic — additive, unlit. */
  readonly particleGlow = new THREE.MeshBasicMaterial({ color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  /** Translucent domes / shields. */
  readonly shield = new THREE.MeshBasicMaterial({ color: '#58d0ff', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  private readonly all: THREE.Material[] = [];

  constructor() {
    this.lit = this.makeLit();
    this.set = this.lit;
    this.litFade = this.makeLit({}, 'attr');
    this.litFadeDepth = this.makeDepth('attr');
    this.lodNear = this.makeLit({}, 'lodNear');
    this.lodNearDepth = this.makeDepth('lodNear');
    this.lodFar = this.makeLit({}, 'lodFar');
    this.lodFarDepth = this.makeDepth('lodFar');
  }

  /** Track a material for invalidate()/dispose(); forgets it when the owner disposes it. */
  private track<T extends THREE.Material>(mat: T): T {
    this.all.push(mat);
    mat.addEventListener('dispose', () => {
      const i = this.all.indexOf(mat);
      if (i >= 0) this.all.splice(i, 1);
    });
    return mat;
  }

  private ditherUniforms(shader: { uniforms: Record<string, THREE.IUniform> }, mode: DitherMode, uFade?: THREE.IUniform<number>): void {
    if (mode === 'lodNear' || mode === 'lodFar') {
      shader.uniforms.uLodFocus = this.uLodFocus;
      shader.uniforms.uLod = this.uLod;
    } else if (mode === 'uniform' && uFade) shader.uniforms.uFade = uFade;
  }

  /**
   * Create a slot-aware Lambert material (the shared material, per-room roofs, dither variants).
   * `dither` adds the screen-door discard; 'uniform' reads the fade from `uFade`.
   */
  makeLit(opts: THREE.MeshLambertMaterialParameters = {}, dither: DitherMode | null = null, uFade?: THREE.IUniform<number>): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
    const uGlow = this.uGlow;
    const uGlass = this.uGlass;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = uGlow;
      shader.uniforms.uGlass = uGlass;
      if (dither) this.ditherUniforms(shader, dither, uFade);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSlot;\nvarying float vSlot;' + (dither ? ditherVertexPars(dither) : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = aSlot;' + (dither ? ditherVertexMain(dither) : ''));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSlot;\nuniform float uGlow;\nuniform vec3 uGlass;' + (dither ? BAYER_FRAG_PARS : ''))
        .replace(
          '#include <opaque_fragment>',
          'if (vSlot > 1.5) outgoingLight = uGlass; else if (vSlot > 0.5) outgoingLight = diffuseColor.rgb * uGlow;\n#include <opaque_fragment>',
        );
      if (dither) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + ditherFragmentMain(false));
      }
    };
    mat.customProgramCacheKey = () => (dither ? 'nova-slot-lit-' + dither : 'nova-slot-lit');
    return this.track(mat);
  }

  /**
   * Shadow-pass material for a dither variant: the default depth shader plus the same window, so
   * a dithered caster throws a dithered (PCF-softened, lighter) shadow instead of a solid one. Only
   * fading batches pay for the discard; everything else keeps three's shared depth material.
   */
  makeDepth(dither: DitherMode, uFade?: THREE.IUniform<number>): THREE.MeshDepthMaterial {
    const mat = new THREE.MeshDepthMaterial();
    mat.onBeforeCompile = (shader) => {
      this.ditherUniforms(shader, dither, uFade);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>' + ditherVertexPars(dither))
        .replace('#include <begin_vertex>', '#include <begin_vertex>' + ditherVertexMain(dither));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>' + BAYER_FRAG_PARS)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + ditherFragmentMain(true));
    };
    mat.customProgramCacheKey = () => 'nova-depth-' + dither;
    return this.track(mat);
  }

  /** Per-room roof material (fades independently through opacity). */
  makeRoof(): THREE.MeshLambertMaterial {
    return this.makeLit({ transparent: true, opacity: 1 });
  }

  /** Shadow-pass material for a roof: dithers the roof's shadow away as `fade` (1 - opacity) rises. */
  makeRoofDepth(fade: THREE.IUniform<number>): THREE.MeshDepthMaterial {
    return this.makeDepth('uniform', fade);
  }

  /**
   * Live LOD band for the nature materials: `focus` is the culling center, near geometry fades out
   * over [near - band, near] while far geometry fades in, and far geometry fades out over
   * [mid - band, mid]. Called every frame (two uniform writes).
   */
  setLod(cx: number, cz: number, near: number, band: number, mid: number): void {
    const b = Math.max(0.001, band);
    this.uLodFocus.value.set(cx, cz);
    this.uLod.value.set(near - b, 1 / b, mid - b, 1 / b);
  }

  /** 0 = full day, 1 = deep night. */
  setNight(night: number): void {
    this.uGlow.value = 0.62 + night * 0.78; // dim neon by day, overdrive at night (tone mapping compresses it)
    this.uGlass.value.lerpColors(DAY_GLASS, NIGHT_GLASS, night);
    if (night > 0.5) this.uGlass.value.multiplyScalar(1 + (night - 0.5) * 0.9);
  }

  /** Force shader recompilation (shadow map toggles). */
  invalidate(): void {
    for (const m of this.all) m.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [...this.all, this.ghostOk, this.ghostBad, this.particleSoft, this.particleGlow, this.shield]) m.dispose();
  }
}
