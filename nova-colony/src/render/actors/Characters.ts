/**
 * Characters actor — the player and every colonist, drawn through shared instanced batches (one per
 * body part: torso, accent trims, head, face, upper arm, forearm, hand, thigh, shin, boot, one per hair
 * style) tinted per character, posed by a small procedural skeleton: hips → torso → neck / shoulders →
 * elbows, and hips → knees. Poses: idle, walk, run, chop / mine (tool swing), tinker (site work),
 * carry (a log bundle or ore sack back from a gathering trip), sit, eat (with a mug), sleep, ride,
 * aim and knocked out. Off-screen colonists cost nothing; no allocation per frame.
 *
 * Cosmetics: the player wears the equipped `outfit` (body in `color`, collar / belt / pockets in
 * `accent`), `hat` (models/hats.ts, glass and orbiting drones included) and `pet` (actors/Pets.ts);
 * `colonist_outfit` dresses every colonist; `vehicle_skin` paints the player's ride.
 */
import * as THREE from 'three';
import type { RenderContext } from '../core/context';
import { inView } from '../core/context';
import { Batch, composeEuler } from '../core/Batch';
import { emptyGeometry } from '../core/GeoBuilder';
import {
  partGeometry,
  toolGeometry,
  vehicleGeometry,
  vehicleSeatY,
  vehicleHovers,
  paintFromSkin,
  nodeTool,
  HIP_Y,
  HIP_X,
  THIGH,
  SHOULDER_X,
  SHOULDER_Y,
  UPPER_ARM,
  NECK_Y,
  GRIP_Y,
  FIGURE_H,
  FAR_LOD_DIST,
  type PartKey,
  type ToolKey,
} from '../models/characters';
import { hatGeometry, hatSpec } from '../models/hats';
import { outfitBodyGeometry, uniformBodyGeometry, uniformHeadGeometry } from '../models/outfits';
import { HAIR_STYLES } from '../core/palette';
import { colonistLook, playerLook, type LookHex } from './looks';
import { PetActor } from './Pets';
import type { Colonist } from '../../core/state';
import { raySphere } from './Nature';
import { clamp } from '../../core/math';

/** Activities the skeleton knows (numeric for the hot path). */
const A_STAND = 0;
const A_TINKER = 1;
const A_SWING = 2;
const A_CARRY = 3;
const A_SIT = 4;
const A_SLEEP = 5;
const A_EAT = 6;
const A_RIDE = 7;
const A_AIM = 8;
const A_DOWN = 9;
/** Walking / standing with the gathering tool resting on the right shoulder. */
const A_SHOULDER = 10;

interface Pose {
  /** 0..1 gait amplitude. */
  walk: number;
  /** 0..1 run blend (longer stride, bent arms, forward lean). */
  run: number;
  /** Gait phase (radians). */
  phase: number;
  /** Per-character offset for idle motion. */
  seed: number;
  act: number;
  /** Tool swing cycle position 0..1 (A_SWING). */
  swing: number;
}

/** Colours of one settler (linear THREE.Colors, resolved once per colonist). */
interface Look {
  skin: THREE.Color;
  hair: THREE.Color;
  outfit: THREE.Color;
  accent: THREE.Color;
  trousers: THREE.Color;
  boots: THREE.Color;
  style: number;
}

function newLook(): Look {
  return { skin: new THREE.Color(), hair: new THREE.Color(), outfit: new THREE.Color(), accent: new THREE.Color(), trousers: new THREE.Color(), boots: new THREE.Color(), style: 0 };
}

function setLook(out: Look, h: LookHex): Look {
  out.skin.set(h.skin);
  out.hair.set(h.hair);
  out.outfit.set(h.outfit);
  out.accent.set(h.accent);
  out.trousers.set(h.trousers);
  out.boots.set(h.boots);
  out.style = h.style;
  return out;
}

const _root = new THREE.Matrix4();
const _hip = new THREE.Matrix4();
const _neck = new THREE.Matrix4();
const _sh = new THREE.Matrix4();
const _el = new THREE.Matrix4();
const _foreR = new THREE.Matrix4();
const _foreL = new THREE.Matrix4();
const _th = new THREE.Matrix4();
const _kn = new THREE.Matrix4();
const _part = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const WHITE = new THREE.Color(1, 1, 1);
/** The player's look with the night lift applied (scratch). */
const _pLook = newLook();
const _pBase = newLook();
const _lift = new THREE.Color(1, 1, 1);

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

const _pose: Pose = { walk: 0, phase: 0, run: 0, seed: 0, act: A_STAND, swing: 0 };

function setPose(walk: number, run: number, phase: number, seed: number, act: number, swing = 0): Pose {
  _pose.walk = walk;
  _pose.run = run;
  _pose.phase = phase;
  _pose.seed = seed;
  _pose.act = act;
  _pose.swing = swing;
  return _pose;
}

const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Upper-arm angle along a tool swing: slow raise, brief hold, fast strike, easy recover. */
export function swingArm(u: number): { arm: number; strike: number } {
  const REST = -0.95;
  const RAISED = -2.75;
  const IMPACT = -0.5;
  if (u < 0.55) return { arm: lerp(REST, RAISED, smooth(u / 0.55)), strike: 0 };
  if (u < 0.62) return { arm: RAISED, strike: 0 };
  if (u < 0.7) {
    const k = (u - 0.62) / 0.08;
    return { arm: lerp(RAISED, IMPACT, k), strike: k };
  }
  const k = smooth((u - 0.7) / 0.3);
  return { arm: lerp(IMPACT, REST, k), strike: 1 - k };
}

/** Seconds after a colonist's last node hit during which it is still swinging at the node. */
const SWING_HOLD = 2.6;

export class Characters {
  private group = new THREE.Group();
  /** Part batches per level of detail: [near, far] (FAR_LOD_DIST). */
  private sets: [Map<PartKey, Batch>, Map<PartKey, Batch>] = [new Map(), new Map()];
  private hairSets: [Batch[], Batch[]] = [[], []];
  /** Every batch this actor owns (begin / end / hide-when-empty / dispose). */
  private all: Batch[] = [];
  /** LOD of the settler being drawn. */
  private lod: 0 | 1 = 0;
  private tools = new Map<ToolKey, Batch>();
  /** Player-only cosmetics: hat and outfit extras (instance colour = the night lift). */
  private hat: Batch;
  private outfitExtra: Batch;
  private outfitKey = '';
  /** Colonist uniform extras (body in hip space, headwear in neck space), swapped with the uniform. */
  private uniBody: Batch;
  private uniHead: Batch;
  private uniKey = '';
  private uniHasBody = false;
  private uniHasHead = false;
  private hatGlass: THREE.Mesh;
  private hatOrbit: Batch;
  private hatKey = '';
  /** Equipped hat id last synced (compared first, so no key string is built per frame). */
  private hatId: string | undefined = '\u0000';
  private vehModel = '';
  private vehSkin: string | undefined = '\u0000';
  private hatTrim = false;
  private hatOrbitSpeed = 0;
  private glassMat: THREE.Material;
  private vehicle: THREE.Mesh;
  private pet: PetActor;
  private px = 0;
  private pz = 0;
  private pSpeed = 0;
  private pPhase = 0;
  private chop = 0;
  private gatherTool: 'axe' | 'pick' = 'axe';
  private downStarT = 0;
  private looks = new Map<number, Look>();
  private looksFor: string | undefined = '\u0000';
  private playerKey = '\u0000';
  /** Colonist id → time of its last node hit, and the tool / load that goes with that node. */
  private hitT = new Map<number, number>();
  private hitTool = new Map<number, number>();
  /** Colonist id → load being carried back to the site (1 logs, 2 ore sack). */
  private carry = new Map<number, number>();
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly ctx: RenderContext) {
    ctx.scene.add(this.group);
    const mats = ctx.mats.set;
    const mk = (geo: THREE.BufferGeometry, cap: number, shadow = false) => {
      const b = new Batch(this.group, geo, mats, cap, { color: true, castShadow: shadow });
      this.all.push(b);
      return b;
    };
    const shadowParts: PartKey[] = ['torso', 'head', 'thigh'];
    for (const lod of [0, 1] as const) {
      for (const k of ['torso', 'pelvis', 'accent', 'head', 'face', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'boot', 'hairTrim'] as PartKey[]) {
        if (lod && (k === 'face' || k === 'hairTrim')) continue; // far settlers have no face; only the player trims hair
        const twice = k === 'upperArm' || k === 'forearm' || k === 'hand' || k === 'thigh' || k === 'shin' || k === 'boot';
        this.sets[lod].set(k, mk(partGeometry(k, lod), twice ? 64 : 32, shadowParts.includes(k)));
      }
      for (let i = 0; i < HAIR_STYLES; i++) this.hairSets[lod].push(mk(partGeometry(`hair${i}` as PartKey, lod), 8));
    }
    for (const k of ['axe', 'pick', 'gun', 'mug', 'logs', 'sack'] as ToolKey[]) {
      const b = new Batch(this.group, toolGeometry(k), mats, 8, {});
      this.tools.set(k, b);
      this.all.push(b);
    }
    this.hat = new Batch(this.group, emptyGeometry(), mats, 1, { color: true, castShadow: true, name: 'hat' });
    this.outfitExtra = new Batch(this.group, emptyGeometry(), mats, 1, { color: true, castShadow: false, name: 'outfit-extra' });
    this.uniBody = new Batch(this.group, emptyGeometry(), mats, 32, { name: 'uniform-body' });
    this.uniHead = new Batch(this.group, emptyGeometry(), mats, 32, { castShadow: true, name: 'uniform-head' });
    this.glassMat = ctx.mats.makeLit({ transparent: true, opacity: 0.26, depthWrite: false });
    this.hatGlass = new THREE.Mesh(emptyGeometry(), this.glassMat);
    this.hatGlass.renderOrder = 3;
    this.hatOrbit = new Batch(this.group, emptyGeometry(), mats, 3, {});
    this.all.push(this.hat, this.outfitExtra, this.uniBody, this.uniHead, this.hatOrbit);
    this.vehicle = new THREE.Mesh(vehicleGeometry('atv'), mats);
    this.vehicle.castShadow = true;
    for (const m of [this.hatGlass, this.vehicle]) {
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.group.add(m);
    }
    this.pet = new PetActor(ctx, this.group);
    const p = ctx.game.state.player;
    this.px = p.x;
    this.pz = p.z;
    const bus = ctx.game.bus;
    this.unsub.push(
      bus.on('gather:hit', (e) => {
        this.chop = 1;
        this.gatherTool = nodeTool(e.model);
      }),
      bus.on('colonist:workHit', (e) => {
        this.hitT.set(e.id, ctx.env.t);
        const tool = nodeTool(e.model) === 'axe' ? 1 : 2;
        this.hitTool.set(e.id, tool);
        this.carry.set(e.id, tool);
      }),
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

  private part(k: PartKey): Batch {
    return this.sets[this.lod].get(k)!;
  }

  /** The look of a colonist, resolved once (and again when the colonists' uniform changes). */
  private colonistLook(c: Colonist, uniformId: string | undefined): Look {
    if (uniformId !== this.looksFor) {
      this.looks.clear();
      this.looksFor = uniformId;
    }
    let l = this.looks.get(c.id);
    if (!l) {
      const def = uniformId ? this.ctx.game.data.cosmetic(uniformId) : undefined;
      l = setLook(newLook(), colonistLook(c.appearance, c.id, def?.kind === 'colonist_outfit' ? def : undefined));
      this.looks.set(c.id, l);
    }
    return l;
  }

  /**
   * Compose and push every part of one settler. (x, y, z) = ground under the feet. Leaves the joint
   * matrices of this settler in the module scratch (_hip, _neck, _foreR, _foreL) for held items and hats.
   */
  private drawCharacter(x: number, y: number, z: number, yaw: number, hs: number, look: Look, pose: Pose, t: number, trimHair: boolean): void {
    const w = pose.walk;
    const run = pose.run;
    const ph = pose.phase;
    const sd = pose.seed;
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);
    const act = pose.act;
    const still = 1 - w;

    // ---- defaults: standing / walking / running
    let rootRx = 0;
    let rootY = y;
    let rootX = x;
    let rootZ = z;
    const ampT = 0.5 + 0.28 * run;
    let thL = sn * ampT * w;
    let thR = -sn * ampT * w;
    let knL = w * (0.1 + (0.55 + 0.5 * run) * Math.max(0, -cs));
    let knR = w * (0.1 + (0.55 + 0.5 * run) * Math.max(0, cs));
    let thLz = 0;
    let thRz = 0;
    let bob = w * (0.022 + 0.035 * run) * Math.abs(cs);
    let tRx = 0.03 + 0.05 * w + 0.2 * run + Math.sin(t * 1.7 + sd) * 0.012 * still;
    let tRy = sn * (0.1 + 0.06 * run) * w;
    let tRz = Math.sin(t * 0.9 + sd) * 0.015 * still;
    let uaL = -thL * (0.85 + 0.2 * run) + Math.sin(t * 1.3 + sd) * 0.03 * still;
    let uaR = -thR * (0.85 + 0.2 * run) + Math.sin(t * 1.3 + sd + 1) * 0.03 * still;
    let uaLz = -0.07 - 0.04 * run;
    let uaRz = 0.07 + 0.04 * run;
    let faL = -(0.18 + 0.3 * w + 0.85 * run) - Math.max(0, -uaL) * 0.35;
    let faR = -(0.18 + 0.3 * w + 0.85 * run) - Math.max(0, -uaR) * 0.35;
    let nod = Math.sin(t * 2.1 + sd) * 0.025 * still + w * Math.sin(ph * 2) * 0.025 - 0.12 * run;
    let turn = Math.sin(t * 0.47 + sd) * 0.32 * still;
    let headRz = 0;

    switch (act) {
      case A_SWING: {
        const s = swingArm(pose.swing);
        uaR = s.arm;
        uaL = s.arm + 0.12;
        uaRz = 0.3;
        uaLz = -0.3;
        faR = faL = -0.3 - 0.25 * (1 - s.strike);
        tRx = 0.06 + 0.32 * s.strike - 0.06 * (1 - s.strike) * (s.arm < -2 ? 1 : 0);
        tRy = -0.18;
        thL = -0.18;
        thR = 0.16;
        knL = 0.12;
        knR = 0.06;
        nod = 0.1 + 0.15 * s.strike;
        turn = 0;
        bob = -0.02 * s.strike;
        break;
      }
      case A_TINKER: {
        uaR = -0.72 + Math.sin(t * 6.5 + sd) * 0.14;
        uaL = -0.66 + Math.sin(t * 6.5 + sd + 2.2) * 0.12;
        uaRz = 0.24;
        uaLz = -0.24;
        faR = faL = -0.95;
        tRx = 0.2;
        tRy = 0;
        nod = 0.3;
        turn = Math.sin(t * 0.8 + sd) * 0.12;
        thL = -0.08;
        thR = 0.08;
        knL = knR = 0.08;
        break;
      }
      case A_CARRY: {
        uaR = uaL = -0.42;
        uaRz = 0.32;
        uaLz = -0.32;
        faR = faL = -1.1;
        tRx = -0.05 + 0.04 * w;
        tRy *= 0.4;
        turn *= 0.3;
        break;
      }
      case A_EAT: {
        // a mug in the left hand, a slow sip now and then
        const sip = smooth(clamp((Math.sin(t * 0.9 + sd) - 0.55) * 3, 0, 1));
        uaL = lerp(-0.36, -0.82, sip);
        uaLz = lerp(-0.18, -0.34, sip);
        faL = lerp(-1.3, -2.15, sip);
        uaR = 0.04;
        faR = -0.25;
        nod = -0.12 * sip + 0.05;
        turn *= 1 - sip;
        thL = thR = 0;
        knL = knR = 0;
        break;
      }
      case A_SIT: {
        // on the ground, knees up, forearms resting on the knees
        thL = thR = -2.2;
        thLz = 0.1;
        thRz = -0.1;
        knL = knR = 2.0;
        rootY = y + (0.24 - HIP_Y) * hs;
        uaL = uaR = -0.62;
        uaLz = -0.06;
        uaRz = 0.06;
        faL = faR = -0.75;
        tRx = -0.06 + Math.sin(t * 1.6 + sd) * 0.012;
        tRy = 0;
        bob = 0;
        break;
      }
      case A_SLEEP:
      case A_DOWN: {
        // flat on the back, centred on the spot; knocked out = sprawled
        rootRx = -Math.PI / 2;
        rootY = y + 0.16 * hs;
        rootX = x + Math.sin(yaw) * 0.86 * hs;
        rootZ = z + Math.cos(yaw) * 0.86 * hs;
        const down = act === A_DOWN;
        thL = down ? -0.45 : 0.02;
        thR = 0.02;
        knL = down ? 0.9 : 0.06;
        knR = 0.06;
        thLz = down ? 0.25 : 0.04;
        thRz = -0.04;
        uaL = down ? -0.2 : 0.06;
        uaR = 0.06;
        uaLz = down ? -1.1 : -0.12;
        uaRz = down ? 0.9 : 0.12;
        faL = faR = -0.12;
        tRx = Math.sin(t * 1.1 + sd) * 0.02;
        tRy = 0;
        tRz = 0;
        nod = -0.08;
        turn = down ? 0.5 : 0.35;
        headRz = 0;
        bob = 0;
        break;
      }
      case A_RIDE: {
        thL = thR = -1.45;
        thLz = 0.12;
        thRz = -0.12;
        knL = knR = 1.3;
        uaL = uaR = -0.95;
        uaLz = -0.1;
        uaRz = 0.1;
        faL = faR = -0.55;
        tRx = 0.14;
        tRy = 0;
        nod = -0.05;
        turn *= 0.3;
        bob = 0;
        break;
      }
      case A_SHOULDER: {
        // the tool's handle rests on the right shoulder, the hand at the waist
        uaR = 0.04 + uaR * 0.12;
        uaRz = 0.14;
        faR = -1.22;
        break;
      }
      case A_AIM: {
        uaR = -1.48;
        uaRz = 0.1;
        faR = -0.12;
        uaL = -1.15;
        uaLz = -0.55;
        faL = -0.6;
        tRy = 0.18;
        tRx = 0.05;
        turn = -0.1;
        nod = 0;
        break;
      }
    }

    // ---- root (yaw frame, scaled by the settler's height)
    composeEuler(_root, rootX, rootY + bob * hs, rootZ, rootRx, yaw, 0, hs, hs, hs);
    // hips -> torso
    composeEuler(_part, 0, HIP_Y, 0, tRx, tRy, tRz);
    _hip.multiplyMatrices(_root, _part);
    this.part('torso').push(_hip, look.outfit);
    this.part('pelvis').push(_hip, look.trousers);
    this.part('accent').push(_hip, look.accent);
    // head
    composeEuler(_part, 0, NECK_Y, 0, nod, turn - tRy * 0.6, headRz);
    _neck.multiplyMatrices(_hip, _part);
    this.part('head').push(_neck, look.skin);
    if (!this.lod) this.part('face').push(_neck, WHITE);
    if (trimHair) this.part('hairTrim').push(_neck, look.hair);
    else this.hairSets[this.lod][look.style].push(_neck, look.hair);
    // arms: right at -X (the settler faces +Z), left at +X
    const ua = this.part('upperArm');
    const fa = this.part('forearm');
    const hd = this.part('hand');
    composeEuler(_part, -SHOULDER_X, SHOULDER_Y, 0, uaR, 0, uaRz);
    _sh.multiplyMatrices(_hip, _part);
    ua.push(_sh, look.outfit);
    composeEuler(_part, 0, -UPPER_ARM, 0, faR, 0, 0);
    _foreR.multiplyMatrices(_sh, _part);
    fa.push(_foreR, look.outfit);
    hd.push(_foreR, look.skin);
    composeEuler(_part, SHOULDER_X, SHOULDER_Y, 0, uaL, 0, uaLz);
    _sh.multiplyMatrices(_hip, _part);
    ua.push(_sh, look.outfit);
    composeEuler(_part, 0, -UPPER_ARM, 0, faL, 0, 0);
    _foreL.multiplyMatrices(_sh, _part);
    fa.push(_foreL, look.outfit);
    hd.push(_foreL, look.skin);
    // legs (from the root, so the torso can lean without swinging them)
    const th = this.part('thigh');
    const sh = this.part('shin');
    const bt = this.part('boot');
    composeEuler(_part, -HIP_X, HIP_Y, 0, thR, 0, thRz);
    _th.multiplyMatrices(_root, _part);
    th.push(_th, look.trousers);
    composeEuler(_part, 0, -THIGH, 0, knR, 0, 0);
    _kn.multiplyMatrices(_th, _part);
    sh.push(_kn, look.trousers);
    bt.push(_kn, look.boots);
    composeEuler(_part, HIP_X, HIP_Y, 0, thL, 0, thLz);
    _th.multiplyMatrices(_root, _part);
    th.push(_th, look.trousers);
    composeEuler(_part, 0, -THIGH, 0, knL, 0, 0);
    _kn.multiplyMatrices(_th, _part);
    sh.push(_kn, look.trousers);
    bt.push(_kn, look.boots);
  }

  /** Push a held item: `fore` = the holding forearm's matrix; the item is turned by rx at the grip. */
  private hold(tool: ToolKey, fore: THREE.Matrix4, rx: number): void {
    composeEuler(_part, 0, GRIP_Y, 0, rx, 0, 0);
    _m.multiplyMatrices(fore, _part);
    this.tools.get(tool)!.push(_m);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const t = env.t;
    const st = ctx.game.state;
    for (const b of this.all) b.begin();
    const cosm = st.liveops.cosmetics.equipped;

    // ------------------------------------------------------------- player (always the near parts)
    this.lod = 0;
    const p = st.player;
    const vx = (p.x - this.px) / Math.max(dt, 1e-3);
    const vz = (p.z - this.pz) / Math.max(dt, 1e-3);
    this.px = p.x;
    this.pz = p.z;
    const speed = Math.min(Math.hypot(vx, vz), 40);
    this.pSpeed += (speed - this.pSpeed) * (1 - Math.exp(-dt * 10));
    const walk = clamp(this.pSpeed / 2.4, 0, 1);
    const run = clamp((this.pSpeed - 3.2) / 3, 0, 1);
    this.pPhase += dt * this.pSpeed * lerp(5.2, 3.5, run);
    if (this.pPhase > Math.PI * 2000) this.pPhase -= Math.PI * 2000;
    this.chop = Math.max(0, this.chop - dt * 2.6);
    const ground = ctx.heightAt(p.x, p.z);
    const down = st.playTime < p.downUntil;
    // the player's look (outfit cosmetic) with the night lift
    const outfitId = cosm.outfit;
    const lift = playerNightLift(env.night);
    if (outfitId !== this.playerKey) {
      this.playerKey = outfitId ?? '';
      const def = outfitId ? ctx.game.data.cosmetic(outfitId) : undefined;
      setLook(_pBase, playerLook(def?.kind === 'outfit' ? def : undefined));
      const extra = def?.kind === 'outfit' ? outfitBodyGeometry(def.id, def.color ?? '#888888', def.accent ?? def.color ?? '#888888') : null;
      this.outfitKey = extra ? def!.id : '';
      if (extra) this.outfitExtra.setGeometry(extra);
    }
    _lift.setScalar(lift);
    _pLook.skin.copy(_pBase.skin).multiplyScalar(lift);
    _pLook.hair.copy(_pBase.hair).multiplyScalar(lift);
    _pLook.outfit.copy(_pBase.outfit).multiplyScalar(lift);
    _pLook.accent.copy(_pBase.accent).multiplyScalar(lift);
    _pLook.trousers.copy(_pBase.trousers).multiplyScalar(lift);
    _pLook.boots.copy(_pBase.boots).multiplyScalar(lift);
    _pLook.style = _pBase.style;
    // hat
    this.syncHat(cosm.hat);
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
    if (vehModel && !down) {
      const skinId = cosm.vehicle_skin;
      if (vehModel !== this.vehModel || skinId !== this.vehSkin) {
        this.vehModel = vehModel;
        this.vehSkin = skinId;
        const skin = skinId ? ctx.game.data.cosmetic(skinId) : undefined;
        this.vehicle.geometry = skin?.kind === 'vehicle_skin' && skin.color ? vehicleGeometry(vehModel, paintFromSkin(skin.color, skin.accent ?? skin.color), skin.id) : vehicleGeometry(vehModel);
      }
      const hover = vehicleHovers(vehModel);
      const vy = ground + (hover ? 0.35 + Math.sin(t * 3) * 0.08 : 0);
      composeEuler(this.vehicle.matrix, p.x, vy, p.z, hover ? Math.sin(t * 2) * 0.03 : 0, p.rot, hover ? -vx * 0.01 : 0);
      this.vehicle.visible = true;
      if (hover && inView(env, p.x, p.z) && Math.random() < dt * 25) ctx.particles.emit('glow', p.x + (Math.random() - 0.5) * 0.8, vy - 0.1, p.z + (Math.random() - 0.5) * 1.5, 0, -0.5, 0, 0.3, 0.14, '#5ef2ff');
      if (!hover && this.pSpeed > 1 && Math.random() < dt * 8) ctx.particles.dust(p.x - Math.sin(p.rot), ground, p.z - Math.cos(p.rot), 1, 0.4);
      setPose(0, 0, 0, 0, A_RIDE);
      this.drawCharacter(p.x, vy + vehicleSeatY(vehModel) - HIP_Y + 0.04, p.z, p.rot, 1, _pLook, _pose, t, this.hatTrim);
      this.drawHat(t);
    } else {
      let act = A_STAND;
      let swing = 0;
      if (down) act = A_DOWN;
      else if (aliensNear) act = A_AIM;
      else if (this.chop > 0) {
        act = A_SWING;
        swing = 0.55 + (1 - this.chop) * 0.45;
      } else if (ctx.game.input.interactHeld) {
        act = A_SWING;
        swing = (t * 1.25) % 1;
      }
      if (act === A_STAND && p.equip.tool) act = A_SHOULDER;
      const moving = act === A_STAND || act === A_AIM || act === A_SHOULDER ? walk : act === A_SWING ? walk * 0.5 : 0;
      setPose(moving, act === A_STAND || act === A_SHOULDER ? run : 0, this.pPhase, 0.3, act, swing);
      this.drawCharacter(p.x, ground, p.z, p.rot, 1, _pLook, _pose, t, this.hatTrim);
      this.drawHat(t);
      if (act === A_AIM) this.hold('gun', _foreR, Math.PI / 2 - 0.1);
      else if (act === A_SWING) this.hold(this.gatherTool, _foreR, 2.7);
      else if (act === A_SHOULDER) this.hold(this.gatherTool, _foreR, 0.55);
      if (down) {
        this.downStarT += dt;
        if (this.downStarT > 0.35) {
          this.downStarT = 0;
          ctx.particles.emit('glow', p.x + (Math.random() - 0.5) * 0.8, ground + 1.0, p.z + (Math.random() - 0.5) * 0.8, 0, 0.8, 0, 0.8, 0.14, '#ffd84a', { curve: 'grow' });
        }
      }
      if (walk > 0.3 && !down && inView(env, p.x, p.z, -30) && Math.random() < dt * 6 * walk) ctx.particles.dust(p.x, ground, p.z, 1, 0.3, '#d8c8a0');
    }
    // pet
    this.pet.update(dt, cosm.pet, p.x, p.z, p.rot, this.pSpeed, true);

    // ------------------------------------------------------------- colonists
    const uniform = cosm.colonist_outfit;
    this.syncUniform(uniform);
    const list = st.colonists.list;
    const raid = st.combat.phase === 'attack';
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.activity === 'sheltering' || c.away) continue; // indoors, or out on an expedition
      if (!inView(env, c.x, c.z, -20)) continue;
      // rough frustum: skip things behind the camera
      if ((c.x - env.camX) * env.fwdX + (c.z - env.camZ) * env.fwdZ < -6) continue;
      this.drawColonist(c, t, uniform, raid);
    }

    for (const b of this.all) {
      b.end();
      b.mesh.visible = b.count > 0; // an empty batch costs no draw call
    }
  }

  /** Hat cosmetic → meshes (geometry swapped only when the equipped hat changes). */
  private syncHat(id: string | undefined): void {
    if (id === this.hatId) return;
    this.hatId = id;
    const def = id ? this.ctx.game.data.cosmetic(id) : undefined;
    const spec = def?.kind === 'hat' ? hatSpec(def.id) : undefined;
    const key = spec && def ? `${def.id}|${def.color}|${def.accent}` : '';
    if (key === this.hatKey) return;
    this.hatKey = key;
    this.hatTrim = spec?.hair === 'trim';
    this.hatOrbitSpeed = spec?.orbit?.speed ?? 0;
    if (!spec || !def) {
      this.hatGlass.visible = false;
      return;
    }
    const g = hatGeometry(def.id, def.color ?? '#8a6a45', def.accent ?? '#4a3527');
    this.hat.setGeometry(g.main);
    this.hatGlass.geometry = g.glass ?? this.hatGlass.geometry;
    this.hatGlass.visible = !!g.glass;
    if (g.orbit) this.hatOrbit.setGeometry(g.orbit);
  }

  /** Colonist uniform → instanced extras (geometry swapped only when the equipped uniform changes). */
  private syncUniform(id: string | undefined): void {
    if ((id ?? '') === this.uniKey) return;
    this.uniKey = id ?? '';
    const def = id ? this.ctx.game.data.cosmetic(id) : undefined;
    const ok = def?.kind === 'colonist_outfit';
    const c = def?.color ?? '#888888';
    const a = def?.accent ?? c;
    const body = ok ? uniformBodyGeometry(def!.id, c, a) : null;
    const head = ok ? uniformHeadGeometry(def!.id, c, a) : null;
    this.uniHasBody = !!body;
    this.uniHasHead = !!head;
    if (body) this.uniBody.setGeometry(body);
    if (head) this.uniHead.setGeometry(head);
  }

  /** Place the hat on the head just drawn (_neck). */
  private drawHat(t: number): void {
    if (this.outfitKey) this.outfitExtra.push(_hip, _lift);
    if (!this.hatKey) {
      this.hatGlass.visible = false;
      return;
    }
    this.hat.push(_neck, _lift);
    if (this.hatGlass.visible) this.hatGlass.matrix.copy(_neck);
    if (this.hatOrbitSpeed) {
      for (let i = 0; i < 3; i++) {
        composeEuler(_part, 0, Math.sin(t * 2.3 + i * 2.1) * 0.025, 0, 0, t * this.hatOrbitSpeed + (i * Math.PI * 2) / 3, 0);
        _m.multiplyMatrices(_neck, _part);
        this.hatOrbit.push(_m);
      }
    }
  }

  private drawColonist(c: Colonist, t: number, uniform: string | undefined, raid: boolean): void {
    const ctx = this.ctx;
    const env = ctx.env;
    const look = this.colonistLook(c, uniform);
    const hs = clamp(c.appearance?.height ?? 1, 0.85, 1.15);
    const y = ctx.heightAt(c.x, c.z);
    const dx = c.x - env.camX;
    const dy = y + 1 - env.camY;
    const dz = c.z - env.camZ;
    this.lod = dx * dx + dy * dy + dz * dz > FAR_LOD_DIST * FAR_LOD_DIST ? 1 : 0;
    const act = c.activity;
    const seed = c.id * 1.7;
    let pose = A_STAND;
    let swing = 0;
    let walk = 0;
    let load = 0;
    let tool: ToolKey | null = null;
    switch (act) {
      case 'walking': {
        walk = 1;
        load = this.carry.get(c.id) ?? 0;
        if (load) pose = A_CARRY;
        break;
      }
      case 'working': {
        const since = t - (this.hitT.get(c.id) ?? -99);
        if (since < SWING_HOLD) {
          pose = A_SWING;
          swing = (t * 1.1 + seed * 0.37) % 1;
          tool = this.hitTool.get(c.id) === 2 ? 'pick' : 'axe';
        } else {
          pose = A_TINKER;
          if (this.carry.size) this.carry.delete(c.id); // back at the site: the load is delivered
        }
        break;
      }
      case 'relaxing':
        pose = A_SIT;
        break;
      case 'sleeping':
        pose = A_SLEEP;
        break;
      case 'eating':
        pose = A_EAT;
        break;
    }
    if (act !== 'walking' && act !== 'working' && this.carry.size) this.carry.delete(c.id);
    const run = raid ? 1 : 0.35;
    const phase = t * (raid ? 18 : 13.5) + seed;
    setPose(walk, walk ? run : 0, phase, seed, pose, swing);
    this.drawCharacter(c.x, y, c.z, c.rot || 0, hs, look, _pose, t, false);
    if (this.uniHasBody) this.uniBody.push(_hip);
    if (this.uniHasHead) this.uniHead.push(_neck);
    if (tool) this.hold(tool, _foreR, 2.7);
    else if (pose === A_EAT) this.hold('mug', _foreL, 0.15);
    else if (pose === A_CARRY) this.tools.get(load === 1 ? 'logs' : 'sack')!.push(_hip);
    if (act === 'sleeping' && Math.random() < ctx.env.dt * 0.8 && inView(ctx.env, c.x, c.z, -40)) {
      ctx.particles.emit('glow', c.x + 0.3, y + 1.0, c.z, 0.2, 0.6, 0, 1.4, 0.1, '#9fdcff', { curve: 'grow' });
    }
    if (pose === A_TINKER && Math.random() < ctx.env.dt * 1.5 && inView(ctx.env, c.x, c.z, -40)) {
      ctx.particles.sparks(c.x + Math.sin(c.rot || 0) * 0.55, y + 1.0, c.z + Math.cos(c.rot || 0) * 0.55, 1, '#ffd36b', 2);
    }
  }

  colonistInfo(id: number): { x: number; y: number; z: number; radius: number; height: number } | null {
    const c = this.ctx.game.state.colonists.list.find((x) => x.id === id);
    if (!c) return null;
    return { x: c.x, y: this.ctx.heightAt(c.x, c.z), z: c.z, radius: 0.6, height: FIGURE_H };
  }

  pick(ray: THREE.Ray, maxT: number): { id: number; t: number } | null {
    let best = -1;
    let bestT = maxT;
    for (const c of this.ctx.game.state.colonists.list) {
      if (c.activity === 'sheltering' || c.away) continue;
      const t = raySphere(ray.origin, ray.direction, c.x, this.ctx.heightAt(c.x, c.z) + 1.0, c.z, 0.95);
      if (t >= 0 && t < bestT) {
        bestT = t;
        best = c.id;
      }
    }
    return best >= 0 ? { id: best, t: bestT } : null;
  }

  /** The pet (Photo Mode / QA). */
  petInfo(): { x: number; z: number; visible: boolean } {
    return this.pet.position();
  }

  dispose(): void {
    for (const u of this.unsub) u();
    for (const b of this.all) b.dispose();
    this.pet.dispose();
    this.glassMat.dispose();
    this.ctx.scene.remove(this.group);
  }
}
