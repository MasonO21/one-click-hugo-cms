// Sizzle Flip — deterministic soft-body physics.
// Shared by the browser game and the Node level solver, so it must stay free of DOM access.
// Coordinates are y-down world units. A level is 640 units wide.

import { OBJECTS } from './objects.js';

export const PHYS = {
  W: 640,
  G: 2400,
  DT: 1 / 60,
  SUB: 10,
  N: 10,
  R: 15,
  SPACING: 11,
  BEND_COMPLIANCE: 0.000012,
  STRETCH_COMPLIANCE: 0.0000006,
  AIR_DRAG: 0.12,
  MAX_V: 1650,
  MIN_V: 160,
  SPIN_K: 0.0055,
  SPIN_MAX: 7,
  SETTLE_V: 34,
  SETTLE_T: 0.22,
  WIN_T: 0.3,
  LAUNCH_MIN_ANGLE: -0.26, // radians below horizontal allowed (each side)
};

const TAU = Math.PI * 2;
const _hyp = (a, b) => Math.sqrt(a * a + b * b);

// ---------------------------------------------------------------------------
// Shape construction
// ---------------------------------------------------------------------------

function polyFromLocal(pts) {
  // pts: [[x,y],...] convex. Returns local poly record with centroid.
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= pts.length; cy /= pts.length;
  return { lx: pts.map(p => p[0]), ly: pts.map(p => p[1]), lcx: cx, lcy: cy };
}

function boxPts(x, y, w, h, a = 0, r = 0) {
  const hw = w / 2, hh = h / 2;
  let pts;
  if (r > 0) {
    const c = Math.min(r, hw * 0.9, hh * 0.9);
    pts = [
      [-hw + c, -hh], [hw - c, -hh], [hw, -hh + c], [hw, hh - c],
      [hw - c, hh], [-hw + c, hh], [-hw, hh - c], [-hw, -hh + c],
    ];
  } else {
    pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  }
  const ca = Math.cos(a), sa = Math.sin(a);
  return pts.map(([px, py]) => [x + px * ca - py * sa, y + px * sa + py * ca]);
}

// Convert a type shape definition into a local-space shape record (scaled + mirrored).
function makeLocalShape(def, s, flip) {
  const fx = flip ? -1 : 1;
  const base = {
    friction: def.friction, bounce: def.bounce, hazard: def.hazard || null,
    sensor: !!def.sensor, goal: !!def.goal, wind: def.wind || null, launch: def.launch || null,
    conveyor: def.conveyor ? def.conveyor * fx : 0, boost: def.boost || 0, mat: def.mat || null,
    timed: !!def.timed, sticky: !!def.sticky, tag: def.tag || null,
  };
  if (def.type === 'circle') {
    return { ...base, kind: 0, lx: def.x * s * fx, ly: def.y * s, r: def.r * s };
  }
  if (def.type === 'capsule') {
    return { ...base, kind: 2, lax: def.x1 * s * fx, lay: def.y1 * s, lbx: def.x2 * s * fx, lby: def.y2 * s, r: def.r * s };
  }
  let pts;
  if (def.type === 'box') pts = boxPts(def.x, def.y, def.w, def.h, def.a || 0, def.r || 0);
  else pts = def.pts.map(p => [p[0], p[1]]);
  pts = pts.map(([x, y]) => [x * s * fx, y * s]);
  if (flip) pts.reverse();
  const lp = polyFromLocal(pts);
  return { ...base, kind: 1, n: pts.length, ...lp };
}

// ---------------------------------------------------------------------------
// Body motion (kinematic, analytic in time so it is deterministic and seekable)
// ---------------------------------------------------------------------------

export function motionAt(m, t, out) {
  // out: {ox, oy, da, vx, vy, w}
  out.ox = 0; out.oy = 0; out.da = 0; out.vx = 0; out.vy = 0; out.w = 0;
  if (!m) return out;
  const ph = m.phase || 0;
  if (m.type === 'slide') {
    const k = TAU / m.period;
    const s = Math.sin(k * t + ph * TAU), c = Math.cos(k * t + ph * TAU);
    out.ox = m.dx * s; out.oy = m.dy * s;
    out.vx = m.dx * k * c; out.vy = m.dy * k * c;
  } else if (m.type === 'rotate') {
    out.da = m.speed * t + ph * TAU; out.w = m.speed;
  } else if (m.type === 'swing') {
    const k = TAU / m.period;
    out.da = m.amp * Math.sin(k * t + ph * TAU);
    out.w = m.amp * k * Math.cos(k * t + ph * TAU);
  } else if (m.type === 'orbit') {
    const k = TAU / m.period;
    const a = k * t + ph * TAU;
    out.ox = m.rx * Math.cos(a); out.oy = m.ry * Math.sin(a);
    out.vx = -m.rx * k * Math.sin(a); out.vy = m.ry * k * Math.cos(a);
  }
  return out;
}

export function timerOn(timer, t) {
  if (!timer) return true;
  const f = ((t / timer.period + (timer.phase || 0)) % 1 + 1) % 1;
  return f < timer.on;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export class Sim {
  constructor(level, opts = {}) {
    this.level = level;
    this.G = PHYS.G * (level.gravity || 1);
    this.t = 0;
    this.bodies = [];
    this.shapes = [];
    this.events = [];
    this.recordEvents = opts.events !== false;
    const N = PHYS.N;
    this.px = new Float64Array(N); this.py = new Float64Array(N);
    this.vx = new Float64Array(N); this.vy = new Float64Array(N);
    this.ox = new Float64Array(N); this.oy = new Float64Array(N);
    this.ovx = new Float64Array(N); this.ovy = new Float64Array(N);
    this.cBody = new Int32Array(N).fill(-1);
    this.cAge = new Float64Array(N).fill(99);
    this.cNx = new Float64Array(N); this.cNy = new Float64Array(N);
    this.restTimer = 0;
    this.goalTimer = 0;
    this.launchTimer = 0;
    this.launchCooldown = 0;
    this.launchersUsed = new Set();
    this.boostUsed = new Set();
    this.sinceLaunch = 0;
    this.status = 'play';
    this.failReason = null;
    this.airTime = 0;
    this.maxSpeed = 0;
    this.supportBody = -1;
    this.lastImpact = new Float64Array(64);
    this._m = { ox: 0, oy: 0, da: 0, vx: 0, vy: 0, w: 0 };
    this._pending = new Array(N).fill(null);
    this._pnx = new Float64Array(N); this._pny = new Float64Array(N); this._pd = new Float64Array(N);
    this._cand = []; this._cx = 0; this._cy = 0; this._cd = 0;
    this._lastShape = new Array(N).fill(null);
    this.buildWorld();
  }

  buildWorld() {
    const L = this.level;
    const W = L.w || PHYS.W;
    const add = (inst, type, index) => {
      const s = inst.s || 1;
      const body = {
        index, inst, type, x: inst.x, y: inst.y, a: inst.a || 0,
        pivotX: (inst.pivot ? inst.pivot[0] : 0) * s * (inst.flip ? -1 : 1),
        pivotY: (inst.pivot ? inst.pivot[1] : 0) * s,
        motion: inst.move || null, timer: inst.timer || null,
        kinematic: !!inst.move, shapes: [],
        // live transform
        cx: inst.x, cy: inst.y, ang: inst.a || 0, wx: 0, wy: 0, w: 0, pwx: 0, pwy: 0,
        role: type ? type.role : inst.role,
      };
      const defs = type ? (type.build ? type.build(inst) : type.shapes) : inst.shapes;
      for (const d of defs) {
        const inherit = type && !d.mat ? { boost: type.boost || 0, sticky: !!type.sticky } : {};
        const sh = makeLocalShape({ friction: type ? type.friction : 0.6, bounce: type ? type.bounce : 0.1, mat: type ? type.mat : 'wood', ...inherit, ...d }, s, !!inst.flip);
        sh.body = index;
        if (inst.hazardOverride) sh.hazard = inst.hazardOverride;
        if (inst.launch && sh.launch) sh.launch = inst.launch;
        if (inst.wind && sh.wind) sh.wind = inst.wind;
        // world caches
        if (sh.kind === 1) { sh.wx = new Float64Array(sh.n); sh.wy = new Float64Array(sh.n); sh.nx = new Float64Array(sh.n); sh.ny = new Float64Array(sh.n); }
        body.shapes.push(sh);
        this.shapes.push(sh);
      }
      this.bodies.push(body);
      return body;
    };
    L.objects.forEach((inst, i) => {
      const type = OBJECTS[inst.t];
      if (!type) throw new Error('Unknown object type ' + inst.t);
      add(inst, type, i);
    });
    // boundaries
    const H = L.h;
    const floorHazard = L.floor || 'floor';
    const bi = this.bodies.length;
    add({ x: W / 2, y: H + 150, shapes: [{ type: 'box', x: 0, y: 0, w: W + 400, h: 300, hazard: floorHazard, friction: 0.8, bounce: 0.1, mat: 'floor' }], role: 'floor' }, null, bi);
    add({ x: -100, y: H / 2 - 1000, shapes: [{ type: 'box', x: 0, y: 0, w: 200, h: H + 4000, friction: 0.3, bounce: 0.25, mat: 'wall' }], role: 'wall' }, null, bi + 1);
    add({ x: W + 100, y: H / 2 - 1000, shapes: [{ type: 'box', x: 0, y: 0, w: 200, h: H + 4000, friction: 0.3, bounce: 0.25, mat: 'wall' }], role: 'wall' }, null, bi + 2);
    for (const b of this.bodies) this.updateBody(b, 0, true);
    this.kin = this.bodies.filter(b => b.kinematic);
  }

  updateBody(b, t, force) {
    if (!b.kinematic && !force) return;
    const m = motionAt(b.motion, t, this._m);
    const ang = b.a + m.da;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // pivot world position (pivot rotates with base angle only)
    const cb = Math.cos(b.a), sb = Math.sin(b.a);
    const pwx = b.x + m.ox + b.pivotX * cb - b.pivotY * sb;
    const pwy = b.y + m.oy + b.pivotX * sb + b.pivotY * cb;
    b.pwx = pwx; b.pwy = pwy; b.ang = ang; b.wx = m.vx; b.wy = m.vy; b.w = m.w;
    const tx = (lx, ly) => {
      const qx = lx - b.pivotX, qy = ly - b.pivotY;
      return [pwx + qx * ca - qy * sa, pwy + qx * sa + qy * ca];
    };
    const c = tx(0, 0); b.cx = c[0]; b.cy = c[1];
    for (const sh of b.shapes) {
      if (sh.kind === 0) {
        const p = tx(sh.lx, sh.ly); sh.cx = p[0]; sh.cy = p[1];
        sh.minx = sh.cx - sh.r; sh.maxx = sh.cx + sh.r; sh.miny = sh.cy - sh.r; sh.maxy = sh.cy + sh.r;
      } else if (sh.kind === 2) {
        const a = tx(sh.lax, sh.lay), bb = tx(sh.lbx, sh.lby);
        sh.ax = a[0]; sh.ay = a[1]; sh.bx = bb[0]; sh.by = bb[1];
        sh.minx = Math.min(sh.ax, sh.bx) - sh.r; sh.maxx = Math.max(sh.ax, sh.bx) + sh.r;
        sh.miny = Math.min(sh.ay, sh.by) - sh.r; sh.maxy = Math.max(sh.ay, sh.by) + sh.r;
      } else {
        let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
        for (let i = 0; i < sh.n; i++) {
          const p = tx(sh.lx[i], sh.ly[i]);
          sh.wx[i] = p[0]; sh.wy[i] = p[1];
          if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
          if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
        }
        const cc = tx(sh.lcx, sh.lcy);
        for (let i = 0; i < sh.n; i++) {
          const j = (i + 1) % sh.n;
          let ex = sh.wx[j] - sh.wx[i], ey = sh.wy[j] - sh.wy[i];
          const len = Math.sqrt(ex * ex + ey * ey) || 1;
          let nx = ey / len, ny = -ex / len;
          const mx = (sh.wx[i] + sh.wx[j]) / 2 - cc[0], my = (sh.wy[i] + sh.wy[j]) / 2 - cc[1];
          if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
          sh.nx[i] = nx; sh.ny[i] = ny;
        }
        sh.minx = minx; sh.maxx = maxx; sh.miny = miny; sh.maxy = maxy;
      }
    }
  }

  // Place the sausage lying horizontally centred at (x,y), optionally angled.
  placeSausage(x, y, ang = 0) {
    const { N, SPACING } = PHYS;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < N; i++) {
      const d = (i - (N - 1) / 2) * SPACING;
      this.px[i] = x + d * ca; this.py[i] = y + d * sa;
      this.vx[i] = 0; this.vy[i] = 0;
    }
    this.restTimer = 0; this.goalTimer = 0; this.status = 'play'; this.failReason = null;
    this.cBody.fill(-1); this.cAge.fill(99);
  }

  // Exact, full mutable state (for the solver: restoring must be indistinguishable from continuous play).
  saveState() {
    return {
      px: Float64Array.from(this.px), py: Float64Array.from(this.py), vx: Float64Array.from(this.vx), vy: Float64Array.from(this.vy),
      cBody: Int32Array.from(this.cBody), cAge: Float64Array.from(this.cAge), cNx: Float64Array.from(this.cNx), cNy: Float64Array.from(this.cNy),
      last: this._lastShape.map(sh => (sh ? this.shapes.indexOf(sh) : -1)),
      t: this.t, restTimer: this.restTimer, goalTimer: this.goalTimer, launchTimer: this.launchTimer, launchCooldown: this.launchCooldown,
      launchersUsed: [...this.launchersUsed], boostUsed: [...this.boostUsed], status: this.status, failReason: this.failReason, airTime: this.airTime,
      sinceLaunch: this.sinceLaunch, maxSpeed: this.maxSpeed, supportBody: this.supportBody,
    };
  }

  loadState(st) {
    this.px.set(st.px); this.py.set(st.py); this.vx.set(st.vx); this.vy.set(st.vy);
    this.cBody.set(st.cBody); this.cAge.set(st.cAge); this.cNx.set(st.cNx); this.cNy.set(st.cNy);
    this._lastShape = st.last.map(i => (i >= 0 ? this.shapes[i] : null));
    this._pending.fill(null);
    this.t = st.t; this.restTimer = st.restTimer; this.goalTimer = st.goalTimer; this.launchTimer = st.launchTimer;
    this.launchCooldown = st.launchCooldown; this.launchersUsed = new Set(st.launchersUsed); this.boostUsed = new Set(st.boostUsed); this.status = st.status;
    this.failReason = st.failReason; this.airTime = st.airTime; this.sinceLaunch = st.sinceLaunch; this.maxSpeed = st.maxSpeed;
    this.supportBody = st.supportBody;
    for (const b of this.bodies) if (b.kinematic) this.updateBody(b, this.t);
  }

  savePose() {
    return { px: Array.from(this.px), py: Array.from(this.py) };
  }

  loadPose(p) {
    for (let i = 0; i < PHYS.N; i++) { this.px[i] = p.px[i]; this.py[i] = p.py[i]; this.vx[i] = 0; this.vy[i] = 0; }
    this.restTimer = 0; this.goalTimer = 0; this.status = 'play'; this.failReason = null;
    this.cBody.fill(-1); this.cAge.fill(99); this.launchTimer = 0;
    this.launchersUsed.clear();
    this.boostUsed.clear();
    this.sinceLaunch = 0;
  }

  com() {
    let x = 0, y = 0;
    for (let i = 0; i < PHYS.N; i++) { x += this.px[i]; y += this.py[i]; }
    return [x / PHYS.N, y / PHYS.N];
  }

  comVel() {
    let x = 0, y = 0;
    for (let i = 0; i < PHYS.N; i++) { x += this.vx[i]; y += this.vy[i]; }
    return [x / PHYS.N, y / PHYS.N];
  }

  canLaunch() {
    return this.status === 'play' && this.restTimer >= PHYS.SETTLE_T;
  }

  // Velocity of the surface supporting the sausage (moving platforms carry momentum into launches).
  supportVelocity() {
    const b = this.bodies[this.supportBody];
    if (!b || !b.kinematic) return [0, 0];
    const [cx, cy] = this.com();
    return [b.wx - b.w * (cy - b.pwy), b.wy + b.w * (cx - b.pwx)];
  }

  launch(vx, vy) {
    const [sx, sy] = this.supportVelocity();
    const [cx, cy] = this.com();
    let w = vx * PHYS.SPIN_K;
    if (w > PHYS.SPIN_MAX) w = PHYS.SPIN_MAX; else if (w < -PHYS.SPIN_MAX) w = -PHYS.SPIN_MAX;
    for (let i = 0; i < PHYS.N; i++) {
      const rx = this.px[i] - cx, ry = this.py[i] - cy;
      this.vx[i] = vx + sx - w * ry;
      this.vy[i] = vy + sy + w * rx;
    }
    this.restTimer = 0; this.goalTimer = 0; this.airTime = 0;
    this.launchCooldown = 0.5;
    this.launchersUsed.clear();
    this.boostUsed.clear();
    this.sinceLaunch = 0;
    this.cAge.fill(99);
  }

  // Clamp an aim vector to the permitted launch cone and speed range.
  static clampLaunch(dx, dy, power) {
    // dx,dy: desired direction (unnormalised); power 0..1
    let a = Math.atan2(dy, dx); // y-down; upward is negative
    // Allowed: angles between (-PI - minA) and (minA) going through -PI/2 (up).
    const lo = -Math.PI - PHYS.LAUNCH_MIN_ANGLE, hi = PHYS.LAUNCH_MIN_ANGLE;
    if (a > hi || a < lo) {
      // in the downward cone: snap to nearest bound
      if (a > hi && a <= Math.PI / 2) a = hi;
      else a = lo;
      if (a > Math.PI) a -= TAU;
    }
    const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * Math.max(0, Math.min(1, power));
    return [Math.cos(a) * v, Math.sin(a) * v];
  }

  shapeActive(sh) {
    if (!sh.timed) return true;
    return timerOn(this.bodies[sh.body].timer, this.t);
  }

  step() {
    const { N, SUB, R, SPACING } = PHYS;
    const h = PHYS.DT / SUB;
    const G = this.G;
    const px = this.px, py = this.py, vx = this.vx, vy = this.vy, ox = this.ox, oy = this.oy;
    const bendAlpha = PHYS.BEND_COMPLIANCE / (h * h);
    const stretchAlpha = PHYS.STRETCH_COMPLIANCE / (h * h);
    const drag = 1 - PHYS.AIR_DRAG * h;
    const shapes = this.shapes;
    let hazardHit = null;
    let goalCount = 0;
    let launchZone = null, launchCount = 0;
    let impactMax = 0, impactShape = null, impactX = 0, impactY = 0;
    let boosted = -1;
    const kin = this.kin;
    const cand = this._cand;
    // broadphase once per frame (generous margin covers a full frame of motion)
    {
      let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (let i = 0; i < N; i++) {
        if (px[i] < minx) minx = px[i]; if (px[i] > maxx) maxx = px[i];
        if (py[i] < miny) miny = py[i]; if (py[i] > maxy) maxy = py[i];
      }
      const m = R + 64;
      minx -= m; miny -= m; maxx += m; maxy += m;
      cand.length = 0;
      for (const sh of shapes) {
        if (sh.maxx < minx || sh.minx > maxx || sh.maxy < miny || sh.miny > maxy) continue;
        if (!this.shapeActive(sh)) continue;
        cand.push(sh);
      }
    }

    for (let s = 0; s < SUB; s++) {
      const t = this.t + (s + 1) * h;
      for (const b of kin) this.updateBody(b, t);
      // external forces from wind sensors
      for (const sh of cand) {
        if (!sh.wind) continue;
        for (let i = 0; i < N; i++) {
          if (this.pointInShape(sh, px[i], py[i], 0)) {
            const b = this.bodies[sh.body];
            const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
            const fx = sh.wind[0] * (b.inst.flip ? -1 : 1), fy = sh.wind[1];
            vx[i] += (fx * ca - fy * sa) * h; vy[i] += (fx * sa + fy * ca) * h;
          }
        }
      }
      for (let i = 0; i < N; i++) {
        vy[i] += G * h;
        vx[i] *= drag; vy[i] *= drag;
        this.ovx[i] = vx[i]; this.ovy[i] = vy[i];
        ox[i] = px[i]; oy[i] = py[i];
        px[i] += vx[i] * h; py[i] += vy[i] * h;
      }
      // stretch constraints
      for (let i = 0; i < N - 1; i++) {
        const dx = px[i + 1] - px[i], dy = py[i + 1] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const C = d - SPACING;
        const dl = -C / (2 + stretchAlpha);
        const nx = dx / d, ny = dy / d;
        px[i] -= nx * dl; py[i] -= ny * dl;
        px[i + 1] += nx * dl; py[i + 1] += ny * dl;
      }
      // bend constraints (i, i+2)
      for (let i = 0; i < N - 2; i++) {
        const dx = px[i + 2] - px[i], dy = py[i + 2] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const C = d - 2 * SPACING;
        const dl = -C / (2 + bendAlpha);
        const nx = dx / d, ny = dy / d;
        px[i] -= nx * dl; py[i] -= ny * dl;
        px[i + 2] += nx * dl; py[i + 2] += ny * dl;
      }
      // long-range shape keeping (i, i+4) — keeps the sausage from folding in half
      for (let i = 0; i < N - 4; i++) {
        const dx = px[i + 4] - px[i], dy = py[i + 4] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const C = d - 4 * SPACING;
        if (C > 0) continue;
        const dl = -C / (2 + bendAlpha * 6);
        const nx = dx / d, ny = dy / d;
        px[i] -= nx * dl; py[i] -= ny * dl;
        px[i + 4] += nx * dl; py[i + 4] += ny * dl;
      }
      // collisions
      for (let i = 0; i < N; i++) {
        this.cAge[i] += h;
        for (const sh of cand) {
          if (sh.sensor) continue;
          if (!this.collide(sh, px[i], py[i], R)) continue;
          const nx = this._cx, ny = this._cy, depth = this._cd;
          if (sh.hazard) { hazardHit = hazardHit || sh; }
          px[i] += nx * depth; py[i] += ny * depth;
          // velocity solve (store contact for after velocity update)
          this._contact(i, sh, nx, ny, depth);
        }
      }
      // derive velocities and apply contact response
      for (let i = 0; i < N; i++) {
        const nvx = (px[i] - ox[i]) / h, nvy = (py[i] - oy[i]) / h;
        vx[i] = nvx; vy[i] = nvy;
      }
      for (let i = 0; i < N; i++) {
        const sh = this._pending[i];
        if (!sh) continue;
        this._pending[i] = null;
        const c = { nx: this._pnx[i], ny: this._pny[i], depth: this._pd[i] };
        const b = this.bodies[sh.body];
        // surface velocity
        let svx = 0, svy = 0;
        if (b.kinematic) {
          svx = b.wx - b.w * (py[i] - b.pwy);
          svy = b.wy + b.w * (px[i] - b.pwx);
        }
        if (sh.conveyor) { svx += -c.ny * sh.conveyor; svy += c.nx * sh.conveyor; }
        const rvx = vx[i] - svx, rvy = vy[i] - svy;
        const vn = rvx * c.nx + rvy * c.ny;
        const tvx = rvx - vn * c.nx, tvy = rvy - vn * c.ny;
        const vt = Math.sqrt(tvx * tvx + tvy * tvy);
        // friction
        const mu = sh.friction;
        if (vt > 1e-6) {
          const f = Math.min(1, mu * (c.depth / h) / vt);
          vx[i] -= tvx * f; vy[i] -= tvy * f;
        }
        // restitution
        const ovn = (this.ovx[i] - svx) * c.nx + (this.ovy[i] - svy) * c.ny;
        let target = 0;
        if (ovn < -2 * G * h * 4) target = -sh.bounce * ovn;
        if (sh.boost && ovn < -150 && !this.boostUsed.has(sh.body)) { target = Math.max(target, Math.min(sh.boost, -ovn * 1.6)); boosted = sh.body; }
        vx[i] += c.nx * (target - vn); vy[i] += c.ny * (target - vn);
        if (-ovn > impactMax) { impactMax = -ovn; impactShape = sh; impactX = px[i] - c.nx * R; impactY = py[i] - c.ny * R; }
      }
      // sensors
      for (const sh of cand) {
        if (!sh.sensor) continue;
        if (!(sh.hazard || sh.goal || sh.launch)) continue;
        let cnt = 0;
        for (let i = 0; i < N; i++) if (this.pointInShape(sh, px[i], py[i], sh.hazard ? R * 0.6 : 0)) cnt++;
        if (!cnt) continue;
        if (sh.hazard) { hazardHit = hazardHit || sh; }
        if (sh.goal && s === SUB - 1) goalCount = Math.max(goalCount, cnt);
        if (sh.launch && s === SUB - 1 && cnt > launchCount) { launchCount = cnt; launchZone = sh; }
      }
    }
    if (boosted >= 0) this.boostUsed.add(boosted);
    this.t += PHYS.DT;
    this.airTime += PHYS.DT;
    if (this.launchCooldown > 0) this.launchCooldown -= PHYS.DT;

    // impact event
    if (impactShape && impactMax > 120 && this.recordEvents) {
      const bi = impactShape.body;
      if (this.t - (this.lastImpact[bi % 64] || 0) > 0.12) {
        this.lastImpact[bi % 64] = this.t;
        this.events.push({ type: 'impact', x: impactX, y: impactY, speed: impactMax, mat: impactShape.mat, bounce: impactShape.bounce, boost: impactShape.boost, body: bi, sticky: impactShape.sticky });
      }
    }

    if (this.status !== 'play') return;

    // contact bookkeeping
    let contacts = 0, maxRel = 0;
    const counts = new Map();
    for (let i = 0; i < N; i++) {
      let rvx = vx[i], rvy = vy[i];
      if (this.cAge[i] < 0.06) {
        contacts++;
        const bi = this.cBody[i];
        counts.set(bi, (counts.get(bi) || 0) + 1);
        const b = this.bodies[bi];
        if (b && b.kinematic) {
          rvx -= b.wx - b.w * (py[i] - b.pwy);
          rvy -= b.wy + b.w * (px[i] - b.pwx);
        }
        const sh = this._lastShape[i];
        if (sh && sh.conveyor) { rvx -= -this.cNy[i] * sh.conveyor; rvy -= this.cNx[i] * sh.conveyor; }
      }
      const sp = Math.sqrt(rvx * rvx + rvy * rvy);
      if (sp > maxRel) maxRel = sp;
    }
    let best = -1, bestC = 0;
    for (const [bi, c] of counts) if (c > bestC) { bestC = c; best = bi; }
    if (best >= 0) this.supportBody = best;
    this.maxSpeed = maxRel;
    if (contacts > 0) this.airTime = 0;

    // hazards
    if (hazardHit) {
      this.status = 'fail';
      this.failReason = hazardHit.hazard;
      this.failBody = hazardHit.body;
      if (this.recordEvents) { const [cx, cy] = this.com(); this.events.push({ type: 'fail', reason: hazardHit.hazard, x: cx, y: cy }); }
      return;
    }
    // stuck (hovering in a lift, endlessly rocking…) → treat as a drop
    this.sinceLaunch += PHYS.DT;
    if (this.sinceLaunch > 12 || this.airTime > 7) {
      this.status = 'fail'; this.failReason = 'stuck';
      if (this.recordEvents) { const [x, y] = this.com(); this.events.push({ type: 'fail', reason: 'stuck', x, y }); }
      return;
    }
    // out of world
    const [cx, cy] = this.com();
    if (cy > this.level.h + 200 || cy < -3000) {
      this.status = 'fail'; this.failReason = this.level.floor || 'floor';
      if (this.recordEvents) this.events.push({ type: 'fail', reason: this.failReason, x: cx, y: cy });
      return;
    }

    // launcher zones (toasters, jack-in-the-box…)
    if (launchZone && this.launchersUsed.has(launchZone.body)) launchZone = null;
    if (launchZone && launchCount >= 3 && this.launchCooldown <= 0) {
      this.launchTimer += PHYS.DT;
      if (this.launchTimer >= 0.05) {
        const b = this.bodies[launchZone.body];
        const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
        const lx = launchZone.launch[0] * (b.inst.flip ? -1 : 1), ly = launchZone.launch[1];
        const wx = lx * ca - ly * sa, wy = lx * sa + ly * ca;
        for (let i = 0; i < N; i++) { vx[i] = wx; vy[i] = wy; }
        // a little tumble
        const w = (wx >= 0 ? 1 : -1) * 2.2;
        for (let i = 0; i < N; i++) { const rx = px[i] - cx, ry = py[i] - cy; vx[i] += -w * ry; vy[i] += w * rx; }
        this.launchTimer = 0; this.launchCooldown = 0.6; this.restTimer = 0;
        this.launchersUsed.add(launchZone.body);
        if (this.recordEvents) this.events.push({ type: 'launcher', x: cx, y: cy, body: launchZone.body });
        return;
      }
    } else this.launchTimer = 0;

    // goal
    if (goalCount >= 6 && maxRel < 90) {
      this.goalTimer += PHYS.DT;
      if (this.goalTimer >= PHYS.WIN_T) {
        this.status = 'win';
        if (this.recordEvents) this.events.push({ type: 'win', x: cx, y: cy });
        return;
      }
    } else this.goalTimer = 0;

    // settle (never while resting in the goal — that resolves as a win instead)
    // Resting resets as soon as the sausage slides or leaves the surface again, so it can never be
    // flipped mid-fall (which also saved a mid-air checkpoint and could loop respawns forever).
    if (contacts >= 2 && maxRel < PHYS.SETTLE_V && !(launchZone && launchCount >= 5) && goalCount < 6) this.restTimer += PHYS.DT;
    else if (maxRel > PHYS.SETTLE_V * 2.2 || contacts < 2) this.restTimer = 0;
    if (this.restTimer >= PHYS.SETTLE_T) this.sinceLaunch = 0;
  }

  _contact(i, sh, nx, ny, depth) {
    const p = this._pending[i];
    if (!p || depth > this._pd[i]) { this._pending[i] = sh; this._pnx[i] = nx; this._pny[i] = ny; this._pd[i] = depth; }
    this.cBody[i] = sh.body; this.cAge[i] = 0; this.cNx[i] = nx; this.cNy[i] = ny;
    this._lastShape[i] = sh;
  }

  pointInShape(sh, x, y, pad) {
    if (x < sh.minx - pad || x > sh.maxx + pad || y < sh.miny - pad || y > sh.maxy + pad) return false;
    if (sh.kind === 0) return _hyp(x - sh.cx, y - sh.cy) <= sh.r + pad;
    if (sh.kind === 2) return segDist(x, y, sh.ax, sh.ay, sh.bx, sh.by) <= sh.r + pad;
    for (let k = 0; k < sh.n; k++) {
      if ((x - sh.wx[k]) * sh.nx[k] + (y - sh.wy[k]) * sh.ny[k] > pad) return false;
    }
    return true;
  }

  // Returns [nx, ny, depth] pushing a circle (x,y,r) out of the shape, or null.
  collide(sh, x, y, r) {
    if (x < sh.minx - r || x > sh.maxx + r || y < sh.miny - r || y > sh.maxy + r) return false;
    if (sh.kind === 0) {
      const dx = x - sh.cx, dy = y - sh.cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const pen = sh.r + r - d;
      if (pen <= 0) return false;
      if (d < 1e-6) { this._cx = 0; this._cy = -1; this._cd = pen; return true; }
      { this._cx = dx / d; this._cy = dy / d; this._cd = pen; return true; }
    }
    if (sh.kind === 2) {
      const ax = sh.ax, ay = sh.ay, bx = sh.bx, by = sh.by;
      const ex = bx - ax, ey = by - ay;
      const l2 = ex * ex + ey * ey || 1e-9;
      let u = ((x - ax) * ex + (y - ay) * ey) / l2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const qx = ax + ex * u, qy = ay + ey * u;
      const dx = x - qx, dy = y - qy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const pen = sh.r + r - d;
      if (pen <= 0) return false;
      if (d < 1e-6) { this._cx = 0; this._cy = -1; this._cd = pen; return true; }
      { this._cx = dx / d; this._cy = dy / d; this._cd = pen; return true; }
    }
    // convex polygon
    let maxS = -1e9, mi = -1;
    for (let k = 0; k < sh.n; k++) {
      const s = (x - sh.wx[k]) * sh.nx[k] + (y - sh.wy[k]) * sh.ny[k];
      if (s > r) return false;
      if (s > maxS) { maxS = s; mi = k; }
    }
    if (maxS <= 0) {
      this._cx = sh.nx[mi]; this._cy = sh.ny[mi]; this._cd = r - maxS; return true;
    }
    // outside but within r of the edge line: find closest feature among edges with s > 0
    let bestD = 1e9, bnx = 0, bny = 0;
    for (let k = 0; k < sh.n; k++) {
      const s = (x - sh.wx[k]) * sh.nx[k] + (y - sh.wy[k]) * sh.ny[k];
      if (s <= 0) continue;
      const j = (k + 1) % sh.n;
      const ax = sh.wx[k], ay = sh.wy[k], ex = sh.wx[j] - ax, ey = sh.wy[j] - ay;
      const l2 = ex * ex + ey * ey || 1e-9;
      let u = ((x - ax) * ex + (y - ay) * ey) / l2;
      if (u >= 0 && u <= 1) {
        if (s < bestD) { bestD = s; bnx = sh.nx[k]; bny = sh.ny[k]; }
      } else {
        u = u < 0 ? 0 : 1;
        const qx = ax + ex * u, qy = ay + ey * u;
        const dx = x - qx, dy = y - qy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestD) { bestD = d; bnx = dx / (d || 1); bny = dy / (d || 1); }
      }
    }
    if (bestD >= r) return false;
    { this._cx = bnx; this._cy = bny; this._cd = r - bestD; return true; }
  }
}

function segDist(x, y, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const l2 = ex * ex + ey * ey || 1e-9;
  let u = ((x - ax) * ex + (y - ay) * ey) / l2;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return _hyp(x - ax - ex * u, y - ay - ey * u);
}

// Simulate a launch from a settled state until the sausage settles again, wins or fails.
// Used by the solver and by tests. Returns {status, pose, t, support}.
export function simulateShot(sim, vx, vy, maxT = 7) {
  sim.launch(vx, vy);
  const t0 = sim.t;
  // must leave the rest state first
  while (sim.t - t0 < maxT) {
    sim.step();
    if (sim.status !== 'play') break;
    if (sim.t - t0 > 0.15 && sim.canLaunch()) break;
  }
  if (sim.status === 'play' && !sim.canLaunch()) return { status: 'timeout', t: sim.t };
  return { status: sim.status, reason: sim.failReason, t: sim.t, support: sim.supportBody };
}

// Free-flight preview of the centre of mass (what the aim guide draws).
export function previewArc(x, y, vx, vy, gScale, dur, steps) {
  const G = PHYS.G * gScale;
  const pts = [];
  for (let k = 1; k <= steps; k++) {
    const t = (dur * k) / steps;
    // account for air drag approximately (tiny)
    pts.push([x + vx * t, y + vy * t + 0.5 * G * t * t]);
  }
  return pts;
}
