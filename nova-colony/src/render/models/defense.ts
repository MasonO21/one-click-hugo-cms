/**
 * Defense models: barricades, traps, towers and every turret family. Turrets expose a 'turret'
 * animated part (the head, barrel pointing +Z) plus a muzzle offset so the actor can aim at aliens
 * and flash the muzzle on `turret:fired`.
 *
 * Style: chunky toy weapons. Every turret sits on a tier-styled pedestal (sandbags + timber at wood,
 * crenellated stone drum, riveted steel drum with rust stripes, alloy / nano / titanium energy
 * drums) and carries a few readable props (ammo boxes, fuel tank, hazard stripes, status lamps).
 * High-tech turrets glow (SLOT_GLOW) so they read at night.
 */
import * as THREE from 'three';
import { SLOT_GLOW, type GeoBuilder } from '../core/GeoBuilder';
import { registerModel, type ModelCtx } from './spec';
import { WOOD, WOOD_DARK } from './colors';

const GUN = '#3a3f47';
const GUN_LIGHT = '#6b7482';
const SANDBAG = '#b89a6a';
const AMMO = '#5e6b3a';
const WARN_DARK = '#2e2c2a';

/** Olive ammo box with a lid strip and a pale stencil plate. 36 tris. */
function ammoBox(b: GeoBuilder, x: number, y: number, z: number, ry = 0, w = 0.5, h = 0.3, d = 0.34): void {
  b.box(w, h, d, x, y + h / 2, z, AMMO, { ry, shade: 0.05 });
  b.box(w + 0.02, 0.06, d + 0.02, x, y + h - 0.03, z, '#4a5530', { ry });
  b.box(w * 0.5, h * 0.4, 0.02, x + Math.sin(ry) * (d / 2 + 0.01), y + h / 2, z + Math.cos(ry) * (d / 2 + 0.01), '#d8cfa8', { ry });
}

/** Hazard band wrapped around a drum: 8 alternating boxes. 96 tris. */
function hazardRing(b: GeoBuilder, r: number, y: number, h: number, colA: THREE.ColorRepresentation, colB: THREE.ColorRepresentation): void {
  const seg = 8;
  const w = 2 * r * Math.tan(Math.PI / seg) + 0.02;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    b.box(w, h, 0.05, Math.sin(a) * r, y, Math.cos(a) * r, i % 2 ? colA : colB, { ry: a });
  }
}

/** Tier-styled turret pedestal; returns the pivot height for the head. */
function pedestal(c: ModelCtx, r = 0.6, h = 0.9): number {
  const { b, s } = c;
  const t = s.index;
  /** Prop placement radius, clamped so props stay inside the 1-cell footprint for big drums. */
  const pr = Math.min(r, 0.68);
  if (t <= 1) {
    // sandbag ring, timber plinth with a rope-lashed cap, ammo crate
    b.sandbags(Math.min(r + 0.3, 0.82), 6, 0, 0, 0, SANDBAG, Math.PI * 1.55, 1);
    if (t === 1) for (const a of [1.1, Math.PI / 2, 2.05]) b.box(0.5, 0.24, 0.3, Math.cos(a) * Math.min(r + 0.3, 0.82), 0.34, Math.sin(a) * Math.min(r + 0.3, 0.82), SANDBAG, { ry: -a + 0.1, shade: 0.08 });
    b.box(r * 1.3, 0.22, r * 1.3, 0, 0.11, 0, WOOD_DARK, { shade: 0.05 });
    b.box(r * 1.0, h - 0.3, r * 0.5, 0, (h - 0.3) / 2 + 0.2, 0, WOOD, { shade: 0.05 });
    b.box(r * 0.5, h - 0.3, r * 1.0, 0, (h - 0.3) / 2 + 0.2, 0, WOOD, { shade: 0.05 });
    b.cyl(r * 0.62, r * 0.62, 0.14, 0, h - 0.04, 0, s.trim, 7, { shade: 0.04 });
    b.box(r * 0.9, 0.08, r * 0.9, 0, h - 0.15, 0, s.stripe, { ry: 0.4 });
    ammoBox(b, pr * 0.95, 0, -pr * 0.8, 0.5);
  } else if (t === 2) {
    // crenellated stone drum with a banner
    b.box(r * 1.9, h * 0.45, r * 1.9, 0, h * 0.225, 0, s.base, { shade: 0.06 });
    b.box(r * 1.55, h * 0.55, r * 1.55, 0, h * 0.45 + h * 0.275, 0, s.light, { shade: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.26, 0.26, 0.26, sx * r * 0.65, h + 0.1, sz * r * 0.65, s.light, { shade: 0.06 });
    b.cyl(r * 0.52, r * 0.52, 0.14, 0, h, 0, s.metal, 8);
    b.cyl(0.03, 0.03, 1.0, pr * 0.9, h + 0.5, -pr * 0.9, s.trim, 4);
    b.box(0.34, 0.5, 0.04, pr * 0.9 + 0.17, h + 0.75, -pr * 0.9, s.stripe, { shade: 0.04 });
  } else if (t === 3) {
    // riveted steel drum, rust-orange hazard band, ammo boxes
    b.cyl(r * 1.05, r * 1.15, h * 0.45, 0, h * 0.225, 0, s.machineDark, 8, { shade: 0.02 });
    b.cyl(r * 0.85, r * 0.95, h * 0.55, 0, h * 0.45 + h * 0.275, 0, s.machine, 8, { shade: 0.02 });
    hazardRing(b, r * 0.96, h * 0.52, 0.16, s.stripe, WARN_DARK);
    for (let i = 0; i < 4; i++) {
      const a = -0.6 + i * 0.4;
      b.box(0.08, 0.08, 0.05, Math.sin(a) * r * 1.13, h * 0.15, Math.cos(a) * r * 1.13, s.metal, { ry: a, rz: Math.PI / 4 });
    }
    b.cyl(r * 0.6, r * 0.6, 0.12, 0, h, 0, s.metal, 8);
    ammoBox(b, pr * 1.05, 0, -pr * 0.95, 0.4);
    ammoBox(b, pr * 1.1, 0.3, -pr * 1.0, 0.2, 0.44, 0.26, 0.3);
  } else if (t === 4) {
    // blue-silver alloy drum with white panels, orange stripe, cyan status ring
    b.cyl(r * 1.05, r * 1.15, h * 0.4, 0, h * 0.2, 0, s.trim, 8, { shade: 0.02 });
    b.cyl(r * 0.9, r * 0.95, h * 0.6, 0, h * 0.4 + h * 0.3, 0, s.light, 8, { shade: 0.02 });
    b.cyl(r * 0.96, r * 0.96, 0.1, 0, h * 0.42, 0, s.stripe, 8);
    b.cyl(r * 0.94, r * 0.94, 0.06, 0, h * 0.78, 0, s.accent, 8, { slot: SLOT_GLOW });
    b.cyl(r * 0.6, r * 0.6, 0.12, 0, h, 0, s.metal, 8);
    for (const a of [0.7, 2.4, 4.1]) b.box(0.16, h * 0.5, 0.1, Math.sin(a) * r * 0.98, h * 0.6, Math.cos(a) * r * 0.98, s.base, { ry: a });
  } else if (t === 5) {
    // nano: dark hex drum with three cyan seams and a glowing cap ring
    b.cyl(r * 1.1, r * 1.2, h * 0.4, 0, h * 0.2, 0, s.machineDark, 6, { shade: 0.02 });
    b.cyl(r * 0.9, r * 0.95, h * 0.6, 0, h * 0.4 + h * 0.3, 0, s.machine, 6, { shade: 0.02 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      b.box(0.07, h * 0.5, 0.06, Math.sin(a) * r * 0.86, h * 0.65, Math.cos(a) * r * 0.86, s.accent, { ry: a, slot: SLOT_GLOW });
    }
    b.cyl(r * 0.98, r * 0.98, 0.07, 0, h * 0.42, 0, s.accent, 6, { slot: SLOT_GLOW });
    b.cyl(r * 0.6, r * 0.6, 0.12, 0, h, 0, s.metal, 6);
  } else {
    // titanium: pearl drum, gold rings, soft blue glow, four gold fins
    b.cyl(r * 1.05, r * 1.15, h * 0.4, 0, h * 0.2, 0, s.machineDark, 8, { shade: 0.01 });
    b.cyl(r * 0.9, r * 0.95, h * 0.6, 0, h * 0.4 + h * 0.3, 0, s.light, 8, { shade: 0.01 });
    b.cyl(r * 0.98, r * 0.98, 0.09, 0, h * 0.42, 0, s.trim, 8);
    b.cyl(r * 0.92, r * 0.92, 0.06, 0, h * 0.8, 0, s.accent, 8, { slot: SLOT_GLOW });
    b.cyl(r * 0.6, r * 0.6, 0.12, 0, h, 0, s.trim, 8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.1, h * 0.55, 0.22, Math.sin(a) * r * 1.0, h * 0.5, Math.cos(a) * r * 1.0, s.trim, { ry: a });
    }
  }
  return h + 0.06;
}

/** Status lamp on a turret head (green = ready). */
function lamp(pb: GeoBuilder, x: number, y: number, z: number, color: THREE.ColorRepresentation = '#7cff6a'): void {
  pb.box(0.11, 0.11, 0.11, x, y, z, color, { slot: SLOT_GLOW, ry: Math.PI / 4 });
}

registerModel('barricade', (c) => {
  const { b, s } = c;
  if (s.index <= 2) {
    // crossed sharpened logs lashed to a beam, sandbags in front
    for (const z of [-0.45, 0.45]) {
      b.box(0.18, 2.0, 0.18, 0, 0.78, z, WOOD, { rz: 0.6, shade: 0.05 });
      b.box(0.18, 2.0, 0.18, 0, 0.78, z, WOOD_DARK, { rz: -0.6, shade: 0.05 });
      b.pyramid(0.18, 0.28, 0.18, Math.sin(0.6) * 1.0, 0.78 + Math.cos(0.6) * 1.0, z, '#d9c89a', { rz: -0.6 });
      b.pyramid(0.18, 0.28, 0.18, -Math.sin(0.6) * 1.0, 0.78 + Math.cos(0.6) * 1.0, z, '#d9c89a', { rz: 0.6 });
    }
    b.cyl(0.1, 0.1, 1.4, 0, 0.92, 0, WOOD, 5, { rx: Math.PI / 2 });
    b.box(0.3, 0.06, 1.3, 0, 0.92, 0, s.stripe, { ry: 0.0 });
    for (const x of [-0.55, 0, 0.55]) b.box(0.5, 0.24, 0.3, x, 0.12, 0.6, SANDBAG, { ry: x * 0.35, shade: 0.08 });
    b.box(0.5, 0.24, 0.3, 0.25, 0.34, 0.6, SANDBAG, { ry: 0.1, shade: 0.08 });
  } else {
    // concrete jersey barrier with hazard stripes + a steel hedgehog, warning lamp
    b.bevelBox(1.7, 0.75, 0.6, 0, 0.375, 0.25, s.machine, 0.08, { shade: 0.02 });
    b.stripes(1.6, 0.18, 0.64, 0, 0.5, 0.25, 4, s.stripe, WARN_DARK, 'x');
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) b.box(0.14, 1.3, 0.14, 0, 0.65, -0.5, s.metal, { rz: a, ry: a * 0.5 });
    b.box(1.3, 0.14, 0.14, 0, 0.45, -0.5, s.metal, { ry: 0.6 });
    b.box(0.14, 0.14, 0.14, 0.75, 0.86, 0.25, s.accent, { slot: SLOT_GLOW, ry: Math.PI / 4 });
  }
});

registerModel('spikes', (c) => {
  const { b, s } = c;
  const wood = s.index <= 1;
  b.box(1.7, 0.12, 1.7, 0, 0.06, 0, wood ? WOOD_DARK : s.metal, { shade: 0.04 });
  b.box(1.4, 0.04, 1.4, 0, 0.13, 0, wood ? '#5a3f2a' : s.machineDark);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const h = 0.5 + ((i + j) % 2) * 0.15 + c.lv * 0.2;
    b.cone(0.11, h, -0.55 + i * 0.55, 0.12 + h / 2, -0.55 + j * 0.55, wood ? '#d9c89a' : '#c7d0da', 4);
  }
  // warning sign post
  b.box(0.05, 0.8, 0.05, 0.78, 0.5, 0.78, wood ? WOOD : s.metal);
  b.box(0.3, 0.3, 0.04, 0.78, 0.95, 0.78, wood ? '#d9c89a' : s.stripe, { ry: Math.PI / 4 - 0.8, rz: Math.PI / 4 });
  if (s.index >= 4) b.box(1.5, 0.04, 0.05, 0, 0.14, 0, s.accent, { slot: SLOT_GLOW });
});

registerModel('guard_tower', (c) => {
  const { b, s, w, d } = c;
  const h = 3.4 + c.lv * 0.8;
  const wood = s.index <= 2;
  const legW = s.index <= 1 ? 0.2 : 0.26;
  const legCol = s.index === 2 ? s.light : s.trim;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(legW, h, legW, sx * (w / 2 - 0.45), h / 2, sz * (d / 2 - 0.45), legCol, { rx: -sz * 0.05, rz: sx * 0.05, shade: 0.04 });
  // X braces on two sides + ring beams
  for (const sz of [-1, 1]) {
    b.box(Math.hypot(w - 0.9, h * 0.4), 0.08, 0.08, 0, h * 0.42, sz * (d / 2 - 0.45), s.trim, { rz: Math.atan2(h * 0.4, w - 0.9) });
    b.box(Math.hypot(w - 0.9, h * 0.4), 0.08, 0.08, 0, h * 0.42, sz * (d / 2 - 0.45), s.trim, { rz: -Math.atan2(h * 0.4, w - 0.9) });
  }
  for (const sx of [-1, 1]) b.box(0.08, 0.08, d - 0.9, sx * (w / 2 - 0.45), h * 0.62, 0, s.trim);
  // platform with planks / plates
  b.box(w - 0.4, 0.16, d - 0.4, 0, h, 0, s.floorAlt, { shade: 0.03 });
  if (wood) b.planks(w - 0.5, 0.05, d - 0.5, 0, h + 0.1, 0, 4, s.floor, s.floorAlt, 'x', 0.04);
  else b.box(w - 0.6, 0.05, d - 0.6, 0, h + 0.1, 0, s.floor);
  // railing (sandbag parapet at wood tiers, plate parapet above)
  const railCol = wood ? s.base : s.machine;
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.7, d - 0.4, sx * (w / 2 - 0.22), h + 0.43, 0, railCol, { shade: 0.04 });
    b.box(w - 0.4, 0.7, 0.08, 0, h + 0.43, sx * (d / 2 - 0.22), railCol, { shade: 0.04 });
  }
  if (!wood) b.box(w - 0.3, 0.1, d - 0.3, 0, h + 0.75, 0, s.stripe);
  else b.box(w - 0.3, 0.08, d - 0.3, 0, h + 0.75, 0, s.trim);
  // roof on posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, 1.6, 0.1, sx * (w / 2 - 0.35), h + 0.8, sz * (d / 2 - 0.35), s.trim);
  b.pyramid(w + 0.3, 0.95, d + 0.3, 0, h + 1.6, 0, s.roof, { shade: 0.04 });
  b.box(w + 0.34, 0.1, d + 0.34, 0, h + 1.6, 0, s.roofEdge);
  // lantern under the roof + flag
  b.box(0.14, 0.2, 0.14, 0, h + 1.45, 0, s.lamp, { slot: SLOT_GLOW });
  b.cyl(0.03, 0.03, 0.9, 0, h + 2.95, 0, s.metal, 4);
  b.box(0.42, 0.3, 0.04, 0.23, h + 3.25, 0, s.stripe, { shade: 0.04 });
  // ladder
  b.box(0.05, h, 0.05, -0.25, h / 2, d / 2 - 0.1, s.metal);
  b.box(0.05, h, 0.05, 0.25, h / 2, d / 2 - 0.1, s.metal);
  for (let i = 1; i < 6; i++) b.box(0.5, 0.04, 0.04, 0, (i * h) / 6, d / 2 - 0.1, s.metal);
  // mounted weapon on the platform
  c.part('turret', 0, h + 0.3, 0, (pb) => {
    pb.box(0.24, 0.3, 0.24, 0, 0.0, 0, s.metal);
    pb.bevelBox(0.36, 0.26, 0.4, 0, 0.25, -0.12, GUN_LIGHT, 0.05);
    pb.cyl(0.07, 0.07, 0.9, 0, 0.25, 0.3, GUN, 6, { rx: Math.PI / 2 });
    pb.box(0.4, 0.34, 0.06, 0, 0.3, 0.1, s.machine); // gun shield
    lamp(pb, 0, 0.42, -0.2);
  });
  c.muzzle(0, 0.25, 0.8);
  c.setLight(0, h + 1.2, 0, '#ffd27a', 0.6, 7);
});

registerModel('turret_basic', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.6, 0.9);
  const body = s.index <= 1 ? WOOD : s.index === 2 ? '#8a7a66' : s.machine;
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.64, 0.46, 0.76, 0, 0.26, -0.05, body, 0.07, { shade: 0.05 });
    pb.box(0.66, 0.08, 0.78, 0, 0.5, -0.05, s.metal);
    pb.box(0.7, 0.1, 0.1, 0, 0.22, -0.05, s.stripe);
    pb.cyl(0.08, 0.08, 1.0, 0, 0.3, 0.6, GUN, 6, { rx: Math.PI / 2 });
    pb.cyl(0.12, 0.12, 0.2, 0, 0.3, 1.05, GUN_LIGHT, 6, { rx: Math.PI / 2 });
    // hand crank + sight
    pb.cyl(0.04, 0.04, 0.3, 0.42, 0.25, -0.2, s.metal, 5, { rz: Math.PI / 2 });
    pb.box(0.08, 0.22, 0.08, 0.6, 0.35, -0.2, WOOD);
    pb.box(0.06, 0.16, 0.06, 0, 0.6, 0.25, s.metal);
    lamp(pb, -0.25, 0.58, -0.2);
  });
  c.muzzle(0, 0.3, 1.15);
  void b;
});

registerModel('turret_mg', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.65, 1.0);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.84, 0.5, 0.94, 0, 0.3, -0.1, s.machine, 0.08, { shade: 0.02 });
    pb.box(0.88, 0.1, 0.5, 0, 0.58, -0.1, s.machineDark);
    pb.box(0.86, 0.08, 0.1, 0, 0.3, 0.38, s.stripe);
    for (const sx of [-0.16, 0.16]) {
      pb.cyl(0.06, 0.06, 1.2, sx, 0.32, 0.7, GUN, 6, { rx: Math.PI / 2 });
      pb.cyl(0.09, 0.09, 0.14, sx, 0.32, 1.28, GUN_LIGHT, 6, { rx: Math.PI / 2 });
    }
    // perforated cooling jacket + gun shield
    for (let i = 0; i < 3; i++) pb.box(0.5, 0.18, 0.06, 0, 0.32, 0.5 + i * 0.2, GUN_LIGHT);
    pb.box(0.9, 0.4, 0.06, 0, 0.42, 0.36, s.machineDark);
    // ammo box + belt
    ammoBox(pb, 0.6, 0.1, -0.2, 0, 0.4, 0.4, 0.5);
    pb.box(0.08, 0.08, 0.5, 0.3, 0.34, 0.1, '#c9a86b');
    lamp(pb, -0.3, 0.64, -0.3, '#ff4d5e');
  });
  c.muzzle(0, 0.32, 1.35);
});

registerModel('turret_flame', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.65, 0.9);
  // fuel tank beside the pedestal with hazard stripes and a fuel hose
  b.cyl(0.3, 0.3, 0.9, 0.62, 0.45, -0.3, '#d9742a', 8, { shade: 0.03 });
  b.cyl(0.32, 0.32, 0.1, 0.62, 0.3, -0.3, s.metal, 8);
  b.stripes(0.2, 0.3, 0.1, 0.62, 0.45, 0.02, 3, '#2e2c2a', '#f2c46d', 'y');
  b.cyl(0.14, 0.14, 0.08, 0.62, 0.94, -0.3, '#d9742a', 6);
  b.pipe([0.62, 0.95, -0.3, 0.62, 1.1, -0.3, 0.25, 1.1, -0.3, 0.1, y + 0.1, -0.3], 0.04, s.metal, 5, false);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.72, 0.5, 0.82, 0, 0.3, -0.1, s.machine, 0.08, { shade: 0.02 });
    pb.cyl(0.14, 0.14, 0.9, 0, 0.32, 0.6, GUN, 7, { rx: Math.PI / 2 });
    pb.cyl(0.26, 0.14, 0.3, 0, 0.32, 1.1, GUN_LIGHT, 7, { rx: Math.PI / 2 });
    pb.shard(0.1, 0.14, 0, 0.32, 1.22, '#ff9a2e', { slot: SLOT_GLOW });
    pb.cyl(0.06, 0.06, 0.6, 0.3, 0.5, -0.2, '#d9742a', 5, { rx: Math.PI / 2 });
    // heat shield + pilot flame lamp
    pb.box(0.6, 0.36, 0.05, 0, 0.42, 0.34, s.machineDark);
    pb.box(0.5, 0.1, 0.5, 0, 0.6, -0.2, '#d9742a');
    lamp(pb, -0.28, 0.6, -0.3, '#ff9a2e');
  });
  c.muzzle(0, 0.32, 1.3);
  c.emit('fire', 0, y + 0.32, 1.2, 0.6);
});

registerModel('turret_missile', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.7, 1.0);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.72, 0.4, 0.82, 0, 0.2, -0.1, s.machine, 0.07, { shade: 0.02 });
    pb.bevelBox(1.04, 0.84, 1.14, 0, 0.77, 0.0, s.machineDark, 0.1, { shade: 0.02 });
    pb.stripes(1.06, 0.1, 0.12, 0, 0.5, 0.52, 4, s.stripe, WARN_DARK, 'x');
    for (const sx of [-0.25, 0.25]) for (const sy of [0.58, 0.96]) {
      pb.cyl(0.15, 0.15, 1.12, sx, sy, 0.0, GUN, 6, { rx: Math.PI / 2 });
      pb.cone(0.12, 0.24, sx, sy, 0.66, '#ff4d5e', 6, { rx: Math.PI / 2 });
    }
    // side radar dish + status panel
    pb.cyl(0.22, 0.05, 0.06, 0.62, 1.05, -0.4, '#dfe6ee', 6, { rx: -0.8 });
    pb.box(0.08, 0.3, 0.3, 0.55, 0.9, -0.3, s.accent, { slot: SLOT_GLOW });
    lamp(pb, -0.4, 1.24, -0.4, '#ff4d5e');
  });
  c.muzzle(0, 0.75, 0.7);
});

registerModel('turret_heavy', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.85, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(1.34, 0.72, 1.34, 0, 0.4, -0.1, s.machine, 0.1, { shade: 0.02 });
    pb.box(1.44, 0.3, 0.3, 0, 0.6, 0.6, s.machineDark);
    pb.stripes(1.4, 0.1, 0.1, 0, 0.78, 0.5, 4, s.stripe, WARN_DARK, 'x');
    for (const sx of [-0.3, 0.3]) {
      pb.cyl(0.12, 0.12, 1.8, sx, 0.45, 1.0, GUN, 8, { rx: Math.PI / 2 });
      pb.cyl(0.17, 0.17, 0.3, sx, 0.45, 1.85, GUN_LIGHT, 8, { rx: Math.PI / 2 });
      pb.box(0.28, 0.1, 0.5, sx, 0.62, 0.9, GUN_LIGHT); // recoil rails
    }
    pb.box(1.0, 0.08, 0.9, 0, 0.8, -0.2, s.accent, { slot: SLOT_GLOW });
    pb.box(0.5, 0.5, 0.6, -0.8, 0.4, -0.3, s.machineDark);
    pb.cyl(0.18, 0.18, 0.12, 0.45, 0.82, -0.35, s.metal, 6); // hatch
    for (const sx of [-1, 1]) pb.box(0.08, 0.5, 1.0, sx * 0.72, 0.35, -0.1, s.trim); // side skirts
    lamp(pb, 0.45, 0.92, -0.35);
  });
  c.muzzle(0, 0.45, 2.0);
});

registerModel('turret_laser', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.6, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.54, 0.42, 0.94, 0, 0.26, -0.1, s.machine, 0.07, { shade: 0.02 });
    pb.box(0.62, 0.12, 0.6, 0, 0.5, -0.2, s.machineDark);
    pb.box(0.22, 0.22, 1.2, 0, 0.3, 0.6, GUN_LIGHT);
    pb.box(0.08, 0.08, 1.3, 0, 0.42, 0.6, s.accent, { slot: SLOT_GLOW });
    pb.box(0.08, 0.08, 1.3, 0, 0.18, 0.6, s.accent, { slot: SLOT_GLOW });
    pb.cyl(0.2, 0.12, 0.3, 0, 0.3, 1.3, s.machineDark, 8, { rx: Math.PI / 2 });
    pb.cyl(0.1, 0.1, 0.06, 0, 0.3, 1.47, '#ff5a6e', 6, { rx: Math.PI / 2, slot: SLOT_GLOW });
    // cooling fins + capacitor crystal
    for (let i = 0; i < 3; i++) pb.box(0.5, 0.05, 0.08, 0, 0.44 + i * 0.07, 0.1 + i * 0.16, GUN_LIGHT);
    pb.shard(0.14, 0.32, 0, 0.74, -0.25, s.accent, { slot: SLOT_GLOW });
    pb.cyl(0.2, 0.2, 0.05, 0, 0.56, -0.25, s.accent, 6, { slot: SLOT_GLOW });
    lamp(pb, 0.22, 0.56, -0.4);
  });
  c.muzzle(0, 0.3, 1.5);
});

registerModel('turret_plasma', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.7, 1.0);
  b.cyl(0.78, 0.78, 0.06, 0, 0.6, 0, s.accent, 10, { slot: SLOT_GLOW });
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.84, 0.4, 0.84, 0, 0.2, -0.1, s.machine, 0.08, { shade: 0.02 });
    pb.sphere(0.42, 0, 0.7, -0.1, s.accent, 8, { slot: SLOT_GLOW });
    pb.torus(0.5, 0.045, 0, 0.7, -0.1, s.metal, 10, 4, { rx: Math.PI / 2 + 0.3, ry: 0.4 });
    pb.torus(0.5, 0.045, 0, 0.7, -0.1, s.metal, 10, 4, { rx: Math.PI / 2 - 0.5, ry: 1.9 });
    pb.cyl(0.16, 0.22, 0.8, 0, 0.6, 0.5, GUN_LIGHT, 8, { rx: Math.PI / 2 });
    pb.cyl(0.25, 0.25, 0.06, 0, 0.6, 0.9, s.accent, 8, { rx: Math.PI / 2, slot: SLOT_GLOW });
    // magnetic coils along the emitter
    for (let i = 0; i < 3; i++) pb.box(0.4, 0.4, 0.06, 0, 0.6, 0.2 + i * 0.22, i % 2 ? s.machineDark : s.stripe);
    lamp(pb, -0.35, 0.44, -0.4, '#ff4d5e');
  });
  c.muzzle(0, 0.6, 1.0);
  c.emit('motes', 0, y + 0.7, -0.1, 2, s.accent.getStyle());
  c.setLight(0, y + 0.7, 0, s.accent.getStyle(), 0.8, 7);
});

registerModel('turret_rail', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.75, 1.3);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.94, 0.5, 1.04, 0, 0.25, -0.2, s.machine, 0.08, { shade: 0.02 });
    for (const sx of [-0.14, 0.14]) pb.box(0.1, 0.22, 2.6, sx, 0.55, 0.9, GUN_LIGHT);
    pb.box(0.14, 0.08, 2.4, 0, 0.55, 0.9, s.accent, { slot: SLOT_GLOW });
    pb.bevelBox(0.54, 0.34, 0.44, 0, 0.62, -0.55, s.machineDark, 0.06);
    for (let i = 0; i < 3; i++) pb.cyl(0.27, 0.27, 0.08, 0, 0.55, 0.3 + i * 0.7, i === 1 ? s.stripe : s.metal, 8, { rx: Math.PI / 2 });
    // capacitor bank + cable
    for (const sx of [-0.3, 0.3]) pb.cyl(0.1, 0.1, 0.5, sx, 0.62, -0.55, s.trim, 6);
    pb.pipe([0.3, 0.9, -0.55, 0.3, 1.0, -0.3, 0.14, 0.7, 0.0], 0.03, s.metal, 4, false);
    pb.box(0.12, 0.12, 0.12, 0, 0.88, -0.55, s.accent, { slot: SLOT_GLOW, ry: Math.PI / 4 });
    lamp(pb, -0.4, 0.56, -0.6);
  });
  c.muzzle(0, 0.55, 2.2);
});

registerModel('turret_cannon', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.9, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(1.44, 0.8, 1.44, 0, 0.45, -0.2, s.machine, 0.1, { shade: 0.02 });
    pb.box(1.54, 0.3, 0.4, 0, 0.5, 0.6, s.machineDark);
    pb.stripes(1.5, 0.1, 0.1, 0, 0.7, 0.62, 4, s.stripe, WARN_DARK, 'x');
    pb.cyl(0.26, 0.3, 2.2, 0, 0.55, 1.1, GUN, 8, { rx: Math.PI / 2 });
    pb.cyl(0.34, 0.34, 0.4, 0, 0.55, 2.1, GUN_LIGHT, 8, { rx: Math.PI / 2 });
    pb.cyl(0.3, 0.3, 0.08, 0, 0.55, 1.4, s.stripe, 8, { rx: Math.PI / 2 }); // barrel band
    pb.box(1.0, 0.08, 1.0, 0, 0.9, -0.3, s.accent, { slot: SLOT_GLOW });
    pb.box(0.3, 0.3, 0.3, 0.55, 0.95, -0.5, s.machineDark); // sight block
    lamp(pb, 0.55, 1.16, -0.5);
  });
  c.muzzle(0, 0.55, 2.35);
});

registerModel('turret_aa', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.7, 1.0);
  c.part('spinY', 0.7, 0.6, -0.6, (pb) => {
    pb.cyl(0.35, 0.1, 0.2, 0, 0.3, 0, '#dfe6ee', 8, { rx: -0.9 });
    pb.cyl(0.04, 0.04, 0.5, 0, 0.15, 0, s.metal, 4);
  }, 2);
  c.part('turret', 0, y, 0, (pb) => {
    pb.bevelBox(0.84, 0.5, 0.84, 0, 0.25, -0.1, s.machine, 0.08, { shade: 0.02 });
    pb.box(0.5, 0.3, 0.5, 0, 0.62, -0.1, s.machineDark);
    for (const sx of [-0.22, -0.08, 0.08, 0.22]) pb.cyl(0.05, 0.05, 1.3, sx, 0.75, 0.45, GUN, 6, { rx: Math.PI / 2 - 0.6 });
    pb.box(0.66, 0.2, 0.2, 0, 0.62, 0.22, GUN_LIGHT, { rx: -0.6 }); // barrel clamp
    pb.stripes(0.7, 0.06, 0.1, 0, 0.5, 0.33, 6, s.stripe, WARN_DARK, 'x');
    for (const sx of [-0.5, 0.5]) pb.cyl(0.16, 0.16, 0.3, sx, 0.5, -0.3, AMMO, 6, { rz: Math.PI / 2 }); // ammo drums
    lamp(pb, 0, 0.85, -0.35, '#ff4d5e');
  });
  c.muzzle(0, 1.1, 0.9);
});

registerModel('electric_fence', (c) => {
  const { b, s } = c;
  for (const x of [-0.85, 0.85]) {
    b.box(0.18, 1.5, 0.18, x, 0.75, 0, s.metal);
    b.box(0.2, 0.06, 0.2, x, 1.52, 0, s.stripe);
    for (const y of [0.5, 0.9, 1.3]) b.box(0.1, 0.1, 0.1, x, y, 0.12, '#dfe6ee', { ry: Math.PI / 4 });
  }
  for (const y of [0.5, 0.9, 1.3]) b.box(1.7, 0.04, 0.04, 0, y, 0.12, s.accent, { slot: SLOT_GLOW });
  // transformer box with a hazard stripe and a warning lamp
  b.box(0.4, 0.3, 0.2, -0.85, 1.72, 0, s.machine);
  b.stripes(0.36, 0.08, 0.02, -0.85, 1.62, 0.11, 4, s.stripe, WARN_DARK, 'x');
  b.box(0.1, 0.1, 0.1, -0.85, 1.9, 0.0, '#ffd84a', { slot: SLOT_GLOW, ry: Math.PI / 4 });
  c.emit('sparks', 0, 1.0, 0.1, 0.4, s.accent.getStyle());
});

registerModel('drone_pad', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.42;
  b.cyl(r, r + 0.1, 0.25, 0, 0.12, 0, s.machineDark, 12);
  b.cyl(r * 0.78, r * 0.78, 0.05, 0, 0.26, 0, s.accent, 12, { slot: SLOT_GLOW });
  b.cyl(r * 0.6, r * 0.6, 0.06, 0, 0.27, 0, s.machine, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(0.14, 0.1, 0.14, Math.sin(a) * r * 0.9, 0.3, Math.cos(a) * r * 0.9, i % 2 ? s.stripe : s.lamp, { slot: i % 2 ? 0 : SLOT_GLOW, ry: a });
  }
  // control post with a screen and antenna
  b.box(0.3, 0.6, 0.3, r * 0.9, 0.3, r * 0.9, s.trim);
  b.box(0.3, 0.2, 0.3, r * 0.9, 0.7, r * 0.9, s.accent, { slot: SLOT_GLOW });
  b.cyl(0.03, 0.03, 0.6, r * 0.9, 1.1, r * 0.9, s.metal, 4);
  b.box(0.08, 0.08, 0.08, r * 0.9, 1.42, r * 0.9, '#ff4d5e', { slot: SLOT_GLOW, ry: Math.PI / 4 });
  c.part('bobSpin', 0, 1.6, 0, (pb) => {
    pb.bevelBox(0.44, 0.2, 0.44, 0, 0, 0, s.machine, 0.05);
    pb.box(0.2, 0.06, 0.2, 0, 0.12, 0, s.stripe);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pb.box(0.36, 0.04, 0.04, sx * 0.26, 0.05, sz * 0.26, s.metal, { ry: Math.PI / 4 });
      pb.cyl(0.22, 0.22, 0.03, sx * 0.36, 0.1, sz * 0.36, s.accent, 8, { slot: SLOT_GLOW });
    }
    pb.cyl(0.05, 0.05, 0.5, 0, -0.1, 0.1, GUN, 5, { rx: Math.PI / 2 });
    pb.box(0.1, 0.1, 0.1, 0, -0.08, -0.2, '#ff4d5e', { slot: SLOT_GLOW, ry: Math.PI / 4 });
  }, 0.8, 0.2);
});

/** Exported for the showcase: turret model keys in power order. */
export const TURRET_KEYS = ['turret_basic', 'turret_mg', 'turret_flame', 'turret_missile', 'turret_heavy', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon', 'turret_aa'];

void THREE;
