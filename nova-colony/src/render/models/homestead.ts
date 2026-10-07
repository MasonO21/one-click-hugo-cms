/**
 * Procedural models for storage, housing, food and water buildings.
 * Each builder styles itself with the tier palette and adds animated parts / emitters so machines visibly operate.
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER, SOIL, WHITE, FIRE_GLOW } from './colors';

// ------------------------------------------------------------------------------------ storage

registerModel('crate', (c) => {
  const { b, s, level } = c;
  const col = s.index >= 3 ? s.machine : s.base;
  const edge = s.index >= 3 ? s.machineDark : s.trim;
  b.box(1.3, 1.0, 1.3, 0, 0.5, 0, col, { shade: 0.04 });
  b.box(1.34, 0.12, 0.14, 0, 0.5, 0.6, edge);
  b.box(0.14, 0.12, 1.34, 0.6, 0.5, 0, edge);
  b.box(1.34, 0.12, 0.14, 0, 0.5, -0.6, edge);
  b.box(0.14, 0.12, 1.34, -0.6, 0.5, 0, edge);
  if (level >= 2) b.box(0.9, 0.7, 0.9, 0.1, 1.35, -0.05, col, { ry: 0.3, shade: 0.04 });
  if (level >= 3) b.box(0.6, 0.5, 0.6, -0.25, 1.95, 0.1, col, { ry: -0.4, shade: 0.04 });
  if (level >= 4) b.box(0.5, 0.45, 0.5, 0.35, 2.35, -0.2, col, { ry: 0.6, shade: 0.04 });
  if (level >= 5) b.sphere(0.14, 0, 2.8, 0, s.accent, 5, { slot: SLOT_GLOW });
  if (s.index >= 3) b.box(1.36, 0.16, 1.36, 0, 0.85, 0, s.accent, { slot: SLOT_GLOW });
});

registerModel('warehouse', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.6, 2.8, 0, 0, { roof: s.index <= 2 ? 'gable' : 'flat', windows: false, door: false });
  // big door
  b.box(Math.min(2.2, w * 0.4), 2.1, 0.12, 0, 1.05, d / 2 - 0.26, s.dark);
  b.box(0.08, 2.1, 0.16, 0, 1.05, d / 2 - 0.25, s.accent, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
  // crates outside
  b.box(0.7, 0.7, 0.7, -w / 2 + 0.6, 0.35, d / 2 - 0.5, s.index >= 3 ? s.machine : s.trim, { ry: 0.2, shade: 0.05 });
  b.box(0.5, 0.5, 0.5, -w / 2 + 0.65, 0.95, d / 2 - 0.45, s.index >= 3 ? s.machine : s.trim, { ry: -0.3, shade: 0.05 });
  c.levelPips();
});

registerModel('silo', (c) => {
  const { b, s, w, level } = c;
  const r = Math.min(w, c.d) * 0.36;
  const h = 3.2 + level * 0.3;
  c.foundation(0.3);
  c.tank(r, h, 0, 0.2, 0, s.index <= 1 ? s.base : s.machine, s.trim, 12);
  b.cone(r * 1.08, 1.0, 0, h + 0.7, 0, s.roof, 12);
  b.cyl(0.05, 0.05, h, r + 0.12, h / 2 + 0.2, 0, s.metal, 4);
  for (let i = 0; i < 5; i++) b.box(0.3, 0.04, 0.04, r + 0.12, 0.5 + i * (h / 5), 0, s.metal);
  if (s.index >= 3) b.box(0.3, 0.6, 0.06, 0, h * 0.5, r + 0.02, s.accent, { slot: SLOT_GLOW });
});

registerModel('tank', (c) => {
  const { b, s, w } = c;
  const r = Math.min(w, c.d) * 0.34;
  const h = 1.6 + c.lv * 0.8;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.16, 1.0, 0.16, sx * r * 0.7, 0.5, sz * r * 0.7, s.trim);
  c.tank(r, h, 0, 1.0, 0, new THREE.Color(s.index >= 3 ? '#8aa7bd' : '#7fa9c9'), new THREE.Color(WATER), 12);
  b.cyl(0.1, 0.1, 1.1, r * 0.8, 0.55, 0, new THREE.Color(WATER), 6);
  b.sphere(r * 0.3, 0, h + 1.15, 0, new THREE.Color(WATER), 6);
  b.cyl(0.06, 0.06, 0.6, 0, h + 1.3, 0, s.metal, 5);
});

registerModel('quantum_storage', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  b.box(w - 0.8, 1.2, d - 0.8, 0, 0.6, 0, s.machineDark);
  b.box(w - 1.1, 0.12, d - 1.1, 0, 1.26, 0, s.accent, { slot: SLOT_GLOW });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.22, 2.6, 0.22, sx * (w / 2 - 0.55), 1.3, sz * (d / 2 - 0.55), s.trim);
    b.sphere(0.12, sx * (w / 2 - 0.55), 2.7, sz * (d / 2 - 0.55), s.accent, 5, { slot: SLOT_GLOW });
  }
  c.part('bobSpin', 0, 2.3, 0, (pb) => {
    pb.box(0.9, 0.9, 0.9, 0, 0, 0, s.machine);
    pb.box(1.0, 0.1, 1.0, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.box(0.1, 1.0, 0.1, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.sphere(0.35, 0, 0, 0, '#ffffff', 6, { slot: SLOT_GLOW });
  }, 0.8, 0.25);
  c.emit('motes', 0, 2.3, 0, 3, s.accent.getStyle());
  c.levelPips();
});

registerModel('food_storage', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.7, d - 0.7, 2.2, 0, -0.1, { roof: 'shed', windows: false });
  b.box(0.5, 0.5, 0.5, w / 2 - 0.5, 0.25, d / 2 - 0.5, WOOD, { ry: 0.2 });
  b.sphere(0.22, -w / 2 + 0.55, 0.25, d / 2 - 0.5, '#ef6b5b', 5);
  b.sphere(0.2, -w / 2 + 0.85, 0.22, d / 2 - 0.65, '#f0b24b', 5);
  // vents
  for (let i = 0; i < 3; i++) b.box(0.1, 0.5, 0.5, w / 2 - 0.3, 1.2 + i * 0.0, -0.6 + i * 0.6, s.trim);
  c.levelPips();
});

// ------------------------------------------------------------------------------------ housing

registerModel('bed', (c) => {
  const { b, s } = c;
  b.box(1.1, 0.3, 1.9, 0, 0.3, 0, s.trim);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.45, 0.12, sx * 0.49, 0.22, sz * 0.89, s.trim);
  b.box(1.0, 0.22, 1.7, 0, 0.56, 0, WHITE);
  b.box(1.0, 0.16, 1.1, 0, 0.72, 0.25, s.index >= 4 ? '#5ec8ff' : '#e86f4d');
  b.box(0.7, 0.16, 0.4, 0, 0.72, -0.6, '#fff5e6');
  b.box(1.1, 0.7, 0.12, 0, 0.6, -0.95, s.trim);
});

registerModel('bunkhouse', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  if (s.index === 0) {
    // lean-to shelter: open front, shed roof, bedrolls visible
    b.box(w - 0.6, 1.9, 0.18, 0, 0.95, -d / 2 + 0.3, s.base, { shade: 0.05 });
    b.box(0.18, 1.9, d - 0.8, -w / 2 + 0.3, 0.95, 0, s.base, { shade: 0.05 });
    for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) b.cyl(0.1, 0.12, 1.5, x, 0.75, d / 2 - 0.35, s.trim, 6);
    b.box(w + 0.3, 0.14, d + 0.4, 0, 1.95, 0.1, s.roof, { rx: 0.28, shade: 0.05 });
    b.box(0.8, 0.22, 1.6, -0.45, 0.22, 0.1, '#e86f4d');
    b.box(0.8, 0.22, 1.6, 0.45, 0.22, 0.1, '#4fa3e0');
    b.box(0.5, 0.14, 0.4, -0.45, 0.4, -0.5, '#fff5e6');
    b.box(0.5, 0.14, 0.4, 0.45, 0.4, -0.5, '#fff5e6');
  } else {
    c.hut(w - 0.6, d - 0.6, 2.4 + c.lv * 0.6, 0, 0, { roof: s.index >= 5 ? 'flat' : 'gable', windows: true, door: true });
    if (s.index <= 2) c.chimney(w / 2 - 0.7, 2.4 + c.lv * 0.6 + 0.3, -d / 2 + 0.7, 0.9, 0.16, 1.2);
    else c.antenna(w / 2 - 0.6, 2.4 + c.lv * 0.6 + 0.2, -d / 2 + 0.6, 0.8, s.accent.getStyle());
  }
  c.levelPips();
});

registerModel('habitat', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  const r = Math.min(w, d) * 0.42;
  b.sphere(r, 0, 0.9, 0, s.base, 10, { sy: 0.78 });
  b.cyl(r * 0.98, r * 1.02, 0.9, 0, 0.45, 0, s.trim, 10);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.box(0.6, 0.5, 0.1, Math.cos(a) * r * 0.9, 1.4, Math.sin(a) * r * 0.9, '#ffffff', { ry: -a + Math.PI / 2, slot: SLOT_GLASS });
  }
  b.box(0.9, 1.5, 0.3, 0, 0.75, r * 0.92, s.dark);
  b.torus(r * 0.55, 0.06, 0, 0.9 + r * 0.72, 0, s.accent, 12, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.antenna(0, 0.9 + r * 0.78, 0, 1.0, s.accent.getStyle());
  c.levelPips();
});

registerModel('skyscraper', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const floors = 4 + c.level;
  const fh = 1.6;
  const bw = w - 0.8;
  const bd = d - 0.8;
  for (let i = 0; i < floors; i++) {
    const shrink = i >= floors - 2 ? 0.75 : 1;
    b.box(bw * shrink, fh - 0.18, bd * shrink, 0, i * fh + fh / 2, 0, i % 2 ? s.base : s.light, { shade: 0.015 });
    // glass band
    b.box(bw * shrink + 0.06, 0.55, bd * shrink + 0.06, 0, i * fh + fh / 2 + 0.1, 0, '#ffffff', { slot: SLOT_GLASS });
    b.box(bw * shrink + 0.1, 0.08, bd * shrink + 0.1, 0, i * fh + fh - 0.1, 0, s.index >= 3 ? s.accent : s.trim, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
  }
  const top = floors * fh;
  b.box(bw * 0.4, 0.5, bd * 0.4, 0, top + 0.2, 0, s.trim);
  c.antenna(0, top + 0.4, 0, 2.2, s.index >= 4 ? s.accent.getStyle() : '#ff4d5e');
  c.setLight(0, top * 0.5, 0, '#ffd27a', 0.8, 8);
});

// ------------------------------------------------------------------------------------ food & water

registerModel('campfire', (c) => {
  const { b } = c;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.sphere(0.18, Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62, i % 2 ? '#8e8a82' : '#a5a098', 5, { shade: 0.06 });
  }
  b.cyl(0.1, 0.11, 1.0, 0, 0.18, 0, WOOD_DARK, 5, { rz: Math.PI / 2, ry: 0.4 });
  b.cyl(0.1, 0.11, 1.0, 0, 0.18, 0, WOOD_DARK, 5, { rz: Math.PI / 2, ry: 1.7 });
  b.cyl(0.1, 0.11, 1.0, 0, 0.3, 0, WOOD, 5, { rz: Math.PI / 2, ry: 2.9 });
  c.part('sway', 0, 0.45, 0, (pb) => {
    pb.cone(0.3, 0.8, 0, 0.4, 0, FIRE_GLOW, 6, { slot: SLOT_GLOW });
    pb.cone(0.18, 0.55, 0.05, 0.5, 0.03, '#ffd36b', 5, { slot: SLOT_GLOW });
  }, 6, 0.08);
  c.emit('fire', 0, 0.5, 0, 9);
  c.emit('smoke', 0, 1.1, 0, 1.2);
  c.setLight(0, 1.0, 0, '#ff9a3c', 1.6, 9);
});

registerModel('farm_plot', (c) => {
  const { b, w, d, level } = c;
  b.box(w - 0.3, 0.26, d - 0.3, 0, 0.1, 0, SOIL, { shade: 0.05 });
  const rows = 3;
  const cols = Math.max(2, Math.round(w / 1.0));
  const ph = 0.35 + level * 0.09;
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + 0.55 + (r * (d - 1.1)) / (rows - 1);
    b.box(w - 0.6, 0.1, 0.42, 0, 0.26, z, '#4a3321');
  }
  c.part('sway', 0, 0.3, 0, (pb) => {
    for (let r = 0; r < rows; r++) {
      const z = -d / 2 + 0.55 + (r * (d - 1.1)) / (rows - 1);
      for (let i = 0; i < cols; i++) {
        const x = -w / 2 + 0.5 + (i * (w - 1.0)) / Math.max(1, cols - 1);
        pb.cyl(0.03, 0.05, ph, x, ph / 2, z, '#5d8f3c', 4);
        pb.sphere(0.2 + level * 0.02, x, ph + 0.05, z, (i + r) % 2 ? LEAF : LEAF2, 5, { sy: 0.8 });
        if (level >= 2 && (i + r) % 3 === 0) pb.sphere(0.07, x + 0.08, ph + 0.12, z + 0.1, '#ef6b5b', 4);
      }
    }
  }, 1.2, 0.05);
  // little fence at the back
  for (let i = 0; i < 3; i++) b.cyl(0.05, 0.06, 0.5, -w / 2 + 0.4 + i * ((w - 0.8) / 2), 0.4, -d / 2 + 0.1, WOOD, 4);
  b.box(w - 0.7, 0.06, 0.06, 0, 0.55, -d / 2 + 0.1, WOOD);
});

registerModel('greenhouse', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  const h = 1.6;
  b.box(w - 0.5, 0.5, d - 0.5, 0, 0.25, 0, s.trim, { shade: 0.03 });
  b.box(w - 0.6, h, d - 0.6, 0, 0.5 + h / 2, 0, '#ffffff', { slot: SLOT_GLASS });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, h + 0.1, 0.12, sx * (w / 2 - 0.3), 0.5 + h / 2, sz * (d / 2 - 0.3), s.metal);
  b.wedge(w - 0.3, 0.8, d - 0.3, 0, 0.5 + h, 0, '#ffffff', { slot: SLOT_GLASS });
  b.box(0.1, 0.1, d - 0.2, 0, 0.5 + h + 0.8, 0, s.metal);
  // plants inside (visible through glass as colored blobs)
  for (let i = 0; i < 4; i++) c.plant(-w / 2 + 0.7 + i * ((w - 1.4) / 3), (i % 2 ? 0.4 : -0.4), 0.9, i % 2 ? LEAF : LEAF2, i % 3 === 0 ? '#ef6b5b' : undefined);
  c.levelPips();
});

registerModel('hydroponics', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  const racks = 2;
  for (let r = 0; r < racks; r++) {
    const z = -d / 4 + (r * d) / 2;
    for (const y of [0.6, 1.4]) {
      b.box(w - 0.7, 0.12, 0.7, 0, y, z, s.machine);
      b.box(w - 0.8, 0.04, 0.5, 0, y + 0.08, z, '#48c8ff', { slot: SLOT_GLOW });
      for (let i = 0; i < 4; i++) b.sphere(0.17, -w / 2 + 0.6 + i * ((w - 1.2) / 3), y + 0.28, z, i % 2 ? '#7dff7a' : '#b7ff6a', 5, { sy: 0.8 });
    }
    for (const sx of [-1, 1]) b.box(0.1, 2.0, 0.1, sx * (w / 2 - 0.4), 1.0, z, s.trim);
    b.box(w - 0.7, 0.06, 0.4, 0, 2.0, z, s.accent, { slot: SLOT_GLOW });
  }
  c.emit('drips', 0, 1.3, 0, 1.5, '#9fdcff');
  c.levelPips();
});

registerModel('kitchen', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.8, 2.3, 0, -0.1, { roof: 'gable', windows: true, door: true });
  c.chimney(w / 2 - 0.7, 2.5, -d / 2 + 0.7, 1.1, 0.18, 2);
  // counter outside with pot
  b.box(1.2, 0.8, 0.5, -w / 2 + 0.9, 0.4, d / 2 - 0.3, s.trim);
  b.cyl(0.26, 0.22, 0.32, -w / 2 + 0.9, 0.96, d / 2 - 0.3, s.metal, 8);
  c.emit('steam', -w / 2 + 0.9, 1.15, d / 2 - 0.3, 1.5);
  c.levelPips();
});

registerModel('rain_collector', (c) => {
  const { b, s } = c;
  b.cyl(0.5, 0.45, 1.0, 0, 0.5, 0, s.index <= 1 ? WOOD : s.machine, 9, { shade: 0.03 });
  b.cyl(0.52, 0.52, 0.08, 0, 0.3, 0, s.metal, 9);
  b.cyl(0.52, 0.52, 0.08, 0, 0.8, 0, s.metal, 9);
  b.cyl(0.9 + c.lv * 0.3, 0.12, 0.7, 0, 1.45, 0, '#7fb6d9', 9);
  b.cyl(0.08, 0.08, 0.4, 0, 1.0, 0, s.metal, 5);
  b.box(0.3, 0.1, 0.3, 0.5, 0.55, 0, '#7fb6d9');
  b.cyl(0.06, 0.06, 0.3, 0.6, 0.4, 0, WATER, 5);
});

registerModel('water_pump', (c) => {
  const { b, s } = c;
  b.cyl(0.45, 0.5, 0.8, 0, 0.4, 0, s.machine, 9);
  b.box(0.3, 0.6, 0.3, 0, 1.1, 0, s.trim);
  c.part('rock', 0, 1.4, 0, (pb) => {
    pb.box(1.4, 0.14, 0.14, 0, 0, 0, s.metal);
    pb.box(0.12, 0.5, 0.12, 0.65, -0.3, 0, s.metal);
    pb.sphere(0.1, -0.7, 0, 0, s.accent, 5);
  }, 1.6, 0.25);
  b.cyl(0.1, 0.1, 0.8, -0.6, 0.4, 0.3, WATER, 6);
  b.cyl(0.1, 0.1, 0.5, -0.6, 0.05, 0.55, WATER, 6, { rx: Math.PI / 2 });
  c.emit('drips', -0.6, 0.9, 0.3, 1.2, '#9fdcff');
});

registerModel('purifier', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  c.machine(w - 0.8, 1.2, d - 0.8, 0, 0.2, 0, 3);
  c.tank(0.5, 1.2, -w / 4, 1.4, 0, new THREE.Color('#ffffff'), new THREE.Color(WATER), 10);
  b.cyl(0.42, 0.42, 1.0, -w / 4, 2.0, 0, '#ffffff', 10, { slot: SLOT_GLASS });
  b.cyl(0.12, 0.12, 1.0, 0, 1.9, 0, WATER, 6, { rz: Math.PI / 2 });
  b.box(0.6, 0.6, 0.6, w / 4, 1.7, 0, s.machine);
  b.sphere(0.1, w / 4, 2.1, 0.3, '#7cff6a', 5, { slot: SLOT_GLOW });
  c.emit('drips', -w / 4, 2.6, 0, 2, '#9fdcff');
  c.levelPips();
});

registerModel('industrial_purifier', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  c.machine(w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, 4);
  c.tank(0.75, 2.2, -w / 4, 1.2, 0, new THREE.Color('#dfe8ef'), new THREE.Color(WATER), 12);
  c.tank(0.75, 2.2, w / 4, 1.2, 0, new THREE.Color('#dfe8ef'), new THREE.Color(WATER), 12);
  b.cyl(0.14, 0.14, w / 2, 0, 2.6, 0, WATER, 6, { rz: Math.PI / 2 });
  b.cyl(0.14, 0.14, 1.6, 0, 1.4, d / 2 - 0.6, s.metal, 6, { rz: Math.PI / 2 });
  c.chimney(0, 1.2, -d / 2 + 0.6, 1.6, 0.14, 0);
  c.emit('steam', 0, 3.0, -d / 2 + 0.6, 3);
  c.levelPips();
});

registerModel('atmo_generator', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  c.machine(w - 0.9, 1.4, d - 0.9, 0, 0.2, 0, 3);
  b.cyl(0.9, 1.1, 2.6, 0, 2.9, 0, s.machine, 12);
  b.torus(0.95, 0.08, 0, 4.2, 0, s.accent, 14, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.part('spinY', 0, 4.25, 0, (pb) => {
    for (let i = 0; i < 4; i++) pb.box(1.5, 0.06, 0.3, 0, 0, 0, s.light, { ry: (i * Math.PI) / 4 });
    pb.sphere(0.2, 0, 0, 0, s.metal, 6);
  }, 5);
  c.emit('steam', 0, 4.4, 0, 2);
  c.levelPips();
});
