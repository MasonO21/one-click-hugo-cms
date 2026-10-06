import type { Action } from '../../shared/service';
import type { Snapshot } from '../../shared/snapshot';
import type { Plan } from '../../shared/types';

export interface SignupInput {
  name: string;
  phone?: string;
  timezone: string;
}

export interface InviteInfo {
  name: string;
  color: string;
}

export interface DemoControls {
  addSampleCircle(): Promise<Snapshot>;
  hasSampleCircle(): boolean;
  /** Plays your own missed check-in, an hour of escalation in about 90 seconds. */
  simulateMyMiss(): Promise<Snapshot>;
  /** Plays someone you watch going quiet. */
  simulateFriendMiss(userId: string): Promise<Snapshot>;
  setPlan(plan: Plan): Promise<Snapshot>;
  reset(): void;
}

export interface CodeSent {
  sentTo: string;
  /** Only in local development without Twilio. */
  devCode?: string;
}

export interface VerifyResult {
  snapshot?: Snapshot;
  /** The code was right but there's no account for the number yet. */
  needsName?: boolean;
}

/** Phone-number sign-in (server mode only). */
export interface PhoneAuth {
  start(phone: string): Promise<CodeSent>;
  verify(input: { phone: string; code: string; name?: string; timezone?: string }): Promise<VerifyResult>;
}

/** Subscriptions through the server's payment provider (server mode, when configured). */
export interface BillingApi {
  /** Sends the browser to Checkout. */
  checkout(interval: 'month' | 'year'): Promise<void>;
  /** Sends the browser to the subscription settings page. */
  portal(): Promise<void>;
}

export interface Api {
  mode: 'demo' | 'server';
  /** The current snapshot, or null when there's no account on this device yet. */
  load(): Promise<Snapshot | null>;
  signup(input: SignupInput): Promise<Snapshot>;
  act(action: Action): Promise<Snapshot>;
  invite(code: string): Promise<InviteInfo | null>;
  inviteUrl(code: string): string;
  /** Resolves a photo reference from a snapshot to something an <img> can show. */
  photo(ref: string): Promise<string>;
  /** Called with a fresh snapshot whenever the data changes in the background. */
  watch(listener: (snap: Snapshot) => void): () => void;
  enablePush(): Promise<'granted' | 'denied' | 'unsupported'>;
  signOut(): void;
  /** Everything Sunup stores about you, as a JSON file. */
  exportData(): Promise<Blob>;
  /** Erases the account (cancelling any subscription) and returns to the welcome screen. */
  deleteAccount(): Promise<void>;
  auth?: PhoneAuth;
  billing?: BillingApi;
  demo?: DemoControls;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
