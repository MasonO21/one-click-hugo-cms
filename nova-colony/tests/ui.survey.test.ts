/**
 * Region survey presentation (src/ui/logic/survey.ts): what is left in a region, the next milestone's preview, the
 * Map badge, the gentle "Survey" suggestion (only between things to do) and its guide arrow, the claim card text.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { computeBadges } from '../src/ui/logic/badges';
import { surveyLeftLine, milestoneLabel, milestonePreview, pinSurvey, surveyBadge, surveyClaimText, surveyGuideTarget, surveyLeft, surveyOffer, surveyPin, surveyToast, surveyWatch } from '../src/ui/logic/survey';
import type { SurveyProgress } from '../src/sim/survey';

function rig() {
  let now = 1_700_000_000_000;
  const game = new Game({ seed: 1234, services: createMockServices(), clock: () => now });
  game.start();
  return {
    game,
    step(seconds: number, dt = 0.25) {
      for (let i = 0; i < Math.round(seconds / dt); i++) {
        now += dt * 1000;
        game.update(dt);
      }
    },
  };
}

function chart(game: Game, region: string) {
  const w = game.sys.world;
  for (let fz = 0; fz < 64; fz++) for (let fx = 0; fx < 64; fx++) {
    const x = (fx + 0.5) * 8 - 256;
    const z = (fz + 0.5) * 8 - 256;
    if (w.regionAt(x, z) === region) w.fog.reveal(x, z, 1);
  }
  game.state.world.fog = w.fog.encode();
}

const prog = (o: Partial<SurveyProgress>): SurveyProgress => ({
  region: 'crash_valley',
  unlocked: true,
  charted: 0.4,
  pois: { done: 5, total: 8 },
  specimens: { done: 3, total: 5, missing: ['boulder_big', 'bush_berry'] },
  pct: 42,
  reached: 1,
  claimed: 1,
  ...o,
});

describe('ui.survey — what is left', () => {
  it('reads like the brief: "3 points of interest unexplored · 40% charted"', () => {
    expect(surveyLeft(prog({}))).toEqual(['3 points of interest unexplored', '40% charted', '2 field-guide entries to find']);
    expect(surveyLeft(prog({ pois: { done: 7, total: 8 }, charted: 1, specimens: { done: 4, total: 5, missing: ['x'] } }))).toEqual(['1 point of interest unexplored', '1 field-guide entry to find']);
    expect(surveyLeft(prog({ pois: { done: 8, total: 8 }, charted: 1, specimens: { done: 5, total: 5, missing: [] } }))).toEqual([]);
    expect(surveyLeft(prog({}), { charted: false })).toEqual(['3 points of interest unexplored', '2 field-guide entries to find']);
    expect(surveyLeftLine(prog({}))).toBe('Still out there: 3 unexplored sites, 2 field-guide entries and uncharted land.');
    expect(surveyLeftLine(prog({ pois: { done: 8, total: 8 }, specimens: { done: 5, total: 5, missing: [] } }))).toBe('Still out there: uncharted land.');
    expect(surveyLeftLine(prog({ pois: { done: 8, total: 8 }, charted: 1, specimens: { done: 5, total: 5, missing: [] } }))).toBeNull();
  });

  it('labels milestones and previews what each brings', () => {
    const { game } = rig();
    expect(milestoneLabel(0)).toBe('25% Scouted');
    expect(milestoneLabel(3)).toBe('100% Mastered');
    expect(milestonePreview(game, 'pinewood_forest', 0).map((l) => l.text)).toEqual(['A cache of Pinewood Forest goods', '+3 Nova']);
    expect(milestonePreview(game, 'pinewood_forest', 1)[0].text).toBe('A rare survivor joins');
    expect(milestonePreview(game, 'pinewood_forest', 2)[0].text).toBe('Campfire Lounge');
    expect(milestonePreview(game, 'frozen_ridge', 3)[0].text).toBe('Ridge Relay: +1 expedition squad, for good');
    game.state.liveops.cosmetics.owned.push('deco_campfire_lounge');
    expect(milestonePreview(game, 'pinewood_forest', 2).map((l) => l.text)).toEqual(['Campfire Lounge (owned: Nova instead)', '+40 Nova']);
  });

  it('the claim card says what the survey found', () => {
    const c = { region: 'pinewood_forest', step: 1, pct: 50, title: 'Surveyed', reward: { colonist: 'rare' as const }, colonist: { id: 9, name: 'Ada Reyes' } };
    expect(surveyClaimText(c, 'Pinewood Forest', null)).toBe('A trapper who knows every trail through the pines. Ada Reyes is joining the colony.');
    expect(surveyClaimText({ ...c, step: 2, ownedCosmetic: 'deco_campfire_lounge' }, 'Pinewood Forest', 'Campfire Lounge')).toMatch(/already have the Campfire Lounge/);
    expect(surveyClaimText({ ...c, step: 3 }, 'Pinewood Forest', null)).toMatch(/on record/);
  });
});

describe('ui.survey — badge and suggestion', () => {
  it('badges the Map with rewards waiting, quietly during the guided first session', () => {
    const { game } = rig();
    chart(game, 'crash_valley');
    game.bus.emit('tick:second', { playTime: 1 });
    expect(game.sys.survey.claimable()).toBeGreaterThan(0);
    expect(surveyBadge(game)).toBe(0);
    game.state.tutorial.done = true;
    expect(surveyBadge(game)).toBe(game.sys.survey.claimable());
    expect(computeBadges(game).map).toBe(surveyBadge(game));
  });

  it('suggests a survey only between things to do (no claims, no raid, the main mission waiting)', () => {
    const { game } = rig();
    expect(surveyOffer(game)).toBeNull(); // guided first session
    game.state.tutorial.done = true;
    const m = game.sys.missions.current()!;
    const p = game.sys.missions.progress(m.id);
    if (m.type !== 'tier' && !p.done) {
      surveyWatch.mission = '';
      expect(surveyOffer(game)).toBeNull(); // progress just seen
      surveyWatch.since = game.state.playTime - 120; // nothing moved for two minutes
    }
    const t = surveyOffer(game);
    if (!p.done) {
      expect(t).not.toBeNull();
      expect(game.sys.world.isUnlocked(t!.region)).toBe(true);
    }
    game.state.combat.phase = 'warning';
    expect(surveyOffer(game)).toBeNull();
  });

  it('pins the guide arrow until the target is reached, explored or the pin runs out', () => {
    const { game } = rig();
    const pl = game.state.player;
    const t = game.sys.survey.suggest(pl.x, pl.z, 400)!;
    expect(t).not.toBeNull();
    expect(surveyToast(t)).toMatch(/ · \d+ m$/);
    pinSurvey(t, 100);
    expect(surveyGuideTarget(game, 101)).toEqual({ text: t.label, world: { x: t.x, z: t.z }, ui: null });
    expect(surveyGuideTarget(game, 100 + 10_000)).toBeNull();
    expect(surveyPin.target).toBeNull();
    pinSurvey(t, 100);
    game.sys.player.teleport(t.x + 1, t.z + 1);
    expect(surveyGuideTarget(game, 101)).toBeNull();
  });
});
