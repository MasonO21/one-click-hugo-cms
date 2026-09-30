// Tiny Tides trailer — the shared beat grid. Visuals (shots.js) and music (music.js) both read these times, so every cut,
// pop and hit lands on the same sample/frame. 144 BPM, 4/4: 18 bars = exactly 30.0 s.
export const W = 1080, H = 1920, FPS = 30, DUR = 30, FRAMES = FPS * DUR;
export const BPM = 144, BEAT = 60 / BPM, BAR = BEAT * 4, SIX = BEAT / 4;
/** Time of bar (1-based), beat (1-based) and extra sixteenths. */
export const T = (bar, beat = 1, six = 0) => (bar - 1) * BAR + (beat - 1) * BEAT + six * SIX;

// ------------------------------------------------------------------ sections (bar numbers are 1-based)
export const SEC = {
  open:   [T(1), T(3)],    // cold open: splash, logo slam, creatures pop up
  dig:    [T(3), T(4)],    // DIG!  (drop 1)
  build:  [T(4), T(5)],    // BUILD!
  hatch:  [T(5), T(7)],    // HATCH!
  pop:    [T(7), T(9)],    // POP!  x12 COMBO
  evolve: [T(9), T(10)],   // EVOLVE! (drop 2)
  wall:   [T(10), T(11)],  // 70 CREATURES
  legend: [T(11), T(13)],  // LEGENDARY
  crank:  [T(13), T(15)],  // CRANK IT! / 99 TOYS
  dive:   [T(15), T(17)],  // DIVE DEEP
  end:    [T(17), DUR],    // hero pool + end card
};

// ------------------------------------------------------------------ on-screen events (also drive the SFX)
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
export const EV = {
  splash: T(1),
  slam: [T(1, 1, 2), T(1, 2)],                                     // "Tiny", "Tides"
  openPops: [T(1, 3), T(1, 4), T(2, 1), T(2, 2), T(2, 3)],        // creatures pop up around the logo
  tagline: T(2, 1),
  // DIG: 8 steps on 8th notes (two tiles each), BUILD: 8 placements on 8th notes
  dig: range(8, (i) => T(3) + i * 2 * SIX),
  build: range(8, (i) => T(4) + i * 2 * SIX),
  // HATCH: the wave washes in on the downbeat; 4 eggs hatch on beats (two cracks on the 16ths before each)
  wave: T(5),
  hatch: [T(5, 3), T(5, 4), T(6, 1), T(6, 2)],
  cheer: T(6, 3),
  // POP: 12 bubbles, 8ths then 16ths (combo x1..x12)
  pops: [2, 4, 6, 8, 10, 12, 14, 16, 17, 18, 19, 20].map((s) => T(7) + s * SIX),
  // EVOLVE: four cocoons burst on the off-beat 8ths of bar 9
  evolve: range(4, (i) => T(9) + (2 * i + 1) * 2 * SIX),
  wall: T(10),
  wallWord: T(10, 2),
  // LEGENDARY: charge for two beats, reveal on beat 3, two more legends on bar 12 beats 3 & 4
  charge: T(11),
  legend: T(11, 3),
  legendSides: [T(12, 3), T(12, 4)],
  // CAPSULES: crank on the downbeat, 10 capsules fall from beat 2 (32nd-note stagger), legendary capsule twists on bar 14
  crank: T(13),
  drop: T(13, 2),
  dropStagger: SIX / 2,
  twist: T(14),
  open: T(14, 2),
  toys: range(8, (i) => T(14, 3) + i * SIX),
  // DEEP: plunge on the downbeat, riser through bar 16
  plunge: T(15),
  ping: T(15, 3),
  // END: impact, CTA lines
  impact: T(17),
  cta1: T(17, 2),
  cta2: T(17, 3),
  final: T(18),
};
/** Section cuts, used for whooshes. */
export const CUTS = [T(3), T(5), T(7), T(9), T(10), T(11), T(13), T(15), T(17)];
