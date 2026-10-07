import { describe, expect, it } from 'vitest';
import { addBuilding, cellWorld, makeGame } from './combat.helpers';
import { TUNE } from '../src/sim/combat/types';

function withTurret(armed = true) {
  const t = makeGame({ armed });
  addBuilding(t.game, 'scrap_turret', 131, 128);
  if (armed) {
    t.game.state.player.x = cellWorld(132);
    t.game.state.player.z = cellWorld(129);
  }
  return t;
}

describe('combat schedule & phases', () => {
  it('starts peaceful with no attack scheduled on a fresh colony', () => {
    const { game, step } = makeGame();
    const c = game.state.combat;
    expect(c.phase).toBe('peace');
    expect(c.nextAt).toBe(Infinity);
    expect(game.sys.combat.secondsToAttack()).toBe(Infinity);
    step(60);
    expect(c.phase).toBe('peace');
    expect(c.aliens).toHaveLength(0);
  });

  it('runs tutorial schedule: delay -> warning -> attack -> victory -> peace with regular interval', () => {
    const t = withTurret();
    const { game, step } = t;
    const c = game.state.combat;
    const warnings = t.record('combat:warning');
    const started = t.record('combat:started');
    const ended = t.record('combat:ended');
    const toasts = t.record('ui:toast');
    const sfx = t.record('sfx');
    const opens = t.record('ui:open');
    const shakes = t.record('fx:shake');
    const phases = t.record('combat:phase');

    game.sys.combat.schedule(20, 60);
    expect(c.tutorialAttackDone).toBe(true);
    expect(c.phase).toBe('peace');
    expect(game.sys.combat.secondsToAttack()).toBeCloseTo(80, 1);

    step(19.9);
    expect(c.phase).toBe('peace');
    step(0.2);
    expect(c.phase).toBe('warning');
    expect(warnings).toEqual([{ wave: 1, seconds: 60 }]);
    expect(toasts.some((x) => x.text === 'ALIEN ACTIVITY DETECTED — ATTACK IN 1:00')).toBe(true);
    expect(sfx.some((s) => s.id === 'alarm')).toBe(true);
    expect(game.sys.combat.secondsToAttack()).toBeGreaterThan(59);

    step(59.7);
    expect(c.phase).toBe('warning');
    step(0.4);
    expect(c.phase).toBe('attack');
    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({ wave: 1, aliens: 8 }); // tier-0 table: 5 + 3 crawlers
    expect(sfx.some((s) => s.id === 'attack_start')).toBe(true);
    expect(shakes.length).toBeGreaterThan(0);
    expect(game.sys.combat.secondsToAttack()).toBe(0);
    expect(game.sys.combat.remaining()).toBe(8);

    step(180, () => c.phase === 'victory');
    expect(c.phase).toBe('victory');
    const victoryAt = game.state.playTime;
    expect(ended).toHaveLength(1);
    expect(ended[0].wave).toBe(1);
    expect(ended[0].kills).toBe(8);
    expect(c.wave).toBe(1);
    expect(c.waveAtTier).toBe(1);
    expect(game.state.stats.wavesWon).toBe(1);
    expect(c.pendingReward).toEqual(ended[0].reward);
    expect(sfx.some((s) => s.id === 'victory')).toBe(true);
    expect(opens.some((o) => o.panel === 'victory')).toBe(true);

    // celebration, then peace with the regular tier interval (900s between attacks at tier 0)
    step(TUNE.VICTORY_LINGER + 0.1);
    expect(c.phase).toBe('peace');
    const interval = game.data.tier(0).invasionInterval;
    const warn = game.data.balance.warningSeconds;
    expect(c.nextAt).toBeCloseTo(victoryAt + TUNE.VICTORY_LINGER + interval - warn, 0);
    expect(game.sys.combat.secondsToAttack()).toBeCloseTo(interval, -1);
    expect(phases.map((p) => p.phase)).toEqual(['warning', 'attack', 'victory', 'peace']);

    // the next warning uses the regular 2:00 warning
    step(interval - warn + 1);
    expect(c.phase).toBe('warning');
    expect(warnings[1]).toEqual({ wave: 2, seconds: warn });
    expect(toasts.some((x) => x.text === 'ALIEN ACTIVITY DETECTED — ATTACK IN 2:00')).toBe(true);
  });

  it('claiming the chest during the celebration returns to peace immediately', () => {
    const t = withTurret();
    const { game, step } = t;
    game.sys.combat.schedule(0, 0);
    step(180, () => game.state.combat.phase === 'victory');
    expect(game.sys.combat.claimReward(false)).toBe(true);
    expect(game.state.combat.phase).toBe('peace');
    expect(game.state.combat.pendingReward).toBeNull();
  });

  it('startNow skips the warning and adds a 10% bonus', () => {
    const t = withTurret();
    const { game, step } = t;
    const c = game.state.combat;
    game.sys.combat.schedule(0, 120);
    step(0.1);
    expect(c.phase).toBe('warning');
    game.sys.combat.startNow();
    expect(c.phase).toBe('attack');
    expect(c.bonus).toBeCloseTo(0.1);
    step(180, () => c.phase === 'victory');
    // same kills as a normal wave, so the bonus shows up in the chest: base wood 120 * (1 + 8*0.015) * 1.1
    expect(c.pendingReward?.resources?.wood).toBe(Math.round(120 * 1.12 * 1.1));
  });

  it('resets waveAtTier when the colony tiers up', () => {
    const { game } = makeGame();
    game.state.combat.waveAtTier = 4;
    game.bus.emit('colony:tierUp', { tier: 1 });
    expect(game.state.combat.waveAtTier).toBe(0);
  });

  it('waves scale with waves survived at the tier', () => {
    const t = withTurret();
    const { game, step } = t;
    const started = t.record('combat:started');
    game.state.combat.waveAtTier = 4; // 1 + 0.25 * 4 = 2x
    game.state.combat.wave = 4;
    game.sys.combat.schedule(0, 0);
    step(0.1);
    expect(started[0].aliens).toBe(16);
  });

  it('never attacks while no attack is scheduled, and schedule() is ignored mid-attack', () => {
    const t = withTurret();
    const { game, step } = t;
    const c = game.state.combat;
    step(3000);
    expect(c.phase).toBe('peace');
    game.sys.combat.schedule(0, 0);
    step(0.1);
    expect(c.phase).toBe('attack');
    game.sys.combat.schedule(50, 50);
    expect(c.phase).toBe('attack');
  });
});
