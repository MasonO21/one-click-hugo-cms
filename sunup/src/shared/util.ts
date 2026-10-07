export class SunupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SunupError';
  }
}

export function fail(code: string, message: string): never {
  throw new SunupError(code, message);
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomId(length = 16): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const COLORS = ['#F2705E', '#E89A1C', '#6F8EF0', '#2FA594', '#B072EA', '#E86AA0', '#3FA6DB', '#7FAF3A'];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Trimmed text with control characters removed, or a validation error. */
export function cleanText(value: unknown, max: number, label: string, required = false): string {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail('invalid', `${label} must be text.`);
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !text) fail('invalid', `${label} is required.`);
  if (text.length > max) fail('invalid', `${label} must be ${max} characters or fewer.`);
  return text;
}

/** A person's name. Names go out in texts to other people, so they can't carry links. */
export function cleanName(value: unknown, label = 'Name'): string {
  const name = cleanText(value, 40, label, true);
  if (/https?:|www\.|[\w-]\.(com|net|org|ly|io|co|me|app|link|xyz|info|biz|gl|gd|to|ru|cn|tk|us|site|online|click)\b|[<>@/\\]/i.test(name)) {
    fail('invalid', `${label} can't contain links or symbols like @ and /.`);
  }
  return name;
}

/** Normalizes a phone number to E.164. Bare 10-digit numbers are treated as US numbers. */
export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') fail('invalid', 'Phone number must be text.');
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  let e164: string;
  if (trimmed.startsWith('+')) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith('1')) e164 = `+${digits}`;
  else fail('invalid', 'Enter a phone number with area code, like (555) 123-4567.');
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) fail('invalid', 'That phone number doesn\'t look right.');
  return e164;
}

export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function formatClock(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(ts);
}

export function formatHM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? '1 hour' : `${h} hours`;
  return `${h}h ${m}m`;
}
