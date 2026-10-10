/**
 * The Star Chart stays a readable size (QA9 soak): an engaged player charts about fifteen Frontier sites a day after
 * Titanium (27 in the bot's first three online hours there), so the log keeps the most recent CHART_KEEP sites and a
 * lifetime count carries the depth, the milestones, the signal board and the medals. Old saves with a long log trim on
 * load and keep their count.
 */
import { describe, expect, it } from 'vitest';
import { deserializeState, serializeState } from '../src/core/state';
import { migrateState } from '../src/platform/saveMigrate';
import { CHART_KEEP } from '../src/sim/expeditions';
import { metricValue } from '../src/sim/meta/achievementRules';
import { HOUR, MIN, crew, makeColony, reload } from './expeditions.helpers';

/** Chart `n` Frontier sites the way a player does: send a squad to the first signal, wait, collect. */
function chartSites(rig: ReturnType<typeof makeColony>, n: number): void {
  const g = rig.game;
  for (let i = 0; i < n; i++) {
    const site = g.sys.expeditions.frontierSites()[0];
    const who = crew(g).find((c) => !g.sys.expeditions.isAway(c.id))!;
    const e = g.sys.expeditions.launch(site.id, [who.id])!;
    expect(e, `launch ${i}`).toBeTruthy();
    rig.wait(HOUR + MIN, 1.5);
    expect(g.sys.expeditions.collect(e.id)).toBeTruthy();
  }
}

describe('Star Chart: bounded log, lifetime count', () => {
  it('keeps the latest sites, counts every one, and depth / milestones follow the count', () => {
    const rig = makeColony({ tier: 6 });
    const g = rig.game;
    const ex = g.sys.expeditions;
    const n = CHART_KEEP + 15;
    chartSites(rig, n);
    const fr = g.state.expeditions.frontier;
    expect(fr.charted).toHaveLength(CHART_KEEP);
    expect(ex.chartedCount()).toBe(n);
    expect(fr.charted[fr.charted.length - 1].depth).toBe(n);
    expect(fr.charted[0].depth).toBe(n - CHART_KEEP + 1);
    // every milestone up to the count is reached (the repeating legends past the authored ones too)
    const ms = ex.milestones();
    expect(ms.filter((m) => m.reached).every((m) => m.count <= n)).toBe(true);
    expect(ms.some((m) => !m.reached && m.count > n)).toBe(true);
    expect(ms.filter((m) => m.reached).length).toBeGreaterThan(5);
    // the next signal is deeper than anything charted
    expect(ex.frontierSites()[0].depth).toBe(n + 1);
    // the medal line counts the lifetime total
    expect(metricValue(g, 'charted')).toBe(n);
  }, 60_000);

  it('a save with a long log (from before the cap) trims on load and keeps its count', () => {
    const rig = makeColony({ tier: 6 });
    chartSites(rig, 3);
    const s = JSON.parse(serializeState(rig.game.state));
    const one = s.expeditions.frontier.charted[0];
    s.expeditions.frontier.charted = Array.from({ length: CHART_KEEP + 40 }, (_, i) => ({ ...one, id: `f${i}-0`, depth: i + 1 }));
    delete s.expeditions.frontier.total;
    const state = migrateState(deserializeState(JSON.stringify(s)));
    const back = reload({ ...rig, game: { ...rig.game, state } as never });
    const fr = back.game.state.expeditions.frontier;
    expect(back.game.sys.expeditions.chartedCount()).toBe(CHART_KEEP + 40);
    expect(fr.charted).toHaveLength(CHART_KEEP);
    expect(fr.charted[fr.charted.length - 1].depth).toBe(CHART_KEEP + 40);
  });
});
