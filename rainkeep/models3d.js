/*
 * Rainkeep: the painted 3D models. Every hero, companion and sand dweller, the beasts of the Dunes, the
 * raiders and the camels have a model made with Higgsfield (a full-body painting, from the portrait where
 * there is one, turned into a textured mesh by Meshy's image-to-3D; people come rigged with a walk).
 * artmap.js lists them under RK_ART.model.
 * Models load the first time something asks for them and are cloned for each use; until one arrives,
 * or where it cannot load (a page opened from disk), the procedural model in art3d.js stands in.
 * People keep their own rig and walk clip. The animals come as plain meshes, so they are rigged here:
 * the body is turned to face +z, and the legs (everything under the belly, by quarter), the tail (past
 * the haunches) or the wings (out past the shoulders) get bones of their own for A.animAnimal.
 */
'use strict';
(function () {
  const A = window.KH && KH.A3;
  if (!A || !A.ok || !window.THREE || !THREE.GLTFLoader) return;
  const V3 = THREE.Vector3;
  const SRC = (window.RK_ART && window.RK_ART.model) || {};
  const MOD = {};
  const loader = new THREE.GLTFLoader();
  let epoch = 0; // bumps whenever a model arrives, so the keep can swap its stand-ins
  const BIRDS = new Set(['p-falcon', 'p-hoopoe', 'b-vulture']);

  // a page opened from disk cannot fetch files beside it (the single-file build carries its models inline)
  const local = location.protocol === 'file:';
  // The model's GLB bytes, without fetching anything but the file itself: a .glb as it is; a .json (for hosts
  // that serve no .glb) holding { glb: base64 }; or a data: URI in the single-file build, decoded here, since
  // a page whose Content-Security-Policy limits connect-src to its own files cannot fetch() a data: URI
  const unbase64 = (b64) => { const s = atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  function bytes(src) {
    if (src.startsWith('data:')) return Promise.resolve(unbase64(src.slice(src.indexOf(',') + 1)));
    return fetch(src).then((r) => {
      if (!r.ok) throw new Error(`${src}: ${r.status}`);
      return /\.json$/.test(src) ? r.json().then((j) => unbase64(j.glb)) : r.arrayBuffer();
    });
  }
  function load(id) {
    if (!SRC[id] || MOD[id]) return;
    if (local && !SRC[id].startsWith('data:')) { MOD[id] = { failed: true }; return; }
    MOD[id] = { ok: false };
    bytes(SRC[id])
      .then((buf) => new Promise((res, rej) => loader.parse(buf, '', res, rej)))
      .then((gltf) => {
        // companions (p-), Dunes beasts (b-) and the camel (a-) are animals; heroes, villagers and raiders people
        // still models (s-, a rival's fort) keep their mesh as it is
        MOD[id] = /^s-/.test(id) ? prepStill(gltf) : /^[pba]-/.test(id) ? rigAnimal(gltf, BIRDS.has(id), id) : prepPerson(gltf);
        MOD[id].ok = true;
        epoch++;
      })
      .catch((e) => { MOD[id] = { failed: true, err: String(e) }; });
  }
  const ready = (id) => !!(MOD[id] && MOD[id].ok);
  const tidy = (m) => { if (m && m.isMaterial) { m.metalness = 0; m.roughness = 0.85; if (m.map) m.map.anisotropy = 4; } };

  // a rigged person: measured once (feet, height, centre) so every copy stands on the ground at its height
  function prepPerson(gltf) {
    gltf.scene.updateMatrixWorld(true);
    // measured with the bones applied: a skinned mesh's own bounds are in its bind space
    const box = new THREE.Box3();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); box.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else box.expandByObject(o);
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; tidy(o.material);
    });
    const clip = gltf.animations.find((a) => /walk/i.test(a.name)) || gltf.animations[0] || null;
    return { kind: 'person', scene: gltf.scene, clip, h: box.max.y - box.min.y, y0: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
  }

  // a still model (a building): measured once, so every copy stands on the ground at the size asked for
  function prepStill(gltf) {
    gltf.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gltf.scene);
    gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; tidy(o.material); } });
    return { kind: 'still', scene: gltf.scene, w: Math.max(box.max.x - box.min.x, box.max.z - box.min.z), y0: box.min.y, cx: (box.min.x + box.max.x) / 2, cz: (box.min.z + box.max.z) / 2 };
  }

  // ---- the animals: one mesh, turned to face +z, with bones for legs and tail, or wings ----
  // where the highest points are not the head (a tortoise's shell stands above it), the model is turned round
  const BACKWARD = new Set(['b-tortoise']);
  function rigAnimal(gltf, bird, id) {
    gltf.scene.updateMatrixWorld(true);
    let mesh = null;
    gltf.scene.traverse((o) => { if (o.isMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
    const g0 = mesh.geometry, n = g0.attributes.position.count, P = new Float32Array(n * 3), N = new Float32Array(n * 3), UV = new Float32Array(n * 2);
    const v = new V3(), nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g0.attributes.position, i).applyMatrix4(mesh.matrixWorld); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
      if (g0.attributes.normal) { v.fromBufferAttribute(g0.attributes.normal, i).applyMatrix3(nm).normalize(); N[i * 3] = v.x; N[i * 3 + 1] = v.y; N[i * 3 + 2] = v.z; }
      if (g0.attributes.uv) { UV[i * 2] = g0.attributes.uv.getX(i); UV[i * 2 + 1] = g0.attributes.uv.getY(i); }
    }
    // turn the long axis of the body (the wings, for a bird) onto z (x), head towards +z
    let mx = 0, mz = 0;
    for (let i = 0; i < n; i++) { mx += P[i * 3]; mz += P[i * 3 + 2]; }
    mx /= n; mz /= n;
    let cxx = 0, czz = 0, cxz = 0;
    for (let i = 0; i < n; i++) { const dx = P[i * 3] - mx, dz = P[i * 3 + 2] - mz; cxx += dx * dx; czz += dz * dz; cxz += dx * dz; }
    const th = 0.5 * Math.atan2(2 * cxz, cxx - czz);
    let psi = bird ? th : th - Math.PI / 2;
    const turn = (a) => { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < n; i++) for (const A3 of [P, N]) { const x = A3[i * 3], z = A3[i * 3 + 2]; A3[i * 3] = x * c + z * s; A3[i * 3 + 2] = -x * s + z * c; } };
    turn(psi);
    if (!bird) {
      // the head is the end with the highest points (ears, horns)
      let ymax = -1e9;
      for (let i = 0; i < n; i++) ymax = Math.max(ymax, P[i * 3 + 1]);
      let zs = 0, k = 0, ymin = 1e9;
      for (let i = 0; i < n; i++) ymin = Math.min(ymin, P[i * 3 + 1]);
      const top = ymax - (ymax - ymin) * 0.12;
      for (let i = 0; i < n; i++) if (P[i * 3 + 1] > top) { zs += P[i * 3 + 2]; k++; }
      if (k && (zs / k < 0) !== BACKWARD.has(id)) turn(Math.PI);
    }
    // feet on the ground, centred, one unit long (body length for a beast, wingspan for a bird)
    const bb = new THREE.Box3();
    for (let i = 0; i < n; i++) bb.expandByPoint(v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
    const ox = (bb.min.x + bb.max.x) / 2, oz = (bb.min.z + bb.max.z) / 2, oy = bird ? (bb.min.y + bb.max.y) / 2 : bb.min.y;
    const span = bird ? bb.max.x - bb.min.x : bb.max.z - bb.min.z, s = 1 / span;
    for (let i = 0; i < n; i++) { P[i * 3] = (P[i * 3] - ox) * s; P[i * 3 + 1] = (P[i * 3 + 1] - oy) * s; P[i * 3 + 2] = (P[i * 3 + 2] - oz) * s; }
    const H = (bb.max.y - bb.min.y) * s, L = (bb.max.z - bb.min.z) * s, Wd = (bb.max.x - bb.min.x) * s;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    if (g0.index) geom.setIndex(Array.from(g0.index.array));
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), pivots = [];
    const set = (i, b, w) => { si[i * 4] = 0; sw[i * 4] = 1 - w; si[i * 4 + 1] = b; sw[i * 4 + 1] = w; };
    for (let i = 0; i < n; i++) sw[i * 4] = 1;
    let names;
    if (bird) {
      // wings: everything out past the shoulders, blending in over a band
      const sh = 0.11, band = 0.06;
      pivots.push(new V3(-sh, 0, 0), new V3(sh, 0, 0));
      for (let i = 0; i < n; i++) { const x = P[i * 3], w = Math.min(1, Math.max(0, (Math.abs(x) - sh + band / 2) / band)); if (w > 0) set(i, x < 0 ? 1 : 2, w); }
      names = ['wingL', 'wingR'];
    } else {
      // the belly: the lowest point of the middle of the body, where no leg stands
      let belly = 1e9;
      for (let i = 0; i < n; i++) if (Math.abs(P[i * 3 + 2]) < L * 0.12) belly = Math.min(belly, P[i * 3 + 1]);
      if (!(belly < H * 0.8)) belly = H * 0.4;
      const band = H * 0.05;
      // the legs' own middle, so a model that is not quite centred still splits left from right
      let lx = 0, lk = 0;
      for (let i = 0; i < n; i++) if (P[i * 3 + 1] < belly * 0.5) { lx += P[i * 3]; lk++; }
      lx = lk ? lx / lk : 0;
      const q = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]; // [sum x, sum z, count] per leg: FL, FR, BL, BR
      const legOf = (i) => (P[i * 3 + 2] > 0 ? 0 : 2) + (P[i * 3] > lx ? 0 : 1);
      for (let i = 0; i < n; i++) if (P[i * 3 + 1] < belly * 0.7) { const L4 = q[legOf(i)]; L4[0] += P[i * 3]; L4[1] += P[i * 3 + 2]; L4[2]++; }
      for (const [x, z, c] of q) pivots.push(new V3(c ? x / c : 0, belly, c ? z / c : 0));
      // the tail: what reaches out past the haunches, above the legs
      const zt = -L / 2 + L * 0.2;
      pivots.push(new V3(0, belly + H * 0.12, zt));
      for (let i = 0; i < n; i++) {
        const y = P[i * 3 + 1], z = P[i * 3 + 2];
        const wl = Math.min(1, Math.max(0, (belly + band - y) / (2 * band)));
        if (wl > 0) { set(i, 1 + legOf(i), wl); continue; }
        const wt = Math.min(1, Math.max(0, (zt - z) / (L * 0.08)));
        if (wt > 0 && y > belly + H * 0.05) set(i, 5, wt);
      }
      names = ['legFL', 'legFR', 'legBL', 'legBR', 'tail'];
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geom.computeBoundingSphere();
    const mat = mesh.material.clone();
    tidy(mat);
    const bones = [new THREE.Bone()];
    bones[0].name = 'root';
    pivots.forEach((pv, k) => { const b = new THREE.Bone(); b.name = names[k]; b.position.copy(pv); bones[0].add(b); bones.push(b); });
    const sk = new THREE.SkinnedMesh(geom, mat);
    sk.castShadow = true; sk.frustumCulled = false;
    sk.add(bones[0]);
    sk.bind(new THREE.Skeleton(bones));
    const scene = new THREE.Group();
    scene.add(sk);
    return { kind: bird ? 'bird' : 'beast', scene, H, L, Wd, names };
  }

  // a fresh copy of a model: people `height` tall, beasts `height` long, birds `height` across the wings, a still
  // model `height` across
  function instance(id, height) {
    const m = MOD[id];
    if (!m || !m.ok) return null;
    const root = THREE.SkeletonUtils.clone(m.scene);
    const g = new THREE.Group();
    g.add(root);
    g.userData.glb = id;
    if (m.kind === 'still') {
      const k = height / m.w;
      root.scale.setScalar(k);
      root.position.set(-m.cx * k, -m.y0 * k, -m.cz * k);
    } else if (m.kind === 'person') {
      const k = height / m.h;
      root.scale.setScalar(k);
      root.position.set(-m.cx * k, -m.y0 * k, -m.cz * k);
      if (m.clip) {
        const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(m.clip);
        act.play();
        g.userData.mixer = mixer; g.userData.act = act; g.userData.ph = Math.random() * m.clip.duration;
        mixer.setTime(g.userData.ph);
      }
    } else {
      root.scale.setScalar(height);
      const by = {};
      root.traverse((o) => { if (o.isBone) by[o.name] = o; });
      if (m.kind === 'bird') Object.assign(g.userData, { bird: true, wings: [by.wingL, by.wingR], ph: Math.random() * 6 });
      else Object.assign(g.userData, { four: true, legs: [by.legFL, by.legFR, by.legBL, by.legBR], tail: by.tail, ph: Math.random() * 6, glbTail: true });
    }
    return g;
  }

  // walk a rigged person on (scaled to how fast they go), or hold them still at the start of the stride
  A.animModel = (o, t, mode, speed = 1) => {
    const U = o.userData, mx = U.mixer;
    if (!mx) return;
    const last = U.lastT == null ? t : U.lastT;
    U.lastT = t;
    if (mode === 'walk') mx.update(Math.max(0, Math.min(0.1, t - last)) * (0.6 + speed * 0.9));
    else if (U.act && U.act.time !== 0) { U.act.time = 0; mx.update(0); }
  };
  // the painted camel, turned to face +x and as tall as the drawn one (A.camel), so it drops into the same places;
  // camels made once it has loaded are painted, and swapCamel replaces a drawn one already in the scene
  const CAMEL_H = 1.6;
  function camel() {
    const m = MOD['a-camel'];
    if (!m || !m.ok) return null;
    const o = instance('a-camel', CAMEL_H / m.H);
    o.rotation.y = Math.PI / 2;
    const g = new THREE.Group();
    g.add(o);
    g.userData.glbCamel = o;
    return g;
  }
  function swapCamel(old) {
    const g = camel();
    if (!g) return null;
    g.position.copy(old.position); g.rotation.copy(old.rotation); g.scale.copy(old.scale);
    if (old.parent) { old.parent.add(g); old.parent.remove(old); }
    return g;
  }
  const camel0 = A.camel, walkCamel0 = A.walkCamel;
  A.camel = (seed, o) => camel() || camel0(seed, o);
  A.walkCamel = (c, t, speed) => (c.userData.glbCamel ? A.animAnimal(c.userData.glbCamel, t, speed > 0 ? 'walk' : 'sit', speed * 0.7) : walkCamel0(c, t, speed));

  const animPerson0 = A.animPerson;
  A.animPerson = (o, t, mode, speed) => (o.userData.mixer ? A.animModel(o, t, mode, speed) : animPerson0(o, t, mode, speed));

  A.models = {
    has: (id) => !!SRC[id], ready, load, instance, swapCamel, epoch: () => epoch, list: () => Object.keys(SRC),
    // load a set and report how many are in
    want: (ids) => { ids.forEach(load); return ids.filter(ready).length; },
    info: (id) => MOD[id] && { ok: MOD[id].ok, failed: !!MOD[id].failed, kind: MOD[id].kind, err: MOD[id].err },
  };
})();
