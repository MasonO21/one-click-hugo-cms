/*
 * Rainkeep — procedural audio (window.KHAudio)
 *
 * Pure Web Audio: no files, no libraries, no network. Every public method is
 * wrapped so it never throws; without Web Audio they are all silent no-ops.
 *
 *   one-shots ─→ sfx ─────┐
 *   wind + water ─→ amb ──┼─→ master → compressor → speakers
 *   pad + bells ─→ music ─┤
 *   music/chime sends ─→ feedback-delay "reverb" ─┘
 *
 * The `music` flag gates both the generative music and the ambience bed
 * (desert wind + the wyrm's spring); the `sfx` flag gates one-shots.
 */
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var dead = !AC;                       // true → everything is a no-op
  var resumeAt = 0;                     // ms timestamp of the last resume() request
  var flags = { sfx: true, music: true };
  var amb = { weather: 'clear', mist: 'steady', active: true };
  var gateOn = false;                   // last applied bed state
  var N = {};                           // long-lived nodes
  var buf = {};                         // noise buffers (made once)
  var lastSfx = {};
  var hideTimer = null;
  var sched = { pop: 0, flick: 0, gust: 0, chord: 0, chordIdx: 0, bell: 0, lastBell: 0 };

  // Overall level trims (calibrated so SFX peak near -12 dBFS, bed sits well under).
  var LVL = { master: 0.8, wind: 3.5, rumble: 0.07, pop: 0.09, pad: 0.012, bell: 0.013 };

  var WEATHER = {
    //           gain    centre   Q     LFO depth (Hz, Q)   gust range
    clear:      { g: 0.02, f: 380,  q: 0.8, fd: 110, qd: 0.2, gust: [0.85, 1.15] },
    haze:       { g: 0.04, f: 480,  q: 1.0, fd: 170, qd: 0.3, gust: [0.75, 1.3] },
    sandstorm:   { g: 0.11, f: 640,  q: 0.9, fd: 300, qd: 0.4, gust: [0.5, 1.9] },
    heatwave: { g: 0.07, f: 1350, q: 3.2, fd: 420, qd: 1.0, gust: [0.7, 1.35] },
    rain:       { g: 0.06, f: 2600, q: 0.45, fd: 500, qd: 0.1, gust: [0.85, 1.2] }
  };
  var MIST = {
    //        drips/s  drip level  stream  stream centre (Hz)
    off:     { rate: 0,   pop: 0,    rumble: 0,    lp: 700 },
    low:     { rate: 1.2, pop: 0.6,  rumble: 0.35, lp: 900 },
    steady:  { rate: 2.6, pop: 0.8,  rumble: 0.6,  lp: 1200 },
    high:    { rate: 5.5, pop: 1.0,  rumble: 1.0,  lp: 1700 }
  };
  // D Hijaz palette (MIDI): D Eb F# G A Bb C, one chord every CHORD_LEN seconds.
  var PROG = [
    [50, 54, 57], [43, 58, 62], [48, 55, 63], [50, 57, 62],   // D  Gm  Cm(add)  D5
    [46, 53, 58], [43, 55, 62], [48, 51, 55], [50, 54, 57]    // Bb Gm  Cm       D
  ];
  var BELLS = [74, 75, 78, 79, 81, 82, 84, 86];               // D Eb F# G A Bb C D (Hijaz)
  var CHORD_LEN = 8;

  // ---------- tiny helpers ----------
  function noop() {}
  function rand(a, b) { return a + Math.random() * (b - a); }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function nowMs() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function isHidden() { return typeof document !== 'undefined' && !!document.hidden; }
  function quiet(p) { if (p && typeof p.then === 'function') p.then(noop, noop); }
  function has(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
  function ramp(param, v, tc) { param.setTargetAtTime(v, ctx.currentTime, tc); }
  function gainNode(v, dest) { var g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function filt(type, f, q, dest) {
    var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7;
    if (dest) b.connect(dest);
    return b;
  }
  function osc(type, f) { var o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; return o; }
  function loopSrc(b) { var s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s; }
  function lfo(rate, depth, param) {
    var o = osc('sine', rate), g = gainNode(depth);
    o.connect(g); g.connect(param); o.start();
    return g;
  }
  // Disconnect a finished source and the nodes that only it fed.
  function cleanup(src, nodes) {
    src.onended = function () {
      try { src.disconnect(); for (var i = 0; i < nodes.length; i++) nodes[i].disconnect(); } catch (e) { /* ignore */ }
    };
  }
  // attack → optional hold → exponential decay; returns the end time.
  function env(param, t, peak, a, h, d) {
    peak = Math.max(peak, 0.0002);
    param.setValueAtTime(0, t);
    param.linearRampToValueAtTime(peak, t + a);
    if (h) param.setValueAtTime(peak, t + a + h);
    param.exponentialRampToValueAtTime(0.0001, t + a + h + d);
    return t + a + h + d;
  }

  // ---------- noise buffers ----------
  function makeNoise(seconds, kind) {
    var sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    var b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, last = 0, i, w, mean = 0, peak = 0;
    for (i = 0; i < len; i++) {
      w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last; }
      else if (kind === 'pink') {          // Paul Kellet's economy pink filter
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      } else d[i] = w;
    }
    if (kind !== 'white') {                // remove start→end drift so the loop is seamless, then centre
      var drift = d[len - 1] - d[0];
      for (i = 0; i < len; i++) { d[i] -= drift * i / (len - 1); mean += d[i]; }
      mean /= len;
      for (i = 0; i < len; i++) d[i] -= mean;
    }
    for (i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (i = 0; i < len; i++) d[i] *= 0.9 / (peak || 1);
    return b;
  }

  // ---------- graph ----------
  function build() {
    var i;
    buf.white = makeNoise(2, 'white');
    buf.pink = makeNoise(4, 'pink');
    buf.brown = makeNoise(5, 'brown');

    N.comp = ctx.createDynamicsCompressor();
    N.comp.threshold.value = -12; N.comp.knee.value = 10; N.comp.ratio.value = 3.5;
    N.comp.attack.value = 0.004; N.comp.release.value = 0.25;
    N.comp.connect(ctx.destination);
    N.master = gainNode(LVL.master, N.comp);
    N.sfx = gainNode(flags.sfx ? 1 : 0, N.master);

    // "Reverb": three cross-coupled damped delays, lightly spread in stereo.
    N.verbIn = gainNode(1);
    N.verbOut = gainNode(0.32, N.master);
    var pre = filt('lowpass', 3000, 0.5);
    N.verbIn.connect(pre);
    var times = [0.137, 0.211, 0.293], pans = [-0.6, 0, 0.6], dl = [];
    for (i = 0; i < 3; i++) { dl[i] = ctx.createDelay(1); dl[i].delayTime.value = times[i]; pre.connect(dl[i]); }
    for (i = 0; i < 3; i++) {
      var fb = gainNode(0.55, dl[(i + 1) % 3]);
      dl[i].connect(filt('lowpass', 2400, 0.5, fb));
      var out = N.verbOut;
      if (ctx.createStereoPanner) { out = ctx.createStereoPanner(); out.pan.value = pans[i]; out.connect(N.verbOut); }
      dl[i].connect(out);
    }
    N.send = gainNode(0.3, N.verbIn);         // chime-type SFX send

    // Ambience bed: wind (looped pink noise → drifting bandpass) + the spring (a bandpassed trickle + drips).
    N.amb = gainNode(0, N.master);
    N.gust = gainNode(1, N.amb);
    N.wind = gainNode(0, N.gust);
    N.windF = filt('bandpass', WEATHER.clear.f, WEATHER.clear.q, N.wind);
    N.windFD = lfo(0.07, WEATHER.clear.fd, N.windF.frequency);
    N.windQD = lfo(0.045, WEATHER.clear.qd, N.windF.Q);
    var ws = loopSrc(buf.pink); ws.connect(N.windF); ws.start(0, rand(0, 3));

    N.fire = gainNode(LVL.pop, N.amb);        // water drips land here
    N.rumble = gainNode(0, N.amb);
    N.flick = gainNode(1, N.rumble);
    N.rumbleF = filt('bandpass', 1200, 0.9, N.flick);
    var rs = loopSrc(buf.pink); rs.connect(N.rumbleF); rs.start(0, rand(0, 4));

    // Music: pad through a slowly breathing lowpass, bells direct; all sent to the reverb.
    N.music = gainNode(0, N.master);
    N.music.connect(gainNode(0.45, N.verbIn));
    N.pad = filt('lowpass', 1100, 0.5, N.music);
    lfo(0.04, 250, N.pad.frequency);
  }

  // ---------- state appliers ----------
  function bedWanted() { return !!ctx && flags.music && amb.active && !isHidden(); }

  function applyGate() {
    var on = bedWanted();
    if (!N.amb || on === gateOn) return;
    gateOn = on;
    ramp(N.amb.gain, on ? 1 : 0, 0.2);       // ~0.6s to settle
    ramp(N.music.gain, on ? 1 : 0, 0.2);
  }
  function applyWeather() {
    var W = WEATHER[amb.weather];
    ramp(N.wind.gain, W.g * LVL.wind * Math.sqrt(W.q), 0.6);  // ~2s crossfade; sqrt(Q) keeps narrow bands audible
    ramp(N.windF.frequency, W.f, 0.7);
    ramp(N.windF.Q, W.q, 0.7);
    ramp(N.windFD.gain, W.fd, 0.7);
    ramp(N.windQD.gain, W.qd, 0.7);
    ramp(N.gust.gain, 1, 0.7);
    sched.gust = ctx.currentTime + 2;        // let the crossfade land before gusting
  }
  function applyMist() {
    var B = MIST[amb.mist];
    ramp(N.rumble.gain, B.rumble * LVL.rumble, 0.8);
    ramp(N.rumbleF.frequency, B.lp, 0.8);
  }

  // ---------- water drips ----------
  function pop(t, lvl) {                     // a drop hitting the spring: a sine that chirps upward
    var o = osc('sine', 600), g = ctx.createGain(), f = filt('bandpass', rand(1100, 2200), 1.1), d = rand(0.03, 0.09);
    o.frequency.setValueAtTime(rand(380, 760), t);
    o.frequency.exponentialRampToValueAtTime(rand(1300, 2600), t + d);
    var end = env(g.gain, t, lvl * rand(0.25, 0.8), 0.002, 0, d);
    o.connect(f); f.connect(g); g.connect(N.fire);
    o.start(t); o.stop(end + 0.02);
    cleanup(o, [f, g]);
  }

  // ---------- music ----------
  function padChord(notes, t) {
    for (var i = 0; i < notes.length; i++) {
      var f = mtof(notes[i]), lvl = LVL.pad * (i === 0 ? 1.1 : 0.85), g = ctx.createGain();
      var a = osc('triangle', f), b = osc('sine', f), stopAt = t + CHORD_LEN + 3.6;
      a.detune.value = -5; b.detune.value = 6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(lvl, t + 3);
      g.gain.setValueAtTime(lvl, t + CHORD_LEN);
      g.gain.linearRampToValueAtTime(0, t + CHORD_LEN + 3.5);
      a.connect(g); b.connect(g); g.connect(N.pad);
      a.start(t); b.start(t); a.stop(stopAt); b.stop(stopAt);
      cleanup(a, [g]); cleanup(b, []);
    }
  }
  function bellNote(t) {
    var i;
    do { i = Math.floor(Math.random() * BELLS.length); } while (i === sched.lastBell);
    sched.lastBell = i;
    bell(BELLS[i], t, LVL.bell, rand(1.8, 2.8), N.music);
    if (Math.random() < 0.25 && i > 0) bell(BELLS[i - 1], t + rand(0.3, 0.5), LVL.bell * 0.7, 2, N.music);
  }

  // ---------- lookahead scheduler (runs every 100ms) ----------
  function tick() {
    if (!ctx || ctx.state !== 'running' || !gateOn) return;
    var t = ctx.currentTime, ahead = t + 0.25, B = MIST[amb.mist], W = WEATHER[amb.weather], k;
    if (B.rate > 0) {
      if (sched.pop < t - 0.3) sched.pop = t + 0.02;
      while (sched.pop < ahead) {
        pop(sched.pop, B.pop);
        if (Math.random() < 0.12) for (k = 1; k <= 1 + Math.floor(Math.random() * 3); k++) pop(sched.pop + k * rand(0.015, 0.05), B.pop * rand(0.4, 0.8));
        sched.pop += Math.max(0.012, -Math.log(1 - Math.random()) / B.rate);
      }
      if (t >= sched.flick) { N.flick.gain.setTargetAtTime(rand(0.7, 1.25), t, rand(0.15, 0.5)); sched.flick = t + rand(0.3, 1.2); }
    }
    if (t >= sched.gust) {                   // slow random swells; sandstorms gust harder and more often
      var gl = rand(W.gust[0], W.gust[1]);
      N.gust.gain.setTargetAtTime(gl, t, rand(0.5, 1.4));
      N.windF.frequency.setTargetAtTime(W.f * (0.8 + 0.2 * gl), t, 1.2);
      sched.gust = t + (amb.weather === 'sandstorm' ? rand(1.2, 3.5) : rand(2.5, 6));
    }
    if (sched.chord < t - 0.3) sched.chord = t + 0.05;
    while (sched.chord < ahead) { padChord(PROG[sched.chordIdx++ % PROG.length], sched.chord); sched.chord += CHORD_LEN; }
    if (sched.bell < t - 0.3) sched.bell = t + rand(1.5, 3);
    if (sched.bell < ahead) { bellNote(sched.bell); sched.bell += rand(2, 6); }
  }

  // ---------- SFX building blocks ----------
  // o: { f, f2, glide, type, t, a, h, d, g, lp, lp2, q, detune, dest, send }
  function tone(o) {
    var t = o.t, a = o.a || 0.005, h = o.h || 0, o1 = osc(o.type, o.f), g = ctx.createGain(), f = null;
    if (o.detune) o1.detune.value = o.detune;
    o1.frequency.setValueAtTime(o.f, t);
    if (o.f2) o1.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || a + h + o.d));
    var end = env(g.gain, t, o.g, a, h, o.d);
    if (o.lp) {
      f = filt('lowpass', o.lp, o.q); o1.connect(f); f.connect(g);
      if (o.lp2) { f.frequency.setValueAtTime(o.lp, t); f.frequency.exponentialRampToValueAtTime(o.lp2, end); }
    } else o1.connect(g);
    g.connect(o.dest || N.sfx);
    if (o.send) g.connect(N.send);
    o1.start(t); o1.stop(end + 0.05);
    cleanup(o1, f ? [f, g] : [g]);
    return { osc: o1, filter: f };
  }
  // o: { t, a, h, d, g, type, f, f2, q, src, send }
  function noise(o) {
    var t = o.t, s = ctx.createBufferSource(), f = filt(o.type || 'bandpass', o.f, o.q), g = ctx.createGain();
    s.buffer = buf[o.src || 'white']; s.loop = true;
    var end = env(g.gain, t, o.g, o.a || 0.003, o.h || 0, o.d);
    if (o.f2) { f.frequency.setValueAtTime(o.f, t); f.frequency.exponentialRampToValueAtTime(o.f2, end); }
    s.connect(f); f.connect(g); g.connect(N.sfx);
    if (o.send) g.connect(N.send);
    s.start(t, rand(0, 1.5)); s.stop(end + 0.05);
    cleanup(s, [f, g]);
  }
  function bell(m, t, g, d, dest) {
    var f = mtof(m), send = !dest;
    tone({ f: f, t: t, a: 0.004, d: d, g: g, dest: dest, send: send });
    tone({ f: f * 2, t: t, a: 0.003, d: d * 0.45, g: g * 0.28, dest: dest, send: send });
    tone({ f: f * 3.01, t: t, a: 0.002, d: d * 0.22, g: g * 0.1, dest: dest, send: send });
  }
  function brass(m, t, h, d, g) {
    tone({ type: 'sawtooth', f: mtof(m), t: t, a: 0.025, h: h, d: d, g: g, lp: 1800, lp2: 700, q: 0.8, send: true });
    tone({ type: 'triangle', f: mtof(m), t: t, a: 0.02, h: h, d: d, g: g * 0.8, detune: 6, send: true });
  }
  function knock(t, v) {
    tone({ f: 190, f2: 85, t: t, a: 0.002, d: 0.13, g: 0.36 * v });
    tone({ type: 'triangle', f: 540, f2: 400, t: t, a: 0.001, d: 0.05, g: 0.09 * v });
    noise({ t: t, a: 0.001, d: 0.045, g: 0.28 * v, type: 'bandpass', f: 1100, q: 1.4 });
  }
  function drum(t, v) {
    tone({ f: 110, f2: 42, glide: 0.3, t: t, a: 0.003, d: 0.5, g: 0.55 * v, send: true });
    tone({ type: 'triangle', f: 220, f2: 90, t: t, a: 0.002, d: 0.08, g: 0.1 * v });
    noise({ t: t, a: 0.002, d: 0.09, g: 0.22 * v, type: 'lowpass', f: 700, src: 'pink' });
  }
  var shaperCurve = null;
  function getCurve() {
    if (!shaperCurve) {
      shaperCurve = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) shaperCurve[i] = Math.tanh(1.6 * (i / 511.5 - 1));
    }
    return shaperCurve;
  }

  // ---------- one-shot SFX ----------
  var SFX = {
    tap: function (t) {
      tone({ f: 1500, f2: 1050, t: t, a: 0.002, d: 0.04, g: 0.11 });
    },
    build: function (t) { knock(t, 0.62); knock(t + 0.13, 0.34); },
    complete: function (t) { bell(72, t, 0.14, 1.0); bell(77, t + 0.14, 0.14, 1.3); },
    upgrade: function (t) { bell(77, t, 0.11, 0.6); bell(81, t + 0.09, 0.11, 0.7); bell(84, t + 0.18, 0.12, 1.2); },
    coin: function (t) {
      tone({ f: mtof(95), t: t, a: 0.002, d: 0.12, g: 0.12, send: true });
      tone({ f: mtof(100), t: t + 0.055, a: 0.002, d: 0.38, g: 0.14, send: true });
      noise({ t: t + 0.03, a: 0.01, d: 0.16, g: 0.035, type: 'highpass', f: 7500 });
    },
    claim: function (t) {
      SFX.coin(t + 0.05);
      tone({ type: 'triangle', f: mtof(83), t: t + 0.05, a: 0.004, d: 0.35, g: 0.06, send: true });
      tone({ type: 'triangle', f: mtof(88), t: t + 0.105, a: 0.004, d: 0.55, g: 0.06, send: true });
      noise({ t: t, a: 0.16, d: 0.22, g: 0.06, type: 'bandpass', f: 400, f2: 2600, q: 0.9, src: 'pink' });
    },
    recruit: function (t) {
      var seq = [74, 77, 81, 84, 86, 89, 93];
      for (var i = 0; i < seq.length; i++) bell(seq[i], t + i * 0.07, 0.08, 0.45 + i * 0.06);
      noise({ t: t, a: 0.45, d: 0.5, g: 0.03, type: 'highpass', f: 5000 });
    },
    legendary: function (t) {
      var seq = [74, 78, 81, 86, 90, 93, 98], i, s;             // D major: golden
      for (i = 0; i < seq.length; i++) {
        s = t + 0.15 + i * 0.065;
        bell(seq[i], s, 0.055, 0.7 + i * 0.07);
        tone({ type: 'triangle', f: mtof(seq[i]), detune: 9, t: s, a: 0.01, d: 0.6, g: 0.022, send: true });
      }
      var sw = [mtof(38), mtof(45)];                           // low D2 + A2 swell
      for (i = 0; i < 2; i++) {
        var lp = tone({ type: 'sawtooth', f: sw[i], t: t, a: 0.7, h: 0.3, d: 0.75, g: 0.08, lp: 150, q: 1 }).filter;
        lp.frequency.setValueAtTime(150, t); lp.frequency.linearRampToValueAtTime(900, t + 0.8);
        lp.frequency.exponentialRampToValueAtTime(180, t + 1.75);
      }
      tone({ f: mtof(50), t: t, a: 0.6, h: 0.3, d: 0.85, g: 0.08 });
      noise({ t: t + 0.1, a: 0.6, d: 1.0, g: 0.03, type: 'highpass', f: 6500 });
    },
    hit: function (t) {
      noise({ t: t, a: 0.002, d: 0.11, g: 0.15, type: 'lowpass', f: 3500, f2: 500 });
      tone({ f: 150, f2: 48, t: t, a: 0.003, d: 0.2, g: 0.22 });
    },
    hurt: function (t) {
      noise({ t: t, a: 0.004, d: 0.16, g: 0.11, type: 'lowpass', f: 1000, f2: 250, src: 'pink' });
      tone({ f: 95, f2: 40, t: t, a: 0.006, d: 0.26, g: 0.21 });
      tone({ type: 'triangle', f: 190, f2: 120, t: t, a: 0.004, d: 0.1, g: 0.03 });
    },
    victory: function (t) {
      brass(74, t, 0.04, 0.08, 0.06); brass(78, t + 0.12, 0.04, 0.08, 0.06);
      brass(81, t + 0.24, 0.04, 0.08, 0.06); brass(86, t + 0.38, 0.35, 0.45, 0.075);
      var ch = [62, 66, 69];
      for (var i = 0; i < 3; i++) tone({ type: 'triangle', f: mtof(ch[i]), t: t + 0.38, a: 0.03, h: 0.3, d: 0.45, g: 0.04, send: true });
    },
    defeat: function (t) {
      var seq = [69, 67, 65, 62];                               // A G F D
      for (var i = 0; i < 4; i++) {
        var last = i === 3;
        tone({ type: 'triangle', f: mtof(seq[i]), t: t + i * 0.2, a: 0.03, h: last ? 0.2 : 0.06, d: last ? 0.6 : 0.22, g: 0.1, lp: 1400, send: true });
      }
      tone({ f: mtof(50), t: t + 0.6, a: 0.1, h: 0.15, d: 0.55, g: 0.07 });
    },
    warn: function (t) {
      tone({ type: 'triangle', f: 220, t: t, a: 0.01, h: 0.05, d: 0.09, g: 0.14, lp: 900 });
      tone({ type: 'triangle', f: 196, t: t + 0.17, a: 0.01, h: 0.05, d: 0.12, g: 0.14, lp: 900 });
    },
    error: function (t) {
      tone({ type: 'square', f: 110, t: t, a: 0.004, h: 0.05, d: 0.04, g: 0.06, lp: 650 });
      tone({ type: 'square', f: 116, t: t, a: 0.004, h: 0.05, d: 0.04, g: 0.045, lp: 650 });
    },
    storm: function (t) {                                       // distant horn, glides up then droops
      var h1 = tone({ type: 'sawtooth', f: 92, f2: 110, glide: 0.45, t: t, a: 0.35, h: 0.55, d: 0.55, g: 0.13, lp: 420, q: 1.2, send: true }).osc;
      var h2 = tone({ type: 'triangle', f: 138, f2: 165, glide: 0.45, t: t, a: 0.4, h: 0.5, d: 0.55, g: 0.06, lp: 600, send: true }).osc;
      h1.frequency.setValueAtTime(110, t + 1.0); h1.frequency.linearRampToValueAtTime(103, t + 1.45);
      h2.frequency.setValueAtTime(165, t + 1.0); h2.frequency.linearRampToValueAtTime(154.5, t + 1.45);
      noise({ t: t, a: 0.4, h: 0.4, d: 0.6, g: 0.03, type: 'bandpass', f: 300, q: 0.7, src: 'pink' });
    },
    pet: function (t) {                                         // contented hum: noise + body, amplitude-modulated ~23Hz
      var s = loopSrc(buf.brown), lp = filt('lowpass', 320, 0.9), am = gainNode(0.5), g = ctx.createGain();
      var mod = osc('sine', 21), depth = gainNode(0.5), body = osc('triangle', 48), bg = gainNode(0.3, am);
      mod.frequency.setValueAtTime(21, t); mod.frequency.linearRampToValueAtTime(26, t + 0.8);
      body.frequency.setValueAtTime(48, t); body.frequency.linearRampToValueAtTime(56, t + 0.4);
      body.frequency.linearRampToValueAtTime(50, t + 0.8);
      mod.connect(depth); depth.connect(am.gain); body.connect(bg);
      s.connect(lp); lp.connect(am); am.connect(g); g.connect(N.sfx);
      var end = env(g.gain, t, 0.3, 0.15, 0.35, 0.3) + 0.05;
      s.start(t, rand(0, 2)); mod.start(t); body.start(t);
      s.stop(end); mod.stop(end); body.stop(end);
      cleanup(s, [lp, am, g]); cleanup(mod, [depth]); cleanup(body, [bg]);
    },
    roar: function (t) {                                        // the wyrm's call: a whale-like glide over a splash
      var sh = ctx.createWaveShaper(), lp = filt('lowpass', 1800, 2), am = gainNode(0.75), g = ctx.createGain();
      var vib = osc('sine', 5.5), depth = gainNode(9), s1 = osc('triangle', 220), s2 = osc('sine', 331);
      sh.curve = getCurve();
      s1.frequency.setValueAtTime(196, t); s1.frequency.exponentialRampToValueAtTime(330, t + 0.55); s1.frequency.exponentialRampToValueAtTime(147, t + 1.6);
      s2.frequency.setValueAtTime(294, t); s2.frequency.exponentialRampToValueAtTime(495, t + 0.55); s2.frequency.exponentialRampToValueAtTime(220, t + 1.6);
      vib.connect(depth); depth.connect(s1.frequency); depth.connect(s2.frequency);
      s1.connect(sh); s2.connect(sh); sh.connect(lp); lp.connect(am); am.connect(g);
      g.connect(N.sfx); g.connect(N.send);
      var end = env(g.gain, t, 0.11, 0.15, 0.5, 1.1) + 0.05;
      s1.start(t); s2.start(t); vib.start(t); s1.stop(end); s2.stop(end); vib.stop(end);
      cleanup(s1, [sh, lp, am, g]); cleanup(s2, []); cleanup(vib, [depth]);
      noise({ t: t, a: 0.02, h: 0.1, d: 0.7, g: 0.08, type: 'bandpass', f: 2600, f2: 600, q: 0.6, src: 'pink', send: true });
      tone({ f: 70, f2: 45, t: t, a: 0.08, h: 0.2, d: 0.9, g: 0.08 });
    },
    raid: function (t) { drum(t, 0.42); drum(t + 0.3, 0.5); },
    chime: function (t) { bell(81, t, 0.07, 0.9); bell(86, t + 0.11, 0.06, 1.1); },
    thunder: function (t) {                                     // a soft crack, then a long rolling rumble
      noise({ t: t, a: 0.005, d: 0.25, g: 0.12, type: 'lowpass', f: 2400, f2: 400 });
      noise({ t: t + 0.08, a: 0.25, h: 0.5, d: 2.2, g: 0.2, type: 'lowpass', f: 260, f2: 70, src: 'brown' });
      tone({ f: 55, f2: 38, t: t + 0.1, a: 0.3, h: 0.4, d: 1.6, g: 0.07 });
    }
  };

  // ---------- public API ----------
  function resume() {
    if (!ctx.resume) return;
    resumeAt = nowMs();
    var p = ctx.resume();
    if (p && typeof p.then === 'function') p.then(function () { resumeAt = 0; }, function () { resumeAt = 0; });
  }
  function unlock() {                        // iOS/Safari: play one silent sample inside the gesture
    var s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.onended = function () { try { s.disconnect(); } catch (e) { /* ignore */ } };
    s.start(0);
  }
  function init() {
    if (dead) return;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; dead = true; return; }
      }
      try {
        build();
        applyWeather(); applyMist(); applyGate();
        setInterval(function () { try { tick(); } catch (e) { /* never throw */ } }, 100);
      } catch (e3) {
        dead = true; quiet(ctx.close && ctx.close()); ctx = null; return;
      }
    }
    if (ctx.state !== 'running') { unlock(); resume(); }
  }
  function setEnabled(o) {
    if (!o || typeof o !== 'object') return;
    if (o.sfx !== undefined) flags.sfx = !!o.sfx;
    if (o.music !== undefined) flags.music = !!o.music;
    if (!ctx || dead) return;
    ramp(N.sfx.gain, flags.sfx ? 1 : 0, 0.05);
    applyGate();
  }
  function setAmbience(o) {
    if (!o || typeof o !== 'object') return;
    var w = has(WEATHER, o.weather) && o.weather !== amb.weather;
    var b = has(MIST, o.mist) && o.mist !== amb.mist;
    if (w) amb.weather = o.weather;
    if (b) amb.mist = o.mist;
    if (o.active !== undefined) amb.active = !!o.active;
    if (!ctx || dead) return;
    if (w) applyWeather();
    if (b) applyMist();
    applyGate();
  }
  function playSfx(name) {
    if (!ctx || dead || !flags.sfx || isHidden() || !has(SFX, name)) return;
    if (ctx.state !== 'running' && !(resumeAt && nowMs() - resumeAt < 500)) return;
    var ms = nowMs();
    if (lastSfx[name] && ms - lastSfx[name] < 60) return;
    lastSfx[name] = ms;
    SFX[name](ctx.currentTime + 0.01);
  }
  function getState() {
    return { ready: !!ctx && !dead && ctx.state === 'running', sfx: flags.sfx, music: flags.music };
  }

  // Page visibility: fade the bed out when hidden, suspend once silent, fade back in on return.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      try {
        if (!ctx || dead) return;
        applyGate();
        clearTimeout(hideTimer);
        if (isHidden()) {
          hideTimer = setTimeout(function () {
            try { if (isHidden() && ctx.state === 'running' && ctx.suspend) quiet(ctx.suspend()); } catch (e) { /* ignore */ }
          }, 1500);
        } else if (ctx.state === 'suspended') resume();
      } catch (e) { /* never throw */ }
    });
  }

  function guard(fn, fallback) {
    return function () {
      try { return fn.apply(null, arguments); } catch (e) { return fallback ? fallback() : undefined; }
    };
  }
  window.KHAudio = {
    init: guard(init),
    setEnabled: guard(setEnabled),
    sfx: guard(playSfx),
    setAmbience: guard(setAmbience),
    state: guard(getState, function () { return { ready: false, sfx: flags.sfx, music: flags.music }; })
  };
})();
