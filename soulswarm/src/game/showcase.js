// Home-screen backdrop: the selected Shepherd on a rune circle, orbited by a living soul swarm.
import * as THREE from 'three';
import { World } from './world.js';
import { makeCharMaterial, GlowSprites } from '../engine/materials.js';
import { heroGeometry } from '../engine/models.js';
import { heroModel, loadHeroModel, hasHeroModel, HeroRig } from '../engine/heromodels.js';
import { Particles } from '../engine/particles.js';
import { CHAPTERS, HEROES, SKINS } from './data.js';
import { makeRuneCircle } from './fxmeshes.js';

const WISPS = 34;

export class Showcase {
  constructor(engine) {
    this.engine = engine;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060b);
    this.camera = new THREE.PerspectiveCamera(34, 0.5, 0.1, 200);
    this.world = new World(this.scene, CHAPTERS[0], { maxLights: 12, clear: 1, budget: engine.particleBudget });
    this.center = new THREE.Vector3();
    this.mat = makeCharMaterial({ rim: 0x4ef2ff, emit: 2.6, anim: 0, ambient: 0x2a3550, key: 0x9aaad0 });
    this.pmat = null; // the painted-model material, made with the first model that loads
    this.ownGeo = true; // the procedural geometry is ours to dispose; painted ones are shared
    this.rig = null; // the animated painted model (idling), when the hero has one
    this.hero = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.scene.add(this.hero);
    this.circle = makeRuneCircle(2.2);
    this.circle.position.y = 0.03;
    this.scene.add(this.circle);
    this.glow = new GlowSprites(WISPS * 2 + 8);
    this.scene.add(this.glow.points);
    this.particles = new Particles(1500);
    this.scene.add(this.particles.points);
    this.wisps = Array.from({ length: WISPS }, (_, i) => ({
      r: 1.9 + Math.random() * 2.4, a: Math.random() * Math.PI * 2, s: (0.35 + Math.random() * 0.5) * (i % 5 === 0 ? -1 : 1),
      y: 0.4 + Math.random() * 2.0, ph: Math.random() * 6.28,
    }));
    this.color = new THREE.Color(0x4ef2ff);
    this.t = 0;
    this.heroId = null;
    this.chapterId = 1;
  }

  setHero(id, profile) {
    const p = profile || (window.__soulswarm && window.__soulswarm.profile);
    const skin = p && p.equippedSkin && SKINS[p.equippedSkin]?.hero === id ? SKINS[p.equippedSkin] : null;
    const hero = HEROES[id];
    const color = skin ? skin.color : hero.color;
    const key = id + (skin ? skin.name : '');
    if (this.heroKey !== key) {
      this.heroKey = key;
      const mkey = skin ? (hasHeroModel(p.equippedSkin) ? p.equippedSkin : null) : id;
      const ready = mkey && heroModel(mkey);
      this.showModel(ready, id, skin ? skin.body : hero.body);
      if (mkey && !ready) loadHeroModel(mkey).then((m) => { if (m && this.heroKey === key) this.showModel(m); });
      this.heroId = id;
      // arrival burst
      const c = new THREE.Color(color);
      this.particles.burst(0, 1, 0, 60, [c.r * 4, c.g * 4, c.b * 4], { speed: 5, life: 0.9, size: 0.35, up: 1.2 });
    }
    this.color.setHex(color);
    for (const m of [this.mat, this.pmat]) {
      if (!m) continue;
      m.uniforms.uTint.value.setHex(color); m.uniforms.uRim.value.setHex(color); m.uniforms.uPLColor.value.setHex(color);
    }
    this.circle.material.uniforms.uColor.value.setHex(color);
  }

  /** Shows a painted model (`m` from heromodels.js), or the procedural one for hero `id` when there is none yet. */
  showModel(m, id, body) {
    if (this.ownGeo) this.hero.geometry.dispose();
    if (this.rig) { this.rig.dispose(); this.rig = null; }
    if (m) {
      if (!this.pmat) {
        this.pmat = makeCharMaterial({ map: m.map, glow: m.glow, rim: 0x4ef2ff, emit: 2.6, anim: 0, ambient: 0xc4c6d2, key: 0xe2e4ee });
        const u = this.mat.uniforms, v = this.pmat.uniforms;
        v.uTint.value.copy(u.uTint.value); v.uRim.value.copy(u.uRim.value); v.uPLColor.value.copy(u.uPLColor.value);
      }
      this.pmat.uniforms.uMap.value = m.map;
      this.pmat.uniforms.uGlow.value = m.glow;
      this.hero.geometry = m.geometry; this.hero.material = this.pmat; this.ownGeo = false;
      if (m.rig) { this.rig = new HeroRig(m, this.pmat); this.scene.add(this.rig.root); }
    } else {
      this.hero.geometry = heroGeometry(id, body); this.hero.material = this.mat; this.ownGeo = true;
    }
    this.hero.visible = !this.rig;
  }

  setChapter(id) {
    if (id === this.chapterId) return;
    this.chapterId = id;
    this.world.setChapter(CHAPTERS[id - 1]);
  }

  resize(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = 38;
    // Frame by visible width so the hero reads the same on tall phones and tablets.
    const halfW = 2.7;
    const dist = THREE.MathUtils.clamp(halfW / (Math.tan(THREE.MathUtils.degToRad(19)) * aspect), 8, 24);
    this.camera.position.set(0, 1.5 + dist * 0.36, dist);
    this.camera.lookAt(0, 1.0, 0);
    // shift the image up so the hero sits in the upper-middle (menus own the bottom)
    this.camera.setViewOffset(w, h, 0, h * 0.13, w, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.world.update(this.center, t);
    this.hero.material.uniforms.uTime.value = t;
    const body = this.rig ? this.rig.root : this.hero;
    body.rotation.y = Math.sin(t * 0.4) * 0.5 + 0.2;
    body.position.y = this.rig ? 0 : Math.sin(t * 1.6) * 0.04; // a rig breathes with its idle
    if (this.rig) this.rig.update(dt);
    this.circle.rotation.y = t * 0.25;
    this.circle.material.uniforms.uTime.value = t;
    this.hero.material.uniforms.uPLPos.value.set(0.5, 2.0, 1.6);

    const c = this.color;
    const g = this.glow;
    g.begin();
    this.world.beginLights();
    this.world.addLight(0, 0, 6, 0.6, c);
    for (const w of this.wisps) {
      w.a += w.s * dt;
      const x = Math.cos(w.a) * w.r, z = Math.sin(w.a) * w.r;
      const y = w.y + Math.sin(t * 2 + w.ph) * 0.25;
      g.add(x, y, z, 0.42, c.r * 1.2, c.g * 1.2, c.b * 1.2, 0.7);
      g.add(x, y, z, 0.12, 2.2, 2.4, 2.5, 1);
      if (Math.random() < dt * 6) this.particles.emit(x, y, z, 0, 0.3, 0, 0.8, 0.22, 0.02, c.r * 2, c.g * 2, c.b * 2, 0.8, 0, -0.2);
    }
    for (let i = 0; i < 4; i++) {
      const w = this.wisps[i * 9];
      this.world.addLight(Math.cos(w.a) * w.r, Math.sin(w.a) * w.r, 3, 0.35, c);
    }
    this.world.endLights();
    // drifting embers
    if (Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 7;
      this.particles.emit(Math.cos(a) * r, 0.1, Math.sin(a) * r, (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 3, 0.16, 0.02, 3.2, 1.2, 0.4, 0.8, 0.2, 0);
    }
    g.end();
    const ps = this.engine.pointScale(this.camera);
    g.material.uniforms.uScale.value = ps;
    this.particles.material.uniforms.uScale.value = ps;
    this.world.setPointScale(ps);
    this.particles.update(dt);
  }
}
