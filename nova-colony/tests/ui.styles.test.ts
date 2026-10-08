/**
 * Style guards: layout rules that QA playtests found broken and that no logic test would notice.
 * The stylesheets are read as plain text (the test env has no DOM), so these only pin the declarations.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PanelManager } from '../src/ui/panels/PanelManager';

const css = (file: string): string => fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'styles', file), 'utf8');

/** The declaration block of the first rule whose selector list is exactly `selector`. */
function rule(sheet: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, 'm').exec(sheet);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe('touch targets', () => {
  it('research prerequisite buttons are at least 44px tall (QA #15a: they were 18px)', () => {
    const decl = rule(css('screens.css'), 'button.req-line');
    const h = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(decl);
    expect(h, 'button.req-line needs a px min-height').not.toBeNull();
    expect(Number(h![1])).toBeGreaterThanOrEqual(44);
  });
});

describe('toasts and open panels', () => {
  it('with a sheet open the toast stack starts below the sheet header (QA #15b: "Nothing to restore" covered the Shop title)', () => {
    const decl = rule(css('fx.css'), ".nv-root[data-panel-open='1'] .nv-toasts");
    expect(decl).toMatch(/top:\s*calc\(var\(--panel-head-b/);
    // the old rule put the stack on the title row
    expect(decl).not.toMatch(/top:\s*calc\(var\(--mt\)\s*\+\s*0\.2em\)/);
  });

  // PanelManager.headerBottom() reads layout offsets only, so stand-in panels are enough
  const panel = (kind: string, head: { h: number } | null, cardTop = 20, closing = false) => ({
    closing,
    panel: { kind, hasHeader: !!head, head: head && { isConnected: true, offsetHeight: head.h }, card: { offsetTop: cardTop } },
  });
  const manager = (open: unknown[]): PanelManager => {
    const pm = new PanelManager({} as never, {} as never, {} as never, () => undefined);
    (pm as unknown as { open_: unknown[] }).open_ = open;
    return pm;
  };

  it('headerBottom is where the top-most sheet header ends', () => {
    expect(manager([]).headerBottom()).toBeNull();
    expect(manager([panel('sheet', { h: 91 }, 20)]).headerBottom()).toBe(111);
    // a bottom sheet that is short sits lower: the header moves with the card
    expect(manager([panel('sheet', { h: 61 }, 429)]).headerBottom()).toBe(490);
  });

  it('headerBottom ignores closing panels and drawers, and gives way to a headerless modal on top', () => {
    expect(manager([panel('sheet', { h: 91 }, 20), panel('sheet', { h: 50 }, 300, true)]).headerBottom()).toBe(111);
    expect(manager([panel('drawer', { h: 40 }, 300)]).headerBottom()).toBeNull();
    expect(manager([panel('sheet', { h: 91 }, 20), panel('drawer', { h: 40 }, 300)]).headerBottom()).toBe(111);
    // a celebration card has no header to protect: the toasts fall back to the top edge
    expect(manager([panel('sheet', { h: 91 }, 20), panel('modal', null, 70)]).headerBottom()).toBeNull();
  });
});
