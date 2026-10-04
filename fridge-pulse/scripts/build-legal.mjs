#!/usr/bin/env node
/**
 * Builds hostable Privacy Policy and Terms of Use pages into docs/legal/ from the same text the app
 * bundles (src/legal/*.json), so the store listing and the app never disagree.
 *
 *   LEGAL_DEVELOPER="Acme Kitchen Ltd" LEGAL_EMAIL=help@acme.example npm run legal:build
 *
 * Host the output anywhere (GitHub Pages, Netlify, your site) and use the URLs in App Store
 * Connect, Google Play Console, and EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'docs/legal');
const trial = fs.readFileSync(path.join(root, 'src/billing/trial.ts'), 'utf8');
const price = /PRICE_PER_MONTH = '([^']+)'/.exec(trial)?.[1];
const span = /TRIAL_SPAN = '([^']+)'/.exec(trial)?.[1];
if (!price || !span) throw new Error('Could not read the offer from src/billing/trial.ts');

const developer = process.env.LEGAL_DEVELOPER || 'the Fridge Pulse team';
const email = process.env.LEGAL_EMAIL || '';
if (!process.env.LEGAL_DEVELOPER || !process.env.LEGAL_EMAIL) {
  console.warn('Note: set LEGAL_DEVELOPER and LEGAL_EMAIL to put your company name and contact address in the pages.');
}
const contactLine = email ? `Questions? Email ${email}.` : 'Questions? Contact us through the app store listing.';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (t) =>
  esc(t.replaceAll('{{developer}}', developer).replaceAll('{{contactLine}}', contactLine).replaceAll('{{price}}', price).replaceAll('{{trialSpan}}', span));

function page(doc) {
  const body = doc.sections
    .map(
      (s) =>
        `<section><h2>${esc(s.heading)}</h2>${(s.paragraphs ?? []).map((p) => `<p>${fill(p)}</p>`).join('')}${
          s.bullets ? `<ul>${s.bullets.map((b) => `<li>${fill(b)}</li>`).join('')}</ul>` : ''
        }</section>`,
    )
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} - Fridge Pulse</title>
<style>
  :root{--bg:#f5f7fc;--fg:#222222;--muted:#545b6b;--accent:#c2006a}
  @media (prefers-color-scheme: dark){:root{--bg:#070b16;--fg:#f3f6ff;--muted:#aab5d1;--accent:#ff4da6}}
  body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{max-width:42rem;margin:0 auto;padding:2rem 1.25rem 4rem}
  h1{font-size:2rem;margin:0 0 .25rem} h2{font-size:1.25rem;margin:2rem 0 .5rem}
  .meta{color:var(--muted);margin:0 0 1.5rem} ul{padding-left:1.25rem} li{margin:.4rem 0}
  a{color:var(--accent)}
</style></head><body><main>
<h1>${esc(doc.title)}</h1><p class="meta">Fridge Pulse. Last updated ${esc(doc.updated)}</p>
<p>${fill(doc.intro)}</p>
${body}
</main></body></html>
`;
}

fs.mkdirSync(out, { recursive: true });
const docs = [
  ['privacy-policy.html', 'src/legal/privacy.json'],
  ['terms-of-use.html', 'src/legal/terms.json'],
];
for (const [file, src] of docs) {
  fs.writeFileSync(path.join(out, file), page(JSON.parse(fs.readFileSync(path.join(root, src), 'utf8'))));
}
fs.writeFileSync(
  path.join(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fridge Pulse legal</title>
<body style="font:17px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1.25rem">
<h1>Fridge Pulse</h1><ul><li><a href="privacy-policy.html">Privacy Policy</a></li><li><a href="terms-of-use.html">Terms of Use</a></li></ul></body>
`,
);
console.log(`Wrote ${docs.length + 1} pages to ${path.relative(process.cwd(), out) || '.'}`);
