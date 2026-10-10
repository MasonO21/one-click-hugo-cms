/**
 * Pacing bot (tests/pacing/*): an engaged-player bot plays a fresh colony through the real systems.
 *
 * - The smoke test (always on, a few seconds) keeps the bot in step with the sim API: it plays the guided start to
 *   the Reinforced Wood tier without a single decision error.
 * - The full playthrough to Titanium with mobile sessions (~20 minutes of CPU: four weeks of five sessions a day) only
 *   runs on demand, and checks the four-week schedule (data/pacing.ts) in sessions mode:
 *     PACING_BOT=1 npx vitest run tests/pacing.bot.test.ts
 *   Options: PACING_MODE=sessions|online, PACING_SESSION_MIN=20, PACING_PER_DAY=5, PACING_NOVA=save|spend,
 *   PACING_PACE=human|fast, PACING_SEED=20261012, PACING_HOURS=80. Or use `node scripts/pacing-bot.mjs --help`.
 */
import { describe, expect, it } from 'vitest';
import { runPlaythrough, type RunOptions, type RunResult } from './pacing/run';
import { fullReport } from './pacing/report';

describe('pacing bot: smoke', () => {
  it('plays the guided start to Reinforced Wood with no decision errors', () => {
    const r = runPlaythrough({ mode: 'online', maxOnlineHours: 0.2, seed: 20261012 });
    expect(r.final.tier).toBeGreaterThanOrEqual(1);
    expect(r.botLog.filter((l) => l.includes('decide error'))).toEqual([]);
    expect(r.raids.length).toBeGreaterThanOrEqual(1);
    // the guided chain is followed in order and nothing stalls for long
    const gaps = r.events.filter((e) => e.kind === 'mission').map((e) => e.t);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i] - gaps[i - 1]).toBeLessThan(5 * 60);
  }, 60_000);
});

describe.skipIf(!process.env.PACING_BOT)('pacing bot: full playthrough (PACING_BOT=1)', () => {
  it('reaches Titanium and prints the pacing report', () => {
    const env = process.env;
    const opts: Partial<RunOptions> = {
      mode: (env.PACING_MODE as RunOptions['mode']) ?? 'sessions',
      sessionMin: Number(env.PACING_SESSION_MIN ?? 20),
      sessionsPerDay: Number(env.PACING_PER_DAY ?? 5),
      nova: (env.PACING_NOVA as RunOptions['nova']) ?? 'save',
      pace: (env.PACING_PACE as RunOptions['pace']) ?? 'human',
      seed: Number(env.PACING_SEED ?? 20261012),
      maxOnlineHours: Number(env.PACING_HOURS ?? 80),
    };
    const r = runPlaythrough(opts);
    console.log(fullReport(r, 'Pacing playthrough'));
    expect(r.final.tier).toBe(6);
    if (opts.mode === 'sessions' && opts.sessionMin === 20 && opts.sessionsPerDay === 5) checkSchedule(r);
  }, 90 * 60_000);
});

/**
 * The four-week schedule for five 20-minute sessions a day (calendar day each tier lands; the target is ±15%, the
 * check allows ±30% so one seed's luck does not fail it), and Welcome Back at most ~40% of income from Stone on.
 */
function checkSchedule(r: RunResult): void {
  const TARGET_DAY: Record<number, number> = { 2: 1, 3: 3, 4: 6.5, 5: 13.5, 6: 28 };
  for (const [tier, day] of Object.entries(TARGET_DAY)) {
    const at = r.tierAt.find((x) => x.tier === Number(tier));
    expect(at, `tier ${tier} reached`).toBeTruthy();
    const d = at!.h / 24;
    expect(d, `tier ${tier}: day ${d.toFixed(2)} vs ${day}`).toBeGreaterThanOrEqual(day * 0.7);
    expect(d, `tier ${tier}: day ${d.toFixed(2)} vs ${day}`).toBeLessThanOrEqual(day * 1.3);
  }
  let offline = 0;
  let total = 0;
  for (const [tier, row] of Object.entries(r.income)) {
    if (Number(tier) < 2 || Number(tier) > 5) continue;
    for (const [k, v] of Object.entries(row)) {
      total += v;
      if (k === 'offline') offline += v;
    }
  }
  expect(offline / total, 'Welcome Back share of income from Stone on').toBeLessThanOrEqual(0.42);
}
