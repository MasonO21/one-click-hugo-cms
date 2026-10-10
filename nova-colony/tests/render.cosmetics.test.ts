import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { COSMETICS } from '../src/data/monetization';
import { ALIENS } from '../src/data/aliens';
import { hatGeometry, hatSpec, KNOWN_HATS } from '../src/render/models/hats';
import { petGeometry, PETS, KNOWN_PETS } from '../src/render/models/pets';
import { alienGeometry } from '../src/render/models/aliens';
import { vehicleGeometry, paintFromSkin, KNOWN_VEHICLE_MODELS, toolGeometry, TOOL_KEYS, nodeTool } from '../src/render/models/characters';
import { newPetMotion, stepPet, PET_SNAP_DIST } from '../src/render/actors/petMotion';
import { colonistLook, playerLook, varyColor, trouserShade, PLAYER_DEFAULT } from '../src/render/actors/looks';
import { swingArm } from '../src/render/actors/Characters';
import { outfitBodyGeometry, uniformBodyGeometry, uniformHeadGeometry } from '../src/render/models/outfits';
import { partGeometry, PART_KEYS } from '../src/render/models/characters';
import { HAIR_STYLES } from '../src/render/core/palette';

const finite = (g: THREE.BufferGeometry) => Array.from(g.attributes.position.array as ArrayLike<number>).every(Number.isFinite);

describe('cosmetic models', () => {
  it('every hat in the catalogue has a model', () => {
    const hats = COSMETICS.filter((c) => c.kind === 'hat');
    expect(hats.length).toBeGreaterThan(0);
    for (const h of hats) {
      expect(KNOWN_HATS, h.id).toContain(h.id);
      const g = hatGeometry(h.id, h.color ?? '#888888', h.accent ?? '#444444');
      const spec = hatSpec(h.id)!;
      const total = g.main.attributes.position.count + (g.glass?.attributes.position.count ?? 0) + (g.orbit?.attributes.position.count ?? 0);
      expect(total, h.id).toBeGreaterThan(0);
      expect(finite(g.main), h.id).toBe(true);
      if (spec.glass) expect(g.glass, h.id).not.toBeNull();
      if (spec.orbit) expect(g.orbit, h.id).not.toBeNull();
    }
    // unknown ids give an empty hat, not a crash
    expect(hatGeometry('hat_nope', '#fff', '#000').main.attributes.position.count).toBe(0);
  });

  it('every pet in the catalogue has a model with parts for its mounts', () => {
    const pets = COSMETICS.filter((c) => c.kind === 'pet');
    expect(pets.length).toBeGreaterThan(0);
    for (const p of pets) {
      expect(KNOWN_PETS, p.id).toContain(p.id);
      const g = petGeometry(p.id, p.color ?? '#888888', p.accent ?? '#444444')!;
      expect(g.body.attributes.position.count, p.id).toBeGreaterThan(0);
      expect(finite(g.body)).toBe(true);
      const spec = PETS[p.id];
      if (spec.leg) expect(g.leg, p.id).not.toBeNull();
      if (spec.part) expect(g.part, p.id).not.toBeNull();
      if (spec.part?.mounts.some((m) => m.flip)) expect(g.partL, p.id).not.toBeNull();
    }
    expect(petGeometry('pet_nope', '#fff', '#000')).toBeNull();
  });

  it('every alien (and boss) model builds, bosses with extra regalia', () => {
    for (const a of ALIENS) {
      const g = alienGeometry(a.model, !!a.boss);
      expect(g.body.attributes.position.count, a.id).toBeGreaterThan(0);
      expect(g.detail.attributes.position.count, a.id).toBeGreaterThan(0);
      expect(finite(g.body) && finite(g.detail), a.id).toBe(true);
      if (a.boss) expect(g.detail.attributes.position.count, a.id).toBeGreaterThan(alienGeometry(a.model, false).detail.attributes.position.count);
    }
  });

  it('vehicle skins repaint the body and trim of every vehicle model', () => {
    const skins = COSMETICS.filter((c) => c.kind === 'vehicle_skin');
    for (const m of KNOWN_VEHICLE_MODELS) {
      const base = vehicleGeometry(m);
      for (const s of skins) {
        const g = vehicleGeometry(m, paintFromSkin(s.color!, s.accent ?? s.color!), s.id);
        expect(g, `${m} ${s.id}`).not.toBe(base);
        expect(g.attributes.position.count).toBe(base.attributes.position.count);
        expect(Array.from(g.attributes.color.array)).not.toEqual(Array.from(base.attributes.color.array));
      }
      // cached per skin
      expect(vehicleGeometry(m, paintFromSkin('#123456', '#abcdef'), skins[0].id)).toBe(vehicleGeometry(m, paintFromSkin('#123456', '#abcdef'), skins[0].id));
    }
  });

  it('every outfit and colonist uniform has its own extras', () => {
    for (const o of COSMETICS.filter((c) => c.kind === 'outfit')) {
      const g = outfitBodyGeometry(o.id, o.color!, o.accent ?? o.color!);
      expect(g, o.id).not.toBeNull();
      expect(finite(g!), o.id).toBe(true);
    }
    for (const u of COSMETICS.filter((c) => c.kind === 'colonist_outfit')) {
      const body = uniformBodyGeometry(u.id, u.color!, u.accent ?? u.color!);
      const head = uniformHeadGeometry(u.id, u.color!, u.accent ?? u.color!);
      expect(body || head, u.id).toBeTruthy();
    }
    expect(outfitBodyGeometry(undefined, '#fff', '#000')).toBeNull();
    expect(uniformHeadGeometry('colonist_nope', '#fff', '#000')).toBeNull();
  });

  it('far settler parts are much lighter than near ones', () => {
    let near = 0;
    let far = 0;
    for (const k of PART_KEYS) {
      near += partGeometry(k, 0).attributes.position.count;
      far += partGeometry(k, 1).attributes.position.count;
    }
    expect(far).toBeLessThan(near * 0.5);
  });

  it('held items build and node models pick the right tool', () => {
    for (const k of TOOL_KEYS) expect(toolGeometry(k).attributes.position.count, k).toBeGreaterThan(0);
    expect(nodeTool('tree_round')).toBe('axe');
    expect(nodeTool('tree_pine')).toBe('axe');
    expect(nodeTool('rock')).toBe('pick');
    expect(nodeTool('ore_iron')).toBe('pick');
    expect(nodeTool('crystal')).toBe('pick');
  });
});

describe('pet follow motion', () => {
  const f = { side: 1, back: 0.8, lag: 0.45, stride: 1.6, personal: 0.75 };

  it('appears at its spot, then trails a walking player with a lag and sits when they stop', () => {
    const m = newPetMotion();
    stepPet(m, 0, 0, 0, 0, 0.016, f);
    expect(m.init).toBe(true);
    // facing +Z, the spot is to the player's right (-X) and behind (-Z)
    expect(m.x).toBeCloseTo(-1, 5);
    expect(m.z).toBeCloseTo(-0.8, 5);
    // player walks +Z at 4 u/s for 3 s
    let pz = 0;
    for (let i = 0; i < 180; i++) {
      pz += 4 / 60;
      stepPet(m, 0, pz, 0, 4, 1 / 60, f);
    }
    expect(m.speed).toBeGreaterThan(3);
    expect(m.sit).toBeLessThan(0.05);
    const gap = Math.hypot(m.x - 0, m.z - pz);
    expect(gap).toBeGreaterThan(0.8); // lags behind
    expect(gap).toBeLessThan(4.5);
    expect(Math.abs(m.rot)).toBeLessThan(0.3); // faces where it goes
    // player stops: the pet settles at its spot and sits
    for (let i = 0; i < 240; i++) stepPet(m, 0, pz, 0, 0, 1 / 60, f);
    expect(Math.hypot(m.x + 1, m.z - (pz - 0.8))).toBeLessThan(0.2);
    expect(m.sit).toBeGreaterThan(0.8);
  });

  it('keeps up with a vehicle and snaps back after a teleport', () => {
    const m = newPetMotion();
    stepPet(m, 0, 0, Math.PI / 2, 0, 0.016, f);
    let px = 0;
    for (let i = 0; i < 300; i++) {
      px += 14 / 60;
      stepPet(m, px, 0, Math.PI / 2, 14, 1 / 60, f);
    }
    expect(Math.hypot(m.x - px, m.z)).toBeLessThan(6);
    stepPet(m, px + PET_SNAP_DIST + 50, 0, Math.PI / 2, 0, 1 / 60, f);
    expect(Math.hypot(m.x - (px + PET_SNAP_DIST + 50), m.z)).toBeLessThan(1.5);
  });

  it('never stands inside the player', () => {
    const m = newPetMotion();
    stepPet(m, 0, 0, 0, 0, 0.016, { ...f, side: 0, back: 0 });
    for (let i = 0; i < 120; i++) stepPet(m, 0, 0, 0, 0, 1 / 60, { ...f, side: 0, back: 0 });
    expect(Math.hypot(m.x, m.z)).toBeGreaterThanOrEqual(0.75 - 1e-6);
  });
});

describe('settler looks', () => {
  it('colonists in their own clothes vary and stay in the palettes', () => {
    const a = colonistLook({ skin: 1, hair: 3, hairColor: 2, outfit: 4, height: 1 }, 7);
    const b = colonistLook({ skin: 1, hair: 3, hairColor: 2, outfit: 5, height: 1 }, 8);
    expect(a.outfit).not.toBe(b.outfit);
    expect(a.style).toBe(3);
    expect(colonistLook({ skin: 0, hair: 11, hairColor: 0, outfit: 0, height: 1 }, 1).style).toBe(11 % HAIR_STYLES);
    expect(colonistLook(undefined, 1).outfit).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('a colonist uniform dresses everyone in its colours with a slight per-colonist variation', () => {
    const u = { color: '#4f78a8', accent: '#e8c47a' };
    const looks = [1, 2, 3, 4, 5, 6].map((id) => colonistLook({ skin: 0, hair: 0, hairColor: 0, outfit: id, height: 1 }, id, u));
    const outfits = new Set(looks.map((l) => l.outfit));
    expect(outfits.size).toBeGreaterThan(3); // not identical clones
    for (const l of looks) {
      // close to the uniform colour
      const d = Math.abs(parseInt(l.outfit.slice(1, 3), 16) - 0x4f) + Math.abs(parseInt(l.outfit.slice(3, 5), 16) - 0x78) + Math.abs(parseInt(l.outfit.slice(5, 7), 16) - 0xa8);
      expect(d).toBeLessThan(70);
      expect(l.trousers).toBe(trouserShade(l.outfit));
    }
    expect(varyColor('#4f78a8', 3)).toBe(varyColor('#4f78a8', 3)); // deterministic
  });

  it('the player wears the outfit colour with accent trims, or the default jacket', () => {
    expect(playerLook().outfit).toBe(PLAYER_DEFAULT.color);
    expect(playerLook().accent).toBe(PLAYER_DEFAULT.accent);
    const l = playerLook({ color: '#2f3866', accent: '#d8b45a' });
    expect(l.outfit).toBe('#2f3866');
    expect(l.accent).toBe('#d8b45a');
    expect(l.trousers).toBe(trouserShade('#2f3866'));
  });

  it('a tool swing raises slowly and strikes fast', () => {
    expect(swingArm(0).arm).toBeGreaterThan(swingArm(0.5).arm); // raising (more negative = higher)
    expect(swingArm(0.6).arm).toBeLessThan(-2.5);
    expect(swingArm(0.7).strike).toBeCloseTo(1, 5);
    expect(swingArm(0.7).arm).toBeGreaterThan(-0.6);
    expect(Math.abs(swingArm(0.999).arm - swingArm(0).arm)).toBeLessThan(0.05); // loops
  });
});
