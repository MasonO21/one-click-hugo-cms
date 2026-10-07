import { describe, expect, it } from 'vitest';
import { resolveGuideSelector } from '../src/ui/guide/Guide';

/** Minimal fake DOM: a map of selector -> element-like objects. */
function fakeDom(entries: Record<string, { w?: number; h?: number; hidden?: boolean }>) {
  const els = new Map<string, Element>();
  for (const [sel, o] of Object.entries(entries)) {
    els.set(sel, { hidden: o.hidden ?? false, getBoundingClientRect: () => ({ width: o.w ?? 50, height: o.h ?? 40 }) } as unknown as Element);
  }
  return (sel: string) => els.get(sel) ?? null;
}

describe('tutorial guide selector resolution', () => {
  it('uses the exact element when it is on screen', () => {
    const q = fakeDom({ '[data-build="shelter"]': {}, '#btn-build': {} });
    expect(resolveGuideSelector('[data-build="shelter"]', q)).toBe(q('[data-build="shelter"]'));
  });

  it('points at the Build button while the build menu is closed', () => {
    const q = fakeDom({ '#btn-build': {} });
    expect(resolveGuideSelector('[data-build="shelter"]', q)).toBe(q('#btn-build'));
  });

  it('does not point at a covered button once the panel is open but the card is on another tab', () => {
    const q = fakeDom({ '#btn-build': {}, '[data-panel="build"]': {} });
    expect(resolveGuideSelector('[data-build="shelter"]', q)).toBeNull();
  });

  it('research nodes fall back to the Tech button', () => {
    const q = fakeDom({ '#btn-research': {} });
    expect(resolveGuideSelector('[data-research="tier_reinforced"]', q)).toBe(q('#btn-research'));
  });

  it('ignores hidden or zero-size elements and unknown selectors', () => {
    const q = fakeDom({ '[data-build="x"]': { hidden: true }, '#btn-build': { w: 0, h: 0 } });
    expect(resolveGuideSelector('[data-build="x"]', q)).toBeNull();
    expect(resolveGuideSelector('.nope', fakeDom({}))).toBeNull();
  });

  it('survives invalid selectors', () => {
    const q = () => {
      throw new Error('bad selector');
    };
    expect(resolveGuideSelector('???', q)).toBeNull();
  });
});
