// Sizzle Flip — object library (pure data: collision shapes, materials, generator roles).
// Art lives in src/art/*. Local coordinates are y-down and centred on the object's bounding box.
//
// Roles used by the level generator:
//   start, goal       – frying pan / hot dog bun
//   plat              – stepping stone with a flat top (land: [[x1, x2, y], ...])
//   cup               – catches the sausage inside
//   bouncer           – springy
//   hazard            – touching it fails the attempt
//   blocker           – tall obstacle
//   launcher          – pops the sausage into the air
//   mover / rotor     – kinematic platform / rotating obstacle (motion supplied by the level)
//   wind              – blows the sausage
//   support           – stretchable furniture placed under floating objects
//   decor             – no collision

export const WORLDS = [
  { id: 'kitchen', name: 'The Kitchen', floor: 'floor', gravity: 1 },
  { id: 'living', name: 'Living Room', floor: 'floor', gravity: 1 },
  { id: 'backyard', name: 'Backyard BBQ', floor: 'dog', gravity: 1 },
  { id: 'bathroom', name: 'Splish Splash', floor: 'floor', gravity: 1 },
  { id: 'office', name: 'The Office', floor: 'floor', gravity: 1 },
  { id: 'toyroom', name: 'Toy Box', floor: 'floor', gravity: 1 },
  { id: 'market', name: 'Supermarket', floor: 'floor', gravity: 1 },
  { id: 'beach', name: 'Sandy Shores', floor: 'water', gravity: 1 },
  { id: 'space', name: 'Frank in Space', floor: 'space', gravity: 0.45 },
  { id: 'heaven', name: 'Hot Dog Heaven', floor: 'heaven', gravity: 1 },
];

const B = (x, y, w, h, o = {}) => ({ type: 'box', x, y, w, h, ...o });
const C = (x, y, r, o = {}) => ({ type: 'circle', x, y, r, ...o });
const P = (pts, o = {}) => ({ type: 'poly', pts, ...o });
const K = (x1, y1, x2, y2, r, o = {}) => ({ type: 'capsule', x1, y1, x2, y2, r, ...o });
const S = (x, y, w, h, o = {}) => ({ type: 'box', x, y, w, h, sensor: true, ...o });

const MAT = {
  wood: { mat: 'wood', friction: 0.8, bounce: 0.12 },
  metal: { mat: 'metal', friction: 0.55, bounce: 0.16 },
  soft: { mat: 'soft', friction: 0.95, bounce: 0.45 },
  plastic: { mat: 'plastic', friction: 0.65, bounce: 0.28 },
  glass: { mat: 'glass', friction: 0.35, bounce: 0.18 },
  ceramic: { mat: 'ceramic', friction: 0.6, bounce: 0.15 },
  food: { mat: 'food', friction: 0.85, bounce: 0.18 },
  stone: { mat: 'stone', friction: 0.8, bounce: 0.1 },
  slick: { mat: 'slick', friction: 0.015, bounce: 0.08 },
  sticky: { mat: 'sticky', friction: 5, bounce: 0, sticky: true },
  rubber: { mat: 'rubber', friction: 0.9, bounce: 0.72 },
  sand: { mat: 'sand', friction: 1.1, bounce: 0.02 },
  cloud: { mat: 'cloud', friction: 0.9, bounce: 0.55 },
};

// Simple top landing strip for a box of width w whose top is at y.
const top = (w, y, inset = 10) => [[-w / 2 + inset, w / 2 - inset, y]];

const defs = {
  // ======================= Shared / structural =======================
  pan: {
    role: 'start', w: 300, h: 48, ...MAT.metal, front: true, worlds: 'all',
    shapes: [
      B(-45, 18, 210, 12),
      B(-150, 0, 10, 44, { a: -0.38 }),
      B(60, 0, 10, 44, { a: 0.38 }),
      B(112, -3, 76, 11, { a: -0.12 }),
    ],
    start: [-45, -10], land: [[-120, 30, 12]],
  },
  stove: {
    role: 'support', w: 240, h: 150, ...MAT.metal, worlds: 'all',
    shapes: [B(0, 0, 240, 150, { r: 6 })], land: top(240, -75),
  },
  bun: {
    role: 'goal', w: 230, h: 66, ...MAT.food, friction: 1.4, bounce: 0.03, front: true, worlds: 'all',
    shapes: [
      B(0, 16, 210, 34, { r: 14 }),
      C(-96, -6, 17), C(96, -6, 17),
      S(0, -16, 168, 34, { goal: true }),
    ],
    land: [[-70, 70, -1]],
  },
  shelf: {
    role: 'support', w: 200, h: 18, ...MAT.wood, stretch: true, worlds: 'all',
    build: (o) => [B(0, 0, o.w || 200, 18, { r: 3 })],
    land: null,
  },
  table: {
    role: 'support', w: 260, h: 200, ...MAT.wood, stretch: true, worlds: 'all', ground: true,
    build: (o) => { const w = o.w || 260, h = o.h || 200; return [B(0, -h / 2 + 10, w, 20), B(-w / 2 + 18, 10, 16, h - 20), B(w / 2 - 18, 10, 16, h - 20)]; },
  },
  cabinet: {
    role: 'support', w: 260, h: 240, ...MAT.wood, stretch: true, worlds: 'all', ground: true,
    build: (o) => { const w = o.w || 260, h = o.h || 240; return [B(0, 0, w, h, { r: 4 })]; },
  },
  pillar: {
    role: 'support', w: 60, h: 300, ...MAT.wood, stretch: true, worlds: 'all', ground: true,
    build: (o) => { const w = o.w || 60, h = o.h || 300; return [B(0, 0, w, h)]; },
  },
  wall: {
    role: 'blocker', w: 30, h: 300, ...MAT.wood, stretch: true, worlds: 'all',
    build: (o) => { const w = o.w || 30, h = o.h || 300; return [B(0, 0, w, h, { r: 4 })]; },
  },

  // ======================= Kitchen =======================
  counter: {
    role: 'support', w: 300, h: 260, ...MAT.wood, stretch: true, worlds: ['kitchen'], ground: true,
    build: (o) => { const w = o.w || 300, h = o.h || 260; return [B(0, -h / 2 + 12, w + 16, 24), B(0, 12, w, h - 24)]; },
  },
  toaster: {
    role: 'launcher', w: 156, h: 96, ...MAT.metal, worlds: ['kitchen', 'office'],
    shapes: [B(0, 12, 156, 72, { r: 16 }), S(0, -40, 150, 36, { launch: [0, -1500] })],
    land: top(156, -24, 18),
  },
  teapot: {
    role: 'blocker', w: 130, h: 110, ...MAT.ceramic, worlds: ['kitchen', 'living'],
    shapes: [B(0, 18, 104, 74, { r: 30 }), B(0, -26, 54, 16, { r: 6 }), C(0, -40, 8)],
  },
  mug: {
    role: 'cup', w: 76, h: 84, ...MAT.ceramic, front: true, worlds: ['kitchen', 'office'],
    shapes: [B(-32, 0, 10, 84), B(32, 0, 10, 84), B(0, 37, 74, 10)],
    land: [[-24, 24, 30]],
  },
  cuttingboard: {
    role: 'plat', w: 210, h: 22, ...MAT.wood, worlds: ['kitchen'],
    shapes: [B(0, 0, 210, 22, { r: 8 })], land: top(210, -11),
  },
  books: {
    role: 'plat', w: 160, h: 80, ...MAT.wood, worlds: ['kitchen', 'living', 'office', 'toyroom'],
    shapes: [B(0, 0, 160, 80, { r: 4 })], land: top(160, -40),
  },
  knifeblock: {
    role: 'hazard', w: 90, h: 130, ...MAT.wood, worlds: ['kitchen'],
    shapes: [B(0, 25, 90, 80, { r: 6 }), B(-4, -38, 66, 46, { hazard: 'cut' })],
  },
  blender: {
    role: 'hazard', w: 90, h: 170, ...MAT.glass, front: true, worlds: ['kitchen'],
    shapes: [B(0, 65, 90, 40, { r: 8 }), B(-40, -10, 10, 110), B(40, -10, 10, 110), S(0, 0, 60, 80, { hazard: 'blend' })],
  },
  pot: {
    role: 'hazard', w: 170, h: 110, ...MAT.metal, front: true, worlds: ['kitchen'], anim: true,
    shapes: [B(-78, 5, 12, 100), B(78, 5, 12, 100), B(0, 50, 168, 12), S(0, 10, 140, 60, { hazard: 'boil' })],
  },
  burner: {
    role: 'hazard', w: 120, h: 30, ...MAT.metal, worlds: ['kitchen'], anim: true,
    shapes: [B(0, 6, 120, 18, { r: 4 }), S(0, -26, 96, 50, { hazard: 'burn', timed: true })],
    land: top(120, -3),
  },
  fridge: {
    role: 'blocker', w: 170, h: 360, ...MAT.metal, worlds: ['kitchen'], ground: true,
    shapes: [B(0, 0, 170, 360, { r: 14 })], land: top(170, -180, 16),
  },
  jar: {
    role: 'plat', w: 74, h: 100, ...MAT.glass, worlds: ['kitchen', 'market'],
    shapes: [B(0, 6, 74, 88, { r: 12 }), B(0, -42, 64, 16, { r: 4, friction: 0.7 })], land: top(64, -50, 6),
  },
  butter: {
    role: 'plat', w: 140, h: 44, ...MAT.slick, worlds: ['kitchen', 'market'],
    shapes: [B(0, 14, 140, 16, { r: 6, ...MAT.ceramic }), B(0, -6, 100, 26, { r: 5, ...MAT.slick })], land: top(100, -19),
  },
  cereal: {
    role: 'plat', w: 90, h: 130, ...MAT.wood, worlds: ['kitchen', 'market'],
    shapes: [B(0, 0, 90, 130, { r: 3 })], land: top(90, -65, 6),
  },
  microwave: {
    role: 'plat', w: 180, h: 104, ...MAT.metal, worlds: ['kitchen', 'office'],
    shapes: [B(0, 0, 180, 104, { r: 10 })], land: top(180, -52),
  },
  watermelon: {
    role: 'bouncer', w: 150, h: 80, ...MAT.food, bounce: 0.4, worlds: ['kitchen', 'beach', 'market'],
    shapes: [P([[-75, 40], [75, 40], [64, 4], [40, -26], [0, -40], [-40, -26], [-64, 4]])],
  },
  plate: {
    role: 'plat', w: 180, h: 18, ...MAT.ceramic, worlds: ['kitchen', 'living'],
    shapes: [B(0, 0, 180, 18, { r: 8 })], land: top(180, -9),
  },

  // ======================= Living room =======================
  couch: {
    role: 'bouncer', w: 320, h: 150, ...MAT.soft, worlds: ['living'], ground: true,
    shapes: [
      B(0, 45, 310, 60, { r: 10 }),
      B(0, 0, 230, 32, { r: 12, ...MAT.soft, bounce: 0.7, boost: 620 }),
      B(-138, -8, 44, 86, { r: 16 }), B(138, -8, 44, 86, { r: 16 }),
    ],
    land: [[-100, 100, -16]],
  },
  armchair: {
    role: 'bouncer', w: 180, h: 140, ...MAT.soft, worlds: ['living', 'office'], ground: true,
    shapes: [B(0, 40, 170, 60, { r: 10 }), B(0, 0, 100, 30, { r: 10, bounce: 0.65, boost: 560 }), B(-68, -6, 38, 80, { r: 14 }), B(68, -6, 38, 80, { r: 14 })],
    land: [[-40, 40, -15]],
  },
  tv: {
    role: 'plat', w: 170, h: 140, ...MAT.plastic, worlds: ['living'],
    shapes: [B(0, 10, 170, 120, { r: 14 })], land: top(170, -50, 16),
  },
  lamp: {
    role: 'blocker', w: 110, h: 320, ...MAT.metal, worlds: ['living', 'office'], ground: true,
    shapes: [P([[-34, -160], [34, -160], [55, -95], [-55, -95]], MAT.soft), K(0, -95, 0, 150, 6), B(0, 152, 80, 16, { r: 6 })],
    land: [[-26, 26, -160]],
  },
  bookshelf: {
    role: 'blocker', w: 190, h: 320, ...MAT.wood, worlds: ['living', 'office', 'toyroom'], ground: true,
    shapes: [B(0, 0, 190, 320, { r: 4 })], land: top(190, -160),
  },
  cat: {
    role: 'hazard', w: 120, h: 64, ...MAT.soft, worlds: ['living', 'backyard', 'toyroom'], anim: true,
    shapes: [B(0, 6, 120, 52, { r: 24, hazard: 'cat' })],
  },
  fishbowl: {
    role: 'hazard', w: 120, h: 110, ...MAT.glass, front: true, worlds: ['living', 'office'], anim: true,
    shapes: [B(-55, 8, 10, 94, { a: 0.08 }), B(55, 8, 10, 94, { a: -0.08 }), B(0, 50, 100, 10, { r: 4 }), S(0, 14, 96, 70, { hazard: 'water' })],
  },
  clock: {
    role: 'rotor', w: 300, h: 30, ...MAT.metal, worlds: ['living', 'office'], anim: true,
    shapes: [B(60, 0, 240, 22, { r: 10 })], pivot: [0, 0],
    land: [[-50, 160, -11]],
  },
  piano: {
    role: 'plat', w: 230, h: 190, ...MAT.wood, mat: 'piano', worlds: ['living', 'toyroom'], ground: true,
    shapes: [B(0, 0, 230, 190, { r: 6 })], land: top(230, -95),
  },
  globe: {
    role: 'blocker', w: 100, h: 140, ...MAT.plastic, worlds: ['living', 'office'],
    shapes: [C(0, -20, 46), B(0, 60, 70, 14, { r: 5 }), K(0, 25, 0, 55, 5)],
  },
  plant: {
    role: 'plat', w: 110, h: 160, ...MAT.ceramic, worlds: ['living', 'office', 'bathroom', 'market'],
    shapes: [B(0, 45, 80, 70, { r: 6 })], land: top(80, 10, 4),
  },
  cushion: {
    role: 'bouncer', w: 120, h: 44, ...MAT.soft, bounce: 0.8, boost: 820, worlds: ['living', 'toyroom', 'heaven'],
    shapes: [B(0, 0, 120, 44, { r: 18 })], land: top(120, -22),
  },
  beanbag: {
    role: 'plat', w: 150, h: 96, ...MAT.sticky, worlds: ['living', 'toyroom'],
    shapes: [P([[-75, 48], [75, 48], [70, 10], [40, -30], [0, -46], [-40, -30], [-70, 10]])],
    land: [[-30, 30, -40]],
  },
  fireplace: {
    role: 'hazard', w: 240, h: 230, ...MAT.stone, worlds: ['living'], ground: true, anim: true,
    shapes: [B(0, -105, 240, 20, { r: 4 }), B(-95, 10, 50, 210), B(95, 10, 50, 210), S(0, 60, 130, 100, { hazard: 'burn' })],
    land: top(240, -115),
  },

  // ======================= Backyard =======================
  grill: {
    role: 'hazard', w: 170, h: 180, ...MAT.metal, worlds: ['backyard', 'beach'], ground: true, anim: true,
    shapes: [B(0, -40, 160, 16, { r: 4 }), P([[-80, -32], [80, -32], [55, 30], [-55, 30]]), K(-40, 30, -60, 90, 5), K(40, 30, 60, 90, 5), S(0, -78, 140, 64, { hazard: 'burn', timed: true })],
    land: [[-70, 70, -48]],
  },
  picnictable: {
    role: 'support', w: 300, h: 160, ...MAT.wood, stretch: true, worlds: ['backyard', 'beach'], ground: true,
    build: (o) => { const w = o.w || 300, h = o.h || 160; return [B(0, -h / 2 + 10, w, 20), B(-w / 2 + 40, 10, 18, h - 20, { a: 0.15 }), B(w / 2 - 40, 10, 18, h - 20, { a: -0.15 })]; },
  },
  lawnchair: {
    role: 'bouncer', w: 130, h: 120, ...MAT.plastic, worlds: ['backyard', 'beach'],
    shapes: [B(0, 0, 110, 14, { bounce: 0.6, boost: 520 }), K(-50, 5, -60, 60, 4), K(50, 5, 60, 60, 4), K(-55, 0, -40, -55, 5)],
    land: [[-40, 50, -7]],
  },
  gnome: {
    role: 'blocker', w: 70, h: 110, ...MAT.ceramic, worlds: ['backyard'],
    shapes: [P([[-30, 55], [30, 55], [30, 0], [0, -55], [-30, 0]])],
  },
  birdbath: {
    role: 'hazard', w: 140, h: 150, ...MAT.stone, front: true, worlds: ['backyard'], ground: true,
    shapes: [B(-62, -50, 16, 40, { a: 0.2 }), B(62, -50, 16, 40, { a: -0.2 }), B(0, -30, 120, 14, { r: 5 }), B(0, 30, 30, 100), B(0, 70, 80, 14), S(0, -50, 100, 26, { hazard: 'water' })],
  },
  trampoline: {
    role: 'bouncer', w: 210, h: 70, ...MAT.rubber, bounce: 0.75, boost: 1450, worlds: ['backyard', 'toyroom'],
    shapes: [B(0, -24, 200, 12, { r: 5 }), K(-90, -20, -90, 34, 5, MAT.metal), K(90, -20, 90, 34, 5, MAT.metal)],
    land: [[-80, 80, -30]],
  },
  swing: {
    role: 'mover', w: 120, h: 20, ...MAT.wood, worlds: ['backyard', 'toyroom'], anim: true,
    shapes: [B(0, 0, 120, 16, { r: 4 })], land: top(120, -8),
    pivot: [0, -260], // swings about a point above the seat
  },
  fence: {
    role: 'blocker', w: 40, h: 240, ...MAT.wood, stretch: true, worlds: ['backyard', 'beach'], ground: true,
    build: (o) => { const h = o.h || 240, w = o.w || 40; return [P([[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2 + 14], [0, -h / 2], [-w / 2, -h / 2 + 14]])]; },
  },
  cooler: {
    role: 'plat', w: 140, h: 96, ...MAT.plastic, worlds: ['backyard', 'beach'],
    shapes: [B(0, 0, 140, 96, { r: 10 })], land: top(140, -48),
  },
  leafblower: {
    role: 'wind', w: 100, h: 60, ...MAT.plastic, worlds: ['backyard'], anim: true,
    shapes: [B(-10, 0, 80, 46, { r: 12 }), S(260, -6, 420, 100, { wind: [3200, -350] })],
  },
  stump: {
    role: 'plat', w: 140, h: 90, ...MAT.wood, worlds: ['backyard'],
    shapes: [B(0, 0, 130, 90, { r: 6 })], land: top(130, -45),
  },
  sprinkler: {
    role: 'wind', w: 70, h: 30, ...MAT.metal, worlds: ['backyard', 'beach'], anim: true,
    shapes: [B(0, 5, 70, 20, { r: 6 }), S(0, -190, 80, 360, { wind: [0, -4300] })],
  },
  dog: {
    role: 'hazard', w: 120, h: 110, ...MAT.soft, worlds: ['backyard'], anim: true,
    shapes: [B(0, 10, 100, 90, { r: 30, hazard: 'dog' })],
  },
  branch: {
    role: 'support', w: 240, h: 22, ...MAT.wood, stretch: true, worlds: ['backyard'],
    build: (o) => [B(0, 0, o.w || 240, 22, { r: 10 })],
  },

  // ======================= Bathroom =======================
  bathtub: {
    role: 'hazard', w: 320, h: 150, ...MAT.ceramic, front: true, worlds: ['bathroom'], ground: true, anim: true,
    shapes: [B(-148, -5, 24, 140, { r: 10 }), B(148, -5, 24, 140, { r: 10 }), B(0, 55, 320, 30, { r: 12 }), S(0, 10, 270, 70, { hazard: 'water' })],
    land: [[-158, -138, -75], [138, 158, -75]],
  },
  toilet: {
    role: 'hazard', w: 150, h: 200, ...MAT.ceramic, front: true, worlds: ['bathroom'], ground: true,
    shapes: [B(-30, -65, 90, 70, { r: 8 }), B(20, 20, 100, 20, { r: 8 }), B(15, 65, 60, 70), S(25, 0, 80, 24, { hazard: 'flush' })],
    land: [[-70, 10, -100]],
  },
  sink: {
    role: 'cup', w: 170, h: 200, ...MAT.ceramic, front: true, worlds: ['bathroom'], ground: true,
    shapes: [B(-75, -78, 20, 44, { r: 6 }), B(75, -78, 20, 44, { r: 6 }), B(0, -50, 170, 22, { r: 10 }), B(0, 40, 50, 160)],
    land: [[-55, 55, -62]],
  },
  soap: {
    role: 'plat', w: 110, h: 44, ...MAT.slick, worlds: ['bathroom'],
    shapes: [B(0, 14, 110, 14, { r: 6, ...MAT.ceramic }), B(0, -6, 80, 28, { r: 12, ...MAT.slick })], land: top(80, -20),
  },
  rubberduck: {
    role: 'bouncer', w: 90, h: 80, ...MAT.rubber, worlds: ['bathroom', 'toyroom', 'beach'],
    shapes: [B(0, 18, 86, 40, { r: 18 }), C(18, -18, 22)],
  },
  towelrack: {
    role: 'plat', w: 200, h: 60, ...MAT.soft, worlds: ['bathroom'],
    shapes: [B(0, -18, 180, 20, { r: 9 })], land: top(180, -28),
  },
  showerhead: {
    role: 'wind', w: 90, h: 60, ...MAT.metal, worlds: ['bathroom'], anim: true,
    shapes: [B(0, -10, 70, 26, { r: 10 }), S(0, 180, 80, 340, { wind: [0, 3400] })],
  },
  scale: {
    role: 'bouncer', w: 120, h: 32, ...MAT.plastic, bounce: 0.6, boost: 1100, worlds: ['bathroom'],
    shapes: [B(0, 0, 120, 32, { r: 8 })], land: top(120, -16),
  },
  toiletpaper: {
    role: 'blocker', w: 120, h: 110, ...MAT.soft, bounce: 0.35, worlds: ['bathroom', 'market'],
    shapes: [C(-30, 28, 27), C(30, 28, 27), C(0, -26, 27)],
  },
  mirrorcab: {
    role: 'plat', w: 160, h: 190, ...MAT.glass, friction: 0.5, worlds: ['bathroom'],
    shapes: [B(0, 0, 160, 190, { r: 6 })], land: top(160, -95),
  },
  hairdryer: {
    role: 'wind', w: 110, h: 90, ...MAT.plastic, worlds: ['bathroom', 'office'], anim: true,
    shapes: [B(0, -15, 90, 46, { r: 20 }), S(250, -15, 400, 90, { wind: [3000, -250] })],
  },

  // ======================= Office =======================
  desk: {
    role: 'support', w: 320, h: 210, ...MAT.wood, stretch: true, worlds: ['office'], ground: true,
    build: (o) => { const w = o.w || 320, h = o.h || 210; return [B(0, -h / 2 + 11, w, 22), B(-w / 2 + 45, 11, 90, h - 22), B(w / 2 - 12, 11, 16, h - 22)]; },
  },
  monitor: {
    role: 'blocker', w: 170, h: 150, ...MAT.plastic, worlds: ['office'],
    shapes: [B(0, -20, 170, 110, { r: 8 }), B(0, 50, 20, 34), B(0, 68, 80, 12, { r: 5 })],
    land: top(170, -75, 14),
  },
  officechair: {
    role: 'mover', w: 130, h: 180, ...MAT.soft, worlds: ['office'], anim: true,
    shapes: [B(0, 0, 120, 24, { r: 10 }), B(-48, -50, 22, 80, { r: 8 }), K(0, 12, 0, 70, 6, MAT.metal), B(0, 80, 110, 14, { r: 6, ...MAT.metal })],
    land: [[-30, 55, -12]],
  },
  printer: {
    role: 'plat', w: 170, h: 90, ...MAT.plastic, worlds: ['office'],
    shapes: [B(0, 0, 170, 90, { r: 8 })], land: top(170, -45),
  },
  stapler: {
    role: 'plat', w: 120, h: 40, ...MAT.metal, worlds: ['office'],
    shapes: [B(0, 6, 120, 28, { r: 8 })], land: top(120, -8, 12),
  },
  deskfan: {
    role: 'wind', w: 100, h: 130, ...MAT.plastic, worlds: ['office', 'living'], anim: true,
    shapes: [C(0, -20, 44), B(0, 52, 70, 16, { r: 6 }), S(250, -20, 400, 110, { wind: [3000, -200] })],
  },
  watercooler: {
    role: 'blocker', w: 100, h: 260, ...MAT.plastic, worlds: ['office'], ground: true,
    shapes: [B(0, 40, 100, 180, { r: 6 }), B(0, -85, 76, 80, { r: 30, ...MAT.glass })],
  },
  filingcabinet: {
    role: 'plat', w: 120, h: 220, ...MAT.metal, worlds: ['office'], ground: true,
    shapes: [B(0, 0, 120, 220, { r: 4 })], land: top(120, -110),
  },
  shredder: {
    role: 'hazard', w: 120, h: 120, ...MAT.plastic, worlds: ['office'], anim: true,
    shapes: [B(0, 15, 120, 90, { r: 6 }), S(0, -38, 90, 24, { hazard: 'shred' })],
  },
  papers: {
    role: 'plat', w: 130, h: 56, ...MAT.wood, friction: 0.35, worlds: ['office'],
    shapes: [B(0, 0, 130, 56, { r: 2 })], land: top(130, -28),
  },
  vending: {
    role: 'blocker', w: 170, h: 330, ...MAT.metal, worlds: ['office', 'market'], ground: true,
    shapes: [B(0, 0, 170, 330, { r: 8 })], land: top(170, -165),
  },

  // ======================= Toy room =======================
  block: {
    role: 'plat', w: 74, h: 74, ...MAT.wood, worlds: ['toyroom'],
    shapes: [B(0, 0, 74, 74, { r: 6 })], land: top(74, -37, 4),
  },
  toytrain: {
    role: 'mover', w: 190, h: 90, ...MAT.plastic, worlds: ['toyroom'], anim: true,
    shapes: [B(10, 5, 170, 60, { r: 8 }), B(-60, -40, 40, 30, { r: 4 })], land: [[-30, 90, -25]],
  },
  teddy: {
    role: 'bouncer', w: 130, h: 140, ...MAT.soft, bounce: 0.6, worlds: ['toyroom'],
    shapes: [C(0, 30, 50), C(0, -40, 36)],
  },
  drum: {
    role: 'bouncer', w: 130, h: 90, ...MAT.rubber, bounce: 0.7, boost: 1150, mat: 'drum', worlds: ['toyroom'],
    shapes: [B(0, 0, 130, 90, { r: 6 })], land: top(130, -45),
  },
  xylophone: {
    role: 'plat', w: 220, h: 60, ...MAT.wood, mat: 'xylo', worlds: ['toyroom'],
    shapes: [B(0, 0, 220, 50, { r: 8 })], land: top(220, -25),
  },
  jackbox: {
    role: 'launcher', w: 100, h: 110, ...MAT.wood, worlds: ['toyroom'], anim: true,
    shapes: [B(0, 20, 100, 90, { r: 4 }), S(0, -45, 90, 40, { launch: [0, -1550] })],
    land: top(100, -25, 8),
  },
  gondola: {
    role: 'mover', w: 120, h: 70, ...MAT.metal, worlds: ['toyroom', 'heaven'], front: true, anim: true,
    shapes: [B(0, 26, 120, 14, { r: 6 }), B(-55, 5, 10, 50), B(55, 5, 10, 50)], land: [[-40, 40, 19]],
  },
  pinwheel: {
    role: 'rotor', w: 260, h: 260, ...MAT.plastic, worlds: ['toyroom', 'backyard', 'beach'], anim: true,
    shapes: [B(0, 0, 260, 20, { r: 8 }), B(0, 0, 20, 260, { r: 8 })], pivot: [0, 0],
  },
  toybox: {
    role: 'plat', w: 180, h: 120, ...MAT.wood, worlds: ['toyroom'],
    shapes: [B(0, 0, 180, 120, { r: 6 })], land: top(180, -60),
  },
  rocking: {
    role: 'blocker', w: 190, h: 150, ...MAT.wood, worlds: ['toyroom'],
    shapes: [P([[-80, -20], [60, -40], [70, 0], [-70, 20]]), C(70, -50, 26)],
  },

  // ======================= Supermarket =======================
  storeshelf: {
    role: 'support', w: 300, h: 260, ...MAT.metal, stretch: true, worlds: ['market'], ground: true,
    build: (o) => { const w = o.w || 300, h = o.h || 260; return [B(0, -h / 2 + 8, w, 16), B(0, h / 2 - 8, w, 16), B(-w / 2 + 6, 0, 12, h), B(w / 2 - 6, 0, 12, h)]; },
  },
  cart: {
    role: 'mover', w: 190, h: 150, ...MAT.metal, front: true, worlds: ['market'], anim: true,
    shapes: [B(-82, -20, 10, 90, { a: -0.12 }), B(82, -20, 10, 90, { a: 0.12 }), B(0, 25, 170, 12), K(-60, 30, -60, 66, 4), K(60, 30, 60, 66, 4)],
    land: [[-60, 60, 19]],
  },
  conveyor: {
    role: 'plat', w: 300, h: 50, ...MAT.rubber, bounce: 0.05, friction: 1.2, stretch: true, worlds: ['market', 'office'], anim: true,
    build: (o) => { const w = o.w || 300; return [B(0, 0, w, 40, { r: 18, conveyor: o.speed || 160, ...MAT.rubber, bounce: 0.05, friction: 1.2 })]; },
  },
  cans: {
    role: 'plat', w: 150, h: 120, ...MAT.metal, worlds: ['market', 'kitchen'],
    shapes: [P([[-75, 60], [75, 60], [50, -60], [-50, -60]])], land: [[-40, 40, -60]],
  },
  crate: {
    role: 'plat', w: 150, h: 100, ...MAT.wood, worlds: ['market', 'beach', 'space'],
    shapes: [B(0, 0, 150, 100, { r: 4 })], land: top(150, -50),
  },
  register: {
    role: 'plat', w: 150, h: 110, ...MAT.plastic, worlds: ['market'],
    shapes: [B(0, 20, 150, 70, { r: 6 }), B(30, -35, 70, 40, { r: 6 })], land: [[-70, -10, -15]],
  },
  freezer: {
    role: 'plat', w: 260, h: 150, ...MAT.metal, worlds: ['market'], ground: true,
    shapes: [B(0, 0, 260, 150, { r: 10, friction: 0.05, mat: 'ice' })], land: top(260, -75),
  },
  milk: {
    role: 'plat', w: 70, h: 140, ...MAT.plastic, worlds: ['market', 'kitchen'],
    shapes: [B(0, 10, 70, 120, { r: 4 }), P([[-35, -50], [35, -50], [0, -70]])], land: [],
  },
  slicer: {
    role: 'hazard', w: 160, h: 130, ...MAT.metal, worlds: ['market'], anim: true,
    shapes: [B(0, 35, 160, 60, { r: 8 }), C(-10, -20, 44, { hazard: 'slice' })],
  },
  fishtank: {
    role: 'hazard', w: 200, h: 140, ...MAT.glass, front: true, worlds: ['market'], anim: true,
    shapes: [B(-95, 0, 10, 140), B(95, 0, 10, 140), B(0, 65, 200, 10), S(0, 10, 180, 100, { hazard: 'water' })],
    land: [[-100, -90, -70], [90, 100, -70]],
  },

  // ======================= Beach =======================
  umbrella: {
    role: 'bouncer', w: 230, h: 260, ...MAT.soft, worlds: ['beach'], ground: true,
    shapes: [P([[-115, -70], [-60, -115], [0, -130], [60, -115], [115, -70]], { bounce: 0.75, boost: 700 }), K(0, -110, 0, 130, 5, MAT.wood)],
  },
  sandcastle: {
    role: 'plat', w: 200, h: 150, ...MAT.sand, worlds: ['beach'],
    shapes: [B(0, 35, 200, 80, { r: 6 }), B(-60, -35, 60, 70, { r: 4 }), B(60, -35, 60, 70, { r: 4 })],
    land: [[-85, -35, -70], [35, 85, -70], [-25, 25, -5]],
  },
  beachball: {
    role: 'bouncer', w: 100, h: 100, ...MAT.rubber, bounce: 0.75, boost: 700, worlds: ['beach', 'toyroom'],
    shapes: [C(0, 0, 50)],
  },
  crab: {
    role: 'hazard', w: 100, h: 60, ...MAT.plastic, worlds: ['beach'], anim: true,
    shapes: [B(0, 8, 90, 44, { r: 20, hazard: 'pinch' })],
  },
  surfboard: {
    role: 'plat', w: 260, h: 30, ...MAT.plastic, friction: 0.4, worlds: ['beach'], anim: true,
    shapes: [B(0, 0, 250, 24, { r: 12 })], land: top(250, -12, 20),
  },
  lifeguard: {
    role: 'plat', w: 200, h: 340, ...MAT.wood, worlds: ['beach'], ground: true,
    shapes: [B(0, -120, 200, 20), K(-70, -110, -90, 170, 8), K(70, -110, 90, 170, 8), B(0, -158, 150, 20, { r: 4 })],
    land: [[-90, -75, -130], [75, 90, -130], [-65, 65, -168]],
  },
  seagull: {
    role: 'hazard', w: 110, h: 60, ...MAT.soft, worlds: ['beach'], anim: true,
    shapes: [B(0, 0, 80, 40, { r: 18, hazard: 'gull' })],
  },
  bucket: {
    role: 'cup', w: 90, h: 90, ...MAT.plastic, front: true, worlds: ['beach'],
    shapes: [B(-40, 0, 10, 90, { a: 0.12 }), B(40, 0, 10, 90, { a: -0.12 }), B(0, 40, 80, 10)], land: [[-25, 25, 34]],
  },
  palm: {
    role: 'bouncer', w: 260, h: 420, ...MAT.wood, worlds: ['beach'], ground: true,
    shapes: [K(10, -170, -20, 210, 16), B(-70, -185, 120, 18, { a: 0.18, ...MAT.soft, bounce: 0.6, boost: 600 }), B(80, -185, 120, 18, { a: -0.18, ...MAT.soft, bounce: 0.6, boost: 600 })],
  },
  buoy: {
    role: 'mover', w: 110, h: 70, ...MAT.plastic, worlds: ['beach'], anim: true,
    shapes: [B(0, 0, 110, 40, { r: 18 })], land: top(110, -20, 12),
  },

  // ======================= Space =======================
  satellite: {
    role: 'rotor', w: 320, h: 70, ...MAT.metal, worlds: ['space'], anim: true,
    shapes: [B(0, 0, 70, 70, { r: 6 }), B(-115, 0, 160, 18), B(115, 0, 160, 18)], pivot: [0, 0],
  },
  asteroid: {
    role: 'plat', w: 160, h: 140, ...MAT.stone, worlds: ['space'],
    shapes: [P([[-80, 20], [-50, -50], [10, -70], [70, -40], [80, 30], [30, 70], [-40, 65]])], land: [[-20, 30, -60]],
  },
  hoverbot: {
    role: 'mover', w: 150, h: 80, ...MAT.metal, worlds: ['space', 'office'], anim: true,
    shapes: [B(0, 0, 150, 34, { r: 14 })], land: top(150, -17, 14),
  },
  laser: {
    role: 'hazard', w: 300, h: 40, ...MAT.metal, worlds: ['space'], anim: true, stretch: true,
    build: (o) => { const w = o.w || 300; return [B(-w / 2 + 15, 0, 30, 40, { r: 6 }), B(w / 2 - 15, 0, 30, 40, { r: 6 }), S(0, 0, w - 60, 12, { hazard: 'zap', timed: true })]; },
  },
  gravlift: {
    role: 'wind', w: 120, h: 30, ...MAT.metal, worlds: ['space', 'heaven'], anim: true,
    shapes: [B(0, 0, 120, 26, { r: 8 }), S(0, -260, 100, 500, { wind: [0, -2600] })],
  },
  rocket: {
    role: 'blocker', w: 120, h: 320, ...MAT.metal, worlds: ['space'], ground: true,
    shapes: [P([[-40, 100], [40, 100], [40, -80], [0, -160], [-40, -80]]), P([[-40, 60], [-60, 160], [-40, 120]]), P([[40, 60], [40, 120], [60, 160]])],
  },
  spacecrate: {
    role: 'plat', w: 130, h: 90, ...MAT.metal, worlds: ['space'],
    shapes: [B(0, 0, 130, 90, { r: 8 })], land: top(130, -45),
  },
  ufo: {
    role: 'mover', w: 180, h: 80, ...MAT.metal, worlds: ['space'], anim: true,
    shapes: [P([[-90, 10], [-60, -10], [60, -10], [90, 10], [50, 26], [-50, 26]]), B(0, -24, 70, 30, { r: 14, ...MAT.glass })],
    land: [[-28, 28, -39], [-80, -50, -4], [50, 80, -4]],
  },
  moonrock: {
    role: 'plat', w: 200, h: 120, ...MAT.stone, worlds: ['space'], ground: true,
    shapes: [P([[-100, 60], [100, 60], [85, -40], [40, -60], [-50, -60], [-90, -30]])], land: [[-45, 35, -60]],
  },

  // ======================= Hot Dog Heaven =======================
  cloud: {
    role: 'support', w: 240, h: 70, ...MAT.cloud, stretch: true, worlds: ['heaven'],
    build: (o) => { const w = o.w || 240; return [B(0, 0, w, 50, { r: 24, ...MAT.cloud })]; },
  },
  ketchup: {
    role: 'blocker', w: 80, h: 230, ...MAT.plastic, worlds: ['heaven', 'market'],
    shapes: [B(0, 25, 80, 180, { r: 24 }), B(0, -85, 40, 40, { r: 6 })], land: top(40, -105, 4),
  },
  mustard: {
    role: 'blocker', w: 80, h: 230, ...MAT.plastic, worlds: ['heaven', 'market'],
    shapes: [B(0, 25, 80, 180, { r: 24 }), P([[-20, -65], [20, -65], [4, -115], [-4, -115]])],
  },
  burger: {
    role: 'bouncer', w: 180, h: 120, ...MAT.food, bounce: 0.7, boost: 900, worlds: ['heaven'],
    shapes: [B(0, 30, 170, 50, { r: 18 }), P([[-90, -5], [90, -5], [70, -45], [30, -60], [-30, -60], [-70, -45]], { bounce: 0.8, boost: 1000 })],
  },
  fries: {
    role: 'plat', w: 110, h: 160, ...MAT.food, worlds: ['heaven', 'market'],
    shapes: [P([[-40, 80], [40, 80], [55, -20], [-55, -20]]), B(0, -48, 100, 52, { r: 8, friction: 1.2 })], land: top(100, -74, 8),
  },
  soda: {
    role: 'cup', w: 100, h: 160, ...MAT.plastic, front: true, worlds: ['heaven', 'market'],
    shapes: [B(-44, 10, 10, 140, { a: 0.07 }), B(44, 10, 10, 140, { a: -0.07 }), B(0, 76, 80, 10), K(10, -70, 40, -40, 4)], land: [[-30, 30, 70]],
  },
  donut: {
    role: 'bouncer', w: 130, h: 130, ...MAT.food, bounce: 0.75, boost: 800, worlds: ['heaven'],
    shapes: [C(0, 0, 64)],
  },
  cottoncandy: {
    role: 'plat', w: 140, h: 200, ...MAT.sticky, worlds: ['heaven'],
    shapes: [C(0, -40, 60), K(0, 0, 0, 100, 5, MAT.wood)], land: [[-20, 20, -100]],
  },
  pickle: {
    role: 'plat', w: 200, h: 60, ...MAT.slick, worlds: ['heaven', 'kitchen'],
    shapes: [K(-75, 0, 75, 0, 28)], land: [[-40, 40, -28]],
  },
  fork: {
    role: 'hazard', w: 110, h: 300, ...MAT.metal, worlds: ['heaven', 'kitchen'], ground: true,
    shapes: [B(0, 50, 22, 200, { r: 8 }), B(0, -55, 90, 20, { r: 6 }), B(0, -105, 90, 80, { hazard: 'poke' })],
  },
  fryer: {
    role: 'hazard', w: 200, h: 140, ...MAT.metal, front: true, worlds: ['heaven', 'kitchen'], anim: true, ground: true,
    shapes: [B(-92, 0, 16, 140, { r: 4 }), B(92, 0, 16, 140, { r: 4 }), B(0, 62, 200, 16), S(0, 0, 160, 90, { hazard: 'fry' })],
    land: [[-100, -84, -70], [84, 100, -70]],
  },
};

// Normalise: copy defaults, compute auto landing strips.
export const OBJECTS = {};
for (const [id, d] of Object.entries(defs)) {
  OBJECTS[id] = { id, friction: 0.7, bounce: 0.12, mat: 'wood', land: null, ...d };
  if (d.worlds === 'all') OBJECTS[id].worlds = WORLDS.map(w => w.id);
}

export function objectsForWorld(worldId, role) {
  return Object.values(OBJECTS).filter(o => o.worlds.includes(worldId) && (!role || o.role === role));
}

// Hazard / fail flavour text (used by HUD and FX).
export const FAIL_TEXT = {
  floor: ['5 SECOND RULE!', 'DROPPED IT!', 'FLOOR SAUSAGE!', 'OOPS!'],
  dog: ['GOOD BOY!', 'YOINK!', 'DOGGO SNACK!'],
  water: ['SPLASH!', 'SOGGY DOG!', 'SPLOOSH!'],
  space: ['LOST IN SPACE!', 'HOUSTON...', 'BYE BYE!'],
  heaven: ['FELL FROM GRACE!', 'NOT TODAY!', 'BACK TO EARTH!'],
  cut: ['CHOPPED!', 'SLICED!'],
  blend: ['SMOOTHIE!', 'BLENDED!'],
  boil: ['BOILED!', 'TOO HOT!'],
  burn: ['CHARRED!', 'TOO CRISPY!', 'OUCH, HOT!'],
  cat: ['CAT GOT IT!', 'MEOW-CH!'],
  flush: ['FLUSHED!', 'GROSS!'],
  shred: ['SHREDDED!', 'CONFIDENTIAL!'],
  slice: ['DELI SLICED!', 'SHAVED!'],
  pinch: ['PINCHED!', 'CRABBED!'],
  gull: ['SEAGULL\'D!', 'MINE! MINE!'],
  zap: ['ZAPPED!', 'LASERED!'],
  poke: ['FORKED!', 'POKED!'],
  fry: ['DEEP FRIED!', 'CORN DOG\'D!'],
  stuck: ['LOST IT!', 'WHOOPS!', 'UH-OH!'],
};
