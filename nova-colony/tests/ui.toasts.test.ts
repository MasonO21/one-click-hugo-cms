/**
 * Toasts over open panels (QA6: "Your squad is back… Collect", which opens Expeditions when tapped, sat over the Daily
 * gift's Claim button for 3 s, so a tap meant for Claim opened Expeditions). Tappable toasts wait while any panel is
 * open; plain ones still show and never take a touch.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { OPEN_TOAST_KEEP_MS, planFlush, TOAST_KEEP_MS, toastRoute, type HeldToast, type ToastScreen } from '../src/ui/logic/toasts';

const screen = (open: string[] = [], over: Partial<ToastScreen> = {}): ToastScreen => ({
  modal: false,
  revealing: false,
  anyOpen: open.length > 0,
  isOpen: (p) => open.includes(p),
  ...over,
});
const held = (text: string, at: number, open?: string, extra: Partial<HeldToast> = {}): HeldToast => ({ text, kind: 'success', at, ...(open ? { open } : {}), ...extra });

describe('toastRoute', () => {
  it('a toast that opens a panel is tappable only while nothing is open', () => {
    expect(toastRoute('success', 'expeditions', screen())).toBe('tap');
    // the Daily sheet is open: the squad toast waits instead of hanging over Claim
    expect(toastRoute('success', 'expeditions', screen(['daily']))).toBe('defer');
    // drawers and the inspector count too: their cards are where the toast stack sits in portrait
    expect(toastRoute('success', 'journal', screen(['build']))).toBe('defer');
    expect(toastRoute('info', 'journal', screen(['building']))).toBe('defer');
  });

  it('shows it without a tap target when its own panel is the one open', () => {
    expect(toastRoute('success', 'expeditions', screen(['expeditions']))).toBe('plain');
  });

  it('a warning is read now (the player is mid-action) but loses its tap target over a panel', () => {
    expect(toastRoute('warning', 'inventory', screen(['building']))).toBe('plain');
    expect(toastRoute('warning', 'inventory', screen())).toBe('tap');
  });

  it('a toast with nothing to open is always shown plain (pass-through)', () => {
    expect(toastRoute('info', undefined, screen(['daily']))).toBe('plain');
    expect(toastRoute('reward', undefined, screen())).toBe('plain');
  });
});

describe('planFlush', () => {
  it('holds everything while a modal or the tier reveal is up', () => {
    const list = [held('a', 0), held('b', 0, 'journal')];
    expect(planFlush(list, 100, screen(['celebrate'], { modal: true }))).toEqual({ show: [], keep: list });
    expect(planFlush(list, 100, screen([], { revealing: true }))).toEqual({ show: [], keep: list });
  });

  it('a tappable toast keeps waiting while a sheet is open; plain ones go out', () => {
    const squad = held('Your squad is back', 1000, 'expeditions');
    const plain = held('Crafted Gear!', 1000);
    const p = planFlush([squad, plain], 2000, screen(['daily']));
    expect(p.show).toEqual([plain]);
    expect(p.keep).toEqual([squad]);
    // the sheet closes: it follows
    expect(planFlush(p.keep, 5000, screen())).toEqual({ show: [squad], keep: [] });
  });

  it('drops a held toast whose panel the player opened meanwhile', () => {
    const squad = held('Your squad is back', 1000, 'expeditions');
    expect(planFlush([squad], 2000, screen(['expeditions']))).toEqual({ show: [], keep: [] });
  });

  it('a tappable toast is worth waiting for up to OPEN_TOAST_KEEP_MS, a plain one TOAST_KEEP_MS', () => {
    const t0 = 1000;
    const squad = held('Your squad is back', t0, 'expeditions');
    const plain = held('Crafted Gear!', t0);
    expect(planFlush([squad], t0 + OPEN_TOAST_KEEP_MS - 1, screen(['daily'])).keep).toEqual([squad]);
    expect(planFlush([squad], t0 + OPEN_TOAST_KEEP_MS + 1, screen(['daily']))).toEqual({ show: [], keep: [] });
    expect(planFlush([plain], t0 + TOAST_KEEP_MS + 1, screen())).toEqual({ show: [], keep: [] });
    // a tier-up's news waits for its card however long it is read
    const news = held('3 new side missions', t0, undefined, { keep: true });
    expect(planFlush([news], t0 + 10 * OPEN_TOAST_KEEP_MS, screen()).show).toEqual([news]);
  });

  it('shows at most the latest three at once', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((t) => held(t, 0));
    expect(planFlush(list, 10, screen()).show.map((d) => d.text)).toEqual(['c', 'd', 'e']);
  });
});

describe('toast styles', () => {
  const sheet = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'styles', f), 'utf8');
  it('only a tappable toast takes pointer events, and never while a panel is open or while it fades out', () => {
    expect(sheet('fx.css')).toMatch(/\.nv-toasts\s*\{[^}]*pointer-events:\s*none/);
    expect(sheet('journal.css')).toMatch(/\.nv-root \.toast\.tappable\s*\{[^}]*pointer-events:\s*auto/);
    const guard = /\.nv-root \.toast\.tappable\.out,\s*\.nv-root\[data-any-panel='1'\] \.toast\.tappable\s*\{[^}]*pointer-events:\s*none/;
    expect(sheet('fx.css')).toMatch(guard);
  });
});
