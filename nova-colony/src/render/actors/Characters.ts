/**
 * Characters actor — the player and every colonist drawn through 9 shared instanced batches
 * (body, head, face, arms, legs, 4 hair styles) tinted per character, with procedural walk / idle /
 * work / sleep / sit animations, the player's hand tool or rifle, vehicles and the knocked-out pose.
 * Off-screen colonists cost nothing.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeEuler, composeYaw } from '../core/Batch';
import { partGeometry, toolGeometry, gunGeometry, vehicleGeometry, vehicleSeatY, vehicleHovers, LEG_TOP, SHOULDER_Y, NECK_Y } from '../models/characters';
import { SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, HAIR_STYLES, pick } from '../core/palette';
import type { Colonist } from '../../core/state';
import { raySphere } from './Nature';
import { clamp } from '../../core/math';

interface Pose {
  /** 0..1 walk cycle amplitude. */
  walk: number;
  phase: number;
  /** Right-arm working swing 0/1. */
  work: number;
  sleep: boolean;
  sit: boolean;
  eat: boolean;
  /** Arms forward holding handlebars. */
  ride: boolean;
  /** Right arm aiming forward. */
  aim: boolean;
  /** Extra chop swing 0..1 (player gather hit). */
  chop: number;
}

const _m = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
/** The player's colours with the night lift applied (scratch, no per-frame allocation). */
const _pSkin = new THREE.Color();
const _pHair = new THREE.Color();
const _pOutfit = new THREE.Color();
/**
 * At night the player's colours are lifted by up to this fraction (QA3 #14b): the figure reads
 * against a dark forest floor at every quality, including low where the lantern light is off. Lamp
 * and campfire pools still land on top; ACES keeps the lifted paint from clipping.
 */
export const PLAYER_NIGHT_LIFT = 0.6;
/** Night lift ramp: nothing until env.night passes the start, full by the end. */
const PLAYER_NIGHT_FROM = 0.3;
const PLAYER_NIGHT_FULL = 0.85;
export function playerNightLift(night: number): number {
  return 1 + PLAYER_NIGHT_LIFT * clamp((night - PLAYER_NIGHT_FROM) / (PLAYER_NIGHT_FULL - PLAYER_NIGHT_FROM), 0, 1);
}
const _pose: Pose = { walk: 0, phase: 0, work: 0, sleep: false, sit: false, eat: false, ride: false, aim: false, chop: 0 };

/** Fill the shared pose scratch without allocating. */
function setPose(walk: number, phase: number, work: number, sleep: boolean, sit: boolean, eat: boolean, ride: boolean, aim: boolean, chop: number): Pose {
  _pose.walk = walk;
  _pose.phase = phase;
  _pose.work = work;
  _pose.sleep = sleep;
  _pose.sit = sit;
  _pose.eat = eat;
  _pose.ride = ride;
  _pose.aim = aim;
  _pose.chop = chop;
  return _pose;
}

export class Characters {
  private group = new THREE.Group();
  private body: Batch;
  private head: Batch;
  private face: Batch;
  private arm: Batch;
  private leg: Batch;
  private hair: Batch[] = [];
  private tool: THREE.Mesh;
  private gun: THREE.Mesh;
  private vehicle: THREE.Mesh;
  private vehicleModel = '';
  private px = 0;
  private pz = 0;
  private pSpeed = 0;
  private pPhase = 0;
  private chop = 0;
  private downStarT = 0;
  private colorCache = new Map<string, THREE.Color>();
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    const mats = ctx.mats.set;
    const mk = (geo: THREE.BufferGeometry, cap: number, shadow = true) => new Batch(this.group, geo, mats, cap, { color: true, castShadow: shadow });
    this.body = mk(partGeometry('body'), 32);
    this.head = mk(partGeometry('head'), 32);
    this.face = mk(partGeometry('face'), 32, false);
    this.arm = mk(partGeometry('arm'), 64, false);
    this.leg = mk(partGeometry('leg'), 64, false);
    for (let i = 0; i < HAIR_STYLES; i++) this.hair.push(mk(partGeometry(`hair${i}` as 'hair0'), 16, false));
    this.tool = new THREE.Mesh(toolGeometry(), mats);
    this.gun = new THREE.Mesh(gunGeometry(), mats);
    this.vehicle = new THREE.Mesh(vehicleGeometry('atv'), mats);
    this.vehicle.castShadow = true;
    for (const m of [this.tool, this.gun, this.vehicle]) {
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.group.add(m);
    }
    const p = ctx.game.state.player;
    this.px = p.x;
    this.pz = p.z;
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('gather:hit', () => (this.chop = 1)),
      bus.on('colonist:recruited', (e) => {
        const c = ctx.game.state.colonists.list.find((x) => x.id === e.id);
        if (c) ctx.particles.sparkles(c.x, ctx.heightAt(c.x, c.z) + 0.5, c.z, '#8dff9a', 20, 0.8);
      }),
      bus.on('colonist:skillUp', (e) => {
        const c = ctx.game.state.colonists.list.find((x) => x.id === e.id);
        if (c) ctx.particles.sparkles(c.x, ctx.heightAt(c.x, c.z) + 1.5, c.z, '#ffd84a', 16, 0.6);
      }),
    );
  }

  private color(hex: string): THREE.Color {
    let c = this.colorCache.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colorCache.set(hex, c);
    }
    return c;
  }

  /** Compose and push all parts of one chibi. root = ground position under the feet. */
  private drawCharacter(x: number, y: number, z: number, yaw: number, hs: number, skin: THREE.Color, hairColor: THREE.Color, hairStyle: number, outfit: THREE.Color, pose: Pose, t: number): void {
    let rootY = y;
    let rootRx = 0;
    if (pose.sleep) {
      rootY = y + 0.35;
      rootRx = -Math.PI / 2;
    } else if (pose.sit) rootY = y - 0.42;
    const bob = pose.sleep ? 0 : Math.abs(Math.sin(t * 9 + pose.phase)) * 0.07 * pose.walk + (pose.walk < 0.1 ? Math.sin(t * 2 + pose.phase) * 0.012 : 0);
    composeEuler(_root, x, rootY + bob * hs, z, rootRx, yaw, 0, hs, hs, hs);

    const swing = Math.sin(t * 9 + pose.phase) * 0.7 * pose.walk;
    // legs
    const legRx = pose.sit || pose.ride ? -Math.PI / 2 : pose.sleep ? 0 : swing;
    composeEuler(_part, -0.15, LEG_TOP, 0, legRx, 0, 0);
    _m.multiplyMatrices(_root, _part);
    _c2.copy(outfit).multiplyScalar(0.55);
    this.leg.push(_m, _c2);
    composeEuler(_part, 0.15, LEG_TOP, 0, pose.sit || pose.ride ? -Math.PI / 2 : pose.sleep ? 0 : -swing, 0, 0);
    _m.multiplyMatrices(_root, _part);
    this.leg.push(_m, _c2);
    // body
    this.body.push(_root, outfit);
    // arms (pivot at shoulder)
    let lRx = pose.sleep ? 0.2 : -swing * 0.9;
    let rRx = pose.sleep ? 0.2 : swing * 0.9;
    let lRz = 0.12;
    let rRz = -0.12;
    if (pose.ride) {
      lRx = rRx = -1.1;
    }
    if (pose.work > 0) {
      rRx = -1.3 + Math.sin(t * 8 + pose.phase) * 0.9 * pose.work;
      lRx = -0.3;
    }
    if (pose.chop > 0) {
      rRx = -2.2 + (1 - pose.chop) * 2.4;
    }
    if (pose.eat) {
      rRx = -2.3 + Math.sin(t * 3) * 0.2;
      rRz = -0.6;
    }
    if (pose.aim) {
      rRx = -1.5;
      lRx = -1.2;
      lRz = 0.5;
    }
    composeEuler(_part, -0.36, SHOULDER_Y, 0, lRx, 0, lRz);
    _m.multiplyMatrices(_root, _part);
    this.arm.push(_m, outfit);
    composeEuler(_part, 0.36, SHOULDER_Y, 0, rRx, 0, rRz);
    _m.multiplyMatrices(_root, _part);
    this.arm.push(_m, outfit);
    // head (+ face + hair)
    const nod = pose.sleep ? 0 : Math.sin(t * 2.3 + pose.phase) * 0.04 + pose.walk * Math.sin(t * 18 + pose.phase) * 0.03;
    composeEuler(_part, 0, NECK_Y, 0, nod, pose.sleep ? 0 : Math.sin(t * 0.7 + pose.phase) * 0.15 * (1 - pose.walk), 0);
    _m.multiplyMatrices(_root, _part);
    this.head.push(_m, skin);
    this.face.push(_m, this.color('#ffffff'));
    this.hair[((hairStyle | 0) % HAIR_STYLES + HAIR_STYLES) % HAIR_STYLES].push(_m, hairColor);
  }

  /** World matrix of the right hand after drawing a character (for held items). */
  private handMatrix(out: THREE.Matrix4, rRx: number, rRz: number): THREE.Matrix4 {
    composeEuler(_part, 0.36, SHOULDER_Y, 0, rRx, 0, rRz);
    out.multiplyMatrices(_root, _part);
    composeEuler(_part, 0, -0.52, 0.08, 0, 0, 0);
    return out.multiply(_part);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const t = env.t;
    const st = ctx.game.state;
    this.body.begin();
    this.head.begin();
    this.face.begin();
    this.arm.begin();
    this.leg.begin();
    for (const h of this.hair) h.begin();

    // ------------------------------------------------------------- player
    const p = st.player;
    const vx = (p.x - this.px) / Math.max(dt, 1e-3);
    const vz = (p.z - this.pz) / Math.max(dt, 1e-3);
    this.px = p.x;
    this.pz = p.z;
    const speed = Math.min(Math.hypot(vx, vz), 40);
    this.pSpeed += (speed - this.pSpeed) * (1 - Math.exp(-dt * 10));
    const walk = clamp(this.pSpeed / 4.5, 0, 1);
    this.pPhase += dt * (0.5 + walk * 0.5) * 1.2;
    this.chop = Math.max(0, this.chop - dt * 3.2);
    const ground = ctx.heightAt(p.x, p.z);
    const down = st.playTime < p.downUntil;
    const outfitId = st.liveops.cosmetics.equipped.outfit;
    const outfitDef = outfitId ? ctx.game.data.cosmetic(outfitId) : undefined;
    const lift = playerNightLift(env.night);
    const outfit = _pOutfit.copy(this.color(outfitDef?.color ?? '#e86f4d')).multiplyScalar(lift);
    const skin = _pSkin.copy(this.color(SKIN_TONES[1])).multiplyScalar(lift);
    const hairC = _pHair.copy(this.color(HAIR_COLORS[1])).multiplyScalar(lift);
    const vehicleDef = p.vehicle ? ctx.game.data.vehicle(p.vehicle) : undefined;
    const vehModel = vehicleDef?.model ?? p.vehicle ?? '';
    let aliensNear = false;
    if (p.equip.weapon) {
      const aliens = st.combat.aliens;
      for (let i = 0; i < aliens.length; i++) {
        const a = aliens[i];
        if (a.state === 'dying') continue;
        if ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 < 14 * 14) {
          aliensNear = true;
          break;
        }
      }
    }
    this.vehicle.visible = false;
    this.tool.visible = false;
    this.gun.visible = false;
    if (vehModel && !down) {
      if (vehModel !== this.vehicleModel) {
        this.vehicle.geometry = vehicleGeometry(vehModel);
        this.vehicleModel = vehModel;
      }
      const hover = vehicleHovers(vehModel);
      const vy = ground + (hover ? 0.35 + Math.sin(t * 3) * 0.08 : 0);
      composeEuler(this.vehicle.matrix, p.x, vy, p.z, hover ? Math.sin(t * 2) * 0.03 : 0, p.rot, hover ? -vx * 0.01 : 0);
      this.vehicle.visible = true;
      if (hover && inView(env, p.x, p.z) && Math.random() < dt * 25) ctx.particles.emit('glow', p.x + (Math.random() - 0.5) * 0.8, vy - 0.1, p.z + (Math.random() - 0.5) * 1.5, 0, -0.5, 0, 0.3, 0.14, '#5ef2ff');
      if (!hover && this.pSpeed > 1 && Math.random() < dt * 8) ctx.particles.dust(p.x - Math.sin(p.rot), ground, p.z - Math.cos(p.rot), 1, 0.4);
      setPose(0, 0, 0, false, false, false, true, false, 0);
      this.drawCharacter(p.x, vy + vehicleSeatY(vehModel) - LEG_TOP + 0.12, p.z, p.rot, 1, skin, hairC, 0, outfit, _pose, t);
    } else {
      setPose(down ? 0 : walk, this.pPhase * 7.5, 0, down, false, false, false, aliensNear && !down, down ? 0 : this.chop);
      if (ctx.game.input.interactHeld && !down && !aliensNear && this.chop <= 0) _pose.work = 1;
      this.drawCharacter(p.x, ground, p.z, p.rot, 1, skin, hairC, 0, outfit, _pose, t);
      if (down) {
        this.downStarT += dt;
        if (this.downStarT > 0.35) {
          this.downStarT = 0;
          ctx.particles.emit('glow', p.x + (Math.random() - 0.5) * 0.8, ground + 1.0, p.z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, 0.8, 0.14, '#ffd84a', { curve: 'grow' });
        }
      } else if (aliensNear) {
        this.handMatrix(this.gun.matrix, -1.5, -0.12);
        composeEuler(_part, 0, 0, 0, Math.PI / 2 - 0.1, 0, 0);
        this.gun.matrix.multiply(_part);
        this.gun.visible = true;
      } else if (p.equip.tool || _pose.work || _pose.chop > 0) {
        let rRx = Math.sin(t * 9 + _pose.phase) * 0.7 * walk * 0.9;
        if (_pose.work) rRx = -1.3 + Math.sin(t * 8 + _pose.phase) * 0.9;
        if (_pose.chop > 0) rRx = -2.2 + (1 - _pose.chop) * 2.4;
        this.handMatrix(this.tool.matrix, rRx, -0.12);
        composeEuler(_part, 0, 0.1, 0, -0.3, 0, 0);
        this.tool.matrix.multiply(_part);
        this.tool.visible = true;
      }
      if (walk > 0.3 && !down && inView(env, p.x, p.z, -30) && Math.random() < dt * 6 * walk) ctx.particles.dust(p.x, ground, p.z, 1, 0.3, '#d8c8a0');
    }

    // ------------------------------------------------------------- colonists
    const list = st.colonists.list;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.activity === 'sheltering') continue;
      if (!inView(env, c.x, c.z, -20)) continue;
      // rough frustum: skip things behind the camera
      if ((c.x - env.camX) * env.fwdX + (c.z - env.camZ) * env.fwdZ < -6) continue;
      this.drawColonist(c, t);
    }

    this.body.end();
    this.head.end();
    this.face.end();
    this.arm.end();
    this.leg.end();
    for (const h of this.hair) h.end();
  }

  private drawColonist(c: Colonist, t: number): void {
    const ap = c.appearance;
    const skin = this.color(pick(SKIN_TONES, ap?.skin ?? 0));
    const hair = this.color(pick(HAIR_COLORS, ap?.hairColor ?? 0));
    const outfit = this.color(pick(OUTFIT_COLORS, ap?.outfit ?? 0));
    const hs = clamp(ap?.height ?? 1, 0.85, 1.15);
    const y = this.ctx.heightAt(c.x, c.z);
    const act = c.activity;
    setPose(act === 'walking' ? 1 : 0, c.id * 1.7, act === 'working' ? 1 : 0, act === 'sleeping', act === 'relaxing', act === 'eating', false, false, 0);
    this.drawCharacter(c.x, y, c.z, c.rot || 0, hs, skin, hair, ap?.hair ?? 0, outfit, _pose, t);
    if (act === 'sleeping' && Math.random() < this.ctx.env.dt * 0.8 && inView(this.ctx.env, c.x, c.z, -40)) {
      this.ctx.particles.emit('glow', c.x + 0.3, y + 1.0, c.z, 0.2, 0.6, 0, 1.4, 0.1, '#9fdcff', { curve: 'grow' });
    }
    if (act === 'working' && Math.random() < this.ctx.env.dt * 1.5 && inView(this.ctx.env, c.x, c.z, -40)) {
      this.ctx.particles.sparks(c.x + Math.sin(c.rot || 0) * 0.6, y + 0.9, c.z + Math.cos(c.rot || 0) * 0.6, 1, '#ffd36b', 2);
    }
  }

  colonistInfo(id: number): { x: number; y: number; z: number; radius: number; height: number } | null {
    const c = this.ctx.game.state.colonists.list.find((x) => x.id === id);
    if (!c) return null;
    return { x: c.x, y: this.ctx.heightAt(c.x, c.z), z: c.z, radius: 0.7, height: 1.9 };
  }

  pick(ray: THREE.Ray, maxT: number): { id: number; t: number } | null {
    let best = -1;
    let bestT = maxT;
    for (const c of this.ctx.game.state.colonists.list) {
      if (c.activity === 'sheltering') continue;
      const t = raySphere(ray.origin, ray.direction, c.x, this.ctx.heightAt(c.x, c.z) + 1.0, c.z, 0.95);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = c.id;
      }
    }
    return best >= 0 ? { id: best, t: bestT } : null;
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of [this.body, this.head, this.face, this.arm, this.leg, ...this.hair]) b.dispose();
    this.ctx.scene.remove(this.group);
  }
}

void _c;
void composeYaw;
