// Shader-driven FX meshes: rune circles, shockwaves, danger telegraphs, the scythe arc and Soul Gates.
import * as THREE from 'three';
import { heroGeometry } from '../engine/models.js';

const flatPlane = (size) => { const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2); return g; };
const additive = (uniforms, frag) => new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: frag,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

// ---------------------------------------------------------------- rune circle (under the hero)
export function makeRuneCircle(radius = 1.6) {
  const mat = additive({ uColor: { value: new THREE.Color(0x4ef2ff) }, uTime: { value: 0 }, uAlpha: { value: 1 } }, /* glsl */`
    uniform vec3 uColor; uniform float uTime; uniform float uAlpha; varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0; float r = length(c); float a = atan(c.y, c.x);
      float ring1 = smoothstep(0.025, 0.0, abs(r - 0.94));
      float ring2 = smoothstep(0.018, 0.0, abs(r - 0.8));
      float ring3 = smoothstep(0.014, 0.0, abs(r - 0.42));
      float ticks = step(0.83, r) * step(r, 0.91) * step(0.62, fract(a * 5.7296 + 0.25));
      float tri1 = smoothstep(0.016, 0.0, abs(r * cos(mod(a, 2.0944) - 1.0472) - 0.4));
      float tri2 = smoothstep(0.016, 0.0, abs(r * cos(mod(a + 1.0472, 2.0944) - 1.0472) - 0.4));
      float v = ring1 + ring2 * 0.8 + ring3 * 0.6 + ticks * 0.8 + (tri1 + tri2) * 0.75 * step(r, 0.8);
      float glow = smoothstep(1.0, 0.0, r) * 0.12;
      float pulse = 0.75 + 0.25 * sin(uTime * 3.0);
      gl_FragColor = vec4(uColor * (v * 1.8 * pulse + glow) * uAlpha, 1.0);
    }`);
  const m = new THREE.Mesh(flatPlane(radius * 2), mat);
  m.renderOrder = 2;
  return m;
}

// ---------------------------------------------------------------- shockwave ring (pooled by Effects)
export function makeShockwave() {
  const mat = additive({ uColor: { value: new THREE.Color(0x4ef2ff) }, uP: { value: 0 }, uW: { value: 0.12 } }, /* glsl */`
    uniform vec3 uColor; uniform float uP; uniform float uW; varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      float ring = smoothstep(uW, 0.0, abs(r - uP)) * step(r, 1.0);
      float fill = smoothstep(uP, 0.0, r) * 0.12;
      float fade = 1.0 - smoothstep(0.55, 1.0, uP);
      gl_FragColor = vec4(uColor * (ring * 2.4 + fill) * fade, 1.0);
    }`);
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 3;
  m.visible = false;
  return m;
}

// ---------------------------------------------------------------- danger telegraph (boss slams, bloaters)
export function makeTelegraph() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff2e55) }, uP: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uP; uniform float uTime; varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        if (r > 1.0) discard;
        float edge = smoothstep(0.06, 0.0, abs(r - 0.97));
        float fill = step(r, uP) * 0.35;
        float stripes = step(0.5, fract((vUv.x + vUv.y) * 8.0 - uTime * 2.0)) * 0.08;
        float a = edge * 0.95 + fill + stripes * (1.0 - step(r, uP));
        gl_FragColor = vec4(uColor * 1.6, a * 0.8);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 1;
  m.visible = false;
  return m;
}

// ---------------------------------------------------------------- scythe sweep arc
export function makeArc() {
  const mat = additive({ uColor: { value: new THREE.Color(0xb36bff) }, uHead: { value: 0 }, uLen: { value: 2.2 }, uA: { value: 1 }, uInner: { value: 0.35 } }, /* glsl */`
    uniform vec3 uColor; uniform float uHead; uniform float uLen; uniform float uA; uniform float uInner; varying vec2 vUv;
    void main() {
      vec2 c = vUv * 2.0 - 1.0; float r = length(c);
      if (r > 1.0 || r < uInner) discard;
      float a = atan(c.y, c.x);
      float d = mod(uHead - a, 6.28318);
      if (d > uLen) discard;
      float t = 1.0 - d / uLen;
      float band = smoothstep(uInner, 1.0, r) * smoothstep(1.0, 0.86, r);
      float edgeHot = smoothstep(0.93, 1.0, t) * 2.0;
      gl_FragColor = vec4(uColor * (t * t * 1.6 + edgeHot) * band * uA * 1.6, 1.0);
    }`);
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 4;
  m.visible = false;
  return m;
}

// ---------------------------------------------------------------- Soul Gate
function labelTexture(text, good) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 92px Oxanium, "Segoe UI", sans-serif';
  ctx.lineWidth = 10; ctx.strokeStyle = good ? '#00303a' : '#3a0010';
  ctx.strokeText(text, 128, 68);
  ctx.shadowColor = good ? '#4ef2ff' : '#ff2e55'; ctx.shadowBlur = 24;
  ctx.fillStyle = good ? '#e9feff' : '#ffe2e8';
  ctx.fillText(text, 128, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeGate(text, good, width = 3.6) {
  const group = new THREE.Group();
  const col = new THREE.Color(good ? 0x4ef2ff : 0xff2e55);
  const pillarMat = new THREE.MeshBasicMaterial({ color: 0x1a2030 });
  const glowMat = new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3) });
  const h = 3.0;
  for (const x of [-width / 2, width / 2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.35), pillarMat);
    p.position.set(x, h / 2, 0);
    group.add(p);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.9, 0.38), glowMat);
    strip.position.set(x, h / 2, 0);
    group.add(strip);
    const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glowMat);
    cap.position.set(x, h + 0.3, 0);
    group.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, 0.22, 0.3), pillarMat);
  beam.position.y = h; group.add(beam);
  const beamGlow = new THREE.Mesh(new THREE.BoxGeometry(width, 0.06, 0.32), glowMat);
  beamGlow.position.y = h - 0.12; group.add(beamGlow);

  const curtainMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col }, uTime: { value: 0 }, uA: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uA; varying vec2 vUv;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float streak = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float x = vUv.x * (14.0 + fi * 9.0);
          float id = floor(x);
          float sp = 0.6 + hash(id + fi * 7.0) * 1.4;
          float y = fract(vUv.y * 0.8 - uTime * sp * 0.6 + hash(id) );
          streak += smoothstep(0.35, 0.0, abs(fract(x) - 0.5)) * pow(y, 6.0) * 0.6;
        }
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float base = 0.18 + 0.12 * sin(vUv.y * 12.0 + uTime * 4.0);
        float a = (base + streak) * edge * smoothstep(0.0, 0.1, vUv.y) * uA;
        gl_FragColor = vec4(uColor * 1.8 * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(width, h), curtainMat);
  curtain.position.y = h / 2;
  group.add(curtain);

  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: labelTexture(text, good), transparent: true, depthWrite: false, toneMapped: false }));
  label.position.set(0, h + 1.15, 0);
  label.renderOrder = 20;
  group.add(label);

  group.userData = { curtainMat, label, glowMat };
  return group;
}

// ---------------------------------------------------------------- chapter bosses: sealed arena, attack decals, frost shards
// Angles are measured in the mesh's local xz plane; seal sweeps grow from the boss's side (-z) round to the Shepherd's (+z).
const sealGlsl = /* glsl */`
  float sealMask(vec2 p, float seal) { float u = abs(atan(p.x, -p.y)) / 3.14159; return smoothstep(seal + 0.004, seal - 0.004, u) + smoothstep(0.035, 0.0, abs(u - seal)) * step(seal, 0.999) * 2.5; }
  float hash1(float n) { return fract(sin(n) * 43758.5453); }`;

/** Rune border on the ground (unit radius; scale by the arena radius). */
export function makeArenaRing() {
  const g = new THREE.RingGeometry(0.86, 1.07, 192, 1); g.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff3df0) }, uTime: { value: 0 }, uSeal: { value: 0 }, uAlpha: { value: 1 }, uHit: { value: new THREE.Vector2() }, uN: { value: 72 }, uClose: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uSeal; uniform float uAlpha; uniform vec2 uHit; uniform float uN; uniform float uClose; varying vec2 vP;
      ${sealGlsl}
      void main() {
        float r = length(vP), a = atan(vP.y, vP.x), u = a / 6.28318 + 0.5;
        float border = smoothstep(0.013, 0.0, abs(r - 1.0)) * 2.2 + smoothstep(0.006, 0.0, abs(r - 0.956)) * 1.1 + smoothstep(0.005, 0.0, abs(r - 0.885)) * 0.6;
        float outer = exp(-max(r - 1.0, 0.0) * 55.0) * step(1.0, r) * 0.9;
        // rune glyph band between the two inner lines
        float q = (r - 0.895) / 0.05, cell = u * uN, id = floor(cell), cx = abs(fract(cell) - 0.5), h = hash1(id);
        float inBand = step(0.0, q) * step(q, 1.0);
        float tick = smoothstep(0.07, 0.0, cx) * step(abs(q - 0.5), 0.38);
        float diamond = smoothstep(0.06, 0.0, abs(cx * 1.6 - abs(q - 0.5) * 0.9 - 0.08 * h));
        float bar = smoothstep(0.08, 0.0, abs(q - 0.5 - 0.25 * sign(h - 0.5))) * step(cx, 0.3);
        float glyph = (h < 0.4 ? tick + bar : h < 0.75 ? diamond : tick + diamond * 0.6) * inBand;
        float flow = 0.65 + 0.35 * sin(a * 18.0 - uTime * 3.0) * sin(a * 7.0 + uTime * 1.3);
        float wash = smoothstep(0.86, 1.0, r) * step(r, 1.0) * 0.16;
        float hit = exp(-pow(abs(mod(a - uHit.x + 3.14159, 6.28318) - 3.14159) * 9.0, 2.0)) * uHit.y;
        // closing: chevrons inside the border march inward
        float cq = (1.0 - r) / 0.14, cu = fract(u * 36.0) - 0.5;
        float chev = smoothstep(0.09, 0.0, abs(fract(cq * 2.0 - abs(cu) * 1.4 + uTime * 2.2) - 0.5) - 0.22) * step(0.0, cq) * step(cq, 1.0) * smoothstep(1.0, 0.6, cq);
        float v = (border + outer + glyph * (0.55 + 0.45 * sin(uTime * 2.0 + h * 6.28)) * 1.3 + wash) * flow + hit * (border + outer + 0.5) * 2.0 + chev * uClose * 1.6;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(hit * 0.5 + border * 0.12, 0.0, 0.6)) * v * sealMask(vP, uSeal) * uAlpha, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2; m.frustumCulled = false; m.visible = false;
  return m;
}

/** Low curtain of light standing on the rune border (unit radius and height). */
export function makeArenaWall() {
  const g = new THREE.CylinderGeometry(1, 1, 1, 160, 1, true); g.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff3df0) }, uTime: { value: 0 }, uSeal: { value: 0 }, uAlpha: { value: 1 }, uHit: { value: new THREE.Vector2() } },
    vertexShader: /* glsl */`varying vec2 vP; varying float vY; void main() { vP = position.xz; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uSeal; uniform float uAlpha; uniform vec2 uHit; varying vec2 vP; varying float vY;
      ${sealGlsl}
      void main() {
        float a = atan(vP.y, vP.x), u = a / 6.28318 + 0.5;
        float fade = pow(max(1.0 - vY, 0.0), 1.7); // vY can land a hair above 1 at the top edge: pow of a negative is NaN
        float streak = 0.0;
        for (int i = 0; i < 2; i++) {
          float fi = float(i), x = u * (110.0 + fi * 70.0), id = floor(x);
          float y = fract(vY * 0.9 - uTime * (0.35 + hash1(id + fi * 9.0) * 0.6) + hash1(id));
          streak += smoothstep(0.32, 0.0, abs(fract(x) - 0.5)) * pow(y, 7.0);
        }
        float base = 0.22 + 0.08 * sin(a * 30.0 + uTime * 2.5);
        float hit = exp(-pow(abs(mod(a - uHit.x + 3.14159, 6.28318) - 3.14159) * 7.0, 2.0)) * uHit.y;
        float v = (base + streak * 0.9 + hit * 1.6) * fade + smoothstep(0.08, 0.0, vY) * 0.5;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), hit * 0.4) * v * sealMask(vP, uSeal) * uAlpha * 1.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
  return m;
}

/** Grave Slam decal: up to three bands (ring 0 is a filled disc). Per band: 0 pending → telegraph fill, then flash, then (Ch2) burn. */
export function makeSlamRings() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xff2e7a) }, uFire: { value: new THREE.Color(0xff7a2a) }, uTime: { value: 0 }, uP: { value: 0 },
      uR: { value: new THREE.Vector3() }, uW: { value: 0.06 }, uState: { value: new THREE.Vector3() }, uFlash: { value: new THREE.Vector3() }, uBurn: { value: new THREE.Vector3() },
      uLane: { value: new THREE.Vector2() },
    },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform vec3 uFire; uniform float uTime; uniform float uP; uniform vec3 uR; uniform float uW;
      uniform vec3 uState; uniform vec3 uFlash; uniform vec3 uBurn; uniform vec2 uLane; varying vec2 vUv;
      vec4 acc; float pend;
      void add(vec3 c, float a) { acc.rgb += c * a; acc.a += a; }
      void band(float r, float ang, float R, float disc, float st, float fl, float bu) {
        float inner = disc > 0.5 ? 0.0 : R - uW, outer = R + uW;
        float inb = step(inner, r) * step(r, outer);
        float edge = smoothstep(0.011, 0.0, abs(r - outer)) + (1.0 - disc) * smoothstep(0.011, 0.0, abs(r - inner));
        if (st < 0.5) { // telegraph: bright rim, fill creeping in from the outer edge, scrolling hazard stripes
          float depth = clamp((outer - r) / max(outer - inner, 0.001), 0.0, 1.0);
          float stripes = step(0.55, fract((vUv.x + vUv.y) * 14.0 - uTime * 2.0));
          add(uColor * 1.7, edge * 0.95 + step(depth, uP) * inb * 0.42 + stripes * inb * 0.12);
          pend = 1.0;
        }
        float hotRim = smoothstep(0.035, 0.0, abs(r - outer)) + (1.0 - disc) * smoothstep(0.035, 0.0, abs(r - inner));
        add(mix(uColor, vec3(1.0), 0.45) * 2.0, inb * fl * fl * 0.4 + hotRim * fl);
        float flame = 0.55 + 0.45 * sin(ang * 13.0 + uTime * 9.0 + r * 40.0) * sin(ang * 5.0 - uTime * 4.0 + r * 17.0);
        add(uFire * 2.2, (inb * (0.3 + 0.4 * flame) + edge * 0.7) * bu);
      }
      void main() {
        vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        if (r > 1.0) discard;
        float ang = atan(c.y, c.x);
        acc = vec4(0.0); pend = 0.0;
        band(r, ang, uR.x, 1.0, uState.x, uFlash.x, uBurn.x);
        band(r, ang, uR.y, 0.0, uState.y, uFlash.y, uBurn.y);
        band(r, ang, uR.z, 0.0, uState.z, uFlash.z, uBurn.z);
        // safe lanes: dashed white guides between the bands while the slam is pending
        float dash = step(0.5, fract(ang * 9.549 - uTime * 0.8));
        float lane = (smoothstep(0.006, 0.0, abs(r - uLane.x)) + smoothstep(0.006, 0.0, abs(r - uLane.y))) * dash * pend * smoothstep(0.2, 0.5, uP);
        add(vec3(1.6, 1.8, 2.0), lane * 0.55);
        if (acc.a < 0.003) discard;
        gl_FragColor = vec4(acc.rgb / acc.a, min(acc.a, 1.0));
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 1; m.visible = false;
  return m;
}

/** Bullet-ring telegraph around the boss: danger fan with two clear gaps per wave (later waves ghosted). */
export function makeGapFan() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff3df0) }, uTime: { value: 0 }, uP: { value: 0 }, uA: { value: new THREE.Vector4() }, uN: { value: 1 }, uGw: { value: 0.4 }, uAlpha: { value: 1 }, uFill: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uP; uniform vec4 uA; uniform float uN; uniform float uGw; uniform float uAlpha; uniform float uFill; varying vec2 vUv;
      float gapD(float a, float g) { float d = abs(mod(a - g + 3.14159, 6.28318) - 3.14159); return min(d, 3.14159 - d) - uGw; } // two gaps, opposite
      void main() {
        vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        if (r > 1.0 || r < 0.17) discard;
        float a = atan(c.y, c.x);
        float d0 = gapD(a, uA.x);
        float reach = smoothstep(0.17 + 0.83 * uP + 0.02, 0.17 + 0.83 * uP - 0.02, r);
        float danger = step(0.0, d0);
        float streak = pow(fract(r * 5.0 - uTime * 2.6), 4.0);
        float stripes = step(0.55, fract((vUv.x + vUv.y) * 14.0 - uTime * 2.0));
        float fill = danger * (0.13 + 0.12 * streak + 0.08 * stripes) * reach * uFill;
        float rim = smoothstep(0.016, 0.0, abs(r - 1.0)) * danger * 0.75;
        // safe corridors: dashed white guides on the gap edges (same language as the slam's safe lanes)
        float dash = step(0.45, fract(r * 9.0 - uTime * 1.5));
        float gapEdge = smoothstep(0.03, 0.0, abs(d0) * r) * dash * reach;
        float next = 0.0;
        if (uN > 1.5) next += smoothstep(0.022, 0.0, abs(gapD(a, uA.y)) * r) * 0.6;
        if (uN > 2.5) next += smoothstep(0.022, 0.0, abs(gapD(a, uA.z)) * r) * 0.4;
        if (uN > 3.5) next += smoothstep(0.022, 0.0, abs(gapD(a, uA.w)) * r) * 0.3;
        next *= step(0.5, fract(r * 14.0 - uTime * 1.5)) * reach;
        float safe = (1.0 - danger) * 0.09 * reach; // a faint cool wash marks the corridor to stand in
        float alpha = clamp(fill + rim + gapEdge * 0.8 + next + safe, 0.0, 1.0) * uAlpha * smoothstep(0.17, 0.26, r);
        vec3 col = mix(uColor * 1.5, vec3(1.6, 1.7, 1.9), clamp(gapEdge + next + (1.0 - danger), 0.0, 1.0));
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 1; m.visible = false;
  return m;
}

/** Spiral telegraph: four curled arms turning the way the stream will turn, with chevrons on the rim. */
export function makeSpiralSigil() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xff3df0) }, uTime: { value: 0 }, uP: { value: 0 }, uTheta: { value: 0 }, uDir: { value: 1 }, uCurl: { value: 1.2 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uTime; uniform float uP; uniform float uTheta; uniform float uDir; uniform float uCurl; uniform float uAlpha; varying vec2 vUv;
      void main() {
        vec2 c = vUv * 2.0 - 1.0; float r = length(c);
        if (r > 1.0 || r < 0.12) discard;
        float a = atan(c.y, c.x);
        float phi = a - uTheta + uDir * uCurl * r;
        float m = abs(mod(phi + 0.785398, 1.570796) - 0.785398) * r; // arc distance to the nearest arm
        float reach = step(r, 0.12 + 0.88 * uP);
        float arm = smoothstep(0.045, 0.012, m) * reach;
        float core = smoothstep(0.014, 0.0, m) * reach;
        float rimBand = step(0.86, r) * step(r, 0.95);
        float chev = step(0.62, fract(a * 2.546 * uDir - uTime * 1.6 + abs(r - 0.905) * 6.0)) * rimBand;
        float alpha = clamp(arm * 0.55 + core * 0.6 + chev * 0.6 + smoothstep(0.012, 0.0, abs(r - 0.97)) * 0.5, 0.0, 1.0) * uAlpha;
        gl_FragColor = vec4(mix(uColor * 1.8, vec3(2.4), core * 0.6), alpha);
      }`,
    transparent: true, depthWrite: false,
  });
  const m = new THREE.Mesh(flatPlane(2), mat);
  m.renderOrder = 1; m.visible = false;
  return m;
}

/** Instanced ice crystals for Chapter 3's frost-shard slam zones. */
export function makeShards(max) {
  const g = new THREE.OctahedronGeometry(0.42, 0); g.scale(0.6, 2.7, 0.6); g.translate(0, 0.85, 0); // tall spikes, unlike the low XP shards
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xd8f0ff).multiplyScalar(1.7) }), max);
  mesh.count = 0; mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}

export { heroGeometry };
