/*
 * Rainkeep keep in 3D: the WebGL scene behind the town tab. town.js keeps owning
 * input and draws labels, badges and timers on its 2D canvas on top, using the
 * screen anchors this file publishes (KH.town3d.anchors) and its picking.
 * Reads state only; all changes still go through KH.ACT.
 */
'use strict';
(function () {
  const KH = window.KH, A = KH.A3;
  if (!A || !A.ok) return;
  const THREE = A.THREE;
  const { $, clamp, seeded } = KH.u;
  const { PLOT, UI } = KH;
  const { smooth, lerp } = A;
  const V3 = THREE.Vector3, Col = THREE.Color;
  let S = null;
  const T3 = (KH.town3d = { active: false, anchors: {}, head: null, ready: false });
  const cv = $('#town3d');

  // plots sit on an ellipse around the wyrm's pool; +z is toward the camera (bottom of screen)
  const RX = 9.6, RZ = 12.6;
  const plotPos = {};
  DATA.plots.forEach((p, i) => {
    const a = KH.plotAngle(i);
    plotPos[p.id] = new V3(RX * Math.cos(a), 0, RZ * Math.sin(a));
  });
  plotPos.wyrm = new V3(0, 0, 0);

  let renderer, scene, cam, sun, hemi, sky, terrain, wyrm, mist, dust, fx, aura, cloud, rain, bolt, skyriver, nextBolt = 0;
  let VW = 0, VH = 0, DPR = 1, fitD = 60;
  const view = { az: 0, el: 0.84, zoom: 1, flyStart: 0 };
  const plots = {};
  const props = [];
  const people = [];
  const camels = [];
  const ringSel = { quest: null, sel: null };
  const hit = [];
  const tmpV = new V3();

  // ======================================================================
  // Setup
  // ======================================================================
  function init() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { A.ok = false; return false; }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#ecd0a0', 70, 190);
    cam = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

    hemi = new THREE.HemisphereLight('#d2ecff', '#d9a060', 1.15);
    scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff0d4', 3);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 140 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), A.skyMat());
    scene.add(sky);
    terrain = A.terrain({ size: 240, seg: 160, flat: 17, ramp: 42, amp: 5.2, sx: 1, sz: 1.25, seed: 7 });
    scene.add(terrain);

    buildDecor();
    buildPool();
    wyrm = new A.Wyrm();
    scene.add(wyrm.group);
    mist = A.particles(150, { color: '#dff8ff', opacity: 0.55 });
    dust = A.particles(520, { color: '#f0c98a', opacity: 0.6 });
    fx = A.particles(90, { color: '#ffe08a', additive: true });
    scene.add(mist, dust, fx);
    for (const p of DATA.plots) {
      const g = new THREE.Group();
      g.position.copy(plotPos[p.id]);
      g.rotation.y = -0.38 * (plotPos[p.id].x / RX);
      scene.add(g);
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 3.2, 10), new THREE.MeshBasicMaterial());
      proxy.position.set(0, 1.6, 0);
      proxy.visible = false;
      proxy.userData.pid = p.id;
      g.add(proxy);
      hit.push(proxy);
      plots[p.id] = { g, model: null, key: '', top: 2, path: null };
    }
    const wp = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 4.5, 12), new THREE.MeshBasicMaterial());
    wp.position.set(0, 2.2, 0.4);
    wp.visible = false;
    wp.userData.pid = 'wyrm';
    scene.add(wp);
    hit.push(wp);
    const ringGeo = new THREE.RingGeometry(2.0, 2.45, 48).rotateX(-Math.PI / 2);
    for (const k of ['quest', 'sel']) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: k === 'quest' ? '#ffcf6e' : '#8ff0ff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      ringSel[k] = m;
    }
    for (let i = 0; i < 2; i++) {
      const c = A.camel(20 + i, { cloth: i ? A.P.cloth3 : A.P.cloth1, load: true });
      c.scale.setScalar(0.85);
      scene.add(c);
      camels.push({ c, phase: i * Math.PI, speed: 0.032 + i * 0.006 });
    }
    buildMerchant();
    // rain: streaks falling through a box around the keep
    const n = 900, rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    showers = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#eef8ff', transparent: true, opacity: 0, depthWrite: false }));
    showers.frustumCulled = false;
    showers.userData.drops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 56, y: Math.random() * 26, z: (Math.random() - 0.5) * 56 + 3, v: 26 + Math.random() * 10 }));
    scene.add(showers);
    T3.ready = true;
    return true;
  }

  // a merchant caravan camped just inside the front gate while one is visiting
  let merchant = null, showers = null, flashAt = -9;
  function buildMerchant() {
    const g = new THREE.Group();
    const tent = A.grp(A.cone(1.1, 1.3, A.mat(A.P.cloth4, { flat: true, map: A.tex.stripes('#7a3f8a', '#f0d9a8', 8) }), 0, 0, 0, 8));
    tent.position.set(0.4, 0, -0.6);
    g.add(tent);
    g.add(A.box(1.2, 0.5, 0.55, A.mat(A.P.wood, { flat: true }), -0.9, 0, 0.5));
    for (let k = 0; k < 4; k++) g.add(A.jar(0.6, ['#b0603a', '#2f7f9a', '#c9a24a', '#9a4a2a'][k]).translateX(-1.35 + k * 0.3).translateY(0.5).translateZ(0.5));
    const trader = A.person(77, { robe: '#7a3f8a', wrap: '#e8b54a' });
    trader.scale.setScalar(1.2);
    trader.position.set(-0.2, 0, 1.0);
    g.add(trader);
    for (let i = 0; i < 2; i++) {
      const c = A.camel(60 + i, { cloth: i ? A.P.cloth4 : A.P.cloth3, load: true });
      c.scale.setScalar(0.8);
      c.position.set(1.6 + i * 0.9, 0, 0.6 + i * 0.9);
      c.rotation.y = -1.9 + i * 0.4;
      g.add(c);
    }
    g.position.set(3.9, 0, RZ + 2.1);
    g.visible = false;
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.5, 10), new THREE.MeshBasicMaterial());
    proxy.position.set(0, 1.2, 0);
    proxy.visible = false;
    proxy.userData.pid = 'merchant';
    g.add(proxy);
    scene.add(g);
    merchant = g;
  }
  KH.on('rain', () => { flashAt = performance.now(); });

  function buildDecor() {
    const r = seeded(19);
    // distant mesas and rock spires frame the horizon
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.95 + (i / 15) * Math.PI * 1.9 + (r() - 0.5) * 0.15;
      const d = 85 + r() * 55;
      const m = A.mesa(8 + r() * 16, 6 + r() * 9, i);
      m.position.x = Math.sin(a) * d;
      m.position.z = -Math.cos(a) * d;
      scene.add(m);
    }
    // a low adobe wall around the keep, open at the front and back
    const wall = new THREE.Group(), wm = A.mat(A.P.adobeD, { flat: true }), wt = A.mat(A.P.adobe, { flat: true });
    const WX = RX + 5.2, WZ = RZ + 4.6, n = 44;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const gate = Math.abs(Math.sin(am) - 1) < 0.02 || Math.abs(Math.sin(am) + 1) < 0.01;
      if (gate) continue;
      const p0 = new V3(WX * Math.cos(a0), 0, WZ * Math.sin(a0)), p1 = new V3(WX * Math.cos(a1), 0, WZ * Math.sin(a1));
      const len = p0.distanceTo(p1);
      const seg = A.box(len + 0.05, 0.95, 0.42, wm, 0, 0, 0);
      const cap = A.box(len + 0.1, 0.12, 0.5, wt, 0, 0.95, 0);
      const holder = A.grp(seg, cap);
      if (i % 2) holder.add(A.box(0.3, 0.22, 0.46, wt, 0, 1.07, 0));
      holder.position.copy(p0).lerp(p1, 0.5);
      holder.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
      wall.add(holder);
      if (i % 11 === 5) {
        const tw = A.grp(A.cyl(0.55, 0.65, 1.9, wm, 0, 0, 0, 8), A.cyl(0.7, 0.7, 0.14, wt, 0, 1.9, 0, 8), A.cone(0.62, 0.55, A.mat(A.P.cloth1, { flat: true }), 0, 2.04, 0, 8));
        tw.position.copy(p0);
        wall.add(tw);
      }
    }
    // gate towers at the front
    for (const s of [-1, 1]) {
      const tw = A.grp(A.cyl(0.6, 0.72, 2.3, wm, 0, 0, 0, 8), A.cyl(0.78, 0.78, 0.16, wt, 0, 2.3, 0, 8), A.sph(0.08, A.lamp, 0, 2.6, 0.75, 6));
      tw.position.set(s * 1.9, 0, WZ);
      wall.add(tw);
    }
    scene.add(A.bake(wall));
    // palms, rocks and lanterns scattered through the keep
    const spots = [[-4.8, -4.2], [4.6, -4.4], [-5.2, 3.6], [5.0, 3.9], [-15.2, -3], [15.4, 2.5], [-13.5, 10.5], [14, -10], [-7, -16.5], [6.5, -17.2], [-17, -12], [17.5, 11]];
    spots.forEach(([x, z], i) => {
      const p = A.palm(2.6 + r() * 1.2, 40 + i);
      p.position.set(x, 0, z);
      scene.add(p);
      props.push(p);
    });
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = 19 + r() * 12;
      const rk = A.rock(0.5 + r() * 1.1, i, r() < 0.5 ? '#b98a5a' : '#a8774a');
      rk.position.set(Math.cos(a) * d * 1.05, 0.15, Math.sin(a) * d * 1.2);
      rk.rotation.y = r() * 6;
      scene.add(rk);
    }
    const lampM = A.mat(A.P.woodD);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.39;
      const post = A.grp(A.cyl(0.04, 0.05, 1.5, lampM, 0, 0, 0, 5), A.box(0.18, 0.22, 0.18, A.mat(A.P.copper, { m: 0.5, r: 0.4 }), 0, 1.45, 0), A.sph(0.08, A.lamp, 0, 1.56, 0, 8));
      post.position.set(Math.cos(a) * 6.1, 0, Math.sin(a) * 6.4);
      scene.add(A.bake(post));
    }
    // market stalls and shade sails near the plaza
    // (between the plots: the ring has 13 plots since the Forge)
    for (const [x, z, c, ry] of [[-4.97, 7.36, A.P.cloth3, 0.6], [4.97, 7.36, A.P.cloth4, -0.6]]) {
      const st = A.grp(A.box(1.3, 0.55, 0.6, A.mat(A.P.wood, { flat: true }), 0, 0, 0));
      for (const [px, pz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) st.add(A.cyl(0.03, 0.03, 1.4, lampM, px, 0, pz, 4));
      const roof = A.box(1.5, 0.04, 0.9, A.mat(c, { map: A.tex.stripes(c, A.P.cloth2, 6) }), 0, 1.4, 0);
      roof.rotation.x = 0.2;
      st.add(roof);
      for (let k = 0; k < 4; k++) st.add(A.sph(0.08, A.mat(['#c8553d', '#e8b54a', '#5f9a3e', '#a0461c'][k], { flat: true }), -0.45 + k * 0.3, 0.62, 0.05, 6));
      st.position.set(x, 0, z);
      st.rotation.y = ry;
      scene.add(A.bake(st));
    }
  }

  function buildPool() {
    const g = new THREE.Group();
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(6.2, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: (() => { const t = A.tex.paving.clone(); t.needsUpdate = true; t.repeat.set(5, 5); return t; })(), roughness: 0.9 }));
    plaza.position.y = 0.02;
    plaza.receiveShadow = true;
    g.add(plaza);
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.25, 48).rotateX(-Math.PI / 2), A.waterMat({ radial: true, alpha: 0.95 }));
    water.position.y = 0.1;
    g.add(water);
    T3.water = water;
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 40, 1, true), A.mat('#2a6a7a', { ds: true }));
    bed.position.y = -0.2;
    g.add(bed);
    const stone = A.mat(A.P.sandstone, { flat: true }), stoneD = A.mat('#c08e58', { flat: true });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const b = A.box(0.78, 0.36, 0.55, i % 2 ? stone : stoneD, 0, 0, 0);
      const h = A.grp(b);
      h.position.set(Math.cos(a) * 3.55, 0, Math.sin(a) * 3.55);
      h.rotation.y = -a + Math.PI / 2;
      g.add(h);
    }
    const reeds = A.reeds(18, 3.25, 4);
    g.add(reeds);
    for (const a of [0.6, 2.3, 3.9, 5.4]) {
      const j = A.jar(1.1, '#b0603a');
      j.position.set(Math.cos(a) * 4.3, 0, Math.sin(a) * 4.3);
      g.add(j);
    }
    scene.add(A.bake(g));
    aura = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.06, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.y = 0.42;
    aura.visible = false;
    scene.add(aura);
    // the Primordial wyrm's own little rain cloud
    cloud = new THREE.Group();
    // its own material, so the Stormcrowned wyrm's lightning can light it from inside
    const cm = new THREE.MeshStandardMaterial({ color: '#f4f7fb', flatShading: true, roughness: 0.9, emissive: '#bfe6ff', emissiveIntensity: 0 });
    cloud.userData.mat = cm;
    for (const [x, y, z, s] of [[0, 0, 0, 0.75], [0.7, -0.1, 0.1, 0.6], [-0.7, -0.08, 0, 0.62], [0.3, 0.3, -0.2, 0.55], [-0.3, 0.25, 0.2, 0.5]]) cloud.add(A.sph(s, cm, x, y, z, 8));
    cloud.visible = false;
    scene.add(cloud);
    const rg = new THREE.BufferGeometry(), rp = new Float32Array(60 * 6);
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.6 }));
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);
    // Stormcrowned: a jagged bolt from the cloud now and then
    bolt = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3)), new THREE.LineBasicMaterial({ color: '#eaf8ff', transparent: true, opacity: 0.95 }));
    bolt.frustumCulled = false;
    bolt.visible = false;
    scene.add(bolt);
    // Skyriver: a ribbon of water spiralling up around the wyrm
    const pts = [];
    for (let i = 0; i <= 80; i++) { const u = i / 80, a = u * Math.PI * 5; pts.push(new V3(Math.cos(a) * (2.6 - u * 1.2), 0.4 + u * 4.2, Math.sin(a) * (2.6 - u * 1.2))); }
    skyriver = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.09, 6), new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: '#4ac8ff', emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.6, map: A.tex.scales || null }));
    skyriver.castShadow = false;
    skyriver.visible = false;
    scene.add(skyriver);
  }

  // ======================================================================
  // Plots: swap models when a building's state or detail tier changes
  // ======================================================================
  function plotState(pid) {
    const L = S.lv[pid], job = S.builds.find((b) => b.plot === pid);
    if (S.lv.wyrm < PLOT[pid].unlock) return 'locked';
    if (!L) return job ? 'site' : 'empty';
    return job ? 'up' : 'built';
  }
  function syncPlots() {
    for (const p of DATA.plots) {
      const pl = plots[p.id], st = plotState(p.id), tier = A.tierOf(S.lv[p.id] || 1);
      const key = `${st}:${tier}`;
      if (pl.key === key) continue;
      pl.key = key;
      if (pl.model) { pl.g.remove(pl.model); pl.model = null; }
      const m = new THREE.Group();
      let top = 1.2;
      if (st === 'locked') m.add(A.fence(3.2));
      else if (st === 'empty' || st === 'site') {
        m.add(A.foundation(3.0));
        if (st === 'site') { m.add(A.scaffold(2.6, 2.0)); top = 2.4; }
      } else {
        const b = A.building(p.type, tier, p.id.length);
        m.add(b);
        m.userData.b = b;
        top = b.userData.top;
        if (st === 'up') { const sc = A.scaffold(3.2, Math.min(3.2, top + 0.2)); sc.position.set(0, 0, 0.3); m.add(sc); }
      }
      pl.g.add(m);
      pl.model = m;
      pl.top = top;
      // dirt path from the plaza to every built plot
      if (pl.path) { scene.remove(pl.path); pl.path = null; }
      if (st === 'built' || st === 'up') {
        const to = plotPos[p.id], dir = to.clone().normalize();
        const from = dir.clone().multiplyScalar(6.1), end = to.clone().addScaledVector(dir, -1.7);
        const len = Math.max(0.5, from.distanceTo(end));
        const path = new THREE.Mesh(A.geo(`path${len.toFixed(1)}`, () => new THREE.PlaneGeometry(1.15, len).rotateX(-Math.PI / 2)), A.mat('#e4c08a', { r: 1, map: A.tex.sand }));
        path.position.copy(from).lerp(end, 0.5);
        path.position.y = 0.03;
        path.rotation.y = Math.atan2(dir.x, dir.z);
        path.receiveShadow = true;
        scene.add(path);
        pl.path = path;
      }
    }
  }

  // ======================================================================
  // People and camels
  // ======================================================================
  function syncPeople() {
    const posts = Object.keys(S.workers).filter((p) => S.workers[p] > 0 && S.lv[p]);
    const want = posts.length ? Math.min(S.pop - S.sick, 18) : Math.min(S.pop, 4);
    while (people.length < want) {
      const i = people.length;
      const o = A.person(i + 1, { jar: i % 4 === 1 });
      o.scale.setScalar(1.15);
      scene.add(o);
      people.push({ o, i, seed: seeded(i * 13 + 5)() });
    }
    while (people.length > want) scene.remove(people.pop().o);
    return posts;
  }
  function animPeople(t, posts) {
    for (const p of people) {
      let from, to;
      if (posts.length) {
        const pid = posts[p.i % posts.length];
        to = plotPos[pid].clone().multiplyScalar(0.84);
        from = plotPos[pid].clone().normalize().multiplyScalar(4.4);
      } else {
        const a = p.i * 1.7;
        from = new V3(Math.cos(a) * 4.4, 0, Math.sin(a) * 4.4);
        to = new V3(Math.cos(a + 0.6) * 5.6, 0, Math.sin(a + 0.6) * 5.6);
      }
      const sp = 0.1 + (p.i % 5) * 0.018;
      const ph = t * sp * Math.PI + p.i * 1.9;
      const u = (Math.sin(ph) + 1) / 2, dirSign = Math.cos(ph) >= 0 ? 1 : -1;
      const side = new V3(-(to.z - from.z), 0, to.x - from.x).normalize().multiplyScalar((p.seed - 0.5) * 1.1);
      p.o.position.copy(from).lerp(to, 0.08 + 0.84 * u).add(side);
      p.o.position.y = Math.abs(Math.sin(t * 7 + p.i)) * 0.05;
      const d = to.clone().sub(from).multiplyScalar(dirSign);
      p.o.rotation.y = Math.atan2(d.x, d.z);
    }
  }
  function animCamels(t) {
    for (const k of camels) {
      const a = k.phase + t * k.speed;
      const x = Math.cos(a) * (RX + 2.7), z = Math.sin(a) * (RZ + 2.4);
      const nx = Math.cos(a + 0.01) * (RX + 2.7), nz = Math.sin(a + 0.01) * (RZ + 2.4);
      k.c.position.set(x, 0, z);
      k.c.rotation.y = Math.atan2(-(nz - z), nx - x);
      A.walkCamel(k.c, t, 0.7);
    }
  }

  // ======================================================================
  // Sky, light and weather
  // ======================================================================
  const PAL = {
    day: { top: '#4a9be0', hor: '#f4d8a6', bot: '#d9a35e', sun: '#fff0d4', sunI: 3.1, hs: '#d2ecff', hg: '#d9a060', hI: 1.15, fog: '#efd3a2', exp: 1.0, night: 0 },
    dusk: { top: '#3c3a7c', hor: '#ff9a5a', bot: '#b0703a', sun: '#ffaa62', sunI: 2.0, hs: '#ffbe94', hg: '#8a5030', hI: 0.9, fog: '#dd9a6c', exp: 1.08, night: 0.35 },
    night: { top: '#0b1438', hor: '#2c3670', bot: '#2a1c18', sun: '#b0c4ff', sunI: 1.15, hs: '#7080c8', hg: '#4a3628', hI: 0.85, fog: '#2c3260', exp: 1.3, night: 1 },
  };
  const KEYS = [[0, 'dusk'], [0.07, 'day'], [0.56, 'day'], [0.64, 'dusk'], [0.72, 'night'], [0.93, 'night'], [1, 'dusk']];
  const cA = new Col(), cB = new Col();
  function palAt(f) {
    let i = 0;
    while (i < KEYS.length - 2 && f > KEYS[i + 1][0]) i++;
    const [f0, a] = KEYS[i], [f1, b] = KEYS[i + 1];
    const k = smooth(0, 1, (f - f0) / Math.max(1e-6, f1 - f0));
    const pa = PAL[a], pb = PAL[b], o = {};
    for (const key of Object.keys(pa)) {
      if (typeof pa[key] === 'number') o[key] = lerp(pa[key], pb[key], k);
      else o[key] = new Col(pa[key]).lerp(cB.set(pb[key]), k);
    }
    return o;
  }
  T3.palAt = palAt;
  T3.phase = () => KH.dayNight().f;
  const wxNow = { haze: 0, storm: 0, heat: 0, rain: 0 };
  function lighting(t, dt) {
    const f = KH.dayNight().f;
    const p = palAt(f);
    const w = KH.curWx().type;
    const wet = KH.keep && KH.keep.raining();
    const goal = { haze: w === 'haze' && !wet ? 1 : 0, storm: w === 'sandstorm' && !wet ? 1 : 0, heat: w === 'heatwave' && !wet ? 1 : 0, rain: wet ? 1 : 0 };
    for (const k in wxNow) wxNow[k] += (goal[k] - wxNow[k]) * Math.min(1, dt * 0.6);
    T3.wxNow = wxNow;
    const { haze, storm, heat, rain: wetK } = wxNow;
    const flash = Math.max(0, 1 - (performance.now() - flashAt) / 350);
    // the sun crosses the sky during the day; at night a cool moon lights from the other side
    const dayF = clamp(f / 0.68, 0, 1);
    const isNight = p.night > 0.6;
    const az = isNight ? 2.2 : lerp(-1.3, 1.3, dayF);
    const elev = isNight ? 0.75 : 0.35 + Math.sin(dayF * Math.PI) * 0.75;
    const dir = new V3(Math.sin(az) * Math.cos(elev), Math.sin(elev), -Math.cos(az) * Math.cos(elev) * 0.6 + 0.35).normalize();
    sun.position.copy(dir).multiplyScalar(70);
    sun.target.position.set(0, 0, 0);
    const sunCol = p.sun.clone().lerp(cA.set('#ffb070'), storm * 0.5).lerp(cA.set('#fff8e6'), heat * 0.4);
    sun.color.copy(sunCol);
    sun.intensity = p.sunI * (1 - storm * 0.55 - haze * 0.12 + heat * 0.25 - wetK * 0.6);
    hemi.color.copy(p.hs).lerp(cA.set('#f0c890'), storm * 0.6 + haze * 0.3).lerp(cA.set('#a8c4d8'), wetK * 0.7);
    hemi.groundColor.copy(p.hg).lerp(cA.set('#5a4a3a'), wetK * 0.5);
    hemi.intensity = p.hI * (1 + storm * 0.2 + haze * 0.1 + wetK * 0.15) + flash * 3;
    const fogCol = p.fog.clone().lerp(cA.set('#c98a4a'), storm * 0.85).lerp(cA.set('#e9c48e'), haze * 0.55).lerp(cA.set('#fff1d6'), heat * 0.35).lerp(cA.set('#8a9aa8'), wetK * 0.7);
    scene.fog.color.copy(fogCol);
    // fog distances scale with the camera so the keep stays readable in a storm
    const cd = T3.camD || 60;
    scene.fog.near = lerp(lerp(lerp(cd + 15, cd * 0.75, haze), cd * 0.5, storm), cd * 0.8, wetK);
    scene.fog.far = lerp(lerp(lerp(cd + 140, cd * 2.4, haze), cd * 1.7, storm), cd * 2.6, wetK);
    // rain darkens the sand
    terrain.material.color.setRGB(1 - wetK * 0.4, 1 - wetK * 0.38, 1 - wetK * 0.3);
    terrain.material.roughness = 0.96 - wetK * 0.3;
    const u = sky.material.uniforms;
    u.uTop.value.copy(p.top).lerp(cA.set('#c8b09a'), storm * 0.8 + haze * 0.35).lerp(cA.set('#a8d0ee'), heat * 0.5).lerp(cA.set('#5a6a7c'), wetK * 0.8);
    u.uHorizon.value.copy(p.hor).lerp(fogCol, storm * 0.9 + haze * 0.5);
    u.uBottom.value.copy(p.bot);
    u.uSunDir.value.copy(dir);
    u.uSunCol.value.copy(sunCol);
    u.uNight.value = p.night;
    u.uHaze.value = storm * 0.9 + haze * 0.4;
    renderer.toneMappingExposure = p.exp + heat * 0.12;
    A.setNight(p.night);
    A.setWater(t, dir, sunCol, u.uTop.value);
    T3.night = p.night;
    T3.wind = 1 + storm * 2.5 + haze * 0.4 + wetK * 0.8;
  }
  function animRain(dt) {
    const k = wxNow.rain;
    showers.visible = k > 0.01;
    if (!showers.visible) return;
    showers.material.opacity = 0.8 * k;
    const a = showers.geometry.attributes.position.array, drops = showers.userData.drops;
    drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) { d.y += 26; d.x = (Math.random() - 0.5) * 56; d.z = (Math.random() - 0.5) * 56 + 3; }
      a[i * 6] = d.x; a[i * 6 + 1] = d.y; a[i * 6 + 2] = d.z;
      a[i * 6 + 3] = d.x - 0.15; a[i * 6 + 4] = d.y + 1.3; a[i * 6 + 5] = d.z;
    });
    showers.geometry.attributes.position.needsUpdate = true;
  }

  // ======================================================================
  // Particles: wyrm mist, drifting dust, celebration sparkles
  // ======================================================================
  let mistAcc = 0, dustInit = false;
  function animParticles(t, dt) {
    // mist
    const ml = mist.userData.list;
    const rate = S.dormant ? 0 : { low: 18, steady: 34, high: 70 }[S.mist] || 30;
    mistAcc += rate * dt;
    mist.material.uniforms.uColor.value.copy(wyrm.mist ? wyrm.mist[1] : cA.set('#dff8ff'));
    for (const p of ml) {
      if (p.life > 0) {
        p.age += dt;
        if (p.age >= p.life) { p.life = 0; p.y = -999; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 0.985; p.vz *= 0.985; p.vy *= 0.99;
      } else if (mistAcc >= 1) {
        mistAcc -= 1;
        const fromMouth = Math.random() < 0.55;
        const o = fromMouth ? wyrm.mouthWorld : new V3((Math.random() - 0.5) * 5, 0.25, (Math.random() - 0.5) * 5);
        const a = Math.random() * Math.PI * 2;
        Object.assign(p, {
          x: o.x, y: o.y, z: o.z,
          vx: fromMouth ? Math.cos(a) * 0.5 : Math.cos(a) * 0.9, vy: fromMouth ? 0.15 + Math.random() * 0.25 : 0.35 + Math.random() * 0.4, vz: fromMouth ? 0.6 + Math.random() * 0.6 : Math.sin(a) * 0.9,
          life: 2.6 + Math.random() * 2.2, age: 0, s: fromMouth ? 2.4 : 3.4 + Math.random() * 2.4, a: fromMouth ? 0.55 : 0.32,
        });
      }
    }
    mistAcc = Math.min(mistAcc, 3);
    mist.userData.flush();
    // dust
    const dl = dust.userData.list, wind = T3.wind || 1;
    const share = clamp(0.1 + wxNow.storm * 0.9 + wxNow.haze * 0.2 + wxNow.heat * 0.08, 0, 1);
    if (!dustInit) {
      dustInit = true;
      dl.forEach((p) => Object.assign(p, { x: (Math.random() - 0.5) * 70, y: Math.random() * 10, z: (Math.random() - 0.5) * 60 + 10, life: 1e9, age: 5e8 }));
    }
    const n = Math.floor(dl.length * share);
    dl.forEach((p, i) => {
      p.x += (2 + wind * 5) * dt * (0.6 + (i % 5) * 0.12);
      p.z += Math.sin(t * 0.3 + i) * dt * 0.6;
      p.y += Math.sin(t + i) * dt * 0.2;
      if (p.x > 35) { p.x = -35; p.z = (Math.random() - 0.5) * 60 + 10; p.y = Math.random() * (2 + wxNow.storm * 14); }
      p.a = i < n ? 0.5 + wxNow.storm * 0.4 : 0;
      p.s = 1.0 + (i % 4) * 0.5 + wxNow.storm * 2.4;
    });
    dust.material.uniforms.uColor.value.set(wxNow.heat > 0.5 ? '#fff4dc' : '#f0c98a');
    dust.userData.flush();
    // sparkles
    for (const p of fx.userData.list) {
      if (p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life) { p.life = 0; p.y = -999; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 3 * dt;
    }
    fx.userData.flush();
  }
  function burst(pid, color, n = 40) {
    if (!T3.ready) return;
    const c = plotPos[pid] || plotPos.wyrm;
    fx.material.uniforms.uColor.value.set(color);
    let k = 0;
    for (const p of fx.userData.list) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5;
      Object.assign(p, { x: c.x, y: 0.8 + Math.random(), z: c.z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 3, vz: Math.sin(a) * s, life: 1 + Math.random() * 0.8, age: 0, s: 1.6 + Math.random(), a: 1 });
      if (++k >= n) break;
    }
  }
  KH.on('upgrade', (e) => { if (!e.offline) burst(e.plot, e.plot === 'wyrm' ? '#8ff0ff' : '#ffe08a', 50); });
  KH.on('buildStart', (e) => burst(e.plot, '#f0c98a', 24));
  KH.on('evolve', () => burst('wyrm', '#8ff0ff', 80));

  // ======================================================================
  // Camera: fit the plot ring into the free area between the HUD strip and the quest card
  // ======================================================================
  function margins() {
    const q = $('#quest');
    return { top: 70, bottom: (q ? q.offsetHeight : 70) + 26 };
  }
  function place(d) {
    const el = view.el, az = view.az;
    const target = new V3(0, 0.6, 0.6);
    cam.position.set(target.x + Math.sin(az) * Math.cos(el) * d, target.y + Math.sin(el) * d, target.z + Math.cos(az) * Math.cos(el) * d);
    cam.lookAt(target);
    cam.updateMatrixWorld();
  }
  function applyOffset() {
    const m = margins();
    cam.aspect = VW / VH;
    cam.setViewOffset(VW, VH, 0, (m.bottom - m.top) / 2, VW, VH);
    cam.updateProjectionMatrix();
  }
  function fit() {
    const m = margins();
    const usableTop = -1 + (2 * m.top) / VH, usableBot = 1 - (2 * m.bottom) / VH;
    const pts = [];
    for (const p of DATA.plots) {
      const c = plotPos[p.id];
      pts.push(new V3(c.x - 2.1, 0, c.z), new V3(c.x + 2.1, 0, c.z), new V3(c.x, 0, c.z + 2.2), new V3(c.x, 3.2, c.z - 1));
    }
    const save = { az: view.az, el: view.el };
    view.az = 0; view.el = 0.84;
    applyOffset();
    let lo = 20, hi = 260;
    for (let k = 0; k < 24; k++) {
      const d = (lo + hi) / 2;
      place(d);
      let ok = true;
      for (const p of pts) {
        tmpV.copy(p).project(cam);
        const sy = -tmpV.y;
        if (Math.abs(tmpV.x) > 0.97 || sy < usableTop || sy > usableBot) { ok = false; break; }
      }
      if (ok) hi = d; else lo = d;
    }
    fitD = hi;
    Object.assign(view, save);
  }
  function resize() {
    if (!renderer) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = r.width; VH = r.height;
    renderer.setPixelRatio(DPR);
    renderer.setSize(VW, VH, false);
    fit();
  }
  T3.resize = resize;
  T3.drag = (dx, dy) => {
    view.az = clamp(view.az - dx * 0.006, -0.8, 0.8);
    view.el = clamp(view.el + dy * 0.004, 0.3, 1.2);
  };
  T3.zoom = (f) => { view.zoom = clamp(view.zoom * f, 0.55, 1.2); };
  T3.reset = () => { view.az = 0; view.el = 0.84; view.zoom = 1; };

  // ======================================================================
  // Picking and screen anchors for the overlay
  // ======================================================================
  const ray = new THREE.Raycaster();
  T3.pick = (px, py) => {
    if (!T3.active) return null;
    ray.setFromCamera(new THREE.Vector2((px / VW) * 2 - 1, -(py / VH) * 2 + 1), cam);
    const h = ray.intersectObjects(merchant && merchant.visible ? [...hit, merchant.children[merchant.children.length - 1]] : hit, false);
    return h.length ? h[0].object.userData.pid : null;
  };
  function toScreen(v) {
    tmpV.copy(v).project(cam);
    return { x: (tmpV.x * 0.5 + 0.5) * VW, y: (-tmpV.y * 0.5 + 0.5) * VH, z: tmpV.z };
  }
  function anchors() {
    const out = {};
    const pxPerUnit = (pt) => { const a = toScreen(pt), b = toScreen(pt.clone().add(new V3(1, 0, 0))); return Math.hypot(b.x - a.x, b.y - a.y); };
    for (const p of DATA.plots) {
      const c = plotPos[p.id], pl = plots[p.id];
      const base = toScreen(new V3(c.x, 0, c.z + 1.7));
      const top = toScreen(new V3(c.x, pl.top + 0.3, c.z));
      const mid = toScreen(new V3(c.x, 0.2, c.z));
      out[p.id] = { x: base.x, y: base.y, tx: top.x, ty: top.y, mx: mid.x, my: mid.y, s: clamp(pxPerUnit(c) / 17, 0.7, 1.35) };
    }
    const hw = wyrm.headWorld;
    const h = toScreen(hw);
    const gate = toScreen(new V3(0, 2.4, RZ + 4.6));
    out.gate = { x: gate.x, y: gate.y, tx: gate.x, ty: gate.y, mx: gate.x, my: gate.y, s: out.well ? out.well.s : 1 };
    out.wyrm = { x: h.x, y: h.y + 40, tx: h.x, ty: h.y - 26, mx: h.x, my: h.y, s: clamp(pxPerUnit(hw) / 17, 0.7, 1.35) };
    T3.head = h;
    T3.anchors = out;
  }

  // ======================================================================
  // Frame
  // ======================================================================
  let last = 0, posts = [], slow = 0, lastSync = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const on = !!S && A.enabled() && UI.tab === 'town' && !document.hidden;
    if (on !== T3.active) {
      T3.active = on;
      cv.style.visibility = on ? 'visible' : 'hidden';
      if (on) { resize(); view.flyStart = now; }
    }
    if (!on || !VW) { if (on && !VW) resize(); return; }
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (last || now)) / 1000), rdt = Math.min(0.5, (now - (last || now)) / 1000);
    last = now;
    slow -= dt;
    if (slow <= 0 || now - lastSync > 600) { slow = 0.5; lastSync = now; syncPlots(); posts = syncPeople(); }
    // short swoop in when the keep first appears (wall-clock, so slow devices don't drag it out)
    const fk = smooth(0, 1, (now - view.flyStart) / 1800);
    lighting(t, rdt);
    wyrm.set({ level: S.lv.wyrm, skin: S.skins.on, element: S.wyrm.element });
    const petAge = UI.petT ? (performance.now() - UI.petT) / 1000 : 9;
    wyrm.pose({ t, dormant: S.dormant, pet: petAge < 1.6 ? 1 - petAge / 1.6 : 0 });
    T3.water.position.y = S.dormant ? 0.0 : 0.1;
    // element aura and the Primordial rain cloud
    aura.visible = !!wyrm.elem && !S.dormant;
    if (aura.visible) { aura.material.color.set(wyrm.elem.color); aura.material.opacity = 0.45 + 0.3 * Math.sin(t * 2); aura.scale.setScalar(1 + 0.02 * Math.sin(t * 1.3)); }
    cloud.visible = rain.visible = wyrm.stage >= 6 && !S.dormant;
    if (cloud.visible) {
      cloud.position.set(wyrm.headWorld.x * 0.6, wyrm.headWorld.y + 2.2 + Math.sin(t * 0.7) * 0.15, wyrm.headWorld.z * 0.5 - 0.6);
      const rp = rain.geometry.attributes.position.array;
      for (let i = 0; i < 60; i++) {
        const ph = ((t * 1.6 + i * 0.137) % 1), x = cloud.position.x + Math.sin(i * 12.9) * 0.9, z = cloud.position.z + Math.cos(i * 7.3) * 0.6;
        const y = cloud.position.y - 0.3 - ph * (cloud.position.y - 0.1);
        rp.set([x, y, z, x, y - 0.22, z], i * 6);
      }
      rain.geometry.attributes.position.needsUpdate = true;
    }
    // Stormcrowned and beyond: lightning inside the cloud, now and then a bolt
    const storm = cloud.visible && wyrm.stage >= 7;
    if (storm && t > nextBolt) {
      nextBolt = t + 3 + Math.random() * 5;
      const a = bolt.geometry.attributes.position.array, from = cloud.position, to = wyrm.headWorld;
      for (let i = 0; i < 8; i++) {
        const u = i / 7, j = i === 0 || i === 7 ? 0 : 0.35;
        a.set([from.x + (to.x - from.x) * u * 0.8 + (Math.random() - 0.5) * j, from.y - 0.3 + (to.y + 0.6 - from.y) * u, from.z + (to.z - from.z) * u * 0.8 + (Math.random() - 0.5) * j], i * 3);
      }
      bolt.geometry.attributes.position.needsUpdate = true;
      bolt.userData.at = t;
    }
    const flashK = storm && bolt.userData.at ? Math.max(0, 1 - (t - bolt.userData.at) / 0.25) : 0;
    bolt.visible = flashK > 0;
    bolt.material.opacity = flashK;
    cloud.userData.mat.emissiveIntensity = storm ? 0.15 + flashK * 1.2 + 0.1 * Math.max(0, Math.sin(t * 5.3) * Math.sin(t * 1.1)) : 0;
    skyriver.visible = wyrm.stage >= 8 && !S.dormant;
    if (skyriver.visible) { skyriver.rotation.y = t * 0.25; skyriver.material.emissiveIntensity = 0.45 + 0.15 * Math.sin(t * 1.7); }
    for (const p of DATA.plots) { const b = plots[p.id].model && plots[p.id].model.userData.b; if (b) b.userData.update(t, T3.wind); }
    for (const p of props) A.swayPalm(p, t, T3.wind);
    animPeople(t, posts);
    animCamels(t);
    animParticles(t, dt);
    animRain(rdt);
    merchant.visible = !!(KH.keep && KH.keep.merchantHere());
    // highlight rings: the current quest target and the plot whose sheet is open
    const qp = UI.questTarget && plotPos[UI.questTarget];
    ringSel.quest.visible = !!qp && !(UI.sheet && UI.sheet.kind === 'plot');
    if (qp) { ringSel.quest.position.set(qp.x, 0.06, qp.z); ringSel.quest.material.opacity = 0.45 + 0.4 * Math.sin(t * 4); ringSel.quest.scale.setScalar(1 + 0.05 * Math.sin(t * 4)); }
    const sp = UI.sheet && UI.sheet.kind === 'plot' && plotPos[UI.sheet.pid];
    ringSel.sel.visible = !!sp;
    if (sp) { ringSel.sel.position.set(sp.x, 0.06, sp.z); ringSel.sel.scale.setScalar(UI.sheet.pid === 'wyrm' ? 1.75 : 1); }
    // camera
    const d = fitD / view.zoom;
    T3.camD = d;
    const keep = { el: view.el, az: view.az };
    view.el = lerp(0.22, keep.el, fk); view.az = lerp(-0.45, keep.az, fk);
    applyOffset();
    place(lerp(d * 1.35, d, fk));
    view.el = keep.el; view.az = keep.az;
    renderer.render(scene, cam);
    anchors();
  }

  KH.on('booted', () => {
    S = KH.S;
    if (!init()) return;
    resize();
    requestAnimationFrame(frame);
  });
  KH.hooks.boot.push(() => { S = KH.S; for (const k in plots) plots[k].key = ''; });
  window.addEventListener('resize', () => resize());
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('#stage'));
})();
