/**
 * Procedural models for power, production, crafting, research, utility and decor buildings.
 * Each builder styles itself with the tier palette and adds animated parts / emitters so machines visibly operate.
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER, SOIL, WHITE, FIRE_GLOW } from './colors';

// ------------------------------------------------------------------------------------ power

registerModel('fuel_generator', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  c.machine(w - 0.7, 1.3, d - 0.9, 0, 0.2, 0, 2);
  c.chimney(w / 2 - 0.5, 1.5, -d / 2 + 0.5, 1.2, 0.16, 3);
  c.part('spinX', -w / 2 + 0.25, 1.0, 0, (pb) => {
    pb.cyl(0.45, 0.45, 0.2, 0, 0, 0, s.metal, 10, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) pb.box(0.06, 0.8, 0.26, 0, 0, 0, s.accent, { rx: (i * Math.PI) / 4, slot: SLOT_GLOW });
  }, 8);
  b.box(0.5, 0.5, 0.5, w / 2 - 0.5, 1.75, 0.2, '#c43b2a');
  c.levelPips();
});

registerModel('solar_panel', (c) => {
  const { b, s, w, d } = c;
  b.cyl(0.12, 0.14, 0.9, 0, 0.45, 0, s.metal, 6);
  b.box(w - 0.3, 0.1, d - 0.4, 0, 1.15, 0, s.metal, { rx: -0.5 });
  b.box(w - 0.45, 0.04, d - 0.6, 0, 1.22, 0, '#1f3f7a', { rx: -0.5 });
  const cells = 3;
  for (let i = 0; i < cells; i++) b.box(0.05, 0.03, d - 0.65, -(w - 0.45) / 2 + ((i + 0.5) * (w - 0.45)) / cells, 1.25, 0, '#9fd0ff', { rx: -0.5 });
  b.box(w - 0.5, 0.03, 0.05, 0, 1.25, 0, '#9fd0ff', { rx: -0.5 });
  b.sphere(0.06, 0.3, 0.9, 0.3, '#7cff6a', 4, { slot: SLOT_GLOW });
});

registerModel('wind_turbine', (c) => {
  const { b, s, w } = c;
  const h = 6 + c.lv * 2;
  b.cyl(0.5, 0.7, 0.4, 0, 0.2, 0, s.trim, 8);
  b.cyl(0.14, 0.26, h, 0, h / 2 + 0.2, 0, WHITE, 8);
  b.box(0.6, 0.5, 1.0, 0, h + 0.3, -0.1, WHITE);
  b.sphere(0.2, 0, h + 0.3, 0.45, s.accent, 6, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
  c.part('spinZ', 0, h + 0.3, 0.55, (pb) => {
    for (let i = 0; i < 3; i++) {
      pb.box(0.26, 2.6 + c.lv * 0.6, 0.06, 0, 1.3 + c.lv * 0.3, 0, WHITE, { rz: (i * Math.PI * 2) / 3 });
    }
    pb.cyl(0.22, 0.22, 0.2, 0, 0, 0, s.metal, 8, { rx: Math.PI / 2 });
  }, 2.2);
  void w;
});

registerModel('geothermal', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1, 0.3, new THREE.Color('#5a4a40'));
  b.cyl(1.0, 1.4, 1.2, 0, 0.6, 0, '#6e5a4a', 10, { shade: 0.05 });
  b.cyl(0.8, 0.8, 0.4, 0, 1.4, 0, s.machine, 10);
  b.sphere(0.5, 0, 1.55, 0, '#ff7a2e', 8, { slot: SLOT_GLOW });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.cyl(0.14, 0.14, 1.6, Math.cos(a) * 1.0, 1.1, Math.sin(a) * 1.0, s.metal, 6, { rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 });
    c.emit('steam', Math.cos(a) * 1.3, 1.9, Math.sin(a) * 1.3, 1.2);
  }
  c.machine(1.2, 1.0, 1.0, w / 2 - 0.8, 0, -d / 2 + 0.7, 2);
  c.setLight(0, 2.0, 0, '#ff8a3c', 1.0, 8);
  c.levelPips();
});

registerModel('fusion_reactor', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  const r = Math.min(w, d) * 0.33;
  b.cyl(r + 0.5, r + 0.7, 0.8, 0, 0.4, 0, s.machineDark, 12);
  b.torus(r, 0.45, 0, 1.9, 0, s.machine, 20, 8, { rx: Math.PI / 2 });
  b.torus(r, 0.12, 0, 1.9, 0, s.accent, 20, 6, { rx: Math.PI / 2, slot: SLOT_GLOW });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(0.5, 2.8, 0.5, Math.cos(a) * (r + 0.6), 1.4, Math.sin(a) * (r + 0.6), s.trim);
    b.box(0.1, 2.4, 0.56, Math.cos(a) * (r + 0.6), 1.5, Math.sin(a) * (r + 0.6), s.accent, { slot: SLOT_GLOW });
  }
  c.part('bobSpin', 0, 1.9, 0, (pb) => {
    pb.sphere(0.65, 0, 0, 0, '#ffffff', 8, { slot: SLOT_GLOW });
    pb.torus(1.0, 0.07, 0, 0, 0, s.accent, 16, 5, { rx: 0.6, slot: SLOT_GLOW });
    pb.torus(1.0, 0.07, 0, 0, 0, s.accent, 16, 5, { rz: 1.2, slot: SLOT_GLOW });
  }, 1.5, 0.12);
  c.emit('motes', 0, 2.2, 0, 6, s.accent.getStyle());
  c.setLight(0, 2.5, 0, s.accent.getStyle(), 1.6, 12);
  c.levelPips();
});

registerModel('battery', (c) => {
  const { b, s, w, d } = c;
  const cells = Math.max(2, Math.round(w / 0.8));
  b.box(w - 0.3, 0.2, d - 0.3, 0, 0.1, 0, s.trim);
  for (let i = 0; i < cells; i++) {
    const x = -w / 2 + 0.4 + (i * (w - 0.8)) / Math.max(1, cells - 1);
    b.box(0.5, 1.2, Math.min(1.2, d - 0.5), x, 0.8, 0, s.machine);
    b.box(0.08, 1.0, 0.06, x, 0.8, Math.min(1.2, d - 0.5) / 2 + 0.02, '#7cff6a', { slot: SLOT_GLOW });
    b.box(0.2, 0.15, 0.2, x, 1.47, 0, s.metal);
  }
  b.box(w - 0.9, 0.06, 0.06, 0, 1.5, 0, s.accent, { slot: SLOT_GLOW });
});

registerModel('power_pylon', (c) => {
  const { b, s } = c;
  const h = 4.2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, h, 0.1, sx * 0.4, h / 2, sz * 0.4, s.metal, { rx: -sz * 0.08, rz: sx * 0.08 });
  for (const y of [1.2, 2.6]) {
    b.box(0.9, 0.06, 0.06, 0, y, 0.38, s.metal);
    b.box(0.9, 0.06, 0.06, 0, y, -0.38, s.metal);
    b.box(0.06, 0.06, 0.9, 0.38, y, 0, s.metal);
    b.box(0.06, 0.06, 0.9, -0.38, y, 0, s.metal);
  }
  b.box(1.8, 0.1, 0.1, 0, h, 0, s.metal);
  for (const x of [-0.8, 0.8]) {
    b.cyl(0.06, 0.08, 0.3, x, h - 0.2, 0, '#d9dde3', 5);
    b.sphere(0.08, x, h - 0.4, 0, s.accent, 5, { slot: SLOT_GLOW });
  }
  b.sphere(0.1, 0, h + 0.1, 0, '#ff4d5e', 5, { slot: SLOT_GLOW });
});

// ------------------------------------------------------------------------------------ production

registerModel('logging_camp', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.3, 0.1, new THREE.Color('#7a6a4a'));
  // log pile
  for (let i = 0; i < 3; i++) b.cyl(0.2, 0.2, 1.6, -w / 2 + 0.7, 0.2, -d / 2 + 0.5 + i * 0.42, i % 2 ? WOOD : WOOD_DARK, 6, { rz: Math.PI / 2 });
  for (let i = 0; i < 2; i++) b.cyl(0.2, 0.2, 1.6, -w / 2 + 0.7, 0.55, -d / 2 + 0.7 + i * 0.42, WOOD, 6, { rz: Math.PI / 2 });
  b.cyl(0.2, 0.2, 1.6, -w / 2 + 0.7, 0.9, -d / 2 + 0.9, WOOD_DARK, 6, { rz: Math.PI / 2 });
  // awning
  for (const x of [w / 2 - 1.4, w / 2 - 0.3]) for (const z of [-d / 2 + 0.3, d / 2 - 0.3]) b.cyl(0.07, 0.08, 2.0, x, 1.0, z, s.trim, 5);
  b.box(1.6, 0.1, d - 0.2, w / 2 - 0.85, 2.05, 0, s.roof, { rz: 0.12, shade: 0.04 });
  // saw bench + chopping block with axe
  b.box(1.2, 0.12, 0.6, w / 2 - 0.85, 0.75, 0, s.trim);
  b.cyl(0.3, 0.32, 0.5, 0, 0.25, d / 2 - 0.6, WOOD_DARK, 7);
  b.box(0.06, 0.7, 0.06, 0.1, 0.75, d / 2 - 0.6, WOOD, { rz: 0.5 });
  b.box(0.3, 0.2, 0.06, -0.15, 1.05, d / 2 - 0.6, '#aeb9c7', { rz: 0.5 });
  c.levelPips();
});

registerModel('quarry', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.3, d - 0.2, 0, -0.1, 0, '#7f7a72', { shade: 0.05 });
  b.box(w - 1.0, 0.25, d - 1.0, 0, 0.0, 0, '#5b5650', { shade: 0.05 });
  for (let i = 0; i < 5; i++) b.sphere(0.25 + (i % 2) * 0.1, -w / 2 + 0.5 + i * 0.4, 0.25, d / 2 - 0.5 - (i % 2) * 0.4, i % 2 ? '#a6a39b' : '#8e8a82', 5, { shade: 0.07 });
  // crane
  b.box(0.3, 2.2, 0.3, w / 2 - 0.6, 1.1, -d / 2 + 0.6, s.trim);
  c.part('rock', w / 2 - 0.6, 2.2, -d / 2 + 0.6, (pb) => {
    pb.box(0.16, 0.16, 2.2, 0, 0, -1.0, s.metal);
    pb.box(0.06, 0.9, 0.06, 0, -0.45, -2.0, s.metal);
    pb.sphere(0.18, 0, -0.95, -2.0, '#8e8a82', 5);
  }, 0.5, 0.2);
  // rails
  b.box(w - 0.6, 0.06, 0.08, 0, 0.14, 0.3, s.metal);
  b.box(w - 0.6, 0.06, 0.08, 0, 0.14, 0.7, s.metal);
  c.emit('dust', 0, 0.3, 0, 0.6, '#b8aa90');
  c.levelPips();
});

registerModel('mine', (c) => {
  const { b, s, w, d } = c;
  b.sphere(Math.min(w, d) * 0.55, 0, 0.1, -0.3, '#6e6258', 8, { sy: 0.7, shade: 0.06 });
  // entrance frame
  b.box(0.3, 1.6, 0.3, -0.7, 0.8, d / 2 - 0.5, s.trim);
  b.box(0.3, 1.6, 0.3, 0.7, 0.8, d / 2 - 0.5, s.trim);
  b.box(1.8, 0.3, 0.3, 0, 1.7, d / 2 - 0.5, s.trim);
  b.box(1.2, 1.5, 0.2, 0, 0.75, d / 2 - 0.6, '#1a1612');
  // rails + cart
  b.box(0.06, 0.06, d, -0.35, 0.03, 0, s.metal);
  b.box(0.06, 0.06, d, 0.35, 0.03, 0, s.metal);
  c.part('scroll', 0, 0.3, d / 2 - 0.2, (pb) => {
    pb.box(0.8, 0.5, 0.7, 0, 0, 0, s.machine);
    pb.sphere(0.25, 0, 0.3, 0, '#8e8a82', 5);
    pb.sphere(0.2, 0.15, 0.35, 0.15, '#c9a48b', 5);
  }, 0.6, 1.0);
  b.sphere(0.12, 0, 1.95, d / 2 - 0.5, '#ffd36b', 5, { slot: SLOT_GLOW });
  c.setLight(0, 1.6, d / 2, '#ffb95c', 0.7, 6);
  c.levelPips();
});

registerModel('drill', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  const h = 3.4;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.18, h, 0.18, Math.cos(a) * 1.0, h / 2, Math.sin(a) * 1.0, s.trim, { rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 });
  }
  b.box(1.0, 0.5, 1.0, 0, h - 0.2, 0, s.machine);
  c.part('pump', 0, h - 0.5, 0, (pb) => {
    pb.cyl(0.12, 0.12, 2.2, 0, -1.1, 0, s.metal, 6);
    pb.cone(0.3, 0.6, 0, -2.4, 0, '#aeb9c7', 6, { rx: Math.PI });
    for (let i = 0; i < 3; i++) pb.box(0.5, 0.06, 0.06, 0, -1.6 + i * 0.5, 0, s.accent, { ry: i, slot: SLOT_GLOW });
  }, 3, 0.3);
  c.machine(1.0, 0.8, 0.8, w / 2 - 0.7, 0, d / 2 - 0.6, 2);
  c.emit('dust', 0, 0.3, 0, 2, '#9c8d78');
  c.levelPips();
});

registerModel('harvester', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.2, d - 0.2, 0, 0.08, 0, SOIL, { shade: 0.05 });
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) b.sphere(0.22, -w / 2 + 0.6 + i * ((w - 1.2) / 3), 0.35, -d / 2 + 0.6 + r * ((d - 1.2) / 2), (i + r) % 2 ? LEAF : LEAF2, 5, { sy: 0.8 });
  for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) b.box(w - 0.1, 0.12, 0.12, 0, 1.5, z, s.metal);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 1.5, 0.14, sx * (w / 2 - 0.1), 0.75, sz * (d / 2 - 0.15), s.trim);
  c.part('slide', 0, 1.5, 0, (pb) => {
    pb.box(0.5, 0.3, d, 0, 0, 0, s.machine);
    pb.box(0.52, 0.08, d - 0.4, 0, -0.1, 0, s.accent, { slot: SLOT_GLOW });
    for (let i = 0; i < 3; i++) pb.cyl(0.05, 0.05, 1.0, 0, -0.65, -d / 2 + 0.6 + i * ((d - 1.2) / 2), s.metal, 4);
  }, 0.5, (w - 1.0) / 2);
  c.levelPips();
});

registerModel('drone_hub', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  b.cyl(Math.min(w, d) * 0.42, Math.min(w, d) * 0.45, 0.3, 0, 0.35, 0, s.machine, 12);
  b.torus(Math.min(w, d) * 0.36, 0.06, 0, 0.52, 0, s.accent, 16, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.machine(1.0, 1.4, 0.8, -w / 2 + 0.6, 0, -d / 2 + 0.5, 3);
  c.antenna(-w / 2 + 0.6, 1.4, -d / 2 + 0.5, 1.0, s.accent.getStyle());
  c.part('bobSpin', 0, 1.8, 0, (pb) => {
    pb.box(0.5, 0.2, 0.5, 0, 0, 0, s.machine);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pb.box(0.4, 0.05, 0.05, sx * 0.3, 0.05, sz * 0.3, s.metal, { ry: Math.PI / 4 });
      pb.cyl(0.26, 0.26, 0.03, sx * 0.42, 0.1, sz * 0.42, s.accent, 8, { slot: SLOT_GLOW });
    }
    pb.sphere(0.08, 0, -0.1, 0.2, '#7cff6a', 4, { slot: SLOT_GLOW });
  }, 0.6, 0.3);
  c.levelPips();
});

registerModel('robot_bay', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.6, 2.6, 0, 0, { roof: 'flat', windows: false, door: false });
  b.box(Math.min(2.4, w * 0.5), 2.0, 0.1, 0, 1.0, d / 2 - 0.26, s.machineDark);
  b.box(Math.min(2.4, w * 0.5) - 0.2, 0.08, 0.14, 0, 1.95, d / 2 - 0.25, s.accent, { slot: SLOT_GLOW });
  c.part('rock', w / 2 - 0.9, 0.6, d / 2 - 0.2, (pb) => {
    pb.box(0.2, 1.2, 0.2, 0, 0.6, 0, s.metal);
    pb.box(0.2, 0.2, 0.9, 0, 1.2, 0.35, s.metal);
    pb.box(0.26, 0.3, 0.26, 0, 1.05, 0.8, s.accent, { slot: SLOT_GLOW });
  }, 0.9, 0.3);
  c.emit('sparks', w / 2 - 0.9, 1.3, d / 2 + 0.3, 0.8, s.accent.getStyle());
  c.levelPips();
});

registerModel('workbench', (c) => {
  const { b, s, w, d } = c;
  const top = 0.95;
  b.box(w - 0.4, 0.14, d - 0.6, 0, top, 0, s.index <= 1 ? WOOD : s.trim, { shade: 0.04 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, top, 0.14, sx * (w / 2 - 0.35), top / 2, sz * (d / 2 - 0.45), s.trim);
  b.box(0.5, 0.3, 0.3, -w / 2 + 0.6, top + 0.22, 0, s.metal);
  b.box(0.1, 0.4, 0.1, 0.1, top + 0.27, 0.1, WOOD, { rz: 0.4 });
  b.box(0.22, 0.12, 0.08, 0.26, top + 0.42, 0.1, '#aeb9c7', { rz: 0.4 });
  b.box(0.4, 0.08, 0.3, w / 2 - 0.6, top + 0.11, -0.1, '#c9a48b');
  b.sphere(0.1, w / 2 - 0.5, top + 0.2, 0.25, s.accent, 5, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
  // tool board
  b.box(w - 0.6, 1.0, 0.08, 0, top + 0.6, -d / 2 + 0.3, s.base, { shade: 0.03 });
  b.box(0.06, 0.5, 0.06, -0.4, top + 0.6, -d / 2 + 0.36, '#aeb9c7');
  b.box(0.3, 0.1, 0.06, -0.4, top + 0.9, -d / 2 + 0.36, '#aeb9c7');
  b.box(0.06, 0.5, 0.06, 0.4, top + 0.6, -d / 2 + 0.36, WOOD);
});

registerModel('forge', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2, 0.2, new THREE.Color('#6a6058'));
  b.box(w - 0.9, 1.6, d - 1.0, -0.2, 0.8, -0.2, '#8e8178', { shade: 0.07 });
  b.box(w - 1.1, 0.4, 0.1, -0.2, 0.7, d / 2 - 0.68, '#1a1410');
  b.box(w - 1.3, 0.3, 0.05, -0.2, 0.7, d / 2 - 0.66, FIRE_GLOW, { slot: SLOT_GLOW });
  c.chimney(-0.2, 1.6, -0.5, 1.3, 0.22, 2.5);
  // anvil
  b.box(0.5, 0.3, 0.3, w / 2 - 0.55, 0.65, d / 2 - 0.6, s.metal);
  b.box(0.3, 0.4, 0.25, w / 2 - 0.55, 0.3, d / 2 - 0.6, '#5a5753');
  c.emit('fire', -0.2, 0.8, d / 2 - 0.6, 3);
  c.emit('sparks', w / 2 - 0.55, 0.9, d / 2 - 0.6, 0.6, '#ffb347');
  c.setLight(-0.2, 1.0, d / 2 - 0.3, '#ff8a3c', 1.1, 7);
  c.levelPips();
});

registerModel('smelter', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  c.machine(w - 0.8, 1.4, d - 0.8, 0, 0.2, 0, 2);
  b.cyl(0.9, 1.1, 2.0, -w / 4, 2.6, 0, s.machine, 10);
  b.cyl(0.6, 0.6, 0.3, -w / 4, 1.8, 0.9, '#1a1410', 8, { rx: Math.PI / 2 });
  b.cyl(0.45, 0.45, 0.2, -w / 4, 1.8, 0.95, '#ff6a1e', 8, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.chimney(-w / 4, 3.6, 0, 1.6, 0.3, 4);
  // crucible with molten metal
  b.cyl(0.45, 0.35, 0.6, w / 4, 1.9, 0, s.metal, 8);
  b.cyl(0.38, 0.38, 0.08, w / 4, 2.2, 0, '#ffb15c', 8, { slot: SLOT_GLOW });
  c.emit('sparks', w / 4, 2.3, 0, 1.2, '#ffb347');
  c.setLight(0, 2.2, 0.8, '#ff7a3c', 1.3, 9);
  c.levelPips();
});

registerModel('electronics_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.6, 2.2, 0, 0, { roof: 'flat', windows: true, door: true, wallColor: new THREE.Color('#dfe6ee') });
  for (let i = 0; i < 4; i++) b.sphere(0.08, -w / 2 + 0.6 + i * 0.35, 2.0, d / 2 - 0.28, ['#7cff6a', '#ff4d5e', '#58d0ff', '#ffd84a'][i], 4, { slot: SLOT_GLOW });
  c.antenna(w / 2 - 0.7, 2.3, -d / 2 + 0.7, 1.4, s.accent.getStyle());
  b.cyl(0.4, 0.5, 0.1, -w / 2 + 0.8, 2.4, -d / 2 + 0.8, s.metal, 8, { rx: -0.8 });
  c.levelPips();
});

registerModel('factory', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  c.hut(w - 0.6, d - 0.6, 3.0, 0, 0, { roof: 'flat', windows: false, door: false });
  // sawtooth roof lights
  for (let i = 0; i < 3; i++) b.wedge(w / 3 - 0.2, 0.8, d - 0.9, -w / 3 + (i * w) / 3, 3.1, 0, i % 2 ? s.roof : s.roofEdge, { shade: 0.03 });
  for (let i = 0; i < 3; i++) b.box(w / 3 - 0.5, 0.4, 0.06, -w / 3 + (i * w) / 3, 3.45, d / 2 - 0.42, '#ffffff', { slot: SLOT_GLASS });
  c.chimney(-w / 2 + 0.7, 3.1, -d / 2 + 0.7, 2.0, 0.26, 4);
  c.chimney(-w / 2 + 1.4, 3.1, -d / 2 + 0.7, 1.6, 0.22, 3);
  b.box(Math.min(2.4, w * 0.4), 2.2, 0.1, 0.4, 1.1, d / 2 - 0.26, s.machineDark);
  b.box(Math.min(2.4, w * 0.4) - 0.2, 0.08, 0.14, 0.4, 2.1, d / 2 - 0.25, s.accent, { slot: SLOT_GLOW });
  c.part('spinZ', w / 2 - 0.1, 1.6, 0, (pb) => {
    pb.cyl(0.6, 0.6, 0.2, 0, 0, 0, s.metal, 8, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) pb.box(0.22, 1.5, 0.22, 0, 0, 0, s.metal, { rx: (i * Math.PI) / 4 });
  }, 1.2);
  c.levelPips();
});

registerModel('nanoforge', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  b.box(w - 0.9, 1.0, d - 0.9, 0, 0.5, 0, s.machineDark);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.3, 3.0, 0.3, sx * (w / 2 - 0.6), 1.5, sz * (d / 2 - 0.6), s.trim, { shade: 0.02 });
    b.box(0.34, 0.08, 0.34, sx * (w / 2 - 0.6), 2.9, sz * (d / 2 - 0.6), s.accent, { slot: SLOT_GLOW });
  }
  b.box(w - 0.9, 0.3, d - 0.9, 0, 3.05, 0, s.machine);
  c.part('bobSpin', 0, 2.0, 0, (pb) => {
    pb.shard(0.45, 0.8, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
    pb.torus(0.8, 0.05, 0, 0, 0, s.accent, 14, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(0.65, 0.05, 0, 0, 0, s.accent, 14, 5, { rx: 1.1, slot: SLOT_GLOW });
  }, 1.2, 0.15);
  c.emit('motes', 0, 2.0, 0, 5, s.accent.getStyle());
  c.setLight(0, 2.0, 0, s.accent.getStyle(), 1.2, 9);
  c.levelPips();
});

registerModel('matter_processor', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  const r = Math.min(w, d) * 0.36;
  b.cyl(r + 0.3, r + 0.5, 0.6, 0, 0.3, 0, s.machineDark, 12);
  b.cyl(0.5, 0.6, 3.2, 0, 2.2, 0, s.trim, 8);
  b.torus(r, 0.3, 0, 1.6, 0, s.machine, 18, 7, { rx: Math.PI / 2 });
  b.torus(r, 0.08, 0, 1.6, 0, s.accent, 18, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.part('spinY', 0, 3.9, 0, (pb) => {
    pb.sphere(0.5, 0, 0, 0, '#ffffff', 8, { slot: SLOT_GLOW });
    for (let i = 0; i < 3; i++) pb.box(1.4, 0.06, 0.2, 0, 0, 0, s.accent, { ry: (i * Math.PI) / 3, slot: SLOT_GLOW });
  }, 1.0);
  c.emit('motes', 0, 2.5, 0, 4, s.accent.getStyle());
  c.levelPips();
});

registerModel('conveyor', (c) => {
  const { b, s } = c;
  b.box(1.9, 0.18, 0.9, 0, 0.3, 0, s.machineDark);
  b.box(1.9, 0.06, 0.7, 0, 0.42, 0, '#2a2a30');
  for (let i = 0; i < 5; i++) b.cyl(0.08, 0.08, 0.8, -0.8 + i * 0.4, 0.42, 0, s.metal, 6, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) b.box(0.14, 0.3, 0.14, sx * 0.85, 0.15, 0.4, s.trim);
  b.box(1.9, 0.05, 0.05, 0, 0.4, 0.44, s.accent, { slot: SLOT_GLOW });
  c.part('scroll', -0.6, 0.55, 0, (pb) => {
    pb.box(0.3, 0.25, 0.3, 0, 0, 0, '#c9a48b');
  }, 1.0, 0.65);
  c.part('scroll', 0.3, 0.55, 0, (pb) => {
    pb.sphere(0.16, 0, 0, 0, '#aeb9c7', 5);
  }, 1.0, 0.65);
});

registerModel('research_desk', (c) => {
  const { b, s } = c;
  b.box(1.5, 0.1, 0.8, 0, 0.8, -0.2, s.index <= 1 ? WOOD : s.trim, { shade: 0.03 });
  for (const sx of [-1, 1]) b.box(0.1, 0.8, 0.7, sx * 0.65, 0.4, -0.2, s.trim);
  b.cyl(0.22, 0.22, 0.08, 0, 0.5, 0.5, s.trim, 7);
  b.cyl(0.05, 0.05, 0.5, 0, 0.25, 0.5, s.trim, 5);
  b.box(0.5, 0.03, 0.4, -0.35, 0.87, -0.2, '#fff7e0', { ry: 0.2 });
  b.box(0.4, 0.03, 0.3, -0.3, 0.9, -0.1, '#e8f1ff', { ry: -0.3 });
  if (s.index <= 2) {
    b.cyl(0.03, 0.03, 0.6, 0.45, 1.1, -0.45, s.metal, 4);
    b.cone(0.18, 0.2, 0.45, 1.45, -0.45, '#ffd36b', 7, { slot: SLOT_GLOW });
  } else {
    c.part('bobSpin', 0.4, 1.3, -0.3, (pb) => {
      pb.sphere(0.2, 0, 0, 0, s.accent, 6, { slot: SLOT_GLOW });
      pb.torus(0.3, 0.03, 0, 0, 0, s.accent, 10, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    }, 1.5, 0.06);
  }
  c.setLight(0.4, 1.3, -0.4, '#ffd36b', 0.5, 5);
});

registerModel('research_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.6, 2.4, 0, 0, { roof: 'flat', windows: true, door: true, wallColor: new THREE.Color('#e3eaf1') });
  b.sphere(Math.min(w, d) * 0.3, 0, 2.5, 0, '#ffffff', 10, { sy: 0.7, slot: SLOT_GLASS });
  c.antenna(w / 2 - 0.6, 2.5, -d / 2 + 0.6, 1.3, s.accent.getStyle());
  c.part('spinY', -w / 2 + 0.8, 2.6, -d / 2 + 0.8, (pb) => {
    pb.cyl(0.5, 0.15, 0.3, 0, 0.15, 0, '#dfe6ee', 10, { rx: -0.9 });
    pb.cyl(0.04, 0.04, 0.6, 0, 0.4, 0.2, s.metal, 4, { rx: -0.9 });
  }, 0.8);
  c.emit('motes', 0, 2.9, 0, 1.5, s.accent.getStyle());
  c.levelPips();
});

registerModel('advanced_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  b.box(w - 0.7, 3.0, d - 0.7, 0, 1.5, 0, '#dfe6ee', { shade: 0.015 });
  b.box(w - 0.6, 0.6, d - 0.6, 0, 1.5, 0, '#ffffff', { slot: SLOT_GLASS });
  b.box(w - 0.6, 0.16, d - 0.6, 0, 3.05, 0, s.trim);
  b.box(w - 0.5, 0.05, 0.08, 0, 3.14, d / 2 - 0.3, s.accent, { slot: SLOT_GLOW });
  b.box(w - 0.5, 0.05, 0.08, 0, 3.14, -d / 2 + 0.3, s.accent, { slot: SLOT_GLOW });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.26, 3.2, 0.26, sx * (w / 2 - 0.4), 1.6, sz * (d / 2 - 0.4), s.trim);
  b.cyl(0.6, 0.8, 0.6, 0, 3.3, 0, s.trim, 8);
  c.part('bobSpin', 0, 4.3, 0, (pb) => {
    pb.sphere(0.5, 0, 0, 0, s.accent, 8, { slot: SLOT_GLOW });
    pb.torus(0.85, 0.05, 0, 0, 0, '#ffffff', 16, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(0.7, 0.05, 0, 0, 0, '#ffffff', 16, 5, { rz: 0.9, slot: SLOT_GLOW });
  }, 1.0, 0.15);
  c.emit('motes', 0, 4.3, 0, 4, s.accent.getStyle());
  c.setLight(0, 4.3, 0, s.accent.getStyle(), 1.0, 9);
  c.levelPips();
});

registerModel('med_bay', (c) => {
  const { b, w, d } = c;
  c.foundation();
  c.hut(w - 0.6, d - 0.6, 2.2, 0, 0, { roof: 'flat', windows: true, door: true, wallColor: new THREE.Color('#f2f5f8') });
  b.box(0.5, 0.16, 0.1, 0, 1.75, d / 2 - 0.24, '#ff5a6e', { slot: SLOT_GLOW });
  b.box(0.16, 0.5, 0.1, 0, 1.75, d / 2 - 0.24, '#ff5a6e', { slot: SLOT_GLOW });
  c.levelPips();
});

registerModel('medical_center', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  c.hut(w - 0.6, d - 0.6, 3.2, 0, 0, { roof: 'flat', windows: true, door: true, wallColor: new THREE.Color('#f2f5f8') });
  b.box(w - 0.7, 0.5, d - 0.7, 0, 2.3, 0, '#ffffff', { slot: SLOT_GLASS });
  b.box(0.9, 0.22, 0.1, 0, 2.9, d / 2 - 0.24, '#ff5a6e', { slot: SLOT_GLOW });
  b.box(0.22, 0.9, 0.1, 0, 2.9, d / 2 - 0.24, '#ff5a6e', { slot: SLOT_GLOW });
  b.cyl(0.6, 0.6, 0.12, 0, 3.4, 0, s.trim, 8);
  b.box(1.0, 0.1, 0.16, 0, 3.5, 0, '#ff5a6e', { slot: SLOT_GLOW });
  b.box(0.16, 0.1, 1.0, 0, 3.5, 0, '#ff5a6e', { slot: SLOT_GLOW });
  c.setLight(0, 2.5, d / 2, '#ffffff', 0.6, 7);
  c.levelPips();
});

// ------------------------------------------------------------------------------------ utility

registerModel('radio_tower', (c) => {
  const { b, s } = c;
  const h = 6.5;
  b.box(1.2, 0.3, 1.2, 0, 0.15, 0, s.trim);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, h, 0.08, sx * 0.3, h / 2 + 0.3, sz * 0.3, s.metal, { rx: -sz * 0.045, rz: sx * 0.045 });
  for (let i = 1; i <= 4; i++) {
    const y = (i * h) / 5;
    const k = 0.3 * (1 - (y / h) * 0.6);
    b.box(k * 2, 0.05, 0.05, 0, y, k, s.metal);
    b.box(k * 2, 0.05, 0.05, 0, y, -k, s.metal);
    b.box(0.05, 0.05, k * 2, k, y, 0, s.metal);
    b.box(0.05, 0.05, k * 2, -k, y, 0, s.metal);
  }
  b.cyl(0.03, 0.05, 1.5, 0, h + 1.0, 0, s.metal, 4);
  b.sphere(0.12, 0, h + 1.8, 0, '#ff4d5e', 5, { slot: SLOT_GLOW });
  c.part('spinY', 0, h * 0.7, 0, (pb) => {
    pb.cyl(0.55, 0.12, 0.3, 0.45, 0, 0, '#dfe6ee', 10, { rz: -Math.PI / 2 });
  }, 0.7);
});

registerModel('garage', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  c.hut(w - 0.6, d - 0.6, 2.6, 0, 0, { roof: 'flat', windows: false, door: false });
  // open front with a raised shutter
  b.box(Math.min(3.0, w * 0.6), 2.0, 0.2, 0, 1.0, d / 2 - 0.3, '#1e1c22');
  b.box(Math.min(3.0, w * 0.6) + 0.2, 0.3, 0.3, 0, 2.2, d / 2 - 0.3, s.trim);
  b.box(Math.min(3.0, w * 0.6), 0.06, 0.1, 0, 2.05, d / 2 - 0.2, s.accent, { slot: SLOT_GLOW });
  // tyre stack + toolbox
  for (let i = 0; i < 3; i++) b.torus(0.3, 0.12, -w / 2 + 0.6, 0.15 + i * 0.26, d / 2 - 0.7, '#2a2a2e', 10, 5, { rx: Math.PI / 2 });
  b.box(0.6, 0.4, 0.4, w / 2 - 0.7, 0.2, d / 2 - 0.6, '#c43b2a');
  c.levelPips();
});

registerModel('hangar', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const r = Math.min(w, d) * 0.42;
  b.cyl(r, r, d - 0.6, 0, 0.5, 0, s.base, 14, { rx: Math.PI / 2, shade: 0.02 });
  b.box(w - 0.6, 0.6, d - 0.6, 0, 0.3, 0, s.trim);
  b.box(r * 1.4, r * 0.9, 0.2, 0, 0.5 + r * 0.45, d / 2 - 0.3, '#1e1c22');
  b.box(r * 1.4, 0.08, 0.26, 0, 0.5 + r * 0.9, d / 2 - 0.3, s.accent, { slot: SLOT_GLOW });
  for (let i = 0; i < 4; i++) b.sphere(0.1, -w / 2 + 0.5 + i * ((w - 1.0) / 3), 0.1, d / 2 - 0.1, i % 2 ? '#ff4d5e' : '#7cff6a', 4, { slot: SLOT_GLOW });
  c.antenna(0, 0.5 + r, -d / 2 + 0.6, 1.0, '#ff4d5e');
  c.levelPips();
});

registerModel('teleporter', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.4;
  b.cyl(r, r + 0.15, 0.35, 0, 0.17, 0, s.machineDark, 14);
  b.cyl(r * 0.85, r * 0.85, 0.06, 0, 0.38, 0, s.accent, 14, { slot: SLOT_GLOW });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.3, 2.6, 0.3, Math.cos(a) * r, 1.3, Math.sin(a) * r, s.trim, { ry: -a });
    b.sphere(0.14, Math.cos(a) * r, 2.75, Math.sin(a) * r, s.accent, 5, { slot: SLOT_GLOW });
  }
  c.part('bobSpin', 0, 1.6, 0, (pb) => {
    pb.torus(r * 0.75, 0.07, 0, 0, 0, s.accent, 18, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(r * 0.55, 0.06, 0, 0.5, 0, s.accent, 16, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  }, 1.2, 0.3);
  b.cyl(r * 0.3, r * 0.5, 2.4, 0, 1.6, 0, s.accent, 10, { slot: SLOT_GLOW });
  c.emit('motes', 0, 1.0, 0, 6, s.accent.getStyle());
  c.setLight(0, 1.5, 0, s.accent.getStyle(), 1.3, 9);
});

const SPIN_COLORS = ['#b5793f', '#9aa3ad', '#b48cff', '#4fb3f6', '#ffd84a', '#5ef2ff', '#8fa8ff', '#ff6f91'];
registerModel('spin_wheel', (c) => {
  const { b, s } = c;
  b.box(0.8, 0.2, 0.8, 0, 0.1, 0, s.trim);
  b.box(0.16, 1.6, 0.16, -0.5, 0.9, 0, s.trim);
  b.box(0.16, 1.6, 0.16, 0.5, 0.9, 0, s.trim);
  b.box(1.2, 0.14, 0.14, 0, 1.75, 0, s.trim);
  c.part('wheel', 0, 1.1, 0.1, (pb) => {
    pb.cyl(0.78, 0.78, 0.12, 0, 0, 0, '#fff5e6', 16, { rx: Math.PI / 2 });
    const n = SPIN_COLORS.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pb.box(0.42, 0.26, 0.08, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.07, SPIN_COLORS[i], { rz: a + Math.PI / 2 });
      pb.sphere(0.05, Math.cos(a + Math.PI / n) * 0.7, Math.sin(a + Math.PI / n) * 0.7, 0.08, '#ffd84a', 4, { slot: SLOT_GLOW });
    }
    pb.sphere(0.12, 0, 0, 0.1, '#ffd84a', 6, { slot: SLOT_GLOW });
  }, 0.5);
  b.cone(0.1, 0.3, 0, 1.95, 0.2, '#ff5a6e', 4, { rx: Math.PI });
  c.setLight(0, 1.6, 0.6, '#ffd84a', 0.6, 6);
});

registerModel('beacon', (c) => {
  const { b, s } = c;
  b.cyl(0.5, 0.6, 0.3, 0, 0.15, 0, s.trim, 8);
  b.cyl(0.1, 0.14, 3.0, 0, 1.8, 0, s.metal, 6);
  b.box(0.5, 0.4, 0.5, 0, 3.4, 0, s.machine);
  c.part('spinY', 0, 3.7, 0, (pb) => {
    pb.sphere(0.2, 0, 0, 0, s.accent, 6, { slot: SLOT_GLOW });
    pb.box(1.4, 0.08, 0.08, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
  }, 2.5);
  c.setLight(0, 3.5, 0, s.accent.getStyle(), 0.9, 8);
});

registerModel('repair_bay', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  c.machine(w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, 3);
  b.box(0.3, 2.2, 0.3, -w / 2 + 0.5, 1.3, 0, s.trim);
  c.part('rock', -w / 2 + 0.5, 2.4, 0, (pb) => {
    pb.box(1.4, 0.16, 0.16, 0.6, 0, 0, s.metal);
    pb.box(0.12, 0.7, 0.12, 1.25, -0.3, 0, s.metal);
    pb.box(0.3, 0.2, 0.3, 1.25, -0.7, 0, s.accent, { slot: SLOT_GLOW });
  }, 1.1, 0.25);
  c.emit('sparks', -w / 2 + 1.75, 1.5, 0, 1.2, s.accent.getStyle());
  c.levelPips();
});

registerModel('shield_generator', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  c.machine(w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, 2);
  b.cyl(0.4, 0.5, 1.2, 0, 1.8, 0, s.trim, 8);
  b.cyl(0.9, 0.3, 0.5, 0, 2.6, 0, s.machine, 10);
  b.sphere(0.4, 0, 2.95, 0, s.accent, 8, { slot: SLOT_GLOW });
  c.part('spinY', 0, 2.95, 0, (pb) => {
    pb.torus(0.7, 0.05, 0, 0, 0, s.accent, 14, 5, { rx: 0.5, slot: SLOT_GLOW });
  }, 1.5);
  c.emit('motes', 0, 3.0, 0, 2, s.accent.getStyle());
  c.setLight(0, 3.0, 0, s.accent.getStyle(), 1.0, 9);
  c.levelPips();
});

// ------------------------------------------------------------------------------------ decor

registerModel('lamp', (c) => {
  const { b, s } = c;
  b.cyl(0.22, 0.28, 0.2, 0, 0.1, 0, s.trim, 7);
  b.cyl(0.06, 0.08, 2.2, 0, 1.3, 0, s.index <= 1 ? WOOD_DARK : s.metal, 6);
  if (s.index <= 2) {
    b.box(0.5, 0.5, 0.5, 0, 2.55, 0, '#ffffff', { slot: SLOT_GLASS });
    b.box(0.56, 0.08, 0.56, 0, 2.3, 0, s.trim);
    b.pyramid(0.6, 0.3, 0.6, 0, 2.8, 0, s.trim);
  } else {
    b.box(0.3, 0.1, 0.3, 0, 2.45, 0, s.metal);
    b.sphere(0.3, 0, 2.7, 0, '#ffffff', 8, { slot: SLOT_GLASS });
    b.box(0.08, 0.08, 0.4, 0, 2.5, 0.2, s.accent, { slot: SLOT_GLOW });
  }
  c.setLight(0, 2.5, 0, '#ffc877', 1.0, 9);
});

registerModel('plant', (c) => {
  const { b, s } = c;
  b.box(1.4, 0.4, 1.4, 0, 0.2, 0, s.index <= 1 ? WOOD : s.trim, { shade: 0.04 });
  b.box(1.2, 0.1, 1.2, 0, 0.42, 0, SOIL);
  const colors = ['#ff6f91', '#ffd84a', '#ff9e5e', '#b48cff', '#5ef2ff'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.cos(a) * 0.4;
    const z = Math.sin(a) * 0.4;
    b.cyl(0.02, 0.03, 0.45, x, 0.65, z, '#5d8f3c', 4);
    b.sphere(0.13, x, 0.9, z, colors[i], 5);
  }
  b.sphere(0.28, 0, 0.6, 0, LEAF, 6, { sy: 0.6 });
});

registerModel('bench', (c) => {
  const { b, s } = c;
  const col = s.index <= 2 ? WOOD : s.trim;
  b.box(1.6, 0.08, 0.5, 0, 0.5, 0, col, { shade: 0.03 });
  b.box(1.6, 0.4, 0.08, 0, 0.78, -0.24, col, { rx: -0.15, shade: 0.03 });
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.5, 0.5, sx * 0.7, 0.25, 0, s.metal);
  }
});

registerModel('fountain', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.4;
  b.cyl(r, r + 0.1, 0.5, 0, 0.25, 0, s.index <= 2 ? '#a6a39b' : s.trim, 12, { shade: 0.04 });
  b.cyl(r - 0.15, r - 0.15, 0.1, 0, 0.5, 0, WATER, 12);
  b.cyl(0.18, 0.25, 0.9, 0, 0.9, 0, s.trim, 8);
  b.cyl(0.45, 0.1, 0.25, 0, 1.4, 0, s.trim, 10);
  b.cyl(0.4, 0.4, 0.05, 0, 1.5, 0, WATER, 10);
  b.cone(0.1, 0.5, 0, 1.8, 0, '#9fdcff', 5, { slot: SLOT_GLOW });
  c.emit('drips', 0, 1.9, 0, 6, '#9fdcff');
  if (s.index >= 3) b.torus(r - 0.05, 0.04, 0, 0.52, 0, s.accent, 16, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
});

registerModel('banner', (c) => {
  const { b, s } = c;
  b.cyl(0.2, 0.25, 0.2, 0, 0.1, 0, s.trim, 7);
  b.cyl(0.05, 0.06, 3.0, 0, 1.6, 0, s.index <= 1 ? WOOD_DARK : s.metal, 6);
  b.sphere(0.1, 0, 3.15, 0, s.accent, 5, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
  c.part('sway', 0.05, 2.9, 0, (pb) => {
    pb.box(1.1, 0.7, 0.04, 0.55, -0.35, 0, s.accent, { shade: 0.02 });
    pb.box(0.9, 0.3, 0.05, 0.55, -0.35, 0, '#ffffff');
  }, 2.5, 0.12);
});

registerModel('statue', (c) => {
  const { b, s } = c;
  const stone = s.index >= 5 ? '#dfe6ee' : '#b9b5ad';
  b.box(1.2, 0.5, 1.2, 0, 0.25, 0, s.trim, { shade: 0.03 });
  b.box(0.9, 0.4, 0.9, 0, 0.7, 0, stone, { shade: 0.03 });
  // chibi figure
  b.box(0.42, 0.55, 0.3, 0, 1.2, 0, stone);
  b.sphere(0.3, 0, 1.75, 0, stone, 7);
  b.box(0.12, 0.5, 0.12, -0.3, 1.25, 0, stone, { rz: 0.5 });
  b.box(0.12, 0.5, 0.12, 0.3, 1.45, 0, stone, { rz: -2.6 });
  b.box(0.14, 0.4, 0.14, -0.1, 0.78, 0, stone);
  b.box(0.14, 0.4, 0.14, 0.1, 0.78, 0, stone);
  b.box(0.3, 0.3, 0.3, 0.42, 1.85, 0, s.accent, { slot: s.index >= 3 ? SLOT_GLOW : 0 });
});

registerModel('arcade', (c) => {
  const { b, s } = c;
  b.box(0.9, 1.7, 0.7, 0, 0.85, 0, s.index >= 4 ? s.machine : '#3b3f6b', { shade: 0.02 });
  b.box(0.7, 0.5, 0.06, 0, 1.3, 0.36, '#58d0ff', { slot: SLOT_GLOW, rx: -0.2 });
  b.box(0.8, 0.2, 0.3, 0, 0.95, 0.45, '#2a2d4a', { rx: 0.3 });
  b.sphere(0.06, -0.2, 1.02, 0.55, '#ff4d5e', 4, { slot: SLOT_GLOW });
  b.sphere(0.06, 0.2, 1.02, 0.55, '#ffd84a', 4, { slot: SLOT_GLOW });
  b.box(0.92, 0.3, 0.72, 0, 1.75, 0, '#ff6f91', { slot: SLOT_GLOW });
  c.setLight(0, 1.4, 0.8, '#58d0ff', 0.6, 5);
});

registerModel('garden', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.3, d - 0.2, 0, 0.15, 0, s.index <= 1 ? WOOD : s.trim, { shade: 0.04 });
  b.box(w - 0.5, 0.08, d - 0.5, 0, 0.31, 0, '#4f8a3a');
  const colors = ['#ff6f91', '#ffd84a', '#ff9e5e', '#b48cff', '#5ef2ff', '#ffffff'];
  let k = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 && j === 1) continue;
    const x = -w / 2 + 0.6 + (i * (w - 1.2)) / 2;
    const z = -d / 2 + 0.6 + (j * (d - 1.2)) / 2;
    b.cyl(0.02, 0.03, 0.4, x, 0.55, z, '#5d8f3c', 4);
    b.sphere(0.14, x, 0.8, z, colors[k++ % colors.length], 5);
  }
  b.cyl(0.08, 0.1, 1.0, 0, 0.8, 0, WOOD_DARK, 5);
  b.sphere(0.6, 0, 1.5, 0, LEAF2, 7, { sy: 0.85 });
  b.sphere(0.4, 0.3, 1.8, 0.2, LEAF, 6);
  if (s.index >= 3) for (const sx of [-1, 1]) b.sphere(0.07, sx * (w / 2 - 0.2), 0.4, d / 2 - 0.2, s.accent, 4, { slot: SLOT_GLOW });
});
