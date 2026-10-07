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

  it('industry models stay inside their footprint at every tier and size they can be built in', () => {
    const industry = ['fuel_generator', 'solar_panel', 'wind_turbine', 'geothermal', 'fusion_reactor', 'battery', 'power_pylon', 'logging_camp', 'quarry', 'mine', 'drill', 'harvester', 'drone_hub', 'robot_bay', 'workbench', 'forge', 'smelter', 'electronics_lab', 'factory', 'nanoforge', 'matter_processor', 'conveyor', 'research_desk', 'research_lab', 'advanced_lab', 'med_bay', 'medical_center', 'radio_tower', 'garage', 'hangar', 'teleporter', 'spin_wheel', 'beacon', 'repair_bay', 'shield_generator', 'lamp', 'plant', 'bench', 'fountain', 'banner', 'statue', 'arcade', 'garden'];
    const bb = new THREE.Box3();
    const off = new THREE.Vector3();
    for (const key of industry) {
      const defs = data.buildings.filter((b) => b.model === key);
      const variants = defs.length ? [...new Map(defs.map((d) => [`${d.size[0]}x${d.size[1]}`, d])).values()] : [undefined];
      for (const def of variants) for (let t = 0; t < data.tiers.length; t++) {
        const spec = buildModel(key, tierStyle(data.tier(t)), 3, def);
        spec.geometry.computeBoundingBox();
        bb.copy(spec.geometry.boundingBox!);
        for (const p of spec.parts) {
          if (p.anim === 'spinZ' || p.anim === 'spinX') continue; // rotors turn high above the footprint
          p.geometry.computeBoundingBox();
          bb.union(p.geometry.boundingBox!.clone().translate(off.set(p.x, p.y, p.z)));
        }
        const label = `${key} ${spec.w}x${spec.d} tier ${t}`;
        // roof overhangs / awnings may poke out a little, nothing may spill into the neighbouring cell
        expect(Math.max(-bb.min.x, bb.max.x), label).toBeLessThanOrEqual(spec.w / 2 + 0.35);
        expect(Math.max(-bb.min.z, bb.max.z), label).toBeLessThanOrEqual(spec.d / 2 + 0.35);
        expect(bb.min.y, label).toBeGreaterThanOrEqual(-0.35);
        expect(spec.height, label).toBeGreaterThan(0.4);
      }
    }
  });

  it('industry kit: sheds, stacks and furnaces build at every tier with the expected emitters and glow', () => {
    for (let t = 0; t < data.tiers.length; t++) {
      const s = tierStyle(data.tier(t));
      for (const key of ['forge', 'smelter', 'factory', 'garage']) {
        const spec = buildModel(key, s, 1, data.buildings.find((b) => b.model === key));
        const slots = spec.geometry.attributes.aSlot.array as Float32Array;
        let glow = 0;
        for (let i = 0; i < slots.length; i++) if (slots[i] === SLOT_GLOW) glow++;
        expect(glow, `${key} tier ${t} has glowing details`).toBeGreaterThan(0);
        if (key !== 'garage') expect(spec.emitters.some((e) => e.kind === 'smoke'), `${key} tier ${t} smokes`).toBe(true);
        if (key === 'forge' || key === 'smelter') expect(spec.emitters.some((e) => e.kind === 'fire'), `${key} tier ${t} has a fire`).toBe(true);
      }
      // the conveyor's two items are spaced exactly one wrap apart so the flow never jumps
      const conv = buildModel('conveyor', s, 1, data.buildings.find((b) => b.model === 'conveyor'));
      const scroll = conv.parts.filter((p) => p.anim === 'scroll');
      expect(scroll.length).toBe(1);
      scroll[0].geometry.computeBoundingBox();
      expect(scroll[0].geometry.boundingBox!.max.x - scroll[0].geometry.boundingBox!.min.x).toBeLessThanOrEqual(scroll[0].amp * 2 + 0.4);
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
