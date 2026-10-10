// The endless graveyard: each chapter's painted floor, scattered decor and dynamic ground lights.
import * as THREE from 'three';
import { makeGroundMaterial, makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { propGeometry, PROP_TYPES } from '../engine/models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetFiles, loadBytes, loadTexture, floatGeometry } from '../engine/assets.js';
import { Weather } from './weather.js';

const FLOOR_URL = assetFiles(import.meta.glob('../assets/floors/*.webp', { eager: true, query: '?url', import: 'default' }));

// The painted floors (Higgsfield, docs/ART_AND_ADS.md §5) by key (CHAPTERS[].floor): the texture, the metres one copy
// covers, how bright the paint sits under the ambient light, and how much of its bright saturated paint glows (lava,
// starlit cracks, toxic sludge).
export const FLOORS = {
  necropolis: { tex: 'necropolis', scale: 15, gain: 1.0, glow: 0 },
  ember: { tex: 'ember', scale: 17, gain: 1.15, glow: 1.1 },
  ossuary: { tex: 'ossuary', scale: 16, gain: 1.15, glow: 0.4 },
  cathedral: { tex: 'cathedral', scale: 15, gain: 1.8, glow: 0.7 },
  throne: { tex: 'throne', scale: 18, gain: 1.45, glow: 0 },
  abyss: { tex: 'abyss', scale: 16, gain: 1.05, glow: 0.9 },
  // Update 13's realms: two floors each
  drowned: { tex: 'drowned', scale: 16, gain: 1.25, glow: 0.3 },
  shore: { tex: 'shore', scale: 17, gain: 1.2, glow: 0 },
  thornwood: { tex: 'thornwood', scale: 15, gain: 1.3, glow: 0 },
  grove: { tex: 'grove', scale: 16, gain: 1.3, glow: 0.2 },
  fen: { tex: 'fen', scale: 16, gain: 1.2, glow: 0.9 },
  fungal: { tex: 'fungal', scale: 15, gain: 1.25, glow: 1.0 },
  slate: { tex: 'slate', scale: 16, gain: 1.3, glow: 0.8 },
  peak: { tex: 'peak', scale: 17, gain: 1.2, glow: 0.4 },
  regolith: { tex: 'regolith', scale: 17, gain: 1.05, glow: 0.6 },
  starfloor: { tex: 'starfloor', scale: 16, gain: 1.2, glow: 0.9 },
};
const floorTextures = new Map();

/** The chapter floor's texture (loaded once, shared by the run and the home screen); resolves null without one. */
export function floorTexture(key) {
  if (!FLOOR_URL[key]) return Promise.resolve(null);
  if (!floorTextures.has(key)) {
    floorTextures.set(key, loadTexture(FLOOR_URL[key], { flipY: true, anisotropy: 8, repeat: true }).catch(() => null));
  }
  return floorTextures.get(key);
}

const PROP_GLB = assetFiles(import.meta.glob('../assets/props/*.glb', { eager: true, query: '?url', import: 'default' }));
const PROP_TEX = assetFiles(import.meta.glob('../assets/props/*.webp', { eager: true, query: '?url', import: 'default' }));

// Each realm's painted props (Higgsfield concept art turned to 3D, docs/ART_AND_ADS.md §5) by biome (CHAPTERS[].biome):
// height in metres (each placement varies it 0.85-1.2x), how often it turns up (weight), how much bright saturated paint
// glows, and for a flame or a crystal the flickering pool of light it casts on the floor ([colour, radius m, intensity]).
export const PROPS = {
  necropolis: [{ key: 'graves', h: 1.6, w: 3 }, { key: 'angel', h: 2.6, w: 1.2 }, { key: 'lamp', h: 3.0, w: 1, glow: 2.6, light: [0x4ef2ff, 5.5, 0.55] }, { key: 'deadtree', h: 3.6, w: 1.2 }],
  ember: [{ key: 'spire', h: 3.0, w: 2, glow: 2 }, { key: 'charredtree', h: 3.4, w: 1.2, glow: 1.6 }, { key: 'brazier', h: 1.5, w: 1, glow: 2.6, light: [0xff8a2a, 6, 0.75] }, { key: 'skulls', h: 0.9, w: 1.6, glow: 1.6 }],
  ossuary: [{ key: 'icecrystal', h: 2.4, w: 2, glow: 0.6 }, { key: 'ribcage', h: 1.8, w: 1.2 }, { key: 'icepillar', h: 3.2, w: 1.2 }, { key: 'sarcophagus', h: 1.0, w: 1 }],
  cathedral: [{ key: 'column', h: 3.6, w: 1.6, glow: 1 }, { key: 'candelabra', h: 2.4, w: 1, glow: 2.6, light: [0xa35bff, 5.5, 0.6] }, { key: 'gargoyle', h: 2.2, w: 1 }, { key: 'altar', h: 1.3, w: 1, glow: 1.6, light: [0xa35bff, 4, 0.35] }],
  throne: [{ key: 'banner', h: 3.8, w: 1.4 }, { key: 'knight', h: 2.9, w: 1 }, { key: 'candles', h: 1.8, w: 1, glow: 2.2, light: [0xffb02e, 5, 0.55] }, { key: 'fountain', h: 1.1, w: 1 }],
  abyss: [{ key: 'voidcrystal', h: 2.4, w: 2, glow: 2, light: [0x6b7bff, 5, 0.45] }, { key: 'obelisk', h: 3.6, w: 1.2, glow: 1.6 }, { key: 'arch', h: 3.4, w: 1 }],
  // Update 13's realms: three props of their own and one fitting prop from Act I
  drowned: [{ key: 'anchor', h: 2.4, w: 1.4 }, { key: 'hullribs', h: 2.6, w: 1 }, { key: 'coralpillar', h: 2.8, w: 1.2, glow: 2.4, light: [0x2fe6c8, 5, 0.5] }, { key: 'graves', h: 1.6, w: 1.6 }],
  thorn: [{ key: 'gibbet', h: 3.4, w: 1 }, { key: 'thornbush', h: 1.4, w: 2 }, { key: 'hollowstump', h: 1.6, w: 1, glow: 2.2, light: [0xffaa3a, 4.5, 0.5] }, { key: 'deadtree', h: 3.6, w: 1.2 }],
  fen: [{ key: 'plaguecart', h: 1.6, w: 1 }, { key: 'fungus', h: 2.2, w: 1.4, glow: 2.4, light: [0x9cff3a, 4.5, 0.5] }, { key: 'scarecrow', h: 2.6, w: 1.2 }, { key: 'skulls', h: 0.9, w: 1.2 }],
  storm: [{ key: 'lightningrod', h: 3.6, w: 1, glow: 2.6, light: [0x7fd4ff, 5, 0.55] }, { key: 'prayerbell', h: 2.6, w: 1 }, { key: 'monolith', h: 3.2, w: 1.4, glow: 1.8 }, { key: 'column', h: 3.6, w: 1 }],
  moon: [{ key: 'moonrock', h: 1.8, w: 2, glow: 0.8 }, { key: 'orrery', h: 2.6, w: 1 }, { key: 'eclipseshrine', h: 2.0, w: 1, glow: 2.4, light: [0xd0b8ff, 5, 0.5] }, { key: 'voidcrystal', h: 2.4, w: 1, glow: 2, light: [0x8f7bff, 5, 0.4] }],
};
const propModels = new Map();

/** A prop's model ({ geometry standing on the ground at its height, centred, facing +Z; map }), loaded once and shared;
 *  resolves null without one. */
export function propModel(def) {
  const key = def.key;
  if (!PROP_GLB[key] || !PROP_TEX[key]) return Promise.resolve(null);
  if (!propModels.has(key)) {
    propModels.set(key, (async () => {
      const [buf, map] = await Promise.all([loadBytes(PROP_GLB[key]), loadTexture(PROP_TEX[key])]);
      const gltf = await new GLTFLoader().parseAsync(buf, '');
      let mesh = null;
      gltf.scene.traverse((o) => { if (!mesh && o.isMesh) mesh = o; });
      if (!mesh) return null;
      gltf.scene.updateMatrixWorld(true);
      const g = floatGeometry(mesh);
      g.computeBoundingBox();
      const b = g.boundingBox, sc = def.h / Math.max(1e-3, b.max.y - b.min.y);
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      g.scale(sc, sc, sc);
      g.computeBoundingSphere();
      return { geometry: g, map };
    })().catch((e) => { console.warn('prop', key, e); return null; }));
  }
  return propModels.get(key);
}

const CELL = 6.5;
const RANGE = 5; // cells around the centre
const PER_TYPE = 70;
const PROP_LIGHTS = 6; // flame and crystal light pools, after the run's own lights

/** Deterministic 0..1 hash of an integer cell (also places ground hazards in hazards.js). */
export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class World {
  /** clear: cells around the origin kept free of props (the home screen keeps its hero in view); budget: the quality's
   *  particle share (weather). */
  constructor(scene, chapter, { props = true, maxLights = 24, clear = 0, budget = 1 } = {}) {
    this.scene = scene;
    this.maxLights = maxLights;
    this.clear = clear;
    this.groundMat = makeGroundMaterial();
    const g = new THREE.PlaneGeometry(170, 170, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.frustumCulled = false;
    scene.add(this.ground);

    // the procedural props stand in until the chapter's painted ones load
    this.propMat = makeCharMaterial({ rim: 0x3d5a7a, emit: 2.6, ambient: 0x222a3c, key: 0x5a6a8a });
    this.fallback = [];
    this.kinds = [];   // what update() scatters now: { mesh, attrs, w, light }
    this.painted = []; // the chapter's painted prop meshes
    this.lamps = [];   // light-casting props near the centre: { x, z, color, r, i, ph }
    this.center = new THREE.Vector3();
    this.time = 0;
    if (props) {
      for (const t of PROP_TYPES) {
        const mesh = new THREE.InstancedMesh(propGeometry(t), this.propMat, PER_TYPE);
        mesh.count = 0;
        mesh.frustumCulled = false;
        const attrs = addInstanceAttrs(mesh, PER_TYPE);
        this.fallback.push({ mesh, attrs, w: 1, light: null });
        scene.add(mesh);
      }
    }
    this.props = !!props;
    this.weather = new Weather(scene, budget);
    this.lastCell = null;
    this.lightCount = 0;
    this.setChapter(chapter);
  }

  setChapter(ch) {
    const u = this.groundMat.uniforms;
    u.uBaseA.value.setHex(ch.ground);
    u.uBaseB.value.setHex(ch.groundB);
    u.uRune.value.setHex(ch.rune);
    u.uFog.value.setHex(ch.fog);
    // the painted floor; a Blood Moon or a harder difficulty recolours it (look.recolor) keeping the paint's detail
    const F = FLOORS[ch.floor];
    u.uTexOn.value = 0;
    u.uRecolor.value.setHex(ch.ground);
    u.uRecolorAmt.value = ch.recolor || 0;
    if (F) {
      u.uTexScale.value = F.scale; u.uTexGain.value = F.gain; u.uTexGlow.value = F.glow;
      floorTexture(F.tex).then((t) => { if (t && this.chapter === ch && !this.disposed) { u.uTex.value = t; u.uTexOn.value = 1; } });
    }
    this.propMat.uniforms.uRim.value.setHex(ch.rim).multiplyScalar(0.5);
    this.runeColor = new THREE.Color(ch.rune);
    this.chapter = ch;
    for (const { attrs } of this.fallback) {
      for (let i = 0; i < PER_TYPE; i++) attrs.tint.setXYZ(i, this.runeColor.r, this.runeColor.g, this.runeColor.b);
      attrs.tint.needsUpdate = true;
    }
    this.weather.setChapter(ch.biome);
    this.clearPainted();
    this.kinds = this.fallback;
    this.lastCell = null;
    const defs = this.props && PROPS[ch.biome];
    if (defs) {
      Promise.all(defs.map(propModel)).then((models) => {
        if (this.chapter !== ch || this.disposed || models.some((m) => !m)) return;
        this.usePainted(ch, defs, models);
      });
    }
  }

  usePainted(ch, defs, models) {
    for (const { mesh } of this.fallback) mesh.count = 0;
    this.painted = defs.map((def, i) => {
      // dark shapes in the gloom, rim-lit, until the Shepherd's lantern reaches them
      const mat = makeCharMaterial({ map: models[i].map, glow: def.glow || 0, rim: ch.rim, emit: 0, anim: 0, ambient: 0x2c3240, key: 0x58606f, plColor: ch.rune, plRadius: 9, sight: true });
      mat.uniforms.uRim.value.multiplyScalar(0.5);
      mat.uniforms.uSightFog.value.setHex(ch.fog);
      const mesh = new THREE.InstancedMesh(models[i].geometry.clone(), mat, PER_TYPE); // own instance attributes, shared paint
      mesh.count = 0;
      mesh.frustumCulled = false;
      const attrs = addInstanceAttrs(mesh, PER_TYPE);
      this.scene.add(mesh);
      return { mesh, attrs, w: def.w, light: def.light ? { color: new THREE.Color(def.light[0]), r: def.light[1], i: def.light[2] } : null };
    });
    this.kinds = this.painted;
    this.lastCell = null;
  }

  clearPainted() {
    for (const { mesh } of this.painted) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    this.painted = [];
    this.lamps = [];
  }

  /** Keep the ground centred on the player and repopulate decor when the player crosses a cell. */
  update(center, time) {
    this.ground.position.set(center.x, 0, center.z);
    this.center.copy(center);
    this.time = time;
    const u = this.groundMat.uniforms;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
    this.propMat.uniforms.uTime.value = time;
    this.weather.update(center, time);
    for (const { mesh } of this.painted) {
      const v = mesh.material.uniforms;
      v.uSightCenter.value.copy(center); v.uSightR.value = u.uSight.value + 2;
      v.uPLPos.value.set(center.x + 0.6, 2.4, center.z + 1.4); // the Shepherd's lantern catches the props beside it
    }
    const cx = Math.floor(center.x / CELL), cz = Math.floor(center.z / CELL);
    const key = cx + ',' + cz;
    if (key === this.lastCell || !this.kinds.length) return;
    this.lastCell = key;
    const kinds = this.kinds, total = kinds.reduce((a, k) => a + k.w, 0), counts = kinds.map(() => 0);
    this.lamps = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let x = cx - RANGE; x <= cx + RANGE; x++) {
      for (let z = cz - RANGE - 1; z <= cz + RANGE + 1; z++) {
        if (Math.abs(x) <= this.clear && Math.abs(z) <= this.clear) continue; // keep the spawn clear
        const r = hash2(x, z, 1);
        if (r > 0.5) continue;
        let pick = hash2(x, z, 2) * total, ti = 0;
        while (ti < kinds.length - 1 && pick >= kinds[ti].w) pick -= kinds[ti++].w;
        const k = kinds[ti];
        if (counts[ti] >= PER_TYPE) continue;
        p.set((x + 0.2 + hash2(x, z, 3) * 0.6) * CELL, 0, (z + 0.2 + hash2(x, z, 4) * 0.6) * CELL);
        q.setFromAxisAngle(up, hash2(x, z, 5) * Math.PI * 2);
        const sc = kinds === this.fallback ? 0.85 + hash2(x, z, 6) * 0.5 : 0.85 + hash2(x, z, 6) * 0.35;
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        k.mesh.setMatrixAt(counts[ti]++, m);
        if (k.light) this.lamps.push({ x: p.x, z: p.z, color: k.light.color, r: k.light.r * sc, i: k.light.i, ph: hash2(x, z, 7) * 6.283 });
      }
    }
    kinds.forEach((k, i) => { k.mesh.count = counts[i]; k.mesh.instanceMatrix.needsUpdate = true; });
  }

  /** Pixels per metre at depth 1 (engine.pointScale), for the weather's flakes. */
  setPointScale(ps) { this.weather.material.uniforms.uScale.value = ps; }

  // ground light pools
  beginLights() { this.lightCount = 0; }
  addLight(x, z, radius, intensity, color) {
    if (this.lightCount >= this.maxLights) return;
    const u = this.groundMat.uniforms;
    u.uLights.value[this.lightCount].set(x, z, radius, intensity);
    u.uLightCol.value[this.lightCount].copy(color);
    this.lightCount++;
  }
  endLights() {
    // the nearest flames and crystals take whatever light pools the run's own lights left
    if (this.lamps.length && this.lightCount < this.maxLights) {
      const c = this.center, t = this.time;
      const near = this.lamps.filter((l) => Math.abs(l.x - c.x) < 18 && Math.abs(l.z - c.z) < 22);
      near.sort((a, b) => (a.x - c.x) ** 2 + (a.z - c.z) ** 2 - (b.x - c.x) ** 2 - (b.z - c.z) ** 2);
      for (let i = 0; i < Math.min(PROP_LIGHTS, near.length); i++) {
        const l = near[i], f = 0.82 + 0.12 * Math.sin(t * 7.3 + l.ph) + 0.06 * Math.sin(t * 17.1 + l.ph * 2.0);
        this.addLight(l.x, l.z, l.r, l.i * f, l.color);
      }
    }
    this.groundMat.uniforms.uLightCount.value = this.lightCount;
  }

  dispose() {
    this.disposed = true; // floor textures and prop models are shared and stay cached
    this.ground.geometry.dispose(); this.groundMat.dispose(); this.propMat.dispose();
    for (const { mesh } of this.fallback) mesh.geometry.dispose();
    this.clearPainted();
    this.weather.dispose();
  }
}
