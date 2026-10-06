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

/** A phone running the iOS or Android app. */
export interface NativeDevice {
  token: string;
  platform: 'ios' | 'android';
}

interface FileShape {
  state: State;
  /** sha256(token) -> user id */
  tokens: Record<string, Id>;
  push: Record<Id, PushSubscriptionRecord[]>;
  /** Native app push tokens per user. */
  native?: Record<Id, NativeDevice[]>;
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

  constructor(
    dataDir: string,
    baseUrl: string,
    dataKey?: string,
    private log: (line: string) => void = (line) => console.error(line),
  ) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'sunup.json');
    this.photosDir = join(dataDir, 'photos');
    mkdirSync(this.photosDir, { recursive: true });
    this.key = loadKey(dataDir, dataKey);
    this.data = this.read();
    this.service = new Sunup(this.data.state, { baseUrl });
  }

  private read(): FileShape {
    let raw: string | null = null;
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (raw !== null) {
      // Never start over on top of a file we don't understand: that would erase everyone.
      let parsed: FileShape;
      try {
        parsed = JSON.parse(raw) as FileShape;
      } catch {
        throw new Error(`${this.file} isn't valid JSON. Restore it from a backup; Sunup won't overwrite it.`);
      }
      if (parsed?.state?.version !== 1) {
        throw new Error(`${this.file} has an unknown format (state version ${String(parsed?.state?.version)}). Sunup won't overwrite it.`);
      }
      if (parsed.sealedPackets) {
        parsed.state.packets = JSON.parse(this.open(parsed.sealedPackets));
        delete parsed.sealedPackets;
      }
      return parsed;
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
    if (this.data.native) delete this.data.native[userId];
    this.save();
  }

  nativeDevices(userId: Id): NativeDevice[] {
    return this.data.native?.[userId] ?? [];
  }

  /** Like web push, a device token belongs to whoever registered it last. */
  addNativeDevice(userId: Id, device: NativeDevice) {
    const all = (this.data.native ??= {});
    for (const [id, list] of Object.entries(all)) all[id] = list.filter((d) => d.token !== device.token);
    all[userId] = [...(all[userId] ?? []), device].slice(-5);
    this.save();
  }

  removeNativeDevice(userId: Id, token: string) {
    if (!this.data.native?.[userId]) return;
    this.data.native[userId] = this.data.native[userId].filter((d) => d.token !== token);
    this.save();
  }

  subscriptions(userId: Id): PushSubscriptionRecord[] {
    return this.data.push[userId] ?? [];
  }

  addSubscription(userId: Id, sub: PushSubscriptionRecord) {
    // A push endpoint is one browser on one device: it belongs to whoever subscribed last,
    // so someone else's alerts never land on a shared phone after they sign out.
    for (const [id, list] of Object.entries(this.data.push)) {
      this.data.push[id] = list.filter((s) => s.endpoint !== sub.endpoint);
    }
    const list = this.data.push[userId] ?? [];
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

  /**
   * Moves new check-in photos out of the state into files, leaving a "file:<ext>:<version>"
   * reference. Each upload gets a new version, so a replaced photo gets a new URL.
   */
  externalizePhotos() {
    let moved = false;
    for (const c of this.data.state.checkIns) {
      const m = c.photo && /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(c.photo);
      if (!m) continue;
      const ext = PHOTO_TYPES[m[1]];
      const version = randomBytes(4).toString('hex');
      writeFileSync(join(this.photosDir, `${c.id}.${version}.${ext}`), Buffer.from(m[2], 'base64'));
      c.photo = `file:${ext}:${version}`;
      moved = true;
    }
    if (moved) this.save();
  }

  /** The URL a client fetches a stored photo from (changes whenever the photo does). */
  static photoUrl(checkInId: string, ref: string): string {
    const version = ref.split(':')[2];
    return `/api/photos/${checkInId}${version ? `?v=${version}` : ''}`;
  }

  private photoFile(checkInId: string, ref: string): string | null {
    const m = /^file:(jpg|png|webp)(?::([0-9a-f]{8}))?$/.exec(ref);
    if (!m || !/^k_[a-z0-9]+$/.test(checkInId)) return null;
    return m[2] ? `${checkInId}.${m[2]}.${m[1]}` : `${checkInId}.${m[1]}`;
  }

  /** A stored photo's bytes and type, or null. */
  readPhoto(checkInId: string, ref: string): { type: string; bytes: Buffer } | null {
    const name = this.photoFile(checkInId, ref);
    if (!name) return null;
    try {
      return { type: CONTENT_TYPES[name.split('.').pop()!], bytes: readFileSync(join(this.photosDir, name)) };
    } catch {
      return null;
    }
  }

  /** Deletes photo files whose check-in was edited, pruned or deleted. */
  sweepPhotos() {
    const keep = new Set(
      this.data.state.checkIns
        .map((c) => (c.photo ? this.photoFile(c.id, c.photo) : null))
        .filter((name): name is string => !!name),
    );
    for (const name of readdirSync(this.photosDir)) if (!keep.has(name)) unlinkSync(join(this.photosDir, name));
  }

  /** Debounced atomic write. A failed write is logged and retried, never fatal: the alert clock must keep running. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      try {
        this.flush();
      } catch (e) {
        this.timer = null;
        this.log(`[store] save failed, retrying in 5s: ${String(e)}`);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.save();
        }, 5000);
      }
    }, 300);
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
