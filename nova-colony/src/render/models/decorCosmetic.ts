/**
 * Cosmetic decor models — the exclusive decor that `decoration` cosmetics unlock (data/decorCosmetic.ts):
 * garden gnome, toadstool ring, pumpkin patch, hay bale, lantern arch, lantern string, holo tree,
 * teddy picnic and the wishing star fountain.
 *
 * Style: the cozy world kit (models/nature.ts) — round puffs with sunlit gradients, bells of
 * revolution, warm glowing lanterns — so they sit in the meadow like they grew there. They are
 * cosmetic, not tiered: the colours are their own and they look the same at every colony tier.
 * Animated bits (fairy light, hologram scan ring, the star) are parts.
 */
import * as THREE from 'three';
import { SLOT_GLOW, type GeoBuilder, type PrimOpts } from '../core/GeoBuilder';
import { registerModel } from './spec';

const GRASS_LO = '#58ae48';
const GRASS_HI = '#9ad35e';
const MOSS_LO = '#5fa83f';
const MOSS_HI = '#a9d85c';
const WOOD = '#9c6b3c';
const WOOD_HI = '#c08a52';
const STRAW = '#e2b94e';
const STRAW_HI = '#f6dc8a';
const P = (o: PrimOpts): PrimOpts => o;

/** A soft, low grassy mound (top `h` above the ground) for small decor to stand on. */
function lawn(b: GeoBuilder, r: number, h = 0.08): void {
  const sy = 0.3;
  b.puff(r, 0, h - r * sy, 0, GRASS_LO, 1, P({ sy, grad: GRASS_HI, shade: 0.04 }));
}

/** Red toadstool with white dots, cap radius 0.3·s. */
function toadstool(b: GeoBuilder, x: number, z: number, s: number, cap = '#e2504a', capHi = '#ff8a6a'): void {
  b.cyl(0.08 * s, 0.11 * s, 0.4 * s, x, 0.2 * s, z, '#f4ead6', 6);
  b.lathe([0, 0, 0.3 * s, 0, 0.29 * s, 0.07 * s, 0.2 * s, 0.18 * s, 0, 0.24 * s], x, 0.36 * s, z, cap, 9, P({ grad: capHi }));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + x;
    b.puff(0.035 * s, x + Math.cos(a) * 0.15 * s, 0.52 * s + (i % 2) * 0.03 * s, z + Math.sin(a) * 0.15 * s, '#ffffff', 0);
  }
}

/** A daisy on a stem. */
function daisy(b: GeoBuilder, x: number, z: number, h: number, petal = '#ffffff', centre = '#ffd84a'): void {
  b.cyl(0.018, 0.025, h, x, h / 2, z, '#5d9a3c', 3);
  b.cyl(0.11, 0.08, 0.04, x, h, z, petal, 7, P({ grad: '#ffffff' }));
  b.puff(0.045, x, h + 0.03, z, centre, 0, P({ sy: 0.7 }));
}

/** Paper lantern (glows), hanging from (x, y, z): a cap, the glowing bell and a tassel. */
function paperLantern(b: GeoBuilder, x: number, y: number, z: number, col: string, r = 0.22): void {
  b.cyl(0.01, 0.01, 0.16, x, y - 0.08, z, '#4a3424', 3);
  b.cyl(r * 0.55, r * 0.6, 0.06, x, y - 0.18, z, '#3a2a20', 7);
  b.lathe([r * 0.55, 0, r * 0.95, r * 0.45, r, r * 0.9, r * 0.9, r * 1.4, r * 0.55, r * 1.75], x, y - 0.21 - r * 1.75, z, col, 9, P({ slot: SLOT_GLOW }));
  b.cyl(r * 0.5, r * 0.55, 0.05, x, y - 0.24 - r * 1.75, z, '#3a2a20', 7);
  b.cone(0.04, 0.16, x, y - 0.36 - r * 1.75, z, '#e8443a', 4, P({ rx: Math.PI }));
}

/** A five-pointed star (extruded, rounded edges), facing +Z, centred on (x,y,z). */
function star(b: GeoBuilder, r: number, x: number, y: number, z: number, col: string, opts: PrimOpts = {}): void {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: r * 0.3, bevelEnabled: true, bevelThickness: r * 0.12, bevelSize: r * 0.1, bevelSegments: 1, curveSegments: 1 });
  geo.translate(0, 0, -r * 0.15);
  b.add(geo, col, x, y, z, opts);
}

registerModel('gnome', (c) => {
  const { b } = c;
  lawn(b, 0.85);
  // the gnome: blue coat, white beard, rosy face, tall red hat leaning back
  b.lathe([0, 0, 0.3, 0, 0.32, 0.12, 0.26, 0.42, 0.16, 0.62, 0, 0.66], 0, 0.02, 0, '#3f78c8', 9, P({ grad: '#6aa0e8' }));
  b.cyl(0.33, 0.33, 0.07, 0, 0.3, 0, '#5a3a22', 9); // belt
  b.box(0.1, 0.08, 0.04, 0, 0.3, 0.32, '#ffd84a');
  b.puff(0.21, 0, 0.73, 0.02, '#f6c6a4', 1, P({ grad: '#ffd8bc' })); // face
  b.lathe([0.2, 0, 0.22, 0.08, 0.16, 0.2, 0.06, 0.32, 0, 0.36], 0, 0.68, 0.12, '#eceae4', 8, P({ rx: Math.PI, grad: '#ffffff' })); // beard (points down)
  b.puff(0.13, 0, 0.66, 0.2, '#ffffff', 0, P({ sx: 1.5, sy: 0.6 })); // moustache
  b.puff(0.07, 0, 0.74, 0.22, '#f08a7a', 0); // nose
  for (const sx of [-1, 1]) {
    b.puff(0.03, sx * 0.08, 0.8, 0.18, '#2a1e18', 0); // eyes
    b.puff(0.05, sx * 0.13, 0.68, 0.16, '#ff9a8a', 0, P({ sy: 0.6 })); // cheeks
    b.puff(0.08, sx * 0.3, 0.38, 0.08, '#f6c6a4', 0); // hands
    b.puff(0.1, sx * 0.13, 0.04, 0.12, '#5a3a22', 0, P({ sz: 1.4, sy: 0.6 })); // boots
  }
  b.lathe([0.25, 0, 0.24, 0.18, 0.15, 0.42, 0.06, 0.62, 0, 0.72], 0, 0.82, -0.04, '#e0443a', 9, P({ rx: -0.22, grad: '#ff7a5a' })); // hat
  b.puff(0.05, 0, 1.52, -0.22, '#ffd84a', 0);
  // little garden: a toadstool and daisies
  toadstool(b, 0.5, -0.35, 0.55);
  daisy(b, -0.5, 0.35, 0.3);
  daisy(b, -0.35, -0.5, 0.26, '#ff9ec4');
  daisy(b, 0.45, 0.5, 0.24, '#c9a6ff');
});

registerModel('toadstool_ring', (c) => {
  const { b } = c;
  lawn(b, 1.95);
  b.puff(0.8, 0, -0.12, 0, MOSS_LO, 1, P({ sy: 0.4, grad: MOSS_HI }));
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = 0.62 + ((i * 7) % 5) * 0.12;
    const alt = i % 3 === 2;
    toadstool(b, Math.cos(a) * 1.4, Math.sin(a) * 1.4, s, alt ? '#ff8a3a' : '#e2504a', alt ? '#ffc070' : '#ff8a6a');
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    daisy(b, Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.22 + (i % 2) * 0.06, i % 2 ? '#ffffff' : '#ff9ec4');
  }
  // a fairy light drifting over the ring
  c.part('bobSpin', 0, 0.9, 0, (pb) => {
    pb.puff(0.09, 0.6, 0, 0, '#fff2a8', 1, { slot: SLOT_GLOW });
    pb.puff(0.06, -0.5, 0.15, 0.3, '#ffc2e8', 0, { slot: SLOT_GLOW });
  }, 0.7, 0.25);
  c.emit('motes', 0, 0.7, 0, 1.2, '#ffd8f0');
});

/** A ribbed pumpkin of radius r at (x, z) with a curly stem. */
function pumpkin(b: GeoBuilder, x: number, z: number, r: number, face = false, y0 = 0): void {
  const ribs = 6;
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * Math.PI * 2;
    b.puff(r * 0.6, x + Math.cos(a) * r * 0.42, y0 + r * 0.72, z + Math.sin(a) * r * 0.42, '#e0702a', 1, P({ sy: 1.15, grad: '#ffae4a', shade: 0.03 }));
  }
  b.puff(r * 0.55, x, y0 + r * 0.75, z, '#e87a2e', 0, P({ sy: 1.2 }));
  b.cyl(r * 0.08, r * 0.12, r * 0.4, x, y0 + r * 1.5, z, '#6a8a3a', 5, P({ rz: 0.25 }));
  b.puff(r * 0.22, x + r * 0.25, y0 + r * 1.35, z + r * 0.1, '#6aa84a', 0, P({ sy: 0.3, sx: 1.6, grad: '#9ad060' }));
  if (face) {
    // a friendly carved smile that glows at night
    const fz = z + r * 0.98;
    for (const sx of [-1, 1]) b.cone(r * 0.13, r * 0.2, x + sx * r * 0.3, y0 + r * 0.95, fz, '#ffc84a', 3, P({ slot: SLOT_GLOW, rx: Math.PI / 2 }));
    b.box(r * 0.55, r * 0.1, r * 0.08, x, y0 + r * 0.55, fz - r * 0.02, '#ffc84a', P({ slot: SLOT_GLOW }));
    for (const sx of [-1, 1]) b.box(r * 0.1, r * 0.12, r * 0.08, x + sx * r * 0.3, y0 + r * 0.62, fz - r * 0.02, '#ffc84a', P({ slot: SLOT_GLOW }));
  }
}

registerModel('pumpkin_patch', (c) => {
  const { b } = c;
  // a tilled bed with curly vines, big leaves and pumpkins of every size
  b.bevelBox(3.4, 0.28, 3.4, 0, 0.06, 0, '#6a4630', 0.14, P({ shade: 0.05 }));
  for (let i = 0; i < 4; i++) b.box(3.1, 0.06, 0.18, 0, 0.22, -1.2 + i * 0.8, '#5a3a26', P({ shade: 0.05 }));
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399;
    const rr = 0.4 + (i % 4) * 0.35;
    b.puff(0.3, Math.cos(a) * rr, 0.26, Math.sin(a) * rr, '#4f9a44', 0, P({ sy: 0.28, sx: 1.4, grad: '#9ad060', ry: a }));
  }
  for (let i = 0; i < 4; i++) b.torus(0.25, 0.025, -1.2 + i * 0.8, 0.32, 1.3 - (i % 2) * 2.6, '#6a8a3a', 8, 3, { rx: Math.PI / 2 });
  pumpkin(b, -0.2, 0.2, 0.7, true, 0.12);
  pumpkin(b, 1.0, -0.8, 0.42, false, 0.16);
  pumpkin(b, -1.1, -0.9, 0.36, false, 0.16);
  pumpkin(b, 1.1, 0.95, 0.3, false, 0.16);
  pumpkin(b, -1.15, 1.0, 0.26, false, 0.16);
  c.setLight(-0.2, 0.9, 1.0, '#ffb24a', 0.5, 5);
});

registerModel('hay_bale', (c) => {
  const { b } = c;
  lawn(b, 0.85);
  b.bevelBox(1.3, 0.7, 0.85, 0, 0.36, 0, STRAW, 0.16, P({ grad: STRAW_HI, shade: 0.06 }));
  for (const x of [-0.35, 0.35]) b.bevelBox(0.06, 0.74, 0.89, x, 0.36, 0, '#a8742e', 0.02);
  // a few stray straw wisps
  for (let i = 0; i < 4; i++) b.cyl(0.012, 0.012, 0.24, -0.5 + i * 0.3, 0.7, 0.36, STRAW_HI, 3, P({ rz: (i % 2 ? 1 : -1) * 1.1 }));
  // scarecrow straw hat with a ribbon
  b.cyl(0.42, 0.44, 0.04, 0.1, 0.74, 0, STRAW_HI, 10, P({ rz: 0.12 }));
  b.lathe([0.22, 0, 0.21, 0.14, 0.14, 0.24, 0, 0.27], 0.11, 0.75, 0, STRAW, 9, P({ rz: 0.12, grad: STRAW_HI }));
  b.cyl(0.225, 0.225, 0.06, 0.11, 0.8, 0, '#e2504a', 9, P({ rz: 0.12 }));
  pumpkin(b, 0.55, 0.55, 0.22);
  daisy(b, -0.6, 0.55, 0.26);
});

registerModel('lantern_arch', (c) => {
  const { b } = c;
  const red = '#c8443a';
  const redHi = '#e86a52';
  for (const sx of [-1, 1]) {
    b.cyl(0.24, 0.3, 0.3, sx * 1.55, 0.15, 0, '#a89a8a', 8, P({ grad: '#cfc4b4' }));
    b.cyl(0.13, 0.15, 2.7, sx * 1.55, 1.65, 0, red, 8, P({ grad: redHi, shade: 0.03 }));
  }
  // curved top beam (half torus) and a straight tie beam
  b.add(new THREE.TorusGeometry(1.55, 0.13, 6, 18, Math.PI), red, 0, 2.6, 0, P({ sy: 0.5, grad: redHi }));
  b.box(3.6, 0.16, 0.24, 0, 2.6, 0, WOOD, P({ grad: WOOD_HI }));
  b.bevelBox(0.7, 0.36, 0.1, 0, 3.02, 0.08, '#ffd84a', 0.04);
  // lanterns under the beam
  const cols = ['#ff7a4a', '#ffcf4a', '#ff5a6a', '#ffcf4a', '#ff7a4a'];
  for (let i = 0; i < 5; i++) paperLantern(b, -1.2 + i * 0.6, 2.52, 0, cols[i], i % 2 ? 0.17 : 0.2);
  c.setLight(0, 2.1, 0, '#ffb86a', 0.9, 8);
});

registerModel('lantern_string', (c) => {
  const { b } = c;
  for (const sx of [-1, 1]) {
    b.cyl(0.07, 0.09, 2.4, sx * 1.65, 1.2, 0, WOOD, 6, P({ grad: WOOD_HI }));
    b.puff(0.12, sx * 1.65, 2.42, 0, '#ffd84a', 0);
    b.puff(0.2, sx * 1.65, 0.05, 0, MOSS_LO, 0, P({ sy: 0.4, grad: MOSS_HI }));
  }
  // a sagging string between the posts with six little lanterns
  const pts: number[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(-1.65 + t * 3.3, 2.3 - Math.sin(t * Math.PI) * 0.55, 0);
  }
  b.pipe(pts, 0.02, '#4a3424', 3, false);
  const cols = ['#ff9ec4', '#ffe066', '#8fe8c8', '#ff9ec4', '#ffe066', '#8fe8c8'];
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 7;
    paperLantern(b, -1.65 + t * 3.3, 2.3 - Math.sin(t * Math.PI) * 0.55, 0, cols[i], 0.13);
  }
  c.setLight(0, 1.6, 0, '#ffd08a', 0.7, 7);
});

registerModel('holo_tree', (c) => {
  const { b } = c;
  // brass planter with a projector lens
  b.lathe([0.42, 0, 0.46, 0.1, 0.4, 0.42, 0.44, 0.48, 0.36, 0.5], 0, 0, 0, '#b8863a', 10, P({ grad: '#f0c870', shade: 0.03 }));
  b.cyl(0.32, 0.32, 0.04, 0, 0.5, 0, '#3a3f47', 10);
  b.cyl(0.12, 0.14, 0.06, 0, 0.54, 0, '#9ff6ff', 8, { slot: SLOT_GLOW });
  // the hologram: a shimmering cyan bubble tree with violet blossoms (glow only, so it reads at night)
  b.cyl(0.05, 0.09, 1.25, 0, 1.12, 0, '#4fd8ff', 6, { slot: SLOT_GLOW });
  b.cyl(0.03, 0.04, 0.45, 0.2, 1.55, 0, '#4fd8ff', 4, { slot: SLOT_GLOW, rz: -0.7 });
  const holo: [number, number, number, number, string][] = [
    [0.55, 0, 2.05, 0, '#46d8f0'],
    [0.4, 0.45, 1.85, 0.12, '#62e4f6'],
    [0.38, -0.44, 1.9, -0.1, '#62e4f6'],
    [0.36, 0.05, 1.82, -0.42, '#46d8f0'],
    [0.34, -0.05, 1.86, 0.42, '#62e4f6'],
    [0.34, 0.1, 2.5, 0.02, '#8ff0ff'],
  ];
  for (const [r, x, y, z, col] of holo) b.puff(r, x, y, z, col, 1, { slot: SLOT_GLOW });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3;
    b.puff(0.07, Math.cos(a) * 0.62, 2.0 + (i % 3) * 0.2 - 0.1, Math.sin(a) * 0.62, '#d0b4ff', 0, { slot: SLOT_GLOW });
  }
  // scan ring sliding up and down the hologram
  c.part('bob', 0, 1.7, 0, (pb) => {
    pb.torus(0.62, 0.025, 0, 0, 0, '#c8f8ff', 16, 3, { rx: Math.PI / 2, slot: SLOT_GLOW });
  }, 1.4, 0.55);
  c.emit('motes', 0, 1.9, 0, 1.6, '#7fe8ff');
  c.setLight(0, 1.9, 0, '#5ef2ff', 0.6, 6);
});

registerModel('teddy_picnic', (c) => {
  const { b } = c;
  // checked blanket
  const n = 6;
  const size = 3.0;
  const cell = size / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const red = (i + j) % 2 === 0;
      b.box(cell, 0.04, cell, -size / 2 + cell * (i + 0.5), 0.03, -size / 2 + cell * (j + 0.5), red ? '#e2504a' : '#fff4ea', P({ ry: 0.08 }));
    }
  }
  // the giant teddy, sitting at the back
  const fur = '#b4794a';
  const furHi = '#d8a070';
  const tx = -0.35;
  const tz = -0.55;
  b.puff(0.62, tx, 0.62, tz, fur, 1, P({ sy: 1.05, grad: furHi, shade: 0.03 })); // body
  b.puff(0.36, tx, 0.62, tz + 0.42, '#e8c49a', 1, P({ sy: 1.1 })); // tummy
  b.puff(0.46, tx, 1.5, tz + 0.05, fur, 1, P({ grad: furHi })); // head
  for (const sx of [-1, 1]) {
    b.puff(0.17, tx + sx * 0.36, 1.86, tz, fur, 1, P({ grad: furHi })); // ears
    b.puff(0.09, tx + sx * 0.36, 1.86, tz + 0.1, '#e8c49a', 0);
    b.puff(0.05, tx + sx * 0.16, 1.58, tz + 0.44, '#2a1e18', 0); // eyes
    b.puff(0.22, tx + sx * 0.6, 0.85, tz + 0.25, fur, 1, P({ sy: 1.4, grad: furHi, rz: sx * 0.6 })); // arms
    b.puff(0.26, tx + sx * 0.36, 0.22, tz + 0.55, fur, 1, P({ sz: 1.3, grad: furHi })); // legs
    b.puff(0.15, tx + sx * 0.36, 0.22, tz + 0.82, '#e8c49a', 0, P({ sz: 0.5 })); // paw pads
    b.puff(0.12, tx + sx * 0.14, 1.12, tz + 0.38, '#ff8aa8', 0, P({ sx: 1.2, sy: 0.8 })); // bow loops
  }
  b.puff(0.18, tx, 1.42, tz + 0.4, '#e8c49a', 0, P({ sy: 0.8 })); // muzzle
  b.puff(0.06, tx, 1.47, tz + 0.56, '#3a2418', 0); // nose
  b.puff(0.07, tx, 1.12, tz + 0.42, '#ff6b8a', 0); // bow knot
  // wicker basket with a handle
  b.bevelBox(0.7, 0.42, 0.5, 0.85, 0.25, 0.45, '#c89a5a', 0.06, P({ grad: '#e6bc80', shade: 0.06 }));
  b.box(0.74, 0.06, 0.54, 0.85, 0.47, 0.45, '#a8742e');
  b.torus(0.3, 0.035, 0.85, 0.48, 0.45, '#a8742e', 10, 3, { sz: 0.6 });
  b.puff(0.12, 0.7, 0.55, 0.4, '#e2384a', 0, P({ grad: '#ff8a7a' })); // apples
  b.puff(0.11, 0.95, 0.54, 0.5, '#8ad04a', 0, P({ grad: '#c8f08a' }));
  // plates with a cupcake and a sandwich
  b.cyl(0.24, 0.2, 0.04, 0.55, 0.07, 1.0, '#ffffff', 10);
  b.lathe([0.12, 0, 0.14, 0.1], 0.55, 0.09, 1.0, '#c89a5a', 8);
  b.puff(0.15, 0.55, 0.24, 1.0, '#ffc6e0', 0, P({ sy: 0.8, grad: '#ffe6f2' }));
  b.puff(0.04, 0.55, 0.36, 1.0, '#e2384a', 0);
  b.cyl(0.24, 0.2, 0.04, -0.75, 0.07, 0.95, '#ffffff', 10);
  b.box(0.3, 0.12, 0.2, -0.75, 0.15, 0.95, '#f6dc9a', P({ ry: 0.4 }));
  b.box(0.32, 0.03, 0.22, -0.75, 0.14, 0.95, '#6ab04a', P({ ry: 0.4 }));
});

registerModel('star_fountain', (c) => {
  const { b } = c;
  // round stone basin with a mossy rim and clear blue water
  b.lathe([1.6, 0, 1.7, 0.12, 1.66, 0.48, 1.5, 0.56, 1.42, 0.5, 1.4, 0.2, 0, 0.2], 0, 0, 0, '#bdb3c4', 14, P({ grad: '#e6dfe8', shade: 0.03 }));
  b.cyl(1.42, 1.42, 0.06, 0, 0.42, 0, '#5ec8ee', 14, P({ grad: '#9fe6ff' }));
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + 0.4;
    b.puff(0.24, Math.cos(a) * 1.58, 0.56, Math.sin(a) * 1.58, MOSS_LO, 0, P({ sy: 0.4, sx: 1.4, grad: MOSS_HI, ry: -a }));
  }
  // lily pads with a pink bloom
  b.cyl(0.22, 0.22, 0.02, 0.8, 0.46, 0.5, '#5aa848', 8);
  b.puff(0.08, 0.8, 0.5, 0.5, '#ff9ec4', 0);
  b.cyl(0.18, 0.18, 0.02, -0.7, 0.46, -0.6, '#5aa848', 8);
  // pedestal and a little upper bowl
  b.lathe([0.34, 0, 0.26, 0.3, 0.2, 1.1, 0.24, 1.3, 0.55, 1.42, 0.5, 1.5, 0, 1.5], 0, 0.4, 0, '#cbc2d2', 10, P({ grad: '#f2ecf4' }));
  b.cyl(0.48, 0.48, 0.04, 0, 1.88, 0, '#7fdcff', 10, { slot: SLOT_GLOW });
  // the wishing star: golden, glowing, slowly turning and bobbing above the bowl
  c.part('bobSpin', 0, 2.75, 0, (pb) => {
    star(pb, 0.55, 0, 0, 0, '#ffd84a', { slot: SLOT_GLOW });
    pb.puff(0.1, 0, 0, 0.16, '#fff6c8', 0, { slot: SLOT_GLOW });
  }, 0.6, 0.18);
  c.emit('drips', 0, 1.95, 0, 4, '#9fdcff');
  c.emit('motes', 0, 2.6, 0, 2, '#ffe680');
  c.setLight(0, 2.6, 0, '#ffd86a', 0.9, 8);
});

/** Model keys registered here (data/decorCosmetic.ts uses them; tests enumerate them). */
export const COSMETIC_DECOR_MODELS = ['gnome', 'toadstool_ring', 'pumpkin_patch', 'hay_bale', 'lantern_arch', 'lantern_string', 'holo_tree', 'teddy_picnic', 'star_fountain'];
