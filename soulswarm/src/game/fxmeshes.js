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

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}

export { heroGeometry };
