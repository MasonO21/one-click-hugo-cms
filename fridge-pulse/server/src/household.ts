import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Shared households: people who share a fridge see one list of food and one shopping list.
 *
 * Storage is Node's built-in SQLite (one file, or memory in tests). Each tracked item and shopping
 * entry is a record with the client's `updatedAt`; the newest change wins, deletions are kept as
 * tombstones for a while so other phones hear about them, and every accepted change gets the next
 * number in the household's sequence so a phone can ask for "everything since 412".
 *
 * Member ids are stored as hashes of the app user id, never the id itself. The one exception is the
 * person who pays for a household plan: their app user id is kept with the household so the server
 * can ask the store whether the plan has renewed, and so keep covering everyone, without them having
 * to open the app.
 */

export const MAX_MEMBERS = 8;
export const MAX_RECORDS = 3000;
/** Changes returned per sync call; the client asks again while `more` is true. */
export const PAGE = 500;
/** Deletions are remembered this long; a phone offline for longer may bring an old item back. */
export const TOMBSTONE_DAYS = 60;
/**
 * How often the server asks the store about whoever pays for a household plan while its date is still
 * ahead: a refund or a revoked purchase ends a plan early, and nobody should stay covered for months on
 * the strength of an old answer.
 */
export const SPONSOR_RECHECK_MS = 6 * 3_600_000;
/**
 * Members whose phone has not synced for this long are dropped. Reinstalling the app gives a person a
 * new app user id, so without this their old self would stay in the household for good.
 */
export const MEMBER_IDLE_DAYS = 60;
/** A member is shown as away once they have not synced for this many days. */
export const AWAY_DAYS = 7;
/** How often a member's "last seen" is written; syncs come every half minute while the app is open. */
const SEEN_EVERY_MS = 60 * 60_000;
const DAY_MS = 86_400_000;
/**
 * A payer whose plan's end date on record has passed is kept this long before being treated as idle:
 * the plan has usually renewed, and the next check with the store will say so.
 */
const PAYER_GRACE_MS = 45 * 86_400_000;
/**
 * Used and thrown-out items are kept this long after their last change, then dropped: phones drop them
 * from their own lists after 90 days, and the household's record count must not only ever grow.
 */
export const RESOLVED_KEEP_DAYS = 100;
/** Seeing the payer again within this long does not rewrite their record. */
const SPONSOR_TOUCH_MS = 10 * 60_000;
/** A phone whose clock runs ahead cannot make its changes win forever. */
const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

export const RECORD_KINDS = ['item', 'shopping'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface SyncRecord {
  kind: RecordKind;
  id: string;
  updatedAt: number;
  deleted: boolean;
  /** The item or shopping entry; null for a deletion. */
  data: Record<string, unknown> | null;
}

export interface HouseholdView {
  name: string;
  /** Invite code, shown as XXXX-XXXX. */
  code: string;
  /**
   * `ref` names a member for removal without revealing their id; `sponsor` marks the person whose
   * household plan covers everyone; `idleDays` says how long someone has been away, once it is a week.
   */
  members: { name: string; you: boolean; ref: string; sponsor?: boolean; idleDays?: number }[];
  /** While a member's household plan covers everyone: when it runs out or renews (ms). */
  coveredUntil: number | null;
}

/** Someone in the household who pays for a household plan. */
export interface Payer {
  /** Their app user id, to ask the store again. */
  user: string;
  /** When their plan runs out or renews (ms), as the store last said. */
  until: number;
  /** When the store last said so (ms). */
  checkedAt: number;
}

/** The household plans covering a person's household: every member who pays for one, latest date first. */
export interface Coverage {
  payers: Payer[];
}

export type HouseholdErrorCode = 'not_found' | 'full' | 'already_member' | 'not_member' | 'too_many' | 'self';

export class HouseholdError extends Error {
  constructor(
    public code: HouseholdErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HouseholdError';
  }
}

export interface SyncResult {
  cursor: number;
  more: boolean;
  changes: SyncRecord[];
  household: HouseholdView;
}

export interface HouseholdStore {
  get(userId: string): HouseholdView | null;
  /**
   * Records what the store says about the person's household plan: a live one (`until` in the future)
   * covers their household; none (ended, refunded, switched) takes them off the household's payers.
   */
  sponsor(userId: string, until: number | null, now?: number): void;
  /** The cover for the person's household, or null when they are not in one. */
  coverage(userId: string): Coverage | null;
  create(userId: string, memberName: string, name: string): HouseholdView;
  join(userId: string, memberName: string, code: string): HouseholdView;
  leave(userId: string): void;
  newCode(userId: string): HouseholdView;
  /** Takes someone else out of the caller's household, by the `ref` the caller was shown. */
  remove(userId: string, memberRef: string, now?: number): HouseholdView;
  sync(userId: string, since: number, changes: SyncRecord[], now?: number): SyncResult;
  close(): void;
}

/** No I, L, O, 0 or 1: nothing to mistake when reading a code out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function newInviteCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

/** "pulse-7k3q" or "PULS E7K3" -> "PULSE7K3". */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

const memberKey = (userId: string) => createHash('sha256').update(`fp-household:${userId}`).digest('hex');
/** What other members see of someone's member key: enough to name them for removal, nothing more. */
export const memberRef = (member: string) => createHash('sha256').update(`fp-member-ref:${member}`).digest('hex').slice(0, 16);

interface HouseholdRow {
  id: string;
  name: string;
  code: string;
  seq: number;
}

const HOUSEHOLD_COLUMNS = 'h.id, h.name, h.code, h.seq';

export function createHouseholdStore(path = ':memory:'): HouseholdStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, seq INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members (member TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, name TEXT NOT NULL, joined_at INTEGER NOT NULL, last_seen INTEGER);
    CREATE TABLE IF NOT EXISTS records (
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL, data TEXT, seq INTEGER NOT NULL,
      PRIMARY KEY (household_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS records_by_seq ON records (household_id, seq);
    CREATE INDEX IF NOT EXISTS members_by_household ON members (household_id);
    -- Members who pay for a household plan. A member leaving (or being removed) takes their row along.
    CREATE TABLE IF NOT EXISTS payers (
      member TEXT PRIMARY KEY REFERENCES members(member) ON DELETE CASCADE,
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      user TEXT NOT NULL, until INTEGER NOT NULL, checked_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payers_by_household ON payers (household_id);
  `);
  const memberColumns = new Set((db.prepare('PRAGMA table_info(members)').all() as { name: string }[]).map((c) => c.name));
  if (!memberColumns.has('last_seen')) db.exec('ALTER TABLE members ADD COLUMN last_seen INTEGER');

  const q = {
    householdOf: db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM members m JOIN households h ON h.id = m.household_id WHERE m.member = ?`),
    byCode: db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM households h WHERE h.code = ?`),
    payers: db.prepare('SELECT member, user, until, checked_at FROM payers WHERE household_id = ? ORDER BY until DESC'),
    payerOf: db.prepare('SELECT user, until, checked_at FROM payers WHERE member = ?'),
    setPayer: db.prepare(
      `INSERT INTO payers (member, household_id, user, until, checked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (member) DO UPDATE SET household_id = excluded.household_id, user = excluded.user, until = excluded.until, checked_at = excluded.checked_at`,
    ),
    deletePayer: db.prepare('DELETE FROM payers WHERE member = ?'),
    members: db.prepare('SELECT member, name, COALESCE(last_seen, joined_at) AS seen FROM members WHERE household_id = ? ORDER BY joined_at, rowid'),
    seen: db.prepare('UPDATE members SET last_seen = ? WHERE member = ? AND (last_seen IS NULL OR last_seen < ?)'),
    idle: db.prepare('SELECT member FROM members WHERE household_id = ? AND COALESCE(last_seen, joined_at) < ?'),
    memberCount: db.prepare('SELECT COUNT(*) AS n FROM members WHERE household_id = ?'),
    insertHousehold: db.prepare('INSERT INTO households (id, name, code, seq, created_at) VALUES (?, ?, ?, 0, ?)'),
    insertMember: db.prepare('INSERT INTO members (member, household_id, name, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)'),
    deleteMember: db.prepare('DELETE FROM members WHERE member = ?'),
    deleteHousehold: db.prepare('DELETE FROM households WHERE id = ?'),
    setCode: db.prepare('UPDATE households SET code = ? WHERE id = ?'),
    bumpSeq: db.prepare('UPDATE households SET seq = seq + 1 WHERE id = ? RETURNING seq'),
    record: db.prepare('SELECT updated_at, deleted FROM records WHERE household_id = ? AND kind = ? AND id = ?'),
    // Deletions are kept for a while but do not count toward the cap: removing food must always work.
    recordCount: db.prepare('SELECT COUNT(*) AS n FROM records WHERE household_id = ? AND deleted = 0'),
    pruneResolved: db.prepare(
      "DELETE FROM records WHERE household_id = ? AND kind = 'item' AND deleted = 0 AND json_extract(data, '$.status') IN ('used', 'wasted') AND updated_at < ?",
    ),
    upsert: db.prepare(
      `INSERT INTO records (household_id, kind, id, updated_at, deleted, data, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (household_id, kind, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, data = excluded.data, seq = excluded.seq`,
    ),
    since: db.prepare('SELECT kind, id, updated_at, deleted, data, seq FROM records WHERE household_id = ? AND seq > ? ORDER BY seq LIMIT ?'),
    prune: db.prepare('DELETE FROM records WHERE household_id = ? AND deleted = 1 AND updated_at < ?'),
  };

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  type PayerRow = { member: string; user: string; until: number; checked_at: number };
  const payersOf = (householdId: string) => q.payers.all(householdId) as PayerRow[];

  const view = (h: HouseholdRow, me: string, now = Date.now()): HouseholdView => {
    const live = payersOf(h.id).filter((p) => p.until > now);
    const paying = new Set(live.map((p) => p.member));
    const coveredUntil = live.length > 0 ? Math.max(...live.map((p) => p.until)) : null;
    return {
      name: h.name,
      code: formatCode(h.code),
      members: (q.members.all(h.id) as { member: string; name: string; seen: number }[]).map((m) => {
        const idleDays = Math.floor((now - m.seen) / DAY_MS);
        return {
          name: m.name,
          you: m.member === me,
          ref: memberRef(m.member),
          ...(paying.has(m.member) ? { sponsor: true } : {}),
          ...(m.member !== me && idleDays >= AWAY_DAYS ? { idleDays } : {}),
        };
      }),
      coveredUntil,
    };
  };

  const mine = (userId: string): HouseholdRow | null => (q.householdOf.get(memberKey(userId)) as HouseholdRow | undefined) ?? null;

  /** Notes that the person's phone is still in use (at most hourly). */
  const touch = (userId: string, now: number) => q.seen.run(now, memberKey(userId), now - SEEN_EVERY_MS);

  /**
   * Drops members who have been away too long. Someone whose household plan still covers everyone
   * stays: they may simply not open the app, and the store checks keep that plan honest.
   */
  const dropIdle = (h: HouseholdRow, now: number) => {
    for (const { member } of q.idle.all(h.id, now - MEMBER_IDLE_DAYS * DAY_MS) as { member: string }[]) {
      // Still paying, or past the date on record but not yet re-checked with the store: kept.
      const paying = q.payerOf.get(member) as { until: number } | undefined;
      if (paying && paying.until > now - PAYER_GRACE_MS) continue;
      q.deleteMember.run(member);
    }
  };

  const uniqueCode = (): string => {
    for (let i = 0; i < 10; i += 1) {
      const code = newInviteCode();
      if (!q.byCode.get(code)) return code;
    }
    throw new Error('Could not make a unique invite code');
  };

  return {
    get: (userId) => {
      const h = mine(userId);
      if (!h) return null;
      touch(userId, Date.now());
      return view(h, memberKey(userId));
    },

    sponsor: (userId, until, now = Date.now()) => {
      const h = mine(userId);
      if (!h) return;
      const me = memberKey(userId);
      if (until == null || until <= now) {
        q.deletePayer.run(me);
        return;
      }
      const row = q.payerOf.get(me) as { user: string; until: number; checked_at: number } | undefined;
      if (row && row.user === userId && row.until === until && now - row.checked_at < SPONSOR_TOUCH_MS) return;
      q.setPayer.run(me, h.id, userId, until, now);
    },

    coverage: (userId) => {
      const h = mine(userId);
      return h ? { payers: payersOf(h.id).map((p) => ({ user: p.user, until: p.until, checkedAt: p.checked_at })) } : null;
    },

    create: (userId, memberName, name) =>
      tx(() => {
        if (mine(userId)) throw new HouseholdError('already_member', 'Leave your current household first.');
        const id = randomUUID();
        const now = Date.now();
        q.insertHousehold.run(id, name, uniqueCode(), now);
        q.insertMember.run(memberKey(userId), id, memberName, now, now);
        return view(q.householdOf.get(memberKey(userId)) as unknown as HouseholdRow, memberKey(userId));
      }),

    join: (userId, memberName, code) =>
      tx(() => {
        if (mine(userId)) throw new HouseholdError('already_member', 'Leave your current household first.');
        const h = q.byCode.get(normalizeCode(code)) as HouseholdRow | undefined;
        if (!h) throw new HouseholdError('not_found', 'No household has that code. Check it and try again.');
        const now = Date.now();
        // Someone long gone makes room.
        dropIdle(h, now);
        if ((q.memberCount.get(h.id) as { n: number }).n >= MAX_MEMBERS) throw new HouseholdError('full', `A household can have up to ${MAX_MEMBERS} people.`);
        q.insertMember.run(memberKey(userId), h.id, memberName, now, now);
        return view(mine(userId)!, memberKey(userId), now);
      }),

    leave: (userId) =>
      tx(() => {
        const h = mine(userId);
        if (!h) return;
        // Someone who leaves stops paying for the others (their payer row goes with them).
        q.deleteMember.run(memberKey(userId));
        // The last one out takes the shared lists with them.
        if ((q.memberCount.get(h.id) as { n: number }).n === 0) q.deleteHousehold.run(h.id);
      }),

    newCode: (userId) =>
      tx(() => {
        const h = mine(userId);
        if (!h) throw new HouseholdError('not_member', 'You are not in a household.');
        q.setCode.run(uniqueCode(), h.id);
        return view(mine(userId)!, memberKey(userId));
      }),

    remove: (userId, ref, now = Date.now()) =>
      tx(() => {
        const h = mine(userId);
        if (!h) throw new HouseholdError('not_member', 'You are not in a household.');
        const me = memberKey(userId);
        const target = (q.members.all(h.id) as { member: string }[]).find((m) => memberRef(m.member) === ref);
        if (!target) throw new HouseholdError('not_found', 'That person is no longer in the household.');
        if (target.member === me) throw new HouseholdError('self', 'Use Leave household to leave.');
        q.deleteMember.run(target.member);
        return view(mine(userId)!, me, now);
      }),

    sync: (userId, since, changes, now = Date.now()) =>
      tx(() => {
        const found = mine(userId);
        if (!found) throw new HouseholdError('not_member', 'You are not in a household.');
        touch(userId, now);
        dropIdle(found, now);
        // Dropping someone can take the household plan with them.
        const h = mine(userId)!;
        q.prune.run(h.id, now - TOMBSTONE_DAYS * 86_400_000);
        q.pruneResolved.run(h.id, now - RESOLVED_KEEP_DAYS * 86_400_000);
        let count = (q.recordCount.get(h.id) as { n: number }).n;
        for (const c of changes) {
          const updatedAt = Math.min(c.updatedAt, now + MAX_CLOCK_AHEAD_MS);
          const existing = q.record.get(h.id, c.kind, c.id) as { updated_at: number; deleted: number } | undefined;
          // Newest wins; a tie keeps what is there, so a phone re-sending its own change changes nothing.
          if (existing && existing.updated_at >= updatedAt) continue;
          const wasLive = !!existing && existing.deleted === 0;
          if (!c.deleted && !wasLive) {
            if (count >= MAX_RECORDS) throw new HouseholdError('too_many', 'This household has too many items to share. Clear out some old ones.');
            count += 1;
          } else if (c.deleted && wasLive) {
            count -= 1;
          }
          const seq = (q.bumpSeq.get(h.id) as { seq: number }).seq;
          q.upsert.run(h.id, c.kind, c.id, updatedAt, c.deleted ? 1 : 0, c.deleted ? null : JSON.stringify(c.data ?? {}), seq);
        }
        const rows = q.since.all(h.id, since, PAGE + 1) as { kind: RecordKind; id: string; updated_at: number; deleted: number; data: string | null; seq: number }[];
        const page = rows.slice(0, PAGE);
        const current = (db.prepare('SELECT seq FROM households WHERE id = ?').get(h.id) as { seq: number }).seq;
        return {
          cursor: page.length > 0 && rows.length > PAGE ? page[page.length - 1]!.seq : current,
          more: rows.length > PAGE,
          changes: page.map((r) => ({ kind: r.kind, id: r.id, updatedAt: r.updated_at, deleted: r.deleted === 1, data: r.data ? (JSON.parse(r.data) as Record<string, unknown>) : null })),
          household: view(h, memberKey(userId), now),
        };
      }),

    close: () => db.close(),
  };
}
