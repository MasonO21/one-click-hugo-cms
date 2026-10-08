// Respawn points. The game saves one where the sausage comes to rest and where it is flipped from; a failed
// attempt puts it back there. Some resting spots don't hold: a sausage creeping off a pan handle, a fence post or
// a stump counts as resting for a moment, and put back there it creeps off again, every time. So a new spot is
// first tried out in a scratch copy of the level (put back there with no speed, the sausage must come to rest
// and stay on); a spot that fails keeps the previous checkpoint. And if a respawn still fails before the sausage
// could be flipped again, the checkpoint before it is used.
import { Sim, PHYS, timerOn } from './physics.js';

export function makeCheckpoint(sim) {
  const b = sim.bodies[sim.supportBody];
  return { pose: sim.savePose(), body: sim.supportBody, pwx: b ? b.pwx : 0, pwy: b ? b.pwy : 0, ang: b ? b.ang : 0 };
}

// Put the sausage back at a checkpoint, re-attached to a moving platform where that platform is now.
export function placeAtCheckpoint(sim, cp) {
  const b = sim.bodies[cp.body];
  const pose = { px: cp.pose.px.slice(), py: cp.pose.py.slice() };
  if (b && b.kinematic) {
    const da = b.ang - cp.ang, ca = Math.cos(da), sa = Math.sin(da);
    for (let i = 0; i < pose.px.length; i++) {
      const lx = pose.px[i] - cp.pwx, ly = pose.py[i] - cp.pwy;
      pose.px[i] = b.pwx + lx * ca - ly * sa;
      pose.py[i] = b.pwy + lx * sa + ly * ca - 2;
    }
  }
  sim.loadPose(pose);
}

const HOLD_T = 2.5;   // seconds a tried-out spot must keep the sausage
const SAME = 8;       // px: closer than this is the same spot

// the pose in the frame of the body it rests on (a moving platform carries its checkpoint along)
const local = (cp) => {
  const ca = Math.cos(-cp.ang), sa = Math.sin(-cp.ang);
  return cp.pose.px.map((x, i) => { const dx = x - cp.pwx, dy = cp.pose.py[i] - cp.pwy; return [dx * ca - dy * sa, dx * sa + dy * ca]; });
};
const near = (a, b) => {
  if (!a || !b || a.body !== b.body) return false;
  const la = local(a), lb = local(b);
  return la.every((p, i) => Math.abs(p[0] - lb[i][0]) <= SAME && Math.abs(p[1] - lb[i][1]) <= SAME);
};

export class Checkpoints {
  constructor(sim) {
    this.sim = sim;
    this.list = [makeCheckpoint(sim)]; // the start always holds
    this.probe = null;                 // a second Sim of the level for trying spots out
    this.pending = null;               // the spot being tried out
    this.rejected = null;              // the last spot that didn't hold
    this.fresh = false;                // respawned, not flippable yet
  }

  get current() { return this.list[this.list.length - 1]; }

  // The sausage is resting (or being flipped) here. A new spot is tried out a few physics steps at a time
  // (work(), every frame), so trying it never makes a frame stutter.
  save() {
    const cp = makeCheckpoint(this.sim);
    if (near(cp, this.current)) { this.list[this.list.length - 1] = cp; this.pending = null; return; }
    if ((this.pending && near(cp, this.pending.cp)) || near(cp, this.rejected)) return;
    const s = this.sim;
    if (!this.probe) this.probe = new Sim(s.level, { events: false });
    this.probe.loadState(s.saveState());
    placeAtCheckpoint(this.probe, cp);
    this.pending = { cp, i: 0, rested: false };
  }

  // Advance the try-out by up to n physics steps. Put back there with no speed, the sausage must come to rest
  // and still be in play after HOLD_T.
  work(n) {
    const q = this.pending;
    if (!q) return;
    const p = this.probe, total = Math.round(HOLD_T / PHYS.DT);
    for (let k = 0; k < n && q.i < total; k++, q.i++) {
      p.step();
      if (p.status !== 'play') { this.rejected = q.cp; this.pending = null; return; }
      if (q.i > 6 && p.canLaunch()) q.rested = true;
    }
    if (q.i < total) return;
    this.pending = null;
    if (!q.rested) { this.rejected = q.cp; return; }
    this.list.push(q.cp);
    if (this.list.length > 8) this.list.splice(1, 1);
  }
  // Is it safe to respawn now? Not while a timed hazard touching the checkpoint is on, or will switch on before
  // the player has had a fair chance to flip away (about 1.3 s, or most of its off-window).
  clear() {
    const s = this.sim, cp = this.current;
    if (this._hazFor !== cp) {
      this._hazFor = cp;
      const pad = PHYS.R + 4;
      this._haz = s.shapes.filter(sh => sh.timed && sh.hazard && cp.pose.px.some((x, i) => s.pointInShape(sh, x, cp.pose.py[i], pad)));
    }
    for (const sh of this._haz) {
      const tm = s.bodies[sh.body].timer;
      if (!tm) continue;
      const need = Math.min(1.3, 0.8 * tm.period * (1 - tm.on));
      for (let dt = 0; dt <= need; dt += 0.05) if (timerOn(tm, s.t + dt)) return false;
    }
    return true;
  }

  respawn() { placeAtCheckpoint(this.sim, this.current); this.fresh = true; }
  ready() { this.fresh = false; }

  // A failed attempt. Straight after a respawn, before the sausage could be flipped: that spot doesn't work.
  failed() { if (this.fresh && this.list.length > 1) this.list.pop(); }
}
