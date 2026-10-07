import { describe, expect, it } from 'vitest';
import { makeGame, record, stepEconomy } from './economy.helpers';

describe('research', () => {
  it('reports status: locked by tier, locked by prerequisite, available, done', () => {
    const { game } = makeGame();
    const r = game.sys.research;
    expect(r.status('t_res_late')).toBe('locked_tier');
    expect(r.status('t_res_ore')).toBe('locked_prereq');
    expect(r.status('t_res_prod')).toBe('available');
    game.state.research.completed.push('t_res_prod');
    expect(r.status('t_res_prod')).toBe('done');
    expect(r.status('t_res_ore')).toBe('available');
    expect(r.status('nope')).toBe('locked_tier');

    const ids = r.available().map((d) => d.id);
    expect(ids).toContain('t_res_ore');
    expect(ids).not.toContain('t_res_prod');
    expect(ids).not.toContain('t_res_late');
  });

  it('needs enough RP and resources', () => {
    const { game } = makeGame();
    const r = game.sys.research;
    expect(r.canResearch('t_res_prod')).toBe(false);
    game.state.research.points = 10;
    expect(r.canResearch('t_res_prod')).toBe(true);
    expect(r.canResearch('t_res_ore')).toBe(false); // prerequisite missing

    // t_res_storage costs 5 RP + 10 wood
    expect(r.canResearch('t_res_storage')).toBe(false);
    expect(r.research('t_res_storage')).toBe(false);
    expect(game.state.research.points).toBe(10);
    const req = r.requirements('t_res_storage')!;
    expect(req.missing).toEqual({ wood: 10 });
    expect(req.ready).toBe(false);
  });

  it('research() spends RP + resources, completes instantly and celebrates', () => {
    const { game } = makeGame();
    const r = game.sys.research;
    const completed = record(game, 'research:completed');
    const celebrate = record(game, 'ui:celebrate');
    const sfx = record(game, 'sfx');
    game.state.research.points = 12;
    game.sys.economy.add('wood', 15, 'gather');

    expect(r.research('t_res_storage')).toBe(true);
    expect(game.state.research.points).toBe(7);
    expect(game.sys.economy.amount('wood')).toBe(5);
    expect(r.isDone('t_res_storage')).toBe(true);
    expect(completed).toEqual([{ id: 't_res_storage' }]);
    expect(celebrate[0].title).toBe('Research Complete!');
    expect(sfx.some((s) => s.id === 'research_done')).toBe(true);

    // cannot research twice
    expect(r.research('t_res_storage')).toBe(false);
  });

  it('mentions the colony tier a tier research opens up', () => {
    const { game } = makeGame();
    const celebrate = record(game, 'ui:celebrate');
    game.state.research.points = 1000;
    expect(game.sys.research.research('tier_reinforced')).toBe(true);
    expect(celebrate[0].text).toContain('Reinforced Wood colony tier');
  });

  it('nudges once when research becomes affordable', () => {
    const t = makeGame();
    const toasts = record(t.game, 'ui:toast');
    t.game.sys.research.addPoints(5);
    stepEconomy(t, 2);
    const ready = toasts.filter((x) => x.text.includes('research'));
    expect(ready).toHaveLength(1);
    stepEconomy(t, 3);
    expect(toasts.filter((x) => x.text.includes('research'))).toHaveLength(1);
  });

  it('addPoints ignores invalid amounts and never goes negative', () => {
    const { game } = makeGame();
    const r = game.sys.research;
    const events = record(game, 'research:points');
    r.addPoints(NaN);
    r.addPoints(0);
    r.addPoints(5);
    r.addPoints(-50);
    expect(game.state.research.points).toBe(0);
    expect(events).toEqual([{ amount: 5 }]);
  });
});
