#!/usr/bin/env python3
"""Original 30-second soundtrack for the trailer, synthesized from scratch (no samples, no licensed music).

150 BPM: one beat is 0.4 s, one bar is 1.6 s. The hits line up with the text slams in make_trailer.js.
  python3 tools/trailer/music.py out.wav
"""
import sys, wave
import numpy as np

SR = 48000
DUR = 30.0
BPM = 150
BEAT = 60 / BPM
BAR = BEAT * 4
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)


def t_(n): return np.arange(n) / SR


def put(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * (1 - max(0, pan))
    R[i:i + len(sig)] += sig * (1 + min(0, pan))


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or a per-sample array (for sweeps)."""
    a = np.broadcast_to(np.exp(-2 * np.pi * np.asarray(cutoff, dtype=float) / SR), x.shape)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc; y[i] = acc
    return y


def highpass(x, cutoff): return x - lowpass(x, cutoff)


def kick():
    t = t_(int(.42 * SR)); f = 45 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7.5) + .25 * np.sin(ph * 2) * np.exp(-t * 30)


def clap():
    t = t_(int(.22 * SR)); n = rng.standard_normal(len(t))
    n = highpass(lowpass(n, 5000), 900)
    env = np.exp(-t * 18) * (1 + .6 * (np.sin(2 * np.pi * 90 * t) > 0) * np.exp(-t * 60))
    return n * env * 1.8 + .3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25)


def hat(open_=False):
    t = t_(int((.16 if open_ else .045) * SR)); n = highpass(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (18 if open_ else 90)) * .55


def saw(freq, dur, detune=0.0):
    t = t_(int(dur * SR)); out = np.zeros_like(t)
    for d in (-detune, 0, detune):
        out += 2 * ((t * freq * (1 + d)) % 1) - 1
    return out / 3


def bass(freq, dur=BEAT * .5):
    x = saw(freq, dur, .003) + .6 * np.sin(2 * np.pi * freq * t_(int(dur * SR)))
    t = t_(len(x)); return lowpass(x, 420) * np.minimum(1, t * 400) * np.exp(-t * 3)


def stab(freqs, dur=.32):
    x = sum(saw(f, dur, .006) for f in freqs) / len(freqs)
    t = t_(len(x)); return lowpass(x, 2600) * np.exp(-t * 9) * np.minimum(1, t * 800)


def siren(at, dur):
    t = t_(int(dur * SR)); f = 700 + 220 * np.sin(2 * np.pi * .9 * t)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * .22
    x = lowpass(x, 1800) * np.minimum(1, t * 3) * np.minimum(1, (dur - t) * 3)
    put(x, at, .9, -.3); put(x, at + .03, .7, .3)


def riser(at, dur):
    t = t_(int(dur * SR)); n = rng.standard_normal(len(t)); p = t / dur
    x = highpass(n, 400) * p ** 2 * .45
    f = 180 * 2 ** (p * 3.5); x += np.sin(2 * np.pi * np.cumsum(f) / SR) * p ** 1.5 * .18
    put(x, at, 1.0)


def boom(at, g=1.0):
    t = t_(int(1.3 * SR)); f = 38 + 60 * np.exp(-t * 10)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    x += lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 9) * .5
    put(x, at, g)


def whoosh(at, dur=.8):
    t = t_(int(dur * SR)); p = t / dur; n = rng.standard_normal(len(t))
    x = highpass(lowpass(n, 1500 + 6000 * p), 300) * np.sin(np.pi * p) * .5
    put(x, at - dur * .8, 1.0, .0)


def coin(at, g=.35):
    t = t_(int(.25 * SR))
    x = np.sin(2 * np.pi * 1318 * t) * (t < .07) + np.sin(2 * np.pi * 1975 * t) * (t >= .07)
    put(x * np.exp(-t * 14), at, g, .2)


# chord roots per bar: Am F C G (A minor)
PROG = [(55.0, (220, 261.6, 329.6)), (43.65, (174.6, 220, 261.6)), (65.41, (261.6, 329.6, 392)), (49.0, (196, 246.9, 293.7))]
K = kick(); C = clap(); H = hat(); HO = hat(True)

DROP1, BREAK, DROP2, FINAL = 3.2, 14.4, 16.0, 25.6
# Intro: siren, pulsing sub kicks, riser into the drop
siren(0.0, 3.1)
for b in range(8):
    put(K, b * BEAT, .55 if b % 2 == 0 else .0)
riser(0.4, DROP1 - 0.4)
for i, at in enumerate([0.4, 1.2, 2.0]):  # "THE CITY" "NEVER" "SLEEPS"
    boom(at, .55)

def groove(start, end, energy=1.0):
    b = 0; t = start
    while t < end - 1e-6:
        bar_i = int((t - DROP1) / BAR) % 4
        root, chord = PROG[bar_i]
        beat_in_bar = b % 4
        put(K, t, .95)
        if beat_in_bar in (1, 3): put(C, t, .55 * energy, .1)
        for s in range(4):  # 16th hats
            put(H if s % 2 == 0 else H, t + s * BEAT / 4, (.35 if s % 2 else .22) * energy, (-.4 if s % 2 else .4))
        put(HO, t + BEAT / 2, .18 * energy)
        put(bass(root * 2), t + BEAT / 2, .55)
        if beat_in_bar == 0 or (energy > 1 and beat_in_bar == 2): put(stab(chord), t, .30 * energy, -.2 if beat_in_bar else .2)
        b += 1; t = start + b * BEAT

groove(DROP1, BREAK, 1.0)
# break: hats + riser, then drop 2
for i in range(4):
    put(H, BREAK + i * BEAT / 2 + BEAT, .3)
riser(BREAK, DROP2 - BREAK)
whoosh(DROP2, .9)
groove(DROP2, 24.0, 1.1)
# final build: snare roll in 16ths with rising gain, then the big hit
t = 24.0
while t < FINAL - 1e-6:
    p = (t - 24.0) / 1.6
    put(C, t, .25 + .5 * p, .1 * np.sin(t * 7)); put(K, t, .6 if int((t - 24) / BEAT * 4) % 4 == 0 else 0)
    t += BEAT / 4
riser(24.0, 1.6)
boom(FINAL, 1.2); put(K, FINAL, 1.0); put(stab((220, 261.6, 329.6, 440), 2.5), FINAL, .45)
# outro pad
tt = t_(int(4.4 * SR)); pad = sum(np.sin(2 * np.pi * f * tt) for f in (110, 164.8, 220, 261.6)) / 4
put(lowpass(pad, 900) * np.minimum(1, tt * 2) * np.exp(-tt * .55), FINAL, .5)

# text-slam impacts and money blips (times match make_trailer.js)
for at in (3.2, 4.0, 4.8, 6.4, 9.6, 11.2, 12.8, 16.0, 19.2, 22.4, 23.2, 24.0):
    boom(at, .45)
for at in (5.6, 8.0, 8.8, 10.4, 12.0):
    coin(at)
for at in (9.6, 14.4, 16.0, 19.2, 22.4):
    whoosh(at, .6)

mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1)
fade = np.ones(N); fl = int(1.2 * SR); fade[-fl:] = np.linspace(1, 0, fl)
mix *= fade[:, None]
mix /= np.max(np.abs(mix)) * 1.02
out = sys.argv[1] if len(sys.argv) > 1 else "trailer_music.wav"
with wave.open(out, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print("wrote", out, "%.1fs" % DUR)
