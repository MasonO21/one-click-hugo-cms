import { daysBetween, todayISO } from './dates';
import { daysLeft, sortByExpiry } from './expiry';
import { uniqueUses } from './meals';
import { demoMeals, demoScan } from './demo';
import { newId } from './scan';
import type { Meal, MealPrefs, PantryItem, ScanResponse, StorageLocation } from './types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';

/** True when no backend is configured: scanning returns sample data and meals are local. */
export const isDemoMode = BASE_URL === '';

export type ApiErrorCode =
  | 'payment_required'
  | 'rate_limited'
  | 'refused'
  | 'bad_request'
  | 'unavailable'
  | 'network'
  | 'bad_response';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(path: string, userId: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // The caller can cancel too (the person tapped Cancel or left the screen).
  signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('network', 'Could not reach Fridge Pulse. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON error bodies fall through to status handling below.
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    const message = err?.message ?? 'Something went wrong. Please try again.';
    if (res.status === 402 || res.status === 401 || res.status === 403) throw new ApiError('payment_required', message);
    if (res.status === 429) throw new ApiError('rate_limited', message);
    if (res.status === 422) throw new ApiError('refused', message);
    if (res.status === 400 || res.status === 413) throw new ApiError('bad_request', message);
    throw new ApiError('unavailable', message);
  }
  if (json == null) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return json as T;
}

export interface ScanRequest {
  userId: string;
  location: StorageLocation;
  /** Base64 JPEG data, no data-URL prefix. */
  images: string[];
  signal?: AbortSignal;
}

export async function scanPhotos({ userId, location, images, signal }: ScanRequest): Promise<ScanResponse> {
  if (isDemoMode) return demoScan(location);
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const res = await post<Partial<ScanResponse>>(
    '/v1/scan',
    userId,
    {
      location,
      today: todayISO(),
      locale,
      images: images.map((data) => ({ mediaType: 'image/jpeg', data })),
    },
    90_000,
    signal,
  );
  if (!Array.isArray(res.items)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return { items: res.items, notes: res.notes ?? null };
}

export interface MealsRequest {
  userId: string;
  items: PantryItem[];
  prefs: MealPrefs;
  /** Titles to avoid, so "more ideas" returns something new. */
  exclude?: string[];
}

interface RawMeal {
  title?: unknown;
  summary?: unknown;
  minutes?: unknown;
  servings?: unknown;
  uses?: unknown;
  extras?: unknown;
  steps?: unknown;
}

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, max) : [];

/** The server accepts at most this many ingredients per request (server/src/schemas.ts). */
export const MAX_MEAL_ITEMS = 80;

export async function fetchMeals({ userId, items: all, prefs, exclude = [] }: MealsRequest): Promise<Meal[]> {
  if (isDemoMode) return demoMeals(all, prefs);
  const now = new Date();
  // The soonest to expire matter most; a very full pantry must not make every request fail.
  const items = sortByExpiry(all).slice(0, MAX_MEAL_ITEMS);
  const res = await post<{ meals?: RawMeal[] }>(
    '/v1/meals',
    userId,
    {
      today: todayISO(now),
      diet: prefs.diet,
      servings: prefs.servings,
      exclude,
      items: items.map((i) => ({
        name: i.name,
        category: i.category,
        quantity: i.quantity,
        daysLeft: daysLeft(i, now),
      })),
    },
    60_000,
  );
  if (!Array.isArray(res.meals)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return res.meals
    .filter((m) => typeof m.title === 'string' && m.title.trim() !== '')
    .map((m) => ({
      id: `ai-${newId()}`,
      title: String(m.title),
      summary: typeof m.summary === 'string' ? m.summary : '',
      minutes: typeof m.minutes === 'number' && m.minutes > 0 ? Math.round(m.minutes) : 30,
      servings: typeof m.servings === 'number' && m.servings > 0 ? Math.round(m.servings) : prefs.servings,
      uses: uniqueUses(strings(m.uses, 12)),
      extras: strings(m.extras, 15),
      steps: strings(m.steps, 12),
      source: 'ai' as const,
    }));
}

export function friendlyError(e: unknown): { message: string; paywall: boolean } {
  if (e instanceof ApiError) {
    if (e.code === 'bad_request') return { message: 'That request could not be processed. Check your items and try again.', paywall: false };
    return { message: e.message, paywall: e.code === 'payment_required' };
  }
  return { message: 'Something went wrong. Please try again.', paywall: false };
}

// Re-exported for screens that only need the day count.
export { daysBetween };
