/**
 * Shading model helpers (render/core/materials.ts, Terrain, actor tints): the Lambert patch wires
 * the wrap / rim / night grade into three's shader source, Materials drives the shared uniforms,
 * worn ground pulls colours toward dry earth, and per-instance tints stay small and deterministic.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Materials, patchLambert, LAMBERT_WRAP, NIGHT_DESAT } from '../src/render/core/materials';
import { wornColor, wearSignature } from '../src/render/scene/Terrain';
import { Atmosphere, KEY_SWAP_E } from '../src/render/scene/Atmosphere';
import type { Env, RenderContext } from '../src/render/core/context';
import { buildingTint } from '../src/render/actors/Buildings';
import { natureTint } from '../src/render/actors/Nature';

/** A stand-in for three's compiled Lambert fragment source: the includes the patch hooks into. */
const FRAG = ['#include <common>', '#include <lights_lambert_pars_fragment>', 'void main() {', '#include <lights_fragment_end>', 'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', '#include <envmap_fragment>', '#include <opaque_fragment>', '}'].join('\n');

describe('shading model', () => {
  it('patchLambert replaces the Lambert chunk with the wrapped N·L and adds the grade; rim only when asked', () => {
    const mats = new Materials();
    const full = { uniforms: {} as Record<string, THREE.IUniform>, fragmentShader: FRAG };
    patchLambert(full, mats.lambert);
    expect(full.fragmentShader).not.toContain('#include <lights_lambert_pars_fragment>');
    expect(full.fragmentShader).toContain('RE_Direct_Lambert');
    expect(full.fragmentShader).toContain(LAMBERT_WRAP.toFixed(3));
    expect(full.fragmentShader).toContain('uniform float uDesat');
    expect(full.fragmentShader).toContain('uniform vec3 uRim');
    expect(full.fragmentShader.indexOf('uRim *')).toBeGreaterThan(full.fragmentShader.indexOf('#include <lights_fragment_end>'));
    // the grade desaturates only the indirect (sky / ambient) light: point-light pools and the moon keep their colour
    expect(full.fragmentShader).not.toContain('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;');
    const graded = full.fragmentShader.slice(full.fragmentShader.indexOf('vec3 novaLit'), full.fragmentShader.indexOf('#include <envmap_fragment>'));
    expect(graded).toContain('vec3 outgoingLight');
    expect(graded).toContain('reflectedLight.directDiffuse +');
    expect(graded).toContain('mix( reflectedLight.indirectDiffuse');
    expect(graded).toContain('uDesat');
    // the daytime saturation grade wraps the whole lit result, clamped at 0, before emissive is added
    expect(graded).toContain('uSat');
    expect(graded).toContain('max( vec3( 0.0 )');
    expect(graded.indexOf('uSat')).toBeLessThan(graded.indexOf('totalEmissiveRadiance'));
    expect(full.fragmentShader).toContain('uniform float uSat');
    expect(full.uniforms.uSat).toBe(mats.lambert.sat);
    expect(full.uniforms.uRim).toBe(mats.lambert.rim);
    expect(full.uniforms.uDesat).toBe(mats.lambert.desat);

    const noRim = { uniforms: {} as Record<string, THREE.IUniform>, fragmentShader: FRAG };
    patchLambert(noRim, mats.lambert, false);
    expect(noRim.fragmentShader).not.toContain('uRim');
    expect(noRim.fragmentShader).toContain('uDesat');
    expect(noRim.uniforms.uRim).toBeUndefined();
  });

  it('Materials: night drives the desaturation grade, setRim scales the sky colour and never goes negative', () => {
    const mats = new Materials();
    expect(mats.lambert.desat.value).toBe(0);
    mats.setNight(1);
    expect(mats.lambert.desat.value).toBeCloseTo(NIGHT_DESAT);
    mats.setNight(0.5);
    expect(mats.lambert.desat.value).toBeCloseTo(NIGHT_DESAT * 0.25); // eases in (night²)
    mats.setNight(0);
    expect(mats.lambert.desat.value).toBe(0);
    const sky = new THREE.Color(0.5, 0.7, 1.0);
    mats.setRim(sky, 0.4);
    expect(mats.lambert.rim.value.r).toBeCloseTo(0.2);
    expect(mats.lambert.rim.value.b).toBeCloseTo(0.4);
    mats.setRim(sky, -1);
    expect(mats.lambert.rim.value.b).toBe(0);
    // day saturation: as painted by default, raised under a high sun, never negative
    expect(mats.lambert.sat.value).toBe(1);
    mats.setSaturation(1.16);
    expect(mats.lambert.sat.value).toBeCloseTo(1.16);
    mats.setSaturation(-2);
    expect(mats.lambert.sat.value).toBe(0);
    // the shared lit material compiles the patch in (not just the terrain)
    expect(mats.lit.customProgramCacheKey()).toContain('nova-slot-lit');
  });

  it('wornColor: darker, warmer and less saturated than the grass, clamped, identity at 0', () => {
    const grass = new THREE.Color('#6fbf5a');
    const same = wornColor(grass.clone(), 0);
    expect(same.getHex()).toBe(grass.getHex());
    const worn = wornColor(grass.clone(), 1);
    const lum = (c: THREE.Color) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    expect(lum(worn)).toBeLessThan(lum(grass));
    expect(worn.r / worn.g).toBeGreaterThan(grass.r / grass.g); // warmer
    expect(worn.g - Math.max(worn.r, worn.b)).toBeLessThan(grass.g - Math.max(grass.r, grass.b)); // less green-saturated
    const half = wornColor(grass.clone(), 0.5);
    expect(lum(half)).toBeGreaterThan(lum(worn));
    expect(lum(half)).toBeLessThan(lum(grass));
    expect(wornColor(grass.clone(), 5).getHex()).toBe(worn.getHex()); // clamped
    // snow and sand go earthy too, never negative
    for (const hex of ['#f4f8fc', '#d9895a', '#8a7bc4']) {
      const c = wornColor(new THREE.Color(hex), 1);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(lum(c)).toBeLessThan(lum(new THREE.Color(hex)));
    }
  });

  it('per-instance tints are deterministic and small (buildings ±5 % value, nature ±9 %)', () => {
    for (let id = 1; id < 200; id++) {
      const t = buildingTint(id);
      expect(t).toBe(buildingTint(id));
      for (const ch of [t.r, t.g, t.b]) expect(Math.abs(ch - 1)).toBeLessThan(0.1);
      const n = natureTint(id);
      expect(n).toBe(natureTint(id));
      for (const ch of [n.r, n.g, n.b]) expect(Math.abs(ch - 1)).toBeLessThan(0.17);
    }
    // not all the same
    expect(new Set(Array.from({ length: 64 }, (_, i) => buildingTint(i).getHex())).size).toBeGreaterThan(3);
    expect(new Set(Array.from({ length: 64 }, (_, i) => natureTint(i).getHex())).size).toBeGreaterThan(5);
  });
});

describe('worn ground signature (QA3: raids recoloured the whole terrain per broken / repaired building)', () => {
  const colony = () => [
    { def: 'command_center', x: 127, z: 127, rot: 0, status: 'active', hp: 100, level: 1 },
    { def: 'shelter', x: 131, z: 127, rot: 1, status: 'active', hp: 50, level: 1 },
    { def: 'wall', x: 120, z: 120, rot: 0, status: 'active', hp: 30, level: 1 },
  ];
  it('ignores status, hp and level', () => {
    const a = colony();
    const b = colony();
    b[1].status = 'damaged';
    b[1].hp = 0;
    b[2].level = 3;
    expect(wearSignature(b)).toBe(wearSignature(a));
  });
  it('changes when a footprint is added, moved, rotated or replaced by another building', () => {
    const base = wearSignature(colony());
    const moved = colony();
    moved[1].x++;
    const turned = colony();
    turned[1].rot = 2;
    const swapped = colony();
    swapped[1].def = 'campfire';
    const more = [...colony(), { def: 'campfire', x: 140, z: 140, rot: 0, status: 'building', hp: 1, level: 1 }];
    for (const l of [moved, turned, swapped, more]) expect(wearSignature(l)).not.toBe(base);
  });
});

describe('key light at dusk / dawn (QA3: every shadow flipped 180° in one frame)', () => {
  it('sun-to-moon swap happens while the key light is off: the light vector never jumps', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 1800);
    const env: Env = { t: 0, dt: 1 / 60, night: 0, sunElev: 1, quality: 'high', cx: 0, cz: 0, viewRadius: 104, camX: 0, camY: 18, camZ: 26, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
    const ctx = { game: {} as RenderContext['game'], scene, camera, mats: new Materials(), env, heightAt: () => 0, particles: {} as RenderContext['particles'] } as RenderContext;
    const atmo = new Atmosphere(ctx);
    const key = (t: number) => {
      atmo.update(t, 30);
      const d = atmo.sun.position.clone().sub(atmo.sun.target.position).normalize();
      return { v: d.multiplyScalar(atmo.sun.intensity), i: atmo.sun.intensity, e: env.sunElev };
    };
    let prev = key(0);
    let worst = 0;
    let swaps = 0;
    for (let t = 0.0002; t <= 1; t += 0.0002) {
      const k = key(t);
      worst = Math.max(worst, k.v.distanceTo(prev.v));
      if (Math.sign(k.e - KEY_SWAP_E) !== Math.sign(prev.e - KEY_SWAP_E)) {
        swaps++;
        expect(Math.max(k.i, prev.i)).toBeLessThan(0.05);
      }
      prev = k;
    }
    expect(swaps).toBe(2); // dawn and dusk
    expect(worst).toBeLessThan(0.1);
    // the look away from the swap is untouched: bright noon sun, a soft moon at midnight
    expect(key(0.5).i).toBeCloseTo(2.2, 1);
    expect(key(0).i).toBeCloseTo(0.46, 2);
    atmo.dispose();
  });
});

describe('UI overlays are not graded (QA3: ACES washed the valid ghost to pale mint, hid the selection ring)', () => {
  it('build ghosts skip tone mapping; scene materials keep it', () => {
    const m = new Materials();
    expect(m.ghostOk.toneMapped).toBe(false);
    expect(m.ghostBad.toneMapped).toBe(false);
    expect(m.ghostOk.clone().toneMapped).toBe(false); // the x-ray copies are clones
    expect(m.lit.toneMapped).toBe(true);
    expect(m.shield.toneMapped).toBe(true);
  });
});
