import { Platform } from 'react-native';

/** Web only: nothing on the page has focus (what had it was removed with the screen that closed). */
export function focusLost(): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  return !document.activeElement || document.activeElement === document.body;
}

/**
 * Web only: moves focus to the first heading inside `node` (or to `node` itself), so keyboard and
 * screen reader users start in a screen that just opened instead of back at the top of the page.
 * Focus already inside it, or held by an open dialog, is left alone. Phones do this themselves.
 */
export function focusFirstHeading(node: unknown): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const el = node as HTMLElement | null;
  if (!el || typeof el.querySelector !== 'function') return;
  const active = document.activeElement;
  if (active && active !== document.body && el.contains(active)) return;
  if (document.querySelector('[aria-modal="true"]')) return;
  const target = el.querySelector<HTMLElement>('[role="heading"]') ?? el;
  // Focusable only from script, and no ring: a heading is not something to press.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.style.outline = 'none';
  target.focus({ preventScroll: true });
}
