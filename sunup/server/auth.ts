// Phone-number sign-in: a 6-digit code texted to the number proves it belongs to you.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { SunupError } from '../src/shared/util';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_ATTEMPTS = 5;

interface PendingCode {
  hash: Buffer;
  expiresAt: number;
  sentAt: number;
  attempts: number;
}

function digest(code: string): Buffer {
  return createHash('sha256').update(code).digest();
}

/** In-memory one-time codes, keyed by E.164 number. Codes expire after 10 minutes. */
export class PhoneCodes {
  private codes = new Map<string, PendingCode>();

  issue(phone: string, now: number): string {
    const existing = this.codes.get(phone);
    if (existing && now - existing.sentAt < RESEND_AFTER_MS) {
      throw new SunupError('rate_limited', 'We just sent a code. Wait 30 seconds before asking for another.');
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.codes.set(phone, { hash: digest(code), expiresAt: now + CODE_TTL_MS, sentAt: now, attempts: 0 });
    if (this.codes.size > 10_000) for (const [k, v] of this.codes) if (v.expiresAt < now) this.codes.delete(k);
    return code;
  }

  /** Checks a code. A correct code is only used up when `consume` is set. */
  check(phone: string, code: unknown, now: number, consume: boolean): void {
    const pending = this.codes.get(phone);
    if (!pending || pending.expiresAt < now) {
      this.codes.delete(phone);
      throw new SunupError('code_expired', 'That code has expired. Ask for a new one.');
    }
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) throw new SunupError('invalid', 'Enter the 6-digit code from the text.');
    if (!timingSafeEqual(pending.hash, digest(code.trim()))) {
      pending.attempts++;
      if (pending.attempts >= MAX_ATTEMPTS) this.codes.delete(phone);
      throw new SunupError('code_wrong', pending.attempts >= MAX_ATTEMPTS ? 'Too many tries. Ask for a new code.' : 'That code isn\'t right. Check the text and try again.');
    }
    if (consume) this.codes.delete(phone);
  }
}
