/**
 * The colony core: crashed escape pod (tier 0) → camp → stone keep → steel command post → alloy
 * tower → nano spire → titanium citadel (tier 6). Footprint 3x3 cells (6x6 units).
 */
import * as THREE from 'three';
import { SLOT_GLASS, SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel, type ModelCtx } from './spec';

const POD = '#dde3ea';
const POD_DARK = '#8d97a3';
const POD_ORANGE = '#ff8a3d';
const SCORCH = '#3a3230';
const WOOD = '#9c6b3c';
const WOOD_DARK = '#6e4a28';

/** The escape pod itself (reused by tiers 0-2), centred at (x,z), base at y, tilt in radians. */
function pod(c: ModelCtx, x: number, y: number, z: number, tilt: number, scorched: boolean): void {
  const { b } = c;
  const o = { rz: tilt, ry: 0.4 };
  b.cyl(1.1, 1.3, 2.2, x, y + 1.3, z, scorched ? '#c9d0d8' : POD, 10, { ...o, shade: 0.03 });
  b.cyl(0.6, 1.1, 1.0, x + Math.sin(tilt) * -1.6, y + 1.3 + Math.cos(tilt) * 1.6, z, POD, 10, o);
  b.cyl(0.0, 0.6, 0.5, x + Math.sin(tilt) * -2.3, y + 1.3 + Math.cos(tilt) * 2.3, z, POD_ORANGE, 10, o);
  b.cyl(1.32, 1.32, 0.18, x + Math.sin(tilt) * -0.4, y + 1.3 + Math.cos(tilt) * 0.4, z, POD_ORANGE, 10, o);
  b.cyl(1.32, 1.32, 0.18, x + Math.sin(tilt) * 0.5, y + 1.3 - Math.cos(tilt) * 0.5, z, POD_DARK, 10, o);
  // window
  b.sphere(0.36, x + Math.cos(0.4) * 1.05, y + 1.5, z + Math.sin(0.4) * 1.05 + 0.3, '#ffffff', 6, { slot: SLOT_GLASS });
  // open hatch
  b.box(0.8, 1.0, 0.1, x - 0.2, y + 0.9, z + 1.15, POD_DARK, { ry: 0.4, rx: 0.9 });
  b.box(0.7, 0.9, 0.06, x - 0.1, y + 0.9, z + 1.1, '#2a2f38', { ry: 0.4 });
  if (scorched) {
    b.box(1.0, 0.5, 0.6, x + 0.5, y + 0.4, z - 0.9, SCORCH, { ry: 0.6 });
    b.sphere(0.4, x - 0.9, y + 0.6, z - 0.6, SCORCH, 5);
  }
  // antenna + blinking light
  b.cyl(0.03, 0.04, 1.0, x + 0.6, y + 2.9, z - 0.4, POD_DARK, 4, { rz: tilt });
  b.sphere(0.1, x + 0.6 - Math.sin(tilt) * 0.5, y + 3.45, z - 0.4, '#ff4d5e', 5, { slot: SLOT_GLOW });
}

const TIERS: ((c: ModelCtx) => void)[] = [
  // ---- 0: crashed escape pod in a scorched crater
  (c) => {
    const { b } = c;
    b.cyl(3.2, 3.6, 0.3, 0, -0.1, 0, '#5a4a3a', 14, { shade: 0.06 });
    b.cyl(2.6, 3.0, 0.2, 0, 0.1, 0, SCORCH, 14, { shade: 0.06 });
    pod(c, 0.3, 0.1, -0.2, 0.32, true);
    // debris
    b.box(0.6, 0.2, 0.4, -2.0, 0.2, 1.5, POD_DARK, { ry: 0.8, rz: 0.2 });
    b.box(0.4, 0.15, 0.7, 1.9, 0.15, 1.8, POD, { ry: -0.5 });
    b.box(0.3, 0.3, 0.3, -1.6, 0.25, -1.9, POD_ORANGE, { ry: 0.3 });
    // supply crate + lantern on a stick
    b.box(0.7, 0.6, 0.7, 2.0, 0.4, -1.4, WOOD, { ry: 0.2, shade: 0.05 });
    b.cyl(0.04, 0.05, 1.4, -2.2, 0.8, -0.6, WOOD_DARK, 4);
    b.box(0.3, 0.3, 0.3, -2.2, 1.6, -0.6, '#ffffff', { slot: SLOT_GLASS });
    c.emit('smoke', 0.8, 1.0, -0.9, 0.8);
    c.setLight(-2.2, 1.6, -0.6, '#ffc877', 0.9, 7);
  },
  // ---- 1: pod with a wooden camp built around it
  (c) => {
    const { b, s } = c;
    c.foundation(0.2, 0.15, new THREE.Color('#8a7555'));
    pod(c, 0.4, 0.1, -0.6, 0.18, false);
    // wooden deck + awning
    b.box(5.4, 0.2, 2.0, 0, 0.3, 1.9, WOOD, { shade: 0.05 });
    for (const x of [-2.4, 2.4]) b.cyl(0.12, 0.14, 2.6, x, 1.5, 2.6, WOOD_DARK, 6);
    for (const x of [-2.4, 2.4]) b.cyl(0.12, 0.14, 2.6, x, 1.5, 0.9, WOOD_DARK, 6);
    b.box(5.8, 0.14, 2.4, 0, 2.9, 1.75, s.roof, { rx: 0.14, shade: 0.05 });
    b.box(0.1, 0.08, 1.9, -2.4, 2.7, 1.75, s.accent);
    // palisade bits
    for (let i = 0; i < 5; i++) b.cyl(0.14, 0.16, 1.4 + (i % 2) * 0.3, -2.6 + i * 0.5, 0.7, -2.6, WOOD, 5);
    b.box(2.4, 0.1, 0.1, -1.6, 1.2, -2.6, s.accent);
    // flag
    b.cyl(0.04, 0.05, 3.2, 2.6, 1.6, -2.4, WOOD_DARK, 4);
    c.part('sway', 2.6, 3.1, -2.4, (pb) => pb.box(0.9, 0.55, 0.04, 0.45, -0.28, 0, '#e86f4d'), 2.5, 0.12);
    b.box(0.3, 0.3, 0.3, -1.8, 1.0, 1.9, '#ffffff', { slot: SLOT_GLASS });
    c.setLight(-1.8, 1.0, 1.9, '#ffc877', 1.0, 8);
  },
  // ---- 2: stone keep with the pod mounted on the roof as a beacon
  (c) => {
    const { b, s } = c;
    c.foundation(0.15, 0.25);
    b.box(5.2, 2.6, 5.2, 0, 1.3, 0, s.base, { shade: 0.07 });
    b.box(5.4, 0.3, 5.4, 0, 2.7, 0, s.light, { shade: 0.05 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(1.0, 3.6, 1.0, sx * 2.4, 1.8, sz * 2.4, s.trim, { shade: 0.06 });
      b.box(1.2, 0.3, 1.2, sx * 2.4, 3.7, sz * 2.4, s.accent);
    }
    b.box(1.2, 1.8, 0.2, 0, 0.9, 2.65, '#4a3a2a');
    b.box(0.9, 0.7, 0.1, 1.7, 1.7, 2.65, '#ffffff', { slot: SLOT_GLASS });
    b.box(0.9, 0.7, 0.1, -1.7, 1.7, 2.65, '#ffffff', { slot: SLOT_GLASS });
    b.box(0.1, 0.7, 0.9, 2.65, 1.7, 0, '#ffffff', { slot: SLOT_GLASS });
    b.box(0.1, 0.7, 0.9, -2.65, 1.7, 0, '#ffffff', { slot: SLOT_GLASS });
    pod(c, 0, 2.85, 0, 0.0, false);
    b.wedge(3.2, 1.0, 2.0, 0, 2.85, 1.6, s.roof, { shade: 0.05 });
    c.chimney(-1.8, 2.85, -1.6, 1.3, 0.22, 1.5);
    c.setLight(0, 1.9, 2.9, '#ffc877', 0.9, 8);
  },
  // ---- 3: steel command post with radar and power lines
  (c) => {
    const { b, s } = c;
    c.foundation(0.1, 0.3);
    b.box(5.4, 2.4, 5.4, 0, 1.2, 0, s.base, { shade: 0.02 });
    b.box(5.5, 0.26, 5.5, 0, 1.5, 0, s.accent, { slot: SLOT_GLOW });
    b.box(4.0, 2.0, 4.0, -0.3, 3.4, -0.3, s.light, { shade: 0.02 });
    b.box(4.1, 0.7, 4.1, -0.3, 3.4, -0.3, '#ffffff', { slot: SLOT_GLASS });
    b.box(4.2, 0.2, 4.2, -0.3, 4.5, -0.3, s.trim);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.box(0.5, 2.6, 0.5, sx * 2.6, 1.3, sz * 2.6, s.trim);
      b.sphere(0.08, sx * 2.6, 2.7, sz * 2.6, s.metal, 4);
    }
    b.box(1.6, 2.0, 0.2, 0, 1.0, 2.75, s.machineDark);
    b.box(0.08, 1.8, 0.26, 0, 1.0, 2.75, s.accent, { slot: SLOT_GLOW });
    // radar mast
    b.cyl(0.08, 0.1, 3.0, 1.9, 6.0, 1.9, s.metal, 6);
    c.part('spinY', 1.9, 7.3, 1.9, (pb) => {
      pb.cyl(0.9, 0.2, 0.4, 0.5, 0.1, 0, '#dfe6ee', 12, { rz: -1.0 });
      pb.sphere(0.1, 0, 0.5, 0, '#ff4d5e', 5, { slot: SLOT_GLOW });
    }, 0.9);
    // exhaust + tanks
    c.chimney(-2.2, 2.4, -2.2, 1.6, 0.22, 2);
    b.cyl(0.5, 0.5, 1.4, 2.2, 3.1, -2.0, '#c43b2a', 9);
    b.cyl(0.5, 0.5, 1.4, 2.2, 3.1, -0.8, s.machine, 9);
    c.setLight(0, 3.4, 0, '#ffb95c', 1.0, 10);
  },
  // ---- 4: alloy tower with a rotating halo ring
  (c) => {
    const { b, s } = c;
    c.foundation(0.1, 0.3);
    b.cyl(2.9, 3.1, 1.6, 0, 0.8, 0, s.base, 12, { shade: 0.02 });
    b.torus(2.95, 0.08, 0, 1.6, 0, s.accent, 24, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.cyl(2.0, 2.6, 4.2, 0, 3.7, 0, s.light, 12, { shade: 0.02 });
    for (let i = 0; i < 3; i++) b.cyl(2.35 - i * 0.2, 2.35 - i * 0.2, 0.4, 0, 2.6 + i * 1.2, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    b.cyl(1.4, 2.0, 1.2, 0, 6.4, 0, s.trim, 12);
    b.sphere(1.0, 0, 7.4, 0, s.accent, 10, { slot: SLOT_GLOW });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.5, 5.0, 0.5, Math.cos(a) * 2.7, 2.5, Math.sin(a) * 2.7, s.trim);
      b.box(0.12, 4.0, 0.56, Math.cos(a) * 2.7, 2.7, Math.sin(a) * 2.7, s.accent, { ry: -a, slot: SLOT_GLOW });
    }
    c.part('spinY', 0, 5.2, 0, (pb) => {
      pb.torus(3.2, 0.14, 0, 0, 0, s.machine, 28, 6, { rx: Math.PI / 2 });
      pb.torus(3.2, 0.05, 0, 0.1, 0, s.accent, 28, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
      for (let i = 0; i < 4; i++) pb.box(0.5, 0.3, 0.3, Math.cos((i * Math.PI) / 2) * 3.2, 0, Math.sin((i * Math.PI) / 2) * 3.2, s.trim);
    }, 0.4);
    b.box(1.4, 2.0, 0.3, 0, 1.0, 2.95, s.machineDark);
    b.box(0.08, 1.8, 0.36, 0, 1.0, 2.95, s.accent, { slot: SLOT_GLOW });
    c.emit('motes', 0, 7.4, 0, 2, s.accent.getStyle());
    c.setLight(0, 7.4, 0, s.accent.getStyle(), 1.4, 12);
  },
  // ---- 5: nano spire — dark, seams of light, floating core
  (c) => {
    const { b, s } = c;
    c.foundation(0.1, 0.3);
    b.box(5.6, 1.4, 5.6, 0, 0.7, 0, s.base, { shade: 0.015 });
    b.box(5.7, 0.1, 5.7, 0, 1.4, 0, s.accent, { slot: SLOT_GLOW });
    b.box(3.4, 6.0, 3.4, 0, 4.4, 0, s.dark, { shade: 0.015 });
    for (let i = 0; i < 4; i++) {
      const y = 2.0 + i * 1.3;
      b.box(3.5, 0.06, 3.5, 0, y, 0, s.accent, { slot: SLOT_GLOW });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.08, 6.0, 0.08, sx * 1.72, 4.4, sz * 1.72, s.accent, { slot: SLOT_GLOW });
    b.pyramid(3.6, 2.4, 3.6, 0, 7.4, 0, s.trim);
    b.box(0.3, 1.6, 0.3, 0, 10.4, 0, s.accent, { slot: SLOT_GLOW });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.box(0.6, 3.0, 0.6, Math.cos(a) * 2.5, 1.5, Math.sin(a) * 2.5, s.trim);
      b.sphere(0.2, Math.cos(a) * 2.5, 3.2, Math.sin(a) * 2.5, s.accent, 6, { slot: SLOT_GLOW });
    }
    c.part('bobSpin', 0, 5.0, 2.4, (pb) => {
      pb.shard(0.5, 0.9, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
      pb.torus(0.9, 0.05, 0, 0, 0, s.accent, 16, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
    }, 1.0, 0.2);
    b.box(1.4, 2.2, 0.3, 0, 1.1, 2.9, s.machineDark);
    b.box(0.08, 2.0, 0.36, 0, 1.1, 2.9, s.accent, { slot: SLOT_GLOW });
    c.emit('motes', 0, 6.0, 0, 3, s.accent.getStyle());
    c.setLight(0, 6.0, 0, s.accent.getStyle(), 1.6, 14);
  },
  // ---- 6: titanium citadel — white spire, energy pylons, floating crystal, light beam
  (c) => {
    const { b, s } = c;
    c.foundation(0.05, 0.35, s.light);
    b.cyl(3.2, 3.4, 1.0, 0, 0.5, 0, s.light, 16, { shade: 0.01 });
    b.torus(3.25, 0.1, 0, 1.0, 0, s.accent, 32, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    // tiered body
    b.cyl(2.3, 2.7, 3.0, 0, 2.5, 0, s.base, 12, { shade: 0.01 });
    b.cyl(2.4, 2.4, 0.5, 0, 2.6, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    b.cyl(1.6, 2.1, 3.0, 0, 5.5, 0, s.light, 12, { shade: 0.01 });
    b.cyl(1.7, 1.7, 0.4, 0, 5.4, 0, '#ffffff', 12, { slot: SLOT_GLASS });
    b.cyl(1.0, 1.5, 2.6, 0, 8.3, 0, s.base, 12, { shade: 0.01 });
    b.torus(2.05, 0.08, 0, 4.0, 0, s.accent, 24, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.torus(1.5, 0.08, 0, 7.0, 0, s.accent, 24, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    // spire
    b.cone(1.0, 4.0, 0, 11.6, 0, s.light, 12);
    b.box(0.2, 3.0, 0.2, 0, 14.5, 0, s.accent, { slot: SLOT_GLOW });
    // energy pylons
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 2.75;
      const pz = Math.sin(a) * 2.75;
      b.box(0.7, 5.5, 0.7, px, 2.75, pz, s.light, { ry: -a });
      b.box(0.16, 5.0, 0.76, px, 2.9, pz, s.accent, { ry: -a, slot: SLOT_GLOW });
      b.box(0.9, 0.3, 0.9, px, 5.6, pz, s.trim, { ry: -a });
      b.shard(0.3, 0.7, px, 6.3, pz, s.accent, { slot: SLOT_GLOW });
      // energy arcs toward the tower
      b.box(0.06, 0.06, 1.6, px * 0.72, 6.0, pz * 0.72, s.accent, { ry: -a + Math.PI / 2, slot: SLOT_GLOW });
    }
    // floating crystal + halo
    c.part('bobSpin', 0, 9.9, 0, (pb) => {
      pb.shard(0.7, 1.6, 0, 0, 0, '#ffffff', { slot: SLOT_GLOW });
      pb.torus(1.3, 0.07, 0, 0, 0, s.accent, 20, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
      pb.torus(1.1, 0.06, 0, 0.3, 0, '#ffffff', 20, 5, { rx: 1.0, slot: SLOT_GLOW });
    }, 0.8, 0.2);
    // light beam
    b.cyl(0.25, 0.45, 9.0, 0, 15.0, 0, s.accent, 8, { slot: SLOT_GLOW });
    // entrance
    b.box(1.6, 2.2, 0.4, 0, 1.1, 2.95, s.trim);
    b.box(0.1, 2.0, 0.5, 0, 1.1, 2.95, s.accent, { slot: SLOT_GLOW });
    b.box(1.8, 0.1, 0.5, 0, 2.25, 2.95, s.accent, { slot: SLOT_GLOW });
    c.emit('motes', 0, 9.9, 0, 6, s.accent.getStyle());
    c.emit('motes', 0, 3.0, 0, 2, '#ffffff');
    c.setLight(0, 9.5, 0, s.accent.getStyle(), 2.0, 18);
  },
];

registerModel('command_center', (c) => {
  const fn = TIERS[Math.max(0, Math.min(TIERS.length - 1, c.t))];
  fn(c);
});
