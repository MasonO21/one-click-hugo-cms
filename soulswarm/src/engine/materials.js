// Custom shaders for the "Neon Gothic" look.
// Characters: faceted albedo + key light + strong rim light + emissive parts (glowing eyes/cores) + hit flash.
// Ground: procedural flagstones with rune glyphs, pulse waves and dynamic light pools (no textures).
import * as THREE from 'three';

export const MAX_GROUND_LIGHTS = 24;

// ---------------------------------------------------------------- characters (instanced or single)
const charVert = /* glsl */`
#ifdef USE_HEROMAP
varying vec2 vUv;
#else
attribute vec3 aCol;
attribute float aEmit;
#endif
#ifdef USE_INSTANCING
attribute vec3 iTint;
attribute float iFlash;
attribute vec2 iAnim;
#else
uniform vec3 uTint;
uniform float uFlash;
uniform vec2 uAnim;
#endif
uniform float uTime;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec3 vTint;
varying float vFlash;
varying vec3 vWorld;
void main() {
  vec3 p = position;
  #ifdef USE_INSTANCING
  vec3 tint = iTint; float flash = iFlash; vec2 anim = iAnim;
  #else
  vec3 tint = uTint; float flash = uFlash; vec2 anim = uAnim;
  #endif
  // procedural waddle: bob + sway, stronger toward the top of the model
  float t = uTime * 8.0 + anim.x;
  float hgt = clamp(p.y, 0.0, 3.0);
  p.y += abs(sin(t)) * 0.07 * anim.y;
  p.x += sin(t) * 0.07 * hgt * anim.y;
  p.z += cos(t * 0.5) * 0.03 * hgt * anim.y;
  #ifdef USE_INSTANCING
  mat4 m = modelMatrix * instanceMatrix;
  #else
  mat4 m = modelMatrix;
  #endif
  vec4 wp = m * vec4(p, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(m) * normal);
  #ifdef USE_HEROMAP
  vUv = uv; vCol = vec3(1.0); vEmit = 0.0;
  #else
  vCol = aCol; vEmit = aEmit;
  #endif
  vTint = tint; vFlash = flash;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const charFrag = /* glsl */`
uniform vec3 uLightDir;
uniform vec3 uKey;
uniform vec3 uAmbient;
uniform vec3 uRim;
uniform float uEmit;
uniform vec3 uPLPos;
uniform vec3 uPLColor;
uniform float uPLRadius;
varying vec3 vN;
varying vec3 vCol;
varying float vEmit;
varying vec3 vTint;
varying float vFlash;
varying vec3 vWorld;
#ifdef USE_HEROMAP
uniform sampler2D uMap;
uniform float uGlow;
varying vec2 vUv;
#endif
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vWorld);
  float lam = max(dot(N, uLightDir), 0.0);
  float hemi = N.y * 0.5 + 0.5;
  #ifdef USE_HEROMAP
  // painted hero texture: its own painted light is baked in, so the scene light only shapes it
  vec3 base = texture2D(uMap, vUv).rgb;
  vec3 lit = base * (uAmbient * (0.55 + 0.45 * hemi) + uKey * lam);
  #else
  vec3 base = vCol;
  vec3 lit = base * (uAmbient * (0.5 + 0.8 * hemi) + uKey * lam);
  #endif
  vec3 Lp = uPLPos - vWorld;
  float dp = max(length(Lp), 0.001);
  float att = clamp(1.0 - dp / max(uPLRadius, 0.001), 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.6); // pow of a negative is NaN on Apple GPUs; dot can exceed 1 by a rounding error
  #ifdef USE_HEROMAP
  // the painted colours lead: the hero's light and rim only accent them
  lit += base * uPLColor * att * att * (0.35 + max(dot(N, Lp / dp), 0.0)) * 0.9;
  lit += uRim * rim * 0.3;
  #else
  lit += base * uPLColor * att * att * (0.35 + max(dot(N, Lp / dp), 0.0)) * 2.2;
  lit += uRim * rim * 0.85;
  #endif
  // aEmit: 0 = lit surface, 1 = glows in the instance tint, 2 = glows in its own vertex colour
  float e = min(vEmit, 1.0);
  vec3 ecol = vEmit > 1.5 ? vCol : vTint;
  vec3 col = mix(lit, ecol * uEmit, e);
  #ifdef USE_HEROMAP
  // bright, saturated paint (eyes, flames, glowing blades) glows into the bloom
  float mx = max(base.r, max(base.g, base.b)), mn = min(base.r, min(base.g, base.b));
  col += base * smoothstep(0.3, 0.75, mx) * smoothstep(0.45, 0.8, (mx - mn) / max(mx, 0.001)) * uGlow;
  #endif
  col += vFlash * vec3(2.2, 2.1, 2.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeCharMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLightDir: { value: new THREE.Vector3(-0.45, 1.0, 0.55).normalize() },
      uKey: { value: new THREE.Color(opts.key ?? 0x7d90b8) },
      uAmbient: { value: new THREE.Color(opts.ambient ?? 0x29324a) },
      uRim: { value: new THREE.Color(opts.rim ?? 0x6fd8ff) },
      uEmit: { value: opts.emit ?? 2.2 },
      uPLPos: { value: new THREE.Vector3(0, 1.2, 0) },
      uPLColor: { value: new THREE.Color(opts.plColor ?? 0x4ef2ff) },
      uPLRadius: { value: opts.plRadius ?? 7 },
      uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      uFlash: { value: 0 },
      uAnim: { value: new THREE.Vector2(0, opts.anim ?? 0) },
      uMap: { value: opts.map || null },
      uGlow: { value: opts.glow ?? 2 },
    },
    defines: opts.map ? { USE_HEROMAP: '' } : {},
    vertexShader: charVert,
    fragmentShader: charFrag,
  });
}

/** Adds per-instance attributes used by the character shader. */
export function addInstanceAttrs(mesh, max) {
  const g = mesh.geometry;
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  const flash = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const anim = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
  tint.setUsage(THREE.DynamicDrawUsage); flash.setUsage(THREE.DynamicDrawUsage); anim.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iTint', tint); g.setAttribute('iFlash', flash); g.setAttribute('iAnim', anim);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { tint, flash, anim };
}

// ---------------------------------------------------------------- spectral ghosts (legion variants)
// Instanced (uses addInstanceAttrs) and unlit: a body in the instance tint with a hot fresnel rim and an
// energy ripple flowing up it, white-hot emissive parts (gold when iAnim.y = 1, for champions), a sway along
// the body and a lower body that narrows into a tail and dissolves (dithered) toward the ground.
// Opaque on purpose: additive ghosts wash out to white where the model's parts overlap. iAnim.x = sway phase.
const spectralVert = /* glsl */`
attribute vec3 aCol;
attribute float aEmit;
#ifdef USE_INSTANCING
attribute vec3 iTint;
attribute float iFlash;
attribute vec2 iAnim;
#else
uniform vec3 uTint;
uniform float uFlash;
uniform vec2 uAnim;
#endif
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
varying vec3 vTint;
varying float vEmit;
varying float vFlash;
varying float vH;
varying float vGold;
varying float vWave;
void main() {
  #ifdef USE_INSTANCING
  vec3 tint = iTint; float flash = iFlash; vec2 anim = iAnim;
  mat4 m = modelMatrix * instanceMatrix;
  #else
  vec3 tint = uTint; float flash = uFlash; vec2 anim = uAnim;
  mat4 m = modelMatrix;
  #endif
  vec3 p = position;
  float t = uTime * 2.6 + anim.x;
  float h = max(p.y, 0.0);
  p.x += sin(t + p.y * 2.2) * 0.05 * h;
  p.z += cos(t * 0.7 + p.y * 1.7) * 0.04 * h;
  float tail = 1.0 - smoothstep(0.0, 0.7, p.y);
  p.xz *= 1.0 - 0.45 * tail;
  p.x += tail * sin(t * 1.6 + p.z * 5.0) * 0.06;
  vec4 wp = m * vec4(p, 1.0);
  vN = normalize(mat3(m) * normal);
  vV = cameraPosition - wp.xyz;
  vCol = aCol; vEmit = aEmit; vTint = tint; vFlash = flash; vH = position.y; vGold = anim.y;
  vWave = position.y * 5.0 - uTime * 4.0 + anim.x;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const spectralFrag = /* glsl */`
uniform float uBody;
uniform float uRim;
uniform float uEmit;
uniform vec3 uGold;
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
varying vec3 vTint;
varying float vEmit;
varying float vFlash;
varying float vH;
varying float vGold;
varying float vWave;
void main() {
  // the tail dissolves into the ground mist
  float fade = smoothstep(-0.05, 0.55, vH);
  float dither = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
  if (fade < dither) discard;
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float fr = 1.0 - min(abs(dot(N, V)), 1.0);
  float rim = pow(fr, 2.5);
  // a hint of the source model's shading keeps heads, limbs and weapons readable
  float shade = 0.5 + 0.5 * (N.y * 0.5 + 0.5);
  float alb = clamp(dot(vCol, vec3(0.3, 0.55, 0.15)) * 8.0, 0.45, 1.0);
  float wave = 0.82 + 0.18 * sin(vWave);
  // a deeper, more saturated body under a hot rim reads as neon at phone size; champions get a gold-tinged rim
  vec3 deep = pow(max(vTint, vec3(0.0)), vec3(1.6));
  vec3 rimCol = mix(vTint, uGold, vGold * 0.45);
  vec3 body = deep * uBody * shade * alb * wave + rimCol * rim * uRim + vec3(pow(fr, 8.0) * 0.15);
  vec3 hot = mix(vTint * 0.6 + vec3(0.55), uGold * 1.25, vGold) * uEmit;
  vec3 col = mix(body, hot, min(vEmit, 1.0));
  col += vFlash * vec3(1.6, 1.7, 1.9);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeSpectralMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBody: { value: opts.body ?? 0.85 },
      uRim: { value: opts.rim ?? 1.4 },
      uEmit: { value: opts.emit ?? 2.2 },
      uGold: { value: new THREE.Color(opts.gold ?? 0xffd04a) },
      uTint: { value: new THREE.Color(opts.tint ?? 0x4ef2ff) },
      uFlash: { value: 0 },
      uAnim: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: spectralVert,
    fragmentShader: spectralFrag,
  });
}

// ---------------------------------------------------------------- ground
const groundVert = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const groundFrag = /* glsl */`
#define MAX_LIGHTS ${MAX_GROUND_LIGHTS}
uniform vec3 uBaseA;
uniform vec3 uBaseB;
uniform vec3 uRune;
uniform vec3 uFog;
uniform vec3 uAmbient;
uniform float uTime;
uniform vec3 uCenter;
uniform float uSight;
uniform vec4 uLights[MAX_LIGHTS];
uniform vec3 uLightCol[MAX_LIGHTS];
uniform int uLightCount;
varying vec3 vWorld;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }

void main() {
  vec2 p = vWorld.xz;
  // staggered flagstones
  float s = 2.6;
  vec2 g = p / s;
  float row = floor(g.y);
  g.x += mod(row, 2.0) * 0.5;
  vec2 id = floor(g);
  vec2 f = fract(g);
  float h = hash(id);
  vec2 e = min(f, 1.0 - f);
  float edge = min(e.x, e.y);
  float groove = 1.0 - smoothstep(0.0, 0.045, edge);
  float bevel = smoothstep(0.045, 0.11, edge);

  float n = fbm(p * 0.9);
  vec3 base = mix(uBaseB, uBaseA, 0.35 + 0.65 * h);
  base *= 0.7 + 0.6 * n;
  // moss / ash patches
  base = mix(base, base * vec3(0.75, 0.9, 0.85), smoothstep(0.55, 0.8, fbm(p * 0.25 + 3.1)) * 0.6);
  // cracks
  float crack = smoothstep(0.03, 0.0, abs(fbm(p * 1.7 + h * 10.0) - 0.5)) * step(0.7, hash(id + 3.7));
  base *= 1.0 - crack * 0.5;

  // dynamic light pools (player, legion, explosions, boss)
  vec3 light = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec4 L = uLights[i];
    float d = length(p - L.xy);
    float a = clamp(1.0 - d / L.z, 0.0, 1.0);
    light += uLightCol[i] * (a * a) * L.w;
  }
  vec3 lighting = uAmbient * (0.75 + 0.5 * n) + light * 3.2;
  vec3 col = base * lighting * (0.5 + 0.5 * bevel) * (1.0 - groove * 0.85);

  // rune glyph tiles
  float runeTile = step(0.93, hash(id + 7.31));
  vec2 c = f - 0.5;
  float r = length(c);
  float ang = atan(c.y, c.x);
  float ring = smoothstep(0.025, 0.0, abs(r - 0.33)) + smoothstep(0.018, 0.0, abs(r - 0.27)) * 0.7;
  float spokes = smoothstep(0.03, 0.0, abs(sin(ang * 3.0 + h * 6.283)) * r) * step(r, 0.27) * step(0.1, r);
  float glyph = (ring + spokes) * runeTile;
  float pulse = 0.55 + 0.45 * sin(uTime * 1.7 + h * 6.283);

  float dc = length(p - uCenter.xz);
  float wave = pow(clamp(0.5 + 0.5 * sin(dc * 0.5 - uTime * 2.0), 0.0, 1.0), 10.0);
  col += uRune * groove * 0.16 * wave * smoothstep(18.0, 3.0, dc);
  col += uRune * glyph * (0.25 + 0.75 * pulse) * (0.5 + length(light));
  col += uRune * crack * 0.22 * pulse * step(0.92, hash(id + 1.3));

  // lantern sight: the world fades to fog away from the player
  float vis = smoothstep(uSight, uSight * 0.25, dc);
  col = mix(uFog, col, vis);
  gl_FragColor = vec4(col, 1.0);
}`;

export function makeGroundMaterial() {
  const lights = []; const cols = [];
  for (let i = 0; i < MAX_GROUND_LIGHTS; i++) { lights.push(new THREE.Vector4()); cols.push(new THREE.Color()); }
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseA: { value: new THREE.Color(0x0e1520) },
      uBaseB: { value: new THREE.Color(0x070b12) },
      uRune: { value: new THREE.Color(0x2ad8ff) },
      uFog: { value: new THREE.Color(0x04070c) },
      uAmbient: { value: new THREE.Color(0x8fa4c8) },
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uSight: { value: 26 },
      uLights: { value: lights },
      uLightCol: { value: cols },
      uLightCount: { value: 0 },
    },
    vertexShader: groundVert,
    fragmentShader: groundFrag,
  });
}

// ---------------------------------------------------------------- blob shadows
export function makeShadowMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      void main() { float d = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.2, d) * 0.55; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
  });
}

// ---------------------------------------------------------------- glow points (particles & halos)
export const glowPointFrag = /* glsl */`
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - min(d, 1.0), 1.8) + smoothstep(0.3, 0.0, d) * 0.9;
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, 1.0);
}`;

/** Dynamic glow sprites with CPU-set positions (minion halos, projectile glows, pickups). */
export class GlowSprites {
  constructor(max) {
    this.max = max;
    this.count = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aColor', this.aCol); g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: /* glsl */`
        attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vColor;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; vColor = aColor; }`,
      fragmentShader: glowPointFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }
  begin() { this.count = 0; }
  add(x, y, z, size, r, g, b, a = 1) {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.size[i] = size;
  }
  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.count);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
}

/** Bright unlit material for emissive props, projectiles, minion cores. */
export function makeGlowMaterial(color, intensity = 3) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({ color: c, toneMapped: true });
}
