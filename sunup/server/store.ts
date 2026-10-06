// Persists the engine state, auth tokens and push subscriptions to one JSON file,
// with "If I go dark" packets encrypted and photos kept as separate files.
// Fine for a pilot; swap for Postgres before real scale.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import { Sunup } from '../src/shared/service';
import { emptyState, type Id, type State } from '../src/shared/types';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface FileShape {
  state: State;
  /** sha256(token) -> user id */
  tokens: Record<string, Id>;
  push: Record<Id, PushSubscriptionRecord[]>;
  vapid: { publicKey: string; privateKey: string };
  /** state.packets, encrypted with AES-256-GCM. On disk, state.packets is always empty. */
  sealedPackets?: { iv: string; tag: string; data: string };
}

const PHOTO_TYPES: Record<string, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** The 32-byte data key: from SUNUP_DATA_KEY (base64), or generated once next to the data. */
function loadKey(dataDir: string, provided?: string): Buffer {
  if (provided) {
    const key = Buffer.from(provided, 'base64');
    if (key.length !== 32) throw new Error('SUNUP_DATA_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).');
    return key;
  }
  const file = join(dataDir, 'data.key');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  return key;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class Store {
  readonly service: Sunup;
  private data: FileShape;
  private file: string;
  private photosDir: string;
  private key: Buffer;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, baseUrl: string, dataKey?: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'sunup.json');
    this.photosDir = join(dataDir, 'photos');
    mkdirSync(this.photosDir, { recursive: true });
    this.key = loadKey(dataDir, dataKey);
    this.data = this.read();
    this.service = new Sunup(this.data.state, { baseUrl });
  }

  private read(): FileShape {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as FileShape;
      if (parsed?.state?.version === 1) {
        if (parsed.sealedPackets) {
          parsed.state.packets = JSON.parse(this.open(parsed.sealedPackets));
          delete parsed.sealedPackets;
        }
        return parsed;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const vapid = webpush.generateVAPIDKeys();
    const fresh: FileShape = { state: emptyState(), tokens: {}, push: {}, vapid };
    writeFileSync(this.file, JSON.stringify(fresh));
    return fresh;
  }

  get vapid() {
    return this.data.vapid;
  }

  issueToken(userId: Id): string {
    const token = randomBytes(24).toString('base64url');
    this.data.tokens[hashToken(token)] = userId;
    this.save();
    return token;
  }

  revokeToken(token: string) {
    delete this.data.tokens[hashToken(token)];
    this.save();
  }

  userForToken(token: string): Id | undefined {
    const id = this.data.tokens[hashToken(token)];
    return id && this.data.state.users[id] ? id : undefined;
  }

  /** Signs a deleted user out everywhere and drops their push subscriptions. */
  forgetUser(userId: Id) {
    for (const [hash, id] of Object.entries(this.data.tokens)) if (id === userId) delete this.data.tokens[hash];
    delete this.data.push[userId];
    this.save();
  }

  subscriptions(userId: Id): PushSubscriptionRecord[] {
    return this.data.push[userId] ?? [];
  }

  addSubscription(userId: Id, sub: PushSubscriptionRecord) {
    const list = (this.data.push[userId] ?? []).filter((s) => s.endpoint !== sub.endpoint);
    list.push(sub);
    this.data.push[userId] = list.slice(-5);
    this.save();
  }

  removeSubscription(userId: Id, endpoint: string) {
    this.data.push[userId] = (this.data.push[userId] ?? []).filter((s) => s.endpoint !== endpoint);
    this.save();
  }

  private seal(text: string): FileShape['sealedPackets'] {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  }

  private open(sealed: NonNullable<FileShape['sealedPackets']>): string {
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Could not decrypt the saved packets: the data key (SUNUP_DATA_KEY or data.key) does not match the one they were saved with.');
    }
  }

  // ---------------------------------------------------------------- photos

  /** Moves new check-in photos out of the state into files, leaving a "file:<ext>" reference. */
  externalizePhotos() {
    let moved = false;
    for (const c of this.data.state.checkIns) {
      const m = c.photo && /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(c.photo);
      if (!m) continue;
      const ext = PHOTO_TYPES[m[1]];
      writeFileSync(join(this.photosDir, `${c.id}.${ext}`), Buffer.from(m[2], 'base64'));
      c.photo = `file:${ext}`;
      moved = true;
    }
    if (moved) this.save();
  }

  /** A stored photo's bytes and type, or null. */
  readPhoto(checkInId: string, ref: string): { type: string; bytes: Buffer } | null {
    const ext = /^file:(jpg|png|webp)$/.exec(ref)?.[1];
    if (!ext || !/^k_[a-z0-9]+$/.test(checkInId)) return null;
    try {
      return { type: CONTENT_TYPES[ext], bytes: readFileSync(join(this.photosDir, `${checkInId}.${ext}`)) };
    } catch {
      return null;
    }
  }

  /** Deletes photo files whose check-in was edited, pruned or deleted. */
  sweepPhotos() {
    const keep = new Set(this.data.state.checkIns.filter((c) => c.photo?.startsWith('file:')).map((c) => `${c.id}.${c.photo!.slice(5)}`));
    for (const name of readdirSync(this.photosDir)) if (!keep.has(name)) unlinkSync(join(this.photosDir, name));
  }

  /** Debounced atomic write. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const onDisk: FileShape = {
      ...this.data,
      state: { ...this.data.state, packets: {} },
      sealedPackets: this.seal(JSON.stringify(this.data.state.packets)),
    };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(onDisk), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
