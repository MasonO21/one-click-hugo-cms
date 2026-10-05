// One play session of a level: simulation, input, camera, effects, rendering.
import { Sim, PHYS, motionAt, timerOn, previewArc } from './physics.js';
import { OBJECTS, FAIL_TEXT, WORLDS } from './objects.js';
import { FX } from './fx.js';
import { drawObject, hasFront, drawCollisionDebug } from './art/objects/index.js';
import { drawBackground } from './art/backgrounds.js';
import { drawSausage, drawSausageShadow, makeFaceState, updateFace, centreline, SKINS, SKIN_BY_ID } from './art/sausage.js';
import { INK, rgba, circlePath } from './art/common.js';

const W = PHYS.W;
const NOOP = () => {};
const SILENT_AUDIO = { play: NOOP, impact: NOOP, charge: NOOP, stopCharge: NOOP, sizzle: NOOP };
const FLOOR_SHOW = 90;
const TAU = Math.PI * 2;

const IMPACT_COLORS = { wood: '#f3e3c8', metal: '#ffffff', soft: '#ffe0ea', plastic: '#ffffff', glass: '#e8fbff', ceramic: '#ffffff', food: '#ffe9c2', stone: '#e6e0d8', slick: '#fff6b0', sticky: '#ffc0e3', rubber: '#fff3b0', sand: '#f2deae', cloud: '#ffffff', floor: '#f3eadb', wall: '#ffffff', piano: '#ffffff', drum: '#ffffff', xylo: '#ffffff', ice: '#e6f9ff' };

export class Game {
  constructor(app, level, info, opts = {}) {
    this.app = app;
    this.silent = !!opts.silent;
    this.attract = !!opts.attract;
    this.au = this.silent ? SILENT_AUDIO : app.audio;
    this.level = level;
    this.info = info; // {index, world, worldIndex, num, name, par}
    this.world = WORLDS[info.worldIndex];
    this.fx = new FX();
    this.face = makeFaceState();
    this.t = 0; // real seconds
    this.acc = 0;
    this.timeScale = 1;
    this.flips = 0;
    this.phase = 'intro';
    this.phaseT = 0;
    this.aim = null;
    this.camX = W / 2; this.camY = 0; this.zoom = 1; this.zoomTarget = 1;
    this.overview = false;
    this.bodyState = [];
    this.lastSettled = false;
    this.landedT = 0;
    this.winT = 0;
    this.paused = false;
    this.debug = !!app.debug;
    this.reset(true);
  }

  reset(first = false) {
    const L = this.level;
    this.sim = new Sim({ ...L, gravity: L.gravity ?? this.world.gravity, floor: L.floor ?? this.world.floor });
    const st = L.start;
    this.sim.placeSausage(st[0], st[1], st[2] || 0);
    // pre-roll so the sausage starts resting
    for (let i = 0; i < 90; i++) this.sim.step();
    this.sim.t = 0; this.sim.events.length = 0;
    for (const b of this.sim.bodies) this.sim.updateBody(b, 0, true);
    this.prevX = Float64Array.from(this.sim.px); this.prevY = Float64Array.from(this.sim.py);
    this.checkpoint = this.makeCheckpoint();
    this.flips = 0;
    this.showHint = false;
    this.fx.clear();
    this.bodyState = this.sim.bodies.map(() => ({ pop: 0, hit: 0, tilt: 0, flipA: 0, flipV: 0, on: true, warn: 0 }));
    this.goalBody = this.sim.bodies.findIndex(b => b.type && b.type.role === 'goal');
    this.panBody = this.sim.bodies.findIndex(b => b.type && b.type.role === 'start');
    this.dynamic = this.sim.bodies.map(b => {
      if (!b.type) return false;
      const ty = b.type;
      return !!(b.kinematic || ty.anim || ty.role === 'bouncer' || ty.role === 'launcher' || ty.role === 'start' || b.timer);
    });
    this.winT = 0;
    this.winShown = false;
    this.timeScale = 1;
    this.acc = 0;
    this.aim = null;
    this.face.expr = 'idle';
    if (!first) {
      this.phase = 'play';
      this.hud();
    } else {
      // intro: camera starts at goal, then glides to sausage
      this.phase = 'intro';
      this.phaseT = 0;
    }
    this.bgDirty = true;
  }

  hud() { if (!this.attract && this.app.ui) this.app.ui.updateHud(this); }
  hap(p) { if (!this.silent) this.app.haptic(p); }

  makeCheckpoint() {
    const s = this.sim;
    const b = s.bodies[s.supportBody];
    return { pose: s.savePose(), body: s.supportBody, pwx: b ? b.pwx : 0, pwy: b ? b.pwy : 0, ang: b ? b.ang : 0 };
  }

  restoreCheckpoint() {
    const cp = this.checkpoint;
    const s = this.sim;
    const b = s.bodies[cp.body];
    const pose = { px: cp.pose.px.slice(), py: cp.pose.py.slice() };
    if (b && b.kinematic) {
      // re-attach relative to the platform's current transform
      const da = b.ang - cp.ang, ca = Math.cos(da), sa = Math.sin(da);
      for (let i = 0; i < pose.px.length; i++) {
        const lx = pose.px[i] - cp.pwx, ly = pose.py[i] - cp.pwy;
        pose.px[i] = b.pwx + lx * ca - ly * sa;
        pose.py[i] = b.pwy + lx * sa + ly * ca - 2;
      }
    }
    s.loadPose(pose);
    this.prevX = Float64Array.from(s.px); this.prevY = Float64Array.from(s.py);
    const [cx, cy] = s.com();
    this.fx.dust(cx, cy, 14, 1.2, '#ffffff');
    this.fx.ring(cx, cy, 10, 90, 0.4, '#ffffff');
    this.au.play('respawn');
  }

  // ------------------------------------------------------------------ input
  pointerDown(x, y) {
    if (this.paused) return;
    if (this.phase === 'intro') { this.skipIntro(); return; }
    if (this.phase !== 'play') return;
    if (this.overview) { this.toggleOverview(false); return; }
    this.aim = { sx: x, sy: y, x, y, power: 0, vx: 0, vy: 0, valid: false };
    this.au.play('grab');
  }

  pointerMove(x, y) {
    if (!this.aim) return;
    this.aim.x = x; this.aim.y = y;
    this.updateAim();
  }

  pointerUp() {
    const a = this.aim;
    this.aim = null;
    this.au.stopCharge();
    if (!a || this.phase !== 'play') return;
    if (!a.valid) return;
    if (!this.sim.canLaunch()) { this.fx.text('WAIT!', ...this.sim.com().map((v, i) => i ? v - 50 : v), { size: 30, color: '#ffffff', life: 0.6 }); return; }
    this.launch(a.vx, a.vy, a.power);
  }

  updateAim() {
    const a = this.aim;
    const maxDrag = this.app.maxDrag();
    const dx = a.sx - a.x, dy = a.sy - a.y;
    const len = Math.hypot(dx, dy);
    a.valid = len > 14;
    a.power = Math.min(1, Math.max(0, (len - 14) / (maxDrag - 14)));
    const [vx, vy] = Sim.clampLaunch(dx, dy, a.power);
    a.vx = vx; a.vy = vy;
    this.au.charge(a.valid ? a.power : -1);
  }

  launch(vx, vy, power) {
    const s = this.sim;
    this.checkpoint = this.makeCheckpoint();
    const inPan = s.supportBody === this.panBody;
    s.launch(vx, vy);
    this.flips++;
    this.hud();
    const [cx, cy] = s.com();
    this.fx.dust(cx, cy + 12, 8, 0.8);
    if (inPan) {
      const bs = this.bodyState[this.panBody];
      bs.flipV = 9 + power * 8;
      this.fx.oil(cx, cy + 8, 10);
      this.au.play('panflip', { power });
    } else {
      this.au.play('flip', { power });
    }
    this.face.expr = 'wide';
    this.hap(12);
    this.lastSettled = false;
    if (!this.attract) this.app.trophies.onFlip();
  }

  // ---- hints: trace the verified solution from the start as a dotted route
  hintReady() {
    return !this.attract && (this.level.solution || []).length > 0 && (this.fails >= 3 || this.flips >= this.info.par + 3) && !this.showHint;
  }

  useHint() {
    if (!this.level.solution || !this.level.solution.length) return;
    this.reset();
    this.showHint = true;
    this.hintPaths = this.traceSolution();
    this.app.trophies.onHint();
    this.au.play('unlock');
    this.hud();
  }

  traceSolution() {
    const L = this.level;
    const sim = new Sim({ ...L, gravity: L.gravity ?? this.world.gravity, floor: L.floor ?? this.world.floor }, { events: false });
    sim.placeSausage(L.start[0], L.start[1], L.start[2] || 0);
    for (let i = 0; i < 90; i++) sim.step();
    sim.t = 0; for (const b of sim.bodies) sim.updateBody(b, 0, true);
    for (let i = 0; i < 120 && !sim.canLaunch(); i++) sim.step();
    const paths = [];
    for (const [a, p, delay] of L.solution) {
      for (let i = 0; i < Math.round((delay || 0) / PHYS.DT); i++) sim.step();
      const v = PHYS.MIN_V + (PHYS.MAX_V - PHYS.MIN_V) * p;
      const [cx, cy] = sim.com();
      sim.launch(Math.cos(a) * v, Math.sin(a) * v);
      const pts = [[cx, cy]];
      const t0 = sim.t;
      while (sim.t - t0 < 7) { sim.step(); pts.push(sim.com()); if (sim.status !== 'play') break; if (sim.t - t0 > 0.15 && sim.canLaunch()) break; }
      paths.push({ pts, a, p, delay: delay || 0 });
      if (sim.status !== 'play') break;
    }
    return paths;
  }

  drawHintPaths(ctx) {
    if (!this.showHint || !this.hintPaths) return;
    const colors = ['#ffd23f', '#7be0ff', '#ff8fd1', '#7be07b', '#ffb347', '#b38cff'];
    ctx.save();
    ctx.lineCap = 'round';
    this.hintPaths.forEach((hp, k) => {
      const col = colors[k % colors.length];
      const dash = (this.t * 60) % 26;
      ctx.setLineDash([2, 24]); ctx.lineDashOffset = -dash;
      ctx.beginPath(); hp.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(58,34,22,0.5)'; ctx.stroke();
      ctx.lineWidth = 8; ctx.strokeStyle = col; ctx.stroke();
      ctx.setLineDash([]);
      const [x0, y0] = hp.pts[0];
      ctx.font = '26px "Lilita One", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.beginPath(); ctx.arc(x0, y0 - 46, 17, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = INK; ctx.fillText(String(k + 1), x0, y0 - 45);
    });
    // a ghost sausage tracing the route on loop
    const all = this.hintPaths.flatMap(hp => hp.pts);
    if (all.length > 2) {
      const idx = Math.floor((this.t * 60) % (all.length + 40));
      if (idx < all.length) {
        const [gx, gy] = all[idx];
        ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.ellipse(gx, gy, 62, 16, 0, 0, TAU);
        ctx.fillStyle = '#ffb08a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(58,34,22,0.6)'; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  toggleOverview(force) {
    this.overview = force ?? !this.overview;
    this.au.play('click');
  }

  skipIntro() {
    if (this.phase !== 'intro') return;
    this.phase = 'play';
    this.hud();
  }

  // ------------------------------------------------------------------ update
  update(dtReal) {
    if (this.paused) return;
    dtReal = Math.min(dtReal, 0.1);
    this.t += dtReal;
    this.phaseT += dtReal;
    const dt = dtReal * this.timeScale;
    const s = this.sim;

    if (this.phase === 'intro' && this.phaseT > this.introDuration()) this.skipIntro();

    // fixed-step physics
    this.acc += dt;
    let steps = 0;
    while (this.acc >= PHYS.DT && steps < 5) {
      this.prevX.set(s.px); this.prevY.set(s.py);
      s.step();
      this.acc -= PHYS.DT;
      steps++;
      this.handleEvents();
    }
    if (steps === 5) this.acc = 0;
    this.alpha = this.acc / PHYS.DT;

    // body animation state
    for (let i = 0; i < s.bodies.length; i++) {
      const b = s.bodies[i], st = this.bodyState[i];
      st.hit = Math.max(0, st.hit - dtReal * 3.2);
      st.pop = Math.max(0, st.pop - dtReal * 2.5);
      if (b.timer) {
        st.on = timerOn(b.timer, s.t);
        const f = ((s.t / b.timer.period + (b.timer.phase || 0)) % 1 + 1) % 1;
        const untilOn = (1 - f) * b.timer.period;
        st.warn = !st.on && untilOn < 0.6 ? 1 - untilOn / 0.6 : 0;
      }
      // pan spring
      if (i === this.panBody) {
        const target = this.aim && s.supportBody === this.panBody ? -0.06 * this.aim.power : 0;
        st.flipV += ((target - st.flipA) * 220 - st.flipV * 16) * dtReal;
        st.flipA += st.flipV * dtReal;
      }
    }

    // pan sizzle while resting in it
    if (this.panBody >= 0 && s.supportBody === this.panBody && s.airTime === 0) {
      if (Math.random() < dtReal * 6) { const [cx, cy] = s.com(); this.fx.oil(cx, cy + 10, 1); }
      if (Math.random() < dtReal * 3) { const [cx, cy] = s.com(); this.fx.steam(cx, cy - 10, 80); }
      this.au.sizzle(0.5);
    } else this.au.sizzle(0);

    // ambient fx for wind zones / steam sources
    for (const sh of s.shapes) {
      if (sh.wind && Math.random() < dtReal * 14) {
        const b = s.bodies[sh.body];
        const ca = Math.cos(b.ang), sa = Math.sin(b.ang);
        const fx = sh.wind[0] * (b.inst.flip ? -1 : 1), fy = sh.wind[1];
        const cx = (sh.minx + sh.maxx) / 2, cy = (sh.miny + sh.maxy) / 2;
        this.fx.wind(cx, cy, fx * ca - fy * sa, fx * sa + fy * ca, sh.maxx - sh.minx, sh.maxy - sh.miny);
      }
      if (sh.hazard === 'boil' && Math.random() < dtReal * 4) this.fx.steam((sh.minx + sh.maxx) / 2, sh.miny, sh.maxx - sh.minx);
    }

    // settle detection → happy face + checkpoint
    const ready = s.canLaunch();
    if (ready && !this.lastSettled && this.phase === 'play') {
      this.lastSettled = true;
      this.checkpoint = this.makeCheckpoint();
      if (this.flips > 0) { this.face.expr = 'happy'; this.face.exprT = 0.9; }
    }
    if (!ready && s.restTimer === 0) this.lastSettled = false;

    // face
    this.updateFaceState(dtReal);
    updateFace(this.face, dtReal);

    // trail while flying fast
    if (s.airTime > 0.05 && s.status === 'play') {
      const [vx, vy] = s.comVel();
      if (vx * vx + vy * vy > 500 * 500 && Math.random() < 0.7) { const [cx, cy] = s.com(); this.fx.trail(cx, cy, 'rgba(255,255,255,0.9)'); }
    }

    // fail / win flow
    if (this.phase === 'fail') {
      if (this.phaseT > 1.0) { this.phase = 'play'; this.restoreCheckpoint(); this.face.expr = 'idle'; }
    } else if (this.phase === 'win') {
      this.winT += dtReal;
      this.timeScale = this.winT < 0.7 ? 0.35 : Math.min(1, this.timeScale + dtReal * 2);
      if (this.winT > 1.6 && !this.winShown) { this.winShown = true; if (!this.attract) this.app.onWin(this); }
    }

    this.fx.update(dt);
    this.updateCamera(dtReal);
  }

  updateFaceState(dt) {
    const s = this.sim, f = this.face;
    const [vx, vy] = s.comVel();
    if (this.phase === 'win') { f.expr = 'win'; f.lookX = 0; f.lookY = 1; return; }
    if (this.phase === 'fail') { f.expr = 'fail'; return; }
    if (this.aim && this.aim.valid) {
      f.expr = 'aim'; f.power = this.aim.power;
      f.lookX = this.aim.vx; f.lookY = this.aim.vy;
      return;
    }
    if (s.airTime > 0.06) {
      // spin rate estimate
      const n = PHYS.N;
      const ax = s.px[n - 1] - s.px[0], ay = s.py[n - 1] - s.py[0];
      const ang = Math.atan2(ay, ax);
      const prev = this._prevAng ?? ang;
      let dA = ang - prev; if (dA > Math.PI) dA -= TAU; if (dA < -Math.PI) dA += TAU;
      this._spin = (this._spin || 0) * 0.85 + Math.abs(dA / (dt || 0.016)) * 0.15;
      this._prevAng = ang;
      if (this._spin > 11) f.expr = 'dizzy';
      else f.expr = vy > 750 ? 'scared' : 'wide';
      f.lookX = vx; f.lookY = vy;
      return;
    }
    this._prevAng = undefined;
    if (f.exprT > 0) return;
    f.expr = 'idle';
    // idle: glance toward the bun
    const gb = s.bodies[this.goalBody];
    if (gb) {
      const [cx, cy] = s.com();
      const tx = gb.cx - cx, ty = gb.cy - cy;
      const wob = Math.sin(this.t * 0.7) * 0.4;
      f.lookX += ((tx / (Math.hypot(tx, ty) || 1)) + wob - f.lookX) * Math.min(1, dt * 3);
      f.lookY += ((ty / (Math.hypot(tx, ty) || 1)) - f.lookY) * Math.min(1, dt * 3);
    }
  }

  handleEvents() {
    const s = this.sim;
    for (const e of s.events) {
      if (e.type === 'impact') {
        const k = Math.min(1, e.speed / 1400);
        const body = s.bodies[e.body];
        const st = this.bodyState[e.body];
        if (st) st.hit = Math.max(st.hit, 0.3 + k);
        this.au.impact(e.mat, k, e.boost || e.bounce > 0.5);
        if (e.speed > 260) this.fx.dust(e.x, e.y, Math.round(4 + k * 10), 0.6 + k, IMPACT_COLORS[e.mat] || '#ffffff');
        if (e.speed > 900) { this.fx.shake(4 + k * 8); this.hap(8); }
        if (e.boost || e.bounce > 0.6) {
          if (e.speed > 300 && !this.attract) this.app.trophies.onBounce();
          if (e.speed > 300) { this.fx.text(pick(['BOING!', 'BOINK!', 'SPROING!']), e.x, e.y - 60, { size: 34, color: '#7be0ff', life: 0.8 }); this.fx.ring(e.x, e.y, 10, 70, 0.35, '#ffffff'); }
        }
        if (e.sticky && e.speed > 200) this.fx.text('SPLAT!', e.x, e.y - 50, { size: 30, color: '#ff8fc7', life: 0.7 });
      } else if (e.type === 'launcher') {
        const st = this.bodyState[e.body];
        if (st) st.pop = 1;
        this.fx.text('POP!', e.x, e.y - 70, { size: 46, color: '#ffd23f' });
        if (!this.attract) this.app.trophies.onLauncher(s.bodies[e.body] && s.bodies[e.body].type && s.bodies[e.body].type.id);
        this.fx.sparks(e.x, e.y, 10, '#ffd23f');
        this.fx.shake(8);
        this.au.play('pop');
        this.hap(15);
      } else if (e.type === 'fail') {
        this.onFail(e.reason, e.x, e.y);
      } else if (e.type === 'win') {
        this.onWinEvent(e.x, e.y);
      }
    }
    s.events.length = 0;
  }

  onFail(reason, x, y) {
    if (this.phase !== 'play') return;
    this.fails = (this.fails || 0) + 1;
    this.hud();
    if (!this.attract) this.app.trophies.onFail(reason);
    this.phase = 'fail';
    this.phaseT = 0;
    const msgs = FAIL_TEXT[reason] || FAIL_TEXT.floor;
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    const yy = Math.min(y, this.level.h - 80);
    this.fx.text(msg, Math.max(140, Math.min(W - 140, x)), yy - 70, { size: 44, color: '#ff6b5a', life: 1.2, vy: -30 });
    if (reason === 'water' || reason === 'flush') this.fx.splash(x, yy, 24);
    else if (reason === 'burn' || reason === 'fry' || reason === 'boil') { this.fx.smoke(x, yy, 14, '#5a4a44'); this.fx.sparks(x, yy, 8, '#ff9a3c'); }
    else if (reason === 'zap') { this.fx.sparks(x, yy, 18, '#7be0ff'); this.fx.flash = 0.6; }
    else if (reason === 'space' || reason === 'heaven') this.fx.sparks(x, yy, 10, '#ffffff');
    else if (reason === 'dog') { this.fx.dog(Math.max(70, Math.min(W - 70, x)), this.level.h + 30); this.fx.dust(x, this.level.h, 10, 1); }
    else this.fx.dust(x, Math.min(y, this.level.h), 16, 1.3);
    this.fx.shake(10);
    this.au.play('fail', { reason });
    this.hap([20, 40, 20]);
  }

  onWinEvent(x, y) {
    this.phase = 'win';
    this.phaseT = 0;
    this.winT = 0;
    this.winShown = false;
    const gb = this.sim.bodies[this.goalBody];
    const gx = gb ? gb.cx : x, gy = gb ? gb.cy : y;
    this.fx.confetti(gx, gy - 20, 110);
    this.fx.sparks(gx, gy - 20, 16, '#ffd23f', 1.3);
    this.fx.ring(gx, gy - 20, 20, 220, 0.6, '#ffd23f');
    const stars = this.app.starsFor(this.flips, this.info.par);
    const word = stars === 3 ? pick(['PERFECT!', 'DELICIOUS!', 'TOP DOG!']) : stars === 2 ? pick(['NICE!', 'TASTY!', 'GREAT!']) : pick(['DONE!', 'PHEW!', 'NAILED IT…ISH']);
    this.fx.text(word, Math.max(160, Math.min(W - 160, gx)), gy - 120, { size: 60, color: '#ffd23f', life: 1.8, vy: -20, rot: -0.06 });
    this.fx.shake(6);
    this.mustardT = 0;
    this.au.play('win', { stars });
    this.hap([10, 30, 10, 30, 40]);
  }

  introDuration() {
    return this.introSpan > 200 ? 2.0 : 1.2;
  }

  // ------------------------------------------------------------------ camera
  viewSize() {
    const { cw, ch } = this.app;
    const scale = this.app.baseScale() * this.zoom;
    return [cw / scale, ch / scale, scale];
  }

  levelTop() {
    if (this._top !== undefined) return this._top;
    let top = 0;
    for (const b of this.sim.bodies) {
      if (!b.type) continue;
      for (const sh of b.shapes) top = Math.min(top, sh.miny);
    }
    this._top = top - 140;
    return this._top;
  }

  cameraTarget() {
    const [vw, vh] = this.viewSize();
    const s = this.sim;
    let ty;
    if (this.overview) {
      ty = (this.levelTop() + this.level.h + FLOOR_SHOW) / 2;
      return ty;
    }
    const [cx, cy] = s.com();
    if (this.attract) {
      // title screen: frame the action between the logo and the menu buttons
      const lo = Math.min(cy, this.goalBody >= 0 ? s.bodies[this.goalBody].cy : cy);
      return Math.min((cy + lo) / 2 + vh * 0.06, this.level.h + vh * 0.5 - vh * 0.36);
    }
    if (this.phase === 'intro') {
      const gb = s.bodies[this.goalBody];
      const startY = gb ? gb.cy : cy;
      const u = Math.min(1, Math.max(0, (this.phaseT - 0.5) / (this.introDuration() - 0.6)));
      const e = u * u * (3 - 2 * u);
      ty = startY + (cy - vh * 0.1 - startY) * e;
    } else {
      ty = cy - vh * (this.aim ? 0.18 : 0.1);
    }
    return this.clampCamY(ty, vh);
  }

  clampCamY(ty, vh) {
    const bottom = this.level.h + FLOOR_SHOW - vh / 2;
    const top = Math.min(this.levelTop(), this.level.h + FLOOR_SHOW - vh) + vh / 2;
    return Math.max(top, Math.min(bottom, ty));
  }

  updateCamera(dt) {
    // zoom for overview
    if (this.overview) {
      const span = this.level.h + FLOOR_SHOW - this.levelTop();
      const base = this.app.baseScale();
      this.zoomTarget = Math.min(1, this.app.ch / base / span);
    } else this.zoomTarget = 1;
    this.zoom += (this.zoomTarget - this.zoom) * (1 - Math.exp(-dt * 7));
    const ty = this.cameraTarget();
    if (this.camInit === undefined) {
      this.camInit = true;
      const [, vh] = this.viewSize();
      const gb = this.sim.bodies[this.goalBody];
      this.introSpan = gb ? Math.abs(gb.cy - this.sim.com()[1]) : 0;
      this.camY = this.clampCamY(gb ? gb.cy : ty, vh);
    }
    const k = this.phase === 'intro' ? 1 : (1 - Math.exp(-dt * (this.overview ? 6 : 4.5)));
    this.camY += (ty - this.camY) * k;
    this.camX = W / 2;
  }

  // ------------------------------------------------------------------ rendering
  buildBackground() {
    const app = this.app;
    const L = this.level;
    const base = app.baseScale();
    const box = { x0: -420, x1: W + 420, y0: Math.min(this.levelTop() - 400, L.h + FLOOR_SHOW - 1700), y1: L.h + (this.attract ? 900 : 300) };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    let cs = Math.min(base * app.dpr, 2.2);
    const maxPx = 14e6;
    if (bw * bh * cs * cs > maxPx) cs = Math.sqrt(maxPx / (bw * bh));
    const c = this.bgCanvas || document.createElement('canvas');
    c.width = Math.ceil(bw * cs); c.height = Math.ceil(bh * cs);
    const ctx = c.getContext('2d');
    ctx.setTransform(cs, 0, 0, cs, -box.x0 * cs, -box.y0 * cs);
    drawBackground(ctx, L, this.world.id, box, W);
    // static objects: contact shadows then bodies (back layer)
    const s = this.sim;
    for (let i = 0; i < s.bodies.length; i++) {
      const b = s.bodies[i];
      if (!b.type) continue;
      this.drawContactShadow(ctx, b);
    }
    for (let i = 0; i < s.bodies.length; i++) {
      const b = s.bodies[i];
      if (!b.type || this.dynamic[i]) continue;
      this.drawBody(ctx, b, i, 0, 'draw');
    }
    this.bgCanvas = c;
    this.bgBox = box;
    this.bgScale = cs;
    this.bgDirty = false;
  }

  drawContactShadow(ctx, b) {
    if (b.kinematic) return;
    if (this.world.id === 'space' || this.world.id === 'heaven') return; // nothing to cast onto
    const inst = b.inst, ty = b.type;
    const s = inst.s || 1;
    const w = (inst.w || ty.w) * s, h = (inst.h || ty.h) * s;
    if (ty.role === 'support' && !ty.ground && !inst.ground) {
      // wall-mounted: soft drop shadow on the wall
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#2a1408';
      ctx.fillRect(b.x - w / 2 + 6, b.y + 6, w, 16); ctx.restore();
      return;
    }
    const by = b.y + h / 2;
    const g = ctx.createRadialGradient(b.x, by, 0, b.x, by, w * 0.62);
    g.addColorStop(0, 'rgba(40,16,4,0.30)'); g.addColorStop(1, 'rgba(40,16,4,0)');
    ctx.save(); ctx.translate(b.x, by); ctx.scale(1, 0.13); ctx.translate(-b.x, -by);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, by, w * 0.62, 0, TAU); ctx.fill(); ctx.restore();
  }

  bodyTransform(b, t) {
    if (!b.kinematic) return [b.pwx, b.pwy, b.ang];
    const m = motionAt(b.motion, t, this._m || (this._m = {}));
    const cb = Math.cos(b.a), sb = Math.sin(b.a);
    return [b.x + m.ox + b.pivotX * cb - b.pivotY * sb, b.y + m.oy + b.pivotX * sb + b.pivotY * cb, b.a + m.da];
  }

  drawBody(ctx, b, i, t, layer) {
    const inst = b.inst;
    const [pwx, pwy, ang] = this.bodyTransform(b, t);
    const st = this.bodyState[i];
    const s = inst.s || 1;
    ctx.save();
    ctx.translate(pwx, pwy);
    ctx.rotate(ang);
    ctx.translate(-b.pivotX, -b.pivotY);
    ctx.scale((inst.flip ? -1 : 1) * s, s);
    if (st && st.hit > 0 && (b.type.role === 'bouncer' || b.type.boost)) {
      const h = (inst.h || b.type.h);
      const k = Math.sin(st.hit * 14) * st.hit * 0.09;
      ctx.translate(0, h / 2); ctx.scale(1 + k, 1 - k); ctx.translate(0, -h / 2);
    }
    if (i === this.panBody && st) {
      ctx.translate(150, 0); ctx.rotate(st.flipA); ctx.translate(-150, 0);
    }
    drawObject(ctx, inst, t, st, layer);
    if (this.debug && layer === 'draw') drawCollisionDebug(ctx, inst);
    ctx.restore();
  }

  render(ctx) {
    const app = this.app;
    const { cw, ch, dpr } = app;
    if (this.bgDirty || !this.bgCanvas) this.buildBackground();
    const [vw, vh, scale] = this.viewSize();
    const camX = this.camX + this.fx.shakeX / scale, camY = this.camY + this.fx.shakeY / scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2a1a2e';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (cw / 2 - camX * scale), dpr * (ch / 2 - camY * scale));
    ctx.imageSmoothingEnabled = true;
    const box = this.bgBox;
    ctx.drawImage(this.bgCanvas, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);

    const s = this.sim;
    const rt = s.t - PHYS.DT * (1 - this.alpha);
    // dynamic bodies
    for (let i = 0; i < s.bodies.length; i++) {
      const b = s.bodies[i];
      if (!b.type || !this.dynamic[i]) continue;
      this.drawBody(ctx, b, i, rt, 'draw');
    }
    this.fx.drawBack(ctx);
    this.drawGoalSparkle(ctx);

    // sausage (interpolated)
    const a = this.alpha;
    const N = PHYS.N;
    const px = this._px || (this._px = new Float64Array(N)), py = this._py || (this._py = new Float64Array(N));
    for (let i = 0; i < N; i++) { px[i] = this.prevX[i] + (s.px[i] - this.prevX[i]) * a; py[i] = this.prevY[i] + (s.py[i] - this.prevY[i]) * a; }
    let cx = 0, cy = 0;
    for (let i = 0; i < N; i++) { cx += px[i]; cy += py[i]; }
    cx /= N; cy /= N;
    const showSausage = !(this.phase === 'fail' && ['dog', 'cat', 'gull', 'space', 'heaven', 'flush', 'shred', 'blend'].includes(s.failReason) && this.phaseT > 0.15);
    if (showSausage) {
      drawSausageShadow(ctx, cx, cy, this.groundBelow(cx, cy), 130);
      const skin = SKIN_BY_ID[app.save.skin] || SKINS[0];
      drawSausage(ctx, px, py, { R: PHYS.R, skin, face: this.face, t: this.t, squash: this.aim && this.aim.valid ? this.aim.power : 0, burnt: this.phase === 'fail' && s.failReason === 'burn' });
    }
    // front layers
    for (let i = 0; i < s.bodies.length; i++) {
      const b = s.bodies[i];
      if (!b.type || !hasFront(b.inst)) continue;
      this.drawBody(ctx, b, i, rt, 'front');
    }
    // mustard victory squiggle
    if (this.phase === 'win') this.drawMustard(ctx);

    this.fx.drawFront(ctx);

    this.drawHintPaths(ctx);
    // aim guide
    if (this.aim && this.aim.valid && this.phase === 'play') this.drawAim(ctx, cx, cy);
    else if (this.phase === 'play' && s.canLaunch() && this.flips === 0 && this.info.index === 0) this.drawHint(ctx, cx, cy);

    // ready pulse
    if (this.phase === 'play' && s.canLaunch() && !this.aim) {
      const p = (this.t * 1.4) % 1;
      ctx.globalAlpha = 0.35 * (1 - p);
      circlePath(ctx, cx, cy, 60 + p * 30); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // screen-space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawGoalIndicator(ctx, scale, camX, camY);
    if (this.fx.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.fx.flash * 0.6})`; ctx.fillRect(0, 0, cw, ch); }
    if (this.phase === 'intro') this.drawIntroBanner(ctx);
  }

  drawGoalSparkle(ctx) {
    const gb = this.sim.bodies[this.goalBody];
    if (!gb || this.phase === 'win') return;
    const t = this.t;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i / 3) % 1;
      const x = gb.cx + Math.sin(i * 2.1 + t * 0.9) * 70;
      const y = gb.cy - 40 - ph * 70;
      const r = 7 * Math.sin(ph * Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.85 * Math.sin(ph * Math.PI);
      ctx.translate(x, y); ctx.rotate(t * 2 + i);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; const rr = k % 2 ? r * 0.35 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fillStyle = '#fff6c2'; ctx.fill();
      ctx.restore();
    }
  }

  groundBelow(x, y) {
    let best = null;
    for (const sh of this.sim.shapes) {
      if (sh.sensor || x < sh.minx || x > sh.maxx || sh.miny < y - 5) continue;
      if (best === null || sh.miny < best) best = sh.miny;
    }
    return best;
  }

  drawAim(ctx, cx, cy) {
    const a = this.aim;
    const s = this.sim;
    const [svx, svy] = s.supportVelocity();
    const dur = this.app.save.longAim ? 1.0 : 0.55;
    const pts = previewArc(cx, cy, a.vx + svx, a.vy + svy, s.G / PHYS.G, dur, this.app.save.longAim ? 22 : 13);
    const ready = s.canLaunch();
    // pull band
    const ang = Math.atan2(a.vy, a.vx);
    const bandLen = 30 + a.power * 70;
    ctx.save();
    ctx.globalAlpha = ready ? 1 : 0.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - Math.cos(ang) * bandLen, cy - Math.sin(ang) * bandLen);
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(58,34,22,0.55)'; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke();
    // power arc
    const col = a.power < 0.5 ? '#7be07b' : a.power < 0.8 ? '#ffd23f' : '#ff6b5a';
    ctx.beginPath(); ctx.arc(cx, cy, 78, -Math.PI / 2, -Math.PI / 2 + TAU * a.power);
    ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(58,34,22,0.6)'; ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = col; ctx.stroke();
    // dots
    pts.forEach(([x, y], i) => {
      const u = i / pts.length;
      const r = 7.5 - u * 3.5;
      ctx.globalAlpha = (ready ? 1 : 0.4) * (1 - u * 0.75);
      circlePath(ctx, x, y, r + 2.5); ctx.fillStyle = 'rgba(58,34,22,0.55)'; ctx.fill();
      circlePath(ctx, x, y, r); ctx.fillStyle = '#ffffff'; ctx.fill();
    });
    // arrow head at the end of the guide
    const [ex, ey] = pts[pts.length - 1], [px2, py2] = pts[pts.length - 2];
    const ah = Math.atan2(ey - py2, ex - px2);
    ctx.globalAlpha = (ready ? 1 : 0.4) * 0.5;
    ctx.translate(ex, ey); ctx.rotate(ah);
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }

  drawHint(ctx, cx, cy) {
    // animated "drag back" hand for the very first level
    const p = (this.t * 0.8) % 1;
    const e = p < 0.6 ? p / 0.6 : 1;
    const hx = cx + 30 - e * 110, hy = cy + 30 + e * 90;
    ctx.save();
    ctx.globalAlpha = p < 0.85 ? 1 : (1 - p) / 0.15;
    ctx.setLineDash([8, 10]); ctx.lineDashOffset = -this.t * 30;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (cx - hx) * 1.6, cy + (cy - hy) * 1.6);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
    ctx.setLineDash([]);
    // hand
    ctx.translate(hx, hy); ctx.rotate(-0.4);
    ctx.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('👆', 0, 0);
    ctx.restore();
  }

  drawMustard(ctx) {
    const gb = this.sim.bodies[this.goalBody];
    if (!gb) return;
    const u = Math.min(1, this.winT / 0.9);
    const [cx, cy] = this.sim.com();
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const n = Math.floor(28 * u);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const x = cx - 56 + i * 4, y = cy - 14 + Math.sin(i * 0.9) * 7;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 9; ctx.strokeStyle = '#8a6200'; ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffd21f'; ctx.stroke();
    ctx.restore();
  }

  drawGoalIndicator(ctx, scale, camX, camY) {
    const gb = this.sim.bodies[this.goalBody];
    if (!gb || this.phase === 'intro') return;
    const { cw, ch } = this.app;
    const sy = (gb.cy - camY) * scale + ch / 2;
    const sx = (gb.cx - camX) * scale + cw / 2;
    if (sy > 40) return;
    const y = 96, x = Math.max(36, Math.min(cw - 36, sx));
    const bob = Math.sin(this.t * 5) * 4;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(16, -12); ctx.lineTo(-16, -12); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.font = '22px "Lilita One", system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🌭', 0, 6);
    ctx.font = '14px "Lilita One", system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    const d = Math.round((this.sim.com()[1] - gb.cy) / 10);
    ctx.strokeText(d + 'cm', 0, 30); ctx.fillStyle = '#fff'; ctx.fillText(d + 'cm', 0, 30);
    ctx.restore();
  }

  drawIntroBanner(ctx) {
    const { cw, ch } = this.app;
    const u = this.phaseT;
    const inA = Math.min(1, u / 0.25), outA = Math.max(0, Math.min(1, (this.introDuration() - u) / 0.3));
    const a = Math.min(inA, outA);
    ctx.save();
    ctx.globalAlpha = a;
    const y = ch * 0.4;
    ctx.translate(cw / 2, y);
    const sc = 0.8 + 0.2 * (1 - Math.pow(1 - inA, 3));
    ctx.scale(sc, sc);
    ctx.fillStyle = 'rgba(30,14,8,0.55)';
    const bw = Math.min(cw * 0.9, 420);
    ctx.beginPath(); ctx.roundRect(-bw / 2, -62, bw, 124, 26); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.font = '20px "Lilita One", system-ui';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText(`WORLD ${this.info.worldIndex + 1} · LEVEL ${this.info.num}`, 0, -34);
    ctx.font = '36px "Lilita One", system-ui';
    ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(this.info.name, 0, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillText(this.info.name, 0, 4);
    ctx.font = '18px "Fredoka", system-ui';
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(`Par ${this.info.par} flip${this.info.par > 1 ? 's' : ''}  ·  ${'★'.repeat(this.app.save.stars[this.info.index] || 0) || 'new!'}`, 0, 40);
    ctx.restore();
  }
}

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
