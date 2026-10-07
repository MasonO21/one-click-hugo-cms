/**
 * Procedural models for power, production, crafting, research, utility and decor buildings.
 * Each builder styles itself with the tier palette (via the kit_industry helpers) and adds animated
 * parts / emitters so machines visibly operate: smoke stacks, glowing furnace mouths, conveyors with
 * items, cranes, pipes, gauges, hazard stripes and lived-in props.
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel } from './spec';
import { WOOD, WOOD_DARK, LEAF, LEAF2, WATER, SOIL, WHITE, FIRE_GLOW } from './colors';
import {
  IRON, DARK, HAZARD, SAFETY_RED, GOLD, ALLOY_ORANGE, STONE, STONE_LIGHT, STONE_DARK, BRICK, BRICK_DARK, SAWDUST, PAPER, GREEN_LED, RED_LED, BLUE_LED, MOLTEN, FLOWERS,
  stripeColor, glows, accentSlot, frameColor, postColor, deckColor,
  pipe, pipeRun, valve, gauge, stripes, rivets, vent, screen, led, glowRing, dish,
  barrel, crate, sack, logPile, stump, axe, hammer, saw, anvil, lantern, cross, vial, flower, bush,
  windowPane, doorway, shed, stack, furnace, awning, machine, pad, lattice,
} from './kit_industry';

// ------------------------------------------------------------------------------------ power

registerModel('fuel_generator', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  // engine block (left) with vents, lights and a gauge
  machine(c, w - 1.7, 1.4, d - 1.3, -0.6, 0.2, 0.1, { lights: 2, gauge: true });
  stripes(b, -0.6, 0.3, d / 2 - 0.14, w - 1.8, 0.14, 8);
  // fuel tank (right) on saddles with a band, valve and feed pipe
  const tx = w / 2 - 0.85;
  for (const z of [-0.8, 0.8]) b.box(1.0, 0.5, 0.3, tx, 0.45, z, s.machineDark);
  b.cyl(0.55, 0.55, d - 1.6, tx, 1.05, 0, s.trim, 8, { rx: Math.PI / 2, shade: 0.02 });
  for (const z of [-0.6, 0.6]) b.cyl(0.58, 0.58, 0.1, tx, 1.05, z, stripeColor(s), 8, { rx: Math.PI / 2 });
  valve(b, tx, 1.25, d / 2 - 0.85, SAFETY_RED, 0, 0.14);
  pipeRun(b, s.metal, [tx, 1.55, 0.4, tx, 1.95, 0.4, 0.3, 1.95, 0.4, 0.3, 1.6, 0.4], 0.07);
  // exhaust stack and flywheel
  stack(c, -1.3, 1.6, -1.1, 1.4, 0.16, 3);
  c.part('spinX', -w / 2 + 0.3, 1.0, 0.1, (pb) => {
    pb.cyl(0.45, 0.45, 0.16, 0, 0, 0, s.metal, 10, { rz: Math.PI / 2 });
    for (let i = 0; i < 4; i++) pb.box(0.06, 0.82, 0.2, 0, 0, 0, s.accent, { rx: (i * Math.PI) / 4, slot: SLOT_GLOW });
    pb.cyl(0.12, 0.12, 0.24, 0, 0, 0, IRON, 6, { rz: Math.PI / 2 });
  }, 8);
  b.torus(0.56, 0.05, -w / 2 + 0.26, 1.0, 0.1, s.trim, 10, 4, { ry: Math.PI / 2 });
  // jerry can + warning light
  b.box(0.36, 0.44, 0.26, -1.1, 0.22, d / 2 - 0.55, SAFETY_RED);
  b.box(0.12, 0.08, 0.1, -1.1, 0.48, d / 2 - 0.55, s.metal);
  led(b, 0.2, 1.72, 0.9, RED_LED, 0.12);
  c.levelPips();
});

registerModel('solar_panel', (c) => {
  const { b, s, w, d } = c;
  const cols = Math.max(1, Math.round(w / 2.2));
  const slotW = (w - 0.4) / cols;
  const pw = slotW - 0.2;
  const pd = d - 1.0;
  for (let i = 0; i < cols; i++) {
    const cx = -w / 2 + 0.2 + slotW * (i + 0.5);
    for (const sx of [-1, 1]) {
      b.box(0.1, 1.3, 0.1, cx + sx * (pw / 2 - 0.2), 0.65, -pd * 0.35, s.metal);
      b.box(0.1, 0.55, 0.1, cx + sx * (pw / 2 - 0.2), 0.27, pd * 0.35, s.metal);
    }
    b.box(pw - 0.3, 0.08, 0.08, cx, 1.28, -pd * 0.35, s.metal);
    b.box(pw, 0.1, pd, cx, 1.0, 0, s.metal, { rx: 0.5 });
    b.box(pw - 0.12, 0.05, pd - 0.12, cx, 1.06, 0, '#1f3f7a', { rx: 0.5 });
    for (let k = 1; k < 3; k++) b.box(0.04, 0.03, pd - 0.16, cx - pw / 2 + (pw * k) / 3, 1.09, 0, '#9fd0ff', { rx: 0.5 });
    b.box(pw - 0.16, 0.03, 0.04, cx, 1.09, 0, '#9fd0ff', { rx: 0.5 });
    if (s.index >= 4) b.box(pw - 0.1, 0.04, 0.05, cx, 1.04 - Math.sin(0.5) * (pd / 2), Math.cos(0.5) * (pd / 2), s.accent, { rx: 0.5, slot: SLOT_GLOW });
  }
  // junction box with status light and cable
  b.box(0.5, 0.5, 0.35, w / 2 - 0.5, 0.25, d / 2 - 0.4, s.machineDark);
  led(b, w / 2 - 0.5, 0.42, d / 2 - 0.2, GREEN_LED, 0.08);
  pipe(b, s.metal, w / 2 - 0.5, 0.5, d / 2 - 0.4, w / 2 - 0.7, 1.0, pd * 0.35, 0.03, 4);
});

registerModel('wind_turbine', (c) => {
  const { b, s } = c;
  if (s.index <= 2) {
    // windmill: timber lattice or stone tower with cloth sails
    const h = 3.6;
    if (s.index <= 1) {
      lattice(b, WOOD_DARK, 0, 0, 0, h, 0.6, 0.3, 2, 0.1);
      b.box(0.9, 0.12, 0.9, 0, h, 0, WOOD);
    } else {
      b.cyl(0.45, 0.72, h, 0, h / 2, 0, STONE, 8, { shade: 0.06 });
      b.cyl(0.5, 0.5, 0.14, 0, h * 0.5, 0, STONE_DARK, 8);
      b.box(0.5, 0.5, 0.1, 0, 1.0, 0.5, DARK);
    }
    b.cone(0.62, 0.7, 0, h + 0.4, 0, s.roof, 6);
    b.box(0.5, 0.5, 0.7, 0, h - 0.1, 0.15, WOOD_DARK);
    c.part('spinZ', 0, h - 0.1, 0.55, (pb) => {
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        pb.box(0.08, 2.4, 0.06, Math.sin(-a) * 1.2 * 0, Math.cos(a) * 0, 0, WOOD, { rz: a });
        const cx = 0.28 * Math.cos(a) - 1.35 * Math.sin(a);
        const cy = 0.28 * Math.sin(a) + 1.35 * Math.cos(a);
        pb.box(0.48, 1.7, 0.03, cx, cy, 0.04, '#e9dcc0', { rz: a, shade: 0.03 });
      }
      pb.cyl(0.14, 0.14, 0.2, 0, 0, 0, WOOD_DARK, 6, { rx: Math.PI / 2 });
    }, 1.2);
    return;
  }
  const h = 6 + c.lv * 2;
  b.cyl(0.6, 0.8, 0.4, 0, 0.2, 0, s.trim, 8);
  rivets(b, s.metal, -0.45, 0.42, 0.45, 0.45, 0.42, 0.45, 3, 0.06);
  b.cyl(0.14, 0.3, h, 0, h / 2 + 0.4, 0, WHITE, 8);
  b.box(0.6, 0.55, 1.1, 0, h + 0.5, -0.1, WHITE);
  b.box(0.62, 0.08, 1.12, 0, h + 0.5, -0.1, stripeColor(s));
  b.cone(0.22, 0.4, 0, h + 0.5, 0.55, WHITE, 8, { rx: Math.PI / 2 });
  b.sphere(0.14, 0, h + 0.55, -0.7, s.accent, 5, { slot: SLOT_GLOW });
  c.part('spinZ', 0, h + 0.5, 0.78, (pb) => {
    const L = 2.6 + c.lv * 0.6;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      pb.box(0.26, L * 0.6, 0.06, -Math.sin(a) * L * 0.3, Math.cos(a) * L * 0.3, 0, WHITE, { rz: a });
      pb.box(0.16, L * 0.45, 0.05, -Math.sin(a) * L * 0.78, Math.cos(a) * L * 0.78, 0, WHITE, { rz: a });
    }
    pb.cyl(0.2, 0.2, 0.2, 0, 0, 0, s.metal, 8, { rx: Math.PI / 2 });
  }, 2.2);
});

registerModel('geothermal', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1, 0.3, new THREE.Color('#5a4a40'));
  b.cyl(1.1, 1.5, 1.0, 0, 0.5, 0, '#6e5a4a', 10, { shade: 0.05 });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + 0.4;
    b.sphere(0.28, Math.cos(a) * 1.35, 0.35, Math.sin(a) * 1.35, i % 2 ? STONE : STONE_DARK, 5, { shade: 0.06 });
  }
  for (let i = 0; i < 3; i++) b.box(0.08, 0.04, 0.9, 0, 1.02, 0, '#ff7a2e', { ry: i * 1.05 + 0.3, slot: SLOT_GLOW });
  // well head with a hand wheel and three steam risers
  b.cyl(0.7, 0.7, 0.35, 0, 1.15, 0, s.machine, 10);
  b.cyl(0.74, 0.74, 0.08, 0, 1.2, 0, stripeColor(s), 10);
  b.torus(0.34, 0.05, 0, 1.5, 0, SAFETY_RED, 10, 4, { rx: Math.PI / 2 });
  b.box(0.7, 0.04, 0.04, 0, 1.5, 0, IRON);
  b.box(0.04, 0.04, 0.7, 0, 1.5, 0, IRON);
  b.cyl(0.05, 0.05, 0.3, 0, 1.4, 0, IRON, 4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const cx = Math.cos(a);
    const sz = Math.sin(a);
    pipeRun(b, s.metal, [cx * 0.45, 1.3, sz * 0.45, cx * 0.45, 1.85, sz * 0.45, cx * 1.3, 2.35, sz * 1.3], 0.12);
    b.cyl(0.2, 0.14, 0.2, cx * 1.3, 2.45, sz * 1.3, s.trim, 6);
    c.emit('steam', cx * 1.3, 2.6, sz * 1.3, 1.2);
  }
  // heat exchanger in the corner, piped to the well head
  machine(c, 1.3, 1.0, 1.0, w / 2 - 0.85, 0, -d / 2 + 0.75, { lights: 2, gauge: true });
  pipeRun(b, s.metal, [w / 2 - 0.85, 1.0, -d / 2 + 0.75, w / 2 - 0.85, 1.45, -d / 2 + 0.75, 0.5, 1.45, -0.5], 0.09);
  c.setLight(0, 2.0, 0, '#ff8a3c', 1.0, 8);
  c.levelPips();
});

registerModel('fusion_reactor', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  const r = Math.min(w, d) * 0.33;
  b.cyl(r + 0.5, r + 0.7, 0.8, 0, 0.4, 0, s.machineDark, 12);
  glowRing(b, r + 0.3, 0, 0.82, 0, s.accent, 16);
  b.torus(r, 0.45, 0, 1.9, 0, s.machine, 14, 6, { rx: Math.PI / 2 });
  b.torus(r, 0.12, 0, 1.9, 0, s.accent, 14, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * (r + 0.6);
    const pz = Math.sin(a) * (r + 0.6);
    b.box(0.5, 2.8, 0.5, px, 1.4, pz, s.trim);
    b.box(0.1, 2.4, 0.56, px, 1.5, pz, s.accent, { slot: SLOT_GLOW });
    b.box(0.6, 0.12, 0.6, px, 2.85, pz, stripeColor(s));
    pipe(b, s.metal, px, 2.7, pz, Math.cos(a) * r, 2.4, Math.sin(a) * r, 0.08, 6, true);
  }
  // coolant tanks + control console
  for (const sx of [-1, 1]) {
    const tx = sx * (w / 2 - 0.75);
    const tz = d / 2 - 0.75;
    b.cyl(0.45, 0.45, 1.6, tx, 0.8, tz, s.light, 8, { shade: 0.02 });
    b.cyl(0.48, 0.48, 0.1, tx, 1.2, tz, stripeColor(s), 8);
    b.box(0.08, 1.1, 0.06, tx, 0.8, tz + 0.45, s.accent, { slot: SLOT_GLOW });
    pipe(b, s.metal, tx, 1.5, tz, sx * (r + 0.6), 1.5, Math.sin(Math.PI / 4) * (r + 0.6), 0.07, 6);
  }
  b.box(0.9, 0.9, 0.5, 0, 0.45, d / 2 - 0.9, s.machine);
  screen(b, 0, 0.75, d / 2 - 0.64, 0.6, 0.3, s.accent, 0, -0.4);
  c.part('bobSpin', 0, 1.9, 0, (pb) => {
    pb.sphere(0.65, 0, 0, 0, '#ffffff', 8, { slot: SLOT_GLOW });
    pb.torus(1.0, 0.07, 0, 0, 0, s.accent, 12, 4, { rx: 0.6, slot: SLOT_GLOW });
    pb.torus(1.0, 0.07, 0, 0, 0, s.accent, 12, 4, { rz: 1.2, slot: SLOT_GLOW });
  }, 1.5, 0.12);
  c.emit('motes', 0, 2.2, 0, 6, s.accent.getStyle());
  c.setLight(0, 2.5, 0, s.accent.getStyle(), 1.6, 12);
  c.levelPips();
});

registerModel('battery', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.4, 0.16, d - 0.5, 0, 0.08, 0, s.trim);
  for (const sx of [-1, 1]) b.box(0.1, 1.25, d - 0.8, sx * (w / 2 - 0.3), 0.75, 0, s.trim);
  const bars = 1 + Math.min(2, Math.round(c.lv * 2));
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.5;
    b.box(0.42, 1.1, 0.9, x, 0.71, 0, s.machine);
    for (let k = 0; k < 3; k++) b.box(0.26, 0.08, 0.04, x, 0.5 + k * 0.24, 0.47, k < bars ? GREEN_LED : '#2b2b30', { slot: k < bars ? SLOT_GLOW : 0 });
    b.box(0.16, 0.12, 0.16, x, 1.32, 0, s.metal);
  }
  b.box(1.3, 0.05, 0.08, 0, 1.4, 0, stripeColor(s), { slot: SLOT_GLOW });
  pipe(b, s.metal, -0.5, 1.38, 0.15, 0.5, 1.38, 0.15, 0.025, 4);
  stripes(b, 0, 0.42, d / 2 - 0.26, w - 0.8, 0.1, 4);
});

registerModel('power_pylon', (c) => {
  const { b, s } = c;
  const h = 4.0;
  b.box(1.2, 0.25, 1.2, 0, 0.12, 0, '#9a9690', { shade: 0.03 });
  lattice(b, s.metal, 0, 0.25, 0, h, 0.42, 0.18, 3, 0.1);
  b.box(1.9, 0.1, 0.1, 0, h + 0.25, 0, s.metal);
  b.box(1.3, 0.08, 0.08, 0, h - 0.4, 0, s.metal);
  for (const x of [-0.85, 0.85]) {
    b.cyl(0.05, 0.07, 0.3, x, h + 0.05, 0, '#d9dde3', 5);
    led(b, x, h - 0.15, 0, s.accent, 0.1);
  }
  for (const x of [-0.55, 0.55]) {
    b.cyl(0.05, 0.07, 0.26, x, h - 0.6, 0, '#d9dde3', 5);
    led(b, x, h - 0.78, 0, s.accent, 0.08);
  }
  b.cyl(0.03, 0.04, 0.5, 0, h + 0.5, 0, s.metal, 4);
  b.sphere(0.1, 0, h + 0.8, 0, RED_LED, 5, { slot: SLOT_GLOW });
  b.box(0.3, 0.3, 0.04, 0.3, 1.2, 0.36, HAZARD, { ry: 0.3 });
  b.box(0.16, 0.16, 0.05, 0.3, 1.2, 0.36, '#2b2b30', { ry: 0.3 });
});

// ------------------------------------------------------------------------------------ production

registerModel('logging_camp', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.3, 0.1, new THREE.Color('#7a6a4a'));
  logPile(b, -w / 2 + 0.95, 0.1, -d / 2 + 1.0, 1.7, c.level >= 3 ? 4 : 3);
  // saw shelter
  const bx = w / 2 - 1.1;
  awning(c, bx, 0.1, 2.0, d - 0.7, 2.1);
  b.box(1.4, 0.12, 0.7, bx, 0.78, 0.1, deckColor(s), { shade: 0.04 });
  for (const sx of [-1, 1]) b.box(0.1, 0.72, 0.6, bx + sx * 0.6, 0.36, 0.1, frameColor(s));
  b.cyl(0.16, 0.16, 1.3, bx, 0.98, 0.1, WOOD, 5, { rz: Math.PI / 2, shade: 0.04 });
  if (s.index >= 3) {
    b.box(0.5, 0.4, 0.5, bx, 0.5, 0.1, s.machine);
    led(b, bx + 0.1, 0.62, 0.36, GREEN_LED, 0.07);
    c.part('spinZ', bx, 1.0, 0.1, (pb) => {
      pb.cyl(0.42, 0.42, 0.04, 0, 0, 0, IRON, 12, { rx: Math.PI / 2 });
      pb.cyl(0.1, 0.1, 0.1, 0, 0, 0, s.metal, 6, { rx: Math.PI / 2 });
    }, 9);
  } else {
    saw(b, bx + 0.1, 1.2, 0.1, 0.2);
    b.box(0.06, 1.5, 0.06, bx + 0.8, 0.85, -d / 2 + 0.6, WOOD_DARK, { rz: 0.25 });
    b.box(0.5, 0.06, 0.06, bx + 0.6, 1.6, -d / 2 + 0.6, IRON, { rz: 0.25 });
  }
  lantern(b, bx - 0.8, 1.8, d / 2 - 0.45, frameColor(s), 0.22);
  // chopping block, axe, chips and a plank stack
  stump(b, -w / 2 + 0.8, 0.1, d / 2 - 0.8);
  axe(b, -w / 2 + 0.72, 0.85, d / 2 - 0.9, 0.3, 0.5);
  for (let i = 0; i < 3; i++) b.sphere(0.2, bx - 0.4 + i * 0.35, 0.14, d / 2 - 0.6 - (i % 2) * 0.3, SAWDUST, 4, { sy: 0.35 });
  for (let i = 0; i < 3; i++) b.box(1.2, 0.08, 0.3, -w / 2 + 1.0 + (i % 2) * 0.08, 0.16 + i * 0.09, 0.1 - i * 0.03, i % 2 ? '#c9a06a' : WOOD, { ry: 0.05 * i });
  c.levelPips();
});

registerModel('quarry', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.3, d - 0.2, 0, -0.1, 0, STONE, { shade: 0.05 });
  b.box(w - 1.2, 0.26, d - 1.2, 0.2, 0.0, 0.2, STONE_DARK, { shade: 0.05 });
  b.box(w - 2.2, 0.22, d - 2.2, 0.3, 0.05, 0.3, '#4a4642', { shade: 0.05 });
  // cut blocks + rubble
  for (let i = 0; i < 3; i++) b.box(0.6, 0.42, 0.6, -w / 2 + 0.55 + (i % 2) * 0.62, 0.24, d / 2 - 0.55 - Math.floor(i / 2) * 0.64, STONE_LIGHT, { shade: 0.06 });
  b.box(0.5, 0.36, 0.5, -w / 2 + 0.85, 0.63, d / 2 - 0.6, STONE_LIGHT, { ry: 0.3, shade: 0.06 });
  for (let i = 0; i < 3; i++) b.sphere(0.24 + (i % 2) * 0.08, 0.4 + i * 0.45, 0.22, d / 2 - 1.3 + (i % 2) * 0.3, i % 2 ? STONE_LIGHT : STONE, 5, { shade: 0.07 });
  // timber derrick with a pulley and a swinging block
  const fx = w / 2 - 0.7;
  const fz = -d / 2 + 0.7;
  const fc = frameColor(s);
  b.box(0.18, 2.5, 0.18, fx - 0.45, 1.2, fz, fc, { rz: -0.35 });
  b.box(0.18, 2.5, 0.18, fx + 0.45, 1.2, fz, fc, { rz: 0.35 });
  b.box(0.16, 2.4, 0.16, fx, 1.15, fz + 0.9, fc, { rx: 0.4 });
  b.box(0.2, 0.2, 2.4, fx, 2.35, fz + 0.9, fc);
  b.cyl(0.2, 0.2, 0.08, fx, 2.3, fz + 2.1, IRON, 8, { rz: Math.PI / 2 });
  c.part('rock', fx, 2.3, fz + 2.1, (pb) => {
    pb.box(0.05, 1.1, 0.05, 0, -0.55, 0, '#d9c89a');
    pb.box(0.42, 0.36, 0.42, 0, -1.25, 0, STONE_LIGHT, { shade: 0.05 });
  }, 0.6, 0.18);
  // rails with sleepers and a loaded cart
  for (const z of [0.3, 0.75]) b.box(w - 0.6, 0.06, 0.08, 0, 0.17, z, s.metal);
  for (let i = 0; i < 4; i++) b.box(0.14, 0.05, 0.7, -w / 2 + 0.6 + i * ((w - 1.2) / 3), 0.15, 0.52, WOOD_DARK);
  b.box(0.75, 0.42, 0.6, -0.9, 0.45, 0.52, s.machine, { shade: 0.03 });
  for (const x of [-1.15, -0.65]) b.cyl(0.13, 0.13, 0.75, x, 0.22, 0.52, s.metal, 6, { rx: Math.PI / 2 });
  b.sphere(0.2, -1.0, 0.72, 0.45, STONE_LIGHT, 4);
  b.sphere(0.16, -0.75, 0.7, 0.62, STONE, 4);
  // pickaxe
  b.box(0.06, 0.8, 0.06, 0.9, 0.5, d / 2 - 0.5, WOOD, { rz: 0.5 });
  b.box(0.5, 0.08, 0.06, 0.72, 0.85, d / 2 - 0.5, IRON, { rz: 0.5 });
  c.emit('dust', 0.3, 0.3, 0.3, 0.6, '#b8aa90');
  c.levelPips();
});

registerModel('mine', (c) => {
  const { b, s, w, d } = c;
  b.sphere(Math.min(w, d) * 0.55, 0, 0.1, -0.3, '#6e6258', 8, { sy: 0.7, shade: 0.06 });
  for (let i = 0; i < 3; i++) b.sphere(0.32, -1.1 + i * 1.1, 0.95 - (i % 2) * 0.3, -0.9 - (i % 2) * 0.5, i % 2 ? STONE : STONE_DARK, 5, { shade: 0.07 });
  // timbered entrance with braces and a lantern
  const fc = frameColor(s);
  const ez = d / 2 - 0.5;
  for (const sx of [-1, 1]) {
    b.box(0.3, 1.7, 0.3, sx * 0.75, 0.85, ez, fc);
    b.box(0.12, 0.8, 0.12, sx * 0.55, 1.45, ez + 0.1, fc, { rz: sx * 0.6 });
  }
  b.box(2.0, 0.3, 0.36, 0, 1.8, ez, fc);
  b.box(1.3, 1.5, 0.3, 0, 0.75, ez - 0.25, DARK);
  lantern(b, 0.95, 2.18, ez, fc, 0.22);
  // rails with sleepers, a bumper and a scrolling ore cart
  for (const x of [-0.35, 0.35]) b.box(0.06, 0.06, d - 0.2, x, 0.03, 0, s.metal);
  for (let i = 0; i < 4; i++) b.box(0.9, 0.05, 0.12, 0, 0.02, -d / 2 + 0.5 + i * ((d - 1.0) / 3), WOOD_DARK);
  b.box(0.9, 0.2, 0.12, 0, 0.12, -d / 2 + 0.18, fc);
  c.part('scroll', 0, 0.3, d / 2 - 0.2, (pb) => {
    pb.box(0.8, 0.5, 0.7, 0, 0, 0, s.machine, { shade: 0.03 });
    for (const z of [-0.25, 0.25]) pb.cyl(0.14, 0.14, 0.9, 0, -0.22, z, s.metal, 6, { rz: Math.PI / 2 });
    pb.sphere(0.24, 0, 0.3, 0, STONE, 4);
    pb.sphere(0.18, 0.2, 0.34, 0.15, '#c9a48b', 4);
    if (s.index >= 3) pb.shard(0.12, 0.28, -0.18, 0.4, -0.1, s.accent, { slot: SLOT_GLOW });
  }, 0.6, 1.0);
  // ore crate + pickaxe
  crate(b, -w / 2 + 0.6, 0, d / 2 - 0.6, 0.5, WOOD, WOOD_DARK, 0.3);
  b.shard(0.1, 0.24, -w / 2 + 0.6, 0.6, d / 2 - 0.6, s.index >= 3 ? s.accent : '#c9a48b', { slot: accentSlot(s) });
  b.box(0.06, 0.8, 0.06, w / 2 - 0.5, 0.45, d / 2 - 0.6, WOOD, { rz: -0.45 });
  b.box(0.5, 0.08, 0.06, w / 2 - 0.68, 0.8, d / 2 - 0.6, IRON, { rz: -0.45 });
  c.setLight(0, 1.6, d / 2, '#ffb95c', 0.7, 6);
  c.levelPips();
});

registerModel('drill', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2);
  const h = 3.4 + c.lv * 0.4;
  lattice(b, frameColor(s), 0, 0.2, 0, h - 0.6, 1.0, 0.55, 2, 0.16);
  b.box(1.2, 0.6, 1.2, 0, h - 0.1, 0, s.machine, { shade: 0.02 });
  stripes(b, 0, h - 0.1, 0.62, 1.0, 0.14, 4);
  led(b, -0.4, h + 0.1, 0.62, GREEN_LED, 0.08);
  led(b, -0.2, h + 0.1, 0.62, s.accent, 0.08);
  c.part('pump', 0, h - 0.5, 0, (pb) => {
    pb.cyl(0.12, 0.12, 2.2, 0, -1.1, 0, s.metal, 6);
    for (let i = 0; i < 4; i++) pb.box(0.34, 0.07, 0.07, 0, -1.4 + i * 0.3, 0, IRON, { ry: i * 0.8 });
    pb.cone(0.3, 0.6, 0, -2.4, 0, IRON, 6, { rx: Math.PI });
    for (let i = 0; i < 3; i++) pb.box(0.5, 0.06, 0.06, 0, -0.6 + i * 0.5, 0, s.accent, { ry: i, slot: SLOT_GLOW });
  }, 3, 0.3);
  machine(c, 1.0, 0.8, 0.8, w / 2 - 0.75, 0, d / 2 - 0.65, { lights: 2, gauge: true });
  pipe(b, s.metal, w / 2 - 0.75, 0.8, d / 2 - 0.65, 0.55, 1.2, 0.55, 0.07, 6, true);
  for (let i = 0; i < 2; i++) b.sphere(0.4 - i * 0.1, -w / 2 + 0.75 + i * 0.5, 0.3, d / 2 - 0.8 - i * 0.3, i ? '#9c8d78' : '#8a7a62', 5, { sy: 0.6, shade: 0.06 });
  c.emit('dust', 0, 0.3, 0, 2, '#9c8d78');
  c.levelPips();
});

registerModel('harvester', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.2, d - 0.2, 0, 0.08, 0, SOIL, { shade: 0.05 });
  for (let r = 0; r < 3; r++) {
    const z = -d / 2 + 0.6 + r * ((d - 1.2) / 2);
    b.box(w - 1.0, 0.08, 0.4, 0, 0.2, z, '#4a3321');
    for (let i = 0; i < 4; i++) b.sphere(0.22, -w / 2 + 0.6 + i * ((w - 1.2) / 3), 0.38, z, (i + r) % 2 ? LEAF : LEAF2, 4, { sy: 0.8 });
  }
  for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) b.box(w - 0.1, 0.12, 0.12, 0, 1.5, z, s.metal);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, 1.5, 0.14, sx * (w / 2 - 0.1), 0.75, sz * (d / 2 - 0.15), s.trim);
  c.part('slide', 0, 1.5, 0, (pb) => {
    pb.box(0.5, 0.3, d, 0, 0, 0, s.machine);
    pb.box(0.6, 0.4, 0.8, 0, 0.3, 0, s.machineDark);
    pb.box(0.52, 0.08, d - 0.4, 0, -0.1, 0, s.accent, { slot: SLOT_GLOW });
    for (let i = 0; i < 3; i++) pb.cyl(0.05, 0.05, 1.0, 0, -0.65, -d / 2 + 0.6 + i * ((d - 1.2) / 2), s.metal, 4);
  }, 0.5, (w - 1.0) / 2);
  // produce bin + control box
  b.box(0.9, 0.6, 0.9, w / 2 - 0.55, 0.3, d / 2 - 0.55, s.machine, { shade: 0.03 });
  b.sphere(0.2, w / 2 - 0.65, 0.65, d / 2 - 0.6, '#ef6b5b', 4);
  b.sphere(0.18, w / 2 - 0.4, 0.62, d / 2 - 0.45, '#f0b24b', 4);
  b.box(0.4, 0.6, 0.4, -w / 2 + 0.4, 0.3, d / 2 - 0.5, s.machineDark);
  led(b, -w / 2 + 0.4, 0.5, d / 2 - 0.28, GREEN_LED, 0.08);
  c.levelPips();
});

registerModel('drone_hub', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  const R = Math.min(w, d) * 0.42;
  b.cyl(R, R + 0.04, 0.3, 0, 0.35, 0, s.machine, 12);
  glowRing(b, R * 0.84, 0, 0.52, 0, s.accent, 14);
  b.box(0.1, 0.03, 1.0, -0.4, 0.52, 0, WHITE);
  b.box(0.1, 0.03, 1.0, 0.4, 0.52, 0, WHITE);
  b.box(0.8, 0.03, 0.1, 0, 0.52, 0, WHITE);
  // control tower with a dish
  machine(c, 1.2, 1.6, 1.0, -w / 2 + 0.75, 0, -d / 2 + 0.65, { lights: 2 });
  dish(b, -w / 2 + 0.55, 1.75, -d / 2 + 0.65, 0.4, 0.6, s.light);
  c.antenna(-w / 2 + 1.1, 1.6, -d / 2 + 0.75, 1.0, s.accent.getStyle());
  // hovering drone
  c.part('bobSpin', 0, 1.8, 0, (pb) => {
    pb.box(0.5, 0.2, 0.5, 0, 0, 0, s.machine);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pb.box(0.4, 0.05, 0.05, sx * 0.3, 0.05, sz * 0.3, s.metal, { ry: Math.PI / 4 });
      pb.cyl(0.26, 0.26, 0.03, sx * 0.42, 0.1, sz * 0.42, s.accent, 6, { slot: SLOT_GLOW });
    }
    pb.box(0.1, 0.1, 0.1, 0, -0.1, 0.2, GREEN_LED, { slot: SLOT_GLOW });
  }, 0.6, 0.3);
  // parked drone + charging posts + parcels
  b.box(0.4, 0.16, 0.4, R * 0.5, 0.58, R * 0.45, s.machine);
  for (const sx of [-1, 1]) {
    b.box(0.5, 0.04, 0.04, R * 0.5 + sx * 0.25, 0.62, R * 0.45, s.metal, { ry: Math.PI / 4 });
    b.cyl(0.2, 0.2, 0.03, R * 0.5 + sx * 0.3, 0.66, R * 0.45 + sx * 0.3, s.accent, 6, { slot: SLOT_GLOW });
  }
  for (let i = 0; i < 3; i++) {
    const a = 0.9 + i * 0.75;
    b.box(0.16, 0.9, 0.16, Math.cos(a) * (R + 0.35), 0.45, Math.sin(a) * (R + 0.35), s.trim);
    led(b, Math.cos(a) * (R + 0.35), 0.95, Math.sin(a) * (R + 0.35), s.accent, 0.1);
  }
  crate(b, w / 2 - 0.6, 0, -d / 2 + 0.6, 0.5, '#c9a06a', WOOD_DARK, 0.2);
  crate(b, w / 2 - 0.6, 0.5, -d / 2 + 0.6, 0.36, '#c9a06a', WOOD_DARK, -0.4);
  c.levelPips();
});

registerModel('robot_bay', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  shed(c, w - 0.8, d - 1.0, 2.6, 0, -0.3, { roof: 'flat', windows: false, door: Math.min(2.4, w * 0.45), hazard: true, shutter: true });
  // rooftop unit
  b.box(0.8, 0.4, 0.8, -w / 2 + 1.0, 2.95, -d / 2 + 0.9, s.light);
  b.cyl(0.3, 0.3, 0.06, -w / 2 + 1.0, 3.17, -d / 2 + 0.9, s.machineDark, 8);
  // welding arm
  c.part('rock', w / 2 - 1.0, 0.6, d / 2 - 0.3, (pb) => {
    pb.box(0.2, 1.2, 0.2, 0, 0.6, 0, s.metal);
    pb.box(0.2, 0.2, 0.9, 0, 1.2, 0.35, s.metal);
    pb.box(0.16, 0.5, 0.16, 0, 0.95, 0.75, s.metal);
    pb.box(0.26, 0.2, 0.26, 0, 0.65, 0.75, s.accent, { slot: SLOT_GLOW });
  }, 0.9, 0.3);
  // robot chassis on a stand
  const rx = -w / 2 + 1.0;
  const rz = d / 2 - 0.7;
  b.cyl(0.3, 0.36, 0.3, rx, 0.15, rz, s.machineDark, 6);
  b.box(0.5, 0.6, 0.4, rx, 0.65, rz, s.light, { shade: 0.03 });
  b.box(0.3, 0.26, 0.3, rx, 1.1, rz, s.light);
  led(b, rx - 0.08, 1.12, rz + 0.16, s.accent, 0.07);
  led(b, rx + 0.08, 1.12, rz + 0.16, s.accent, 0.07);
  for (const sx of [-1, 1]) b.box(0.12, 0.5, 0.12, rx + sx * 0.32, 0.65, rz, s.metal, { rz: sx * 0.2 });
  c.emit('sparks', w / 2 - 1.0, 1.25, d / 2 + 0.45, 0.8, s.accent.getStyle());
  c.levelPips();
});

registerModel('workbench', (c) => {
  const { b, s, w, d } = c;
  const top = 0.95;
  b.box(w - 0.4, 0.14, d - 0.6, 0, top, 0, deckColor(s), { shade: 0.04 });
  b.box(w - 0.5, 0.1, d - 0.7, 0, top - 0.12, 0, frameColor(s));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.14, top, 0.14, sx * (w / 2 - 0.35), top / 2, sz * (d / 2 - 0.45), postColor(s));
  b.box(w - 0.6, 0.06, d - 0.8, 0, 0.32, 0, frameColor(s));
  crate(b, -w / 2 + 0.8, 0.35, 0.05, 0.38, s.index >= 3 ? s.machine : WOOD, s.index >= 3 ? s.machineDark : WOOD_DARK, 0.2);
  sack(b, w / 2 - 0.8, 0.35, 0.05);
  // vice, hammer, saw, plank, sawdust
  b.box(0.4, 0.26, 0.3, -w / 2 + 0.6, top + 0.2, 0.15, s.metal);
  b.box(0.14, 0.26, 0.3, -w / 2 + 0.88, top + 0.2, 0.15, IRON);
  b.cyl(0.03, 0.03, 0.45, -w / 2 + 0.6, top + 0.3, 0.15, IRON, 4, { rz: Math.PI / 2 });
  hammer(b, 0.1, top + 0.1, 0.25, 0.4);
  b.box(0.9, 0.06, 0.25, 0.4, top + 0.1, -0.2, '#c9a06a');
  saw(b, w / 2 - 0.9, top + 0.14, -0.2, -0.15);
  b.sphere(0.18, w / 2 - 0.55, top + 0.08, 0.3, SAWDUST, 4, { sy: 0.35 });
  // pegboard with tools
  const pz = -d / 2 + 0.32;
  b.box(w - 0.6, 1.0, 0.08, 0, top + 0.6, pz, s.index <= 2 ? s.base : s.machineDark, { shade: 0.03 });
  b.box(0.06, 0.5, 0.06, -0.5, top + 0.55, pz + 0.06, WOOD);
  b.box(0.26, 0.12, 0.08, -0.5, top + 0.85, pz + 0.06, IRON);
  b.box(0.06, 0.45, 0.06, 0, top + 0.6, pz + 0.06, IRON);
  b.box(0.16, 0.14, 0.07, 0, top + 0.88, pz + 0.06, IRON);
  b.box(0.05, 0.4, 0.05, 0.5, top + 0.6, pz + 0.06, IRON, { rz: 0.2 });
  b.box(0.05, 0.4, 0.05, 0.5, top + 0.6, pz + 0.06, IRON, { rz: -0.2 });
  if (glows(s)) {
    b.box(0.5, 0.05, 0.05, w / 2 - 0.9, top + 1.05, pz + 0.1, s.metal, { rz: -0.4 });
    led(b, w / 2 - 0.7, top + 0.95, pz + 0.2, '#ffd27a', 0.12);
  } else {
    b.sphere(0.1, w / 2 - 0.5, top + 0.2, 0.3, s.accent, 5);
  }
});

// ------------------------------------------------------------------------------------ crafting

registerModel('forge', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.2, 0.2, new THREE.Color('#6a6058'));
  const bw = w - 1.0;
  const bd = d - 1.3;
  const bx = -0.3;
  const bz = -0.3;
  const body = s.index <= 1 ? STONE : s.index === 2 ? BRICK : s.machine;
  const line = s.index <= 1 ? STONE_DARK : s.index === 2 ? BRICK_DARK : stripeColor(s);
  b.box(bw, 1.7, bd, bx, 0.85, bz, body, { shade: s.index <= 2 ? 0.08 : 0.02 });
  for (const yy of [0.5, 1.15]) b.box(bw + 0.04, 0.06, bd + 0.04, bx, yy, bz, line);
  b.box(bw + 0.1, 0.12, bd + 0.1, bx, 1.72, bz, frameColor(s));
  if (s.index >= 3) rivets(b, s.metal, bx - bw / 2 + 0.2, 1.5, bz + bd / 2 + 0.03, bx + bw / 2 - 0.2, 1.5, bz + bd / 2 + 0.03, 4);
  furnace(c, bx, 0.8, bz + bd / 2, Math.min(1.2, bw * 0.45), 0.8, 0, 3);
  stack(c, bx - bw / 2 + 0.5, 1.75, bz - bd / 2 + 0.5, 1.6, 0.24, 2.5);
  // bellows
  c.part('rock', bx + bw / 2 + 0.02, 1.25, bz - 0.2, (pb) => {
    pb.box(0.6, 0.26, 0.5, 0.3, 0, 0, '#8a5a3a', { shade: 0.04 });
    pb.box(0.62, 0.05, 0.52, 0.3, 0.14, 0, WOOD_DARK);
    pb.box(0.4, 0.05, 0.05, 0.7, 0.15, 0, WOOD_DARK);
    pb.cyl(0.05, 0.05, 0.3, -0.1, -0.05, 0, IRON, 5, { rz: Math.PI / 2 });
  }, 1.6, 0.22);
  // anvil on a stump with a hot ingot, quench barrel, coal, tongs
  const ax = w / 2 - 0.75;
  const az = d / 2 - 0.75;
  stump(b, ax, 0, az, 0.3, 0.45);
  anvil(b, ax, 0.47, az, 0.4);
  b.box(0.24, 0.06, 0.1, ax, 0.9, az, MOLTEN, { ry: 0.4, slot: SLOT_GLOW });
  hammer(b, ax - 0.45, 0.06, az + 0.1, 1.1);
  barrel(b, -w / 2 + 0.6, 0, d / 2 - 0.65, s.index <= 2 ? WOOD_DARK : s.trim, s.metal, 0.3, 0.7);
  b.cyl(0.26, 0.26, 0.04, -w / 2 + 0.6, 0.72, d / 2 - 0.65, WATER, 7);
  for (let i = 0; i < 2; i++) b.sphere(0.2, bx - bw / 2 + 0.5 + i * 0.35, 0.12, bz + bd / 2 + 0.3, '#2a2622', 4, { sy: 0.6 });
  b.box(0.05, 0.9, 0.05, bx - bw / 2 - 0.08, 0.45, bz + 0.3, IRON, { rz: 0.25 });
  b.box(0.05, 0.9, 0.05, bx - bw / 2 - 0.08, 0.45, bz + 0.1, IRON, { rz: 0.2 });
  if (w >= 5) {
    awning(c, ax - 0.1, az - 0.2, 1.8, 1.5, 2.2);
    lantern(b, ax - 0.9, 1.9, az - 0.9, frameColor(s), 0.22);
  }
  c.emit('sparks', ax, 0.95, az, 0.6, '#ffb347');
  c.setLight(bx, 1.0, bz + bd / 2 + 0.3, '#ff8a3c', 1.1, 7);
  c.levelPips();
});

registerModel('smelter', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  machine(c, w - 0.8, 1.2, d - 0.8, 0, 0.2, 0, { lights: 3, gauge: false });
  const fx = -w / 4;
  const body = s.index <= 1 ? STONE : s.index === 2 ? BRICK : s.machine;
  const band = s.index <= 2 ? STONE_DARK : stripeColor(s);
  b.cyl(1.0, 1.1, 1.6, fx, 2.2, 0, body, 8, { shade: s.index <= 2 ? 0.07 : 0.02 });
  b.cyl(0.6, 1.0, 1.2, fx, 3.6, 0, body, 8, { shade: s.index <= 2 ? 0.07 : 0.02 });
  for (const [yy, rr] of [[1.7, 1.08], [2.6, 1.04], [3.5, 0.78]]) b.cyl(rr, rr, 0.1, fx, yy, 0, band, 8);
  furnace(c, fx, 1.95, 1.07, 0.8, 0.6, 0, 2);
  // molten channel to the ladle
  b.box(1.4, 0.14, 0.3, fx + 0.8, 1.48, 1.1, s.metal);
  b.box(1.3, 0.06, 0.16, fx + 0.8, 1.56, 1.1, MOLTEN, { slot: SLOT_GLOW });
  b.cyl(0.5, 0.38, 0.6, w / 4, 1.7, 0.8, s.metal, 8);
  b.cyl(0.42, 0.42, 0.08, w / 4, 2.0, 0.8, MOLTEN, 8, { slot: SLOT_GLOW });
  b.box(0.08, 0.5, 0.5, w / 4 + 0.55, 1.7, 0.8, s.trim);
  // hopper + chute feeding the furnace top
  b.cone(0.5, 0.6, w / 4 + 0.2, 3.1, -0.9, s.trim, 6, { rx: Math.PI });
  b.box(0.8, 0.5, 0.8, w / 4 + 0.2, 3.6, -0.9, s.trim);
  b.box(0.08, 2.6, 0.08, w / 4 + 0.5, 1.5, -1.2, s.metal);
  b.box(1.9, 0.14, 0.5, fx + 1.0, 3.95, -0.5, s.trim, { rz: 0.42, ry: 0.4 });
  stack(c, fx, 4.2, 0, 1.4, 0.3, 4);
  // blower pipe + gauge
  pipeRun(b, s.metal, [w / 4 - 0.3, 1.2, -1.3, w / 4 - 0.3, 1.9, -1.3, fx + 0.9, 2.4, -0.6], 0.1);
  gauge(b, fx + 1.05, 2.6, 0.5, 0, 0.14);
  c.emit('sparks', w / 4, 2.1, 0.8, 1.2, '#ffb347');
  c.setLight(fx, 2.2, 1.4, '#ff7a3c', 1.3, 9);
  c.levelPips();
});

registerModel('electronics_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  shed(c, w - 0.6, d - 0.6, 2.3, 0, 0, { roof: 'flat', windows: true, door: true, wall: s.index <= 2 ? s.base : new THREE.Color('#dfe6ee') });
  const colors = [GREEN_LED, RED_LED, BLUE_LED, '#ffd84a'];
  for (let i = 0; i < 4; i++) led(b, -w / 2 + 0.7 + i * 0.3, 2.05, d / 2 - 0.26, colors[i], 0.09);
  // circuit sign plate
  b.box(0.9, 0.5, 0.06, w / 2 - 1.0, 1.6, d / 2 - 0.26, s.machineDark);
  b.box(0.6, 0.04, 0.04, w / 2 - 1.05, 1.68, d / 2 - 0.22, s.accent, { slot: SLOT_GLOW });
  b.box(0.04, 0.3, 0.04, w / 2 - 0.8, 1.55, d / 2 - 0.22, s.accent, { slot: SLOT_GLOW });
  b.box(0.3, 0.04, 0.04, w / 2 - 1.15, 1.5, d / 2 - 0.22, s.accent, { slot: SLOT_GLOW });
  // rooftop: spinning dish, AC unit, antenna, conduit
  c.part('spinY', w / 2 - 0.9, 2.6, -d / 2 + 0.9, (pb) => {
    pb.cyl(0.1, 0.14, 0.2, 0, 0, 0, s.metal, 6);
    dish(pb, 0, 0.25, 0, 0.45, 0.7, s.light, s.accent);
  }, 0.7);
  b.box(0.7, 0.4, 0.6, -w / 2 + 0.9, 2.75, -d / 2 + 0.8, s.light);
  b.cyl(0.26, 0.26, 0.05, -w / 2 + 0.9, 2.97, -d / 2 + 0.8, s.machineDark, 8);
  c.antenna(-w / 2 + 0.9, 2.55, d / 2 - 0.9, 1.3, s.accent.getStyle());
  pipeRun(b, s.metal, [w / 2 - 0.25, 0.4, 0.3, w / 2 - 0.25, 2.4, 0.3, w / 2 - 0.9, 2.4, -d / 2 + 0.9], 0.06);
  c.levelPips();
});

registerModel('factory', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  shed(c, w - 0.6, d - 0.6, 3.0, 0, 0, { roof: 'saw', windows: false, door: Math.min(2.4, w * 0.4), hazard: true });
  stack(c, -w / 2 + 0.8, 3.0, -d / 2 + 0.8, 2.0, 0.26, 4);
  stack(c, -w / 2 + 1.6, 3.0, -d / 2 + 0.8, 1.6, 0.22, 3);
  pipe(b, s.metal, -w / 2 + 0.8, 3.6, -d / 2 + 0.8, -w / 2 + 1.6, 3.6, -d / 2 + 0.8, 0.08, 6, true);
  // rooftop water tank
  b.cyl(0.5, 0.5, 0.9, w / 2 - 1.0, 3.75, -d / 2 + 1.0, s.light, 8, { shade: 0.02 });
  b.cyl(0.53, 0.53, 0.1, w / 2 - 1.0, 3.75, -d / 2 + 1.0, stripeColor(s), 8);
  for (const sx of [-1, 1]) b.box(0.1, 0.5, 0.1, w / 2 - 1.0 + sx * 0.35, 3.1, -d / 2 + 1.0, s.metal);
  // loading dock with crates, side conveyor stub, sign and flywheel
  b.box(2.0, 0.5, 0.8, w / 2 - 1.5, 0.25, d / 2 - 0.55, s.trim, { shade: 0.03 });
  crate(b, w / 2 - 1.9, 0.5, d / 2 - 0.55, 0.5, s.index >= 3 ? s.machine : WOOD, s.index >= 3 ? s.machineDark : WOOD_DARK, 0.2);
  crate(b, w / 2 - 1.1, 0.5, d / 2 - 0.5, 0.4, s.index >= 3 ? s.machine : WOOD, s.index >= 3 ? s.machineDark : WOOD_DARK, -0.3);
  b.box(1.1, 0.14, 0.5, -w / 2 + 0.3, 0.9, 1.0, s.machineDark);
  for (let i = 0; i < 3; i++) b.box(0.08, 0.1, 0.44, -w / 2 + 0.05 + i * 0.3, 0.98, 1.0, s.metal);
  b.box(0.3, 0.26, 0.3, -w / 2 + 0.35, 1.1, 1.0, '#c9a48b');
  b.box(1.6, 0.26, 0.06, 0, 2.55, d / 2 - 0.26, s.accent, { slot: SLOT_GLOW });
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
  b.box(w - 0.9, 0.05, 0.05, 0, 1.0, d / 2 - 0.45, s.accent, { slot: SLOT_GLOW });
  b.box(w - 0.9, 0.05, 0.05, 0, 1.0, -d / 2 + 0.45, s.accent, { slot: SLOT_GLOW });
  vent(b, -w / 2 + 1.2, 0.55, d / 2 - 0.44, 0.7, 0.4, s.machine);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (w / 2 - 0.6);
    const pz = sz * (d / 2 - 0.6);
    b.box(0.3, 3.0, 0.3, px, 1.5, pz, s.trim, { shade: 0.02 });
    b.box(0.34, 0.08, 0.34, px, 2.9, pz, s.accent, { slot: SLOT_GLOW });
    pipe(b, s.metal, px, 2.6, pz, sx * 0.7, 2.3, sz * 0.7, 0.06, 5);
    led(b, sx * 0.7, 2.3, sz * 0.7, s.accent, 0.12);
  }
  b.box(w - 0.9, 0.3, d - 0.9, 0, 3.05, 0, s.machine);
  glowRing(b, 0.9, 0, 2.9, 0, s.accent, 12);
  c.part('bobSpin', 0, 2.0, 0, (pb) => {
    pb.shard(0.45, 0.8, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
    pb.torus(0.8, 0.05, 0, 0, 0, s.accent, 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(0.65, 0.05, 0, 0, 0, s.accent, 12, 4, { rx: 1.1, slot: SLOT_GLOW });
  }, 1.2, 0.15);
  b.box(0.6, 0.8, 0.4, w / 2 - 0.8, 0.4, d / 2 - 0.65, s.machine);
  screen(b, w / 2 - 0.8, 0.65, d / 2 - 0.43, 0.4, 0.25, s.accent, 0, -0.4);
  pipe(b, s.metal, w / 2 - 0.8, 0.8, d / 2 - 0.85, w / 2 - 0.8, 1.0, -0.5, 0.05, 5);
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
  for (const yy of [1.1, 2.9]) b.cyl(0.56, 0.56, 0.08, 0, yy, 0, s.accent, 8, { slot: SLOT_GLOW });
  b.torus(r, 0.3, 0, 1.6, 0, s.machine, 14, 6, { rx: Math.PI / 2 });
  b.torus(r, 0.08, 0, 1.6, 0, s.accent, 14, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const tx = Math.cos(a) * (r + 0.3);
    const tz = Math.sin(a) * (r + 0.3);
    b.cyl(0.42, 0.42, 1.3, tx, 1.25, tz, s.machine, 8, { shade: 0.02 });
    b.box(0.12, 0.8, 0.08, tx - Math.cos(a) * 0.42, 1.2, tz - Math.sin(a) * 0.42, s.accent, { ry: -a, slot: SLOT_GLOW });
    pipe(b, s.metal, tx, 1.9, tz, Math.cos(a) * 0.5, 2.3, Math.sin(a) * 0.5, 0.07, 6, true);
  }
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
  for (let i = 0; i < 5; i++) b.cyl(0.08, 0.08, 0.8, -0.8 + i * 0.4, 0.42, 0, s.metal, 5, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.12, 0.3, 0.12, sx * 0.85, 0.15, sz * 0.36, s.trim);
  b.box(1.9, 0.1, 0.05, 0, 0.5, -0.4, s.trim);
  b.box(1.9, 0.05, 0.05, 0, 0.4, 0.44, s.accent, { slot: SLOT_GLOW });
  b.box(0.3, 0.3, 0.3, 0.8, 0.2, 0.55, s.machine);
  led(b, 0.8, 0.3, 0.72, GREEN_LED, 0.07);
  // two items spaced exactly one wrap apart so the flow is seamless
  c.part('scroll', 0, 0.55, 0, (pb) => {
    pb.box(0.3, 0.25, 0.3, -0.475, 0, 0, '#c9a48b');
    pb.box(0.32, 0.1, 0.16, 0.475, -0.08, 0, IRON);
    pb.box(0.26, 0.08, 0.12, 0.475, 0.0, 0, IRON);
  }, 1.0, 0.475);
});

// ------------------------------------------------------------------------------------ research

registerModel('research_desk', (c) => {
  const { b, s } = c;
  b.box(1.5, 0.1, 0.8, 0, 0.8, -0.2, deckColor(s), { shade: 0.03 });
  for (const sx of [-1, 1]) b.box(0.1, 0.8, 0.7, sx * 0.65, 0.4, -0.2, frameColor(s));
  b.cyl(0.22, 0.22, 0.08, 0, 0.5, 0.5, frameColor(s), 6);
  b.cyl(0.05, 0.05, 0.5, 0, 0.25, 0.5, frameColor(s), 6);
  b.box(0.45, 0.03, 0.35, 0.05, 0.87, -0.1, PAPER, { ry: 0.2 });
  b.box(0.36, 0.04, 0.26, 0.1, 0.9, -0.05, '#e8f1ff', { ry: -0.3 });
  b.box(0.3, 0.03, 0.22, 0.2, 0.93, -0.15, '#d4b48a', { ry: 0.1, rz: 0.12 });
  // microscope + vial rack
  b.cyl(0.12, 0.14, 0.06, -0.48, 0.88, -0.3, s.metal, 6);
  b.box(0.06, 0.34, 0.06, -0.52, 1.05, -0.36, s.metal, { rx: -0.3 });
  b.cyl(0.04, 0.05, 0.3, -0.46, 1.1, -0.28, IRON, 5, { rx: 0.5 });
  b.box(0.36, 0.06, 0.14, -0.1, 0.88, -0.48, frameColor(s));
  for (let i = 0; i < 3; i++) b.cyl(0.035, 0.035, 0.22, -0.22 + i * 0.12, 1.0, -0.48, [GREEN_LED, '#ff6f91', BLUE_LED][i], 5, { slot: SLOT_GLOW });
  // board behind the desk
  b.box(1.4, 0.8, 0.06, 0, 1.4, -0.6, s.index <= 2 ? '#2f3a30' : '#23262d');
  for (const sx of [-1, 1]) b.box(0.06, 1.0, 0.06, sx * 0.62, 1.1, -0.6, frameColor(s));
  for (let i = 0; i < 3; i++) b.box(0.5 - i * 0.12, 0.04, 0.03, -0.3 + i * 0.1, 1.6 - i * 0.2, -0.56, s.index <= 2 ? PAPER : s.accent, { slot: accentSlot(s) });
  if (s.index <= 2) {
    b.cyl(0.03, 0.03, 0.6, 0.45, 1.1, -0.4, s.metal, 4);
    b.cone(0.18, 0.2, 0.45, 1.45, -0.4, '#ffd36b', 7, { slot: SLOT_GLOW });
  } else {
    c.part('bobSpin', 0.45, 1.3, -0.3, (pb) => {
      pb.sphere(0.2, 0, 0, 0, s.accent, 6, { slot: SLOT_GLOW });
      pb.torus(0.3, 0.03, 0, 0, 0, s.accent, 10, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    }, 1.5, 0.06);
  }
  c.setLight(0.4, 1.3, -0.4, '#ffd36b', 0.5, 5);
});

registerModel('research_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  shed(c, w - 0.6, d - 0.6, 2.4, 0, 0, { roof: 'flat', windows: true, door: true, wall: s.index <= 2 ? s.base : new THREE.Color('#e3eaf1') });
  const R = Math.min(w, d) * 0.3;
  b.cyl(R, R, 0.3, 0, 2.65, 0, s.trim, 10);
  b.sphere(R, 0, 2.8, 0, '#ffffff', 8, { sy: 0.7, slot: SLOT_GLASS });
  if (glows(s)) glowRing(b, R + 0.05, 0, 2.82, 0, s.accent, 12);
  c.antenna(w / 2 - 0.6, 2.5, -d / 2 + 0.6, 1.3, s.accent.getStyle());
  c.part('spinY', -w / 2 + 0.9, 2.6, -d / 2 + 0.9, (pb) => {
    pb.cyl(0.12, 0.16, 0.2, 0, 0, 0, s.metal, 6);
    dish(pb, 0, 0.25, 0, 0.5, 0.8, '#dfe6ee', s.accent);
  }, 0.8);
  // rooftop reagent tanks with a pipe to the dome
  vial(b, w / 2 - 0.9, 2.56, d / 2 - 0.9, 0.16, 0.9, s.accent);
  vial(b, w / 2 - 1.35, 2.56, d / 2 - 0.9, 0.13, 0.7, '#ff6f91');
  pipe(b, s.metal, w / 2 - 0.9, 3.4, d / 2 - 0.9, R * 0.7, 3.0, R * 0.5, 0.05, 5, true);
  c.emit('motes', 0, 2.9, 0, 1.5, s.accent.getStyle());
  c.levelPips();
});

registerModel('advanced_lab', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const wall = s.index <= 2 ? s.base : new THREE.Color('#dfe6ee');
  b.box(w - 0.7, 1.6, d - 0.7, 0, 0.8, 0, wall, { shade: 0.015 });
  b.box(w - 0.6, 0.6, d - 0.6, 0, 1.5, 0, '#ffffff', { slot: SLOT_GLASS });
  b.box(w - 0.9, 0.1, d - 0.9, 0, 1.85, 0, stripeColor(s));
  b.box(w - 1.0, 1.4, d - 1.0, 0, 2.5, 0, s.light, { shade: 0.015 });
  b.box(w - 0.8, 0.16, d - 0.8, 0, 3.25, 0, s.trim);
  b.box(w - 0.7, 0.05, 0.08, 0, 3.34, d / 2 - 0.4, s.accent, { slot: SLOT_GLOW });
  b.box(w - 0.7, 0.05, 0.08, 0, 3.34, -d / 2 + 0.4, s.accent, { slot: SLOT_GLOW });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.box(0.26, 3.4, 0.26, sx * (w / 2 - 0.4), 1.7, sz * (d / 2 - 0.4), s.trim);
    b.box(0.3, 0.1, 0.3, sx * (w / 2 - 0.4), 3.42, sz * (d / 2 - 0.4), s.accent, { slot: SLOT_GLOW });
  }
  // entrance canopy + screens + dish
  b.box(0.9, 1.3, 0.1, 0, 0.65, d / 2 - 0.32, s.dark);
  b.box(1.8, 0.1, 0.8, 0, 1.4, d / 2 - 0.5, s.trim);
  for (const sx of [-1, 1]) b.box(0.1, 1.3, 0.1, sx * 0.8, 0.7, d / 2 - 0.2, s.trim);
  for (const sx of [-1, 1]) screen(b, sx * (w / 4 - 0.2), 2.6, d / 2 - 0.47, 0.7, 0.5, s.accent, 0);
  for (const sx of [-1, 1]) b.cyl(0.1, 0.1, 2.8, sx * (w / 2 - 0.9), 1.5, d / 2 - 0.42, s.accent, 6, { slot: SLOT_GLOW });
  dish(b, w / 2 - 1.2, 3.35, -d / 2 + 1.2, 0.5, 0.7, s.light, s.accent);
  b.cyl(0.6, 0.8, 0.6, 0, 3.55, 0, s.trim, 8);
  c.part('bobSpin', 0, 4.5, 0, (pb) => {
    pb.sphere(0.5, 0, 0, 0, s.accent, 8, { slot: SLOT_GLOW });
    pb.torus(0.85, 0.05, 0, 0, 0, '#ffffff', 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(0.7, 0.05, 0, 0, 0, '#ffffff', 12, 4, { rz: 0.9, slot: SLOT_GLOW });
  }, 1.0, 0.15);
  c.emit('motes', 0, 4.5, 0, 4, s.accent.getStyle());
  c.setLight(0, 4.5, 0, s.accent.getStyle(), 1.0, 9);
  c.levelPips();
});

registerModel('med_bay', (c) => {
  const { b, s, w, d } = c;
  c.foundation();
  const bd = d - 1.2;
  shed(c, w - 0.8, bd, 2.2, 0, -0.2, { roof: s.index <= 2 ? 'gable' : 'flat', windows: true, door: true, wall: s.index <= 2 ? s.base : new THREE.Color('#f2f5f8') });
  const fz = -0.2 + bd / 2;
  // red-and-white awning over the door
  for (let i = 0; i < 4; i++) b.box(0.35, 0.06, 0.6, -0.525 + i * 0.35, 1.9, fz + 0.3, i % 2 ? WHITE : SAFETY_RED, { rx: 0.25 });
  for (const sx of [-1, 1]) b.box(0.06, 0.06, 0.6, sx * 0.7, 1.72, fz + 0.3, s.metal, { rx: -0.6 });
  // rooftop cross sign + wall cross + lamp
  b.box(0.1, 0.5, 0.1, 0.9, 2.5, fz - 0.3, s.metal);
  b.box(0.9, 0.9, 0.1, 0.9, 3.05, fz - 0.3, WHITE);
  cross(b, 0.9, 3.05, fz - 0.24, 0.6, 0.18, RED_LED);
  cross(b, w / 2 - 0.38, 1.55, -0.2, 0.4, 0.12, RED_LED, Math.PI / 2);
  led(b, 0.6, 1.5, fz + 0.06, '#ffd27a', 0.1);
  // first-aid crate + stretcher
  crate(b, -w / 2 + 0.7, 0, d / 2 - 0.5, 0.42, WHITE, SAFETY_RED, 0.2);
  cross(b, -w / 2 + 0.7, 0.21, d / 2 - 0.27, 0.2, 0.06, RED_LED, 0, 0.04);
  b.box(0.9, 0.08, 0.45, w / 2 - 0.7, 0.62, d / 2 - 0.42, WHITE);
  b.box(0.3, 0.1, 0.4, w / 2 - 1.0, 0.7, d / 2 - 0.42, '#5ec8ff');
  for (const sx of [-1, 1]) b.cyl(0.1, 0.1, 0.5, w / 2 - 0.7 + sx * 0.35, 0.1, d / 2 - 0.42, s.metal, 6, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) b.box(0.05, 0.5, 0.05, w / 2 - 0.7 + sx * 0.35, 0.35, d / 2 - 0.42, s.metal);
  c.setLight(0, 2.0, fz + 0.2, '#ffffff', 0.5, 6);
  c.levelPips();
});

registerModel('medical_center', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const bw = w - 1.0;
  const bd = d - 1.2;
  shed(c, bw, bd, 3.2, 0, -0.1, { roof: 'flat', windows: true, door: 1.4, wall: s.index <= 2 ? s.base : new THREE.Color('#f2f5f8') });
  b.box(bw + 0.1, 0.5, bd + 0.1, 0, 2.3, -0.1, '#ffffff', { slot: SLOT_GLASS });
  const fz = -0.1 + bd / 2;
  cross(b, 0, 2.75, fz + 0.04, 0.9, 0.22, RED_LED);
  // entrance canopy + side ambulance canopy with a stretcher
  b.box(2.2, 0.1, 0.7, 0, 2.0, fz + 0.3, WHITE);
  b.box(2.0, 0.05, 0.06, 0, 1.95, fz + 0.62, s.accent, { slot: SLOT_GLOW });
  b.box(1.3, 0.1, 1.8, w / 2 - 0.65, 2.0, 0.3, s.trim);
  for (const z of [-0.5, 1.1]) b.box(0.12, 2.0, 0.12, w / 2 - 0.15, 1.0, z, s.trim);
  b.box(0.9, 0.08, 0.45, w / 2 - 0.65, 0.62, 0.3, WHITE, { ry: Math.PI / 2 });
  for (const sz of [-1, 1]) b.cyl(0.1, 0.1, 0.5, w / 2 - 0.65, 0.1, 0.3 + sz * 0.35, s.metal, 6, { rz: Math.PI / 2 });
  for (const sz of [-1, 1]) b.box(0.05, 0.5, 0.05, w / 2 - 0.65, 0.35, 0.3 + sz * 0.35, s.metal);
  // rooftop helipad + standing cross sign + antenna
  b.cyl(1.3, 1.3, 0.1, 0.5, 3.4, -0.4, s.trim, 10);
  b.box(0.12, 0.9, 0.04, 0.2, 3.47, -0.4, WHITE);
  b.box(0.12, 0.9, 0.04, 0.8, 3.47, -0.4, WHITE);
  b.box(0.6, 0.12, 0.04, 0.5, 3.47, -0.4, WHITE);
  for (let i = 0; i < 4; i++) led(b, 0.5 + Math.cos(i * 1.57) * 1.2, 3.5, -0.4 + Math.sin(i * 1.57) * 1.2, i % 2 ? RED_LED : GREEN_LED, 0.1);
  b.box(0.1, 0.6, 0.1, -bw / 2 + 0.6, 3.6, fz - 0.4, s.metal);
  b.box(0.9, 0.9, 0.1, -bw / 2 + 0.6, 4.2, fz - 0.4, WHITE);
  cross(b, -bw / 2 + 0.6, 4.2, fz - 0.34, 0.6, 0.18, RED_LED);
  c.antenna(-bw / 2 + 0.5, 3.35, -bd / 2 + 0.4, 1.2, RED_LED);
  c.setLight(0, 2.5, fz + 0.3, '#ffffff', 0.6, 7);
  c.levelPips();
});

// ------------------------------------------------------------------------------------ utility

registerModel('radio_tower', (c) => {
  const { b, s, w, d } = c;
  const h = 6.5;
  pad(b, s, 1.6, 1.6, 0, 0);
  lattice(b, s.metal, 0, 0.28, 0, h, 0.45, 0.2, 4, 0.08);
  for (let i = 0; i < 2; i++) b.box(0.5 - i * 0.08, 0.3, 0.5 - i * 0.08, 0, 5.0 + i * 0.6, 0, i % 2 ? WHITE : SAFETY_RED);
  b.cyl(0.03, 0.05, 1.5, 0, h + 1.0, 0, s.metal, 4);
  b.sphere(0.12, 0, h + 1.8, 0, RED_LED, 5, { slot: SLOT_GLOW });
  led(b, 0, h * 0.5, 0.3, RED_LED, 0.1);
  c.part('spinY', 0, h * 0.7, 0, (pb) => {
    pb.box(0.3, 0.1, 0.1, 0.2, 0, 0, s.metal);
    dish(pb, 0.45, -0.05, 0, 0.55, 1.4, '#dfe6ee', s.accent);
  }, 0.7);
  // guy wires + anchors
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    const ax = Math.cos(a) * (Math.min(w, d) / 2 - 0.35);
    const az = Math.sin(a) * (Math.min(w, d) / 2 - 0.35);
    pipe(b, '#55595f', 0, 4.6, 0, ax, 0.15, az, 0.02, 3);
    b.box(0.3, 0.2, 0.3, ax, 0.1, az, '#9a9690');
  }
  // equipment shed with a fixed dish
  const ex = -w / 2 + 0.75;
  const ez = d / 2 - 0.65;
  b.box(1.1, 0.9, 0.8, ex, 0.45, ez, s.base, { shade: 0.03 });
  b.box(1.16, 0.12, 0.86, ex, 0.92, ez, s.roofEdge);
  b.box(0.4, 0.6, 0.06, ex + 0.2, 0.3, ez + 0.41, DARK);
  vent(b, ex - 0.25, 0.55, ez + 0.41, 0.36, 0.24, s.trim);
  dish(b, ex, 1.0, ez - 0.1, 0.38, 0.9, '#dfe6ee', s.accent);
});

registerModel('garage', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const bd = d - 1.0;
  shed(c, w - 0.8, bd, 2.6, 0, -0.3, { roof: 'flat', windows: false, door: Math.min(3.0, w * 0.55), hazard: true, shutter: true });
  const fz = -0.3 + bd / 2;
  // vehicle nosing out of the doorway
  b.box(1.4, 0.5, 0.6, 0, 0.5, fz + 0.2, s.light, { shade: 0.03 });
  b.box(1.5, 0.16, 0.2, 0, 0.3, fz + 0.5, s.metal);
  for (const sx of [-1, 1]) led(b, sx * 0.5, 0.6, fz + 0.5, '#ffe9a8', 0.12);
  for (const sx of [-1, 1]) b.cyl(0.22, 0.22, 0.2, sx * 0.72, 0.22, fz + 0.1, '#2a2a2e', 7, { rz: Math.PI / 2 });
  // tyre stack, toolbox, drum, sign, lamp
  for (let i = 0; i < 2; i++) {
    b.cyl(0.32, 0.32, 0.22, -w / 2 + 0.6, 0.11 + i * 0.24, d / 2 - 0.6, '#2a2a2e', 7);
    b.cyl(0.14, 0.14, 0.24, -w / 2 + 0.6, 0.11 + i * 0.24, d / 2 - 0.6, '#9a9690', 6);
  }
  b.box(0.6, 0.36, 0.36, w / 2 - 1.5, 0.18, d / 2 - 0.5, SAFETY_RED);
  b.box(0.3, 0.05, 0.08, w / 2 - 1.5, 0.4, d / 2 - 0.5, s.metal);
  barrel(b, w / 2 - 0.6, 0, d / 2 - 0.7, s.index <= 2 ? WOOD_DARK : s.machine, stripeColor(s), 0.3, 0.72);
  b.box(1.4, 0.26, 0.08, 0, 2.72, fz - 0.26, stripeColor(s), { slot: accentSlot(s) });
  b.box(0.8, 0.4, 0.8, w / 2 - 1.0, 2.95, -d / 2 + 0.9, s.light);
  b.cyl(0.26, 0.26, 0.05, w / 2 - 1.0, 3.17, -d / 2 + 0.9, s.machineDark, 8);
  c.setLight(0, 2.0, fz + 0.3, '#ffd27a', 0.7, 7);
  c.levelPips();
});

registerModel('hangar', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.1);
  const r = Math.min(w, d) * 0.42;
  b.cyl(r, r, d - 0.8, 0, 0.6, 0, s.base, 12, { rx: Math.PI / 2, shade: 0.02 });
  for (const z of [-d / 4 + 0.2, d / 4 - 0.2]) b.cyl(r + 0.04, r + 0.04, 0.14, 0, 0.6, z, stripeColor(s), 12, { rx: Math.PI / 2 });
  b.box(w - 0.6, 0.7, d - 0.6, 0, 0.35, 0, s.trim);
  // front doors ajar with hazard edges, a craft nose inside
  const fz = d / 2 - 0.35;
  b.box(r * 1.4, r * 0.9, 0.2, 0, 0.6 + r * 0.45, fz - 0.1, DARK);
  for (const sx of [-1, 1]) {
    b.box(r * 0.5, r * 0.9, 0.16, sx * r * 0.48, 0.6 + r * 0.45, fz, s.light, { shade: 0.02 });
    b.box(0.12, r * 0.86, 0.18, sx * r * 0.24, 0.6 + r * 0.45, fz, HAZARD);
  }
  b.box(r * 1.5, 0.1, 0.26, 0, 0.6 + r * 0.9, fz, s.accent, { slot: SLOT_GLOW });
  b.cone(0.55, 1.2, 0, 1.5, fz - 0.6, '#dfe6ee', 8, { rx: Math.PI / 2 });
  for (const sx of [-1, 1]) led(b, sx * 0.4, 1.6, fz - 0.15, sx < 0 ? RED_LED : GREEN_LED, 0.1);
  for (let i = 0; i < 4; i++) led(b, -w / 2 + 0.5 + i * ((w - 1.0) / 3), 0.75, d / 2 - 0.15, i % 2 ? RED_LED : GREEN_LED, 0.12);
  c.antenna(0, 0.6 + r, -d / 2 + 0.8, 1.0, RED_LED);
  // fuel tanks + windsock
  for (const sx of [-1, 1]) {
    const tx = sx * (w / 2 - 0.42);
    b.cyl(0.38, 0.38, 1.8, tx, 0.75, -0.6, s.light, 8, { rx: Math.PI / 2, shade: 0.02 });
    b.cyl(0.4, 0.4, 0.1, tx, 0.75, -0.6, stripeColor(s), 8, { rx: Math.PI / 2 });
    pipe(b, s.metal, tx, 1.1, -0.6, sx * (r - 0.4), 1.6, -0.6, 0.06, 5, true);
  }
  b.cyl(0.03, 0.04, 2.2, -w / 2 + 0.5, 1.8, d / 2 - 0.5, s.metal, 4);
  c.part('sway', -w / 2 + 0.5, 2.9, d / 2 - 0.5, (pb) => {
    pb.cone(0.16, 0.8, 0.42, 0, 0, ALLOY_ORANGE, 6, { rz: -Math.PI / 2 });
  }, 2.2, 0.15);
  c.levelPips();
});

registerModel('teleporter', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.4;
  b.cyl(r, r + 0.15, 0.35, 0, 0.17, 0, s.machineDark, 10);
  b.cyl(r * 0.85, r * 0.85, 0.06, 0, 0.38, 0, s.accent, 10, { slot: SLOT_GLOW });
  b.box(1.0, 0.18, 0.5, 0, 0.09, r + 0.1, s.machineDark);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    b.box(0.3, 2.6, 0.3, px, 1.3, pz, s.trim, { ry: -a });
    b.box(0.08, 2.0, 0.08, Math.cos(a) * (r - 0.18), 1.4, Math.sin(a) * (r - 0.18), s.accent, { ry: -a, slot: SLOT_GLOW });
    led(b, px, 2.72, pz, s.accent, 0.2);
  }
  c.part('bobSpin', 0, 1.6, 0, (pb) => {
    pb.torus(r * 0.75, 0.07, 0, 0, 0, s.accent, 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    pb.torus(r * 0.55, 0.06, 0, 0.5, 0, s.accent, 12, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  }, 1.2, 0.3);
  b.cyl(r * 0.3, r * 0.5, 2.4, 0, 1.6, 0, s.accent, 8, { slot: SLOT_GLOW });
  // console + cable
  b.box(0.4, 0.8, 0.3, -1.6, 0.4, 1.05, s.machine);
  screen(b, -1.6, 0.7, 1.22, 0.26, 0.2, s.accent, 0, -0.4);
  pipe(b, s.metal, -1.6, 0.2, 0.9, -r * 0.8, 0.2, 0.5, 0.04, 4);
  c.emit('motes', 0, 1.0, 0, 6, s.accent.getStyle());
  c.setLight(0, 1.5, 0, s.accent.getStyle(), 1.3, 9);
});

const SPIN_COLORS = ['#b5793f', '#9aa3ad', '#b48cff', '#4fb3f6', '#ffd84a', '#5ef2ff', '#8fa8ff', '#ff6f91'];
registerModel('spin_wheel', (c) => {
  const { b, s } = c;
  b.box(0.8, 0.2, 0.8, 0, 0.1, 0, frameColor(s));
  b.box(0.16, 1.6, 0.16, -0.5, 0.9, 0, frameColor(s));
  b.box(0.16, 1.6, 0.16, 0.5, 0.9, 0, frameColor(s));
  b.box(1.2, 0.14, 0.14, 0, 1.75, 0, frameColor(s));
  for (let i = 0; i < 4; i++) b.box(0.35, 0.05, 0.6, -0.525 + i * 0.35, 1.98, 0.14, i % 2 ? WHITE : SAFETY_RED, { rx: 0.22 });
  for (let i = 0; i < 3; i++) led(b, -0.4 + i * 0.4, 1.86, 0.1, '#ffd84a', 0.08);
  c.part('wheel', 0, 1.1, 0.1, (pb) => {
    pb.cyl(0.78, 0.78, 0.12, 0, 0, 0, '#fff5e6', 12, { rx: Math.PI / 2 });
    const n = SPIN_COLORS.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pb.box(0.42, 0.26, 0.08, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.07, SPIN_COLORS[i], { rz: a + Math.PI / 2 });
      pb.box(0.08, 0.08, 0.08, Math.cos(a + Math.PI / n) * 0.7, Math.sin(a + Math.PI / n) * 0.7, 0.08, '#ffd84a', { slot: SLOT_GLOW });
    }
    pb.sphere(0.12, 0, 0, 0.1, '#ffd84a', 6, { slot: SLOT_GLOW });
  }, 0.5);
  b.cone(0.1, 0.3, 0, 1.95, 0.2, SAFETY_RED, 4, { rx: Math.PI });
  b.box(0.04, 0.5, 0.04, 0, 2.3, 0, frameColor(s));
  b.box(0.3, 0.2, 0.03, 0.17, 2.45, 0, stripeColor(s));
  c.setLight(0, 1.6, 0.6, '#ffd84a', 0.6, 6);
});

registerModel('beacon', (c) => {
  const { b, s } = c;
  pad(b, s, 1.4, 1.4, 0, 0, 0.2);
  b.cyl(0.1, 0.16, 3.0, 0, 1.75, 0, s.metal, 6);
  for (const yy of [1.3, 2.3]) b.cyl(0.2, 0.2, 0.08, 0, yy, 0, s.accent, 8, { slot: SLOT_GLOW });
  b.box(0.5, 0.4, 0.5, 0, 3.4, 0, s.machine);
  b.pyramid(0.56, 0.2, 0.56, 0, 3.6, 0, s.trim);
  c.part('spinY', 0, 3.75, 0, (pb) => {
    pb.sphere(0.2, 0, 0, 0, s.accent, 6, { slot: SLOT_GLOW });
    pb.box(1.4, 0.08, 0.08, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
    pb.box(0.08, 0.08, 0.6, 0, 0, 0, s.accent, { slot: SLOT_GLOW });
  }, 2.5);
  b.box(0.4, 0.3, 0.4, 0.5, 0.38, 0.3, s.machineDark);
  b.box(0.42, 0.04, 0.42, 0.5, 0.56, 0.3, '#1f3f7a', { rx: 0.4 });
  led(b, 0.32, 0.5, 0.3, GREEN_LED, 0.07);
  c.setLight(0, 3.5, 0, s.accent.getStyle(), 0.9, 8);
});

registerModel('repair_bay', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  machine(c, w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, { lights: 3, vents: false });
  stripes(b, 0, 0.6, d / 2 - 0.38, w - 1.4, 0.12, 6);
  // vehicle on the lift with an open panel
  b.box(1.5, 0.55, 1.0, 0.45, 1.5, 0.05, s.light, { shade: 0.03 });
  b.box(0.7, 0.4, 0.9, 0.75, 1.95, 0.05, s.light);
  b.box(0.5, 0.05, 0.5, 0.0, 1.8, 0.05, s.accent, { slot: SLOT_GLOW });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.22, 0.22, 0.2, 0.45 + sx * 0.55, 1.3, 0.05 + sz * 0.5, '#2a2a2e', 6, { rx: Math.PI / 2 });
  // crane column and arm
  b.box(0.3, 2.4, 0.3, -w / 2 + 0.5, 1.4, 0, s.trim);
  c.part('rock', -w / 2 + 0.5, 2.6, 0, (pb) => {
    pb.box(1.5, 0.16, 0.16, 0.65, 0, 0, s.metal);
    pb.box(0.12, 0.7, 0.12, 1.3, -0.3, 0, s.metal);
    pb.box(0.3, 0.2, 0.3, 1.3, -0.7, 0, s.accent, { slot: SLOT_GLOW });
    pb.cyl(0.03, 0.03, 0.9, 0.9, -0.25, 0.1, '#2a2a2e', 4, { rz: 0.4 });
  }, 1.1, 0.25);
  // tool box + welding bottles
  b.box(0.5, 0.3, 0.3, w / 2 - 0.75, 1.35, -d / 2 + 0.7, SAFETY_RED);
  for (let i = 0; i < 2; i++) {
    b.cyl(0.12, 0.12, 0.6, w / 2 - 0.6 - i * 0.3, 1.5, d / 2 - 0.7, i ? '#3b7a3a' : '#9a9690', 6);
    b.cyl(0.05, 0.05, 0.1, w / 2 - 0.6 - i * 0.3, 1.85, d / 2 - 0.7, IRON, 5);
  }
  c.emit('sparks', -w / 2 + 1.8, 1.9, 0, 1.2, s.accent.getStyle());
  c.levelPips();
});

registerModel('shield_generator', (c) => {
  const { b, s, w, d } = c;
  c.foundation(0.15);
  machine(c, w - 0.8, 1.0, d - 0.8, 0, 0.2, 0, { lights: 2 });
  b.cyl(0.4, 0.5, 1.2, 0, 1.8, 0, s.trim, 8);
  b.cyl(0.46, 0.46, 0.1, 0, 1.9, 0, s.accent, 8, { slot: SLOT_GLOW });
  b.cyl(0.9, 0.3, 0.5, 0, 2.6, 0, s.machine, 10);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const px = Math.cos(a) * 0.72;
    const pz = Math.sin(a) * 0.72;
    b.cone(0.1, 0.7, px, 3.1, pz, s.trim, 5, { rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 });
    led(b, px * 1.25, 3.42, pz * 1.25, s.accent, 0.1);
  }
  b.sphere(0.4, 0, 2.95, 0, s.accent, 7, { slot: SLOT_GLOW });
  c.part('spinY', 0, 2.95, 0, (pb) => {
    pb.torus(0.7, 0.05, 0, 0, 0, s.accent, 12, 4, { rx: 0.5, slot: SLOT_GLOW });
  }, 1.5);
  for (const sx of [-1, 1]) {
    const tx = sx * (w / 2 - 0.75);
    const tz = -d / 2 + 0.75;
    b.cyl(0.3, 0.3, 1.0, tx, 1.7, tz, s.machine, 8);
    b.box(0.06, 0.7, 0.08, tx, 1.7, tz + 0.3, s.accent, { slot: SLOT_GLOW });
    pipe(b, s.metal, tx, 2.2, tz, 0, 2.4, 0, 0.06, 5, true);
  }
  c.emit('motes', 0, 3.0, 0, 2, s.accent.getStyle());
  c.setLight(0, 3.0, 0, s.accent.getStyle(), 1.0, 9);
  c.levelPips();
});

// ------------------------------------------------------------------------------------ decor

registerModel('lamp', (c) => {
  const { b, s } = c;
  b.cyl(0.22, 0.28, 0.2, 0, 0.1, 0, frameColor(s), 7);
  if (s.index <= 1) {
    b.cyl(0.07, 0.09, 2.2, 0, 1.3, 0, WOOD_DARK, 5);
    b.box(0.6, 0.06, 0.06, 0.25, 2.3, 0, WOOD_DARK);
    b.box(0.06, 0.45, 0.06, 0.2, 2.1, 0, WOOD_DARK, { rz: -0.6 });
    b.box(0.03, 0.2, 0.03, 0.5, 2.18, 0, '#55595f');
    lantern(b, 0.5, 1.95, 0, WOOD_DARK, 0.28);
    c.setLight(0.5, 1.95, 0, '#ffc877', 1.0, 9);
  } else if (s.index === 2) {
    b.cyl(0.06, 0.08, 2.2, 0, 1.3, 0, s.metal, 6);
    b.box(0.56, 0.08, 0.56, 0, 2.3, 0, s.trim);
    b.box(0.5, 0.5, 0.5, 0, 2.6, 0, '#ffffff', { slot: SLOT_GLASS });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.06, 0.5, 0.06, sx * 0.25, 2.6, sz * 0.25, s.trim);
    b.pyramid(0.66, 0.32, 0.66, 0, 2.86, 0, s.trim);
    b.sphere(0.07, 0, 3.24, 0, s.accent, 4);
    c.setLight(0, 2.6, 0, '#ffc877', 1.0, 9);
  } else {
    b.cyl(0.06, 0.08, 2.4, 0, 1.4, 0, s.metal, 6);
    b.box(0.5, 0.06, 0.06, 0.22, 2.6, 0, s.metal, { rz: 0.5 });
    b.box(0.36, 0.1, 0.36, 0.45, 2.7, 0, s.metal);
    b.sphere(0.26, 0.45, 2.5, 0, '#ffffff', 7, { slot: SLOT_GLASS });
    b.box(0.06, 0.06, 0.4, 0, 2.3, 0.1, s.accent, { slot: SLOT_GLOW });
    c.setLight(0.45, 2.5, 0, '#ffc877', 1.0, 9);
  }
});

registerModel('plant', (c) => {
  const { b, s } = c;
  if (s.index <= 1) {
    b.cyl(0.42, 0.42, 1.5, 0, 0.3, 0, WOOD, 7, { rz: Math.PI / 2, shade: 0.04 });
    b.box(1.3, 0.1, 0.5, 0, 0.5, 0, SOIL);
  } else {
    b.box(1.4, 0.4, 1.4, 0, 0.2, 0, s.index === 2 ? STONE_LIGHT : s.trim, { shade: 0.04 });
    b.box(1.46, 0.08, 1.46, 0, 0.4, 0, frameColor(s));
    b.box(1.2, 0.1, 1.2, 0, 0.42, 0, SOIL);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    flower(b, Math.cos(a) * 0.4, Math.sin(a) * (s.index <= 1 ? 0.15 : 0.4), 0.55 + (i % 2) * 0.1, FLOWERS[i], 0.12);
  }
  bush(b, 0, 0.6, 0, 0.26, LEAF);
  bush(b, 0.3, 0.55, -0.1, 0.16, LEAF2);
  if (s.index >= 4) led(b, 0.55, 0.5, 0.55, s.accent, 0.08);
});

registerModel('bench', (c) => {
  const { b, s } = c;
  if (s.index <= 1) {
    b.cyl(0.24, 0.24, 1.6, 0, 0.42, 0, WOOD, 7, { rz: Math.PI / 2, shade: 0.04 });
    b.box(1.6, 0.04, 0.32, 0, 0.6, 0, '#c9a06a');
    for (const sx of [-1, 1]) b.cyl(0.2, 0.22, 0.3, sx * 0.55, 0.15, 0, WOOD_DARK, 6);
    return;
  }
  const col = s.index === 2 ? WOOD : s.index === 6 ? s.light : s.trim;
  for (let i = 0; i < 3; i++) b.box(1.6, 0.06, 0.14, 0, 0.5, -0.16 + i * 0.16, col, { shade: 0.03 });
  for (let i = 0; i < 2; i++) b.box(1.6, 0.12, 0.05, 0, 0.72 + i * 0.2, -0.26 - i * 0.03, col, { rx: -0.15, shade: 0.03 });
  for (const sx of [-1, 1]) {
    b.box(0.08, 0.5, 0.5, sx * 0.72, 0.25, 0, s.metal);
    b.box(0.08, 0.55, 0.08, sx * 0.72, 0.75, -0.24, s.metal, { rx: -0.15 });
    b.box(0.08, 0.06, 0.5, sx * 0.72, 0.72, 0.0, s.metal);
  }
  if (glows(s)) b.box(1.4, 0.04, 0.04, 0, 0.44, 0.24, s.accent, { slot: SLOT_GLOW });
});

registerModel('fountain', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.4;
  const stone = s.index <= 2 ? STONE_LIGHT : s.trim;
  b.cyl(r, r + 0.1, 0.5, 0, 0.25, 0, stone, 10, { shade: 0.04 });
  b.cyl(r + 0.12, r + 0.12, 0.1, 0, 0.5, 0, s.index <= 2 ? STONE_DARK : s.metal, 10);
  b.cyl(r - 0.15, r - 0.15, 0.1, 0, 0.5, 0, WATER, 10);
  b.cyl(0.18, 0.28, 0.9, 0, 0.9, 0, stone, 8);
  b.cyl(0.5, 0.12, 0.25, 0, 1.4, 0, stone, 8);
  b.cyl(0.45, 0.45, 0.05, 0, 1.5, 0, WATER, 8);
  b.cyl(0.08, 0.12, 0.3, 0, 1.65, 0, stone, 6);
  b.sphere(0.16, 0, 1.9, 0, glows(s) ? s.accent : stone, 6, { slot: accentSlot(s) });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    b.box(0.05, 0.9, 0.05, Math.cos(a) * 0.55, 1.15, Math.sin(a) * 0.55, '#bfe8ff', { ry: -a, rz: -0.75, slot: SLOT_GLOW });
    b.cyl(0.14, 0.14, 0.03, Math.cos(a) * 0.95, 0.56, Math.sin(a) * 0.95, '#dff4ff', 6);
  }
  b.cyl(0.14, 0.14, 0.03, -0.7, 0.56, 0.9, LEAF, 5);
  b.cyl(0.11, 0.11, 0.03, 0.9, 0.56, -0.6, LEAF2, 5);
  c.emit('drips', 0, 1.9, 0, 6, '#9fdcff');
  if (glows(s)) glowRing(b, r - 0.05, 0, 0.53, 0, s.accent, 12, 0.04);
});

registerModel('banner', (c) => {
  const { b, s } = c;
  b.cyl(0.2, 0.25, 0.2, 0, 0.1, 0, frameColor(s), 7);
  b.sphere(0.12, 0.22, 0.1, 0.1, STONE, 4);
  b.sphere(0.1, -0.2, 0.08, -0.14, STONE_LIGHT, 4);
  b.cyl(0.05, 0.06, 3.0, 0, 1.6, 0, s.index <= 1 ? WOOD_DARK : s.metal, 6);
  b.box(1.0, 0.06, 0.06, 0.5, 2.98, 0, s.index <= 1 ? WOOD_DARK : s.metal);
  b.cone(0.1, 0.3, 0, 3.25, 0, s.index <= 2 ? GOLD : s.accent, 5, { slot: accentSlot(s) });
  c.part('sway', 0.05, 2.9, 0, (pb) => {
    pb.box(0.95, 0.8, 0.04, 0.5, -0.4, 0, s.accent, { shade: 0.02 });
    pb.box(0.95, 0.12, 0.05, 0.5, -0.78, 0, '#ffffff');
    pb.cyl(0.18, 0.18, 0.06, 0.5, -0.38, 0, '#ffffff', 8, { rx: Math.PI / 2 });
    pb.box(0.14, 0.14, 0.07, 0.5, -0.38, 0, s.index >= 3 ? s.accent : WOOD_DARK, { rz: Math.PI / 4 });
  }, 2.5, 0.12);
});

registerModel('statue', (c) => {
  const { b, s } = c;
  const stone = s.index >= 5 ? '#dfe6ee' : '#b9b5ad';
  b.box(1.3, 0.3, 1.3, 0, 0.15, 0, frameColor(s), { shade: 0.03 });
  b.box(1.0, 0.45, 1.0, 0, 0.52, 0, s.index <= 2 ? STONE_LIGHT : s.trim, { shade: 0.03 });
  b.box(0.5, 0.26, 0.04, 0, 0.5, 0.52, s.index <= 2 ? GOLD : s.metal);
  // chibi founder with a raised hammer and a cape
  b.box(0.42, 0.55, 0.3, 0, 1.03, 0, stone);
  b.box(0.46, 0.5, 0.08, 0, 1.0, -0.19, stone, { rx: 0.1 });
  b.sphere(0.3, 0, 1.58, 0, stone, 7);
  b.box(0.44, 0.1, 0.44, 0, 1.78, 0, stone);
  b.box(0.12, 0.5, 0.12, -0.3, 1.08, 0, stone, { rz: 0.5 });
  b.box(0.12, 0.5, 0.12, 0.3, 1.28, 0, stone, { rz: -2.6 });
  b.box(0.14, 0.4, 0.14, -0.1, 0.95 - 0.35, 0, stone);
  b.box(0.14, 0.4, 0.14, 0.1, 0.95 - 0.35, 0, stone);
  b.box(0.06, 0.6, 0.06, 0.44, 1.75, 0, stone);
  b.box(0.26, 0.16, 0.16, 0.44, 2.05, 0, glows(s) ? s.accent : stone, { slot: accentSlot(s) });
  if (glows(s)) for (const sx of [-1, 1]) led(b, sx * 0.55, 0.36, 0.55, s.accent, 0.1);
});

registerModel('arcade', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.6, 0.06, d - 0.6, 0, 0.03, 0, '#3b3f6b');
  const n = Math.max(2, Math.round((w - 1.4) / 1.1));
  const body = s.index >= 4 ? s.machine : '#3b3f6b';
  const cz = -d / 2 + 0.75;
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 1.0 + i * ((w - 2.0) / Math.max(1, n - 1)) - (n === 2 ? 0.0 : 0);
    b.box(0.9, 1.7, 0.7, x, 0.85, cz, body, { shade: 0.02 });
    b.box(0.7, 0.5, 0.06, x, 1.3, cz + 0.36, i % 2 ? BLUE_LED : '#7cff6a', { slot: SLOT_GLOW, rx: -0.2 });
    b.box(0.8, 0.2, 0.3, x, 0.95, cz + 0.45, '#2a2d4a', { rx: 0.3 });
    led(b, x - 0.2, 1.03, cz + 0.55, RED_LED, 0.07);
    led(b, x + 0.2, 1.03, cz + 0.55, '#ffd84a', 0.07);
    b.box(0.04, 0.16, 0.04, x, 1.1, cz + 0.52, '#2a2d4a');
    b.box(0.92, 0.3, 0.72, x, 1.75, cz, i % 2 ? '#ff6f91' : '#ffd84a', { slot: SLOT_GLOW });
  }
  // neon strip over the cabinets + claw machine + stool
  b.box(w - 1.0, 0.08, 0.08, 0, 2.15, cz - 0.1, '#ff6f91', { slot: SLOT_GLOW });
  for (const sx of [-1, 1]) b.box(0.08, 2.15, 0.08, sx * (w / 2 - 0.5), 1.07, cz - 0.1, s.metal);
  const kx = w / 2 - 0.65;
  const kz = d / 2 - 0.65;
  b.box(0.8, 0.7, 0.8, kx, 0.35, kz, body, { shade: 0.02 });
  b.box(0.76, 0.8, 0.76, kx, 1.1, kz, '#ffffff', { slot: SLOT_GLASS });
  b.box(0.84, 0.16, 0.84, kx, 1.56, kz, '#ffd84a', { slot: SLOT_GLOW });
  for (let i = 0; i < 3; i++) b.sphere(0.12, kx - 0.2 + i * 0.2, 0.8, kz + (i % 2) * 0.2 - 0.1, FLOWERS[i], 4);
  b.cyl(0.2, 0.2, 0.06, -w / 2 + 1.0, 0.6, cz + 1.1, SAFETY_RED, 7);
  b.cyl(0.04, 0.04, 0.55, -w / 2 + 1.0, 0.3, cz + 1.1, s.metal, 5);
  c.setLight(0, 1.4, cz + 0.8, '#58d0ff', 0.6, 5);
});

registerModel('garden', (c) => {
  const { b, s, w, d } = c;
  b.box(w - 0.2, 0.3, d - 0.2, 0, 0.15, 0, s.index <= 1 ? WOOD : s.index === 2 ? STONE_LIGHT : s.trim, { shade: 0.04 });
  b.box(w - 0.5, 0.08, d - 0.5, 0, 0.31, 0, '#4f8a3a');
  b.box(w - 0.9, 0.03, 0.4, 0, 0.36, 0, '#c9b48c');
  b.box(0.4, 0.03, d - 0.9, 0, 0.36, 0, '#c9b48c');
  let k = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (i === 1 || j === 1) continue;
    const x = -w / 2 + 0.7 + (i * (w - 1.4)) / 2;
    const z = -d / 2 + 0.7 + (j * (d - 1.4)) / 2;
    flower(b, x, z, 0.45 + (k % 2) * 0.1, FLOWERS[k++ % FLOWERS.length], 0.13);
    flower(b, x + 0.35, z - 0.25, 0.4, FLOWERS[k++ % FLOWERS.length], 0.11);
  }
  bush(b, -w / 2 + 1.1, 0.5, 0.0, 0.3, LEAF2);
  bush(b, w / 2 - 1.1, 0.5, 0.0, 0.3, LEAF);
  // little tree in one quadrant, centrepiece in the middle
  b.cyl(0.08, 0.1, 1.0, w / 2 - 1.0, 0.8, -d / 2 + 1.0, WOOD_DARK, 5);
  b.sphere(0.55, w / 2 - 1.0, 1.5, -d / 2 + 1.0, LEAF2, 6, { sy: 0.85 });
  b.sphere(0.36, w / 2 - 0.75, 1.75, -d / 2 + 1.2, LEAF, 5);
  if (s.index <= 2) {
    b.cyl(0.06, 0.09, 0.6, 0, 0.65, 0, STONE, 6);
    b.cyl(0.32, 0.1, 0.1, 0, 0.98, 0, STONE_LIGHT, 8);
    b.cyl(0.26, 0.26, 0.03, 0, 1.03, 0, WATER, 8);
  } else {
    b.box(0.5, 0.2, 0.5, 0, 0.45, 0, s.trim);
    b.shard(0.18, 0.6, 0, 0.95, 0, s.accent, { slot: SLOT_GLOW });
    b.shard(0.12, 0.4, 0.25, 0.75, 0.15, s.accent, { slot: SLOT_GLOW });
    b.shard(0.1, 0.32, -0.22, 0.7, -0.12, '#ffffff', { slot: SLOT_GLOW });
    for (const sx of [-1, 1]) led(b, sx * (w / 2 - 0.25), 0.4, d / 2 - 0.25, s.accent, 0.1);
  }
});

void FIRE_GLOW;
void HAZARD;
void BRICK;
void BRICK_DARK;
void postColor;
void windowPane;
void doorway;
void valve;
void axe;
