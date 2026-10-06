// Persists the engine state, auth tokens and push subscriptions to one JSON file.
// Fine for a pilot; swap for Postgres before real scale.

import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export class Store {
  readonly service: Sunup;
  private data: FileShape;
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string, baseUrl: string) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'sunup.json');
    this.data = this.read();
    this.service = new Sunup(this.data.state, { baseUrl });
  }

  private read(): FileShape {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as FileShape;
      if (parsed?.state?.version === 1) return parsed;
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

  /** Debounced atomic write. */
  save() {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data));
    renameSync(tmp, this.file);
  }
}
