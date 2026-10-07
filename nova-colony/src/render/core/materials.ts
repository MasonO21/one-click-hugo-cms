/**
 * Shared materials. All procedural geometry uses ONE slot-aware Lambert material: the `aSlot`
 * vertex attribute selects lit (0), emissive glow (1) or window glass (2) per vertex, so any model
 * is a single draw call and day/night only touches two uniforms.
 *
 * Variants of that shader for the few batches that fade:
 *
 * Dither (screen-door) variants add a 4x4 Bayer `discard` driven by a per-fragment window
 * `vFade = (lo, hi)`: a fragment survives when lo <= bayer < hi. Opaque, sort-free and instancing
 * friendly; a `discard` costs early-Z on tile GPUs, so the shared material stays free of it:
 *  - `litFade`  window (aFade, 1): per-instance fade 0 solid .. 1 gone (buildings that stand between
 *               the camera and the player, see Batch `fade`);
 *  - `lodNear`  window (t, 1): near nature geometry fades out over the LOD band below the near
 *               radius (t = 0 inside the band .. 1 at the near radius), computed per instance in the
 *               vertex shader from the live focus / radii uniforms (`setLod`);
 *  - `lodFar`   window (0, t): the far geometry of the same instance fades in over that band —
 *               exactly complementary to `lodNear`, so every pixel is covered by one of the two and
 *               nothing pops (the two silhouettes overlap, so the stipple is invisible).
 *
 * Shrink variants are discard-free: the vertex shader scales the instance toward its origin (nature
 * models stand on y = 0, so they sink into the ground) over the band below a cutoff, reaching 0 at
 * the cutoff — a soft grow-in instead of a pop or a visible stipple on far silhouettes:
 *  - `lodShrinkMid`  far-only nature geometry toward the mid cutoff;
 *  - `lodShrinkNear` props (near only) toward the near radius.
 *
 * Every variant has a MeshDepthMaterial twin for the shadow pass (`*Depth`, attach through Batch
 * `depthMaterial`) applying the same window / shrink in shadow-map space, so shadows fade with their
 * caster and the near/far shadow stipples stay complementary. The shadow window is pushed a little
 * harder (`SHADOW_FADE_GAIN`), so a shadow is completely gone before its building reaches the faint
 * ghost stipple it keeps (Buildings FADE_MAX) — no sparse crawling stipple shadow under an invisible wall.
 *
 * Shading model (`patchLambert`, shared with the terrain): Lambert with a soft wrap so the sun bleeds
 * a little past the terminator (chunky toy look, no pitch-black side faces), plus a sky-coloured
 * fresnel rim (`uRim`, set per frame by Atmosphere from the sky) that lifts grazing faces on the
 * shadow side. A handful of ALU ops, no texture fetch; contact darkening is baked into the vertex
 * colours at build time (core/ao.ts) so the fragment shader stays as cheap as plain Lambert.
 */
import * as THREE from 'three';

const DAY_GLASS = new THREE.Color('#9fd8ff');
const NIGHT_GLASS = new THREE.Color('#ffcf7a');

/** Wrap-diffuse amount: a face edge-on to the sun still gets WRAP / (1 + WRAP) of its light. */
export const LAMBERT_WRAP = 0.22;

/** three's lights_lambert_pars_fragment with the wrapped N·L (kept verbatim otherwise). */
const LAMBERT_WRAP_PARS = /* glsl */ `
varying vec3 vViewPosition;
struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${LAMBERT_WRAP.toFixed(3)} ) * ${(1 / (1 + LAMBERT_WRAP)).toFixed(4)} );
  vec3 irradiance = dotNL * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct        RE_Direct_Lambert
#define RE_IndirectDiffuse    RE_IndirectDiffuse_Lambert
`;

/**
 * Rim: sky light on grazing faces, half tinted by the surface so dark paint does not go chalky.
 * Added to the direct term so the night grade below leaves its blue alone.
 */
const RIM_FRAG = /* glsl */ `
{
  float novaNV = 1.0 - saturate( dot( normal, geometryViewDir ) );
  reflectedLight.directDiffuse += uRim * ( novaNV * novaNV * novaNV ) * ( 0.4 + 0.6 * diffuseColor.rgb );
}
`;

/**
 * three's lit-sum line in meshlambert.glsl, replaced by the grade: the indirect (sky / ambient) light
 * is desaturated by `uDesat` (night), then the whole lit result is saturated by `uSat` (sunny
 * daytime, > 1 extrapolates away from luminance, clamped at 0). Emissive is added afterwards, untouched.
 */
const OUTGOING_LINE = 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';
const OUTGOING_GRADED = /* glsl */ `
vec3 novaLit = reflectedLight.directDiffuse + mix( reflectedLight.indirectDiffuse, vec3( dot( reflectedLight.indirectDiffuse, vec3( 0.3, 0.59, 0.11 ) ) ), uDesat );
vec3 outgoingLight = max( vec3( 0.0 ), mix( vec3( dot( novaLit, vec3( 0.3, 0.59, 0.11 ) ) ), novaLit, uSat ) ) + totalEmissiveRadiance;`;

/** Night grade: indirect light loses this much saturation at deep night, so moonlit grass reads blue-grey, not green. */
export const NIGHT_DESAT = 0.45;

/** Shared uniforms of the shading model, owned by Materials and handed to every patched shader. */
export interface LambertUniforms {
  /** Sky rim light colour × strength (linear). */
  rim: THREE.IUniform<THREE.Color>;
  /** Desaturation 0..1 of the indirect light (night grade). */
  desat: THREE.IUniform<number>;
  /** Saturation of the lit result: 1 = as painted, > 1 more vivid (sunny daytime grade). */
  sat: THREE.IUniform<number>;
}

/**
 * Apply the shared shading model to a MeshLambertMaterial's compiled shader: wrapped N·L, the night
 * desaturation grade on the indirect light (sky / ambient — lamp pools, the campfire and the moon
 * keep their colour) and, with `rim`, the sky rim term. Terrain and the slot-aware materials both go
 * through here so the ground and what stands on it are lit and graded the same way.
 */
export function patchLambert(shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }, u: LambertUniforms, rim = true): void {
  shader.uniforms.uDesat = u.desat;
  shader.uniforms.uSat = u.sat;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <lights_lambert_pars_fragment>', LAMBERT_WRAP_PARS)
    .replace('#include <common>', '#include <common>\nuniform float uDesat;\nuniform float uSat;')
    .replace(OUTGOING_LINE, OUTGOING_GRADED);
  if (rim) {
    shader.uniforms.uRim = u.rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>' + RIM_FRAG);
  }
}

/** How a dither variant obtains its (lo, hi) window. */
export type DitherMode = 'attr' | 'uniform' | 'lodNear' | 'lodFar';
/** Which LOD band a shrink variant sinks into: the near radius (props) or the mid cutoff (far geometry). */
export type ShrinkBand = 'near' | 'mid';

/** What a lit / depth variant adds to the shared shader. */
export interface LitVariant {
  dither?: DitherMode;
  /** Fade uniform for `dither: 'uniform'`. */
  uFade?: THREE.IUniform<number>;
  shrink?: ShrinkBand;
}

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

/** Per-instance distance from the instance origin to the focus (vertex shader). */
const LOD_DIST_VERT = /* glsl */ `
#ifdef USE_INSTANCING
vec2 novaIp = (modelMatrix * instanceMatrix[3]).xz;
#else
vec2 novaIp = modelMatrix[3].xz;
#endif
float novaD = distance(novaIp, uLodFocus);
`;

function usesLod(v: LitVariant): boolean {
  return v.dither === 'lodNear' || v.dither === 'lodFar' || !!v.shrink;
}

function variantVertexPars(v: LitVariant): string {
  let s = '';
  if (v.dither === 'attr') s += '\nattribute float aFade;';
  else if (v.dither === 'uniform') s += '\nuniform float uFade;';
  if (v.dither) s += '\nvarying vec2 vFade;';
  if (usesLod(v)) s += '\nuniform vec2 uLodFocus;\nuniform vec4 uLod;';
  return s;
}

function variantVertexMain(v: LitVariant): string {
  let s = usesLod(v) ? LOD_DIST_VERT : '';
  if (v.shrink) {
    // smoothstep from full size at (cutoff - band) to nothing at the cutoff, about the instance origin
    const lo = v.shrink === 'near' ? 'uLod.x' : 'uLod.z';
    const inv = v.shrink === 'near' ? 'uLod.y' : 'uLod.w';
    s += `float novaK = clamp((novaD - ${lo}) * ${inv}, 0.0, 1.0);\ntransformed *= 1.0 - novaK * novaK * (3.0 - 2.0 * novaK);\n`;
  }
  switch (v.dither) {
    case 'attr': s += 'vFade = vec2(aFade, 1.0);'; break;
    case 'uniform': s += 'vFade = vec2(uFade, 1.0);'; break;
    case 'lodNear': s += 'vFade = vec2(clamp((novaD - uLod.x) * uLod.y, 0.0, 1.0), 1.0);'; break;
    case 'lodFar': s += 'vFade = vec2(0.0, clamp((novaD - uLod.x) * uLod.y, 0.0, 1.0));'; break;
  }
  return s;
}

function ditherFragmentMain(shadow: boolean): string {
  return shadow
    ? `\n{ float novaB = novaBayer(gl_FragCoord.xy); vec2 novaF = min(vFade * ${SHADOW_FADE_GAIN.toFixed(3)}, 1.0); if (novaB < novaF.x || novaB >= novaF.y) discard; }`
    : '\n{ float novaB = novaBayer(gl_FragCoord.xy); if (novaB < vFade.x || novaB >= vFade.y) discard; }';
}

function variantKey(v: LitVariant): string {
  return (v.dither ? '-' + v.dither : '') + (v.shrink ? '-shrink-' + v.shrink : '');
}

export class Materials {
  /** Shared shader uniforms (glow brightness, glass color, sky rim). */
  private readonly uGlow = { value: 1 };
  private readonly uGlass = { value: DAY_GLASS.clone() };
  /** Shading-model uniforms (sky rim, night desaturation, day saturation) shared with the terrain material. */
  readonly lambert: LambertUniforms = { rim: { value: new THREE.Color(0, 0, 0) }, desat: { value: 0 }, sat: { value: 1 } };
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
  /** `lit` for near nature geometry inside the LOD band (dithers out toward the near radius). */
  readonly lodNear: THREE.MeshLambertMaterial;
  readonly lodNearDepth: THREE.MeshDepthMaterial;
  /** `lit` for the far geometry of the same band nodes (dithers in, complementary to `lodNear`). */
  readonly lodFar: THREE.MeshLambertMaterial;
  readonly lodFarDepth: THREE.MeshDepthMaterial;
  /** Discard-free `lit` for far-only nature geometry: sinks into the ground over the band below mid. */
  readonly lodShrinkMid: THREE.MeshLambertMaterial;
  readonly lodShrinkMidDepth: THREE.MeshDepthMaterial;
  /** Discard-free `lit` for props: sinks into the ground over the band below the near radius. */
  readonly lodShrinkNear: THREE.MeshLambertMaterial;
  readonly lodShrinkNearDepth: THREE.MeshDepthMaterial;
  /**
   * Build-mode ghosts. UI affordances, not lit scene content: they skip tone mapping so the ACES grade
   * cannot wash the valid-green out to pale mint (it did; they were picked under Neutral).
   */
  readonly ghostOk = new THREE.MeshBasicMaterial({ color: '#56ff9a', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  readonly ghostBad = new THREE.MeshBasicMaterial({ color: '#ff5c6a', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
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
    this.litFade = this.makeLit({}, { dither: 'attr' });
    this.litFadeDepth = this.makeDepth({ dither: 'attr' });
    this.lodNear = this.makeLit({}, { dither: 'lodNear' });
    this.lodNearDepth = this.makeDepth({ dither: 'lodNear' });
    this.lodFar = this.makeLit({}, { dither: 'lodFar' });
    this.lodFarDepth = this.makeDepth({ dither: 'lodFar' });
    this.lodShrinkMid = this.makeLit({}, { shrink: 'mid' });
    this.lodShrinkMidDepth = this.makeDepth({ shrink: 'mid' });
    this.lodShrinkNear = this.makeLit({}, { shrink: 'near' });
    this.lodShrinkNearDepth = this.makeDepth({ shrink: 'near' });
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

  private variantUniforms(shader: { uniforms: Record<string, THREE.IUniform> }, v: LitVariant): void {
    if (usesLod(v)) {
      shader.uniforms.uLodFocus = this.uLodFocus;
      shader.uniforms.uLod = this.uLod;
    }
    if (v.dither === 'uniform' && v.uFade) shader.uniforms.uFade = v.uFade;
  }

  /**
   * Create a slot-aware Lambert material (the shared material, per-room roofs, fade variants).
   * `variant` adds the screen-door discard and/or the vertex shrink described above.
   */
  makeLit(opts: THREE.MeshLambertMaterialParameters = {}, variant: LitVariant = {}): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
    const uGlow = this.uGlow;
    const uGlass = this.uGlass;
    const key = variantKey(variant);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = uGlow;
      shader.uniforms.uGlass = uGlass;
      this.variantUniforms(shader, variant);
      patchLambert(shader, this.lambert);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSlot;\nvarying float vSlot;' + variantVertexPars(variant))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = aSlot;\n' + variantVertexMain(variant));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSlot;\nuniform float uGlow;\nuniform vec3 uGlass;' + (variant.dither ? BAYER_FRAG_PARS : ''))
        .replace(
          '#include <opaque_fragment>',
          'if (vSlot > 1.5) outgoingLight = uGlass; else if (vSlot > 0.5) outgoingLight = diffuseColor.rgb * uGlow;\n#include <opaque_fragment>',
        );
      if (variant.dither) {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + ditherFragmentMain(false));
      }
    };
    mat.customProgramCacheKey = () => 'nova-slot-lit' + key;
    return this.track(mat);
  }

  /**
   * Shadow-pass material for a variant: the default depth shader plus the same window / shrink, so
   * a dithered caster throws a dithered (PCF-softened, lighter) shadow instead of a solid one and a
   * shrinking caster's shadow shrinks with it. Only fading batches pay for the discard; everything
   * else keeps three's shared depth material.
   */
  makeDepth(variant: LitVariant): THREE.MeshDepthMaterial {
    const mat = new THREE.MeshDepthMaterial();
    const key = variantKey(variant);
    mat.onBeforeCompile = (shader) => {
      this.variantUniforms(shader, variant);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>' + variantVertexPars(variant))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + variantVertexMain(variant));
      if (variant.dither) {
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>' + BAYER_FRAG_PARS)
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>' + ditherFragmentMain(true));
      }
    };
    mat.customProgramCacheKey = () => 'nova-depth' + key;
    return this.track(mat);
  }

  /** Per-room roof material (fades independently through opacity). */
  makeRoof(): THREE.MeshLambertMaterial {
    return this.makeLit({ transparent: true, opacity: 1 });
  }

  /** Shadow-pass material for a roof: dithers the roof's shadow away as `fade` (1 - opacity) rises. */
  makeRoofDepth(fade: THREE.IUniform<number>): THREE.MeshDepthMaterial {
    return this.makeDepth({ dither: 'uniform', uFade: fade });
  }

  /**
   * Live LOD band for the nature materials: `focus` is the culling center; near geometry dithers out
   * over [near - band, near] while far geometry dithers in, props shrink away over the same band,
   * and far-only geometry shrinks away over [mid - band, mid]. Called every frame (two uniform writes).
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
    this.lambert.desat.value = NIGHT_DESAT * night * night;
  }

  /** Sky rim light: `color` (linear) scaled by `strength`; Atmosphere feeds it the current sky. */
  setRim(color: THREE.Color, strength: number): void {
    this.lambert.rim.value.copy(color).multiplyScalar(Math.max(0, strength));
  }

  /** Saturation of lit surfaces (1 = as painted); Atmosphere raises it a little under a high sun. */
  setSaturation(sat: number): void {
    this.lambert.sat.value = Math.max(0, sat);
  }

  /** Force shader recompilation (shadow map toggles). */
  invalidate(): void {
    for (const m of this.all) m.needsUpdate = true;
  }

  dispose(): void {
    for (const m of [...this.all, this.ghostOk, this.ghostBad, this.particleSoft, this.particleGlow, this.shield]) m.dispose();
  }
}
