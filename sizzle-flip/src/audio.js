// Fully synthesized audio: sound effects + a tiny procedural music sequencer.
// No audio files are shipped — everything is built from oscillators and noise.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Per-world music flavour: key root (MIDI), tempo, progression (scale degrees), feel.
const SONGS = {
  menu: { root: 60, bpm: 112, prog: [0, 5, 3, 4], swing: 0.12, lead: 'triangle', bassOct: -2, mel: 0.75 },
  kitchen: { root: 62, bpm: 108, prog: [0, 3, 4, 3], swing: 0.16, lead: 'triangle', bassOct: -2, mel: 0.6 },
  living: { root: 57, bpm: 96, prog: [0, 5, 1, 4], swing: 0.2, lead: 'sine', bassOct: -1, mel: 0.55, jazz: true },
  backyard: { root: 64, bpm: 116, prog: [0, 4, 5, 3], swing: 0.08, lead: 'square', bassOct: -2, mel: 0.6 },
  bathroom: { root: 65, bpm: 100, prog: [0, 3, 0, 4], swing: 0.18, lead: 'sine', bassOct: -2, mel: 0.5 },
  office: { root: 60, bpm: 104, prog: [0, 5, 3, 4], swing: 0.05, lead: 'triangle', bassOct: -2, mel: 0.55, jazz: true },
  toyroom: { root: 67, bpm: 124, prog: [0, 4, 5, 4], swing: 0.0, lead: 'square', bassOct: -2, mel: 0.7 },
  market: { root: 63, bpm: 110, prog: [0, 5, 3, 4], swing: 0.14, lead: 'triangle', bassOct: -2, mel: 0.6, jazz: true },
  beach: { root: 64, bpm: 98, prog: [0, 3, 4, 0], swing: 0.22, lead: 'sine', bassOct: -2, mel: 0.6 },
  space: { root: 58, bpm: 90, prog: [0, 5, 3, 6], swing: 0.0, lead: 'sine', bassOct: -1, mel: 0.45, space: true },
  heaven: { root: 62, bpm: 104, prog: [0, 4, 5, 3], swing: 0.1, lead: 'triangle', bassOct: -2, mel: 0.7, choir: true },
};
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTA = [0, 2, 4, 7, 9];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxOn = true;
    this.musicOn = true;
    this.song = null;
    this.chargeOsc = null;
    this.sizzleGain = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxOn ? 1.6 : 0; this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = this.musicOn ? 0.26 : 0; this.mus.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // simple reverb (feedback delay network-ish via convolver impulse)
    this.verb = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 1.6, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / ch.length, 3); }
    this.verb.buffer = ir;
    this.verbGain = ctx.createGain(); this.verbGain.gain.value = 0.18;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
    // sizzle loop
    const sz = ctx.createBufferSource(); sz.buffer = this.noiseBuf; sz.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
    const crackle = ctx.createGain(); crackle.gain.value = 0;
    this.sizzleGain = crackle;
    sz.connect(hp); hp.connect(crackle); crackle.connect(this.sfx);
    sz.start();
    if (this.pendingSong) { const s = this.pendingSong; this.pendingSong = null; this.playMusic(s); }
  }

  setSfx(on) { this.sfxOn = on; if (this.sfx) this.sfx.gain.setTargetAtTime(on ? 1.6 : 0, this.ctx.currentTime, 0.05); }
  setMusic(on) { this.musicOn = on; if (this.mus) this.mus.gain.setTargetAtTime(on ? 0.26 : 0, this.ctx.currentTime, 0.1); }
  // Silence everything while an ad is on screen (ads bring their own audio).
  duck(on) { this.ducked = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0 : 0.9, this.ctx.currentTime, 0.08); if (on) this.stopCharge(); }

  // ---- primitives
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, slide = 0, delay = 0, out = null, decay = null, vibrato = 0, filter = 0, verb = 0 } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay || dur));
    let node = o;
    if (vibrato) {
      const l = ctx.createOscillator(); l.frequency.value = 6;
      const lg = ctx.createGain(); lg.gain.value = vibrato;
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    if (filter) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; f.Q.value = 2;
      o.connect(f); node = f;
    }
    node.connect(g);
    g.connect(out || this.sfx);
    if (verb) { const vg = ctx.createGain(); vg.gain.value = verb; g.connect(vg); vg.connect(this.verb); }
    o.start(t); o.stop(t + (decay || dur) + 0.05);
  }

  noise(dur, { vol = 0.3, type = 'bandpass', freq = 1000, q = 1, slideTo = 0, delay = 0, attack = 0.003, out = null } = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out || this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  // ---- effects
  play(name, o = {}) {
    if (!this.ctx || !this.sfxOn) return;
    const p = o.power ?? 0.5;
    switch (name) {
      case 'click':
        this.tone(720, 0.07, { type: 'sine', vol: 0.25, slide: 0.5 }); break;
      case 'tap':
        this.tone(520, 0.06, { type: 'triangle', vol: 0.2, slide: 1.4 }); break;
      case 'grab':
        this.tone(330, 0.08, { type: 'triangle', vol: 0.12, slide: 1.3 }); break;
      case 'flip':
        this.noise(0.28, { vol: 0.25 + p * 0.2, freq: 500, slideTo: 2600, q: 1.4 });
        this.tone(200 + p * 120, 0.22, { type: 'sine', vol: 0.22, slide: 2.4 });
        break;
      case 'panflip':
        this.tone(410, 0.5, { type: 'triangle', vol: 0.18, decay: 0.45 });
        this.tone(1045, 0.4, { type: 'sine', vol: 0.08, decay: 0.35 });
        this.tone(1730, 0.3, { type: 'sine', vol: 0.05 });
        this.noise(0.3, { vol: 0.3 + p * 0.2, freq: 600, slideTo: 3000, q: 1.2 });
        this.noise(0.5, { vol: 0.12, type: 'highpass', freq: 4000 });
        break;
      case 'pop':
        this.tone(300, 0.12, { type: 'square', vol: 0.12, slide: 3, filter: 2000 });
        this.tone(180, 0.35, { type: 'sine', vol: 0.25, slide: 3.2, vibrato: 30 });
        this.noise(0.08, { vol: 0.3, freq: 2000 });
        break;
      case 'respawn':
        this.noise(0.25, { vol: 0.2, freq: 800, slideTo: 3000 });
        this.tone(300, 0.2, { type: 'sine', vol: 0.15, slide: 2.5, delay: 0.05 });
        break;
      case 'fail': {
        const r = o.reason;
        if (r === 'water' || r === 'flush') { this.noise(0.6, { vol: 0.5, type: 'lowpass', freq: 1800, slideTo: 300 }); this.tone(500, 0.3, { vol: 0.15, slide: 0.4 }); }
        else if (r === 'burn' || r === 'fry' || r === 'boil') { this.noise(0.9, { vol: 0.35, type: 'highpass', freq: 3000 }); }
        else if (r === 'zap') { this.tone(90, 0.5, { type: 'sawtooth', vol: 0.18, filter: 1600, vibrato: 40 }); this.noise(0.4, { vol: 0.25, freq: 3000, q: 4 }); }
        else if (r === 'dog' || r === 'cat') { this.tone(520, 0.12, { type: 'sawtooth', vol: 0.18, filter: 1200, slide: 0.7 }); this.tone(460, 0.15, { type: 'sawtooth', vol: 0.18, filter: 1200, slide: 0.6, delay: 0.16 }); }
        else this.noise(0.25, { vol: 0.4, type: 'lowpass', freq: 600 });
        // sad trombone
        [55, 54, 53].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'sawtooth', vol: 0.1, filter: 900, delay: 0.25 + i * 0.28, attack: 0.03 }));
        this.tone(NOTE(52), 0.8, { type: 'sawtooth', vol: 0.1, filter: 900, delay: 0.25 + 3 * 0.28, attack: 0.03, vibrato: 6 });
        break;
      }
      case 'win': {
        const seq = [72, 76, 79, 84];
        seq.forEach((n, i) => {
          this.tone(NOTE(n), 0.35, { type: 'triangle', vol: 0.22, delay: i * 0.09, verb: 0.4 });
          this.tone(NOTE(n + 12), 0.25, { type: 'sine', vol: 0.06, delay: i * 0.09 });
        });
        [84, 88, 91].forEach(n => this.tone(NOTE(n), 0.9, { type: 'triangle', vol: 0.12, delay: 0.42, verb: 0.5 }));
        for (let i = 0; i < 6; i++) this.tone(NOTE(96 + (i % 3) * 4), 0.12, { type: 'sine', vol: 0.05, delay: 0.5 + i * 0.06 });
        break;
      }
      case 'star':
        this.tone(NOTE(76 + (o.n || 0) * 4), 0.4, { type: 'triangle', vol: 0.25, verb: 0.5 });
        this.tone(NOTE(88 + (o.n || 0) * 4), 0.3, { type: 'sine', vol: 0.08 });
        break;
      case 'unlock':
        [67, 71, 74, 79, 83].forEach((n, i) => this.tone(NOTE(n), 0.3, { type: 'triangle', vol: 0.18, delay: i * 0.07, verb: 0.5 }));
        break;
      case 'whoosh':
        this.noise(0.35, { vol: 0.5, freq: 400, slideTo: 1800, q: 0.8 }); break;
    }
  }

  impact(mat, k, bouncy) {
    if (!this.ctx || !this.sfxOn) return;
    const v = 0.08 + k * 0.4;
    if (bouncy || mat === 'rubber') {
      this.tone(160 + k * 100, 0.32, { type: 'sine', vol: v * 0.9, slide: 3.2, vibrato: 18 });
      return;
    }
    switch (mat) {
      case 'metal': case 'ice':
        [523, 1340, 2210, 3170].forEach((f, i) => this.tone(f * (0.9 + Math.random() * 0.2), 0.5 - i * 0.08, { type: 'sine', vol: v * (0.4 - i * 0.07) }));
        this.noise(0.04, { vol: v * 0.5, freq: 3000 });
        break;
      case 'glass': case 'ceramic':
        this.tone(2400 + Math.random() * 600, 0.25, { vol: v * 0.35 });
        this.tone(3800 + Math.random() * 600, 0.18, { vol: v * 0.2 });
        this.noise(0.03, { vol: v * 0.4, freq: 5000 });
        break;
      case 'soft': case 'cloud': case 'sticky':
        this.noise(0.18, { vol: v * 0.9, type: 'lowpass', freq: 400 });
        this.tone(90, 0.15, { vol: v * 0.5, slide: 0.6 });
        if (mat === 'sticky') this.tone(300, 0.2, { type: 'triangle', vol: v * 0.3, slide: 0.4, filter: 900 });
        break;
      case 'food':
        this.noise(0.12, { vol: v * 0.8, type: 'lowpass', freq: 900 });
        this.tone(140, 0.12, { vol: v * 0.4, slide: 1.6 });
        break;
      case 'piano': {
        const base = [60, 64, 67, 72][Math.floor(Math.random() * 4)];
        [0, 4, 7].forEach(i => this.tone(NOTE(base + i), 1.0, { type: 'triangle', vol: v * 0.35, decay: 0.9, verb: 0.4 }));
        break;
      }
      case 'drum':
        this.tone(150, 0.3, { vol: v * 1.2, slide: 0.4 });
        this.noise(0.15, { vol: v * 0.6, freq: 1800 });
        break;
      case 'xylo': {
        const n = 72 + PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.5 ? 12 : 0);
        this.tone(NOTE(n), 0.5, { vol: v * 0.5, decay: 0.45, verb: 0.3 });
        this.tone(NOTE(n) * 4, 0.1, { vol: v * 0.1 });
        break;
      }
      case 'sand':
        this.noise(0.2, { vol: v * 0.6, type: 'lowpass', freq: 2500 }); break;
      case 'stone':
        this.tone(120, 0.1, { vol: v * 0.6, slide: 0.7 }); this.noise(0.08, { vol: v * 0.7, freq: 700 }); break;
      case 'floor':
        this.tone(80, 0.18, { vol: v * 0.9, slide: 0.5 }); this.noise(0.12, { vol: v * 0.6, type: 'lowpass', freq: 500 }); break;
      default: // wood, plastic, wall
        this.tone(mat === 'plastic' ? 420 : 210, 0.09, { type: 'triangle', vol: v * 0.7, slide: 0.7 });
        this.noise(0.05, { vol: v * 0.6, freq: mat === 'plastic' ? 2400 : 1300, q: 2 });
    }
    // squelch layer — the sausage itself
    this.tone(120 + Math.random() * 40, 0.1, { type: 'sine', vol: v * 0.35, slide: 1.8 });
  }

  charge(power) {
    if (!this.ctx || !this.sfxOn) return;
    const ctx = this.ctx;
    if (power < 0) { this.stopCharge(); return; }
    if (!this.chargeOsc) {
      const o = ctx.createOscillator(); o.type = 'triangle';
      const g = ctx.createGain(); g.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      o.connect(f); f.connect(g); g.connect(this.sfx); o.start();
      this.chargeOsc = o; this.chargeGain = g;
    }
    this.chargeOsc.frequency.setTargetAtTime(160 + power * 420, ctx.currentTime, 0.03);
    this.chargeGain.gain.setTargetAtTime(0.03 + power * 0.05, ctx.currentTime, 0.04);
  }

  stopCharge() {
    if (!this.chargeOsc) return;
    const o = this.chargeOsc, g = this.chargeGain;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    o.stop(this.ctx.currentTime + 0.15);
    this.chargeOsc = null;
  }

  sizzle(level) {
    if (!this.sizzleGain) return;
    const target = this.sfxOn ? level * 0.05 * (0.6 + Math.random() * 0.8) : 0;
    this.sizzleGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
  }

  // ---- music
  playMusic(name) {
    if (!this.ctx) { this.pendingSong = name; return; }
    if (this.song && this.song.name === name) return;
    this.stopMusic();
    const S = SONGS[name] || SONGS.menu;
    const song = { name, S, step: 0, next: this.ctx.currentTime + 0.1, bar: 0, seed: name.length * 7 + 3 };
    song.melody = this.makeMelody(S, song.seed);
    this.song = song;
    this.timer = setInterval(() => this.schedule(), 30);
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }

  makeMelody(S, seed) {
    let s = seed;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // 4 bars x 16 steps; melody uses pentatonic degrees relative to chord
    const bars = [];
    const motif = [];
    for (let i = 0; i < 16; i++) motif.push(rnd() < S.mel * (i % 4 === 0 ? 1.2 : i % 2 === 0 ? 0.8 : 0.35) ? Math.floor(rnd() * 5) : -1);
    for (let b = 0; b < 4; b++) {
      const bar = motif.map((d, i) => (d < 0 ? -1 : (b === 3 && i > 11 ? -1 : (d + (b % 2 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0)) % 5)));
      bars.push(bar);
    }
    return bars;
  }

  schedule() {
    const song = this.song; if (!song || !this.ctx) return;
    const S = song.S;
    const ctx = this.ctx;
    const stepDur = 60 / S.bpm / 4;
    while (song.next < ctx.currentTime + 0.15) {
      const i = song.step % 16;
      const bar = Math.floor(song.step / 16) % 4;
      let t = song.next;
      if (i % 2 === 1) t += stepDur * S.swing;
      this.musicStep(S, song, bar, i, t - ctx.currentTime, stepDur);
      song.step++;
      song.next += stepDur;
    }
  }

  musicStep(S, song, bar, i, delay, stepDur) {
    if (delay < 0) delay = 0;
    const out = this.mus;
    const deg = S.prog[bar];
    const chordRoot = S.root + MAJOR[deg % 7] + (deg >= 7 ? 12 : 0);
    const third = S.root + MAJOR[(deg + 2) % 7] + ((deg + 2) >= 7 ? 12 : 0);
    const fifth = S.root + MAJOR[(deg + 4) % 7] + ((deg + 4) >= 7 ? 12 : 0);
    const seventh = S.root + MAJOR[(deg + 6) % 7] + ((deg + 6) >= 7 ? 12 : 0);
    // drums
    if (!S.space) {
      if (i === 0 || i === 8 || (i === 10 && bar % 2)) {
        this.tone(140, 0.18, { vol: 0.38, slide: 0.35, delay, out });
      }
      if (i === 4 || i === 12) this.noise(0.12, { vol: 0.16, freq: 1800, q: 0.7, delay, out });
      if (i % 2 === 0) this.noise(0.04, { vol: 0.05, type: 'highpass', freq: 7000, delay, out });
    } else if (i === 0) {
      this.noise(1.6, { vol: 0.05, type: 'bandpass', freq: 600, slideTo: 2400, q: 6, delay, out });
    }
    // bass
    if (i % 4 === 0 || (i === 14)) {
      const n = chordRoot + 12 * S.bassOct + (i === 8 ? 7 : 0);
      this.tone(NOTE(n), stepDur * 3, { type: 'triangle', vol: 0.32, delay, out, attack: 0.01 });
    }
    // chord stabs (off-beats)
    if (i === 2 || i === 6 || i === 10 || i === 14 || (S.space && i === 0)) {
      const dur = S.space ? stepDur * 15 : stepDur * 1.4;
      const notes = S.jazz ? [third, fifth, seventh] : [chordRoot, third, fifth];
      notes.forEach(n => this.tone(NOTE(n), dur, { type: S.choir ? 'sine' : 'square', vol: S.space ? 0.035 : 0.03, filter: 1600, delay, out, attack: S.space ? 0.4 : 0.01 }));
    }
    // melody
    const md = song.melody[bar][i];
    if (md >= 0) {
      const n = S.root + 12 + PENTA[md];
      this.tone(NOTE(n), stepDur * 1.8, { type: S.lead, vol: S.lead === 'square' ? 0.05 : 0.11, filter: S.lead === 'square' ? 2200 : 0, delay, out, verb: 0.25 });
    }
  }
}
