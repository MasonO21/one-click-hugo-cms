/**
 * Defense models: barricades, traps, towers and every turret family. Turrets expose a 'turret'
 * animated part (the head, barrel pointing +Z) plus a muzzle offset so the actor can aim at aliens
 * and flash the muzzle on `turret:fired`.
 */
import * as THREE from 'three';
import { SLOT_GLOW } from '../core/GeoBuilder';
import { registerModel, type ModelCtx } from './spec';

const WOOD = '#9c6b3c';
const WOOD_DARK = '#6e4a28';
const GUN = '#3a3f47';
const GUN_LIGHT = '#6b7482';

/** Tier-styled turret pedestal; returns the pivot height for the head. */
function pedestal(c: ModelCtx, r = 0.6, h = 0.9): number {
  const { b, s } = c;
  if (s.index <= 1) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.cyl(0.08, 0.1, h + 0.3, Math.cos(a) * r * 0.75, (h + 0.3) / 2, Math.sin(a) * r * 0.75, WOOD_DARK, 5, { rz: Math.cos(a) * 0.35, rx: -Math.sin(a) * 0.35 });
    }
    b.cyl(r * 0.6, r * 0.6, 0.14, 0, h, 0, s.metal, 8);
    b.box(0.4, 0.5, 0.4, 0, 0.25, 0, '#aeb9c7');
  } else if (s.index === 2) {
    b.box(r * 1.7, h * 0.5, r * 1.7, 0, h * 0.25, 0, s.base, { shade: 0.06 });
    b.box(r * 1.4, h * 0.5, r * 1.4, 0, h * 0.75, 0, s.light, { shade: 0.06 });
    b.cyl(r * 0.5, r * 0.5, 0.14, 0, h, 0, s.metal, 8);
  } else {
    b.cyl(r, r * 1.1, h * 0.45, 0, h * 0.225, 0, s.machineDark, 10);
    b.cyl(r * 0.8, r * 0.9, h * 0.55, 0, h * 0.45 + h * 0.275, 0, s.machine, 10);
    b.torus(r * 0.85, 0.05, 0, h * 0.5, 0, s.accent, 14, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
    b.cyl(r * 0.55, r * 0.55, 0.12, 0, h, 0, s.metal, 10);
  }
  return h + 0.06;
}

registerModel('barricade', (c) => {
  const { b, s } = c;
  if (s.index <= 2) {
    for (const z of [-0.45, 0.45]) {
      b.cyl(0.1, 0.12, 2.0, 0, 0.75, z, WOOD, 5, { rz: 0.6 });
      b.cyl(0.1, 0.12, 2.0, 0, 0.75, z, WOOD_DARK, 5, { rz: -0.6 });
      b.cone(0.1, 0.3, Math.sin(0.6) * 1.0, 0.75 + Math.cos(0.6) * 1.0 + 0.1, z, '#d9c89a', 5, { rz: -0.6 });
      b.cone(0.1, 0.3, -Math.sin(0.6) * 1.0, 0.75 + Math.cos(0.6) * 1.0 + 0.1, z, '#d9c89a', 5, { rz: 0.6 });
    }
    b.cyl(0.1, 0.1, 1.4, 0, 0.9, 0, WOOD, 5, { rx: Math.PI / 2 });
  } else {
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) b.box(0.16, 1.8, 0.16, 0, 0.7, 0, s.metal, { rz: a, ry: a * 0.5 });
    b.box(1.6, 0.16, 0.16, 0, 0.5, 0, s.metal, { ry: 0.6 });
    b.box(1.6, 0.06, 0.06, 0, 0.9, 0, s.accent, { ry: -0.6, slot: SLOT_GLOW });
    b.box(1.4, 0.2, 0.6, 0, 0.1, 0, s.machineDark);
  }
});

registerModel('spikes', (c) => {
  const { b, s } = c;
  b.box(1.7, 0.12, 1.7, 0, 0.06, 0, s.index <= 1 ? WOOD_DARK : s.metal, { shade: 0.04 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const h = 0.5 + ((i + j) % 2) * 0.15 + c.lv * 0.2;
    b.cone(0.11, h, -0.55 + i * 0.55, 0.12 + h / 2, -0.55 + j * 0.55, s.index <= 1 ? '#d9c89a' : '#c7d0da', 4);
  }
  if (s.index >= 4) b.box(1.5, 0.04, 0.05, 0, 0.14, 0, s.accent, { slot: SLOT_GLOW });
});

registerModel('guard_tower', (c) => {
  const { b, s, w, d } = c;
  const h = 3.4 + c.lv * 0.8;
  const legW = s.index <= 1 ? 0.18 : 0.26;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(legW, h, legW, sx * (w / 2 - 0.45), h / 2, sz * (d / 2 - 0.45), s.trim, { rx: -sz * 0.05, rz: sx * 0.05 });
  for (const y of [h * 0.35, h * 0.7]) {
    b.box(w - 0.9, 0.08, 0.08, 0, y, d / 2 - 0.45, s.trim);
    b.box(w - 0.9, 0.08, 0.08, 0, y, -d / 2 + 0.45, s.trim);
    b.box(0.08, 0.08, d - 0.9, w / 2 - 0.45, y, 0, s.trim);
    b.box(0.08, 0.08, d - 0.9, -w / 2 + 0.45, y, 0, s.trim);
  }
  b.box(w - 0.4, 0.16, d - 0.4, 0, h, 0, s.floor, { shade: 0.03 });
  // railing
  for (const sx of [-1, 1]) {
    b.box(0.06, 0.7, d - 0.4, sx * (w / 2 - 0.22), h + 0.43, 0, s.index <= 2 ? s.base : s.metal);
    b.box(w - 0.4, 0.7, 0.06, 0, h + 0.43, sx * (d / 2 - 0.22), s.index <= 2 ? s.base : s.metal);
  }
  // roof on posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.1, 1.6, 0.1, sx * (w / 2 - 0.35), h + 0.8, sz * (d / 2 - 0.35), s.trim);
  b.pyramid(w + 0.2, 0.9, d + 0.2, 0, h + 1.6, 0, s.roof, { shade: 0.04 });
  if (s.index >= 3) b.sphere(0.12, 0, h + 2.6, 0, s.accent, 5, { slot: SLOT_GLOW });
  // ladder
  b.box(0.05, h, 0.05, -0.25, h / 2, d / 2 - 0.1, s.metal);
  b.box(0.05, h, 0.05, 0.25, h / 2, d / 2 - 0.1, s.metal);
  for (let i = 1; i < 6; i++) b.box(0.5, 0.04, 0.04, 0, (i * h) / 6, d / 2 - 0.1, s.metal);
  // mounted weapon on the platform
  c.part('turret', 0, h + 0.3, 0, (pb) => {
    pb.box(0.2, 0.3, 0.2, 0, 0.0, 0, s.metal);
    pb.box(0.14, 0.14, 0.9, 0, 0.25, 0.3, GUN);
    pb.box(0.3, 0.2, 0.3, 0, 0.25, -0.15, GUN_LIGHT);
  });
  c.muzzle(0, 0.25, 0.8);
  c.setLight(0, h + 1.2, 0, '#ffd27a', 0.6, 7);
});

registerModel('turret_basic', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.6, 0.9);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.6, 0.45, 0.7, 0, 0.25, -0.05, '#8a7a66', { shade: 0.05 });
    pb.box(0.62, 0.08, 0.72, 0, 0.5, -0.05, s.metal);
    pb.cyl(0.08, 0.08, 1.0, 0, 0.3, 0.6, GUN, 6, { rx: Math.PI / 2 });
    pb.cyl(0.12, 0.12, 0.2, 0, 0.3, 1.05, GUN_LIGHT, 6, { rx: Math.PI / 2 });
    // hand crank
    pb.cyl(0.04, 0.04, 0.3, 0.42, 0.25, -0.2, s.metal, 5, { rz: Math.PI / 2 });
    pb.box(0.08, 0.22, 0.08, 0.6, 0.35, -0.2, WOOD);
    pb.sphere(0.07, -0.25, 0.55, -0.2, '#7cff6a', 4, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.3, 1.15);
  b.box(0.5, 0.35, 0.35, 0.55, 0.18, -0.4, '#aeb9c7');
});

registerModel('turret_mg', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.65, 1.0);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.8, 0.5, 0.9, 0, 0.3, -0.1, s.machine, { shade: 0.02 });
    pb.box(0.84, 0.1, 0.5, 0, 0.58, -0.1, s.machineDark);
    for (const sx of [-0.16, 0.16]) {
      pb.cyl(0.06, 0.06, 1.2, sx, 0.32, 0.7, GUN, 6, { rx: Math.PI / 2 });
      pb.cyl(0.09, 0.09, 0.14, sx, 0.32, 1.28, GUN_LIGHT, 6, { rx: Math.PI / 2 });
    }
    pb.box(0.4, 0.4, 0.5, 0.55, 0.3, -0.2, s.machineDark);
    pb.box(0.08, 0.08, 0.5, 0.3, 0.3, 0.1, '#c9a86b');
    pb.sphere(0.07, -0.3, 0.6, -0.3, '#ff4d5e', 4, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.32, 1.35);
  void b;
});

registerModel('turret_flame', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.65, 0.9);
  b.cyl(0.3, 0.3, 0.9, 0.55, 0.45, -0.3, '#d9742a', 8);
  b.cyl(0.32, 0.32, 0.1, 0.55, 0.7, -0.3, s.metal, 8);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.7, 0.5, 0.8, 0, 0.3, -0.1, s.machine, { shade: 0.02 });
    pb.cyl(0.14, 0.14, 0.9, 0, 0.32, 0.6, GUN, 7, { rx: Math.PI / 2 });
    pb.cyl(0.26, 0.14, 0.3, 0, 0.32, 1.1, GUN_LIGHT, 7, { rx: Math.PI / 2 });
    pb.sphere(0.1, 0, 0.32, 1.22, '#ff9a2e', 5, { slot: SLOT_GLOW });
    pb.cyl(0.06, 0.06, 0.6, 0.3, 0.5, -0.2, '#d9742a', 5, { rx: Math.PI / 2 });
  });
  c.muzzle(0, 0.32, 1.3);
  c.emit('fire', 0, y + 0.32, 1.2, 0.6);
});

registerModel('turret_missile', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.7, 1.0);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.7, 0.4, 0.8, 0, 0.2, -0.1, s.machine, { shade: 0.02 });
    pb.box(1.0, 0.8, 1.1, 0, 0.75, 0.0, s.machineDark, { shade: 0.02 });
    for (const sx of [-0.25, 0.25]) for (const sy of [0.55, 0.95]) {
      pb.cyl(0.14, 0.14, 1.12, sx, sy, 0.0, GUN, 7, { rx: Math.PI / 2 });
      pb.cone(0.12, 0.2, sx, sy, 0.62, '#ff4d5e', 7, { rx: Math.PI / 2 });
    }
    pb.box(0.08, 0.3, 0.3, 0.55, 0.9, -0.3, s.accent, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.75, 0.7);
});

registerModel('turret_heavy', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.85, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(1.3, 0.7, 1.3, 0, 0.4, -0.1, s.machine, { shade: 0.02 });
    pb.box(1.4, 0.3, 0.3, 0, 0.6, 0.6, s.machineDark);
    for (const sx of [-0.3, 0.3]) {
      pb.cyl(0.12, 0.12, 1.8, sx, 0.45, 1.0, GUN, 8, { rx: Math.PI / 2 });
      pb.cyl(0.17, 0.17, 0.3, sx, 0.45, 1.85, GUN_LIGHT, 8, { rx: Math.PI / 2 });
    }
    pb.box(1.0, 0.1, 0.9, 0, 0.8, -0.2, s.accent, { slot: SLOT_GLOW });
    pb.box(0.5, 0.5, 0.6, -0.8, 0.4, -0.3, s.machineDark);
  });
  c.muzzle(0, 0.45, 2.0);
});

registerModel('turret_laser', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.6, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.5, 0.4, 0.9, 0, 0.25, -0.1, s.machine, { shade: 0.02 });
    pb.box(0.6, 0.12, 0.6, 0, 0.5, -0.2, s.machineDark);
    pb.box(0.2, 0.2, 1.2, 0, 0.3, 0.6, GUN_LIGHT);
    pb.box(0.08, 0.08, 1.3, 0, 0.42, 0.6, s.accent, { slot: SLOT_GLOW });
    pb.cyl(0.18, 0.1, 0.3, 0, 0.3, 1.3, s.machineDark, 8, { rx: Math.PI / 2 });
    pb.sphere(0.1, 0, 0.3, 1.45, '#ff5a6e', 5, { slot: SLOT_GLOW });
    pb.shard(0.14, 0.3, 0, 0.72, -0.2, s.accent, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.3, 1.5);
});

registerModel('turret_plasma', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.7, 1.0);
  b.torus(0.75, 0.06, 0, 0.6, 0, s.accent, 14, 5, { rx: Math.PI / 2, slot: SLOT_GLOW });
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.8, 0.4, 0.8, 0, 0.2, -0.1, s.machine, { shade: 0.02 });
    pb.sphere(0.42, 0, 0.7, -0.1, s.accent, 8, { slot: SLOT_GLOW });
    for (let i = 0; i < 3; i++) pb.torus(0.5, 0.04, 0, 0.7, -0.1, s.metal, 12, 4, { rx: Math.PI / 2 + i * 0.6, ry: i * 1.1 });
    pb.cyl(0.16, 0.22, 0.8, 0, 0.6, 0.5, GUN_LIGHT, 8, { rx: Math.PI / 2 });
    pb.torus(0.24, 0.05, 0, 0.6, 0.9, s.accent, 10, 4, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.6, 1.0);
  c.emit('motes', 0, y + 0.7, -0.1, 2, s.accent.getStyle());
  c.setLight(0, y + 0.7, 0, s.accent.getStyle(), 0.8, 7);
});

registerModel('turret_rail', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.75, 1.3);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.9, 0.5, 1.0, 0, 0.25, -0.2, s.machine, { shade: 0.02 });
    for (const sx of [-0.14, 0.14]) pb.box(0.1, 0.22, 2.6, sx, 0.55, 0.9, GUN_LIGHT);
    pb.box(0.14, 0.08, 2.4, 0, 0.55, 0.9, s.accent, { slot: SLOT_GLOW });
    pb.box(0.5, 0.3, 0.4, 0, 0.6, -0.5, s.machineDark);
    for (let i = 0; i < 3; i++) pb.torus(0.26, 0.04, 0, 0.55, 0.3 + i * 0.7, s.metal, 8, 4);
    pb.sphere(0.1, 0, 0.85, -0.5, s.accent, 5, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.55, 2.2);
});

registerModel('turret_cannon', (c) => {
  const { s } = c;
  const y = pedestal(c, 0.9, 1.1);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(1.4, 0.8, 1.4, 0, 0.45, -0.2, s.machine, { shade: 0.02 });
    pb.box(1.5, 0.3, 0.4, 0, 0.5, 0.6, s.machineDark);
    pb.cyl(0.26, 0.3, 2.2, 0, 0.55, 1.1, GUN, 10, { rx: Math.PI / 2 });
    pb.cyl(0.34, 0.34, 0.4, 0, 0.55, 2.1, GUN_LIGHT, 10, { rx: Math.PI / 2 });
    pb.box(1.0, 0.1, 1.0, 0, 0.9, -0.3, s.accent, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 0.55, 2.35);
});

registerModel('turret_aa', (c) => {
  const { b, s } = c;
  const y = pedestal(c, 0.7, 1.0);
  c.part('spinY', 0.7, 0.6, -0.6, (pb) => {
    pb.cyl(0.35, 0.1, 0.2, 0, 0.3, 0, '#dfe6ee', 10, { rx: -0.9 });
    pb.cyl(0.04, 0.04, 0.5, 0, 0.15, 0, s.metal, 4);
  }, 2);
  c.part('turret', 0, y, 0, (pb) => {
    pb.box(0.8, 0.5, 0.8, 0, 0.25, -0.1, s.machine, { shade: 0.02 });
    for (const sx of [-0.22, -0.08, 0.08, 0.22]) {
      pb.cyl(0.05, 0.05, 1.3, sx, 0.75, 0.45, GUN, 6, { rx: Math.PI / 2 - 0.6 });
    }
    pb.box(0.7, 0.3, 0.5, 0, 0.6, -0.1, s.machineDark);
    pb.sphere(0.07, 0, 0.8, -0.35, '#ff4d5e', 4, { slot: SLOT_GLOW });
  });
  c.muzzle(0, 1.1, 0.9);
  void b;
});

registerModel('electric_fence', (c) => {
  const { b, s } = c;
  for (const x of [-0.85, 0.85]) {
    b.box(0.18, 1.5, 0.18, x, 0.75, 0, s.metal);
    for (const y of [0.5, 0.9, 1.3]) b.cyl(0.06, 0.08, 0.1, x, y + 0.03, 0.12, '#dfe6ee', 5);
  }
  for (const y of [0.5, 0.9, 1.3]) b.box(1.7, 0.04, 0.04, 0, y, 0.12, s.accent, { slot: SLOT_GLOW });
  b.box(0.4, 0.3, 0.2, -0.85, 1.6, 0, s.machine);
  b.sphere(0.06, -0.85, 1.65, 0.12, '#ffd84a', 4, { slot: SLOT_GLOW });
  c.emit('sparks', 0, 1.0, 0.1, 0.4, s.accent.getStyle());
});

registerModel('drone_pad', (c) => {
  const { b, s, w, d } = c;
  const r = Math.min(w, d) * 0.42;
  b.cyl(r, r + 0.1, 0.25, 0, 0.12, 0, s.machineDark, 12);
  b.torus(r * 0.75, 0.05, 0, 0.26, 0, s.accent, 16, 4, { rx: Math.PI / 2, slot: SLOT_GLOW });
  b.box(0.3, 0.6, 0.3, r * 0.9, 0.3, r * 0.9, s.trim);
  b.box(0.3, 0.2, 0.3, r * 0.9, 0.7, r * 0.9, s.accent, { slot: SLOT_GLOW });
  c.part('bobSpin', 0, 1.6, 0, (pb) => {
    pb.box(0.4, 0.18, 0.4, 0, 0, 0, s.machine);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pb.box(0.36, 0.04, 0.04, sx * 0.26, 0.05, sz * 0.26, s.metal, { ry: Math.PI / 4 });
      pb.cyl(0.22, 0.22, 0.03, sx * 0.36, 0.1, sz * 0.36, s.accent, 8, { slot: SLOT_GLOW });
    }
    pb.cyl(0.05, 0.05, 0.5, 0, -0.1, 0.1, GUN, 5, { rx: Math.PI / 2 });
    pb.sphere(0.06, 0, -0.08, -0.2, '#ff4d5e', 4, { slot: SLOT_GLOW });
  }, 0.8, 0.2);
});

/** Exported for the showcase: turret model keys in power order. */
export const TURRET_KEYS = ['turret_basic', 'turret_mg', 'turret_flame', 'turret_missile', 'turret_heavy', 'turret_laser', 'turret_plasma', 'turret_rail', 'turret_cannon', 'turret_aa'];

void THREE;
