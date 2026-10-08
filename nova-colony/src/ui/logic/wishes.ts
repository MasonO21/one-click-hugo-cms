/**
 * Presentation helpers for colonist wishes (sim/wishes.ts): the wish card, the Wishes list with distances, friendship
 * hearts, the Crew badge count, and what "Show me" does (open a menu at the right card and / or point the guide arrow
 * at a world spot). Pure reads of game state: unit-tested in tests/ui.wishes.test.ts.
 */
import type { Game } from '../../core/Game';
import type { Colonist, Wish } from '../../core/state';
import type { WishKind } from '../../data/schema';
import { fmt } from '../../core/format';

declare module '../../core/events' {
  interface GameEvents {
    /** UI: the player tapped "Show me" on a wish: the guide arrow points the way until it comes true (or a while). */
    'ui:wishGuide': { id: number };
  }
}

/** Seconds the "Show me" arrow keeps pointing (it also stops when the wish comes true or lapses). */
export const SHOW_ME_SECONDS = 120;
/** Within this many world units a colonist counts as "right here". */
const HERE = 6;

export interface HeartsView {
  full: number;
  max: number;
  /** "💛💛💛🤍🤍". */
  text: string;
  /** "Best friends", "Close friends", "Friends", "New friend". */
  label: string;
}

/** Friendship hearts as text and a friendly label. */
export function heartsView(n: number, max = 5, perks = { productivityHearts: 3, bestFriendsHearts: 5 }): HeartsView {
  const full = Math.max(0, Math.min(max, Math.floor(Number.isFinite(n) ? n : 0)));
  const label = full >= perks.bestFriendsHearts ? 'Best friends' : full >= perks.productivityHearts ? 'Close friends' : full >= 1 ? 'Friends' : 'New friend';
  return { full, max, text: '💛'.repeat(full) + '🤍'.repeat(max - full), label };
}

/** "right here" up close, else whole metres (1 world unit = 1 m on the map). */
export function distanceText(d: number): string {
  if (!Number.isFinite(d)) return '';
  return d <= HERE ? 'right here' : `${Math.round(d)} m away`;
}

export interface GiveView {
  res: string;
  need: number;
  /** "Give 40 🍎". */
  label: string;
  /** Why it is disabled ("Need 7 more Food"), null when it can be given now. */
  why: string | null;
}

export interface WishCardView {
  id: number;
  colonist: number;
  /** First name. */
  name: string;
  kind: WishKind;
  icon: string;
  title: string;
  /** What they say, amount filled in. */
  text: string;
  /** How to make it come true, one short line. */
  hint: string;
  /** build / craft / explore progress ("0 / 1"), null for one-shot kinds. */
  progress: string | null;
  give: GiveView | null;
  /** A "Show me" button makes sense (build / craft / chat / explore). */
  showMe: boolean;
}

function firstName(c: Pick<Colonist, 'name'>): string {
  return c.name.split(' ')[0];
}

/** Everything the wish card shows, or null when the wish (or its colonist) is gone. */
export function wishCard(game: Game, w: Wish): WishCardView | null {
  const ws = game.sys.wishes;
  const d = ws.def(w);
  const c = game.sys.colonists.get(w.colonist);
  if (!d || !c) return null;
  const name = firstName(c);
  let hint = '';
  let give: GiveView | null = null;
  switch (d.kind) {
    case 'give': {
      const r = game.data.resource(d.target);
      give = { res: d.target, need: w.need, label: `Give ${fmt(w.need)} ${r?.icon ?? ''}`.trim(), why: ws.refusal(w) };
      hint = `Hand over ${fmt(w.need)} ${r?.name ?? d.target} from storage.`;
      break;
    }
    case 'build':
      hint = `Place one more ${game.data.building(d.target)?.name ?? d.target} from the Build menu.`;
      break;
    case 'craft': {
      const r = game.data.recipe(d.target);
      const at = r && r.station !== 'hand' ? ` at the ${game.sys.crafting.stationName(r.station)}` : ' by hand';
      hint = `Craft ${r?.name ?? d.target}${at}.`;
      break;
    }
    case 'chat':
      hint = `Walk up to ${name} and tap Chat.`;
      break;
    case 'explore':
      hint = 'Open any cache, cabin or wreck out there.';
      break;
  }
  return {
    id: w.id,
    colonist: c.id,
    name,
    kind: d.kind,
    icon: d.icon,
    title: d.title,
    text: ws.text(w),
    hint,
    progress: d.kind === 'build' || d.kind === 'craft' || d.kind === 'explore' ? `${w.done} / ${w.need}` : null,
    give,
    showMe: d.kind !== 'give',
  };
}

export interface WishRow {
  card: WishCardView;
  /** World units from the player. */
  distance: number;
  where: string;
}

/** Open wishes of colonists at home, nearest first (the Wishes tab). */
export function wishRows(game: Game): WishRow[] {
  const p = game.state.player;
  const out: WishRow[] = [];
  for (const w of game.sys.wishes.open()) {
    const c = game.sys.colonists.get(w.colonist);
    if (!c || c.away) continue;
    const card = wishCard(game, w);
    if (!card) continue;
    const distance = Math.hypot(c.x - p.x, c.z - p.z);
    out.push({ card, distance, where: distanceText(distance) });
  }
  return out.sort((a, b) => a.distance - b.distance || a.card.id - b.card.id);
}

/** Open wishes the player can act on (the Crew button's badge). */
export function wishBadge(game: Game): number {
  let n = 0;
  for (const w of game.state.wishes?.open ?? []) {
    const c = game.sys.colonists.get(w.colonist);
    if (c && !c.away) n++;
  }
  return n;
}

/** What "Show me" does for a wish: open a menu (and ring a card in it) and / or point the guide arrow at a spot. */
export interface ShowMePlan {
  panel?: { name: string; arg?: unknown };
  /** CSS selector the guide rings (the Guide falls back to the button that opens its menu). */
  ui?: string;
  /** World spot the guide arrow points at (live: the colonist walks around). */
  world?: { x: number; z: number };
  /** Swing the camera over to `world` for a look. */
  focus?: boolean;
}

export function showMePlan(game: Game, w: Wish): ShowMePlan | null {
  const d = game.sys.wishes.def(w);
  if (!d) return null;
  switch (d.kind) {
    case 'build':
      return { panel: { name: 'build', arg: { def: d.target } }, ui: `[data-build="${d.target}"]` };
    case 'craft': {
      const r = game.data.recipe(d.target);
      return { panel: { name: 'craft', arg: { station: r?.station ?? 'hand' } }, ui: `[data-recipe="${d.target}"]` };
    }
    case 'chat': {
      const c = game.sys.colonists.get(w.colonist);
      return c ? { world: { x: c.x, z: c.z }, focus: true } : null;
    }
    case 'explore': {
      const p = game.state.player;
      const spot = game.sys.wishes.exploreSpots(p.x, p.z)[0];
      return spot ? { world: { x: spot.x, z: spot.z }, focus: true } : null;
    }
    default:
      return null;
  }
}

/** Guide target for a pinned "Show me" (same shape the tutorial guide uses), null once it is done or timed out. */
export function wishGuideTarget(game: Game, pin: { id: number; until: number } | null, nowSeconds: number): { text: string; world: { x: number; z: number } | null; ui: string | null } | null {
  if (!pin || nowSeconds > pin.until) return null;
  const w = game.sys.wishes.get(pin.id);
  if (!w) return null;
  const plan = showMePlan(game, w);
  if (!plan) return null;
  const card = wishCard(game, w);
  return { text: card?.hint ?? '', world: plan.world ?? null, ui: plan.ui ?? null };
}
