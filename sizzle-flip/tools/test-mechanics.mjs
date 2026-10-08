// Mechanic tests: every object type, alone in a test level (as configured in the real levels: size, flip, motion,
// timer, launcher and conveyor settings), with the sausage dropped onto it and thrown at it.
// Checks what each kind of object must do — land, bounce, launch, blow, carry, convey, catch, fail with the right
// reason, win — and the invariants that must hold everywhere: positions stay finite, every shot resolves, the
// sausage never passes through a solid surface and never leaves the world.
// node tools/test-mechanics.mjs [--type trampoline] [--verbose]
import { Sim, PHYS, timerOn } from '../src/physics.js';
import { OBJECTS, WORLDS } from '../src/objects.js';
import { LEVELS } from '../src/levels/data.js';

const { W, R, N, DT } = PHYS;
const args = process.argv.slice(2);
const only = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const verbose = args.includes('--verbose');

const failures = [];
const notes = [];
let trials = 0, checks = 0;
const check = (ok, msg) => { checks++; if (!ok) failures.push(msg); return ok; };

// ---- instances to test: each distinct configuration used in the levels (up to 4 per type), else a default one
const byType = new Map();
LEVELS.forEach((L, li) => L.objects.forEach((o) => {
  const sig = JSON.stringify([o.w, o.h, o.s, !!o.flip, o.a, o.move && o.move.type, o.timer, o.launch, o.speed, o.wind]);
  const list = byType.get(o.t) || [];
  if (!list.some(e => e.sig === sig) && list.length < 4) list.push({ sig, inst: o, li });
  byType.set(o.t, list);
}));

const worldOf = (li, type) => (li >= 0 ? WORLDS[Math.floor(li / 20)] : WORLDS.find(w => type.worlds.includes(w.id)) || WORLDS[0]);

function makeLevel(inst, li, type) {
  const w = worldOf(li, type);
  return { h: li >= 0 ? LEVELS[li].h : 1100, objects: [inst], gravity: w.gravity, floor: w.floor, world: w.id };
}

function defaultInst(id) {
  const t = OBJECTS[id];
  return { t: id, x: 320, y: t.ground ? 1100 - (t.h || 100) / 2 : 760 };
}

// ---- geometry helpers
const solid = (sim, b) => sim.bodies[b].shapes.filter(sh => !sh.sensor);
function surfaceAt(sim, body, x, t = 0) {
  const sh = solid(sim, body);
  if (!sh.length) return null;
  const miny = Math.min(...sh.map(s => s.miny)), maxy = Math.max(...sh.map(s => s.maxy));
  for (let y = miny - 2; y <= maxy; y += 1) if (sh.some(s => sim.pointInShape(s, x, y, 0))) return y;
  return null;
}
const bbox = (shapes) => ({ minx: Math.min(...shapes.map(s => s.minx)), maxx: Math.max(...shapes.map(s => s.maxx)), miny: Math.min(...shapes.map(s => s.miny)), maxy: Math.max(...shapes.map(s => s.maxy)) });
const cen = (sh) => [(sh.minx + sh.maxx) / 2, (sh.miny + sh.maxy) / 2];

// ---- one trial: run until rest / win / fail, checking invariants every step
function run(sim, label, { maxT = 15, untilRest = true, onStep } = {}) {
  trials++;
  sim.sinceLaunch = 0; sim.airTime = 0; sim.events.length = 0;
  const t0 = sim.t;
  const out = { events: [], status: 'play', rest: false, support: -1, t: 0, tunnel: null, escape: null, nan: false };
  const solids = sim.shapes.filter(sh => !sh.sensor);
  while (sim.t - t0 < maxT) {
    sim.step();
    for (const e of sim.events) out.events.push({ ...e, t: sim.t - t0 });
    sim.events.length = 0;
    for (let i = 0; i < N; i++) {
      const x = sim.px[i], y = sim.py[i];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(sim.vx[i]) || !Number.isFinite(sim.vy[i])) { out.nan = true; break; }
      if (!out.escape && (x < -2 || x > W + 2)) out.escape = { x: Math.round(x), y: Math.round(y), t: +(sim.t - t0).toFixed(2) };
      if (!out.tunnel) for (const sh of solids) {
        if (sim.pointInShape(sh, x, y, -5)) { out.tunnel = { body: sh.body, type: sim.bodies[sh.body].type ? sim.bodies[sh.body].type.id : sim.bodies[sh.body].role, x: Math.round(x), y: Math.round(y), t: +(sim.t - t0).toFixed(2) }; break; }
      }
    }
    if (out.nan) break;
    if (onStep) onStep(sim);
    if (sim.status !== 'play') break;
    if (untilRest && sim.t - t0 > 0.3 && sim.canLaunch()) { out.rest = true; break; }
  }
  out.status = sim.status; out.reason = sim.failReason; out.support = sim.supportBody; out.t = +(sim.t - t0).toFixed(2);
  out.resolved = out.status !== 'play' || out.rest || !untilRest;
  check(!out.nan, `${label}: position or velocity became NaN/Infinity`);
  check(!out.escape, `${label}: the sausage left the world at ${JSON.stringify(out.escape)}`);
  check(!out.tunnel, `${label}: a sausage point went inside a solid shape ${JSON.stringify(out.tunnel)}`);
  check(out.resolved, `${label}: did not come to rest, win or fail within ${maxT} s`);
  return out;
}

function freshSim(level, tStart = 0) {
  const sim = new Sim(level, { events: true });
  sim.t = tStart;
  for (const b of sim.bodies) sim.updateBody(b, sim.t, true);
  return sim;
}

// sausage lying flat (ang 0) or upright (ang PI/2) with its lowest point `gap` px above the given y
function place(sim, x, yTop, ang = 0, gap = 40) {
  const half = ang ? ((N - 1) / 2) * PHYS.SPACING : 0;
  sim.placeSausage(x, yTop - R - gap - half, ang);
}

function highestSurface(sim, body, x0, x1) {
  let best = Infinity;
  for (let x = x0; x <= x1; x += 4) { const y = surfaceAt(sim, body, x); if (y !== null && y < best) best = y; }
  return best;
}

// ---- tests per object instance
function testInstance(id, inst, li) {
  const type = OBJECTS[id];
  const level = makeLevel(inst, li, type);
  const tag = `${id}${li >= 0 ? ` (level ${li + 1})` : ' (default)'}`;
  const probe = freshSim(level);
  const body = probe.bodies[0];
  const shapes = body.shapes;
  const sol = solid(probe, 0);
  const bb = bbox(shapes);
  const sbb = sol.length ? bbox(sol) : bb;
  const cx = (sbb.minx + sbb.maxx) / 2;
  const role = type.role;

  // 1. drops across the top: flat at five points, upright at the centre
  const xs = [0.5, 0.2, 0.8, 0.35, 0.65].map(f => sbb.minx + (sbb.maxx - sbb.minx) * f).map(x => Math.max(R + 70, Math.min(W - R - 70, x)));
  for (const [k, x] of xs.entries()) {
    const sim = freshSim(level);
    const top = highestSurface(sim, 0, x - 70, x + 70);
    if (!Number.isFinite(top)) continue;
    place(sim, x, top, 0);
    run(sim, `${tag}: flat drop #${k + 1} at x=${Math.round(x)}`);
  }
  {
    const sim = freshSim(level);
    const top = highestSurface(sim, 0, cx - 20, cx + 20);
    if (Number.isFinite(top)) { place(sim, cx, top, Math.PI / 2 - 0.15); run(sim, `${tag}: upright drop at the centre`); }
  }

  // 2. throws at it from both sides and from above, fast
  for (const side of [-1, 1]) for (const [sp, up] of [[1, 0.25], [0.7, 0.6]]) {
    const sim = freshSim(level);
    const sx = side < 0 ? Math.max(R + 70, sbb.minx - 160) : Math.min(W - R - 70, sbb.maxx + 160);
    const sy = Math.max(-400, sbb.miny - 120);
    sim.placeSausage(sx, sy, 0);
    const v = PHYS.MAX_V * sp, dir = side < 0 ? 1 : -1;
    for (let i = 0; i < N; i++) { sim.vx[i] = dir * v * (1 - up * 0.5); sim.vy[i] = -v * up * 0.3; }
    run(sim, `${tag}: thrown from the ${side < 0 ? 'left' : 'right'} at ${Math.round(sp * 100)}%`);
  }
  {
    const sim = freshSim(level);
    sim.placeSausage(cx, Math.max(-600, sbb.miny - 400), 0.3);
    for (let i = 0; i < N; i++) sim.vy[i] = PHYS.MAX_V;
    run(sim, `${tag}: slammed down from above`);
  }

  // 3. role-specific behaviour
  const special = shapes.filter(sh => sh.goal || sh.hazard || sh.launch || sh.wind || sh.conveyor);
  for (const sh of special) {
    const [hx, hy] = cen(sh);
    if (sh.goal) {
      const sim = freshSim(level);
      place(sim, hx, sh.maxy - 4, 0, 30);
      const r = run(sim, `${tag}: drop into the goal`);
      check(r.status === 'win', `${tag}: a sausage dropped into the bun should win (got ${r.status}${r.reason ? ' ' + r.reason : ''}${r.rest ? ', at rest' : ''})`);
    }
    if (sh.hazard) {
      const tm = body.timer, si = shapes.indexOf(sh);
      const starts = tm ? [0, 1, 2, 3, 4, 5, 6, 7].map(k => k * tm.period / 8) : [0];
      let hit = false, wrong = null; const got = [];
      for (const ts of starts) {
        const sim = freshSim(level, ts);
        const s2 = sim.bodies[0].shapes[si];
        const [x2, y2] = cen(s2);
        if (sh.sensor) {
          // right inside the hazard zone, lying along the object
          sim.placeSausage(x2, y2, sim.bodies[0].ang);
          const on = !tm || timerOn(tm, sim.t);
          sim.step(); sim.step();
          trials++;
          const r = { status: sim.status, reason: sim.failReason };
          got.push(r.status === 'fail' ? r.reason : r.status);
          if (on && r.status === 'fail' && r.reason === (inst.hazardOverride || sh.hazard)) hit = true;
          if (!on && r.status === 'fail' && r.reason === sh.hazard && !timerOn(tm, sim.t)) wrong = ts;
        } else {
          const top = highestSurface(sim, 0, x2 - 60, x2 + 60);
          place(sim, Math.max(R + 70, Math.min(W - R - 70, x2)), Math.min(top, s2.miny), 0, 25);
          const r = run(sim, `${tag}: drop onto the '${sh.hazard}' hazard`, { maxT: 6 });
          got.push(r.status === 'fail' ? r.reason : r.status);
          if (r.status === 'fail' && r.reason === (inst.hazardOverride || sh.hazard)) hit = true;
        }
      }
      check(hit, `${tag}: touching the '${sh.hazard}' hazard never failed with that reason (got ${[...new Set(got)].join(', ')})`);
      check(wrong === null, `${tag}: the '${sh.hazard}' hazard failed the sausage while switched off (t=${wrong})`);
      // a timed hazard is harmless while off: drop through / onto it then
      if (tm && sh.sensor) {
        const off = [...Array(40).keys()].map(k => k * tm.period / 40).find(t => [0, 0.05, 0.1, 0.15].every(d => !timerOn(tm, t + d)));
        if (off !== undefined) {
          const sim = freshSim(level, off);
          const [x2, y2] = cen(sim.bodies[0].shapes[si]);
          sim.placeSausage(x2, y2, sim.bodies[0].ang);
          sim.step(); sim.step();
          trials++;
          check(!(sim.status === 'fail' && sim.failReason === sh.hazard), `${tag}: the '${sh.hazard}' hazard hurt while switched off`);
        }
      }
    }
    if (sh.launch) {
      let launched = false, best = 0;
      for (const ang of [Math.PI / 2, 0]) {
        const sim = freshSim(level);
        place(sim, hx, sh.maxy, ang, 4);
        let vyMin = 0;
        const r = run(sim, `${tag}: drop into the launcher${ang ? ' upright' : ''}`, { maxT: 6, untilRest: false, onStep: (s) => { const v = s.comVel()[1]; if (v < vyMin) vyMin = v; } });
        if (r.events.some(e => e.type === 'launcher')) { launched = true; best = Math.max(best, -vyMin); }
      }
      check(launched, `${tag}: the sausage resting in the launcher was never popped out`);
      if (launched) check(best > 900, `${tag}: the launcher popped the sausage too weakly (${Math.round(best)} px/s up)`);
    }
    if (sh.wind) {
      const sim = freshSim(level);
      const ref = freshSim({ ...level, objects: [] });
      sim.placeSausage(hx, hy, 0); ref.placeSausage(hx, hy, 0);
      for (let k = 0; k < 24; k++) { sim.step(); ref.step(); }
      const a = sim.com(), b = ref.com();
      const dx = a[0] - b[0], dy = a[1] - b[1];
      const flip = inst.flip ? -1 : 1, ca = Math.cos(body.ang), sa = Math.sin(body.ang);
      const wx = sh.wind[0] * flip * ca - sh.wind[1] * sa, wy = sh.wind[0] * flip * sa + sh.wind[1] * ca;
      const along = (dx * wx + dy * wy) / Math.hypot(wx, wy);
      check(along > 25, `${tag}: the wind zone should push the sausage along its wind direction (moved ${Math.round(along)} px along it in 0.4 s)`);
      trials++;
      // a sausage left in the wind must still resolve (blown out, fall, or the stuck rule)
      const sim2 = freshSim(level);
      sim2.placeSausage(hx, hy, 0);
      run(sim2, `${tag}: left inside the wind zone`);
    }
    if (sh.conveyor) {
      const sim = freshSim(level);
      const top = highestSurface(sim, 0, hx - 60, hx + 60);
      place(sim, hx, top, 0, 4);
      let landed = -1;
      for (let k = 0; k < 120 && landed < 0; k++) { sim.step(); if (sim.cBody.some((b, i) => b === 0 && sim.cAge[i] < 0.05)) landed = k; }
      for (let k = 0; k < 6; k++) sim.step();
      const x0 = sim.com()[0];
      for (let k = 0; k < 18; k++) sim.step();
      const moved = sim.com()[0] - x0, want = Math.sign(sh.conveyor);
      trials++;
      check(landed >= 0 && moved * want > 12, `${tag}: the conveyor should carry the sausage along its belt direction (moved ${Math.round(moved)} px in 0.3 s, belt ${sh.conveyor > 0 ? 'right' : 'left'})`);
      // carried to the end of the belt (against a wall or an object), the sausage must still be flippable
      const sim2 = freshSim(level);
      place(sim2, hx, top, 0, 4);
      let ready = false;
      for (let k = 0; k < 60 * 11 && sim2.status === 'play'; k++) { sim2.step(); if (k > 90 && sim2.canLaunch()) { ready = true; break; } }
      trials++;
      check(ready || (sim2.status === 'fail' && sim2.failReason !== 'stuck'), `${tag}: a sausage left on the conveyor must become flippable again (status ${sim2.status} ${sim2.failReason || ''}, x=${Math.round(sim2.com()[0])})`);
    }
  }

  if (role === 'bouncer' || shapes.some(sh => sh.boost)) {
    for (const sh of shapes.filter(sh => !sh.sensor && (sh.boost || role === 'bouncer'))) {
      const si = shapes.indexOf(sh);
      const sim = freshSim(level);
      const s2 = sim.bodies[0].shapes[si];
      const [x2] = cen(s2);
      const top = highestSurface(sim, 0, x2 - 25, x2 + 25);
      if (!Number.isFinite(top)) continue;
      const dropH = 260;
      place(sim, x2, top, 0, dropH);
      let impact = 0, outV = 0, touched = false, after = 0;
      run(sim, `${tag}: bounce test`, { maxT: 6, untilRest: false, onStep: (s) => {
        const v = Math.hypot(...s.comVel());
        if (!touched) { if (s.cBody.some((b, i) => b === 0 && s.cAge[i] < 0.02)) touched = true; else impact = v; }
        else if (after < 0.1) { after += DT; outV = Math.max(outV, v); }
      } });
      if (!touched) continue;
      const want = sh.boost ? Math.min(sh.boost, impact * 1.6) : 0;
      notes.push(`${tag}: impact ${Math.round(impact)} px/s → rebound ${Math.round(outV)} px/s${sh.boost ? ` (boost ${sh.boost})` : ''}`);
      // a round springy object (beach ball, donut) only gets part of the sausage at once: it must still bounce
      if (sh.boost && s2.kind !== 0) check(outV > want * 0.8, `${tag}: a springy part (boost ${sh.boost}) should send the sausage off at about ${Math.round(want)} px/s (got ${Math.round(outV)})`);
      else check(outV > impact * 0.12 || (sh.boost && outV > 250), `${tag}: a bouncy object should bounce (impact ${Math.round(impact)}, rebound ${Math.round(outV)} px/s)`);
    }
  }

  if (type.sticky) {
    const sim = freshSim(level);
    const top = highestSurface(sim, 0, cx - 20, cx + 20);
    place(sim, cx, top, 0, 120);
    const r = run(sim, `${tag}: sticky landing`, { maxT: 4 });
    check(r.rest && r.t < 2.5, `${tag}: a sticky surface should hold the sausage at once (rest ${r.rest}, after ${r.t} s)`);
  }

  // flat tops wider than the sausage: a gentle flat drop must come to rest on the object
  if (['plat', 'support', 'blocker', 'start', 'mover', 'cup'].includes(role) && !type.sticky && type.mat !== 'slick' && type.bounce < 0.4 && !special.some(s => s.hazard || s.wind || s.launch)) {
    const sim = freshSim(level);
    let bestX = null, bestSpan = 0;
    for (let x = Math.max(R + 70, sbb.minx + 10); x <= Math.min(W - R - 70, sbb.maxx - 10); x += 6) {
      const ys = [-60, -30, 0, 30, 60].map(d => surfaceAt(sim, 0, x + d));
      if (ys.some(y => y === null)) continue;
      const span = Math.max(...ys) - Math.min(...ys);
      if (span <= 4 && (bestX === null || Math.abs(x - cx) < Math.abs(bestX - cx))) { bestX = x; bestSpan = span; }
    }
    if (bestX !== null) {
      const top = highestSurface(sim, 0, bestX - 70, bestX + 70);
      place(sim, bestX, top, 0, 20);
      let follow = null;
      const r = run(sim, `${tag}: gentle landing on the flat top`, { maxT: 6 });
      check(r.rest && r.support === 0, `${tag}: a sausage dropped gently on the flat top at x=${bestX} should rest on it (rest ${r.rest}, on body ${r.support}, status ${r.status}${r.reason ? ' ' + r.reason : ''})`);
      // moving platforms carry the resting sausage along
      if (r.rest && body.kinematic) {
        const b = sim.bodies[0];
        const p0 = [b.pwx, b.pwy], c0 = sim.com();
        let stayed = true;
        for (let k = 0; k < 45; k++) { sim.step(); if (sim.status !== 'play' || sim.supportBody !== 0) { stayed = false; break; } }
        if (stayed) {
          const dp = Math.hypot(b.pwx - p0[0], b.pwy - p0[1]), dc = Math.hypot(sim.com()[0] - c0[0], sim.com()[1] - c0[1]);
          follow = { dp, dc };
          check(Math.abs(dp - dc) < Math.max(25, dp * 0.5), `${tag}: a sausage resting on the moving platform should move with it (platform moved ${Math.round(dp)} px, sausage ${Math.round(dc)} px)`);
        }
      }
      if (verbose) console.log(tag, 'flat landing', r.rest, r.support, follow);
      void bestSpan;
    }
  }
}

// ---- world rules: floors, side walls, the top of the world
function testWorld(w) {
  const level = { h: 1100, objects: [], gravity: w.gravity, floor: w.floor };
  {
    const sim = freshSim(level);
    sim.placeSausage(320, 500, 0);
    const r = run(sim, `${w.name}: drop to the floor`);
    check(r.status === 'fail' && r.reason === w.floor, `${w.name}: falling to the floor should fail with '${w.floor}' (got ${r.status} ${r.reason})`);
  }
  for (const dir of [-1, 1]) {
    const sim = freshSim(level);
    sim.placeSausage(320, 400, 0);
    for (let i = 0; i < N; i++) { sim.vx[i] = dir * PHYS.MAX_V * 1.5; sim.vy[i] = -300; }
    run(sim, `${w.name}: thrown hard at the ${dir < 0 ? 'left' : 'right'} wall`);
  }
  {
    const sim = freshSim(level);
    sim.placeSausage(320, 1000, 0);
    for (let i = 0; i < N; i++) sim.vy[i] = -PHYS.MAX_V * 3;
    const r = run(sim, `${w.name}: shot straight up (3× the strongest flip)`);
    check(r.status === 'fail', `${w.name}: a sausage shot out of the top must still end the attempt (got ${r.status})`);
  }
}

for (const w of WORLDS) if (!only) testWorld(w);
const ids = Object.keys(OBJECTS).filter(id => !only || id === only);
for (const id of ids) {
  const list = byType.get(id);
  if (list) for (const { inst, li } of list) testInstance(id, inst, li);
  else testInstance(id, defaultInst(id), -1);
}

if (verbose) for (const n of notes) console.log('  ' + n);
const uniq = [...new Set(failures)];
console.log(`mechanics: ${ids.length} object types, ${trials} trials, ${checks} checks, ${uniq.length} failed`);
for (const f of uniq.slice(0, 200)) console.log('  ✗ ' + f);
if (uniq.length > 200) console.log(`  … and ${uniq.length - 200} more`);
process.exit(uniq.length ? 1 : 0);
