/*
 * Rainkeep: the Dunes in 3D. Renders the world map behind world.js's canvas,
 * which turns into the overlay for badges and march labels. world.js keeps the
 * rules (tiles, marches, raids); this file only draws them and answers picking
 * and panning. Without WebGL world.js draws the map in 2D instead.
 */
'use strict';
(function () {
  const KH = window.KH, A = KH.A3;
  if (!A || !A.ok) return;
  const THREE = A.THREE;
  const { $, clamp, seeded, fmtTime } = KH.u;
  const { UI } = KH;
  const { smooth, lerp } = A;
  const V3 = THREE.Vector3, Col = THREE.Color;
  const W = DATA.world, N = W.size, C = Math.floor(N / 2), TS = 4;
  let S = null;
  const W3 = (KH.world3d = { active: false });
  const cv = $('#world3d'), ov = $('#worldmap');
  let renderer, scene, cam, sun, hemi, sky, terrain, haze, sel, keepGlow;
  let VW = 0, VH = 0, DPR = 1, octx = null;
  const view = { tx: 0, tz: 0, zoom: 1 };
  const tiles = {};
  W3.tiles = tiles; // for tests
  const marches = {};
  const icons = {};
  const tmp = new V3();
  const wx = (x) => (x - C) * TS, wz = (y) => (y - C) * TS;
  let hAt = () => 0;

  // ======================================================================
  // Models for map tiles
  // ======================================================================
  const CLS = { guard: ['#c27a3a', '#7a3f1c'], bow: ['#8a6ad0', '#4a2f80'], lancer: ['#2fa89a', '#16605a'] };
  const blob = (r) => { const m = new THREE.Mesh(A.geo(`blob${r}`, () => new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#3a1a08', transparent: true, opacity: 0.28, depthWrite: false })); m.position.y = 0.04; return m; };
  // the painted beasts (models3d.js), by name: [model, how many, size (body length, or wingspan)]; the Dust
  // Wraith stays a drawn spirit, and the drawn beasts stand in until a model has loaded
  const BEAST_GLB = [[/jackal/i, 'b-jackal', 3, 1.7], [/lion/i, 'b-lion', 1, 3.0], [/oryx/i, 'b-oryx', 1, 2.8], [/tortoise/i, 'b-tortoise', 1, 2.6], [/vulture/i, 'b-vulture', 3, 2.0]];
  const beastGlb = (name) => (A.models ? BEAST_GLB.find((b) => b[0].test(name || '')) : null);
  const glbReady = (t) => { const b = t.kind === 'beast' && beastGlb(t.name); return !!(b && A.models.want([b[1]])); };
  function glbBeast(t) {
    const [, id, n, size] = beastGlb(t.name), bird = id === 'b-vulture';
    const g = new THREE.Group();
    g.add(blob(1.1));
    const body = new THREE.Group();
    body.userData.dyn = true;
    const list = [];
    for (let i = 0; i < n; i++) {
      const o = A.models.instance(id, size * (bird ? 1 : 1 - i * 0.08));
      o.rotation.order = 'YXZ';
      // a pack spreads out over the tile
      if (n > 1 && !bird) { const a = i * 2.1 + 0.4; o.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8); o.rotation.y = a + 1.2; }
      body.add(o);
      list.push(o);
    }
    g.add(body);
    g.userData.body = body;
    g.userData.glb = { list, bird };
    g.rotation.y = 0.6;
    return g;
  }
  // a pack paces about (walking while it turns), vultures circle overhead with a few wingbeats now and then
  function animGlbBeast(ud, t, v) {
    const { list, bird } = ud.glb;
    if (bird) {
      list.forEach((o, i) => {
        const a = t * 0.6 + i * 2.09 + v * 6;
        o.position.set(Math.cos(a) * 1.1, 2.4 + Math.sin(t * 1.3 + i) * 0.25, Math.sin(a) * 1.1);
        o.rotation.set(0, -a, -0.3);
        A.animAnimal(o, t, (t + i * 1.7 + v * 5) % 5 < 1.4 ? 'flap' : 'glide');
      });
      return;
    }
    const turn = Math.cos(t * 0.5 + v * 9);
    ud.body.rotation.y = Math.sin(t * 0.5 + v * 9) * 0.5;
    list.forEach((o, i) => A.animAnimal(o, t + i * 0.7, Math.abs(turn) > 0.45 ? 'walk' : 'sit', 0.45));
  }
  function beastModel(t) {
    if (glbReady(t)) return glbBeast(t);
    const kind = KH.art.archetype(t.name || '');
    const [c1, c2] = CLS[t.cls] || CLS.guard;
    const m1 = A.mat(c1, { flat: true }), m2 = A.mat(c2, { flat: true }), eye = A.mat('#ffe08a', { e: '#ffcf6e', ei: 1.2 });
    const g = new THREE.Group();
    g.add(blob(1.1));
    const body = new THREE.Group();
    body.userData.dyn = true;
    if (kind === 'scorpion') {
      const b = A.sph(0.5, m1, 0, 0.45, 0, 8); b.scale.set(1.2, 0.6, 1.5); body.add(b);
      for (let i = 0; i < 5; i++) { const a = (i / 4) * Math.PI * 0.95; body.add(A.sph(0.2 - i * 0.015, m2, 0, 0.5 + Math.sin(a) * 1.0, -0.7 - Math.cos(a) * 0.1 - Math.sin(a * 0.5) * 0.6 + i * 0.05, 6)); }
      body.add(A.cone(0.09, 0.3, A.mat('#ffcf6e', { flat: true }), 0, 1.5, -0.45, 5));
      for (const s of [-1, 1]) { body.add(A.sph(0.22, m2, s * 0.55, 0.45, 0.85, 6)); for (let k = 0; k < 3; k++) body.add(A.rod(new V3(s * 0.4, 0.4, 0.2 - k * 0.3), new V3(s * 0.85, 0.05, 0.3 - k * 0.35), 0.05, m2)); }
      body.add(A.sph(0.06, eye, 0.12, 0.62, 0.62, 5), A.sph(0.06, eye, -0.12, 0.62, 0.62, 5));
    } else if (kind === 'serpent') {
      for (let i = 0; i < 9; i++) { const a = i * 0.75; body.add(A.sph(0.32 - i * 0.012, i % 2 ? m1 : m2, Math.cos(a) * (0.75 - i * 0.05), 0.3 + i * 0.12, Math.sin(a) * (0.75 - i * 0.05), 7)); }
      const h = A.sph(0.32, m1, 0.1, 1.55, 0.25, 8); h.scale.set(1, 0.8, 1.4); body.add(h);
      body.add(A.sph(0.06, eye, 0.18, 1.65, 0.6, 5), A.sph(0.06, eye, -0.02, 1.65, 0.62, 5));
    } else if (kind === 'spirit') {
      const ghost = new THREE.MeshStandardMaterial({ color: c1, transparent: true, opacity: 0.75, emissive: c1, emissiveIntensity: 0.35, flatShading: true });
      body.add(A.cone(0.55, 1.8, ghost, 0, 0.3, 0, 7));
      body.add(A.sph(0.36, ghost, 0, 2.05, 0, 8));
      body.add(A.sph(0.07, eye, 0.13, 2.08, 0.3, 5), A.sph(0.07, eye, -0.13, 2.08, 0.3, 5));
      body.position.y = 0.2;
    } else if (kind === 'construct') {
      body.add(A.box(1.0, 1.1, 0.7, m1, 0, 0.5, 0), A.box(0.6, 0.5, 0.5, m1, 0, 1.6, 0), A.box(0.32, 1.0, 0.32, m2, 0.72, 0.6, 0), A.box(0.32, 1.0, 0.32, m2, -0.72, 0.6, 0));
      body.add(A.box(0.3, 0.5, 0.3, m2, 0.25, 0, 0), A.box(0.3, 0.5, 0.3, m2, -0.25, 0, 0));
      body.add(A.sph(0.16, eye, 0, 1.05, 0.36, 6), A.box(0.38, 0.08, 0.05, eye, 0, 1.78, 0.26));
    } else if (kind === 'raider') {
      for (let i = 0; i < 3; i++) { const p = A.person(i + 50, { robe: c2, wrap: '#2a1608' }); p.position.set((i - 1) * 0.6, 0, (i % 2) * 0.4); p.scale.setScalar(1.4); body.add(p); body.add(A.rod(new V3((i - 1) * 0.6 + 0.2, 0, (i % 2) * 0.4), new V3((i - 1) * 0.6 + 0.25, 1.6, (i % 2) * 0.4), 0.03, A.mat('#6b4426'))); }
    } else {
      // four-legged beast: jackals, lions, oryx
      const b = A.sph(0.45, m1, 0, 0.85, 0, 8); b.scale.set(0.9, 0.75, 1.5); body.add(b);
      const h = A.sph(0.3, m1, 0, 1.15, 0.75, 8); h.scale.set(0.9, 0.85, 1.2); body.add(h);
      body.add(A.sph(0.16, m2, 0, 1.05, 1.08, 6));
      body.add(A.cone(0.1, 0.32, m2, 0.16, 1.32, 0.68, 4), A.cone(0.1, 0.32, m2, -0.16, 1.32, 0.68, 4));
      for (const [x, z] of [[0.22, 0.45], [-0.22, 0.45], [0.22, -0.45], [-0.22, -0.45]]) body.add(A.cyl(0.07, 0.06, 0.6, m2, x, 0, z, 5));
      body.add(A.rod(new V3(0, 0.95, -0.6), new V3(0, 0.6, -1.0), 0.06, m2));
      body.add(A.sph(0.05, eye, 0.12, 1.22, 0.98, 5), A.sph(0.05, eye, -0.12, 1.22, 0.98, 5));
      if (/oryx|horn/i.test(t.name || '')) body.add(A.rod(new V3(0.1, 1.35, 0.7), new V3(0.15, 1.95, 0.45), 0.03, A.mat('#2a1608')), A.rod(new V3(-0.1, 1.35, 0.7), new V3(-0.15, 1.95, 0.45), 0.03, A.mat('#2a1608')));
    }
    g.add(body);
    g.userData.body = body;
    g.rotation.y = 0.6;
    return g;
  }
  // a rival keep (rivals.js): the painted fort once it has loaded, a drawn one until then; its banner in the
  // rival's colour, and a turquoise dome while it holds a Peace Shield
  function rivalModel(b, t) {
    const r = KH.rivals.list()[b.id], col = r ? r.color : '#b5452a';
    const g = new THREE.Group();
    g.add(blob(1.8));
    const fort = A.models && A.models.ready('s-fort') ? A.models.instance('s-fort', 3.2) : null;
    if (fort) { fort.rotation.y = -0.5; fort.userData.dyn = true; g.add(fort); } else {
      const wall = A.mat('#c9a06a', { flat: true }), cap = A.mat('#e0bd86', { flat: true }), dome = A.mat('#2fb8a8', { flat: true, r: 0.4 });
      g.add(A.box(2.4, 0.7, 0.25, wall, 0, 0, 1.1), A.box(2.4, 0.7, 0.25, wall, 0, 0, -1.1), A.box(0.25, 0.7, 2.4, wall, 1.1, 0, 0), A.box(0.25, 0.7, 2.4, wall, -1.1, 0, 0));
      for (const [x, z] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) { g.add(A.cyl(0.26, 0.3, 1.1, cap, x, 0, z, 8)); g.add(A.cone(0.32, 0.45, dome, x, 1.1, z, 8)); }
      g.add(A.box(1.0, 0.8, 1.0, cap, 0, 0, 0), A.sph(0.45, dome, 0, 0.8, 0, 10));
    }
    const flag = A.banner(col, 1.9, 0.6, 0.38);
    flag.position.set(0.7, 0.2, -0.7);
    g.add(flag);
    g.userData.banner = flag;
    if (t.shield) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#46d6d0', emissive: '#1f9a8e', emissiveIntensity: 0.6, transparent: true, opacity: 0.28, depthWrite: false }));
      sh.userData.dyn = true;
      g.add(sh);
      g.userData.glow = sh.material;
    }
    return g;
  }
  // a watchtower report (intel.js): a signpost with a turquoise pennant in a ring of gold light, and a sign of the job
  function intelModel(r) {
    const g = new THREE.Group(), wood = A.mat(A.P.woodD), gold = A.mat('#e8b54a', { m: 0.6, r: 0.35 }), cloth = A.mat('#2fb8a8', { flat: true });
    g.add(blob(1.2));
    g.add(A.cyl(0.06, 0.08, 2.4, wood, -0.6, 0, -0.3, 6), A.box(0.7, 0.4, 0.04, cloth, -0.22, 1.9, -0.3));
    const ring = new THREE.Mesh(A.geo('ivring', () => new THREE.TorusGeometry(1.15, 0.07, 6, 28).rotateX(Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#ffcf6e', transparent: true, opacity: 0.8 }));
    ring.position.y = 0.08; ring.userData.dyn = true; g.add(ring);
    g.userData.ring = ring;
    const k = r.kind;
    if (k === 'rescue') {
      const tent = A.cone(0.7, 0.9, A.mat('#c9b48a', { flat: true }), 0.35, 0, 0.2, 6); g.add(tent);
      for (let i = 0; i < 2; i++) { const p = A.person(500 + r.id * 3 + i, { robe: ['#6a8fb8', '#b86a5a'][i], wrap: '#e8dcc0', kind: 'villager' }); p.scale.setScalar(0.9); p.position.set(-0.1 + i * 0.6, 0, 0.6); p.rotation.y = 0.4; p.userData.dyn = true; g.add(p); }
    } else if (k === 'hunt') {
      g.add(A.rock(0.55, 3, '#a87a4e'));
      for (let i = 0; i < 4; i++) g.add(A.cyl(0.05, 0.04, 0.6, A.mat('#eae0c8', { flat: true }), 0.3 + i * 0.16, 0.05, 0.5 - i * 0.1, 5));
      g.add(A.sph(0.2, A.mat('#eae0c8', { flat: true }), 0.1, 0.12, 0.7, 6));
    } else if (k === 'caravan') {
      const c = A.camel(600 + r.id, { cloth: '#2f6f9a', load: true }); c.scale.setScalar(0.8); c.position.set(0.3, 0, 0.3); c.rotation.y = 1.1; c.userData.dyn = true; g.add(c);
      g.add(A.box(0.4, 0.3, 0.3, A.mat('#8a5a2a', { flat: true }), -0.2, 0, 0.7), A.box(0.3, 0.25, 0.3, A.mat('#a8743a', { flat: true }), 0.25, 0, 0.9));
    } else if (k === 'relic') {
      g.add(A.cyl(0.3, 0.2, 0.55, gold, 0.3, 0, 0.3, 10), A.sph(0.22, gold, 0.3, 0.55, 0.3, 10));
      const glint = new THREE.Mesh(A.geo('ivglint', () => new THREE.CylinderGeometry(0.15, 0.45, 4.5, 10, 1, true)), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      glint.position.set(0.3, 2.4, 0.3); glint.userData.dyn = true; g.add(glint);
    } else if (k === 'bounty') {
      g.add(A.cone(0.8, 1.1, A.mat('#7a2a1a', { flat: true }), 0.35, 0, 0.2, 6));
      const flag = A.banner('#b8331c', 1.6, 0.5, 0.32); flag.position.set(0.9, 0.1, -0.2); g.add(flag); g.userData.banner = flag;
    } else {
      const p = A.palm(2.0, r.id * 7); p.position.set(0.4, 0, 0.2); g.add(p);
      g.add(A.box(0.5, 0.45, 0.5, A.mat('#d8c4a0', { flat: true }), -0.1, 0, 0.6), A.sph(0.28, A.mat('#2fb8a8', { flat: true }), -0.1, 0.45, 0.6, 8));
    }
    return g;
  }
  // a Saltborn Hive (Act II): white crystal spires around a dark mouth
  function hiveModel(t) {
    const g = new THREE.Group();
    g.add(blob(1.7));
    const salt = A.mat('#f1f5f8', { flat: true, r: 0.35 }), saltD = A.mat('#c4d2dc', { flat: true, r: 0.5 });
    g.add(A.cyl(1.25, 1.45, 0.25, A.mat('#d8d2c4', { flat: true }), 0, 0, 0, 9));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + t.v, rr = i % 3 === 0 ? 0.35 : 0.95, h = i % 3 === 0 ? 2.6 : 1.1 + ((i * 7) % 4) * 0.25;
      const c = A.cone(0.2 + (i % 3 === 0 ? 0.12 : 0), h, i % 2 ? salt : saltD, Math.cos(a) * rr, 0.2, Math.sin(a) * rr, 5);
      c.rotation.z = Math.cos(a) * 0.18; c.rotation.x = Math.sin(a) * 0.18;
      g.add(c);
    }
    g.add(A.cyl(0.32, 0.38, 0.1, A.mat('#1a2630'), 0.6, 0.25, 0.6, 8));
    const eye = new THREE.MeshBasicMaterial({ color: '#9fe0ff', transparent: true, opacity: 0.9 });
    const glow = A.sph(0.22, eye, 0.6, 0.45, 0.6, 8);
    glow.userData.dyn = true;
    g.add(glow);
    g.userData.hive = glow;
    return g;
  }
  function campModel() {
    const g = new THREE.Group();
    g.add(blob(1.6));
    const cloth = A.mat('#7a2a1a', { flat: true, map: A.tex.stripes('#7a2a1a', '#2a1608', 6) });
    for (const [x, z, s] of [[-0.7, -0.4, 1], [0.8, -0.3, 0.85], [0, 0.6, 0.75]]) g.add(A.cone(0.75 * s, 1.1 * s, cloth, x, 0, z, 6));
    g.add(A.cyl(0.3, 0.35, 0.12, A.mat('#3a2a1a', { flat: true }), 0.9, 0, 0.75, 7));
    const fire = A.cone(0.22, 0.5, new THREE.MeshBasicMaterial({ color: '#ffb04a' }), 0.9, 0.12, 0.75, 5);
    fire.userData.dyn = true;
    g.add(fire);
    g.userData.fire = fire;
    const b = A.banner('#c0392b', 2.0, 0.6, 0.4);
    b.position.set(-1.2, 0, 0.6);
    g.add(b);
    g.userData.banner = b;
    return g;
  }
  function ruinModel(t) {
    const g = new THREE.Group(), r = seeded((t.x * 31 + t.y * 17) >>> 0);
    const st = A.mat('#c9a070', { flat: true }), stD = A.mat('#a8804e', { flat: true });
    g.add(blob(1.4));
    g.add(A.box(0.45, 2.0, 0.45, st, -0.75, 0, 0), A.box(0.45, 1.4, 0.45, stD, 0.75, 0, 0));
    g.add(A.box(1.0, 0.35, 0.5, st, -0.35, 2.0, 0));
    const fallen = A.cyl(0.22, 0.22, 1.3, stD, 0.6, 0.22, 0.9, 8);
    fallen.rotation.z = Math.PI / 2; fallen.rotation.y = r() * 2;
    g.add(fallen);
    g.add(A.rock(0.35, 2, '#b89060'));
    g.children[g.children.length - 1].position.set(-0.2, 0.1, 0.9);
    const beam = new THREE.Mesh(A.geo('beam', () => new THREE.CylinderGeometry(0.5, 0.9, 7, 12, 1, true)), new THREE.MeshBasicMaterial({ color: '#8fe4ff', transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.5;
    beam.userData.dyn = true;
    g.add(beam);
    g.userData.beam = beam;
    return g;
  }
  function nodeModel(t) {
    const g = new THREE.Group(), seed = t.x * 7 + t.y * 13;
    g.add(blob(1.3));
    if (t.res === 'stone') {
      const m = A.mat('#d4a56c', { flat: true }), m2 = A.mat('#b8844e', { flat: true });
      g.add(A.box(1.6, 0.9, 1.1, m, -0.2, 0, -0.3), A.box(1.0, 0.6, 0.8, m2, 0.1, 0.9, -0.3));
      for (let i = 0; i < 4; i++) g.add(A.box(0.45, 0.3, 0.32, A.mat('#e6bd84', { flat: true }), 0.7 + (i % 2) * 0.48 - 0.2, Math.floor(i / 2) * 0.3, 0.6));
    } else if (t.res === 'food') {
      [[-0.6, -0.4, 2.4], [0.5, -0.6, 2.8], [0.1, 0.5, 2.0]].forEach(([x, z, h], i) => { const p = A.palm(h, seed + i); p.position.set(x, 0, z); g.add(p); });
      const pond = new THREE.Mesh(A.geo('pond', () => new THREE.CircleGeometry(0.75, 18).rotateX(-Math.PI / 2)), A.waterMat({ radial: true, scale: 2 }));
      pond.position.set(0.7, 0.08, 0.6);
      pond.userData.keep = true;
      g.add(pond);
    } else if (t.res === 'water') {
      // in Act II the rains flood the springs: a wider pool with reeds all round
      const R = t.flooded ? 1.75 : 1.25;
      const pool = new THREE.Mesh(A.geo(`spring${R}`, () => new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2)), A.waterMat({ radial: true, scale: 2 }));
      pool.position.y = 0.1;
      pool.userData.keep = true;
      g.add(pool);
      for (let i = 0; i < (t.flooded ? 13 : 9); i++) { const a = (i / (t.flooded ? 13 : 9)) * Math.PI * 2; const rk = A.rock(0.28, i, '#b98a5a'); rk.position.set(Math.cos(a) * (R + 0.1), 0.08, Math.sin(a) * (R + 0.1)); g.add(rk); }
      if (t.flooded) g.add(A.reeds(14, 1.7, seed + 5));
      g.add(A.reeds(10, 1.2, seed));
      const p = A.palm(2.4, seed); p.position.set(-1.3, 0, -0.9); g.add(p);
    } else if (t.res === 'sunsteel') {
      // a Sunsteel vein: golden crystals pushing out of washed-out sand
      g.add(A.rock(0.7, 2, '#8a6a44'));
      g.children[g.children.length - 1].position.set(0, 0.2, -0.3);
      const gold = new THREE.MeshStandardMaterial({ color: '#ffd36e', emissive: '#e8a83a', emissiveIntensity: 0.6, roughness: 0.25, metalness: 0.6, flatShading: true });
      for (let i = 0; i < 7; i++) { const h = 0.6 + ((i * 37) % 5) * 0.18; const c = A.cone(0.16, h, gold, Math.cos(i * 2.4) * 0.55, 0, Math.sin(i * 2.4) * 0.45 + 0.1, 5); c.rotation.z = Math.cos(i * 1.7) * 0.35; c.rotation.x = Math.sin(i * 1.3) * 0.3; g.add(c); }
      g.userData.glow = gold;
    } else {
      g.add(A.rock(0.9, 1, '#9a6440'));
      g.children[g.children.length - 1].position.set(-0.3, 0.3, -0.2);
      const cu = A.mat('#c7743a', { flat: true, r: 0.45, m: 0.45 }), pat = A.mat('#4fc0a0', { flat: true, e: '#2a8a70', ei: 0.4 });
      for (let i = 0; i < 6; i++) { const c = A.cone(0.14, 0.6 + (i % 3) * 0.2, i % 2 ? cu : pat, 0.4 + (i % 3) * 0.3 - 0.3, 0, 0.3 + Math.floor(i / 3) * 0.35, 5); c.rotation.z = (i % 2 ? 1 : -1) * 0.3; g.add(c); }
    }
    return g;
  }
  function keepModel() {
    const g = new THREE.Group();
    g.add(blob(3.2));
    const wall = A.mat(A.P.adobeD, { flat: true }), top = A.mat(A.P.adobe, { flat: true });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const seg = A.box(1.25, 0.7, 0.3, wall, 0, 0, 0);
      const h = A.grp(seg, A.box(1.3, 0.1, 0.36, top, 0, 0.7, 0));
      h.position.set(Math.cos(a) * 2.9, 0, Math.sin(a) * 2.9);
      h.rotation.y = -a + Math.PI / 2;
      if (i !== 4) g.add(h);
    }
    for (const a of [0.4, 2.0, 3.6, 5.2]) g.add(A.grp(A.cyl(0.35, 0.42, 1.3, wall, 0, 0, 0, 8), A.cone(0.45, 0.4, A.mat(A.P.cloth1, { flat: true }), 0, 1.3, 0, 8)).translateX(Math.cos(a) * 2.95).translateZ(Math.sin(a) * 2.95));
    g.add(A.at(A.house(1.0, 0.8, 0.9), -1.2, 0, -1.1), A.at(A.house(0.9, 0.7, 0.8, { wall: A.P.adobeL }), 1.3, 0, -0.9), A.at(A.house(0.8, 0.6, 0.8), 1.1, 0, 1.1));
    g.add(A.grp(A.cyl(0.35, 0.37, 0.9, A.mat(A.P.plaster), 0, 0, 0, 10), A.dome(0.37, A.mat(A.P.tile, { r: 0.35 }), 0, 0.9, 0, 12)).translateX(-1.3).translateZ(0.9));
    const pool = new THREE.Mesh(A.geo('kpool', () => new THREE.CircleGeometry(0.85, 24).rotateX(-Math.PI / 2)), A.waterMat({ radial: true, scale: 2 }));
    pool.position.y = 0.1;
    pool.userData.keep = true;
    g.add(pool);
    const p = A.palm(2.2, 9); p.position.set(0.2, 0, -1.6); g.add(p);
    return g;
  }
  function decorModel(t) {
    const g = new THREE.Group();
    if (t.decor === 'palm') {
      const n = t.v > 0.6 ? 2 : 1;
      for (let i = 0; i < n; i++) { const p = A.palm(1.8 + t.v * 1.1, t.x * 3 + t.y + i, { dates: false }); p.position.set(i ? 0.7 : -0.3, 0, i ? 0.5 : -0.2); g.add(p); }
      if (t.v < 0.3) { g.add(A.rock(0.3, t.x, '#b98a5a')); g.children[g.children.length - 1].position.set(0.9, 0.08, -0.6); }
    }
    else if (t.decor === 'rock') { g.add(A.rock(0.6 + t.v * 0.5, t.x + t.y, '#b98a5a')); g.children[0].position.y = 0.2; }
    return g;
  }

  // ======================================================================
  // Setup
  // ======================================================================
  function init() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    } catch (e) { return false; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#e6c48c', 60, 140);
    cam = new THREE.PerspectiveCamera(38, 1, 0.5, 500);
    hemi = new THREE.HemisphereLight('#d2ecff', '#d9a060', 1.2);
    sun = new THREE.DirectionalLight('#fff0d4', 2.8);
    scene.add(hemi, sun, sun.target);
    sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), A.skyMat());
    scene.add(sky);
    terrain = A.terrain({ size: N * TS + 80, seg: 130, amp: 1.3, seed: 2 });
    hAt = terrain.userData.height;
    scene.add(terrain);
    buildDecor();
    // the keep at the centre
    const keep = keepModel();
    keep.position.set(0, hAt(0, 0), 0);
    scene.add(A.bake(keep));
    keepGlow = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    keepGlow.position.y = 0.2;
    scene.add(keepGlow);
    // dust haze over everything past clear sight
    haze = [0.9, 2.2, 3.6].map((y, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(N * TS + 120, N * TS + 120).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        uniforms: { uR: { value: 10 }, uT: { value: 0 }, uCol: { value: new Col('#e8c48e') }, uK: { value: i } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float uR, uT, uK; uniform vec3 uCol; varying vec3 vW;
          float n(vec2 p){ return sin(p.x * 0.21 + uT * 0.3 + uK) * sin(p.y * 0.17 - uT * 0.23) * 0.5 + 0.5 + sin(p.x * 0.07 - p.y * 0.05 + uT * 0.1) * 0.25; }
          void main(){ float d = length(vW.xz); float edge = smoothstep(uR - 1.0, uR + 4.0, d); float a = edge * (0.42 + 0.3 * n(vW.xz + uK * 13.0)) * (1.0 - uK * 0.18);
            gl_FragColor = vec4(uCol * (0.95 + 0.1 * n(vW.xz * 2.0)), a);
            #include <colorspace_fragment>
          }`,
        transparent: true, depthWrite: false,
      }));
      m.position.y = y;
      m.renderOrder = 5 + i;
      scene.add(m);
      return m;
    });
    sel = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffcf6e', transparent: true, opacity: 0.9, depthWrite: false }));
    sel.visible = false;
    scene.add(sel);
    makeIcons();
    return true;
  }
  // decor on empty tiles (it depends on the map seed) is baked into a few meshes
  let decorG = null;
  function buildDecor() {
    if (decorG) scene.remove(decorG);
    const decor = new THREE.Group();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = KH.world.base(x, y);
      if (t.kind !== 'empty' || !t.decor) continue;
      const m = decorModel(t);
      m.position.set(wx(x), hAt(wx(x), wz(y)), wz(y));
      decor.add(m);
    }
    const r = seeded(77);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + r() * 0.2, d = N * TS * 0.62 + r() * 18;
      const m = A.mesa(4 + r() * 8, 4 + r() * 6, i + 30);
      m.position.set(Math.cos(a) * d, m.position.y, Math.sin(a) * d);
      decor.add(m);
    }
    decorG = A.bake(decor);
    scene.add(decorG);
  }
  function makeIcons() {
    const mk = (id, color) => {
      const sym = document.getElementById(id);
      if (!sym) return null;
      const img = new Image(), art = !color && KH.iconArt && KH.iconArt(id);
      // plain icons take the painting; tinted markers keep the drawn symbol
      if (art) { img.src = art; return img; }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" style="color:${color}">${((KH.iconSVG && KH.iconSVG[id]) || sym.innerHTML).replace(/currentColor/g, color)}</svg>`;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      return img;
    };
    icons.stone = mk('i-stone'); icons.food = mk('i-food'); icons.water = mk('i-water'); icons.copper = mk('i-copper'); icons.sunsteel = mk('i-sunsteel');
    icons.paw = mk('i-paw', '#ffd7c8'); icons.ruin = mk('i-ruin', '#e7f6ff'); icons.flag = mk('i-flag', '#ffb3a1'); icons.hive = mk('i-spire', '#eaf6ff'); icons.fort = mk('i-fort', '#ffd27a'); icons.intel = mk('i-intel', '#7ff0e0');
  }

  // ======================================================================
  // Sync tiles and marches with the game state
  // ======================================================================
  function syncTiles() {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const b = KH.world.base(x, y);
      if (b.kind === 'empty' || b.kind === 'keep') { if (tiles[b.k]) { scene.remove(tiles[b.k].g); delete tiles[b.k]; } continue; }
      const t = KH.world.tile(x, y);
      const key = `${b.kind}:${b.res || ''}:${b.salt ? 's' : ''}${b.flooded ? 'f' : ''}:${t.gone ? 'g' : 'a'}${glbReady(b) ? 'm' : ''}${t.shield ? 'S' : ''}${b.kind === 'intel' ? `${t.report.kind}${t.report.id}` : ''}${b.kind === 'rival' && A.models && A.models.want(['s-fort']) ? 'F' : ''}`;
      let e = tiles[b.k];
      if (e && e.key === key) continue;
      if (e) scene.remove(e.g);
      let g;
      if (b.kind === 'node') g = nodeModel(b);
      else if (b.kind === 'beast') g = beastModel(b);
      else if (b.kind === 'rival') g = rivalModel(b, t);
      else if (b.kind === 'intel') g = intelModel(t.report);
      else if (b.kind === 'camp') g = b.salt ? hiveModel(b) : campModel();
      else g = ruinModel(b);
      if (t.gone) {
        if (b.kind === 'node') { g.scale.setScalar(0.6); g.traverse((o) => { if (o.material && o.material.color && !o.material.uniforms) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.55); } }); }
        else if (b.kind === 'beast') { g = new THREE.Group(); g.add(A.rock(0.4, 3, '#a87a4e')); }
        else if (b.kind === 'camp') { g.traverse((o) => { if (o.material && o.material.color && !o.material.uniforms) { o.material = o.material.clone(); o.material.color.multiplyScalar(0.3); } }); if (g.userData.fire) g.userData.fire.visible = false; if (g.userData.hive) g.userData.hive.visible = false; }
        else if (g.userData.beam) g.userData.beam.visible = false;
      }
      g.position.set(wx(x), hAt(wx(x), wz(y)), wz(y));
      A.bake(g);
      scene.add(g);
      tiles[b.k] = { g, key, t: b };
    }
  }
  // Bloom (bloom.js): groves on open sand, rebuilt as they grow from seedlings to an oasis
  const groves = {};
  let grassMat = null;
  function groveModel(x, y, st) {
    const g = new THREE.Group(), seed = x * 11 + y * 17;
    grassMat = grassMat || A.mat('#6fa84a', { flat: true });
    const R = [0.9, 1.45, 1.8][st];
    const grass = new THREE.Mesh(A.geo(`grove${R}`, () => new THREE.CircleGeometry(R, 14).rotateX(-Math.PI / 2)), grassMat);
    grass.position.y = 0.06;
    g.add(grass);
    if (st === 0) {
      const leaf = A.mat('#8cc65a', { flat: true });
      for (let i = 0; i < 5; i++) { const c = A.cone(0.09, 0.35 + (i % 2) * 0.15, leaf, Math.cos(i * 1.3) * 0.45, 0, Math.sin(i * 1.3) * 0.45, 4); g.add(c); }
    } else {
      // a tile that already has dry palms keeps them; the grove fills in around them
      const own = KH.world.base(x, y).decor === 'palm' ? [] : null;
      const palms = own || (st === 1 ? [[-0.4, -0.2, 1.5], [0.5, 0.3, 1.2]] : [[-0.8, -0.5, 2.4], [0.7, -0.7, 2.0], [-0.2, 0.9, 2.2]]);
      palms.forEach(([px, pz, h], i) => { const p = A.palm(h, seed + i); p.position.set(px, 0, pz); g.add(p); });
      if (st === 2) {
        const pond = new THREE.Mesh(A.geo('grovepond', () => new THREE.CircleGeometry(0.62, 18).rotateX(-Math.PI / 2)), A.waterMat({ radial: true, scale: 2 }));
        pond.position.set(0.5, 0.1, 0.45);
        pond.userData.keep = true;
        g.add(pond);
        g.add(A.reeds(7, 0.9, seed));
        g.children[g.children.length - 1].position.set(0.5, 0, 0.45);
      }
    }
    return g;
  }
  function syncGroves() {
    if (!KH.bloom) return;
    const all = KH.bloom.groves();
    for (const k in groves) if (!all[k]) { scene.remove(groves[k].g); delete groves[k]; }
    for (const k in all) {
      const st = KH.bloom.stageOf(all[k]);
      if (groves[k] && groves[k].st === st) continue;
      if (groves[k]) scene.remove(groves[k].g);
      const [x, y] = k.split(',').map(Number);
      const g = groveModel(x, y, st);
      g.position.set(wx(x), hAt(wx(x), wz(y)), wz(y));
      A.bake(g);
      scene.add(g);
      groves[k] = { g, st };
    }
  }
  KH.on('plant', () => { if (W3.active) syncGroves(); });
  // Outposts (outposts.js): a palisade round the node, a tent, a lookout from Lv 3, and your banner
  const outs = {};
  function outpostModel(o) {
    const g = new THREE.Group(), wood = A.mat('#8a5a2e', { flat: true }), dark = A.mat('#5a3a1c', { flat: true });
    const R = 1.5, n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue; // the gate, facing the keep side
      const h = 0.55 + (i % 3) * 0.08 + o.lvl * 0.06;
      g.add(A.cyl(0.07, 0.08, h, i % 2 ? wood : dark, Math.cos(a) * R, 0, Math.sin(a) * R, 5));
    }
    const cloth = A.mat('#e8dcc0', { flat: true }), stripe = A.mat('#2fa8a0', { flat: true });
    g.add(A.cone(0.5, 0.75, cloth, -0.85, 0, 0.55, 6), A.cone(0.18, 0.2, stripe, -0.85, 0.68, 0.55, 6));
    if (o.lvl >= 3) {
      for (const [x, z] of [[0.9, -0.9], [1.25, -0.55], [0.55, -1.25]]) g.add(A.cyl(0.05, 0.05, 1.2, dark, x, 0, z, 4));
      g.add(A.box(0.75, 0.08, 0.75, wood, 0.9, 1.2, -0.9), A.box(0.75, 0.25, 0.06, wood, 0.9, 1.28, -0.55));
    }
    if (o.lvl >= 5) g.add(A.box(0.9, 0.5, 0.9, A.mat('#c9a06a', { flat: true }), -0.95, 0, -0.85), A.cyl(0.3, 0.34, 0.25, A.mat('#2fb8a8', { flat: true }), -0.95, 0.5, -0.85, 8));
    const flag = A.banner('#2fb8a8', 2.2 + o.lvl * 0.12, 0.6, 0.4);
    flag.position.set(-1.25, 0, -0.25);
    g.add(flag);
    return g;
  }
  function syncOutposts() {
    const all = KH.outposts ? KH.outposts.list() : [], live = new Set();
    for (const o of all) {
      live.add(o.k);
      if (outs[o.k] && outs[o.k].lvl === o.lvl) continue;
      if (outs[o.k]) scene.remove(outs[o.k].g);
      const g = outpostModel(o);
      g.position.set(wx(o.x), hAt(wx(o.x), wz(o.y)), wz(o.y));
      A.bake(g);
      scene.add(g);
      outs[o.k] = { g, lvl: o.lvl };
    }
    for (const k in outs) if (!live.has(k)) { scene.remove(outs[k].g); delete outs[k]; }
  }
  W3.outposts = outs; // for tests

  function syncMarches(t) {
    const live = new Set();
    const home = new V3(0, hAt(0, 0) + 0.2, 0);
    for (const m of S.map.marches) {
      live.add(m.id);
      let e = marches[m.id];
      if (!e) {
        const g = new THREE.Group();
        const c = A.camel(m.id, { cloth: m.kind === 'gather' ? '#e8b54a' : m.kind === 'ruin' ? '#2f7f9a' : '#b5452a', load: m.kind === 'gather' });
        c.scale.setScalar(0.75);
        const rider = A.person(m.id + 3, { robe: '#e8dcc4' });
        rider.position.set(-0.05, 1.05, 0);
        c.add(rider);
        g.add(c);
        const to = new V3(wx(m.x), 0.25, wz(m.y));
        const pts = [];
        for (let i = 0; i <= 24; i++) { const p = new V3(0, 0, 0).lerp(to, i / 24); p.y = hAt(p.x, p.z) + 0.35; pts.push(p); }
        const lg = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: m.kind === 'gather' ? '#ffcf6e' : m.kind === 'ruin' ? '#8fe4ff' : '#ff6b5e', dashSize: 0.7, gapSize: 0.5, transparent: true, opacity: 0.85 }));
        line.computeLineDistances();
        scene.add(g, line);
        e = marches[m.id] = { g, c, line, to };
      }
      const tr = KH.world.travel(m.x, m.y);
      let p;
      if (m.state === 'out') p = clamp((S.time - m.depart) / (m.arrive - m.depart), 0, 1);
      else if (m.state === 'work') p = 1;
      else p = clamp((m.back - S.time) / tr, 0, 1);
      const pos = home.clone().lerp(new V3(e.to.x, 0, e.to.z), p * 0.92);
      pos.y = hAt(pos.x, pos.z);
      e.g.position.copy(pos);
      const dir = m.state === 'back' ? -1 : 1;
      e.g.rotation.y = Math.atan2(-(e.to.z * dir), e.to.x * dir);
      A.walkCamel(e.c, t, m.state === 'work' ? 0 : 0.9);
    }
    for (const id of Object.keys(marches)) {
      if (live.has(Number(id))) continue;
      scene.remove(marches[id].g, marches[id].line);
      delete marches[id];
    }
  }

  // trade caravans (trade.js): a string of three camels heading for the edge of the map and back
  const traders = {};
  function syncTrade(t) {
    const live = new Set(), R = (C + 0.6) * TS;
    for (const r of KH.trade ? KH.trade.roads() : []) {
      live.add(r.id);
      let e = traders[r.id];
      if (!e) {
        const g = new THREE.Group(), cs = [];
        for (let i = 0; i < 3; i++) {
          const c = A.camel(r.id * 7 + i, { cloth: i ? '#e8dcc4' : r.color, load: true });
          c.scale.setScalar(0.7);
          c.position.x = -i * 1.1;
          if (!i) { const rider = A.person(r.id * 5, { robe: '#e8dcc4' }); rider.position.set(-0.05, 1.05, 0); c.add(rider); }
          g.add(c); cs.push(c);
        }
        scene.add(g);
        e = traders[r.id] = { g, cs };
      }
      const x = Math.cos(r.dir) * R * r.p, z = Math.sin(r.dir) * R * r.p;
      e.g.position.set(x, hAt(x, z), z);
      e.g.rotation.y = -r.dir + (r.back ? Math.PI : 0);
      e.g.visible = r.p > 0.04;
      for (const c of e.cs) A.walkCamel(c, t, 0.9);
    }
    for (const id of Object.keys(traders)) if (!live.has(Number(id))) { scene.remove(traders[id].g); delete traders[id]; }
  }

  // ======================================================================
  // Camera, panning, picking
  // ======================================================================
  const EL = 0.98;
  function camDist() { return (VH > VW ? 66 : 50) / view.zoom; }
  function place() {
    const d = camDist(), lim = C * TS;
    view.tx = clamp(view.tx, -lim, lim); view.tz = clamp(view.tz, -lim, lim);
    cam.position.set(view.tx, Math.sin(EL) * d, view.tz + Math.cos(EL) * d);
    cam.lookAt(view.tx, 0, view.tz);
    cam.updateMatrixWorld();
  }
  W3.pan = (dx, dy) => {
    const d = camDist(), k = (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / VH;
    view.tx -= dx * k;
    view.tz -= (dy * k) / Math.sin(EL);
  };
  W3.zoom = (f) => { view.zoom = clamp(view.zoom * f, 0.7, 2.2); };
  W3.center = () => { view.tx = 0; view.tz = 0; };
  W3.focus = (x, y) => { view.tx = wx(x); view.tz = wz(y) - 4; };
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new V3(0, 1, 0), 0);
  W3.pick = (px, py) => {
    ray.setFromCamera(new THREE.Vector2((px / VW) * 2 - 1, -(py / VH) * 2 + 1), cam);
    const p = new V3();
    if (!ray.ray.intersectPlane(ground, p)) return null;
    // lift the hit toward the object tops: models stand about a tile-quarter tall
    const x = Math.round(p.x / TS + C), y = Math.round((p.z - 0.6) / TS + C);
    if (x < 0 || y < 0 || x >= N || y >= N) return null;
    return KH.world.key(x, y);
  };
  function resize() {
    if (!renderer) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    renderer.setPixelRatio(DPR);
    renderer.setSize(VW, VH, false);
    cam.aspect = VW / VH;
    cam.updateProjectionMatrix();
  }

  // ======================================================================
  // Overlay: level badges, busy targets, march timers
  // ======================================================================
  function ell(x, y, rx, ry) { octx.beginPath(); octx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
  function badge(x, y, img, lvl, col, dim) {
    const g = octx;
    g.globalAlpha = dim ? 0.45 : 1;
    g.fillStyle = 'rgba(40,22,10,.85)'; ell(x, y, 13, 13); g.fill();
    g.strokeStyle = col; g.lineWidth = 2; ell(x, y, 13, 13); g.stroke();
    if (img && img.complete) g.drawImage(img, x - 9, y - 9, 18, 18);
    if (lvl != null) {
      g.fillStyle = col; ell(x + 11, y + 9, 7.5, 7.5); g.fill();
      g.fillStyle = '#2a1608'; g.font = "800 9.5px 'Barlow Semi Condensed', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(lvl), x + 11, y + 9.5);
    }
    g.globalAlpha = 1;
  }
  function screen(x, y, z) {
    tmp.set(x, y, z).project(cam);
    return [(tmp.x * 0.5 + 0.5) * VW, (-tmp.y * 0.5 + 0.5) * VH, tmp.z];
  }
  function overlay(t) {
    const g = octx;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, VW, VH);
    const busy = new Set(S.map.marches.map((m) => KH.world.key(m.x, m.y)));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const b = KH.world.base(x, y);
      if (b.kind === 'empty' || b.kind === 'keep' || !KH.world.visible(x, y)) continue;
      const tt = KH.world.tile(x, y);
      const [sx, sy, sz] = screen(wx(x), hAt(wx(x), wz(y)) + (b.kind === 'rival' ? 3.8 : b.kind === 'intel' ? 2.9 : b.kind === 'ruin' ? 2.9 : b.kind === 'node' && b.res === 'food' ? 3.2 : 2.3), wz(y));
      if (sz > 1 || sx < -30 || sy < -30 || sx > VW + 30 || sy > VH + 30) continue;
      if (b.kind === 'node') badge(sx, sy, icons[b.res], tt.lvl, '#ffcf6e', tt.gone);
      else if (b.kind === 'beast') badge(sx, sy, icons.paw, tt.lvl, '#ff8a7a', tt.gone);
      else if (b.kind === 'camp') badge(sx, sy, b.salt ? icons.hive : icons.flag, tt.lvl, b.salt ? '#9fd8ff' : '#ff5e4e', tt.gone);
      else if (b.kind === 'rival') badge(sx, sy, icons.fort, tt.lvl, tt.shield ? '#7ff0e0' : '#ff9a3c', false);
      else if (b.kind === 'intel') badge(sx, sy, icons.intel, tt.lvl, '#ffcf6e', false);
      else badge(sx, sy, icons.ruin, null, '#8fe4ff', tt.gone);
      // your outpost: a turquoise fort badge beside the node's, ringed red while raiders are on their way
      if (tt.outpost) {
        badge(sx + 24, sy + 4, icons.fort, tt.outpost.lvl, '#3fd0c0', false);
        if (tt.outpost.warned) { g.strokeStyle = `rgba(255,70,50,${0.8 + 0.2 * Math.sin(t * 6)})`; g.lineWidth = 4; ell(sx + 24, sy + 4, 20, 20); g.stroke(); }
      }
      if (busy.has(b.k)) { g.strokeStyle = 'rgba(255,207,110,.95)'; g.lineWidth = 2; g.setLineDash([3, 3]); ell(sx, sy, 17, 17); g.stroke(); g.setLineDash([]); }
    }
    // a label over the keep
    const [kx, ky] = screen(0, 3.6, 0);
    g.font = "700 13px 'El Messiri', serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(40,20,6,.8)'; g.strokeText(`${S.wyrm.name}'s keep`, kx, ky);
    g.fillStyle = '#fff0d0'; g.fillText(`${S.wyrm.name}'s keep`, kx, ky);
    for (const m of S.map.marches) {
      const e = marches[m.id];
      if (!e) continue;
      const end = m.state === 'out' ? m.arrive : m.state === 'work' ? m.workEnd : m.back;
      if (end === Infinity) continue;
      const [mx, my] = screen(e.g.position.x, e.g.position.y + 2.2, e.g.position.z);
      const txt = fmtTime(end - S.time);
      g.font = "700 11px 'Barlow Semi Condensed', sans-serif";
      const w = g.measureText(txt).width + 12;
      g.fillStyle = 'rgba(40,22,10,.85)';
      g.beginPath(); g.roundRect ? g.roundRect(mx - w / 2, my - 8, w, 16, 8) : g.rect(mx - w / 2, my - 8, w, 16); g.fill();
      g.fillStyle = '#ffe7c4'; g.fillText(txt, mx, my + 0.5);
    }
  }

  // ======================================================================
  // Frame
  // ======================================================================
  let last = 0, nextSync = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const on = !!S && A.enabled() && UI.tab === 'world' && UI.sub.world === 'map' && !document.hidden;
    if (on !== W3.active) {
      W3.active = on;
      KH.world3dActive = on;
      cv.style.visibility = on ? 'visible' : 'hidden';
      if (on) resize();
    }
    if (!on) return;
    if (!VW) { resize(); if (!VW) return; }
    if (KH.covered && KH.covered()) return; // nothing to draw under a full-screen overlay
    const t = now / 1000, dt = Math.min(0.5, (now - (last || now)) / 1000);
    last = now;
    if (now >= nextSync) { nextSync = now + 400; syncTiles(); syncGroves(); syncOutposts(); }
    // lighting follows the keep's day and night
    const T3 = KH.town3d;
    const p = T3 && T3.palAt ? T3.palAt(T3.phase()) : null;
    if (p) {
      hemi.color.copy(p.hs); hemi.groundColor.copy(p.hg); hemi.intensity = p.hI * 1.05;
      sun.color.copy(p.sun); sun.intensity = p.sunI * 0.95;
      const u = sky.material.uniforms;
      u.uTop.value.copy(p.top); u.uHorizon.value.copy(p.hor); u.uBottom.value.copy(p.bot); u.uNight.value = p.night;
      scene.fog.color.copy(p.fog);
      renderer.toneMappingExposure = p.exp;
      A.setNight(p.night);
      for (const h of haze) h.material.uniforms.uCol.value.copy(p.fog).lerp(new Col('#e8c48e'), 0.55 - p.night * 0.3);
    }
    sun.position.set(30, 60, 25);
    A.setWater(t);
    const R = (W.sight(S.lv.wyrm) + 0.5) * TS;
    for (const h of haze) { h.material.uniforms.uR.value = R; h.material.uniforms.uT.value = t; }
    keepGlow.material.opacity = 0.14 + 0.06 * Math.sin(t * 2);
    // idle animation for creatures, camp fires, ruin beacons
    for (const k in tiles) {
      const e = tiles[k], ud = e.g.userData;
      if (ud.glb) animGlbBeast(ud, t, e.t.v);
      else if (ud.body) { ud.body.position.y = Math.abs(Math.sin(t * 2 + e.t.v * 6)) * 0.08; ud.body.rotation.y = Math.sin(t * 0.5 + e.t.v * 9) * 0.5; }
      if (ud.fire) ud.fire.scale.set(1, 0.8 + Math.sin(t * 13 + e.t.v * 5) * 0.25, 1);
      if (ud.banner) ud.banner.userData.update(t, 1);
      if (ud.beam && ud.beam.visible) ud.beam.material.opacity = 0.16 + 0.12 * Math.sin(t * 2.4 + e.t.v * 6);
      if (ud.glow) ud.glow.emissiveIntensity = 0.45 + 0.3 * Math.sin(t * 2.4 + e.t.v * 6);
      if (ud.hive && ud.hive.visible) { ud.hive.material.opacity = 0.6 + 0.35 * Math.sin(t * 3 + e.t.v * 5); ud.hive.scale.setScalar(0.9 + 0.15 * Math.sin(t * 3 + e.t.v * 5)); }
    }
    syncMarches(t); syncTrade(t);
    const sk = UI.sheet && UI.sheet.kind === 'tile' ? UI.sheet.tile : null;
    sel.visible = !!sk;
    if (sk) { const [x, y] = sk.split(',').map(Number); sel.position.set(wx(x), hAt(wx(x), wz(y)) + 0.15, wz(y)); sel.material.opacity = 0.6 + 0.3 * Math.sin(t * 4); }
    scene.fog.near = camDist() + 20; scene.fog.far = camDist() + 120;
    place();
    renderer.render(scene, cam);
    overlay(t);
    void dt;
  }

  KH.on('booted', () => {
    S = KH.S;
    if (!init()) return;
    octx = ov.getContext('2d');
    requestAnimationFrame(frame);
  });
  KH.hooks.boot.push(() => {
    S = KH.S;
    if (!scene) return;
    for (const k of Object.keys(tiles)) { scene.remove(tiles[k].g); delete tiles[k]; }
    buildDecor();
  });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
})();
