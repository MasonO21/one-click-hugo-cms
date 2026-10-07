import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { installAnalyticsHooks } from '../src/platform/analyticsHooks';

function setup(settings: Partial<Game['state']['settings']> = {}) {
  const services = createMockServices();
  const consent: boolean[] = [];
  services.analytics.setConsent = (v: boolean) => consent.push(v);
  let now = Date.UTC(2026, 9, 7, 10);
  const game = new Game({ seed: 3, services, clock: () => now });
  game.start();
  Object.assign(game.state.settings, settings);
  const off = installAnalyticsHooks(game);
  const tick = (s: number) => {
    for (let i = 0; i < s * 10; i++) {
      now += 100;
      game.update(0.1);
    }
  };
  return { game, consent, tick, off };
}

describe('analytics consent (opt-in)', () => {
  it('a new colony collects nothing until the player says yes', () => {
    const { game, consent, tick } = setup();
    expect(game.state.settings.analytics).toBe(false);
    expect(game.state.settings.analyticsAsked).toBe(false);
    expect(consent).toEqual([false]);
    tick(3);
    expect(consent.at(-1)).toBe(false);
    // the player taps "Sure!" on the first-launch card
    game.state.settings.analytics = true;
    game.state.settings.analyticsAsked = true;
    tick(2);
    expect(consent.at(-1)).toBe(true);
  });

  it('older saves that defaulted to analytics=true without asking stay off until answered', () => {
    const { consent, tick, game } = setup({ analytics: true, analyticsAsked: undefined as unknown as boolean });
    tick(3);
    expect(consent.every((v) => v === false)).toBe(true);
    game.state.settings.analyticsAsked = true;
    tick(2);
    expect(consent.at(-1)).toBe(true);
  });

  it('declining keeps collection off', () => {
    const { consent, tick, game } = setup();
    game.state.settings.analytics = false;
    game.state.settings.analyticsAsked = true;
    tick(3);
    expect(consent.every((v) => v === false)).toBe(true);
  });
});
