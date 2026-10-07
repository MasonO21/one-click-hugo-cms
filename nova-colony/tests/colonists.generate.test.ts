import { describe, expect, it } from 'vitest';
import type { Rarity } from '../src/data/schema';
import { addColonist, makeGame } from './colonists.util';

describe('colonist generation', () => {
  it('skill follows rarity (common 1, rare 2, epic 3, legendary 4-5)', () => {
    const { game } = makeGame();
    const cs = game.sys.colonists;
    for (let i = 0; i < 20; i++) {
      expect(cs.generate('common').skill).toBe(1);
      expect(cs.generate('rare').skill).toBe(2);
      expect(cs.generate('epic').skill).toBe(3);
    }
    const legendary = new Set<number>();
    for (let i = 0; i < 80; i++) legendary.add(cs.generate('legendary').skill);
    expect([...legendary].sort()).toEqual([4, 5]);
  });

  it('fills every field within its documented range', () => {
    const { game, clock } = makeGame();
    const cs = game.sys.colonists;
    const traitIds = new Set(game.data.traits.map((t) => t.id));
    const profIds = new Set(game.data.professions.map((p) => p.id));
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as Rarity[]) {
      for (let i = 0; i < 25; i++) {
        const c = cs.generate(rarity);
        expect(c.rarity).toBe(rarity);
        expect(c.appearance.skin).toBeGreaterThanOrEqual(0);
        expect(c.appearance.skin).toBeLessThanOrEqual(5);
        for (const k of ['hair', 'hairColor', 'outfit'] as const) {
          expect(Number.isInteger(c.appearance[k])).toBe(true);
          expect(c.appearance[k]).toBeGreaterThanOrEqual(0);
          expect(c.appearance[k]).toBeLessThanOrEqual(7);
        }
        expect(c.appearance.height).toBeGreaterThanOrEqual(0.9);
        expect(c.appearance.height).toBeLessThanOrEqual(1.1);
        expect(traitIds.has(c.trait)).toBe(true);
        expect(profIds.has(c.specialty)).toBe(true);
        expect(c.happiness).toBe(60);
        expect(c.activity).toBe('idle');
        expect(c.joinedAt).toBe(clock.now);
        expect(c.workplace).toBeNull();
        expect(c.bed).toBeNull();
        expect(c.bio).not.toContain('{name}');
        expect(c.bio).toContain(c.name.split(' ')[0]);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = makeGame({ seed: 99 }).game.sys.colonists.generate('rare');
    const b = makeGame({ seed: 99 }).game.sys.colonists.generate('rare');
    expect(a).toEqual(b);
  });

  it('favours gatherers early on', () => {
    const { game } = makeGame();
    let gatherers = 0;
    for (let i = 0; i < 400; i++) if (game.sys.colonists.generate('common').specialty === 'gatherer') gatherers++;
    expect(gatherers).toBeGreaterThan(400 * 0.28);
  });

  it('keeps names unique across the colony and the board, even past the name pool', () => {
    const { game } = makeGame();
    // A tiny pool keeps this fast with the full 160x130 name content.
    game.data.names = { first: ['Ava', 'Kai', 'Mara', 'Theo'], last: ['Reyes', 'Okafor', 'Tanaka'], bios: game.data.names.bios };
    const total = game.data.names.first.length * game.data.names.last.length + 30;
    for (let i = 0; i < total; i++) game.sys.colonists.grant('common');
    const names = [...game.sys.colonists.all().map((c) => c.name), ...game.state.colonists.candidates.map((k) => k.colonist.name)];
    expect(new Set(names).size).toBe(names.length);
    expect(game.sys.colonists.all()).toHaveLength(total);
  });

  it('add() places near the core, assigns an id, emits the recruited event, toast and sfx', () => {
    const { game } = makeGame();
    const seen: string[] = [];
    game.bus.on('colonist:recruited', (e) => seen.push(`recruited:${e.id}:${e.rarity}`));
    game.bus.on('ui:toast', (e) => seen.push(`toast:${e.text}`));
    game.bus.on('sfx', (e) => seen.push(`sfx:${e.id}`));
    const c = addColonist(game, 'epic');
    expect(c.id).toBeGreaterThan(0);
    expect(Math.hypot(c.x, c.z)).toBeLessThan(12);
    expect(seen).toContain(`recruited:${c.id}:epic`);
    expect(seen).toContain('sfx:recruit');
    expect(seen.some((s) => s.startsWith('toast:') && s.includes(c.name))).toBe(true);
    // explicit position is honoured
    const d = addColonist(game, 'common', {}, 40, -30);
    expect([d.x, d.z]).toEqual([40, -30]);
    expect(game.sys.colonists.get(d.id)).toBe(d);
  });

  it('grant() never needs a bed', () => {
    const { game } = makeGame();
    const id = game.sys.colonists.grant('legendary');
    const c = game.sys.colonists.get(id)!;
    expect(c.bed).toBeNull();
    expect(c.skill).toBeGreaterThanOrEqual(4);
    game.grant({ colonist: 'rare' }, 'test'); // via the central reward path
    expect(game.sys.colonists.all()).toHaveLength(2);
  });
});
