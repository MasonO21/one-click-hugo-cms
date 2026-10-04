import { daysBetween, todayISO } from './dates';
import { daysLeft, sortByExpiry } from './expiry';
import { uniqueUses } from './meals';
import { demoIdentify, demoMeals, demoReceipt, demoScan } from './demo';
import { toCandidates } from './identify';
import { newId } from './scan';
import { toMealNutrition } from './nutrition';
import type { Category, FoodCandidate, Meal, MealPrefs, PantryItem, ScanMode, ScanResponse, StorageLocation } from './types';

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
  | 'not_found'
  | 'conflict'
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

async function post<T>(path: string, userId: string, body: unknown, timeoutMs: number, signal?: AbortSignal, method: 'POST' | 'GET' = 'POST'): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // The caller can cancel too (the person tapped Cancel or left the screen).
  signal?.addEventListener('abort', () => controller.abort());
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userId}` },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
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
    if (res.status === 404) throw new ApiError('not_found', message);
    if (res.status === 409) throw new ApiError('conflict', message);
    if (res.status === 400 || res.status === 413) throw new ApiError('bad_request', message);
    throw new ApiError('unavailable', message);
  }
  if (json == null) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return json as T;
}

export interface ScanRequest {
  userId: string;
  /** Shelf photos (default) or a shopping receipt. */
  mode?: ScanMode;
  location: StorageLocation;
  /** Base64 JPEG data, no data-URL prefix. */
  images: string[];
  /** Foods the person has taught the app, so the scan can name them. */
  known?: { name: string; looks: string | null }[];
  signal?: AbortSignal;
}

export async function scanPhotos({ userId, mode = 'shelf', location, images, known = [], signal }: ScanRequest): Promise<ScanResponse> {
  if (isDemoMode) return mode === 'receipt' ? demoReceipt(known) : demoScan(location, known);
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const res = await post<Partial<ScanResponse>>(
    '/v1/scan',
    userId,
    {
      ...(mode === 'receipt' ? { mode } : {}),
      location,
      today: todayISO(),
      locale,
      images: images.map((data) => ({ mediaType: 'image/jpeg', data })),
      ...(known.length > 0 ? { known } : {}),
    },
    90_000,
    signal,
  );
  if (!Array.isArray(res.items)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return {
    items: res.items,
    notes: res.notes ?? null,
    purchaseDate: typeof res.purchaseDate === 'string' ? res.purchaseDate : null,
    currency: typeof res.currency === 'string' ? res.currency : null,
  };
}

export interface IdentifyRequest {
  userId: string;
  name: string;
  category: Category;
  location: StorageLocation;
  clue?: string;
  /** Base64 JPEG of the photo the item was seen in, if there is one. */
  image?: string;
  signal?: AbortSignal;
}

/**
 * Looks an unrecognised item up online: the server checks the photo, searches the web for the
 * exact product and finds a picture of it. An empty list means no confident match.
 */
export async function identifyFood({ userId, name, category, location, clue, image, signal }: IdentifyRequest): Promise<FoodCandidate[]> {
  if (isDemoMode) return toCandidates(await demoIdentify(name, clue, signal), true);
  const res = await post<unknown>(
    '/v1/identify',
    userId,
    {
      name: name.slice(0, 80),
      category,
      location,
      ...(clue ? { clue: clue.slice(0, 300) } : {}),
      today: todayISO(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      ...(image ? { image: { mediaType: 'image/jpeg', data: image } } : {}),
    },
    // Web searches take a while.
    120_000,
    signal,
  );
  if (!Array.isArray((res as { candidates?: unknown } | null)?.candidates)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return toCandidates(res);
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
  nutrition?: unknown;
}

const strings = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').slice(0, max) : [];

/** The server accepts at most this many ingredients per request (server/src/schemas.ts). */
export const MAX_MEAL_ITEMS = 80;

export async function fetchMeals({ userId, items: all, prefs, exclude = [] }: MealsRequest): Promise<Meal[]> {
  if (isDemoMode) return demoMeals(all, prefs, exclude);
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
      nutrition: toMealNutrition(m.nutrition),
    }));
}

// ---------------------------------------------------------------------------
// Shared households (server/src/household.ts). Demo mode never calls these.
// ---------------------------------------------------------------------------

export interface HouseholdView {
  name: string;
  code: string;
  members: { name: string; you: boolean }[];
}

export interface SyncRecord {
  kind: 'item' | 'shopping';
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: Record<string, unknown> | null;
}

export interface SyncResponse {
  cursor: number;
  more: boolean;
  changes: SyncRecord[];
  household: HouseholdView;
}

function householdOf(res: unknown): HouseholdView | null {
  const h = (res as { household?: unknown } | null)?.household;
  if (h === null) return null;
  const v = h as Partial<HouseholdView> | undefined;
  if (!v || typeof v.name !== 'string' || typeof v.code !== 'string' || !Array.isArray(v.members)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return {
    name: v.name.slice(0, 40),
    code: v.code.slice(0, 12),
    members: v.members
      .filter((m): m is { name: string; you: boolean } => !!m && typeof (m as { name?: unknown }).name === 'string')
      .map((m) => ({ name: m.name.slice(0, 40), you: m.you === true })),
  };
}

export async function getHousehold(userId: string): Promise<HouseholdView | null> {
  return householdOf(await post<unknown>('/v1/household', userId, null, 20_000, undefined, 'GET'));
}

export async function createHousehold(userId: string, name: string, memberName: string): Promise<HouseholdView> {
  const h = householdOf(await post<unknown>('/v1/household', userId, { name, memberName }, 20_000));
  if (!h) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return h;
}

export async function joinHousehold(userId: string, code: string, memberName: string): Promise<HouseholdView> {
  const h = householdOf(await post<unknown>('/v1/household/join', userId, { code, memberName }, 20_000));
  if (!h) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return h;
}

export async function leaveHousehold(userId: string): Promise<void> {
  await post<unknown>('/v1/household/leave', userId, {}, 20_000);
}

export async function newHouseholdCode(userId: string): Promise<HouseholdView> {
  const h = householdOf(await post<unknown>('/v1/household/code', userId, {}, 20_000));
  if (!h) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return h;
}

export async function syncHousehold(userId: string, since: number, changes: SyncRecord[]): Promise<SyncResponse> {
  const res = await post<Partial<SyncResponse>>('/v1/household/sync', userId, { since, changes }, 30_000);
  const household = householdOf(res);
  if (!household || typeof res.cursor !== 'number' || !Array.isArray(res.changes)) throw new ApiError('bad_response', 'Unexpected response from the server.');
  return { cursor: res.cursor, more: res.more === true, changes: res.changes, household };
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
