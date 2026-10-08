/*
 * Rainkeep keep in 3D: the WebGL scene behind the town tab. town.js keeps owning
 * input and draws labels, badges and timers on its 2D canvas on top, using the
 * screen anchors this file publishes (KH.town3d.anchors) and its picking.
 * Reads state only; all changes still go through KH.ACT.
 *
 * The keep is a terraced oasis at the head of a canyon (positions in DATA.keep):
 * the spring sits in a sunken stepped basin, side terraces and an upper crescent
 * rise around it on stone retaining walls, stairs link the levels, and canyon
 * cliffs close it in behind a walled front gate. The camera pans, zooms and turns.
 */
'use strict';
(function () {
  const KH = window.KH, A = KH.A3;
  if (!A || !A.ok) return;
  const THREE = A.THREE;
  const { $, clamp, seeded } = KH.u;
  const { PLOT, UI } = KH;
  const { smooth, lerp } = A;
  const V3 = THREE.Vector3, V2 = THREE.Vector2, Col = THREE.Color;
  let S = null;
  const T3 = (KH.town3d = { active: false, anchors: {}, head: null, ready: false });
  const cv = $('#town3d');

  // ======================================================================
  // Layout
  // ======================================================================
  const K = DATA.keep;
  let roarT = -1e9;
  const SPRING = new V3(K.spring.x, -1.0, K.spring.z); // the water surface in the basin
  const plotPos = {};
  for (const p of DATA.plots) { const l = K.plots[p.id]; plotPos[p.id] = new V3(l.x, l.y, l.z); }
  plotPos.wyrm = SPRING.clone();

  // raised terraces and the watchtower's crag (outlines in DATA.keep)
  const flipX = (pts) => pts.map(([x, z, f]) => (f == null ? [-x, z] : [-x, z, f]));
  const TERR = K.terraces;
  const CRAG = K.crag;
  const STAIRS = K.stairs;
  // low walls along terrace edges (gaps where the stairs arrive)
  const PARAPETS = [
    { y: 1.4, pts: [[-16.6, 6.67], [-10.3, 6.67]] },
    { y: 1.4, pts: [[-8.6, 6.62], [-8.2, 6.15], [-7.43, 4.58], [-7.13, 1.6], [-7.13, -2.2], [-7.4, -3.9]] },
    { y: 2.8, pts: [[-16.6, -6.33], [-9.2, -6.33]] },
    { y: 2.8, pts: [[-7.5, -6.5], [-6.55, -6.95], [-4.5, -7.75], [-2.2, -8.25], [0, -8.4], [2.2, -8.25], [4.5, -7.75], [6.55, -6.95], [7.5, -6.5]] },
  ];
  for (const p of PARAPETS.slice()) if (p.pts[0][0] < 0 && p.pts[p.pts.length - 1][0] < 0) PARAPETS.push({ y: p.y, pts: flipX(p.pts) });
  // walking routes from the spring's plaza to each plot ([x, z, 1] marks the top of a stair)
  const WFRONT = [[-4.6, 4.9], [-6.8, 8.0], [-9.0, 9.6], [-9.4, 9.05], [-9.4, 6.75, 1]];
  const WBACK = [...WFRONT, [-8.1, 5.2], [-8.1, -3.6], [-8.4, -3.95], [-8.4, -6.35, 1]];
  const EFRONT = flipX(WFRONT), EBACK = flipX(WBACK);
  const ROUTES = {
    well: [[-2.7, 5.6], [-4.4, 8.0]],
    grove: [[2.7, 5.6], [5.0, 8.4]],
    storehouse: [[0, 6.8], [-0.6, 11.8], [-6.4, 12.6]],
    quarry: [[-4.6, 4.9], [-6.8, 8.0], [-9.0, 9.9], [-12.2, 10.8]],
    mine: [[4.6, 4.9], [6.8, 8.0], [9.0, 9.9], [12.0, 10.8]],
    shelter2: [...WFRONT, [-10.2, 3.4]],
    shelter1: [...WFRONT, [-8.1, 5.2], [-8.1, 0.4], [-10.6, -2.2]],
    infirmary: [...EFRONT, [10.2, 3.4]],
    barracks: [...EFRONT, [8.1, 5.2], [8.1, 0.4], [10.6, -2.2]],
    forge: [...WBACK, [-9.6, -8.2], [-10.2, -10.4]],
    archive: [...WBACK, [-6.4, -9.2], [-4.2, -12.0]],
    hall: [...EBACK, [6.4, -9.2], [3.6, -12.2]],
    watchtower: [...EBACK, [9.6, -7.0], [10.4, -6.95], [10.4, -9.1, 1], [10.4, -11.2]],
  };
  // the irrigation channel from the spring past the date grove and out under the wall
  const CHANNEL = [[5.0, 4.2], [6.4, 6.4], [7.5, 9.0], [8.2, 12.6], [8.6, 17.2]];
  const BRIDGE = { x: 7.3, z: 8.45, ry: 0.9 };
  // scenery: homes that fill out each quarter [x, z, y, w, h, d, ry], palms, market stalls, jars
  const HOMES = [
    [-14.1, -4.0, 1.4, 1.3, 1.1, 1.2, 0.5], [-14.2, 0.6, 1.4, 1.1, 1.4, 1.1, 0.4], [-14.0, 5.0, 1.4, 1.4, 1.0, 1.2, 0.3],
    [14.1, -4.0, 1.4, 1.3, 1.2, 1.2, -0.5], [14.2, 0.6, 1.4, 1.2, 1.0, 1.1, -0.4], [14.0, 5.0, 1.4, 1.3, 1.3, 1.2, -0.3],
    [-8.6, -15.6, 2.8, 1.4, 1.5, 1.2, 0.1], [8.4, -15.4, 2.8, 1.5, 1.2, 1.2, -0.1],
    [-12.6, -16.2, 2.8, 1.3, 1.6, 1.3, 0.3], [14.0, -16.0, 2.8, 1.3, 1.1, 1.2, -0.3], [-13.6, -8.4, 2.8, 1.2, 1.0, 1.1, 0.6],
    [-15.0, 12.6, 0, 1.4, 1.2, 1.3, 0.6], [15.0, 13.4, 0, 1.3, 1.1, 1.2, -0.6], [-9.6, 14.0, 0, 1.2, 1.0, 1.1, 0.2],
  ];
  const PALMS = [
    [-6.0, -4.6], [6.0, -4.6], [-3.4, -6.6], [3.4, -6.6], [-2.4, 9.6], [2.4, 9.6], [-2.4, 13.4], [2.6, 12.0],
    [-13.2, 2.0], [13.2, 2.0], [-12.9, -5.2], [12.9, -5.2], [-7.4, -12.8], [0.2, -13.0], [7.2, -12.8], [-13.4, -10.6], [14.4, -7.6],
    [-8.4, 15.0], [11.0, 15.0], [-14.4, 9.0], [14.4, 8.8],
  ];
  const STALLS = [[-3.0, 14.8, '#2f7f9a', 0.2], [2.9, 10.6, '#b5452a', -0.5], [-2.9, 10.9, '#7a3f8a', 0.45]];
  const CARTS = [[-8.9, 12.5, 0.8], [12.6, 13.7, -0.6]];
  const JARS = [[-8.6, 11.4], [-8.2, 13.6], [-4.4, 11.0], [11.4, 7.6], [13.6, 13.2]];
  // camels plod a loop on the dunes outside the gate
  const TRAIL = [[0, 18.2], [5, 20.5], [11, 23.5], [13.5, 29], [5, 32.5], [-6, 30.5], [-12.5, 24.5], [-6.5, 20]];

  function inPoly(x, z, pts) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  }
  // the canyon: flat floor, stepped sandstone walls left, right and behind, dunes past the mouth
  function canyonHalf(x, z) {
    const sg = x > 0 ? 1 : -1;
    return 16.9 + 2.6 * smooth(6, 22, z) + Math.sin(z * 0.23 + sg * 1.7) * 1.0 + Math.sin(z * 0.61 + sg) * 0.45 + Math.sin(z * 1.37 + sg * 2) * 0.18;
  }
  function landH(x, z) {
    const ax = Math.abs(x), half = canyonHalf(x, z);
    const side = smooth(half, half + 2.8, ax) * 12.5 * (1 - smooth(10, 30, z));
    const wb = Math.sin(x * 0.23 + 0.5) * 1.0 + Math.sin(x * 0.67 + 2) * 0.4 + Math.sin(x * 1.4) * 0.15;
    const back = smooth(-18.8 + wb, -22.6 + wb, z) * 15;
    let h = Math.max(side, back);
    // rugged faces, then sandstone strata: flat ledges and steep risers
    if (h > 0.05) h += Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.4) * 0.7 * smooth(0.05, 2.5, h) * (1 - smooth(11, 14, h));
    if (h > 0.05) { const q = h / 2.6, f = q - Math.floor(q); h = (Math.floor(q) + smooth(0.45, 1, f)) * 2.6; }
    if (h > 9) h += A.dune(x * 1.3, z * 1.3) * 0.9 * smooth(9, 12, h);
    const mouth = smooth(17.2, 30, z + ax * 0.15);
    const dunes = A.dune(x, z) * 4.2 * mouth + (ax > 15 ? smooth(15, 26, ax) * mouth * 3 : 0);
    const d = Math.hypot(x - SPRING.x, z - SPRING.z);
    const basin = d < 5.6 ? -1.6 * (1 - smooth(5.15, 5.55, d)) : 0;
    return Math.max(h, dunes) + basin;
  }
  const BASIN = [[3.3, SPRING.y], [3.9, -0.9], [4.6, -0.6], [5.3, -0.3]];
  // height of whatever you would stand on: terrace, crag, basin step or canyon floor
  function groundAt(x, z) {
    if (Math.hypot(x - CRAG.x, z - CRAG.z) < CRAG.r) return CRAG.y;
    for (const t of TERR) if (inPoly(x, z, t.pts)) return t.y;
    const d = Math.hypot(x - SPRING.x, z - SPRING.z);
    for (const [r, y] of BASIN) if (d < r) return y;
    return Math.max(0, landH(x, z));
  }
  T3.groundAt = groundAt;

  let renderer, scene, cam, sun, hemi, sky, terrain, wyrm, mist, dust, fx, bondFx, aura, cloud, rain, bolt, skyriver, deepGlow, deepFx, nextBolt = 0;
  let VW = 0, VH = 0, DPR = 1, fitD = 60;
  const plots = {};
  const props = [];
  const sellers = []; // villagers minding the market stalls
  const sellerSlots = [];
  function syncSellers() {
    if (!A.models) return;
    sellerSlots.forEach((sl) => {
      if (sl.glb || !A.models.ready(sl.id)) return;
      const o = A.models.instance(sl.id, 0.95);
      if (!o) return;
      const old = sellers[sl.i];
      o.position.copy(old.position); o.rotation.y = old.rotation.y;
      sl.sg.remove(old); sl.sg.add(o); sellers[sl.i] = o; sl.glb = true;
    });
  }
  // the painted camels and Scorpion raiders (models3d.js) take the drawn ones' places once they have loaded;
  // the raiders' model is only fetched once a band is on its way
  let glbCamels = false, glbRaiders = false;
  T3.standIns = () => ({ camels, raiders, merchantCamels }); // for tests
  function syncStandIns() {
    if (!A.models) return;
    if (!glbCamels && A.models.want(['a-camel'])) {
      glbCamels = true;
      for (const k of camels) k.c = A.models.swapCamel(k.c) || k.c;
      for (const r of raiders.list) if (r.camel) r.o = A.models.swapCamel(r.o) || r.o;
      merchantCamels.forEach((c) => A.models.swapCamel(c));
    }
    if (!glbRaiders && raiders.g.visible && A.models.want(['r-raider'])) {
      glbRaiders = true;
      for (const r of raiders.list) {
        if (r.camel || r.flag) continue;
        const o = A.models.instance('r-raider', 1.05);
        o.position.copy(r.o.position); o.rotation.copy(r.o.rotation);
        for (const c of [...r.o.children]) if (c.userData.torch) { c.scale.setScalar(1.25); o.add(c); }
        raiders.g.remove(r.o); raiders.g.add(o); r.o = o;
      }
    }
  }
  const banners = [];
  const people = [];
  T3.people = people; // for tests
  const camels = [];
  const routes = {};
  const ringSel = { quest: null, sel: null };
  const hit = [];
  const tmpV = new V3();
  let stoneM, wallM, capM, trailPts = null;

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
    cam = new THREE.PerspectiveCamera(30, 1, 0.5, 700);

    hemi = new THREE.HemisphereLight('#d2ecff', '#d9a060', 1.15);
    scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff0d4', 3);
    sun.castShadow = true;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 160 });
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    stoneM = A.mat('#e2bf8c', { flat: true, map: rep(A.tex.ashlar, 1.6, 1.2) });
    wallM = A.mat('#d9ab74', { flat: true, map: rep(A.tex.ashlar, 1.2, 0.9) });
    capM = A.mat(A.P.adobeL, { flat: true });

    sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), A.skyMat());
    scene.add(sky);
    buildTerrain();
    buildTerraces();
    buildDecor();
    buildChannel();
    buildPool();
    KH.on('rain', () => { roarT = performance.now(); }); // the wyrm rears up and roars as it calls the rain
    wyrm = new A.Wyrm();
    wyrm.group.position.set(SPRING.x, SPRING.y - 0.1, SPRING.z);
    scene.add(wyrm.group);
    mist = A.particles(150, { color: '#dff8ff', opacity: 0.55 });
    dust = A.particles(520, { color: '#f0c98a', opacity: 0.6 });
    fx = A.particles(90, { color: '#ffe08a', additive: true });
    scene.add(mist, dust, fx);
    // bond Lv 10: motes of light circling the spring
    bondFx = A.particles(28, { color: '#ffb6dc', additive: true });
    bondFx.visible = false;
    scene.add(bondFx);
    // the Deepspring (deepspring.js): light welling up through the pool, and motes rising from it
    deepFx = A.particles(48, { color: '#8ffff0', additive: true });
    deepFx.visible = false;
    scene.add(deepFx);
    for (const p of DATA.plots) {
      const l = K.plots[p.id];
      const g = new THREE.Group();
      g.position.copy(plotPos[p.id]);
      g.rotation.y = l.ry || 0;
      scene.add(g);
      const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 3.2, 10), new THREE.MeshBasicMaterial());
      proxy.position.set(0, 1.6, 0);
      proxy.visible = false;
      proxy.userData.pid = p.id;
      g.add(proxy);
      hit.push(proxy);
      plots[p.id] = { g, model: null, key: '', top: 2, path: null };
      routes[p.id] = route(ROUTES[p.id]);
    }
    const wp = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.1, 4.5, 12), new THREE.MeshBasicMaterial());
    wp.position.set(SPRING.x, SPRING.y + 2.4, SPRING.z + 0.4);
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
    trailPts = route([...TRAIL, TRAIL[0]], { smooth: true, loop: true });
    for (let i = 0; i < 3; i++) {
      const c = A.camel(20 + i, { cloth: [A.P.cloth3, A.P.cloth1, A.P.cloth4][i], load: i !== 1 });
      c.scale.setScalar(0.85);
      scene.add(c);
      camels.push({ c, off: i * 1.9 + (i === 2 ? 14 : 0), speed: 1.1 + i * 0.06 });
    }
    buildMerchant();
    buildRaiders();
    // rain: streaks falling through a box that follows the camera's target
    const n = 900, rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    showers = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#eef8ff', transparent: true, opacity: 0, depthWrite: false }));
    showers.frustumCulled = false;
    showers.userData.drops = Array.from({ length: n }, () => ({ x: (Math.random() - 0.5) * 56, y: Math.random() * 26, z: (Math.random() - 0.5) * 56, v: 26 + Math.random() * 10 }));
    scene.add(showers);
    T3.ready = true;
    return true;
  }
  function rep(t0, w, h) {
    const t = t0.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / w, 1 / h);
    return t;
  }

  // ======================================================================
  // Ground: the canyon in fine detail near the keep, the open desert beyond
  // ======================================================================
  const cFloor = new Col('#d3a268'), cFloorD = new Col('#c08c55'), cDune = new Col('#dca562'), cCrest = new Col('#f0c88a'), cTrough = new Col('#b8783f'), cLedge = new Col('#c4834e'), cLedgeL = new Col('#d79b5e');
  const BANDS = ['#9e5a32', '#c48650', '#b06c3e', '#d9a066', '#a8623a', '#c17c48', '#8f5030'].map((c) => new Col(c));
  function groundMesh(size, seg, drop) {
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, r = seeded(size);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, landH(x, z) - (drop ? drop(x, z) : 0));
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal, colors = new Float32Array(pos.count * 3), c = new Col();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
      const steep = 1 - smooth(0.5, 0.8, ny);
      const inside = Math.abs(x) < 16.5 && z > -19 && z < 17;
      if (inside && y < 0.4) c.copy(cFloor).lerp(cFloorD, 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(z * 0.7) * 2) * Math.sin(z * 0.6));
      else if (y > 1.2 && z < 30) c.copy(cLedge).lerp(cLedgeL, clamp(A.dune(x * 1.7, z * 1.7) / 1.6, 0, 1));
      else { const t = clamp(A.dune(x, z) / 1.6, 0, 1); c.copy(cTrough).lerp(cDune, smooth(0, 0.5, t)).lerp(cCrest, smooth(0.55, 1, t)); }
      if (steep > 0) {
        const b = BANDS[((Math.floor((y + 0.35 * Math.sin(x * 0.6 + z * 0.4)) / 1.05) % BANDS.length) + BANDS.length) % BANDS.length];
        c.lerp(b, steep);
      }
      const j = 0.94 + r() * 0.08;
      colors[i * 3] = c.r * j; colors[i * 3 + 1] = c.g * j; colors[i * 3 + 2] = c.b * j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const map = rep(A.tex.sand, 5, 5), nmap = rep(A.tex.ripple, 7, 7);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nmap, normalScale: new V2(0.45, 0.45), roughness: 0.96, flatShading: !drop });
    return new THREE.Mesh(g, m);
  }
  // a weathered sandstone block in strata bands (the back of the temple, buttes on the plateau)
  function rockBlock(w, h, d, seed, keepFront = false) {
    const g = new THREE.BoxGeometry(w, h, d, Math.ceil(w / 1.2), Math.ceil(h / 1.2), Math.max(2, Math.ceil(d / 1.2)));
    const p = g.attributes.position, r = seeded(seed * 71 + 3), cols = new Float32Array(p.count * 3), seen = new Map();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
      if (!seen.has(key)) seen.set(key, [(r() - 0.5) * 0.7, (r() - 0.5) * 0.35, (r() - 0.5) * 0.7]);
      const [jx, jy, jz] = seen.get(key);
      if (y > -h / 2 + 0.01) { p.setX(i, x + jx); p.setY(i, y + (y < h / 2 - 0.01 ? jy : 0)); p.setZ(i, z + (keepFront && z > d / 2 - 0.01 ? -Math.abs(jz) : jz)); }
      const b = BANDS[((Math.floor((y + h / 2) / 1.05) + seed) % BANDS.length + BANDS.length) % BANDS.length];
      cols[i * 3] = b.r; cols[i * 3 + 1] = b.g; cols[i * 3 + 2] = b.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.castShadow = true; m.receiveShadow = true;
    m.userData.keep = true; // vertex colors: never merged by A.bake
    return m;
  }
  function buildTerrain() {
    terrain = groundMesh(78, 195);
    terrain.receiveShadow = true;
    terrain.castShadow = true;
    scene.add(terrain);
    const far = groundMesh(340, 120, (x, z) => (Math.abs(x) < 38 && Math.abs(z) < 38 ? 3 : 0.3));
    scene.add(far);
    // buttes and spires standing on the plateau around the canyon rim
    const rb = seeded(41);
    for (let i = 0; i < 16; i++) {
      const side = i % 3, t = rb();
      const x = side === 2 ? (t - 0.5) * 70 : (side ? 1 : -1) * (25 + rb() * 18), z = side === 2 ? -27 - rb() * 16 : -24 + t * 44;
      const hgt = 3 + rb() * 8, wd = 2.5 + rb() * 4;
      const b = rockBlock(wd, hgt, wd * (0.7 + rb() * 0.6), i);
      b.position.set(x, landH(x, z) + hgt / 2 - 0.4, z);
      b.rotation.y = rb() * 3;
      scene.add(b);
    }
    // distant mesas and rock spires on the horizon
    const r = seeded(19);
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * 0.95 + (i / 17) * Math.PI * 1.9 + (r() - 0.5) * 0.15;
      const d = 95 + r() * 60;
      const m = A.mesa(10 + r() * 18, 7 + r() * 10, i);
      m.position.x = Math.sin(a) * d;
      m.position.z = -Math.cos(a) * d;
      m.position.y += landH(m.position.x, m.position.z);
      scene.add(m);
    }
  }

  // ======================================================================
  // Terraces, stairs and parapets
  // ======================================================================
  function stairs(a, b, w) {
    const g = new THREE.Group();
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), rise = b[2] - a[2];
    const n = Math.max(3, Math.round(rise / 0.2));
    for (let i = 0; i < n; i++) g.add(A.box(L / n + 0.02, ((i + 1) * rise) / n + 0.4, w, stoneM, (L * (i + 0.5)) / n, -0.4, 0));
    const sh = new THREE.Shape([new V2(0, -0.4), new V2(L + 0.1, -0.4), new V2(L + 0.1, rise + 0.38), new V2(0, 0.38)]);
    const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
    for (const s of [-1, 1]) { const m = new THREE.Mesh(cg, wallM); m.position.z = s > 0 ? w / 2 : -w / 2 - 0.2; g.add(m); }
    g.position.set(a[0], a[2], a[1]);
    g.rotation.y = -Math.atan2(dz, dx);
    return g;
  }
  function wallRun(pts, y, h, th, g, m = wallM) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0);
      const seg = A.grp(A.box(len + th * 0.3, h, th, m), A.box(len + th * 0.6, 0.07, th + 0.08, capM, 0, h, 0));
      seg.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      g.add(seg);
    }
  }
  function buildTerraces() {
    const topM = new THREE.MeshStandardMaterial({ color: '#dcae72', map: rep(A.tex.sand, 4, 4), roughness: 0.95 });
    const sideM = new THREE.MeshStandardMaterial({ color: '#e0b884', map: rep(A.tex.ashlar, 1.6, 1.2), roughness: 0.9 });
    for (const t of TERR) {
      const sh = new THREE.Shape(t.pts.map(([x, z]) => new V2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(sh, { depth: t.y + 0.6, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -0.6, 0);
      const m = new THREE.Mesh(geo, [topM, sideM]);
      m.castShadow = true; m.receiveShadow = true;
      scene.add(m);
    }
    // the watchtower's crag: banded rock with a flat top
    const crag = A.mesa(CRAG.y - 2.8 + 1.0, CRAG.r * 1.22, 7);
    crag.position.set(CRAG.x, 2.8 + (CRAG.y - 2.8 + 1.0) / 2 - 1.0, CRAG.z);
    crag.castShadow = true;
    scene.add(crag);
    const g = new THREE.Group();
    for (const s of STAIRS) g.add(stairs(s.a, s.b, s.w));
    for (const p of PARAPETS) wallRun(p.pts, p.y, 0.4, 0.22, g);
    // lanterns at the foot and head of every stair
    for (const s of STAIRS) for (const [x, z, y] of [s.a, s.b]) for (const k of [-1, 1]) {
      const ox = Math.abs(s.b[1] - s.a[1]) > Math.abs(s.b[0] - s.a[0]) ? k * (s.w / 2 + 0.35) : 0;
      if (Math.abs(x + ox) > 15.5) continue;
      g.add(A.at(lampPost(1.3), x + ox, y, z, k > 0 ? Math.PI : 0));
    }
    // bougainvillea spilling over the parapets, and rugs hung out to air
    const r = seeded(71);
    PARAPETS.forEach((p, pi) => {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [x0, z0] = p.pts[i], [x1, z1] = p.pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), ry = -Math.atan2(z1 - z0, x1 - x0);
        for (let u = 0.9; u < len - 0.5; u += 2.2 + r() * 1.6) {
          const k = u / len, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k;
          g.add(A.at((i + pi + Math.round(u)) % 4 === 1 ? airingRug(r) : bougainvillea(r), x, p.y + 0.4, z, ry));
        }
      }
    });
    scene.add(A.bake(g));
  }

  // ======================================================================
  // Routes and paths
  // ======================================================================
  // Chaikin-smoothed walking line over the ground; a waypoint flagged [x, z, 1] ends a stair,
  // which is climbed in a straight line
  function chaikin(pts, n = 2) {
    let p = pts;
    for (let k = 0; k < n; k++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const [x0, z0] = p[i], [x1, z1] = p[i + 1];
        out.push([x0 * 0.75 + x1 * 0.25, z0 * 0.75 + z1 * 0.25], [x0 * 0.25 + x1 * 0.75, z0 * 0.25 + z1 * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    return p;
  }
  function route(wps, o = {}) {
    const runs = [];
    let cur = [wps[0]];
    for (let i = 1; i < wps.length; i++) {
      if (wps[i][2]) { runs.push({ pts: cur }); runs.push({ stair: true, pts: [wps[i - 1], wps[i]] }); cur = [wps[i]]; } else cur.push(wps[i]);
    }
    runs.push({ pts: cur });
    const out = [], legs = [];
    for (const run of runs) {
      const pts = run.stair || run.pts.length < 3 ? run.pts : chaikin(run.pts, o.smooth ? 3 : 2);
      const leg = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35));
        const ya = groundAt(a[0], a[1]), yb = groundAt(b[0], b[1]);
        for (let k = i || out.length ? 1 : 0; k <= n; k++) {
          const u = k / n, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
          const v = new V3(x, run.stair ? ya + (yb - ya) * u : groundAt(x, z), z);
          out.push(v); leg.push(v);
        }
      }
      if (!run.stair) legs.push(leg);
    }
    const len = [0];
    for (let i = 1; i < out.length; i++) len.push(len[i - 1] + out[i].distanceTo(out[i - 1]));
    return { pts: out, len, total: len[len.length - 1], legs };
  }
  function along(r, s) {
    let lo = 0, hi = r.len.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.len[m] <= s) lo = m; else hi = m; }
    const k = (s - r.len[lo]) / Math.max(1e-6, r.len[hi] - r.len[lo]);
    return { p: tmpV.copy(r.pts[lo]).lerp(r.pts[hi], k), dx: r.pts[hi].x - r.pts[lo].x, dz: r.pts[hi].z - r.pts[lo].z };
  }
  // a flat ribbon draped over the ground along a dense line of points
  function ribbon(pts, w, lift, m, trimEnd = 0) {
    let end = pts.length;
    if (trimEnd) { let acc = 0; while (end > 2 && acc < trimEnd) { acc += pts[end - 1].distanceTo(pts[end - 2]); end--; } }
    const P = pts.slice(0, end);
    if (P.length < 2) return null;
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[Math.min(i + 1, P.length - 1)], o = P[Math.max(i - 1, 0)];
      const tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1;
      const nx = -tz / l, nz = tx / l;
      if (i) acc += Math.hypot(p.x - P[i - 1].x, p.z - P[i - 1].z);
      for (const s of [-1, 1]) {
        const x = p.x + (nx * s * w) / 2, z = p.z + (nz * s * w) / 2;
        pos.push(x, Math.max(p.y, groundAt(x, z)) + lift, z);
        uv.push(s > 0 ? 1 : 0, acc / w);
      }
      if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    return mesh;
  }
  const pathM = new THREE.MeshStandardMaterial({ color: '#ecc995', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

  // ======================================================================
  // Water: the channel to the grove, its fields and a footbridge
  // ======================================================================
  function buildChannel() {
    const r = route(CHANNEL);
    const water = ribbon(r.pts, 0.62, 0.05, A.waterMat({ alpha: 0.92, shallow: '#4fd4d0' }));
    scene.add(water);
    // tapping the channel opens the Channels puzzle
    for (let i = 0; i < r.pts.length - 6; i += 6) {
      const p = r.pts[i], q = r.pts[i + 6], len = Math.hypot(q.x - p.x, q.z - p.z);
      const pr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, len), new THREE.MeshBasicMaterial());
      pr.position.set((p.x + q.x) / 2, 0.3, (p.z + q.z) / 2);
      pr.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      pr.visible = false;
      pr.userData.pid = 'channels';
      scene.add(pr);
      hit.push(pr);
    }
    const g = new THREE.Group();
    // stone curbs on both banks
    for (const s of [-1, 1]) {
      const bank = [];
      for (let i = 0; i < r.pts.length; i += 3) {
        const p = r.pts[i], q = r.pts[Math.min(i + 1, r.pts.length - 1)], o = r.pts[Math.max(i - 1, 0)];
        const tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1;
        bank.push([p.x - (tz / l) * 0.42 * s, p.z + (tx / l) * 0.42 * s]);
      }
      bank.push([r.pts[r.pts.length - 1].x - 0.42 * s, r.pts[r.pts.length - 1].z]);
      wallRun(bank.filter(([, z]) => z < 16), 0, 0.12, 0.16, g, stoneM);
    }
    // irrigated plots on both sides of the channel, below the grove
    const mudM = A.mat('#8a6238', { flat: true });
    for (const [x, z, w, d] of [[9.6, 12.0, 2.2, 3.6], [6.4, 11.2, 1.8, 2.2]]) {
      const cropM = A.mat('#ffffff', { map: rep(A.tex.crops, 1.6 / w, 1.6 / d) });
      const f = new THREE.Mesh(A.geo(`field${w},${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), cropM);
      f.position.set(x, 0.04, z);
      f.receiveShadow = true;
      scene.add(f);
      wallRun([[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2], [x - w / 2, z - d / 2]], 0, 0.1, 0.12, g, mudM);
    }
    // footbridge where the eastern lane crosses
    const deck = A.mat(A.P.wood, { flat: true }), rail = A.mat(A.P.woodD);
    const br = A.grp(A.box(0.95, 0.1, 1.6, deck, 0, 0.16, 0), A.box(0.06, 0.32, 1.6, rail, -0.45, 0.26, 0), A.box(0.06, 0.32, 1.6, rail, 0.45, 0.26, 0));
    br.position.set(BRIDGE.x, 0, BRIDGE.z);
    br.rotation.y = BRIDGE.ry;
    g.add(br);
    scene.add(A.bake(g));
  }

  // ======================================================================
  // The town around the plots: wall and gate, the upper town, palms and lamps
  // ======================================================================
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
      merchantCamels.push(c);
    }
    g.position.set(4.2, 0, 13.6);
    g.visible = false;
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.5, 10), new THREE.MeshBasicMaterial());
    proxy.position.set(0, 1.2, 0);
    proxy.visible = false;
    proxy.userData.pid = 'merchant';
    g.add(proxy);
    scene.add(g);
    merchant = g;
  }
  let merchant = null, showers = null, flashAt = -9, raiders = null;
  const merchantCamels = [];
  // Scorpion raiders: a band that crosses the dunes toward the gate while the watchtower has them in sight
  function buildRaiders() {
    const g = new THREE.Group(), list = [];
    const robe = '#2e1e1a', wrap = '#b8331c';
    const flameM = new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff8020', emissiveIntensity: 2.2 });
    // wedge formation: [side offset, back offset]
    const spots = [[0, 0], [-1.1, 1.0], [1.1, 1.0], [-2.2, 2.0], [0, 2.0], [2.2, 2.0], [-1.1, 3.0], [1.1, 3.0], [-3.2, 3.2], [3.2, 3.2]];
    spots.forEach(([sx, sz], i) => {
      const o = A.person(300 + i, { robe, wrap, kind: 'raider' });
      o.scale.setScalar(1.25);
      if (i === 1 || i === 2 || i === 7) {
        const torch = A.grp(A.cyl(0.03, 0.035, 0.8, A.mat(A.P.woodD), 0.22, 0.35, 0.1, 5), A.sph(0.1, flameM, 0.22, 1.2, 0.1, 6));
        torch.userData.torch = true;
        o.add(torch);
      }
      g.add(o);
      list.push({ o, sx, sz, ph: i * 1.7, i });
    });
    for (let i = 0; i < 2; i++) {
      const c = A.camel(320 + i, { cloth: '#5a1a1a', load: false });
      c.scale.setScalar(0.9);
      g.add(c);
      list.push({ o: c, sx: i ? 3.6 : -3.6, sz: 0.6, ph: i * 3, camel: true });
    }
    const flag = A.banner('#4a1410', 2.6, 0.75, 0.5);
    g.add(flag);
    list.push({ o: flag, sx: 0.4, sz: 1.2, ph: 0, flag: true });
    g.visible = false;
    scene.add(g);
    // the Scorpion host's camp (siege.js), pitched behind the band while it waits for your horn
    const camp = new THREE.Group(), hide = A.mat('#6a4a32', { flat: true }), hideD = A.mat('#4a3020', { flat: true }), wood = A.mat(A.P.woodD);
    [[-2.2, 0.6, 1.5, hide], [2.4, 0.2, 1.3, hideD], [0.3, 2.4, 1.7, hide]].forEach(([x, z, h, m]) => camp.add(A.cone(1.1 * h / 1.5, h, m, x, 0, z, 6)));
    for (let i = 0; i < 3; i++) { const lg = A.cyl(0.06, 0.06, 0.7, wood, 0, 0.06, 0, 5); lg.rotation.set(Math.PI / 2, (i * Math.PI) / 3, 0); lg.position.set(0, 0.06, -1.2); camp.add(lg); }
    camp.add(A.sph(0.22, flameM, 0, 0.22, -1.2, 6));
    A.bake(camp);
    camp.visible = false;
    scene.add(camp);
    raiders = { g, list, flame: flameM, camp };
  }
  const RAID_FROM = new V3(-12, 0, 36), RAID_TO = new V3(0, 0, 19.2);
  // the Scorpion Siege's host (siege.js) uses the same band: camped in the dunes while it waits, at the gate once the horn sounds
  function animRaiders(t) {
    const raid = KH.raidProgress ? KH.raidProgress() : null;
    const k = raid != null ? raid : KH.siege ? KH.siege.view() : null;
    raiders.g.visible = k != null;
    raiders.camp.visible = false;
    if (k == null) return;
    const marching = raid != null || !!KH.siege.run();
    const e = smooth(0, 1, k);
    const hx = RAID_TO.x - RAID_FROM.x, hz = RAID_TO.z - RAID_FROM.z, hl = Math.hypot(hx, hz);
    const fx = hx / hl, fz = hz / hl, ry = Math.atan2(fx, fz);
    // a little curve through the dunes
    const cx = lerp(RAID_FROM.x, RAID_TO.x, e) + Math.sin(e * Math.PI) * 4, cz = lerp(RAID_FROM.z, RAID_TO.z, e);
    if (!marching) {
      const bx = cx - fx * 5.5, bz = cz - fz * 5.5;
      raiders.camp.visible = true;
      raiders.camp.position.set(bx, landH(bx, bz), bz);
      raiders.camp.rotation.y = ry;
    }
    for (const r of raiders.list) {
      // while the host waits in camp only a few stand guard (the rest are in the tents): half the models to draw
      r.o.visible = marching || r.flag || (r.camel ? r.sx < 0 : r.i < 5);
      if (!r.o.visible) continue;
      const x = cx + -fz * r.sx - fx * r.sz, z = cz + fx * r.sx - fz * r.sz;
      const walking = marching && k < 0.995;
      r.o.position.set(x, landH(x, z) + (walking && !r.camel && !r.flag ? Math.abs(Math.sin(t * 6 + r.ph)) * 0.06 : 0), z);
      r.o.rotation.y = r.flag ? ry - Math.PI / 2 : ry;
      if (r.camel && walking) A.walkCamel(r.o, t + r.ph, 0.8);
      else if (!r.camel && !r.flag) A.animPerson(r.o, t + r.ph, walking ? 'walk' : 'idle', 0.9);
      if (r.flag) r.o.userData.update(t, T3.wind || 1);
    }
    raiders.flame.emissiveIntensity = 1.8 + 0.7 * Math.sin(t * 13) * Math.sin(t * 7.3);
  }
  KH.on('rain', () => { flashAt = performance.now(); });

  function tower(r, h, m, roof) {
    const g = A.grp(A.cyl(r, r * 1.12, h, m, 0, 0, 0, 10), A.cyl(r * 1.22, r * 1.22, 0.16, capM, 0, h, 0, 10));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.add(A.box(0.2, 0.26, 0.2, capM, Math.cos(a) * r * 1.08, h + 0.16, Math.sin(a) * r * 1.08)); }
    if (roof) g.add(A.cone(r * 1.15, r * 1.1, A.mat(roof, { flat: true }), 0, h + 0.16, 0, 10));
    g.add(A.sph(0.08, A.lamp, 0, h * 0.62, r * 1.06, 6));
    return g;
  }
  // a lamp post with a curled bracket and a hanging brass lantern
  function lampPost(h = 1.5) {
    const post = A.mat(A.P.woodD), iron = A.mat(A.P.dark);
    return A.grp(A.cyl(0.08, 0.1, 0.14, A.mat(A.P.stone, { flat: true }), 0, 0, 0, 6), A.cyl(0.035, 0.045, h, post, 0, 0.1, 0, 6), A.box(0.32, 0.03, 0.03, iron, 0.13, h, 0), A.sph(0.04, A.mat(A.P.gold, { m: 0.6, r: 0.35 }), 0, h + 0.12, 0, 6), A.cyl(0.02, 0.02, 0.1, post, 0, h + 0.04, 0, 4), A.lantern(0.26, h, 0, 0.05, 1.25));
  }
  // a clump of bougainvillea on a wall top, trailing down both faces
  function bougainvillea(r) {
    const g = new THREE.Group(), leaf = A.mat('#3f7f2e', { flat: true }), flowers = [A.mat('#d8407e', { flat: true }), A.mat('#b8306a', { flat: true }), A.mat('#e870a0', { flat: true })];
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1, down = i < 2 ? 0 : 0.12 + r() * 0.3;
      g.add(A.sph(0.14 + r() * 0.08, i % 3 ? flowers[i % 3] : leaf, (r() - 0.5) * 0.7, 0.06 - down, i < 2 ? 0 : side * 0.15, 6));
    }
    return g;
  }
  // a kilim folded over the parapet
  function airingRug(r) {
    const m = A.mat('#ffffff', { map: A.tex.kilim, ds: true }), w = 0.5 + r() * 0.2;
    return A.grp(A.box(w, 0.02, 0.3, m, 0, 0.01, 0), A.box(w, 0.5, 0.02, m, 0, -0.48, 0.15), A.box(w, 0.3, 0.02, m, 0, -0.28, -0.15));
  }
  // a market stall: a striped awning over a counter of spices and pots, a rug hung at the back
  function stall(c, r) {
    const st = new THREE.Group(), post = A.mat(A.P.woodD), gold = A.mat(A.P.gold, { m: 0.6, r: 0.35 });
    st.add(A.box(1.3, 0.5, 0.6, A.woodMat(A.P.wood), 0, 0, 0), A.box(1.38, 0.05, 0.68, post, 0, 0.5, 0));
    for (const [px, pz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) st.add(A.cyl(0.03, 0.03, 1.4, post, px, 0, pz, 4));
    const cloth = A.mat('#ffffff', { map: A.tex.stripes(c, A.P.cloth2, 6), ds: true });
    const roof = A.box(1.5, 0.04, 0.9, cloth, 0, 1.4, 0);
    roof.rotation.x = 0.2;
    st.add(roof);
    for (let k = 0; k < 6; k++) st.add(A.cone(0.07, 0.12, cloth, -0.62 + k * 0.25, 1.15, 0.47, 3).rotateX(Math.PI));
    st.add(A.box(0.95, 0.75, 0.02, A.mat('#ffffff', { map: A.tex.kilim, ds: true }), 0, 0.55, -0.31));
    const spice = ['#c8553d', '#e8b54a', '#7a8a2a', '#a0461c', '#d88a2a', '#8a2a3a'];
    for (let k = 0; k < 4; k++) {
      const x = -0.45 + k * 0.3;
      st.add(A.cyl(0.12, 0.08, 0.05, gold, x, 0.55, 0.1, 10), A.cone(0.1, 0.13, A.mat(spice[(k + Math.floor(r() * 6)) % 6], { flat: true }), x, 0.59, 0.1, 8));
    }
    st.add(A.at(A.jar(0.45, '#2f8f94'), -0.5, 0.55, -0.15), A.at(A.jar(0.4, '#b0603a'), 0.5, 0.55, -0.15));
    st.add(A.basket(-0.4, 0, 0.55, '#e8b54a', 0.9), A.basket(0.1, 0, 0.6, '#5f9a3e', 0.8), A.sack(0.5, 0, 0.55, 0.9));
    st.add(A.lantern(0.55, 1.3, 0.38, 0.08));
    return st;
  }
  // a handcart loaded with jars and sacks
  function cart() {
    const wood = A.woodMat(A.P.wood), post = A.mat(A.P.woodD), g = new THREE.Group();
    g.add(A.box(0.9, 0.08, 0.55, wood, 0, 0.32, 0), A.box(0.9, 0.18, 0.04, wood, 0, 0.4, 0.26), A.box(0.9, 0.18, 0.04, wood, 0, 0.4, -0.26));
    for (const s of [-1, 1]) g.add(A.mesh(A.geo('cartw', () => new THREE.TorusGeometry(0.24, 0.035, 5, 14)), post, -0.1, 0.24, s * 0.32));
    g.add(A.rod(new V3(0.45, 0.36, 0.18), new V3(1.15, 0.12, 0.2), 0.025, post), A.rod(new V3(0.45, 0.36, -0.18), new V3(1.15, 0.12, -0.2), 0.025, post));
    g.add(A.at(A.jar(0.55, '#b0603a'), -0.2, 0.36, 0.08), A.at(A.jar(0.5, '#2f8f94'), 0.15, 0.36, -0.08), A.sack(0.3, 0.36, 0.12, 0.8));
    return g;
  }
  // a string of lanterns (and bunting) sagging between two points
  function stringLights(a, b, sag = 0.35, n = 7) {
    const g = new THREE.Group(), rope = A.mat(A.P.rope), at = (t) => new V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t);
    for (let i = 0; i < 10; i++) g.add(A.rod(at(i / 10), at((i + 1) / 10), 0.008, rope));
    const cols = ['#b5452a', '#e8b54a', '#2f7f9a', '#7a3f8a', '#f0d9a8'].map((c) => A.mat(c, { ds: true })), ry = -Math.atan2(b.z - a.z, b.x - a.x);
    for (let i = 1; i <= n; i++) {
      const p = at(i / (n + 1));
      g.add(A.sph(0.06, A.lamp, p.x, p.y - 0.08, p.z, 6));
      const q = at((i - 0.5) / (n + 1)), f = A.mesh(A.geo('pennant', () => new THREE.ShapeGeometry(new THREE.Shape([new V2(-0.09, 0), new V2(0.09, 0), new V2(0, -0.2)]))), cols[i % 5], q.x, q.y, q.z);
      f.rotation.y = ry;
      g.add(f);
    }
    return g;
  }
  function buildDecor() {
    const r = seeded(29);
    const g = new THREE.Group();
    const adobe = A.mat(A.P.adobe, { flat: true }), adobeD = A.mat(A.P.adobeD, { flat: true }), lampM = A.mat(A.P.woodD), cu = A.mat(A.P.copper, { m: 0.5, r: 0.4 });
    // the front wall across the canyon mouth, with towers and a great gate
    const WZ = K.gate.z;
    const wallPts = (x0, x1) => { const p = []; for (let x = x0; x <= x1 + 1e-6; x += (x1 - x0) / Math.ceil((x1 - x0) / 1.6)) p.push([x, WZ + 0.12 * Math.sin(x * 0.5)]); return p; };
    wallRun(wallPts(-21, -2.1), 0, 1.7, 0.6, g, wallM);
    wallRun(wallPts(2.1, 21), 0, 1.7, 0.6, g, wallM);
    for (let x = -20.6; x < 20.8; x += 0.55) if (Math.abs(x) > 2.3) g.add(A.box(0.28, 0.3, 0.66, capM, x, 1.77, WZ + 0.12 * Math.sin(x * 0.5)));
    for (const x of [-12.4, -6.6, 6.6, 12.4]) g.add(A.at(tower(0.75, 2.6, wallM, null), x, 0, WZ));
    for (const s of [-1, 1]) g.add(A.at(A.grp(tower(0.95, 3.6, wallM, null), A.tealDome(0.82, 0, 3.76, 0, 0.3)), s * 2.2, 0, WZ + 0.1));
    for (const dz of [-0.415, 0.415]) g.add(A.box(2.4, 0.26, 0.02, A.mat('#ffffff', { map: A.texRep(A.tex.zellige, 4, 0.45) }), 0, 2.68, WZ + 0.1 + dz));
    // the great doors stand open, swung back into the keep
    for (const s of [-1, 1]) g.add(A.at(A.grp(A.box(1.2, 2.3, 0.1, A.woodMat(A.P.door), s * 0.6, 0, 0), A.box(1.2, 0.08, 0.14, A.mat(A.P.dark), s * 0.6, 0.5, 0), A.box(1.2, 0.08, 0.14, A.mat(A.P.dark), s * 0.6, 1.8, 0)), s * 1.3, 0, WZ - 0.25, s * 1.35));
    const lintel = A.grp(A.box(3.4, 0.55, 0.8, wallM, 0, 2.55, 0), A.box(3.6, 0.1, 0.9, capM, 0, 3.1, 0), A.box(2.6, 0.12, 0.84, adobeD, 0, 2.45, 0));
    lintel.position.set(0, 0, WZ + 0.1);
    g.add(lintel);
    for (const s of [-1, 1]) for (const x of [s * 1.0, s * 9.5]) g.add(A.at(lampPost(), x, 0, WZ + 0.9, s > 0 ? Math.PI : 0));
    // the paved avenue from the gate to the spring, lined with lamps
    const ave = ribbon(route([[0, WZ + 1.2], [0, 6.6]]).pts, 2.6, 0.03, new THREE.MeshStandardMaterial({ map: rep(A.tex.paving, 2.4, 2.4), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    scene.add(ave);
    for (let z = 8.2; z < WZ - 0.5; z += 2.6) for (const s of [-1, 1]) g.add(A.at(lampPost(), s * 1.6, 0, z, s > 0 ? Math.PI : 0));
    // string lanterns and bunting across the avenue (clear of the fountain)
    for (const z of [8.2, 10.8]) g.add(stringLights(new V3(-1.6, 1.62, z), new V3(1.6, 1.62, z), 0.3));
    g.add(stringLights(new V3(-1.6, 1.62, 8.2), new V3(1.6, 1.62, 10.8), 0.4, 9), stringLights(new V3(-1.0, 1.62, WZ + 0.9), new V3(1.0, 1.62, WZ + 0.9), 0.2, 5));
    // lamps around the spring's plaza
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const x = SPRING.x + Math.cos(a) * 6.75, z = SPRING.z + Math.sin(a) * 6.75;
      if (Math.abs(x) > 6.6 && z < 5) continue;
      g.add(A.at(lampPost(), x, 0, z, Math.PI - a));
    }
    // market stalls by the gate
    STALLS.forEach(([x, z, c, ry], i) => {
      g.add(A.at(stall(c, r), x, 0, z, ry));
      // the seller stands behind the counter
      const p = A.person(500 + i * 7, { scale: 1.1 }), sg = A.at(new THREE.Group(), x, 0, z, ry);
      p.position.set(0.95, 0, 0.2);
      p.rotation.y = -0.4;
      sg.add(p);
      scene.add(sg);
      sellers.push(p);
      sellerSlots.push({ sg, i, id: ['v-trader', 'v-woman', 'v-elder'][i % 3] });
    });
    for (const [x, z, ry] of CARTS) g.add(A.at(cart(), x, 0, z, ry));
    // homes that fill out each quarter (scenery only)
    const walls = [A.P.adobe, A.P.plaster, A.P.adobeL, A.P.sandstone];
    HOMES.forEach(([x, z, y, w, h, d, ry], i) => {
      const hz = A.house(w, h, d, { wall: walls[i % walls.length], side: i % 2 === 0, seed: 11 + i, brick: i % 4 === 3 });
      if (i % 3 === 0) hz.add(A.boxT(w * 0.55, h * 0.5, d * 0.6, A.wallMat(walls[(i + 1) % walls.length]), -w * 0.12, h, -d * 0.15, 1.2));
      g.add(A.at(hz, x, y, z, ry));
    });
    // the Rain Altar: an open pavilion on the upper crescent, looking down on the spring
    const alt = new THREE.Group(), white = A.mat(A.P.white, { flat: true });
    alt.add(A.cyl(1.55, 1.7, 0.3, stoneM, 0, 0, 0, 12));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, b = a + Math.PI / 6;
      alt.add(A.at(A.column(1.7, A.mat(A.P.white, { map: A.tex.plaster }), 0, 0, 0.11, capM), Math.cos(a) * 1.15, 0.3, Math.sin(a) * 1.15));
      alt.add(A.lantern(Math.cos(b) * 1.05, 2.0, Math.sin(b) * 1.05, 0.12));
    }
    alt.add(A.cyl(1.4, 1.4, 0.18, capM, 0, 2.0, 0, 12), A.cyl(1.32, 1.32, 0.06, A.mat(A.P.gold, { m: 0.6, r: 0.35 }), 0, 2.18, 0, 12), A.dome(1.3, A.domeMat(A.P.tile), 0, 2.2, 0, 18), A.finial(0, 3.48, 0, 1.6));
    alt.add(A.cyl(0.45, 0.55, 0.5, stoneM, 0, 0.3, 0, 10));
    g.add(A.at(alt, 0, 2.8, -10.4));
    const bowl = new THREE.Mesh(new THREE.CircleGeometry(0.4, 16).rotateX(-Math.PI / 2), A.waterMat({ alpha: 0.95 }));
    bowl.position.set(0, 2.8 + 0.81, -10.4);
    scene.add(bowl);
    // the Temple of Rains, carved into the canyon head
    const tm = new THREE.Group(), rockD = A.mat('#9c5f38', { flat: true }), carve = A.mat('#e3b884', { flat: true }), dark = A.mat('#3a2214');
    const back = rockBlock(12.5, 11, 3.6, 3, true);
    back.position.set(0, 5.0, -1.6);
    tm.add(back);
    tm.add(A.box(7.4, 0.35, 1.2, carve, 0, 0, 0.2), A.box(6.8, 0.3, 0.9, carve, 0, 0.35, 0.15));
    for (let i = 0; i < 6; i++) tm.add(A.cyl(0.24, 0.27, 4.2, carve, -2.9 + i * 1.16, 0.65, 0.35, 10));
    tm.add(A.box(7.0, 0.6, 0.9, carve, 0, 4.85, 0.25));
    const ped = new THREE.Mesh(A.geo('pediment', () => { const s = new THREE.Shape([new V2(-3.7, 0), new V2(3.7, 0), new V2(0, 1.5)]); return new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false }); }), carve);
    ped.position.set(0, 5.45, -0.15);
    tm.add(ped);
    tm.add(A.box(1.5, 2.6, 0.12, dark, 0, 0.65, 0.24), A.arch(0.75, 0.12, dark, 0, 3.25, 0.24));
    for (const s of [-1, 1]) tm.add(A.box(0.8, 1.2, 0.12, dark, s * 2.3, 1.4, 0.24));
    g.add(A.at(tm, 0, 2.8, -18.0));
    // cliff dwellings on the canyon walls
    const face = (side, at, y) => {
      // walk out from the canyon floor until the cliff reaches height y
      for (let d = 15; d < 26; d += 0.1) {
        const x = side === 'b' ? at : side * d, z = side === 'b' ? -d - 3 : at;
        if (landH(x, z) >= y + 0.2) return side === 'b' ? [x, z + 0.35] : [x - side * 0.35, z];
      }
      return null;
    };
    let dwN = 0;
    for (const [side, at, y, ry] of [[-1, -9, 3.6, Math.PI / 2], [-1, 1, 6.2, Math.PI / 2], [1, -4, 3.6, -Math.PI / 2], [1, -12, 6.2, -Math.PI / 2], ['b', -9, 6.2, 0], ['b', 9, 3.6, 0], ['b', -13, 3.6, 0]]) {
      const f = face(side, at, y);
      if (!f) continue;
      const [x, z] = f;
      const dw = A.grp(A.box(1.5, 1.6, 0.5, carve, 0, 0, 0), A.box(0.5, 0.85, 0.1, dark, 0, 0.15, 0.24), A.arch(0.25, 0.1, dark, 0, 1.0, 0.24), A.box(1.7, 0.12, 0.7, rockD, 0, 1.6, 0));
      // lit lattice windows, a cloth awning over the door and a pot of flowers on the ledge
      for (const sx of [-0.5, 0.5]) dw.add(A.box(0.2, 0.3, 0.04, A.glowLattice, sx, 0.75, 0.26), A.arch(0.1, 0.04, A.glowLattice, sx, 1.05, 0.26));
      const aw = A.box(0.8, 0.03, 0.4, A.mat('#ffffff', { map: A.tex.stripes([A.P.cloth3, A.P.cloth1, A.P.cloth4][dwN % 3], A.P.cloth2, 6), ds: true }), 0, 1.32, 0.42);
      aw.rotation.x = 0.35;
      dw.add(aw, A.potPlant(0.62, 1.72, 0.18, '#d84a8a'));
      dwN++;
      g.add(A.at(dw, x, y, z, ry));
    }
    // boulders at the foot of the cliffs
    for (let i = 0; i < 26; i++) {
      const side = i % 3, t = r();
      const z = side === 2 ? -18.6 - r() : -16 + t * 34;
      const x = side === 2 ? (t - 0.5) * 30 : (side ? 1 : -1) * (canyonHalf(side ? 1 : -1, z) - 0.2 + r() * 0.9);
      if (side !== 2 && z > 15 && z < 17) continue;
      const rk = A.rock(0.5 + r() * 1.1, i, r() < 0.5 ? '#b98a5a' : '#a8774a');
      rk.position.set(x, groundAt(x, z) + 0.1, z);
      rk.rotation.y = r() * 6;
      g.add(rk);
    }
    for (let i = 0; i < 14; i++) {
      const x = (r() - 0.5) * 50, z = 19 + r() * 18;
      const rk = A.rock(0.4 + r() * 0.9, 40 + i, '#b98a5a');
      rk.position.set(x, landH(x, z) + 0.05, z);
      g.add(rk);
    }
    // jars and crates around the storehouse and quarry yards
    for (const [x, z] of JARS) g.add(A.at(A.jar(1.0, r() < 0.5 ? '#b0603a' : '#9a4a2a'), x, 0, z));
    scene.add(A.bake(g));
    // banners on the gate and the terraces
    for (const [x, y, z, c] of [[-2.2, 3.76, 16.1, A.P.cloth3], [2.2, 3.76, 16.1, A.P.cloth3], [-8.0, 1.4, 4.4, A.P.cloth1], [8.0, 1.4, 4.4, A.P.cloth1], [-2.4, 2.8, -8.6, A.P.cloth4], [2.4, 2.8, -8.6, A.P.cloth4]]) {
      const b = A.banner(c, 2.0, 0.6, 0.4);
      b.position.set(x, y, z);
      b.rotation.y = x < 0 ? (y > 3 ? Math.PI : 0) : (y > 3 ? 0 : Math.PI);
      scene.add(b);
      banners.push(b);
    }
    // palms by the water and in the courtyards
    PALMS.forEach(([x, z], i) => {
      const p = A.palm(2.5 + r() * 1.3, 40 + i);
      p.position.set(x, groundAt(x, z), z);
      scene.add(p);
      props.push(p);
    });
  }

  // ======================================================================
  // The spring: a sunken basin with stone steps, the wyrm's pool and its plaza
  // ======================================================================
  function buildPool() {
    const g = new THREE.Group();
    const prof = [[3.28, -1.5], [3.28, -0.9], [3.9, -0.9], [3.9, -0.6], [4.6, -0.6], [4.6, -0.3], [5.3, -0.3], [5.3, 0.0], [5.5, 0.0], [5.5, -1.6]].map(([x, y]) => new V2(x, y));
    const basin = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), A.mat('#e6c393', { flat: true, map: rep(A.tex.ashlar, 1 / 22, 1 / 2.4) }));
    basin.position.set(SPRING.x, 0, SPRING.z);
    basin.castShadow = true; basin.receiveShadow = true;
    scene.add(basin);
    const plaza = new THREE.Mesh(new THREE.RingGeometry(5.3, 7.05, 72, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rep(A.tex.paving, 0.36, 0.36), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    plaza.position.set(SPRING.x, 0.02, SPRING.z);
    plaza.receiveShadow = true;
    scene.add(plaza);
    // a band of zellige around the basin's rim, and turquoise tiles along the plaza's edge
    for (const [r0, r1, t, n] of [[5.3, 5.78, A.tex.zellige, 12], [6.88, 7.05, A.tex.scaleTile, 40]]) {
      const band = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: A.texRep(t, n, n), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      band.position.set(SPRING.x, 0.025, SPRING.z);
      band.receiveShadow = true;
      scene.add(band);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.3, 48).rotateX(-Math.PI / 2), A.waterMat({ radial: true, alpha: 0.95 }));
    water.position.copy(SPRING);
    scene.add(water);
    T3.water = water;
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.6, 40, 1, true), A.mat('#2a6a7a', { ds: true }));
    bed.position.set(SPRING.x, SPRING.y - 0.35, SPRING.z);
    scene.add(bed);
    const reeds = A.reeds(22, 3.75, 4);
    reeds.position.set(SPRING.x, -0.9, SPRING.z);
    g.add(reeds);
    for (const [a, rr, y] of [[0.6, 4.3, -0.6], [2.3, 4.95, -0.3], [3.9, 4.3, -0.6], [5.4, 4.95, -0.3], [1.4, 6.3, 0], [4.6, 6.3, 0]]) {
      const j = A.jar(1.1, '#b0603a');
      j.position.set(SPRING.x + Math.cos(a) * rr, y, SPRING.z + Math.sin(a) * rr);
      g.add(j);
    }
    // a carved spout on the back steps where the canyon's water wells up
    const sp = A.grp(A.box(1.0, 0.9, 0.5, A.mat('#e6c393', { flat: true }), 0, 0, 0), A.box(0.2, 0.12, 0.5, A.mat(A.P.copper, { m: 0.5, r: 0.4 }), 0, 0.55, 0.35));
    sp.position.set(SPRING.x, -0.9, SPRING.z - 4.3);
    g.add(sp);
    scene.add(A.bake(g));
    aura = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.06, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.position.set(SPRING.x, SPRING.y + 0.32, SPRING.z);
    aura.visible = false;
    scene.add(aura);
    deepGlow = new THREE.Mesh(new THREE.CircleGeometry(3.25, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3ff0dc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    deepGlow.position.set(SPRING.x, SPRING.y + 0.03, SPRING.z);
    deepGlow.visible = false;
    scene.add(deepGlow);
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
    skyriver.position.set(SPRING.x, SPRING.y - 0.1, SPRING.z);
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
      // a sandy lane from the plaza (up the stairs) to every built plot
      if (pl.path) { scene.remove(pl.path); pl.path = null; }
      if (st === 'built' || st === 'up') {
        const r = routes[p.id], grp = new THREE.Group();
        r.legs.forEach((leg, i) => { const m2 = ribbon(leg, 0.95, 0.035, pathM, i === r.legs.length - 1 ? 1.7 : 0); if (m2) grp.add(m2); });
        scene.add(grp);
        pl.path = grp;
      }
    }
  }

  // ======================================================================
  // Keep gardens: each decoration rises at its own spot as it levels (decor.js owns the rules)
  // ======================================================================
  const decor = {};
  function decorModel(id, L) {
    const g = new THREE.Group(), tier = L >= 5 ? 3 : L >= 3 ? 2 : 1;
    const stone = A.mat('#e6c393', { flat: true }), stoneD = A.mat('#c9a070', { flat: true }), gold = A.mat(A.P.gold, { m: 0.6, r: 0.35 });
    const leaf = A.mat('#4f8f36', { flat: true }), leafD = A.mat('#3d6e2a', { flat: true });
    const pool = (r, y) => { const w = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), A.waterMat({ radial: true, alpha: 0.95 })); w.position.y = y; w.userData.keep = true; return w; };
    if (id === 'fountain') {
      g.add(A.cyl(1.5, 1.6, 0.45, stone, 0, 0, 0, 20), pool(1.32, 0.46));
      g.add(A.cyl(0.18, 0.24, 1.1, stoneD, 0, 0.45, 0, 10), A.cyl(0.75, 0.6, 0.18, stone, 0, 1.4, 0, 16), pool(0.66, 1.59));
      if (tier >= 2) g.add(A.cyl(0.1, 0.14, 0.6, stoneD, 0, 1.58, 0, 8), A.cyl(0.38, 0.3, 0.12, stone, 0, 2.15, 0, 12), pool(0.32, 2.28));
      if (tier >= 3) g.add(A.sph(0.16, gold, 0, 2.45, 0, 10));
      for (let i = 0; i < 4 + tier * 2; i++) { const a = (i / (4 + tier * 2)) * Math.PI * 2; g.add(A.at(A.jar(0.7, '#b0603a'), Math.cos(a) * 1.85, 0, Math.sin(a) * 1.85)); }
    } else if (id === 'palms') {
      g.add(A.cyl(1.0, 1.05, 0.2, stone, 0, 0, 0, 18), pool(0.88, 0.21));
      const n = 2 + tier;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.4, p = A.palm(2.4 + (i % 2) * 0.6, 90 + i); p.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5); g.add(p); g.userData.palms = (g.userData.palms || []).concat(p); }
    } else if (id === 'pergola') {
      const wood = A.mat(A.P.wood, { flat: true });
      for (const [x, z] of [[-1, -0.7], [1, -0.7], [-1, 0.7], [1, 0.7]]) g.add(A.cyl(0.06, 0.07, 1.7, wood, x, 0, z, 6));
      for (let i = 0; i < 7; i++) g.add(A.box(0.1, 0.08, 1.7, wood, -0.9 + i * 0.3, 1.7, 0));
      g.add(A.box(2.3, 0.08, 0.12, wood, 0, 1.66, -0.7), A.box(2.3, 0.08, 0.12, wood, 0, 1.66, 0.7));
      for (let i = 0; i < 4 * tier; i++) g.add(A.sph(0.22, i % 2 ? leaf : leafD, -1 + (i % 4) * 0.66, 1.8, -0.7 + Math.floor(i / 4) * 0.7, 6));
      g.add(A.box(1.3, 0.12, 0.35, wood, 0, 0.42, 0), A.box(0.08, 0.42, 0.3, wood, -0.55, 0, 0), A.box(0.08, 0.42, 0.3, wood, 0.55, 0, 0));
    } else if (id === 'herbs') {
      for (let i = 0; i < 1 + tier; i++) {
        const z = -0.8 + i * 0.85;
        g.add(A.box(2.0, 0.35, 0.6, stoneD, 0, 0, z));
        for (let k = 0; k < 5; k++) g.add(A.sph(0.17 + (k % 2) * 0.05, k % 2 ? leaf : leafD, -0.8 + k * 0.4, 0.42, z, 6));
      }
      if (tier >= 3) g.add(A.at(A.house(0.9, 0.8, 0.7, { wall: A.P.plaster }), 1.5, 0, -0.2, -0.6));
    } else if (id === 'statues') {
      for (const sx of [-2.2, 2.2]) {
        const st = new THREE.Group(), m = tier >= 3 ? gold : stone;
        st.add(A.box(1.0, 0.6 + tier * 0.15, 1.0, stoneD, 0, 0, 0));
        const y0 = 0.6 + tier * 0.15;
        const coil = new THREE.Mesh(A.geo('statcoil', () => new THREE.TorusGeometry(0.34, 0.13, 8, 20)), m); coil.rotation.x = Math.PI / 2; coil.position.y = y0 + 0.13; st.add(coil);
        st.add(A.cyl(0.11, 0.14, 0.75, m, 0.2, y0 + 0.1, 0.1, 8), A.sph(0.2, m, 0.2, y0 + 0.95, 0.12, 10), A.cone(0.06, 0.25, m, 0.13, y0 + 1.08, 0.08, 6), A.cone(0.06, 0.25, m, 0.29, y0 + 1.08, 0.08, 6));
        st.position.x = sx; st.rotation.y = sx > 0 ? -0.35 : 0.35;
        g.add(st);
      }
    } else if (id === 'beacon') {
      const flame = new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff8020', emissiveIntensity: 2 });
      const h = 1.2 + tier * 0.6;
      g.add(A.cyl(0.55, 0.7, h, stone, 0, 0, 0, 8), A.cyl(0.7, 0.55, 0.3, A.mat(A.P.copper, { m: 0.5, r: 0.4 }), 0, h, 0, 10));
      const f = A.cone(0.4, 0.8, flame, 0, h + 0.25, 0, 7); f.userData.keep = true; f.userData.flame = true; g.add(f);
      g.userData.flame = f;
      if (tier >= 2) { const b = A.banner(A.P.cloth1, h + 0.9, 0.6, 0.4); b.position.set(0.7, 0, 0); g.add(b); g.userData.banner = b; }
    } else if (id === 'sculpture') {
      const ss = A.mat('#f0c060', { m: 0.85, r: 0.25 });
      g.add(A.box(1.0, 0.5, 1.0, stoneD, 0, 0, 0));
      const knot = new THREE.Mesh(A.geo(`knot${tier}`, () => new THREE.TorusKnotGeometry(0.42 + tier * 0.08, 0.09 + tier * 0.02, 64, 8, 2, 3)), ss);
      knot.position.y = 1.2 + tier * 0.12; knot.userData.keep = true; knot.castShadow = true;
      g.add(knot); g.userData.spin = knot;
    } else if (id === 'obelisk') {
      const h = 2.6 + tier * 0.9;
      g.add(A.box(1.4, 0.4, 1.4, stoneD, 0, 0, 0));
      const ob = new THREE.Mesh(A.geo(`obelisk${tier}`, () => new THREE.CylinderGeometry(0.22, 0.42, h, 4).rotateY(Math.PI / 4)), A.mat('#d9b07a', { flat: true }));
      ob.position.y = 0.4 + h / 2; g.add(ob);
      g.add(A.cone(0.24, 0.45, gold, 0, 0.4 + h, 0, 4));
      if (tier >= 2) { const band = new THREE.Mesh(A.geo(`obband${tier}`, () => new THREE.CylinderGeometry(0.36, 0.38, 0.12, 4).rotateY(Math.PI / 4)), new THREE.MeshStandardMaterial({ color: '#5fd0ff', emissive: '#3ab0ff', emissiveIntensity: 0.8 })); band.position.y = 0.4 + h * 0.3; band.userData.keep = true; g.add(band); }
    } else if (id === 'mosaic') {
      const tex = A.canvasTex(128, 128, (c, w, h) => { const r = KH.u.seeded(5); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = r(); c.fillStyle = v < 0.4 ? '#2c78bc' : v < 0.75 ? '#3fc0d8' : v < 0.9 ? '#a8f0ff' : '#e8b54a'; c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); } });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.2 }));
      disc.position.y = 0.04; disc.receiveShadow = true; disc.userData.keep = true; g.add(disc);
      g.add(A.cyl(0.4, 0.45, 0.35, stone, 0, 0, 0, 12), pool(0.34, 0.36));
      for (let i = 0; i < tier * 2; i++) { const a = (i / (tier * 2)) * Math.PI * 2; g.add(A.cyl(0.08, 0.1, 1.6, A.mat(A.P.white, { flat: true }), Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55, 8)); }
    }
    return A.bake(g);
  }
  function plinth() {
    const g = A.grp(A.cyl(0.55, 0.62, 0.25, A.mat('#d9b98a', { flat: true }), 0, 0, 0, 8), A.cyl(0.3, 0.3, 0.06, A.mat('#c9a070', { flat: true }), 0, 0.25, 0, 8));
    return A.bake(g);
  }
  // Gate defenses (defense.js): ballistas on the wall towers, oil cauldrons on the wall top by the gate and rows
  // of stakes on the sand outside, more of each as they rise
  const defense = {};
  let defFlame = null;
  function defenseModel(id, L) {
    const g = new THREE.Group(), WZ = K.gate.z, wood = A.mat(A.P.woodD), woodL = A.mat(A.P.wood || '#a8743a'), iron = A.mat(A.P.dark), brass = A.mat(A.P.gold, { m: 0.6, r: 0.35 });
    defFlame = defFlame || new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff7a20', emissiveIntensity: 2 });
    if (id === 'ballista') {
      const spots = [[-6.6, 2.62], [6.6, 2.62], [-12.4, 2.62], [12.4, 2.62]].slice(0, L >= 7 ? 4 : L >= 4 ? 2 : 1);
      for (const [x, y] of spots) {
        const bolt = A.cyl(0.03, 0.03, 1.2, L >= 10 ? brass : iron, 0, 0.32, 0.25, 4);
        bolt.rotation.x = Math.PI / 2;
        const b = A.grp(A.box(0.5, 0.18, 0.7, wood, 0, 0, 0), A.box(0.12, 0.12, 1.2, woodL, 0, 0.22, 0.15), A.box(1.4, 0.09, 0.09, wood, 0, 0.26, 0.5), bolt,
          A.box(0.03, 0.6, 0.03, wood, 0.25, 0.1, -0.3), A.box(0.3, 0.2, 0.02, A.mat('#b8331c', { flat: true }), 0.4, 0.55, -0.3));
        b.scale.setScalar(1.7);
        g.add(A.at(b, x, y, WZ + 0.35));
      }
    } else if (id === 'cauldrons') {
      const xs = [-3.4, 3.4, -4.6, 4.6].slice(0, L >= 9 ? 4 : L >= 6 ? 3 : L >= 3 ? 2 : 1);
      for (const x of xs) {
        g.add(A.cyl(0.4, 0.3, 0.45, iron, x, 1.95, WZ - 0.05, 10), A.cyl(0.43, 0.43, 0.06, L >= 10 ? brass : iron, x, 2.38, WZ - 0.05, 10), A.sph(0.16, defFlame, x, 1.86, WZ - 0.05, 6));
        g.add(A.box(0.06, 0.75, 0.06, iron, x - 0.46, 1.9, WZ - 0.05), A.box(0.06, 0.75, 0.06, iron, x + 0.46, 1.9, WZ - 0.05), A.box(0.98, 0.06, 0.06, iron, x, 2.62, WZ - 0.05));
      }
    } else {
      const rows = L >= 7 ? 3 : L >= 4 ? 2 : 1, step = L >= 10 ? 0.7 : 0.95;
      for (let rI = 0; rI < rows; rI++) {
        const z = WZ + 1.7 + rI * 0.75;
        for (const side of [-1, 1]) for (let x = 2.8 + (rI % 2) * step * 0.5; x < 10.5; x += step) {
          const st = A.cone(0.13, 1.25, L >= 10 ? brass : wood, 0, 0, 0, 5);
          st.position.set(side * x, 0.45, z); st.rotation.x = 0.55;
          g.add(st);
        }
        for (const side of [-1, 1]) g.add(A.box(7.8, 0.09, 0.09, wood, side * 6.6, 0.42, z - 0.15));
      }
    }
    g.traverse((o) => { if (o.material === defFlame) o.userData.dyn = true; });
    A.bake(g);
    // a tap anywhere near the works opens the Gate defenses
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(id === 'stakes' ? 16 : 3, 1.6, id === 'stakes' ? 2.6 : 1.2), new THREE.MeshBasicMaterial());
    proxy.position.set(id === 'ballista' ? -6.6 : 0, id === 'stakes' ? 0.6 : id === 'ballista' ? 3 : 2, id === 'stakes' ? K.gate.z + 2.4 : K.gate.z);
    if (id === 'cauldrons') proxy.scale.x = 3.4;
    proxy.visible = false; proxy.userData.pid = 'defenses';
    g.add(proxy);
    g.userData.proxy = proxy;
    return g;
  }
  function syncDefenses() {
    if (!KH.defense) return;
    for (const d of DATA.defense.items) {
      const L = KH.defense.lvl(d.id), key = `${L}`;
      const rec = defense[d.id] || (defense[d.id] = { key: '', model: null });
      if (rec.key === key) continue;
      rec.key = key;
      if (rec.model) { scene.remove(rec.model); const k = hit.indexOf(rec.model.userData.proxy); if (k >= 0) hit.splice(k, 1); rec.model = null; }
      if (!L) continue;
      rec.model = defenseModel(d.id, L);
      scene.add(rec.model);
      hit.push(rec.model.userData.proxy);
    }
  }
  T3.defense = defense; // for tests
  // troop ranks (ranks.js): a banner before the Barracks for each rank that has opened, flying high once any
  // troops hold it
  const rankFlags = {};
  function syncRanks() {
    if (!KH.ranks || !S.lv.barracks) return;
    const P = K.plots.barracks, c = Math.cos(P.ry || 0), s = Math.sin(P.ry || 0);
    DATA.ranks.list.forEach((rk, i) => {
      const open = KH.ranks.open(i), has = open && Object.keys(DATA.troops).some((k) => ((S.ranks || {})[k] || [])[i] > 0), key = `${open}:${has}`;
      const rec = rankFlags[rk.id] || (rankFlags[rk.id] = { key: '', model: null });
      if (rec.key === key) return;
      rec.key = key;
      if (rec.model) { scene.remove(rec.model); rec.model = null; }
      if (!open) return;
      const cloth = A.mat(rk.color, { flat: true }), brass = A.mat(A.P.gold, { m: 0.6, r: 0.35 });
      const g = A.grp(A.cyl(0.05, 0.06, 2.6, A.mat(A.P.woodD), 0, 0, 0, 6), A.sph(0.1, brass, 0, 2.66, 0, 8),
        has ? A.box(0.04, 0.95, 0.66, cloth, 0, 1.55, 0.35) : A.box(0.04, 0.4, 0.32, cloth, 0, 0.75, 0.18),
        has && i ? A.box(0.05, 0.12, 0.66, brass, 0, 1.55 + 0.1, 0.35) : null);
      const lx = -1.2 + i * 1.2, lz = 2.6;
      A.at(g, P.x + lx * c + lz * s, P.y, P.z - lx * s + lz * c, P.ry || 0);
      A.bake(g);
      scene.add(g);
      rec.model = g;
    });
  }
  T3.rankFlags = rankFlags; // for tests
  // Warden's Decrees (decrees.js): a Harvest Rite or a Feast of Rain strings bunting from lamp to lamp round the
  // spring's plaza; a Call to Arms raises red war banners on the wall towers
  const decreeDeco = { key: '', model: null };
  function syncDecrees() {
    if (!KH.decrees || !KH.decrees.unlocked()) return;
    const fest = KH.decrees.active('harvest') || KH.decrees.active('feast'), arms = KH.decrees.active('arms'), key = `${fest}:${arms}`;
    if (decreeDeco.key === key) return;
    decreeDeco.key = key;
    if (decreeDeco.model) { scene.remove(decreeDeco.model); decreeDeco.model = null; }
    if (!fest && !arms) return;
    const g = new THREE.Group();
    if (fest) {
      // big festival pennants, readable from the keep camera, strung lamp to lamp
      const lamp = (i) => { const a = (i / 10) * Math.PI * 2 + 0.31; return new V3(SPRING.x + Math.cos(a) * 6.75, 1.7, SPRING.z + Math.sin(a) * 6.75); };
      const rope = A.mat(A.P.rope), cols = ['#d8402a', '#f0c040', '#2f9fb0', '#9a48b0', '#f4e6c0', '#3f9a4a'].map((c) => A.mat(c, { ds: true, flat: true }));
      const flag = A.geo('festflag', () => new THREE.ShapeGeometry(new THREE.Shape([new V2(-0.22, 0), new V2(0.22, 0), new V2(0, -0.5)])));
      for (let i = 0; i < 10; i++) {
        const a = lamp(i), b = lamp(i + 1), at = (t) => new V3(a.x + (b.x - a.x) * t, a.y - 0.35 * 4 * t * (1 - t), a.z + (b.z - a.z) * t), ry = -Math.atan2(b.z - a.z, b.x - a.x);
        for (let k = 0; k < 8; k++) g.add(A.rod(at(k / 8), at((k + 1) / 8), 0.012, rope));
        for (let k = 1; k <= 7; k++) { const q = at(k / 8), f = A.mesh(flag, cols[(i * 7 + k) % cols.length], q.x, q.y, q.z); f.rotation.y = ry; g.add(f); }
      }
    }
    if (arms) {
      const red = A.mat('#a8281e', { flat: true, ds: true }), brass = A.mat(A.P.gold, { m: 0.6, r: 0.35 }), pole = A.mat(A.P.woodD);
      for (const x of [-12.4, -6.6, 6.6, 12.4]) {
        const b = A.grp(A.cyl(0.04, 0.05, 1.9, pole, 0, 0, 0, 6), A.sph(0.08, brass, 0, 1.94, 0, 8), A.box(0.6, 0.9, 0.03, red, 0.32, 0.98, 0), A.box(0.64, 0.07, 0.04, brass, 0.32, 1.84, 0));
        g.add(A.at(b, x, 2.6, K.gate.z, x < 0 ? Math.PI : 0));
      }
    }
    A.bake(g);
    scene.add(g);
    decreeDeco.model = g;
  }
  T3.decreeDeco = decreeDeco; // for tests
  function syncDecor() {
    if (!KH.decorItems) return;
    const open = S.lv.wyrm >= DATA.decor.unlock;
    for (const d of KH.decorItems()) {
      const L = KH.decorLevel(d.id), key = `${open}:${L}`;
      let rec = decor[d.id];
      if (!rec) {
        const g = new THREE.Group();
        g.position.set(d.at[0], d.at[2], d.at[1]);
        scene.add(g);
        const proxy = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 10), new THREE.MeshBasicMaterial());
        proxy.position.y = 1.2; proxy.visible = false; proxy.userData.pid = 'gardens';
        g.add(proxy); hit.push(proxy);
        rec = decor[d.id] = { g, key: '', model: null, proxy };
      }
      if (rec.key === key) continue;
      rec.key = key;
      if (rec.model) { rec.g.remove(rec.model); rec.model = null; }
      rec.proxy.userData.pid = open ? 'gardens' : null;
      rec.g.visible = open;
      if (!open) continue;
      rec.model = L ? decorModel(d.id, L) : plinth();
      rec.g.add(rec.model);
    }
  }
  function animDecor(t) {
    if (defFlame) defFlame.emissiveIntensity = 1.6 + 0.6 * Math.sin(t * 11) * Math.sin(t * 6.1);
    for (const id in decor) {
      const m = decor[id].model;
      if (!m) continue;
      if (m.userData.spin) m.userData.spin.rotation.y = t * 0.5;
      if (m.userData.flame) m.userData.flame.scale.set(1, 0.85 + 0.25 * Math.sin(t * 11) * Math.sin(t * 6.3), 1);
      if (m.userData.banner) m.userData.banner.userData.update(t, T3.wind || 1);
      if (m.userData.palms) for (const p of m.userData.palms) A.swayPalm(p, t, T3.wind || 1);
    }
  }
  // ======================================================================
  // The kin of Act III (story.js says who is free): elder wyrms resting on the canyon rim
  // ======================================================================
  // [x, z, height above the rim or null to rest on it]
  const KIN_AT = { nadaa: [-23.8, -9, null], seyl: [23.8, 0.5, null], barq: [13, -24.8, null], sahab: [-7.5, -15, 17.5], ghaitha: [0, -25.8, null] };
  const kin = {};
  let kinFrame = 0;
  function syncKin() {
    const free = KH.kinFreed ? KH.kinFreed() : [];
    for (const k of free) {
      const at = KIN_AT[k.id];
      if (!at || kin[k.id]) continue;
      const w = new A.Wyrm();
      w.set({ level: k.level, skin: k.skin, element: null });
      const fly = at[2] != null, y = fly ? at[2] : landH(at[0], at[1]);
      w.group.position.set(at[0], y, at[1]);
      w.group.rotation.y = Math.atan2(-at[0], -at[1] - 2); // look down into the keep
      if (k.mother) w.group.scale.multiplyScalar(1.25);
      scene.add(w.group);
      kin[k.id] = { w, x: at[0], z: at[1], y, fly, ph: Object.keys(kin).length * 2.3 };
      w.pose({ t: kin[k.id].ph, dormant: false, pet: 0 });
    }
  }
  function animKin(t) {
    kinFrame++;
    let i = 0;
    for (const id in kin) {
      const o = kin[id];
      // re-skin a third of them each frame: the kin are slow and many
      if ((kinFrame + i++) % 3 === 0) o.w.pose({ t: t * 0.7 + o.ph, dormant: false, pet: 0 });
      if (o.fly) {
        const a = t * 0.05 + o.ph;
        o.w.group.position.set(o.x + Math.sin(a) * 4, o.y + Math.sin(t * 0.4 + o.ph) * 0.7, o.z + Math.cos(a) * 2.5);
        o.w.group.rotation.y = a + Math.PI / 2;
      }
    }
  }
  T3.kinCount = () => Object.keys(kin).length;
  T3.zoomLevel = () => view.zoom; // town.js shows building names only when the camera is close
  // for tuning the resting spots: T3.kinAt.nadaa = [x, z, null]; T3.kinReset()
  T3.kinAt = KIN_AT;
  // how the camera frames each of them (story.js "Show me"), from the keep's one fixed angle, aimed up
  const KIN_VIEW = {
    nadaa: { az: 0, el: 0.55, zoom: 1.2, tx: -21, tz: -3, lift: 9 },
    seyl: { az: 0, el: 0.55, zoom: 1.2, tx: 21, tz: 6, lift: 9 },
    barq: { az: 0, el: 0.42, zoom: 1.6, tx: 11, tz: -16.5, lift: 10 },
    sahab: { az: 0, el: 0.4, zoom: 1.4, tx: -7, tz: -12, lift: 13 },
    ghaitha: { az: 0, el: 0.42, zoom: 1.4, tx: 0, tz: -16.5, lift: 10 },
  };
  T3.kinView = (id) => KIN_VIEW[id];
  T3.kinReset = () => { for (const id in kin) { scene.remove(kin[id].w.group); delete kin[id]; } };
  T3.landH = (x, z) => landH(x, z);

  KH.on('decor', (e) => { const d = KH.decorItems && KH.decorItems().find((x) => x.id === e.id); if (d && T3.ready) { const c = new V3(d.at[0], d.at[2], d.at[1]); plotPos[`decor_${d.id}`] = c; burst(`decor_${d.id}`, '#ffe08a', 40); } });

  // ======================================================================
  // People and camels
  // ======================================================================
  // the sand dwellers (models3d.js): Higgsfield models once they have loaded, the drawn villagers until then
  const VILL = ['v-elder', 'v-woman', 'v-tuareg', 'v-bedouin', 'v-trader', 'v-farmer', 'v-grandma', 'v-carrier', 'v-boy', 'v-girl'];
  const KIDS = { 'v-boy': 0.68, 'v-girl': 0.64 };
  let villReady = -1;
  function villager(i) {
    const M = A.models, ok = M ? VILL.filter(M.ready) : [];
    if (ok.length) {
      const id = ok[(i * 7 + 3) % ok.length], o = M.instance(id, KIDS[id] || 0.93 + ((i * 37) % 9) / 100);
      if (o) return o;
    }
    return A.person(i + 1, { jar: i % 4 === 1, child: i % 9 === 5, scale: 1.15 });
  }
  function syncPeople() {
    const posts = Object.keys(S.workers).filter((p) => S.workers[p] > 0 && S.lv[p]);
    const want = posts.length ? Math.min(S.pop - S.sick, 22) : Math.min(S.pop, 4);
    // as the models arrive, the drawn villagers make way for them
    if (A.models) {
      const n = A.models.want(VILL);
      if (n !== villReady) { villReady = n; while (people.length) scene.remove(people.pop().o); syncSellers(); }
    }
    while (people.length < want) {
      const i = people.length;
      const o = villager(i);
      scene.add(o);
      people.push({ o, i, seed: seeded(i * 13 + 5)() });
    }
    while (people.length > want) scene.remove(people.pop().o);
    // besides workers, a few villagers visit the other built plots
    const built = DATA.plots.map((p) => p.id).filter((id) => S.lv[id]);
    return posts.length ? [...posts, ...posts, ...built] : built;
  }
  function animPeople(t, posts) {
    for (const p of people) {
      const pid = posts.length ? posts[(p.i * 7) % posts.length] : null;
      const r = pid && routes[pid];
      if (!r) {
        const a = p.i * 1.7 + t * 0.05;
        p.o.position.set(SPRING.x + Math.cos(a) * 6.1, 0, SPRING.z + Math.sin(a) * 6.1);
        p.o.rotation.y = -a;
        A.animPerson(p.o, t, 'walk', 0.45);
        continue;
      }
      // pace up and down the lane: out from the plaza, a pause at work, back again
      const L = Math.max(1, r.total - 1.9), sp = 0.75 + (p.i % 5) * 0.08;
      const cyc = (2 * L) / sp + 6, ph = (t + p.seed * cyc) % cyc;
      const go = ph < L / sp, at = ph < L / sp + 3, back = ph < 2 * (L / sp) + 3;
      const s = go ? ph * sp : at ? L : back ? L - (ph - L / sp - 3) * sp : 0;
      const q = along(r, Math.max(0.2, s));
      const off = (p.seed - 0.5) * 0.6, l = Math.hypot(q.dx, q.dz) || 1;
      p.o.position.set(q.p.x - (q.dz / l) * off, q.p.y + (go || (!at && back) ? Math.abs(Math.sin(t * 7 + p.i)) * 0.05 : 0), q.p.z + (q.dx / l) * off);
      const dir = go ? 1 : -1, walking = go || (!at && back);
      if (walking) p.o.rotation.y = Math.atan2(q.dx * dir, q.dz * dir);
      // striding along the lane, busy at the work spot, idle once home
      A.animPerson(p.o, t, walking ? 'walk' : at ? 'work' : 'idle', sp);
    }
  }
  function animCamels(t) {
    for (const k of camels) {
      const s = (t * k.speed + k.off) % trailPts.total;
      const q = along(trailPts, s);
      k.c.position.copy(q.p);
      k.c.rotation.y = Math.atan2(-q.dz, q.dx);
      A.walkCamel(k.c, t, 0.7);
    }
  }

  // ======================================================================
  // Companions (companions.js): the tamed animals live about the plaza; the hoopoe flits round it and the
  // falcon circles high over the keep
  // ======================================================================
  const pals = {};
  T3.pals = pals; // for tests
  // ground animals trot round the plaza: ring radius, speed, direction
  const PAL_RING = { fennec: [5.95, 0.6, 1], sandcat: [6.2, 0.5, -1], caracal: [6.35, 0.75, 1], oryx: [6.45, 0.4, -1] };
  // how big each companion's painted model is: body length (tail included) for a beast, wingspan for a bird
  const PAL_SIZE = { fennec: 0.85, sandcat: 0.8, caracal: 1.15, oryx: 1.55, falcon: 1.35, hoopoe: 0.8 };
  function syncPals() {
    if (!KH.pals) return;
    const owned = KH.pals.owned();
    if (A.models) A.models.want(owned.map((id) => `p-${id}`));
    for (const id of owned) {
      const glb = A.models && A.models.ready(`p-${id}`);
      if (pals[id] && (pals[id].glb || !glb)) continue;
      if (pals[id]) { scene.remove(pals[id].o); const k = hit.indexOf(pals[id].pr); if (k >= 0) hit.splice(k, 1); }
      const bird = id === 'falcon' || id === 'hoopoe';
      const o = (glb && A.models.instance(`p-${id}`, PAL_SIZE[id])) || (bird ? A.bird(id, { scale: id === 'falcon' ? 1.8 : 2.2 }) : A.beast(id, { scale: { oryx: 1.15, caracal: 1.5 }[id] || 1.8 }));
      o.rotation.order = 'YXZ';
      // a generous invisible target, so a tap on the animal opens its sheet
      let pr = null;
      if (id !== 'falcon') {
        pr = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshBasicMaterial());
        pr.position.y = id === 'hoopoe' ? 0 : 0.3; pr.visible = false; pr.userData.pid = `pal:${id}`;
        o.add(pr); hit.push(pr);
      }
      scene.add(o);
      const prev = pals[id];
      pals[id] = { o, pr, glb: !!o.userData.glb, a: prev ? prev.a : (Object.keys(pals).length * 2.3) % 6.28, ph: prev ? prev.ph : Object.keys(pals).length * 1.9 };
    }
  }
  // ======================================================================
  // Heroes (models3d.js): every Steward stands by the building they look after, the squad waits in the
  // plaza; each paces a few steps now and then. Tap one for their sheet.
  // ======================================================================
  const heroes = {};
  T3.heroes = heroes; // for tests
  function heroSpots() {
    const out = [], taken = new Set();
    for (const [kind, id] of Object.entries(S.stewards || {})) {
      const post = DATA.stewardPosts[kind];
      if (!post || !S.heroes[id] || (KH.heroBusy && KH.heroBusy(id))) continue;
      let x, z;
      if (post.plot === 'wyrm') { x = SPRING.x + 1.6; z = SPRING.z + 6.1; } else {
        const P = plotPos[post.plot];
        if (!P || !S.lv[post.plot]) continue;
        const dx = SPRING.x - P.x, dz = SPRING.z - P.z, l = Math.hypot(dx, dz) || 1;
        x = P.x + (dx / l) * 2.0; z = P.z + (dz / l) * 2.0;
      }
      out.push([id, x, z]); taken.add(id);
    }
    const sq = (KH.squadHome ? KH.squadHome() : S.squad).filter((id) => !taken.has(id));
    sq.forEach((id, i) => out.push([id, SPRING.x - 1.4 + i * 1.4, SPRING.z + 6.4]));
    return out;
  }
  function syncHeroes() {
    if (!A.models) return;
    const spots = heroSpots(), want = new Set(spots.map((s) => s[0]));
    for (const id of Object.keys(heroes)) if (!want.has(id)) { scene.remove(heroes[id].o); const k = hit.indexOf(heroes[id].pr); if (k >= 0) hit.splice(k, 1); delete heroes[id]; }
    A.models.want(spots.map((s) => `h-${s[0]}`));
    spots.forEach(([id, x, z], i) => {
      let h = heroes[id];
      if (!h) {
        const o = A.models.instance(`h-${id}`, 1.02);
        if (!o) return;
        const pr = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 8), new THREE.MeshBasicMaterial());
        pr.position.y = 0.55; pr.visible = false; pr.userData.pid = `hero:${id}`;
        o.add(pr); hit.push(pr);
        scene.add(o);
        h = heroes[id] = { o, pr, ph: i * 5.3 };
      }
      h.x = x; h.z = z;
    });
  }
  function animHeroes(t) {
    for (const h of Object.values(heroes)) {
      // face the spring; every so often step a little to one side and back
      const fx = SPRING.x - h.x, fz = SPRING.z - h.z, fl = Math.hypot(fx, fz) || 1, sx = -fz / fl, sz = fx / fl;
      const u = (t + h.ph) % 18, walk = (u > 6 && u < 9) || u > 15;
      const s = u < 6 ? -0.6 : u < 9 ? -0.6 + ((u - 6) / 3) * 1.2 : u < 15 ? 0.6 : 0.6 - ((u - 15) / 3) * 1.2;
      const x = h.x + sx * s, z = h.z + sz * s;
      h.o.position.set(x, groundAt(x, z), z);
      h.o.rotation.y = walk ? Math.atan2(sx * (u > 15 ? -1 : 1), sz * (u > 15 ? -1 : 1)) : Math.atan2(fx, fz);
      A.animPerson(h.o, t, walk ? 'walk' : 'idle', 0.7);
    }
  }
  function animPals(t, dt) {
    for (const [id, p] of Object.entries(pals)) {
      const o = p.o;
      if (id === 'falcon') {
        // wide circles high over the keep, gliding, with a few wingbeats now and then
        const a = t * 0.16 + p.ph, R = 11, x = Math.cos(a) * R, z = -2 + Math.sin(a) * R * 0.8;
        o.position.set(x, 9 + Math.sin(t * 0.3) * 0.8, z);
        o.rotation.set(0, Math.atan2(-Math.sin(a) * R, Math.cos(a) * R * 0.8), -0.35);
        A.animAnimal(o, t, (t + p.ph) % 9 < 1.6 ? 'flap' : 'glide');
      } else if (id === 'hoopoe') {
        // round the plaza at roof height, rising and dipping between bursts of wingbeats
        const a = -t * 0.32 + p.ph, R = 6.6, flap = Math.sin(t * 2.2 + p.ph) > -0.3;
        o.position.set(SPRING.x + Math.cos(a) * R, 2.3 + Math.sin(t * 2.2 + p.ph) * 0.35, SPRING.z + Math.sin(a) * R);
        o.rotation.set(-Math.cos(t * 2.2 + p.ph) * 0.25, Math.atan2(Math.sin(a), -Math.cos(a)), 0.25);
        A.animAnimal(o, t * 1.4, flap ? 'flap' : 'glide');
      } else {
        // stop and go: a while trotting, a while sitting
        const [R, v, dir] = PAL_RING[id] || [6.2, 0.5, 1];
        const f = Math.max(0, Math.min(1, 0.4 + 1.4 * Math.sin(t * 0.09 + p.ph)));
        p.a += (dir * v * f * dt) / R;
        o.position.set(SPRING.x + Math.cos(p.a) * R, 0, SPRING.z + Math.sin(p.a) * R);
        o.rotation.y = Math.atan2(-Math.sin(p.a) * dir, Math.cos(p.a) * dir);
        A.animAnimal(o, t, f > 0.12 ? 'walk' : 'sit', 0.5 + 0.7 * f);
      }
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
    // the shadow box follows the camera's target
    sun.target.position.set(view.tx, 0, view.tz);
    sun.position.copy(dir).multiplyScalar(80).add(sun.target.position);
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
    scene.fog.near = lerp(lerp(lerp(cd + 25, cd * 0.75, haze), cd * 0.5, storm), cd * 0.8, wetK);
    scene.fog.far = lerp(lerp(lerp(cd + 190, cd * 2.4, haze), cd * 1.7, storm), cd * 2.6, wetK);
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
    showers.position.set(view.tx, 0, view.tz);
    const a = showers.geometry.attributes.position.array, drops = showers.userData.drops;
    drops.forEach((d, i) => {
      d.y -= d.v * dt;
      if (d.y < 0) { d.y += 26; d.x = (Math.random() - 0.5) * 56; d.z = (Math.random() - 0.5) * 56; }
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
        const o = fromMouth ? wyrm.mouthWorld : new V3(SPRING.x + (Math.random() - 0.5) * 5, SPRING.y + 0.35, SPRING.z + (Math.random() - 0.5) * 5);
        const a = Math.random() * Math.PI * 2;
        Object.assign(p, {
          x: o.x, y: o.y, z: o.z,
          vx: fromMouth ? Math.cos(a) * 0.5 : Math.cos(a) * 0.9, vy: fromMouth ? 0.15 + Math.random() * 0.25 : 0.45 + Math.random() * 0.4, vz: fromMouth ? 0.6 + Math.random() * 0.6 : Math.sin(a) * 0.9,
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
      dl.forEach((p) => Object.assign(p, { x: (Math.random() - 0.5) * 70, y: Math.random() * 10, z: (Math.random() - 0.5) * 60 + 4, life: 1e9, age: 5e8 }));
    }
    const n = Math.floor(dl.length * share);
    dl.forEach((p, i) => {
      p.x += (2 + wind * 5) * dt * (0.6 + (i % 5) * 0.12);
      p.z += Math.sin(t * 0.3 + i) * dt * 0.6;
      p.y += Math.sin(t + i) * dt * 0.2;
      if (p.x > 35) { p.x = -35; p.z = (Math.random() - 0.5) * 60 + 4; p.y = Math.random() * (2 + wxNow.storm * 14) + Math.max(0, landH(0, p.z)); }
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
      Object.assign(p, { x: c.x, y: c.y + 0.8 + Math.random(), z: c.z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 3, vz: Math.sin(a) * s, life: 1 + Math.random() * 0.8, age: 0, s: 1.6 + Math.random(), a: 1 });
      if (++k >= n) break;
    }
  }
  KH.on('upgrade', (e) => { if (!e.offline) burst(e.plot, e.plot === 'wyrm' ? '#8ff0ff' : '#ffe08a', 50); });
  KH.on('buildStart', (e) => burst(e.plot, '#f0c98a', 24));
  KH.on('evolve', () => burst('wyrm', '#8ff0ff', 80));

  // ======================================================================
  // Camera: starts framed on every plot between the HUD strip and the quest card,
  // then pans (drag) and zooms toward the finger (pinch or wheel), always from one fixed angle
  // ======================================================================
  const HOME = { az: 0, el: 0.8, zoom: 1, tx: 0, tz: -0.2, lift: 0 };
  const ZMIN = 0.55, ZMAX = 4.2;
  const view = { ...HOME, flyStart: 0, vx: 0, vy: 0, hold: false, tween: null };
  const camTarget = new V3(), nearPt = new V3();
  function margins() {
    const q = $('#quest');
    return { top: 70, bottom: (q ? q.offsetHeight : 70) + 26 };
  }
  // closer in, the camera drops toward the ground for a more cinematic angle
  const camEl = () => clamp(view.el - 0.32 * smooth(1.15, 3.6, view.zoom), 0.22, 1.35);
  // does the canyon rock block the line from the camera to its target?
  function occluded(from, to) {
    for (let i = 2; i < 22; i++) {
      const u = i / 22;
      if (landH(from.x + (to.x - from.x) * u, from.z + (to.z - from.z) * u) > from.y + (to.y - from.y) * u - 0.5) return true;
    }
    return false;
  }
  function place(d, el = camEl(), az = view.az) {
    const zk = smooth(1.2, 2.6, view.zoom);
    // lift raises the point the camera looks at (to frame the kin up on the canyon rim)
    camTarget.set(view.tx, lerp(1.1, groundAt(view.tx, view.tz) + 0.9, zk) + (view.lift || 0), view.tz);
    // swung out over the canyon walls, the camera climbs until it can see past the rock
    for (let k = 0; k < 16; k++) {
      cam.position.set(camTarget.x + Math.sin(az) * Math.cos(el) * d, camTarget.y + Math.sin(el) * d, camTarget.z + Math.cos(az) * Math.cos(el) * d);
      // keep the target and the ground a little in front of it (the lower half of the view) in sight
      nearPt.set(camTarget.x + Math.sin(az) * 5, camTarget.y - 0.6, camTarget.z + Math.cos(az) * 5);
      if (el >= 1.45 || (!occluded(cam.position, camTarget) && !occluded(cam.position, nearPt))) break;
      el = Math.min(1.45, el + 0.08);
    }
    const floor = groundAt(cam.position.x, cam.position.z) + 1.2;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(camTarget);
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
      pts.push(new V3(c.x - 2.1, c.y, c.z), new V3(c.x + 2.1, c.y, c.z), new V3(c.x, c.y, c.z + 2.2), new V3(c.x, c.y + 3.2, c.z - 1));
    }
    const save = { az: view.az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz };
    Object.assign(view, HOME);
    applyOffset();
    let lo = 20, hi = 300;
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
  function clampTarget() {
    view.tx = clamp(view.tx, -15, 15);
    view.tz = clamp(view.tz, -16.5, 19);
  }
  function camNow() {
    applyOffset();
    place(fitD / view.zoom);
  }
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new V3(0, 1, 0), -0.8);
  function groundHit(px, py) {
    ray.setFromCamera(new V2((px / VW) * 2 - 1, -(py / VH) * 2 + 1), cam);
    return ray.ray.intersectPlane(plane, new V3());
  }
  // drag: the ground follows the finger
  T3.pan = (dx, dy) => {
    if (!cam) return;
    view.tween = null;
    const d = T3.camD || fitD / view.zoom, el = camEl();
    const wpp = (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, VH);
    const ca = Math.cos(view.az), sa = Math.sin(view.az), fwd = (dy * wpp) / Math.max(0.5, Math.sin(el));
    view.tx += -dx * wpp * ca - sa * fwd;
    view.tz += dx * wpp * sa - ca * fwd;
    clampTarget();
  };
  T3.zoomAt = (f, px, py) => {
    if (!cam) return;
    view.tween = null;
    camNow();
    const before = px == null ? null : groundHit(px, py);
    view.zoom = clamp(view.zoom * f, ZMIN, ZMAX);
    camNow();
    const after = px == null ? null : groundHit(px, py);
    if (before && after) { view.tx += before.x - after.x; view.tz += before.z - after.z; clampTarget(); }
  };
  T3.zoom = (f) => T3.zoomAt(f, VW / 2, VH / 2);
  T3.rotate = (dAz, dEl = 0) => {
    view.tween = null;
    view.az += dAz;
    view.el = clamp(view.el + dEl, 0.42, 1.3);
  };
  T3.drag = (dx, dy) => T3.pan(dx, dy);
  T3.az = () => view.az;
  // screen position of a world point (tests and tools)
  T3.project = (x, y, z) => { const p = toScreen(new V3(x, y, z)); return { x: p.x, y: p.y }; };
  T3.setView = (o) => { Object.assign(view, o); view.tween = null; };
  // open ground around a point: distance to the nearest plot, lane, stair, home, palm, stall,
  // terrace edge, wall or cliff (used to place the keep's decorations; negative means blocked)
  let chanPts = null;
  T3.clearance = (x, z) => {
    if (landH(x, z) > 0.2 || z > 15.3 || z < -17.2) return -1;
    let d = 99;
    const near = (px, pz, r) => { d = Math.min(d, Math.hypot(x - px, z - pz) - r); };
    for (const p of DATA.plots) { const c = plotPos[p.id]; near(c.x, c.z, 2.2); }
    near(SPRING.x, SPRING.z, 7.1);
    for (const id in routes) for (const q of routes[id].pts) near(q.x, q.z, 0.6);
    for (const [hx, hz, , w] of HOMES) near(hx, hz, w * 0.8);
    for (const [px, pz] of PALMS) near(px, pz, 0.5);
    for (const [sx, sz] of STALLS) near(sx, sz, 1.0);
    for (const [jx, jz] of JARS) near(jx, jz, 0.4);
    for (const [cx, cz] of CARTS) near(cx, cz, 0.7);
    for (const st of STAIRS) for (let i = 0; i <= 6; i++) near(lerp(st.a[0], st.b[0], i / 6), lerp(st.a[1], st.b[1], i / 6), st.w / 2 + 0.3);
    near(0, -10.4, 1.8); near(4.2, 13.6, 2.6); near(CRAG.x, CRAG.z, CRAG.r + 0.6);
    if (!chanPts) chanPts = route(CHANNEL).pts;
    for (const q of chanPts) near(q.x, q.z, 0.6);
    for (const [fx, fz, w, dd] of [[9.6, 12.0, 2.2, 3.6], [6.4, 11.2, 1.8, 2.2]]) d = Math.min(d, Math.max(Math.abs(x - fx) - w / 2, Math.abs(z - fz) - dd / 2) - 0.3);
    for (const t of TERR) {
      const P = t.pts;
      for (let i = 0; i < P.length; i++) {
        const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
        const u = clamp(((x - ax) * vx + (z - az) * vz) / (L2 || 1), 0, 1);
        d = Math.min(d, Math.hypot(x - ax - vx * u, z - az - vz * u) - 0.5);
      }
    }
    d = Math.min(d, 15.3 - z);
    return d;
  };
  T3.stats = () => renderer && { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, scene };
  // let go of a drag: the view glides on and settles
  T3.fling = (vx, vy) => { view.vx = clamp(vx, -2500, 2500); view.vy = clamp(vy, -2500, 2500); };
  T3.hold = (on) => { view.hold = on; if (on) { view.vx = 0; view.vy = 0; } };
  T3.reset = () => {
    const az = Math.atan2(Math.sin(view.az), Math.cos(view.az));
    view.tween = { t0: performance.now(), from: { az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz, lift: view.lift } };
    view.vx = view.vy = 0;
  };
  T3.atHome = () => Math.hypot(view.tx - HOME.tx, view.tz - HOME.tz) < 1.5 && Math.abs(Math.atan2(Math.sin(view.az), Math.cos(view.az))) < 0.15 && Math.abs(view.zoom - 1) < 0.15 && Math.abs(view.el - HOME.el) < 0.12;
  // glide to a plot (opening one from a list or the quest card)
  T3.focus = (pid) => {
    const c = plotPos[pid];
    if (!c || !cam) return;
    tmpV.copy(c).project(cam);
    if (Math.abs(tmpV.x) < 0.8 && tmpV.y > -0.5 && tmpV.y < 0.85 && view.zoom < 1.6) return;
    view.tween = { t0: performance.now(), from: { az: view.az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz, lift: view.lift }, to: { az: view.az, el: view.el, zoom: Math.max(1.3, Math.min(view.zoom, 2)), tx: c.x, tz: c.z + 2 } };
  };
  // a full view to fly to: { az, el, zoom, tx, tz, lift }
  T3.flyTo = (to) => {
    view.tween = { t0: performance.now(), from: { az: view.az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz, lift: view.lift }, to: { ...HOME, ...to } };
  };
  T3.focusAt = (x, z, zoom = 2.2) => {
    view.tween = { t0: performance.now(), from: { az: view.az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz, lift: view.lift }, to: { az: view.az, el: view.el, zoom, tx: x, tz: z + 1.5 } };
  };
  function camStep(now, dt) {
    if (view.tween) {
      const k = smooth(0, 1, (now - view.tween.t0) / 650), to = view.tween.to || HOME, fr = view.tween.from;
      for (const key of ['az', 'el', 'zoom', 'tx', 'tz', 'lift']) view[key] = lerp(fr[key] || 0, to[key] || 0, k);
      if (k >= 1) view.tween = null;
    } else if (view.lift && view.hold) view.lift = Math.max(0, view.lift - dt * 30); // touching the view brings it back down
    if (view.tween) return;
    if (!view.hold && (Math.abs(view.vx) > 4 || Math.abs(view.vy) > 4)) {
      T3.pan(view.vx * dt, view.vy * dt);
      const decay = Math.exp(-dt * 4.2);
      view.vx *= decay; view.vy *= decay;
    }
  }

  // ======================================================================
  // Picking and screen anchors for the overlay
  // ======================================================================
  T3.pick = (px, py) => {
    if (!T3.active) return null;
    ray.setFromCamera(new V2((px / VW) * 2 - 1, -(py / VH) * 2 + 1), cam);
    const h = ray.intersectObjects(merchant && merchant.visible ? [...hit, merchant.children[merchant.children.length - 1]] : hit, false);
    if (!h.length) return null;
    // a hero or companion standing in (or just behind) a building's tap box still gets the tap
    const fig = h.find((x) => /^(hero|pal):/.test(x.object.userData.pid || ''));
    return (fig && fig.distance - h[0].distance < 2.5 ? fig : h[0]).object.userData.pid;
  };
  function toScreen(v) {
    tmpV.copy(v).project(cam);
    return { x: (tmpV.x * 0.5 + 0.5) * VW, y: (-tmpV.y * 0.5 + 0.5) * VH, z: tmpV.z };
  }
  const onScreen = (a) => a.z < 1 && a.x > -80 && a.x < VW + 80 && a.y > -80 && a.y < VH + 80;
  function anchors() {
    const out = {};
    const pxPerUnit = (pt) => { const a = toScreen(pt), b = toScreen(pt.clone().add(new V3(1, 0, 0))); return Math.hypot(b.x - a.x, b.y - a.y); };
    for (const p of DATA.plots) {
      const c = plotPos[p.id], pl = plots[p.id];
      const base = toScreen(new V3(c.x, c.y, c.z + 1.7));
      const top = toScreen(new V3(c.x, c.y + pl.top + 0.3, c.z));
      const mid = toScreen(new V3(c.x, c.y + 0.2, c.z));
      out[p.id] = { x: base.x, y: base.y, tx: top.x, ty: top.y, mx: mid.x, my: mid.y, s: clamp(pxPerUnit(c) / 17, 0.7, 1.35), vis: onScreen(base) || onScreen(top) };
    }
    const hw = wyrm.headWorld;
    const h = toScreen(hw);
    const gate = toScreen(new V3(K.gate.x, 3.4, K.gate.z));
    out.gate = { x: gate.x, y: gate.y, tx: gate.x, ty: gate.y, mx: gate.x, my: gate.y, s: out.well ? out.well.s : 1, vis: onScreen(gate) };
    out.wyrm = { x: h.x, y: h.y + 40, tx: h.x, ty: h.y - 26, mx: h.x, my: h.y, s: clamp(pxPerUnit(hw) / 17, 0.7, 1.35), vis: onScreen(h) };
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
    if (KH.covered && KH.covered()) { last = now; return; } // nothing to draw under a full-screen overlay
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (last || now)) / 1000), rdt = Math.min(0.5, (now - (last || now)) / 1000);
    last = now;
    slow -= dt;
    if (slow <= 0 || now - lastSync > 600) { slow = 0.5; lastSync = now; syncPlots(); syncDecor(); syncDefenses(); syncRanks(); syncDecrees(); syncKin(); syncPals(); syncHeroes(); syncSellers(); syncStandIns(); posts = syncPeople(); }
    camStep(now, dt);
    // short swoop in when the keep first appears (wall-clock, so slow devices don't drag it out)
    const fk = smooth(0, 1, (now - view.flyStart) / 1800);
    lighting(t, rdt);
    wyrm.set({ level: S.lv.wyrm, skin: S.skins.on, element: S.wyrm.element });
    const petAge = UI.petT ? (performance.now() - UI.petT) / 1000 : 9, roarAge = (performance.now() - roarT) / 1000;
    wyrm.pose({ t, dormant: S.dormant, pet: petAge < 1.6 ? 1 - petAge / 1.6 : 0, roar: roarAge < 0.4 ? roarAge / 0.4 : Math.max(0, 1 - (roarAge - 0.4) / 2.2) });
    T3.water.position.y = SPRING.y - (S.dormant ? 0.12 : 0);
    // element aura and the Primordial rain cloud
    aura.visible = !!wyrm.elem && !S.dormant;
    if (aura.visible) { aura.material.color.set(wyrm.elem.color); aura.material.opacity = 0.45 + 0.3 * Math.sin(t * 2); aura.scale.setScalar(1 + 0.02 * Math.sin(t * 1.3)); }
    bondFx.visible = !!(KH.bondLevel && KH.bondLevel() >= 10 && !S.dormant);
    if (bondFx.visible) {
      bondFx.userData.list.forEach((p, i) => {
        const a = t * 0.25 + (i / 28) * Math.PI * 2, rr = 4.3 + Math.sin(t * 0.7 + i) * 0.5;
        Object.assign(p, { x: SPRING.x + Math.cos(a) * rr, y: SPRING.y + 1.3 + Math.sin(t * 1.3 + i * 1.7) * 0.6, z: SPRING.z + Math.sin(a) * rr, s: 2.6 + 0.9 * Math.sin(t * 3 + i), a: 1, life: 2, age: 1 });
      });
      bondFx.userData.flush();
    }
    cloud.visible = rain.visible = wyrm.stage >= 6 && !S.dormant;
    if (cloud.visible) {
      cloud.position.set(SPRING.x + (wyrm.headWorld.x - SPRING.x) * 0.6, wyrm.headWorld.y + 2.2 + Math.sin(t * 0.7) * 0.15, SPRING.z + (wyrm.headWorld.z - SPRING.z) * 0.5 - 0.6);
      const rp = rain.geometry.attributes.position.array;
      for (let i = 0; i < 60; i++) {
        const ph = ((t * 1.6 + i * 0.137) % 1), x = cloud.position.x + Math.sin(i * 12.9) * 0.9, z = cloud.position.z + Math.cos(i * 7.3) * 0.6;
        const y = cloud.position.y - 0.3 - ph * (cloud.position.y - 0.1 - SPRING.y);
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
    // the Deepspring glows brighter with each Springsong rank; from the second, motes rise from the pool
    const dr = KH.deep && KH.deep.level() ? 1 + KH.deep.rank() : 0;
    deepGlow.visible = dr > 0 && !S.dormant;
    if (deepGlow.visible) deepGlow.material.opacity = (0.06 + 0.035 * dr) * (0.8 + 0.2 * Math.sin(t * 1.6));
    deepFx.visible = dr >= 3 && !S.dormant;
    if (deepFx.visible) {
      const n = Math.min(48, 8 * (dr - 1));
      deepFx.userData.list.forEach((p, i) => {
        if (i >= n) { p.life = 0; return; }
        const ph = (t * 0.3 + i * 0.618) % 1, a = i * 2.4 + t * 0.15, rr = 0.5 + ((i * 0.37) % 1) * 2.5;
        Object.assign(p, { x: SPRING.x + Math.cos(a) * rr, y: SPRING.y + 0.1 + ph * 3.4, z: SPRING.z + Math.sin(a) * rr, s: 1.4 + 0.5 * Math.sin(i * 1.7), a: 0.85, life: 1, age: ph });
      });
      deepFx.userData.flush();
    }
    skyriver.visible = wyrm.stage >= 8 && !S.dormant;
    if (skyriver.visible) { skyriver.rotation.y = t * 0.25; skyriver.material.emissiveIntensity = 0.45 + 0.15 * Math.sin(t * 1.7); }
    for (const p of DATA.plots) { const b = plots[p.id].model && plots[p.id].model.userData.b; if (b) b.userData.update(t, T3.wind); }
    for (const p of props) A.swayPalm(p, t, T3.wind);
    for (const b of banners) b.userData.update(t, T3.wind);
    animPeople(t, posts);
    sellers.forEach((p, i) => A.animPerson(p, t + i * 1.7, i % 2 ? 'work' : 'idle', 0.35));
    animPals(t, dt);
    animHeroes(t);
    animCamels(t);
    animParticles(t, dt);
    animRain(rdt);
    merchant.visible = !!(KH.keep && KH.keep.merchantHere());
    animRaiders(t);
    animDecor(t);
    animKin(t);
    // highlight rings: the current quest target and the plot whose sheet is open
    const qp = UI.questTarget && plotPos[UI.questTarget];
    ringSel.quest.visible = !!qp && !(UI.sheet && UI.sheet.kind === 'plot');
    if (qp) { ringSel.quest.position.set(qp.x, qp.y + 0.06, qp.z); ringSel.quest.material.opacity = 0.45 + 0.4 * Math.sin(t * 4); ringSel.quest.scale.setScalar(1 + 0.05 * Math.sin(t * 4)); }
    const sp = UI.sheet && UI.sheet.kind === 'plot' && plotPos[UI.sheet.pid];
    ringSel.sel.visible = !!sp;
    if (sp) { ringSel.sel.position.set(sp.x, (UI.sheet.pid === 'wyrm' ? 0 : sp.y) + 0.06, sp.z); ringSel.sel.scale.setScalar(UI.sheet.pid === 'wyrm' ? 2.6 : 1); }
    // camera
    const d = fitD / view.zoom;
    T3.camD = d;
    applyOffset();
    place(lerp(d * 1.35, d, fk), lerp(0.22, camEl(), fk), lerp(-0.45, 0, fk) + view.az);
    T3.home = T3.atHome();
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
