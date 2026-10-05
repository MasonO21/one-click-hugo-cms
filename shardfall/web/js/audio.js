/* Generative background music: a calm lobby theme and a driving match theme, synthesized live. */
(function (SF) {
  const hz = n => 440 * Math.pow(2, (n - 69) / 12);
  const TRACKS = {
    lobby: { bpm: 84, bars: 2, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], pad: 0.03, arp: 0.03 },
    match: { bpm: 116, bars: 2, chords: [[50, 53, 57], [46, 50, 53], [53, 57, 60], [48, 52, 55]], pad: 0.018, bass: 0.045, drums: true }
  };
  const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
  let ac = null, master = null, noiseBuf = null, cur = null, want = null, timer = 0, step = 0, nextT = 0;

  function ensure() {
    ac = SF.sfx && SF.sfx.ctx ? SF.sfx.ctx() : null;
    if (!ac) return false;
    if (!master) { master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination); }
    return true;
  }
  const enabled = () => !SF.store.d || SF.store.d.settings.music !== false;

  function tone(freq, t, dur, type, vol, cutoff) {
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.12, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hat(t, vol) {
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.06);
  }
  function kick(t) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.22);
  }

  function schedule() {
    if (!cur || !ac) return;
    const tr = TRACKS[cur], s16 = 60 / tr.bpm / 4, perChord = 16 * tr.bars;
    while (nextT < ac.currentTime + 0.3) {
      const ch = tr.chords[Math.floor(step / perChord) % tr.chords.length], i = step % 16;
      if (step % perChord === 0) ch.forEach(n => { tone(hz(n), nextT, s16 * perChord, 'sawtooth', tr.pad, 800); tone(hz(n) * 1.005, nextT, s16 * perChord, 'sawtooth', tr.pad * 0.7, 800); });
      if (tr.arp && i % 2 === 0) tone(hz(ch[ARP[(i / 2) % 8]] + 12), nextT, s16 * 1.8, 'triangle', tr.arp, 3200);
      if (tr.bass && i % 2 === 0) tone(hz(ch[0] - 24), nextT, s16 * 1.5, 'square', tr.bass, 420);
      if (tr.drums) { if (i % 8 === 0) kick(nextT); if (i % 4 === 2) hat(nextT, 0.025); }
      nextT += s16; step++;
    }
  }

  SF.music = {
    // name: 'lobby' | 'match'. Starts once audio has been unlocked by a tap.
    play(name) { want = name; this.resume(); },
    resume() {
      if (!want || !enabled() || !ensure() || document.hidden) { this.halt(); return; }
      if (cur === want) return;
      cur = want; step = 0; nextT = ac.currentTime + 0.1;
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(1, ac.currentTime, 0.6);
      clearInterval(timer); timer = setInterval(schedule, 60);
    },
    halt() {
      if (master && ac) { master.gain.cancelScheduledValues(ac.currentTime); master.gain.setTargetAtTime(0, ac.currentTime, 0.15); }
      clearInterval(timer); timer = 0; cur = null;
    },
    stop() { want = null; this.halt(); }
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? SF.music.halt() : SF.music.resume()));
})(window.SF);
