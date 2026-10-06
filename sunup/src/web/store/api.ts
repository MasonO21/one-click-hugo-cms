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
