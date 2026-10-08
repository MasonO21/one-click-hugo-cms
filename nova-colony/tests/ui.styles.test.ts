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

describe('panel header buttons', () => {
  it('"← Back" / "← All" / "Auto-assign" in a panel header are at least 44px tall (QA5: 33px on a 375px phone)', () => {
    const decl = rule(css('panels.css'), '.nv-root .pm-extra .btn');
    const h = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(decl);
    expect(h).not.toBeNull();
    expect(Number(h![1])).toBeGreaterThanOrEqual(44);
    // it must outrank `.nv-root .btn.small` (same specificity): panels.css loads after base.css
    const ui = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'UI.ts'), 'utf8');
    expect(ui.indexOf("styles/panels.css")).toBeGreaterThan(ui.indexOf("styles/base.css"));
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

describe('portrait HUD height (QA6: from Steel on the top HUD covered ~47% of a 393x852 phone)', () => {
  const hud = css('hud.css');
  // the last portrait block of hud.css ("portrait tweaks")
  const portrait = hud.slice(hud.lastIndexOf('@media (orientation: portrait)'));

  it('the day chip moves up beside the tier badge, shrinking instead of wrapping the top row', () => {
    expect(rule(hud, '.hud-top .schip.day')).toMatch(/display:\s*none/);
    const decl = rule(portrait, '.hud-top .schip.day');
    expect(decl).toMatch(/display:\s*inline-flex/);
    // a zero flex basis never breaks the line; it grows into the free space up to its own width
    expect(decl).toMatch(/flex:\s*1 1 0;/);
    expect(decl).toMatch(/max-width:\s*max-content/);
    expect(decl).toMatch(/min-width:\s*0/);
    expect(rule(portrait, '.hud-status .schip.day')).toMatch(/display:\s*none/);
  });

  it('a boost chip drops its word on a portrait phone (its icon names the kind)', () => {
    expect(rule(portrait, '.schip.boost .lb')).toMatch(/display:\s*none/);
  });

  it("the mission card's progress pill shares the eyebrow row", () => {
    expect(rule(hud, '.mission-card')).toMatch(/display:\s*grid/);
    const bar = rule(hud, '.mission-card .bar');
    expect(bar).toMatch(/grid-row:\s*1/);
    expect(bar).toMatch(/grid-column:\s*2/);
    expect(bar).not.toMatch(/margin-top/);
  });

  it('the resource row keeps scrolling past the five basic chips, with only a narrow fade at the edge', () => {
    expect(rule(hud, '.res-scroll')).toMatch(/overflow-x:\s*auto/);
    expect(rule(portrait, '.res-scroll')).toMatch(/calc\(100% - 0\.9em\)/);
  });
});
