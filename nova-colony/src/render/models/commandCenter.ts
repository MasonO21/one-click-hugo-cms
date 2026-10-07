/**
 * The colony core: crashed escape pod (tier 0) → log camp → stone keep → steel command post → alloy
 * tower → nano spire → titanium citadel (tier 6). Footprint 3x3 cells (6x6 units). This is the
 * most-looked-at model in the game, so every tier is a little showcase: lots of readable secondary
 * shapes (roofs, towers, pipes, pylons), warm lights and props that make the heart of the colony
 * feel lived in. Animated parts keep their pivots: t1 flag (sway), t3 radar (spinY), t4 halo
 * (spinY), t5 floating core (bobSpin), t6 floating crystal (bobSpin).
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel, type ModelCtx } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER } from './colors';
import * as K from './kit_home';

const POD = '#dde3ea';
const POD_DARK = '#8d97a3';
const POD_ORANGE = '#ff8a3d';
const SCORCH = '#3a3230';

/**
 * The escape pod (reused by tiers 0-2): chunky capsule with hex panel plates and orange stripes,
 * a warm-lit window, an open hatch glowing inside, landing struts and a bent antenna.
 * Centred at (x,z), base at y, tilt in radians about Z.
 */
function pod(c: ModelCtx, x: number, y: number, z: number, tilt: number, scorched: boolean): void {
  const { b } = c;
  const o = { rz: tilt, ry: 0.4 };
  const up = (h: number) => ({ x: x + Math.sin(tilt) * -h, y: y + Math.cos(tilt) * h });
  const body = scorched ? '#c9d0d8' : POD;
  const p0 = up(1.3);
  b.cyl(1.12, 1.32, 2.2, p0.x, p0.y, z, body, 10, { ...o, shade: 0.03 });
  const p1 = up(2.9);
  b.cyl(0.62, 1.12, 1.0, p1.x, p1.y, z, body, 10, { ...o, shade: 0.03 });
  const p2 = up(3.6);
  b.cyl(0.0, 0.62, 0.5, p2.x, p2.y, z, POD_ORANGE, 10, o);
  const p3 = up(1.7);
  b.cyl(1.34, 1.34, 0.2, p3.x, p3.y, z, POD_ORANGE, 10, o);
  const p4 = up(0.8);
  b.cyl(1.34, 1.34, 0.2, p4.x, p4.y, z, POD_DARK, 10, o);
  // hex panel plates around the hull
  for (let i = 0; i < 3; i++) {
    const a = 0.4 + 1.1 + i * 1.6;
    const r = 1.25;
    const ph = up(1.1 + (i % 2) * 0.5);
    b.cyl(0.42, 0.42, 0.1, ph.x + Math.cos(a) * r, ph.y, z + Math.sin(a) * r, i === 1 ? POD_ORANGE : POD_DARK, 6, { rz: Math.PI / 2 + tilt, ry: -a });
  }
  // window (warm at night) + open hatch with a glowing interior
  const pw = up(1.6);
  b.sphere(0.38, pw.x + Math.cos(0.4) * 1.05, pw.y, z + Math.sin(0.4) * 1.05 + 0.3, '#ffffff', 6, { slot: SLOT_GLASS });
  b.cyl(0.46, 0.46, 0.08, pw.x + Math.cos(0.4) * 1.08, pw.y, z + Math.sin(0.4) * 1.08 + 0.3, POD_DARK, 6, { rz: Math.PI / 2, ry: -0.4 });
  b.box(0.8, 1.0, 0.1, x - 0.2, y + 0.9, z + 1.15, POD_DARK, { ry: 0.4, rx: 0.9 });
  b.box(0.7, 0.9, 0.06, x - 0.1, y + 0.9, z + 1.1, '#2a2f38', { ry: 0.4 });
  b.box(0.5, 0.6, 0.06, x - 0.1, y + 0.85, z + 1.06, c.s.lamp, { ry: 0.4, slot: SLOT_GLOW });
  // landing struts
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 2.1;
    b.box(0.12, 0.9, 0.12, x + Math.cos(a) * 1.35, y + 0.4, z + Math.sin(a) * 1.35, POD_DARK, { rz: Math.cos(a) * 0.35 + tilt, rx: -Math.sin(a) * 0.35 });
    b.box(0.36, 0.1, 0.36, x + Math.cos(a) * 1.6, y + 0.05, z + Math.sin(a) * 1.6, POD_DARK);
  }
  if (scorched) {
    b.box(1.0, 0.5, 0.6, x + 0.5, y + 0.4, z - 0.9, SCORCH, { ry: 0.6 });
    b.sphere(0.4, x - 0.9, y + 0.6, z - 0.6, SCORCH, 5);
    b.box(0.6, 0.9, 0.3, x + 0.9, y + 1.6, z - 0.4, SCORCH, { ry: 0.4, rz: 0.2 });
  }
  // antenna + blinking light
  const pa = up(2.9);
  b.cyl(0.03, 0.04, 1.0, pa.x + 0.6, pa.y, z - 0.4, POD_DARK, 4, { rz: tilt + (scorched ? 0.35 : 0) });
  b.sphere(0.1, pa.x + 0.6 - Math.sin(tilt + (scorched ? 0.35 : 0)) * 0.5, pa.y + 0.5, z - 0.4, '#ff4d5e', 5, { slot: SLOT_GLOW });
}

/** Square tower with a crenellated top (stone keep). */
function tower(c: ModelCtx, x: number, z: number, w: number, h: number): void {
  const { b, s } = c;
  b.box(w, h, w, x, h / 2, z, s.dark, { shade: 0.06 });
  b.box(w * 0.5, h * 0.9, w + 0.06, x, h / 2, z, s.base, { shade: 0.06 });
  b.box(w + 0.2, 0.3, w + 0.2, x, h + 0.1, z, s.light, { shade: 0.05 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.34, 0.4, 0.34, x + sx * (w / 2 - 0.1), h + 0.45, z + sz * (w / 2 - 0.1), s.light, { shade: 0.05 });
  b.box(0.3, 0.3, 0.1, x, h * 0.65, z + w / 2 + 0.02, '#2a2420');
}

const TIERS: ((c: ModelCtx) => void)[] = [
  // ---- 0: crashed escape pod in a scorched crater, parachute, first camp around it
  (c) => {
    const { b } = c;
    b.cyl(3.0, 3.4, 0.3, 0, -0.1, 0, '#5a4a3a', 12, { shade: 0.06 });
    b.cyl(2.4, 2.8, 0.2, 0, 0.1, 0, SCORCH, 12, { shade: 0.06 });
    b.box(1.2, 0.08, 0.8, 1.6, 0.2, 1.9, SCORCH, { ry: 0.7 });
    pod(c, 0.3, 0.1, -0.2, 0.32, true);
    // deflated parachute draped behind the pod, cords to the hull
    b.sphere(1.5, -1.6, 0.2, -1.9, '#f1f3f5', 7, { sy: 0.22, sx: 1.0, sz: 0.8, shade: 0.04 });
    b.sphere(1.0, -0.8, 0.3, -2.3, POD_ORANGE, 6, { sy: 0.24, shade: 0.04 });
    for (let i = 0; i < 3; i++) b.box(0.03, 0.03, 1.6, -1.0 + i * 0.3, 0.55, -1.3, '#d8dde3', { ry: 0.5 + i * 0.1, rx: 0.25 });
    // debris
    b.box(0.6, 0.2, 0.4, -2.0, 0.2, 1.5, POD_DARK, { ry: 0.8, rz: 0.2 });
    b.box(0.4, 0.15, 0.7, 1.9, 0.15, 1.8, POD, { ry: -0.5 });
    b.cyl(0.4, 0.4, 0.1, 2.4, 0.1, 0.3, POD_ORANGE, 6, { rz: 0.4, ry: 0.3 });
    // camp: tarp lean-to on two sticks with a bedroll, crates, lantern post, log seat
    b.box(0.08, 1.5, 0.08, -2.6, 0.75, 0.6, WOOD_DARK);
    b.box(0.08, 1.5, 0.08, -1.3, 0.75, 0.6, WOOD_DARK);
    b.box(1.6, 0.06, 1.5, -1.95, 1.3, 1.25, K.CANVAS, { rx: 0.55, shade: 0.03 });
    b.box(0.7, 0.18, 1.2, -1.95, 0.1, 1.5, '#e86f4d');
    b.box(0.45, 0.12, 0.3, -1.95, 0.24, 1.05, '#fff5e6');
    K.crateProp(b, 2.1, 0.0, -1.4, 0.7, WOOD, WOOD_DARK, 0.2);
    K.crateProp(b, 2.5, 0.0, -0.7, 0.45, POD_DARK, POD_ORANGE, -0.3);
    K.sack(b, 1.5, 0.0, -2.1, K.CANVAS_DARK, 0.26);
    b.cyl(0.16, 0.16, 1.4, 0.4, 0.16, 2.5, WOOD, 5, { rz: Math.PI / 2, ry: 0.2 });
    K.lanternPost(c, -2.4, -0.6, 1.7, true);
    b.box(0.06, 1.6, 0.06, 2.6, 0.8, 2.3, WOOD_DARK);
    b.box(0.5, 0.35, 0.04, 2.85, 1.45, 2.3, POD_ORANGE, { ry: 0.1 });
    for (let i = 0; i < 3; i++) b.shard(0.07, 0.09, -2.5 + i * 0.5, 0.08, 2.4 + (i % 2) * 0.3, K.FLOWERS[i]);
    c.emit('smoke', 0.8, 1.0, -0.9, 0.8);
  },
  // ---- 1: the pod with a timber hall and a palisade camp built around it
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.8, 5.8);
    pod(c, 1.3, 0.16, -1.3, 0.14, false);
    // timber hall (plank walls with rope bands, shingle gable roof, stone chimney)
    const hx = -1.45;
    const hz = -0.1;
    K.wallBlock(c, 2.8, 2.5, 3.2, hx, 0.16, hz);
    K.gableRoof(c, 2.8, 3.2, hx, 2.66, hz, { h: 1.1, overhang: 0.4 });
    K.chimney(c, hx - 0.9, 2.9, hz - 0.9, 1.1, 1.4);
    K.casement(c, hx - 1.42, 1.6, hz + 0.5, 3, 0.7, 0.6);
    K.casement(c, hx + 0.5, 1.6, hz + 1.62, 0, 0.6, 0.6);
    K.flowerBox(c, hx + 0.5, 1.1, hz + 1.76, 0);
    K.door(c, hx - 0.6, 0.16, hz + 1.65, 0, { light: true, steps: true });
    // deck + awning in front (the colony's porch)
    for (const x of [0.2, 2.6]) b.cyl(0.11, 0.13, 2.4, x, 1.36, 2.6, WOOD_DARK, 6);
    b.box(2.9, 0.1, 1.6, 1.4, 2.55, 1.95, K.CANVAS, { rx: 0.18, shade: 0.03 });
    b.box(3.0, 0.08, 0.08, 1.4, 2.4, 2.72, WOOD_DARK);
    b.box(1.0, 0.5, 0.6, 1.4, 0.41, 2.0, WOOD, { shade: 0.05 });
    b.box(0.5, 0.06, 0.5, 1.4, 0.69, 2.0, '#f0e6cc');
    b.box(0.2, 0.2, 0.2, 1.65, 0.78, 2.1, K.TOMATO);
    // palisade along the back with pointed stakes and a brace rail
    for (let i = 0; i < 7; i++) {
      const x = -2.7 + i * 0.52;
      const h = 1.5 + (i % 2) * 0.25;
      b.cyl(0.13, 0.15, h, x, h / 2, -2.75, WOOD, 5, { shade: 0.05 });
      b.cone(0.13, 0.3, x, h + 0.15, -2.75, WOOD_DARK, 5);
    }
    b.box(3.4, 0.1, 0.1, -1.1, 1.15, -2.56, s.stripe);
    // flag (same pivot), banners, lantern, props
    b.cyl(0.04, 0.05, 3.2, 2.6, 1.6, -2.4, WOOD_DARK, 4);
    c.part('sway', 2.6, 3.1, -2.4, (pb) => pb.box(0.9, 0.55, 0.04, 0.45, -0.28, 0, '#e86f4d'), 2.5, 0.12);
    K.bannerPole(c, -2.75, 2.0, 2.3, undefined, 1, 0.16);
    K.lanternPost(c, 2.75, 0.6, 1.8, false);
    K.barrel(b, 2.7, 0.16, 2.6, 0.26, 0.65);
    K.crateProp(b, -2.6, 0.16, -2.0, 0.6, WOOD, WOOD_DARK, 0.2);
    K.logPile(b, 0.2, 0.16, -2.3, 1.1, Math.PI / 2);
    K.sack(b, 2.8, 0.16, -0.3, K.CANVAS_DARK, 0.24);
  },
  // ---- 2: stone keep — corner towers, crenellations, timber hall roof, the pod as a rooftop beacon
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.9, 5.9);
    K.wallBlock(c, 4.6, 2.7, 4.6, 0, 0.16, 0, { posts: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) tower(c, sx * 2.35, sz * 2.35, 1.1, 3.9);
    // crenellated wall tops between the towers
    for (let i = 0; i < 3; i++) {
      const u = -1.0 + i * 1.0;
      b.box(0.5, 0.4, 0.3, u, 3.06, 2.35, s.light, { shade: 0.05 });
      b.box(0.5, 0.4, 0.3, u, 3.06, -2.35, s.light, { shade: 0.05 });
      b.box(0.3, 0.4, 0.5, 2.35, 3.06, u, s.light, { shade: 0.05 });
      b.box(0.3, 0.4, 0.5, -2.35, 3.06, u, s.light, { shade: 0.05 });
    }
    b.box(4.8, 0.2, 4.8, 0, 2.96, 0, s.light, { shade: 0.04 });
    // great hall roof on top with the pod beacon behind it
    K.gableRoof(c, 2.4, 3.4, -0.9, 3.06, 0.6, { h: 1.0, overhang: 0.3 });
    K.chimney(c, -1.6, 3.3, -0.8, 1.2, 1.5);
    pod(c, 1.1, 3.06, -0.9, 0.0, false);
    // arched gate with torches and steps, windows with flower boxes, banners on the towers
    b.box(1.8, 2.2, 0.2, 0, 1.26, 2.36, s.trim, { shade: 0.05 });
    b.box(1.3, 1.9, 0.26, 0, 1.11, 2.36, '#4a3a2a', { shade: 0.05 });
    b.box(1.1, 0.08, 0.3, 0, 0.9, 2.36, s.metal);
    b.box(1.1, 0.08, 0.3, 0, 1.6, 2.36, s.metal);
    b.box(2.6, 0.14, 0.6, 0, 0.23, 2.75, K.STONE, { shade: 0.05 });
    b.box(2.2, 0.14, 0.35, 0, 0.37, 2.55, K.STONE_DARK, { shade: 0.05 });
    for (const sx of [-1, 1]) {
      b.box(0.08, 0.5, 0.08, sx * 1.15, 1.9, 2.5, WOOD_DARK);
      b.box(0.18, 0.2, 0.18, sx * 1.15, 2.2, 2.5, '#ff9a3c', { slot: SLOT_GLOW });
      K.casement(c, sx * 1.7, 1.9, 2.32, 0, 0.6, 0.7);
      K.flowerBox(c, sx * 1.7, 1.35, 2.46, 0, 0.7);
      K.casement(c, 2.32, 1.9, sx * 1.0, 1, 0.6, 0.7);
      K.casement(c, -2.32, 1.9, sx * 1.0, 3, 0.6, 0.7);
    }
    c.setLight(0, 2.1, 2.7, '#ffc877', 1.0, 9);
    K.bannerPole(c, -2.35, -2.35, 2.2, undefined, 0, 4.3);
    K.bannerPole(c, 2.35, -2.35, 2.2, undefined, 0, 4.3);
    K.barrel(b, 2.8, 0.16, 1.4, 0.24, 0.6);
    K.crateProp(b, -2.8, 0.16, 1.5, 0.5, s.light, WOOD_DARK, 0.3);
  },
  // ---- 3: steel command post — riveted blocks, orange trims, radar, stacks, tanks, gantry
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.9, 5.9);
    K.wallBlock(c, 5.2, 2.4, 5.2, 0, 0.16, 0);
    K.wallBlock(c, 3.8, 1.9, 3.8, -0.4, 2.56, -0.4);
    b.box(3.9, 0.7, 3.9, -0.4, 3.5, -0.4, '#ffffff', { slot: SLOT_GLASS });
    K.flatRoof(c, 3.8, 3.8, -0.4, 4.46, -0.4, { vents: 2 });
    // corner posts with floodlights
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.5, 2.7, 0.5, sx * 2.6, 1.5, sz * 2.6, s.trim);
      b.box(0.56, 0.16, 0.56, sx * 2.6, 2.9, sz * 2.6, s.metal);
      K.lamp(c, sx * 2.6, 3.15, sz * 2.6, { cap: true });
    }
    // sliding door with glow seam, sign plate, hazard apron
    b.box(2.0, 2.2, 0.16, 0.6, 1.26, 2.66, s.trim);
    for (const sx of [-1, 1]) b.box(0.8, 2.0, 0.18, 0.6 + sx * 0.42, 1.16, 2.68, s.machine);
    b.box(0.08, 1.9, 0.26, 0.6, 1.16, 2.68, s.accent, { slot: SLOT_GLOW });
    b.box(1.6, 0.06, 0.26, 0.6, 2.2, 2.68, s.accent, { slot: SLOT_GLOW });
    b.box(1.4, 0.36, 0.08, 0.6, 2.5, 2.72, s.accent, { slot: SLOT_GLOW });
    b.box(2.6, 0.04, 0.5, 0.6, 0.18, 2.72, s.stripe);
    K.casement(c, -1.6, 1.6, 2.62, 0, 0.9, 0.6);
    K.casement(c, 2.62, 1.6, 0.4, 1, 0.9, 0.6);
    // gantry walkway around the upper block + ladder
    b.box(4.6, 0.1, 0.6, -0.4, 2.62, 1.8, s.floor);
    for (let i = 0; i < 4; i++) b.box(0.06, 0.7, 0.06, -2.5 + i * 1.4, 3.0, 2.08, s.metal);
    b.box(4.4, 0.05, 0.05, -0.4, 3.35, 2.08, s.stripe);
    b.box(0.05, 2.4, 0.05, 2.3, 1.36, 2.72, s.metal);
    b.box(0.05, 2.4, 0.05, 2.7, 1.36, 2.72, s.metal);
    for (let i = 0; i < 4; i++) b.box(0.44, 0.05, 0.05, 2.5, 0.5 + i * 0.6, 2.72, s.metal);
    // radar mast (same pivot) and antenna cluster
    b.cyl(0.08, 0.1, 3.0, 1.9, 6.0, 1.9, s.metal, 6);
    b.box(0.5, 0.3, 0.5, 1.9, 4.6, 1.9, s.machineDark);
    c.part('spinY', 1.9, 7.3, 1.9, (pb) => {
      pb.cyl(0.9, 0.2, 0.4, 0.5, 0.1, 0, '#dfe6ee', 12, { rz: -1.0 });
      pb.box(0.06, 0.06, 0.9, 0.45, 0.2, 0, s.metal, { rz: -1.0 });
      pb.sphere(0.1, 0, 0.5, 0, '#ff4d5e', 5, { slot: SLOT_GLOW });
    }, 0.9);
    c.antenna(-2.0, 4.6, -2.0, 1.6, s.accent.getStyle());
    // exhaust stacks + tanks with pipes
    c.chimney(-2.2, 2.4, -2.2, 1.6, 0.22, 2);
    c.chimney(-1.5, 2.4, -2.3, 1.2, 0.16, 1);
    b.cyl(0.5, 0.5, 1.4, 2.2, 3.1, -2.0, '#c43b2a', 9);
    b.cyl(0.52, 0.52, 0.1, 2.2, 2.9, -2.0, s.metal, 9);
    b.cyl(0.5, 0.5, 1.4, 2.2, 3.1, -0.8, s.machine, 9);
    b.cyl(0.52, 0.52, 0.1, 2.2, 2.9, -0.8, s.metal, 9);
    b.box(0.14, 0.14, 1.0, 2.2, 3.6, -1.4, s.metal);
    K.pipe(b, s, 2.0, 3.0, -0.8, 1.5, 3.0, -0.8, 0.09, s.metal);
    K.gauge(c, 2.5, 3.4, -0.8, 1, 0.16);
    b.box(1.0, 0.3, 0.6, -2.4, 2.72, 1.0, s.machine);
    b.box(0.9, 0.06, 0.5, -2.4, 2.9, 1.0, s.metal);
    c.setLight(0.6, 3.4, 2.4, '#ffb95c', 1.0, 10);
  },
  // ---- 4: alloy tower with a rotating halo ring, landing pad and buttress pylons
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.9, 5.9);
    b.cyl(2.8, 3.0, 1.6, 0, 0.96, 0, s.base, 12, { shade: 0.02 });
    b.cyl(2.84, 2.84, 0.3, 0, 1.2, 0, s.light, 12);
    K.glowRing(b, 2.9, 0, 1.78, 0, s.accent, 16, 0.07);
    b.cyl(2.0, 2.6, 4.2, 0, 3.86, 0, s.light, 12, { shade: 0.02 });
    for (let i = 0; i < 3; i++) b.cyl(2.36 - i * 0.2, 2.36 - i * 0.2, 0.4, 0, 2.76 + i * 1.2, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    for (let i = 0; i < 2; i++) b.cyl(2.48 - i * 0.2, 2.48 - i * 0.2, 0.08, 0, 3.4 + i * 1.2, 0, s.stripe, 12);
    b.cyl(1.4, 2.0, 1.2, 0, 6.56, 0, s.trim, 12);
    K.glowRing(b, 1.45, 0, 7.1, 0, s.accent, 12, 0.06);
    b.sphere(1.0, 0, 7.6, 0, s.accent, 10, { slot: SLOT_GLOW });
    c.antenna(0, 8.5, 0, 1.4, '#ff4d5e');
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 2.65;
      const pz = Math.sin(a) * 2.65;
      b.box(0.5, 5.0, 0.5, px, 2.66, pz, s.trim, { ry: -a });
      b.box(0.12, 4.0, 0.56, px, 2.86, pz, s.accent, { ry: -a, slot: SLOT_GLOW });
      b.box(0.6, 0.3, 0.6, px, 5.3, pz, s.stripe, { ry: -a });
      b.box(0.56, 0.4, 0.56, px, 0.36, pz, s.machineDark, { ry: -a });
    }
    c.part('spinY', 0, 5.2, 0, (pb) => {
      pb.torus(3.0, 0.14, 0, 0, 0, s.machine, 16, 5, { rx: Math.PI / 2 });
      pb.torus(3.0, 0.05, 0, 0.1, 0, s.accent, 16, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
      for (let i = 0; i < 4; i++) pb.box(0.5, 0.3, 0.3, Math.cos((i * Math.PI) / 2) * 3.0, 0, Math.sin((i * Math.PI) / 2) * 3.0, s.trim, { ry: -(i * Math.PI) / 2 });
    }, 0.4);
    // entrance with glow seam, sign, and a landing pad with planters at the front
    b.box(1.6, 2.2, 0.3, 0, 1.26, 2.9, s.machineDark);
    b.box(0.08, 2.0, 0.36, 0, 1.26, 2.9, s.accent, { slot: SLOT_GLOW });
    b.box(1.3, 0.06, 0.36, 0, 2.3, 2.9, s.accent, { slot: SLOT_GLOW });
    b.box(1.4, 0.3, 0.1, 0, 2.6, 2.86, s.stripe);
    b.box(2.4, 0.08, 0.8, 0, 0.2, 2.6, s.floor);
    K.planter(c, -2.45, 2.45, 0.6, LEAF2);
    K.planter(c, 2.45, 2.45, 0.6, LEAF);
    b.cyl(0.9, 0.9, 0.1, -2.1, 0.21, -2.1, s.floor, 6);
    K.glowRing(b, 0.86, -2.1, 0.28, -2.1, s.accent, 8, 0.05);
    b.box(0.7, 0.7, 0.7, 2.3, 0.51, -2.2, s.machine);
    b.box(0.6, 0.3, 0.06, 2.3, 0.75, -1.84, s.accent, { rx: -0.4, slot: SLOT_GLOW });
    c.emit('motes', 0, 7.6, 0, 2, s.accent.getStyle());
    c.setLight(0, 7.6, 0, s.accent.getStyle(), 1.4, 12);
  },
  // ---- 5: nano spire — three dark spires with light seams, floating core, hex pads, dark dome
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.9, 5.9);
    b.box(5.6, 1.3, 5.6, 0, 0.81, 0, s.base, { shade: 0.015 });
    b.box(5.7, 0.08, 5.7, 0, 1.46, 0, s.accent, { slot: SLOT_GLOW });
    b.box(5.0, 0.1, 5.0, 0, 1.52, 0, s.dark);
    const spire = (x: number, z: number, w: number, h: number, cap: number) => {
      b.box(w, h, w, x, 1.56 + h / 2, z, s.dark, { shade: 0.015 });
      b.box(w - 0.3, h - 0.6, w + 0.05, x, 1.56 + h / 2, z, s.base);
      b.box(w + 0.05, h - 0.6, w - 0.3, x, 1.56 + h / 2, z, s.base);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.07, h, 0.07, x + sx * (w / 2 + 0.01), 1.56 + h / 2, z + sz * (w / 2 + 0.01), s.accent, { slot: SLOT_GLOW });
      for (let i = 1; i <= 3; i++) b.box(w + 0.08, 0.05, w + 0.08, x, 1.56 + (h * i) / 4, z, s.accent, { slot: SLOT_GLOW });
      b.pyramid(w + 0.1, cap, w + 0.1, x, 1.56 + h, z, s.trim);
      b.box(0.2, cap * 0.9, 0.2, x, 1.56 + h + cap + cap * 0.3, z, s.accent, { slot: SLOT_GLOW });
    };
    spire(-0.3, -0.5, 2.6, 6.4, 2.0);
    spire(1.9, -1.6, 1.3, 3.6, 1.0);
    spire(-2.0, 1.4, 1.2, 3.0, 0.9);
    // bridges between spires
    b.box(1.4, 0.2, 0.4, 0.9, 4.0, -1.1, s.trim, { ry: -0.5 });
    b.box(0.4, 0.2, 1.3, -1.3, 3.4, 0.5, s.trim, { ry: 0.4 });
    b.box(1.4, 0.04, 0.1, 0.9, 4.12, -1.1, s.accent, { ry: -0.5, slot: SLOT_GLOW });
    // dark dome with a glowing seam ring, hex drone pads, entrance
    b.dome(1.0, 1.9, 1.56, 1.6, s.dark, 8, { sy: 0.6, shade: 0.015 });
    K.glowRing(b, 0.8, 1.9, 1.9, 1.6, s.accent, 10, 0.05);
    b.sphere(0.3, 1.9, 2.1, 1.6, s.accent, 6, { slot: SLOT_GLOW });
    for (const [px, pz] of [[-2.2, -2.2], [2.3, -0.1]]) {
      b.cyl(0.6, 0.6, 0.08, px, 1.6, pz, s.machineDark, 6);
      K.glowRing(b, 0.55, px, 1.66, pz, s.accent, 6, 0.04);
    }
    b.box(1.4, 2.0, 0.3, -0.3, 0.76 + 0.2, 2.86, s.machineDark);
    b.box(0.08, 1.8, 0.36, -0.3, 0.96, 2.86, s.accent, { slot: SLOT_GLOW });
    b.box(1.2, 0.06, 0.36, -0.3, 1.9, 2.86, s.accent, { slot: SLOT_GLOW });
    b.box(2.2, 0.06, 0.6, -0.3, 0.2, 2.6, s.accent, { slot: SLOT_GLOW });
    // floating core (same pivot)
    c.part('bobSpin', 0, 5.0, 2.4, (pb) => {
      pb.shard(0.5, 0.9, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
      pb.torus(0.9, 0.05, 0, 0, 0, s.accent, 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
      pb.torus(0.7, 0.04, 0, 0, 0, s.accent, 12, 4, { rx: 1.1, slot: SLOT_GLOW });
    }, 1.0, 0.2);
    c.emit('motes', 0, 6.0, 0, 3, s.accent.getStyle());
    c.setLight(0, 6.0, 0, s.accent.getStyle(), 1.6, 14);
  },
  // ---- 6: titanium citadel — white spire cluster, gold rings, pylons, glass garden dome, beam
  (c) => {
    const { b, s } = c;
    K.pad(c, 5.9, 5.9);
    b.cyl(3.0, 3.2, 1.0, 0, 0.66, 0, s.light, 12, { shade: 0.01 });
    K.ring(b, 3.05, 0, 1.18, 0, s.trim, 16, 0.08);
    K.glowRing(b, 2.75, 0, 1.2, 0, s.accent, 16, 0.05);
    // tiered body
    b.cyl(2.2, 2.6, 3.0, 0, 2.66, 0, s.base, 12, { shade: 0.01 });
    b.cyl(2.3, 2.3, 0.5, 0, 2.76, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    K.ring(b, 2.3, 0, 4.18, 0, s.trim, 12, 0.08);
    b.cyl(1.5, 2.0, 3.0, 0, 5.66, 0, s.light, 12, { shade: 0.01 });
    b.cyl(1.6, 1.6, 0.4, 0, 5.56, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    K.glowRing(b, 1.95, 0, 4.3, 0, s.accent, 12, 0.06);
    K.ring(b, 1.6, 0, 7.18, 0, s.trim, 12, 0.07);
    b.cyl(0.9, 1.4, 2.6, 0, 8.46, 0, s.base, 12, { shade: 0.01 });
    K.glowRing(b, 1.35, 0, 7.3, 0, s.accent, 12, 0.05);
    // spire cluster: tall central cone and four small side spires with gold tips
    b.cone(0.95, 4.0, 0, 11.76, 0, s.light, 10);
    b.box(0.2, 3.0, 0.2, 0, 14.6, 0, s.accent, { slot: SLOT_GLOW });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sx = Math.cos(a) * 1.25;
      const sz = Math.sin(a) * 1.25;
      b.cyl(0.22, 0.3, 2.4, sx, 8.2, sz, s.light, 6);
      b.cone(0.3, 1.2, sx, 10.0, sz, s.light, 6);
      b.box(0.1, 0.5, 0.1, sx, 10.8, sz, s.trim);
    }
    // energy pylons with gold caps and shards
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 2.7;
      const pz = Math.sin(a) * 2.7;
      b.box(0.7, 5.3, 0.7, px, 2.81, pz, s.light, { ry: -a });
      b.box(0.16, 4.8, 0.76, px, 3.0, pz, s.accent, { ry: -a, slot: SLOT_GLOW });
      b.box(0.9, 0.3, 0.9, px, 5.6, pz, s.trim, { ry: -a });
      b.shard(0.3, 0.7, px, 6.3, pz, s.accent, { slot: SLOT_GLOW });
      b.box(0.06, 0.06, 1.6, px * 0.72, 6.0, pz * 0.72, s.accent, { ry: -a + Math.PI / 2, slot: SLOT_GLOW });
    }
    // floating crystal + halo (same pivot)
    c.part('bobSpin', 0, 9.9, 0, (pb) => {
      pb.shard(0.7, 1.6, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
      pb.torus(1.3, 0.07, 0, 0, 0, s.accent, 14, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
      pb.torus(1.1, 0.06, 0, 0.3, 0, s.trim, 14, 4, { rx: 1.0 });
    }, 0.8, 0.2);
    b.cyl(0.25, 0.45, 9.0, 0, 15.0, 0, s.accent, 8, { slot: SLOT_GLOW });
    // entrance with gold lintel, glass garden dome, reflecting pool and planters
    b.box(1.6, 2.2, 0.4, 0, 1.26, 2.9, s.light);
    b.box(0.1, 2.0, 0.5, 0, 1.26, 2.9, s.accent, { slot: SLOT_GLOW });
    b.box(1.9, 0.16, 0.5, 0, 2.42, 2.9, s.trim);
    b.box(2.6, 0.08, 0.8, 0, 0.2, 2.6, s.floor);
    b.cyl(0.95, 1.0, 0.3, 2.2, 0.31, 2.1, s.light, 8);
    b.dome(0.9, 2.2, 0.46, 2.1, '#ffffff', 8, { sy: 0.65, slot: SLOT_GLASS });
    K.bush(b, 2.2, 0.46, 2.1, 0.42, LEAF);
    b.cyl(0.85, 0.9, 0.3, -2.2, 0.31, 2.1, s.light, 8);
    K.waterDisc(b, 0.72, -2.2, 0.45, 2.1, 8);
    b.cyl(0.08, 0.1, 0.5, -2.2, 0.65, 2.1, s.light, 6);
    b.sphere(0.16, -2.2, 0.95, 2.1, WATER, 5, { slot: SLOT_GLOW });
    K.planter(c, -2.5, -2.5, 0.7, LEAF2);
    K.planter(c, 2.5, -2.5, 0.7, LEAF);
    c.emit('motes', 0, 9.9, 0, 6, s.accent.getStyle());
    c.emit('motes', 0, 3.0, 0, 2, '#ffffff');
    c.setLight(0, 9.5, 0, s.accent.getStyle(), 2.0, 18);
  },
];

registerModel('command_center', (c) => {
  const fn = TIERS[Math.max(0, Math.min(TIERS.length - 1, c.t))];
  fn(c);
});

void THREE;
