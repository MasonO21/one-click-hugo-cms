import { FOOD_CATALOG } from './foodCatalog';
import { guessCategory } from './shelfLife';
import type { Category, PantryItem, StorageLocation } from './types';

/** Something the person has added before, most frequent first. */
export interface HistoryFood {
  name: string;
  category: Category;
  /** How many times it was added (tracked items plus recent used or thrown-away ones). */
  count: number;
  /** Most recent `addedOn`, YYYY-MM-DD. */
  lastAdded: string;
}

/** A food the person taught the app from an online lookup (src/store/foods.ts). */
export interface TaughtFood {
  name: string;
  category: Category;
  imageUrl: string | null;
}

export interface FoodSuggestion {
  name: string;
  category: Category;
  fromHistory: boolean;
  /** One of the person's own taught foods. */
  taught?: boolean;
  /** Its product picture, when it has one. */
  imageUrl?: string;
  /** Set for foods that belong somewhere specific whatever list they are added to (ice cream: freezer). */
  keptIn?: StorageLocation;
  /** Character ranges [start, end) of `name` that match what was typed, for highlighting. */
  matches: [number, number][];
}

export interface SuggestOptions {
  history?: HistoryFood[];
  taught?: TaughtFood[];
  /** Names already in the list being built; they are not suggested again. */
  exclude?: string[];
  limit?: number;
}

const SUGGESTION_LIMIT = 5;

/**
 * Lowercases and strips accents one character at a time, so indexes in the result line up with
 * the original string (needed to highlight the matching part of a name).
 */
export function fold(s: string): string {
  let out = '';
  for (const ch of s) {
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Keep one output unit per input unit; the rare characters that fold to more are kept as-is.
    out += base.length === ch.length ? base : ch;
  }
  return out;
}

function tidyQuery(q: string): string {
  return fold(q).trim().replace(/\s+/g, ' ');
}

// Apostrophes join a word, so "Grandma's" does not have a word starting with "s".
const isWordChar = (ch: string | undefined) => ch !== undefined && /[\p{L}\p{N}'’]/u.test(ch);

function wordStarts(folded: string): number[] {
  const starts: number[] = [];
  for (let i = 0; i < folded.length; i += 1) {
    if (isWordChar(folded[i]) && !isWordChar(folded[i - 1])) starts.push(i);
  }
  return starts;
}

/**
 * Each typed word must start a word of the name, in order: "gr yo" finds "Greek yogurt",
 * "milk" finds "Oat milk". Returns the matched ranges, or null.
 */
function matchWordPrefixes(folded: string, starts: number[], tokens: string[]): [number, number][] | null {
  const ranges: [number, number][] = [];
  let from = 0;
  for (const token of tokens) {
    const at = starts.findIndex((s, idx) => idx >= from && folded.startsWith(token, s));
    if (at === -1) return null;
    ranges.push([starts[at], starts[at] + token.length]);
    from = at + 1;
  }
  return ranges;
}

/**
 * Smallest edit distance between `query` and any prefix of `target`, counting a swap of two
 * neighbouring letters as one edit. "brocoli" is 1 away from "broccoli".
 */
export function prefixDistance(query: string, target: string): number {
  const n = query.length;
  const m = target.length;
  // rows[i][j] = distance between query[0..i) and target[0..j)
  const rows: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const row = new Array<number>(m + 1).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= m; j += 1) rows[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = query[i - 1] === target[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && query[i - 1] === target[j - 2] && query[i - 2] === target[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1);
      }
      rows[i][j] = best;
    }
  }
  return Math.min(...rows[n]);
}

// Lower is better.
const EXACT = 0;
const START = 1; // the name starts with what was typed
const WORD = 2; // a later word starts with it
const INSIDE = 3; // it appears inside a word ("berr" in "Blueberries")
const TYPO = 4;

interface Candidate {
  name: string;
  category: Category;
  history: HistoryFood | null;
  staple: boolean;
  keptIn?: StorageLocation;
  taught?: TaughtFood;
}

interface Scored extends Candidate {
  kind: number;
  matches: [number, number][];
}

function score(c: Candidate, query: string, tokens: string[]): Scored | null {
  const folded = fold(c.name);
  if (folded.trim().replace(/\s+/g, ' ') === query) return { ...c, kind: EXACT, matches: [[0, c.name.length]] };
  if (folded.startsWith(query)) return { ...c, kind: START, matches: [[0, query.length]] };
  const starts = wordStarts(folded);
  const words = matchWordPrefixes(folded, starts, tokens);
  if (words) return { ...c, kind: words[0][0] === 0 ? START : WORD, matches: words };
  // Short fragments inside words are mostly noise ("ice" in "rice"); longer ones help ("berr" in "blueberries").
  if (query.length >= 4) {
    const at = folded.indexOf(query);
    if (at !== -1) return { ...c, kind: INSIDE, matches: [[at, at + query.length]] };
  }
  if (query.length >= 4) {
    const allowed = query.length >= 7 ? 2 : 1;
    // Typos rarely hit the first letter, and requiring it keeps the guesses relevant.
    const close = starts.some((s) => folded[s] === query[0] && prefixDistance(query, folded.slice(s)) <= allowed);
    if (close) return { ...c, kind: TYPO, matches: [] };
  }
  return null;
}

/**
 * A match on a later word ("milk" in "Oat milk") counts as much as a match at the start once three
 * letters are typed, or for the person's own foods. Before that, "t" should offer Tomatoes, not
 * Chicken thighs.
 */
function tier(s: Scored, queryLength: number): number {
  if (s.kind === WORD && (queryLength >= 3 || s.history)) return START;
  return s.kind;
}

function compare(a: Scored, b: Scored, queryLength: number): number {
  return (
    tier(a, queryLength) - tier(b, queryLength) ||
    (b.history?.count ?? 0) - (a.history?.count ?? 0) ||
    (b.history?.lastAdded ?? '').localeCompare(a.history?.lastAdded ?? '') ||
    Number(b.staple) - Number(a.staple) ||
    a.kind - b.kind ||
    a.name.length - b.name.length ||
    a.name.localeCompare(b.name)
  );
}

/**
 * Suggestions for a partly typed item name: the person's own foods first, then common groceries.
 * Typos are only guessed at when nothing matches as typed.
 */
export function suggestFoods(typed: string, { history = [], taught = [], exclude = [], limit = SUGGESTION_LIMIT }: SuggestOptions = {}): FoodSuggestion[] {
  const query = tidyQuery(typed);
  if (!query) return [];
  const tokens = query.split(' ');
  const skip = new Set(exclude.map(tidyQuery));

  const pool = new Map<string, Candidate>();
  for (const h of history) {
    const key = tidyQuery(h.name);
    if (key && !pool.has(key)) pool.set(key, { name: h.name, category: h.category, history: h, staple: false });
  }
  // Taught foods rank like everyday staples and keep their own spelling and category. Their usual
  // place is where they live unopened, so the list being built still decides where they go.
  for (const t of taught) {
    const key = tidyQuery(t.name);
    if (!key) continue;
    const mine = pool.get(key);
    if (mine) Object.assign(mine, { staple: true, taught: t, category: t.category });
    else pool.set(key, { name: t.name, category: t.category, history: null, staple: true, taught: t });
  }
  for (const f of FOOD_CATALOG) {
    const key = tidyQuery(f.name);
    const mine = pool.get(key);
    if (mine) {
      Object.assign(mine, mine.taught ? { keptIn: f.keptIn } : { staple: f.staple, keptIn: f.keptIn });
    } else pool.set(key, { name: f.name, category: f.category, history: null, staple: f.staple, keptIn: f.keptIn });
  }

  const scored: Scored[] = [];
  for (const [key, c] of pool) {
    if (skip.has(key)) continue;
    const s = score(c, query, tokens);
    if (s) scored.push(s);
  }
  const asTyped = scored.filter((s) => s.kind !== TYPO);
  return (asTyped.length > 0 ? asTyped : scored)
    .sort((a, b) => compare(a, b, query.length))
    .slice(0, limit)
    .map((s) => ({
      name: s.name,
      category: s.category,
      fromHistory: s.history !== null,
      ...(s.taught ? { taught: true } : {}),
      ...(s.taught?.imageUrl ? { imageUrl: s.taught.imageUrl } : {}),
      ...(s.keptIn ? { keptIn: s.keptIn } : {}),
      matches: s.matches,
    }));
}

/** Foods the person has added before, from tracked items and recently used or thrown-away ones. */
export function historyFrom(items: PantryItem[]): HistoryFood[] {
  const byName = new Map<string, HistoryFood>();
  // Newest first, so the most recent spelling and category win.
  const newestFirst = [...items].sort((a, b) => b.addedOn.localeCompare(a.addedOn));
  for (const item of newestFirst) {
    const key = tidyQuery(item.name);
    if (!key) continue;
    const seen = byName.get(key);
    if (seen) seen.count += 1;
    else byName.set(key, { name: item.name.trim(), category: item.category, count: 1, lastAdded: item.addedOn });
  }
  return [...byName.values()];
}

/** Finds the suggestion that is exactly what was typed, ignoring case and accents. */
export function exactSuggestion(typed: string, suggestions: FoodSuggestion[]): FoodSuggestion | undefined {
  const query = tidyQuery(typed);
  return suggestions.find((s) => tidyQuery(s.name) === query);
}

export interface ResolvedFood {
  name: string;
  category: Category;
  keptIn?: StorageLocation;
}

/**
 * What to add when someone types a name and presses Add instead of picking a suggestion. A name
 * they have used before, or a known food, keeps its usual spelling and category ("milk" becomes
 * "Milk", dairy); anything else is added as typed, with a guessed category.
 */
export function resolveTyped(typed: string, history: HistoryFood[] = [], taught: TaughtFood[] = []): ResolvedFood {
  const key = tidyQuery(typed);
  const food = taught.find((t) => tidyQuery(t.name) === key);
  if (food) return { name: food.name, category: food.category };
  const mine = history.find((h) => tidyQuery(h.name) === key);
  const known = FOOD_CATALOG.find((f) => tidyQuery(f.name) === key);
  if (mine) return { name: mine.name, category: mine.category, ...(known?.keptIn ? { keptIn: known.keptIn } : {}) };
  if (known) return { name: known.name, category: known.category, ...(known.keptIn ? { keptIn: known.keptIn } : {}) };
  const name = typed.trim().replace(/\s+/g, ' ');
  return { name, category: guessCategory(name) };
}

/** "Keeps about 5 days", worded for a caption under a suggestion. */
export function keepsLabel(days: number): string {
  if (days <= 0) return 'Best used today';
  if (days === 1) return 'Keeps about 1 day';
  if (days < 14) return `Keeps about ${days} days`;
  if (days < 56) return `Keeps about ${Math.round(days / 7)} weeks`;
  if (days < 365) return `Keeps about ${Math.round(days / 30)} months`;
  return 'Keeps a year or more';
}
