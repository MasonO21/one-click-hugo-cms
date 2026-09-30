// Tiny Tides trailer — original "kawaii future bass" track + beat-synced SFX, synthesized with an OfflineAudioContext.
// 144 BPM, 18 bars (30.0 s), C major pentatonic lead over IVmaj9 - V - iii7 - vi9. Nothing is sampled.
import { DUR, BAR, BEAT, SIX, T, EV, CUTS } from './timeline.js';
import { mulberry } from './kit.js';

const SR = 48000;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
// chord voicings (MIDI) + bass roots
const CH = {
  F: { v: [53, 57, 60, 64, 67], root: 41 },   // Fmaj9
  G: { v: [55, 59, 62, 67, 69], root: 43 },   // Gadd9
  Em: { v: [52, 55, 59, 62, 67], root: 40 },  // Em7
  Am: { v: [57, 60, 64, 67, 71], root: 45 },  // Am9
  C: { v: [48, 55, 60, 64, 67, 74], root: 36 }, // Cadd9
};
const PROG = [null, 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'F', 'G', 'Em', 'Am', 'F', 'C'];
const chordAt = (bar, beat = 1) => (bar === 16 && beat >= 3 ? 'G' : bar === 17 && beat >= 3 ? 'G' : PROG[bar]);
// lead motifs: [sixteenth, midi, length in sixteenths]
const MOTIF = {
  F: [[0, 81, 2], [2, 79, 2], [4, 81, 2], [6, 84, 2], [8, 81, 2], [10, 79, 2], [12, 76, 2], [14, 79, 2]],
  G: [[0, 79, 2], [2, 81, 2], [4, 86, 2], [6, 84, 2], [8, 81, 2], [10, 79, 2], [12, 81, 2], [14, 84, 2]],
  Em: [[0, 79, 3], [3, 76, 3], [6, 79, 2], [8, 81, 2], [10, 79, 2], [12, 76, 2], [14, 74, 2]],
  Am: [[0, 76, 2], [2, 79, 2], [4, 81, 2], [6, 84, 2], [8, 88, 3], [11, 86, 1], [12, 84, 2], [14, 81, 2]],
};
const STABS = [[0, 3], [3, 3], [6, 2], [8, 3], [11, 3], [14, 2]];   // syncopated chord chops [sixteenth, len]

export async function renderMusic(dyn = []) {
  const ac = new OfflineAudioContext(2, Math.round(SR * DUR), SR);
  const rnd = mulberry(20260930);
  // ---------------------------------------------------------------- shared buffers
  const noise = ac.createBuffer(1, SR * 2, SR); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const ir = ac.createBuffer(2, Math.round(SR * 2.2), SR);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / d.length, 3.2) * Math.min(1, i / 240); }
  // ---------------------------------------------------------------- buses
  const master = ac.createGain(); master.gain.value = 0.8;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.16;
  master.connect(comp); comp.connect(ac.destination);
  const verb = ac.createConvolver(); verb.buffer = ir; const verbOut = ac.createGain(); verbOut.gain.value = 0.3; verb.connect(verbOut); verbOut.connect(master);
  const musicLP = ac.createBiquadFilter(); musicLP.type = 'lowpass'; musicLP.frequency.value = 20000; musicLP.Q.value = 1.1;
  const musicG = ac.createGain(); musicLP.connect(musicG); musicG.connect(master);
  const bus = (g, dest = musicLP) => { const n = ac.createGain(); n.gain.value = g; n.connect(dest); return n; };
  const drums = bus(0.9), pump = bus(0.55), lead = bus(0.42), sfx = bus(0.8, master);
  const delay = ac.createDelay(1); delay.delayTime.value = 3 * SIX; const fb = ac.createGain(); fb.gain.value = 0.33; const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3200;
  delay.connect(dlp); dlp.connect(fb); fb.connect(delay); const dOut = ac.createGain(); dOut.gain.value = 0.35; dlp.connect(dOut); dOut.connect(lead);
  const send = (node, amt, dest = verb) => { const g = ac.createGain(); g.gain.value = amt; node.connect(g); g.connect(dest); };

  // ---------------------------------------------------------------- primitives
  function env(g, t, a, peak, d, sustain = 0.0001, rel = null) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (rel === null) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
    else {
      const de = Math.max(t + a + 0.001, Math.min(t + a + d, rel - 0.002));
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, sustain), de); g.gain.setValueAtTime(Math.max(0.0002, sustain), Math.max(de, rel)); g.gain.exponentialRampToValueAtTime(0.0001, Math.max(de, rel) + 0.08);
    }
  }
  function osc(type, f, t, dur, dest, o = {}) {
    const n = ac.createOscillator(); n.type = type; n.frequency.setValueAtTime(f, t);
    if (o.f2) n.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.glide || dur));
    if (o.detune) n.detune.value = o.detune;
    const g = ac.createGain(); env(g, t, o.a || 0.004, o.vol || 0.3, o.d || dur, o.sus, o.rel);
    let last = g;
    if (o.lp) { const f1 = ac.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.setValueAtTime(o.lp, t); if (o.lp2) f1.frequency.exponentialRampToValueAtTime(o.lp2, t + (o.lpT || dur)); f1.Q.value = o.q || 0.8; g.connect(f1); last = f1; }
    if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; last.connect(p); last = p; }
    n.connect(g); last.connect(dest);
    if (o.wet) send(last, o.wet);
    if (o.echo) send(last, o.echo, delay);
    n.start(t); n.stop(t + (o.rel ? o.rel - t + 0.12 : (o.a || 0.004) + (o.d || dur) + 0.05));
    return last;
  }
  function nz(t, dur, dest, o = {}) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fT || dur)); f.Q.value = o.q ?? 0.8;
    const g = ac.createGain();
    if (o.swell) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02); }
    else env(g, t, o.a || 0.002, o.vol || 0.2, dur);
    let last = g; s.connect(f); f.connect(g);
    if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; g.connect(p); last = p; }
    last.connect(dest); if (o.wet) send(last, o.wet);
    s.start(t, rnd() * 1.5); s.stop(t + dur + 0.1);
  }
  const bell = (m, t, vol = 0.2, dur = 0.8, dest = sfx, wet = 0.45, pan = 0) => { osc('sine', mtof(m), t, dur, dest, { vol, wet, pan }); osc('sine', mtof(m) * 2.01, t, dur * 0.5, dest, { vol: vol * 0.3, wet, pan }); osc('sine', mtof(m) * 3.98, t, dur * 0.25, dest, { vol: vol * 0.1, pan }); };

  // ---------------------------------------------------------------- drums
  const kick = (t, v = 1) => {
    osc('sine', 165, t, 0.34, drums, { f2: 46, glide: 0.11, vol: 0.95 * v, d: 0.34 });
    osc('triangle', 330, t, 0.03, drums, { f2: 90, glide: 0.03, vol: 0.25 * v, d: 0.03 });
    nz(t, 0.012, drums, { type: 'highpass', f: 3500, vol: 0.18 * v });
  };
  const clap = (t, v = 1) => { for (const [dt, a] of [[0, 0.55], [0.011, 0.45], [0.023, 0.6]]) nz(t + dt, dt === 0.023 ? 0.16 : 0.018, drums, { f: 1500, q: 1.3, vol: a * v, wet: 0.25 }); nz(t, 0.09, drums, { type: 'highpass', f: 5000, vol: 0.12 * v }); };
  const hat = (t, v = 1, open = false) => nz(t, open ? 0.16 : 0.035, drums, { type: 'highpass', f: open ? 7000 : 8500, vol: (open ? 0.1 : 0.075) * v, pan: open ? 0.2 : -0.15 });
  const snare = (t, v = 1) => { nz(t, 0.12, drums, { f: 2200, q: 0.7, vol: 0.32 * v }); osc('triangle', 210, t, 0.08, drums, { f2: 150, vol: 0.2 * v }); };
  const crash = (t, v = 1) => { nz(t, 1.6, drums, { type: 'highpass', f: 5500, vol: 0.22 * v, wet: 0.5 }); nz(t, 0.6, drums, { f: 9000, q: 0.4, vol: 0.1 * v }); };
  const boom = (t, v = 1) => { osc('sine', 120, t, 1.3, master, { f2: 30, glide: 0.9, vol: 0.9 * v, d: 1.3 }); nz(t, 0.25, master, { type: 'lowpass', f: 600, vol: 0.35 * v }); };

  // ---------------------------------------------------------------- instruments
  const saw5 = [-16, -7, 0, 7, 16], pans = [-0.7, -0.35, 0, 0.35, 0.7];
  /** Detuned supersaw chord through one shared envelope + low-pass (voices spread across the stereo field). */
  function saws(t, dur, notes, dets, pansArr, dest, o) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur); f.Q.value = o.q ?? 0.7;
    const g = ac.createGain(); env(g, t, o.a, o.peak, dur, o.sus, t + dur); g.connect(f); f.connect(dest); if (o.wet) send(f, o.wet);
    const pn = pansArr.map((p) => { const n = ac.createStereoPanner(); n.pan.value = p; n.connect(g); return n; });
    for (const m of notes) dets.forEach((dt, i) => { const n = ac.createOscillator(); n.type = 'sawtooth'; n.frequency.value = mtof(m); n.detune.value = dt; n.connect(pn[i]); n.start(t); n.stop(t + dur + 0.14); });
  }
  const stab = (t, dur, notes, v = 1, dest = pump, bright = 3600) => saws(t, dur, notes, saw5, pans, dest, { a: 0.006, peak: 0.022 * v, sus: 0.012 * v, lp: bright, lp2: bright * 0.45, wet: 0.06 });
  const pad = (t, dur, notes, v = 1, lpf = 1400) => saws(t, dur, notes, [-9, 9], [-0.4, 0.4], pump, { a: 0.25, peak: 0.013 * v, sus: 0.011 * v, lp: lpf, q: 0.5, wet: 0.35 });
  const bass = (t, dur, m, v = 1) => {
    osc('sine', mtof(m), t, dur, pump, { vol: 0.5 * v, a: 0.005, d: dur, sus: 0.42 * v, rel: t + dur });
    osc('sawtooth', mtof(m), t, dur, pump, { vol: 0.12 * v, a: 0.005, d: dur, sus: 0.08 * v, rel: t + dur, lp: 420, q: 1.2 });
  };
  const pluck = (t, m, len, v = 1, o = {}) => {
    osc('square', mtof(m), t, len, lead, { vol: 0.09 * v, a: 0.003, d: Math.min(0.3, len + 0.1), lp: 5200, lp2: 900, lpT: 0.18, echo: o.echo ?? 0.5, wet: 0.2, pan: o.pan || 0 });
    osc('triangle', mtof(m + 12), t, len, lead, { vol: 0.06 * v, a: 0.003, d: 0.22, wet: 0.25, echo: 0.3 });
  };
  const leadBell = (t, m, v = 1) => { osc('sine', mtof(m + 12), t, 0.35, lead, { vol: 0.08 * v, d: 0.35, wet: 0.35, echo: 0.4 }); osc('sine', mtof(m + 12) * 2.01, t, 0.2, lead, { vol: 0.025 * v, d: 0.2 }); };
  const riser = (t0, t1, v = 1) => {
    nz(t0, t1 - t0, musicLP, { f: 400, f2: 9000, fT: t1 - t0, q: 1.4, vol: 0.2 * v, swell: true, wet: 0.3 });
    osc('sawtooth', 180, t0, t1 - t0, musicLP, { f2: 1600, glide: t1 - t0, vol: 0.03 * v, a: t1 - t0 - 0.01, d: 0.01, lp: 2500 });
  };
  const whoosh = (t, dur = 0.3, v = 1, down = false) => nz(t - dur * 0.7, dur, sfx, { f: down ? 5000 : 500, f2: down ? 400 : 5000, fT: dur, q: 0.9, vol: 0.14 * v, swell: true });

  // ---------------------------------------------------------------- arrangement
  const dropBars = new Set([3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17]);
  // sidechain pump: duck the pumped bus on every kick
  const kicks = [];
  for (let bar = 1; bar <= 18; bar++) for (let b = 1; b <= 4; b++) {
    const t = T(bar, b);
    let k = dropBars.has(bar);
    if (bar === 11) k = b >= 3; if (bar === 16 && b === 4) k = false; if (bar === 18) k = b === 1;
    if (k) kicks.push(t);
  }
  pump.gain.setValueAtTime(0.55, 0);
  for (const t of kicks) { pump.gain.setValueAtTime(0.55, Math.max(0, t - 0.002)); pump.gain.linearRampToValueAtTime(0.12, t + 0.01); pump.gain.setTargetAtTime(0.55, t + 0.03, 0.07); }
  for (const t of kicks) kick(t);
  // pre-drop silences (one 16th) + dive filter
  musicG.gain.setValueAtTime(1, 0);
  for (const d of [T(3), T(9), T(17)]) { musicG.gain.setValueAtTime(1, d - SIX - 0.01); musicG.gain.linearRampToValueAtTime(0.0, d - SIX + 0.01); musicG.gain.setValueAtTime(0, d - 0.004); musicG.gain.linearRampToValueAtTime(1, d); }
  musicLP.frequency.setValueAtTime(20000, 0);
  musicLP.frequency.setValueAtTime(20000, T(15) - 0.05); musicLP.frequency.exponentialRampToValueAtTime(520, T(15) + 0.25);
  musicLP.frequency.setValueAtTime(520, T(16)); musicLP.frequency.exponentialRampToValueAtTime(16000, T(17) - SIX);
  musicLP.frequency.setValueAtTime(20000, T(17));
  // intro filter
  const introLP = ac.createBiquadFilter(); introLP.type = 'lowpass'; introLP.frequency.setValueAtTime(700, 0); introLP.frequency.exponentialRampToValueAtTime(5200, T(3) - SIX); introLP.connect(musicLP);
  for (let bar = 1; bar <= 2; bar++) {
    const ch = CH[PROG[bar]];
    pad(T(bar), BAR, ch.v, 1.2, 1100);
    const arp = [...ch.v.slice(1), ch.v[4] + 5, ch.v[3] + 12].sort((a, b) => a - b);
    for (let s = 0; s < 16; s++) { const i = s % 8 < 4 ? s % 4 : 3 - (s % 4); osc('square', mtof(arp[(i + Math.floor(s / 8)) % arp.length] + 12), T(bar) + s * SIX, 0.1, introLP, { vol: 0.07, d: 0.16, lp: 3000, lp2: 700, lpT: 0.12, echo: 0.4, wet: 0.2, pan: s % 2 ? 0.3 : -0.3 }); }
  }
  bass(T(2), BAR * 0.5, CH.G.root, 0.6);
  // bar 2 build: snare roll + riser
  for (let s = 0; s < 16; s++) { const rate = s < 8 ? 2 : 1; if (s % rate === 0) snare(T(2) + s * SIX, 0.35 + s * 0.04); }
  for (let s = 12; s < 15; s++) snare(T(2) + s * SIX + SIX / 2, 0.6);
  riser(T(2), T(3) - SIX, 1);
  // main grooves
  for (let bar = 3; bar <= 17; bar++) {
    const drop2 = bar >= 9 && bar <= 14;
    for (let b = 1; b <= 4; b++) {
      const t = T(bar, b), chn = chordAt(bar, b), ch = CH[chn];
      const drumsOn = !(bar === 11 && b <= 2) && !(bar === 16 && b === 4);
      if (drumsOn && (b === 2 || b === 4) && !(bar === 15)) clap(t, bar === 16 ? 0.8 : 1);
      if (drumsOn && bar !== 15) for (let s = 0; s < 4; s++) hat(t + s * SIX, [0.55, 0.35, 1, 0.4][s] * (drop2 ? 1.1 : 1), s === 2);
      if (bar === 15) hat(t + 2 * SIX, 0.5, true);
      // bass: re-attacked every beat, pumped by the sidechain
      if (!(bar === 11 && b <= 2)) bass(t, BEAT * 0.95, ch.root, bar === 15 ? 0.8 : 1);
    }
    // chord chops (per half-bar chord)
    for (const [s, len] of STABS) {
      const bt = 1 + Math.floor(s / 4), chn = chordAt(bar, bt);
      if (bar === 11 && s < 8) continue;
      if (bar === 16 && s >= 12) continue;
      stab(T(bar) + s * SIX, len * SIX * 0.9, CH[chn].v.map((m) => m + 12), drop2 ? 1.15 : bar === 15 ? 0.7 : 1, pump, drop2 ? 4200 : 3400);
    }
    pad(T(bar), BAR, CH[chordAt(bar, 1)].v, bar === 15 ? 1.6 : 0.8, bar === 15 ? 900 : 1600);
    // lead
    const leadOn = (bar >= 3 && bar <= 6) || (bar >= 9 && bar <= 10) || (bar >= 12 && bar <= 14) || bar === 17;
    if (leadOn) {
      const mo = MOTIF[chordAt(bar, 1)] || MOTIF.F;
      for (const [s, m, len] of mo) {
        if (bar === 17 && s >= 8) { const m2 = MOTIF.G.find((x) => x[0] === s); if (m2) { pluck(T(bar) + s * SIX, m2[1], m2[2] * SIX, 1.05); leadBell(T(bar) + s * SIX, m2[1], 1); } continue; }
        pluck(T(bar) + s * SIX, m, len * SIX, bar >= 9 ? 1.05 : 1);
        if (drop2 || bar === 17) leadBell(T(bar) + s * SIX, m, 1);
      }
    }
  }
  // bar 8 build into drop 2
  for (let s = 8; s < 16; s++) snare(T(8) + s * SIX, 0.3 + (s - 8) * 0.06);
  riser(T(8, 3), T(9) - SIX, 0.8);
  crash(T(3)); crash(T(9)); crash(T(17), 1.3);
  // bar 11: legendary charge + fanfare
  riser(T(11), T(11, 3), 1.1);
  for (let s = 0; s < 8; s++) { snare(T(11) + s * SIX, 0.3 + s * 0.07); snare(T(11) + s * SIX + SIX / 2, 0.25 + s * 0.06); }
  crash(EV.legend, 1.2); boom(EV.legend, 0.8);
  [60, 64, 67, 72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(m, EV.legend + i * SIX * 0.75, 0.13, 1.4, sfx, 0.5, (i % 2 ? 0.3 : -0.3)));
  stab(EV.legend, BEAT * 1.9, CH.Em.v.map((m) => m + 12), 1.4, musicLP, 5000);
  // bar 16: big riser into the end card
  riser(T(16), T(17) - SIX, 1.5);
  for (let s = 0; s < 16; s++) { const rate = s < 8 ? 2 : 1; if (s % rate === 0) snare(T(16) + s * SIX, 0.3 + s * 0.035); }
  for (let s = 12; s < 16; s++) snare(T(16) + s * SIX + SIX / 2, 0.75);
  // bar 18: final chord
  boom(EV.impact, 1.0);
  stab(T(18), BAR * 0.9, CH.C.v.map((m) => m + 12), 1.4, musicLP, 4600);
  pad(T(18), BAR * 0.95, CH.C.v, 1.4, 2400);
  osc('sine', mtof(CH.C.root), T(18), BAR * 0.9, musicLP, { vol: 0.5, d: BAR * 0.9 });
  [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(m, T(18) + i * SIX, 0.12, 1.6, sfx, 0.5));
  crash(T(18), 0.8);
  musicG.gain.setValueAtTime(1, DUR - 1.1); musicG.gain.linearRampToValueAtTime(0, DUR - 0.05);
  master.gain.setValueAtTime(0.8, DUR - 0.6); master.gain.linearRampToValueAtTime(0, DUR - 0.02);

  // ---------------------------------------------------------------- SFX synced to picture
  // cold open
  nz(EV.splash, 0.6, sfx, { f: 3500, f2: 400, fT: 0.6, q: 0.6, vol: 0.4, wet: 0.3 }); boom(EV.splash, 0.7);
  for (let i = 0; i < 8; i++) { const t = EV.splash + 0.05 + rnd() * 0.45; osc('sine', 500 + rnd() * 500, t, 0.07, sfx, { f2: 1400 + rnd() * 900, vol: 0.12, wet: 0.2, pan: rnd() - 0.5 }); }
  EV.slam.forEach((t, i) => { boom(t + 0.08, 0.55); nz(t + 0.08, 0.08, sfx, { type: 'highpass', f: 2000, vol: 0.3 }); stab(t + 0.08, 0.3, CH.F.v.map((m) => m + 12 + i * 2), 1.2, sfx, 5000); });
  EV.openPops.forEach((t, i) => { osc('sine', 420, t, 0.09, sfx, { f2: 1300, vol: 0.3 }); bell(72 + PENTA[i % 5] + 12, t + 0.03, 0.12, 0.5, sfx, 0.4, i % 2 ? 0.35 : -0.35); });
  // whooshes into every cut
  for (const c of CUTS) whoosh(c, 0.34, c === T(15) || c === T(11) ? 1.3 : 1, c === T(15));
  // dig & build
  EV.dig.forEach((t, i) => { nz(t, 0.2, sfx, { f: 500, f2: 1700, q: 1.1, vol: 0.28, pan: i % 2 ? 0.25 : -0.25 }); osc('sine', 280, t, 0.14, sfx, { f2: 520, vol: 0.14 }); osc('sine', mtof(84 + PENTA[i % 5]), t + 0.02, 0.06, sfx, { f2: mtof(96), vol: 0.07 }); });
  EV.build.forEach((t, i) => { osc('sine', 160, t, 0.12, sfx, { f2: 60, vol: 0.5 }); nz(t, 0.05, sfx, { f: 900, vol: 0.2 }); bell(84 + PENTA[i % 5], t + 0.02, 0.08, 0.35, sfx, 0.3, i % 2 ? 0.3 : -0.3); });
  // hatch
  nz(EV.wave - 0.15, 0.9, sfx, { f: 300, f2: 1800, fT: 0.35, q: 0.5, vol: 0.35, wet: 0.35 });
  EV.hatch.forEach((th, i) => {
    for (const t of [th - 2 * SIX, th - SIX]) { nz(t, 0.05, sfx, { type: 'highpass', f: 2600, vol: 0.32 }); osc('square', 190, t, 0.05, sfx, { f2: 90, vol: 0.12 }); }
    nz(th, 0.09, sfx, { type: 'highpass', f: 2200, vol: 0.34 });
    [72, 76, 79, 84].forEach((m, k) => bell(m + [0, 2, 4, 7][i], th + 0.02 + k * SIX * 0.5, 0.13, 0.6, sfx, 0.4, i % 2 ? 0.3 : -0.3));
  });
  [76, 79, 84, 88].forEach((m, k) => bell(m, EV.cheer + k * 0.05, 0.1, 0.6, sfx, 0.4));
  // pops: rising pentatonic combo
  EV.pops.forEach((t, i) => {
    const k = 1 + i * 0.06, m = 72 + PENTA[i % 5] + 12 * Math.floor(i / 5);
    osc('sine', 380 * k, t, 0.09, sfx, { f2: 950 * k, vol: 0.34 });
    nz(t, 0.04, sfx, { type: 'highpass', f: 3000, vol: 0.16 });
    bell(m + 12, t + 0.01, 0.16, 0.45, sfx, 0.35, (i % 2 ? 0.25 : -0.25));
    if (i === 3 || i === 7) bell(m + 19, t + 0.06, 0.1, 0.5, sfx);
  });
  [84, 88, 91, 96, 100].forEach((m, k) => bell(m, EV.pops[11] + 0.03 + k * 0.045, 0.12, 0.9, sfx, 0.5));
  // evolve: cocoon burst "shing"
  EV.evolve.forEach((t, i) => { nz(t - 0.12, 0.13, sfx, { f: 800, f2: 6000, fT: 0.13, q: 0.7, vol: 0.12, swell: true }); nz(t, 0.18, sfx, { type: 'highpass', f: 6000, vol: 0.2, wet: 0.3 }); [79, 84, 88].forEach((m, k) => bell(m + [0, 2, 4, 7][i], t + k * 0.03, 0.11, 0.7, sfx, 0.45)); });
  // 70 creatures: cascade of tiny pops
  for (let i = 0; i < 16; i++) { const t = EV.wall + i * 0.024; osc('sine', 600 + i * 45, t, 0.05, sfx, { f2: 1500 + i * 60, vol: 0.09, pan: (i % 3 - 1) * 0.4 }); }
  boom(EV.wall, 0.5); bell(88, EV.wallWord, 0.12, 0.6);
  // capsule machine
  for (let i = 0; i < 9; i++) { osc('square', 260 + i * 26, EV.crank + i * 0.07, 0.05, sfx, { f2: 200 + i * 20, vol: 0.13 }); nz(EV.crank + i * 0.07, 0.04, sfx, { type: 'highpass', f: 1800, vol: 0.1 }); }
  for (let i = 0; i < 8; i++) nz(EV.crank + 0.2 + i * 0.06 + rnd() * 0.02, 0.05, sfx, { f: 900 + rnd() * 1600, q: 2, vol: 0.13, pan: rnd() - 0.5 });
  for (const l of dyn) { osc('sine', 130, l.t, 0.16, sfx, { f2: 55, vol: 0.34 }); nz(l.t, 0.06, sfx, { f: 600, vol: 0.16 }); osc('sine', 190, l.t + 0.1, 0.09, sfx, { f2: 90, vol: 0.14 }); }
  osc('triangle', 380, EV.twist + 0.1, 0.14, sfx, { f2: 620, vol: 0.14 }); osc('triangle', 460, EV.twist + 0.22, 0.14, sfx, { f2: 760, vol: 0.14 }); nz(EV.twist + 0.15, 0.16, sfx, { type: 'highpass', f: 2600, vol: 0.1 });
  nz(EV.open, 0.12, sfx, { type: 'highpass', f: 3000, vol: 0.3 }); osc('sine', 520, EV.open, 0.12, sfx, { f2: 1300, vol: 0.22 });
  [60, 64, 67, 72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(m, EV.open + i * 0.06, 0.11, 1.4, sfx, 0.5, i % 2 ? 0.3 : -0.3));
  EV.toys.forEach((t, i) => { osc('sine', 500, t, 0.07, sfx, { f2: 1200, vol: 0.16, pan: i % 2 ? 0.4 : -0.4 }); });
  // deep ocean
  nz(EV.plunge - 0.05, 0.7, sfx, { type: 'lowpass', f: 3000, f2: 250, fT: 0.6, q: 0.7, vol: 0.45, wet: 0.4 }); boom(EV.plunge, 0.6);
  for (let i = 0; i < 14; i++) { const t = EV.plunge + 0.05 + rnd() * 0.9; osc('sine', 300 + rnd() * 300, t, 0.08, sfx, { f2: 900 + rnd() * 700, vol: 0.08, wet: 0.4, pan: rnd() - 0.5 }); }
  for (const [t, v] of [[EV.ping, 0.2], [EV.ping + 3 * SIX, 0.08], [EV.ping + 6 * SIX, 0.04]]) osc('sine', 1250, t, 0.9, sfx, { vol: v, d: 0.9, wet: 0.6 });
  // end card
  boom(EV.impact, 0.8); nz(EV.impact, 0.3, sfx, { type: 'highpass', f: 1500, vol: 0.3, wet: 0.4 });
  [79, 84, 88].forEach((m, k) => bell(m, EV.cta1 + k * 0.04, 0.1, 0.8)); [81, 86, 91].forEach((m, k) => bell(m, EV.cta2 + k * 0.04, 0.1, 0.8));

  const buf = await ac.startRendering();
  return masterWav(buf);
}

// ------------------------------------------------------------------ mastering: look-ahead peak limiter -> 16-bit WAV (base64)
function masterWav(buf) {
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const drive = 1.9 / Math.max(1e-6, peak), ceil = 0.84, la = Math.round(SR * 0.004), rel = Math.exp(-1 / (SR * 0.09));
  const tg = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * drive; tg[i] = p > ceil ? ceil / p : 1; }
  // forward sliding minimum over the look-ahead window (monotonic deque), then a moving average so gain ramps smoothly
  const m = new Float32Array(n), dq = new Int32Array(n); let h = 0, tl = 0;
  for (let i = n - 1; i >= 0; i--) { while (tl > h && tg[dq[tl - 1]] >= tg[i]) tl--; dq[tl++] = i; while (dq[h] > i + la) h++; m[i] = tg[dq[h]]; }
  const out = [new Float32Array(n), new Float32Array(n)];
  let acc = 0, g = 1;
  for (let i = 0; i < n; i++) {
    acc += m[i]; if (i >= la) acc -= m[i - la]; const s = acc / Math.min(i + 1, la);
    g = s < g ? s : g * rel + (1 - rel) * s;           // g <= s <= target gain, so the ceiling is never exceeded
    out[0][i] = L[i] * drive * g; out[1][i] = R[i] * drive * g;
  }
  // 16-bit PCM WAV with TPDF dither
  const r = mulberry(7), bytes = 44 + n * 4, ab = new ArrayBuffer(bytes), dv = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
  let o = 44, clip = 0;
  for (let i = 0; i < n; i++) for (let ch = 0; ch < 2; ch++) {
    let v = out[ch][i] * 32767 + (r() - r());
    if (v > 32767) { v = 32767; clip++; } else if (v < -32768) { v = -32768; clip++; }
    dv.setInt16(o, Math.round(v), true); o += 2;
  }
  const u8 = new Uint8Array(ab); let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return { wav: btoa(bin), peak, clip };
}
