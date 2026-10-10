/*
 * Rainkeep server: input cleaning. Everything a player sends is untrusted (NETWORK.md), so every number is clamped
 * to the range the data model gives it, every string loses its control characters and is cut to its length limit,
 * and unknown fields are dropped. Cleaners never throw: a value that can't be used is left out (or becomes the
 * field's default), and the route decides whether a missing field is an error.
 */
'use strict';

const DAY = 864e5;

// Field limits from NETWORK.md's data model.
const LIMITS = {
  name: 24, keep: 24, skin: 24, ver: 12, aid: 40, heroId: 24, squad: 5,
  wyrm: [1, 40], stage: [1, 400], lvl: [1, 999], stars: [0, 10],
  power: [0, 1e9], // far above any keep's power: only there to keep sums and sorts sane
  allianceName: 24, tag: 4, motto: 80,
  chat: 200, helpLabel: 40, plot: 24, need: [1, 10],
  motd: 200, motdId: 40, focus: 200,
  saveBytes: 512 * 1024, bodyBytes: 600 * 1024,
};
const CLASSES = ['guard', 'bow', 'lancer'];
const MAX_TIME = 1e13; // year 2286: any later "time" is junk

// Control characters, zero-width spaces and bidi overrides (which can flip the text around them on screen).
// Zero-width joiners stay: emoji sequences need them.
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;
const BAD_CHARS_KEEP_LINES = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f​‎‏‪-‮⁦-⁩﻿]/g;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A string cut to `max` characters (code points, so an emoji is never split in half). Numbers become strings;
// anything else becomes ''. Whitespace runs collapse to one space unless `lines` keeps line breaks.
function str(v, max, lines) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return '';
  let s = v.slice(0, max * 4 + 16).normalize('NFC');
  s = lines ? s.replace(/\r\n?/g, '\n').replace(/[\t\v\f]+/g, ' ').replace(BAD_CHARS_KEEP_LINES, '').replace(/ +/g, ' ').replace(/\n{3,}/g, '\n\n')
    : s.replace(/[\t\n\r\v\f]+/g, ' ').replace(BAD_CHARS, '').replace(/\s+/g, ' ');
  s = s.trim();
  const cps = Array.from(s);
  return cps.length > max ? cps.slice(0, max).join('').trim() : s;
}

// A finite number clamped to [min, max], or `def` when there is none. Numeric strings count (query parameters).
function num(v, min, max, def) {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function int(v, min, max, def) {
  const n = num(v, min, max, null);
  return n === null ? def : Math.round(n);
}
const time = (v, def) => int(v, 0, MAX_TIME, def);

function bool(v, def) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return v === 1;
  return def;
}

function color(v) {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

function tag(v) {
  return typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LIMITS.tag) : '';
}

function cleanSquad(v) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const h of v) {
    if (out.length >= LIMITS.squad) break;
    if (!isObj(h)) continue;
    const id = str(h.id, LIMITS.heroId);
    if (!id) continue;
    out.push({ id, lvl: int(h.lvl, LIMITS.lvl[0], LIMITS.lvl[1], 1), stars: int(h.stars, LIMITS.stars[0], LIMITS.stars[1], 0) });
  }
  return out;
}

// The profile fields a player may write. `lp` and `aid` are left out on purpose: Arena points and membership are
// the server's to set (POST /v1/battles, the alliance routes), and `seen` is stamped by the server.
function cleanProfile(b) {
  const out = {};
  if (!isObj(b)) return out;
  const put = (k, v) => { if (v !== null && v !== undefined) out[k] = v; };
  if ('keep' in b) out.keep = str(b.keep, LIMITS.keep);
  if ('name' in b) { const n = str(b.name, LIMITS.name); if (n) out.name = n; }
  if ('power' in b) put('power', int(b.power, LIMITS.power[0], LIMITS.power[1], null));
  if ('wyrm' in b) put('wyrm', int(b.wyrm, LIMITS.wyrm[0], LIMITS.wyrm[1], null));
  if ('skin' in b) out.skin = str(b.skin, LIMITS.skin);
  if ('stage' in b) put('stage', int(b.stage, LIMITS.stage[0], LIMITS.stage[1], null));
  if (CLASSES.includes(b.cls)) out.cls = b.cls;
  if ('squad' in b) out.squad = cleanSquad(b.squad);
  if ('ver' in b) out.ver = str(b.ver, LIMITS.ver);
  return out;
}

// A Caravan's editable fields. On create the name is required (the route checks), the tag falls back to the
// name's first letters and the colour to the game's sand gold.
function cleanAlliance(b, create) {
  const out = {};
  if (!isObj(b)) b = {};
  if (create) {
    out.name = str(b.name, LIMITS.allianceName);
    out.tag = tag(b.tag) || tag(out.name.split(' ').map((w) => w[0] || '').join('')) || tag(out.name) || 'RK';
    out.color = color(b.color) || '#c8a24a';
    out.motto = str(b.motto, LIMITS.motto);
    out.open = bool(b.open, true);
    return out;
  }
  if ('motto' in b) out.motto = str(b.motto, LIMITS.motto);
  const c = color(b.color);
  if (c) out.color = c;
  const o = bool(b.open, null);
  if (o !== null) out.open = o;
  // a leader hands over to a member (the route checks the id belongs to a member)
  if (typeof b.leader === 'string' && b.leader && b.leader.length <= 64) out.leader = b.leader;
  return out;
}

// A help request. `end` must still be ahead (a build can't take longer than 30 days).
function cleanHelp(b, now) {
  if (!isObj(b)) b = {};
  return {
    plot: str(b.plot, LIMITS.plot),
    label: str(b.label, LIMITS.helpLabel),
    end: int(b.end, now, now + 30 * DAY, now + 3600e3),
    need: int(b.need, LIMITS.need[0], LIMITS.need[1], 1),
  };
}

// Any JSON value with bounded depth, key count and string length: for the free-form corners of a report (`dev`).
function plain(v, depth) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return str(v, 200);
  if (depth <= 0 || v === null || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => plain(x, depth - 1));
  const out = {};
  for (const k of Object.keys(v).slice(0, 40)) {
    const key = str(k, 40);
    if (key && key !== '__proto__') out[key] = plain(v[k], depth - 1);
  }
  return out;
}

// { key: number } with at most `n` keys, the largest values kept.
function numMap(v, n, max) {
  if (!isObj(v)) return undefined;
  const pairs = [];
  for (const k of Object.keys(v).slice(0, 500)) {
    const key = str(k, 40);
    const x = num(v[k], 0, max, null);
    if (key && key !== '__proto__' && x !== null) pairs.push([key, x]);
  }
  pairs.sort((a, b) => b[1] - a[1]);
  const out = {};
  for (const [k, x] of pairs.slice(0, n)) out[k] = x;
  return out;
}

// A playtest report (NETWORK.md "Playtest report"): known fields only, each to its own limit.
function cleanTelemetry(d) {
  const t = {};
  if (!isObj(d)) return t;
  const put = (k, v) => { if (v !== null && v !== undefined) t[k] = v; };
  put('first', time(d.first, null));
  put('last', time(d.last, null));
  if (Array.isArray(d.days)) {
    const days = new Set();
    for (const x of d.days.slice(0, 400)) { const n = int(x, 0, 1e6, null); if (n !== null) days.add(n); }
    t.days = [...days].sort((a, b) => a - b).slice(-60);
  }
  put('sessions', int(d.sessions, 0, 1e7, null));
  // a save from before playtest reports: no first-session funnel (playtest.js)
  if (d.old === true) t.old = true;
  put('secs', int(d.secs, 0, 1e10, null));
  put('ftue', numMap(d.ftue, 40, 1e9));
  put('stage', int(d.stage, LIMITS.stage[0], LIMITS.stage[1], null));
  put('wyrm', int(d.wyrm, LIMITS.wyrm[0], LIMITS.wyrm[1], null));
  put('power', int(d.power, LIMITS.power[0], LIMITS.power[1], null));
  if ('ver' in d) t.ver = str(d.ver, LIMITS.ver);
  put('feat', numMap(d.feat, 60, 1e9));
  if (isObj(d.spend)) t.spend = { n: int(d.spend.n, 0, 1e6, 0), usd: num(d.spend.usd, 0, 1e7, 0) };
  if (isObj(d.dev)) t.dev = plain(d.dev, 3);
  put('fps', num(d.fps, 0, 1000, null));
  if (Array.isArray(d.err)) {
    t.err = d.err.filter(isObj).slice(-20).map((e) => ({ m: str(e.m, 160), n: int(e.n, 0, 1e9, 1), at: time(e.at, 0) }));
  }
  if (Array.isArray(d.fb)) {
    t.fb = d.fb.filter(isObj).slice(-30).map((f) => ({
      at: time(f.at, 0), r: int(f.r, 1, 5, 3), t: str(f.t, 500, true),
      stage: int(f.stage, LIMITS.stage[0], LIMITS.stage[1], 1), ver: str(f.ver, LIMITS.ver),
    }));
  }
  return t;
}

// The live config (NETWORK.md "Live config"): a message of the day and the playtest's week and focus.
function cleanConfig(b) {
  if (!isObj(b)) b = {};
  const test = isObj(b.test) ? b.test : {};
  return {
    motd: str(b.motd, LIMITS.motd),
    motdId: typeof b.motdId === 'number' && Number.isFinite(b.motdId) ? b.motdId : str(b.motdId, LIMITS.motdId),
    test: { week: int(test.week, 0, 1000, 0), focus: str(test.focus, LIMITS.focus) },
  };
}

module.exports = {
  DAY, LIMITS, CLASSES, MAX_TIME,
  isObj, str, num, int, time, bool, color, tag,
  cleanSquad, cleanProfile, cleanAlliance, cleanHelp, cleanTelemetry, cleanConfig, plain,
};
