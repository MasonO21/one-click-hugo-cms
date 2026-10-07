/**
 * Shared materials. All procedural geometry uses ONE slot-aware Lambert material: the `aSlot`
 * vertex attribute selects lit (0), emissive glow (1) or window glass (2) per vertex, so any model
 * is a single draw call and day/night only touches two uniforms.
 *
 * `litFade` is the same shader plus a per-instance `aFade` attribute (see Batch `fade` option) that
 * dithers the instance away with a 4x4 Bayer screen-door pattern — opaque, sort-free, instancing
 * friendly. Only buildings use it (a `discard` in a shader costs early-Z on tile GPUs, so the
 * shared material stays discard-free).
 */
import * as THREE from 'three';

const DAY_GLASS = new THREE.Color('#9fd8ff');
const NIGHT_GLASS = new THREE.Color('#ffcf7a');

const FADE_FRAG_PARS = /* glsl */ `
varying float vFade;
const int NOVA_BAYER[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
float novaBayer(vec2 p) {
  ivec2 ip = ivec2(mod(p, 4.0));
  return (float(NOVA_BAYER[ip.x + ip.y * 4]) + 0.5) / 16.0;
}
`;

export class Materials {
  /** Shared shader uniforms (glow brightness, glass color). */
  private readonly uGlow = { value: 1 };
  private readonly uGlass = { value: DAY_GLASS.clone() };
  /** Opaque, lit, vertex-colored, slot-aware. */
  readonly lit: THREE.MeshLambertMaterial;
  /** Alias kept for callers that think in "material sets" — it is the same single material. */
  readonly set: THREE.Material;
  /** `lit` + per-instance dither fade (buildings that occlude the player). */
  readonly litFade: THREE.MeshLambertMaterial;
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
    this.litFade = this.makeLit({}, true);
  }

  /** Create a slot-aware Lambert material (used for the shared material and per-room roofs). */
  makeLit(opts: THREE.MeshLambertMaterialParameters = {}, fade = false): THREE.MeshLambertMaterial {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
    const uGlow = this.uGlow;
    const uGlass = this.uGlass;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = uGlow;
      shader.uniforms.uGlass = uGlass;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSlot;\nvarying float vSlot;' + (fade ? '\nattribute float aFade;\nvarying float vFade;' : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlot = aSlot;' + (fade ? '\nvFade = aFade;' : ''));
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSlot;\nuniform float uGlow;\nuniform vec3 uGlass;' + (fade ? FADE_FRAG_PARS : ''))
        .replace(
          '#include <opaque_fragment>',
          'if (vSlot > 1.5) outgoingLight = uGlass; else if (vSlot > 0.5) outgoingLight = diffuseColor.rgb * uGlow;\n#include <opaque_fragment>',
        );
      if (fade) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif (vFade > 0.002 && novaBayer(gl_FragCoord.xy) < vFade) discard;',
        );
      }
    };
    mat.customProgramCacheKey = () => (fade ? 'nova-slot-lit-fade' : 'nova-slot-lit');
    this.all.push(mat);
    return mat;
  }

  /** Per-room roof material (fades independently). */
  makeRoof(): THREE.MeshLambertMaterial {
    return this.makeLit({ transparent: true, opacity: 1 });
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
