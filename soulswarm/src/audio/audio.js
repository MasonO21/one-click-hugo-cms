/*
 * SOULSWARM — procedural audio (Web Audio API only, no files, no deps).
 *
 * Every sound effect and all three music tracks are synthesised at runtime. The only recorded audio is the voice:
 * short announcer and hero lines (src/assets/voice, VOICE in data.js), decoded once after the first gesture.
 *
 * Graph:
 *   sfx voices ──► sfxBus ─────────────┐
 *   music ──► track gain ──► musicBus ──► musicDuck ──► bed (ducked under a voice line) ──► limiter ──► master(mute) ──► out
 *   big sounds / pads ──► sfxRev | musRev ──► shared convolver ──┘                            ▲
 *   voice line ──► voiceBus ────────────────────────────────────────────────────────────────┘
 *
 * The rest of the game only talks to the exported `Audio` object.
 */

import { VOICE } from '../game/data.js';

// ---------------------------------------------------------------- utils --
const noop = () => {};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rand = (a, b) => a + Math.random() * (b - a);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const semis = (p) => 12 * Math.log2(p); // pitch multiplier -> semitone shift
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const hasWin = typeof window !== 'undefined';
const hasDoc = typeof document !== 'undefined';
const isHidden = () => hasDoc && !!document.hidden;
const disc = (n) => { try { n && n.disconnect(); } catch (e) { /* already gone */ } };
const settle = (fn) => { try { const r = fn(); if (r && r.catch) r.catch(noop); return Promise.resolve(r).catch(noop); } catch (e) { return Promise.resolve(); } };

// ---------------------------------------------------------------- state --
const LOOKAHEAD = 0.12;   // seconds of music scheduled ahead
const TICK_MS = 25;       // scheduler wake-up interval
const XFADE = 1.0;        // music crossfade length (s)
const MAX_VOICES = 28;    // global cap for small sfx (big moments bypass it)

let ctx = null;
let master, limiter, bed, sfxBus, musicBus, musicDuck, sfxRev, musRev, voiceBus;
let whiteBuf, brownBuf;    // cached noise buffers (2 s each)
const curves = {};         // cached WaveShaper curves, keyed by drive
const vol = { music: 0.45, sfx: 0.8, voice: 0.9 };
let isMuted = false;
let unlocked = false;
let listening = false;
let timer = null;
let resumeReq = -1e9;      // ms timestamp of the last resume() request
const players = [];        // live music players (two while crossfading)
let current = null;        // player for the requested track
let wanted = null;         // requested track (survives calls made before init)
const allEnds = [];        // end times of every live sfx voice

// ------------------------------------------------------------ node kit --
function gain(v, dest) {
  const g = ctx.createGain();
  g.gain.value = v;
  if (dest) g.connect(dest);
  return g;
}

function filt(dest, type, f, q = 1) {
  const n = ctx.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  n.connect(dest);
  return n;
}

// Disconnect extra nodes once a source has finished.
function after(src, ...nodes) {
  const prev = src.onended;
  src.onended = (e) => { if (prev) prev(e); nodes.forEach(disc); };
}

// Click-free exponential attack / hold / decay envelope.
function adEnv(param, t, v, a, d, h = 0) {
  v = Math.max(v, 0.0002);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(v, t + a);
  if (h > 0) param.setValueAtTime(v, t + a + h);
  param.exponentialRampToValueAtTime(0.0001, t + a + h + d);
}

// One oscillator voice. o: { type, f, to, glide, a, h, d, v, det }
function tone(dest, t, o) {
  const osc = ctx.createOscillator(), g = ctx.createGain();
  const a = o.a || 0.004, h = o.h || 0, d = o.d || 0.2, end = t + a + h + d;
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t + (o.glide || a + h + d));
  if (o.det) osc.detune.setValueAtTime(o.det, t);
  adEnv(g.gain, t, o.v == null ? 0.3 : o.v, a, d, h);
  osc.connect(g);
  g.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  osc.onended = () => { disc(osc); disc(g); };
  return osc;
}

// Filtered noise burst from a cached buffer. o: { buf, type, f, to, q, a, h, d, v }
function noise(dest, t, o) {
  const buf = o.buf || whiteBuf, src = ctx.createBufferSource(), g = ctx.createGain();
  const a = o.a || 0.002, h = o.h || 0, d = o.d || 0.1, end = t + a + h + d;
  const flt = filt(g, o.type || 'bandpass', o.f || 1000, o.q || 1);
  if (o.to) {
    flt.frequency.setValueAtTime(o.f || 1000, t);
    flt.frequency.exponentialRampToValueAtTime(o.to, end);
  }
  src.buffer = buf;
  src.loop = true;
  adEnv(g.gain, t, o.v == null ? 0.3 : o.v, a, d, h);
  src.connect(flt);
  g.connect(dest);
  src.start(t, Math.random() * (buf.duration - 0.25)); // random offset = free variation
  src.stop(end + 0.02);
  src.onended = () => { disc(src); disc(flt); disc(g); };
}

// tanh drive curve, built once per drive amount.
function curve(k) {
  if (curves[k]) return curves[k];
  const n = 1024, c = new Float32Array(n), norm = Math.tanh(k);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(k * (i * 2 / n - 1)) / norm;
  return (curves[k] = c);
}

// WaveShaper -> lowpass -> level -> dest. Returns the input node.
// (tanh output is ~full scale whatever goes in, so `level` sets the real loudness.)
function distort(dest, k, cut, level = 1) {
  const ws = ctx.createWaveShaper();
  ws.curve = curve(k);
  ws.oversample = '2x';
  ws.connect(filt(gain(level, dest), 'lowpass', cut, 0.7));
  return ws;
}

// Amplitude tremolo stage: returns an input gain wobbling at `rate` Hz.
function tremolo(dest, t, end, rate, depth) {
  const g = gain(1 - depth, dest), lfo = ctx.createOscillator(), lg = gain(depth);
  lfo.frequency.setValueAtTime(rate, t);
  lfo.connect(lg);
  lg.connect(g.gain);
  lfo.start(t);
  lfo.stop(end);
  lfo.onended = () => { disc(lfo); disc(lg); };
  return { node: g, lfo };
}

// ---------------------------------------------------------- instruments --
// FM bell: sine carrier, inharmonic 3.5x modulator with a fast-decaying index.
function bell(dest, t, f, v = 0.1, len = 2.2) {
  const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
  c.frequency.value = f;
  m.frequency.value = f * 3.5;
  mg.gain.setValueAtTime(f * 2.2, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.04, t + len * 0.6);
  m.connect(mg);
  mg.connect(c.frequency);
  c.connect(g);
  g.connect(dest);
  adEnv(g.gain, t, v, 0.003, len);
  c.start(t); m.start(t);
  c.stop(t + len + 0.05); m.stop(t + len + 0.05);
  after(c, c, m, mg, g);
}

// Filtered pluck for arpeggios.
function pluck(dest, t, midi, len, type = 'sawtooth', v = 0.06, cut = 2600) {
  const f = filt(dest, 'lowpass', cut, 3);
  f.frequency.setValueAtTime(cut, t);
  f.frequency.exponentialRampToValueAtTime(cut * 0.2, t + len);
  after(tone(f, t, { type, f: mtof(midi), a: 0.003, d: len, v }), f);
}

// Synthwave lead: saw + square with vibrato.
function lead(dest, t, midi, len, v = 0.05) {
  const hz = mtof(midi), f = filt(dest, 'lowpass', 2800, 2);
  const vib = ctx.createOscillator(), vg = gain(hz * 0.012);
  vib.frequency.value = 5.5;
  vib.connect(vg);
  const a = tone(f, t, { type: 'sawtooth', f: hz, a: 0.02, h: len * 0.6, d: len * 0.5, v });
  const b = tone(f, t, { type: 'square', f: hz, det: 7, a: 0.02, h: len * 0.6, d: len * 0.5, v: v * 0.5 });
  vg.connect(a.frequency);
  vg.connect(b.frequency);
  vib.start(t + 0.08);
  vib.stop(t + len * 1.2);
  after(a, f, vib, vg);
}

// Brass stab: detuned saws through a "blat" filter envelope.
function brass(dest, t, midi, len, v = 0.07) {
  const f = filt(dest, 'lowpass', 600, 1.5), fr = f.frequency;
  fr.setValueAtTime(600, t);
  fr.linearRampToValueAtTime(3400, t + 0.06);
  fr.exponentialRampToValueAtTime(1300, t + 0.06 + len);
  tone(f, t, { type: 'sawtooth', f: mtof(midi), det: -7, a: 0.025, h: len, d: 0.3, v });
  after(tone(f, t, { type: 'sawtooth', f: mtof(midi), det: 7, a: 0.025, h: len, d: 0.3, v }), f);
}

// Gothic choir pad: detuned saws through a vowel formant bank.
const VOWELS = {
  ah: [[730, 5, 1.6], [1090, 6, 1.0], [2440, 8, 0.55]],
  oo: [[320, 5, 1.8], [870, 6, 0.7], [2240, 8, 0.3]],
};
function choir(dest, notes, t, len, o = {}) {
  const v = o.v || 0.1, a = o.a || 0.8, r = o.r || 1.5, det = o.det || 9;
  const end = t + len + r + 0.05, sum = gain(1), out = gain(0.0001, dest), ns = [sum, out];
  for (const [f, q, g] of VOWELS[o.vowel || 'ah']) {
    const fg = gain(g, out), bp = filt(fg, 'bandpass', f, q);
    sum.connect(bp);
    ns.push(fg, bp);
  }
  const bodyG = gain(0.28, out), body = filt(bodyG, 'lowpass', 650, 0); // warmth under the vowels
  sum.connect(body);
  ns.push(bodyG, body);
  const e = out.gain;
  e.setValueAtTime(0.0001, t);
  e.linearRampToValueAtTime(v, t + a);
  e.setValueAtTime(v, t + Math.max(len, a));
  e.linearRampToValueAtTime(0.0001, t + Math.max(len, a) + r);
  const lfo = ctx.createOscillator(), lg = gain(det * 0.7); // shared slow vibrato
  lfo.frequency.value = 4.8;
  lfo.connect(lg);
  ns.push(lfo, lg);
  for (const n of notes) {
    for (const s of [-1, 1]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(n);
      osc.detune.value = s * det + rand(-4, 4);
      lg.connect(osc.detune);
      osc.connect(sum);
      osc.start(t);
      osc.stop(end);
      osc.onended = () => disc(osc);
    }
  }
  lfo.start(t);
  lfo.stop(end);
  after(lfo, ...ns);
}

// Drums
function kick(dest, t, v = 0.9, f0 = 150, d = 0.3) {
  tone(dest, t, { f: f0, to: 42, glide: 0.11, a: 0.002, d, v });
  noise(dest, t, { type: 'highpass', f: 2500, d: 0.012, v: v * 0.2 });
}
function snare(dest, t, v = 0.3) {
  noise(dest, t, { type: 'bandpass', f: 2200, q: 0.8, d: 0.16, v });
  tone(dest, t, { type: 'triangle', f: 200, to: 140, d: 0.09, v: v * 0.8 });
}
function hat(dest, t, v = 0.06, open = false) {
  noise(dest, t, { type: 'highpass', f: 7500, d: open ? 0.16 : 0.035, v });
}
function tom(dest, t, f, v = 0.5) {
  tone(dest, t, { f, to: f * 0.55, d: 0.32, v });
  noise(dest, t, { type: 'lowpass', f: 1200, d: 0.07, v: v * 0.3 });
}
function bassNote(dest, t, midi, len, v = 0.2, cut = 1500) {
  const hz = mtof(midi), f = filt(dest, 'lowpass', cut, 7);
  f.frequency.setValueAtTime(cut, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(cut * 0.12, 60), t + len);
  tone(f, t, { type: 'square', f: hz, det: -8, a: 0.003, h: len * 0.4, d: len * 0.6, v: v * 0.5 });
  after(tone(f, t, { type: 'sawtooth', f: hz, a: 0.003, h: len * 0.4, d: len * 0.6, v }), f);
}

// ------------------------------------------------------------- SFX book --
// Each recipe: play(out, t, pitch) -> duration in seconds.
// gap = min retrigger interval (ms), max = voices of this sound, vary = random pitch +/-,
// vol = base level, rev = reverb send, big = bypasses global cap, duck = [music level, hold s].
const SFX = {
  // ---- frequent combat sounds: rate limited, pitch jittered ----
  shoot: { gap: 45, max: 5, vary: 0.06, vol: 0.4, play(o, t, p) {
    tone(o, t, { type: 'triangle', f: 1300 * p, to: 420 * p, d: 0.08, v: 0.4 });
    tone(o, t, { f: 2600 * p, to: 1400 * p, d: 0.035, v: 0.1 });
    noise(o, t, { type: 'highpass', f: 5000, d: 0.025, v: 0.06 });
    return 0.1;
  } },
  hit: { gap: 35, max: 6, vary: 0.06, vol: 0.5, play(o, t, p) {
    noise(o, t, { type: 'bandpass', f: 1700 * p, q: 1.1, d: 0.045, v: 0.55 });
    tone(o, t, { f: 240 * p, to: 110 * p, d: 0.06, v: 0.45 });
    return 0.08;
  } },
  kill: { gap: 45, max: 5, vary: 0.06, vol: 0.5, play(o, t, p) {
    noise(o, t, { type: 'lowpass', f: 5000 * p, to: 350, d: 0.14, v: 0.5 });
    tone(o, t, { type: 'triangle', f: 480 * p, to: 80 * p, d: 0.14, v: 0.35 });
    tone(o, t, { type: 'square', f: 150 * p, to: 55 * p, d: 0.07, v: 0.1 });
    return 0.18;
  } },
  raise: { gap: 80, max: 3, vary: 0.05, vol: 0.65, rev: 0.25, play(o, t, p) {
    // root / fifth / octave, each a beating pair (the shimmer), all gliding up an octave
    for (const k of [0, 7, 12]) {
      const f = 392 * p * Math.pow(2, k / 12);
      for (const det of [-12, 12]) tone(o, t + k * 0.006, { f, to: f * 2, glide: 0.5, a: 0.08, d: 0.45, v: 0.07, det });
    }
    tone(o, t, { type: 'triangle', f: 196 * p, to: 392 * p, a: 0.05, d: 0.35, v: 0.08 });
    noise(o, t, { type: 'bandpass', f: 1200 * p, to: 7000 * p, q: 5, a: 0.12, d: 0.35, v: 0.2 });
    return 0.65;
  } },
  gem: { gap: 25, max: 6, vary: 0.03, vol: 0.45, play(o, t, p) {
    tone(o, t, { f: 1480 * p, to: 2100 * p, glide: 0.03, d: 0.07, v: 0.3 });
    tone(o, t, { type: 'triangle', f: 2960 * p, d: 0.04, v: 0.06 });
    return 0.09;
  } },
  coin: { gap: 45, max: 4, vary: 0.02, vol: 0.55, play(o, t, p) {
    const f = filt(o, 'lowpass', 6000, 0.7);
    tone(f, t, { type: 'square', f: 988 * p, h: 0.05, d: 0.03, v: 0.2 });
    tone(f, t + 0.07, { type: 'square', f: 1319 * p, h: 0.06, d: 0.35, v: 0.2 });
    return 0.5;
  } },
  explosion: { gap: 60, max: 4, vary: 0.08, vol: 0.75, rev: 0.25, play(o, t, p) {
    noise(o, t, { type: 'lowpass', f: 7000 * p, to: 180, q: 0.7, d: 0.6, v: 0.6 });
    tone(o, t, { f: 120 * p, to: 34, glide: 0.35, d: 0.45, v: 0.7 });
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 600, a: 0.005, h: 0.05, d: 0.8, v: 0.5 });
    return 1.0;
  } },
  hurt: { gap: 120, max: 2, vary: 0.04, vol: 0.8, play(o, t, p) {
    const f = filt(o, 'lowpass', 1400, 4);
    tone(f, t, { type: 'sawtooth', f: 240 * p, to: 80 * p, glide: 0.22, d: 0.24, v: 0.35 });
    tone(f, t, { type: 'square', f: 254 * p, to: 84 * p, glide: 0.22, d: 0.2, v: 0.18 });
    noise(o, t, { type: 'lowpass', f: 1800, to: 300, d: 0.1, v: 0.4 });
    tone(o, t, { f: 120, to: 50, d: 0.15, v: 0.5 });
    return 0.32;
  } },

  // ---- UI ----
  click: { gap: 30, max: 3, vary: 0.03, vol: 0.6, play(o, t, p) {
    tone(o, t, { f: 1800 * p, to: 1200 * p, d: 0.03, v: 0.3 });
    noise(o, t, { type: 'highpass', f: 4000, d: 0.015, v: 0.12 });
    return 0.06;
  } },
  select: { gap: 80, max: 2, vary: 0.02, vol: 0.7, rev: 0.15, play(o, t, p) {
    tone(o, t, { type: 'triangle', f: 660 * p, d: 0.09, v: 0.25 });
    tone(o, t + 0.06, { type: 'triangle', f: 990 * p, h: 0.03, d: 0.22, v: 0.25 });
    tone(o, t + 0.06, { f: 1980 * p, d: 0.15, v: 0.06 });
    noise(o, t, { type: 'highpass', f: 5000, d: 0.05, v: 0.08 });
    return 0.35;
  } },
  heal: { gap: 200, max: 2, vary: 0.02, vol: 0.7, rev: 0.35, play(o, t, p) {
    [74, 78, 81, 86].forEach((n, k) => {
      const f = mtof(n) * p, s = t + k * 0.055;
      tone(o, s, { f, a: 0.02, h: 0.08, d: 0.5, v: 0.09, det: -6 });
      tone(o, s, { f, a: 0.02, h: 0.08, d: 0.5, v: 0.09, det: 6 });
    });
    noise(o, t, { type: 'bandpass', f: 2500, to: 6000, q: 2, a: 0.15, d: 0.4, v: 0.08 });
    return 0.9;
  } },
  levelup: { gap: 300, max: 2, vol: 0.85, rev: 0.45, big: true, play(o, t, p) {
    const sh = semis(p);
    [62, 66, 69, 74, 78, 81].forEach((n, k) => { // D major run up
      const s = t + k * 0.06, f = mtof(n + sh);
      tone(o, s, { type: 'square', f, h: 0.03, d: 0.16, v: 0.04 });
      tone(o, s, { type: 'triangle', f, h: 0.03, d: 0.3, v: 0.14 });
    });
    for (const n of [74, 78, 81, 86]) brass(o, t + 0.38, n + sh, 0.35, 0.045);
    bell(o, t + 0.38, mtof(86 + sh), 0.06, 1.4);
    noise(o, t + 0.38, { type: 'highpass', f: 7000, a: 0.08, d: 0.6, v: 0.08 });
    return 1.7;
  } },

  // ---- the hero moment: sub drop + blast + chained spectral detonations ----
  nova: { gap: 400, max: 2, vol: 1, rev: 0.75, big: true, duck: [0.2, 1.6], play(o, t, p) {
    tone(o, t, { f: 150 * p, to: 26, glide: 1.3, a: 0.005, h: 0.1, d: 1.6, v: 0.95 });
    tone(o, t, { type: 'triangle', f: 75 * p, to: 30, glide: 1.0, d: 1.2, v: 0.4 });
    tone(distort(o, 12, 1800, 0.3), t, { type: 'sawtooth', f: 110 * p, to: 35, glide: 0.6, d: 0.7, v: 0.5 });
    noise(o, t, { type: 'lowpass', f: 10000, to: 160, q: 0.8, d: 1.7, v: 0.75 });
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 500, to: 80, a: 0.02, h: 0.3, d: 2.4, v: 0.9 });
    for (let k = 1; k <= 5; k++) { // chain of minion detonations
      const s = t + k * 0.12 + rand(0, 0.05), lv = 0.5 / (1 + k * 0.4);
      tone(o, s, { f: rand(85, 110) * p, to: 38, d: 0.3, v: lv });
      noise(o, s, { type: 'lowpass', f: 4000, to: 300, d: 0.25, v: lv * 0.8 });
    }
    const bloom = filt(o, 'lowpass', 3500, 1); // spectral D5/A5 chord bloom
    bloom.frequency.setValueAtTime(3500, t);
    bloom.frequency.exponentialRampToValueAtTime(400, t + 2.4);
    for (const n of [62, 69, 74, 81]) tone(bloom, t + 0.04, { type: 'sawtooth', f: mtof(n) * p, det: rand(-12, 12), a: 0.02, d: 2.2, v: 0.04 });
    for (let k = 0; k < 10; k++) tone(o, t + 0.15 + k * 0.09, { f: rand(1800, 5200), d: 0.25, v: 0.05 });
    return 3.2;
  } },
  // the Nova wind-up: a 0.25 s inhale as the souls rush into the Shepherd (the drop above lands on its peak)
  nova_charge: { gap: 300, max: 1, vol: 0.85, rev: 0.45, big: true, play(o, t, p) {
    const L = 0.26;
    noise(o, t, { type: 'bandpass', f: 400 * p, to: 7000 * p, q: 2.2, a: L, d: 0.03, v: 0.4 });
    for (const det of [-12, 12]) tone(o, t, { type: 'sawtooth', f: 98 * p, to: 392 * p, glide: L, det, a: L * 0.9, d: 0.04, v: 0.07 });
    tone(o, t, { f: 196 * p, to: 1568 * p, glide: L, a: L * 0.85, d: 0.05, v: 0.12 });
    [62, 65, 69, 74, 77].forEach((n, k) => tone(o, t + k * 0.045, { type: 'triangle', f: mtof(n + 12) * p, d: 0.07, v: 0.035 }));
    return L + 0.1;
  } },
  // kill-streak tier: a stone thump, a D-minor brass stab and a bell, pitched up a step per tier (APOCALYPSE adds the choir)
  streak: { gap: 100, max: 2, vol: 0.75, rev: 0.4, big: true, play(o, t, p) {
    const sh = semis(p);
    tone(o, t, { f: 95 * p, to: 38, d: 0.28, v: 0.6 });
    noise(o, t, { type: 'bandpass', f: 1900 * p, to: 500, q: 1.1, d: 0.12, v: 0.28 });
    for (const n of [62, 65, 69]) brass(o, t + 0.015, n + sh, 0.16, 0.05);
    bell(o, t + 0.03, mtof(81 + sh), 0.07, 1.1);
    if (p > 1.9) choir(o, [62 + sh, 65 + sh, 69 + sh], t, 0.5, { vowel: 'ah', v: 0.12, a: 0.05, r: 0.8 });
    return 1.1;
  } },

  // ---- soul gates ----
  gate_good: { gap: 300, max: 2, vol: 0.8, rev: 0.35, big: true, play(o, t, p) {
    noise(o, t, { type: 'bandpass', f: 300, to: 5000, q: 1.8, a: 0.16, d: 0.32, v: 0.4 });
    [62, 66, 69, 74].forEach((n, k) => {
      const f = mtof(n) * p, s = t + 0.06 + k * 0.05;
      tone(o, s, { type: 'triangle', f: f * 0.75, to: f, glide: 0.12, a: 0.02, h: 0.18, d: 0.5, v: 0.14 });
      tone(o, s, { f: f * 2, a: 0.02, h: 0.1, d: 0.4, v: 0.04 });
    });
    return 1.0;
  } },
  gate_bad: { gap: 300, max: 2, vol: 0.8, rev: 0.3, big: true, play(o, t, p) {
    const f = filt(o, 'lowpass', 2400, 2);
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    for (const [n, det] of [[69, -30], [69, 30], [63, -25], [63, 25]]) { // tritone, smeared
      tone(f, t, { type: 'sawtooth', f: mtof(n) * p, to: mtof(n - 19) * p, glide: 0.75, det, a: 0.01, h: 0.1, d: 0.7, v: 0.09 });
    }
    noise(o, t, { type: 'bandpass', f: 3500, to: 250, q: 1.5, a: 0.03, d: 0.5, v: 0.25 });
    return 1.0;
  } },

  // ---- boss ----
  boss_roar: { gap: 800, max: 1, vol: 0.85, rev: 0.5, big: true, duck: [0.5, 1.2], play(o, t, p) {
    const L = 1.7, ws = distort(o, 20, 1400, 0.3);
    const fm = ctx.createOscillator(), fmg = gain(22); // ~31 Hz growl wobble
    fm.frequency.value = 31;
    fm.connect(fmg);
    for (const [r, det] of [[1, 0], [1.5, 12], [0.5, -5]]) {
      const osc = tone(ws, t, { type: 'sawtooth', f: 55 * r * p, to: 78 * r * p, glide: 0.45, a: 0.18, h: 0.7, d: 0.8, v: 0.3, det });
      osc.frequency.exponentialRampToValueAtTime(40 * r * p, t + L);
      fmg.connect(osc.frequency);
    }
    fm.start(t);
    fm.stop(t + L + 0.1);
    after(fm, fm, fmg);
    noise(o, t, { type: 'bandpass', f: 500, to: 220, q: 1.2, a: 0.2, h: 0.5, d: 0.9, v: 0.35 });
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 300, a: 0.15, h: 0.6, d: 0.9, v: 0.6 });
    return L + 0.4;
  } },
  boss_slam: { gap: 250, max: 2, vol: 1, rev: 0.45, big: true, duck: [0.55, 0.5], play(o, t, p) {
    tone(o, t, { f: 110 * p, to: 28, glide: 0.5, d: 0.9, v: 1 });
    tone(o, t, { type: 'square', f: 70 * p, to: 30, glide: 0.1, d: 0.12, v: 0.25 });
    noise(o, t, { type: 'lowpass', f: 3000, to: 90, d: 0.7, v: 0.8 });
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 260, a: 0.01, h: 0.2, d: 1.4, v: 0.8 });
    noise(o, t + 0.02, { type: 'bandpass', f: 1800, q: 2, d: 0.25, v: 0.15 }); // debris
    return 1.8;
  } },
  warning: { gap: 1200, max: 1, vol: 0.8, rev: 0.3, big: true, play(o, t, p) {
    for (let k = 0; k < 3; k++) { // three rising klaxon pulses
      const s = t + k * 0.45, f = filt(o, 'lowpass', 2600, 2);
      tone(f, s, { type: 'sawtooth', f: 440 * p, to: 660 * p, glide: 0.3, a: 0.01, h: 0.25, d: 0.12, v: 0.22 });
      tone(f, s, { type: 'square', f: 466 * p, to: 699 * p, glide: 0.3, a: 0.01, h: 0.25, d: 0.12, v: 0.1 });
      tone(o, s, { f: 90, to: 45, d: 0.35, v: 0.5 });
    }
    return 1.5;
  } },

  // ---- meta / rewards ----
  purchase: { gap: 300, max: 2, vol: 0.85, rev: 0.3, big: true, play(o, t, p) {
    noise(o, t, { type: 'highpass', f: 2500, d: 0.07, v: 0.35 });                  // "cha"
    noise(o, t + 0.1, { type: 'bandpass', f: 6500, q: 2.5, d: 0.4, v: 0.35 });     // "ching"
    [84, 88, 91, 96].forEach((n, k) => bell(o, t + 0.1 + k * 0.03, mtof(n) * p, 0.06, 1.2));
    for (let k = 0; k < 8; k++) tone(o, t + 0.2 + k * 0.055, { f: rand(2600, 6000) * p, d: 0.09, v: 0.05 });
    return 1.5;
  } },
  chest: { gap: 400, max: 1, vol: 0.85, rev: 0.4, big: true, play(o, t, p) {
    const sh = semis(p), cr = filt(o, 'bandpass', 700, 6);
    tone(cr, t, { type: 'sawtooth', f: 70, to: 120, glide: 0.25, a: 0.03, d: 0.25, v: 0.5 }); // creak
    tone(o, t + 0.24, { f: 180, to: 60, d: 0.14, v: 0.45 });                                 // latch
    noise(o, t + 0.24, { type: 'lowpass', f: 2500, d: 0.08, v: 0.3 });
    const s = t + 0.32; // short-short-long fanfare
    brass(o, s, 69 + sh, 0.07, 0.07);
    brass(o, s + 0.12, 69 + sh, 0.07, 0.07);
    for (const n of [62, 66, 69, 74]) brass(o, s + 0.24, n + sh, 0.7, 0.05);
    for (let k = 0; k < 10; k++) tone(o, s + 0.24 + k * 0.06, { type: 'triangle', f: mtof(86 + [0, 4, 7, 12][k % 4] + sh), d: 0.15, v: 0.04 });
    return 1.8;
  } },
  victory: { gap: 2000, max: 1, vol: 0.9, rev: 0.5, big: true, play(o, t) {
    const seq = [[0, [58, 62, 65], 0.16], [0.22, [60, 64, 67], 0.16], [0.44, [62, 66, 69, 74], 1.4]]; // Bb – C – D
    for (const [dt, notes, len] of seq) for (const n of notes) brass(o, t + dt, n, len, 0.055);
    tone(o, t + 0.44, { f: 110, to: 40, d: 0.6, v: 0.6 });
    [74, 78, 81, 86, 90].forEach((n, k) => bell(o, t + 0.5 + k * 0.1, mtof(n), 0.07, 1.6));
    noise(o, t + 0.44, { type: 'highpass', f: 6000, a: 0.3, d: 1.2, v: 0.08 });
    return 3.2;
  } },
  defeat: { gap: 2000, max: 1, vol: 0.9, rev: 0.5, big: true, play(o, t) {
    [69, 67, 65, 62].forEach((n, k) => { // A G F D, falling
      tone(o, t + k * 0.38, { type: 'triangle', f: mtof(n), a: 0.02, h: 0.15, d: 0.6, v: 0.16 });
      tone(o, t + k * 0.38, { f: mtof(n), det: 14, a: 0.02, h: 0.15, d: 0.6, v: 0.06 });
    });
    const f = filt(o, 'lowpass', 500, 1);
    for (const det of [-14, 14]) tone(f, t, { type: 'sawtooth', f: mtof(38), det, a: 0.4, h: 1.2, d: 1.6, v: 0.09 });
    choir(o, [50, 53, 57], t + 1.3, 0.6, { vowel: 'oo', v: 0.12, a: 0.4, r: 1.4 });
    return 3.6;
  } },
  summon: { gap: 500, max: 1, vol: 0.85, rev: 0.4, big: true, play(o, t, p) {
    const L = 1.5, tr = tremolo(o, t, t + L + 0.2, 5, 0.45);
    tr.lfo.frequency.exponentialRampToValueAtTime(28, t + L); // tremolo accelerates
    const f = filt(tr.node, 'lowpass', 300, 9);
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + L);
    for (const det of [0, 25]) tone(f, t, { type: 'sawtooth', f: 110 * p, to: 880 * p, glide: L, det, a: 0.3, h: L - 0.35, d: 0.15, v: 0.25 });
    noise(o, t, { type: 'bandpass', f: 400, to: 9000, q: 3, a: L, d: 0.08, v: 0.3 });
    bell(o, t + L, mtof(86) * p, 0.12, 1.0);
    tone(o, t + L, { f: mtof(93) * p, d: 0.5, v: 0.08 });
    return L + 1.2;
  } },
  legendary: { gap: 1000, max: 1, vol: 1, rev: 0.8, big: true, duck: [0.15, 2.8], play(o, t, p) {
    const sh = semis(p);
    tone(o, t, { f: 130, to: 32, glide: 0.9, d: 1.2, v: 0.85 });
    noise(o, t, { type: 'lowpass', f: 9000, to: 200, d: 1.1, v: 0.5 });
    const f = filt(o, 'lowpass', 300, 2); // huge D-major(add9) bloom through an opening filter
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 0.9);
    f.frequency.exponentialRampToValueAtTime(1500, t + 3.6);
    for (const n of [38, 50, 57, 62, 66, 69, 74, 76, 78, 81]) {
      for (const d of [-10, 10]) tone(f, t, { type: 'sawtooth', f: mtof(n + sh), det: d + rand(-4, 4), a: 0.5, h: 1.0, d: 2.2, v: 0.028 });
    }
    const tr = tremolo(o, t, t + 3.6, 9, 0.4); // glassy shimmer
    for (const n of [86, 90, 93, 98]) tone(tr.node, t + 0.3, { f: mtof(n + sh), a: 0.4, h: 1.2, d: 1.6, v: 0.05 });
    const PENT = [86, 88, 90, 93, 95, 98, 100, 102]; // D major pentatonic sparkles
    for (let k = 0; k < 20; k++) {
      tone(o, t + 0.25 + k * 0.11 + rand(0, 0.05), { type: 'triangle', f: mtof(PENT[(Math.random() * PENT.length) | 0] + sh), d: 0.3, v: 0.05 });
    }
    bell(o, t + 0.05, mtof(74 + sh), 0.15, 3);
    return 4.6;
  } },

  // ---- horde moves (gameplay update) ----
  lunge: { gap: 90, max: 3, vary: 0.08, vol: 0.5, play(o, t, p) { // a Ghoul springs: rasping hiss sweeping up
    noise(o, t, { type: 'bandpass', f: 900 * p, to: 4200 * p, q: 3, a: 0.02, d: 0.22, v: 0.45 });
    tone(o, t, { type: 'sawtooth', f: 160 * p, to: 420 * p, d: 0.16, v: 0.08 });
    return 0.25;
  } },
  growl: { gap: 250, max: 2, vary: 0.06, vol: 0.55, play(o, t, p) { // a Brute rears back: low growl rising into the slam
    const f = filt(o, 'lowpass', 260, 4);
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(900, t + 0.9);
    for (const det of [-18, 18]) tone(f, t, { type: 'sawtooth', f: 55 * p, to: 82 * p, glide: 0.9, det, a: 0.15, h: 0.6, d: 0.25, v: 0.22 });
    noise(o, t, { type: 'lowpass', f: 400, to: 1200, a: 0.3, d: 0.6, v: 0.12 });
    return 1.0;
  } },
  slam: { gap: 120, max: 3, vary: 0.05, vol: 0.7, rev: 0.15, play(o, t, p) { // the Brute's fists hit stone
    tone(o, t, { f: 95 * p, to: 32, d: 0.4, v: 0.75 });
    noise(o, t, { type: 'lowpass', f: 2200, to: 180, d: 0.35, v: 0.55 });
    noise(o, t + 0.02, { type: 'bandpass', f: 600, q: 0.8, d: 0.18, v: 0.3 }); // gravel
    return 0.45;
  } },
  lob: { gap: 110, max: 3, vary: 0.07, vol: 0.45, play(o, t, p) { // a Witch hurls fire: whoompf
    noise(o, t, { type: 'lowpass', f: 300 * p, to: 1800 * p, a: 0.03, d: 0.25, v: 0.45 });
    tone(o, t, { type: 'triangle', f: 180 * p, to: 360 * p, d: 0.2, v: 0.12 });
    return 0.3;
  } },
  lob_land: { gap: 90, max: 4, vary: 0.08, vol: 0.5, play(o, t, p) { // fire splashes onto the ground and crackles
    noise(o, t, { type: 'bandpass', f: 1100 * p, to: 220, q: 0.9, d: 0.3, v: 0.5 });
    tone(o, t, { f: 140 * p, to: 50, d: 0.22, v: 0.35 });
    for (let k = 0; k < 4; k++) noise(o, t + 0.05 + k * 0.045, { type: 'highpass', f: 3500, d: 0.03, v: 0.12 });
    return 0.35;
  } },

  // ---- the legion ----
  soul_bomb: { gap: 140, max: 3, vary: 0.05, vol: 0.7, rev: 0.35, play(o, t, p) { // implosion, then a spectral boom
    tone(o, t, { f: 300 * p, to: 1500 * p, glide: 0.22, a: 0.02, d: 0.24, v: 0.12 });
    noise(o, t, { type: 'bandpass', f: 6000, to: 800, q: 4, a: 0.2, d: 0.05, v: 0.2 });
    const b = t + 0.24;
    tone(o, b, { f: 110 * p, to: 30, d: 0.55, v: 0.8 });
    noise(o, b, { type: 'lowpass', f: 7000, to: 300, d: 0.5, v: 0.55 });
    for (const det of [-12, 12]) tone(o, b, { f: 523 * p, to: 262 * p, det, a: 0.005, d: 0.6, v: 0.06 }); // ghostly ring-out
    return 0.9;
  } },
  champion: { gap: 400, max: 1, vol: 0.7, rev: 0.45, play(o, t, p) { // a gilded soul rises: bright rising chime
    [74, 78, 81, 86].forEach((n, k) => bell(o, t + k * 0.06, mtof(n) * p, 0.07, 1.4));
    noise(o, t, { type: 'highpass', f: 7000, a: 0.2, d: 0.6, v: 0.06 });
    return 1.4;
  } },

  // ---- the bosses' arena ----
  arena: { gap: 1000, max: 1, vol: 0.85, rev: 0.6, big: true, play(o, t) { // the rune seal closes: drone swells under a ring of bells
    const f = filt(o, 'lowpass', 200, 3);
    f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
    for (const det of [-9, 0, 9]) tone(f, t, { type: 'sawtooth', f: mtof(38), det, a: 0.6, h: 0.6, d: 1.0, v: 0.08 });
    [62, 65, 69, 74, 77, 81].forEach((n, k) => bell(o, t + k * 0.2, mtof(n), 0.06, 1.6));
    return 2.4;
  } },
  wall: { gap: 160, max: 2, vary: 0.1, vol: 0.45, play(o, t, p) { // rune wall pushes back: electric zap
    noise(o, t, { type: 'bandpass', f: 4200 * p, q: 6, d: 0.12, v: 0.4 });
    tone(o, t, { type: 'square', f: 1900 * p, to: 880 * p, d: 0.1, v: 0.06 });
    return 0.15;
  } },
  phase: { gap: 1500, max: 1, vol: 0.9, rev: 0.7, big: true, duck: [0.3, 1.6], play(o, t) { // a new phase: choir stab over a sub drop
    tone(o, t, { f: 80, to: 28, glide: 1.0, d: 1.3, v: 0.75 });
    choir(o, [50, 53, 57, 62], t, 1.4, { vowel: 'ah', v: 0.22, a: 0.04, r: 1.2 });
    for (const n of [38, 45, 50]) brass(o, t, n, 0.9, 0.05);
    noise(o, t, { type: 'lowpass', f: 6000, to: 250, d: 1.0, v: 0.35 });
    return 2.2;
  } },
  ward: { gap: 160, max: 2, vary: 0.05, vol: 0.4, rev: 0.3, play(o, t, p) { // hits ring off the boss's ward
    bell(o, t, mtof(93) * p, 0.06, 0.6);
    tone(o, t, { f: 2400 * p, d: 0.08, v: 0.05 });
    return 0.6;
  } },

  // ---- Hero Rites (game/rites.js): one signature sound per hero, plus the cooldown-ready cue ----
  rite_vael: { gap: 500, max: 1, vol: 0.9, rev: 0.6, big: true, duck: [0.45, 1.2], play(o, t, p) { // Grave Call: a funeral bell, and the dead answer
    tone(o, t, { f: 95 * p, to: 42, glide: 0.6, d: 0.8, v: 0.55 });
    bell(o, t, mtof(50) * p, 0.13, 2.6);
    choir(o, [62, 69, 74], t + 0.05, 1.1, { vowel: 'oo', v: 0.15, a: 0.35, r: 1.2 });
    [0, 7, 12, 19].forEach((k, i) => { // souls rising: beating pairs gliding up an octave
      const f = mtof(74 + k) * p;
      for (const det of [-10, 10]) tone(o, t + 0.12 + i * 0.07, { f: f * 0.5, to: f, glide: 0.9, a: 0.25, d: 0.8, v: 0.035, det });
    });
    noise(o, t, { type: 'bandpass', f: 500, to: 6500, q: 4, a: 0.7, d: 0.5, v: 0.16 });
    return 2.6;
  } },
  rite_nyx: { gap: 150, max: 2, vary: 0.04, vol: 1, rev: 0.3, play(o, t, p) { // Shadow Step: the air tears, the scythe rings
    noise(o, t, { type: 'bandpass', f: 400 * p, to: 5200 * p, q: 2.2, a: 0.03, d: 0.2, v: 0.75 });
    noise(o, t + 0.04, { buf: brownBuf, type: 'lowpass', f: 900, to: 200, d: 0.25, v: 0.45 });
    tone(o, t, { f: 180 * p, to: 55, d: 0.2, v: 0.6 });
    tone(distort(o, 6, 2400, 0.12), t, { type: 'sawtooth', f: 90 * p, to: 360 * p, glide: 0.18, d: 0.2, v: 0.4 });
    const s = t + 0.17;
    for (const [r, v] of [[1, 0.11], [2.76, 0.06], [5.4, 0.035]]) tone(o, s, { f: 1250 * r * p, to: 1150 * r * p, a: 0.002, d: 0.5, v });
    noise(o, s, { type: 'highpass', f: 6000, d: 0.08, v: 0.18 });
    return 0.8;
  } },
  rite_seraphine: { gap: 500, max: 1, vol: 0.9, rev: 0.55, big: true, duck: [0.45, 1.0], play(o, t, p) { // Ashfall: a hymn, a fire, chains striking one after another
    choir(o, [57, 64, 69, 73], t, 0.5, { vowel: 'ah', v: 0.16, a: 0.03, r: 1.0 });
    noise(o, t, { type: 'lowpass', f: 300, to: 3200, a: 0.25, d: 0.9, v: 0.32 });
    for (let k = 0; k < 12; k++) {
      const s = t + 0.05 + k * 0.042 + rand(0, 0.015);
      noise(o, s, { type: 'bandpass', f: rand(2500, 5000) * p, q: 3, d: 0.05, v: 0.2 });
      tone(o, s, { type: 'square', f: rand(700, 1100) * p, to: 300 * p, d: 0.05, v: 0.035 });
      if (k % 3 === 0) tone(o, s, { f: 140 * p, to: 50, d: 0.18, v: 0.28 });
    }
    [81, 85, 88].forEach((n, k) => bell(o, t + 0.1 + k * 0.08, mtof(n) * p, 0.045, 1.2));
    return 1.8;
  } },
  rite_liora: { gap: 600, max: 1, vol: 0.8, rev: 0.8, big: true, duck: [0.3, 1.6], play(o, t, p) { // Death Knell: the great bell
    tone(o, t, { f: 70 * p, to: 32, glide: 1.2, d: 1.6, v: 0.75 });
    bell(o, t, mtof(41) * p, 0.22, 3.4);
    bell(o, t, mtof(53) * p, 0.11, 3.0);
    bell(o, t + 0.005, mtof(60) * p * 1.003, 0.06, 2.4);
    for (const det of [-6, 6]) tone(o, t, { type: 'triangle', f: mtof(41) * p, det, a: 0.004, d: 3.0, v: 0.1 }); // the hum note
    noise(o, t, { type: 'bandpass', f: 1800, to: 400, q: 1.2, d: 0.6, v: 0.22 }); // clang
    choir(o, [53, 57, 60], t + 0.25, 1.0, { vowel: 'oo', v: 0.08, a: 0.5, r: 1.3 });
    return 3.6;
  } },
  rite_mordrake: { gap: 500, max: 1, vol: 0.95, rev: 0.45, big: true, duck: [0.5, 0.9], play(o, t, p) { // Ossuary Wall: the earth heaves and bone splinters up
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 220, a: 0.03, h: 0.3, d: 0.9, v: 0.85 });
    tone(o, t, { f: 75 * p, to: 30, glide: 0.5, d: 0.7, v: 0.65 });
    for (let k = 0; k < 14; k++) {
      const s = t + 0.04 + k * 0.022 + rand(0, 0.012);
      noise(o, s, { type: 'bandpass', f: rand(1400, 3200) * p, q: 4, d: 0.035, v: 0.32 });
      tone(o, s, { type: 'triangle', f: rand(350, 600) * p, to: 120, d: 0.06, v: 0.11 });
    }
    for (const n of [38, 45, 50]) brass(o, t + 0.05, n + semis(p), 0.6, 0.045);
    return 1.6;
  } },
  rite_grimsby: { gap: 400, max: 1, vol: 0.9, rev: 0.35, big: true, duck: [0.5, 0.8], play(o, t, p) { // Hallowfire: a lantern bursts, witchfire roars up, a cackle
    noise(o, t, { type: 'bandpass', f: 300 * p, to: 4200 * p, q: 0.9, a: 0.02, d: 0.55, v: 0.6 }); // the whoosh
    noise(o, t + 0.05, { buf: brownBuf, type: 'lowpass', f: 1400, to: 300, a: 0.05, h: 0.4, d: 0.7, v: 0.45 }); // the roar
    for (let k = 0; k < 16; k++) noise(o, t + 0.08 + k * 0.045 + rand(0, 0.02), { type: 'highpass', f: rand(3000, 7000), d: 0.02, v: 0.12 }); // crackle
    tone(o, t, { f: 120 * p, to: 45, glide: 0.4, d: 0.5, v: 0.5 });
    [0, 1, 2, 3].forEach((k) => tone(distort(o, 3, 2600, 0.1), t + 0.18 + k * 0.11, { type: 'sawtooth', f: (330 - k * 25) * p, to: (250 - k * 25) * p, a: 0.01, d: 0.09, v: 0.12 })); // heh-heh-heh
    return 1.2;
  } },
  rite_osric: { gap: 500, max: 1, vol: 0.9, rev: 0.7, big: true, duck: [0.4, 1.4], play(o, t, p) { // Bone Mass: an organ chord, a choir of monks, bones rattling up
    for (const n of [36, 43, 48, 55]) brass(o, t, n + semis(p), 1.4, 0.05); // the organ
    choir(o, [48, 55, 60, 64], t + 0.06, 1.3, { vowel: 'ah', v: 0.16, a: 0.25, r: 1.2 });
    bell(o, t, mtof(48) * p, 0.12, 2.8);
    for (let k = 0; k < 18; k++) { const s = t + 0.1 + k * 0.03 + rand(0, 0.02); noise(o, s, { type: 'bandpass', f: rand(1800, 3600) * p, q: 5, d: 0.03, v: 0.18 }); } // bones
    tone(o, t, { f: 80 * p, to: 40, glide: 0.8, d: 1.0, v: 0.45 });
    return 2.8;
  } },
  rite_isolde: { gap: 500, max: 1, vol: 0.9, rev: 0.6, big: true, duck: [0.4, 1.2], play(o, t, p) { // Crimson Sabbath: a heartbeat, a dark choir swells, a storm of bat wings
    tone(o, t, { f: 72 * p, to: 40, glide: 0.25, d: 0.32, v: 0.55 }); tone(o, t + 0.26, { f: 64 * p, to: 36, glide: 0.25, d: 0.32, v: 0.45 }); // lub-dub
    choir(o, [45, 48, 52, 57], t + 0.12, 1.2, { vowel: 'oo', v: 0.15, a: 0.2, r: 1.0 }); // a minor chord in the dark
    bell(o, t + 0.12, mtof(57) * p, 0.06, 2.2);
    for (let k = 0; k < 22; k++) { const s = t + 0.14 + k * 0.035 + rand(0, 0.02); noise(o, s, { type: 'bandpass', f: rand(500, 1300) * p, q: 2, d: 0.05, v: 0.16 }); } // wings
    noise(o, t, { buf: brownBuf, type: 'lowpass', f: 900, to: 200, a: 0.05, d: 0.9, v: 0.3 });
    return 2.4;
  } },
  rite_ready: { gap: 800, max: 1, vol: 0.75, rev: 0.4, play(o, t, p) { // the Rite is ready again: a soft rising chime
    [69, 76, 81].forEach((n, k) => tone(o, t + k * 0.07, { type: 'triangle', f: mtof(n) * p, a: 0.01, h: 0.04, d: 0.35, v: 0.12 }));
    bell(o, t + 0.14, mtof(88) * p, 0.04, 0.9);
    noise(o, t, { type: 'highpass', f: 6000, a: 0.1, d: 0.25, v: 0.05 });
    return 1.0;
  } },

  // ---- elite affixes and run events (affixes.js, events.js) ----
  ward_break: { gap: 200, max: 2, vary: 0.04, vol: 0.75, rev: 0.4, big: true, play(o, t, p) { // a soul ward shatters like glass
    noise(o, t, { type: 'highpass', f: 2800, d: 0.22, v: 0.35 });
    noise(o, t + 0.01, { type: 'bandpass', f: 7000 * p, to: 1800, q: 2, d: 0.45, v: 0.22 });
    for (let k = 0; k < 10; k++) tone(o, t + k * 0.022 + rand(0, 0.02), { f: rand(2200, 5600) * p, d: rand(0.1, 0.32), v: 0.055 }); // falling shards
    bell(o, t, mtof(88) * p, 0.07, 0.9);
    tone(o, t, { f: 170 * p, to: 48, d: 0.3, v: 0.55 }); // the thump under it
    return 1.0;
  } },
  splitter_pop: { gap: 120, max: 2, vary: 0.06, vol: 0.7, play(o, t, p) { // a wet pop, then the copies chirp out
    tone(o, t, { f: 720 * p, to: 110 * p, glide: 0.09, d: 0.13, v: 0.5 });
    noise(o, t, { type: 'lowpass', f: 1900, to: 280, d: 0.2, v: 0.45 });
    for (let k = 0; k < 3; k++) tone(o, t + 0.09 + k * 0.05, { type: 'triangle', f: (300 + k * 95) * p, to: (540 + k * 130) * p, d: 0.07, v: 0.16 });
    return 0.3;
  } },
  rout: { gap: 400, max: 1, vol: 0.65, rev: 0.3, play(o, t, p) { // the Commander falls: a sagging war-horn, a rattle of panic
    brass(o, t, 50, 0.28, 0.07);
    const f = filt(o, 'lowpass', 1600, 2);
    for (const det of [-14, 14]) tone(f, t + 0.05, { type: 'sawtooth', f: mtof(57) * p, to: mtof(45) * p, glide: 0.5, det, a: 0.02, h: 0.2, d: 0.35, v: 0.08 });
    for (let k = 0; k < 6; k++) noise(o, t + 0.1 + k * 0.05, { type: 'bandpass', f: rand(900, 1800), q: 3, d: 0.04, v: 0.12 });
    return 0.8;
  } },
  thief_appear: { gap: 800, max: 1, vol: 0.95, rev: 0.35, play(o, t, p) { // a jingle of stolen coin and a sly cackle
    const f = filt(o, 'lowpass', 6500, 0.7);
    [88, 91, 95, 100].forEach((n, k) => tone(f, t + k * 0.06, { type: 'square', f: mtof(n) * p, h: 0.03, d: 0.18, v: 0.08 }));
    for (let k = 0; k < 6; k++) tone(o, t + 0.05 + k * 0.045, { f: rand(3000, 6500), d: 0.08, v: 0.05 });
    for (let k = 0; k < 3; k++) { // "heh heh heh": formant blips falling in pitch
      const s = t + 0.32 + k * 0.11, bp = filt(o, 'bandpass', 1100, 4);
      tone(bp, s, { type: 'sawtooth', f: (330 - k * 30) * p, to: (250 - k * 25) * p, a: 0.01, d: 0.07, v: 0.45 });
    }
    return 0.8;
  } },
  thief_escape: { gap: 800, max: 1, vol: 1, rev: 0.4, play(o, t, p) { // a whoosh into nothing, the jingle fading away
    noise(o, t, { type: 'bandpass', f: 4500, to: 350, q: 2, a: 0.04, d: 0.55, v: 0.5 });
    tone(o, t, { type: 'triangle', f: 950 * p, to: 180 * p, glide: 0.5, d: 0.5, v: 0.24 });
    [95, 91, 88, 84].forEach((n, k) => tone(o, t + 0.12 + k * 0.08, { type: 'square', f: mtof(n) * p, d: 0.12, v: 0.05 / (1 + k * 0.6) }));
    return 0.8;
  } },
  shrine_chime: { gap: 500, max: 1, vol: 0.75, rev: 0.6, play(o, t, p) { // a ring of bells over a soft choir breath
    [62, 69, 74, 78, 81].forEach((n, k) => bell(o, t + k * 0.09, mtof(n) * p, 0.065, 2.0));
    choir(o, [62, 66, 69], t, 0.5, { vowel: 'ah', v: 0.05, a: 0.25, r: 0.9 });
    noise(o, t, { type: 'bandpass', f: 3000, to: 8000, q: 3, a: 0.3, d: 0.6, v: 0.06 });
    return 2.3;
  } },
  coffin_break: { gap: 500, max: 1, vol: 0.85, rev: 0.45, big: true, duck: [0.6, 0.6], play(o, t, p) { // wood splits, a boom, the dead groan out
    noise(o, t, { type: 'bandpass', f: 900, q: 0.9, d: 0.1, v: 0.6 });
    noise(o, t + 0.06, { type: 'bandpass', f: 1500, q: 1.2, d: 0.08, v: 0.45 });
    const cr = filt(o, 'bandpass', 600, 5); // the lid's creak
    tone(cr, t, { type: 'sawtooth', f: 85 * p, to: 140 * p, glide: 0.2, a: 0.02, d: 0.2, v: 0.4 });
    tone(o, t + 0.05, { f: 95 * p, to: 28, glide: 0.6, d: 0.8, v: 0.8 });
    noise(o, t + 0.05, { buf: brownBuf, type: 'lowpass', f: 400, a: 0.01, h: 0.1, d: 0.9, v: 0.55 });
    choir(o, [50, 51, 56], t + 0.12, 0.5, { vowel: 'oo', v: 0.09, a: 0.08, r: 0.8 });
    return 1.6;
  } },
};
for (const k in SFX) { SFX[k].last = -1e9; SFX[k].ends = []; }

// Drop finished end-times in place; returns live count.
function prune(arr, t) {
  let w = 0;
  for (let r = 0; r < arr.length; r++) if (arr[r] > t) arr[w++] = arr[r];
  arr.length = w;
  return w;
}

// Disconnect nodes once ctx time passes `end` (waits while the context is paused).
function release(end, ...nodes) {
  const check = () => {
    if (ctx && ctx.currentTime < end) { setTimeout(check, 250); return; }
    nodes.forEach(disc);
  };
  setTimeout(check, Math.max(0, (end - ctx.currentTime) * 1000));
}

// Briefly pull the music down under huge moments.
function duck(depth, hold) {
  const g = musicDuck.gain, t = ctx.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(depth, t + 0.04);
  g.setValueAtTime(depth, t + hold);
  g.linearRampToValueAtTime(1, t + hold + 1.0);
}

// True when the context is running, or a resume was just requested (first tap on iOS).
const canPlay = () => ctx && (ctx.state === 'running' || (ctx.state === 'suspended' && !isHidden() && nowMs() - resumeReq < 400));

function playSfx(name, opts) {
  try {
    if (!ctx || isMuted || !canPlay()) return;
    const def = SFX[name];
    if (!def) return;
    const ms = nowMs();
    if (ms - def.last < def.gap) return;                  // min retrigger interval
    const t = ctx.currentTime;
    const live = prune(def.ends, t), total = prune(allEnds, t);
    if (live >= def.max) return;                          // per-sound polyphony
    if (!def.big && total >= MAX_VOICES) return;          // global cap for small sounds
    const o = opts || {};
    const v = clamp(num(o.volume, 1), 0, 1) * def.vol / (1 + 0.15 * live); // dense bursts get quieter
    if (v < 0.001) return;
    def.last = ms;
    const vary = def.vary || 0;
    const p = clamp(num(o.pitch, 1), 0.25, 4) * (1 + rand(-vary, vary));
    const out = gain(v, sfxBus);
    const send = def.rev ? gain(def.rev, sfxRev) : null;
    if (send) out.connect(send);
    const start = t + 0.005;
    let end = start + 0.5;
    try { end = start + (def.play(out, start, p) || 0.5); } finally { release(end + 0.3, out, send); }
    def.ends.push(end);
    allEnds.push(end);
    if (def.duck && current) duck(def.duck[0], def.duck[1]);
  } catch (e) { /* audio must never break the game */ }
}

// ---------------------------------------------------------------- music --
// D minor throughout; chord voicings are MIDI notes, 16 sixteenth-steps per bar, 8-bar cycles.
const TRACKS = {
  menu: {
    bpm: 80,
    level: 0.7,
    chords: [[50, 53, 57], [50, 53, 58], [50, 55, 58], [49, 52, 57]], // Dm – Bb – Gm – A
    roots: [38, 34, 31, 33],
    bells: { 0: 74, 6: 77, 12: 81, 22: 79, 32: 77, 38: 74, 44: 70, 64: 79, 70: 74, 76: 70, 86: 72, 96: 76, 102: 73, 108: 69 },
    step(p, i, t) {
      const s = i & 15, bar = (i >> 4) & 7, c = bar >> 1, ch = this.chords[c], two = p.stepDur * 32;
      if (s === 0 && !(bar & 1)) {
        choir(p.pad, ch, t, two - 0.3, { vowel: 'ah', v: 0.16, a: 1.8, r: 2.4 });
        tone(p.bass, t, { f: mtof(this.roots[c]), a: 1.2, h: two - 1.4, d: 1.6, v: 0.1 }); // sub drone
      }
      if (!(s & 1)) { // slow 8th-note arpeggio
        const k = [0, 1, 2, 3, 2, 1, 2, 3][(i >> 1) & 7];
        pluck(p.lead, t, k === 3 ? ch[0] + 24 : ch[k] + 12, 0.45, 'triangle', 0.13, 2200);
      }
      const b = this.bells[i & 127]; // soft bell motif
      if (b) bell(p.bell, t, mtof(b), 0.12, 2.4);
    },
  },

  battle: {
    bpm: 128,
    level: 0.7,
    chords: [[62, 65, 69], [62, 65, 70], [60, 65, 69], [60, 64, 67]], // Dm – Bb – F – C (i–VI–III–VII)
    roots: [38, 34, 41, 36],
    arp: [[0, 1, 2, 3, 2, 1, 0, 2], [3, 2, 1, 0, 1, 2, 3, 1]],
    hook: { 0: 81, 6: 77, 12: 76, 16: 74, 24: 76, 32: 77, 38: 74, 44: 70, 48: 72, 56: 74, 64: 72, 70: 77, 76: 81, 80: 79, 88: 77, 96: 76, 102: 79, 108: 84, 112: 81, 120: 79 },
    step(p, i, t) {
      const s = i & 15, bar = (i >> 4) & 7, c = bar >> 1, ch = this.chords[c], sd = p.stepDur;
      const fill = bar === 7 && s > 12;
      // drums: four-on-the-floor kick (+ sidechain pump), clap on 2 & 4, 16th hats
      if (!(s & 3)) { kick(p.drums, t, 0.85); pump(p, t, sd * 3); }
      if (s === 4 || s === 12 || fill) snare(p.drums, t, fill ? 0.22 : 0.3);
      hat(p.drums, t, (s & 3) === 2 ? 0.09 : 0.035, s === 14 && (bar & 1) === 1);
      // pulsing octave bass that ducks out of the kick's way
      if (s & 3) bassNote(p.bass, t, this.roots[c] + ((s & 3) === 2 ? 12 : 0), sd * 0.95, 0.2, 1600);
      // arpeggiated lead in the current chord
      const k = this.arp[bar & 1][s & 7];
      pluck(p.lead, t, (k === 3 ? ch[0] + 12 : ch[k]) + 12, sd * 1.6, 'sawtooth', 0.06, 3200);
      // choir pad per chord, hook melody every other 8-bar cycle
      if (s === 0 && !(bar & 1)) choir(p.pad, ch, t, sd * 32 - 0.1, { vowel: 'ah', v: 0.13, a: 0.35, r: 0.6 });
      const h = (i >> 7) & 1 ? this.hook[i & 127] : 0;
      if (h) lead(p.lead, t, h, sd * 5, 0.06);
    },
  },

  boss: {
    bpm: 140,
    level: 0.7,
    chords: [[50, 53, 57], [51, 55, 58], [50, 53, 58], [49, 52, 57]], // Dm – Eb – Bb – A (phrygian bII)
    roots: [38, 39, 34, 33],
    kicks: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 1, 0],          // galloping tom-kick
    gallop: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 1, 0, 12],     // bass offsets (b2 flick)
    setup(p) { p.dist = distort(p.bass, 8, 1100, 0.2); p.nodes.push(p.dist); },
    step(p, i, t) {
      const s = i & 15, bar = (i >> 4) & 7, c = bar >> 1, ch = this.chords[c], sd = p.stepDur;
      if (this.kicks[s]) kick(p.drums, t, 0.9, 170, 0.32);
      if (s === 4 || s === 12) snare(p.drums, t, 0.32);
      if ((bar & 1) && s >= 12) tom(p.drums, t, [300, 220, 160, 110][s - 12], 0.4); // roll into each chord
      hat(p.drums, t, s & 1 ? 0.03 : 0.07);
      bassNote(p.dist, t, this.roots[c] + this.gallop[s], sd * 0.9, 0.24, 900);
      if (s === 0 && !(bar & 1)) { // ominous choir, octave-doubled
        choir(p.pad, ch, t, sd * 32 - 0.1, { vowel: 'oo', v: 0.14, a: 0.5, r: 0.8 });
        choir(p.pad, [ch[0] - 12], t, sd * 32 - 0.1, { vowel: 'ah', v: 0.08, a: 0.5, r: 0.8 });
      }
      if (!(s & 1)) { // tense arp: chord tones + phrygian Eb
        const k = [0, 1, 2, 1, 0, 2, 1, 3][s >> 1];
        pluck(p.lead, t, (k === 3 ? 63 : ch[k]) + 12, sd * 1.5, 'square', 0.09, 2400);
      }
      if (s === 0 && !(bar & 3)) bell(p.bell, t, mtof(ch[0] + 12), 0.12, 3); // death toll
    },
  },

  // a boss's last phase: faster, double-time kicks, harsher bass, the arp an octave up, brass stabs
  boss3: {
    bpm: 156,
    level: 0.72,
    chords: [[50, 53, 57], [51, 55, 58], [49, 52, 57], [50, 53, 57]], // Dm – Eb – A – Dm
    roots: [38, 39, 33, 38],
    setup(p) { p.dist = distort(p.bass, 12, 1400, 0.22); p.nodes.push(p.dist); },
    step(p, i, t) {
      const s = i & 15, bar = (i >> 4) & 7, c = bar >> 1, ch = this.chords[c], sd = p.stepDur;
      if (!(s & 1)) kick(p.drums, t, s & 3 ? 0.6 : 0.95, 170, 0.28);
      if (s === 4 || s === 12) snare(p.drums, t, 0.36);
      if (bar & 1 && s >= 8 && !(s & 1)) tom(p.drums, t, 320 - (s - 8) * 30, 0.35);
      hat(p.drums, t, s & 1 ? 0.04 : 0.08, s === 14);
      bassNote(p.dist, t, this.roots[c] + (s % 3 === 2 ? 12 : 0), sd * 0.9, 0.26, 1100);
      if (s === 0 && !(bar & 1)) {
        choir(p.pad, ch, t, sd * 32 - 0.1, { vowel: 'ah', v: 0.16, a: 0.2, r: 0.6 });
        for (const n of ch) brass(p.lead, t, n, sd * 3, 0.05);
      }
      pluck(p.lead, t, ch[[0, 1, 2, 1][s & 3]] + 24, sd * 1.2, 'square', 0.07, 3200);
      if (s === 0 && !(bar & 1)) bell(p.bell, t, mtof(ch[0] + 24), 0.12, 2);
    },
  },
};

// Sidechain-style pump on the pad bus.
function pump(p, t, len) {
  const g = p.pad.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(0.3, t);
  g.linearRampToValueAtTime(1, t + len);
}

// A player = one running track with its own buses, echo and fade gain.
function makePlayer(name) {
  const tr = TRACKS[name], spb = 60 / tr.bpm;
  const out = gain(0.0001, musicBus), rev = gain(1, musRev);
  const dly = ctx.createDelay(2), fb = gain(0.3), dTone = filt(fb, 'lowpass', 2800, 0);
  dly.delayTime.value = spb * 0.75; // dotted-eighth echo, tempo synced
  dly.connect(dTone);
  fb.connect(dly);
  dTone.connect(out);
  const nodes = [out, rev, dly, fb, dTone];
  const bus = (dry, echo, wet) => {
    const g = gain(dry, out);
    nodes.push(g);
    if (echo) { const e = gain(echo, dly); g.connect(e); nodes.push(e); }
    if (wet) { const w = gain(wet, rev); g.connect(w); nodes.push(w); }
    return g;
  };
  const p = {
    name, tr, out, nodes, step: 0, stepDur: spb / 4, next: ctx.currentTime + 0.06, dieAt: 0,
    drums: bus(1, 0, 0.06), bass: bus(1, 0, 0), lead: bus(1, 0.3, 0.2), pad: bus(1, 0, 0.5), bell: bus(1, 0.3, 0.6),
  };
  if (tr.setup) tr.setup(p);
  return p;
}

function fadeTo(g, v, t, len) {
  const pr = g.gain;
  pr.cancelScheduledValues(t);
  pr.setValueAtTime(Math.max(pr.value, 0.0001), t);
  pr.linearRampToValueAtTime(v, t + len);
}

function retire(p, len = XFADE) {
  const t = ctx.currentTime;
  fadeTo(p.out, 0, t, len);
  p.dieAt = t + len + 0.1;
}

function startTrack(name) {
  if (!ctx || !TRACKS[name] || (current && current.name === name)) return;
  if (current) retire(current);
  current = makePlayer(name);
  fadeTo(current.out, current.tr.level, ctx.currentTime, XFADE);
  players.push(current);
}

// Lookahead scheduler: every ~25 ms, queue all steps that start within LOOKAHEAD.
function tick() {
  if (!ctx || ctx.state !== 'running') return;
  drainVoice();
  const now = ctx.currentTime, horizon = now + LOOKAHEAD;
  for (let k = players.length - 1; k >= 0; k--) {
    const p = players[k];
    if (p.dieAt && now > p.dieAt) { players.splice(k, 1); p.nodes.forEach(disc); continue; }
    if (p.next < now - 0.2) p.next = now + 0.03; // stalled (throttled tab): skip ahead, don't burst
    while (p.next < horizon) {
      try { p.tr.step(p, p.step, p.next); } catch (e) { /* keep the beat going */ }
      p.step++;
      p.next += p.stepDur;
    }
  }
}

// ---------------------------------------------------------------- voice --
const VOICE_URL = {};      // line name -> asset url (a data: URI in the single-file build)
for (const [path, url] of Object.entries(import.meta.glob('../assets/voice/*.mp3', { eager: true, query: '?url', import: 'default' }))) {
  VOICE_URL[path.slice(path.lastIndexOf('/') + 1, -4)] = url;
}
const vbuf = {};           // decoded lines
const vlast = {};          // ms each line last played
const vgroup = {};         // group -> { at, rank } of its last line
const vlog = [];           // QA: recent requests and what became of each
let vnow = null;           // the line playing: { name, pri, src, g, end (ms) }
let vqueue = null;         // one important line waiting for the voice to free up: { name, pri, until (ms) }
let vloading = null;

// 'vael_rite' -> lines.rite; announcer lines are listed by name
const lineDef = (name) => VOICE.lines[name] || VOICE.lines[name.slice(name.indexOf('_') + 1)] || { pri: 2 };

async function bytes(url) {
  if (url.startsWith('data:')) { // inlined: decode here, so no fetch (and no connect-src) is involved
    const b = atob(url.slice(url.indexOf(',') + 1)), a = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i);
    return a.buffer;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('voice ' + r.status);
  return r.arrayBuffer();
}
// older Safari only takes callbacks
const decodeBuf = (buf) => new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.then) p.then(res, rej); });

function loadVoices() {
  if (vloading || !ctx) return vloading;
  vloading = (async () => {
    for (const name of Object.keys(VOICE_URL)) { // one at a time, so there is no decode spike as a run starts
      try { vbuf[name] = await decodeBuf(await bytes(VOICE_URL[name])); } catch (e) { /* this line stays silent */ }
    }
  })();
  return vloading;
}

function stopLine() {
  const v = vnow;
  vnow = null;
  if (!v) return;
  try { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.02); v.src.stop(ctx.currentTime + 0.1); } catch (e) { /* ended */ }
}

function playLine(name, d) {
  const buf = vbuf[name], t = ctx.currentTime, ms = nowMs(), src = ctx.createBufferSource(), g = gain(1, voiceBus);
  src.buffer = buf;
  src.connect(g);
  src.start(t);
  src.onended = () => { disc(src); disc(g); if (vnow && vnow.src === src) vnow = null; };
  vnow = { name, pri: d.pri || 2, src, g, end: ms + buf.duration * 1000 };
  vlast[name] = ms;
  if (d.group) vgroup[d.group] = { at: ms, rank: d.rank || 0 };
  const b = bed.gain; // music and sfx sit under the line, then swell back
  b.cancelScheduledValues(t);
  b.setValueAtTime(b.value, t);
  b.linearRampToValueAtTime(VOICE.duck, t + 0.06);
  b.setValueAtTime(VOICE.duck, t + buf.duration);
  b.linearRampToValueAtTime(1, t + buf.duration + 0.45);
}

function trySay(name, queued) {
  if (!ctx) return 'off';
  if (!VOICE_URL[name]) return 'unknown';
  if (isMuted || vol.voice <= 0) return 'muted';
  if (!canPlay()) return 'asleep';
  if (!vbuf[name]) { loadVoices(); return 'loading'; }
  const d = lineDef(name), ms = nowMs(), pri = d.pri || 2;
  if (d.cd && ms - (vlast[name] ?? -1e9) < d.cd * 1000) return 'cooldown';
  const gl = d.group && vgroup[d.group];
  if (gl && ms - gl.at < VOICE.groups[d.group] * 1000 && (d.rank || 0) <= gl.rank) return 'cooldown';
  if (vnow && ms < vnow.end + VOICE.gap * 1000) {
    if (pri <= vnow.pri) {
      if (d.wait && !queued && (!vqueue || pri >= vqueue.pri)) { vqueue = { name, pri, until: ms + d.wait * 1000 }; return 'queued'; }
      return 'busy';
    }
    stopLine(); // a more important line cuts in
  }
  playLine(name, d);
  return 'play';
}

function say(name, queued = false) {
  let r;
  try { r = trySay(String(name), queued); } catch (e) { r = 'error'; }
  vlog.push({ name, r, at: Math.round(nowMs()) });
  if (vlog.length > 40) vlog.shift();
  return r;
}

// Called from the scheduler tick: the queued line plays once the voice is free, or is dropped once stale.
function drainVoice() {
  if (!vqueue) return;
  const ms = nowMs();
  if (ms > vqueue.until) { vqueue = null; return; }
  if (vnow && ms < vnow.end + VOICE.gap * 1000) return;
  const q = vqueue;
  vqueue = null;
  say(q.name, true);
}

// -------------------------------------------------------------- startup --
function noiseBuf(brown) {
  const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}

// Shared reverb impulse: decaying stereo noise, built once.
function impulse(sec, decay) {
  const sr = ctx.sampleRate, len = Math.floor(sr * sec), b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const fadeIn = Math.min(1, i / (sr * 0.004));
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * fadeIn;
    }
  }
  return b;
}

function build() {
  limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  master = gain(isMuted ? 0 : 1, ctx.destination);
  limiter.connect(master);
  bed = gain(1, limiter);
  sfxBus = gain(vol.sfx, bed);
  musicDuck = gain(1, bed);
  musicBus = gain(vol.music, musicDuck);
  voiceBus = gain(vol.voice, limiter);
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(2.6, 3);
  reverb.connect(filt(bed, 'lowpass', 5500, 0));
  sfxRev = gain(vol.sfx, reverb);   // sends follow their bus volume
  musRev = gain(vol.music, reverb);
  whiteBuf = noiseBuf(false);
  brownBuf = noiseBuf(true);
}

// iOS: play one silent sample inside the gesture to unlock output.
function unlock() {
  if (unlocked) return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
    unlocked = true;
  } catch (e) { /* try again next gesture */ }
}

function resume() {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || isHidden()) return Promise.resolve();
  resumeReq = nowMs();
  return settle(() => ctx.resume());
}

// Pause everything (music included) while hidden; resume when visible again.
function onVisibility() {
  if (!ctx) return;
  if (isHidden()) {
    if (ctx.state === 'running' && ctx.suspend) settle(() => ctx.suspend());
  } else {
    resume().then(tick);
  }
}

function onGesture() { if (ctx && ctx.state !== 'running') { unlock(); resume(); } }

function listen() {
  if (listening) return;
  listening = true;
  if (hasDoc) document.addEventListener('visibilitychange', onVisibility);
  if (hasWin) {
    window.addEventListener('pageshow', onVisibility);
    // iOS can "interrupt" the context (calls, Siri); any later tap brings it back.
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, onGesture, { capture: true, passive: true });
  }
}

function init() {
  try {
    if (!ctx) {
      const AC = hasWin && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return Promise.resolve();
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      try { build(); } catch (e) { settle(() => ctx.close()); ctx = null; return Promise.resolve(); }
      timer = setInterval(tick, TICK_MS);
      listen();
      loadVoices();
      if (wanted) startTrack(wanted);
    }
    unlock();
    // Chrome leaves resume() pending until a gesture; never let `await init()` hang.
    return Promise.race([resume(), new Promise((r) => setTimeout(r, 300))]);
  } catch (e) {
    return Promise.resolve();
  }
}

// ------------------------------------------------------------ public API --
export const Audio = {
  init,

  sfx(name, opts = {}) { playSfx(name, opts); },

  playMusic(track) {
    try {
      if (!TRACKS[track]) return;
      wanted = track;
      if (ctx) startTrack(track);
    } catch (e) { /* ignore */ }
  },

  stopMusic() {
    try {
      wanted = null;
      if (ctx && current) retire(current, 0.8);
      current = null;
    } catch (e) { /* ignore */ }
  },

  /** A recorded voice line by file name (src/assets/voice). Returns what became of it: 'play', 'queued', 'busy',
   *  'cooldown', 'muted', 'loading', 'asleep' (no gesture yet / hidden), 'off' or 'unknown'. */
  voice(name) { return say(name); },

  /** QA: how many lines exist and are decoded, the one playing, and the recent request log. */
  voiceState() { return { lines: Object.keys(VOICE_URL).length, loaded: Object.keys(vbuf).length, playing: vnow ? vnow.name : null, queued: vqueue ? vqueue.name : null, duck: bed ? bed.gain.value : 1, log: vlog.slice() }; },

  setVolumes({ music, sfx: fx, voice } = {}) {
    try {
      if (typeof music === 'number' && isFinite(music)) vol.music = clamp(music, 0, 1);
      if (typeof fx === 'number' && isFinite(fx)) vol.sfx = clamp(fx, 0, 1);
      if (typeof voice === 'number' && isFinite(voice)) vol.voice = clamp(voice, 0, 1);
      if (!ctx) return;
      const t = ctx.currentTime;
      voiceBus.gain.setTargetAtTime(vol.voice, t, 0.03);
      musicBus.gain.setTargetAtTime(vol.music, t, 0.03);
      musRev.gain.setTargetAtTime(vol.music, t, 0.03);
      sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
      sfxRev.gain.setTargetAtTime(vol.sfx, t, 0.03);
    } catch (e) { /* ignore */ }
  },

  setMuted(m) {
    try {
      isMuted = !!m;
      if (isMuted && ctx) { stopLine(); vqueue = null; }
      if (ctx) master.gain.setTargetAtTime(isMuted ? 0 : 1, ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  },

  get muted() { return isMuted; },
};

export default Audio;
