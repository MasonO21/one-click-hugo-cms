// Builds the public website (privacy policy, terms/EULA, drop rates, parents' guide, support, licenses) from
// legal/site.config.json + legal/templates/*.html + the game's own data. Output: site/ (host it anywhere static).
//
//   node tools/site.mjs           write site/
//   node tools/site.mjs --check   don't write; exit 1 if site/ is out of date
//   node tools/site.mjs --out DIR write somewhere else (used by tests)
//
// Rates and costs come straight from src/data.js, so the website can never disagree with the game.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from '../src/data.js';
import { collectLicenses, groupByText } from './licenses.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? path.resolve(args[args.indexOf('--out') + 1]) : path.join(root, 'site');
const checkOnly = args.includes('--check');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
export const config = JSON.parse(read('legal/site.config.json'));

// ------------------------------------------------------------------ numbers shown on the pages
const G = D.GACHA;
export const pct = (p) => `${(p * 100).toFixed(p < 0.001 ? 3 : 2)}%`;
const stars = (n) => '★'.repeat(n);
const long = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const minIos = (read('ios/App/App.xcodeproj/project.pbxproj').match(/IPHONEOS_DEPLOYMENT_TARGET = ([\d.]+);/) || [])[1]?.replace(/\.0$/, '') || '15';

/** Per-item probabilities (same maths as gachaTable in src/sim.js). Every week one Rare and one Legendary collectible is in the spotlight
 *  (weight x spotMult), which slightly lowers the others in that tier. So a prize that is not in the spotlight has a chance that depends on
 *  which sibling is: `low`..`high` covers every possible week, and `spot` is its chance in the weeks it is itself the spotlight. */
export function rateRows() {
  const rows = [];
  for (const t of G.tiers) {
    const items = D.POOL_BY_TIER[t.id], W = items.reduce((a, i) => a + i.w, 0), m = G.spotMult;
    const spotlit = t.id === 'rare' || t.id === 'legendary' ? items.filter((i) => !i.filler) : [];
    for (const i of items) {
      if (!spotlit.length) { const v = (t.p / 100) * i.w / W; rows.push({ item: i, tier: t, low: v, high: v, spot: null }); continue; }
      const others = spotlit.filter((j) => j !== i).map((j) => (t.p / 100) * i.w / (W + (m - 1) * j.w));
      const canSpot = spotlit.includes(i);
      rows.push({ item: i, tier: t, low: Math.min(...others), high: Math.max(...others), spot: canSpot ? (t.p / 100) * (i.w * m) / (W + (m - 1) * i.w) : null });
    }
  }
  return rows;
}
const range = (r) => { const a = pct(r.low), b = pct(r.high); return a === b ? a : `${a} – ${b}`; };
const kindLabel = (i) => (i.filler ? 'Prize capsule' : i.kind === 'fig' ? (i.gold ? 'Golden figurine' : 'Figurine') : ({ hat: 'Hat', prop: 'Pool decor', skin: 'Pool look', fx: 'Sparkle effect' }[i.kind] || 'Toy'));

function tiersHtml() {
  const rows = G.tiers.map((t) => `<tr><td>${stars(t.stars)} ${esc(t.name)}</td><td class="num"><b>${t.p}%</b></td><td class="num">${D.POOL_BY_TIER[t.id].length}</td></tr>`).join('');
  return `<table><thead><tr><th>Tier</th><th class="num">Chance per capsule</th><th class="num">Prizes in tier</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function itemsHtml() {
  const byTier = new Map();
  for (const r of rateRows()) (byTier.get(r.tier.id) || byTier.set(r.tier.id, []).get(r.tier.id)).push(r);
  return [...G.tiers].reverse().map((t) => {
    const list = byTier.get(t.id);
    const spotCol = t.id === 'rare' || t.id === 'legendary';
    const body = list.map((r) => `<tr><td>${esc(r.item.name)}</td><td>${kindLabel(r.item)}</td><td class="num">${range(r)}</td>${spotCol ? `<td class="num">${r.spot == null ? '—' : pct(r.spot)}</td>` : ''}</tr>`).join('');
    return `<h3>${stars(t.stars)} ${esc(t.name)} — ${t.p}% per capsule</h3><table><thead><tr><th>Prize</th><th>Type</th><th class="num">${spotCol ? 'Chance when not in the spotlight' : 'Chance'}</th>${spotCol ? '<th class="num">Chance when in the spotlight</th>' : ''}</tr></thead><tbody>${body}</tbody></table>`;
  }).join('\n');
}
const shardsHtml = () => G.tiers.map((t) => `${esc(t.name)} ${t.shards}`).join(', ');
const prizeHtml = () => G.tiers.map((t) => `${esc(t.name)} ${t.prize} shards`).join(', ');

function licensesHtml() {
  const list = collectLicenses();
  const summary = `<table><thead><tr><th>Component</th><th>Version</th><th>License</th><th>Used for</th></tr></thead><tbody>${list.map((l) => `<tr><td>${l.url ? `<a href="${esc(l.url)}">${esc(l.name)}</a>` : esc(l.name)}</td><td>${esc(l.version)}</td><td>${esc(l.license)}</td><td>${esc(l.use)}</td></tr>`).join('')}</tbody></table>`;
  const full = groupByText(list).map((g) => `<details><summary>${esc(g.license)} — ${g.items.map((i) => esc(i.name)).join(', ')}</summary><pre>${esc(g.text)}</pre></details>`).join('\n');
  return `${summary}<h3>Full license texts</h3>${full}`;
}

// ------------------------------------------------------------------ template engine
export function vars() {
  const year = config.effectiveDate.slice(0, 4);
  return {
    ...config, year, effectiveDateLong: long(config.effectiveDate), minIos,
    creatures: D.FORM_IDS.length, families: D.FAMILY_IDS.length, toys: D.COLLECTIBLE_IDS.length,
    pityRare: G.pityRare, pityLegend: G.pityLegend, pityRareMinus: G.pityRare - 1, pityLegendMinus: G.pityLegend - 1, spotMult: G.spotMult,
    glassCost: G.costGlass, glassCost10: G.costGlass10, coinCost: G.costCoin, paidCap: G.paidDailyCap,
    shardsHtml: shardsHtml(), prizeHtml: prizeHtml(), tiersHtml: tiersHtml(), itemsHtml: itemsHtml(), licensesHtml: licensesHtml(),
  };
}
/** {{name}} is HTML-escaped; names ending in Html are inserted as-is. An unknown name is a build error, not a blank. */
function render(tpl, v, file) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in v)) throw new Error(`${file}: unknown placeholder {{${k}}}`);
    return k.endsWith('Html') ? String(v[k]) : esc(v[k]);
  });
}

export const PAGES = [
  { file: 'index', title: 'A cozy idle tidepool', description: 'Arrange rocks and water, welcome tiny creatures and watch them evolve. Check in a few times a day.' },
  { file: 'privacy', title: 'Privacy Policy', description: 'Tiny Tides collects no personal information: no accounts, ads, analytics or tracking.' },
  { file: 'terms', title: 'Terms of Use', description: 'The license agreement (EULA) for Tiny Tides, including virtual items and capsule rules.' },
  { file: 'rates', title: 'Capsule drop rates', description: 'Every prize in the Tiny Tides Capsule Machine with its exact chance, the guarantee and the spending limits.' },
  { file: 'parents', title: 'Parents’ guide', description: 'What is in Tiny Tides and how to control in-app purchases and capsule pulls.' },
  { file: 'support', title: 'Support', description: 'Help with Tiny Tides: restoring purchases, refunds, lost progress and contacting us.' },
  { file: 'licenses', title: 'Open-source licenses', description: 'Third-party software used by Tiny Tides.' },
];

export function buildSite() {
  const v = vars(), layout = read('legal/templates/_layout.html'), files = new Map();
  for (const p of PAGES) {
    const body = render(read(`legal/templates/${p.file}.body.html`), v, `${p.file}.body.html`);
    files.set(`${p.file}.html`, render(layout, { ...v, title: p.title, description: p.description, bodyHtml: body }, '_layout.html'));
  }
  files.set('style.css', read('legal/assets/style.css'));
  files.set('source/native-purchases-8.8.1.patch', read('patches/@capgo+native-purchases+8.8.1.patch'));
  return files;
}

/** Documents for App Store Connect that live in store/ (paths relative to the project root). */
export function buildStoreDocs() {
  const v = vars(), docs = new Map();
  const terms = render(read('legal/templates/terms.body.html'), v, 'terms.body.html');
  docs.set('store/EULA.txt', htmlToText(terms, config.baseUrl) + '\n');
  docs.set('store/APP_REVIEW_NOTES.md', render(read('legal/templates/app-review-notes.md'), v, 'app-review-notes.md'));
  return docs;
}
function htmlToText(html, base) {
  const ent = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, t) => `${t.replace(/<[^>]+>/g, '')} (${/^https?:|^mailto:/.test(href) ? href.replace(/^mailto:/, '') : `${base}/${href}`})`)
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, t) => `\n\n${t.toUpperCase()}\n`)
    .replace(/<div class="callout">([\s\S]*?)<\/div>/g, (_, t) => `\n${t}\n`)
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_, inner) => { let i = 0; return inner.replace(/<li>/g, () => `\n(${String.fromCharCode(97 + i++)}) `); })
    .replace(/<li>/g, '\n- ')
    .replace(/<\/(p|ul|ol)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ent[m])
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ------------------------------------------------------------------ run
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = buildSite(), docs = buildStoreDocs();
  const outputs = [...files].map(([f, c]) => [path.join(outDir, f), c, `site/${f}`]).concat([...docs].map(([f, c]) => [path.join(root, f), c, f]));
  if (checkOnly) {
    const stale = outputs.filter(([p, c]) => !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== c).map(([, , name]) => name);
    if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run: npm run site`); process.exit(1); }
    console.log(`site/ and store docs are up to date (${outputs.length} files)`);
  } else {
    for (const [p, c] of outputs) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); }
    console.log(`site: wrote ${files.size} pages/assets to ${path.relative(process.cwd(), outDir) || '.'} and ${docs.size} store documents`);
  }
}
