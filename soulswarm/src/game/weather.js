// Each chapter's air: ash, embers, snow, motes, dust or starlight drifting through the lantern light. One draw call;
// every flake moves in the vertex shader (seeded per flake, wrapped around the Shepherd), so it costs no CPU.
import * as THREE from 'three';

// n: flakes at full quality · size: metres · fall: m/s (negative falls, positive rises) · sway: side drift (m) ·
// tumble: how fast they flicker/turn · glow: additive brightness (0 = soft, alpha-blended flakes) · a: opacity
export const WEATHER = {
  1: { n: 170, color: 0xa9b7c8, size: 0.17, fall: -0.45, sway: 0.7, tumble: 1.2, glow: 0, a: 0.3 },   // grey ash
  2: { n: 210, color: 0xff7a26, size: 0.13, fall: 0.9, sway: 0.5, tumble: 6, glow: 2.0, a: 1 },       // rising embers
  3: { n: 250, color: 0xe8f4ff, size: 0.16, fall: -0.9, sway: 0.6, tumble: 1.5, glow: 0, a: 0.45 },   // snow
  4: { n: 130, color: 0xb57aff, size: 0.13, fall: 0.18, sway: 0.9, tumble: 2.5, glow: 2.0, a: 0.9 },  // violet motes
  5: { n: 150, color: 0xffc46b, size: 0.11, fall: -0.12, sway: 0.8, tumble: 3, glow: 1.3, a: 0.7 },   // golden dust
  6: { n: 170, color: 0x8fa2ff, size: 0.12, fall: 0.25, sway: 0.5, tumble: 4, glow: 2.2, a: 0.9 },    // star motes
};
const MAX = 260;
const AREA = new THREE.Vector3(34, 9, 40); // x, height, z around the Shepherd (the view is taller than wide)

const vert = /* glsl */`
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uArea;
uniform float uFall;
uniform float uSway;
uniform float uTumble;
uniform float uSize;
uniform float uScale;
uniform float uCount;
varying float vA;
void main() {
  float on = step(aSeed.w * ${MAX}.0, uCount); // the chapter's count (and the quality budget) of the pool
  float sp = 0.7 + 0.6 * fract(aSeed.w * 7.31);
  float t = uTime * sp;
  vec3 p;
  p.y = mod(aSeed.y * uArea.y + uFall * t, uArea.y);
  // drift with the wind, wrapped in a box that follows the Shepherd
  vec2 base = vec2(aSeed.x, aSeed.z) * uArea.xz + vec2(sin(t * 0.37 + aSeed.w * 40.0), cos(t * 0.29 + aSeed.x * 31.0)) * uSway;
  vec2 rel = mod(base - uCenter.xz + uArea.xz * 0.5, uArea.xz) - uArea.xz * 0.5;
  p.xz = uCenter.xz + rel;
  float edge = smoothstep(0.0, 0.8, p.y) * smoothstep(uArea.y, uArea.y - 1.5, p.y);
  float sight = smoothstep(19.0, 7.0, length(rel));
  vA = on * edge * sight * (0.55 + 0.45 * sin(uTime * uTumble * sp + aSeed.w * 60.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = on * min(uSize * uScale / -mv.z, uScale * 0.012); // flakes close to a menu camera stay flakes
  gl_Position = projectionMatrix * mv;
}`;

const frag = /* glsl */`
uniform vec3 uColor;
uniform float uGlow;
uniform float uAlpha;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0 || vA <= 0.0) discard;
  float a = (1.0 - d * d) * vA * uAlpha;
  if (uGlow > 0.0) gl_FragColor = vec4(uColor * uGlow * a, 1.0); // additive
  else gl_FragColor = vec4(uColor, a);
}`;

export class Weather {
  constructor(scene, budget = 1) {
    this.budget = budget;
    const g = new THREE.BufferGeometry(), seed = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) {
      seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = (i + 0.5) / MAX;
    }
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uArea: { value: AREA.clone() },
        uFall: { value: 0 }, uSway: { value: 0 }, uTumble: { value: 1 }, uSize: { value: 0.08 }, uScale: { value: 400 },
        uCount: { value: 0 }, uColor: { value: new THREE.Color() }, uGlow: { value: 0 }, uAlpha: { value: 1 },
      },
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    scene.add(this.points);
  }

  setChapter(id) {
    const W = WEATHER[id], u = this.material.uniforms;
    this.points.visible = !!W;
    if (!W) return;
    u.uCount.value = Math.round(W.n * this.budget);
    u.uColor.value.setHex(W.color);
    u.uSize.value = W.size; u.uFall.value = W.fall; u.uSway.value = W.sway; u.uTumble.value = W.tumble;
    u.uGlow.value = W.glow; u.uAlpha.value = W.a;
    this.material.blending = W.glow > 0 ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.needsUpdate = true;
  }

  update(center, time) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
  }

  dispose() { this.points.geometry.dispose(); this.material.dispose(); }
}
