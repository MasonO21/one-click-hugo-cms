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
  Object.assign(A, { mesh, box, cyl, sph, dome, cone, beamZ, arch, rod });
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
  const SKIN = ['#f0c8a0', '#d9a47c', '#b07850', '#8a5a3a', '#6a4028'];
  const ROBES = ['#e8dcc4', '#c9b08a', '#8a5a3a', '#2f6f8a', '#a8452a', '#5a7a3a', '#d9c49a', '#6a4a8a'];
  A.person = (seed = 1, o = {}) => {
    const r = seeded(seed * 71 + 3);
    const robe = o.robe || ROBES[Math.floor(r() * ROBES.length)], wrap = o.wrap || ROBES[Math.floor(r() * ROBES.length)];
    const g = new THREE.Group();
    g.add(cyl(0.07, 0.19, 0.6, mat(robe, { flat: true }), 0, 0, 0, 7));
    g.add(cyl(0.075, 0.075, 0.12, mat(wrap, { flat: true }), 0, 0.42, 0, 7));
    g.add(sph(0.095, mat(SKIN[Math.floor(r() * SKIN.length)]), 0, 0.68, 0.01, 8));
    const hat = sph(0.105, mat(wrap, { flat: true }), 0, 0.72, -0.01, 8);
    hat.scale.set(1, 0.75, 1.05);
    g.add(hat);
    if (o.jar) { const j = A.jar(0.5, '#b0603a'); j.position.set(0, 0.8, 0); g.add(j); }
    g.scale.setScalar(o.scale || 1);
    return g;
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
  function house(w, h, d, o = {}) {
    const g = new THREE.Group();
    const wall = mat(o.wall || P.adobe), trim = mat(o.trim || P.adobeL), wood = mat(P.woodD), door = mat(P.door);
    g.add(box(w, h, d, wall));
    const p = 0.1, ph = 0.16;
    g.add(box(w + 0.04, ph, p, trim, 0, h, d / 2 - p / 2), box(w + 0.04, ph, p, trim, 0, h, -d / 2 + p / 2));
    g.add(box(p, ph, d, trim, w / 2 - p / 2, h, 0), box(p, ph, d, trim, -w / 2 + p / 2, h, 0));
    g.add(box(w - 0.2, 0.03, d - 0.2, mat(P.adobeD), 0, h - 0.02, 0));
    const nv = Math.max(2, Math.round(w / 0.42));
    for (let i = 0; i < nv; i++) g.add(beamZ(0.04, 0.3, wood, -w / 2 + ((i + 0.5) * w) / nv, h - 0.16, d / 2 + 0.1));
    const dx = o.doorX || 0;
    if (!o.noDoor) {
      g.add(box(0.32, 0.48, 0.06, door, dx, 0, d / 2 + 0.01));
      g.add(arch(0.16, 0.06, door, dx, 0.48, d / 2 + 0.01));
    }
    if (w > 1.05) {
      const wy = h * 0.52;
      for (const s of [-1, 1]) {
        g.add(box(0.17, 0.2, 0.05, A.glow, dx + s * w * 0.3, wy, d / 2 + 0.02));
        g.add(arch(0.085, 0.05, A.glow, dx + s * w * 0.3, wy + 0.2, d / 2 + 0.02));
      }
    }
    if (o.side) g.add(box(0.05, 0.2, 0.17, A.glow, w / 2 + 0.02, h * 0.52, 0));
    return g;
  }
  A.house = house;
  function domedHouse(r, h, color, domeColor) {
    const g = new THREE.Group();
    g.add(cyl(r, r * 1.04, h, mat(color), 0, 0, 0, 14));
    g.add(dome(r * 1.02, mat(domeColor), 0, h, 0, 16));
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
  // Mark where to draw the 2D label and how tall the building is (for overlay badges).
  const TOP = { shelter: 1.6, quarry: 2.4, grove: 3.0, well: 1.7, mine: 2.0, infirmary: 1.9, barracks: 1.9, watchtower: 4.2, archive: 2.6, hall: 2.3, storehouse: 1.7 };
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
  // The Rainwyrm: a living tube spine with a sculpted head, fins and whiskers
  // ======================================================================
  const SN = 84, RAD = 12;
  function finGeo(kind) {
    return geo(`fin${kind}`, () => {
      const s = new THREE.Shape();
      if (kind === 'dorsal') { s.moveTo(-0.5, 0); s.quadraticCurveTo(-0.55, 0.55, -0.85, 0.95); s.quadraticCurveTo(-0.1, 0.55, 0.5, 0); }
      else if (kind === 'fan') { s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.55, 0.05, 1.0); s.quadraticCurveTo(0.45, 0.85, 0.7, 0.95); s.quadraticCurveTo(0.65, 0.6, 1.0, 0.55); s.quadraticCurveTo(0.6, 0.2, 0, 0); }
      else { s.moveTo(0, -0.05); s.quadraticCurveTo(-0.4, 0.4, -1.0, 0.75); s.quadraticCurveTo(-0.7, 0.2, -1.05, -0.3); s.quadraticCurveTo(-0.4, -0.15, 0, 0.05); }
      const g = new THREE.ShapeGeometry(s, 6);
      g.rotateY(-Math.PI / 2);
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
        uv[k * 2] = (i / SN) * 16; uv[k * 2 + 1] = (j / RAD) * 3;
        if (i < SN && j < RAD) idx.push(k, k + 1, k + RAD + 1, k + RAD + 1, k + 1, k + RAD + 2);
      }
      const g = (this.geo = new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(idx);
      this.bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, map: tex.scales, roughness: 0.36, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.22 });
      this.body = new THREE.Mesh(g, this.bodyMat);
      this.body.castShadow = true; this.body.receiveShadow = true; this.body.frustumCulled = false;
      this.group.add(this.body);
      this.finMat = new THREE.MeshStandardMaterial({ color: '#7ff0e0', roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.86, emissive: '#7ff0e0', emissiveIntensity: 0.12 });
      this.fins = [];
      for (let i = 0; i < 24; i++) { const f = mesh(finGeo('dorsal'), this.finMat); f.receiveShadow = false; this.group.add(f); this.fins.push(f); }
      this.tail = mesh(finGeo('tail'), this.finMat); this.group.add(this.tail);
      this.pecs = [mesh(finGeo('fan'), this.finMat), mesh(finGeo('fan'), this.finMat)];
      this.pecs.forEach((p) => this.group.add(p));
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
      const h = (this.head = new THREE.Group());
      this.headMat = new THREE.MeshPhysicalMaterial({ color: '#3cc8cf', map: tex.scales, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.22 });
      this.bellyMat = new THREE.MeshStandardMaterial({ color: '#c9f6ea', roughness: 0.5 });
      this.hornMat = new THREE.MeshStandardMaterial({ color: '#f4e6c8', roughness: 0.5 });
      this.eyeMat = new THREE.MeshStandardMaterial({ color: '#fff4b8', emissive: '#fff4b8', emissiveIntensity: 0.9, roughness: 0.2 });
      const dark = new THREE.MeshStandardMaterial({ color: '#10141a', roughness: 0.3 });
      const S = (r, m, x, y, z, sx, sy, sz, seg = 16) => { const o = sph(r, m, x, y, z, seg); o.scale.set(sx, sy, sz); h.add(o); return o; };
      S(0.33, this.headMat, 0, 0.06, 0, 1, 0.86, 1.1);
      S(0.24, this.headMat, 0, -0.01, 0.38, 0.88, 0.68, 1.55);
      S(0.12, this.headMat, 0, 0.03, 0.7, 1.15, 0.82, 1);
      S(0.205, this.bellyMat, 0, -0.15, 0.32, 0.84, 0.42, 1.48);
      S(0.14, this.headMat, 0.19, -0.04, 0.1, 1, 1, 1.2, 10); S(0.14, this.headMat, -0.19, -0.04, 0.1, 1, 1, 1.2, 10);
      S(0.09, this.headMat, 0.17, 0.21, 0.2, 1.35, 0.6, 1.1, 10); S(0.09, this.headMat, -0.17, 0.21, 0.2, 1.35, 0.6, 1.1, 10);
      S(0.025, dark, 0.06, 0.07, 0.79, 1, 0.7, 1, 6); S(0.025, dark, -0.06, 0.07, 0.79, 1, 0.7, 1, 6);
      this.eyes = [S(0.078, this.eyeMat, 0.21, 0.11, 0.25, 1, 1, 1, 12), S(0.078, this.eyeMat, -0.21, 0.11, 0.25, 1, 1, 1, 12)];
      this.pupils = [S(0.05, dark, 0.262, 0.11, 0.28, 0.32, 1, 0.35, 8), S(0.05, dark, -0.262, 0.11, 0.28, 0.32, 1, 0.35, 8)];
      this.horns = [];
      for (const [x, y, z, rx, rz, s] of [[0.13, 0.27, -0.08, -1.05, -0.35, 1], [-0.13, 0.27, -0.08, -1.05, 0.35, 1], [0.21, 0.18, -0.2, -1.25, -0.6, 0.7], [-0.21, 0.18, -0.2, -1.25, 0.6, 0.7]]) {
        const c = mesh(geo('horn', () => new THREE.ConeGeometry(0.055, 0.5, 6).translate(0, 0.25, 0)), this.hornMat);
        c.position.set(x, y, z); c.rotation.set(rx, 0, rz); c.userData.s = s;
        h.add(c); this.horns.push(c);
      }
      this.ears = [];
      for (const s of [1, -1]) {
        const e = mesh(finGeo('fan'), this.finMat);
        e.position.set(0.27 * s, 0.1, -0.06);
        e.rotation.set(0.3, s > 0 ? Math.PI * 0.85 : Math.PI * 0.15, s * -0.6);
        e.scale.setScalar(0.42);
        h.add(e); this.ears.push(e);
      }
      this.crest = [];
      for (let i = 0; i < 3; i++) {
        const f = mesh(finGeo('dorsal'), this.finMat);
        f.position.set(0, 0.32 - i * 0.03, -0.05 - i * 0.16);
        f.scale.setScalar(0.28 - i * 0.04);
        h.add(f); this.crest.push(f);
      }
      this.whiskers = [];
      for (const s of [1, -1]) {
        const curve = new THREE.CatmullRomCurve3([new V3(0, 0, 0), new V3(0.18 * s, -0.08, -0.05), new V3(0.34 * s, -0.25, -0.2), new V3(0.42 * s, -0.48, -0.35)]);
        const w = mesh(new THREE.TubeGeometry(curve, 12, 0.014, 4), this.hornMat);
        w.position.set(0.1 * s, -0.02, 0.62);
        h.add(w); this.whiskers.push(w);
      }
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
      this.headMat.color.set(sk.body[1]).lerp(new Col(sk.body[0]), 0.35);
      this.bellyMat.color.set(sk.belly);
      this.hornMat.color.set(sk.horn);
      this.eyeMat.color.set(sk.eye); this.eyeMat.emissive.set(sk.eye);
      const elem = o.element ? DATA.ascension.branches[o.element] : null;
      this.finMat.color.set(sk.fin || sk.mist[0]);
      this.finMat.emissive.set(elem ? elem.color : sk.fin || sk.mist[0]);
      this.finMat.emissiveIntensity = elem ? 0.5 : stIdx >= 3 ? 0.28 : 0.12;
      this.mist = [new Col(elem ? elem.crest : sk.mist[0]), new Col(sk.mist[1])];
      this.elem = elem;
      this.finCount = Math.min(this.fins.length, 9 + stIdx * 2 + (stIdx >= 4 ? 2 : 0));
      this.fins.forEach((f, i) => { f.visible = i < this.finCount; });
      this.horns.forEach((c, i) => { c.visible = i < 2 || stIdx >= 4; c.scale.setScalar(c.userData.s * (0.45 + stIdx * 0.12)); });
      this.ears.forEach((e) => e.scale.setScalar(0.3 + stIdx * 0.04));
      this.whiskers.forEach((w) => { w.scale.setScalar(0.55 + stIdx * 0.1); });
      this.crest.forEach((c, i) => { c.visible = stIdx >= 1 || i === 0; });
      this.group.scale.setScalar(Math.max(1.2, this.size * 1.7));
    }
    radius(s) {
      if (s < 0.5) return 0.05 + 0.27 * Math.pow(s / 0.5, 0.62);
      if (s < 0.8) return 0.32 + 0.03 * Math.sin(((s - 0.5) / 0.3) * Math.PI);
      return 0.32 - 0.11 * ((s - 0.8) / 0.2);
    }
    // st: { t, dormant, pet (0..1) }
    pose(st) {
      const t = st.t, dorm = !!st.dormant, pet = st.pet || 0, P = this.P;
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
      const H = dorm ? new V3(0.55, 0.45, 1.35) : new V3(0.12 + Math.sin(t * 0.7) * 0.08, 2.75 + pet * 0.3, 0.55);
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
      const DOWN = new V3(0, -1, 0), FRONT = new V3(0, 0, 1);
      for (let i = 0; i <= SN; i++) {
        Bn[i].crossVectors(T[i], N[i]);
        const w = Math.abs(T[i].y);
        const a = DOWN.clone().addScaledVector(T[i], -DOWN.dot(T[i])), b = FRONT.clone().addScaledVector(T[i], -FRONT.dot(T[i]));
        dn[i].copy(a.multiplyScalar(1 - w)).addScaledVector(b, w);
        if (dn[i].lengthSq() < 1e-6) dn[i].copy(N[i]);
        dn[i].normalize();
      }
      // skin the tube
      const pos = this.pos, nor = this.nor, col = this.col, top = this.cTop, side = this.cSide, belly = this.cBelly;
      const dk = dorm ? 0.55 : 1, c = new Col(), nv = new V3();
      for (let i = 0; i <= SN; i++) {
        const s = i / SN, r = this.radius(s) * (1 + (dorm ? 0 : 0.03 * Math.sin(t * 2.2 - s * 10)));
        const shimmer = 0.95 + 0.08 * Math.sin(s * 50 + t * 0.6);
        for (let j = 0; j <= RAD; j++) {
          const a = (j / RAD) * Math.PI * 2, k = (i * (RAD + 1) + j) * 3;
          nv.copy(N[i]).multiplyScalar(Math.cos(a)).addScaledVector(Bn[i], Math.sin(a));
          pos[k] = P[i].x + nv.x * r; pos[k + 1] = P[i].y + nv.y * r; pos[k + 2] = P[i].z + nv.z * r;
          nor[k] = nv.x; nor[k + 1] = nv.y; nor[k + 2] = nv.z;
          const bf = nv.dot(dn[i]);
          c.copy(side).lerp(top, smooth(0.15, 0.9, -bf)).lerp(belly, smooth(0.3, 0.75, bf));
          col[k] = c.r * dk * shimmer; col[k + 1] = c.g * dk * shimmer; col[k + 2] = c.b * dk * shimmer;
        }
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
      // fins along the back
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
      for (let f = 0; f < this.finCount; f++) {
        const s = 0.1 + (f / Math.max(1, this.finCount - 1)) * 0.82, i = Math.round(s * SN);
        place(this.fins[f], i, 0.82, this.radius(s) * (1.2 + this.stage * 0.08) * (dorm ? 0.7 : 1 + 0.06 * Math.sin(t * 3 + f)));
      }
      place(this.tail, 1, 0.2, 0.55 + this.stage * 0.05);
      this.tail.rotateZ(Math.sin(t * 2.4) * 0.25);
      const ip = Math.round(0.66 * SN);
      this.pecs.forEach((p, k) => {
        place(p, ip, 0, 0.32 + this.stage * 0.03);
        p.rotateZ((k ? -1 : 1) * (1.9 + Math.sin(t * 2 + k) * 0.25));
        p.translateY(this.radius(0.66) * 0.6);
      });
      // head: sits on the end of the spine, looks forward toward the camera side
      const hp = P[SN], ht = T[SN];
      const fwd = new V3().copy(ht).lerp(dorm ? new V3(0.2, -0.25, 1) : new V3(Math.sin(t * 0.5) * 0.25, -0.12 - pet * 0.1, 1), 0.78).normalize();
      const xr = new V3().crossVectors(new V3(0, 1, 0), fwd).normalize(), yr = new V3().crossVectors(fwd, xr);
      m4.makeBasis(xr, yr, fwd);
      this.head.quaternion.setFromRotationMatrix(m4);
      if (pet) this.head.rotateZ(Math.sin(t * 9) * 0.2 * pet);
      this.head.position.copy(hp).addScaledVector(fwd, 0.08);
      this.head.scale.setScalar(1.25);
      const blink = !dorm && (t % 4.7) < 0.13;
      const closed = dorm || blink || pet > 0.3;
      this.eyes.forEach((e) => { e.scale.y = closed ? 0.15 : 1; });
      this.pupils.forEach((p) => { p.visible = !closed; });
      this.eyeMat.emissiveIntensity = dorm ? 0.1 : 0.9;
      this.ears.forEach((e, k) => { e.rotation.z = (k ? 0.6 : -0.6) + Math.sin(t * 3 + k) * 0.12; });
      this.whiskers.forEach((w, k) => { w.rotation.x = Math.sin(t * 1.3 + k) * 0.15; w.rotation.y = Math.sin(t * 0.9 + k * 2) * 0.12; });
      this.group.updateMatrixWorld(true);
      this.headWorld.copy(this.head.position).applyMatrix4(this.group.matrixWorld);
      this.mouthWorld.set(0, -0.05, 0.85).applyMatrix4(this.head.matrixWorld);
    }
  }
  A.Wyrm = Wyrm;

  // ======================================================================
  // Wyrm portraits for sheets: one offscreen renderer paints every <canvas data-wyrm>
  // ======================================================================
  let PR = null;
  function portraitRig() {
    if (PR) return PR;
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(320, 200, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.15;
      const scene = new THREE.Scene();
      scene.background = new Col('#24150b');
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
      PR = { r, scene, cam, w, back, aura };
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
    const s = rig.w.size * 1.7;
    rig.cam.position.set(1.8 * s, 2.4 * s, 7.2 * s);
    rig.cam.lookAt(0.2 * s, 1.75 * s, 0);
    A.setWater(2.2);
    rig.r.render(rig.scene, rig.cam);
    const g = c.getContext('2d');
    g.drawImage(rig.r.domElement, 0, 0, c.width, c.height);
    return true;
  };
})();
