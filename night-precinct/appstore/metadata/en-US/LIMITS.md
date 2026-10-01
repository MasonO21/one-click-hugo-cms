# Field limits for the en-US metadata

Limits are what I know of App Store Connect (ASC) today. **Verify in App Store Connect**: ASC shows a live counter in each field and refuses to save a field that is over. If a limit below differs from what ASC shows, ASC wins.

The text files contain double-brace tokens such as `{{APP_NAME}}`. The limit applies to the text AFTER `python3 tools/apply_config.py` has filled the tokens in, so the "resolved" column is the one that matters. It was measured with the placeholder values in `release.config.json` and `YEAR` = 2026 (the script fills `YEAR` with the current year). Your real company name and URLs will be a little longer or shorter, so re-run the check after you fill in the config.

`tools/apply_config.py` checks these limits itself. It writes the filled-in text to `release/appstore/metadata/en-US/` and prints `PROBLEM: metadata/en-US/<file> is N characters (limit M)` for any file over its limit, then exits with status 1. It counts characters after removing trailing newlines. The limits it uses are 30 (name, subtitle), 170 (promotional text), 100 (keywords), 4000 (description, What's New, review notes), 200 (copyright) and 255 (the three URLs). The last two are the script's own assumptions; see the note in the table.

| File | ASC field | Limit | Raw length (with tokens) | Resolved length (placeholder config) | Notes |
|---|---|---|---|---|---|
| `name.txt` | App Name | 30 | 12 | 14 | Must be unique on the App Store. Do not put the word "free" or a price in it. |
| `subtitle.txt` | Subtitle | 30 | 16 | 30 | The default subtitle is exactly 30 characters, so any edit that adds text will go over. |
| `promotional_text.txt` | Promotional Text | 170 | 148 | 148 | Can be changed at any time without a new build or review. |
| `description.txt` | Description | 4000 | 3846 | 3948 | Only about 50 characters of headroom for a longer app name and longer URLs (the app name appears three times, the Odds, Terms and Privacy URLs once each). Contains the subscription disclosure paragraph and starts with the "Contains loot boxes" line (keep that line first). If your real URLs push it over, shorten the feature list, not the disclosures. |
| `keywords.txt` | Keywords | 100 | 96 | 96 | Comma separated, no spaces after commas. Counts commas. |
| `release_notes.txt` | What's New in This Version | 4000 | 513 | 547 | |
| `review_notes.txt` | Notes (App Review Information) | 4000 | 3870 | 3901 | Paste-ready. About 100 characters of headroom for a longer company name, e-mail address and odds URL. It must stay under 4000 after substitution: if you add text here, cut text elsewhere in the file. |
| `support_url.txt` | Support URL | 255 (script's assumption) | 15 | 47 | A working https URL with real contact information. **Verify in App Store Connect** the maximum URL length. |
| `marketing_url.txt` | Marketing URL (optional) | 255 (script's assumption) | 15 | 34 | Optional. Leave the field empty if you have no marketing page. |
| `privacy_url.txt` | Privacy Policy URL | 255 (script's assumption) | 15 | 47 | Required for iOS apps. |
| `copyright.txt` | Copyright | 200 (script's assumption) | 25 | 30 | Format: `2026 Company Name` (no copyright symbol needed). `YEAR` is the year in which you run `apply_config.py`; make sure it is the year of first release when you paste it. **Verify in App Store Connect** whether ASC enforces a length limit. |
| `categories.txt` | Category, subcategories | n/a | | | Choices, not free text. |

In-App Purchase fields (see `../../IAP.md`):

| ASC field | Limit |
|---|---|
| IAP Reference Name | 64 (internal only) |
| IAP Localized Display Name | 30 |
| IAP Localized Description | 45 |
| Subscription Group Display Name | **Verify in App Store Connect** (I do not remember the exact limit; the name used here is 12 characters) |
| Product ID | letters, digits, periods and underscores; **Verify in App Store Connect** the maximum length |

## How the limits were chosen

- Name, subtitle, promotional text, description, keywords and What's New: 30 / 30 / 170 / 4000 / 100 / 4000.
- Keywords must not repeat words already in the name or subtitle (Apple indexes those fields already). The default name and subtitle contain: night, precinct, idle, police, fire, EMS, tycoon. None of these appear in `keywords.txt`. If you change `APP_NAME` or `APP_SUBTITLE`, re-check.
- `keywords.txt` contains no other app's name and no trademarks. Do not add any.
- The description may not promise anything the game does not do. Every mechanic in it was checked against the game source (`game/src/`); `../../README.md` lists each statement and how it was verified.

## Check the lengths after `apply_config.py`

Run this from the `night-precinct/` folder if you want a second opinion on the script's own check. It fills the tokens from `release.config.json` (and `YEAR` from the current year, the same way `apply_config.py` does), then prints each length against its limit. It only reads files.

```bash
python3 - <<'PY'
import json, re, datetime
cfg = json.load(open('release.config.json'))
cfg.setdefault('YEAR', str(datetime.date.today().year))
lim = {'name':30,'subtitle':30,'promotional_text':170,'description':4000,
       'keywords':100,'release_notes':4000,'review_notes':4000}
for k, n in lim.items():
    raw = open(f'appstore/metadata/en-US/{k}.txt', encoding='utf-8').read()
    out = re.sub(r'\{\{(\w+)\}\}', lambda m: cfg.get(m.group(1), m.group(0)), raw).rstrip()
    left = re.findall(r'\{\{\w+\}\}', out)
    print(f'{k:16} {len(out):5} / {n:<5} {"OK" if len(out) <= n and not left else "FIX"} {left or ""}')
kw = open('appstore/metadata/en-US/keywords.txt').read().strip()
print('keywords has spaces:', ' ' in kw)
PY
```

The same check for the In-App Purchase names and descriptions is at the end of `../../IAP.md`.
