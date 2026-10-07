/**
 * Atmosphere — gradient sky dome, sun & moon discs, stars, drifting low-poly clouds, the three
 * scene lights and the fog, all driven by state.time.dayTime (0 midnight, .25 sunrise, .5 noon,
 * .75 sunset) and tinted by the biome the player stands in.
 */
import * as THREE from 'three';
import type { RenderContext, Quality } from '../core/context';
import { GeoBuilder } from '../core/GeoBuilder';
import { Batch, composeYaw } from '../core/Batch';
import { lerp, clamp } from '../../core/math';

interface Key {
  e: number;
  top: string;
  hor: string;
  bot: string;
  fog: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  night: number;
}

/**
 * Lighting keyframes by sun elevation (-1 midnight .. 1 noon). The look is "warm key, cool fill":
 * a strong warm sun against a bluish hemisphere and very little flat ambient, so every box reads
 * as a box (sunlit top, half-lit front, cool shadow side); golden sunrise / sunset keys with a
 * low orange sun and blue sky fill; nights deep blue (not green) so warm window glow pops.
 */
const KEYS: Key[] = [
  { e: -1.0, top: '#040816', hor: '#101a38', bot: '#070b18', fog: '#0e1630', sun: '#8aa4ea', sunI: 0.46, hemiSky: '#4a66b8', hemiGround: '#141c38', hemiI: 0.66, night: 1 },
  { e: -0.3, top: '#0a1336', hor: '#283868', bot: '#0c1224', fog: '#1a2648', sun: '#92acee', sunI: 0.48, hemiSky: '#4f6cbc', hemiGround: '#161f3a', hemiI: 0.68, night: 1 },
  { e: -0.08, top: '#1c2d6a', hor: '#d0705c', bot: '#1a1f33', fog: '#5a4c70', sun: '#ff9c6b', sunI: 0.7, hemiSky: '#5868aa', hemiGround: '#3a3230', hemiI: 0.62, night: 0.78 },
  { e: 0.05, top: '#355ca6', hor: '#ffa860', bot: '#4a4a5a', fog: '#d9a386', sun: '#ffa45e', sunI: 1.7, hemiSky: '#8aa4dc', hemiGround: '#6a5a46', hemiI: 0.66, night: 0.32 },
  { e: 0.25, top: '#3a84dc', hor: '#ffd4a0', bot: '#7a8a9a', fog: '#dcc4ac', sun: '#ffd8a4', sunI: 2.1, hemiSky: '#b8d2f6', hemiGround: '#7e9a54', hemiI: 0.7, night: 0.05 },
  { e: 1.0, top: '#2a76dc', hor: '#bfe4ff', bot: '#8fa3b8', fog: '#c6e2ff', sun: '#fff2d2', sunI: 2.2, hemiSky: '#cfe4ff', hemiGround: '#8cab58', hemiI: 0.74, night: 0 },
];
/**
 * Sunny-day grade: lit surfaces gain this much saturation under a high sun (full above sun
 * elevation DAY_SAT_FULL, nothing below DAY_SAT_FROM — the golden-hour keys keep their own look).
 */
const DAY_SAT = 0.16;
const DAY_SAT_FROM = 0.12;
const DAY_SAT_FULL = 0.4;

/** Flat ambient on top of the hemisphere (day / deep night). */
const AMBIENT_DAY = 0.1;
const AMBIENT_NIGHT = 0.06;
/** Sky rim strength (fraction of the hemisphere sky colour) by day and by night. */
const RIM_DAY = 0.42;
const RIM_NIGHT = 0.3;
/** Shadowed ground still gets this much of the sun (a hair of bounce keeps shadows soft, not black). */
const SHADOW_INTENSITY = 0.9;
/**
 * The key light is the sun above this elevation and the moon (opposite direction) below it. Its
 * intensity dips smoothly to 0 within ±KEY_SWAP_BAND of the swap, so the light direction — and every
 * shadow — turns over while the light is off instead of jumping 180° at dusk and dawn.
 */
export const KEY_SWAP_E = -0.05;
export const KEY_SWAP_BAND = 0.06;

const keyColors = KEYS.map((k) => ({
  top: new THREE.Color(k.top),
  hor: new THREE.Color(k.hor),
  bot: new THREE.Color(k.bot),
  fog: new THREE.Color(k.fog),
  sun: new THREE.Color(k.sun),
  hemiSky: new THREE.Color(k.hemiSky),
  hemiGround: new THREE.Color(k.hemiGround),
}));

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunGlow;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.5)) : mix(uHor, uBot, pow(-h, 0.45));
    float g = max(dot(d, uSunDir), 0.0);
    c += uSunColor * (pow(g, 18.0) * 0.55 + pow(g, 4.0) * 0.12) * uSunGlow;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Atmosphere {
  private dome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private sunDisc: THREE.Mesh;
  private sunHalo: THREE.Mesh;
  private moonDisc: THREE.Mesh;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private clouds: Batch;
  private cloudPos: Float32Array;
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private amb: THREE.AmbientLight;
  private fog: THREE.Fog;
  private sunDir = new THREE.Vector3(0, 1, 0);
  private biomeTint = new THREE.Color('#bfe8ff');
  private tmpC = new THREE.Color();
  private tmpC2 = new THREE.Color();
  private m = new THREE.Matrix4();
  private shadowOn = false;

  constructor(private readonly ctx: RenderContext) {
    const scene = ctx.scene;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uBot: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() },
        uSunGlow: { value: 1 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 20, 10), this.skyMat);
    this.dome.renderOrder = -20;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    const discMat = (color: string, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, fog: false });
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(26, 24), discMat('#fff3c4'));
    this.sunHalo = new THREE.Mesh(new THREE.CircleGeometry(50, 24), discMat('#ffd79a', 0.14));
    this.moonDisc = new THREE.Mesh(new THREE.CircleGeometry(22, 20), discMat('#e9eefb'));
    for (const d of [this.sunDisc, this.sunHalo, this.moonDisc]) {
      d.renderOrder = -19;
      d.frustumCulled = false;
      scene.add(d);
    }
    (this.sunHalo.material as THREE.MeshBasicMaterial).blending = THREE.AdditiveBlending;

    // stars
    const n = 700;
    const sp = new Float32Array(n * 3);
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const y = Math.abs(u) * 0.9 + 0.08;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      sp[i * 3] = Math.cos(a) * r * 850;
      sp[i * 3 + 1] = y * 850;
      sp[i * 3 + 2] = Math.sin(a) * r * 850;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -18;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // clouds
    const cb = new GeoBuilder(99);
    cb.sphere(5, 0, 0, 0, '#ffffff', 7, { sy: 0.55 });
    cb.sphere(3.6, 4.5, 0.4, 1, '#f7fbff', 6, { sy: 0.6 });
    cb.sphere(3.2, -4.6, 0.2, -0.8, '#f7fbff', 6, { sy: 0.6 });
    cb.sphere(2.6, 1.5, 1.6, -2.2, '#ffffff', 6, { sy: 0.7 });
    cb.sphere(2.4, -1.8, 1.2, 2.4, '#ffffff', 6, { sy: 0.7 });
    const cloudGeo = cb.build();
    const CLOUDS = 24;
    this.clouds = new Batch(scene, cloudGeo, ctx.mats.makeLit({ fog: false }), CLOUDS, { castShadow: true });
    this.cloudPos = new Float32Array(CLOUDS * 4);
    for (let i = 0; i < CLOUDS; i++) {
      this.cloudPos[i * 4] = (rnd() - 0.5) * 520;
      this.cloudPos[i * 4 + 1] = 34 + rnd() * 16;
      this.cloudPos[i * 4 + 2] = (rnd() - 0.5) * 520;
      this.cloudPos[i * 4 + 3] = 1.2 + rnd() * 1.6;
    }

    // lights
    this.sun = new THREE.DirectionalLight('#fff1d8', 2);
    this.sun.position.set(60, 100, 40);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight('#c8dfff', '#86985e', 0.6);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight('#ffffff', AMBIENT_DAY);
    scene.add(this.amb);
    this.fog = new THREE.Fog(new THREE.Color('#c9e4ff'), 80, 400);
    scene.fog = this.fog;
    scene.background = null;
  }

  applyQuality(q: Quality): void {
    const on = q === 'high';
    if (on === this.shadowOn) return;
    this.shadowOn = on;
    this.sun.castShadow = on;
    if (on) {
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = -38;
      c.right = 38;
      c.top = 38;
      c.bottom = -38;
      c.near = 10;
      c.far = 320;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
      this.sun.shadow.intensity = SHADOW_INTENSITY;
      c.updateProjectionMatrix();
    }
    this.clouds.setVisible(q !== 'low');
  }

  /** Current biome fog/sky tint (sRGB hex from BiomeDef.tint). */
  setBiomeTint(hex: string | undefined): void {
    if (hex) this.biomeTint.set(hex);
  }

  /** Advance sky and lights. camDist = current camera orbit distance (fog scales with it). */
  update(dayTime: number, camDist: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const cam = ctx.camera;
    const t = ((dayTime % 1) + 1) % 1;
    const phi = (t - 0.25) * Math.PI * 2; // 0 at sunrise, PI/2 noon
    // the sun's arc leans toward +z (the default camera stands at +x,+z), so the faces the player
    // sees most are the lit ones and the shadow sides fall away from the camera
    this.sunDir.set(Math.cos(phi), Math.sin(phi), 0.42).normalize();
    const e = this.sunDir.y;
    env.sunElev = e;

    // find keyframes
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].e < e) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const f = clamp((e - a.e) / (b.e - a.e), 0, 1);
    const ca = keyColors[i];
    const cb = keyColors[i + 1];
    const night = lerp(a.night, b.night, f);
    env.night = night;
    const day = 1 - night;
    // sunset is pinker than sunrise
    const sunsetBias = t > 0.5 ? 1 : 0;

    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).lerpColors(ca.top, cb.top, f);
    this.tmpC.lerpColors(ca.hor, cb.hor, f).lerp(this.biomeTint, 0.28 * day);
    if (sunsetBias && e < 0.3 && e > -0.2) this.tmpC.lerp(this.tmpC2.set('#ff7eb0'), 0.18 * (1 - Math.abs(e) / 0.3));
    (u.uHor.value as THREE.Color).copy(this.tmpC);
    // the dome below the horizon matches the fog so the finite terrain fades out seamlessly
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uSunColor.value as THREE.Color).lerpColors(ca.sun, cb.sun, f);
    u.uSunGlow.value = e > -0.25 ? 1 : 0;

    // fog
    this.fog.color.lerpColors(ca.fog, cb.fog, f).lerp(this.biomeTint, 0.4 * day);
    (u.uBot.value as THREE.Color).copy(this.fog.color);
    this.fog.near = camDist * 1.6 + 30;
    this.fog.far = camDist * 4.2 + 240;

    // lights
    const sunUp = e > KEY_SWAP_E;
    const swapK = clamp(Math.abs(e - KEY_SWAP_E) / KEY_SWAP_BAND, 0, 1);
    const dirI = lerp(a.sunI, b.sunI, f) * swapK * swapK * (3 - 2 * swapK);
    this.sun.color.lerpColors(ca.sun, cb.sun, f);
    this.sun.intensity = dirI;
    const lx = sunUp ? this.sunDir.x : -this.sunDir.x;
    const ly = sunUp ? Math.max(0.15, this.sunDir.y) : Math.max(0.3, -this.sunDir.y);
    const lz = sunUp ? this.sunDir.z : -this.sunDir.z;
    this.sun.target.position.set(env.cx, 0, env.cz);
    this.sun.position.set(env.cx + lx * 160, ly * 160, env.cz + lz * 160);
    this.sun.target.updateMatrixWorld();
    this.hemi.color.lerpColors(ca.hemiSky, cb.hemiSky, f);
    this.hemi.groundColor.lerpColors(ca.hemiGround, cb.hemiGround, f);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, f);
    this.amb.intensity = lerp(AMBIENT_DAY, AMBIENT_NIGHT, night);
    this.amb.color.set(night > 0.5 ? '#92a4dc' : '#ffffff');
    // sky rim on grazing faces follows the hemisphere sky (blue by day, deep blue at night)
    ctx.mats.setRim(this.hemi.color, lerp(RIM_DAY, RIM_NIGHT, night) * this.hemi.intensity);
    // a high sun makes the meadow and foliage a touch more vivid (toy-bright noon, untouched dawn / dusk)
    const dayK = clamp((e - DAY_SAT_FROM) / (DAY_SAT_FULL - DAY_SAT_FROM), 0, 1);
    ctx.mats.setSaturation(1 + DAY_SAT * dayK * dayK * (3 - 2 * dayK));

    // discs
    const far = 780;
    this.dome.position.set(cam.position.x, cam.position.y, cam.position.z);
    this.stars.position.copy(cam.position);
    this.sunDisc.position.set(cam.position.x + this.sunDir.x * far, cam.position.y + this.sunDir.y * far, cam.position.z + this.sunDir.z * far);
    this.sunHalo.position.copy(this.sunDisc.position);
    this.sunDisc.lookAt(cam.position);
    this.sunHalo.lookAt(cam.position);
    this.sunDisc.visible = this.sunHalo.visible = e > -0.12;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.lerpColors(ca.sun, cb.sun, f).offsetHSL(0, 0, 0.1);
    this.moonDisc.position.set(cam.position.x - this.sunDir.x * far, cam.position.y - this.sunDir.y * far + 40, cam.position.z - this.sunDir.z * far);
    this.moonDisc.lookAt(cam.position);
    this.moonDisc.visible = e < 0.1;
    this.starMat.opacity = clamp(night * night * 1.1, 0, 1);

    // clouds drift
    this.clouds.begin();
    const cp = this.cloudPos;
    for (let k = 0; k < cp.length / 4; k++) {
      cp[k * 4] += env.dt * cp[k * 4 + 3];
      // keep the cloud field centred on the camera focus (wrap in a 520-unit box)
      let dx = cp[k * 4] - env.cx;
      let dz = cp[k * 4 + 2] - env.cz;
      if (dx > 260) cp[k * 4] -= 520;
      else if (dx < -260) cp[k * 4] += 520;
      if (dz > 260) cp[k * 4 + 2] -= 520;
      else if (dz < -260) cp[k * 4 + 2] += 520;
      composeYaw(this.m, cp[k * 4], cp[k * 4 + 1], cp[k * 4 + 2], k * 0.7, 1 + (k % 3) * 0.35, 0.9, 1 + (k % 2) * 0.4);
      this.clouds.push(this.m);
    }
    this.clouds.end();
    ctx.mats.setNight(night);
  }

  dispose(): void {
    this.skyMat.dispose();
    this.dome.geometry.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.clouds.dispose();
  }
}
