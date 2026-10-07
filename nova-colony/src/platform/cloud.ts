/**
 * Optional cloud save over a tiny HTTP protocol, keyed by a random recovery id.
 *
 *   GET  {VITE_CLOUD_SAVE_URL}/{recoveryId}   -> 200 text body (a recovery code) | 404 when none
 *   PUT  {VITE_CLOUD_SAVE_URL}/{recoveryId}   -> 2xx on success; body = recovery code (text/plain)
 *
 * The recovery id (NOVA-XXXX-XXXX-XXXX, 60 random bits) is the player's bearer secret: it is shown in
 * Settings so a new device can enter it and pull the save. Without a configured URL the service is
 * simply unavailable and the game relies on local saves + recovery codes. OWNER: meta agent.
 */
import type { CloudSaveService, KeyValueStore } from './types';
import { env } from './env';

const ID_KEY = 'nova_recovery_id';
/** Crockford-style alphabet without look-alike characters. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const ID_RE = /^NOVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const TIMEOUT_MS = 8000;

export function generateRecoveryId(): string {
  const a = new Uint8Array(12);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  const s = [...a].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `NOVA-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function isValidRecoveryId(id: string): boolean {
  return ID_RE.test(id);
}

export class HttpCloudSave implements CloudSaveService {
  private id: string | null = null;

  constructor(
    private readonly store: KeyValueStore,
    private readonly baseUrl: string = env('VITE_CLOUD_SAVE_URL'),
    private readonly fetchImpl: typeof fetch | undefined = globalThis.fetch?.bind(globalThis),
  ) {}

  /** Load (or create) the recovery id. Only does anything when a backend URL is configured. */
  async init(): Promise<void> {
    if (!this.baseUrl) return;
    try {
      const stored = await this.store.get(ID_KEY);
      if (stored && isValidRecoveryId(stored)) this.id = stored;
      else {
        this.id = generateRecoveryId();
        await this.store.set(ID_KEY, this.id);
      }
    } catch {
      this.id = this.id ?? generateRecoveryId();
    }
  }

  available(): boolean {
    return !!this.baseUrl && !!this.id && !!this.fetchImpl;
  }

  /** The id to show in Settings ("Cloud save id"), or null when cloud saves are not configured. */
  recoveryId(): string | null {
    return this.baseUrl ? this.id : null;
  }

  /** Switch this device to another save's recovery id (restoring on a new device). */
  async setRecoveryId(id: string): Promise<boolean> {
    const clean = id.trim().toUpperCase();
    if (!this.baseUrl || !isValidRecoveryId(clean)) return false;
    this.id = clean;
    try {
      await this.store.set(ID_KEY, clean);
    } catch {
      /* kept in memory for this session */
    }
    return true;
  }

  private url(): string {
    return `${this.baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(this.id ?? '')}`;
  }

  private async request(init: RequestInit): Promise<Response | null> {
    if (!this.available()) return null;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), TIMEOUT_MS);
    try {
      return await this.fetchImpl!(this.url(), { ...init, signal: ctl?.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async upload(data: string): Promise<boolean> {
    const res = await this.request({ method: 'PUT', headers: { 'content-type': 'text/plain', 'x-nova-format': '1' }, body: data });
    return !!res && res.ok;
  }

  async download(): Promise<string | null> {
    const res = await this.request({ method: 'GET', headers: { accept: 'text/plain' } });
    if (!res || !res.ok) return null;
    const text = await res.text();
    return text.trim() || null;
  }
}
