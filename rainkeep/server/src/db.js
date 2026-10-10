/*
 * Rainkeep server: the SQLite schema and every query, on node:sqlite's synchronous DatabaseSync.
 * Calls are synchronous and Node runs one handler at a time between awaits, so a check followed by a write inside
 * one handler can't interleave with another request: the 31st join can't slip past the 30-member check.
 * Rows go out through the *Out() mappers, which give the shapes NETWORK.md describes.
 */
'use strict';

const { DatabaseSync } = require('node:sqlite');

// Column names avoid SQL keywords (`by`, `end`), so `pid`, `author` and `end_at` stand in for them.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  device TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created INTEGER NOT NULL,
  keep TEXT NOT NULL DEFAULT '',
  power REAL NOT NULL DEFAULT 0,
  wyrm INTEGER NOT NULL DEFAULT 1,
  skin TEXT NOT NULL DEFAULT '',
  stage INTEGER NOT NULL DEFAULT 1,
  cls TEXT NOT NULL DEFAULT 'guard',
  squad TEXT NOT NULL DEFAULT '[]',
  lp INTEGER NOT NULL DEFAULT 0,
  aid TEXT,
  joined INTEGER,
  seen INTEGER,
  ver TEXT NOT NULL DEFAULT '',
  last_chat INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS players_power ON players (power);
CREATE INDEX IF NOT EXISTS players_lp ON players (lp);
CREATE INDEX IF NOT EXISTS players_aid ON players (aid, joined);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, pid TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS tokens_pid ON tokens (pid, created);
CREATE TABLE IF NOT EXISTS saves (pid TEXT PRIMARY KEY, code TEXT NOT NULL, at INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS alliances (
  aid TEXT PRIMARY KEY, name TEXT NOT NULL, tag TEXT NOT NULL, color TEXT NOT NULL, motto TEXT NOT NULL,
  leader TEXT NOT NULL, created INTEGER NOT NULL, open INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alliances_created ON alliances (created);
CREATE TABLE IF NOT EXISTS chat (
  mid INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author TEXT NOT NULL, at INTEGER NOT NULL, text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_channel ON chat (channel, mid);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, mid INTEGER NOT NULL, author TEXT NOT NULL,
  text TEXT NOT NULL, msg_at INTEGER NOT NULL, reporter TEXT NOT NULL, at INTEGER NOT NULL, UNIQUE (mid, reporter)
);
CREATE TABLE IF NOT EXISTS helps (
  rid TEXT PRIMARY KEY, aid TEXT NOT NULL, pid TEXT NOT NULL, plot TEXT NOT NULL, label TEXT NOT NULL,
  at INTEGER NOT NULL, end_at INTEGER NOT NULL, need INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS helps_aid ON helps (aid, at);
CREATE INDEX IF NOT EXISTS helps_pid ON helps (pid);
CREATE TABLE IF NOT EXISTS help_hits (rid TEXT NOT NULL, helper TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (rid, helper));
CREATE TABLE IF NOT EXISTS boss (aid TEXT NOT NULL, day INTEGER NOT NULL, hp REAL NOT NULL, PRIMARY KEY (aid, day));
CREATE TABLE IF NOT EXISTS boss_dmg (
  aid TEXT NOT NULL, day INTEGER NOT NULL, pid TEXT NOT NULL, total REAL NOT NULL, hits INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (aid, day, pid)
);
CREATE TABLE IF NOT EXISTS battles (
  bid TEXT PRIMARY KEY, att TEXT NOT NULL, def TEXT NOT NULL, win INTEGER NOT NULL, at INTEGER NOT NULL,
  d INTEGER NOT NULL, ap REAL NOT NULL, dp REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS battles_def ON battles (def, at);
CREATE INDEX IF NOT EXISTS battles_att ON battles (att, at);
CREATE INDEX IF NOT EXISTS battles_at ON battles (at);
CREATE TABLE IF NOT EXISTS telemetry (pid TEXT PRIMARY KEY, doc TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

// The profile columns PUT /v1/players/me may set (validate.cleanProfile decides the values).
const PROFILE_COLS = ['name', 'keep', 'power', 'wyrm', 'skin', 'stage', 'cls', 'squad', 'ver'];

function parse(s, def) {
  try { return JSON.parse(s); } catch (e) { return def; }
}

function profileOut(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, v: 1, keep: r.keep, power: r.power, wyrm: r.wyrm, skin: r.skin, stage: r.stage,
    cls: r.cls, squad: parse(r.squad, []), lp: r.lp, aid: r.aid || null, seen: r.seen || 0, ver: r.ver,
  };
}

function allianceOut(r) {
  if (!r) return null;
  return {
    aid: r.aid, name: r.name, tag: r.tag, color: r.color, motto: r.motto, leader: r.leader,
    created: r.created, open: !!r.open, count: r.count || 0,
  };
}

function chatOut(r) {
  return { mid: String(r.mid), by: r.author, name: r.name || '', at: r.at, text: r.text };
}

function battleOut(r) {
  return { bid: r.bid, att: r.att, def: r.def, win: !!r.win, at: r.at, d: r.d, ap: r.ap, dp: r.dp };
}

function openDb(file) {
  const db = new DatabaseSync(file || ':memory:');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  // WAL lets a backup (`sqlite3 .backup`) read while the server writes; it needs a real file.
  if (file && file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);

  const stmts = new Map();
  const q = (sql) => {
    let s = stmts.get(sql);
    if (!s) { s = db.prepare(sql); stmts.set(sql, s); }
    return s;
  };
  let depth = 0;
  // Runs fn in one transaction (nested calls join the outer one).
  const tx = (fn) => {
    if (depth) return fn();
    db.exec('BEGIN');
    depth++;
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
      throw e;
    } finally {
      depth--;
    }
  };

  const api = {
    raw: db,
    tx,
    close() { db.close(); },

    // ---- players and tokens
    playerById: (id) => q('SELECT * FROM players WHERE id = ?').get(id),
    playerByDevice: (hash) => q('SELECT * FROM players WHERE device = ?').get(hash),
    playerByToken: (hash) => q('SELECT p.* FROM tokens t JOIN players p ON p.id = t.pid WHERE t.hash = ?').get(hash),
    createPlayer(id, device, name, now) {
      q('INSERT INTO players (id, device, name, created) VALUES (?, ?, ?, ?)').run(id, device, name, now);
    },
    addToken(hash, pid, now, keep) {
      tx(() => {
        q('INSERT INTO tokens (hash, pid, created) VALUES (?, ?, ?)').run(hash, pid, now);
        // a player keeps their newest few tokens (a phone and a browser, a reinstall), older ones stop working
        q(`DELETE FROM tokens WHERE pid = ? AND hash NOT IN
           (SELECT hash FROM tokens WHERE pid = ? ORDER BY created DESC, rowid DESC LIMIT ?)`).run(pid, pid, keep);
      });
    },
    rename: (id, name) => q('UPDATE players SET name = ? WHERE id = ?').run(name, id),
    updateProfile(id, fields, now) {
      const cols = PROFILE_COLS.filter((c) => c in fields);
      const vals = cols.map((c) => (c === 'squad' ? JSON.stringify(fields.squad) : fields[c]));
      const set = cols.map((c) => `${c} = ?`).concat('seen = ?').join(', ');
      q(`UPDATE players SET ${set} WHERE id = ?`).run(...vals, now, id);
    },
    setLp: (id, lp) => q('UPDATE players SET lp = ? WHERE id = ?').run(lp, id),
    setAid: (id, aid, joined) => q('UPDATE players SET aid = ?, joined = ? WHERE id = ?').run(aid, joined, id),
    setLastChat: (id, at) => q('UPDATE players SET last_chat = ? WHERE id = ?').run(at, id),
    // leaderboards and opponents only list players who have written a profile (seen is set)
    top(order, limit) {
      const by = order === 'lp' ? 'lp DESC, power DESC' : 'power DESC, lp DESC';
      return q(`SELECT * FROM players WHERE seen IS NOT NULL ORDER BY ${by}, id LIMIT ?`).all(limit).map(profileOut);
    },
    byIds: (ids) => q('SELECT * FROM players WHERE id IN (SELECT value FROM json_each(?))').all(JSON.stringify(ids)).map(profileOut),
    members: (aid) => q('SELECT * FROM players WHERE aid = ? ORDER BY power DESC, id').all(aid).map(profileOut),
    memberIds: (aid) => q('SELECT id FROM players WHERE aid = ?').all(aid).map((r) => r.id),
    memberCount: (aid) => q('SELECT COUNT(*) AS n FROM players WHERE aid = ?').get(aid).n,
    // the longest-standing member, who takes over when the leader leaves
    eldest: (aid) => q('SELECT id FROM players WHERE aid = ? ORDER BY joined, id LIMIT 1').get(aid),
    opponents(lo, hi, exclude, limit) {
      return q(`SELECT * FROM players WHERE seen IS NOT NULL AND id != ? AND power >= ? AND power <= ?
                ORDER BY random() LIMIT ?`).all(exclude, lo, hi, limit).map(profileOut);
    },

    // ---- cloud saves
    putSave: (pid, code, at, now) => q(`INSERT INTO saves (pid, code, at, updated) VALUES (?, ?, ?, ?)
      ON CONFLICT (pid) DO UPDATE SET code = excluded.code, at = excluded.at, updated = excluded.updated`).run(pid, code, at, now),
    getSave: (pid) => q('SELECT code, at FROM saves WHERE pid = ?').get(pid),

    // ---- Caravans
    alliance(aid) {
      const r = q(`SELECT a.*, (SELECT COUNT(*) FROM players p WHERE p.aid = a.aid) AS count
                   FROM alliances a WHERE a.aid = ?`).get(aid);
      return allianceOut(r);
    },
    alliances: (limit) => q(`SELECT a.*, (SELECT COUNT(*) FROM players p WHERE p.aid = a.aid) AS count
      FROM alliances a ORDER BY created DESC, aid LIMIT ?`).all(limit).map(allianceOut),
    createAlliance(a) {
      q(`INSERT INTO alliances (aid, name, tag, color, motto, leader, created, open)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(a.aid, a.name, a.tag, a.color, a.motto, a.leader, a.created, a.open ? 1 : 0);
    },
    updateAlliance(aid, f) {
      const cols = ['motto', 'color', 'open', 'leader'].filter((c) => c in f);
      if (!cols.length) return;
      const vals = cols.map((c) => (c === 'open' ? (f.open ? 1 : 0) : f[c]));
      q(`UPDATE alliances SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE aid = ?`).run(...vals, aid);
    },
    // an empty Caravan is disbanded with everything that hangs off it (reports stay for moderators)
    deleteAlliance(aid) {
      tx(() => {
        q('DELETE FROM help_hits WHERE rid IN (SELECT rid FROM helps WHERE aid = ?)').run(aid);
        q('DELETE FROM helps WHERE aid = ?').run(aid);
        q('DELETE FROM boss_dmg WHERE aid = ?').run(aid);
        q('DELETE FROM boss WHERE aid = ?').run(aid);
        q('DELETE FROM chat WHERE channel = ?').run('al-' + aid);
        q('DELETE FROM alliances WHERE aid = ?').run(aid);
      });
    },

    // ---- chat
    addChat(channel, author, at, text, keep) {
      return tx(() => {
        const { lastInsertRowid } = q('INSERT INTO chat (channel, author, at, text) VALUES (?, ?, ?, ?)').run(channel, author, at, text);
        q(`DELETE FROM chat WHERE channel = ? AND mid NOT IN
           (SELECT mid FROM chat WHERE channel = ? ORDER BY mid DESC LIMIT ?)`).run(channel, channel, keep);
        return Number(lastInsertRowid);
      });
    },
    chatMsg(channel, mid) {
      const r = q('SELECT c.*, p.name FROM chat c LEFT JOIN players p ON p.id = c.author WHERE c.channel = ? AND c.mid = ?').get(channel, mid);
      return r ? chatOut(r) : null;
    },
    // the newest `limit` messages after `since`, oldest first
    chatSince(channel, since, limit) {
      return q(`SELECT * FROM (SELECT c.*, p.name FROM chat c LEFT JOIN players p ON p.id = c.author
                WHERE c.channel = ? AND c.at > ? ORDER BY c.mid DESC LIMIT ?) ORDER BY mid`).all(channel, since, limit).map(chatOut);
    },
    addReport(r) {
      q(`INSERT OR IGNORE INTO reports (channel, mid, author, text, msg_at, reporter, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`).run(r.channel, r.mid, r.author, r.text, r.msgAt, r.reporter, r.at);
    },
    // the shape the game's playtest sheet reads: rid (report), ch, mid, by (author), text, at (sent), rep (reporter), rat (reported)
    reports: (limit) => q('SELECT * FROM reports ORDER BY id DESC LIMIT ?').all(limit).map((r) => ({
      rid: String(r.id), ch: r.channel, mid: String(r.mid), by: r.author, text: r.text, at: r.msg_at, rep: r.reporter, rat: r.at,
    })),
    deleteReport: (rid) => q('DELETE FROM reports WHERE id = ?').run(rid).changes,
    // a removed message closes every report of it, so it doesn't come back on the moderators' list
    deleteChat: (channel, mid) => {
      const n = q('DELETE FROM chat WHERE channel = ? AND mid = ?').run(channel, mid).changes;
      q('DELETE FROM reports WHERE channel = ? AND mid = ?').run(channel, mid);
      return n;
    },

    // ---- help requests
    addHelp: (h) => q(`INSERT INTO helps (rid, aid, pid, plot, label, at, end_at, need) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(h.rid, h.aid, h.by, h.plot, h.label, h.at, h.end, h.need),
    help(rid) {
      const r = q('SELECT * FROM helps WHERE rid = ?').get(rid);
      if (!r) return null;
      const hs = {};
      for (const x of q('SELECT helper, at FROM help_hits WHERE rid = ?').all(rid)) hs[x.helper] = x.at;
      return helpOut(r, hs);
    },
    helpsFor(aid, after) {
      const rows = q('SELECT * FROM helps WHERE aid = ? AND at > ? ORDER BY at, rid').all(aid, after);
      const hits = q(`SELECT h.rid, h.helper, h.at FROM help_hits h JOIN helps r ON r.rid = h.rid
                      WHERE r.aid = ? AND r.at > ?`).all(aid, after);
      const by = new Map(rows.map((r) => [r.rid, {}]));
      for (const x of hits) if (by.has(x.rid)) by.get(x.rid)[x.helper] = x.at;
      return rows.map((r) => helpOut(r, by.get(r.rid)));
    },
    openHelpsBy: (pid, after) => q('SELECT COUNT(*) AS n FROM helps WHERE pid = ? AND at > ?').get(pid, after).n,
    addHelpHit: (rid, helper, at) => q('INSERT INTO help_hits (rid, helper, at) VALUES (?, ?, ?)').run(rid, helper, at),
    deleteHelp(rid) {
      tx(() => {
        q('DELETE FROM help_hits WHERE rid = ?').run(rid);
        q('DELETE FROM helps WHERE rid = ?').run(rid);
      });
    },
    deleteHelpsBy(pid, aid) {
      tx(() => {
        q('DELETE FROM help_hits WHERE rid IN (SELECT rid FROM helps WHERE pid = ? AND aid = ?)').run(pid, aid);
        q('DELETE FROM helps WHERE pid = ? AND aid = ?').run(pid, aid);
      });
    },
    pruneHelps(before) {
      tx(() => {
        q('DELETE FROM help_hits WHERE rid IN (SELECT rid FROM helps WHERE at <= ?)').run(before);
        q('DELETE FROM helps WHERE at <= ?').run(before);
      });
    },

    // ---- Caravan boss
    boss(aid, day) {
      const b = q('SELECT hp FROM boss WHERE aid = ? AND day = ?').get(aid, day);
      if (!b) return null;
      const dmg = {};
      const hits = {};
      for (const r of q('SELECT pid, total, hits FROM boss_dmg WHERE aid = ? AND day = ?').all(aid, day)) {
        dmg[r.pid] = r.total;
        hits[r.pid] = r.hits;
      }
      return { hp: b.hp, dmg, hits };
    },
    setBossHp: (aid, day, hp) => q('INSERT OR IGNORE INTO boss (aid, day, hp) VALUES (?, ?, ?)').run(aid, day, hp),
    bossEntry: (aid, day, pid) => q('SELECT total, hits FROM boss_dmg WHERE aid = ? AND day = ? AND pid = ?').get(aid, day, pid),
    putBossDmg: (aid, day, pid, total, hits, at) => q(`INSERT INTO boss_dmg (aid, day, pid, total, hits, at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (aid, day, pid) DO UPDATE SET total = excluded.total, hits = excluded.hits, at = excluded.at`).run(aid, day, pid, total, hits, at),
    pruneBoss(beforeDay) {
      tx(() => {
        q('DELETE FROM boss_dmg WHERE day < ?').run(beforeDay);
        q('DELETE FROM boss WHERE day < ?').run(beforeDay);
      });
    },

    // ---- Arena battles
    addBattle: (b) => q('INSERT INTO battles (bid, att, def, win, at, d, ap, dp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(b.bid, b.att, b.def, b.win ? 1 : 0, b.at, b.d, b.ap, b.dp),
    attacksSince: (att, since) => q('SELECT COUNT(*) AS n FROM battles WHERE att = ? AND at >= ?').get(att, since).n,
    attacked: (att, def, since) => !!q('SELECT 1 AS x FROM battles WHERE att = ? AND def = ? AND at >= ? LIMIT 1').get(att, def, since),
    battlesAgainst: (def, since, limit) => q('SELECT * FROM battles WHERE def = ? AND at > ? ORDER BY at, bid LIMIT ?')
      .all(def, since, limit).map(battleOut),
    pruneBattles: (before) => q('DELETE FROM battles WHERE at < ?').run(before),

    // ---- playtest reports
    putTelemetry: (pid, doc, at) => q(`INSERT INTO telemetry (pid, doc, at) VALUES (?, ?, ?)
      ON CONFLICT (pid) DO UPDATE SET doc = excluded.doc, at = excluded.at`).run(pid, JSON.stringify(doc), at),
    allTelemetry: () => q('SELECT t.pid, t.doc, t.at, p.name FROM telemetry t LEFT JOIN players p ON p.id = t.pid ORDER BY t.at DESC')
      .all().map((r) => Object.assign(parse(r.doc, {}), { id: r.pid, name: r.name || '', updated: r.at })),

    // ---- live config
    getConfig: () => { const r = q("SELECT v FROM config WHERE k = 'live'").get(); return r ? parse(r.v, null) : null; },
    putConfig: (c) => q("INSERT INTO config (k, v) VALUES ('live', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").run(JSON.stringify(c)),
  };
  return api;
}

function helpOut(r, hs) {
  return { rid: r.rid, aid: r.aid, by: r.pid, plot: r.plot, label: r.label, at: r.at, end: r.end_at, need: r.need, hs: hs || {} };
}

module.exports = { openDb, profileOut, SCHEMA };
