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

  let renderer, scene, cam, sun, hemi, sky, terrain, wyrm, mist, dust, fx, bondFx, aura, cloud, rain, bolt, skyriver, nextBolt = 0;
  let VW = 0, VH = 0, DPR = 1, fitD = 60;
  const plots = {};
  const props = [];
  const banners = [];
  const people = [];
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
    const lampM = A.mat(A.P.woodD), cu = A.mat(A.P.copper, { m: 0.5, r: 0.4 });
    for (const s of STAIRS) for (const [x, z, y] of [s.a, s.b]) for (const k of [-1, 1]) {
      const ox = Math.abs(s.b[1] - s.a[1]) > Math.abs(s.b[0] - s.a[0]) ? k * (s.w / 2 + 0.35) : 0;
      if (Math.abs(x + ox) > 15.5) continue;
      g.add(A.at(A.grp(A.cyl(0.04, 0.05, 1.3, lampM, 0, 0, 0, 5), A.box(0.16, 0.2, 0.16, cu, 0, 1.25, 0), A.sph(0.07, A.lamp, 0, 1.35, 0, 8)), x + ox, y, z));
    }
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
  // Scorpion raiders: a band that crosses the dunes toward the gate while the watchtower has them in sight
  function buildRaiders() {
    const g = new THREE.Group(), list = [];
    const robe = '#2e1e1a', wrap = '#b8331c';
    const flameM = new THREE.MeshStandardMaterial({ color: '#ffb040', emissive: '#ff8020', emissiveIntensity: 2.2 });
    // wedge formation: [side offset, back offset]
    const spots = [[0, 0], [-1.1, 1.0], [1.1, 1.0], [-2.2, 2.0], [0, 2.0], [2.2, 2.0], [-1.1, 3.0], [1.1, 3.0], [-3.2, 3.2], [3.2, 3.2]];
    spots.forEach(([sx, sz], i) => {
      const o = A.person(300 + i, { robe, wrap });
      o.scale.setScalar(1.25);
      if (i === 1 || i === 2 || i === 7) {
        const torch = A.grp(A.cyl(0.03, 0.035, 0.8, A.mat(A.P.woodD), 0.22, 0.35, 0.1, 5), A.sph(0.1, flameM, 0.22, 1.2, 0.1, 6));
        o.add(torch);
      }
      g.add(o);
      list.push({ o, sx, sz, ph: i * 1.7 });
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
    raiders = { g, list, flame: flameM };
  }
  const RAID_FROM = new V3(-12, 0, 36), RAID_TO = new V3(0, 0, 19.2);
  function animRaiders(t) {
    const k = KH.raidProgress ? KH.raidProgress() : null;
    raiders.g.visible = k != null;
    if (k == null) return;
    const e = smooth(0, 1, k);
    const hx = RAID_TO.x - RAID_FROM.x, hz = RAID_TO.z - RAID_FROM.z, hl = Math.hypot(hx, hz);
    const fx = hx / hl, fz = hz / hl, ry = Math.atan2(fx, fz);
    // a little curve through the dunes
    const cx = lerp(RAID_FROM.x, RAID_TO.x, e) + Math.sin(e * Math.PI) * 4, cz = lerp(RAID_FROM.z, RAID_TO.z, e);
    for (const r of raiders.list) {
      const x = cx + -fz * r.sx - fx * r.sz, z = cz + fx * r.sx - fz * r.sz;
      const walking = k < 0.995;
      r.o.position.set(x, landH(x, z) + (walking && !r.camel && !r.flag ? Math.abs(Math.sin(t * 6 + r.ph)) * 0.06 : 0), z);
      r.o.rotation.y = r.flag ? ry - Math.PI / 2 : ry;
      if (r.camel && walking) A.walkCamel(r.o, t + r.ph, 0.8);
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
    for (const s of [-1, 1]) g.add(A.at(tower(0.95, 3.6, wallM, A.P.cloth1), s * 2.2, 0, WZ + 0.1));
    const lintel = A.grp(A.box(3.4, 0.55, 0.8, wallM, 0, 2.55, 0), A.box(3.6, 0.1, 0.9, capM, 0, 3.1, 0), A.box(2.6, 0.12, 0.84, adobeD, 0, 2.45, 0));
    lintel.position.set(0, 0, WZ + 0.1);
    g.add(lintel);
    for (const s of [-1, 1]) for (const x of [s * 1.0, s * 9.5]) g.add(A.at(A.grp(A.cyl(0.04, 0.05, 1.5, lampM, 0, 0, 0, 5), A.box(0.18, 0.22, 0.18, cu, 0, 1.45, 0), A.sph(0.08, A.lamp, 0, 1.56, 0, 8)), x, 0, WZ + 0.9));
    // the paved avenue from the gate to the spring, lined with lamps
    const ave = ribbon(route([[0, WZ + 1.2], [0, 6.6]]).pts, 2.6, 0.03, new THREE.MeshStandardMaterial({ map: rep(A.tex.paving, 2.4, 2.4), roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    scene.add(ave);
    for (let z = 8.2; z < WZ - 0.5; z += 2.6) for (const s of [-1, 1]) g.add(A.at(A.grp(A.cyl(0.04, 0.05, 1.5, lampM, 0, 0, 0, 5), A.box(0.18, 0.22, 0.18, cu, 0, 1.45, 0), A.sph(0.08, A.lamp, 0, 1.56, 0, 8)), s * 1.6, 0, z));
    // lamps around the spring's plaza
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const x = SPRING.x + Math.cos(a) * 6.75, z = SPRING.z + Math.sin(a) * 6.75;
      if (Math.abs(x) > 6.6 && z < 5) continue;
      g.add(A.at(A.grp(A.cyl(0.04, 0.05, 1.5, lampM, 0, 0, 0, 5), A.box(0.18, 0.22, 0.18, cu, 0, 1.45, 0), A.sph(0.08, A.lamp, 0, 1.56, 0, 8)), x, 0, z));
    }
    // market stalls by the gate
    for (const [x, z, c, ry] of [[-3.0, 14.8, A.P.cloth3, 0.2], [2.9, 10.6, A.P.cloth1, -0.5]]) {
      const st = A.grp(A.box(1.3, 0.55, 0.6, A.mat(A.P.wood, { flat: true }), 0, 0, 0));
      for (const [px, pz] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) st.add(A.cyl(0.03, 0.03, 1.4, lampM, px, 0, pz, 4));
      const roof = A.box(1.5, 0.04, 0.9, A.mat(c, { map: A.tex.stripes(c, A.P.cloth2, 6) }), 0, 1.4, 0);
      roof.rotation.x = 0.2;
      st.add(roof);
      for (let k = 0; k < 4; k++) st.add(A.sph(0.08, A.mat(['#c8553d', '#e8b54a', '#5f9a3e', '#a0461c'][k], { flat: true }), -0.45 + k * 0.3, 0.62, 0.05, 6));
      g.add(A.at(st, x, 0, z, ry));
    }
    // homes that fill out each quarter (scenery only)
    const homes = [
      [-14.1, -4.0, 1.4, 1.3, 1.1, 1.2, 0.5], [-14.2, 0.6, 1.4, 1.1, 1.4, 1.1, 0.4], [-14.0, 5.0, 1.4, 1.4, 1.0, 1.2, 0.3],
      [14.1, -4.0, 1.4, 1.3, 1.2, 1.2, -0.5], [14.2, 0.6, 1.4, 1.2, 1.0, 1.1, -0.4], [14.0, 5.0, 1.4, 1.3, 1.3, 1.2, -0.3],
      [-8.6, -15.6, 2.8, 1.4, 1.5, 1.2, 0.1], [8.4, -15.4, 2.8, 1.5, 1.2, 1.2, -0.1],
      [-12.6, -16.2, 2.8, 1.3, 1.6, 1.3, 0.3], [14.0, -16.0, 2.8, 1.3, 1.1, 1.2, -0.3], [-13.6, -8.4, 2.8, 1.2, 1.0, 1.1, 0.6],
      [-15.0, 12.6, 0, 1.4, 1.2, 1.3, 0.6], [15.0, 13.4, 0, 1.3, 1.1, 1.2, -0.6], [-9.6, 14.0, 0, 1.2, 1.0, 1.1, 0.2],
    ];
    const walls = [A.P.adobe, A.P.plaster, A.P.adobeL, A.P.sandstone];
    homes.forEach(([x, z, y, w, h, d, ry], i) => {
      const hz = A.house(w, h, d, { wall: walls[i % walls.length], side: i % 2 === 0 });
      if (i % 3 === 0) hz.add(A.box(w * 0.55, h * 0.5, d * 0.6, A.mat(walls[(i + 1) % walls.length]), -w * 0.12, h, -d * 0.15));
      g.add(A.at(hz, x, y, z, ry));
    });
    // the Rain Altar: an open pavilion on the upper crescent, looking down on the spring
    const alt = new THREE.Group(), white = A.mat(A.P.white, { flat: true });
    alt.add(A.cyl(1.55, 1.7, 0.3, stoneM, 0, 0, 0, 12));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; alt.add(A.cyl(0.11, 0.13, 1.7, white, Math.cos(a) * 1.15, 0.3, Math.sin(a) * 1.15, 8)); }
    alt.add(A.cyl(1.4, 1.4, 0.18, capM, 0, 2.0, 0, 12), A.dome(1.3, A.mat(A.P.tileL, { flat: true }), 0, 2.18, 0, 14), A.sph(0.1, A.mat(A.P.gold, { m: 0.6, r: 0.35 }), 0, 3.5, 0, 8));
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
    for (const [side, at, y, ry] of [[-1, -9, 3.6, Math.PI / 2], [-1, 1, 6.2, Math.PI / 2], [1, -4, 3.6, -Math.PI / 2], [1, -12, 6.2, -Math.PI / 2], ['b', -9, 6.2, 0], ['b', 9, 3.6, 0], ['b', -13, 3.6, 0]]) {
      const f = face(side, at, y);
      if (!f) continue;
      const [x, z] = f;
      const dw = A.grp(A.box(1.5, 1.6, 0.5, carve, 0, 0, 0), A.box(0.5, 0.85, 0.1, dark, 0, 0.15, 0.24), A.arch(0.25, 0.1, dark, 0, 1.0, 0.24), A.box(1.7, 0.12, 0.7, rockD, 0, 1.6, 0));
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
    for (const [x, z] of [[-8.6, 11.4], [-8.2, 13.6], [-4.4, 11.0], [11.4, 7.6], [13.6, 13.2]]) g.add(A.at(A.jar(1.0, r() < 0.5 ? '#b0603a' : '#9a4a2a'), x, 0, z));
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
    const spots = [
      [-6.0, -4.6], [6.0, -4.6], [-3.4, -6.6], [3.4, -6.6], [-2.4, 9.6], [2.4, 9.6], [-2.4, 13.4], [2.6, 12.0],
      [-13.2, 2.0], [13.2, 2.0], [-12.9, -5.2], [12.9, -5.2], [-7.4, -12.8], [0.2, -13.0], [7.2, -12.8], [-13.4, -10.6], [14.4, -7.6],
      [-8.4, 15.0], [11.0, 15.0], [-14.4, 9.0], [14.4, 8.8],
    ];
    spots.forEach(([x, z], i) => {
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
  // People and camels
  // ======================================================================
  function syncPeople() {
    const posts = Object.keys(S.workers).filter((p) => S.workers[p] > 0 && S.lv[p]);
    const want = posts.length ? Math.min(S.pop - S.sick, 22) : Math.min(S.pop, 4);
    while (people.length < want) {
      const i = people.length;
      const o = A.person(i + 1, { jar: i % 4 === 1 });
      o.scale.setScalar(1.15);
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
      const dir = go ? 1 : -1;
      if (go || (!at && back)) p.o.rotation.y = Math.atan2(q.dx * dir, q.dz * dir);
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
  // then pans (drag), zooms toward the finger (pinch or wheel) and turns (twist or right-drag)
  // ======================================================================
  const HOME = { az: 0, el: 0.8, zoom: 1, tx: 0, tz: -0.2 };
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
    camTarget.set(view.tx, lerp(1.1, groundAt(view.tx, view.tz) + 0.9, zk), view.tz);
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
  T3.stats = () => renderer && { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, scene };
  // let go of a drag: the view glides on and settles
  T3.fling = (vx, vy) => { view.vx = clamp(vx, -2500, 2500); view.vy = clamp(vy, -2500, 2500); };
  T3.hold = (on) => { view.hold = on; if (on) { view.vx = 0; view.vy = 0; } };
  T3.reset = () => {
    const az = Math.atan2(Math.sin(view.az), Math.cos(view.az));
    view.tween = { t0: performance.now(), from: { az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz } };
    view.vx = view.vy = 0;
  };
  T3.atHome = () => Math.hypot(view.tx - HOME.tx, view.tz - HOME.tz) < 1.5 && Math.abs(Math.atan2(Math.sin(view.az), Math.cos(view.az))) < 0.15 && Math.abs(view.zoom - 1) < 0.15 && Math.abs(view.el - HOME.el) < 0.12;
  // glide to a plot (opening one from a list or the quest card)
  T3.focus = (pid) => {
    const c = plotPos[pid];
    if (!c || !cam) return;
    tmpV.copy(c).project(cam);
    if (Math.abs(tmpV.x) < 0.8 && tmpV.y > -0.5 && tmpV.y < 0.85 && view.zoom < 1.6) return;
    view.tween = { t0: performance.now(), from: { az: view.az, el: view.el, zoom: view.zoom, tx: view.tx, tz: view.tz }, to: { az: view.az, el: view.el, zoom: Math.max(1.3, Math.min(view.zoom, 2)), tx: c.x, tz: c.z + 2 } };
  };
  function camStep(now, dt) {
    if (view.tween) {
      const k = smooth(0, 1, (now - view.tween.t0) / 650), to = view.tween.to || HOME, fr = view.tween.from;
      for (const key of ['az', 'el', 'zoom', 'tx', 'tz']) view[key] = lerp(fr[key], to[key], k);
      if (k >= 1) view.tween = null;
    } else if (!view.hold && (Math.abs(view.vx) > 4 || Math.abs(view.vy) > 4)) {
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
    return h.length ? h[0].object.userData.pid : null;
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
    const t = now / 1000;
    const dt = Math.min(0.05, (now - (last || now)) / 1000), rdt = Math.min(0.5, (now - (last || now)) / 1000);
    last = now;
    slow -= dt;
    if (slow <= 0 || now - lastSync > 600) { slow = 0.5; lastSync = now; syncPlots(); posts = syncPeople(); }
    camStep(now, dt);
    // short swoop in when the keep first appears (wall-clock, so slow devices don't drag it out)
    const fk = smooth(0, 1, (now - view.flyStart) / 1800);
    lighting(t, rdt);
    wyrm.set({ level: S.lv.wyrm, skin: S.skins.on, element: S.wyrm.element });
    const petAge = UI.petT ? (performance.now() - UI.petT) / 1000 : 9;
    wyrm.pose({ t, dormant: S.dormant, pet: petAge < 1.6 ? 1 - petAge / 1.6 : 0 });
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
    skyriver.visible = wyrm.stage >= 8 && !S.dormant;
    if (skyriver.visible) { skyriver.rotation.y = t * 0.25; skyriver.material.emissiveIntensity = 0.45 + 0.15 * Math.sin(t * 1.7); }
    for (const p of DATA.plots) { const b = plots[p.id].model && plots[p.id].model.userData.b; if (b) b.userData.update(t, T3.wind); }
    for (const p of props) A.swayPalm(p, t, T3.wind);
    for (const b of banners) b.userData.update(t, T3.wind);
    animPeople(t, posts);
    animCamels(t);
    animParticles(t, dt);
    animRain(rdt);
    merchant.visible = !!(KH.keep && KH.keep.merchantHere());
    animRaiders(t);
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
