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
  /** `sponsor` marks the person whose household plan covers everyone. */
  members: { name: string; you: boolean; sponsor?: boolean }[];
  /** While a member's household plan covers everyone: when it runs out or renews (ms). */
  coveredUntil: number | null;
}

/** Whose household plan covers a person's household, and until when. */
export interface Coverage {
  /** When the plan runs out or renews (ms), or null when no plan is on record. */
  until: number | null;
  /** The app user id of the person who pays, to ask the store again once `until` has passed. */
  sponsorUser: string | null;
}

export type HouseholdErrorCode = 'not_found' | 'full' | 'already_member' | 'not_member' | 'too_many';

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
   * covers their household, unless another member's runs for longer; none ends their cover.
   */
  sponsor(userId: string, until: number | null, now?: number): void;
  /** The cover for the person's household, or null when they are not in one. */
  coverage(userId: string): Coverage | null;
  create(userId: string, memberName: string, name: string): HouseholdView;
  join(userId: string, memberName: string, code: string): HouseholdView;
  leave(userId: string): void;
  newCode(userId: string): HouseholdView;
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

interface HouseholdRow {
  id: string;
  name: string;
  code: string;
  seq: number;
  sponsor_member: string | null;
  sponsor_user: string | null;
  sponsor_until: number | null;
}

const HOUSEHOLD_COLUMNS = 'h.id, h.name, h.code, h.seq, h.sponsor_member, h.sponsor_user, h.sponsor_until';

export function createHouseholdStore(path = ':memory:'): HouseholdStore {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS households (id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, seq INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members (member TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE, name TEXT NOT NULL, joined_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records (
      household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, id TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL, data TEXT, seq INTEGER NOT NULL,
      PRIMARY KEY (household_id, kind, id)
    );
    CREATE INDEX IF NOT EXISTS records_by_seq ON records (household_id, seq);
    CREATE INDEX IF NOT EXISTS members_by_household ON members (household_id);
  `);
  // Added with the household plans; older databases get the columns on start.
  const columns = new Set((db.prepare('PRAGMA table_info(households)').all() as { name: string }[]).map((c) => c.name));
  for (const [name, type] of [
    ['sponsor_member', 'TEXT'],
    ['sponsor_user', 'TEXT'],
    ['sponsor_until', 'INTEGER'],
  ] as const) {
    if (!columns.has(name)) db.exec(`ALTER TABLE households ADD COLUMN ${name} ${type}`);
  }

  const q = {
    householdOf: db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM members m JOIN households h ON h.id = m.household_id WHERE m.member = ?`),
    byCode: db.prepare(`SELECT ${HOUSEHOLD_COLUMNS} FROM households h WHERE h.code = ?`),
    setSponsor: db.prepare('UPDATE households SET sponsor_member = ?, sponsor_user = ?, sponsor_until = ? WHERE id = ?'),
    members: db.prepare('SELECT member, name FROM members WHERE household_id = ? ORDER BY joined_at, rowid'),
    memberCount: db.prepare('SELECT COUNT(*) AS n FROM members WHERE household_id = ?'),
    insertHousehold: db.prepare('INSERT INTO households (id, name, code, seq, created_at) VALUES (?, ?, ?, 0, ?)'),
    insertMember: db.prepare('INSERT INTO members (member, household_id, name, joined_at) VALUES (?, ?, ?, ?)'),
    deleteMember: db.prepare('DELETE FROM members WHERE member = ?'),
    deleteHousehold: db.prepare('DELETE FROM households WHERE id = ?'),
    setCode: db.prepare('UPDATE households SET code = ? WHERE id = ?'),
    bumpSeq: db.prepare('UPDATE households SET seq = seq + 1 WHERE id = ? RETURNING seq'),
    record: db.prepare('SELECT updated_at FROM records WHERE household_id = ? AND kind = ? AND id = ?'),
    recordCount: db.prepare('SELECT COUNT(*) AS n FROM records WHERE household_id = ?'),
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

  const view = (h: HouseholdRow, me: string, now = Date.now()): HouseholdView => {
    const coveredUntil = h.sponsor_until != null && h.sponsor_until > now ? h.sponsor_until : null;
    return {
      name: h.name,
      code: formatCode(h.code),
      members: (q.members.all(h.id) as { member: string; name: string }[]).map((m) => ({
        name: m.name,
        you: m.member === me,
        ...(coveredUntil && m.member === h.sponsor_member ? { sponsor: true } : {}),
      })),
      coveredUntil,
    };
  };

  const mine = (userId: string): HouseholdRow | null => (q.householdOf.get(memberKey(userId)) as HouseholdRow | undefined) ?? null;

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
      return h ? view(h, memberKey(userId)) : null;
    },

    sponsor: (userId, until, now = Date.now()) => {
      const h = mine(userId);
      if (!h) return;
      const me = memberKey(userId);
      const live = until != null && until > now;
      if (live) {
        // Another member's plan that runs for longer keeps the household; otherwise this one does.
        const other = h.sponsor_member != null && h.sponsor_member !== me && h.sponsor_until != null && h.sponsor_until >= until;
        if (other || (h.sponsor_member === me && h.sponsor_user === userId && h.sponsor_until === until)) return;
        q.setSponsor.run(me, userId, until, h.id);
      } else if (h.sponsor_member === me) {
        q.setSponsor.run(null, null, null, h.id);
      }
    },

    coverage: (userId) => {
      const h = mine(userId);
      return h ? { until: h.sponsor_until, sponsorUser: h.sponsor_user } : null;
    },

    create: (userId, memberName, name) =>
      tx(() => {
        if (mine(userId)) throw new HouseholdError('already_member', 'Leave your current household first.');
        const id = randomUUID();
        const now = Date.now();
        q.insertHousehold.run(id, name, uniqueCode(), now);
        q.insertMember.run(memberKey(userId), id, memberName, now);
        return view(q.householdOf.get(memberKey(userId)) as unknown as HouseholdRow, memberKey(userId));
      }),

    join: (userId, memberName, code) =>
      tx(() => {
        if (mine(userId)) throw new HouseholdError('already_member', 'Leave your current household first.');
        const h = q.byCode.get(normalizeCode(code)) as HouseholdRow | undefined;
        if (!h) throw new HouseholdError('not_found', 'No household has that code. Check it and try again.');
        if ((q.memberCount.get(h.id) as { n: number }).n >= MAX_MEMBERS) throw new HouseholdError('full', `A household can have up to ${MAX_MEMBERS} people.`);
        q.insertMember.run(memberKey(userId), h.id, memberName, Date.now());
        return view(h, memberKey(userId));
      }),

    leave: (userId) =>
      tx(() => {
        const h = mine(userId);
        if (!h) return;
        // Someone who leaves stops paying for the others.
        if (h.sponsor_member === memberKey(userId)) q.setSponsor.run(null, null, null, h.id);
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

    sync: (userId, since, changes, now = Date.now()) =>
      tx(() => {
        const h = mine(userId);
        if (!h) throw new HouseholdError('not_member', 'You are not in a household.');
        q.prune.run(h.id, now - TOMBSTONE_DAYS * 86_400_000);
        let count = (q.recordCount.get(h.id) as { n: number }).n;
        for (const c of changes) {
          const updatedAt = Math.min(c.updatedAt, now + MAX_CLOCK_AHEAD_MS);
          const existing = q.record.get(h.id, c.kind, c.id) as { updated_at: number } | undefined;
          // Newest wins; a tie keeps what is there, so a phone re-sending its own change changes nothing.
          if (existing && existing.updated_at >= updatedAt) continue;
          if (!existing) {
            if (count >= MAX_RECORDS) throw new HouseholdError('too_many', 'This household has too many items to share. Clear out some old ones.');
            count += 1;
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
