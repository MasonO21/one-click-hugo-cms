// "The Waking": the beginner tutorial (GDD §16). A free, guided first run on Chapter 1 that teaches one thing per step:
// move, slay, grow the legion, pass a Soul Gate, cast the Rite, fire Soul Nova, fell an elite and open its Relic Chest
// (while the legion regrows), slay the Hollow King. It replaces the run director until the King rises, so the horde
// comes only as each step needs it. The coach (ui/coachui.js) reads view() for the instruction, its progress, what to
// point at and where on the field.
// The Shepherd cannot fall (Player.hurt stops at 1 HP) and the King is a quarter as strong, phase I only (boss.js).
// Finishing (or skipping, or abandoning) sets profile.flags.tutorialDone. Numbers live in TUTORIAL (data.js).
import { TUTORIAL as T, RITES } from './data.js';

const desktop = () => typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches && !('ontouchstart' in window);

// Each step: title, text (the instruction), sub (a smaller second line), goal ([have, need] for the progress bar; pct
// hides the numbers), point (a HUD control to ring: 'legion' | 'rite' | 'nova'), thumb (the drag demo), mark (a spot on
// the field to flag: { x, z }), and enter / update / done. `after` holds the tick that long before the next step.
const STEPS = [
  {
    id: 'move', title: 'Move',
    text: () => (desktop() ? 'Use WASD or the arrow keys to move.' : 'Drag anywhere on the screen to move.'),
    sub: () => 'Your Shepherd goes where you lead.',
    thumb: (tu) => tu.walked < 1.5,
    goal: (tu) => [Math.min(tu.walked, T.moveDist), T.moveDist, true],
    done: (tu) => tu.walked >= T.moveDist,
  },
  {
    id: 'slay', title: 'Fight',
    text: () => `Your Shepherd attacks on their own. Slay ${T.slay} Husks.`,
    sub: () => 'Keep moving so they cannot surround you.',
    enter: (tu) => tu.arcAhead(T.arc),
    update: (tu, dt) => tu.trickle(T.trickle.slay, dt),
    goal: (tu) => [Math.min(T.slay, tu.run.counters.kills - tu.k0), T.slay],
    done: (tu) => tu.run.counters.kills - tu.k0 >= T.slay,
  },
  {
    id: 'legion', title: 'Raise the legion',
    text: () => `The slain rise to fight for you. Grow your LEGION to ${T.legion}.`,
    sub: () => 'Every foe you slay may rise as a soul. Raise Chance grows with your powers.',
    point: () => 'legion',
    update: (tu, dt) => {
      tu.trickle(T.trickle.legion, dt);
      if (!tu.packed && tu.t >= T.pack[0]) { tu.packed = true; tu.run.spawnPack(T.pack[1]); }
      if (tu.t >= T.legionHelp && tu.run.legion.count < T.legion) tu.run.legion.addMany(T.legion - tu.run.legion.count, tu.run.player.x, tu.run.player.z); // no dead end
    },
    goal: (tu) => [Math.min(T.legion, tu.run.legion.count), T.legion],
    done: (tu) => tu.run.legion.count >= T.legion,
  },
  {
    id: 'gate', title: 'Soul Gates',
    text: (tu) => (tu.missed ? 'Missed it! Walk into the ×2 gate this time.' : 'Walk through the ×2 Soul Gate to double your legion.'),
    sub: () => 'Gates add, multiply, or take souls away. Read them before you choose.',
    enter: (tu) => tu.gates(),
    update: (tu, dt) => {
      tu.trickle(T.trickle.gate, dt);
      const run = tu.run;
      if (!run.gates.pair && run.counters.gates === tu.g0) { // the pair faded unpassed: offer it again
        tu.respawn = (tu.respawn || 0) + dt;
        if (tu.respawn > 0.8) { tu.respawn = 0; tu.missed = true; tu.gates(); }
      }
    },
    mark: (tu) => { const P = tu.run.gates.pair, G = P && !P.done && P.gates.find((g) => g.op.type === 'mul'); return G ? { x: G.x, z: G.z, y: 5.6 } : null; },
    done: (tu) => tu.run.counters.gates > tu.g0,
    after: 3, // time to read the maths
  },
  {
    id: 'rite', title: 'Your Rite',
    text: (tu) => { const D = tu.rite; return `Tap ${D.short} to unleash ${D.name}.${desktop() ? ' (Shift or E)' : ''}`; },
    sub: (tu) => `${tu.rite.desc} It recharges, so use it often.`,
    point: () => 'rite',
    enter: (tu) => { tu.run.rites.cd = 0; tu.ring(T.riteRing[0], T.riteRing[1]); },
    update: (tu, dt) => tu.trickle(T.trickle.rite, dt),
    done: (tu) => tu.run.counters.rites > tu.r0,
    after: 3,
  },
  {
    id: 'nova', title: 'Soul Nova',
    text: (tu) => (tu.run.nova >= 1 ? `NOVA is ready! Tap it to detonate your whole legion.${desktop() ? ' (Space)' : ''}` : 'Every kill charges SOUL NOVA. Slay the horde!'),
    sub: (tu) => (tu.run.nova >= 1 ? 'Your souls explode in a chain, then the legion rises again.' : 'Surrounded! Your legion will hold them off.'),
    point: (tu) => (tu.run.nova >= 1 ? 'nova' : null),
    enter: (tu) => { tu.ring(T.novaRing[0], T.novaRing[1]); tu.run.ui.banner('SURROUNDED', 'The horde closes in', 'ember'); tu.run.audio.sfx('warning', { volume: 0.4, pitch: 0.8 }); },
    update: (tu, dt) => {
      tu.trickle(T.trickle.nova, dt);
      if (tu.t >= T.novaFill && tu.run.nova < 1 && !tu.run.novaQueue.length) tu.run.nova = 1; // the meter tops itself up
    },
    goal: (tu) => (tu.run.nova >= 1 ? null : [Math.floor(tu.run.nova * 100), 100, true]),
    done: (tu) => tu.run.counters.novas > tu.n0,
    after: 2.6,
  },
  {
    // first the legion the Nova spent rises again, then the elite comes for it
    id: 'elite', title: 'Elites',
    text: (tu) => (!tu.eliteUid ? `Your souls rise again as you slay. Rebuild your legion to ${T.regrow[0]}.`
      : tu.elite && tu.elite.active && tu.elite.uid === tu.eliteUid ? 'An elite Brute! Slay it to win a Relic Chest.' : 'Grab the Relic Chest it dropped!'),
    sub: (tu) => (!tu.eliteUid ? 'A Nova spends the legion; the horde refills it.' : 'Gold elites are tough, and each one carries a free power.'),
    enter: (tu) => tu.heal(),
    update: (tu, dt) => {
      tu.trickle(T.trickle.elite, dt);
      if (!tu.eliteUid && (tu.run.legion.count >= T.regrow[0] || tu.t >= T.regrow[1])) tu.spawnElite();
    },
    goal: (tu) => (tu.eliteUid ? null : [Math.min(T.regrow[0], tu.run.legion.count), T.regrow[0]]),
    mark: (tu) => {
      const e = tu.elite;
      if (e && e.active && e.uid === tu.eliteUid) return { x: e.x, z: e.z, y: 3.6 };
      const c = tu.eliteUid && tu.run.pickups.special.find((s) => s.kind === 'chest');
      return c ? { x: c.x, z: c.z, y: 1.8 } : null;
    },
    done: (tu) => tu.run.counters.chests > tu.c0,
  },
  {
    id: 'boss', title: 'The Hollow King',
    text: (tu) => {
      const st = tu.run.bossSpawned && tu.run.boss.state;
      if (st === 'slam' || tu.tipT > 0 && tu.tip === 'slam') return 'Step out of the glowing rings before they strike!';
      if (st === 'ring' || tu.tipT > 0 && tu.tip === 'ring') return 'Slip through the gaps in his ring of embers.';
      return 'Gravemaw, the Hollow King, rises. Slay him with your legion!';
    },
    sub: () => 'Every chapter ends with a boss. Beat him to finish your training.',
    enter: (tu) => { tu.heal(); tu.run.warnBoss(); tu.bossAt = tu.run.time + T.bossWarn; },
    update: (tu, dt) => {
      const run = tu.run;
      if (!run.bossSpawned && run.time >= tu.bossAt) run.spawnBoss();
      const st = run.bossSpawned && run.boss.state;
      if (st === 'slam' || st === 'ring') { tu.tip = st; tu.tipT = 3; } else tu.tipT -= dt; // a tip outlasts its attack a moment
    },
    done: () => false, // the King's fall ends the run (Run.onBossKilled)
  },
];

export class Tutorial {
  constructor(run) {
    this.run = run;
    this.steps = STEPS;
    this.i = -1; this.step = null;
    this.t = 0; this.doneT = -1;
    this.walked = 0; this.px = run.player.x; this.pz = run.player.z;
    this.acc = 0; this.hurtNoted = false; this.tip = ''; this.tipT = 0;
    this.rite = RITES[run.loadout.heroId] || RITES.vael;
    this.novaAt = STEPS.findIndex((s) => s.id === 'nova');
    this.next();
  }

  get id() { return this.step ? this.step.id : ''; }

  next() {
    this.i++;
    this.step = this.steps[this.i] || null;
    this.t = 0; this.doneT = -1; this.acc = 0; this.missed = false; this.elite = null; this.eliteUid = null;
    const C = this.run.counters;
    this.k0 = C.kills; this.g0 = C.gates; this.r0 = C.rites; this.c0 = C.chests; this.n0 = C.novas;
    if (this.step && this.step.enter) this.step.enter(this);
  }

  /** Nova charge ×: slower before the Nova step (so the meter fills when it is taught), faster during it. */
  novaMul() { return this.i === this.novaAt ? T.novaBoost : this.i < this.novaAt ? T.novaPre : 1; }

  /** The run director while the King has not risen (Run.director). */
  director(dt) {
    const run = this.run, P = run.player, s = this.step;
    this.walked += Math.hypot(P.x - this.px, P.z - this.pz); this.px = P.x; this.pz = P.z;
    if (!this.hurtNoted && P.hp < P.maxHp * 0.35) { this.hurtNoted = true; run.ui.hint('Hurt! In training you cannot fall, but in battle keep moving and let the legion take the hits.'); }
    if (!s) return;
    this.t += dt;
    if (s.update) s.update(this, dt);
    if (this.doneT < 0 && s.done(this)) { this.doneT = 0; run.audio.sfx('select'); run.app.haptic('success'); }
    if (this.doneT >= 0 && (this.doneT += dt) >= (s.after || T.done)) this.next();
  }

  /** What the coach shows this frame. */
  view() {
    const s = this.step;
    if (!s) return null;
    return {
      i: this.i, n: this.steps.length, id: s.id, title: s.title, text: s.text(this), sub: s.sub ? s.sub(this) : '',
      goal: s.goal ? s.goal(this) : null, point: s.point ? s.point(this) : null, thumb: !!(s.thumb && s.thumb(this)),
      mark: s.mark ? s.mark(this) : null, ok: this.doneT >= 0,
    };
  }

  // ---------------------------------------------------------------- the horde, step by step
  /** Husks at `rate` a second while fewer than `max` foes are alive. */
  trickle([rate, max], dt) {
    const run = this.run;
    this.acc = Math.min(3, this.acc + rate * dt);
    while (this.acc >= 1) { this.acc -= 1; if (run.enemies.count < max) run.spawnEnemy('husk'); }
  }

  /** n Husks waiting in an arc ahead of the Shepherd (up-screen when standing still). */
  arcAhead(n) {
    const run = this.run, P = run.player, l = Math.hypot(P.vx, P.vz), a0 = l > 0.5 ? Math.atan2(P.vz, P.vx) : -Math.PI / 2;
    for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.22; run.spawnEnemy('husk', { at: { x: P.x + Math.cos(a) * 9, z: P.z + Math.sin(a) * 9 } }); }
  }

  ring(n, R) {
    const run = this.run, P = run.player;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; run.spawnEnemy('husk', { at: { x: P.x + Math.cos(a) * R, z: P.z + Math.sin(a) * R } }); }
  }

  /** The lesson pair: +5 and ×2, sides random (Gates.spawnPair; passing ×2 explains the maths). */
  gates() {
    const ops = [{ type: 'add', n: 5 }, { type: 'mul', n: 2 }];
    if (Math.random() < 0.5) ops.reverse();
    this.run.gates.spawnPair(ops, { lesson: true });
  }

  spawnElite() {
    const run = this.run, P = run.player, l = Math.hypot(P.vx, P.vz), a = l > 0.5 ? Math.atan2(P.vz, P.vx) : -Math.PI / 2;
    const e = run.spawnEnemy('brute', { elite: true, at: { x: P.x + Math.cos(a) * 10, z: P.z + Math.sin(a) * 10 } });
    if (e) { e.hp *= T.eliteHp; e.maxHp *= T.eliteHp; this.elite = e; this.eliteUid = e.uid; }
    run.ui.banner('ELITE BRUTE', 'Slay it for a Relic Chest', 'gold');
    run.audio.sfx('warning', { volume: 0.5 });
    run.audio.voice('a_elite');
  }

  /** Between lessons the Shepherd recovers (before the elite and the King). */
  heal() { const P = this.run.player; if (!P.dead && P.hp < P.maxHp) { P.heal(P.maxHp - P.hp); } }

  /** The player skipped: training counts as done, and the run closes without a result. */
  skip() {
    const p = this.run.profile;
    if (!p.flags.tutorialDone) p.flags.coach = 'battle'; // a new Shepherd: the home screen points at Chapter 1
    p.flags.tutorialDone = true;
  }
}
