import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createDataRegistry } from '../src/data';
import { tierStyle, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, pick } from '../src/render/core/palette';
import { GeoBuilder, SLOT_GLOW, mergeCopies } from '../src/render/core/GeoBuilder';
import { buildModel, registeredModelKeys, pieceGeometry, nodeGeometry, propGeometry, poiGeometry, alienGeometry, vehicleGeometry, partGeometry, KNOWN_NODE_MODELS, KNOWN_PROP_MODELS, KNOWN_POI_MODELS, KNOWN_ALIEN_MODELS, KNOWN_VEHICLE_MODELS } from '../src/render/models';
import type { PieceGeoKey } from '../src/render/models';

const data = createDataRegistry();

function finite(geo: THREE.BufferGeometry): boolean {
  const p = geo.attributes.position.array as Float32Array;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return false;
  return true;
}

describe('render models', () => {
  it('GeoBuilder merges primitives into grouped geometry in slot order', () => {
    const b = new GeoBuilder(1);
    b.box(1, 1, 1, 0, 0, 0, '#ff0000');
    b.sphere(0.5, 0, 2, 0, '#00ff00', 6, { slot: SLOT_GLOW });
    const g = b.build();
    expect(g.groups.length).toBe(0); // single draw call: slots live in the aSlot attribute
    const slots = g.attributes.aSlot.array as Float32Array;
    expect(slots[0]).toBe(0);
    expect(slots[slots.length - 1]).toBe(1);
    let seenGlow = false;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === 1) seenGlow = true;
      if (seenGlow) expect(slots[i]).toBe(1); // lit vertices first, then glow
    }
    expect(g.attributes.color.count).toBe(g.attributes.position.count);
    expect(finite(g)).toBe(true);
    const merged = mergeCopies(g, [0, 0, 4, 0, 0, 4]);
    expect(merged.attributes.position.count).toBe(g.attributes.position.count * 3);
    expect(merged.attributes.aSlot.count).toBe(g.attributes.position.count * 3);
  });

  it('builds every registered building model at every tier and a few levels', () => {
    const keys = registeredModelKeys();
    expect(keys.length).toBeGreaterThan(60);
    for (const key of keys) {
      for (let t = 0; t < data.tiers.length; t++) {
        const def = data.buildings.find((b) => b.model === key);
        const spec = buildModel(key, tierStyle(data.tier(t)), 1 + (t % 3), def);
        expect(spec.geometry.attributes.position.count, `${key} tier ${t}`).toBeGreaterThan(0);
        expect(finite(spec.geometry), `${key} tier ${t}`).toBe(true);
        expect(spec.height).toBeGreaterThan(0);
        for (const p of spec.parts) expect(finite(p.geometry)).toBe(true);
      }
    }
  });

  it('command center looks different at every tier', () => {
    const counts = new Set<number>();
    for (let t = 0; t < 7; t++) counts.add(buildModel('command_center', tierStyle(data.tier(t)), 1, data.building('command_center')).geometry.attributes.position.count);
    expect(counts.size).toBe(7);
  });

  it('turrets expose an aimable head and a muzzle', () => {
    for (const key of registeredModelKeys().filter((k) => k.startsWith('turret_'))) {
      const spec = buildModel(key, tierStyle(data.tier(3)), 1, undefined);
      expect(spec.parts.some((p) => p.anim === 'turret'), key).toBe(true);
      expect(spec.muzzle, key).not.toBeNull();
    }
  });

  it('unknown model keys fall back to a generic block', () => {
    const spec = buildModel('definitely_not_a_model', tierStyle(data.tier(2)), 1, undefined);
    expect(spec.geometry.attributes.position.count).toBeGreaterThan(0);
  });

  it('builds all structure pieces for all tiers', () => {
    const keys: PieceGeoKey[] = ['wall_core', 'wall_arm', 'wall_full', 'door', 'window', 'gate', 'fence_core', 'fence_arm', 'fence_full', 'pillar', 'floor', 'platform', 'stairs', 'roof_tile', 'scaffold'];
    for (let t = 0; t < 7; t++) {
      const s = tierStyle(data.tier(t));
      for (const k of keys) {
        const g = pieceGeometry(k, s);
        expect(g.attributes.position.count, `${k} ${t}`).toBeGreaterThan(0);
        expect(finite(g)).toBe(true);
      }
    }
  });

  it('builds nature, poi, alien, vehicle and character geometry incl. fallbacks', () => {
    for (const m of [...KNOWN_NODE_MODELS, 'mystery_node']) expect(nodeGeometry(m).attributes.position.count).toBeGreaterThan(0);
    for (const m of [...KNOWN_PROP_MODELS, 'mystery_prop']) expect(propGeometry(m).attributes.position.count).toBeGreaterThan(0);
    for (const m of [...KNOWN_POI_MODELS, 'mystery_poi']) expect(poiGeometry(m).attributes.position.count).toBeGreaterThan(0);
    for (const m of [...KNOWN_ALIEN_MODELS, 'mystery_alien']) {
      const g = alienGeometry(m);
      expect(g.body.attributes.position.count).toBeGreaterThan(0);
      expect(g.detail.attributes.position.count).toBeGreaterThan(0);
    }
    for (const m of [...KNOWN_VEHICLE_MODELS, 'mystery_vehicle']) expect(vehicleGeometry(m).attributes.position.count).toBeGreaterThan(0);
    for (const k of ['body', 'head', 'face', 'arm', 'leg', 'hair0', 'hair1', 'hair2', 'hair3'] as const) expect(partGeometry(k).attributes.position.count).toBeGreaterThan(0);
    // every data node/poi/alien model is covered
    for (const n of data.nodes) expect(KNOWN_NODE_MODELS).toContain(n.model);
    for (const p of data.pois) expect(KNOWN_POI_MODELS).toContain(p.model);
    for (const a of data.aliens) expect(KNOWN_ALIEN_MODELS).toContain(a.model);
  });

  it('palette picks wrap around safely', () => {
    expect(pick(SKIN_TONES, -1)).toBe(SKIN_TONES[SKIN_TONES.length - 1]);
    expect(pick(HAIR_COLORS, 100)).toBe(HAIR_COLORS[100 % HAIR_COLORS.length]);
    expect(pick(OUTFIT_COLORS, 3)).toBe(OUTFIT_COLORS[3]);
  });
});
