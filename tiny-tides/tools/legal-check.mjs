// Release gate for the legal pages: no placeholders left in legal/site.config.json, pages up to date, identifiers consistent.
//   node tools/legal-check.mjs                     strict (used by `npm run release`)
//   node tools/legal-check.mjs --allow-placeholders  structure/freshness only (used by CI and `npm run verify`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSite, config, PAGES } from './site.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLACEHOLDER = /YOUR|\.example\b|example\.(com|org)|\bTODO\b|\bFIXME\b|lorem ipsum/i;

/** Names of config values that still look like placeholders. */
export function findPlaceholders(cfg) {
  return Object.entries(cfg).filter(([k, v]) => k !== '_readme' && (typeof v !== 'string' || !v.trim() || PLACEHOLDER.test(v))).map(([k]) => k);
}
/** Problems that must be fixed even while placeholders are allowed. */
export function structuralProblems(cfg, dir = path.join(root, 'site')) {
  const out = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cfg.effectiveDate) || Number.isNaN(Date.parse(cfg.effectiveDate))) out.push('effectiveDate must look like 2026-09-29');
  if (!/^https:\/\/[^/\s]+(\/[^\s]*[^/\s])?$/.test(cfg.baseUrl)) out.push('baseUrl must be an https:// address without a trailing slash');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.email)) out.push('email is not a valid address');
  const pbx = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const ids = new Set([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]));
  if (!ids.has(cfg.bundleId)) out.push(`bundleId ${cfg.bundleId} is not the Xcode bundle identifier (${[...ids].join(', ')}). Run: npm run rename`);
  const cap = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
  if (cap.appId !== cfg.bundleId) out.push(`capacitor.config.json appId (${cap.appId}) differs from bundleId`);
  for (const [f, content] of buildSite()) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== content) out.push(`site/${f} is out of date — run: npm run site`);
  }
  for (const f of ['icon.png', 'p1.png', 'p2.png', 'p3.png']) if (!fs.existsSync(path.join(dir, f))) out.push(`site/${f} is missing`);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allow = process.argv.includes('--allow-placeholders');
  const problems = structuralProblems(config);
  const holes = findPlaceholders(config);
  if (holes.length && !allow) problems.push(...holes.map((k) => `legal/site.config.json: "${k}" still has a placeholder — fill it in`));
  if (problems.length) {
    console.error(`legal check FAILED (${problems.length}):\n - ${problems.join('\n - ')}`);
    if (holes.length && !allow) console.error('\nThe pages are generated from legal/site.config.json. Fill it in, run `npm run site`, host the site/ folder, then re-run this check.');
    process.exit(1);
  }
  console.log(`legal check ok${holes.length ? ` (placeholders still to fill: ${holes.join(', ')})` : ''} — ${PAGES.length} pages`);
}
