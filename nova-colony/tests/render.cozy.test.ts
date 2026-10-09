/**
 * Cozy world: the painted-map nature kit (node variants, far LODs), the ground palette and flower
 * specks, the colony theme / turret skin looks on buildings and the theme's ambient particles.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { Materials } from '../src/render/core/materials';
import { GeoBuilder } from '../src/render/core/GeoBuilder';
import type { Env, RenderContext } from '../src/render/core/context';
import { Buildings } from '../src/render/actors/Buildings';
import { CENTER_CELL } from '../src/core/constants';
import { buildModel } from '../src/render/models/spec';
import { tierStyle, themedStyle, skinnedStyle } from '../src/render/core/palette';
import { nodeVariant, baseModel, nodeGeometry, nodeGeometryFar, nodeHeight, nodeChipColor, KNOWN_NODE_MODELS, NODE_FAR_MODELS, KNOWN_PROP_MODELS } from '../src/render/models/nature';
import { GROUND_PAINT, patchBloom, BLOOM_NEAR, BLOOM_FAR } from '../src/render/scene/Terrain';
import { ThemeFx, THEME_FX_COUNT, FX_STYLES, THEME_FX_COLORS } from '../src/render/fx/ThemeFx';
import { createDataRegistry } from '../src/data';
import { COSMETICS } from '../src/data/monetization';

const data = createDataRegistry();

function makeCtx(game: Game, quality: Env['quality'] = 'medium'): RenderContext {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 390 / 844, 0.5, 1800);
  const env: Env = { t: 0, dt: 0, night: 0, sunElev: 1, quality, cx: 0, cz: 0, viewRadius: 104, camX: 0, camY: 18, camZ: 26, fwdX: 0, fwdZ: -1, terrainVersion: 0 };
  const noop = () => {};
  const particles = { chips: noop, dust: noop, sparkles: noop, ring: noop, flash: noop, confetti: noop, smoke: noop, sparks: noop, emit: noop, steam: noop, fire: noop, scale: 1 } as unknown as RenderContext['particles'];
  return { game, scene, camera, mats: new Materials(), env, heightAt: () => 0, particles };
}

function own(game: Game, id: string): void {
  const c = game.state.liveops.cosmetics;
  if (!c.owned.includes(id)) c.owned.push(id);
  expect(game.sys.liveops.equipCosmetic(id)).toBe(true);
}

describe('cozy nature kit', () => {
  it('nodeVariant is deterministic, keeps the base model and follows the def and the biome', () => {
    for (let i = 0; i < 200; i++) {
      const v = nodeVariant('tree_round', 'tree_round', 'crash_valley', i);
      expect(v).toBe(nodeVariant('tree_round', 'tree_round', 'crash_valley', i));
      expect(baseModel(v)).toBe('tree_round');
      expect(KNOWN_NODE_MODELS).toContain(v);
    }
    // a valley forest mixes looks instead of stamping one tree out
    const looks = new Set(Array.from({ length: 200 }, (_, i) => nodeVariant('tree_round', 'tree_round', 'crash_valley', i)));
    expect(looks.size).toBeGreaterThanOrEqual(3);
    expect(nodeVariant('tree_round', 'tree_round', 'toxic_marsh', 3)).toBe('tree_round~marsh');
    expect(nodeVariant('tree_pine', 'tree_ancient', 'pinewood_forest', 3)).toBe('tree_pine~ancient');
    expect(nodeVariant('bush', 'bush_glow', 'pinewood_forest', 3)).toBe('bush~glow');
    expect(nodeVariant('bush', 'bush_berry', 'pinewood_forest', 3)).toBe('bush');
    expect(nodeVariant('rock', 'rock', 'red_desert', 1)).toBe('rock~desert');
    expect(nodeVariant('rock', 'rock', 'frozen_ridge', 1)).toBe('rock~snow');
    expect(nodeVariant('rock', 'rock', 'crash_valley', 1)).toBe('rock');
    // resource rocks never change model: their nuggets say what they give
    for (const m of ['ore_iron', 'ore_copper', 'coal', 'crystal', 'titanium', 'scrap', 'ice_ore', 'bio_pod', 'fiber_grass']) expect(nodeVariant(m, m, 'red_desert', 7)).toBe(m);
  });

  it('every data node model, in every region it grows, resolves to a built look', () => {
    for (const biome of data.biomes) {
      for (const e of biome.nodes) {
        const def = data.node(e.node)!;
        for (let i = 0; i < 20; i++) {
          const key = nodeVariant(def.model, def.id, biome.id, i);
          expect(KNOWN_NODE_MODELS, `${biome.id}/${def.id} -> ${key}`).toContain(key);
        }
      }
    }
  });

  it('variants answer heights and chip colours for their base model; far LODs stay cheaper', () => {
    expect(nodeHeight('tree_round~tall')).toBe(nodeHeight('tree_round'));
    expect(nodeHeight('rock~snow')).toBe(nodeHeight('rock'));
    expect(nodeChipColor('tree_pine~ancient')).toBe(nodeChipColor('tree_pine'));
    expect(nodeChipColor('bush~glow')).not.toBe(nodeChipColor('bush'));
    for (const m of KNOWN_NODE_MODELS) {
      const near = nodeGeometry(m);
      expect(near.attributes.position.count, m).toBeGreaterThan(0);
      if (NODE_FAR_MODELS.includes(m)) expect(nodeGeometryFar(m).attributes.position.count, m).toBeLessThan(near.attributes.position.count);
      // a near tree stays a modest instance (a forest draws hundreds of them)
      expect(near.attributes.position.count / 3, `${m} triangles`).toBeLessThan(700);
    }
    // every tree / rock look has a far LOD
    for (const m of KNOWN_NODE_MODELS) if (/^(tree_|rock|bush)/.test(m)) expect(NODE_FAR_MODELS, m).toContain(m);
  });

  it('every biome prop is a built prop model', () => {
    for (const b of data.biomes) for (const p of b.props) expect(KNOWN_PROP_MODELS, `${b.id}: ${p}`).toContain(p);
  });
});

describe('painted ground', () => {
  it('every biome has a painted palette; snow and sand bloom less than the valley meadow', () => {
    for (const b of data.biomes) {
      const p = GROUND_PAINT[b.id];
      expect(p, b.id).toBeDefined();
      for (const c of [p.low, p.high, p.warm, p.cool]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.bloom).toBeGreaterThanOrEqual(0);
      expect(p.bloom).toBeLessThanOrEqual(1);
    }
    expect(GROUND_PAINT.crash_valley.bloom).toBe(1);
    expect(GROUND_PAINT.frozen_ridge.bloom).toBe(0);
    expect(GROUND_PAINT.red_desert.bloom).toBeLessThan(0.1);
  });

  it('patchBloom adds the per-vertex weight, the world position and a distance-faded speck to the terrain shader', () => {
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
    };
    const u = { value: 1 };
    patchBloom(shader, u);
    expect(shader.uniforms.uBloom).toBe(u);
    expect(shader.vertexShader).toContain('attribute float aBloom');
    expect(shader.vertexShader).toContain('vNovaXZ =');
    expect(shader.fragmentShader).toContain('#include <color_fragment>');
    expect(shader.fragmentShader).toContain(BLOOM_NEAR.toFixed(1));
    expect(shader.fragmentShader).toContain(BLOOM_FAR.toFixed(1));
    expect(BLOOM_FAR).toBeGreaterThan(BLOOM_NEAR);
  });
});

describe('colony theme and turret skin looks', () => {
  const theme = { id: 'theme_blossom', color: '#ffb7c5', accent: '#ff6f91' };
  it('themedStyle leans roofs and trims toward the theme, keeps walls and window light, never touches the stock style', () => {
    const base = tierStyle(data.tier(3));
    const before = base.roof.getHex();
    const t = themedStyle(base, theme);
    expect(t).not.toBe(base);
    expect(t.look).toBe('theme:theme_blossom');
    expect(base.look).toBe('');
    expect(base.roof.getHex()).toBe(before);
    const pink = new THREE.Color(theme.color);
    const dist = (a: THREE.Color, b: THREE.Color) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
    expect(dist(t.roof, pink)).toBeLessThan(dist(base.roof, pink));
    expect(t.base.getHex()).toBe(base.base.getHex());
    expect(t.lamp.getHex()).toBe(base.lamp.getHex());
    expect(themedStyle(base, theme)).toBe(t); // cached
    expect(themedStyle(base, null)).toBe(base);
  });

  it('skinnedStyle repaints the turret body and trims; a skinned model is its own cache entry', () => {
    const base = tierStyle(data.tier(0));
    const skin = { id: 'turret_gold', color: '#ffd84a', accent: '#fff8d8' };
    const s = skinnedStyle(base, skin);
    expect(s.skinned).toBe(true);
    expect(s.machine.getHex()).toBe(new THREE.Color(skin.color).getHex());
    const def = data.building('scrap_turret')!;
    const stock = buildModel(def.model, base, 1, def);
    const gold = buildModel(def.model, s, 1, def);
    expect(gold).not.toBe(stock);
    expect(gold.key).not.toBe(stock.key);
    expect(buildModel(def.model, s, 1, def)).toBe(gold);
  });

  it('Buildings: equipping a theme rebuilds with themed looks, a turret skin repaints only turrets, unequipping restores stock', () => {
    const game = new Game({ seed: 11, services: createMockServices() });
    game.start();
    const B = game.sys.buildings;
    const place = (id: string) => {
      for (let k = 0; k < 300; k++) {
        const got = B.place(id, CENTER_CELL - 10 + (k % 20) * 3, CENTER_CELL + 6 + Math.floor(k / 20) * 3, 0, { free: true, instant: true, quiet: true });
        if (got != null) return got;
      }
      return null;
    };
    expect(place('scrap_turret')).not.toBeNull();
    expect(place('campfire')).not.toBeNull();
    game.update(0.1);
    const buildings = new Buildings(makeCtx(game));
    const looks = () => [...(buildings as unknown as { facilityBatches: Map<string, { entries: unknown[] }> }).facilityBatches].filter(([, fb]) => fb.entries.length > 0).map(([k]) => k);
    buildings.update(1 / 60);
    expect(looks().every((k) => !k.includes('theme:') && !k.includes('skin:'))).toBe(true);

    own(game, 'theme_autumn');
    buildings.update(1 / 60);
    for (let i = 0; i < 20; i++) buildings.update(1 / 60); // a theme change rebuilds like a tier-up wave
    const themed = looks();
    expect(themed.some((k) => k.startsWith('campfire|') && k.endsWith('|theme:theme_autumn'))).toBe(true);
    expect(themed.some((k) => k.startsWith('turret_basic|') && k.endsWith('|theme:theme_autumn'))).toBe(true);

    own(game, 'turret_gold');
    for (let i = 0; i < 20; i++) buildings.update(1 / 60);
    const skinned = looks();
    expect(skinned.some((k) => k.startsWith('turret_basic|') && k.endsWith('|skin:turret_gold'))).toBe(true);
    expect(skinned.some((k) => k.startsWith('campfire|') && k.endsWith('|theme:theme_autumn'))).toBe(true);

    game.sys.liveops.unequipCosmetic('base_theme');
    game.sys.liveops.unequipCosmetic('turret_skin');
    for (let i = 0; i < 20; i++) buildings.update(1 / 60);
    expect(looks().every((k) => !k.includes('theme:') && !k.includes('skin:'))).toBe(true);
    buildings.dispose();
  });
});

describe('theme ambient particles', () => {
  it('every theme fx has a style; nothing is drawn without a theme, a capped prefix by quality with one', () => {
    for (const c of COSMETICS.filter((x) => x.kind === 'base_theme')) {
      expect(c.fx, c.id).toBeDefined();
      expect(FX_STYLES[c.fx!], c.id).toBeDefined();
    }
    const game = new Game({ seed: 3, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game, 'high');
    const fx = new ThemeFx(ctx);
    fx.update(1 / 60, 852 * 3);
    expect(fx.current).toBeNull();
    expect(fx.count).toBe(0);

    own(game, 'theme_blossom');
    fx.update(1 / 60, 852 * 3);
    expect(fx.current).toBe('petals');
    expect(fx.count).toBe(THEME_FX_COUNT.high);
    ctx.env.quality = 'low';
    fx.update(1 / 60, 852);
    expect(fx.count).toBe(THEME_FX_COUNT.low);
    expect(THEME_FX_COUNT.low).toBeLessThan(THEME_FX_COUNT.medium);
    expect(THEME_FX_COUNT.high).toBeLessThanOrEqual(400);

    own(game, 'theme_aurora');
    fx.update(1 / 60, 852);
    expect(fx.current).toBe('aurora');
    const ribbon = ctx.scene.children.find((o) => o instanceof THREE.Mesh && (o as THREE.Mesh).geometry instanceof THREE.PlaneGeometry);
    expect(ribbon?.visible).toBe(true);

    game.sys.liveops.unequipCosmetic('base_theme');
    fx.update(1 / 60, 852);
    expect(fx.current).toBeNull();
    expect(fx.count).toBe(0);
    expect(ribbon?.visible).toBe(false);
    fx.dispose();
  });
});

describe('theme particle colours', () => {
  it('per-theme colours only for real themes; themes sharing an fx kind do not look alike', () => {
    for (const [id, cols] of Object.entries(THEME_FX_COLORS)) {
      expect(data.cosmetic(id)?.kind, id).toBe('base_theme');
      for (const c of cols) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // three themes drift fireflies: warm gold, teal / violet, magenta / cyan
    const fly = COSMETICS.filter((c) => c.kind === 'base_theme' && c.fx === 'fireflies').map((c) => (THEME_FX_COLORS[c.id] ?? [FX_STYLES.fireflies.colA, FX_STYLES.fireflies.colB]).join());
    expect(fly.length).toBeGreaterThanOrEqual(3);
    expect(new Set(fly).size).toBe(fly.length);
  });

  it('switching between two themes with the same fx kind recolours the particles', () => {
    const game = new Game({ seed: 4, services: createMockServices() });
    game.start();
    const ctx = makeCtx(game, 'medium');
    const fx = new ThemeFx(ctx);
    own(game, 'theme_golden_hour');
    fx.update(1 / 60, 852);
    const mat = (fx as unknown as { mat: THREE.ShaderMaterial }).mat;
    const a = (mat.uniforms.uColA.value as THREE.Color).getHexString();
    own(game, 'theme_biolume');
    fx.update(1 / 60, 852);
    expect(fx.current).toBe('fireflies');
    expect((mat.uniforms.uColA.value as THREE.Color).getHexString()).not.toBe(a);
    expect('#' + (mat.uniforms.uColA.value as THREE.Color).getHexString()).toBe(new THREE.Color(THEME_FX_COLORS.theme_biolume[0]).getHexString().replace(/^/, '#'));
    fx.dispose();
  });
});

describe('faceted nature primitives', () => {
  it('gem: flat per-face normals, and a jittered gem stays watertight (shared corners move together)', () => {
    const b = new GeoBuilder(5);
    b.gem(1, 0, 0, 0, '#808080', 1, 0.25);
    const g = b.build();
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    expect(p.count).toBe(80 * 3);
    // flat: the three corners of every triangle share one normal
    for (let t = 0; t < p.count; t += 3) {
      for (let k = 1; k < 3; k++) {
        expect(Math.abs(n.getX(t) - n.getX(t + k)) + Math.abs(n.getY(t) - n.getY(t + k)) + Math.abs(n.getZ(t) - n.getZ(t + k))).toBeLessThan(1e-5);
      }
    }
    // watertight: corners that share a direction share a position, and the jitter really moved them
    const byDir = new Map<string, string>();
    const radii = new Set<string>();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i));
      const r = v.length();
      radii.add(r.toFixed(3));
      v.divideScalar(r);
      const key = `${Math.round(v.x * 256)},${Math.round(v.y * 256)},${Math.round(v.z * 256)}`;
      const pos = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      if (byDir.has(key)) expect(byDir.get(key), key).toBe(pos);
      else byDir.set(key, pos);
    }
    expect(byDir.size).toBe(42); // an icosphere of detail 1 has 42 corners
    expect(radii.size).toBeGreaterThan(10);
  });

  it('bead is an 8-triangle round dot; nature models stay cheaper than the first cozy pass', () => {
    const b = new GeoBuilder(1);
    b.bead(0.1, 0, 0, 0, '#ff0000');
    expect(b.build().attributes.position.count).toBe(8 * 3);
    const tris = (m: string) => nodeGeometry(m).attributes.position.count / 3;
    // a forest draws hundreds of these: keep the common looks lean
    expect(tris('tree_round')).toBeLessThanOrEqual(200);
    expect(tris('tree_pine')).toBeLessThanOrEqual(280);
    expect(tris('rock')).toBeLessThanOrEqual(180);
    expect(tris('bush')).toBeLessThanOrEqual(240);
  });
});
