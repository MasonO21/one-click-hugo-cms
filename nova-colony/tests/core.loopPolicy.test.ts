/** Loop policy: 60 fps in play; 30 in Battery saver, behind menus and in a calm colony nobody has touched for a while. */
import { describe, expect, it } from 'vitest';
import { FULL_FPS, IDLE_AFTER_S, IDLE_FPS, LoopPolicy, loopFps } from '../src/core/loopPolicy';
import { FramePacer } from '../src/core/framePacer';
import type { Game } from '../src/core/Game';

function fakeGame() {
  return {
    state: { player: { x: 0, z: 0 }, settings: { batterySaver: false }, combat: { phase: 'peace' } },
    input: { moveX: 0, moveY: 0, interact: false, interactHeld: false },
    view: { mode: 'play', panelOpen: false },
  };
}

describe('loopFps', () => {
  it('60 in play, 30 in Battery saver or behind a covering panel', () => {
    expect(loopFps({ batterySaver: false, covered: false, idleS: 0, calm: true })).toBe(FULL_FPS);
    expect(loopFps({ batterySaver: true, covered: false, idleS: 0, calm: true })).toBe(IDLE_FPS);
    expect(loopFps({ batterySaver: false, covered: true, idleS: 0, calm: false })).toBe(IDLE_FPS);
  });
  it('a calm colony drops to 30 only after the idle delay; a raid or build mode never does', () => {
    expect(loopFps({ batterySaver: false, covered: false, idleS: IDLE_AFTER_S - 0.1, calm: true })).toBe(60);
    expect(loopFps({ batterySaver: false, covered: false, idleS: IDLE_AFTER_S, calm: true })).toBe(30);
    expect(loopFps({ batterySaver: false, covered: false, idleS: 600, calm: false })).toBe(60);
  });
});

describe('LoopPolicy', () => {
  const ms = (s: number) => s * 1000;

  it('boot counts as activity: full rate for the first seconds, then the idle cap', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    expect(p.fps(ms(1))).toBe(60);
    expect(p.fps(ms(IDLE_AFTER_S + 0.5))).toBe(30);
  });

  it('any input brings 60 back on the next frame', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    expect(p.fps(ms(20))).toBe(30);
    p.input(ms(20.01));
    expect(p.fps(ms(20.02))).toBe(60);
  });

  it('a finger resting on the joystick (no events) keeps 60; releasing it starts the idle clock', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    p.pointerDown(ms(1));
    expect(p.fps(ms(40))).toBe(60);
    p.pointerUp(ms(41));
    expect(p.fps(ms(41 + IDLE_AFTER_S - 1))).toBe(60);
    expect(p.fps(ms(41 + IDLE_AFTER_S + 1))).toBe(30);
  });

  it('a lost pointer-up does not pin 60 forever: blur / hide releases it', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    p.pointerDown(ms(1));
    p.release(ms(2));
    expect(p.fps(ms(2 + IDLE_AFTER_S + 1))).toBe(30);
  });

  it('the player moving (joystick, keys, auto-walk) or a raid keeps 60', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    expect(p.fps(ms(30))).toBe(30);
    g.state.player.x = 1;
    expect(p.fps(ms(30.02))).toBe(60);
    expect(p.fps(ms(30.04))).toBe(60); // stopped, but it just moved
    g.input.moveX = 0.5;
    expect(p.fps(ms(80))).toBe(60);
    g.input.moveX = 0;
    g.state.combat.phase = 'attack';
    expect(p.fps(ms(200))).toBe(60);
    g.state.combat.phase = 'peace';
    g.view.mode = 'build';
    expect(p.fps(ms(300))).toBe(60);
  });

  it('menus and Battery saver are 30 at once, whatever the input', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    g.view.panelOpen = true;
    p.input(ms(1));
    expect(p.fps(ms(1))).toBe(30);
    g.view.panelOpen = false;
    g.state.settings.batterySaver = true;
    expect(p.fps(ms(1))).toBe(30);
  });

  it('with the pacer: an idle colony on a 120 Hz screen runs 30 frames a second, 60 again after a touch', () => {
    const g = fakeGame();
    const p = new LoopPolicy(g as unknown as Game, 0);
    const pacer = new FramePacer();
    let frames = 0;
    const t0 = ms(IDLE_AFTER_S + 1);
    for (let i = 0; i < 240; i++) if (pacer.due(t0 + (i * 1000) / 120, p.fps(t0 + (i * 1000) / 120))) frames++;
    expect(frames).toBeGreaterThanOrEqual(59);
    expect(frames).toBeLessThanOrEqual(61);
    const t1 = t0 + 2000;
    p.input(t1);
    frames = 0;
    for (let i = 0; i < 240; i++) if (pacer.due(t1 + (i * 1000) / 120, p.fps(t1 + (i * 1000) / 120))) frames++;
    expect(frames).toBeGreaterThanOrEqual(118);
  });
});
