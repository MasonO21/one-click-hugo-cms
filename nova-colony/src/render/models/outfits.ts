/**
 * Outfit extras: what makes each outfit more than a colour — built in fixed colours from the
 * cosmetic's `color` / `accent` on top of the tinted settler parts (characters.ts).
 *
 *  - `outfitBodyGeometry`: the player's `outfit` cosmetic, in HIP space (hems, apron, longcoat tails,
 *    scarf, backpack, glowing seams, epaulettes...). One mesh for the player.
 *  - `uniformBodyGeometry` / `uniformHeadGeometry`: a `colonist_outfit`, in HIP / NECK space (bib
 *    straps, lab-coat tails, armour plates, piping; wide field hats, fur-lined hoods, helmets, peaked
 *    caps), drawn instanced for every colonist.
 *
 * Unknown ids (and outfits that are just their colours) give null.
 */
import * as THREE from 'three';
import { GeoBuilder, SLOT_GLOW } from '../core/GeoBuilder';
import { lathe, ellipsoid, sweep, mirror, capsuleProfile } from './soft';
import { torsoRadius, torsoFront, TORSO_DEPTH, HEAD_CY, headShell, SHOULDER_X, SHOULDER_Y } from './characters';

type C = string;
const _c = new THREE.Color();
function shade(hex: C, k: number): C {
  return '#' + _c.set(hex).multiplyScalar(k).getHexString();
}
const BRASS = '#c9a24e';
const GOLD = '#d8b45a';

/** A band around the torso between y0 (bottom) and y1 (top), `out` past the torso, flaring by `flare` at the bottom. */
function band(b: GeoBuilder, color: C, y0: number, y1: number, out = 0.012, flare = 0, opts: { slot?: number } = {}): void {
  const r1 = torsoRadius(y1) + out;
  const r0 = Math.max(torsoRadius(y0), torsoRadius(Math.max(y0, 0.0))) + out + flare;
  lathe(b, [r0 - 0.01, y0 - 0.004, r0, y0 + 0.006, r1, y1 - 0.006, r1 - 0.012, y1 + 0.004], 14, 0, 0, 0, color, { sz: TORSO_DEPTH * 1.04, ...opts });
}

/** A skirt-like panel (coat tails, apron, slicker hem) as a sector of an open cone around the hips. */
function panel(b: GeoBuilder, color: C, top: number, bottom: number, rTop: number, rBot: number, centre: number, width: number, depth = 0.82): void {
  b.add(new THREE.CylinderGeometry(rTop, rBot, top - bottom, 14, 1, true, centre - width / 2, width), color, 0, (top + bottom) / 2, 0, { sz: depth });
}

/** Thin line along the torso surface through (x, y) points (seams, piping, sashes). */
function seam(b: GeoBuilder, color: C, pts: number[], r: number, slot = 0, lift = 0.006): void {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(pts[i], pts[i + 1], torsoFront(pts[i], pts[i + 1], lift), r);
  sweep(b, out, 5, color, { slot });
}

/** Side seam: down the flank at the widest point of the torso. */
function sideSeam(b: GeoBuilder, color: C, s: number, y0: number, y1: number, r: number, slot = 0): void {
  const out: number[] = [];
  for (let k = 0; k <= 5; k++) {
    const y = y1 + ((y0 - y1) * k) / 5;
    out.push(s * (torsoRadius(y) + 0.004), y, 0, r);
  }
  sweep(b, out, 5, color, { slot });
}

function buttons(b: GeoBuilder, color: C, x: number, ys: number[], r = 0.014): void {
  for (const y of ys) b.sphere(r, x, y, torsoFront(x, y, 0.008), color, 6);
}

/** Epaulette pads on both shoulders, with a short fringe. */
function epaulettes(b: GeoBuilder, color: C, fringe: C): void {
  mirror((s) => {
    ellipsoid(b, 0.07, 0.022, 0.06, s * (SHOULDER_X + 0.01), SHOULDER_Y + 0.075, 0, color, 10, { rz: -s * 0.35 });
    for (let k = 0; k < 4; k++) b.add(new THREE.CapsuleGeometry(0.006, 0.03, 1, 4), fringe, s * (SHOULDER_X + 0.07), SHOULDER_Y + 0.03, -0.04 + k * 0.027, { rz: -s * 0.35 });
  });
}

const OUTFIT_BODY: Record<string, (b: GeoBuilder, c: C, a: C) => void> = {
  outfit_pioneer: (b, c, a) => {
    band(b, shade(c, 0.9), -0.1, 0.05, 0.014, 0.02); // jacket hem over the hips
    buttons(b, a, 0.025, [0.38, 0.28, 0.18, 0.1], 0.012);
    seam(b, shade(c, 0.8), [-0.16, 0.44, -0.09, 0.4, 0, 0.36, 0.09, 0.4, 0.16, 0.44], 0.01); // yoke
  },
  outfit_engineer: (b, c, a) => {
    // bib front, straps over the shoulders, tool pouches, a spanner
    b.bevelBox(0.2, 0.2, 0.02, 0, 0.26, torsoFront(0, 0.26, 0.008), shade(c, 0.92), 0.012);
    mirror((s) => {
      sweep(b, [s * 0.08, 0.36, torsoFront(0.08, 0.36, 0.01), 0.016, s * 0.11, 0.47, 0.08, 0.016, s * 0.12, 0.5, -0.02, 0.016, s * 0.1, 0.42, -0.13, 0.016, s * 0.09, 0.1, -0.13, 0.016], 5, shade(c, 0.85));
      b.bevelBox(0.07, 0.08, 0.05, s * 0.165, -0.03, 0.07, a, 0.012, { ry: s * 0.6 });
    });
    sweep(b, [0.19, 0.0, 0.08, 0.009, 0.2, 0.09, 0.08, 0.009], 4, '#9aa4b0');
    b.add(new THREE.TorusGeometry(0.016, 0.006, 4, 8, Math.PI * 1.5), '#9aa4b0', 0.2, 0.105, 0.08);
  },
  outfit_frontier_knit: (b, c, a) => {
    b.add(new THREE.TorusGeometry(0.1, 0.045, 8, 16), a, 0, 0.475, 0, { rx: Math.PI / 2 + 0.2, sz: 0.85 }); // roll collar
    band(b, shade(c, 0.82), -0.06, 0.04, 0.016); // ribbed hem
    for (const x of [-0.085, 0, 0.085]) for (let y = 0.1; y <= 0.4; y += 0.05) ellipsoid(b, 0.02, 0.028, 0.012, x, y, torsoFront(x, y, 0.002), shade(c, 0.86), 6, { rz: (Math.round(y * 20) % 2 ? 0.5 : -0.5) }); // cables
  },
  outfit_botanist: (b, c, a) => {
    panel(b, a, 0.36, -0.24, 0.205, 0.225, 0, 1.25, 0.84); // canvas apron
    mirror((s) => sweep(b, [s * 0.09, 0.36, torsoFront(0.09, 0.36, 0.01), 0.008, s * 0.08, 0.48, 0.05, 0.008, 0, 0.53, -0.04, 0.008], 4, shade(a, 0.8)));
    sweep(b, [-0.2, 0.06, 0.02, 0.008, -0.22, 0.0, -0.08, 0.009, -0.2, -0.08, -0.12, 0.007], 4, shade(a, 0.8)); // waist tie
    b.bevelBox(0.12, 0.075, 0.016, 0.0, -0.05, 0.196, shade(a, 0.88), 0.008); // pocket
    for (let k = 0; k < 3; k++) b.box(0.03, 0.045, 0.006, -0.035 + k * 0.035, -0.01, 0.2, ['#d86a3a', '#e8c46a', '#7fa860'][k], { rz: (k - 1) * 0.15 }); // seed packets
  },
  outfit_storm_slicker: (b, c, a) => {
    panel(b, c, 0.05, -0.32, 0.2, 0.245, 0, Math.PI * 2, 0.8); // long slicker hem
    lathe(b, [0.24, -0.335, 0.248, -0.32, 0.246, -0.28, 0.238, -0.275], 16, 0, 0, 0, a, { sz: 0.8 }); // trim
    ellipsoid(b, 0.17, 0.1, 0.1, 0, 0.47, -0.13, shade(c, 0.9), 12, { rx: 0.5 }); // hood down
    for (const y of [0.36, 0.26, 0.16]) b.add(new THREE.CapsuleGeometry(0.008, 0.04, 1, 4), a, 0.0, y, torsoFront(0, y, 0.012), { rz: Math.PI / 2 }); // toggles
  },
  outfit_astro: (b, c, a) => {
    b.bevelBox(0.3, 0.36, 0.14, 0, 0.28, -0.2, c, 0.05); // life-support pack
    b.box(0.31, 0.04, 0.145, 0, 0.36, -0.2, a);
    mirror((s) => lathe(b, capsuleProfile(0.035, 0.12, 0.035, 0.38, 2), 8, s * 0.1, 0, -0.28, shade(c, 0.9)));
    b.bevelBox(0.12, 0.08, 0.04, 0, 0.27, torsoFront(0, 0.27, 0.02), shade(c, 0.85), 0.015); // chest box
    for (let k = 0; k < 3; k++) b.sphere(0.009, -0.03 + k * 0.03, 0.275, torsoFront(0, 0.27, 0.04), ['#4fd8a8', '#e8c43a', a][k], 4, { slot: SLOT_GLOW });
    b.add(new THREE.TorusGeometry(0.11, 0.03, 8, 18), shade(c, 0.88), 0, 0.49, 0, { rx: Math.PI / 2 }); // neck ring
  },
  outfit_neon_runner: (b, c, a) => {
    mirror((s) => {
      sideSeam(b, a, s, 0.0, 0.4, 0.008, SLOT_GLOW);
      seam(b, a, [s * 0.04, 0.46, s * 0.12, 0.4, s * 0.18, 0.36], 0.007, SLOT_GLOW);
    });
    seam(b, a, [-0.09, 0.03, 0, 0.03, 0.09, 0.03], 0.008, SLOT_GLOW);
    b.add(new THREE.TorusGeometry(0.095, 0.03, 6, 16), shade(c, 1.4), 0, 0.49, 0, { rx: Math.PI / 2, sz: 0.85 }); // high collar
  },
  outfit_nomad: (b, c, a) => {
    b.add(new THREE.TorusGeometry(0.1, 0.055, 8, 16), a, 0, 0.47, 0.01, { rx: Math.PI / 2 + 0.15, sz: 0.9 }); // scarf
    sweep(b, [-0.06, 0.44, 0.15, 0.04, -0.08, 0.32, torsoFront(-0.08, 0.32, 0.03), 0.035, -0.07, 0.2, torsoFront(-0.07, 0.2, 0.025), 0.028], 6, a, { sz: 0.8 }); // scarf tail
    // a sash wrapped from the left shoulder to the right hip, a layered waist wrap
    seam(b, shade(c, 0.85), [0.15, 0.42, 0.08, 0.32, 0.0, 0.22, -0.08, 0.12, -0.15, 0.04], 0.022);
    band(b, shade(c, 0.9), -0.05, 0.08, 0.018, 0.012);
  },
  outfit_observatory: (b, c, a) => {
    // longcoat: tails behind and either side of the legs, a high collar, brass buttons, stitched stars
    panel(b, c, 0.04, -0.46, 0.2, 0.26, Math.PI, 2.2, 0.85);
    mirror((s) => panel(b, c, 0.04, -0.4, 0.2, 0.25, s * 1.05, 0.7, 0.85));
    band(b, c, -0.04, 0.06, 0.016);
    ellipsoid(b, 0.15, 0.08, 0.1, 0, 0.5, -0.06, shade(c, 0.9), 12, { rx: -0.3 }); // turned-up collar
    mirror((s) => buttons(b, a, s * 0.06, [0.36, 0.26, 0.16, 0.07], 0.013));
    const stars = [-0.12, 0.38, -0.05, 0.3, 0.06, 0.34, 0.12, 0.24];
    for (let i = 0; i < stars.length; i += 2) b.sphere(0.01, stars[i], stars[i + 1], -torsoFront(stars[i], stars[i + 1], 0.004), a, 4);
    const line: number[] = [];
    for (let i = 0; i < stars.length; i += 2) line.push(stars[i], stars[i + 1], -torsoFront(stars[i], stars[i + 1], 0.003), 0.003);
    sweep(b, line, 3, a);
  },
  outfit_founder: (b, c, a) => {
    epaulettes(b, a, a);
    seam(b, '#2a3557', [0.15, 0.42, 0.06, 0.3, -0.04, 0.18, -0.13, 0.05], 0.02); // sash
    ellipsoid(b, 0.024, 0.024, 0.008, -0.1, 0.3, torsoFront(-0.1, 0.3, 0.012), a, 8); // medal
    sweep(b, [-0.1, 0.35, torsoFront(-0.1, 0.35, 0.01), 0.008, -0.1, 0.32, torsoFront(-0.1, 0.32, 0.01), 0.008], 4, '#b8453a');
    buttons(b, a, 0.04, [0.38, 0.28, 0.18], 0.012);
  },
  outfit_nebula: (b, c, a) => {
    mirror((s) => {
      sideSeam(b, a, s, 0.0, 0.42, 0.007, SLOT_GLOW);
      seam(b, a, [s * 0.02, 0.44, s * 0.1, 0.32, s * 0.17, 0.24], 0.006, SLOT_GLOW);
    });
    seam(b, a, [0, 0.45, 0, 0.3, 0, 0.12, 0, 0.03], 0.006, SLOT_GLOW);
    b.add(new THREE.TorusGeometry(0.1, 0.028, 6, 16), shade(c, 1.2), 0, 0.49, 0, { rx: Math.PI / 2, sz: 0.85 });
    ellipsoid(b, 0.03, 0.03, 0.008, 0.11, 0.33, torsoFront(0.11, 0.33, 0.01), a, 8, { slot: SLOT_GLOW }); // emblem
  },
};

const UNIFORM_BODY: Record<string, (b: GeoBuilder, c: C, a: C) => void> = {
  colonist_overalls: (b, c, a) => {
    b.bevelBox(0.19, 0.18, 0.018, 0, 0.25, torsoFront(0, 0.25, 0.008), shade(c, 0.92), 0.01);
    mirror((s) => {
      sweep(b, [s * 0.075, 0.33, torsoFront(0.075, 0.33, 0.01), 0.015, s * 0.1, 0.47, 0.07, 0.015, s * 0.11, 0.5, -0.02, 0.015, s * 0.09, 0.4, -0.13, 0.015, s * 0.08, 0.1, -0.13, 0.015], 5, shade(c, 0.85));
      b.sphere(0.014, s * 0.075, 0.335, torsoFront(0.075, 0.335, 0.02), a, 6);
    });
  },
  colonist_labcoat: (b, c, a) => {
    panel(b, c, 0.04, -0.4, 0.2, 0.25, Math.PI, 2.4, 0.85);
    mirror((s) => panel(b, c, 0.04, -0.36, 0.2, 0.24, s * 1.0, 0.75, 0.85));
    band(b, c, -0.04, 0.06, 0.016);
    mirror((s) => sideSeam(b, a, s, 0.0, 0.42, 0.006));
    for (let k = 0; k < 2; k++) sweep(b, [0.08 + k * 0.025, 0.31, torsoFront(0.09, 0.31, 0.012), 0.006, 0.08 + k * 0.025, 0.36, torsoFront(0.09, 0.36, 0.012), 0.006], 4, k ? '#d8463a' : '#3a6ab8'); // pens
  },
  colonist_security: (b, c, a) => {
    ellipsoid(b, 0.17, 0.14, 0.045, 0, 0.32, torsoFront(0, 0.32, -0.018), shade(c, 1.1), 14); // chest plate
    seam(b, a, [-0.11, 0.32, 0, 0.32, 0.11, 0.32], 0.012, 0, 0.034);
    mirror((s) => {
      ellipsoid(b, 0.085, 0.05, 0.09, s * (SHOULDER_X + 0.015), SHOULDER_Y + 0.06, 0, shade(c, 1.05), 12, { rz: -s * 0.4 });
      sweep(b, [s * (SHOULDER_X + 0.06), SHOULDER_Y + 0.07, -0.06, 0.008, s * (SHOULDER_X + 0.08), SHOULDER_Y + 0.05, 0.0, 0.008, s * (SHOULDER_X + 0.06), SHOULDER_Y + 0.07, 0.06, 0.008], 4, a);
    });
  },
  colonist_parkas: (b, c) => {
    panel(b, c, 0.06, -0.24, 0.2, 0.24, 0, Math.PI * 2, 0.82); // parka hem
    for (const y of [0.37, 0.27, 0.17]) b.add(new THREE.CapsuleGeometry(0.008, 0.04, 1, 4), '#6a4a32', 0.0, y, torsoFront(0, y, 0.012), { rz: Math.PI / 2 });
  },
  colonist_dress_uniform: (b, c, a) => {
    epaulettes(b, GOLD, GOLD);
    mirror((s) => buttons(b, GOLD, s * 0.06, [0.36, 0.27, 0.18, 0.09], 0.012));
    seam(b, a, [-0.14, 0.04, 0, 0.04, 0.14, 0.04], 0.012); // cream sash belt
    seam(b, GOLD, [-0.16, 0.44, -0.08, 0.41, 0, 0.4, 0.08, 0.41, 0.16, 0.44], 0.007); // piping
  },
};

const UNIFORM_HEAD: Record<string, (b: GeoBuilder, c: C, a: C) => void> = {
  colonist_harvest: (_b, c, a) => {
    // wide canvas field hat with a green band (sized over any hair style)
    const b = _b;
    const straw = shade(c, 1.15);
    lathe(b, [0.235, 0.34, 0.238, 0.4, 0.226, 0.5, 0.2, 0.57, 0.14, 0.61, 0.0, 0.62], 14, 0, 0, -0.02, straw);
    lathe(b, [0.22, 0.35, 0.36, 0.34, 0.41, 0.33, 0.415, 0.345, 0.37, 0.355, 0.22, 0.368], 18, 0, 0, -0.02, shade(straw, 0.92));
    lathe(b, [0.239, 0.37, 0.242, 0.374, 0.236, 0.42, 0.232, 0.424], 14, 0, 0, -0.02, a);
  },
  colonist_parkas: (b, c, a) => {
    // fur-lined hood, up: covers the crown, sides and back; a cream fur ring frames the face
    headShell(b, c, 18, 0, Math.PI * 2, 0, 2.25, -1.0, 0.062);
    b.add(new THREE.TorusGeometry(0.18, 0.048, 8, 20), a, 0, HEAD_CY - 0.07, 0.115, { rx: 0.57, sy: 1.08 });
  },
  colonist_security: (b, c, a) => {
    // rounded helmet with a red crest stripe and a short brim
    headShell(b, shade(c, 1.08), 18, 0, Math.PI * 2, 0, 1.55, -0.35, 0.075);
    sweep(b, [0, 0.43, 0.2, 0.014, 0, 0.56, 0.08, 0.016, 0, 0.58, -0.08, 0.016, 0, 0.5, -0.24, 0.014], 5, a);
    ellipsoid(b, 0.17, 0.016, 0.07, 0, 0.395, 0.225, shade(c, 0.85), 12, { rx: -0.15 });
  },
  colonist_dress_uniform: (b, c, a) => {
    // peaked cap: navy crown, cream band, black peak, gold badge
    lathe(b, [0.226, 0.36, 0.232, 0.42, 0.25, 0.5, 0.25, 0.53, 0.2, 0.55, 0.0, 0.56], 16, 0, 0, -0.01, c);
    lathe(b, [0.226, 0.358, 0.233, 0.362, 0.233, 0.41, 0.228, 0.414], 16, 0, 0, -0.01, a);
    ellipsoid(b, 0.17, 0.016, 0.1, 0, 0.36, 0.2, '#1c1e24', 12, { rx: 0.2 });
    b.sphere(0.026, 0, 0.44, 0.235, GOLD, 8, { sz: 0.4 });
  },
};

const cache = new Map<string, THREE.BufferGeometry | null>();
function make(table: Record<string, (b: GeoBuilder, c: C, a: C) => void>, kind: string, id: string | undefined, color: C, accent: C): THREE.BufferGeometry | null {
  if (!id || !table[id]) return null;
  const key = `${kind}|${id}|${color}|${accent}`;
  if (cache.has(key)) return cache.get(key)!;
  const b = new GeoBuilder(id.length * 23 + 11);
  table[id](b, color, accent);
  const g = b.isEmpty ? null : b.build();
  cache.set(key, g);
  return g;
}

/** The player's outfit extras (hip space), or null. */
export function outfitBodyGeometry(id: string | undefined, color: C, accent: C): THREE.BufferGeometry | null {
  return make(OUTFIT_BODY, 'ob', id, color, accent);
}

/** A colonist uniform's body extras (hip space), or null. */
export function uniformBodyGeometry(id: string | undefined, color: C, accent: C): THREE.BufferGeometry | null {
  return make(UNIFORM_BODY, 'ub', id, color, accent);
}

/** A colonist uniform's headwear (neck space), or null. */
export function uniformHeadGeometry(id: string | undefined, color: C, accent: C): THREE.BufferGeometry | null {
  return make(UNIFORM_HEAD, 'uh', id, color, accent);
}

export const OUTFITS_WITH_EXTRAS = Object.keys(OUTFIT_BODY);
export const UNIFORMS_WITH_BODY = Object.keys(UNIFORM_BODY);
export const UNIFORMS_WITH_HEAD = Object.keys(UNIFORM_HEAD);
