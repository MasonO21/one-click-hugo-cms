/**
 * Turns a pacing RunResult into markdown tables (and the data the SVG charts plot). Not a test.
 */
import type { RunResult, EventRec } from './run';
import { isAccomplishment } from './run';
import { masteryCost, masteryLine } from '../../src/sim/mastery';

const masteryCostOf = (line: string, level: number): number => {
  const l = masteryLine(line);
  return l && level > 0 ? masteryCost(l, level) : 0;
};

const TIER_NAMES = ['Wood', 'Reinforced', 'Stone', 'Steel', 'Alloy', 'Nano', 'Titanium'];

const fmtMin = (s: number) => (s / 60).toFixed(1);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '-');

function quantile(xs: number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
}

/** Online seconds of each tier span: [start, end). */
export function tierSpans(r: RunResult): { tier: number; t0: number; t1: number; h0: number; h1: number; reached: boolean }[] {
  const out = [];
  for (let i = 0; i < r.tierAt.length; i++) {
    const a = r.tierAt[i];
    const b = r.tierAt[i + 1];
    out.push({ tier: a.tier, t0: a.t, t1: b ? b.t : r.final.t, h0: a.h, h1: b ? b.h : r.final.h, reached: !!b });
  }
  return out;
}

/** Gaps (online seconds) between consecutive accomplishments inside [t0, t1). */
export function gapsIn(events: EventRec[], t0: number, t1: number, filter = isAccomplishment): number[] {
  const ts = events.filter((e) => filter(e.kind) && e.t >= t0 && e.t < t1).map((e) => e.t);
  const gaps: number[] = [];
  let prev = t0;
  for (const t of ts) {
    gaps.push(t - prev);
    prev = t;
  }
  gaps.push(t1 - prev);
  return gaps;
}

/** "Big" milestones only: main missions, tiers, research, new building types, raids. */
export function isMilestone(e: EventRec, seenDefs: Set<string>): boolean {
  if (e.kind === 'tier' || e.kind === 'research' || e.kind === 'raid') return true;
  if (e.kind === 'mission' && e.what.startsWith('main:')) return true;
  if (e.kind === 'build' && !seenDefs.has(e.what)) {
    seenDefs.add(e.what);
    return true;
  }
  return false;
}

export function tierTable(r: RunResult): string {
  const rows: string[] = [];
  rows.push('| Tier | reached at (online) | calendar | sessions | colonists | buildings* | research | accomplishments | median gap | p90 gap | longest gap | dry spells >3 min (time) | raids | binding (share of tier time) |');
  rows.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const spans = tierSpans(r);
  for (const sp of spans) {
    const ev = r.events.filter((e) => e.t >= sp.t0 && e.t < sp.t1);
    const acc = ev.filter((e) => isAccomplishment(e.kind));
    const gaps = gapsIn(r.events, sp.t0, sp.t1);
    const dry = gaps.filter((g) => g > 180);
    const sessions = r.sessions.filter((s) => s.startH >= sp.h0 && s.startH < sp.h1).length;
    const samp = r.samples.filter((s) => s.t >= sp.t1 - 61 && s.t <= sp.t1 + 1).at(-1) ?? r.samples.filter((s) => s.t <= sp.t1).at(-1);
    const raids = r.raids.filter((x) => x.t >= sp.t0 && x.t < sp.t1).length;
    const bind = r.binding[sp.tier] ?? {};
    const tot = Object.values(bind).reduce((a, b) => a + b, 0);
    const topBind = Object.entries(bind).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${pct(v, tot)}`).join(', ');
    const reach = sp.tier === 0 ? '0' : `${fmtMin(sp.t0)} min`;
    const cal = sp.tier === 0 ? '0' : `${(sp.h0 / 24).toFixed(2)} d (${sp.h0.toFixed(1)} h)`;
    rows.push(`| ${sp.tier} ${TIER_NAMES[sp.tier]} | ${reach} | ${cal} | ${sessions} | ${samp?.colonists ?? '-'} | ${samp?.buildings ?? '-'} | ${samp?.researchDone ?? '-'} | ${acc.length} in ${fmtMin(sp.t1 - sp.t0)} min | ${fmtMin(quantile(gaps, 0.5))} | ${fmtMin(quantile(gaps, 0.9))} | ${fmtMin(Math.max(...gaps))} | ${dry.length} (${fmtMin(dry.reduce((a, b) => a + b, 0))} min) | ${raids} | ${topBind} |`);
  }
  rows.push('');
  rows.push('*colonists / buildings / research at the end of the tier span (buildings exclude wall/floor pieces). Gaps are online minutes between accomplishments (build complete, research, recruit, mission claimed, tier, raid won, expedition home, wish granted, region discovered, festival).');
  return rows.join('\n');
}

export function activityTable(r: RunResult): string {
  const kinds = ['act', 'gather_goal', 'gather_filler', 'travel', 'explore', 'defend', 'wait'];
  const rows = [`| Tier | ${kinds.join(' | ')} |`, `|---|${kinds.map(() => '---').join('|')}|`];
  for (const [tier, row] of Object.entries(r.activity)) {
    const tot = Object.values(row).reduce((a, b) => a + b, 0);
    rows.push(`| ${tier} | ${kinds.map((k) => pct(row[k] ?? 0, tot)).join(' | ')} |`);
  }
  return rows.join('\n');
}

export function incomeTable(r: RunResult): string {
  const rows = ['| Tier | total value | production | gather | RP (x3) | missions | crates/chests | season | invasions | achievements | daily+spin | expeditions | exploration | other |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [tier, row] of Object.entries(r.income)) {
    const tot = Object.values(row).reduce((a, b) => a + b, 0);
    const g = (...ks: string[]) => ks.reduce((s, k) => s + (row[k] ?? 0), 0);
    const known = ['production', 'gather', 'drop', 'rp', 'reward:mission', 'reward:tutorial', 'reward:crate', 'reward:chest', 'reward:season', 'reward:invasion', 'reward:achievement', 'reward:daily', 'reward:spin', 'reward:expedition', 'reward:poi', 'reward:survey', 'offline'];
    const other = Object.entries(row).filter(([k]) => !known.includes(k)).reduce((s, [, v]) => s + v, 0);
    rows.push(
      `| ${tier} | ${Math.round(tot).toLocaleString('en-US')} | ${pct(g('production'), tot)} | ${pct(g('gather', 'drop'), tot)} | ${pct(g('rp'), tot)} | ${pct(g('reward:mission', 'reward:tutorial'), tot)} | ${pct(g('reward:crate', 'reward:chest'), tot)} | ${pct(g('reward:season'), tot)} | ${pct(g('reward:invasion'), tot)} | ${pct(g('reward:achievement'), tot)} | ${pct(g('reward:daily', 'reward:spin'), tot)} | ${pct(g('reward:expedition'), tot)} | ${pct(g('reward:poi', 'reward:survey'), tot)} | ${pct(other + g('offline'), tot)} |`,
    );
  }
  rows.push('');
  rows.push('Reward resources announced vs received (the rest did not fit in storage):');
  for (const [tier, w] of Object.entries(r.rewards ?? {})) rows.push(`- tier ${tier}: ${Math.round(w.received).toLocaleString('en-US')} of ${Math.round(w.announced).toLocaleString('en-US')} (${pct(w.received, w.announced)})`);
  return rows.join('\n') + '\n\nValue in wood-equivalents (data/expeditions.ts VALUE), RP counted x3 (POI research points land in "RP"). "exploration" is POI loot and region survey rewards; "offline" (Welcome Back) is in "other".';
}

export function capTable(r: RunResult): string {
  const rows = ['| Tier | online min | resources at >=99% of cap (share of tier time) |', '|---|---|---|'];
  for (const sp of tierSpans(r)) {
    const row = r.capped[sp.tier] ?? {};
    const dur = sp.t1 - sp.t0;
    const top = Object.entries(row).sort((a, b) => b[1] - a[1]).filter(([, v]) => v / dur > 0.05).map(([k, v]) => `${k} ${pct(v, dur)}`).join(', ');
    rows.push(`| ${sp.tier} | ${fmtMin(dur)} | ${top || '-'} |`);
  }
  return rows.join('\n');
}

export function raidTable(r: RunResult): string {
  const rows = ['| # | tier | online min | aliens | boss | turrets | defense DPS | killed by turret/trap/player/drone | building damage | broken | core hit | hero KO | duration s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const x of r.raids) {
    rows.push(`| ${x.wave} | ${x.tier} | ${fmtMin(x.t)} | ${x.aliens} | ${x.boss ?? ''} | ${x.turrets} | ${x.defense} | ${x.kills.turret}/${x.kills.trap}/${x.kills.player}/${x.kills.drone} | ${Math.round(x.damage)} | ${x.broken} | ${x.coreBroken ? 'yes' : ''} | ${x.playerDowns || ''} | ${Math.round(x.duration)} |`);
  }
  return rows.join('\n');
}

export function sessionTable(r: RunResult): string {
  const rows = ['| # | starts (h) | tier | online min | gap before (h) | offline credited (h) | offline gain / potential |', '|---|---|---|---|---|---|---|'];
  for (const s of r.sessions) {
    rows.push(`| ${s.index} | ${s.startH.toFixed(1)} | ${s.tierAtStart} | ${s.onlineMin.toFixed(0)} | ${s.gapH.toFixed(1)} | ${(s.offlineCredited / 3600).toFixed(1)} | ${s.offlinePotential > 0 ? pct(s.offlineGainValue, s.offlinePotential) : '-'} |`);
  }
  return rows.join('\n');
}

export function researchTable(r: RunResult): string {
  const rows = ['| Tier | avg unspent RP | max unspent RP | RP/min (end) | share of time with affordable research waiting | share with nothing researchable |', '|---|---|---|---|---|---|'];
  for (const sp of tierSpans(r)) {
    const ss = r.samples.filter((s) => s.t >= sp.t0 && s.t < sp.t1);
    if (!ss.length) continue;
    const avg = ss.reduce((a, s) => a + s.rp, 0) / ss.length;
    const max = Math.max(...ss.map((s) => s.rp));
    const aff = ss.filter((s) => s.researchAffordable > 0).length;
    const none = ss.filter((s) => s.researchAvailable === 0).length;
    rows.push(`| ${sp.tier} | ${Math.round(avg)} | ${Math.round(max)} | ${Math.round(ss.at(-1)!.rpPerMin)} | ${pct(aff, ss.length)} | ${pct(none, ss.length)} |`);
  }
  return rows.join('\n');
}

/** Research Mastery and Colony Spirit per tier (the long tail: sim/mastery.ts, sim/colony/spirit.ts). */
export function longTailTable(r: RunResult): string {
  const rows = [
    '| Tier | Mastery levels bought | RP into Mastery | levels at end (prod/stor/build/def/crew/exp) | share of time with nothing researchable (tree + Mastery) | share of time RP covers a tree tech or a Mastery level | festivals | online min between festivals | avg Spirit fill /min |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const lines = ['production', 'logistics', 'construction', 'defense', 'crew', 'expeditions'];
  const fest = r.events.filter((e) => e.kind === 'festival').map((e) => e.t);
  for (const sp of tierSpans(r)) {
    const ss = r.samples.filter((s) => s.t >= sp.t0 && s.t < sp.t1);
    if (!ss.length) continue;
    const ev = r.events.filter((e) => e.kind === 'mastery' && e.t >= sp.t0 && e.t < sp.t1);
    // cost of a level from its line and number (the events carry "line level")
    let spent = 0;
    for (const e of ev) {
      const [line, lv] = e.what.split(' ');
      spent += masteryCostOf(line, Number(lv));
    }
    const end = ss.at(-1)!;
    const lv = lines.map((l) => end.mastery?.[l] ?? 0).join('/');
    const none = ss.filter((s) => s.researchAvailable === 0 && !s.masteryOpen).length;
    const can = ss.filter((s) => s.researchAffordable > 0 || s.masteryAffordable).length;
    const fs = fest.filter((t) => t >= sp.t0 && t < sp.t1);
    const all = fest.filter((t) => t < sp.t1);
    const gaps: number[] = [];
    for (const t of fs) {
      const i = all.indexOf(t);
      if (i > 0) gaps.push(t - all[i - 1]);
    }
    const rate = ss.reduce((a, s) => a + (s.spiritRate ?? 0), 0) / ss.length;
    rows.push(`| ${sp.tier} | ${ev.length} | ${Math.round(spent).toLocaleString('en-US')} | ${lv} | ${pct(none, ss.length)} | ${pct(can, ss.length)} | ${fs.length} | ${gaps.length ? gaps.map((g) => fmtMin(g)).join(', ') : '-'} | ${rate.toFixed(2)} |`);
  }
  rows.push('');
  rows.push('The bot buys the cheapest Mastery level with what is left after the research chain to the next tier gate, so the bank rarely covers one for long.');
  return rows.join('\n');
}

export function missionTable(r: RunResult): string {
  const rows = ['| Tier | main missions claimed | side claimed | daily claimed | avg side active | avg side claimable (unclaimed) | share of time main mission is waiting on production only (eta > 10 min) |', '|---|---|---|---|---|---|---|'];
  for (const sp of tierSpans(r)) {
    const ev = r.events.filter((e) => e.kind === 'mission' && e.t >= sp.t0 && e.t < sp.t1);
    const ss = r.samples.filter((s) => s.t >= sp.t0 && s.t < sp.t1);
    if (!ss.length) continue;
    const avg = (f: (s: (typeof ss)[number]) => number) => (ss.reduce((a, s) => a + f(s), 0) / ss.length).toFixed(1);
    const waiting = ss.filter((s) => s.eta > 10 && s.eta !== Infinity).length + ss.filter((s) => s.eta === Infinity).length;
    rows.push(`| ${sp.tier} | ${ev.filter((e) => e.what.startsWith('main')).length} | ${ev.filter((e) => e.what.startsWith('side')).length} | ${ev.filter((e) => e.what.startsWith('daily')).length} | ${avg((s) => s.sideActive)} | ${avg((s) => s.sideClaimable)} | ${pct(waiting, ss.length)} |`);
  }
  return rows.join('\n');
}

export function exploreTable(r: RunResult): string {
  const rows = ['| Tier | fog revealed at end | regions discovered | POIs looted | survey (mean of open regions) | survey milestones claimed | world events | expeditions sent / home | wishes granted / lapsed |', '|---|---|---|---|---|---|---|---|---|'];
  for (const sp of tierSpans(r)) {
    const ss = r.samples.filter((s) => s.t < sp.t1).at(-1);
    const ev = r.events.filter((e) => e.t >= sp.t0 && e.t < sp.t1);
    const n = (k: string) => ev.filter((e) => e.kind === k).length;
    rows.push(`| ${sp.tier} | ${ss ? pct(ss.explored, 1) : '-'} | ${ss?.regions ?? '-'} | ${n('loot')} | ${ss?.survey != null ? `${Math.round(ss.survey)}%` : '-'} | ${n('survey')} | ${n('world_event')} | ${n('expedition_out')} / ${n('expedition')} | ${n('wish')} / ${n('wish_expired')} |`);
  }
  return rows.join('\n');
}

function tapTable(r: RunResult): string {
  const rows = ['| Tier | menu actions | level-ups (single) | upgrade-all | cards as they come | cards after merging | crates opened | crate / cache scenes |', '|---|---|---|---|---|---|---|---|'];
  for (const [tier, t] of Object.entries(r.taps ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    rows.push(`| ${tier} | ${t.actions} | ${t.levelUps} | ${t.upgradeAll} | ${t.cardsRaw} | ${t.cardsMerged} | ${t.crateOpens} | ${t.crateScenes} |`);
  }
  return rows.join('\n');
}

export function fullReport(r: RunResult, title: string): string {
  const o = r.opts;
  return [
    `## ${title}`,
    '',
    `mode **${o.mode}**${o.mode === 'sessions' ? ` (${o.sessionMin} min x ${o.sessionsPerDay}/day)` : ''}, pace **${o.pace}**, Nova **${o.nova}**, seed ${o.seed}. Final: tier ${r.final.tier}, ${fmtMin(r.final.t)} online min, ${(r.final.h / 24).toFixed(2)} days, ${r.final.colonists} colonists, ${r.final.research} research, Nova earned ${r.final.novaEarned} (spent ${r.botStats.novaSpent}). Sim wall time ${(r.wallMs / 1000).toFixed(0)} s.`,
    '',
    '### Tiers',
    tierTable(r),
    '',
    '### What the player was doing (share of online time)',
    activityTable(r),
    '',
    '### Income by source',
    incomeTable(r),
    '',
    '### Storage caps',
    capTable(r),
    '',
    '### Research backlog',
    researchTable(r),
    '',
    '### Long tail: Research Mastery and Colony Spirit',
    longTailTable(r),
    '',
    '### Missions',
    missionTable(r),
    '',
    '### Exploration, expeditions, wishes',
    exploreTable(r),
    '',
    '### Raids',
    raidTable(r),
    '',
    '### Taps and cards',
    tapTable(r),
    '',
    o.mode === 'sessions' ? `### Sessions\n${sessionTable(r)}\n` : '',
  ].join('\n');
}
