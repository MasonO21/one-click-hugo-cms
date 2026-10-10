/**
 * Craft missions whose recipe consumes crafted items (the Hover Bike needs a Robotic Core, which needs Machine Parts):
 * the guide and the hint must lead the player through that chain. Found by the pacing bot (tests/pacing): without it
 * the main chain sat on "Hover Time" for the whole Nano tier.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { MISSIONS } from '../src/data/missions';
import { RECIPES } from '../src/data/recipes';
import { ITEMS } from '../src/data/items';

/** A colony at `tier` with every research of tiers <= tier done except `skip`. */
function colonyAt(tier: number, skip: string[]): Game {
  let now = 1_700_000_000_000;
  const game = new Game({ seed: 5, services: createMockServices(), clock: () => (now += 16) });
  game.start();
  const rich = () => {
    // plenty for any paced tier-up or research (data/pacing.ts: Titanium asks over a million alloy)
    for (const r of game.data.resources) game.state.resources.amounts[r.id] = 1e8;
    game.state.research.points = 1e9;
  };
  const researchAll = () => {
    let any = true;
    while (any) {
      any = false;
      for (const d of game.data.research) {
        if (skip.includes(d.id) || d.tier > game.state.colony.tier || game.sys.research.status(d.id) !== 'available') continue;
        rich();
        if (game.sys.research.research(d.id)) any = true;
      }
    }
  };
  for (let t = 0; t < tier; t++) {
    researchAll();
    rich();
    expect(game.sys.progression.tierUp()).toBe(true);
  }
  researchAll();
  return game;
}

function makeCurrent(game: Game, id: string): void {
  const m = game.state.missions;
  m.active = [id];
  m.progress = { [id]: 0 };
  game.update(0.1);
  expect(game.sys.missions.current()?.id).toBe(id);
}

describe('guide: craft missions that need crafted parts', () => {
  it('points the Research panel at the research behind a missing Robotic Core (Hover Bike)', () => {
    const chain = ['field_robotics', 'mass_production', 'assembly_lines'];
    const game = colonyAt(4, chain);
    expect(game.sys.research.isDone('hover_tech')).toBe(true);
    makeCurrent(game, 'm51_hangar');
    const focus = game.sys.tutorial.researchFocus();
    expect(focus).not.toBeNull();
    expect(chain).toContain(focus);
  });

  it('points at Titanium Manufacturing for the Hovercraft\'s Titanium Plating', () => {
    const game = colonyAt(6, ['titan_manufacturing']);
    expect(game.sys.research.isDone('titan_hover')).toBe(true);
    makeCurrent(game, 'm66_hovercraft');
    expect(game.sys.tutorial.researchFocus()).toBe('titan_manufacturing');
  });

  it('every craft / equip mission hint names the crafted parts its recipe consumes', () => {
    for (const m of MISSIONS) {
      if (m.type !== 'craft' && m.type !== 'equip') continue;
      const r = m.type === 'craft' ? RECIPES.find((x) => x.id === m.target) : RECIPES.find((x) => x.outputs.items?.[m.target]);
      for (const item of Object.keys(r?.itemInputs ?? {})) {
        const name = ITEMS.find((i) => i.id === item)!.name;
        expect(m.hint ?? '', `${m.id} hint should mention ${name}`).toContain(name);
      }
    }
  });
});
