/** Colonist presentation helpers: portrait palettes, happiness faces, rarity styling. */
import type { Colonist, ColonistAppearance } from '../../core/state';
import type { Game } from '../../core/Game';

export const SKIN = ['#f7d6b8', '#ecbd94', '#d29a6a', '#a8704a', '#7a4c33', '#f3cba6'];
export const HAIR = ['#2b1d16', '#5a3a22', '#a8742f', '#e0bb70', '#c4472f', '#9097a6', '#4b3a8c', '#1f6f55'];
export const OUTFIT = ['#4fb3f6', '#ef6b5b', '#8fc95a', '#ffb347', '#b48cff', '#5ef2ff', '#ff8fa3', '#ffd84a'];

const pick = <T,>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];

export interface PortraitColors {
  skin: string;
  hair: string;
  outfit: string;
}

export function portraitColors(a: ColonistAppearance): PortraitColors {
  return { skin: pick(SKIN, a.skin), hair: pick(HAIR, a.hairColor), outfit: pick(OUTFIT, a.outfit) };
}

/** Self-contained SVG markup for a round colonist portrait. */
export function portraitSvg(c: Pick<Colonist, 'appearance'>): string {
  const p = portraitColors(c.appearance);
  const style = ((c.appearance.hair % 3) + 3) % 3;
  const hair =
    style === 0
      ? `<path d="M12 21a12 12 0 0 1 24 0c-5-5-19-5-24 0z" fill="${p.hair}"/>`
      : style === 1
        ? `<path d="M11 24c-1-9 4-14 13-14s14 5 13 14c-2-6-6-8-13-8s-11 2-13 8z" fill="${p.hair}"/>`
        : `<path d="M12 22a12 12 0 0 1 24 0l-3 3c-1-5-5-7-9-7s-8 2-9 7z" fill="${p.hair}"/><circle cx="12" cy="26" r="3.4" fill="${p.hair}"/><circle cx="36" cy="26" r="3.4" fill="${p.hair}"/>`;
  return (
    `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="24" fill="${p.outfit}"/>` +
    `<path d="M6 44c2-9 9-12 18-12s16 3 18 12a24 24 0 0 1-36 0z" fill="rgba(0,0,0,.14)"/>` +
    `<circle cx="24" cy="23" r="11" fill="${p.skin}"/>${hair}` +
    `<circle cx="19.8" cy="24.5" r="1.5" fill="#2a2140"/><circle cx="28.2" cy="24.5" r="1.5" fill="#2a2140"/>` +
    `<path d="M20.5 29c2 2 5 2 7 0" stroke="#2a2140" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`
  );
}

export function happinessFace(h: number): { icon: string; label: string; color: string } {
  if (h >= 80) return { icon: '😄', label: 'Delighted', color: '#3fc38a' };
  if (h >= 60) return { icon: '🙂', label: 'Happy', color: '#8fc95a' };
  if (h >= 40) return { icon: '😐', label: 'Okay', color: '#ffb347' };
  return { icon: '😟', label: 'Gloomy', color: '#ef6b5b' };
}

export function stars(n: number, max = 5): string {
  const k = Math.max(0, Math.min(max, Math.round(n)));
  return '★'.repeat(k) + '☆'.repeat(max - k);
}

/** The profession a colonist is doing right now (their workplace's job), else their specialty. */
export function jobOf(game: Game, c: Pick<Colonist, 'workplace' | 'specialty'>): string {
  if (c.workplace != null) {
    const b = game.sys.buildings.get(c.workplace);
    const job = b ? game.data.building(b.def)?.workers?.job : undefined;
    if (job) return job;
  }
  return c.specialty;
}
