/**
 * Mobile performance guarantees of the render core (no WebGL needed: three.js objects only):
 *  - Batch uploads only what was written or changed (update ranges), nothing for an empty batch, and never makes
 *    three.js switch a shared material between program variants (every batch carries instance colours);
 *  - the alien far LOD keeps each model's silhouette data (height) at a fraction of the triangles;
 *  - the lit shaders skip the point-light loop while every lamp is out (a uniform branch, same program).
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Batch, queueRange } from '../src/render/core/Batch';
import { LIGHTS_BEGIN_LAMPS, Materials, patchLambert } from '../src/render/core/materials';
import { alienGeometry, KNOWN_ALIEN_MODELS } from '../src/render/models/aliens';

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;
const ranges = (a: THREE.BufferAttribute) => a.updateRanges.map((r) => [r.start, r.count]);
/** What three.js does after uploading an attribute. */
const uploaded = (a: THREE.BufferAttribute) => a.clearUpdateRanges();

function batch(opts = {}, cap = 16): Batch {
  return new Batch(new THREE.Group(), new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), cap, opts);
}

describe('Batch uploads', () => {
  const m = new THREE.Matrix4();
  const red = new THREE.Color(1, 0, 0);

  it('end() queues only the written instances, not the whole capacity', () => {
    const b = batch({ color: true }, 64);
    b.begin();
    for (let i = 0; i < 3; i++) b.push(m, red);
    const v = b.mesh.instanceMatrix.version;
    b.end();
    expect(b.mesh.instanceMatrix.version).toBeGreaterThan(v);
    expect(ranges(b.mesh.instanceMatrix)).toEqual([[0, 48]]);
    expect(ranges(b.mesh.instanceColor!)).toEqual([[0, 9]]);
  });

  it('colours that did not change are not sent again; a changed one sends just that instance', () => {
    const b = batch({ color: true });
    b.begin();
    for (let i = 0; i < 4; i++) b.push(m, red);
    b.end();
    uploaded(b.mesh.instanceMatrix);
    uploaded(b.mesh.instanceColor!);
    b.begin();
    for (let i = 0; i < 4; i++) b.push(m, i === 2 ? new THREE.Color(0, 1, 0) : red);
    b.end();
    expect(ranges(b.mesh.instanceColor!)).toEqual([[6, 3]]);
    uploaded(b.mesh.instanceColor!);
    b.begin();
    for (let i = 0; i < 4; i++) b.push(m, i === 2 ? new THREE.Color(0, 1, 0) : red);
    b.end();
    expect(ranges(b.mesh.instanceColor!)).toEqual([]);
  });

  it('an empty batch uploads nothing', () => {
    const b = batch();
    const v = b.mesh.instanceMatrix.version;
    b.begin();
    b.end();
    expect(b.mesh.instanceMatrix.version).toBe(v);
    expect(b.mesh.count).toBe(0);
  });

  it('single-instance edits between uploads merge into one range; writes while not drawn are kept', () => {
    const b = batch({ color: true, fade: true });
    b.begin();
    for (let i = 0; i < 10; i++) b.push(m);
    b.end();
    uploaded(b.mesh.instanceMatrix);
    b.setMatrix(3, m);
    b.setMatrix(7, m);
    expect(ranges(b.mesh.instanceMatrix)).toEqual([[48, 80]]);
    // not drawn this frame (hidden / culled): the next edit extends the pending range instead of replacing it
    b.setMatrix(1, m);
    expect(ranges(b.mesh.instanceMatrix)).toEqual([[16, 112]]);
    b.setFade(4, 0.5);
    b.setFade(4, 0.5); // no change: nothing more
    const fade = b.mesh.geometry.getAttribute('aFade') as THREE.BufferAttribute;
    expect(ranges(fade)).toEqual([[4, 1]]);
  });

  it('queueRange adds one persistent entry per attribute (no allocation per edit)', () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(64), 16);
    const r = { start: 0, count: 0 };
    queueRange(a, r, 16, 32);
    queueRange(a, r, 0, 16);
    expect(a.updateRanges).toHaveLength(1);
    expect(a.updateRanges[0]).toBe(r);
    expect(ranges(a)).toEqual([[0, 32]]);
  });

  it('every batch carries instance colours (white without the colour option), so a shared material never switches program variants', () => {
    const plain = batch();
    expect(plain.mesh.instanceColor).not.toBeNull();
    plain.begin();
    plain.push(m, new THREE.Color(1, 0, 0)); // a colour handed to a batch without the option is ignored, as before
    plain.end();
    expect(Array.from(plain.mesh.instanceColor!.array.slice(0, 3))).toEqual([1, 1, 1]);
    plain.setColor(0, new THREE.Color(0, 0, 0));
    expect(Array.from(plain.mesh.instanceColor!.array.slice(0, 3))).toEqual([1, 1, 1]);
  });

  it('batch meshes never recompose their own matrix per frame', () => {
    expect(batch().mesh.matrixAutoUpdate).toBe(false);
  });

  it('growing keeps the written instances', () => {
    const b = batch({ color: true }, 2);
    b.begin();
    for (let i = 0; i < 5; i++) {
      m.makeTranslation(i, 0, 0);
      b.push(m, new THREE.Color(i / 10, 0, 0));
    }
    b.end();
    expect(b.count).toBe(5);
    expect(b.mesh.instanceMatrix.array[4 * 16 + 12]).toBe(4);
    expect(b.mesh.instanceColor!.array[3 * 3]).toBeCloseTo(0.3, 5);
  });
});

describe('alien far LOD', () => {
  it('every model keeps its height and loses about half its triangles at the far LOD', () => {
    for (const model of KNOWN_ALIEN_MODELS) {
      for (const boss of [false, true]) {
        const near = alienGeometry(model, boss, 0);
        const far = alienGeometry(model, boss, 1);
        expect(far.height, model).toBe(near.height);
        const n = tris(near.body) + tris(near.detail);
        const f = tris(far.body) + tris(far.detail);
        expect(f, `${model}${boss ? ' boss' : ''}`).toBeLessThan(n * 0.62);
        expect(f).toBeGreaterThan(0);
      }
    }
  });

  it('the near models are cached and unchanged by building a far one', () => {
    const a = alienGeometry('crawler');
    alienGeometry('crawler', false, 1);
    expect(alienGeometry('crawler')).toBe(a);
    expect(alienGeometry('crawler', false, 0)).toBe(a);
  });
});

describe('lamps off: point-light loop skipped by day', () => {
  it('the patched chunk wraps the point-light loop in a uniform branch (and keeps it unrollable)', () => {
    expect(LIGHTS_BEGIN_LAMPS).not.toBe(THREE.ShaderChunk.lights_fragment_begin);
    const i = LIGHTS_BEGIN_LAMPS.indexOf('if ( uLamps > 0.0 ) {');
    expect(i).toBeGreaterThan(0);
    // the branch opens right before the point-light pragma and closes right after its loop
    const after = LIGHTS_BEGIN_LAMPS.slice(i);
    expect(after).toMatch(/^if \( uLamps > 0\.0 \) \{\s*#pragma unroll_loop_start\s*for \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{/);
    expect(after).toMatch(/#pragma unroll_loop_end\s*\}/);
    // spot lights and the rest of the chunk are untouched
    expect(LIGHTS_BEGIN_LAMPS.replace(/if \( uLamps > 0\.0 \) \{\s*/, '').replace(/(#pragma unroll_loop_end)\s*\}/, '$1').replace(/\s+/g, '')).toBe(THREE.ShaderChunk.lights_fragment_begin.replace(/\s+/g, ''));
  });

  it('patched shaders get the shared lamps uniform', () => {
    const mats = new Materials();
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    patchLambert(shader, mats.lambert);
    expect(shader.uniforms.uLamps).toBe(mats.lambert.lamps);
    expect(shader.fragmentShader).toContain('uniform float uLamps;');
    expect(shader.fragmentShader).toContain('if ( uLamps > 0.0 )');
    expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
  });
});
