# Adding a language

The game ships in English, but every piece of text already goes through the translation system, so a language can be added without touching the game code:

1. `node tools/i18n.js extract` refreshes `game/i18n/source.json` (every English string with a note on where it appears).
2. A translator writes `game/i18n/<code>.json`, mapping each English string to its translation. Supported codes: es, fr, de, it, pt-BR, ja, ko, zh-Hans, zh-Hant (add others in `LANGS` in `game/src/00-i18n.js` and `LANG_CODES` in `tools/build.py`).
3. `node tools/i18n.js check <code>` must report no missing strings and no placeholder mismatches.
4. `python3 tools/build.py --target native` embeds the catalog. The game then follows the device language and shows a Language option in Settings.
5. Check the layout: `cd game/tests && node layout.js --lang <code>`, and run `node i18n.js`.
6. Add the language to the iOS app so the App Store lists it: add `<code>.lproj/InfoPlist.strings` (with `CFBundleDisplayName = "Night Precinct";`) under `ios/NightPrecinct/`.
7. Optional but recommended for some markets: translated legal pages in `legal/<code-lowercase>/` (the game opens `.../<code>/privacy.html` automatically when that language is active, so upload them before shipping the language) and App Store text in `appstore/metadata/<asc-locale>/`. Japan (tokushoho notice), Korea and Taiwan (loot-box odds disclosures) expect local-language texts; see `appstore/COMPLIANCE_BY_COUNTRY.md`.

The detailed brief below was written for professional translators working on this project and can be handed to them as is.

---

# Translation brief: Night Precinct (iOS idle game)

You are a professional game localizer and native speaker of the target language. Translate the game, its App Store listing and its legal/support pages. Quality bar: it must read as if written natively for that market by a game studio (natural, punchy, fun in-game text; precise, formal legal text). Never literal word-for-word. Keep it family-friendly.

Work from the `night-precinct/` folder (called ROOT below). Touch only the files for your language. Do not edit game/src, tools/, docs/ or any English file. Put scratch files under /tmp/np_<code>/.

Read first: docs/FACTS.md (what the game is and does), game/i18n/source.json (every English string of the game, with a note about where it appears), and skim legal/*.html.

## Work in this order

### 1. Glossary: game/i18n/glossary/<code>.json
Decide the fixed translation of the recurring terms before anything else, then use them identically everywhere (game, store listing, legal pages). At least: Gold Badges, Medals, Chief's Club (the weekly VIP subscription; you may keep the English name if that is natural in your market, but be consistent), Career Pass, Premium, Rally Boost, Supply Drop, Daily Roll Call, Evidence Safe, Precinct Patron, Rookie Starter Pack, Daily Deal, Crate Trio, Cash Crate, Recruit Rush, Auto-Clicker, Combo Auto-Clicker, crate, Standard/Elite/Legend (crate tiers), Common/Rare/Epic/Legendary (gear rarity), gear, pity guarantee, Re-enlist, Promote, Restore Purchases, Manage Subscription, Terms of Use, Privacy Policy, Purchase Terms, Crate odds, the three world names (Night Precinct, Ember Station, Golden Hour: world names may be translated; the app name "Night Precinct" itself stays in English as a brand), Apple Account, Settings (use Apple's official iOS UI terms for your language: e.g. Ajustes / Réglages / Einstellungen / Impostazioni / Ajustes / 設定 / 설정 / 设置 / 設定; "Apple Account" as Apple localizes it).

### 2. Game strings: game/i18n/<code>.json
A JSON object mapping every key of source.json (the exact English text) to your translation. All 1000+ keys, nothing left in English except proper names (personal names of characters may stay; keep "Night Precinct"). Write it with a small Python script (json.dump with ensure_ascii=False, indent=1) so it is valid JSON and the keys are byte-identical to source.json.
Rules:
- Keep every {placeholder} exactly (same names, you may move them). Keep inline tags such as <strong>...</strong> as in the source.
- {units}: in English this is the unit name with an "s" added; in your language it is the SINGULAR unit name, so phrase around it (e.g. "25 x {units}", "{units} x25", counters in CJK) to avoid wrong plural/gender agreement. Similar care with {unit}, {rank}, {world}, {crate}, {name}: they are inserted nouns in your language; avoid constructions that need grammatical agreement you cannot guarantee (articles, cases). Use colons or neutral phrasing where needed.
- Durations: "{n}s" seconds, "{n}m" MINUTES, "{h}h {m}m", "{d}d" etc. Use your language's compact convention (e.g. "{n} min", "{h} h {m} min", "{n}秒", "{h}時間{m}分", "{n}분", "{n}分钟").
- Ticker lines (notes say "news ticker line") are shown right after a unit's short name, which is their subject ("Cadet wrote up a jaywalker in a clown suit"). Make each one read naturally after the short name in your language (for SOV languages write a predicate that follows the name + a particle is not shown, so you may write e.g. "が..." style carefully or a sentence fragment that reads well after a name followed by a space). Keep the humour; adapt jokes, do not translate them literally.
- Short labels have limits in the notes (tab labels max 8 characters, buttons short, chip labels capitals). German/French run long: prefer natural short words. CJK: count each character as roughly 2 Latin characters of width.
- Capitals: where the English is in CAPITALS (chips, BUSTED/DOUSED/SAVED, WANTED, 24H DONUTS), use capitals in Latin-script languages; CJK has no case.
- Numbers like x2, x1.5, +50%, 24h stay as numbers; the game formats decimals itself.
- "Chief's Club renews automatically..." and the purchase-sheet texts are Apple-required disclosures: translate precisely, use the iOS path in your language (Settings > [your name] > Subscriptions as iOS shows it).
- Check: `cd ROOT && node tools/i18n.js check <code>` must say "N/N translated" with no missing and no placeholder/tag mismatches.

### 3. Layout check (your language)
```
cd game/tests && export NODE_PATH=$(npm root -g)
NP_BUILD_OUT=/tmp/np_<code>/build.html node -e "require('./lib').build()"
NP_BUILD_OUT=/tmp/np_<code>/build.html node layout.js --lang <code>
```
It reports clipped buttons, overflow and off-screen elements at phone and tablet sizes for your language. Fix every reported problem by shortening your text (then rebuild and rerun) until it prints NO LAYOUT ISSUES. Also look at a few screenshots yourself (use Playwright: open file:///tmp/np_<code>/build.html, call `window.__np.applyLanguage('<code>')`, then `window.__np.showTab('shop')` etc.; tabs are hq, roster, upgrades, ops, shop, career; `window.__np.settingsModal()` opens Settings). Fix anything that reads badly in context.

### 4. App Store listing: appstore/metadata/<asc-locale>/ for each App Store locale listed for your language
Source: appstore/metadata/en-US/ (read LIMITS.md there). Create these files (plain UTF-8 text, no trailing blank line):
- name.txt: exactly `{{APP_NAME}}`
- subtitle.txt: max 30 characters, localized, sells the game (idle police/fire/EMS tycoon).
- promotional_text.txt: max 170 characters.
- description.txt: max 4000 characters. Natural marketing copy with the same facts and the same required disclosures as the English one (subscription terms, price note, "Terms of Use: {{TERMS_URL_XX}}", "Privacy Policy: {{PRIVACY_URL_XX}}" where XX is your URL suffix below, odds URL {{ODDS_URL_XX}}, the fiction disclaimer, Belgium/Brazil rule, no ads, offline). Keep {{APP_NAME}} tokens.
- keywords.txt: max 100 characters, comma-separated, no spaces after commas, no words already in the app name or subtitle, no competitor or brand names, no "free"/"best". Research-style: the words people in your market actually search for idle/clicker/tycoon, police, firefighter, ambulance/paramedic games.
- release_notes.txt: short, same content as English.
- support_url.txt: `{{SUPPORT_URL_XX}}`, marketing_url.txt: `{{WEBSITE_URL}}`, privacy_url.txt: `{{PRIVACY_URL_XX}}`
Do not create copyright, categories or review notes (those are not localized).
Check: `cd ROOT && python3 tools/apply_config.py --no-build` must print no PROBLEM line for your folders.

### 5. Legal and support pages: legal/<dir>/ (dir given below)
Translate these English pages into the same file names inside your folder: index.html, privacy.html, terms.html, purchases.html, odds.html, support.html, notices.html (and japan.html ONLY for Japanese). They are static HTML with {{TOKENS}} filled later by a script.
- Keep the HTML structure, ids, classes, tables and all {{TOKENS}} exactly. Set `<html lang="<code>">`. Stylesheet link becomes `../legal.css`. Internal links between the pages stay as they are (same folder). The canonical link and any link or text that shows one of our page URLs uses the localized token: {{PRIVACY_URL}} -> {{PRIVACY_URL_XX}}, {{TERMS_URL}} -> {{TERMS_URL_XX}}, {{PURCHASE_TERMS_URL}} -> {{PURCHASE_TERMS_URL_XX}}, {{ODDS_URL}} -> {{ODDS_URL_XX}}, {{SUPPORT_URL}} -> {{SUPPORT_URL_XX}}, {{NOTICES_URL}} -> {{NOTICES_URL_XX}}. Keep {{WEBSITE_URL}}, e-mail tokens and all other tokens unchanged.
- Language bar (p class="langs" in the footer): rewrite the links for a page inside your folder: English -> `../<page>.html`, every other language -> `../<dir>/<page>.html`, and put aria-current="true" on YOUR language instead of English.
- In index.html the link to the Japan notices points to `../ja/japan.html` (except in the Japanese folder, where it is `japan.html`).
- The HTML comment on line 2 (TEMPLATE note) stays in English.
- Legal accuracy first: translate meaning exactly, use the standard legal terminology of your language, keep every right, obligation, number, time limit and percentage identical. Do not add or remove legal content. At the top of terms.html, privacy.html and purchases.html (right after the h1 meta line), add one short paragraph in your language: "This is a translation. If it differs from the English version, the English version applies, except where the law where you live requires this version to apply." with a link to the English page (`../<page>.html`).
- notices.html: translate the prose, but the licence texts inside <pre> blocks stay exactly as they are (in English).
- Use the language's usual typography (e.g. French spaces before : ; ! ?, German quotes „…“, Japanese 「」, Chinese full-width punctuation).
- Check each page: valid HTML (balanced tags), every {{TOKEN}} of the English page is present (with the localized URL variants), no English sentences left. Run `cd ROOT && python3 tools/apply_config.py --no-build` and open a couple of the rendered pages from release/legal/<dir>/ in Chromium at 375px width to see they render.

## Report back (short)
Files written, the check results (i18n check line, layout result, apply_config result), glossary choices worth knowing, anything you could not do, and any English source text you think is wrong or ambiguous.
