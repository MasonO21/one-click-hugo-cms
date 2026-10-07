/**
 * Procedural models for storage, housing, food and water buildings — the cozy heart of the colony.
 * Cabins with plank or stone walls, overhanging shingle roofs, chimneys with smoke, warm glowing
 * windows and door lamps, flower boxes, barrels and sacks; farms with fences and rows of crops;
 * greenhouses with glass panes and plants inside; water buildings with visible water, pipes and
 * gauges. Higher tiers swap to riveted steel, sleek alloy, glowing nano seams and pearl titanium.
 * Each builder styles itself with the tier palette slots and keeps its animated parts / emitters.
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel, type ModelCtx } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER, SOIL, WHITE, FIRE_GLOW } from './colors';
import * as K from './kit_home';

/** Cargo container (tech tiers): body, corrugation bands, id stripe. */
function container(c: ModelCtx, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0): void {
  const { b, s } = c;
  b.box(w, h, d, x, y + h / 2, z, s.machine, { ry, shade: 0.02 });
  b.box(w + 0.05, h * 0.55, d - 0.3, x, y + h / 2, z, s.machineDark, { ry });
  b.box(w - 0.3, h * 0.55, d + 0.05, x, y + h / 2, z, s.machineDark, { ry });
  b.box(w * 0.5, 0.08, d + 0.08, x, y + h - 0.12, z, s.stripe, { ry });
}

/** Big barn / depot door (two leaves) on the +z face at (x, z), base y. */
function bigDoor(c: ModelCtx, x: number, y: number, z: number, dw: number, dh: number): void {
  const { b, s } = c;
  const t = s.index;
  const frame = t <= 2 ? WOOD_DARK : s.trim;
  b.box(dw + 0.3, dh + 0.16, 0.1, x, y + dh / 2 + 0.06, z, frame, { shade: 0.03 });
  if (t <= 2) {
    for (const sx of [-1, 1]) {
      b.box(dw / 2 - 0.05, dh, 0.14, x + (sx * dw) / 4, y + dh / 2, z + 0.02, t === 2 ? WOOD : s.dark, { shade: 0.05 });
      b.box(Math.hypot(dw / 2, dh) * 0.9, 0.1, 0.06, x + (sx * dw) / 4, y + dh / 2, z + 0.1, WOOD_DARK, { rz: sx * Math.atan2(dh, dw / 2) });
    }
    b.box(dw, 0.1, 0.18, x, y + dh * 0.5, z + 0.04, s.metal);
  } else {
    for (const sx of [-1, 1]) b.box(dw / 2 - 0.05, dh, 0.14, x + (sx * dw) / 4, y + dh / 2, z + 0.02, s.machine);
    b.box(0.08, dh - 0.2, 0.2, x, y + dh / 2, z + 0.04, s.accent, { slot: SLOT_GLOW });
    b.box(dw - 0.2, 0.06, 0.2, x, y + dh - 0.12, z + 0.04, s.accent, { slot: SLOT_GLOW });
    b.box(dw + 0.4, 0.04, 0.3, x, y + 0.02, z + 0.3, s.stripe);
  }
}

// ------------------------------------------------------------------------------------ storage

registerModel('crate', (c) => {
  const { b, s, level } = c;
  if (s.index <= 2) {
    const col = s.index === 2 ? s.light : WOOD;
    K.crateProp(b, -0.25, 0, 0.1, 1.1, col, WOOD_DARK, 0.08);
    K.sack(b, 0.6, 0, 0.55, K.CANVAS_DARK, 0.24);
    if (level >= 2) K.crateProp(b, -0.2, 1.1, 0.05, 0.75, col, WOOD_DARK, -0.35);
    if (level >= 3) K.barrel(b, 0.6, 0, -0.45, 0.28, 0.7);
    if (level >= 4) K.crateProp(b, -0.15, 1.85, 0.1, 0.5, col, WOOD_DARK, 0.5);
    if (level >= 5) K.lamp(c, 0.6, 1.05, -0.45);
  } else {
    container(c, -0.15, 0, 0.1, 1.4, 1.0, 1.2);
    b.box(0.5, 0.08, 0.06, -0.15, 0.55, 0.74, s.accent, { slot: SLOT_GLOW });
    K.barrel(b, 0.62, 0, -0.5, 0.26, 0.65, s.metal, s.accent);
    if (level >= 2) container(c, -0.2, 1.0, 0.0, 0.9, 0.7, 0.8, 0.25);
    if (level >= 3) K.barrel(b, 0.62, 0.65, -0.5, 0.26, 0.65, s.machineDark, s.accent);
    if (level >= 4) container(c, -0.1, 1.7, 0.1, 0.6, 0.5, 0.6, -0.4);
    if (level >= 5) K.lamp(c, 0.62, 1.55, -0.5);
  }
});

registerModel('warehouse', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.2, d - 0.2);
  const bw = w - 1.3;
  const bd = d - 1.0;
  const h = 2.5 + c.lv * 0.4;
  const bx = -0.4;
  const bz = -0.1;
  const dw = Math.min(2.0, bw * 0.5);
  const dh = Math.min(2.0, h * 0.8);
  K.wallBlock(c, bw, h, bd, bx, 0.16, bz);
  if (t <= 2) {
    // barn: ridge along X so the big door sits in the gable end, hayloft window above it
    const rh = K.gableRoof(c, bw, bd, bx, h + 0.16, bz, { alongX: true });
    bigDoor(c, bx, 0.16, bz + bd / 2 + 0.02, dw, dh);
    const loftW = Math.min(0.6, bw * 0.2);
    b.box(loftW + 0.14, 0.54, 0.08, bx, h + 0.16 + rh * 0.42, bz + bd / 2 + 0.44, WOOD_DARK);
    b.box(loftW, 0.4, 0.14, bx, h + 0.16 + rh * 0.42, bz + bd / 2 + 0.44, '#ffffff', { slot: SLOT_GLASS });
    K.lamp(c, bx + dw / 2 + 0.4, 0.16 + dh * 0.85, bz + bd / 2 + 0.16, { light: true });
    K.barrel(b, w / 2 - 0.5, 0.16, d / 2 - 0.6);
    K.crateProp(b, w / 2 - 0.55, 0.16, -d / 2 + 0.75, 0.7, t === 2 ? s.light : WOOD, WOOD_DARK, 0.2);
    K.sack(b, w / 2 - 0.5, 0.16, 0.05);
    if (w >= 6) K.logPile(b, -w / 2 + 0.75, 0.16, bz, 1.2, Math.PI / 2);
  } else {
    // depot: flat roof, sliding door with glow seam, sign plate, stacked containers, light mast
    K.flatRoof(c, bw, bd, bx, h + 0.16, bz, { vents: 2 });
    bigDoor(c, bx, 0.16, bz + bd / 2 + 0.02, dw, dh);
    b.box(1.1, 0.32, 0.08, bx, 0.16 + dh + 0.3, bz + bd / 2 + 0.06, s.accent, { slot: SLOT_GLOW });
    container(c, w / 2 - 0.6, 0.16, d / 2 - 0.7, 0.9, 0.7, 0.8, 0.1);
    container(c, w / 2 - 0.6, 0.16, -d / 2 + 0.75, 0.9, 0.7, 0.8, -0.15);
    if (c.level >= 2) container(c, w / 2 - 0.6, 0.86, -d / 2 + 0.78, 0.8, 0.6, 0.7, 0.3);
    b.box(0.12, 3.0, 0.12, w / 2 - 0.35, 1.66, 0.05, s.metal);
    K.lamp(c, w / 2 - 0.35, 3.3, 0.05, { light: true });
  }
  c.levelPips();
});

registerModel('silo', (c) => {
  const { b, s, w, d, level } = c;
  const t = s.index;
  const r = Math.min(w, d) * 0.33;
  const h = 3.0 + level * 0.3;
  K.pad(c, w - 0.4, d - 0.4);
  if (t <= 2) {
    const body = t === 2 ? s.base : WOOD;
    if (t === 2) b.cyl(r * 1.1, r * 1.14, 0.9, 0, 0.61, 0, s.trim, 10, { shade: 0.06 });
    b.cyl(r, r * 1.03, h, 0, 0.16 + h / 2, 0, body, 10, { shade: 0.05 });
    for (const f of [0.22, 0.52, 0.82]) b.cyl(r + 0.05, r + 0.05, 0.1, 0, 0.16 + h * f, 0, t === 1 ? s.metal : WOOD_DARK, 10);
    b.cone(r * 1.25, 1.1, 0, 0.16 + h + 0.55, 0, s.roof, 10, { shade: 0.05 });
    b.cyl(0.1, 0.12, 0.35, 0, 0.16 + h + 1.2, 0, WOOD_DARK, 5);
    b.box(0.6, 0.55, 0.08, 0, 0.16 + h - 0.7, r + 0.02, WOOD_DARK);
    b.box(0.46, 0.42, 0.14, 0, 0.16 + h - 0.7, r + 0.02, '#ffffff', { slot: SLOT_GLASS });
  } else {
    b.cyl(r, r, h, 0, 0.16 + h / 2, 0, s.machine, 10, { shade: 0.02 });
    for (const f of [0.3, 0.65]) b.cyl(r + 0.04, r + 0.04, 0.12, 0, 0.16 + h * f, 0, s.metal, 10);
    b.cyl(r + 0.03, r + 0.03, 0.22, 0, 0.16 + h * 0.9, 0, s.stripe, 10);
    b.cyl(r * 0.55, r * 1.02, 0.6, 0, 0.16 + h + 0.3, 0, s.light, 10, { shade: 0.02 });
    b.cyl(0.26, 0.26, 0.3, 0, 0.16 + h + 0.7, 0, s.metal, 7);
    b.box(0.16, h * 0.6, 0.08, 0, 0.16 + h * 0.5, r + 0.02, s.accent, { slot: SLOT_GLOW });
    K.gauge(c, r * 0.55, 1.3, r + 0.04, 0);
    K.pipe(b, s, r + 0.1, 0.5, -0.3, w / 2 - 0.5, 0.5, -d / 2 + 0.6, 0.09);
    b.box(0.6, 0.6, 0.6, w / 2 - 0.5, 0.46, -d / 2 + 0.6, s.machineDark);
  }
  // ladder + chute + sacks
  const lx = -(r + 0.14);
  b.box(0.05, h, 0.05, lx, 0.16 + h / 2, 0.22, s.metal);
  b.box(0.05, h, 0.05, lx, 0.16 + h / 2, -0.22, s.metal);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.05, 0.5, lx, 0.7 + (i * (h - 1.0)) / 3, 0, s.metal);
  b.box(0.5, 0.36, 0.7, r + 0.1, 0.75, 0.55, t <= 2 ? WOOD_DARK : s.machineDark, { rx: 0.35, ry: -0.5 });
  K.sack(b, r + 0.35, 0.16, 0.95, t <= 2 ? K.CANVAS_DARK : s.light);
  if (level >= 3) K.sack(b, r + 0.75, 0.16, 0.65, K.CANVAS);
});

registerModel('tank', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  const r = Math.min(w, d) * 0.32;
  const h = 1.5 + c.lv * 0.7;
  const legH = 1.1;
  const legCol = t <= 2 ? WOOD_DARK : s.trim;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.16, legH, 0.16, sx * r * 0.74, legH / 2, sz * r * 0.74, legCol, { rx: -sz * 0.07, rz: sx * 0.07, shade: 0.04 });
  b.box(r * 1.5, 0.08, 0.08, 0, legH * 0.42, r * 0.76, legCol);
  b.box(r * 1.5, 0.08, 0.08, 0, legH * 0.42, -r * 0.76, legCol);
  b.cyl(r + 0.16, r + 0.16, 0.14, 0, legH, 0, t <= 2 ? WOOD : s.metal, 10, { shade: 0.04 });
  const y0 = legH + 0.07;
  const body = t <= 1 ? WOOD : t === 2 ? s.base : t === 6 ? s.light : s.machine;
  b.cyl(r, r, h, 0, y0 + h / 2, 0, body, 10, { shade: t <= 2 ? 0.05 : 0.02 });
  for (const f of [0.25, 0.75]) b.cyl(r + 0.04, r + 0.04, 0.1, 0, y0 + h * f, 0, t <= 1 ? '#5a4a3a' : s.metal, 10);
  const top = y0 + h;
  if (t <= 2) {
    // open cistern: visible water, crossbar with a bucket pulley
    K.waterDisc(b, r * 0.9, 0, top - 0.04, 0, 10);
    b.box(0.1, 0.1, r * 2.3, 0, top + 0.12, 0, WOOD_DARK);
    b.box(0.1, 0.9, 0.1, 0, top + 0.45, r * 1.05, WOOD_DARK);
    b.box(0.1, 0.9, 0.1, 0, top + 0.45, -r * 1.05, WOOD_DARK);
    b.box(0.1, 0.1, r * 2.3, 0, top + 0.9, 0, WOOD_DARK);
    b.cyl(0.14, 0.12, 0.2, 0.0, top + 0.5, 0, '#5a4a3a', 6);
  } else {
    b.cyl(r * 0.55, r + 0.02, 0.4, 0, top + 0.2, 0, s.light, 10, { shade: 0.02 });
    b.cyl(0.22, 0.22, 0.25, 0, top + 0.5, 0, s.metal, 7);
    b.box(0.14, h * 0.7, 0.08, 0, y0 + h / 2, r + 0.02, s.accent, { slot: SLOT_GLOW });
    b.cyl(r + 0.03, r + 0.03, 0.16, 0, y0 + h * 0.5, 0, s.stripe, 10);
    K.gauge(c, r * 0.5, y0 + 0.4, r + 0.04, 0);
    b.shard(0.16, 0.26, 0, top + 0.85, 0, WATER, { slot: SLOT_GLOW });
  }
  // downpipe to a trough with water (drips)
  const px = r * 0.55;
  const pz = r * 0.75;
  const pipeCol = t <= 1 ? '#5a4a3a' : s.metal;
  K.pipe(b, s, px, y0 + 0.25, pz, px, 0.55, pz + 0.3, 0.07, pipeCol);
  K.pipe(b, s, px, 0.55, pz + 0.3, px, 0.55, pz + 0.65, 0.07, pipeCol, false);
  b.box(1.0, 0.4, 0.5, px, 0.2, pz + 0.75, t <= 2 ? WOOD_DARK : s.machineDark, { shade: 0.04 });
  b.box(0.9, 0.06, 0.4, px, 0.38, pz + 0.75, WATER);
  c.emit('drips', px, 0.6, pz + 0.65, 1.0, '#9fdcff');
  // ladder
  const lx = -(r + 0.1);
  b.box(0.05, top, 0.05, lx, top / 2, 0.2, s.metal);
  b.box(0.05, top, 0.05, lx, top / 2, -0.2, s.metal);
  for (let i = 0; i < 4; i++) b.box(0.05, 0.05, 0.46, lx, 0.5 + (i * (top - 0.9)) / 3, 0, s.metal);
});

registerModel('quantum_storage', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.3, d - 0.3);
  const pw = w - 1.2;
  const pd = d - 1.2;
  K.wallBlock(c, pw, 1.1, pd, 0, 0.16, 0, { posts: false });
  b.cyl(Math.min(pw, pd) * 0.42, Math.min(pw, pd) * 0.42, 0.14, 0, 1.33, 0, s.machineDark, 6);
  K.glowRing(b, Math.min(pw, pd) * 0.46, 0, 1.4, 0, s.accent, 10, 0.05);
  // corner pylons with lit tips, conduits into the plinth
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (w / 2 - 0.5);
    const pz = sz * (d / 2 - 0.5);
    b.box(0.3, 2.7, 0.3, px, 1.35, pz, s.trim);
    b.box(0.36, 0.2, 0.36, px, 2.75, pz, t === 6 ? s.trim : s.metal);
    b.box(0.14, 0.3, 0.14, px, 3.0, pz, s.accent, { slot: SLOT_GLOW });
    b.box(0.08, 1.6, 0.08, px + (sx > 0 ? -0.2 : 0.2), 1.6, pz + (sz > 0 ? -0.2 : 0.2), s.accent, { slot: SLOT_GLOW });
    K.pipe(b, s, px, 0.55, pz, px * 0.55, 0.9, pz * 0.55, 0.07, s.metal, false);
  }
  // console at the front
  b.box(0.9, 0.9, 0.5, 0, 0.6, pd / 2 + 0.25, s.machine);
  b.box(0.7, 0.4, 0.06, 0, 0.95, pd / 2 + 0.5, s.accent, { rx: -0.4, slot: SLOT_GLOW });
  // floating storage core (same pivot as before)
  c.part('bobSpin', 0, 2.3, 0, (pb) => {
    pb.box(0.9, 0.9, 0.9, 0, 0, 0, s.machine);
    pb.box(1.0, 0.1, 1.0, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.box(0.1, 1.0, 0.1, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.box(0.1, 0.1, 1.0, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.shard(0.3, 0.55, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
    for (const sx of [-1, 1]) pb.box(0.26, 0.26, 0.26, sx * 0.85, 0.1, 0, s.machineDark);
  }, 0.8, 0.25);
  c.emit('motes', 0, 2.3, 0, 3, s.accent.getStyle());
  c.levelPips();
});

registerModel('food_storage', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.3, d - 0.3);
  const bw = w - 1.4;
  const bd = d - 1.2;
  const h = 2.0 + c.lv * 0.3;
  const bx = -0.35;
  const bz = -0.2;
  K.wallBlock(c, bw, h, bd, bx, 0.16, bz);
  K.shedRoof(c, bw, bd, bx, 0.16 + h, bz, { rise: 0.6 });
  K.door(c, bx - bw * 0.15, 0.16, bz + bd / 2 + 0.05, 0, { w: 0.8, h: 1.5, light: true, steps: true });
  K.casement(c, bx + bw / 2 + 0.02, 0.16 + h * 0.6, bz, 1, 0.6, 0.5);
  if (t <= 2) {
    // larder: produce crate, barrels, sacks, hanging herbs under the eave
    K.crateProp(b, w / 2 - 0.55, 0.16, d / 2 - 0.65, 0.6, t === 2 ? s.light : WOOD, WOOD_DARK, 0.15);
    b.shard(0.17, 0.17, w / 2 - 0.68, 0.16 + 0.68, d / 2 - 0.7, K.PUMPKIN);
    b.shard(0.13, 0.13, w / 2 - 0.42, 0.16 + 0.66, d / 2 - 0.55, K.TOMATO);
    b.shard(0.12, 0.12, w / 2 - 0.5, 0.16 + 0.64, d / 2 - 0.85, K.TOMATO);
    K.barrel(b, w / 2 - 0.5, 0.16, -d / 2 + 0.7, 0.28, 0.7);
    K.sack(b, bx + bw / 2 - 0.3, 0.16, bz - bd / 2 - 0.4, K.CANVAS_DARK, 0.22);
    for (let i = 0; i < 3; i++) K.bush(b, bx - bw / 2 + 0.3 + i * 0.4, 0.16 + h - 0.45, bz + bd / 2 + 0.3, 0.14, i % 2 ? LEAF : LEAF2);
    for (let i = 0; i < 3; i++) b.box(0.08, 0.4, 0.5, bx - bw / 2 - 0.03, 0.16 + 1.3, bz - 0.6 + i * 0.6, WOOD_DARK);
  } else {
    // cold store: frost line, rooftop chiller venting vapour, stacked containers
    b.box(bw * 0.6, 0.08, 0.08, bx, 0.16 + h * 0.45, bz + bd / 2 + 0.03, '#9fe8ff', { slot: SLOT_GLOW });
    b.box(0.9, 0.5, 0.7, bx - bw / 2 + 0.6, 0.16 + h + 0.55, bz - bd / 2 + 0.5, s.machine, { shade: 0.02 });
    b.box(0.6, 0.06, 0.5, bx - bw / 2 + 0.6, 0.16 + h + 0.82, bz - bd / 2 + 0.5, s.metal);
    c.emit('steam', bx - bw / 2 + 0.6, 0.16 + h + 0.9, bz - bd / 2 + 0.5, 0.5);
    container(c, w / 2 - 0.6, 0.16, d / 2 - 0.7, 0.9, 0.7, 0.8, 0.1);
    container(c, w / 2 - 0.6, 0.16, -d / 2 + 0.7, 0.9, 0.7, 0.8, -0.2);
    K.barrel(b, bx + bw / 2 - 0.3, 0.16, bz - bd / 2 - 0.4, 0.24, 0.6, s.metal, s.accent);
  }
  c.levelPips();
});

// ------------------------------------------------------------------------------------ housing

registerModel('bed', (c) => {
  const { b, s } = c;
  const t = s.index;
  const frame = t <= 2 ? WOOD_DARK : s.trim;
  b.quad(1.7, 2.3, 0, 0.01, 0, t <= 2 ? '#b3573a' : s.floor);
  b.box(1.1, 0.26, 1.9, 0, 0.3, 0, frame, { shade: 0.04 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.45, 0.12, sx * 0.49, 0.22, sz * 0.89, frame);
  b.box(1.0, 0.22, 1.7, 0, 0.56, 0, WHITE);
  b.box(1.0, 0.16, 1.1, 0, 0.72, 0.25, t >= 4 ? '#5ec8ff' : t === 3 ? '#8fb3d9' : '#e86f4d');
  b.box(0.96, 0.05, 0.3, 0, 0.82, 0.05, t >= 4 ? '#a8e4ff' : '#f5d9a0');
  b.box(0.7, 0.16, 0.4, 0, 0.72, -0.6, '#fff5e6');
  b.box(1.1, 0.7, 0.12, 0, 0.6, -0.95, frame, { shade: 0.04 });
  if (t <= 2) b.box(1.2, 0.12, 0.16, 0, 0.98, -0.95, frame);
  // nightstand with a little lamp
  b.box(0.42, 0.55, 0.42, 0.8, 0.275, -0.6, frame, { shade: 0.04 });
  K.lamp(c, 0.8, 0.72, -0.6, { cap: true });
});

registerModel('bunkhouse', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  if (t === 0) {
    // lean-to shelter: plank back/side walls, shed roof, bedrolls, hanging lantern, firewood, tarp
    K.pad(c, w - 0.5, d - 0.5, 0, 0);
    const bw = w - 1.0;
    const bd = d - 1.0;
    const backZ = -bd / 2 + 0.1;
    const leftX = -bw / 2 + 0.1;
    for (let i = 0; i < 4; i++) {
      const y = 0.16 + 0.24 + i * 0.46;
      b.box(bw, 0.43, 0.18, 0, y, backZ, i % 2 ? s.light : s.base, { shade: 0.05 });
      b.box(0.18, 0.43, bd - 0.2, leftX, y, 0, i % 2 ? s.base : s.light, { shade: 0.05 });
    }
    for (const sx of [-1, 1]) b.cyl(0.1, 0.12, 1.55, sx * (bw / 2 - 0.12), 0.16 + 0.78, bd / 2 - 0.15, WOOD_DARK, 6);
    b.box(0.1, 0.1, bd - 0.2, bw / 2 - 0.12, 0.16 + 1.5, 0, WOOD_DARK);
    K.shedRoof(c, bw, bd, 0, 0.16 + 1.55, 0, { rise: 0.55, overhang: 0.42 });
    b.box(0.8, 0.22, 1.5, -0.55, 0.16 + 0.11, 0.15, '#e86f4d', { shade: 0.04 });
    b.box(0.8, 0.22, 1.5, 0.45, 0.16 + 0.11, 0.15, K.BLANKET, { shade: 0.04 });
    b.box(0.5, 0.14, 0.4, -0.55, 0.16 + 0.29, -0.4, '#fff5e6');
    b.box(0.5, 0.14, 0.4, 0.45, 0.16 + 0.29, -0.4, '#fff5e6');
    K.lamp(c, bw / 2 - 0.3, 0.16 + 1.25, bd / 2 - 0.3, { light: true });
    K.crateProp(b, -bw / 2 + 0.55, 0.16, bd / 2 - 0.45, 0.45, WOOD, WOOD_DARK, 0.3);
    K.logPile(b, w / 2 - 0.45, 0, -0.3, 1.1, Math.PI / 2);
    b.box(1.2, 0.06, 1.4, -w / 2 + 0.7, 0.9, d / 2 - 0.4, K.CANVAS, { rx: 0.9, ry: 0.3, shade: 0.03 });
    b.box(0.08, 0.08, 1.2, -w / 2 + 0.45, 0.6, d / 2 - 0.5, WOOD_DARK, { rx: 0.9 });
    b.shard(0.08, 0.1, w / 2 - 0.35, 0.1, d / 2 - 0.35, K.FLOWERS[0]);
    b.shard(0.07, 0.09, w / 2 - 0.6, 0.08, d / 2 - 0.25, K.FLOWERS[1]);
  } else {
    const h = 2.4 + c.lv * 0.6;
    const bw = w - 1.0;
    const bd = d - 1.0;
    K.pad(c, w - 0.3, d - 0.3);
    K.house(c, bw, bd, h, 0, 0, { light: true, alongX: w > d + 0.5 });
    if (t <= 2) {
      // porch props: firewood by the wall, barrel, a planter
      K.logPile(b, w / 2 - 0.3, 0.16, -0.2, Math.min(1.2, bd * 0.4), Math.PI / 2);
      K.barrel(b, -w / 2 + 0.38, 0.16, d / 2 - 0.5, 0.24, 0.6);
      if (w >= 6) K.planter(c, -w / 2 + 0.4, -d / 2 + 0.5, 0.6, LEAF);
    } else {
      // utility: AC unit, pipe run, hazard block
      b.box(0.6, 0.5, 0.5, w / 2 - 0.4, 0.16 + 0.9, 0.2, s.machine, { shade: 0.02 });
      b.box(0.5, 0.06, 0.4, w / 2 - 0.4, 0.16 + 1.18, 0.2, s.metal);
      K.pipe(b, s, w / 2 - 0.4, 0.16 + 1.2, 0.2, w / 2 - 0.4, h - 0.2, 0.2, 0.06, s.metal, false);
      container(c, -w / 2 + 0.45, 0.16, d / 2 - 0.55, 0.7, 0.55, 0.6, 0.2);
    }
  }
  c.levelPips();
});

registerModel('habitat', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.4, d - 0.4);
  const r = Math.min(w, d) * 0.37;
  const y0 = 0.16;
  b.cyl(r * 1.02, r * 1.07, 0.9, 0, y0 + 0.45, 0, s.trim, 10, { shade: 0.03 });
  b.dome(r, 0, y0 + 0.9, 0, t === 5 ? s.dark : s.base, 10, { sy: 0.78, shade: 0.012 });
  K.glowRing(b, r * 1.0, 0, y0 + 0.96, 0, s.accent, 10, 0.06);
  if (t === 5) K.glowRing(b, r * 0.78, 0, y0 + 0.9 + r * 0.45, 0, s.accent, 10, 0.05);
  if (t === 6) K.ring(b, r * 0.5, 0, y0 + 0.9 + r * 0.6, 0, s.trim, 10, 0.05);
  b.sphere(r * 0.28, 0, y0 + 0.9 + r * 0.68, 0, '#ffffff', 6, { sy: 0.7, slot: SLOT_GLASS });
  // windows around the dome
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.3;
    const wx = Math.cos(a) * r * 0.9;
    const wz = Math.sin(a) * r * 0.9;
    b.box(0.76, 0.6, 0.1, wx, y0 + 1.5, wz, s.metal, { ry: -a + Math.PI / 2 });
    b.box(0.62, 0.48, 0.18, wx, y0 + 1.5, wz, '#ffffff', { ry: -a + Math.PI / 2, slot: SLOT_GLASS });
  }
  // airlock tunnel + door with lamp
  b.box(1.3, 1.7, 1.2, 0, y0 + 0.85, r * 0.8, s.light, { shade: 0.02 });
  b.box(1.4, 0.1, 1.3, 0, y0 + 1.72, r * 0.8, t === 4 || t === 6 ? s.stripe : s.accent, { slot: t === 4 || t === 6 ? 0 : SLOT_GLOW });
  K.door(c, 0, y0, r * 0.8 + 0.62, 0, { w: 0.8, h: 1.4, light: true, lamp: 'above', steps: true });
  // external tank, solar cell, planters
  b.cyl(0.42, 0.42, 1.3, -r - 0.35, y0 + 0.65, -0.3, s.machine, 8, { shade: 0.02 });
  b.cyl(0.46, 0.46, 0.1, -r - 0.35, y0 + 0.5, -0.3, s.metal, 8);
  b.cyl(0.46, 0.46, 0.1, -r - 0.35, y0 + 1.0, -0.3, s.metal, 8);
  K.pipe(b, s, -r - 0.35, y0 + 1.3, -0.3, -r * 0.7, y0 + 1.5, -0.3, 0.07, s.metal, false);
  K.solarCell(b, s, 1.1, 0.8, r + 0.5, y0 + 0.5, -0.5);
  b.box(0.1, 0.5, 0.1, r + 0.5, y0 + 0.25, -0.5, s.metal);
  K.planter(c, -w / 2 + 0.55, d / 2 - 0.55, 0.6, LEAF2);
  K.planter(c, w / 2 - 0.55, d / 2 - 0.55, 0.6, LEAF);
  c.antenna(0, y0 + 0.9 + r * 0.78, 0, 1.0, s.accent.getStyle());
  c.levelPips();
});

registerModel('skyscraper', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.2, d - 0.2);
  const floors = 4 + c.level;
  const fh = 1.6;
  const bw = w - 1.2;
  const bd = d - 1.2;
  // podium with entrance canopy
  const ph = 1.3;
  K.wallBlock(c, w - 0.7, ph, d - 0.7, 0, 0.16, 0, { posts: false });
  K.door(c, 0, 0.16, d / 2 - 0.35 + 0.05, 0, { w: 1.2, h: 1.1, light: true, lamp: 'above', steps: true });
  b.box(2.2, 0.1, 0.7, 0, 0.16 + ph + 0.05, d / 2 - 0.4, s.trim);
  K.planter(c, -w / 2 + 0.55, d / 2 - 0.55, 0.6, LEAF2);
  K.planter(c, w / 2 - 0.55, d / 2 - 0.55, 0.6, LEAF);
  const y0 = 0.16 + ph;
  for (let i = 0; i < floors; i++) {
    const shrink = i >= floors - 2 ? 0.75 : 1;
    const fw = bw * shrink;
    const fd = bd * shrink;
    b.box(fw, fh - 0.18, fd, 0, y0 + i * fh + fh / 2, 0, i % 2 ? s.base : s.light, { shade: 0.015 });
    b.box(fw + 0.06, 0.55, fd + 0.06, 0, y0 + i * fh + fh / 2 + 0.1, 0, '#ffffff', { slot: SLOT_GLASS });
    b.box(fw + 0.1, 0.08, fd + 0.1, 0, y0 + i * fh + fh - 0.1, 0, t >= 3 ? s.accent : s.trim, { slot: t >= 3 ? SLOT_GLOW : 0 });
    if (i === floors - 2) {
      // setback terrace with greenery
      K.bush(b, -bw / 2 + 0.45, y0 + i * fh - 0.1, bd / 2 - 0.45, 0.3, LEAF2);
      K.bush(b, bw / 2 - 0.45, y0 + i * fh - 0.1, -bd / 2 + 0.45, 0.3, LEAF);
    }
  }
  if (t >= 5) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, (floors - 2) * fh, 0.08, sx * (bw / 2 + 0.02), y0 + ((floors - 2) * fh) / 2, sz * (bd / 2 + 0.02), s.accent, { slot: SLOT_GLOW });
  const top = y0 + floors * fh;
  b.box(bw * 0.5, 0.4, bd * 0.5, 0, top + 0.2, 0, s.trim);
  b.cyl(bw * 0.3, bw * 0.3, 0.1, 0, top + 0.45, 0, s.floor, 8);
  K.glowRing(b, bw * 0.3, 0, top + 0.5, 0, s.accent, 8, 0.04);
  c.antenna(0, top + 0.5, 0, 2.2, t >= 4 ? s.accent.getStyle() : '#ff4d5e');
  c.setLight(0, top * 0.5, 0, '#ffd27a', 0.8, 8);
});

// ------------------------------------------------------------------------------------ food & water

registerModel('campfire', (c) => {
  const { b } = c;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.34, 0.26, 0.28, Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62, i % 2 ? K.STONE : '#a5a098', { ry: a + 0.3, rz: (i % 3) * 0.1, shade: 0.07 });
  }
  b.cyl(0.1, 0.11, 1.0, 0, 0.18, 0, WOOD_DARK, 5, { rz: Math.PI / 2, ry: 0.4 });
  b.cyl(0.1, 0.11, 1.0, 0, 0.18, 0, WOOD_DARK, 5, { rz: Math.PI / 2, ry: 1.7 });
  b.cyl(0.1, 0.11, 1.0, 0, 0.3, 0, WOOD, 5, { rz: Math.PI / 2, ry: 2.9 });
  b.box(0.2, 0.08, 0.08, 0.2, 0.36, 0.1, '#ff7a2e', { slot: SLOT_GLOW, ry: 0.5 });
  c.part('sway', 0, 0.45, 0, (pb) => {
    pb.cone(0.3, 0.8, 0, 0.4, 0, FIRE_GLOW, 6, { slot: SLOT_GLOW });
    pb.cone(0.18, 0.55, 0.05, 0.5, 0.03, '#ffd36b', 5, { slot: SLOT_GLOW });
  }, 6, 0.08);
  // cooking tripod with a pot
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    b.box(0.06, 1.5, 0.06, Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3, WOOD_DARK, { rx: -Math.sin(a) * 0.36, rz: Math.cos(a) * 0.36 });
  }
  b.cyl(0.2, 0.17, 0.26, 0, 0.9, 0, '#3f3a36', 6);
  b.box(0.28, 0.04, 0.04, 0, 1.08, 0, '#3f3a36');
  // log bench + stump seats
  b.cyl(0.16, 0.16, 1.3, 0, 0.16, 0.85, WOOD, 5, { rz: Math.PI / 2 });
  b.cyl(0.18, 0.2, 0.34, -0.85, 0.17, -0.1, WOOD_DARK, 6);
  b.cyl(0.18, 0.2, 0.34, 0.8, 0.17, -0.4, WOOD_DARK, 6);
  b.box(0.16, 0.14, 0.16, 0.85, 0.42, -0.4, '#ffd36b', { slot: SLOT_GLOW });
  c.emit('fire', 0, 0.5, 0, 9);
  c.emit('smoke', 0, 1.1, 0, 1.2);
  c.setLight(0, 1.0, 0, '#ff9a3c', 1.6, 9);
});

registerModel('farm_plot', (c) => {
  const { b, s, w, d, level } = c;
  const t = s.index;
  const rows = 3;
  const cols = Math.min(4, Math.max(2, Math.round(w / 1.2)));
  const ph = 0.35 + level * 0.09;
  // raised bed: soil + timber (or metal) border
  b.box(w - 0.5, 0.26, d - 0.5, 0, 0.1, 0, SOIL, { shade: 0.06 });
  const border = t <= 2 ? WOOD_DARK : s.trim;
  b.box(w - 0.4, 0.2, 0.14, 0, 0.18, d / 2 - 0.3, border, { shade: 0.04 });
  b.box(w - 0.4, 0.2, 0.14, 0, 0.18, -d / 2 + 0.3, border, { shade: 0.04 });
  b.box(0.14, 0.2, d - 0.4, w / 2 - 0.3, 0.18, 0, border, { shade: 0.04 });
  b.box(0.14, 0.2, d - 0.4, -w / 2 + 0.3, 0.18, 0, border, { shade: 0.04 });
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.75 + (r * (d - 1.5)) / (rows - 1);
    b.box(w - 1.0, 0.1, 0.42, 0, 0.26, z, '#4a3321', { shade: 0.05 });
  }
  c.part('sway', 0, 0.3, 0, (pb) => {
    for (let r = 0; r < rows; r++) {
      const z = -d / 2 + 0.75 + (r * (d - 1.5)) / (rows - 1);
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + 0.85 + (i * (w - 1.7)) / Math.max(1, cols - 1);
        pb.box(0.07, ph, 0.07, x, ph / 2, z, '#5d8f3c');
        pb.sphere(0.22 + level * 0.025, x, ph + 0.05, z, (i + r) % 2 ? LEAF : LEAF2, 5, { sy: 0.8, shade: 0.06 });
        if (level >= 2 && (i + r) % 3 === 0) pb.shard(0.08, 0.1, x + 0.1, ph + 0.14, z + 0.12, r === 1 ? K.PUMPKIN : K.TOMATO);
        if (level >= 4 && (i + r) % 3 === 1) pb.shard(0.06, 0.08, x - 0.12, ph + 0.1, z - 0.1, K.BERRY);
      }
    }
  }, 1.2, 0.05);
  // fence along the back and one side, scarecrow / sprinkler, water bucket
  if (t <= 2) {
    K.fenceRun(b, -w / 2 + 0.15, -d / 2 + 0.12, w / 2 - 0.15, -d / 2 + 0.12);
    K.fenceRun(b, -w / 2 + 0.12, -d / 2 + 0.12, -w / 2 + 0.12, d / 2 - 0.3);
    const sx = w / 2 - 0.55;
    const sz = -d / 2 + 0.75;
    b.box(0.08, 1.6, 0.08, sx, 0.8, sz, WOOD_DARK);
    b.box(0.9, 0.08, 0.08, sx, 1.25, sz, WOOD_DARK);
    b.box(0.5, 0.5, 0.26, sx, 1.1, sz, '#6f8fd6', { shade: 0.04 });
    b.sphere(0.17, sx, 1.5, sz, K.CANVAS, 5);
    b.cone(0.26, 0.26, sx, 1.7, sz, WOOD, 5);
    b.cyl(0.14, 0.12, 0.26, -w / 2 + 0.55, 0.42, d / 2 - 0.6, '#5a4a3a', 6);
    K.waterDisc(b, 0.11, -w / 2 + 0.55, 0.54, d / 2 - 0.6, 6);
  } else {
    K.fenceRun(b, -w / 2 + 0.15, -d / 2 + 0.12, w / 2 - 0.15, -d / 2 + 0.12, { color: s.trim, rail: s.accent, glowRail: true, h: 0.8 });
    const sx = w / 2 - 0.5;
    const sz = -d / 2 + 0.7;
    b.box(0.1, 1.5, 0.1, sx, 0.75, sz, s.metal);
    b.box(w - 1.6, 0.08, 0.08, sx - (w - 1.6) / 2, 1.5, sz, s.metal);
    for (let i = 0; i < 3; i++) b.box(0.14, 0.08, 0.3, sx - 0.5 - (i * (w - 2.4)) / 2, 1.44, sz + 0.05, s.accent, { slot: SLOT_GLOW });
    b.box(0.5, 0.5, 0.5, -w / 2 + 0.55, 0.45, d / 2 - 0.55, s.machine, { shade: 0.02 });
    b.box(0.12, 0.3, 0.06, -w / 2 + 0.55, 0.45, d / 2 - 0.29, '#7cff6a', { slot: SLOT_GLOW });
    K.pipe(b, s, -w / 2 + 0.55, 0.7, d / 2 - 0.55, -w / 2 + 0.55, 1.0, d / 2 - 1.1, 0.05, s.metal, false);
  }
});

registerModel('greenhouse', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.2, d - 0.2);
  const gw = w - 1.0;
  const gd = d - 0.8;
  const kneeH = 0.6;
  const h = 1.5;
  const frame = t <= 2 ? WOOD_DARK : s.metal;
  const kneeCol = t <= 1 ? s.base : t === 2 ? s.light : s.machine;
  b.box(gw, kneeH, gd, 0, 0.16 + kneeH / 2, 0, kneeCol, { shade: t <= 2 ? 0.05 : 0.02 });
  b.box(gw + 0.08, 0.1, gd + 0.08, 0, 0.16 + kneeH, 0, frame);
  const y0 = 0.16 + kneeH;
  b.box(gw - 0.04, h, gd - 0.04, 0, y0 + h / 2, 0, '#ffffff', { slot: SLOT_GLASS });
  const rh = Math.max(0.8, gw * 0.3);
  b.wedge(gw + 0.16, rh, gd + 0.16, 0, y0 + h - 0.02, 0, '#ffffff', { slot: SLOT_GLASS });
  // frame: corner posts, mullions, eaves, ridge, rafters
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, h + 0.08, 0.12, sx * (gw / 2 - 0.02), y0 + h / 2, sz * (gd / 2 - 0.02), frame);
  const nx = Math.min(5, Math.max(1, Math.round(gw / 1.3) - 1));
  for (let i = 0; i < nx; i++) {
    const x = -gw / 2 + ((i + 1) * gw) / (nx + 1);
    for (const sz of [-1, 1]) b.box(0.08, h, 0.08, x, y0 + h / 2, sz * (gd / 2 + 0.02), frame);
  }
  const nz = Math.min(3, Math.max(1, Math.round(gd / 1.6) - 1));
  for (let i = 0; i < nz; i++) {
    const z = -gd / 2 + ((i + 1) * gd) / (nz + 1);
    for (const sx of [-1, 1]) b.box(0.08, h, 0.08, sx * (gw / 2 + 0.02), y0 + h / 2, z, frame);
  }
  b.box(gw + 0.2, 0.1, 0.1, 0, y0 + h, gd / 2 + 0.04, frame);
  b.box(gw + 0.2, 0.1, 0.1, 0, y0 + h, -gd / 2 - 0.04, frame);
  b.box(0.12, 0.12, gd + 0.3, 0, y0 + h + rh, 0, frame);
  const slope = Math.atan2(rh, gw / 2);
  for (const sx of [-1, 1]) b.box(0.08, 0.06, gd + 0.2, sx * gw * 0.25, y0 + h + rh * 0.5 + 0.04, 0, frame, { rz: -sx * slope });
  // roof vent flap + grow lights (tech) + door
  b.box(0.7, 0.05, 0.5, gw * 0.22, y0 + h + rh * 0.62 + 0.14, -gd * 0.2, frame, { rz: -slope + 0.5 });
  if (t >= 3) for (let i = 0; i < 2; i++) b.box(gw * 0.6, 0.05, 0.1, 0, y0 + h + rh - 0.2, (i - 0.5) * gd * 0.4, '#ffb6e8', { slot: SLOT_GLOW });
  K.door(c, gw * 0.1, 0.16, gd / 2 + 0.03, 0, { w: 0.8, h: Math.min(1.9, kneeH + h - 0.1), lamp: 'side', light: t <= 2 });
  // plants inside, barrel + watering can outside
  const pn = Math.min(8, Math.max(3, Math.round(gw / 1.0) + 1));
  for (let i = 0; i < pn; i++) {
    const x = -gw / 2 + 0.6 + (i * (gw - 1.2)) / Math.max(1, pn - 1);
    const z = i % 2 ? gd * 0.22 : -gd * 0.22;
    b.box(0.5, 0.3, 0.5, x, y0 + 0.15, z, t <= 2 ? WOOD_DARK : s.machineDark);
    K.bush(b, x, y0 + 0.3, z, 0.3 + (i % 3) * 0.04, i % 2 ? LEAF : LEAF2, i % 3 === 0 ? K.TOMATO : i % 3 === 1 ? K.PUMPKIN : undefined);
  }
  K.barrel(b, w / 2 - 0.45, 0.16, d / 2 - 0.5, 0.24, 0.6, t <= 2 ? WOOD : s.metal);
  K.waterDisc(b, 0.2, w / 2 - 0.45, 0.76, d / 2 - 0.5, 7);
  c.levelPips();
});

registerModel('hydroponics', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.3, d - 0.3);
  const racks = 2;
  const rw = w - 1.6;
  for (let r = 0; r < racks; r++) {
    const z = -d / 4 + (r * d) / 2 + 0.15;
    for (const y of [0.7, 1.5]) {
      b.box(rw, 0.14, 0.7, 0, y, z, s.machine, { shade: 0.02 });
      b.box(rw - 0.1, 0.04, 0.5, 0, y + 0.09, z, '#48c8ff', { slot: SLOT_GLOW });
      for (let i = 0; i < 3; i++) K.bush(b, -rw / 2 + 0.5 + (i * (rw - 1.0)) / 2, y + 0.1, z, 0.24, i % 2 ? '#7dff7a' : '#b7ff6a', i === 1 ? K.TOMATO : undefined);
    }
    for (const sx of [-1, 1]) b.box(0.1, 2.1, 0.1, sx * (rw / 2 - 0.05), 1.05, z, s.trim);
    b.box(rw, 0.08, 0.5, 0, 2.1, z, s.machineDark);
    b.box(rw - 0.2, 0.05, 0.3, 0, 2.05, z, '#ffb6e8', { slot: SLOT_GLOW });
  }
  // nutrient tank, pump block, pipes along the racks, control console
  const tx = w / 2 - 0.55;
  b.cyl(0.42, 0.42, 1.6, tx, 0.96, -d / 2 + 0.7, t === 6 ? s.light : s.machine, 8, { shade: 0.02 });
  b.cyl(0.46, 0.46, 0.1, tx, 0.6, -d / 2 + 0.7, s.metal, 8);
  b.cyl(0.46, 0.46, 0.1, tx, 1.3, -d / 2 + 0.7, s.metal, 8);
  b.box(0.1, 1.0, 0.06, tx - 0.44, 0.96, -d / 2 + 0.7, '#9fdcff', { slot: SLOT_GLOW });
  b.cyl(0.2, 0.2, 0.2, tx, 1.86, -d / 2 + 0.7, s.metal, 6);
  K.pipe(b, s, tx, 1.6, -d / 2 + 0.7, rw / 2, 2.1, -d / 4 + 0.15, 0.06, s.metal, false);
  K.pipe(b, s, rw / 2, 2.1, -d / 4 + 0.15, rw / 2, 2.1, d / 4 + 0.15, 0.06, s.metal, false);
  b.box(0.8, 0.9, 0.5, tx, 0.61, d / 2 - 0.7, s.machineDark);
  b.box(0.6, 0.4, 0.06, tx, 0.95, d / 2 - 0.44, s.accent, { rx: -0.4, slot: SLOT_GLOW });
  b.box(0.1, 0.1, 0.06, tx - 0.25, 0.55, d / 2 - 0.44, '#7cff6a', { slot: SLOT_GLOW });
  c.emit('drips', 0, 1.3, 0.15, 1.5, '#9fdcff');
  c.levelPips();
});

registerModel('kitchen', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  K.pad(c, w - 0.3, d - 0.3);
  const bw = w - 1.2;
  const bd = d - 1.5;
  const bz = -0.35;
  const h = 2.3;
  K.house(c, bw, bd, h, 0, bz, { chimney: false, light: true, windows: 1, door: 1 });
  if (t <= 3) K.chimney(c, bw / 2 - 0.5, h + 0.3, bz - bd / 2 + 0.55, 1.2, 2);
  else c.chimney(bw / 2 - 0.5, h + 0.3, bz - bd / 2 + 0.55, 1.0, 0.16, 1.5);
  // serving counter under an awning, pot steaming, produce crate and barrel
  const cz = d / 2 - 0.45;
  const counterCol = t <= 2 ? WOOD : s.machine;
  b.box(bw * 0.7, 0.8, 0.5, -bw * 0.1, 0.16 + 0.4, cz, counterCol, { shade: 0.04 });
  b.box(bw * 0.7 + 0.1, 0.08, 0.6, -bw * 0.1, 0.16 + 0.84, cz, t <= 2 ? WOOD_DARK : s.metal);
  K.awning(c, -bw * 0.1, 0.16 + h * 0.78, bz + bd / 2 + 0.02, bw * 0.75, cz - (bz + bd / 2) + 0.3, 0, t <= 2 ? K.CANVAS : s.light);
  b.cyl(0.26, 0.22, 0.32, -bw * 0.3, 0.16 + 1.04, cz, '#3f3a36', 7);
  b.box(0.3, 0.04, 0.04, -bw * 0.3, 0.16 + 1.2, cz, '#3f3a36');
  b.box(0.3, 0.2, 0.2, bw * 0.12, 0.16 + 0.98, cz, '#f5d9a0', { ry: 0.3 });
  b.shard(0.1, 0.1, bw * 0.12 + 0.06, 0.16 + 1.14, cz, K.TOMATO);
  c.emit('steam', -bw * 0.3, 0.16 + 1.22, cz, 1.5);
  K.barrel(b, w / 2 - 0.42, 0.16, cz - 0.1, 0.24, 0.6, t <= 2 ? WOOD : s.metal);
  K.crateProp(b, -w / 2 + 0.5, 0.16, cz - 0.15, 0.5, t === 2 ? s.light : t <= 1 ? WOOD : s.machine, t <= 2 ? WOOD_DARK : s.machineDark, 0.2);
  b.shard(0.12, 0.12, -w / 2 + 0.45, 0.16 + 0.58, cz - 0.15, K.PUMPKIN);
  b.box(0.9, 0.3, 0.06, -bw * 0.1, 0.16 + h * 0.5, bz + bd / 2 + 0.05, t >= 3 ? s.accent : WOOD_DARK, { slot: t >= 3 ? SLOT_GLOW : 0 });
  c.levelPips();
});

registerModel('rain_collector', (c) => {
  const { b, s } = c;
  const t = s.index;
  const body = t <= 1 ? WOOD : t === 2 ? s.base : s.machine;
  b.box(1.3, 0.14, 1.3, 0, 0.07, 0, t <= 2 ? K.STONE : s.floorAlt, { shade: 0.06 });
  b.cyl(0.46, 0.42, 1.0, 0, 0.64, 0, body, 8, { shade: t <= 2 ? 0.05 : 0.02 });
  b.cyl(0.5, 0.5, 0.08, 0, 0.42, 0, t <= 1 ? '#5a4a3a' : s.metal, 8);
  b.cyl(0.5, 0.5, 0.08, 0, 0.92, 0, t <= 1 ? '#5a4a3a' : s.metal, 8);
  if (t >= 3) b.box(0.12, 0.7, 0.06, 0, 0.64, 0.48, s.accent, { slot: SLOT_GLOW });
  // funnel on a stand with water pooled in it
  const fr = 0.85 + c.lv * 0.25;
  b.cyl(0.06, 0.06, 0.6, 0, 1.4, 0, s.metal, 5);
  b.cyl(fr, 0.14, 0.6, 0, 1.95, 0, t <= 2 ? '#7fb6d9' : s.light, 8, { shade: 0.03 });
  K.waterDisc(b, fr * 0.8, 0, 2.2, 0, 8);
  // gutter + spout + bucket with drips
  b.box(0.08, 0.08, 0.6, 0.6, 1.2, 0, s.metal, { rz: 0.2 });
  b.box(0.3, 0.08, 0.3, 0.52, 0.6, 0, '#7fb6d9');
  b.cyl(0.05, 0.05, 0.3, 0.62, 0.42, 0, WATER, 5);
  b.cyl(0.16, 0.13, 0.3, 0.62, 0.22, 0.0, t <= 2 ? '#5a4a3a' : s.metal, 6);
  K.waterDisc(b, 0.13, 0.62, 0.36, 0, 6);
  c.emit('drips', 0.62, 0.55, 0, 0.8, '#9fdcff');
});

registerModel('water_pump', (c) => {
  const { b, s } = c;
  const t = s.index;
  // the pump itself (arm pivot unchanged)
  b.cyl(0.45, 0.5, 0.8, 0, 0.4, 0, t <= 2 ? K.STONE : s.machine, 8, { shade: t <= 2 ? 0.06 : 0.02 });
  b.box(0.3, 0.6, 0.3, 0, 1.1, 0, t <= 2 ? WOOD_DARK : s.trim);
  c.part('rock', 0, 1.4, 0, (pb) => {
    pb.box(1.4, 0.14, 0.14, 0, 0, 0, s.metal);
    pb.box(0.12, 0.5, 0.12, 0.65, -0.3, 0, s.metal);
    pb.box(0.2, 0.2, 0.2, -0.7, 0, 0, t <= 2 ? WOOD : s.accent, { slot: t >= 3 ? SLOT_GLOW : 0 });
  }, 1.6, 0.25);
  // spout + trough with water
  b.box(0.14, 0.14, 0.7, -0.5, 0.95, 0.15, s.metal, { ry: 0.5 });
  b.box(0.9, 0.36, 0.5, -0.65, 0.18, 0.55, t <= 2 ? WOOD_DARK : s.machineDark, { shade: 0.04 });
  b.box(0.8, 0.06, 0.4, -0.65, 0.34, 0.55, WATER);
  c.emit('drips', -0.6, 0.9, 0.3, 1.2, '#9fdcff');
  if (t <= 2) {
    // the well: stone ring, water inside, little roof on two posts, winch with bucket
    const wx = 1.15;
    const wz = -0.35;
    b.cyl(0.6, 0.64, 0.7, wx, 0.35, wz, K.STONE, 8, { shade: 0.08 });
    b.cyl(0.66, 0.66, 0.1, wx, 0.66, wz, K.STONE_DARK, 8);
    K.waterDisc(b, 0.5, wx, 0.6, wz, 8);
    for (const sz of [-1, 1]) b.box(0.12, 1.5, 0.12, wx, 0.75 + 0.35, wz + sz * 0.6, WOOD_DARK);
    b.box(0.08, 0.08, 1.3, wx, 1.6, wz, WOOD_DARK);
    b.cyl(0.14, 0.14, 0.9, wx, 1.6, wz, WOOD, 6, { rx: Math.PI / 2 });
    b.cyl(0.11, 0.09, 0.22, wx + 0.2, 1.1, wz, '#5a4a3a', 6);
    b.box(0.03, 0.45, 0.03, wx + 0.2, 1.38, wz, '#5a4a3a');
    K.gableRoof(c, 1.0, 1.4, wx, 2.05, wz, { h: 0.5, overhang: 0.3, alongX: true, shingles: true });
    K.bush(b, -1.3, 0, -1.2, 0.26, LEAF2);
  } else {
    // pump station: pressure tank, pipes, gauge, status light, puddle
    const tx = 1.15;
    b.cyl(0.42, 0.42, 1.2, tx, 0.76, -0.35, s.machine, 8, { shade: 0.02 });
    b.cyl(0.46, 0.46, 0.1, tx, 0.5, -0.35, s.metal, 8);
    b.cyl(0.46, 0.46, 0.1, tx, 1.05, -0.35, s.metal, 8);
    b.cyl(0.3, 0.42, 0.3, tx, 1.5, -0.35, s.light, 8);
    K.pipe(b, s, tx, 1.3, -0.35, 0.3, 0.9, -0.2, 0.07, s.metal);
    K.gauge(c, tx, 1.0, 0.1, 0, 0.14);
    b.box(0.5, 0.4, 0.4, -1.1, 0.36, -1.1, s.machineDark);
    b.box(0.1, 0.1, 0.06, -1.1, 0.5, -0.87, '#7cff6a', { slot: SLOT_GLOW });
    K.waterDisc(b, 0.45, -1.1, 0.03, 0.9, 7);
  }
});

registerModel('purifier', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  c.foundation(0.2);
  c.machine(w - 0.8, 1.2, d - 0.8, 0, 0.2, 0, 3);
  // clear filtration column with water inside
  const tx = -w / 4;
  b.cyl(0.52, 0.52, 0.25, tx, 1.52, 0, s.metal, 10);
  b.cyl(0.4, 0.4, 1.0, tx, 2.1, 0, WATER, 8);
  b.cyl(0.46, 0.46, 1.1, tx, 2.1, 0, '#ffffff', 10, { slot: SLOT_GLASS });
  b.cyl(0.52, 0.52, 0.2, tx, 2.72, 0, s.metal, 10);
  b.cyl(0.3, 0.3, 0.2, tx, 2.9, 0, s.light, 8);
  for (let i = 0; i < 3; i++) b.cyl(0.36, 0.36, 0.04, tx, 1.75 + i * 0.3, 0, '#dff6ff', 8);
  // filter stack + pipes + gauge + valve wheel
  const fx = w / 4;
  b.box(0.7, 0.7, 0.7, fx, 1.75, 0, s.machine, { shade: 0.02 });
  b.box(0.76, 0.1, 0.76, fx, 1.55, 0, s.stripe);
  b.box(0.1, 0.1, 0.06, fx, 2.0, 0.37, '#7cff6a', { slot: SLOT_GLOW });
  K.pipe(b, s, tx + 0.46, 2.4, 0, fx - 0.35, 2.0, 0, 0.09, s.metal);
  K.pipe(b, s, fx + 0.35, 1.9, 0, w / 2 - 0.55, 1.9, 0, 0.08, s.metal, false);
  K.pipe(b, s, w / 2 - 0.55, 1.9, 0, w / 2 - 0.55, 1.1, d / 2 - 0.6, 0.08, s.metal, false);
  K.gauge(c, fx, 1.3, d / 2 - 0.4 + 0.02, 0, 0.15);
  b.cyl(0.18, 0.18, 0.06, tx, 1.2, d / 2 - 0.42, s.metal, 7, { rx: Math.PI / 2 });
  b.box(0.3, 0.05, 0.05, tx, 1.2, d / 2 - 0.38, s.accent, { rz: 0.4 });
  // output basin with water
  b.box(0.9, 0.3, 0.5, w / 2 - 0.55, 0.95 + 0.15 - 0.3, d / 2 - 0.55, s.machineDark);
  b.box(0.8, 0.05, 0.4, w / 2 - 0.55, 0.95, d / 2 - 0.55, WATER);
  c.emit('drips', tx, 2.6, 0, 2, '#9fdcff');
  c.levelPips();
});

registerModel('industrial_purifier', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  c.foundation(0.2);
  c.machine(w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, 4);
  const tankCol = new THREE.Color(t === 6 ? '#eef3f8' : t === 5 ? '#aebfd0' : '#dfe8ef');
  for (const sx of [-1, 1]) {
    const tx = (sx * w) / 4;
    c.tank(0.75, 2.2, tx, 1.2, 0, tankCol, new THREE.Color(WATER), 10);
    b.cyl(0.4, 0.75, 0.3, tx, 3.55, 0, s.light, 10);
    b.box(0.16, 1.5, 0.08, tx, 2.3, 0.78, '#9fdcff', { slot: SLOT_GLOW });
    b.cyl(0.14, 0.14, 0.2, tx, 3.8, 0, s.metal, 6);
    K.gauge(c, tx + sx * 0.35, 1.7, 0.76, 0, 0.14);
  }
  // cross pipes, walkway with railing, ladder, control cabinet
  K.pipe(b, s, -w / 4 + 0.75, 2.8, 0, w / 4 - 0.75, 2.8, 0, 0.14, WATER);
  K.pipe(b, s, -w / 4, 1.6, 0.75, -w / 4, 1.6, d / 2 - 0.6, 0.1, s.metal);
  K.pipe(b, s, -w / 4, 1.6, d / 2 - 0.6, w / 4, 1.6, d / 2 - 0.6, 0.1, s.metal, false);
  b.box(w - 1.2, 0.1, 0.6, 0, 1.25, -d / 2 + 0.75, s.floor);
  for (let i = 0; i < 3; i++) b.box(0.06, 0.6, 0.06, -w / 2 + 0.7 + (i * (w - 1.4)) / 2, 1.6, -d / 2 + 0.5, s.metal);
  b.box(w - 1.2, 0.05, 0.05, 0, 1.88, -d / 2 + 0.5, s.stripe);
  b.box(0.05, 1.2, 0.05, w / 2 - 0.5, 0.65, -d / 2 + 0.95, s.metal);
  b.box(0.05, 1.2, 0.05, w / 2 - 0.5, 0.65, -d / 2 + 0.55, s.metal);
  for (let i = 0; i < 3; i++) b.box(0.05, 0.05, 0.4, w / 2 - 0.5, 0.3 + i * 0.4, -d / 2 + 0.75, s.metal);
  b.box(0.8, 0.9, 0.5, w / 2 - 0.7, 1.65, 0.3, s.machineDark);
  b.box(0.6, 0.4, 0.06, w / 2 - 0.7, 1.9, 0.56, s.accent, { slot: SLOT_GLOW });
  b.box(0.1, 0.1, 0.06, w / 2 - 0.95, 1.4, 0.56, '#7cff6a', { slot: SLOT_GLOW });
  b.box(1.2, 0.3, 0.6, 0, 1.3, d / 2 - 0.6, s.machineDark);
  b.box(1.1, 0.05, 0.5, 0, 1.46, d / 2 - 0.6, WATER);
  c.chimney(0, 1.2, -d / 2 + 0.6, 1.6, 0.14, 0);
  c.emit('steam', 0, 3.0, -d / 2 + 0.6, 3);
  c.levelPips();
});

registerModel('atmo_generator', (c) => {
  const { b, s, w, d } = c;
  const t = s.index;
  c.foundation(0.2);
  c.machine(w - 0.9, 1.4, d - 0.9, 0, 0.2, 0, 3);
  // intake tower with vent louvres, glow rings, spinning fan on top (pivot unchanged)
  b.cyl(0.9, 1.1, 2.6, 0, 2.9, 0, s.machine, 10, { shade: 0.02 });
  for (let i = 0; i < 3; i++) b.cyl(1.0 - i * 0.03, 1.0 - i * 0.03, 0.08, 0, 2.2 + i * 0.55, 0, s.machineDark, 10);
  K.glowRing(b, 0.96, 0, 4.2, 0, s.accent, 10, 0.08);
  b.cyl(0.95, 0.95, 0.12, 0, 4.14, 0, t === 6 ? s.trim : s.metal, 10);
  c.part('spinY', 0, 4.25, 0, (pb) => {
    for (let i = 0; i < 4; i++) pb.box(1.5, 0.06, 0.3, 0, 0, 0, s.light, { ry: (i * Math.PI) / 4 });
    pb.cyl(0.2, 0.2, 0.2, 0, 0, 0, s.metal, 6);
  }, 5);
  // side tanks + pipes into the tower, exhaust stacks, control panel
  for (const sx of [-1, 1]) {
    b.cyl(0.4, 0.4, 1.3, sx * (w / 2 - 0.6), 2.25, -d / 2 + 0.7, t === 6 ? s.light : s.machine, 8, { shade: 0.02 });
    b.cyl(0.44, 0.44, 0.1, sx * (w / 2 - 0.6), 2.0, -d / 2 + 0.7, s.metal, 8);
    b.cyl(0.26, 0.4, 0.2, sx * (w / 2 - 0.6), 3.0, -d / 2 + 0.7, s.light, 8);
    K.pipe(b, s, sx * (w / 2 - 0.6), 2.6, -d / 2 + 0.7, sx * 0.9, 3.0, -0.3, 0.08, s.metal);
    b.box(0.1, 0.8, 0.06, sx * (w / 2 - 0.6), 2.25, -d / 2 + 1.12, s.accent, { slot: SLOT_GLOW });
  }
  b.box(0.9, 0.9, 0.5, w / 2 - 0.7, 2.05, d / 2 - 0.6, s.machineDark);
  b.box(0.7, 0.4, 0.06, w / 2 - 0.7, 2.3, d / 2 - 0.34, s.accent, { slot: SLOT_GLOW });
  b.box(0.1, 0.1, 0.06, w / 2 - 1.0, 1.85, d / 2 - 0.34, '#7cff6a', { slot: SLOT_GLOW });
  b.box(0.76, 0.1, 0.5, -w / 2 + 0.7, 1.65, d / 2 - 0.6, s.stripe);
  c.emit('steam', 0, 4.4, 0, 2);
  c.levelPips();
});
