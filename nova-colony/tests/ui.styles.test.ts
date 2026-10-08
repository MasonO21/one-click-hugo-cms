/**
 * Style guards: layout rules that QA playtests found broken and that no logic test would notice.
 * The stylesheets are read as plain text (the test env has no DOM), so these only pin the declarations.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

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
