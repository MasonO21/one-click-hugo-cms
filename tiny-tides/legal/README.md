# Legal pages & release paperwork

Everything the App Store and the law expect a game like this to publish is **generated from one file**, so the app, the website and the store listing can never disagree.

| You edit | It produces |
|---|---|
| `legal/site.config.json` (your name, email, address, web address, governing law…) | the website in `site/`, the offline “Legal & credits” screen and settings links in the app, `store/EULA.txt` |
| `src/data.js` (prices, odds, pity, daily limit) | the drop-rates page, the numbers quoted in the terms / parents’ guide / home page, and the in-game Rates tab (same data) |
| `package.json` dependencies | the open-source licenses page and the in-app licence list |

## The 5-minute setup

1. Open `legal/site.config.json` and replace **every** `YOUR …` / `.example` value. `_readme` explains each field. (`phone` is only needed for Apple’s EU trader form; it is never printed on the site.)
2. `npm run site` — writes the pages into `site/` (privacy, terms/EULA, drop rates, parents’ guide, support, licenses, home).
3. Host the `site/` folder at the `baseUrl` you chose (see “Hosting” below). The URLs must work **before** you submit.
4. `npm run legal:check` — fails while any placeholder is left, a page is stale, or the bundle id disagrees between the config, Xcode and Capacitor. `npm run release` runs it for you.
5. `npm run build` bakes the same details (publisher name, page addresses, licence texts) into the app.

Templates live in `legal/templates/*.body.html` (plain HTML with `{{placeholders}}`; names ending in `Html` are inserted as-is, everything else is escaped). An unknown placeholder is a build error, never a blank.

## What each document is for

| Page | Why it exists |
|---|---|
| `privacy.html` | Required by App Store Connect (Privacy Policy URL) and by law in most places. States that the app collects nothing. |
| `terms.html` + `store/EULA.txt` | Your End-User License Agreement. Contains all of Apple’s minimum terms (Apple as third-party beneficiary, warranty, product claims, IP claims, legal compliance…). Paste `store/EULA.txt` into App Store Connect → App Information → License Agreement → *Edit* (or leave Apple’s standard EULA on and just link the terms). |
| `rates.html` | Guideline 3.1.1 requires the odds of random paid items to be disclosed *before* purchase. Generated from the live table; a test compares it to what the game really rolls (including every possible weekly spotlight). |
| `parents.html` | How to block or limit purchases (Screen Time, Ask to Buy), how to switch off Sea Glass pulls. Good practice for a game that young people may play, and helpful in review. |
| `support.html` | App Store Connect requires a Support URL; answers the questions reviewers and users ask most (restore, refunds, lost saves). |
| `licenses.html` | Open-source notices (MIT / OFL / MPL-2.0). The MPL-2.0 plugin is modified, so the patch is published at `site/source/`. |

## Hosting the site

Any static host works. Pick one and set `baseUrl` to it.

* **GitHub Pages (free).** Put `site/` in a repository whose Pages source is that folder, or run the *Tiny Tides site → GitHub Pages* workflow in this repo (Actions → run manually; requires Pages set to “GitHub Actions” in the repository settings). The address is then `https://<user>.github.io/<repo>`.
* **Netlify / Cloudflare Pages / your own domain.** Publish the `site/` folder as-is (no build step).

## Keeping it true

* Change a price, an odd, the daily limit or the pity rule in `src/data.js` → run `npm run site && npm test`. The tests fail if the website, the terms or the in-game Rates tab would say something the game does not do.
* Change what the app collects or connects to (analytics, cloud saves, accounts, ads…) → **stop**: update `templates/privacy.body.html`, `legal/DATA_MAP.md`, `ios/App/App/PrivacyInfo.xcprivacy` and the App Privacy answers in App Store Connect *first*. A test fails if a tracking SDK or a network call sneaks into the source.
* Publish a new effective date in `site.config.json` whenever the wording of the policy or terms changes.

## Not legal advice

These documents follow Apple’s published requirements and common practice, but laws differ by country and change. Have a lawyer read `privacy.body.html`, `terms.body.html` and the territory list in `legal/APP_STORE_ADMIN_CHECKLIST.md` before you release, especially the governing-law clause, the consumer-rights wording for your markets, and paid random items (“loot boxes”).
