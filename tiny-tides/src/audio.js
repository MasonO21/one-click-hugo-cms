// Tiny Tides — fully synthesized audio (no asset files). Soft bubbly SFX + a calm procedural ocean loop.
let ctx = null, master = null, sfxBus = null, musicBus = null, reverb = null, noiseBuf = null;
const cfg = { sfx: true, music: true };
let musicOn = false, musicTimer = 0, waveNodes = null, padNodes = [], chordIdx = 0, unlocked = false;

const PENTA = [0, 2, 4, 7, 9];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = 0.0; musicBus.connect(master);
  // cheap generated reverb
  const len = ctx.sampleRate * 1.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
  reverb = ctx.createConvolver(); reverb.buffer = ir;
  const rg = ctx.createGain(); rg.gain.value = 0.35; reverb.connect(rg); rg.connect(master);
  // noise buffer
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0); let b0 = 0; for (let i = 0; i < nd.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.985 * b0 + 0.015 * w; nd[i] = b0 * 5; }
  return ctx;
}
/** Must be called from a user gesture (iOS/Chrome autoplay rules). Starts music if enabled. */
export function unlock() {
  unlocked = true;
  const c = ensure(); if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  if (cfg.music) startMusic();
}
export function suspend(v) { if (!ctx || !unlocked) return; if (v) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); }
export function configure(o) {
  Object.assign(cfg, o);
  if (!unlocked) return;            // nothing may start before the first tap
  if (cfg.music) startMusic(); else stopMusic();
}

function tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.15, vol = 0.3, attack = 0.005, wet = 0, dest = null }) {
  const c = ctx, t0 = c.currentTime + t;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || sfxBus);
  if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(reverb); }
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise({ t = 0, dur = 0.15, vol = 0.2, f = 1200, q = 0.7, type = 'bandpass', f2 = null }) {
  const c = ctx, t0 = c.currentTime + t;
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
}
const bell = (m, t, vol = 0.22, dur = 0.7) => { tone({ f: mtof(m), t, dur, vol, wet: 0.5, attack: 0.004 }); tone({ f: mtof(m) * 2.01, t, dur: dur * 0.6, vol: vol * 0.35, wet: 0.4 }); };

const SFX = {
  pop(combo = 0) { const k = 1 + Math.min(combo, 12) * 0.06; tone({ f: 380 * k, f2: 900 * k, dur: 0.09, vol: 0.32 }); noise({ dur: 0.04, vol: 0.12, f: 3000, type: 'highpass' }); bell(84 + Math.min(combo, 10), 0.03, 0.08, 0.25); },
  bloop() { tone({ f: 720, f2: 300, dur: 0.14, vol: 0.28 }); },
  place() { tone({ f: 150, f2: 62, dur: 0.11, vol: 0.4 }); noise({ dur: 0.05, vol: 0.15, f: 900 }); },
  dig() { noise({ dur: 0.22, vol: 0.22, f: 500, f2: 1600, q: 1.1 }); tone({ f: 260, f2: 420, dur: 0.16, vol: 0.14 }); },
  fill() { noise({ dur: 0.18, vol: 0.2, f: 1600, f2: 500, q: 1.1 }); },
  erase() { tone({ f: 500, f2: 220, dur: 0.1, vol: 0.2, type: 'triangle' }); },
  tick() { tone({ f: 900, dur: 0.035, vol: 0.12, type: 'triangle' }); },
  tap() { tone({ f: 620, f2: 780, dur: 0.05, vol: 0.14, type: 'triangle' }); },
  coin() { bell(88, 0, 0.16, 0.35); bell(93, 0.07, 0.16, 0.5); },
  pet() { tone({ f: 520, f2: 760, dur: 0.12, vol: 0.14 }); tone({ f: 640, f2: 920, t: 0.08, dur: 0.12, vol: 0.12 }); },
  crack() { noise({ dur: 0.05, vol: 0.3, f: 2400, type: 'highpass' }); tone({ f: 180, f2: 90, dur: 0.06, vol: 0.2, type: 'square' }); },
  hatch() { noise({ dur: 0.08, vol: 0.3, f: 2200, type: 'highpass' }); [72, 76, 79, 84].forEach((m, i) => bell(m, 0.08 + i * 0.08, 0.16, 0.7)); },
  levelup() { [67, 71, 74, 79, 83].forEach((m, i) => bell(m, i * 0.09, 0.17, 0.9)); },
  evolve() { for (let i = 0; i < 10; i++) bell(60 + PENTA[i % 5] + Math.floor(i / 5) * 12 + 5, i * 0.11, 0.14, 0.9); noise({ dur: 1.2, vol: 0.06, f: 600, f2: 5000, q: 0.6, type: 'bandpass' }); },
  reveal() { [72, 76, 79, 84, 88].forEach((m, i) => bell(m, 0.1 + i * 0.12, 0.2, 1.4)); },
  error() { tone({ f: 200, dur: 0.12, vol: 0.2, type: 'square' }); tone({ f: 150, t: 0.09, dur: 0.16, vol: 0.2, type: 'square' }); },
  gift() { [76, 79, 83, 88].forEach((m, i) => bell(m, i * 0.07, 0.15, 0.8)); },
  buy() { [79, 83, 86, 91].forEach((m, i) => bell(m, i * 0.06, 0.14, 0.8)); },
  whoosh() { noise({ dur: 0.3, vol: 0.12, f: 400, f2: 3000, q: 0.5 }); },
};
export function play(name, arg) {
  if (!unlocked || !cfg.sfx || !ensure() || ctx.state !== 'running') return;
  try { SFX[name]?.(arg); } catch { /* audio must never break the game */ }
}

// ------------------------------------------------------------------ music: waves + slow pad + sparse plinks
const CHORDS = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]]; // Cmaj7 Am7 Fmaj7 G6-ish
function startPad() {
  const c = ctx; const chord = CHORDS[chordIdx++ % CHORDS.length], t0 = c.currentTime;
  const nodes = [];
  for (const m of chord) for (const det of [-6, 6]) {
    const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mtof(m - 12); o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = 700;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.028, t0 + 3); g.gain.linearRampToValueAtTime(0.0001, t0 + 9.5);
    o.connect(f); f.connect(g); g.connect(musicBus); g.connect(reverb); o.start(t0); o.stop(t0 + 10); nodes.push(o);
  }
  padNodes = nodes;
}
function plink() {
  if (!musicOn || !cfg.music || !ctx || ctx.state !== 'running') return;
  const root = 72 + [0, -5, -7, 2][chordIdx % 4];
  const m = root + PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0);
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = mtof(m);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.07, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
  o.connect(g); g.connect(musicBus); g.connect(reverb); o.start(t0); o.stop(t0 + 1.7);
}
export function startMusic() {
  if (!unlocked || !cfg.music || musicOn) return;
  const c = ensure(); if (!c) return;
  musicOn = true;
  musicBus.gain.setTargetAtTime(0.5, c.currentTime, 1.2);
  // ocean: filtered pink noise with a slow swell
  const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.4;
  const g = c.createGain(); g.gain.value = 0.05;
  const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(g.gain);
  const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.09; lg2.gain.value = 180; lfo2.connect(lg2); lg2.connect(f.frequency);
  s.connect(f); f.connect(g); g.connect(musicBus); s.start(); lfo.start(); lfo2.start();
  waveNodes = [s, lfo, lfo2];
  startPad();
  let n = 0;
  musicTimer = setInterval(() => {
    n++;
    if (n % 5 === 0) startPad();
    if (Math.random() < 0.6) plink();
  }, 2000);
}
export function stopMusic() {
  if (!musicOn) return;
  musicOn = false; clearInterval(musicTimer);
  if (ctx) {
    musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    const nodes = [...(waveNodes || []), ...padNodes];
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 1500);
  }
  waveNodes = null; padNodes = [];
}
