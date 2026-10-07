// Renderer, post-processing and the frame loop.
// A "controller" (menu showcase or a run) owns the scene and camera. The engine renders it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeCharMaterial } from './materials.js';
import { heroGeometry } from './models.js';
import { HEROES, SKINS } from '../game/data.js';

// A NaN or Inf pixel (some GPUs, Apple's among them, return NaN for pow of a negative and the like) would be smeared by
// the bloom blur into a black blotch and stay black through tone mapping. Bloom's input and the finish pass scrub them:
// an integer test on the exponent bits, which fast-math shader compilers cannot fold away the way they can x != x.
const SAFE_HDR = /* glsl */`
  vec3 safeHdr(vec3 c) {
    highp uvec3 e = floatBitsToUint(c) & 0x7f800000u;
    c.r = e.r == 0x7f800000u ? 0.0 : c.r;
    c.g = e.g == 0x7f800000u ? 0.0 : c.g;
    c.b = e.b == 0x7f800000u ? 0.0 : c.b;
    return clamp(c, 0.0, 4096.0);
  }`;

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 1.0 },
    uFlash: { value: new THREE.Vector4(1, 0, 0, 0) },
    uWhite: { value: 0 },
    uAberr: { value: 0 },
    uDesat: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette; uniform vec4 uFlash; uniform float uWhite;
    uniform float uAberr; uniform float uDesat; uniform float uTime; uniform vec2 uRes;
    varying vec2 vUv;
    ${SAFE_HDR}
    void main() {
      vec2 uv = vUv; vec2 c = uv - 0.5;
      vec3 col;
      if (uAberr > 0.001) {
        vec2 off = c * uAberr * 0.025;
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else col = texture2D(tDiffuse, uv).rgb;
      col = safeHdr(col);
      float v = smoothstep(0.95, 0.22, length(c * vec2(1.0, 0.8)));
      col *= mix(1.0, v, uVignette);
      float edge = smoothstep(0.2, 0.75, length(c));
      col = mix(col, uFlash.rgb, clamp(uFlash.a * (0.15 + 0.85 * edge), 0.0, 1.0));
      col += vec3(uWhite);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(0.9, 0.95, 1.1), uDesat);
      float n = fract(sin(dot(uv * uRes + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const QUALITY = {
  low:    { pr: 1.0, bloomScale: 0.5, particles: 0.5, lights: 8,  msaa: 0 },
  medium: { pr: 1.5, bloomScale: 1.0,  particles: 0.8, lights: 16, msaa: 0 },
  high:   { pr: 2.0, bloomScale: 1.0,  particles: 1.0, lights: 24, msaa: 4 },
};

export class Engine {
  constructor(canvas, fxCanvas, { quality = 'auto' } = {}) {
    this.canvas = canvas;
    this.fx = fxCanvas;
    this.ctx2d = fxCanvas.getContext('2d');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x05060b, 1);
    this.ctrl = null;
    this.w = 1; this.h = 1;
    this.qualitySetting = quality;
    this.q = QUALITY[quality === 'auto' ? 'medium' : quality] || QUALITY.medium;
    this.qName = quality === 'auto' ? 'medium' : quality;
    this.frameTimes = [];
    this.time = 0;
    this.manual = false;
    this.portraits = new Map();

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.92);
    const hp = this.bloom.materialHighPassFilter; // bloom reads the scene here: scrub before the blur can spread anything
    hp.fragmentShader = hp.fragmentShader.replace('void main() {', SAFE_HDR + '\nvoid main() {')
      .replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = safeHdr( texel.rgb );');
    hp.needsUpdate = true;
    this.finish = new ShaderPass(FinishShader);
    this.output = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.finish);
    this.composer.addPass(this.output);
    this.post = this.finish.uniforms;

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
    this.resize();
  }

  get particleBudget() { return this.q.particles; }
  get maxGroundLights() { return this.q.lights; }

  setQuality(setting) {
    this.qualitySetting = setting;
    const name = setting === 'auto' ? this.qName : setting;
    this.applyQuality(name);
  }
  applyQuality(name) {
    this.qName = name;
    this.q = QUALITY[name] || QUALITY.medium;
    this.resize();
    if (this.ctrl && this.ctrl.onQuality) this.ctrl.onQuality(this.q);
  }

  setController(ctrl) {
    this.ctrl = ctrl;
    this.renderPass.scene = ctrl.scene;
    this.renderPass.camera = ctrl.camera;
    this.resize();
    if (ctrl.onQuality) ctrl.onQuality(this.q);
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const pr = Math.min(window.devicePixelRatio || 1, this.q.pr);
    this.w = w; this.h = h; this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    const bs = this.q.bloomScale;
    this.bloom.setSize(Math.round(w * pr * bs), Math.round(h * pr * bs));
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== this.q.msaa) { rt.samples = this.q.msaa; rt.dispose(); }
    }
    this.post.uRes.value.set(w * pr, h * pr);
    const dpr2 = Math.min(window.devicePixelRatio || 1, 2);
    this.fx.width = Math.round(w * dpr2); this.fx.height = Math.round(h * dpr2);
    this.ctx2d.setTransform(dpr2, 0, 0, dpr2, 0, 0);
    this.heightPx = h * pr;
    if (this.ctrl && this.ctrl.resize) this.ctrl.resize(w, h, this.heightPx);
  }

  /** Pixels-per-world-unit factor for size-attenuated points with this camera. */
  pointScale(camera) {
    return this.heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }

  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      if (this.fpsCap < 60 && dt < 1 / this.fpsCap - 0.004) return; // battery saver: draw every other vsync
      last = now;
      if (dt > 0.1) dt = 0.1;
      if (dt <= 0 || this.manual) return;
      this.autoQuality(dt);
      this.step(dt);
    };
    requestAnimationFrame(loop);
  }

  /** Advance and draw one frame. Also used directly (with manual = true) for frame-perfect video capture. */
  step(dt) {
    this.time += dt;
    const c = this.ctrl;
    if (!c) return;
    c.update(dt);
    this.post.uTime.value = this.time;
    if (this.reduceFlash) { // photosensitivity: cap full-screen flashes, whiteouts and chromatic aberration
      const P = this.post; P.uFlash.value.w = Math.min(P.uFlash.value.w, 0.2); P.uWhite.value = Math.min(P.uWhite.value, 0.15); P.uAberr.value *= 0.25;
    }
    this.composer.render(dt);
    const ctx = this.ctx2d;
    ctx.clearRect(0, 0, this.w, this.h);
    if (c.draw2d) c.draw2d(ctx, this.w, this.h);
  }

  // Drop quality if the device can't hold ~45fps (only in 'auto').
  autoQuality(dt) {
    if (this.qualitySetting !== 'auto' || !this.ctrl || !this.ctrl.isRun || this.fpsCap < 60) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 150) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 42 && this.qName !== 'low') this.applyQuality(this.qName === 'high' ? 'medium' : 'low');
    else if (avg < 1 / 58 && this.qName === 'low') this.applyQuality('medium');
  }

  /** Project a world position to CSS pixels. Returns null when behind the camera. */
  project(v, camera, out = { x: 0, y: 0 }) {
    _p.copy(v).project(camera);
    if (_p.z > 1) return null;
    out.x = (_p.x * 0.5 + 0.5) * this.w;
    out.y = (-_p.y * 0.5 + 0.5) * this.h;
    return out;
  }

  /** Render a hero to a transparent PNG data URL (cached). */
  heroPortrait(id, profile, size = 1) {
    const skin = profile && profile.equippedSkin && SKINS[profile.equippedSkin]?.hero === id ? profile.equippedSkin : null;
    const key = id + (skin || '') + '@' + size;
    if (this.portraits.has(key)) return this.portraits.get(key);
    const hero = HEROES[id];
    const color = skin ? SKINS[skin].color : hero.color;
    const body = skin ? SKINS[skin].body : hero.body;
    const W = Math.round(256 * size), H = Math.round(320 * size);
    const scene = new THREE.Scene();
    const mat = makeCharMaterial({ rim: color, plColor: color, plRadius: 6, emit: 2.2, ambient: 0x3a4766, key: 0xaab8d8 });
    mat.uniforms.uTint.value.setHex(color);
    mat.uniforms.uPLPos.value.set(1.2, 1.8, 2.2);
    const geo = heroGeometry(id, body);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -0.45;
    scene.add(mesh);
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    cam.position.set(0, 1.45, 5.0);
    cam.lookAt(0, 1.12, 0);
    const rt = new THREE.WebGLRenderTarget(W, H);
    const prevClear = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(scene, cam);
    const px = new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(0x05060b, prevClear);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    // flip Y and convert linear -> sRGB
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.pow(i / 255, 1 / 2.2) * 255);
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4, dst = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) {
        img.data[dst + x] = lut[px[src + x]];
        img.data[dst + x + 1] = lut[px[src + x + 1]];
        img.data[dst + x + 2] = lut[px[src + x + 2]];
        img.data[dst + x + 3] = px[src + x + 3];
      }
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL('image/png');
    rt.dispose(); geo.dispose(); mat.dispose();
    this.portraits.set(key, url);
    return url;
  }
}
const _p = new THREE.Vector3();
