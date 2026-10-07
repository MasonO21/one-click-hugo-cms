import { describe, expect, it, vi } from 'vitest';
import { C, REPAIR_BAY, count, last, makeGame, step } from './construction.helpers';

describe('construction: damage & auto-repair', () => {
  it('damage → damaged (never destroyed) → free auto-repair after the attack', () => {
    const { game, b, events } = makeGame();
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, free: true, instant: true })!;
    const w = b.get(wall)!;
    game.state.combat.phase = 'attack';

    b.damage(wall, 60);
    expect(w.hp).toBe(100);
    expect(last(events, 'building:damaged')).toEqual({ id: wall, def: 'wall', amount: 60 });
    expect(w.status).toBe('active');

    b.damage(wall, 500);
    expect(w.hp).toBe(0);
    expect(w.status).toBe('damaged');
    expect(last(events, 'building:damaged').amount).toBe(100);
    expect(last(events, 'building:broken')).toEqual({ id: wall, def: 'wall' });
    const boom = events.find((e) => e.type === 'sfx' && e.payload.id === 'explosion')!;
    expect(boom.payload.volume).toBeLessThan(1);
    expect(b.get(wall)).toBe(w); // still exists
    // breached: aliens walk through, friendlies still see a (broken) wall
    expect(b.blocked(C + 3, C, 'alien')).toBe(false);
    expect(b.blocked(C + 3, C, 'player')).toBe(true);
    // further hits do nothing
    b.damage(wall, 10);
    expect(count(events, 'building:damaged')).toBe(2);

    // no repairs while the attack lasts
    step(game, 5);
    expect(w.hp).toBe(0);

    // after the attack: wait repairDelay (3s), then 8%/s of max HP
    game.state.combat.phase = 'victory';
    step(game, 2.9);
    expect(w.hp).toBe(0);
    step(game, 1.1);
    expect(w.hp).toBeGreaterThan(0);
    expect(w.hp).toBeLessThan(w.maxHp);
    expect(w.status).toBe('damaged');
    step(game, 13);
    expect(w.hp).toBe(w.maxHp);
    expect(w.status).toBe('active');
    expect(last(events, 'building:repaired')).toEqual({ id: wall, def: 'wall' });
    expect(b.blocked(C + 3, C, 'alien')).toBe(true);
  });

  it('restarts the repair delay on every hit', () => {
    const { game, b } = makeGame();
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, free: true, instant: true })!;
    b.damage(wall, 80);
    step(game, 2);
    b.damage(wall, 1);
    step(game, 2);
    expect(b.get(wall)!.hp).toBe(79);
    step(game, 1.1);
    expect(b.get(wall)!.hp).toBeGreaterThan(79);
  });

  it('scales repair speed with the repairSpeed modifier', () => {
    const { game, b } = makeGame();
    const wall = b.place('wall', C + 3, C, 0, { tier: 0, free: true, instant: true })!;
    b.damage(wall, 160);
    game.sys.economy.modifier = (s) => (s === 'repairSpeed' ? 2 : 1);
    step(game, 3); // delay
    step(game, 1); // 2 × 8% × 160 = 25.6
    expect(b.get(wall)!.hp).toBeGreaterThan(20);
    expect(b.get(wall)!.hp).toBeLessThan(30);
  });

  it('repair buildings heal neighbours within 6 cells even during attacks', () => {
    const { game, b } = makeGame({ extraBuildings: [REPAIR_BAY] });
    game.state.combat.phase = 'attack';
    const bay = b.place(REPAIR_BAY.id, C + 3, C + 3, 0, { free: true, instant: true })!;
    const near = b.place('wall', C + 7, C + 3, 0, { tier: 0, free: true, instant: true })!; // 4 cells away
    const far = b.place('wall', C - 8, C + 3, 0, { tier: 0, free: true, instant: true })!;
    b.damage(near, 100);
    b.damage(far, 100);
    step(game, 2);
    expect(b.get(near)!.hp).toBeCloseTo(60 + 20, 5);
    expect(b.get(far)!.hp).toBe(60);
    // a broken bay doesn't repair
    b.damage(bay, 1000);
    step(game, 1);
    expect(b.get(near)!.hp).toBeCloseTo(80, 5);
    expect(b.get(bay)!.status).toBe('damaged');
  });

  it('restores the previous state after repair (construction site / switched off)', () => {
    const { game, b } = makeGame();
    const site = b.place('shelter', C + 3, C, 0, { free: true })!;
    const fire = b.place('campfire', C - 4, C, 0, { free: true, instant: true })!;
    b.toggle(fire);
    expect(b.get(fire)!.status).toBe('off');
    b.damage(site, 9999);
    b.damage(fire, 9999);
    expect(b.get(site)!.status).toBe('damaged');
    const progress = b.get(site)!.progress;
    step(game, 20);
    expect(b.get(site)!.status === 'building' || b.get(site)!.status === 'active').toBe(true);
    expect(b.get(site)!.hp).toBe(b.get(site)!.maxHp);
    expect(b.get(fire)!.status).toBe('off');
    // construction was paused while broken, then resumed
    expect(b.get(site)!.progress).toBeGreaterThan(progress);
  });

  it('the core at 0 HP is only damaged', () => {
    const { b, events } = makeGame();
    const core = b.core()!;
    b.damage(core.id, 1e9);
    expect(core.status).toBe('damaged');
    expect(b.core()).toBe(core);
    expect(last(events, 'building:broken')).toEqual({ id: core.id, def: 'command_center' });
  });

  it('refreshes the economy after a building breaks or is repaired', () => {
    const { game, b } = makeGame();
    const fire = b.place('campfire', C + 3, C, 0, { free: true, instant: true })!;
    const spy = vi.spyOn(game.sys.economy, 'recompute');
    b.damage(fire, 1e9);
    game.update(0.1);
    expect(spy).toHaveBeenCalledTimes(1);
    step(game, 20);
    expect(b.get(fire)!.status).toBe('active');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
