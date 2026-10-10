/**
 * Long-run soak checks on top of a pacing playthrough (scripts/pacing-bot.mjs --soak): the serialized save size at
 * each tier and every few online hours, lists and records that keep growing, numbers that turn NaN / Infinity,
 * simulation step cost over the weeks, and the notification plan left behind at every app close. Not a test.
 */
import type { Game } from '../../src/core/Game';
import { serializeState } from '../../src/core/state';
import { notifySnapshot, planNotifications, MIN_LEAD_MS, MAX_SCHEDULED, QUIET_FROM_HOUR, QUIET_UNTIL_HOUR } from '../../src/platform/notifyPlan';
import { scanState } from './qa';
import type { RunOptions, RunResult } from './run';

export interface SoakScan {
  /** Online hours, calendar hours, tier. */
  t: number;
  h: number;
  tier: number;
  label: string;
  bytes: number;
  sizes: Record<string, number>;
}

export interface SoakNotify {
  h: number;
  gapH: number;
  tier: number;
  plan: { kind: string; kinds: string[]; inH: number }[];
  problems: string[];
}

export interface SoakData {
  scans: SoakScan[];
  nonFinite: { t: number; tier: number; paths: string[] }[];
  notify: SoakNotify[];
}

/** Hooks for runPlaythrough that collect soak data; `every` = online hours between scans. */
export function soakHooks(every = 2): { data: SoakData; hooks: Pick<RunOptions, 'onTier' | 'onSample' | 'onClose' | 'inspect'> } {
  const data: SoakData = { scans: [], nonFinite: [], notify: [] };
  const install = Date.UTC(2026, 9, 12, 7, 30, 0);
  let nextScan = 0;
  const seen = new Set<string>();
  const scan = (game: Game, label: string) => {
    const json = serializeState(game.state);
    const s = scanState(game.state);
    data.scans.push({ t: game.state.playTime / 3600, h: (game.now() - install) / 3_600_000, tier: game.state.colony.tier, label, bytes: json.length + 14, sizes: s.sizes });
  };
  return {
    data,
    hooks: {
      onTier: (tier, game) => scan(game, `tier ${tier}`),
      onSample: (game) => {
        const s = scanState(game.state);
        if (s.nonFinite.length) {
          const fresh = s.nonFinite.filter((p) => !seen.has(p));
          for (const p of fresh) seen.add(p);
          if (fresh.length) data.nonFinite.push({ t: game.state.playTime / 3600, tier: game.state.colony.tier, paths: fresh });
        }
        if (game.state.playTime / 3600 >= nextScan) {
          nextScan += every;
          scan(game, 'hourly');
        }
      },
      onClose: (game, _save, gap) => {
        const now = game.now();
        const problems: string[] = [];
        let plan: ReturnType<typeof planNotifications> = [];
        try {
          plan = planNotifications(notifySnapshot(game));
        } catch (e) {
          problems.push(`planner threw: ${(e as Error).message}`);
        }
        if (plan.length > MAX_SCHEDULED) problems.push(`${plan.length} notifications`);
        const ids = new Set(plan.map((p) => p.id));
        if (ids.size !== plan.length) problems.push('duplicate ids');
        for (const p of plan) {
          if (!Number.isFinite(p.at)) problems.push(`${p.kind} at ${p.at}`);
          if (p.at < now + MIN_LEAD_MS - 1) problems.push(`${p.kind} within 30 min`);
          const hour = new Date(p.at).getHours(); // the device's zone, as planNotifications uses by default
          if (hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR) problems.push(`${p.kind} in quiet hours (${hour}:00)`);
          if (/NaN|undefined|Infinity/.test(p.title + p.body)) problems.push(`${p.kind} copy: ${p.body}`);
        }
        data.notify.push({
          h: (now - install) / 3_600_000,
          gapH: gap / 3600,
          tier: game.state.colony.tier,
          plan: plan.map((p) => ({ kind: p.kind, kinds: p.kinds, inH: (p.at - now) / 3_600_000 })),
          problems,
        });
      },
      inspect: (game) => scan(game, 'end'),
    },
  };
}

const f1 = (n: number) => n.toFixed(1);
const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`;

/** Markdown report of a soak run. */
export function soakReport(r: RunResult, d: SoakData): string {
  const out: string[] = ['## Soak', ''];
  // save size
  out.push('### Serialized save size', '', '| when | online h | day | tier | save |', '|---|---|---|---|---|');
  for (const s of d.scans.filter((x) => x.label !== 'hourly')) out.push(`| ${s.label} | ${f1(s.t)} | ${f1(s.h / 24)} | ${s.tier} | ${kb(s.bytes)} |`);
  out.push('');
  // growth: sizes that grow over the last third of the run
  const hourly = d.scans.filter((x) => x.label === 'hourly' || x.label === 'end');
  if (hourly.length >= 3) {
    const a = hourly[Math.floor(hourly.length / 3)];
    const b = hourly[Math.floor((2 * hourly.length) / 3)];
    const c = hourly[hourly.length - 1];
    const keys = new Set([...Object.keys(a.sizes), ...Object.keys(c.sizes)]);
    const rows = [...keys]
      .map((k) => ({ k, a: a.sizes[k] ?? 0, b: b.sizes[k] ?? 0, c: c.sizes[k] ?? 0 }))
      .filter((x) => x.c > x.b && x.b > x.a && x.c >= 20)
      .sort((x, y) => y.c - y.b - (x.c - x.b));
    out.push(`### Still growing (size at ${f1(a.t)} h / ${f1(b.t)} h / ${f1(c.t)} h online)`, '', '| path | sizes | per online h (last third) |', '|---|---|---|');
    for (const x of rows.slice(0, 40)) out.push(`| ${x.k} | ${x.a} / ${x.b} / ${x.c} | ${((x.c - x.b) / Math.max(0.1, c.t - b.t)).toFixed(1)} |`);
    out.push('');
    // the largest collections at the end
    const big = Object.entries(c.sizes)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 25);
    out.push('### Largest collections at the end', '', '| path | size |', '|---|---|');
    for (const [k, n] of big) out.push(`| ${k} | ${n} |`);
    out.push('');
  }
  // non-finite
  out.push('### Non-finite numbers', '');
  if (!d.nonFinite.length) out.push('none (checked every online minute)');
  for (const n of d.nonFinite) out.push(`- ${f1(n.t)} h, tier ${n.tier}: ${n.paths.slice(0, 12).join(', ')}`);
  out.push('');
  // step cost
  out.push('### Step cost by online hour (ms of wall time per online hour: bot + sim / sim only)', '', '| online h | wall ms | sim ms | steps | sim us/step |', '|---|---|---|---|---|');
  for (const c of r.stepCost.filter((_, i) => i % 4 === 0 || i === r.stepCost.length - 1)) {
    out.push(`| ${c.hour} | ${Math.round(c.wallMs)} | ${Math.round(c.simMs)} | ${c.steps} | ${((1000 * c.simMs) / Math.max(1, c.steps)).toFixed(1)} |`);
  }
  out.push('');
  // notifications
  const bad = d.notify.filter((n) => n.problems.length);
  const kinds: Record<string, number> = {};
  for (const n of d.notify) for (const p of n.plan) kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
  out.push(
    '### Notification plans at app close',
    '',
    `${d.notify.length} closes, ${bad.length} with problems. Lead kinds planned: ${Object.entries(kinds)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ')}.`,
    '',
  );
  for (const n of bad.slice(0, 20)) out.push(`- day ${f1(n.h / 24)} tier ${n.tier}: ${n.problems.join('; ')}`);
  const sampleClose = d.notify.filter((_, i) => i % 25 === 0);
  out.push('', '| day | tier | gap h | plan (kind @ hours after close) |', '|---|---|---|---|');
  for (const n of sampleClose) out.push(`| ${f1(n.h / 24)} | ${n.tier} | ${f1(n.gapH)} | ${n.plan.map((p) => `${p.kinds.join('+')} @${f1(p.inH)}`).join(', ')} |`);
  out.push('');
  return out.join('\n');
}
