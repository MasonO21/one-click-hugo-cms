/**
 * QA3: on phones, tapping the Command Center opened the Colony sheet on pointerup, then the browser's
 * compatibility click (touchend not cancelled) landed on the new sheet's backdrop and closed it again.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { InputController, type InputHooks } from '../src/ui/input/InputController';
import type { Game } from '../src/core/Game';

type Listener = { type: string; fn: (e: unknown) => void; opts?: AddEventListenerOptions | boolean };

function fakeTarget(): { listeners: Listener[]; addEventListener: (type: string, fn: (e: unknown) => void, opts?: AddEventListenerOptions | boolean) => void } {
  const listeners: Listener[] = [];
  return { listeners, addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }) };
}

const g = globalThis as unknown as { window?: unknown; document?: unknown };
const saved = { window: g.window, document: g.document };
afterEach(() => {
  g.window = saved.window;
  g.document = saved.document;
});

describe('world input layer', () => {
  it('cancels the touchend default so no ghost click reaches a sheet opened by the tap', () => {
    g.window = fakeTarget();
    g.document = { ...fakeTarget(), hidden: false };
    const layer = fakeTarget();
    const hooks = {} as InputHooks;
    new InputController({} as Game, layer as unknown as HTMLElement, {} as HTMLElement, {} as HTMLElement, hooks);
    const te = layer.listeners.find((l) => l.type === 'touchend');
    expect(te).toBeDefined();
    expect((te!.opts as AddEventListenerOptions | undefined)?.passive).toBe(false);
    let prevented = false;
    te!.fn({ cancelable: true, preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    // a non-cancelable touchend (scroll in progress) is left alone instead of logging an intervention
    let prevented2 = false;
    te!.fn({ cancelable: false, preventDefault: () => (prevented2 = true) });
    expect(prevented2).toBe(false);
    // the game's own input is pointer events
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) expect(layer.listeners.some((l) => l.type === t)).toBe(true);
  });
});
