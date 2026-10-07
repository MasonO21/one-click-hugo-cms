/*
 * Rainkeep 3D art kit: a procedural low-poly model library on three.js, shared by
 * the keep (town3d.js), the Dunes map (world3d.js) and wyrm portraits in sheets.
 * Everything is built from code at runtime (no model files), so the game stays a
 * single offline bundle. If WebGL or three.js is missing, KH.A3.ok stays false
 * and the 2D canvas renderers draw the game instead.
 */
'use strict';
(function () {
  const KH = window.KH;
  const THREE = window.THREE;
  const A = (KH.A3 = { ok: false });
  const flat = /[?&]flat\b/.test(location.search);
  function webgl() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }
  if (!THREE || flat || !webgl()) return;
  A.ok = true;
  A.THREE = THREE;
  KH.hooks.defaults.push((s) => { s.settings.gfx3d = true; });
  A.enabled = () => A.ok && !!KH.S && KH.S.settings.gfx3d !== false;

  const { seeded, clamp } = KH.u;
  const V3 = THREE.Vector3, Col = THREE.Color;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  A.smooth = smooth; A.lerp = lerp;

  // ======================================================================
  // Palette, materials, geometry cache
  // ======================================================================
  const P = (A.P = {
    adobe: '#c98a52', adobeL: '#deaa70', adobeD: '#a86c3c', plaster: '#ead2a4', white: '#f1e6d2', wood: '#7a4f2e', woodD: '#4f3019',
    door: '#3a2414', stone: '#b8956a', stoneD: '#8f6f4c', sandstone: '#d4a56c', copper: '#c7743a', patina: '#4fb39a',
    tile: '#2c78bc', tileL: '#4aa6e0', gold: '#e8b54a', cloth1: '#b5452a', cloth2: '#f0d9a8', cloth3: '#2f7f9a', cloth4: '#7a3f8a',
    green: '#5f9a3e', greenD: '#3d6e2a', rope: '#b89a6a', dark: '#2a1608', reed: '#7f9f4a', fur: '#c8955a', furD: '#9a6a3a',
  });
  const MC = {};
  function mat(color, o = {}) {
    const key = `${color}|${o.r}|${o.m}|${o.flat}|${o.e}|${o.ei}|${o.ds}|${o.o}|${o.map ? o.map.uuid : ''}`;
    if (!MC[key]) {
      MC[key] = new THREE.MeshStandardMaterial({
        color, roughness: o.r == null ? 0.88 : o.r, metalness: o.m || 0, flatShading: !!o.flat,
        emissive: o.e || '#000000', emissiveIntensity: o.ei == null ? 1 : o.ei, side: o.ds ? THREE.DoubleSide : THREE.FrontSide,
        transparent: o.o != null && o.o < 1, opacity: o.o == null ? 1 : o.o, map: o.map || null,
      });
    }
    return MC[key];
  }
  A.mat = mat;
  // night lights: windows and lanterns brighten as the sun goes down (town3d sets intensity)
  A.glow = new THREE.MeshStandardMaterial({ color: '#3a2414', emissive: '#ffb050', emissiveIntensity: 0.05, roughness: 0.6 });
  A.lamp = new THREE.MeshStandardMaterial({ color: '#ffdf9a', emissive: '#ffb84a', emissiveIntensity: 0.4, roughness: 0.4 });
  A.setNight = (k) => { A.glow.emissiveIntensity = 0.05 + 1.6 * k; A.lamp.emissiveIntensity = 0.4 + 2.2 * k; };

  const GC = {};
  const geo = (key, fn) => GC[key] || (GC[key] = fn());
  A.geo = geo;
  function mesh(g, m, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true;
    return o;
  }
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y + h / 2, z);
  // a box whose UVs follow its size, so a texture keeps one scale on big walls and small (ts: units per tile)
  const boxT = (w, h, d, m, x = 0, y = 0, z = 0, ts = 1) => mesh(geo(`bt${w},${h},${d},${ts}`, () => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, (uv.getX(i) * dims[f][0]) / ts, (uv.getY(i) * dims[f][1]) / ts); }
    return g;
  }), m, x, y + h / 2, z);
  const cylT = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12, ts = 1) => mesh(geo(`ct${rt},${rb},${h},${seg},${ts}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg), uv = g.attributes.uv, around = (Math.PI * (rt + rb)) / ts;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, (uv.getY(i) * h) / ts);
    return g;
  }), m, x, y + h / 2, z);
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, seg = 12) => mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y + h / 2, z);
  const sph = (r, m, x = 0, y = 0, z = 0, seg = 12) => mesh(geo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)))), m, x, y, z);
  const dome = (r, m, x = 0, y = 0, z = 0, seg = 16) => mesh(geo(`d${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.ceil(seg / 2), 0, Math.PI * 2, 0, Math.PI / 2)), m, x, y, z);
  const cone = (r, h, m, x = 0, y = 0, z = 0, seg = 8) => mesh(geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), m, x, y + h / 2, z);
  // a log/beam lying along z
  const beamZ = (r, len, m, x = 0, y = 0, z = 0) => mesh(geo(`bz${r},${len}`, () => new THREE.CylinderGeometry(r, r, len, 6).rotateX(Math.PI / 2)), m, x, y, z);
  // half-disc facing +z: door and window arches
  const arch = (r, d, m, x = 0, y = 0, z = 0) => mesh(geo(`a${r},${d}`, () => new THREE.CylinderGeometry(r, r, d, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)), m, x, y, z);
  // a cylinder between two points
  function rod(a, b, r, m) {
    const d = new V3().subVectors(b, a), len = d.length();
    const o = mesh(geo(`r${r},${len.toFixed(2)}`, () => new THREE.CylinderGeometry(r, r, len, 6)), m);
    o.position.copy(a).addScaledVector(d, 0.5);
    o.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
    return o;
  }
  Object.assign(A, { mesh, box, boxT, cylT, cyl, sph, dome, cone, beamZ, arch, rod });
  const grp = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => k && g.add(k)); return g; };
  const at = (o, x, y, z, ry = 0, s = 1) => { o.position.set(x, y, z); o.rotation.y = ry; if (s !== 1) o.scale.setScalar(s); return o; };
  A.grp = grp; A.at = at;

  // Merge every static mesh in a group into one mesh per material: a whole building
  // becomes a handful of draw calls. Subtrees marked userData.dyn keep animating.
  function mergeGeos(list) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += c;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
  function bake(group) {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map(), baked = [];
    group.traverse((o) => {
      if (!o.isMesh || o.userData.keep) return;
      for (let p = o; p && p !== group; p = p.parent) if (p.userData.dyn) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(g);
      baked.push(o);
    });
    baked.forEach((o) => o.parent.remove(o));
    for (const [m, list] of buckets) {
      const mm = new THREE.Mesh(mergeGeos(list), m);
      mm.castShadow = true; mm.receiveShadow = true;
      group.add(mm);
    }
    return group;
  }
  A.bake = bake;

  // ======================================================================
  // Procedural textures
  // ======================================================================
  function canvasTex(w, h, draw, color = true) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  A.canvasTex = canvasTex;
  const tex = (A.tex = {});
  // sand grain: near-white speckle that multiplies the terrain's vertex colors
  tex.sand = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h), r = seeded(11);
    for (let i = 0; i < w * h; i++) {
      const v = 214 + r() * 40 - (r() < 0.04 ? 40 : 0);
      img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.96; img.data[i * 4 + 2] = v * 0.9; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
  // wind ripples as a normal map (tileable: integer frequencies only)
  tex.ripple = canvasTex(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    const H = (x, y) => {
      const u = x / w, v = y / h;
      return Math.sin(2 * Math.PI * (7 * u + 2 * v) + 1.4 * Math.sin(2 * Math.PI * (u + 2 * v))) * 0.7 + Math.sin(2 * Math.PI * (11 * u - 3 * v)) * 0.3;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = H(x + 1, y) - H(x - 1, y), dy = H(x, y + 1) - H(x, y - 1);
      const n = new V3(-dx * 1.4, -dy * 1.4, 1).normalize();
      const i = (y * w + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255; img.data[i + 1] = (n.y * 0.5 + 0.5) * 255; img.data[i + 2] = (n.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  // overlapping scales for the wyrm (multiplies vertex colors)
  tex.scales = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    const s = 32;
    for (let row = -1; row < h / (s * 0.5) + 1; row++) for (let col = -1; col < w / s + 1; col++) {
      const x = col * s + (row % 2 ? s / 2 : 0), y = row * s * 0.5;
      const gr = g.createRadialGradient(x, y - s * 0.2, 2, x, y, s * 0.62);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#e2e2e2'); gr.addColorStop(1, '#9a9a9a');
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, s * 0.55, 0, Math.PI); g.fill();
    }
  });
  // sandstone paving for the plaza
  tex.paving = canvasTex(256, 256, (g, w, h) => {
    const r = seeded(5);
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h);
    const rows = 8;
    for (let y = 0; y < rows; y++) {
      let x = y % 2 ? -16 : 0;
      while (x < w) {
        const cw = 26 + r() * 20, v = 200 + r() * 40;
        g.fillStyle = `rgb(${v},${v * 0.82},${v * 0.6})`;
        g.fillRect(x + 1.5, y * (h / rows) + 1.5, cw - 3, h / rows - 3);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 2, y * (h / rows) + 2, cw - 4, 3);
        x += cw;
      }
    }
  });
  // dressed sandstone blocks for terrace walls, stairs and the spring basin (tiles both ways)
  tex.ashlar = canvasTex(256, 256, (g, w, h) => {
    const r = seeded(23), rows = 6, cols = 4, rh = h / rows, cw = w / cols;
    g.fillStyle = '#7a5434'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) for (let c = -1; c < cols; c++) {
      const x = c * cw + (y % 2 ? cw / 2 : 0), v = 196 + r() * 44;
      const fill = `rgb(${v},${v * 0.8},${v * 0.58})`;
      for (const ox of [0, w]) {
        g.fillStyle = fill; g.fillRect(x + 2 - ox, y * rh + 2, cw - 4, rh - 4);
        g.fillStyle = 'rgba(255,240,210,.14)'; g.fillRect(x + 3 - ox, y * rh + 3, cw - 6, 3);
        g.fillStyle = 'rgba(60,30,10,.12)'; g.fillRect(x + 3 - ox, y * rh + rh - 6, cw - 6, 3);
      }
      for (let k = 0; k < 6; k++) { g.fillStyle = `rgba(90,50,20,${0.06 + r() * 0.08})`; g.fillRect(x + r() * cw, y * rh + r() * rh, 2 + r() * 4, 1 + r() * 2); }
    }
  });
  // furrowed crop rows for the irrigated fields
  tex.crops = canvasTex(128, 128, (g, w, h) => {
    const r = seeded(31);
    g.fillStyle = '#8a6238'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const x = (i + 0.5) * (w / 8);
      for (let y = 0; y < h; y += 6) {
        const v = 0.75 + r() * 0.35;
        g.fillStyle = `rgb(${Math.round(80 * v)},${Math.round(140 * v)},${Math.round(56 * v)})`;
        g.beginPath(); g.ellipse(x + (r() - 0.5) * 2, y + 3, 4.5, 3.4, 0, 0, Math.PI * 2); g.fill();
      }
    }
  });
  const stripeCache = {};
  tex.stripes = (a, b, n = 8) => stripeCache[a + b + n] || (stripeCache[a + b + n] = canvasTex(64, 64, (g, w, h) => {
    for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * w) / n, 0, w / n + 1, h); }
  }));
  // soft round sprite for particles
  tex.dot = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });

  // ---- architecture textures (4.8) ----
  // draw something at every wrapped offset so it crosses the tile's edges cleanly
  const wrapAt = (w, h, x, y, rad, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) if (x + ox > -rad && x + ox < w + rad && y + oy > -rad && y + oy < h + rad) fn(x + ox, y + oy); };
  // lime plaster: near-white mottling, speckle and hairline cracks that tint with the wall colour
  tex.plaster = canvasTex(256, 256, (g, w, h) => {
    const r = seeded(41);
    g.fillStyle = '#f3ede4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 12 + r() * 42, dark = r() < 0.55;
      wrapAt(w, h, x, y, rad, (cx, cy) => {
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gr.addColorStop(0, dark ? 'rgba(120,85,55,0.11)' : 'rgba(255,255,255,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
      });
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '90,60,40' : '255,255,255'},${0.05 + r() * 0.09})`; g.fillRect(r() * w, r() * h, 1.3, 1.3); }
    g.strokeStyle = 'rgba(80,50,30,0.2)'; g.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) { let x = 20 + r() * (w - 40), y = 10 + r() * (h - 80); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 14; y += 4 + r() * 8; g.lineTo(x, y); } g.stroke(); }
  });
  // sun-dried mudbrick courses with pale mortar (tints with the wall colour)
  tex.brick = canvasTex(256, 256, (g, w, h) => {
    const r = seeded(43), rows = 8, cols = 4, rh = h / rows, cw = w / cols;
    g.fillStyle = '#e4dccd'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < rows; y++) for (let c = -1; c < cols; c++) {
      const x = c * cw + (y % 2 ? cw / 2 : 0), v = 200 + r() * 42;
      for (const ox of [0, w]) {
        g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.84})`; g.fillRect(x + 2.5 - ox, y * rh + 2.5, cw - 5, rh - 5);
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 3 - ox, y * rh + 3, cw - 6, 2);
        g.fillStyle = 'rgba(70,40,20,.13)'; g.fillRect(x + 3 - ox, y * rh + rh - 5, cw - 6, 2);
      }
    }
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(90,60,40,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
  });
  // zellige: cobalt eight-point stars with turquoise hearts on white, and the grout between (keeps its colours)
  tex.zellige = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4efe4'; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    const star = (cx, cy, R, rIn, fill) => { g.fillStyle = fill; g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + Math.PI / 16, rr = i % 2 ? rIn : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) {
      const cx = x * s, cy = y * s;
      star(cx, cy, s * 0.42, s * 0.3, '#1f5fa8');
      star(cx, cy, s * 0.25, s * 0.17, '#3fb8b0');
      g.fillStyle = '#f4efe4'; g.beginPath(); g.arc(cx, cy, s * 0.07, 0, Math.PI * 2); g.fill();
      const dx = cx + s / 2, dy = cy + s / 2;
      g.fillStyle = '#e8b54a'; g.beginPath(); g.moveTo(dx, dy - s * 0.12); g.lineTo(dx + s * 0.12, dy); g.lineTo(dx, dy + s * 0.12); g.lineTo(dx - s * 0.12, dy); g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(110,100,85,.3)'; g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo((i * w) / 16, 0); g.lineTo((i * w) / 16, h); g.stroke(); g.beginPath(); g.moveTo(0, (i * h) / 16); g.lineTo(w, (i * h) / 16); g.stroke(); }
  });
  // weathered planks with grain (tints with the wood colour)
  tex.wood = canvasTex(128, 128, (g, w, h) => {
    const r = seeded(47), n = 4;
    g.fillStyle = '#cfc6b8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x0 = (i * w) / n, v = 212 + r() * 40;
      g.fillStyle = `rgb(${v},${v * 0.95},${v * 0.9})`; g.fillRect(x0 + 1, 0, w / n - 2, h);
      g.strokeStyle = 'rgba(70,40,20,.28)'; g.lineWidth = 0.8;
      for (let k = 0; k < 5; k++) { const x = x0 + 3 + r() * (w / n - 6); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (r() - 0.5) * 6, h * 0.3, x + (r() - 0.5) * 6, h * 0.7, x, h); g.stroke(); }
      g.fillStyle = 'rgba(40,20,8,.55)'; g.fillRect(x0, 0, 1, h);
    }
    // iron studs across the planks
    g.fillStyle = 'rgba(30,20,12,.7)';
    for (const y of [h * 0.18, h * 0.82]) for (let i = 0; i < n; i++) { g.beginPath(); g.arc(((i + 0.5) * w) / n, y, 2.2, 0, Math.PI * 2); g.fill(); }
  });
  // carved lattice (mashrabiya): warm light through dark wood; also the emissive map, so it glows at night
  tex.lattice = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#2e1a0e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd38a';
    const s = 32;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      g.beginPath(); g.moveTo(x + s / 2, y + 4); g.lineTo(x + s - 4, y + s / 2); g.lineTo(x + s / 2, y + s - 4); g.lineTo(x + 4, y + s / 2); g.closePath(); g.fill();
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
    }
  });
  // a kilim: red field, indigo and cream diamonds, striped ends (keeps its colours)
  tex.kilim = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a8322a'; g.fillRect(0, 0, w, h);
    for (const y of [6, h - 14]) { g.fillStyle = '#f0d9a8'; g.fillRect(0, y, w, 8); g.fillStyle = '#1f3a6a'; g.fillRect(0, y + 3, w, 2); }
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * (w / 4), cy = 30 + row * 30, s = 11;
      g.fillStyle = row % 2 ? '#f0d9a8' : '#1f3a6a';
      g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy); g.closePath(); g.fill();
      g.fillStyle = '#e8b54a'; g.fillRect(cx - 2, cy - 2, 4, 4);
    }
  });
  // a repeated copy of a texture (shares the image)
  const repCache = {};
  const texRep = (t, rx, ry = rx) => {
    const k = `${t.uuid}|${rx}|${ry}`;
    if (!repCache[k]) { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); repCache[k] = c; }
    return repCache[k];
  };
  A.texRep = texRep;
  // night windows with a lattice screen: the holes glow
  A.glowLattice = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex.lattice, emissive: '#ffb050', emissiveMap: tex.lattice, emissiveIntensity: 0.05, roughness: 0.7 });
  const setNight0 = A.setNight;
  A.setNight = (k) => { setNight0(k); A.glowLattice.emissiveIntensity = 0.05 + 1.5 * k; };

  // ======================================================================
  // Sky, water, terrain
  // ======================================================================
  A.skyMat = () => new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new Col('#5fa8e8') }, uHorizon: { value: new Col('#f3d6a8') }, uBottom: { value: new Col('#d9a35e') },
      uSunDir: { value: new V3(0.4, 0.6, -0.7).normalize() }, uSunCol: { value: new Col('#fff2d0') }, uNight: { value: 0 }, uHaze: { value: 0 },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunCol; uniform float uNight, uHaze; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5 + uHaze)) : mix(uHorizon, uBottom, clamp(-h * 5.0, 0.0, 1.0));
        float s = max(dot(d, uSunDir), 0.0);
        c += uSunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.4 + pow(s, 3.0) * 0.12) * (1.0 - uHaze * 0.6);
        if (uNight > 0.01 && h > 0.0) { vec3 q = floor(d * 280.0); float st = step(0.9982, hash(q)); c += vec3(st) * uNight * smoothstep(0.0, 0.25, h) * (1.0 - uHaze); }
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
  });

  A.waters = [];
  A.waterMat = (o = {}) => {
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uDeep: { value: new Col(o.deep || '#0a5a82') }, uShallow: { value: new Col(o.shallow || '#3cc8cf') },
        uSky: { value: new Col('#d9f3ff') }, uSunDir: { value: new V3(0.4, 0.8, 0.3).normalize() }, uSunCol: { value: new Col('#fff2d8') },
        uScale: { value: o.scale || 1 }, uRadial: { value: o.radial ? 1 : 0 }, uAlpha: { value: o.alpha == null ? 0.93 : o.alpha }, uFoam: { value: new Col('#eafcff') },
      }]),
      vertexShader: `varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime, uScale, uRadial, uAlpha; uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunCol, uFoam;
        varying vec3 vW; varying vec2 vUv;
        #include <fog_pars_fragment>
        float wv(vec2 p){ return sin(p.x * 2.1 + uTime * 1.3) * 0.5 + sin(p.y * 1.7 - uTime * 1.05) * 0.5 + sin((p.x + p.y) * 3.3 + uTime * 1.9) * 0.25 + sin((p.x - p.y * 1.3) * 5.1 - uTime * 2.3) * 0.12; }
        void main(){
          vec2 p = vW.xz * uScale * 2.0;
          float e = 0.05; float h = wv(p);
          vec3 n = normalize(vec3(-(wv(p + vec2(e, 0.0)) - h) / e * 0.09, 1.0, -(wv(p + vec2(0.0, e)) - h) / e * 0.09));
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float rr = length(vUv - 0.5) * 2.0;
          float edge = uRadial > 0.5 ? smoothstep(0.45, 1.0, rr) : 0.0;
          vec3 c = mix(uDeep, uShallow, 0.3 + 0.45 * edge + 0.12 * h);
          c = mix(c, uSky, fr * 0.5);
          float sp = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 80.0);
          c += uSunCol * sp * 1.5;
          float sparkle = pow(max(sin(p.x * 7.0 + uTime * 3.0) * sin(p.y * 6.3 - uTime * 2.7), 0.0), 14.0);
          c += uFoam * sparkle * 0.3;
          c = mix(c, uFoam, uRadial * smoothstep(0.88, 1.0, rr) * 0.55);
          gl_FragColor = vec4(c, uAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, fog: true, depthWrite: o.depthWrite !== false,
    });
    A.waters.push(m);
    return m;
  };
  A.setWater = (t, sunDir, sunCol, sky) => {
    for (const m of A.waters) {
      m.uniforms.uTime.value = t;
      if (sunDir) m.uniforms.uSunDir.value.copy(sunDir);
      if (sunCol) m.uniforms.uSunCol.value.copy(sunCol);
      if (sky) m.uniforms.uSky.value.copy(sky);
    }
  };

  // ridged dunes: roughly 0..1.8
  A.dune = (x, z) => {
    const r1 = 1 - Math.abs(Math.sin(x * 0.052 + Math.sin(z * 0.031) * 1.8));
    const r2 = 1 - Math.abs(Math.sin(z * 0.066 + x * 0.021 + 1.3 + Math.sin(x * 0.04) * 0.8));
    return r1 * r1 * 1.0 + r2 * r2 * 0.6 + Math.sin(x * 0.13 + z * 0.11) * 0.12;
  };
  // o: size, seg, flat (radius kept flat), ramp (radius where dunes reach full height), amp, sx/sz (flat-zone stretch)
  A.terrain = (o = {}) => {
    const size = o.size || 200, seg = o.seg || 140, amp = o.amp == null ? 4 : o.amp;
    const g = new THREE.PlaneGeometry(size, size, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
    const cTrough = new Col('#b8783f'), cSand = new Col('#d9a15c'), cCrest = new Col('#f2c988'), cTown = new Col(o.town || '#c9935f'), tmp = new Col();
    const r = seeded(o.seed || 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x / (o.sx || 1), z / (o.sz || 1));
      const k = o.flat == null ? 1 : smooth(o.flat, o.ramp || o.flat * 2.4, d);
      const du = A.dune(x + (o.ox || 0), z + (o.oz || 0));
      const y = du * amp * k + (r() - 0.5) * 0.04 + (o.base || 0);
      pos.setY(i, y);
      const t = clamp(du / 1.6, 0, 1);
      tmp.copy(cTrough).lerp(cSand, smooth(0, 0.5, t)).lerp(cCrest, smooth(0.55, 1, t));
      tmp.lerp(cTown, 1 - k);
      const j = 0.94 + r() * 0.08;
      colors[i * 3] = tmp.r * j; colors[i * 3 + 1] = tmp.g * j; colors[i * 3 + 2] = tmp.b * j;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const map = tex.sand.clone(), nmap = tex.ripple.clone();
    map.needsUpdate = true; nmap.needsUpdate = true;
    map.repeat.set(size / 5, size / 5); nmap.repeat.set(size / 7, size / 7);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, map, normalMap: nmap, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.96 });
    const t = new THREE.Mesh(g, m);
    t.receiveShadow = true;
    t.userData.height = (x, z) => {
      const d = Math.hypot(x / (o.sx || 1), z / (o.sz || 1));
      const k = o.flat == null ? 1 : smooth(o.flat, o.ramp || o.flat * 2.4, d);
      return A.dune(x + (o.ox || 0), z + (o.oz || 0)) * amp * k + (o.base || 0);
    };
    return t;
  };

  // ======================================================================
  // Nature props
  // ======================================================================
  function frondGeo(len) {
    return geo(`fr${len}`, () => {
      const n = 7, pos = [];
      const pt = (i) => { const x = (i / n) * len, u = i / n; return new V3(x, 0.25 * len * Math.sin(u * 1.6) - 0.62 * len * u * u, 0); };
      for (let i = 0; i < n; i++) {
        const a = pt(i), b = pt(i + 1), w = 0.36 * len * Math.sin((Math.PI * (i + 0.6)) / n) * (1 - i / (n + 2));
        const l = new V3(a.x + len * 0.06, a.y - 0.12 * len, -w), rr = new V3(a.x + len * 0.06, a.y - 0.12 * len, w);
        pos.push(a.x, a.y, a.z, b.x, b.y, b.z, l.x, l.y, l.z);
        pos.push(a.x, a.y, a.z, rr.x, rr.y, rr.z, b.x, b.y, b.z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    });
  }
  A.palm = (h = 3, seed = 1, o = {}) => {
    const g = new THREE.Group(), r = seeded(seed * 977 + 13);
    const bark = mat('#7a5634', { flat: true }), barkD = mat('#5e3f24', { flat: true });
    const segs = 7, lx = (r() - 0.5) * 0.9, lz = (r() - 0.5) * 0.9;
    let prev = new V3(0, 0, 0);
    for (let i = 0; i < segs; i++) {
      const t = (i + 1) / segs;
      const p = new V3(lx * t * t * h * 0.32, t * h, lz * t * t * h * 0.32);
      g.add(rod(prev, p, 0.13 - 0.05 * t, i % 2 ? bark : barkD));
      prev = p;
    }
    const crown = new THREE.Group();
    crown.position.copy(prev);
    crown.userData.dyn = true;
    crown.userData.sway = r() * 6;
    const leaf = mat(o.leaf || '#4f8f36', { ds: true, flat: true }), leafD = mat(o.leafD || '#3a7028', { ds: true, flat: true });
    const nf = 8 + Math.floor(r() * 3);
    for (let i = 0; i < nf; i++) {
      const f = mesh(frondGeo(1.05 + r() * 0.45), i % 2 ? leaf : leafD);
      f.rotation.y = (i / nf) * Math.PI * 2 + r() * 0.3;
      f.rotation.z = 0.15 + r() * 0.35;
      crown.add(f);
    }
    if (o.dates !== false) {
      const dm = mat('#a0461c', { flat: true });
      for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2; crown.add(sph(0.12, dm, Math.cos(a) * 0.18, -0.2, Math.sin(a) * 0.18, 6)); }
    }
    crown.add(sph(0.15, mat('#6b8a2a', { flat: true }), 0, 0, 0, 6));
    g.add(crown);
    g.userData.crown = crown;
    // the crown sways as one piece, so each part merges into a few meshes
    bake(crown);
    bake(g);
    return g;
  };
  A.swayPalm = (p, t, wind) => {
    const c = p.userData.crown;
    if (!c) return;
    c.rotation.z = Math.sin(t * 1.3 + c.userData.sway) * 0.05 * wind;
    c.rotation.x = Math.cos(t * 1.1 + c.userData.sway) * 0.04 * wind;
  };
  function rockGeo(seed, r) {
    return geo(`rk${seed},${r}`, () => {
      const g = new THREE.IcosahedronGeometry(r, 0), rr = seeded(seed * 31 + 7), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.75 + rr() * 0.5), p.getY(i) * (0.55 + rr() * 0.4), p.getZ(i) * (0.75 + rr() * 0.5));
      g.computeVertexNormals();
      return g;
    });
  }
  A.rock = (r = 0.6, seed = 1, color = '#b98a5a') => mesh(rockGeo(seed % 6, r), mat(color, { flat: true }));
  A.mesa = (h, r, seed) => {
    const g = new THREE.CylinderGeometry(r * 0.8, r, h, 9, 4), rr = seeded(seed * 53 + 1), p = g.attributes.position;
    const cols = new Float32Array(p.count * 3), bands = ['#b5703f', '#c98a52', '#a35f33', '#d49a5c'].map((c) => new Col(c));
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), k = 0.8 + rr() * 0.35;
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      const b = bands[clamp(Math.floor(((y / h) + 0.5) * 3.99), 0, 3)];
      cols[i * 3] = b.r; cols[i * 3 + 1] = b.g; cols[i * 3 + 2] = b.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    m.position.y = h / 2 - 0.5;
    m.receiveShadow = true;
    return m;
  };
  A.reeds = (n, r, seed) => {
    const g = new THREE.Group(), rr = seeded(seed + 5), m = mat(P.reed, { flat: true });
    for (let i = 0; i < n; i++) {
      const a = rr() * Math.PI * 2, d = r * (0.6 + rr() * 0.4);
      const c = cone(0.05, 0.5 + rr() * 0.4, m, Math.cos(a) * d, 0, Math.sin(a) * d, 4);
      c.rotation.z = (rr() - 0.5) * 0.4;
      g.add(c);
    }
    return g;
  };
  // jars, pots and amphorae
  A.jar = (s = 1, color = '#b0603a') => {
    const g = geo('jar', () => new THREE.LatheGeometry([[0, 0], [0.1, 0.01], [0.17, 0.12], [0.16, 0.3], [0.08, 0.38], [0.065, 0.45], [0.09, 0.47]].map(([x, y]) => new THREE.Vector2(x, y)), 10));
    const m = mesh(g, mat(color));
    m.scale.setScalar(s);
    return m;
  };

  // ======================================================================
  // People, camels, flags
  // ======================================================================
  // A villager: the body (kaftan, sash, head, face, headwear and whatever they carry) is merged into one
  // vertex-coloured mesh, and the arms and legs hang on pivots so they can walk and work (A.animPerson).
  // The model faces +z, about 0.8 tall; o = { robe, wrap, sash, head, jar, carry, kind, child, scale }.
  const SKIN = ['#f3cfa8', '#e0ad84', '#c4895c', '#a06a44', '#7c4c2e', '#5e3820'];
  const ROBES = ['#e8dcc4', '#c9b08a', '#8a5a3a', '#2f6f8a', '#a8452a', '#5a7a3a', '#d9c49a', '#6a4a8a', '#c8553d', '#3f5f8f', '#e6c27a', '#7a3a2a'];
  const SASHES = ['#e8b54a', '#b5452a', '#2f9a9a', '#f0d9a8', '#7a3f8a', '#5f9a3e', '#d86a3a'];
  const HAIR = ['#120c08', '#2a1a10', '#3a2414', '#5a3a1e', '#8a8478'];
  const personMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
  A.personMat = personMat;
  const pCol = new Col(), pM4 = new THREE.Matrix4(), pQ = new THREE.Quaternion(), pE = new THREE.Euler();
  // one coloured, placed copy of a geometry
  function pPart(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const out = g.index ? g.toNonIndexed() : g.clone();
    out.applyMatrix4(pM4.compose(new V3(x, y, z), pQ.setFromEuler(pE.set(rx, ry, rz)), new V3(sx, sy, sz)));
    pCol.set(color);
    const n = out.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = pCol.r; c[i * 3 + 1] = pCol.g; c[i * 3 + 2] = pCol.b; }
    out.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return out;
  }
  function pMerge(parts) {
    let n = 0;
    for (const g of parts) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) {
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
  const PG = {
    robe: () => geo('p-robe', () => new THREE.LatheGeometry([[0, 0.16], [0.135, 0.16], [0.128, 0.24], [0.112, 0.34], [0.098, 0.41], [0.112, 0.49], [0.106, 0.56], [0.072, 0.61], [0.04, 0.635], [0, 0.635]].map(([x, y]) => new THREE.Vector2(x, y)), 10)),
    hem: () => geo('p-hem', () => new THREE.CylinderGeometry(0.136, 0.14, 0.03, 10, 1, true)),
    sash: () => geo('p-sash', () => new THREE.CylinderGeometry(0.104, 0.106, 0.045, 10)),
    head: () => geo('p-head', () => new THREE.SphereGeometry(0.074, 10, 8)),
    eye: () => geo('p-eye', () => new THREE.SphereGeometry(0.0115, 5, 4)),
    nose: () => geo('p-nose', () => new THREE.ConeGeometry(0.012, 0.03, 4).rotateX(Math.PI / 2)),
    turban: () => geo('p-turban', () => new THREE.TorusGeometry(0.066, 0.032, 6, 12).rotateX(Math.PI / 2)),
    cap: () => geo('p-cap', () => new THREE.SphereGeometry(0.068, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)),
    // a headscarf covering the back and top of the head, open at the face
    scarf: () => geo('p-scarf', () => new THREE.SphereGeometry(0.086, 12, 8, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.78)),
    drape: () => geo('p-drape', () => new THREE.CylinderGeometry(0.07, 0.115, 0.15, 10, 1, true, Math.PI / 2 + 0.6, Math.PI * 2 - 1.2)),
    ring: () => geo('p-ring', () => new THREE.TorusGeometry(0.07, 0.012, 5, 12).rotateX(Math.PI / 2)),
    brim: () => geo('p-brim', () => new THREE.CylinderGeometry(0.16, 0.16, 0.012, 14)),
    crown: () => geo('p-crown', () => new THREE.ConeGeometry(0.075, 0.09, 10)),
    veil: () => geo('p-veil', () => new THREE.BoxGeometry(0.1, 0.05, 0.02)),
    arm: () => geo('p-arm', () => new THREE.CylinderGeometry(0.03, 0.025, 0.21, 6).translate(0, -0.105, 0)),
    hand: () => geo('p-hand', () => new THREE.SphereGeometry(0.026, 6, 5)),
    leg: () => geo('p-leg', () => new THREE.CylinderGeometry(0.031, 0.027, 0.22, 6).translate(0, -0.11, 0)),
    foot: () => geo('p-foot', () => new THREE.BoxGeometry(0.05, 0.028, 0.085)),
    jar: () => geo('jar', () => new THREE.LatheGeometry([[0, 0], [0.1, 0.01], [0.17, 0.12], [0.16, 0.3], [0.08, 0.38], [0.065, 0.45], [0.09, 0.47]].map(([x, y]) => new THREE.Vector2(x, y)), 10)),
    basket: () => geo('p-basket', () => new THREE.CylinderGeometry(0.07, 0.055, 0.08, 8)),
    staff: () => geo('p-staff', () => new THREE.CylinderGeometry(0.01, 0.012, 0.85, 5)),
    bundle: () => geo('p-bundle', () => new THREE.BoxGeometry(0.15, 0.17, 0.09)),
    beard: () => geo('p-beard', () => new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)),
    tail: () => geo('p-tail', () => new THREE.BoxGeometry(0.05, 0.16, 0.02)),
  };
  const HEADS = ['turban', 'turban', 'scarf', 'scarf', 'scarf', 'keffiyeh', 'cap', 'hat', 'hair'];
  A.person = (seed = 1, o = {}) => {
    const r = seeded(seed * 71 + 3), pick = (a) => a[Math.floor(r() * a.length)];
    const raider = o.kind === 'raider';
    const robe = o.robe || pick(ROBES), wrap = o.wrap || pick(ROBES), sash = o.sash || pick(SASHES);
    const skin = pick(SKIN), hair = pick(HAIR), trousers = raider ? '#1a1210' : pick(['#3a2a20', '#4a3a2a', '#2a2420', '#5a4632']);
    const head = o.head || (raider ? 'keffiyeh' : pick(HEADS));
    const sleeve = new Col(robe).multiplyScalar(0.88).getStyle();
    const parts = [];
    // kaftan, hem, sash and the head with its face
    parts.push(pPart(PG.robe(), robe), pPart(PG.hem(), new Col(robe).multiplyScalar(0.7).getStyle(), 0, 0.175, 0), pPart(PG.sash(), sash, 0, 0.41, 0));
    parts.push(pPart(PG.head(), skin, 0, 0.705, 0));
    for (const s of [-1, 1]) parts.push(pPart(PG.eye(), '#1a0e08', s * 0.026, 0.715, 0.064));
    parts.push(pPart(PG.nose(), new Col(skin).multiplyScalar(0.9).getStyle(), 0, 0.698, 0.075));
    // some of the men wear beards (not under a scarf)
    if (!o.child && head !== 'scarf' && r() < 0.42) parts.push(pPart(PG.beard(), r() < 0.2 ? '#d8d4cc' : hair, 0, 0.69, 0.018, 0.25, 0, 0, 1, 1.05, 0.95));
    if (head === 'turban') {
      parts.push(pPart(PG.turban(), wrap, 0, 0.752, -0.004, 0.08), pPart(PG.turban(), wrap, 0, 0.782, -0.008, -0.1, 0, 0, 0.86, 1, 0.86), pPart(PG.cap(), wrap, 0, 0.792, -0.006, 0, 0, 0, 0.82, 0.8, 0.82));
      if (r() < 0.4) parts.push(pPart(PG.eye(), o.jewel || '#e8b54a', 0, 0.772, 0.07, 0, 0, 0, 1.4, 1.4, 1.4));
      if (r() < 0.45) parts.push(pPart(PG.tail(), wrap, 0.03, 0.69, -0.085, 0.15, 0, -0.1)); // a loose end down the back
    } else if (head === 'scarf' || head === 'keffiyeh') {
      const c = head === 'keffiyeh' ? (raider ? wrap : pick(['#f1e6d2', '#e8dcc4', '#c8553d', '#f0d9a8'])) : wrap;
      parts.push(pPart(PG.scarf(), c, 0, 0.71, -0.004), pPart(PG.drape(), c, 0, 0.6, -0.012));
      if (head === 'keffiyeh') parts.push(pPart(PG.ring(), '#1a1210', 0, 0.775, -0.006));
      if (raider) parts.push(pPart(PG.veil(), wrap, 0, 0.68, 0.068));
    } else if (head === 'cap') {
      parts.push(pPart(PG.cap(), hair, 0, 0.712, -0.008, 0, 0, 0, 1.04, 0.9, 1.06), pPart(PG.cap(), pick(['#f1e6d2', '#b5452a', '#2f6f8a']), 0, 0.745, -0.004, 0, 0, 0, 0.82, 0.55, 0.82));
    } else if (head === 'hat') {
      parts.push(pPart(PG.cap(), hair, 0, 0.712, -0.008, 0, 0, 0, 1.04, 0.9, 1.06), pPart(PG.brim(), '#d9b46a', 0, 0.76, 0), pPart(PG.crown(), '#c9a05a', 0, 0.8, 0));
    } else {
      parts.push(pPart(PG.cap(), hair, 0, 0.712, -0.01, 0, 0, 0, 1.05, 1.0, 1.08));
      if (r() < 0.5) parts.push(pPart(PG.hand(), hair, 0, 0.75, -0.075, 0, 0, 0, 1.3, 1.3, 1.3)); // a bun
    }
    // carried on the head, the back or in a hand
    const carry = o.carry || (o.jar ? 'jar' : raider ? null : r() < 0.18 ? 'bundle' : r() < 0.3 ? 'basket' : r() < 0.38 ? 'staff' : null);
    if (carry === 'jar') parts.push(pPart(PG.jar(), pick(['#b0603a', '#9a4a2a', '#c9884a']), 0, 0.79, 0, 0, 0, 0, 0.5, 0.5, 0.5));
    if (carry === 'bundle') parts.push(pPart(PG.bundle(), pick(['#c9a070', '#8a6a48', '#b5452a']), 0, 0.5, -0.11));
    const g = new THREE.Group();
    const body = new THREE.Mesh(pMerge(parts), personMat);
    body.castShadow = true;
    g.add(body);
    // limbs on pivots: shoulders and hips
    const limb = (geoms, x, y) => {
      const pv = new THREE.Group();
      pv.position.set(x, y, 0);
      const m = new THREE.Mesh(pMerge(geoms), personMat);
      m.castShadow = true;
      pv.add(m);
      g.add(pv);
      return pv;
    };
    // the arms hang a little away from the body (+x is the figure's left)
    const armL = limb([pPart(PG.arm(), sleeve, 0, 0, 0, 0, 0, 0.12), pPart(PG.hand(), skin, 0.026, -0.22, 0)].concat(carry === 'staff' ? [pPart(PG.staff(), '#6b4426', 0.03, -0.12, 0.02)] : []), 0.122, 0.575);
    const armR = limb([pPart(PG.arm(), sleeve, 0, 0, 0, 0, 0, -0.12), pPart(PG.hand(), skin, -0.026, -0.22, 0)].concat(carry === 'basket' ? [pPart(PG.basket(), '#b08850', -0.03, -0.27, 0.02)] : []), -0.122, 0.575);
    const legL = limb([pPart(PG.leg(), trousers), pPart(PG.foot(), '#3a2414', 0, -0.215, 0.018)], 0.05, 0.25);
    const legR = limb([pPart(PG.leg(), trousers), pPart(PG.foot(), '#3a2414', 0, -0.215, 0.018)], -0.05, 0.25);
    g.userData.limbs = { armL, armR, legL, legR };
    g.userData.ph = r() * 6.28;
    g.userData.jar = carry === 'jar';
    const s = (o.scale || 1) * (o.child ? 0.68 : 0.94 + r() * 0.12);
    g.scale.setScalar(s);
    return g;
  };
  // walk (stride with arms in counter-swing), work (arms busy in front) or idle (a little sway)
  A.animPerson = (o, t, mode = 'walk', speed = 1) => {
    const L = o.userData.limbs;
    if (!L) return;
    const ph = o.userData.ph || 0;
    if (mode === 'walk') {
      const s = Math.sin(t * 7.5 * speed + ph), a = 0.42 * Math.min(1.2, speed);
      L.legL.rotation.x = s * a; L.legR.rotation.x = -s * a;
      L.armL.rotation.x = -s * a * 0.9; L.armR.rotation.x = o.userData.jar ? -2.7 : s * a * 0.9;
    } else if (mode === 'work') {
      const s = Math.sin(t * 3.2 + ph);
      L.legL.rotation.x = L.legR.rotation.x = 0;
      L.armL.rotation.x = -0.95 + s * 0.45; L.armR.rotation.x = -0.95 - s * 0.45;
    } else {
      const s = Math.sin(t * 1.3 + ph);
      L.legL.rotation.x = L.legR.rotation.x = 0;
      L.armL.rotation.x = s * 0.06; L.armR.rotation.x = o.userData.jar ? -2.7 : -s * 0.06;
    }
  };
  A.camel = (seed = 1, o = {}) => {
    const r = seeded(seed * 17 + 9);
    const fur = mat(o.fur || (r() < 0.5 ? P.fur : '#b8844e'), { flat: true }), furD = mat(P.furD, { flat: true });
    const g = new THREE.Group();
    const body = sph(0.32, fur, 0, 1.0, 0, 10); body.scale.set(1.7, 1, 0.95); g.add(body);
    const hump = sph(0.24, fur, -0.05, 1.27, 0, 8); hump.scale.set(1.2, 1, 1); g.add(hump);
    g.add(rod(new V3(0.42, 1.0, 0), new V3(0.7, 1.45, 0), 0.085, fur));
    const head = sph(0.11, fur, 0.8, 1.5, 0, 8); head.scale.set(1.9, 1, 0.9); g.add(head);
    g.add(cone(0.035, 0.08, furD, 0.72, 1.58, 0.06, 4), cone(0.035, 0.08, furD, 0.72, 1.58, -0.06, 4));
    const blanket = box(0.6, 0.06, 0.66, mat(o.cloth || P.cloth1, { map: tex.stripes(o.cloth || P.cloth1, P.cloth2, 6) }), -0.05, 1.18, 0);
    g.add(blanket);
    if (o.load) { g.add(box(0.26, 0.26, 0.2, mat(P.rope), -0.05, 1.05, 0.38), box(0.26, 0.26, 0.2, mat(P.rope), -0.05, 1.05, -0.38)); }
    const legs = [];
    for (const [x, z] of [[0.36, 0.14], [0.36, -0.14], [-0.38, 0.14], [-0.38, -0.14]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.95, z);
      pivot.userData.dyn = true;
      const leg = cyl(0.045, 0.035, 0.95, furD, 0, -0.95, 0, 5);
      pivot.add(leg);
      g.add(pivot);
      legs.push(pivot);
    }
    g.userData.legs = legs;
    g.userData.head = head;
    g.add(rod(new V3(-0.52, 1.05, 0), new V3(-0.62, 0.7, 0), 0.02, furD));
    return g;
  };
  A.walkCamel = (c, t, speed) => {
    const legs = c.userData.legs || [];
    legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 5 * speed + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 * Math.min(1, speed); });
  };
  // a cloth banner on a pole; returns { g, update(t) } with a waving cloth
  A.banner = (color, h = 2.2, w = 0.7, d = 0.45, opts = {}) => {
    const g = new THREE.Group();
    g.add(cyl(0.035, 0.04, h, mat(P.woodD), 0, 0, 0, 6));
    g.add(sph(0.06, mat(P.gold, { r: 0.4, m: 0.6 }), 0, h + 0.04, 0, 6));
    const cg = new THREE.PlaneGeometry(w, d, 8, 2);
    cg.translate(w / 2 + 0.03, h - d / 2 - 0.05, 0);
    const cm = new THREE.Mesh(cg, mat(color, { ds: true, map: opts.map || null }));
    cm.castShadow = true;
    cm.userData.dyn = true;
    g.add(cm);
    const base = cg.attributes.position.array.slice();
    const seed = Math.random() * 10;
    g.userData.update = (t, wind = 1) => {
      const p = cg.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3] - 0.03;
        p.setZ(i, Math.sin(t * 4 * (0.6 + wind * 0.5) - x * 5 + seed) * 0.09 * x * (0.5 + wind));
      }
      p.needsUpdate = true;
      cg.computeVertexNormals();
    };
    return g;
  };

  // ======================================================================
  // Architecture
  // ======================================================================
  // plaster or mudbrick walls that tint with their colour; wood with grain
  const wallMat = (c, brick) => mat(c, { map: brick ? tex.brick : tex.plaster });
  const woodMat = (c = P.wood) => mat(c, { map: tex.wood });
  A.wallMat = wallMat; A.woodMat = woodMat;
  // things that live on a flat roof: jars, a rug over the parapet, a sunshade, potted plants, washing
  function roofLife(g, w, h, d, r, n) {
    const picks = ['jars', 'rug', 'shade', 'plant', 'wash'].sort(() => r() - 0.5).slice(0, n);
    const top = h + 0.02;
    for (const k of picks) {
      if (k === 'jars') for (let i = 0; i < 2; i++) g.add(at(A.jar(0.55 + r() * 0.25, ['#b0603a', '#9a4a2a', '#c9884a'][i]), -w / 2 + 0.3 + r() * (w - 0.6), top, -d / 2 + 0.25 + r() * 0.25));
      if (k === 'rug') g.add(box(0.46, 0.38, 0.015, mat('#ffffff', { map: tex.kilim }), -w / 4 + r() * (w / 2), h - 0.3, d / 2 + 0.02));
      if (k === 'shade') {
        const cw = Math.min(0.9, w * 0.55), cd = Math.min(0.7, d * 0.5), sx = -w / 2 + cw / 2 + 0.1, sz = -d / 2 + cd / 2 + 0.1, pole = mat(P.woodD);
        for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(cyl(0.018, 0.018, 0.5, pole, sx + (px * cw) / 2, top, sz + (pz * cd) / 2, 4));
        const cloth = box(cw + 0.06, 0.02, cd + 0.06, mat('#ffffff', { map: tex.stripes(['#b5452a', '#2f7f9a', '#c98a2a', '#7a3f8a'][Math.floor(r() * 4)], P.cloth2, 6), ds: true }), sx, top + 0.5, sz);
        cloth.rotation.z = 0.05;
        g.add(cloth);
      }
      if (k === 'plant') for (let i = 0; i < 2; i++) {
        const x = w / 2 - 0.22 - i * 0.28, z = d / 2 - 0.2;
        g.add(cyl(0.08, 0.06, 0.13, mat('#a0583a', { flat: true }), x, top, z, 7), sph(0.12, mat(i ? '#d84a8a' : P.green, { flat: true }), x, top + 0.2, z, 6));
      }
      if (k === 'wash') {
        const pole = mat(P.woodD), z = -d / 2 + 0.2, x0 = -w / 2 + 0.12, x1 = w / 2 - 0.12;
        g.add(cyl(0.015, 0.015, 0.45, pole, x0, top, z, 4), cyl(0.015, 0.015, 0.45, pole, x1, top, z, 4));
        g.add(rod(new V3(x0, top + 0.42, z), new V3(x1, top + 0.42, z), 0.006, mat(P.rope)));
        const cols = ['#f1e6d2', '#2f7f9a', '#c8553d', '#e8b54a'];
        for (let i = 0; i < 3; i++) g.add(box(0.16, 0.2, 0.01, mat(cols[(i + Math.floor(r() * 4)) % 4], { ds: true }), x0 + ((i + 1) * (x1 - x0)) / 4, top + 0.22, z));
      }
    }
  }
  A.roofLife = roofLife;
  function house(w, h, d, o = {}) {
    const g = new THREE.Group(), r = seeded((o.seed || 1) * 37 + Math.round(w * 100 + h * 10 + d * 3));
    const wall = wallMat(o.wall || P.adobe, o.brick), trim = mat(o.trim || P.adobeL, { map: tex.plaster }), wood = woodMat(P.woodD), door = woodMat(P.door);
    g.add(boxT(w, h, d, wall, 0, 0, 0, 1.2));
    // a stone plinth along the foot of the walls
    g.add(boxT(w + 0.05, 0.12, d + 0.05, mat(P.stoneD, { map: tex.ashlar }), 0, 0, 0, 0.8));
    const p = 0.1, ph = 0.16;
    g.add(box(w + 0.04, ph, p, trim, 0, h, d / 2 - p / 2), box(w + 0.04, ph, p, trim, 0, h, -d / 2 + p / 2));
    g.add(box(p, ph, d, trim, w / 2 - p / 2, h, 0), box(p, ph, d, trim, -w / 2 + p / 2, h, 0));
    g.add(box(w - 0.2, 0.03, d - 0.2, mat(P.adobeD), 0, h - 0.02, 0));
    // sawtooth merlons along the front of some roofs, as in the old Najd towns
    if (o.merlons != null ? o.merlons : r() < 0.45) for (let x = -w / 2 + 0.11; x < w / 2 - 0.06; x += 0.2) g.add(cone(0.065, 0.13, trim, x, h + ph, d / 2 - 0.05, 4));
    const nv = Math.max(2, Math.round(w / 0.42));
    for (let i = 0; i < nv; i++) g.add(beamZ(0.035, 0.3, wood, -w / 2 + ((i + 0.5) * w) / nv, h - 0.16, d / 2 + 0.1));
    const dx = o.doorX || 0;
    if (!o.noDoor) {
      // a carved frame, a planked door and a step
      g.add(box(0.44, 0.58, 0.03, trim, dx, 0, d / 2 + 0.005), arch(0.22, 0.03, trim, dx, 0.58, d / 2 + 0.005));
      g.add(box(0.32, 0.5, 0.05, door, dx, 0, d / 2 + 0.02), arch(0.16, 0.05, door, dx, 0.5, d / 2 + 0.02));
      g.add(box(0.5, 0.05, 0.16, mat(P.stone, { flat: true }), dx, 0, d / 2 + 0.08));
      if (r() < 0.5) g.add(rod(new V3(dx + 0.28, 0.66, d / 2), new V3(dx + 0.28, 0.66, d / 2 + 0.09), 0.012, mat(P.woodD)), sph(0.045, A.lamp, dx + 0.28, 0.6, d / 2 + 0.1, 6));
    }
    if (w > 1.05) {
      const wy = h * 0.5;
      for (const s of [-1, 1]) {
        const x = dx + s * w * 0.3;
        g.add(box(0.18, 0.22, 0.04, A.glowLattice, x, wy, d / 2 + 0.02), arch(0.09, 0.04, A.glowLattice, x, wy + 0.22, d / 2 + 0.02));
        g.add(box(0.26, 0.03, 0.08, wood, x, wy - 0.03, d / 2 + 0.04));
      }
    }
    if (o.side) { g.add(box(0.04, 0.22, 0.18, A.glowLattice, w / 2 + 0.02, h * 0.5, 0), box(0.08, 0.03, 0.26, wood, w / 2 + 0.04, h * 0.5 - 0.03, 0)); }
    if (!o.plain) roofLife(g, w, h, d, r, w > 1.15 ? 2 : 1);
    return g;
  }
  A.house = house;
  // a dome's material: blue domes are tiled in zellige, the rest are plastered
  const domeMat = (c) => (c === P.tile || c === P.tileL ? mat('#ffffff', { map: texRep(tex.zellige, 6, 3), r: 0.45 }) : mat(c, { map: tex.plaster }));
  A.domeMat = domeMat;
  function domedHouse(r, h, color, domeColor) {
    const g = new THREE.Group();
    g.add(cylT(r, r * 1.04, h, wallMat(color), 0, 0, 0, 14, 1.2));
    g.add(cyl(r * 1.06, r * 1.06, 0.08, mat(P.adobeL, { map: tex.plaster }), 0, h - 0.04, 0, 14));
    g.add(dome(r * 1.02, domeMat(domeColor), 0, h, 0, 16));
    g.add(sph(0.06, mat(P.gold, { r: 0.35, m: 0.6 }), 0, h + r * 1.02, 0, 6));
    g.add(box(0.3, 0.46, 0.06, mat(P.door), 0, 0, r * 0.99));
    g.add(arch(0.15, 0.06, mat(P.door), 0, 0.46, r * 0.99));
    return g;
  }
  function crenels(w, d, h, m, step = 0.32) {
    const g = new THREE.Group();
    for (let x = -w / 2 + step / 2; x < w / 2; x += step) { g.add(box(0.14, 0.18, 0.14, m, x, h, d / 2 - 0.07)); g.add(box(0.14, 0.18, 0.14, m, x, h, -d / 2 + 0.07)); }
    for (let z = -d / 2 + step * 1.5; z < d / 2 - step; z += step) { g.add(box(0.14, 0.18, 0.14, m, w / 2 - 0.07, h, z)); g.add(box(0.14, 0.18, 0.14, m, -w / 2 + 0.07, h, z)); }
    return g;
  }
  function awning(w, d, color, y, z) {
    const a = box(w, 0.04, d, mat(color, { map: tex.stripes(color, P.cloth2, 6) }), 0, y, z + d / 2);
    a.rotation.x = 0.28;
    const g = grp(a, rod(new V3(-w / 2 + 0.05, 0, z + d), new V3(-w / 2 + 0.05, y - 0.06, z + d), 0.025, mat(P.woodD)), rod(new V3(w / 2 - 0.05, 0, z + d), new V3(w / 2 - 0.05, y - 0.06, z + d), 0.025, mat(P.woodD)));
    return g;
  }
  function cratePile(n, seed) {
    const g = new THREE.Group(), r = seeded(seed), m = mat('#9a6a3a', { flat: true });
    for (let i = 0; i < n; i++) { const s = 0.22 + r() * 0.1; const b = box(s, s, s, m, (r() - 0.5) * 0.7, i > 2 ? s : 0, (r() - 0.5) * 0.7); b.rotation.y = r(); g.add(b); }
    return g;
  }
  function scaffold(w, h) {
    const g = new THREE.Group(), m = mat('#a87a48', { flat: true });
    for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) g.add(cyl(0.035, 0.035, h, m, x, 0, z, 5));
    for (const y of [h * 0.45, h * 0.9]) {
      g.add(box(w, 0.05, 0.05, m, 0, y, w / 2), box(w, 0.05, 0.05, m, 0, y, -w / 2), box(0.05, 0.05, w, m, w / 2, y, 0), box(0.05, 0.05, w, m, -w / 2, y, 0));
      g.add(box(w, 0.03, 0.35, mat('#c9a070'), 0, y + 0.03, w / 2 - 0.1));
    }
    g.add(rod(new V3(-w / 2, 0, w / 2), new V3(w / 2, h * 0.9, w / 2), 0.025, m));
    g.add(at(cratePile(4, 3), w * 0.75, 0, w * 0.4));
    return g;
  }
  A.scaffold = scaffold;
  A.fence = (w) => {
    const g = new THREE.Group(), m = mat(P.woodD), rope = mat(P.rope);
    for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) g.add(cyl(0.04, 0.05, 0.5, m, x, 0, z, 5));
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
      g.add(rod(new V3((a[0] * w) / 2, 0.38, (a[1] * w) / 2), new V3((b[0] * w) / 2, 0.38, (b[1] * w) / 2), 0.018, rope));
    }
    return bake(g);
  };
  A.foundation = (w) => {
    const g = new THREE.Group(), m = mat('#c9a070', { flat: true });
    for (let i = 0; i < 4; i++) {
      const s = box(w, 0.08, 0.16, m, 0, 0, w / 2);
      const pv = grp(s);
      pv.rotation.y = (i * Math.PI) / 2;
      g.add(pv);
    }
    for (const x of [-w / 2, w / 2]) for (const z of [-w / 2, w / 2]) {
      g.add(cyl(0.03, 0.03, 0.4, mat(P.wood), x, 0, z, 4));
      const f = box(0.16, 0.1, 0.01, mat(P.cloth1, { ds: true }), x + 0.08, 0.3, z);
      g.add(f);
    }
    return bake(g);
  };

  // Building models by type and detail tier (1: Lv 1-3, 2: Lv 4-7, 3: Lv 8+).
  // Returns a group (static parts baked) whose userData.update(t, wind) animates the rest.
  const B = {};
  B.shelter = (tier, g, U) => {
    g.add(at(house(1.6, 1.2, 1.4, { side: true }), -0.8, 0, 0.35, 0.1));
    g.add(at(house(1.25, 0.95, 1.2, { wall: P.adobeL, trim: P.plaster }), 0.95, 0, -0.55, -0.15));
    g.add(at(awning(1.0, 0.5, P.cloth3, 0.75, 0.7), -0.8, 0, 0, 0.1));
    g.add(at(A.jar(0.9), 0.3, 0, 0.95), at(A.jar(0.7, '#9a4a2a'), 0.55, 0, 1.05));
    if (tier >= 2) {
      g.add(at(house(1.3, 1.0, 1.2, { wall: P.adobeD }), 1.1, 0, 0.95, -0.3));
      g.add(at(house(0.9, 0.7, 0.8, { noDoor: true, wall: P.adobe }), 1.05, 1.0, 0.85, -0.3));
      const lad = grp(rod(new V3(0, 0, 0), new V3(0, 1.1, -0.25), 0.02, mat(P.wood)), rod(new V3(0.2, 0, 0), new V3(0.2, 1.1, -0.25), 0.02, mat(P.wood)));
      g.add(at(lad, 0.35, 0, 1.6, -0.3));
    }
    if (tier >= 3) {
      g.add(at(domedHouse(0.62, 0.95, P.plaster, P.white), -0.9, 0, -0.95));
      const sail = box(1.4, 0.03, 1.0, mat('#f0e2c4', { ds: true }), 0, 1.55, 0);
      sail.rotation.z = 0.12;
      g.add(at(grp(sail, cyl(0.03, 0.03, 1.6, mat(P.woodD), -0.65, 0, 0.45, 5), cyl(0.03, 0.03, 1.6, mat(P.woodD), 0.65, 0, -0.45, 5)), 0.1, 0, 0.1));
    }
  };
  B.quarry = (tier, g, U) => {
    const stone = mat(P.sandstone, { flat: true }), stoneD = mat('#b8844e', { flat: true });
    const steps = tier >= 3 ? 4 : tier >= 2 ? 3 : 2;
    for (let i = 0; i < steps; i++) g.add(box(2.6 - i * 0.45, 0.55, 1.4 - i * 0.18, i % 2 ? stoneD : stone, -0.1 + i * 0.12, i * 0.55, -0.9 - i * 0.1));
    const blocks = mat('#e0b47a', { flat: true });
    for (let i = 0; i < 3 + tier; i++) {
      const b = box(0.42, 0.3, 0.3, blocks, 0.6 + (i % 3) * 0.46 - 0.4, Math.floor(i / 3) * 0.3, 0.75 - Math.floor(i / 3) * 0.1);
      b.rotation.y = (i % 2) * 0.08;
      g.add(b);
    }
    // timber crane with a swinging block
    const crane = new THREE.Group();
    crane.userData.dyn = true;
    const wood = mat(P.wood, { flat: true });
    crane.add(rod(new V3(-0.25, 0, 0), new V3(0, 2.1, 0), 0.05, wood), rod(new V3(0.25, 0, 0), new V3(0, 2.1, 0), 0.05, wood));
    crane.add(rod(new V3(0, 2.0, -0.2), new V3(0, 2.3, 1.3), 0.04, wood));
    const hook = new THREE.Group();
    hook.position.set(0, 2.25, 1.15);
    hook.add(rod(new V3(0, 0, 0), new V3(0, -0.9, 0), 0.01, mat(P.rope)));
    hook.add(box(0.32, 0.24, 0.24, blocks, 0, -1.15, 0));
    crane.add(hook);
    crane.position.set(-1.0, 0, 0.3);
    g.add(crane);
    U.push((t) => { crane.rotation.y = Math.sin(t * 0.35) * 0.7; hook.rotation.x = Math.sin(t * 1.4) * 0.06; });
    g.add(at(A.rock(0.35, 2, '#c99a62'), 1.2, 0.1, -0.1));
    if (tier >= 2) g.add(at(cratePile(3, 9), 1.25, 0, 1.1));
  };
  B.grove = (tier, g, U) => {
    const soil = mat('#7a5034', { flat: true }), crop = mat(P.green, { flat: true }), cropD = mat(P.greenD, { flat: true });
    for (let i = 0; i < 2 + (tier >= 2 ? 1 : 0); i++) {
      g.add(box(1.8, 0.08, 0.4, soil, 0.2, 0, 0.9 - i * 0.55));
      for (let k = 0; k < 6; k++) g.add(cone(0.1, 0.22, k % 2 ? crop : cropD, -0.55 + k * 0.3, 0.06, 0.9 - i * 0.55, 5));
    }
    const ch = new THREE.Mesh(geo('chan', () => new THREE.PlaneGeometry(0.22, 2.4).rotateX(-Math.PI / 2)), A.waterMat({ scale: 2.5 }));
    ch.position.set(-0.95, 0.05, 0.1);
    ch.userData.keep = true;
    g.add(ch, box(0.06, 0.1, 2.4, mat(P.stone), -1.1, 0, 0.1), box(0.06, 0.1, 2.4, mat(P.stone), -0.8, 0, 0.1));
    const palms = [[-0.6, -0.9, 2.4], [0.5, -1.1, 2.9], [1.3, -0.4, 2.2]];
    if (tier >= 2) palms.push([1.4, 0.8, 2.6]);
    if (tier >= 3) palms.push([-1.5, -0.6, 3.1], [0.1, -0.3, 2.0]);
    palms.forEach(([x, z, h], i) => { const p = A.palm(h, i + 3); p.position.set(x, 0, z); g.add(p); U.push((t, w) => A.swayPalm(p, t, w)); });
    g.add(at(A.jar(0.8, '#b0603a'), -1.3, 0, 1.2));
  };
  B.well = (tier, g, U) => {
    const stone = mat(P.stone, { flat: true });
    g.add(cyl(0.62, 0.68, 0.62, stone, 0, 0, 0, 14));
    g.add(cyl(0.66, 0.66, 0.08, mat(P.sandstone), 0, 0.6, 0, 14));
    const wsurf = new THREE.Mesh(geo('wsurf', () => new THREE.CircleGeometry(0.52, 20).rotateX(-Math.PI / 2)), A.waterMat({ radial: true, scale: 3 }));
    wsurf.position.y = 0.5;
    wsurf.userData.keep = true;
    g.add(wsurf);
    const wood = mat(P.wood, { flat: true });
    g.add(cyl(0.05, 0.05, 1.5, wood, -0.6, 0, 0, 6), cyl(0.05, 0.05, 1.5, wood, 0.6, 0, 0, 6));
    g.add(at(grp(mesh(geo('axle', () => new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8).rotateZ(Math.PI / 2)), wood)), 0, 1.45, 0));
    const bucket = new THREE.Group();
    bucket.userData.dyn = true;
    bucket.add(rod(new V3(0, 0, 0), new V3(0, 0.6, 0), 0.01, mat(P.rope)));
    bucket.add(cyl(0.11, 0.09, 0.16, mat('#7a5634'), 0, -0.16, 0, 8));
    bucket.position.set(0.1, 0.85, 0);
    g.add(bucket);
    U.push((t) => { bucket.position.y = 0.85 + Math.sin(t * 0.9) * 0.28; });
    // stone cistern
    g.add(box(1.1, 0.4, 0.75, stone, 0.2, 0, 1.0));
    const cw = new THREE.Mesh(geo('cist', () => new THREE.PlaneGeometry(0.95, 0.6).rotateX(-Math.PI / 2)), A.waterMat({ scale: 3 }));
    cw.position.set(0.2, 0.36, 1.0);
    cw.userData.keep = true;
    g.add(cw);
    g.add(at(A.jar(0.75), -0.7, 0, 1.0), at(A.jar(0.65, '#9a4a2a'), -0.95, 0, 0.75));
    if (tier >= 2) {
      // shaduf: a counterweighted lever for lifting water
      const post = cyl(0.06, 0.07, 1.2, wood, 1.2, 0, -0.6, 6);
      g.add(post);
      const lever = new THREE.Group();
      lever.userData.dyn = true;
      lever.position.set(1.2, 1.2, -0.6);
      lever.add(mesh(geo('lev', () => new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6).rotateZ(Math.PI / 2)), wood));
      lever.add(sph(0.18, stone, -1.1, 0, 0, 6));
      lever.add(rod(new V3(1.15, 0, 0), new V3(1.15, -0.6, 0), 0.01, mat(P.rope)));
      lever.add(cyl(0.09, 0.07, 0.14, mat('#7a5634'), 1.15, -0.74, 0, 8));
      g.add(lever);
      U.push((t) => { lever.rotation.z = Math.sin(t * 0.7) * 0.32; });
    }
    if (tier >= 3) {
      const tw = new THREE.Group();
      for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) tw.add(cyl(0.05, 0.06, 1.6, wood, x, 0, z, 5));
      tw.add(cyl(0.62, 0.62, 0.8, mat('#9a6a3a', { flat: true }), 0, 1.6, 0, 12));
      tw.add(cone(0.68, 0.35, mat(P.adobeD, { flat: true }), 0, 2.4, 0, 12));
      tw.add(cyl(0.64, 0.64, 0.06, mat(P.copper, { r: 0.4, m: 0.5 }), 0, 1.85, 0, 12));
      g.add(at(tw, -1.25, 0, -0.75));
    }
  };
  B.mine = (tier, g, U) => {
    const rockM = mat('#a8714a', { flat: true });
    const hill = mesh(rockGeo(4, 1.6), rockM);
    hill.scale.set(1.3, tier >= 2 ? 1.25 : 1.0, 1.0);
    hill.position.set(0, 0.5, -0.8);
    g.add(hill);
    g.add(at(A.rock(0.6, 1, '#9a6440'), 1.3, 0.2, -0.3), at(A.rock(0.5, 3, '#b07a50'), -1.4, 0.15, -0.2));
    const dark = mat('#140a05');
    g.add(at(grp(mesh(geo('tun', () => new THREE.CylinderGeometry(0.42, 0.42, 0.4, 12, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2)), dark)), 0, 0.55, 0.15));
    g.add(box(0.84, 0.55, 0.4, dark, 0, 0, -0.05));
    const tim = mat(P.wood, { flat: true });
    g.add(box(0.1, 1.05, 0.1, tim, -0.48, 0, 0.3), box(0.1, 1.05, 0.1, tim, 0.48, 0, 0.3), box(1.15, 0.12, 0.14, tim, 0, 1.0, 0.3));
    g.add(box(0.08, 0.04, 1.6, mat('#6a6a6a', { m: 0.5, r: 0.5 }), -0.2, 0, 1.0), box(0.08, 0.04, 1.6, mat('#6a6a6a', { m: 0.5, r: 0.5 }), 0.2, 0, 1.0));
    for (let i = 0; i < 6; i++) g.add(box(0.6, 0.03, 0.1, tim, 0, 0, 0.35 + i * 0.26));
    const cart = grp(box(0.5, 0.3, 0.6, mat('#5a4030', { flat: true }), 0, 0.1, 0));
    const ore = mat(P.copper, { flat: true, r: 0.5, m: 0.4 }), pat = mat(P.patina, { flat: true });
    for (let i = 0; i < 5; i++) cart.add(at(A.rock(0.12, i, i % 2 ? P.copper : P.patina), (i % 3 - 1) * 0.14, 0.44, (i % 2 - 0.5) * 0.2));
    for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) cart.add(mesh(geo('whl', () => new THREE.CylinderGeometry(0.08, 0.08, 0.04, 10).rotateZ(Math.PI / 2)), mat('#333')).translateX(x).translateY(0.08).translateZ(z));
    g.add(at(cart, 0, 0, 1.25));
    g.add(at(A.rock(0.28, 2, P.copper), 0.9, 0.05, 1.0), at(A.rock(0.22, 5, P.patina), 1.15, 0.05, 1.25), at(A.rock(0.18, 3, P.copper), 0.75, 0.05, 1.35));
    const lantern = sph(0.07, A.lamp, 0.62, 0.85, 0.42, 8);
    g.add(lantern);
    if (tier >= 3) {
      const hf = new THREE.Group();
      hf.add(rod(new V3(-0.4, 0, 0), new V3(0, 2.4, 0), 0.05, tim), rod(new V3(0.4, 0, 0), new V3(0, 2.4, 0), 0.05, tim), rod(new V3(0, 0, 0.5), new V3(0, 2.4, 0), 0.05, tim));
      const wheel = new THREE.Group();
      wheel.userData.dyn = true;
      wheel.position.set(0, 2.45, 0);
      wheel.add(mesh(geo('hw', () => new THREE.TorusGeometry(0.32, 0.03, 6, 16)), tim));
      for (let i = 0; i < 4; i++) { const sp = box(0.03, 0.62, 0.03, tim, 0, -0.31, 0); sp.rotation.z = (i * Math.PI) / 4; wheel.add(sp); }
      hf.add(wheel);
      g.add(at(hf, -1.25, 0, 0.6));
      U.push((t) => { wheel.rotation.z = t * 0.8; });
    }
    void ore; void pat;
  };
  B.infirmary = (tier, g, U) => {
    g.add(at(house(1.8, 1.15, 1.4, { wall: P.white, trim: '#e0d2b8', side: true }), 0, 0, 0));
    g.add(at(grp(cyl(0.45, 0.45, 0.25, mat(P.white), 0, 0, 0, 14), dome(0.47, mat('#4fa89a', { r: 0.5 }), 0, 0.25, 0, 16), sph(0.05, mat(P.gold, { m: 0.6, r: 0.35 }), 0, 0.74, 0, 6)), 0, 1.15, 0));
    g.add(at(awning(1.2, 0.5, '#4fa89a', 0.85, 0.7), 0, 0, 0));
    const pot = mat('#a0583a', { flat: true }), herb = mat('#5aa04a', { flat: true });
    for (let i = 0; i < 3; i++) g.add(cyl(0.12, 0.09, 0.2, pot, -1.25 + i * 0.32, 0, 1.0, 7), sph(0.15, herb, -1.25 + i * 0.32, 0.3, 1.0, 6));
    const b = A.banner('#4fa89a', 1.9, 0.5, 0.36);
    b.position.set(1.15, 0, 0.7);
    g.add(b);
    U.push((t, w) => b.userData.update(t, w));
    if (tier >= 2) g.add(at(house(1.1, 0.9, 1.0, { wall: P.white, trim: '#e0d2b8' }), -1.35, 0, -0.6, 0.2));
    if (tier >= 3) {
      for (let i = 0; i < 4; i++) g.add(cyl(0.06, 0.06, 0.9, mat(P.white), -0.75 + i * 0.5, 0, 1.25, 8));
      g.add(box(1.9, 0.1, 0.3, mat(P.white), 0, 0.9, 1.25));
    }
  };
  B.barracks = (tier, g, U) => {
    const wall = mat(P.adobeD), top = mat(P.adobe);
    const W = 2.8, D = 2.4, h = 0.8;
    g.add(box(W, h, 0.2, wall, 0, 0, -D / 2), box(0.2, h, D, wall, -W / 2, 0, 0), box(0.2, h, D, wall, W / 2, 0, 0));
    g.add(box(1.0, h, 0.2, wall, -0.9, 0, D / 2), box(1.0, h, 0.2, wall, 0.9, 0, D / 2));
    g.add(crenels(W, D, h, top));
    g.add(at(house(1.6, 1.1, 1.0, { wall: P.adobe }), 0, 0, -0.55));
    const spear = mat('#6b4426'), tip = mat('#d0d8de', { m: 0.7, r: 0.3 });
    for (let i = 0; i < 4; i++) { const x = -1.05 + i * 0.16; g.add(cyl(0.015, 0.015, 1.1, spear, x, 0, 0.55, 4), cone(0.03, 0.12, tip, x, 1.1, 0.55, 4)); }
    g.add(box(0.7, 0.06, 0.08, mat(P.woodD), -0.8, 0.7, 0.55));
    // training dummy
    g.add(cyl(0.04, 0.04, 0.9, mat(P.woodD), 0.8, 0, 0.6, 5), sph(0.17, mat('#c9a070', { flat: true }), 0.8, 0.95, 0.6, 7), box(0.6, 0.06, 0.06, mat(P.woodD), 0.8, 0.65, 0.6));
    const b = A.banner(P.cloth1, 2.6, 0.75, 0.5, { map: tex.stripes(P.cloth1, '#e8b54a', 4) });
    b.position.set(W / 2 - 0.1, 0, D / 2 - 0.1);
    g.add(b);
    U.push((t, w) => b.userData.update(t, w));
    if (tier >= 2) {
      for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2]]) {
        g.add(cyl(0.32, 0.36, 1.4, wall, x, 0, z, 8));
        g.add(cone(0.4, 0.4, mat(P.cloth1, { flat: true }), x, 1.4, z, 8));
      }
    }
    if (tier >= 3) for (const [x, z] of [[-W / 2, D / 2], [W / 2, D / 2]]) { g.add(cyl(0.32, 0.36, 1.4, wall, x, 0, z, 8)); g.add(cone(0.4, 0.4, mat(P.cloth1, { flat: true }), x, 1.4, z, 8)); }
  };
  B.watchtower = (tier, g, U) => {
    const H = tier >= 3 ? 4.3 : tier >= 2 ? 3.7 : 3.1;
    const wall = mat(P.adobe, { flat: true });
    const t = mesh(geo(`twr${H}`, () => new THREE.CylinderGeometry(0.62, 0.86, H, 4).rotateY(Math.PI / 4)), wall, 0, H / 2, 0);
    g.add(t);
    g.add(box(1.5, 0.16, 1.5, mat(P.adobeL), 0, H, 0));
    g.add(crenels(1.5, 1.5, H + 0.16, mat(P.adobeL), 0.36));
    for (let i = 0; i < 3; i++) g.add(box(0.14, 0.26, 0.05, A.glow, 0, 0.6 + i * (H / 3.4), 0.66 - i * 0.06));
    g.add(box(0.36, 0.55, 0.06, mat(P.door), 0, 0, 0.75), arch(0.18, 0.06, mat(P.door), 0, 0.55, 0.75));
    const posts = mat(P.woodD);
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) g.add(cyl(0.03, 0.03, 0.75, posts, x, H + 0.16, z, 4));
    const roof = cone(1.1, 0.5, mat(P.cloth2, { flat: true, map: tex.stripes(P.cloth2, P.cloth1, 8) }), 0, H + 0.9, 0, 8);
    g.add(roof);
    const mirror = new THREE.Group();
    mirror.userData.dyn = true;
    mirror.position.set(0, H + 0.45, 0);
    const disc = mesh(geo('mir', () => new THREE.CircleGeometry(0.18, 14)), new THREE.MeshStandardMaterial({ color: '#fff4d0', emissive: '#fff0c0', emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.15, side: THREE.DoubleSide }));
    disc.position.z = 0.35;
    mirror.add(disc);
    g.add(mirror);
    U.push((tt) => { mirror.rotation.y = Math.sin(tt * 0.5) * 1.2; disc.material.emissiveIntensity = 0.3 + Math.max(0, Math.sin(tt * 2.1)) ** 8 * 3; });
    const b = A.banner('#e8b54a', 0.9, 0.5, 0.3);
    b.position.set(0.55, H + 0.95, 0.55);
    g.add(b);
    U.push((tt, w) => b.userData.update(tt, w));
    if (tier >= 2) g.add(at(house(0.9, 0.7, 0.8, { wall: P.adobeL }), 0.95, 0, 0.6, -0.4));
  };
  B.archive = (tier, g, U) => {
    const wall = mat(P.plaster), tile = mat(P.tile, { r: 0.35, m: 0.15 });
    g.add(box(2.2, 1.3, 1.7, wall, 0, 0, 0));
    g.add(crenels(2.2, 1.7, 1.3, mat('#e0c08a'), 0.3));
    g.add(cyl(0.68, 0.7, 0.42, wall, 0, 1.3, 0, 16));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const w = box(0.1, 0.22, 0.05, A.glow, Math.sin(a) * 0.69, 1.38, Math.cos(a) * 0.69); w.rotation.y = a; g.add(w); }
    g.add(dome(0.72, tile, 0, 1.72, 0, 20));
    g.add(sph(0.08, mat(P.gold, { m: 0.7, r: 0.3 }), 0, 2.48, 0, 8), cone(0.04, 0.3, mat(P.gold, { m: 0.7, r: 0.3 }), 0, 2.5, 0, 6));
    g.add(box(0.5, 0.75, 0.08, mat(P.tile, { r: 0.4 }), 0, 0, 0.86), arch(0.25, 0.08, mat(P.tile, { r: 0.4 }), 0, 0.75, 0.86), box(0.34, 0.6, 0.09, mat(P.door), 0, 0, 0.87));
    for (const s of [-1, 1]) g.add(box(0.2, 0.32, 0.05, A.glow, s * 0.75, 0.55, 0.86), arch(0.1, 0.05, A.glow, s * 0.75, 0.87, 0.86));
    // armillary sphere on a side tower
    const tw = new THREE.Group();
    tw.add(cyl(0.3, 0.34, 1.9, wall, 0, 0, 0, 10), cyl(0.38, 0.38, 0.1, mat('#e0c08a'), 0, 1.9, 0, 10));
    const arm = new THREE.Group();
    arm.userData.dyn = true;
    arm.position.y = 2.35;
    const brass = mat(P.gold, { m: 0.8, r: 0.3 });
    const r1 = mesh(geo('ar1', () => new THREE.TorusGeometry(0.3, 0.02, 6, 24)), brass), r2 = mesh(geo('ar1', () => null), brass), r3 = mesh(geo('ar3', () => new THREE.TorusGeometry(0.24, 0.018, 6, 20)), brass);
    r2.rotation.y = Math.PI / 2; r3.rotation.x = Math.PI / 2;
    arm.add(r1, r2, r3, sph(0.07, mat(P.tileL, { r: 0.3 }), 0, 0, 0, 8));
    tw.add(arm);
    g.add(at(tw, 1.25, 0, -0.55));
    U.push((t) => { arm.rotation.y = t * 0.4; r1.rotation.x = t * 0.3; });
    if (tier >= 2) g.add(at(grp(cyl(0.3, 0.34, 1.6, wall, 0, 0, 0, 10), dome(0.32, tile, 0, 1.6, 0, 12)), -1.25, 0, -0.55));
    if (tier >= 3) g.add(at(house(1.0, 0.8, 0.9, { wall: P.plaster, trim: '#e0c08a' }), -1.2, 0, 0.75, 0.3));
  };
  B.hall = (tier, g, U) => {
    const R = tier >= 2 ? 1.55 : 1.3;
    const pole = mat(P.woodD);
    g.add(cyl(0.06, 0.06, 2.2, pole, 0, 0, 0, 6));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; g.add(cyl(0.04, 0.04, 1.0, pole, Math.cos(a) * R, 0, Math.sin(a) * R, 5)); }
    const canopy = mesh(geo(`can${R}`, () => new THREE.ConeGeometry(R * 1.12, 1.25, 12, 1, true)), mat(P.cloth1, { map: tex.stripes('#b5452a', '#f0d9a8', 12), ds: true, flat: true }), 0, 1.0 + 0.62, 0);
    g.add(canopy);
    const valance = mesh(geo(`val${R}`, () => new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.22, 12, 1, true)), mat('#e8b54a', { ds: true }), 0, 0.92, 0);
    g.add(valance);
    g.add(sph(0.09, mat(P.gold, { m: 0.7, r: 0.3 }), 0, 2.3, 0, 8));
    // carpet and cushions under the canopy
    g.add(box(R * 1.4, 0.03, R * 1.1, mat('#8a2a3a', { map: tex.stripes('#8a2a3a', '#c9a24a', 10) }), 0, 0, 0));
    g.add(cyl(0.16, 0.16, 0.12, mat(P.cloth3), -0.4, 0, 0.3, 8), cyl(0.16, 0.16, 0.12, mat(P.cloth4), 0.4, 0, 0.35, 8));
    for (const [i, x, z] of [[0, -1.0, -1.6], [1, 1.25, -1.35]]) {
      const b = A.banner(i ? P.cloth3 : '#e8b54a', 2.4, 0.6, 0.42);
      b.position.set(x, 0, z);
      g.add(b);
      U.push((t, w) => b.userData.update(t, w));
    }
    const cam = A.camel(4, { cloth: P.cloth3, load: true });
    cam.position.set(1.5, 0, 1.0);
    cam.rotation.y = -0.8;
    cam.scale.setScalar(0.8);
    g.add(cam);
    U.push((t) => { cam.userData.head.position.y = 1.5 + Math.sin(t * 0.8) * 0.04; });
    if (tier >= 3) {
      const t2 = mesh(geo('tent2', () => new THREE.ConeGeometry(0.75, 0.9, 8, 1, true)), mat(P.cloth3, { map: tex.stripes('#2f7f9a', '#f0d9a8', 8), ds: true, flat: true }), -1.5, 0.45, 0.9);
      g.add(t2);
      const cam2 = A.camel(7, { cloth: P.cloth1 });
      cam2.position.set(-0.4, 0, 1.75);
      cam2.rotation.y = 0.3;
      cam2.scale.setScalar(0.75);
      g.add(cam2);
    }
  };
  B.storehouse = (tier, g, U) => {
    const mud = mat(P.adobe, { flat: true });
    const granary = (s) => {
      const lg = geo(`gran`, () => new THREE.LatheGeometry([[0, 0], [0.55, 0], [0.6, 0.3], [0.58, 0.8], [0.45, 1.2], [0.25, 1.45], [0.08, 1.55], [0, 1.56]].map(([x, y]) => new THREE.Vector2(x, y)), 14));
      const o = grp(mesh(lg, mud), box(0.24, 0.3, 0.06, mat(P.door), 0, 0.7, 0.56), cyl(0.06, 0.06, 0.06, mat(P.woodD), 0, 1.55, 0, 6));
      o.scale.setScalar(s);
      return o;
    };
    g.add(at(granary(1.0), -0.6, 0, -0.4), at(granary(0.85), 0.75, 0, -0.6));
    if (tier >= 2) g.add(at(granary(0.75), 1.2, 0, 0.5));
    if (tier >= 3) g.add(at(granary(0.9), -1.35, 0, 0.55));
    g.add(box(2.6, 0.45, 0.16, mat(P.adobeD), 0, 0, 1.25));
    for (let i = 0; i < 5; i++) g.add(at(A.jar(0.95, i % 2 ? '#9a4a2a' : '#b0603a'), -0.9 + i * 0.36, 0, 0.75));
    g.add(at(cratePile(4, 12), 0.2, 0, 0.1));
  };
  // The Sunsteel Forge: a sandstone furnace with a living glow, anvil, ingots and smoke.
  B.forge = (tier, g, U) => {
    const stone = mat(P.sandstone, { flat: true }), stoneD = mat(P.stoneD, { flat: true }), iron = mat('#4a4a52', { m: 0.6, r: 0.45 });
    const glow = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff7a1a', emissiveIntensity: 1.6, roughness: 0.5 });
    const ingot = mat(P.gold, { m: 0.7, r: 0.3, e: '#a8641c', ei: 0.35 });
    // furnace: a squat drum with a dome and a glowing arched mouth
    g.add(cyl(0.95, 1.05, 1.1, stone, -0.2, 0, -0.45, 12));
    g.add(dome(0.98, stoneD, -0.2, 1.1, -0.45, 14));
    g.add(box(0.5, 0.42, 0.08, glow, -0.2, 0.18, 0.55), arch(0.25, 0.08, glow, -0.2, 0.6, 0.55));
    g.add(box(0.8, 0.12, 0.2, stoneD, -0.2, 0, 0.62));
    const chH = tier >= 2 ? 1.9 : 1.2;
    g.add(cyl(0.2, 0.26, chH, stoneD, -0.55, 1.4, -0.75, 8), cyl(0.27, 0.27, 0.12, stone, -0.55, 1.4 + chH, -0.75, 8));
    // anvil on a stump, ingots, quench trough
    g.add(cyl(0.2, 0.24, 0.42, mat(P.wood, { flat: true }), 0.95, 0, 0.55, 8));
    g.add(box(0.5, 0.14, 0.22, iron, 0.95, 0.42, 0.55), box(0.24, 0.12, 0.16, iron, 0.95, 0.56, 0.55), cone(0.08, 0.26, iron, 1.28, 0.6, 0.55, 4).rotateZ(-Math.PI / 2));
    for (let i = 0; i < 2 + tier; i++) g.add(box(0.26, 0.08, 0.12, ingot, 0.75 + (i % 3) * 0.18, Math.floor(i / 3) * 0.08, 1.15));
    g.add(box(0.9, 0.26, 0.38, mat(P.woodD, { flat: true }), -0.95, 0, 0.75), box(0.8, 0.02, 0.3, mat('#2f7f9a', { r: 0.15 }), -0.95, 0.24, 0.75));
    if (tier >= 2) {
      // bellows and an awning over the anvil, a rack of blades
      const bel = box(0.55, 0.12, 0.34, mat('#6a3a1e', { flat: true }), 0.55, 0.4, -0.35);
      bel.rotation.z = 0.25;
      g.add(bel, rod(new V3(0.3, 0.45, -0.35), new V3(-0.05, 0.4, -0.35), 0.03, iron));
      g.add(at(awning(1.3, 0.9, P.cloth1, 1.45, 0.05), 0.95, 0, 0));
      for (let i = 0; i < 3; i++) g.add(box(0.05, 0.75, 0.02, mat('#d8dde2', { m: 0.8, r: 0.25 }), 1.55, 0.2, 0.15 - i * 0.18));
      g.add(box(0.08, 0.06, 0.6, mat(P.woodD), 1.55, 0.78, -0.03));
    }
    if (tier >= 3) {
      // a crucible of molten Sunsteel and a banner
      const molten = new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb347', emissiveIntensity: 1.4, roughness: 0.3 });
      g.add(cyl(0.34, 0.26, 0.42, iron, 0.55, 0, -1.2, 10), cyl(0.3, 0.3, 0.03, molten, 0.55, 0.4, -1.2, 10));
      const b = A.banner('#e8b54a', 2.3, 0.6, 0.42, { map: tex.stripes('#e8b54a', P.cloth1, 4) });
      b.position.set(-1.25, 0, -1.1);
      g.add(b); U.push(b.userData.update);
      U.push((t) => { molten.emissiveIntensity = 1.2 + 0.35 * Math.sin(t * 2.3); });
    }
    // smoke puffs rising from the chimney
    const smokeM = new THREE.MeshStandardMaterial({ color: '#8a8078', transparent: true, opacity: 0.5, depthWrite: false, roughness: 1 });
    const puffs = new THREE.Group();
    puffs.userData.dyn = true;
    puffs.position.set(-0.55, 1.55 + chH, -0.75);
    for (let i = 0; i < 4; i++) puffs.add(sph(0.16, smokeM, 0, 0, 0, 7));
    g.add(puffs);
    U.push((t, wind = 1) => {
      glow.emissiveIntensity = 1.35 + 0.35 * Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1);
      puffs.children.forEach((p, i) => {
        const k = ((t * 0.35 + i / 4) % 1);
        p.position.set(k * 0.5 * wind, k * 1.4, k * 0.15);
        p.scale.setScalar(0.6 + k * 1.6);
      });
      smokeM.opacity = 0.45;
    });
  };
  // Mark where to draw the 2D label and how tall the building is (for overlay badges).
  const TOP = { shelter: 1.6, quarry: 2.4, grove: 3.0, well: 1.7, mine: 2.0, infirmary: 1.9, barracks: 1.9, watchtower: 4.2, archive: 2.6, hall: 2.3, storehouse: 1.7, forge: 2.4 };
  A.building = (type, tier, seed = 1) => {
    const g = new THREE.Group(), U = [];
    (B[type] || (() => g.add(box(1.5, 1, 1.5, mat(P.adobe)))))(tier, g, U, seed);
    bake(g);
    g.userData.update = (t, wind = 1) => { for (const f of U) f(t, wind); };
    g.userData.top = (TOP[type] || 2) + (type === 'watchtower' ? (tier - 1) * 0.6 : 0);
    return g;
  };
  A.tierOf = (L) => (L >= 8 ? 3 : L >= 4 ? 2 : 1);

  // ======================================================================
  // Particles: soft sprite points (mist, dust, sparkles)
  // ======================================================================
  A.particles = (n, o = {}) => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3), alpha = new Float32Array(n), size = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new Col(o.color || '#ffffff') }, uMap: { value: tex.dot }, uScale: { value: 300 }, uOpacity: { value: o.opacity == null ? 1 : o.opacity } },
      vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform sampler2D uMap; uniform float uOpacity; varying float vA;
        void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(uColor, t.a * vA * uOpacity); if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    const P2 = Array.from({ length: n }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, age: 1, s: 1, a: 1 }));
    pts.userData.list = P2;
    pts.userData.flush = () => {
      for (let i = 0; i < n; i++) {
        const p = P2[i];
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        const k = p.life > 0 ? clamp(p.age / p.life, 0, 1) : 1;
        alpha[i] = p.life > 0 ? p.a * Math.sin(Math.PI * k) : 0;
        size[i] = p.s * (0.6 + k * 0.8);
      }
      g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    };
    return pts;
  };

  // ======================================================================
  // The Rainwyrm: a serpentine water dragon. A skinned tube spine with belly plates and a fin
  // membrane down the back; a sculpted head with a hinged jaw, horns that sweep back and branch as
  // it grows, long barbels, ear frills and a crest; fan fins at the shoulders and a tail fan.
  // ======================================================================
  const SN = 96, RAD = 16, FM = 72; // spine rings, ring sides, back-fin segments
  // fin webbing: an opaque ray in the middle of each tile on a web that fades toward the tip (v = 1)
  tex.fin = canvasTex(64, 128, (g, w, h) => {
    const web = g.createLinearGradient(0, h, 0, 0);
    web.addColorStop(0, 'rgba(255,255,255,0.9)'); web.addColorStop(0.55, 'rgba(255,255,255,0.5)'); web.addColorStop(1, 'rgba(255,255,255,0.22)');
    g.fillStyle = web; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(205,215,225,1)'; g.fillRect(w / 2 - 4, 8, 8, h - 8);
    g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(w / 2 - 2, 8, 4, h - 8);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(0, 0, w, 3);
  });
  // a fan of rays in the YZ plane opening from the origin around `dir` (radians from +Y toward -Z)
  function fanGeo(key, spread, len, rays, dir = Math.PI / 2, scallop = 0.25) {
    return geo(`fan:${key}`, () => {
      const segs = rays * 4, rows = 3, pos = [], uv = [], idx = [];
      for (let a = 0; a <= segs; a++) {
        const f = a / segs, ang = dir - spread / 2 + f * spread;
        const k = Math.abs(Math.sin(f * rays * Math.PI));
        const R = len * (1 - scallop + scallop * Math.sqrt(k)) * (0.8 + 0.2 * Math.sin(f * Math.PI));
        for (let r = 0; r <= rows; r++) { const rr = (r / rows) * R; pos.push(0, Math.cos(ang) * rr, -Math.sin(ang) * rr); uv.push(f * rays, r / rows); }
      }
      for (let a = 0; a < segs; a++) for (let r = 0; r < rows; r++) { const i = a * (rows + 1) + r, j = i + rows + 1; idx.push(i, j, i + 1, i + 1, j, j + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  // a tube that tapers from r0 to r1 along a curve: horns, tines, barbels, legs and claws
  function taperGeo(key, pts, r0, r1, seg = 12, rad = 7) {
    return geo(`taper:${key}`, () => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(p[0], p[1], p[2])));
      const fr = curve.computeFrenetFrames(seg, false), pos = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, c = curve.getPointAt(u), r = lerp(r0, r1, Math.pow(u, 0.85));
        for (let j = 0; j <= rad; j++) {
          const a = (j / rad) * Math.PI * 2, nx = fr.normals[i].x * Math.cos(a) + fr.binormals[i].x * Math.sin(a);
          const ny = fr.normals[i].y * Math.cos(a) + fr.binormals[i].y * Math.sin(a), nz = fr.normals[i].z * Math.cos(a) + fr.binormals[i].z * Math.sin(a);
          pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r);
        }
      }
      for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    });
  }
  const mirror = (pts, s) => pts.map(([x, y, z]) => [x * s, y, z]);
  const gauss = (dx, dy, dz, s) => Math.exp(-(dx * dx + dy * dy + dz * dz) / (2 * s * s));
  // the skull, sculpted from a sphere in head units: +z is the snout (about 2.2 long), +y the brow
  function headGeo() {
    return geo('wyrmHead', () => {
      const g = new THREE.SphereGeometry(1, 48, 32), p = g.attributes.position, n = p.count;
      const top = new Float32Array(n), belly = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        z = z > 0 ? z * (1 + 1.4 * smooth(0, 1, z)) : z * 0.85;
        const t = clamp(z / 2.4, 0, 1);
        x *= 0.86 - 0.55 * Math.pow(t, 0.9);
        y *= y > 0 ? 0.82 - 0.45 * t : 0.6 - 0.3 * t;
        const ax = Math.abs(x), sx = Math.sign(x) || 1;
        y += 0.24 * gauss(ax - 0.45, y - 0.5, z - 0.5, 0.19);             // brow ridges
        y += 0.06 * gauss(ax - 0.14, y - 0.2, z - 2.1, 0.1);              // nostrils
        x += sx * 0.12 * gauss(ax - 0.72, y + 0.05, z + 0.1, 0.28);       // cheeks
        if (z > 0.15 && y < 0.02) x *= 1 - 0.1 * Math.exp(-((y + 0.12) ** 2) / 0.003) * smooth(0.15, 0.7, z); // mouth line
        if (z < -0.5) y *= 0.92;
        p.setXYZ(i, x, y, z);
        top[i] = smooth(0.15, 0.55, y) * (z < 0.9 && y > 0.25 && Math.sin(z * 7.5 + 0.6) > 0.45 ? 1.35 : 1);
        belly[i] = smooth(-0.02, -0.3, y);
      }
      g.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
      g.setAttribute('aBelly', new THREE.BufferAttribute(belly, 1));
      g.computeVertexNormals();
      return g;
    });
  }
  // the lower jaw: the bottom half of a stretched sphere, hinged at its back
  function jawGeo() {
    return geo('wyrmJaw', () => {
      const g = new THREE.SphereGeometry(1, 30, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        z = z > 0 ? z * 1.45 : z * 0.55;
        const t = clamp(z / 1.45, 0, 1);
        p.setXYZ(i, x * (0.56 - 0.36 * t), y * (0.28 - 0.12 * t), z);
      }
      g.computeVertexNormals();
      return g;
    });
  }
  class Wyrm {
    constructor() {
      this.group = new THREE.Group();
      const n = (SN + 1) * (RAD + 1);
      this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2), idx = [];
      for (let i = 0; i <= SN; i++) for (let j = 0; j <= RAD; j++) {
        const k = i * (RAD + 1) + j;
        uv[k * 2] = (i / SN) * 26; uv[k * 2 + 1] = (j / RAD) * 4;
        if (i < SN && j < RAD) idx.push(k, k + 1, k + RAD + 1, k + RAD + 1, k + 1, k + RAD + 2);
      }
      const g = (this.geo = new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      const skin = { vertexColors: true, map: tex.scales, roughness: 0.3, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.16, iridescence: 0.3, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 520], sheen: 0.3, sheenRoughness: 0.4 };
      this.bodyMat = new THREE.MeshPhysicalMaterial(skin);
      this.body = new THREE.Mesh(g, this.bodyMat);
      this.body.castShadow = true; this.body.receiveShadow = true; this.body.frustumCulled = false;
      this.group.add(this.body);
      this.finMat = new THREE.MeshStandardMaterial({ color: '#7ff0e0', map: tex.fin, roughness: 0.35, side: THREE.DoubleSide, transparent: true, depthWrite: false, emissive: '#7ff0e0', emissiveIntensity: 0.15 });
      this.hornMat = new THREE.MeshStandardMaterial({ color: '#f4e6c8', roughness: 0.45 });
      // the fin membrane down the back: a ribbon rebuilt with the spine every pose
      const fn = (FM + 1) * 3;
      this.fpos = new Float32Array(fn * 3); this.fnor = new Float32Array(fn * 3);
      const fuv = new Float32Array(fn * 2), fidx = [];
      for (let k = 0; k <= FM; k++) for (let r = 0; r < 3; r++) {
        const i = k * 3 + r;
        fuv[i * 2] = k / 4; fuv[i * 2 + 1] = r / 2;
        if (k < FM && r < 2) fidx.push(i, i + 3, i + 1, i + 1, i + 3, i + 4);
      }
      const fg = (this.finGeo = new THREE.BufferGeometry());
      fg.setAttribute('position', new THREE.BufferAttribute(this.fpos, 3).setUsage(THREE.DynamicDrawUsage));
      fg.setAttribute('normal', new THREE.BufferAttribute(this.fnor, 3).setUsage(THREE.DynamicDrawUsage));
      fg.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
      fg.setIndex(fidx);
      this.ridge = new THREE.Mesh(fg, this.finMat);
      this.ridge.frustumCulled = false; this.ridge.renderOrder = 2;
      this.group.add(this.ridge);
      this.tail = mesh(fanGeo('tail', 1.7, 1, 7, Math.PI / 2, 0.3), this.finMat); this.tail.renderOrder = 2; this.group.add(this.tail);
      // fan fins at the shoulders, wider as the wyrm grows
      this.pecs = [0, 1].map(() => { const f = mesh(fanGeo('pec', 1.6, 1, 6, Math.PI * 0.62, 0.3), this.finMat); f.renderOrder = 2; this.group.add(f); return f; });
      this.buildHead();
      this.P = Array.from({ length: SN + 1 }, () => new V3());
      this.T = Array.from({ length: SN + 1 }, () => new V3());
      this.N = Array.from({ length: SN + 1 }, () => new V3());
      this.Bn = Array.from({ length: SN + 1 }, () => new V3());
      this.down = Array.from({ length: SN + 1 }, () => new V3());
      this.cTop = new Col(); this.cSide = new Col(); this.cBelly = new Col(); this.key = '';
      this.headWorld = new V3();
      this.mouthWorld = new V3();
    }
    buildHead() {
      const h = (this.head = new THREE.Group()), k = (this.hk = new THREE.Group());
      k.scale.setScalar(0.34);
      h.add(k);
      const base = headGeo(), hg = (this.headGeo = new THREE.BufferGeometry());
      for (const a of ['position', 'normal', 'uv']) hg.setAttribute(a, base.attributes[a]);
      hg.setIndex(base.index);
      this.hcol = new Float32Array(base.attributes.position.count * 3);
      hg.setAttribute('color', new THREE.BufferAttribute(this.hcol, 3));
      this.headMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.16, iridescence: 0.3, iridescenceIOR: 1.3, sheen: 0.3, sheenRoughness: 0.4 });
      const skull = new THREE.Mesh(hg, this.headMat);
      skull.castShadow = true;
      k.add(skull);
      this.bellyMat = new THREE.MeshPhysicalMaterial({ color: '#c9f6ea', roughness: 0.4, clearcoat: 0.6 });
      this.jaw = new THREE.Group();
      this.jaw.position.set(0, -0.12, -0.35);
      const jm = mesh(jawGeo(), this.bellyMat); jm.position.set(0, 0, 0.55); this.jaw.add(jm);
      const mouthMat = new THREE.MeshStandardMaterial({ color: '#5a1e2c', roughness: 0.7, side: THREE.DoubleSide });
      const palate = mesh(geo('palate', () => new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2)), mouthMat);
      palate.scale.set(0.42, 1, 1.15); palate.position.set(0, -0.05, 0.62); this.jaw.add(palate);
      const toothMat = new THREE.MeshStandardMaterial({ color: '#fff6e4', roughness: 0.35 });
      this.fangs = [];
      for (const s of [1, -1]) for (const [z, hgt] of [[1.25, 0.16], [0.95, 0.1], [0.7, 0.08]]) {
        const tth = mesh(geo(`tooth${hgt}`, () => new THREE.ConeGeometry(0.035, hgt, 5).translate(0, hgt / 2, 0)), toothMat);
        tth.position.set(s * (0.56 - 0.36 * (z / 1.45)) * 0.8, -0.04, z - 0.05); this.jaw.add(tth); this.fangs.push(tth);
      }
      k.add(this.jaw);
      this.upperFangs = [1, -1].map((s) => {
        const f = mesh(geo('ufang', () => new THREE.ConeGeometry(0.04, 0.17, 5).rotateX(Math.PI).translate(0, -0.085, 0)), toothMat);
        f.position.set(0.17 * s, -0.12, 1.85); k.add(f); return f;
      });
      this.eyeMat = new THREE.MeshStandardMaterial({ color: '#fff4b8', emissive: '#fff4b8', emissiveIntensity: 0.9, roughness: 0.15 });
      const dark = new THREE.MeshStandardMaterial({ color: '#0c1016', roughness: 0.25 });
      this.eyes = []; this.pupils = [];
      for (const s of [1, -1]) {
        const rim = mesh(geo('eyerim', () => new THREE.TorusGeometry(0.155, 0.035, 6, 20)), dark);
        rim.position.set(0.6 * s, 0.34, 0.63); rim.rotation.y = s * 1.2; k.add(rim);
        const e = sph(0.16, this.eyeMat, 0.56 * s, 0.34, 0.62, 16);
        k.add(sph(0.03, dark, 0.12 * s, 0.13, 2.2, 8));
        const pu = sph(0.12, dark, 0.67 * s, 0.35, 0.7, 10); pu.scale.set(0.22, 0.95, 0.4);
        k.add(e, pu); this.eyes.push(e); this.pupils.push(pu);
      }
      // horns sweep back from the crown; tines branch off them as the wyrm grows
      this.hornGroup = new THREE.Group(); this.tines = []; this.tines2 = [];
      for (const s of [1, -1]) {
        const hn = mesh(taperGeo(`horn${s}`, mirror([[0, 0, 0], [0.06, 0.32, -0.32], [0.14, 0.48, -0.85], [0.2, 0.44, -1.38], [0.24, 0.3, -1.8]], s), 0.16, 0.016, 16, 8), this.hornMat);
        hn.position.set(0.3 * s, 0.6, -0.05);
        const t1 = mesh(taperGeo(`tine${s}`, mirror([[0, 0, 0], [0.04, 0.26, -0.1], [0.07, 0.5, -0.3]], s), 0.06, 0.01, 8, 6), this.hornMat);
        t1.position.set(0.12 * s, 0.47, -0.72); hn.add(t1); this.tines.push(t1);
        const t2 = mesh(taperGeo(`tineb${s}`, mirror([[0, 0, 0], [0.05, 0.2, -0.08], [0.09, 0.38, -0.22]], s), 0.045, 0.008, 8, 6), this.hornMat);
        t2.position.set(0.19 * s, 0.44, -1.25); hn.add(t2); this.tines2.push(t2);
        this.hornGroup.add(hn);
      }
      k.add(this.hornGroup);
      // long barbels from the snout, ear frills behind the cheeks, a beard frill under the jaw, a crest
      this.barbels = [1, -1].map((s) => {
        const b = mesh(taperGeo(`barbel${s}`, mirror([[0, 0, 0], [0.25, -0.05, -0.25], [0.55, -0.25, -0.8], [0.75, -0.6, -1.5], [0.8, -1.0, -2.3], [0.72, -1.38, -3.0]], s), 0.04, 0.008, 22, 5), this.hornMat);
        b.position.set(0.2 * s, 0.0, 2.15); k.add(b); return b;
      });
      this.ears = [1, -1].map((s) => {
        const e = mesh(fanGeo('ear', 1.5, 1, 5, Math.PI * 0.5, 0.32), this.finMat);
        e.position.set(0.62 * s, 0.16, -0.2); e.rotation.y = -s * 0.85; e.renderOrder = 2; k.add(e); return e;
      });
      this.beard = [1, -1].map((s) => {
        const e = mesh(fanGeo('beard', 0.9, 0.9, 5, Math.PI * 0.8, 0.18), this.finMat);
        e.position.set(0.25 * s, -0.36, 0.0); e.rotation.y = s * 0.25; e.renderOrder = 2; k.add(e); return e;
      });
      this.crest = [[0.66, -0.2, 0.75], [0.6, -0.65, 0.68], [0.45, -1.05, 0.6]].map(([y, z, sc]) => {
        const c = mesh(fanGeo('crest', 1.0, 1, 4, Math.PI * 0.32, 0.3), this.finMat);
        c.position.set(0, y, z); c.scale.setScalar(sc); c.renderOrder = 2; k.add(c); return c;
      });
      // Stormcrowned (Lv 17+): a ring of storm horns with glowing tips
      this.stormMat = new THREE.MeshStandardMaterial({ color: '#e8f6ff', emissive: '#8fd8ff', emissiveIntensity: 0.9, roughness: 0.3 });
      this.crown = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const a = -1.1 + (i / 6) * 2.2;
        const c = mesh(geo('crownh2', () => new THREE.ConeGeometry(0.09, 0.8, 6).translate(0, 0.4, 0)), this.hornMat);
        c.position.set(Math.sin(a) * 0.58, 0.72 + Math.cos(a) * 0.12, -0.4 - Math.cos(a) * 0.22);
        c.rotation.set(-0.45, 0, -a * 0.6);
        c.add(sph(0.08, this.stormMat, 0, 0.82, 0, 8));
        this.crown.add(c);
      }
      this.crown.visible = false;
      k.add(this.crown);
      // Skyriver (Lv 20): a slow halo of living water above the head
      this.haloMat = new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: '#4ac8ff', emissiveIntensity: 0.7, roughness: 0.15, transparent: true, opacity: 0.75 });
      this.halo = mesh(new THREE.TorusGeometry(1.25, 0.09, 8, 48), this.haloMat);
      this.halo.position.set(0, 1.9, -0.45);
      this.halo.rotation.x = Math.PI / 2 - 0.25;
      this.halo.castShadow = false;
      this.halo.visible = false;
      k.add(this.halo);
      this.group.add(h);
    }
    // o: { level, skin, element }
    set(o) {
      const key = `${o.level}|${o.skin}|${o.element}`;
      if (key === this.key) return;
      this.key = key;
      const sk = DATA.skins[o.skin] || DATA.skins.river;
      const stIdx = KH.stageIndex(o.level), st = DATA.wyrm.stages[stIdx];
      this.stage = stIdx;
      this.size = st.size;
      this.cTop.set(sk.body[0]); this.cSide.set(sk.body[1]); this.cBelly.set(sk.belly);
      // the head: darker crown, the side colour on the cheeks, belly colour under the jaw
      const hb = headGeo(), at = hb.attributes.aTop, ab = hb.attributes.aBelly, c = new Col();
      for (let i = 0; i < at.count; i++) {
        c.copy(this.cSide).lerp(this.cTop, Math.min(1, at.getX(i) * 0.8)).lerp(this.cBelly, ab.getX(i));
        this.hcol[i * 3] = c.r; this.hcol[i * 3 + 1] = c.g; this.hcol[i * 3 + 2] = c.b;
      }
      this.headGeo.attributes.color.needsUpdate = true;
      const fin = new Col(sk.fin || sk.mist[0]);
      this.bodyMat.sheenColor.copy(fin); this.headMat.sheenColor.copy(fin);
      this.bellyMat.color.set(sk.belly);
      this.hornMat.color.set(sk.horn);
      this.eyeMat.color.set(sk.eye).lerp(new Col('#ffa020'), 0.7); this.eyeMat.emissive.copy(this.eyeMat.color);
      const elem = o.element ? DATA.ascension.branches[o.element] : null;
      this.finMat.color.copy(fin);
      this.finMat.emissive.set(elem ? elem.color : fin);
      this.finMat.emissiveIntensity = elem ? 0.45 : stIdx >= 3 ? 0.25 : 0.12;
      this.mist = [new Col(elem ? elem.crest : sk.mist[0]), new Col(sk.mist[1])];
      this.elem = elem;
      // growth: fins and frills widen, horns lengthen and branch, the jaw gains fangs
      this.finAmp = 0.65 + stIdx * 0.1;
      this.hornGroup.scale.setScalar(0.55 + Math.min(stIdx, 6) * 0.12);
      this.tines.forEach((t) => { t.visible = stIdx >= 3; });
      this.tines2.forEach((t) => { t.visible = stIdx >= 5; });
      this.barbels.forEach((b) => b.scale.setScalar(0.45 + stIdx * 0.08));
      this.ears.forEach((e) => e.scale.setScalar(0.75 + stIdx * 0.08));
      this.beard.forEach((e) => { e.visible = stIdx >= 4; e.scale.setScalar(0.5 + stIdx * 0.06); });
      this.crest.forEach((cr, i) => { cr.visible = stIdx < 7 && (i === 0 || stIdx >= 1); });
      this.fangs.forEach((f, i) => { f.visible = stIdx >= 2 || i % 3 === 0; });
      this.upperFangs.forEach((f) => { f.visible = stIdx >= 2; f.scale.setScalar(0.8 + stIdx * 0.05); });
      this.crown.visible = stIdx >= 7;
      this.halo.visible = stIdx >= 8;
      if (stIdx >= 8) { this.haloMat.color.set(sk.mist[0]); this.haloMat.emissive.set(elem ? elem.color : sk.mist[0]); }
      this.group.scale.setScalar(Math.max(1.2, this.size * 1.7));
    }
    radius(s) {
      if (s < 0.55) return 0.035 + 0.29 * Math.pow(s / 0.55, 0.7);
      if (s < 0.8) return 0.325 + 0.02 * Math.sin(((s - 0.55) / 0.25) * Math.PI);
      return 0.325 - 0.12 * smooth(0.78, 1, s);
    }
    // st: { t, dormant, pet (0..1), roar (0..1, calling the rain), look (optional head direction) }
    pose(st) {
      const t = st.t, dorm = !!st.dormant, pet = st.pet || 0, roar = dorm ? 0 : st.roar || 0, P = this.P;
      const CE = 0.5, th0 = 0.55;
      const end = new V3(), tan = new V3();
      for (let i = 0; i <= SN; i++) {
        const s = i / SN;
        if (s <= CE) {
          const u = s / CE, th = th0 + u * Math.PI * 1.55, rr = 0.72 + 0.5 * u;
          let y = -0.04 + (dorm ? 0.01 : 0.05) * Math.sin(t * 1.8 + u * 9);
          if (u < 0.14 && !dorm) y += ((0.14 - u) / 0.14) * 0.55 + Math.sin(t * 2.6) * 0.06 * (0.14 - u) * 7;
          P[i].set(Math.cos(th) * rr, y, Math.sin(th) * rr);
          if (i === Math.round(CE * SN)) { end.copy(P[i]); tan.set(-Math.sin(th), 0, Math.cos(th)); }
        }
      }
      const i0 = Math.round(CE * SN);
      const H = dorm ? new V3(0.55, 0.45, 1.35) : new V3(0.12 + Math.sin(t * 0.7) * 0.08, 2.75 + pet * 0.3 + roar * 0.5, 0.55 - roar * 0.15);
      const c1 = end.clone().addScaledVector(tan, 0.9).add(new V3(0, dorm ? 0.2 : 1.1, 0));
      const c2 = dorm ? new V3(1.25, 0.55, 0.45) : new V3(0.75, 2.3, -0.25);
      for (let i = i0 + 1; i <= SN; i++) {
        const u = (i - i0) / (SN - i0), v = 1 - u;
        const p = P[i].set(0, 0, 0)
          .addScaledVector(end, v * v * v).addScaledVector(c1, 3 * v * v * u).addScaledVector(c2, 3 * v * u * u).addScaledVector(H, u * u * u);
        if (!dorm) {
          p.x += Math.sin(t * 1.05 + u * 3.2) * 0.16 * u;
          p.z += Math.sin(t * 0.83 + u * 2.4 + 1) * 0.1 * u;
          p.y += Math.sin(t * 1.5) * 0.05 * u * u;
        } else p.y += Math.sin(t * 0.8) * 0.02 * u;
      }
      this.dress(st);
    }
    // in flight (Cloud Run): st.path runs from the head back to the tail in the group's units, and the
    // spine is sampled smoothly along it; the head looks where the body is going
    poseFly(st) {
      const c = this.flyCurve || (this.flyCurve = new THREE.CatmullRomCurve3(st.path, false, 'centripetal'));
      c.points = st.path;
      for (let i = 0; i <= SN; i++) c.getPoint(1 - i / SN, this.P[i]);
      this.dress({ ...st, fly: true });
    }
    // everything that hangs off the spine: frames, skin, the back fin, fins, the head
    dress(st) {
      const t = st.t, dorm = !!st.dormant, pet = st.pet || 0, roar = dorm ? 0 : st.roar || 0, P = this.P, fly = !!st.fly;
      // tangents and parallel-transport frames
      const T = this.T, N = this.N, Bn = this.Bn, dn = this.down;
      for (let i = 0; i <= SN; i++) T[i].subVectors(P[Math.min(SN, i + 1)], P[Math.max(0, i - 1)]).normalize();
      const up0 = Math.abs(T[0].y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
      N[0].copy(up0).addScaledVector(T[0], -up0.dot(T[0])).normalize();
      const ax = new V3(), q = new THREE.Quaternion();
      for (let i = 1; i <= SN; i++) {
        ax.crossVectors(T[i - 1], T[i]);
        const l = ax.length();
        N[i].copy(N[i - 1]);
        if (l > 1e-6) { q.setFromAxisAngle(ax.multiplyScalar(1 / l), Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1))); N[i].applyQuaternion(q); }
      }
      // "down" is the belly side: below the body where it lies flat, behind the neck where it rears up
      const DOWN = new V3(0, -1, 0), BELLY = new V3(-0.8, 0, 0.6).normalize();
      for (let i = 0; i <= SN; i++) {
        Bn[i].crossVectors(T[i], N[i]);
        const w = Math.abs(T[i].y);
        const a = DOWN.clone().addScaledVector(T[i], -DOWN.dot(T[i])), b = BELLY.clone().addScaledVector(T[i], -BELLY.dot(T[i]));
        dn[i].copy(a.multiplyScalar(1 - w)).addScaledVector(b, w);
        if (dn[i].lengthSq() < 1e-6) dn[i].copy(N[i]);
        dn[i].normalize();
      }
      // skin the tube: dark back, bright flanks, pale belly plates
      const pos = this.pos, nor = this.nor, col = this.col, top = this.cTop, side = this.cSide, belly = this.cBelly;
      const dk = dorm ? 0.55 : 1, c = new Col(), nv = new V3();
      for (let i = 0; i <= SN; i++) {
        const s = i / SN, r = this.radius(s) * (1 + (dorm ? 0 : 0.025 * Math.sin(t * 2.2 - s * 10)));
        const plate = i % 3 === 0 ? 0.78 : 1, spot = 0.9 + 0.1 * Math.sin(i * 0.55);
        for (let j = 0; j <= RAD; j++) {
          const a = (j / RAD) * Math.PI * 2, k = (i * (RAD + 1) + j) * 3;
          nv.copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(Bn[i], Math.sin(a));
          pos[k] = P[i].x + nv.x * r; pos[k + 1] = P[i].y + nv.y * r; pos[k + 2] = P[i].z + nv.z * r;
          nor[k] = nv.x; nor[k + 1] = nv.y; nor[k + 2] = nv.z;
          const bf = nv.dot(dn[i]), bel = smooth(0.5, 0.8, bf);
          c.copy(side).lerp(top, smooth(0.0, 0.85, -bf)).lerp(belly, bel);
          const m = dk * (bel > 0.5 ? plate : -bf > 0.55 ? spot : 1);
          col[k] = c.r * m; col[k + 1] = c.g * m; col[k + 2] = c.b * m;
        }
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
      // the back fin: scalloped rays, low on the tail, tallest on the neck where it becomes a mane
      const fp = this.fpos, fnr = this.fnor, up = new V3(), sd = new V3(), b0 = new V3(), amp = this.finAmp * (1 + roar * 0.3);
      for (let kf = 0; kf <= FM; kf++) {
        const s = 0.05 + (kf / FM) * 0.935, fi = s * SN, i = Math.min(SN - 1, Math.floor(fi)), f = fi - i;
        b0.copy(P[i]).lerp(P[i + 1], f);
        up.copy(dn[i]).lerp(dn[i + 1], f).negate().normalize();
        const tg = T[i];
        sd.crossVectors(up, tg).normalize();
        const r = this.radius(s), ray = Math.pow(Math.sin(((kf % 4) + 0.5) / 4 * Math.PI), 0.6);
        const env = 0.7 + 0.45 * smooth(0.05, 0.4, s) + 0.75 * smooth(0.78, 0.97, s) - 0.9 * smooth(0.975, 0.99, s);
        const hh = r * amp * env * (0.6 + 0.4 * ray) * (dorm ? 0.6 : 1);
        const wave = dorm ? 0 : Math.sin(t * 3 + s * 18) * 0.08;
        for (let rr = 0; rr < 3; rr++) {
          const v = rr / 2, k3 = (kf * 3 + rr) * 3;
          const px = b0.x + up.x * (r * 0.75 + hh * v) - tg.x * hh * 0.42 * v * v + sd.x * hh * wave * v;
          const py = b0.y + up.y * (r * 0.75 + hh * v) - tg.y * hh * 0.42 * v * v + sd.y * hh * wave * v;
          const pz = b0.z + up.z * (r * 0.75 + hh * v) - tg.z * hh * 0.42 * v * v + sd.z * hh * wave * v;
          fp[k3] = px; fp[k3 + 1] = py; fp[k3 + 2] = pz;
          fnr[k3] = sd.x; fnr[k3 + 1] = sd.y; fnr[k3 + 2] = sd.z;
        }
      }
      this.finGeo.attributes.position.needsUpdate = true; this.finGeo.attributes.normal.needsUpdate = true;
      // the shoulder fins and the tail fan ride on the spine's frames
      const m4 = new THREE.Matrix4(), xs = new V3(), ys = new V3();
      const place = (o, i, lift, scale) => {
        ys.copy(dn[i]).negate();
        xs.crossVectors(ys, T[i]).normalize();
        ys.crossVectors(T[i], xs).normalize();
        m4.makeBasis(xs, ys, T[i]);
        o.quaternion.setFromRotationMatrix(m4);
        o.position.copy(P[i]).addScaledVector(ys, this.radius(i / SN) * lift);
        o.scale.setScalar(scale);
      };
      place(this.tail, 1, 0, (0.42 + this.stage * 0.045) * (dorm ? 0.8 : 1));
      this.tail.rotateZ(Math.sin(t * 2.4) * 0.22);
      const ip = Math.round(0.7 * SN), rp = this.radius(0.7);
      this.pecs.forEach((p, k) => {
        place(p, ip, 0, 0.55 + this.stage * 0.06);
        p.rotateZ((k ? -1 : 1) * (1.75 + Math.sin(t * (fly ? 9 : 2) + k) * (fly ? 0.5 : 0.22)));
        p.translateY(rp * 0.6);
      });
      // head: on the end of the spine, three-quarter to the viewer, the jaw breathing mist
      const hp = P[SN], ht = T[SN];
      const look = fly ? T[SN].clone().add(new V3(0, -0.1, 0)) : st.look || new V3(0.95, -0.16 - pet * 0.1 + roar * 0.95 + Math.sin(t * 0.6) * 0.04, 0.32 + Math.sin(t * 0.5) * 0.18);
      const fwd = fly ? look.normalize() : new V3().copy(ht).lerp(dorm ? new V3(0.3, -0.35, 1) : look, 0.8).normalize();
      const xr = new V3().crossVectors(new V3(0, 1, 0), fwd).normalize(), yr = new V3().crossVectors(fwd, xr);
      m4.makeBasis(xr, yr, fwd);
      this.head.quaternion.setFromRotationMatrix(m4);
      if (pet) this.head.rotateZ(Math.sin(t * 9) * 0.18 * pet);
      this.head.position.copy(hp).addScaledVector(fwd, 0.05).addScaledVector(yr, 0.04);
      this.head.scale.setScalar(1.5);
      this.jaw.rotation.x = dorm ? 0 : 0.18 * Math.pow(Math.max(0, Math.sin(t * 0.8)), 8) + pet * 0.12 + roar * 0.42;
      const blink = !dorm && (t % 4.7) < 0.13;
      const closed = dorm || blink || pet > 0.3;
      this.eyes.forEach((e) => { e.scale.y = closed ? 0.18 : 1; });
      this.pupils.forEach((p) => { p.visible = !closed; });
      this.eyeMat.emissiveIntensity = dorm ? 0.1 : 0.55;
      this.ears.forEach((e, k) => { e.rotation.z = (k ? 1 : -1) * (0.25 + Math.sin(t * 3 + k) * 0.1); });
      this.barbels.forEach((b, k) => { b.rotation.x = Math.sin(t * 1.3 + k) * 0.14 - 0.05; b.rotation.y = (k ? -1 : 1) * (0.12 + Math.sin(t * 0.9 + k * 2) * 0.1); });
      this.crest.forEach((c, i) => { c.rotation.x = Math.sin(t * 2.2 - i) * 0.08; });
      if (this.halo.visible) { this.halo.rotation.z = t * 0.6; this.halo.position.y = 1.9 + Math.sin(t * 1.4) * 0.08; }
      if (this.crown.visible) this.stormMat.emissiveIntensity = 0.6 + 0.5 * Math.max(0, Math.sin(t * 3.1) * Math.sin(t * 1.7));
      this.group.updateMatrixWorld(true);
      this.headWorld.copy(this.head.position).applyMatrix4(this.group.matrixWorld);
      this.mouthWorld.set(0, -0.2, 2.35).applyMatrix4(this.hk.matrixWorld);
    }
  }
  A.Wyrm = Wyrm;

  // ======================================================================
  // Wyrm portraits for sheets: one offscreen renderer paints every <canvas data-wyrm>
  // ======================================================================
  let PR = null;
  // the painted grotto behind every portrait (artmap.js); until it loads, a shader backdrop stands in
  let GROTTO = null;
  const grottoSrc = window.RK_ART && window.RK_ART.wyrm && window.RK_ART.wyrm.grotto;
  if (grottoSrc) {
    const im = new Image();
    im.onload = () => { GROTTO = im; if (KH.paintWyrms) KH.paintWyrms(document.body); };
    im.src = grottoSrc;
  }
  function portraitRig() {
    if (PR) return PR;
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setClearColor(0x000000, 0);
      r.setPixelRatio(1);
      r.setSize(320, 200, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.15;
      const scene = new THREE.Scene();
      const bgCol = new Col('#24150b');
      const cam = new THREE.PerspectiveCamera(30, 320 / 200, 0.1, 100);
      scene.add(new THREE.HemisphereLight('#e8f6ff', '#4a2a14', 1.5));
      const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
      sun.position.set(3, 5, 6);
      scene.add(sun);
      const rim = new THREE.DirectionalLight('#7fe0ff', 1.6);
      rim.position.set(-4, 3, -4);
      scene.add(rim);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.ShaderMaterial({
        uniforms: { a: { value: new Col('#4a2a14') }, b: { value: new Col('#0f0805') }, c: { value: new Col('#1e6f8a') } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 a, b, c; varying vec2 vUv; void main(){ float d = distance(vUv, vec2(0.5, 0.42)); vec3 col = mix(a, b, smoothstep(0.0, 0.6, d)); col += c * 0.35 * smoothstep(0.35, 0.0, distance(vUv, vec2(0.5, 0.3))); gl_FragColor = vec4(col, 1.0);\n#include <colorspace_fragment>\n}',
        toneMapped: false,
      }));
      back.position.set(0, 2, -8);
      scene.add(back);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40).rotateX(-Math.PI / 2), A.waterMat({ radial: true, alpha: 1 }));
      pool.position.y = -0.02;
      scene.add(pool);
      const rimG = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.22, 6, 40).rotateX(Math.PI / 2), mat(P.stone, { flat: true }));
      scene.add(rimG);
      const w = new Wyrm();
      scene.add(w.group);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.09, 6, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5fd0ff', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.position.y = 0.12;
      scene.add(aura);
      PR = { r, scene, cam, w, back, aura, bgCol };
    } catch (e) { PR = false; }
    return PR;
  }
  A.paintWyrm = (c, o) => {
    const rig = portraitRig();
    if (!rig) return false;
    rig.w.set({ level: o.level, skin: o.skin, element: o.element });
    const el = o.element ? DATA.ascension.branches[o.element] : null;
    rig.aura.visible = !!el;
    if (el) rig.aura.material.color.set(el.color);
    rig.back.material.uniforms.c.value.set(el ? el.color : '#1e6f8a');
    rig.w.pose({ t: 2.2, dormant: false, pet: 0 });
    // any canvas shape: the renderer follows it (taller ones frame the wyrm a little wider)
    const size = `${c.width}x${c.height}`;
    if (rig.size !== size) { rig.size = size; rig.r.setSize(c.width, c.height, false); rig.cam.aspect = c.width / c.height; rig.cam.updateProjectionMatrix(); }
    // frame on the head so every form fits, from the Hatchling to the Skyriver's halo
    const hw = rig.w.headWorld, tall = c.width / c.height < 1.2, z = o.zoom || 1, d = hw.y * (tall ? 3.3 : 2.85) / z, f = clamp(z - 1, 0, 1);
    rig.cam.position.set(hw.x + d * 0.3, hw.y * lerp(0.85, 1, f), hw.z * 0.4 + d * 0.95);
    rig.cam.lookAt(hw.x * lerp(0.55, 1, f), hw.y * lerp(tall ? 0.78 : 0.7, 1, f), hw.z * lerp(0.3, 1, f));
    A.setWater(2.2);
    rig.scene.background = GROTTO ? null : rig.bgCol;
    rig.back.visible = !GROTTO;
    rig.r.render(rig.scene, rig.cam);
    const g = c.getContext('2d');
    if (GROTTO) {
      // the grotto, cover-fitted, with a soft glow in the wyrm's colour (its storm's, once ascended)
      g.clearRect(0, 0, c.width, c.height);
      const k = Math.max(c.width / GROTTO.width, c.height / GROTTO.height), bw = GROTTO.width * k, bh = GROTTO.height * k;
      g.drawImage(GROTTO, (c.width - bw) / 2, (c.height - bh) * 0.4, bw, bh);
      const gl = g.createRadialGradient(c.width * 0.55, c.height * 0.45, 0, c.width * 0.55, c.height * 0.45, Math.max(c.width, c.height) * 0.6);
      gl.addColorStop(0, `${el ? el.color : '#46d6d0'}50`); gl.addColorStop(1, '#46d6d000');
      g.fillStyle = gl; g.fillRect(0, 0, c.width, c.height);
    }
    g.drawImage(rig.r.domElement, 0, 0, c.width, c.height);
    return true;
  };

  // ======================================================================
  // Cloud Run: the wyrm in flight on its own transparent canvas over the 2D desert. Screen points (CSS
  // pixels) land on a plane at their height above the sand; the camera looks down from behind, so the
  // wyrm flies away from it, up the screen.
  // ======================================================================
  let FL = null;
  A.flyer = (canvas) => {
    if (FL === false) return null;
    if (FL && FL.canvas === canvas) return FL;
    try {
      const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.1;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff6e8', '#9a6a3a', 1.7));
      const sun = new THREE.DirectionalLight('#fff0d0', 2.3); sun.position.set(-0.4, 1, 0.5); scene.add(sun);
      const rim = new THREE.DirectionalLight('#7fe0ff', 1.1); rim.position.set(0.5, 0.6, -1); scene.add(rim);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 5000);
      const w = new Wyrm();
      scene.add(w.group);
      FL = { canvas, r, scene, cam, w, size: '', ray: new THREE.Raycaster(), plane: new THREE.Plane(new V3(0, 1, 0), 0), ndc: new THREE.Vector2(), path: [] };
    } catch (e) { FL = false; return null; }
    return FL;
  };
  // o: { w, h, dpr, pts: [[x, y, lift], ...] head first, t, level, skin, element, scale }
  A.flyRender = (o) => {
    const F = FL;
    if (!F) return false;
    const size = `${o.w}x${o.h}x${o.dpr}`;
    if (F.size !== size) {
      F.size = size;
      F.r.setPixelRatio(o.dpr); F.r.setSize(o.w, o.h, false);
      const c = F.cam;
      c.left = -o.w / 2; c.right = o.w / 2; c.top = o.h / 2; c.bottom = -o.h / 2;
      c.position.set(0, 1000, 560); c.lookAt(0, 0, 0); c.updateProjectionMatrix(); c.updateMatrixWorld();
    }
    F.w.set({ level: o.level, skin: o.skin, element: o.element });
    F.w.group.scale.setScalar(o.scale);
    while (F.path.length < o.pts.length) F.path.push(new V3());
    F.path.length = o.pts.length;
    o.pts.forEach(([x, y, lift], i) => {
      F.ndc.set((x / o.w) * 2 - 1, -(y / o.h) * 2 + 1);
      F.ray.setFromCamera(F.ndc, F.cam);
      F.plane.constant = -lift;
      if (!F.ray.ray.intersectPlane(F.plane, F.path[i])) F.path[i].set(0, lift, 0);
      F.path[i].multiplyScalar(1 / o.scale);
    });
    F.w.poseFly({ t: o.t, path: F.path });
    F.r.render(F.scene, F.cam);
    return true;
  };
})();
