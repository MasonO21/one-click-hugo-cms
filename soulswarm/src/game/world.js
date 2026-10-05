// The endless graveyard: procedural ground, scattered decor and dynamic ground lights.
import * as THREE from 'three';
import { makeGroundMaterial, makeCharMaterial, addInstanceAttrs } from '../engine/materials.js';
import { propGeometry, PROP_TYPES } from '../engine/models.js';

const CELL = 6.5;
const RANGE = 5; // cells around the centre
const PER_TYPE = 70;

function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export class World {
  constructor(scene, chapter, { props = true, maxLights = 24 } = {}) {
    this.scene = scene;
    this.maxLights = maxLights;
    this.groundMat = makeGroundMaterial();
    const g = new THREE.PlaneGeometry(170, 170, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.frustumCulled = false;
    scene.add(this.ground);

    this.propMat = makeCharMaterial({ rim: 0x3d5a7a, emit: 2.6, ambient: 0x222a3c, key: 0x5a6a8a });
    this.props = {};
    if (props) {
      for (const t of PROP_TYPES) {
        const mesh = new THREE.InstancedMesh(propGeometry(t), this.propMat, PER_TYPE);
        mesh.count = 0;
        mesh.frustumCulled = false;
        const attrs = addInstanceAttrs(mesh, PER_TYPE);
        this.props[t] = { mesh, attrs };
        scene.add(mesh);
      }
    }
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
    this.propMat.uniforms.uRim.value.setHex(ch.rim).multiplyScalar(0.5);
    this.runeColor = new THREE.Color(ch.rune);
    this.chapter = ch;
    for (const { attrs } of Object.values(this.props)) {
      for (let i = 0; i < PER_TYPE; i++) attrs.tint.setXYZ(i, this.runeColor.r, this.runeColor.g, this.runeColor.b);
      attrs.tint.needsUpdate = true;
    }
    this.lastCell = null;
  }

  /** Keep the ground centred on the player and repopulate decor when the player crosses a cell. */
  update(center, time) {
    this.ground.position.set(center.x, 0, center.z);
    const u = this.groundMat.uniforms;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
    this.propMat.uniforms.uTime.value = time;
    const cx = Math.floor(center.x / CELL), cz = Math.floor(center.z / CELL);
    const key = cx + ',' + cz;
    if (key === this.lastCell || !Object.keys(this.props).length) return;
    this.lastCell = key;
    const counts = {};
    for (const t of PROP_TYPES) counts[t] = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (let x = cx - RANGE; x <= cx + RANGE; x++) {
      for (let z = cz - RANGE - 1; z <= cz + RANGE + 1; z++) {
        if (Math.abs(x) <= 0 && Math.abs(z) <= 0) continue; // keep the spawn clear
        const r = hash2(x, z, 1);
        if (r > 0.5) continue;
        const ti = Math.floor(hash2(x, z, 2) * PROP_TYPES.length);
        const t = PROP_TYPES[ti];
        if (counts[t] >= PER_TYPE) continue;
        p.set((x + 0.2 + hash2(x, z, 3) * 0.6) * CELL, 0, (z + 0.2 + hash2(x, z, 4) * 0.6) * CELL);
        q.setFromAxisAngle(up, hash2(x, z, 5) * Math.PI * 2);
        const sc = 0.85 + hash2(x, z, 6) * 0.5;
        s.set(sc, sc, sc);
        m.compose(p, q, s);
        this.props[t].mesh.setMatrixAt(counts[t]++, m);
      }
    }
    for (const t of PROP_TYPES) {
      const mesh = this.props[t].mesh;
      mesh.count = counts[t];
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ground light pools
  beginLights() { this.lightCount = 0; }
  addLight(x, z, radius, intensity, color) {
    if (this.lightCount >= this.maxLights) return;
    const u = this.groundMat.uniforms;
    u.uLights.value[this.lightCount].set(x, z, radius, intensity);
    u.uLightCol.value[this.lightCount].copy(color);
    this.lightCount++;
  }
  endLights() { this.groundMat.uniforms.uLightCount.value = this.lightCount; }

  dispose() {
    this.ground.geometry.dispose(); this.groundMat.dispose(); this.propMat.dispose();
    for (const { mesh } of Object.values(this.props)) mesh.geometry.dispose();
  }
}
