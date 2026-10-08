/**
 * Automatic graphics quality — the Settings side that can be checked without a DOM: the "Auto · Medium" summary
 * and the layout rules that keep four segments on one line at 375 px.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { qualitySummary } from '../src/ui/panels/SettingsPanel';

describe('settings: quality summary', () => {
  it('names the level Auto is using', () => {
    expect(qualitySummary({ qualityMode: 'auto', quality: 'medium' })).toBe('Auto · Medium');
    expect(qualitySummary({ qualityMode: 'auto', quality: 'low' })).toBe('Auto · Low');
  });

  it('shows just the level when the player picked it', () => {
    expect(qualitySummary({ qualityMode: 'manual', quality: 'high' })).toBe('High');
  });
});

describe('settings: quality control layout', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'ui', 'styles', 'screens.css'), 'utf8');

  it('segments can shrink below their text width and never wrap "Medium"', () => {
    const m = /\.segmented\.quality \.seg\s*\{([^}]*)\}/.exec(css);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/min-width:\s*0/);
    expect(m![1]).toMatch(/white-space:\s*nowrap/);
  });

  it('the level in use under Auto has its own marker', () => {
    expect(css).toMatch(/\.seg\.in-use\s*\{/);
  });
});
