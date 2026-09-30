// Tiny Tides trailer — the shots. Every creature, egg, cocoon, rock, prop, capsule, the capsule machine and the pool
// dioramas are drawn by the game's own art code (src/art_*.js, src/render.js) driven by real sim state (src/sim.js).
// This file only adds camera moves, kinetic type, flashes and particles on top.
import * as D from '../../src/data.js';
import * as S from '../../src/sim.js';
import { createScene } from '../../src/render.js';
import { drawSprite } from '../../src/art_creatures.js';
import { drawEgg, drawCocoon, drawCapsule, capsuleStyle } from '../../src/art_world.js';
import { newMachine, stepMachine, drawMachine, drawDropped, drawItemArt, MW, TIER_COLOR } from '../../src/art_gacha.js';
import { W, H, FPS, T, SIX, EV, SEC } from './timeline.js';
import * as K from './kit.js';

const PURCHASE_NOTICE = 'Contains in-game purchases (includes random items).';

const { clamp, lerp, prog, E, spring, wobble, pulse, pulses, TAU } = K;

// ------------------------------------------------------------------ clocks (the sky follows the local hour, like the game)
let DAY0 = 0;
/** Pick a calendar day near a full moon so night skies show a full moon. */
export function initClock() {
  let best = 0, bd = 9;
  for (let d = 0; d < 40; d++) { const ms = new Date(2026, 5, 1 + d, 20, 0, 0, 0).getTime(); const e = Math.abs(S.moonPhase(ms) - 0.47); if (e < bd) { bd = e; best = d; } }
  DAY0 = new Date(2026, 5, 1 + best, 0, 0, 0, 0).getTime();
}
const atHour = (h) => DAY0 + h * 3600e3;

// ------------------------------------------------------------------ SceneSim: the real pool renderer on a fixed 30 fps clock
const LW = 432, LH = 768, SDPR = 3;                // logical scene size (1080x1920 at 2.5x); rendered at 3x for camera push-ins
class SceneSim {
  constructor(o) { this.o = o; this.cv = document.createElement('canvas'); this.idx = null; }
  reset() {
    const o = this.o;
    this.rng = K.mulberry(o.seed);
    K.withRng(this.rng, () => {
      const now0 = o.clock(o.T0 - o.pre / FPS);
      this.st = o.build(now0);
      this.sc = createScene(this.cv);
      this.sc.state = this.st; this.sc.setBiome(o.biome);
      this.sc.resize(LW, LH, 2.5, o.insets);
      this.sc.dpr = SDPR; this.cv.width = LW * SDPR; this.cv.height = LH * SDPR; this.sc._baseKey = '';
      this.sc.buildMode = !!o.buildMode;
    });
    this.evs = (o.events || []).slice().sort((a, b) => a.t - b.t); this.ei = 0;
    this.marks = [];                                  // overlay marks recorded by events: { t, x, y, ... } in logical coords
    this.idx = -o.pre - 1;
  }
  at(t) {
    const target = Math.round((t - this.o.T0) * FPS);
    if (this.idx === null || target < this.idx) this.reset();
    while (this.idx < target) {
      this.idx++;
      const tt = this.o.T0 + this.idx / FPS;
      K.withRng(this.rng, () => {
        while (this.ei < this.evs.length && this.evs[this.ei].t <= tt + 1e-6) { this.evs[this.ei].fn(this, this.evs[this.ei].t); this.ei++; }
        this.o.tick?.(this, tt);
        this.sc.frame(1 / FPS, this.o.clock(tt));
      });
    }
    return this.cv;
  }
}
/** Draw a scene canvas with a camera: zoom around a focus point (logical coords), keeping the frame covered. */
function cam(c, sim, t, zoom = 1, fx = LW / 2, fy = LH / 2, rot = 0, dx = 0, dy = 0) {
  const cv = sim.at(t);
  const hw = LW / 2 / zoom, hh = LH / 2 / zoom;
  fx = clamp(fx, hw, LW - hw); fy = clamp(fy, hh, LH - hh);
  const k = (W / LW) * zoom;
  c.save(); c.translate(W / 2 + dx, H / 2 + dy); c.rotate(rot); c.scale(k, k); c.translate(-fx, -fy);
  c.imageSmoothingQuality = 'high';
  c.drawImage(cv, 0, 0, LW, LH);
  c.restore();
  return { map: (x, y) => [W / 2 + dx + (x - fx) * k, H / 2 + dy + (y - fy) * k], k };
}
/** A timed kinetic word: pops in at t0, pops out ending at t1. */
function tword(c, t, str, t0, t1, x, y, size, o = {}) {
  if (t < t0 || (t1 !== null && t > t1)) return;
  const out = t1 !== null && t > t1 - 0.12 ? t - (t1 - 0.12) : -1;
  K.word(c, str, x, y, size, { ...o, u: t - t0, out, time: t });
}
function tpill(c, t, str, t0, t1, x, y, size, o = {}) {
  if (t < t0 || (t1 !== null && t > t1)) return;
  const out = t1 !== null && t > t1 - 0.12 ? t - (t1 - 0.12) : -1;
  K.pill(c, str, x, y, size, { ...o, u: t - t0, out });
}
function star5(c, x, y, r, col) {
  c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = Math.max(2, r * 0.22); c.strokeStyle = K.PLUM; c.lineJoin = 'round'; c.stroke();
}

// ------------------------------------------------------------------ pool builders (real sim state)
function baseState(now, seed) {
  const st = S.newState(now, seed);
  st.tut = { step: 9, done: true }; st.lvl = 14; st.cur.pearls = 1e7; st.cur.glass = 1e4;
  for (const k of D.DECOR_IDS) st.own[k] = true;
  st.equip.fx = 'bubbles';
  return st;
}
const put = (st, biome, tool, x, y) => { const r = S.applyTool(st, biome, tool, x, y); if (!r.ok) console.warn('put failed', tool, x, y, r.reason); return r.ok; };
const addCreature = (st, biome, form, x, y, o = {}) => {
  const pool = st.pools[biome], stage = D.FORMS[form].stage;
  const c = { id: st.nid++, form, x, y, lvl: Math.min(o.lvl || 5, D.STAGE[stage].maxLvl), stored: 0, spent: 0, born: 0, hat: o.hat || null, evo: null };
  pool.creatures.push(c);
  st.dex[form] = st.dex[form] || { t: 0 };
  return c;
};
// DIG/BUILD layout on a 6x6 tidepool: 8 dig steps (two tiles each), then 8 placements
const DIG_STEPS = [[[2, 1], [3, 1]], [[2, 2], [3, 2]], [[2, 3], [3, 3]], [[2, 4], [3, 4]], [[1, 2], [4, 2]], [[1, 3], [4, 3]], [[2, 2], [3, 2]], [[2, 3], [3, 3]]];
const BUILD_STEPS = [['piece:granite', 0, 2], ['piece:kelp', 1, 1], ['piece:mossy', 5, 3], ['piece:kelp', 4, 4], ['piece:ember', 5, 1], ['piece:pearlite', 0, 4], ['decor:umbrella', 0, 0], ['decor:lighthouse', 5, 5]];
function tideState(now, seed) {
  const st = baseState(now, seed);
  S.expandPool(st, 'tide');                           // 5x6 -> 6x6
  return st;
}
const POOL_INSETS = { top: 125, bottom: 165 };
function sceneFx(sim, tx, ty, kind) {
  const sc = sim.sc;
  if (kind === 'dig') { sc.burst(tx, ty, 'bubble', 9, { colors: ['#fff', '#bdf6ff'], speed: 90, size: 8 }); sc.burst(tx, ty, 'spark', 5, { colors: ['#bdf6ff', '#fff'], speed: 80, size: 5 }); }
  else { sc.burst(tx, ty, 'spark', 9, { speed: 90, size: 6 }); }
}

// ================================================================== shot 1: cold open (bars 1-2)
const OPEN_CREW = [
  { form: 'crab.0', hat: 'crownhat', x: 540, y: 1468, size: 330, t: EV.openPops[0] },
  { form: 'star.0', x: 185, y: 1440, size: 270, t: EV.openPops[1], rot: -0.12 },
  { form: 'snail.0', x: 900, y: 1452, size: 280, t: EV.openPops[2] },
  { form: 'horse.0', x: 800, y: 1300, size: 250, t: EV.openPops[3], water: true },
  { form: 'jelly.0', x: 290, y: 1310, size: 240, t: EV.openPops[4], water: true },
];
function island(c, t) {
  const cx = 540, cy = 1330;
  c.save();
  c.fillStyle = 'rgba(40,10,90,.22)'; c.beginPath(); c.ellipse(cx, cy + 120, 640, 200, 0, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(cx, cy + 40, 620, 250, 0, 0, TAU); c.fillStyle = '#e2a86b'; c.fill(); c.lineWidth = 12; c.strokeStyle = K.PLUM; c.stroke();
  c.beginPath(); c.ellipse(cx, cy, 610, 235, 0, 0, TAU); c.fillStyle = K.vgrad(c, cy - 235, cy + 235, ['#fff2d8', '#ffe9c2', '#f6cf94']); c.fill(); c.lineWidth = 12; c.stroke();
  const r = K.mulberry(5); c.fillStyle = 'rgba(160,100,40,.18)';
  for (let i = 0; i < 60; i++) { const a = r() * TAU, rr = Math.sqrt(r()); c.beginPath(); c.arc(cx + Math.cos(a) * 580 * rr, cy + Math.sin(a) * 215 * rr, 3 + r() * 4, 0, TAU); c.fill(); }
  c.beginPath(); c.ellipse(cx, cy - 10, 430, 150, 0, 0, TAU); c.fillStyle = '#e9b877'; c.fill();
  c.beginPath(); c.ellipse(cx, cy - 12, 400, 132, 0, 0, TAU); c.fillStyle = K.vgrad(c, cy - 140, cy + 120, ['#aef6ff', '#5fd3f0', '#3fa6ea']); c.fill(); c.lineWidth = 8; c.strokeStyle = 'rgba(59,29,94,.55)'; c.stroke();
  c.save(); c.beginPath(); c.ellipse(cx, cy - 12, 400, 132, 0, 0, TAU); c.clip();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 7; c.lineCap = 'round';
  for (let i = 0; i < 5; i++) { const y0 = cy - 90 + i * 42; c.beginPath(); for (let x = cx - 420; x <= cx + 420; x += 20) { const yy = y0 + Math.sin(x * 0.012 + t * 3 + i * 1.7) * 9; x === cx - 420 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.globalAlpha = 0.5 + 0.4 * Math.sin(t * 2 + i); c.stroke(); }
  c.restore();
  c.restore();
}
function drawOpen(c, t) {
  // sky + rays
  K.bg(c, W, H, ['#3fb4ff', '#6fd0ff', '#b6ecff', '#e4fbff']);
  K.glow(c, 540, 640, 900, 'rgba(255,255,255,.55)');
  K.rays(c, 540, 700, 18, t * 0.25, 1800, '#fff', 0.16, 0.5);
  K.risingBubbles(c, W, H, t + 3, 22, 3, { speed: 190, size: 22, alpha: 0.55 });
  // drift clouds
  c.save(); c.fillStyle = 'rgba(255,255,255,.75)';
  for (const [x0, y, w] of [[140, 330, 260], [860, 1030, 300], [960, 250, 200]]) { const x = x0 + t * 30; for (const [dx, dy, rx, ry] of [[0, 0, 0.5, 0.17], [-0.24, 0.05, 0.3, 0.12], [0.25, 0.05, 0.32, 0.13]]) { c.beginPath(); c.ellipse(x + dx * w, y + dy * w, rx * w, ry * w, 0, 0, TAU); c.fill(); } }
  c.restore();
  // camera: a gentle push, then rush in on the last beat (zoom transition continues it)
  const z = 1 + 0.05 * prog(0, T(2, 4), t);
  c.save(); c.translate(540, 1000); c.scale(z, z); c.translate(-540, -1000);
  island(c, t);
  // splash at t = 0: water bursts out of the pool
  K.burst(c, t, EV.splash - 0.05, 540, 1290, 26, 11, { kind: 'drop', colors: ['#bdf6ff', '#ffffff', '#7fe3ff'], speed: 1500, size: 40, life: 1.0, g: 1600 });
  for (let i = 0; i < 9; i++) {
    const r = K.mulberry(40 + i), a = -Math.PI / 2 + (r() - 0.5) * 2.2, sp = 900 + r() * 900, u = t + 0.06;
    const x = 540 + Math.cos(a) * sp * u, y = 1290 + Math.sin(a) * sp * u + 300 * u * u, rad = 36 + r() * 50;
    if (u < 0.85 + r() * 0.5) K.bubble(c, x, y, rad * (1 + u * 0.5), { pearl: i % 3 === 0 });
  }
  K.shock(c, t, EV.splash - 0.04, 540, 1290, 60, 700, '#fff', 0.5, 26);
  // creatures pop up (water ones jump out of the pool, land ones spring up on the sand)
  const crew = OPEN_CREW.slice().sort((a, b) => a.y - b.y);
  for (const m of crew) {
    const u = t - m.t; if (u < 0) continue;
    const s = spring(u, 8, 17), q = wobble(u, 0.3);
    const jump = m.water ? -170 * Math.sin(Math.PI * clamp(u / 0.34)) : -60 * Math.sin(Math.PI * clamp(u / 0.2));
    const bob = Math.sin(t * 3 + m.x) * 8;
    if (m.water && u < 0.5) K.shock(c, t, m.t, m.x, m.y - 20, 30, 190, '#fff', 0.45, 12);
    const hop = Math.max(0, pulse(t - T(2, 4), 7)) * -40 * (m.water ? 1 : 1);
    K.creature(c, m.form, m.x, m.y + jump + bob + hop, m.size, { sx: s * (1 - q), sy: s * (1 + q), hat: m.hat, blink: K.blinkAt(t, m.x), rot: m.rot || 0 });
    K.burst(c, t, m.t, m.x, m.y - m.size * 0.35, 12, 100 + m.x, { speed: 800, size: 26, life: 0.6 });
  }
  c.restore();
  // logo slam: "Tiny" then "Tides"
  const slam = (str, t0, x, y, size, rot) => {
    const u = t - t0; if (u < 0) return;
    const k = E.outCubic(clamp(u / 0.11)), sc = lerp(2.8, 1, k) * (1 + pulse(t - T(2, 4), 8) * 0.06);
    K.word(c, str, x, y, size, { u: 99, noPop: true, scale: sc * (1 + wobble(u - 0.11, 0.18)), rot, rim: '#fff', alpha: clamp(u / 0.05), lw: 0.2 });
    if (u > 0.1) { K.shock(c, t, t0 + 0.1, x, y, 100, 620, '#fff', 0.4, 20); }
  };
  slam('Tiny', EV.slam[0], 525, 560, 270, -0.07);
  slam('Tides', EV.slam[1], 555, 800, 290, -0.035);
  K.burst(c, t, EV.slam[1] + 0.1, 540, 700, 30, 7, { speed: 1300, size: 34, life: 0.8 });
  // sparkles around the logo
  for (let i = 0; i < 7; i++) { const r = K.mulberry(900 + i), x = 150 + r() * 780, y = 430 + r() * 520, ph = r() * 5; const k = Math.max(0, Math.sin(t * 4 + ph)); if (t > EV.slam[1]) K.sparkle(c, x, y, 26 * k, i % 2 ? '#fff' : '#fff6a8', t); }
  tpill(c, t, 'Cozy tidepool & capsule toys', EV.tagline, null, 540, 990, 50, { rot: 0.02 });
}

// ================================================================== shot 2: DIG! / BUILD! in the real pool (bars 3-4)
const poolA = new SceneSim({
  seed: 101, biome: 'tide', T0: SEC.dig[0], pre: 24, insets: POOL_INSETS, buildMode: true, clock: (t) => atHour(10.5) + t * 1000,
  build: (now) => {
    const st = tideState(now, 7);
    addCreature(st, 'tide', 'crab.0', 1, 5, { hat: 'flowerhat' });
    addCreature(st, 'tide', 'snail.0', 4, 5);
    return st;
  },
  events: [
    ...EV.dig.map((te, i) => ({ t: te, fn: (sim) => { for (const [x, y] of DIG_STEPS[i]) { put(sim.st, 'tide', 'dig', x, y); sceneFx(sim, x, y, 'dig'); sim.sc.ring(x, y, '#ffffff'); } sim.sc.hover = { x: DIG_STEPS[i][0][0], y: DIG_STEPS[i][0][1] }; sim.sc.toolTint = '#5fd3f0'; } })),
    ...EV.build.map((te, i) => ({ t: te, fn: (sim) => {
      const [tool, x, y] = BUILD_STEPS[i]; put(sim.st, 'tide', tool, x, y);
      sim.sc.pop(y * sim.st.pools.tide.w + x); sceneFx(sim, x, y, 'place'); sim.sc.ring(x, y, '#fff6a8');
      sim.sc.hover = { x, y }; sim.sc.toolTint = '#ffe66d';
    } })),
  ],
});
function drawBuild(c, t) {
  const u = t - SEC.dig[0];
  const beats = [...EV.dig, ...EV.build];
  const z = 1.0 + 0.07 * E.inOutCubic(prog(SEC.dig[0], SEC.build[1], t)) + 0.035 * pulses(t, beats, 10);
  const rot = Math.sin(u * 1.3) * 0.006;
  cam(c, poolA, t, z, LW / 2, 330, rot);
  tword(c, t, 'DIG!', EV.dig[0] + 0.02, EV.build[0], 540, 322, 200, { rot: -0.06 });
  tword(c, t, 'BUILD!', EV.build[0], null, 540, 322, 190, { rot: 0.05 });
}

// ================================================================== shot 3: HATCH! (bars 5-6) — eggs wash ashore
const EGGS = [
  { fam: 'crab', x: 300, y: 1040, th: EV.hatch[0] },
  { fam: 'horse', x: 780, y: 1040, th: EV.hatch[1] },
  { fam: 'star', x: 300, y: 1470, th: EV.hatch[2] },
  { fam: 'octo', x: 780, y: 1470, th: EV.hatch[3] },
];
const EGG_S = 520, BABY = 410;
function waterLevel(t) {
  const u = t - EV.wave, base = 560;
  if (u < -0.1) return base;
  const inK = E.outCubic(clamp((u + 0.1) / 0.3)), outK = E.inOutCubic(clamp((u - 0.25) / 0.55));
  return base + 1450 * inK * (1 - outK);
}
function drawHatch(c, t) {
  // sand
  K.bg(c, W, H, ['#fff0d6', '#ffe6bd', '#f6cf94']);
  const r = K.mulberry(21); c.fillStyle = 'rgba(160,100,40,.16)';
  for (let i = 0; i < 140; i++) { c.beginPath(); c.arc(r() * W, 500 + r() * 1420, 3 + r() * 5, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 80; i++) { c.beginPath(); c.arc(r() * W, 500 + r() * 1420, 2 + r() * 3, 0, TAU); c.fill(); }
  const lvl = waterLevel(t);
  // wet sand band
  c.fillStyle = 'rgba(233,184,119,.55)'; c.fillRect(0, 560, W, Math.max(0, Math.min(lvl, 1900) - 560 + 140));
  // eggs + babies
  for (const e of EGGS) drawEggSpot(c, t, e);
  // sea (top) + the wash
  const shore = (x) => lvl + Math.sin(x * 0.009 + t * 2.4) * 22 + Math.sin(x * 0.023 - t * 3.1) * 10;
  c.save();
  c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0);
  for (let x = W; x >= 0; x -= 20) c.lineTo(x, shore(x));
  c.closePath();
  c.fillStyle = K.vgrad(c, 0, Math.max(700, lvl), ['#2f8fe0', '#4fc6f2', '#8aeaf6']);
  c.globalAlpha = 1; c.save(); c.clip();
  c.fillRect(0, 0, W, 560);
  c.globalAlpha = 0.72; c.fillRect(0, 560, W, H);
  c.globalAlpha = 1;
  // shimmer
  c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 8; c.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const y0 = 120 + i * 90; c.beginPath(); for (let x = 0; x <= W; x += 30) { const yy = y0 + Math.sin(x * 0.01 + t * 2 + i * 1.3) * 12; x ? c.lineTo(x, yy) : c.moveTo(x, yy); } c.globalAlpha = 0.35 + 0.3 * Math.sin(t * 1.7 + i); c.stroke(); }
  c.restore();
  // foam edge
  c.globalAlpha = 1; c.lineJoin = 'round';
  c.beginPath(); for (let x = 0; x <= W; x += 20) { const y = shore(x); x ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.strokeStyle = K.PLUM; c.lineWidth = 22; c.globalAlpha = 0.25; c.stroke(); c.globalAlpha = 1;
  c.strokeStyle = '#ffffff'; c.lineWidth = 16; c.stroke();
  const fr = K.mulberry(33);
  for (let i = 0; i < 22; i++) { const x = fr() * W, rr = 8 + fr() * 16; K.ring(c, x + Math.sin(t * 2 + i) * 8, shore(x) - 6 - fr() * 24, rr, 0.8); }
  c.restore();
  // splash on the wave's arrival
  K.burst(c, t, EV.wave, 540, 900, 30, 55, { kind: 'drop', colors: ['#ffffff', '#bdf6ff'], speed: 1400, size: 34, life: 0.8, g: 1500 });
  // everybody cheers
  tword(c, t, 'HATCH!', EV.wave + 0.03, null, 540, 320, 200, { rot: -0.05 });
}
function eggPose(t, e) {
  const u = t - EV.wave, k = E.outCubic(clamp((u - 0.05) / 0.5));
  return { x: e.x + (1 - k) * (e.x < 540 ? -40 : 40), y: e.y - (1 - k) * 260, a: clamp((u + 0.02) / 0.12), rot: (1 - k) * 0.5 * (e.x < 540 ? -1 : 1) };
}
function drawEggSpot(c, t, e) {
  if (t < EV.wave - 0.02) return;
  const p = eggPose(t, e), th = e.th, u = t - th;
  const cr1 = th - 2 * SIX, cr2 = th - SIX;
  if (u < 0) {
    const cracks = t >= cr2 ? 2 : t >= cr1 ? 1 : 0;
    const pop = 1 + 0.14 * (pulse(t - cr1, 14) + pulse(t - cr2, 14)) - 0.06 * pulse(t - (th - 0.02), 30);
    c.save(); c.globalAlpha = p.a; c.translate(p.x, p.y); c.rotate(p.rot); c.translate(-p.x, -p.y);
    drawEgg(c, e.fam, p.x, p.y, EGG_S, t + e.x * 0.01, { ready: t > EV.wave + 0.4, cracks, pop });
    c.restore();
    if (t >= cr1) K.burst(c, t, cr1, p.x, p.y - EGG_S * 0.3, 6, e.x + 1, { speed: 500, size: 16, life: 0.4 });
    if (t >= cr2) K.burst(c, t, cr2, p.x, p.y - EGG_S * 0.3, 6, e.x + 2, { speed: 500, size: 16, life: 0.4 });
    return;
  }
  // shell halves
  const zig = (top) => {
    c.beginPath(); const y0 = e.y - EGG_S * 0.3;
    if (top) { c.moveTo(e.x - 400, e.y - 800); c.lineTo(e.x + 400, e.y - 800); } else { c.moveTo(e.x - 400, e.y + 200); c.lineTo(e.x + 400, e.y + 200); }
    for (let i = 0; i <= 8; i++) { const x = e.x + 200 - i * 50; c.lineTo(x, y0 + (i % 2 ? -22 : 22)); }
    c.closePath();
  };
  if (u < 0.45) {
    c.save(); c.globalAlpha = 1 - clamp((u - 0.25) / 0.2); zig(false); c.clip(); drawEgg(c, e.fam, e.x, e.y, EGG_S, t, { cracks: 2 }); c.restore();
    const ty = -1500 * u + 3200 * u * u, tx = (e.x < 540 ? -1 : 1) * 500 * u;
    c.save(); c.globalAlpha = 1 - clamp(u / 0.45); c.translate(e.x + tx, e.y - EGG_S * 0.3 + ty); c.rotate((e.x < 540 ? -1 : 1) * u * 9); c.translate(-e.x, -(e.y - EGG_S * 0.3));
    zig(true); c.clip(); drawEgg(c, e.fam, e.x, e.y, EGG_S, t, { cracks: 2 }); c.restore();
  }
  // baby creature
  const s = spring(u, 8, 17), q = wobble(u, 0.32);
  const jump = -190 * Math.sin(Math.PI * clamp(u / 0.32));
  const cheer = -110 * Math.sin(Math.PI * clamp((t - EV.cheer) / 0.3)) * (t > EV.cheer ? 1 : 0);
  const bob = Math.sin(t * 3.2 + e.x) * 6;
  c.save(); c.fillStyle = 'rgba(60,30,90,.22)'; c.beginPath(); c.ellipse(e.x, e.y + 6, BABY * 0.3 * s, BABY * 0.07 * s, 0, 0, TAU); c.fill(); c.restore();
  K.creature(c, `${e.fam}.0`, e.x, e.y + jump + cheer + bob, BABY, { sx: s * (1 - q), sy: s * (1 + q), blink: K.blinkAt(t, e.x) });
  K.shock(c, t, th, e.x, e.y - 130, 40, 330, '#fff', 0.45, 20);
  K.burst(c, t, th, e.x, e.y - 150, 20, 300 + e.x, { speed: 1100, size: 30, life: 0.75 });
  K.burst(c, t, th + 0.04, e.x, e.y - 200, 6, 400 + e.x, { kind: 'heart', colors: ['#ff8fc4', '#ff6fa8', '#ffb1d6'], speed: 520, size: 30, life: 0.9, g: -200 });
  if (t > EV.cheer) K.burst(c, t, EV.cheer + 0.05, e.x, e.y - 330, 4, 500 + e.x, { kind: 'heart', colors: ['#ff8fc4', '#ff6fa8'], speed: 420, size: 28, life: 0.8, g: -300 });
  tpill(c, t, D.FAMILIES[e.fam].name, th + 0.1, null, e.x, e.y + 58, 44, { bg: '#ffffff', bg2: '#ffeaf7' });
}

// ================================================================== shot 4: POP! the bubbles (bars 7-8)
const POP_CREW = [
  ['snail.b.green', 1, 0], ['star.0', 2, 1, 'partyhat'], ['crab.b.stone', 5, 2], ['horse.0', 4, 2], ['star.b.glow', 1, 3], ['jelly.0', 2, 2],
  ['jelly.b.glow', 3, 2], ['octo.0', 3, 3], ['horse.b.green', 3, 4], ['crab.0', 1, 4, 'flowerhat'], ['snail.0', 3, 5], ['crab.0', 4, 5],
];
const POP_ORDER = [0, 1, 5, 6, 3, 2, 7, 4, 9, 8, 10, 11];
const poolB = new SceneSim({
  seed: 202, biome: 'tide', T0: SEC.pop[0], pre: 30, insets: POOL_INSETS, clock: (t) => atHour(10.5) + t * 1000,
  build: (now) => {
    const st = tideState(now, 7);
    for (const step of DIG_STEPS) for (const [x, y] of step) put(st, 'tide', 'dig', x, y);
    for (const [tool, x, y] of BUILD_STEPS) put(st, 'tide', tool, x, y);
    const pool = st.pools.tide;
    for (const [f, x, y, hat] of POP_CREW) { const cr = addCreature(st, 'tide', f, x, y, { hat, lvl: 4 }); cr.stored = S.bubbleCap(st, pool, cr, now) * 1.02; }
    return st;
  },
  events: EV.pops.map((te, i) => ({ t: te, fn: (sim) => {
    const pool = sim.st.pools.tide, cr = pool.creatures[POP_ORDER[i]], sc = sim.sc;
    const bp = sc.bubblePos(cr.id), v = sc.views.get(cr.id), p0 = sc.tileCenter(v.x, v.y);
    const amt = S.collect(sim.st, 'tide', cr.id), n = i + 1;
    // the game's own pop feedback (game.js G.collect)
    sc.burst(0, 0, 'pearl', 7, { px: p0[0], py: p0[1], lift: sc.ts * 0.7, speed: 110, size: 7, life: 0.7 });
    sc.burst(0, 0, 'bubble', 6, { px: p0[0], py: p0[1], lift: sc.ts * 0.7, speed: 80, colors: ['#bdf6ff', '#fff'], size: 8 });
    sc.text(0, 0, `+${amt}`, '#fff6b0', { px: p0[0], py: p0[1] - sc.ts * 0.6, size: 17 });
    if (n >= 4) sc.text(0, 0, `x${n} combo!`, '#ffb1e6', { px: p0[0], py: p0[1] - sc.ts * 1.1, size: 14 });
    if (bp) sim.marks.push({ t: te, x: bp.x, y: bp.y });
  } })),
});
function drawPop(c, t) {
  const z = 1.0 + 0.012 * pulses(t, EV.pops, 12) + 0.03 * prog(SEC.pop[0], SEC.pop[1], t);
  const v = cam(c, poolB, t, z, LW / 2, LH / 2);
  // tap ripples + pearls flying up
  for (const m of poolB.marks) {
    const u = t - m.t; if (u < 0 || u > 0.6) continue;
    const [x, y] = v.map(m.x, m.y);
    K.shock(c, t, m.t, x, y, 30, 150, '#ffffff', 0.35, 14);
    K.burst(c, t, m.t, x, y, 8, Math.round(m.t * 1000), { kind: 'pearl', speed: 700, size: 30, life: 0.5 });
  }
  tword(c, t, 'POP!', SEC.pop[0] + 0.03, null, 540, 318, 210, { rot: -0.05 });
  const combo = (str, i0, i1, fill, size) => tword(c, t, str, EV.pops[i0], i1 === null ? null : EV.pops[i1], 540, 1492, size, { rot: 0.04, fill, stagger: 0.02 });
  combo('x4', 3, 7, 'pink', 150);
  combo('x8', 7, 11, 'lemon', 165);
  combo('x12 COMBO!', 11, null, 'gold', 132);
  if (t > EV.pops[11]) K.burst(c, t, EV.pops[11], 540, 1480, 26, 77, { speed: 1400, size: 34, life: 0.8 });
}

// ================================================================== shot 5: EVOLVE! (bar 9) — cocoons burst on the off-beats
const EVO = [
  { from: 'crab.0', to: 'crab.b.warmth', x: 285, y: 930 },
  { from: 'snail.0', to: 'snail.b.calm', x: 795, y: 930 },
  { from: 'star.0', to: 'star.b.glow', x: 285, y: 1440 },
  { from: 'octo.0', to: 'octo.b.glow', x: 795, y: 1440 },
];
function drawEvolve(c, t) {
  const t0 = SEC.evolve[0], u = t - t0;
  K.bg(c, W, H, ['#ff8fd8', '#d69bff', '#9d86ff']);
  K.glow(c, 540, 1150, 1000, 'rgba(255,255,255,.35)');
  K.rays(c, 540, 1150, 20, t * 0.4, 1800, '#fff', 0.13 + 0.08 * pulses(t, EV.evolve, 6), 0.5);
  K.risingBubbles(c, W, H, t, 16, 9, { speed: 240, size: 20, alpha: 0.45 });
  EVO.forEach((e, i) => {
    const R = EV.evolve[i], appear = spring(u + 0.02 - i * 0.03, 9, 18);
    if (t < R) {
      const k = prog(t0, R, t), sh = Math.sin(t * 70 + i) * (4 + 16 * k);
      c.save(); c.translate(e.x + sh, e.y); c.scale(appear, appear); c.translate(-e.x, -e.y);
      drawCocoon(c, e.x, e.y + 40, 470, t * 2, lerp(0.35, 1, k));
      c.restore();
      if (appear > 0.5) K.creature(c, e.from, e.x + 150, e.y + 60, 150, { sx: appear, sy: appear, blink: K.blinkAt(t, i) });
    } else {
      const v = t - R, s = spring(v, 8, 16), q = wobble(v, 0.3), pal = D.FORMS[e.to].pal;
      K.rays(c, e.x, e.y - 160, 12, t * 1.2 + i, 360 * clamp(v * 5), pal.accent, 0.55, 0.45, 40);
      K.glow(c, e.x, e.y - 160, 300, 'rgba(255,255,255,.9)', 0.6);
      K.creature(c, e.to, e.x, e.y + Math.sin(t * 3 + i) * 8, 420, { sx: s * (1 - q), sy: s * (1 + q), blink: K.blinkAt(t, i + 3) });
      K.glow(c, e.x, e.y - 160, 330 * (1 + v * 2), 'rgba(255,255,255,1)', Math.max(0, 1 - v / 0.22));
      K.shock(c, t, R, e.x, e.y - 160, 60, 380, '#fff', 0.4, 22);
      K.burst(c, t, R, e.x, e.y - 160, 22, 600 + i, { speed: 1200, size: 30, life: 0.7 });
      tpill(c, t, D.FORMS[e.to].name, R + 0.06, null, e.x, e.y + 62, 42, { bg: '#ffffff', bg2: '#f4ecff' });
    }
  });
  tword(c, t, 'EVOLVE!', t0 + 0.02, null, 540, 330, 190, { rot: -0.04 });
}

// ================================================================== shot 6: 70 CREATURES (bar 10)
function drawWall(c, t) {
  const t0 = EV.wall, u = t - t0;
  K.bg(c, W, H, ['#ffe27a', '#ffb3b3', '#ff8fc4']);
  K.rays(c, 540, 960, 22, -t * 0.3, 1800, '#fff', 0.16, 0.5);
  const cols = 7, cell = 150;
  const ox = 540 - (cols - 1) * cell / 2, oy = 230 - u * 60;
  D.FAMILY_IDS.forEach((fam, j) => D.formsOfFamily(fam).forEach((f, i) => {
    const d = (i + j) * 0.02 + (j % 2) * 0.01, s = spring(u - d, 9, 18);
    if (s <= 0.01) return;
    const x = ox + i * cell + (j % 2 ? cell * 0.0 : 0), y = oy + j * cell + cell * 0.36 + Math.sin(t * 3 + i + j) * 4;
    c.save(); c.translate(x, y); c.scale(s, s); drawSprite(c, f, 0, 0, cell * 1.02, { blink: K.blinkAt(t, i * 7 + j) }); c.restore();
  }));
  // band
  const bk = E.outCubic(clamp(u / 0.2));
  c.save(); c.translate(540 + (1 - bk) * -1300, 985); c.rotate(-0.045);
  c.fillStyle = K.PLUM_DK; c.fillRect(-700, -175 + 14, 1400, 350);
  c.fillStyle = K.vgrad(c, -175, 175, ['#5a2d91', '#3b1d5e']); c.fillRect(-700, -175, 1400, 350);
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-700, -175, 1400, 10); c.fillRect(-700, 165, 1400, 10);
  c.restore();
  tword(c, t, '70', t0 + 0.05, null, 540, 935, 270, { rot: -0.045, fill: 'gold', rim: '#fff' });
  tword(c, t, 'CREATURES', EV.wallWord, null, 540, 1090, 110, { rot: -0.045, stagger: 0.025 });
  K.burst(c, t, t0 + 0.1, 540, 935, 24, 88, { speed: 1300, size: 32, life: 0.7 });
}

// ================================================================== shot 7: LEGENDARY (bars 11-12)
const HERO_MYTHIC = 'star.m.warmth';
function drawLegend(c, t) {
  const ch = EV.charge, rv = EV.legend;
  const g = c.createRadialGradient(540, 1000, 50, 540, 1000, 1300); g.addColorStop(0, '#6b35c9'); g.addColorStop(0.55, '#2f1673'); g.addColorStop(1, '#140a3a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const rr = K.mulberry(3); for (let i = 0; i < 60; i++) { const x = rr() * W, y = rr() * H, tw = Math.abs(Math.sin(t * (1 + rr() * 2) + i)); c.globalAlpha = 0.3 + 0.6 * tw; c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 1.5 + rr() * 3, 0, TAU); c.fill(); } c.globalAlpha = 1;
  if (t < rv) {
    const k = prog(ch, rv, t);
    // sparkles converge on the cocoon
    for (let i = 0; i < 44; i++) {
      const r = K.mulberry(700 + i), a = r() * TAU + t * 0.8, ph = (k * 1.6 + r()) % 1, rad = 950 * (1 - ph);
      K.sparkle(c, 540 + Math.cos(a) * rad, 1040 + Math.sin(a) * rad * 0.9, 10 + 22 * ph, i % 2 ? '#ffe66d' : '#fff', a);
    }
    K.rays(c, 540, 1040, 16, t * 2, 1400, '#ffe66d', 0.08 + 0.3 * k * k, 0.35);
    K.glow(c, 540, 1040, 700, 'rgba(255,220,120,.8)', 0.2 + 0.6 * k);
    const sh = K.shakeXY(t, 3 + 26 * k * k);
    c.save(); c.translate(sh[0], sh[1]);
    drawCocoon(c, 540, 1330, 1000, t * 3, 0.2 + 0.8 * k);
    c.restore();
    return;
  }
  const v = t - rv, pal = D.FORMS[HERO_MYTHIC].pal;
  K.rays(c, 540, 1030, 14, t * 0.6, 1900, '#ffe66d', 0.3, 0.5);
  K.rays(c, 540, 1030, 14, -t * 0.4 + 0.2, 1900, pal.accent, 0.22, 0.3);
  K.glow(c, 540, 1030, 800, 'rgba(255,200,120,.85)', 0.8);
  K.glow(c, 540, 1030, 480, 'rgba(255,255,255,.9)', 0.55);
  const s = spring(v, 7, 15), q = wobble(v, 0.3);
  K.creature(c, HERO_MYTHIC, 540, 1095 + Math.sin(t * 2.4) * 12, 780, { sx: s * (1 - q), sy: s * (1 + q), blink: K.blinkAt(t, 2) });
  K.shock(c, t, rv, 540, 1030, 100, 1100, '#fff', 0.55, 40);
  K.burst(c, t, rv, 540, 1030, 40, 991, { speed: 1800, size: 40, life: 1.0, colors: ['#fff', '#ffe66d', '#ffb02e', '#ff8fc4'] });
  K.confetti(c, t, rv + 0.02, 70, 31, { x: 60, y: 1700, a: -1.15, spread: 0.7, speed: 2300, life: 2.6 });
  K.confetti(c, t, rv + 0.02, 70, 32, { x: 1020, y: 1700, a: -Math.PI + 1.15, spread: 0.7, speed: 2300, life: 2.6 });
  // two more legends join on bar 12
  const side = (form, x, t0, flip) => {
    const w = t - t0; if (w < 0) return;
    const s2 = spring(w, 8, 17), q2 = wobble(w, 0.3);
    K.glow(c, x, 1330, 260, 'rgba(255,255,255,.8)', 0.6);
    K.creature(c, form, x, 1450 + Math.sin(t * 3 + x) * 8, 330, { sx: s2 * (1 - q2), sy: s2 * (1 + q2), flip, blink: K.blinkAt(t, x) });
    K.burst(c, t, t0, x, 1330, 16, 1200 + x, { speed: 900, size: 26, life: 0.6 });
  };
  side('jelly.m.depth', 175, EV.legendSides[0], false);
  side('octo.m.glow', 905, EV.legendSides[1], false);
  tword(c, t, 'LEGENDARY!', rv + 0.03, null, 540, 345, 150, { fill: 'gold', rim: '#fff', stagger: 0.025, wave: 0.02 });
  tpill(c, t, D.FORMS[HERO_MYTHIC].name, rv + 0.2, null, 540, 1508, 50, { bg: '#fff7c2', bg2: '#ffd84a' });
}

// ================================================================== shot 8: CRANK IT! (bars 13-14) — the real Capsule Machine
const MK = 2.3, MOX = 540 - (MW / 2) * MK, MOY = 470;
const CAP_TIERS = ['common', 'uncommon', 'legendary', 'common', 'rare', 'common', 'uncommon', 'common', 'common', 'uncommon'];
const LEG_I = 2, PRIZE = 'figg_crab';
const TOYS = ['fig_star_0', 'unicorn', 'boba', 'fig_jelly_b_glow', 'balloons', 'tophat', 'beachball', 'fig_octo_m_glow'];
class MachineSim {
  constructor() { this.idx = null; this.lands = []; }
  reset() {
    this.rng = K.mulberry(4242); this.m = newMachine(); this.lands = [];
    K.withRng(this.rng, () => { for (let i = 0; i < 45; i++) stepMachine(this.m, 1 / FPS); });
    this.T0 = SEC.crank[0] - 0.4; this.idx = -1; this.cranked = false; this.dropped = false;
  }
  at(t) {
    const target = Math.round((t - (SEC.crank[0] - 0.4)) * FPS);     // frames since the sim's start (T0, also set in reset)
    if (this.idx === null || target < this.idx) this.reset();
    while (this.idx < target) {
      this.idx++; const tt = this.T0 + this.idx / FPS, m = this.m;
      K.withRng(this.rng, () => {
        if (!this.cranked && tt >= EV.crank - 1e-6) { this.cranked = true; m.crankV = 15; m.shake = 1; }
        if (!this.dropped && tt >= EV.drop - 1e-6) {
          this.dropped = true; m.out = [];
          CAP_TIERS.forEach((tier, i) => {
            // same layout as the game's 10-pull (gacha_ui spawnOut, n > 1), dropped from above the frame on a 32nd-note stagger
            const col = i % 5, row = Math.floor(i / 5);
            const o = { x: 60 + col * 60 + (Math.random() - 0.5) * 14, y: -200 - row * 30, tx: 44 + col * 68, ty: 232 + row * 96, r: 27, tier, hue: [330, 190, 48, 120, 260][i % 5], rot: 0.3, vr: (Math.random() - 0.5) * 8, vy: 700, t0: m.time + i * EV.dropStagger, i, ready: false, landed: false };
            o.onLand = () => this.lands.push({ t: this.T0 + this.idx / FPS, i });
            o.onSettle = () => { o.ready = true; };
            m.out.push(o);
          });
        }
        stepMachine(m, 1 / FPS);
      });
    }
    return this.m;
  }
}
export const machine = new MachineSim();
function crankBg(c, t) {
  K.bg(c, W, H, ['#ff9ad8', '#e07bf0', '#8b5cf6']);
  K.glow(c, 540, 900, 1000, 'rgba(255,255,255,.4)');
  K.rays(c, 540, 900, 20, t * 0.35, 1900, '#fff', 0.14, 0.5);
  const r = K.mulberry(55);
  for (let i = 0; i < 12; i++) { const x = r() * W, y0 = r() * H, sp = 60 + r() * 60, y = ((y0 - t * sp) % (H + 200) + H + 200) % (H + 200) - 100; c.save(); c.globalAlpha = 0.35; drawCapsule(c, x, y, 26 + r() * 20, capsuleStyle(i % 5 === 0 ? 'rare' : 'common', r() * 360), { rot: t * (r() - 0.5) * 2 + i }); c.restore(); }
}
function drawCrank(c, t) {
  const m = machine.at(t);
  crankBg(c, t);
  const reveal = t >= EV.open, opening = t >= EV.twist && !reveal;
  const leg = m.out[LEG_I];
  const pile = t >= EV.drop;
  const bump = 0.02 * pulse(t - EV.crank, 8);
  c.save(); c.translate(MOX, MOY); c.translate(MW / 2 * MK, 240 * MK); c.scale(MK * (1 + bump), MK * (1 + bump)); c.translate(-MW / 2, -240);
  if (pile) { c.save(); c.globalAlpha = lerp(1, 0.35, prog(EV.drop, EV.drop + 0.3, t)); drawMachine(c, m, t, {}); c.restore(); } else drawMachine(c, m, t, { hover: 1 });
  drawDropped(c, m, t, { skip: opening || reveal ? leg : null });
  if (opening && leg) {
    // the game's opening phase (gacha_ui.js), timed to one beat: fly to the middle, shake, twist open
    const ph = t - EV.twist, k = clamp(ph / (EV.open - EV.twist));
    const from = { x: leg.tx, y: leg.ty, r: leg.r }, kk = Math.min(1, k * 1.6);
    const pose = { ...leg, x: from.x + (MW / 2 - from.x) * E.outBack(kk), y: from.y + (200 - from.y) * kk, r: from.r + (62 - from.r) * kk, rot: Math.sin(ph * 30) * 0.18 * (1 - k) * 1.5, open: clamp((t - (EV.open - 0.1)) / 0.1), hidden: false, landed: false };
    drawDropped(c, { out: [pose], time: 1e9 }, t, {});
  }
  c.restore();
  if (reveal) drawReveal(c, t);
  tword(c, t, 'CRANK IT!', SEC.crank[0] + 0.03, EV.open, 540, 328, 180, { rot: -0.05 });
  // capsule landing dust
  for (const l of machine.lands) { const o = m.out[l.i]; if (!o) continue; K.burst(c, t, l.t, MOX + o.tx * MK, MOY + (o.ty + o.r) * MK, 5, 3000 + l.i, { speed: 380, size: 14, life: 0.35, colors: ['#fff', '#fff3a6'] }); }
}
function drawReveal(c, t) {
  // the game's reveal (gacha_ui.js frame(), phase 'reveal'), laid out full-screen
  const v = t - EV.open, k = Math.min(1, v / 0.5), col = TIER_COLOR.legendary;
  const cx = 540, cy = MOY + 205 * MK;
  c.fillStyle = `rgba(28,10,66,${0.8 * Math.min(1, v * 4)})`; c.fillRect(0, 0, W, H);
  c.save(); c.translate(cx, cy); c.rotate(t * 0.35); c.globalAlpha = 0.6 * k;
  for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-70, -1300); c.lineTo(70, -1300); c.closePath(); const g = c.createLinearGradient(0, 0, 0, -1300); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fill(); }
  c.restore();
  K.glow(c, cx, cy, 520, col, 0.6 * k);
  K.glow(c, cx, cy, 300, 'rgba(255,255,255,.9)', 0.5 * k);
  const sc = 0.55 + 0.45 * E.outBack(k);
  c.save(); c.translate(cx, cy - 20); c.scale(sc * MK * 1.12, sc * MK * 1.12);
  drawItemArt(c, PRIZE, 0, Math.sin(t * 2.2) * 4, 190, t);
  c.restore();
  K.burst(c, t, EV.open, cx, cy, 46, 4545, { speed: 1500, size: 30, life: 1.1, colors: [col, '#fff', col, '#ffe66d'] });
  K.confetti(c, t, EV.open + 0.02, 80, 61, { x: 540, y: 1000, a: -Math.PI / 2, spread: 3.2, speed: 1900, life: 2.2 });
  // result card (tier stars + name), like the in-game reveal card
  const cardU = t - (EV.open + 0.12);
  if (cardU > 0) {
    const s = spring(cardU, 8, 17);
    c.save(); c.translate(540, 1395); c.scale(s, s);
    c.beginPath(); c.roundRect(-330, -95 + 12, 660, 190, 40); c.fillStyle = K.PLUM_DK; c.fill();
    c.beginPath(); c.roundRect(-330, -95, 660, 190, 40); c.fillStyle = '#fffaf2'; c.fill(); c.lineWidth = 9; c.strokeStyle = K.PLUM; c.stroke();
    for (let i = 0; i < 4; i++) star5(c, -84 + i * 56, -42, 24, col);
    c.font = K.font(56); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = K.PLUM; c.fillText(D.DECOR[PRIZE].name, 0, 22);
    c.font = K.font(30, 600); c.fillStyle = '#8a5cc2'; c.fillText('Legendary golden figure', 0, 68);
    c.restore();
  }
  // a flurry of other toys
  TOYS.forEach((id, i) => {
    const t0 = EV.toys[i], w = t - t0; if (w < 0) return;
    const s = spring(w, 8, 17), left = i % 2 === 0, row = Math.floor(i / 2);
    const x = left ? 150 : 930, y = 700 + row * 190 + (left ? 0 : 95);
    c.save(); c.translate(x, y + Math.sin(t * 3 + i) * 8); c.scale(s, s); c.rotate(Math.sin(t * 2 + i) * 0.08);
    c.beginPath(); c.arc(0, 0, 92, 0, TAU); c.fillStyle = 'rgba(255,255,255,.9)'; c.fill(); c.lineWidth = 8; c.strokeStyle = TIER_COLOR[D.POOL_BY_ID[id].tier]; c.stroke();
    c.save(); c.beginPath(); c.arc(0, 0, 88, 0, TAU); c.clip(); drawItemArt(c, id, 0, 0, 120, t); c.restore();
    c.restore();
  });
  tword(c, t, '99 TOYS', EV.open + 0.02, null, 540, 318, 180, { rot: -0.04, fill: 'gold', rim: '#fff' });
  tword(c, t, 'TO COLLECT', EV.open + 0.14, null, 540, 470, 92, { rot: -0.04, stagger: 0.02 });
}

// ================================================================== shot 9: DIVE DEEP (bars 15-16) — the Deep Ocean pool
const deepSim = new SceneSim({
  seed: 303, biome: 'deep', T0: SEC.dive[0] - 0.4, pre: 30, insets: { top: 185, bottom: 95 }, clock: (t) => atHour(21.5) + t * 1000,
  build: (now) => {
    const st = baseState(now, 9);
    S.applyProduct(st, D.IAP.deep, 'trailer', now, { restore: true });
    const b = 'deep', pool = st.pools.deep;
    for (let y = 1; y < pool.h - 1; y++) for (let x = 1; x < pool.w - 1; x++) put(st, b, 'dig', x, y);
    for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3], [2, 4], [3, 4]]) put(st, b, 'dig', x, y);
    for (const [x, y] of [[2, 3], [3, 3]]) put(st, b, 'dig', x, y);
    for (const [tool, x, y] of [['piece:glowstone', 0, 2], ['piece:vent', 5, 3], ['piece:biokelp', 0, 4], ['piece:basalt', 5, 1], ['piece:glowstone', 5, 5], ['piece:biokelp', 1, 1], ['piece:biokelp', 4, 5], ['piece:basalt', 0, 6]]) put(st, b, tool, x, y);
    for (const [f, x, y] of [['angler.b.glow', 2, 3], ['angler.0', 3, 4], ['manta.b.glow', 3, 2], ['manta.0', 2, 5], ['naut.b.glow', 1, 3], ['naut.m.depth', 4, 2], ['drake.b.glow', 4, 4], ['drake.0', 1, 5], ['angler.m.warmth', 3, 3]]) addCreature(st, b, f, x, y, { lvl: 5 });
    return st;
  },
});
function drawDive(c, t) {
  const t0 = SEC.dive[0], u = t - t0;
  const push = 1.0 + 0.1 * E.inCubic(prog(t0, SEC.dive[1], t)) + 0.03 * pulses(t, [T(16, 1), T(16, 2), T(16, 3), T(16, 4)], 8);
  const tilt = -520 * (1 - E.outCubic(clamp(u / 0.55)));
  cam(c, deepSim, t, push, LW / 2, LH / 2 + 20, 0, 0, tilt);
  // deep-water bubbles rushing up after the plunge
  c.save(); c.globalAlpha = clamp(1 - (u - 0.3) / 0.6); K.risingBubbles(c, W, H, t * 3, 40, 71, { speed: 700, size: 22, alpha: 0.7 }); c.restore();
  K.risingBubbles(c, W, H, t, 10, 72, { speed: 120, size: 14, alpha: 0.35, col: '#cfefff' });
  // the riser: light builds up through bar 16
  const rk = prog(T(16), T(17), t);
  K.glow(c, 540, 960, 1300, 'rgba(180,230,255,1)', 0.35 * rk * rk);
  tword(c, t, 'DIVE DEEP', t0 + 0.12, null, 540, 322, 176, { rot: -0.04, fill: 'aqua' });
  tpill(c, t, 'Premium Deep Ocean biome', EV.ping, null, 540, 470, 44, { bg: '#1c2a7a', bg2: '#0f1a5c', color: '#bff7ff' });
}

// ================================================================== shot 10: hero pool, day -> night, end card (bars 17-18)
const heroSim = new SceneSim({
  seed: 404, biome: 'tide', T0: SEC.end[0], pre: 30, insets: { top: 212, bottom: 222 },
  clock: (t) => atHour(lerp(16.9, 20.8, E.inOutCubic(prog(SEC.end[0], T(18, 3), t)))) + (t % 60) * 1000,
  build: (now) => {
    const st = baseState(now, 12), b = 'tide';
    for (let i = 0; i < 3; i++) S.expandPool(st, b);           // 7x7
    st.equip.fx = 'fireflies';
    const pool = st.pools.tide;
    const w1 = [[2, 1], [3, 1], [4, 1], [1, 2], [5, 2], [1, 3], [5, 3], [1, 4], [5, 4], [2, 5], [3, 5], [4, 5]];
    const w2 = [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3], [2, 4], [3, 4], [4, 4]];
    for (const [x, y] of [...w1, ...w2]) put(st, b, 'dig', x, y);
    for (const [x, y] of w2) put(st, b, 'dig', x, y);
    for (const [tool, x, y] of [['piece:granite', 0, 2], ['piece:mossy', 6, 3], ['piece:ember', 6, 5], ['piece:pearlite', 0, 5], ['piece:kelp', 1, 1], ['piece:kelp', 5, 5], ['piece:granite', 6, 1], ['piece:kelp', 3, 4],
      ['decor:umbrella', 0, 0], ['decor:lighthouse', 6, 6], ['decor:lantern', 0, 4], ['decor:sandcastle', 3, 6], ['decor:treasure', 1, 6], ['decor:figg_crab', 5, 6], ['decor:capsulemachine', 6, 0], ['decor:balloons', 2, 0], ['decor:pinwheel', 4, 0], ['decor:duck', 4, 4], ['decor:lilypad', 2, 4], ['decor:lantern', 0, 3]]) put(st, b, tool, x, y);
    const crew = [['star.m.warmth', 3, 1, null, 0.6], ['horse.m.glow', 1, 3, null, 0], ['jelly.b.glow', 3, 3, null, 0.8], ['octo.b.stone', 2, 3, null, 0], ['crab.b.stone', 5, 1, 'partyhat', 0.5], ['snail.b.calm', 1, 5, null, 0],
      ['crab.0', 4, 6, 'flowerhat', 0.9], ['star.b.glow', 5, 4, 'shades', 0], ['horse.b.green', 4, 5, null, 0.4], ['jelly.0', 3, 2, null, 0]];
    for (const [f, x, y, hat, fill] of crew) { const cr = addCreature(st, b, f, x, y, { hat, lvl: 6 }); cr.stored = S.bubbleCap(st, pool, cr, now) * fill; }
    return st;
  },
});
function drawEnd(c, t) {
  const t0 = SEC.end[0], u = t - t0;
  const z = 1.0 + 0.22 * (1 - E.outCubic(clamp(u / 0.6))) + 0.012 * pulse(t - EV.final, 8);
  cam(c, heroSim, t, z, LW / 2, LH / 2 + 8);
  // legibility scrim behind the CTA
  const g = c.createLinearGradient(0, 1250, 0, H); g.addColorStop(0, 'rgba(34,16,60,0)'); g.addColorStop(0.35, 'rgba(34,16,60,.55)'); g.addColorStop(1, 'rgba(34,16,60,.85)');
  c.fillStyle = g; c.fillRect(0, 1250, W, H - 1250);
  K.confetti(c, t, t0, 90, 71, { x: 540, y: 560, a: -Math.PI / 2, spread: 3.0, speed: 2000, life: 2.8 });
  // logo
  const lu = t - t0, k = E.outCubic(clamp(lu / 0.11)), sc = lerp(2.6, 1, k) * (1 + wobble(lu - 0.11, 0.16)) * (1 + 0.035 * pulse(t - EV.final, 7));
  K.word(c, 'Tiny Tides', 540, 350, 176, { noPop: true, scale: sc, rot: -0.035, rim: '#fff', alpha: clamp(lu / 0.05), maxW: 960 });
  K.shock(c, t, t0 + 0.1, 540, 350, 120, 800, '#fff', 0.45, 24);
  for (let i = 0; i < 6; i++) { const r = K.mulberry(1900 + i), x = 110 + r() * 860, y = 240 + r() * 240, ph = r() * 5; K.sparkle(c, x, y, 28 * Math.max(0, Math.sin(t * 3.4 + ph)), i % 2 ? '#fff' : '#fff6a8', t); }
  // CTA
  tpill(c, t, 'Free on iPhone & iPad', EV.cta1, null, 540, 1398, 62, { bg: '#ffffff', bg2: '#fff0fa' });
  if (t >= EV.cta2) {
    const w = t - EV.cta2, s = spring(w, 8, 18);
    c.save(); c.translate(540, 1488); c.scale(s, s); c.font = K.font(46); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 12; c.strokeStyle = K.PLUM; c.strokeText('Search “Tiny Tides” on the App Store', 0, 0); c.fillStyle = '#ffffff'; c.fillText('Search “Tiny Tides” on the App Store', 0, 0);
    c.restore();
  }
  if (t >= EV.cta1) {
    c.save(); c.globalAlpha = clamp((t - EV.cta1) / 0.2); c.font = K.font(36, 600); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = 8; c.strokeStyle = 'rgba(34,16,60,.9)'; c.strokeText(PURCHASE_NOTICE, 540, 1560, 1000);
    c.fillStyle = '#ffffff'; c.fillText(PURCHASE_NOTICE, 540, 1560, 1000); c.restore();
  }
}

// ================================================================== sequencing, transitions, global fx
const SHOTS = [
  { a: 0, b: T(3), f: drawOpen }, { a: T(3), b: T(5), f: drawBuild }, { a: T(5), b: T(7), f: drawHatch }, { a: T(7), b: T(9), f: drawPop },
  { a: T(9), b: T(10), f: drawEvolve }, { a: T(10), b: T(11), f: drawWall }, { a: T(11), b: T(13), f: drawLegend }, { a: T(13), b: T(15), f: drawCrank },
  { a: T(15), b: T(17), f: drawDive }, { a: T(17), b: 99, f: drawEnd },
];
const shotAt = (t) => SHOTS.find((s) => t >= s.a && t < s.b) || SHOTS[SHOTS.length - 1];
const TRANS = [
  { t: T(3), pre: 0.24, post: 0.3, kind: 'zoom' },
  { t: T(5), pre: 0.12, post: 0.17, kind: 'whip', dir: 1 },
  { t: T(7), pre: 0.06, post: 0.3, kind: 'iris' },
  { t: T(9), pre: 0.14, post: 0.22, kind: 'zoom' },
  { t: T(11), pre: 0.22, post: 0.1, kind: 'suck' },
  { t: T(13), pre: 0.12, post: 0.17, kind: 'whip', dir: -1 },
  { t: T(15), pre: 0.26, post: 0.12, kind: 'plunge' },
];
const FLASH = [
  { t: T(3), a: 1, d: 0.16 }, { t: T(9), a: 0.9, d: 0.16 }, { t: T(10), a: 0.55, d: 0.12 }, { t: EV.legend, a: 1, d: 0.28 },
  { t: EV.open, a: 0.8, d: 0.3 }, { t: T(17), a: 1, d: 0.26 },
];
const SHAKE = [
  { t: EV.splash, a: 16, d: 6 }, { t: EV.slam[0] + 0.1, a: 18, d: 9 }, { t: EV.slam[1] + 0.1, a: 24, d: 8 }, { t: T(3), a: 16, d: 8 },
  ...EV.dig.map((x) => ({ t: x, a: 3, d: 14 })), ...EV.build.map((x) => ({ t: x, a: 5, d: 12 })), ...EV.hatch.map((x) => ({ t: x, a: 9, d: 10 })),
  { t: T(9), a: 16, d: 8 }, ...EV.evolve.map((x) => ({ t: x, a: 7, d: 10 })), { t: T(10), a: 12, d: 9 }, { t: EV.legend, a: 34, d: 4 },
  ...EV.legendSides.map((x) => ({ t: x, a: 8, d: 10 })), { t: EV.crank, a: 10, d: 7 }, { t: EV.open, a: 20, d: 6 }, { t: T(15), a: 12, d: 6 }, { t: T(17), a: 28, d: 5 },
];
const LINES = [{ t: T(3), a: 0.8 }, { t: T(9), a: 0.7 }, { t: EV.legend, a: 1 }, { t: T(17), a: 0.9 }, { t: EV.open, a: 0.7 }];

let bufA, bufB, bufC;
const ctxOf = (cv) => cv.getContext('2d');
function shotInto(cv, t, shot) { const c = ctxOf(cv); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; shot.f(c, t); return cv; }
function compose(c, t) {
  const tr = TRANS.find((x) => t >= x.t - x.pre && t < x.t + x.post);
  const draw = (cv) => c.drawImage(cv, 0, 0);
  if (!tr) { shotAt(t).f(c, t); return; }
  const A = SHOTS.find((s) => s.b === tr.t), B = SHOTS.find((s) => s.a === tr.t);
  const before = t < tr.t;
  if (tr.kind === 'zoom') {
    if (before) { const k = E.inCubic(prog(tr.t - tr.pre, tr.t, t)); shotInto(bufA, t, A); c.save(); c.translate(540, 900); c.scale(1 + 0.9 * k, 1 + 0.9 * k); c.rotate(-0.08 * k); c.translate(-540, -900); draw(bufA); c.restore(); }
    else { const k = E.outCubic(prog(tr.t, tr.t + tr.post, t)); shotInto(bufB, t, B); c.save(); c.translate(540, 960); c.scale(1.35 - 0.35 * k, 1.35 - 0.35 * k); c.rotate(0.05 * (1 - k)); c.translate(-540, -960); draw(bufB); c.restore(); }
  } else if (tr.kind === 'whip') {
    const p = prog(tr.t - tr.pre, tr.t + tr.post, t), e = E.inOutCubic(p), dir = tr.dir;
    const vel = Math.abs(E.inOutCubic(Math.min(1, p + 0.02)) - E.inOutCubic(Math.max(0, p - 0.02))) / 0.04 / ((tr.pre + tr.post) * FPS) * W;
    shotInto(bufA, t, A); shotInto(bufB, t, B);
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    const N = 8;
    for (let i = 0; i < N; i++) {
      const off = (i / (N - 1) - 0.5) * vel * 1.2;
      c.globalAlpha = 1 / (i + 1);
      const xa = -dir * W * e + off * -dir;
      c.drawImage(bufA, xa, 0); c.drawImage(bufB, xa + dir * W, 0);
    }
    c.globalAlpha = 1;
  } else if (tr.kind === 'iris') {
    shotInto(bufA, t, A); draw(bufA);
    const p = prog(tr.t - tr.pre, tr.t + tr.post, t), R = 20 + 1250 * E.inOutCubic(p);
    shotInto(bufB, t, B);
    c.save(); c.beginPath(); c.arc(540, 960, R, 0, TAU); c.clip(); draw(bufB); c.restore();
    c.save(); c.lineWidth = 22; c.strokeStyle = K.PLUM; c.beginPath(); c.arc(540, 960, R, 0, TAU); c.stroke();
    c.lineWidth = 12; c.strokeStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(540, 960, R - 20, Math.PI * 1.1, Math.PI * 1.45); c.stroke(); c.restore();
  } else if (tr.kind === 'suck') {
    shotInto(bufB, t, B); draw(bufB);
    if (before) { const k = E.inCubic(prog(tr.t - tr.pre, tr.t, t)); shotInto(bufA, t, A); c.save(); c.translate(540, 1000); c.rotate(k * 1.4); c.scale(1 - k, 1 - k); c.globalAlpha = 1 - k * 0.3; c.translate(-540, -1000); draw(bufA); c.restore(); }
  } else if (tr.kind === 'plunge') {
    if (before) {
      shotInto(bufA, t, A); draw(bufA);
      const k = E.inCubic(prog(tr.t - tr.pre, tr.t, t)), ys = -140 + (H + 280) * k;
      const surf = (x) => ys + Math.sin(x * 0.012 + t * 8) * 26;
      c.save(); c.beginPath(); c.moveTo(0, -10); c.lineTo(W, -10); for (let x = W; x >= 0; x -= 30) c.lineTo(x, surf(x)); c.closePath();
      c.fillStyle = K.vgrad(c, 0, H, ['#0f2a78', '#1b4fb0', '#2d7fe0']); c.fill();
      c.clip(); K.risingBubbles(c, W, H, t * 4, 36, 91, { speed: 800, size: 22, alpha: 0.75 }); c.restore();
      c.beginPath(); for (let x = 0; x <= W; x += 30) { const y = surf(x); x ? c.lineTo(x, y) : c.moveTo(x, y); } c.lineWidth = 26; c.strokeStyle = '#fff'; c.lineJoin = 'round'; c.stroke();
    } else {
      shotInto(bufB, t, B); draw(bufB);
      const k = prog(tr.t, tr.t + tr.post, t);
      c.save(); c.globalAlpha = 1 - k; c.fillStyle = '#153a96'; c.fillRect(0, 0, W, H); c.restore();
    }
  }
}
const flashAt = (t) => FLASH.reduce((a, f) => { const u = t - f.t; return Math.max(a, u < -0.05 ? 0 : u < 0 ? f.a * (1 + u / 0.05) * 0.6 : f.a * Math.exp(-u / f.d * 2.2)); }, 0);
const shakeAt = (t) => SHAKE.reduce((a, s) => a + (t >= s.t ? s.a * Math.exp(-(t - s.t) * s.d) : 0), 0);
const linesAt = (t) => LINES.reduce((a, l) => { const u = t - l.t; return Math.max(a, u < -0.15 ? 0 : u < 0 ? l.a * (1 + u / 0.15) : l.a * Math.exp(-u * 5)); }, 0);

export let debugSafe = false;
export const setDebug = (v) => { debugSafe = v; };
let main;
export function init(canvas) {
  initClock();
  main = canvas; main.width = W; main.height = H;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
  bufA = mk(); bufB = mk(); bufC = mk();
  Math.random = K.mulberry(99);                     // anything outside a sim stays deterministic too
}
export function renderFrame(t) {
  const cc = ctxOf(bufC); cc.setTransform(1, 0, 0, 1, 0, 0); cc.globalAlpha = 1; cc.globalCompositeOperation = 'source-over';
  compose(cc, t);
  const c = ctxOf(main); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
  const amp = shakeAt(t);
  if (amp > 0.4) {
    const [sx, sy] = K.shakeXY(t, amp), z = 1 + (2 * amp + 6) / W;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2 + sx, H / 2 + sy); c.rotate(sx * 0.0004); c.scale(z, z); c.drawImage(bufC, -W / 2, -H / 2); c.restore();
  } else c.drawImage(bufC, 0, 0);
  K.speedLines(c, W, H, t, linesAt(t) * 0.8);
  const f = flashAt(t);
  if (f > 0.003) { c.fillStyle = `rgba(255,255,255,${Math.min(1, f)})`; c.fillRect(0, 0, W, H); }
  // UK advertising rules (ASA/CAP): the random-items notice stays on screen while the Capsule Machine and its toys are shown, not only at the end
  if (t >= SEC.crank[0] && t < SEC.crank[1]) {
    const a = clamp((t - SEC.crank[0]) / 0.15) * clamp((SEC.crank[1] - t) / 0.15);
    c.save(); c.globalAlpha = a; c.font = K.font(30, 600); c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = Math.min(1000, c.measureText(PURCHASE_NOTICE).width + 44);
    c.fillStyle = 'rgba(27,17,69,.78)'; c.beginPath(); c.roundRect(540 - w / 2, 1508, w, 52, 26); c.fill();
    c.fillStyle = '#ffffff'; c.fillText(PURCHASE_NOTICE, 540, 1535, 970); c.restore();
  }
  if (debugSafe) {
    c.save(); c.strokeStyle = 'rgba(255,0,0,.8)'; c.lineWidth = 3; c.setLineDash([12, 10]);
    c.beginPath(); c.moveTo(0, H * 0.12); c.lineTo(W, H * 0.12); c.moveTo(0, H * 0.82); c.lineTo(W, H * 0.82); c.stroke(); c.restore();
  }
}
/** Dynamic SFX times that only the physics knows (capsule landings). Runs the machine sim through the drop. */
export function dynamicEvents() {
  machine.idx = null;
  machine.at(EV.open + 0.5);
  const out = machine.lands.map((l) => ({ t: l.t, i: l.i, tier: CAP_TIERS[l.i] }));
  machine.idx = null;
  return out;
}
