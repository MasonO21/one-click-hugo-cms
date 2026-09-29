import fs from 'node:fs';
import path from 'node:path';
import { PRICE_PER_MONTH, TRIAL_DAYS, TRIAL_NAME, TRIAL_SPAN } from '../src/billing/trial';
import { legalDocument } from '../src/legal/render';

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

/** Everything a customer or store reviewer can read: app source, legal text, store copy, docs. */
function customerFacingFiles(): string[] {
  const files = [...walk(path.join(ROOT, 'src'), ['.ts', '.tsx', '.json'])];
  for (const dir of ['store', 'docs']) {
    if (fs.existsSync(path.join(ROOT, dir))) files.push(...walk(path.join(ROOT, dir), ['.md', '.html', '.txt', '.json']));
  }
  files.push(path.join(ROOT, 'README.md'));
  return files;
}

const rel = (f: string) => path.relative(ROOT, f);

describe('the offer: $9.99 per month with a 2-week free trial', () => {
  it('is defined once, with matching wording', () => {
    expect(PRICE_PER_MONTH).toBe('$9.99');
    expect(TRIAL_DAYS).toBe(14);
    expect(TRIAL_NAME).toBe('2-week');
    expect(TRIAL_SPAN).toBe('2 weeks');
  });

  it('never shows a price other than $9.99 in the app, legal text, store copy or docs', () => {
    const offenders: string[] = [];
    for (const file of customerFacingFiles()) {
      // Cost estimates for the AI backend (README) are not customer prices; those sit on lines that mention tokens or scans.
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/\btokens?\b|per scan|scan is|API|Opus|Sonnet|cost/i.test(line) && rel(file) === 'README.md') return;
        for (const m of line.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)) {
          if (m[0].replace(/\s/g, '') !== '$9.99') offenders.push(`${rel(file)}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('never describes a trial length other than 2 weeks / 14 days', () => {
    const toDays = (n: number, unit: string) => n * (unit.startsWith('week') ? 7 : unit.startsWith('month') ? 30 : 1);
    const patterns = [
      /(\d+)[- ](day|week|month)s?[- ](?:free[- ])?trials?/gi, // "2-week free trial", "14-day trial"
      /free (?:for )?(\d+) (day|week|month)s?/gi, // "Free for 2 weeks"
      /trial (?:of|for) (\d+) (day|week|month)s?/gi, // "trial of 14 days"
    ];
    const offenders: string[] = [];
    let found = 0;
    for (const file of customerFacingFiles()) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const re of patterns) {
            for (const m of line.matchAll(re)) {
              found += 1;
              if (toDays(Number(m[1]), (m[2] ?? '').toLowerCase()) !== TRIAL_DAYS) offenders.push(`${rel(file)}:${i + 1} "${m[0]}"`);
            }
          }
        });
    }
    expect(offenders).toEqual([]);
    expect(found).toBeGreaterThan(0); // the scan is not vacuous
  });

  it('is stated in the Terms of Use with the same price and trial', () => {
    const text = JSON.stringify(legalDocument('terms'));
    expect(text).toContain('$9.99 per month');
    expect(text).toContain('free to try for 2 weeks');
    expect(text).toContain('at least 24 hours before the end of the current period');
  });
});

describe('legal documents', () => {
  it('have every placeholder filled', () => {
    for (const key of ['privacy', 'terms'] as const) {
      expect(JSON.stringify(legalDocument(key))).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('name the AI provider, what is sent, and how to opt out', () => {
    const text = JSON.stringify(legalDocument('privacy'));
    expect(text).toContain('Anthropic');
    expect(text).toMatch(/photos/i);
    expect(text).toMatch(/Settings > Privacy and data/);
    expect(text).toMatch(/do not sell/i);
  });

  it('use the configured developer name and support email when given', () => {
    const text = JSON.stringify(legalDocument('privacy', { developer: 'Acme Kitchen Ltd', email: 'help@acme.example' }));
    expect(text).toContain('Acme Kitchen Ltd');
    expect(text).toContain('Email help@acme.example');
  });

  it('carry the food-safety and allergy warnings', () => {
    const text = JSON.stringify(legalDocument('terms'));
    expect(text).toMatch(/When in doubt, throw it out/);
    expect(text).toMatch(/allerg/i);
  });
});
