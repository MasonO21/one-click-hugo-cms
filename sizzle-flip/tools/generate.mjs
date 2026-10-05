// Procedural level generator with automated solvability/par verification.
// Usage: node tools/generate.mjs [--from 0 --to 200 --workers 4 --out src/levels/data.js]
import { OBJECTS, WORLDS } from '../src/objects.js';
import { PHYS } from '../src/physics.js';
import { solve, replaySolution } from './solver.mjs';
import { NAMES } from './names.mjs';
import { HANDMADE } from './handmade.mjs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import fs from 'node:fs';
import os from 'node:os';

const W = PHYS.W;

// ------------------------------------------------------------------ world recipes
// k = level index within world at which an element starts appearing.
const FLOOR_DRESSING = {
  kitchen: ['counter', 'fridge', 'cabinet', 'counter'],
  living: ['couch', 'armchair', 'piano', 'bookshelf', 'lamp', 'table'],
  backyard: ['picnictable', 'cooler', 'stump', 'fence'],
  bathroom: ['sink', 'bathtub', 'toilet', 'cabinet'],
  office: ['desk', 'filingcabinet', 'watercooler', 'vending'],
  toyroom: ['toybox', 'rocking', 'piano', 'cabinet'],
  market: ['storeshelf', 'freezer', 'storeshelf'],
  beach: [], space: [], heaven: [],
};

const RECIPES = {
  kitchen: {
    ground: ['counter', 'cabinet'], wall: 'shelf', shelfColor: '#c98a4b', groundColor: ['#86b8a8', '#e8a87c', '#9fc2b4', '#f2d06b'],
    stones: [['books', 0, 3], ['cuttingboard', 0, 2], ['microwave', 0, 2], ['plate', 0, 1], ['mug', 2, 1], ['cereal', 5, 1], ['jar', 8, 1], ['butter', 6, 2]],
    mechs: [
      { k: 3, kind: 'launcher', t: 'toaster', tip: '<b>Toasters</b> pop you sky-high!' },
      { k: 6, kind: 'stone', t: 'butter', tip: '<b>Butter</b> is slippery — careful landing!' },
      { k: 9, kind: 'hazard', t: 'knifeblock', tip: 'Avoid the <b>knives</b>!' },
      { k: 11, kind: 'hazard', t: 'pot', tip: 'A <b>boiling pot</b> — don\'t fall in!' },
      { k: 12, kind: 'timed', t: 'burner', tip: '<b>Burners</b> flare on a timer. Wait for it…' },
      { k: 7, kind: 'blocker', t: 'fridge' },
      { k: 4, kind: 'blocker', t: 'teapot' },
      { k: 15, kind: 'hazard', t: 'blender' },
      { k: 14, kind: 'stone', t: 'watermelon' },
    ],
  },
  living: {
    ground: ['cabinet', 'table'], wall: 'shelf', shelfColor: '#a8693a', groundColor: ['#c98fb8', '#8fb1d9', '#d9b38f'],
    stones: [['tv', 0, 2], ['books', 0, 2], ['plant', 3, 1], ['cushion', 0, 2], ['plate', 5, 1], ['beanbag', 11, 2]],
    mechs: [
      { k: 0, kind: 'groundstone', t: 'couch', tip: '<b>Couch cushions</b> are bouncy!' },
      { k: 2, kind: 'groundstone', t: 'armchair' },
      { k: 4, kind: 'hazard', t: 'cat', tip: 'Let sleeping <b>cats</b> lie!' },
      { k: 7, kind: 'rotor', t: 'clock', tip: 'Ride the <b>clock hand</b> — it turns!' },
      { k: 9, kind: 'hazard', t: 'fishbowl' },
      { k: 11, kind: 'stone', t: 'beanbag', tip: '<b>Beanbags</b> are sticky. No bounce!' },
      { k: 14, kind: 'groundstone', t: 'fireplace', tip: 'Stay out of the <b>fireplace</b>!' },
      { k: 16, kind: 'wind', t: 'deskfan', tip: '<b>Fans</b> blow you sideways.' },
      { k: 5, kind: 'blocker', t: 'lamp' }, { k: 6, kind: 'blocker', t: 'bookshelf' }, { k: 10, kind: 'groundstone', t: 'piano' }, { k: 12, kind: 'blocker', t: 'globe' },
    ],
  },
  backyard: {
    ground: ['picnictable', 'pillar'], wall: 'branch', shelfColor: '#8a5a32', groundColor: ['#b3824f'],
    stones: [['cooler', 0, 2], ['stump', 0, 2], ['lawnchair', 2, 1], ['trampoline', 1, 1]],
    mechs: [
      { k: 0, kind: 'note', tip: 'Drop it on the lawn and the <b>dog</b> gets it!' },
      { k: 1, kind: 'groundstone', t: 'trampoline', tip: '<b>Trampolines</b> launch you high!' },
      { k: 3, kind: 'mover', t: 'swing', tip: '<b>Swings</b> move — time your flip!' },
      { k: 5, kind: 'blocker', t: 'fence' },
      { k: 6, kind: 'wind', t: 'leafblower', tip: '<b>Leaf blowers</b> push you around.' },
      { k: 8, kind: 'lift', t: 'sprinkler', tip: '<b>Sprinklers</b> blast you upward!' },
      { k: 10, kind: 'hazard', t: 'dog', tip: 'Good boy wants your <b>sausage</b>. Don\'t touch!' },
      { k: 12, kind: 'hazard', t: 'gnome' },
      { k: 13, kind: 'hazard', t: 'birdbath' },
      { k: 14, kind: 'timedstone', t: 'grill', tip: 'The <b>grill</b> flares up. Time it!' },
    ],
  },
  bathroom: {
    ground: ['cabinet'], wall: 'shelf', shelfColor: '#cfe6ee', groundColor: ['#ffffff', '#f2d4dc', '#cde8f0'],
    stones: [['towelrack', 0, 2], ['mirrorcab', 0, 1], ['soap', 0, 2], ['scale', 4, 1]],
    mechs: [
      { k: 0, kind: 'stone', t: 'soap', tip: '<b>Soap</b> is super slippery!' },
      { k: 2, kind: 'groundstone', t: 'sink' },
      { k: 3, kind: 'bouncer', t: 'rubberduck', tip: '<b>Rubber ducks</b> are bouncy.' },
      { k: 5, kind: 'downwind', t: 'showerhead', tip: 'The <b>shower</b> pushes you down.' },
      { k: 8, kind: 'wind', t: 'hairdryer', tip: '<b>Hair dryers</b> blow hot air!' },
      { k: 9, kind: 'groundstone', t: 'toilet', tip: 'Land on the tank, NOT in the <b>bowl</b>!' },
      { k: 11, kind: 'groundstone', t: 'bathtub', tip: 'Walk the <b>bathtub</b> rim — no swimming!' },
      { k: 13, kind: 'stone', t: 'scale' },
      { k: 6, kind: 'blocker', t: 'toiletpaper' },
    ],
  },
  office: {
    ground: ['desk', 'cabinet'], wall: 'shelf', shelfColor: '#9b9fa6', groundColor: ['#b9a58a', '#c8ccd2'],
    stones: [['printer', 0, 2], ['papers', 0, 2], ['stapler', 2, 1], ['books', 0, 1], ['microwave', 6, 1]],
    mechs: [
      { k: 0, kind: 'note', tip: 'Welcome to work. Flip responsibly.' },
      { k: 2, kind: 'mover', t: 'officechair', tip: '<b>Office chairs</b> roll around!' },
      { k: 4, kind: 'wind', t: 'deskfan', tip: '<b>Desk fans</b> blow you sideways.' },
      { k: 6, kind: 'hazard', t: 'shredder', tip: 'Keep away from the <b>shredder</b>!' },
      { k: 9, kind: 'conveyor', t: 'conveyor', tip: '<b>Conveyors</b> carry you along.' },
      { k: 12, kind: 'mover', t: 'hoverbot', tip: 'Hitch a ride on the <b>robot</b>.' },
      { k: 14, kind: 'rotor', t: 'clock' },
      { k: 5, kind: 'blocker', t: 'watercooler' }, { k: 7, kind: 'blocker', t: 'vending' }, { k: 3, kind: 'groundstone', t: 'filingcabinet' }, { k: 8, kind: 'blocker', t: 'monitor' },
    ],
  },
  toyroom: {
    ground: ['cabinet'], wall: 'shelf', shelfColor: '#ff9fb2', groundColor: ['#7fc8f8', '#ffd166', '#ef8ad8', '#8ee08a'],
    stones: [['block', 0, 2], ['toybox', 0, 2], ['xylophone', 2, 1], ['books', 0, 1]],
    mechs: [
      { k: 1, kind: 'bouncer', t: 'drum', tip: '<b>Drums</b> bounce you up!' },
      { k: 3, kind: 'launcher', t: 'jackbox', tip: 'Wind up the <b>jack-in-the-box</b>!' },
      { k: 5, kind: 'mover', t: 'toytrain', tip: 'All aboard the <b>toy train</b>!' },
      { k: 7, kind: 'orbit', t: 'gondola', tip: '<b>Balloon baskets</b> float in circles.' },
      { k: 10, kind: 'rotor', t: 'pinwheel', tip: 'Mind the spinning <b>pinwheel</b>!' },
      { k: 13, kind: 'bouncer', t: 'trampoline' },
      { k: 15, kind: 'hazard', t: 'cat' },
      { k: 4, kind: 'blocker', t: 'rocking' }, { k: 6, kind: 'bouncer', t: 'teddy' }, { k: 9, kind: 'bouncer', t: 'beachball' },
    ],
  },
  market: {
    ground: ['storeshelf'], wall: 'shelf', shelfColor: '#d0d4d8', groundColor: ['#e05a47'],
    stones: [['crate', 0, 2], ['cans', 0, 1], ['register', 3, 1], ['cereal', 0, 1], ['jar', 4, 1]],
    mechs: [
      { k: 2, kind: 'conveyor', t: 'conveyor', tip: '<b>Checkout belts</b> keep moving!' },
      { k: 4, kind: 'mover', t: 'cart', tip: 'Land in the rolling <b>cart</b>!' },
      { k: 6, kind: 'groundstone', t: 'freezer', tip: 'The <b>freezer</b> top is icy!' },
      { k: 8, kind: 'hazard', t: 'slicer', tip: 'The <b>deli slicer</b> is no joke.' },
      { k: 10, kind: 'groundstone', t: 'fishtank', tip: 'Don\'t feed the <b>lobsters</b>!' },
      { k: 13, kind: 'stone', t: 'soda' },
      { k: 5, kind: 'blocker', t: 'ketchup' }, { k: 7, kind: 'blocker', t: 'mustard' }, { k: 9, kind: 'blocker', t: 'vending' },
    ],
  },
  beach: {
    ground: [], wall: null, float: true, shelfColor: '#9a6b42', groundColor: ['#9a6b42'],
    stones: [['cooler', 0, 2], ['crate', 0, 2], ['sandcastle', 2, 1], ['surfboard', 4, 1]],
    mechs: [
      { k: 0, kind: 'note', tip: 'The sea is <b>soggy</b>. Stay dry!' },
      { k: 1, kind: 'bouncer', t: 'beachball', tip: '<b>Beach balls</b> bounce!' },
      { k: 3, kind: 'patrol', t: 'crab', tip: '<b>Crabs</b> pinch. Watch their path!' },
      { k: 5, kind: 'groundstone', t: 'umbrella', tip: 'Bounce off the <b>umbrella</b>!' },
      { k: 7, kind: 'flyer', t: 'seagull', tip: '<b>Seagulls</b> steal sausages!' },
      { k: 9, kind: 'bob', t: 'buoy', tip: '<b>Buoys</b> bob on the waves.' },
      { k: 12, kind: 'groundstone', t: 'palm' },
      { k: 6, kind: 'groundstone', t: 'lifeguard' }, { k: 10, kind: 'cup', t: 'bucket' }, { k: 14, kind: 'timedstone', t: 'grill' },
    ],
  },
  space: {
    ground: [], wall: null, float: true, shelfColor: '#8a93a6', groundColor: ['#8a93a6'],
    stones: [['spacecrate', 0, 3], ['asteroid', 0, 1], ['crate', 2, 1]],
    mechs: [
      { k: 0, kind: 'note', tip: '<b>Low gravity!</b> Flips float much further.' },
      { k: 2, kind: 'mover', t: 'hoverbot', tip: 'Hop onto the <b>hover-bot</b>.' },
      { k: 4, kind: 'rotor', t: 'satellite', tip: '<b>Satellites</b> spin. Time your landing.' },
      { k: 6, kind: 'laser', t: 'laser', tip: '<b>Lasers</b> switch on and off. Wait!' },
      { k: 8, kind: 'lift', t: 'gravlift', tip: '<b>Gravity lifts</b> float you up!' },
      { k: 10, kind: 'orbitufo', t: 'ufo', tip: 'Catch a ride on the <b>UFO</b>.' },
      { k: 12, kind: 'blocker', t: 'rocket' }, { k: 5, kind: 'stone', t: 'moonrock' },
    ],
  },
  heaven: {
    ground: [], wall: null, float: true, cloud: true, shelfColor: '#ffffff', groundColor: ['#ffffff'],
    stones: [['fries', 0, 1], ['burger', 0, 1], ['pickle', 8, 1], ['cottoncandy', 10, 1]],
    mechs: [
      { k: 0, kind: 'note', tip: '<b>Clouds</b> are soft. Welcome to Hot Dog Heaven!' },
      { k: 2, kind: 'bouncer', t: 'donut', tip: '<b>Donuts</b> are springy!' },
      { k: 4, kind: 'hazard', t: 'fork', tip: 'Beware the <b>giant fork</b>!' },
      { k: 6, kind: 'cup', t: 'soda' },
      { k: 8, kind: 'hazard', t: 'fryer', tip: 'The <b>deep fryer</b> means game over.' },
      { k: 10, kind: 'stone', t: 'cottoncandy', tip: '<b>Cotton candy</b> is sticky.' },
      { k: 12, kind: 'stone', t: 'pickle', tip: '<b>Pickles</b> are slippery.' },
      { k: 14, kind: 'lift', t: 'gravlift' },
      { k: 16, kind: 'orbit', t: 'gondola' },
      { k: 5, kind: 'blocker', t: 'ketchup' }, { k: 7, kind: 'blocker', t: 'mustard' },
    ],
  },
};

export const RECIPES_EXPORT = RECIPES;

// ------------------------------------------------------------------ helpers
function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function shapesOf(inst) {
  const T = OBJECTS[inst.t];
  return T.build ? T.build(inst) : T.shapes;
}

// Local AABB of solid (non-sensor) shapes, or including sensors.
function localBox(inst, withSensors = false) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (const s of shapesOf(inst)) {
    if (s.sensor && !withSensors) continue;
    if (s.type === 'box') {
      const a = s.a || 0, ca = Math.cos(a), sa = Math.sin(a);
      for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add(s.x + px * s.w / 2 * ca - py * s.h / 2 * sa, s.y + px * s.w / 2 * sa + py * s.h / 2 * ca);
    } else if (s.type === 'circle') { add(s.x - s.r, s.y - s.r); add(s.x + s.r, s.y + s.r); }
    else if (s.type === 'capsule') { add(Math.min(s.x1, s.x2) - s.r, Math.min(s.y1, s.y2) - s.r); add(Math.max(s.x1, s.x2) + s.r, Math.max(s.y1, s.y2) + s.r); }
    else for (const p of s.pts) add(p[0], p[1]);
  }
  return [x0, y0, x1, y1];
}

function worldBox(inst, withSensors = false) {
  const [x0, y0, x1, y1] = localBox(inst, withSensors);
  const s = inst.s || 1, f = inst.flip ? -1 : 1;
  const xa = inst.x + x0 * s * f, xb = inst.x + x1 * s * f;
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y0: inst.y + y0 * s, y1: inst.y + y1 * s };
}

function landStrip(inst) {
  const T = OBJECTS[inst.t];
  let land = T.land && T.land.length ? T.land : null;
  if (!land) {
    const b = localBox(inst);
    land = [[b[0] + 10, b[2] - 10, b[1]]];
  }
  let best = land[0];
  for (const l of land) if (l[1] - l[0] > best[1] - best[0]) best = l;
  const s = inst.s || 1, f = inst.flip ? -1 : 1;
  const xa = inst.x + best[0] * s * f, xb = inst.x + best[1] * s * f;
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), y: inst.y + best[2] * s };
}

// Position an instance so its landing strip centre sits at (x, yTop).
function placeOnStrip(inst, x, yTop) {
  inst.x = 0; inst.y = 0;
  const l = landStrip(inst);
  inst.x = x - (l.x0 + l.x1) / 2;
  inst.y = yTop - l.y;
  return inst;
}

function placeOnBottom(inst, x, yBottom) {
  inst.x = x; inst.y = 0;
  const b = worldBox(inst);
  inst.y = yBottom - b.y1;
  return inst;
}

function overlaps(a, b, gap) {
  return !(a.x1 + gap <= b.x0 || b.x1 + gap <= a.x0 || a.y1 + gap <= b.y0 || b.y1 + gap <= a.y0);
}

// ------------------------------------------------------------------ level builder
export class Builder {
  constructor(index, seed) {
    this.index = index;
    this.w = Math.floor(index / 20);
    this.k = index % 20;
    this.world = WORLDS[this.w];
    this.R = RECIPES[this.world.id];
    this.rng = mulberry(seed);
    this.seed = seed;
    this.objects = [];
    this.boxes = []; // {box, inst, group}
    this.g = this.world.gravity;
    this.tips = [];
  }
  r() { return this.rng(); }
  pick(a) { return a[Math.floor(this.rng() * a.length)]; }
  range(a, b) { return a + (b - a) * this.rng(); }

  free(box, gap = 18, ignore = []) {
    if (box.x0 < -2 || box.x1 > W + 2) return false;
    if (box.y1 > this.H + 1) return false;
    for (const o of this.boxes) {
      if (ignore.includes(o.inst)) continue;
      if (overlaps(box, o.box, gap)) return false;
    }
    if (this.corridor && overlaps(box, this.corridor, 0) && !ignore.includes('corridor')) return false;
    return true;
  }

  add(inst, opts = {}) {
    const box = opts.box || worldBox(inst);
    this.objects.push(inst);
    this.boxes.push({ box, inst });
    return inst;
  }

  tryAdd(inst, gap = 18, ignore = []) {
    const box = worldBox(inst);
    if (!this.free(box, gap, ignore)) return null;
    return this.add(inst, { box });
  }

  // Put supports under an object whose solid bottom is at box.y1.
  support(inst, box) {
    const H = this.H;
    const gap = H - box.y1;
    if (gap < 6) return true;
    const R = this.R;
    const objW = box.x1 - box.x0;
    const cx = (box.x0 + box.x1) / 2;
    if (R.float) {
      if (R.cloud) {
        const w = clamp(objW + 70, 180, 360);
        const c = { t: 'cloud', x: cx, y: box.y1 + 25, w };
        const cb = worldBox(c);
        if (this.free(cb, 8, [inst])) { this.add(c, { box: cb }); return true; }
        return false;
      }
      return true; // space: things float
    }
    // ground furniture
    if (R.ground.length && gap <= 430 && gap >= 90 && this.r() < 0.8) {
      const t = this.pick(R.ground);
      let w = clamp(objW + this.range(20, 140), t === 'pillar' ? 50 : 150, t === 'pillar' ? 70 : 320);
      if (t === 'pillar') w = this.range(46, 64);
      const g = { t, x: clamp(cx, w / 2 + 2, W - w / 2 - 2), y: H - gap / 2, w, h: gap, color: this.pick(R.groundColor) };
      if (t === 'counter') g.y = H - gap / 2; // counter top included in h
      const gb = worldBox(g);
      gb.y0 = Math.max(gb.y0, box.y1 - 2);
      if (this.free(gb, 14, [inst])) { this.add(g, { box: gb }); return true; }
    }
    if (R.ground.includes('pillar') && !R.wall) {
      // beach: a slim wooden pier post down into the water — or onto whatever sturdy thing is below
      for (const off of [0, -0.3, 0.3, -0.42, 0.42]) {
        const px = cx + off * objW;
        const pb = { x0: px - 14, x1: px + 14, y0: box.y1 - 2, y1: H };
        // find the first solid thing below (not the pan/stove/hazards)
        let stopY = H, blocked = false;
        for (const o of this.boxes) {
          if (o.inst === inst) continue;
          if (o.box.x1 + 6 <= pb.x0 || pb.x1 + 6 <= o.box.x0 || o.box.y1 <= pb.y0) continue;
          const T = OBJECTS[o.inst.t];
          const sturdy = ['plat', 'support', 'cup'].includes(T.role) && !o.inst.move && o.inst.t !== 'pan';
          if (!sturdy) { if (o.box.y0 < stopY) blocked = true; continue; }
          if (o.box.y0 < stopY) { stopY = o.box.y0; blocked = false; }
        }
        // re-check: anything non-sturdy between the object and stopY?
        const seg = { x0: pb.x0, x1: pb.x1, y0: pb.y0, y1: stopY };
        if (blocked || !this.free(seg, 4, [inst, ...this.boxes.filter(o => o.box.y0 >= stopY - 1).map(o => o.inst)])) continue;
        if (this.corridor && overlaps(seg, this.corridor, 0)) continue;
        // never wall in the frying pan: keep tall posts well clear of the stove
        if (this.start && Math.abs(px - this.start[0]) < 250 && stopY > this.start[1] - 260) continue;
        const len = stopY - box.y1 + (stopY === H ? 80 : 4);
        const g = { t: 'pillar', x: px, y: box.y1 - 2 + len / 2, w: 26, h: len, color: R.shelfColor };
        this.add(g, { box: seg });
        return true;
      }
      return false;
    }
    if (R.wall) {
      const w = clamp(objW + this.range(20, 70), 120, 320);
      const sh = { t: R.wall, x: clamp(cx, w / 2 + 2, W - w / 2 - 2), y: box.y1 + (R.wall === 'branch' ? 11 : 9), w, color: R.shelfColor };
      const sb = worldBox(sh);
      sb.y1 += 40; // brackets
      if (this.free(sb, 12, [inst])) { this.add(sh, { box: sb }); return true; }
    }
    return false;
  }

  // Place a landing object (with support) so its strip is at (x, yTop). Returns inst or null.
  stone(t, x, yTop, extra = {}) {
    const inst = { t, ...extra };
    if (OBJECTS[t].stretch && !inst.w) inst.w = OBJECTS[t].w;
    if (inst.flip === undefined) inst.flip = this.r() < 0.5;
    placeOnStrip(inst, x, yTop);
    const box = worldBox(inst);
    if (box.x0 < 4) { inst.x += 4 - box.x0; }
    if (box.x1 > W - 4) { inst.x -= box.x1 - (W - 4); }
    const b2 = worldBox(inst);
    if (!this.free(b2, 22)) return null;
    this.add(inst, { box: b2 });
    if (!this.support(inst, b2)) { this.remove(inst); return null; }
    return inst;
  }

  remove(inst) {
    const i = this.objects.indexOf(inst);
    if (i >= 0) this.objects.splice(i, 1);
    this.boxes = this.boxes.filter(b => b.inst !== inst);
  }

  available(kind) {
    return this.R.mechs.filter(m => m.k <= this.k && (!kind || m.kind === kind));
  }

  build(targetPar, d, simple = false) {
    this.simple = simple;
    const R = this.R;
    const g = this.g;
    // vertical rise per hop: big enough that stones can't easily be skipped
    const rise = this.g < 1 ? this.range(540, 640) : this.range(330, 400);
    const intro = this.available().find(m => m.k === this.k && m.tip);
    this.tip = intro ? intro.tip : null;
    this.introMech = intro && intro.kind !== 'note' ? intro : null;

    const stoneKindsIntro = ['stone', 'groundstone', 'launcher', 'mover', 'bouncer', 'cup', 'conveyor', 'orbit', 'orbitufo', 'bob', 'timedstone', 'lift'];
    let hops = targetPar;
    if (this.introMech && stoneKindsIntro.includes(this.introMech.kind)) { hops = Math.max(hops, 2); this.hasIntroStone = true; }
    this.hasLauncher = false;
    const totalRise = hops === 1 ? this.range(220, 340) : hops * rise * this.range(0.85, 1.0);
    const H = Math.round(clamp(totalRise + 190 + this.range(240, 320), 1100, 2900));
    this.H = H;

    // ---- pan & stove
    const side = this.r() < 0.5 ? -1 : 1;
    const stoveX = side < 0 ? this.range(125, 175) : this.range(465, 515);
    const flip = side > 0;
    const stove = { t: 'stove', x: stoveX, y: H - 75 };
    const pan = { t: 'pan', x: stoveX + (flip ? -45 : 45), y: H - 178, flip };
    this.add(stove); this.add(pan);
    const start = [stoveX, H - 190];
    this.start = start;
    // keep the air above the pan clear
    this.corridor = { x0: stoveX - 110, x1: stoveX + 110, y0: start[1] - 240, y1: start[1] - 20 };

    // ---- waypoint heights
    const topY = Math.max(220, start[1] - totalRise);
    this.topY = topY;
    const nStones = Math.max(0, hops - 1);
    const total = start[1] - topY;
    const ys = [];
    let acc = 0;
    const weights = Array.from({ length: nStones + 1 }, () => this.range(0.75, 1.25));
    const wsum = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < nStones; i++) { acc += total * weights[i] / wsum; ys.push(start[1] - acc); }

    // ---- x pattern
    const pattern = this.pick(['zigzag', 'zigzag', 'drift', 'sweep']);
    let x = start[0];
    let dir = -side;
    const xs = [];
    for (let i = 0; i <= nStones; i++) {
      let nx;
      if (pattern === 'zigzag') nx = dir > 0 ? this.range(400, 535) : this.range(105, 240);
      else if (pattern === 'sweep') nx = clamp(x + dir * this.range(170, 300), 100, 540);
      else nx = clamp(x + (this.r() < 0.5 ? -1 : 1) * this.range(170, 330), 100, 540);
      if (Math.abs(nx - x) < 150) nx = clamp(x + (nx >= x ? 1 : -1) * 170, 100, 540);
      if (Math.abs(nx - x) < 150) nx = x < 320 ? x + 220 : x - 220;
      xs.push(nx);
      if (pattern === 'zigzag') dir = -dir;
      else if (pattern === 'sweep' && (nx >= 520 || nx <= 120)) dir = -dir;
      x = nx;
    }

    // ---- choose stone kinds along the path
    const stonePool = simple ? R.stones.filter(s => s[1] === 0) : R.stones.filter(s => s[1] <= this.k);
    const weighted = [];
    for (const s of stonePool) for (let i = 0; i < s[2]; i++) weighted.push(s[0]);
    const mechs = this.available().filter(m => m.kind !== 'note');
    const plan = [];
    for (let i = 0; i < nStones; i++) plan.push({ kind: 'stone', t: this.pick(weighted) });
    // feature the intro mechanic (always), plus random extra mechanics by difficulty
    const want = [];
    if (this.introMech) want.push(this.introMech);
    const extraCount = simple ? 0 : Math.floor(d * 3 + this.r() * 1.5);
    for (let i = 0; i < extraCount && mechs.length; i++) {
      const m = this.pick(mechs);
      if (!want.includes(m) || ['stone', 'bouncer', 'hazard'].includes(m.kind)) want.push(m);
    }

    // stone-like mechanics replace planned stones
    const stoneKinds = ['stone', 'groundstone', 'launcher', 'mover', 'bouncer', 'cup', 'conveyor', 'orbit', 'orbitufo', 'bob', 'timedstone', 'lift'];
    for (const m of want) {
      if (!stoneKinds.includes(m.kind)) continue;
      const free = plan.map((p, i) => (p.kind === 'stone' ? i : -1)).filter(i => i >= 0);
      if (!free.length) break;
      plan[this.pick(free)] = { kind: m.kind, t: m.t };
    }

    // a launcher's next hop is extra tall (the pop does the work)
    for (let i = 0; i < nStones; i++) {
      if (plan[i].kind === 'launcher') {
        const extra = this.g < 1 ? 260 : 230;
        for (let j = i + 1; j < nStones; j++) ys[j] -= extra;
        this.bunLift = (this.bunLift || 0) + extra;
      }
    }
    // ---- place stones
    const placed = [];
    for (let i = 0; i < nStones; i++) {
      const p = plan[i];
      let inst = null;
      for (let tries = 0; tries < 6 && !inst; tries++) {
        const jx = tries ? this.range(-60, 60) : 0;
        const jy = tries ? this.range(-40, 40) : 0;
        inst = this.placeKind(p, clamp(xs[i] + jx, 90, 550), ys[i] + jy, i, xs, ys);
      }
      if (!inst) {
        // fall back to a plain stone
        for (let tries = 0; tries < 12 && !inst; tries++) {
          const fx = tries < 5 ? clamp(xs[i] + this.range(-90, 90), 90, 550) : this.range(90, 550);
          inst = this.stone(this.pick(weighted), fx, ys[i] + this.range(-50, 50));
        }
        if (inst) xs[i] = landStrip(inst).x0 / 2 + landStrip(inst).x1 / 2;
      }
      if (!inst) return null;
      placed.push(inst);
    }

    // ---- the bun
    let bun = null;
    for (let tries = 0; tries < 14 && !bun; tries++) {
      const bx = tries < 6 ? clamp(xs[nStones] + (tries ? this.range(-120, 120) : 0), 130, 510) : this.range(130, 510);
      bun = this.stone('bun', bx, Math.max(170, topY - (this.bunLift || 0)) + (tries ? this.range(-40, 60) : 0), { flip: false });
    }
    if (!bun) return null;
    this.corridor = null;

    // the tutorial obstacle goes in first, while there is still room for it
    if (this.introMech && !stoneKinds.includes(this.introMech.kind)) {
      if (!this.placeObstacle(this.introMech, placed, bun, d)) return null;
    }

    // ---- floor dressing: furniture standing on the floor (also usable as alternate landing spots)
    const dress = FLOOR_DRESSING[this.world.id] || [];
    const nDress = dress.length ? 1 + Math.floor(this.r() * 2.2) : 0;
    for (let i = 0; i < nDress; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const t = this.pick(dress);
        const T = OBJECTS[t];
        const inst = { t, flip: this.r() < 0.5, color: this.pick(R.groundColor) };
        if (T.stretch) { inst.w = this.range(150, 260); inst.h = this.range(150, 260); }
        placeOnBottom(inst, this.range(80, 560), H);
        const b = worldBox(inst);
        if (b.x0 < 4 || b.x1 > W - 4) continue;
        if (!this.free(b, 26)) continue;
        // keep the launch arc out of the pan clear
        if (b.y0 < start[1] - 40 && Math.abs((b.x0 + b.x1) / 2 - start[0]) < 230) continue;
        this.add(inst, { box: b });
        break;
      }
    }

    // ---- obstacles & hazards
    for (const m of want) {
      if (stoneKinds.includes(m.kind) || m === this.introMech) continue;
      this.placeObstacle(m, placed, bun, d);
    }
    // extra decoy stones for alternative routes + set dressing so scenes feel lived-in
    const decoys = 1 + Math.floor(this.r() * (1.5 + d * 2)) + (hops === 1 ? 1 : 0);
    const yLo = Math.min(topY + 60, start[1] - 260), yHi = start[1] - 120;
    for (let i = 0; i < decoys; i++) {
      for (let tries = 0; tries < 8; tries++) {
        const y = this.range(Math.min(yLo, yHi - 50), yHi);
        if (this.stone(this.pick(weighted), this.range(90, 550), y)) break;
      }
    }
    // a hazard even in early levels of later worlds keeps tension up
    const hz = this.available('hazard');
    if (!simple && hz.length && this.r() < 0.35 + d * 0.4) this.placeObstacle(this.pick(hz), placed, bun, d);
    const bl = this.available('blocker');
    if (!simple && bl.length && this.r() < 0.3 + d * 0.3) this.placeObstacle(this.pick(bl), placed, bun, d);

    // the level must actually feature the mechanic it introduces
    if (this.introMech && !this.objects.some(o => o.t === this.introMech.t)) return null;

    // ---- assemble
    return {
      h: H,
      seed: this.seed,
      start,
      objects: this.objects,
      targetPar: Math.max(targetPar, this.hasIntroStone ? 2 : 1),
    };
  }

  placeKind(p, x, y, i, xs, ys) {
    const R = this.R;
    const H = this.H;
    switch (p.kind) {
      case 'stone': case 'bouncer': case 'cup': return this.stone(p.t, x, y);
      case 'groundstone': {
        // ground-standing landmark: on the floor, or raised on sturdy furniture — never on a wall shelf
        const inst = { t: p.t, flip: this.r() < 0.5 };
        placeOnBottom(inst, x, H);
        const l = landStrip(inst);
        if (y > l.y - 60) {
          const b = worldBox(inst);
          if (this.free(b, 20)) { this.add(inst, { box: b }); return inst; }
          return null;
        }
        if (this.R.float || !this.R.ground.length) return this.stone(p.t, x, y);
        const onFloor = () => {
          // planned x first, then scan the floor for any free spot
          const xsTry = [x];
          for (let k = 0; k < 14; k++) xsTry.push(60 + (520 * k) / 13);
          for (const tx of xsTry) {
            placeOnBottom(inst, tx, H);
            const fb = worldBox(inst);
            if (fb.x0 < 4 || fb.x1 > W - 4 || !this.free(fb, 6)) continue;
            this.add(inst, { box: fb });
            return inst;
          }
          return null;
        };
        placeOnStrip(inst, x, y);
        const b = worldBox(inst);
        const gap = H - b.y1;
        if (gap > 620) return onFloor();
        if (b.x0 < 4 || b.x1 > W - 4 || !this.free(b, 22)) return onFloor();
        const gt = this.R.ground[0] === 'pillar' ? 'cabinet' : this.R.ground[0];
        const w = clamp(b.x1 - b.x0 + 20, 160, 340);
        const g = { t: gt, x: clamp((b.x0 + b.x1) / 2, w / 2 + 2, W - w / 2 - 2), y: H - gap / 2, w, h: gap, color: this.pick(this.R.groundColor) };
        const gb = worldBox(g); gb.y0 = Math.max(gb.y0, b.y1 - 2);
        if (!this.free(gb, 14)) return onFloor();
        this.add(inst, { box: b }); this.add(g, { box: gb });
        return inst;
      }
      case 'timedstone': {
        const inst = this.stone(p.t, x, y);
        if (inst) inst.timer = { period: this.range(2.6, 3.4), on: 0.42, phase: this.r() };
        return inst;
      }
      case 'launcher': {
        const inst = this.stone(p.t, x, y);
        if (!inst) return null;
        // aim the pop at the next waypoint
        const nx = xs[i + 1], ny = (ys[i + 1] ?? Math.max(170, this.topY - (this.bunLift || 0)));
        const l = landStrip(inst);
        const G = PHYS.G * this.g;
        const up = Math.max(140, l.y - ny) + 150;
        const vy = -Math.sqrt(2 * G * up);
        const drop = l.y - ny;
        const tt = (-vy + Math.sqrt(Math.max(0, vy * vy - 2 * G * drop))) / G;
        const vx = clamp((nx - (l.x0 + l.x1) / 2) / tt, -650, 650);
        inst.launch = [Math.round(vx * (inst.flip ? -1 : 1)), Math.round(vy)];
        return inst;
      }
      case 'mover': {
        const inst = { t: p.t, flip: this.r() < 0.5 };
        placeOnStrip(inst, x, y);
        if (p.t === 'swing') {
          inst.move = { type: 'swing', amp: this.range(0.35, 0.6), period: this.range(2.6, 3.6), phase: this.r() };
          inst.flip = false;
        } else {
          const amp = this.range(70, 130);
          inst.x = clamp(inst.x, amp + 70, W - amp - 70);
          inst.move = { type: 'slide', dx: amp, dy: 0, period: this.range(3.2, 5.2), phase: this.r() };
        }
        const b = worldBox(inst);
        const sweep = { x0: b.x0 - (inst.move.dx || 90), x1: b.x1 + (inst.move.dx || 90), y0: b.y0 - (p.t === 'swing' ? 300 : 0), y1: b.y1 + (p.t === 'swing' ? 10 : 0) };
        if (!this.free(sweep, 24)) return null;
        this.add(inst, { box: sweep });
        return inst;
      }
      case 'bob': {
        const inst = { t: p.t };
        placeOnStrip(inst, x, y);
        inst.move = { type: 'slide', dx: this.range(-30, 30), dy: this.range(30, 55), period: this.range(2.4, 3.4), phase: this.r() };
        const b = worldBox(inst);
        const sw = { x0: b.x0 - 35, x1: b.x1 + 35, y0: b.y0 - 60, y1: b.y1 + 60 };
        if (!this.free(sw, 20)) return null;
        this.add(inst, { box: sw });
        return inst;
      }
      case 'orbit': case 'orbitufo': {
        const inst = { t: p.t };
        placeOnStrip(inst, x, y);
        const r = this.range(60, 100);
        inst.x = clamp(inst.x, r + 80, W - r - 80);
        inst.move = { type: 'orbit', rx: r, ry: r * 0.8, period: this.range(5, 7) * (this.r() < 0.5 ? 1 : -1), phase: this.r() };
        inst.move.period = Math.abs(inst.move.period);
        const b = worldBox(inst);
        const sw = { x0: b.x0 - r, x1: b.x1 + r, y0: b.y0 - r, y1: b.y1 + r };
        if (!this.free(sw, 20)) return null;
        this.add(inst, { box: sw });
        return inst;
      }
      case 'conveyor': {
        const w = this.range(220, 300);
        const inst = { t: 'conveyor', w, speed: Math.round(this.range(110, 190) * (this.r() < 0.5 ? -1 : 1)) };
        placeOnStrip(inst, x, y);
        const b = worldBox(inst);
        if (b.x0 < 4) inst.x += 4 - b.x0;
        if (b.x1 > W - 4) inst.x -= b.x1 - W + 4;
        const b2 = worldBox(inst);
        if (!this.free(b2, 22)) return null;
        this.add(inst, { box: b2 });
        if (!this.support(inst, b2)) { this.remove(inst); return null; }
        return inst;
      }
      case 'lift': {
        // a lift pad on a support; the next stone sits beside the top of the column
        const inst = this.stone(p.t, x, y + 30);
        if (inst && p.t === 'gravlift' && this.g >= 1) inst.wind = [0, -4200];
        return inst;
      }
    }
    return null;
  }

  placeObstacle(m, placed, bun, d) {
    const H = this.H;
    const pts = [this.start, ...placed.map(p => { const l = landStrip(p); return [(l.x0 + l.x1) / 2, l.y]; }), (() => { const l = landStrip(bun); return [(l.x0 + l.x1) / 2, l.y]; })()];
    const seg = Math.floor(this.r() * (pts.length - 1));
    const a = pts[seg], b = pts[seg + 1];
    const mx = (a[0] + b[0]) / 2, my = Math.min(a[1], b[1]);
    for (let tries = 0; tries < 14; tries++) {
      let inst = null;
      if (m.kind === 'hazard') {
        // near a landing spot, beside it (punish overshoot) or floating mid-route
        const target = this.pick(placed.length ? [...placed, bun] : [bun]);
        const l = landStrip(target);
        let sideX = this.r() < 0.5 ? l.x0 - this.range(70, 120) : l.x1 + this.range(70, 120);
        let baseY = l.y + this.range(-10, 40);
        if (tries >= 6) { sideX = this.range(70, 570); baseY = this.range(this.topY - 40, this.start[1] - 120); }
        inst = { t: m.t, flip: this.r() < 0.5 };
        const T = OBJECTS[m.t];
        if (T.ground) placeOnBottom(inst, clamp(sideX, 60, 580), H);
        else placeOnBottom(inst, clamp(sideX, 60, 580), baseY);
        const box = worldBox(inst);
        if (!this.free(box, 18)) continue;
        this.add(inst, { box });
        if (!T.ground && !this.support(inst, box)) { this.remove(inst); continue; }
        return inst;
      }
      if (m.kind === 'blocker') {
        inst = { t: m.t, flip: this.r() < 0.5 };
        const T = OBJECTS[m.t];
        const x = clamp(mx + this.range(-40, 40), 60, 580);
        if (T.ground) placeOnBottom(inst, x, H);
        else placeOnBottom(inst, x, my + this.range(60, 180));
        const box = worldBox(inst);
        if (!this.free(box, 26)) continue;
        this.add(inst, { box });
        if (!T.ground && !this.support(inst, box)) { this.remove(inst); continue; }
        return inst;
      }
      if (m.kind === 'timed') {
        const target = this.pick([...placed, bun]);
        const l = landStrip(target);
        inst = { t: m.t, timer: { period: this.range(2.4, 3.4), on: 0.45, phase: this.r() } };
        if (tries < 6) placeOnBottom(inst, clamp(this.r() < 0.5 ? l.x0 - 80 : l.x1 + 80, 70, 570), l.y + 4);
        else placeOnBottom(inst, this.range(70, 570), this.range(this.topY - 40, this.start[1] - 120));
        const box = worldBox(inst, true);
        if (!this.free(box, 14)) continue;
        this.add(inst, { box });
        if (!this.support(inst, worldBox(inst))) { this.remove(inst); continue; }
        return inst;
      }
      if (m.kind === 'laser') {
        const w = this.range(220, 360);
        inst = { t: 'laser', w, x: clamp(mx, w / 2 + 4, W - w / 2 - 4), y: my - this.range(80, 160), timer: { period: this.range(2.2, 3.2), on: 0.5, phase: this.r() } };
        if (this.r() < 0.35) { inst.a = Math.PI / 2; inst.x = clamp(mx, 40, 600); inst.y = (a[1] + b[1]) / 2 - 40; }
        const box = worldBox(inst, true);
        if (!this.free(box, 10)) continue;
        this.add(inst, { box });
        return inst;
      }
      if (m.kind === 'rotor') {
        const T = OBJECTS[m.t];
        inst = { t: m.t, x: tries < 4 ? clamp(mx + this.range(-60, 60), 140, 500) : this.range(140, 500), y: tries < 4 ? my - this.range(20, 120) : this.range(Math.min(a[1], b[1]) - 200, Math.max(a[1], b[1])), move: { type: 'rotate', speed: this.range(0.5, 1.1) * (this.r() < 0.5 ? -1 : 1) } };
        // true sweep radius: farthest solid point from the pivot
        const lb = localBox(inst), pv = T.pivot || [0, 0];
        const rad = Math.max(...[[lb[0], lb[1]], [lb[2], lb[1]], [lb[0], lb[3]], [lb[2], lb[3]]].map(([cx, cy]) => Math.hypot(cx - pv[0], cy - pv[1]))) + 10;
        const box = { x0: inst.x - rad, x1: inst.x + rad, y0: inst.y - rad, y1: inst.y + rad };
        if (box.x0 < -40 || box.x1 > W + 40) continue;
        if (!this.free({ ...box, x0: Math.max(0, box.x0), x1: Math.min(W, box.x1) }, 6)) continue;
        this.add(inst, { box });
        return inst;
      }
      if (m.kind === 'wind') {
        const fromLeft = this.r() < 0.5;
        inst = { t: m.t, flip: !fromLeft };
        const y = my + this.range(-60, 80);
        placeOnBottom(inst, fromLeft ? 60 : W - 60, y);
        const box = worldBox(inst);
        if (!this.free(box, 14)) continue;
        this.add(inst, { box });
        if (!this.support(inst, box)) { this.remove(inst); continue; }
        return inst;
      }
      if (m.kind === 'downwind') {
        const target = this.pick(placed.length ? placed : [bun]);
        const l = landStrip(target);
        inst = { t: m.t, x: clamp((l.x0 + l.x1) / 2 + this.range(-30, 30), 60, 580), y: l.y - this.range(330, 420) };
        const box = worldBox(inst);
        if (!this.free(box, 14)) continue;
        this.add(inst, { box });
        return inst;
      }
      if (m.kind === 'patrol') {
        // a crab walking along a stone's top
        const target = this.pick(placed.length ? placed : [bun]);
        if (target.t === 'bun') continue;
        const l = landStrip(target);
        if (l.x1 - l.x0 < 120) continue;
        inst = { t: m.t };
        placeOnBottom(inst, (l.x0 + l.x1) / 2, l.y);
        inst.move = { type: 'slide', dx: (l.x1 - l.x0) / 2 - 30, dy: 0, period: this.range(3, 4.5), phase: this.r() };
        this.objects.push(inst);
        return inst;
      }
      if (m.kind === 'flyer') {
        inst = { t: m.t, x: clamp(mx, 160, 480), y: my - this.range(120, 220), move: { type: 'slide', dx: this.range(110, 170), dy: this.range(-20, 20), period: this.range(3.5, 5), phase: this.r() } };
        const box = worldBox(inst);
        const sw = { x0: box.x0 - inst.move.dx, x1: box.x1 + inst.move.dx, y0: box.y0 - 20, y1: box.y1 + 20 };
        if (!this.free({ ...sw, x0: Math.max(0, sw.x0), x1: Math.min(W, sw.x1) }, 10)) continue;
        this.add(inst, { box: sw });
        return inst;
      }
      return null;
    }
    return null;
  }
}

// ------------------------------------------------------------------ difficulty curve
export function targetFor(index) {
  const w = Math.floor(index / 20), k = index % 20;
  const d = clamp(w / 9 * 0.62 + k / 19 * 0.38, 0, 1);
  // par: gentle start of each world, ramps within world, higher baseline later
  let par = 1 + Math.round(d * 3.2 + (k / 19) * 1.3);
  if (k < 2) par = Math.min(par, 1 + Math.floor(w / 4));
  if (k === 19) par += 1;
  par = clamp(par, 1, 6);
  // minimum robustness (neighbour support) required for the par path — lower = harder
  // minimum per-shot success rate under human-sized error along the par route
  const robust = k < 3 ? 0.55 : d < 0.3 ? 0.45 : d < 0.6 ? 0.33 : 0.22;
  return { d, par, robust };
}

export function generateOne(index, opts = {}) {
  const hand = HANDMADE[index];
  const w = Math.floor(index / 20);
  const k = index % 20;
  const name = NAMES[w][k];
  if (hand) {
    const sol = solve(hand, w, { maxDepth: 5, beam: 6 });
    const solution = sol.path ? sol.path.map(s => [s.a, s.p, s.delay || 0]) : [];
    if (replaySolution(hand, w, solution) !== 'win') throw new Error('handmade replay mismatch ' + index);
    return { ...hand, name, par: hand.par || sol.par, solution, meta: { solverPar: sol.par, robust: sol.minRobust, ms: sol.ms, attempts: 0 } };
  }
  const T = targetFor(index);
  const maxAttempts = opts.maxAttempts || 18;
  let best = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const relax = Math.floor(attempt / 5);
    const seed = (index + 1) * 7919 + attempt * 104729;
    const b = new Builder(index, seed);
    const lvl0 = b.build(Math.max(1, T.par - (relax >= 2 ? 1 : 0)), T.d);
    if (!lvl0) continue;
    const lvl = { ...lvl0, start: lvl0.start.map(v => Math.round(v * 10) / 10), objects: lvl0.objects.map(roundInst) };
    const sol = solve(lvl, w, { maxDepth: Math.max(T.par, lvl.targetPar || 1) + 1, beam: 5 });
    if (!sol.par) continue;
    const solution = sol.path.map(s => [s.a, s.p, s.delay || 0]);
    if (replaySolution(lvl, w, solution) !== 'win') { console.error('replay mismatch', index, attempt); continue; }
    const tp = Math.max(T.par, lvl.targetPar || 1);
    const score = Math.abs(sol.par - tp) * 3 + (sol.minRobust < T.robust ? (T.robust - sol.minRobust) * 25 : 0) + (sol.par < tp - 1 ? 6 : 0);
    const cand = { lvl, sol, score, attempt, tip: b.tip };
    if (!best || cand.score < best.score) best = cand;
    if (score === 0 || (relax >= 1 && score <= 3) || (relax >= 3 && score <= 6)) break;
  }
  // last resort: plain layouts (intro mechanic only, no extra obstacles), one flip easier
  for (let attempt = 0; attempt < 16 && !best; attempt++) {
    const seed = (index + 1) * 15485863 + attempt * 104729;
    const b = new Builder(index, seed);
    const lvl0 = b.build(Math.max(1, T.par - 1), T.d * 0.5, true);
    if (!lvl0) continue;
    const lvl = { ...lvl0, start: lvl0.start.map(v => Math.round(v * 10) / 10), objects: lvl0.objects.map(roundInst) };
    const sol = solve(lvl, w, { maxDepth: T.par + 2, beam: 6, minEdge: 0.08 });
    if (!sol.par) continue;
    const solution = sol.path.map(s => [s.a, s.p, s.delay || 0]);
    if (replaySolution(lvl, w, solution) !== 'win') continue;
    best = { lvl, sol, score: 99, attempt: maxAttempts + attempt, tip: b.tip };
  }
  // final tier: plainer and a bit shorter still
  for (let attempt = 0; attempt < 24 && !best; attempt++) {
    const seed = (index + 1) * 32452843 + attempt * 104729;
    const b = new Builder(index, seed);
    const lvl0 = b.build(Math.max(2, T.par - 2), T.d * 0.3, true);
    if (!lvl0) continue;
    const lvl = { ...lvl0, start: lvl0.start.map(v => Math.round(v * 10) / 10), objects: lvl0.objects.map(roundInst) };
    const sol = solve(lvl, w, { maxDepth: T.par + 2, beam: 7, minEdge: 0.06 });
    if (!sol.par) continue;
    const solution = sol.path.map(s => [s.a, s.p, s.delay || 0]);
    if (replaySolution(lvl, w, solution) !== 'win') continue;
    best = { lvl, sol, score: 999, attempt: 99 + attempt, tip: b.tip };
  }
  if (!best) throw new Error('Failed to generate level ' + index);
  const { lvl, sol } = best;
  return {
    name, h: lvl.h, seed: lvl.seed, start: lvl.start,
    par: sol.par, tip: best.tip || undefined,
    objects: lvl.objects,
    solution: sol.path.map(s => [s.a, s.p, s.delay || 0]),
    meta: { target: Math.max(T.par, lvl.targetPar || 1), robust: +sol.minRobust.toFixed(2), winFrac: +(sol.winFrac || 0).toFixed(4), attempts: best.attempt + 1, ms: sol.ms },
  };
}

function roundInst(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number') r[k] = Math.round(v * 10) / 10;
    else if (v && typeof v === 'object' && !Array.isArray(v)) { r[k] = {}; for (const [kk, vv] of Object.entries(v)) r[k][kk] = typeof vv === 'number' ? Math.round(vv * 1000) / 1000 : vv; }
    else if (v === false || v === undefined || v === null) continue;
    else r[k] = v;
  }
  return r;
}

// ------------------------------------------------------------------ CLI / workers
if (isMainThread && process.argv[1] && process.argv[1].endsWith('generate.mjs')) {
  const args = process.argv.slice(2);
  const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
  const from = +arg('from', 0), to = +arg('to', 200);
  const workers = +arg('workers', Math.max(1, os.cpus().length));
  const out = arg('out', 'src/levels/data.js');
  const cacheFile = arg('cache', '/tmp/claude-0/levels-cache.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { /* none */ }
  const only = arg('only', null);
  const todo = [];
  const list = arg('list', null);
  const range = list ? list.split(',').map(Number) : Array.from({ length: to - from }, (_, k) => from + k);
  const onlySet = only ? new Set(only.split(',').map(Number)) : null;
  for (const i of range) {
    if (onlySet) { if (onlySet.has(i)) todo.push(i); }
    else if (!cache[i] || args.includes('--force')) todo.push(i);
  }
  console.log(`generating ${todo.length} levels with ${workers} workers`);
  let active = 0, done = 0;
  const t0 = Date.now();
  await new Promise((resolve) => {
    const startNext = () => {
      if (!todo.length) { if (!active) resolve(); return; }
      const i = todo.shift();
      active++;
      const wk = new Worker(new URL(import.meta.url), { workerData: { index: i, attempts: +arg('attempts', 18) } });
      wk.on('message', (m) => {
        cache[m.index] = m.level;
        done++;
        const L = m.level;
        console.log(`#${m.index + 1} ${L.name}: par ${L.par} (target ${L.meta?.target ?? '-'}) robust ${L.meta?.robust} h ${L.h} objs ${L.objects.length} tries ${L.meta?.attempts} [${((Date.now() - t0) / 1000).toFixed(0)}s, ${done} done]`);
        fs.writeFileSync(cacheFile, JSON.stringify(cache));
        if (arg('preview', null)) fs.writeFileSync(arg('preview'), JSON.stringify(cache));
      });
      wk.on('error', (e) => { console.error('level', i, 'failed', e.message); });
      wk.on('exit', () => { active--; startNext(); });
    };
    for (let k = 0; k < workers; k++) startNext();
  });
  // write module
  const levels = [];
  for (let i = 0; i < 200; i++) levels.push(cache[i] || null);
  const missing = levels.map((l, i) => (l ? -1 : i)).filter(i => i >= 0);
  if (missing.length) console.log('missing levels:', missing.join(','));
  const body = '// AUTO-GENERATED by tools/generate.mjs — every level verified solvable by tools/solver.mjs\n' +
    'export const LEVELS = ' + JSON.stringify(levels.map(l => l && (({ meta, targetPar, ...rest }) => rest)(l))) + ';\n';
  fs.writeFileSync(out, body);
  if (arg('preview', null)) fs.writeFileSync(arg('preview'), JSON.stringify(cache));
  console.log('wrote', out, (body.length / 1024).toFixed(1) + 'KB');
} else if (!isMainThread) {
  const level = generateOne(workerData.index, { maxAttempts: workerData.attempts || 18 });
  parentPort.postMessage({ index: workerData.index, level });
}
