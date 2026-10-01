# Build, test and ship Night Precinct without a Mac

Everything below happens in a web browser. A GitHub-hosted Mac builds the app for you
(`.github/workflows/night-precinct-ios.yml` in the repository root).

## You do NOT need these

- **Safari Web Extension Packager** (App Store Connect, Xcode Cloud tab). That tool turns a
  *browser extension* (an add-on for Safari, like a Chrome extension) into an app. Night Precinct
  is a normal iPhone and iPad game, not a browser extension. Uploading it there would not give you
  a working game. Ignore that box.
- **Xcode Cloud.** It also builds apps in the cloud, but its first workflow has to be created
  inside Xcode on a Mac. The GitHub build does the same job without one.

## What happens automatically

Every push to the repository that changes `night-precinct/` runs two checks (see the **Actions**
tab on GitHub):

- **Game tests**: the browser test suite. It also fills in your store text and legal pages
  from `release.config.json`; download them from the run page under **Artifacts**
  (`app-store-text-and-legal-pages`).
- **Compile the iOS app**: builds the Swift app for the simulator and for iPhone, unsigned. A
  green tick means the iOS code compiles. No Apple account is involved.

## One-time setup for TestFlight (about 30 minutes)

You need a paid Apple Developer Program membership.

1. **Pick your bundle ID.** A unique reverse-domain name, for example
   `com.yourname.nightprecinct`. It can never change once the app is on the App Store.

2. **Fill in `night-precinct/release.config.json`** (on GitHub: open the file, click the pencil,
   edit, Commit changes). For TestFlight only `BUNDLE_ID` and `TEAM_ID` must be real:
   - `BUNDLE_ID`: from step 1.
   - `TEAM_ID`: [developer.apple.com/account](https://developer.apple.com/account) >
     Membership details > Team ID (10 letters and digits).
   - Fill in the rest (company name, address, e-mails, URLs, governing law)
     before you submit to App Review.

3. **Register the bundle ID.** developer.apple.com > Certificates, Identifiers & Profiles >
   Identifiers > **+** > App IDs > App > Continue. Description: Night Precinct. Bundle ID:
   Explicit, the same value as in step 2. No extra capabilities are needed (in-app purchase
   is always on). Register.

4. **Create the app in App Store Connect.** [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   > Apps > **+** > New App. Platform iOS, name "Night Precinct" (it must be free on the
   App Store; pick another name if it is taken and change `APP_NAME` to match), primary
   language English (U.S.), the bundle ID from step 3, SKU anything (for example
   `NIGHTPRECINCT1`), User Access: Full Access.

5. **Create an API key and give it to GitHub.**
   - App Store Connect > Users and Access > Integrations > App Store Connect API > Team Keys >
     **+**. Name: GitHub. Access: **Admin** (the build needs it to create the signing
     certificate for you). Generate.
   - Download the key (`AuthKey_XXXXXXXXXX.p8`). Apple lets you download it **only once**;
     keep it somewhere safe and never commit it to the repository.
   - Note the **Key ID** (next to the key) and the **Issuer ID** (above the list).
   - On GitHub: your repository > Settings > Secrets and variables > Actions >
     New repository secret. Add three secrets:

     | Name | Value |
     |---|---|
     | `ASC_KEY_ID` | the Key ID |
     | `ASC_ISSUER_ID` | the Issuer ID |
     | `ASC_KEY_P8` | open the .p8 file in a text editor and paste all of it, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

   Secrets are encrypted; nobody can read them back, not even on a public repository.

6. **Create the in-app purchases.** GitHub > Actions > **Night Precinct in-app purchases** >
   Run workflow > mode **create**. It creates all 16 from `appstore/iap.json` (IDs, types,
   names, descriptions, US prices with Apple's equivalents elsewhere, availability without
   the excluded countries, and an App Review screenshot from `appstore/iap-review/`), and
   skips anything that already exists. Mode **check** only reports. (Done once already on
   1 October 2026: the 15 one-time products are Ready to Submit.)
7. **Activate the Paid Apps agreement**: App Store Connect > Business > Agreements > Paid Apps,
   with bank account and tax forms. Until it is Active, no product loads anywhere, TestFlight
   included, and the Store shows "..." instead of prices.

## Legal pages (privacy policy, terms, support)

They are published automatically with GitHub Pages at https://masono21.github.io/one-click-hugo-cms/
(privacy.html, terms.html, purchases.html, odds.html, support.html, notices.html). The workflow
**Night Precinct legal pages** fills them in from `release.config.json` and republishes on every
change to `legal/` or the config; it refuses to publish while a placeholder is left.
One-time switch: GitHub > Settings > Pages > Build and deployment > Source **Deploy from a branch**,
branch **gh-pages**, folder **/ (root)**, Save.

## Upload a build to TestFlight

GitHub > **Actions** > **Night Precinct iOS** > **Run workflow** > pick the branch > tick
**Upload to TestFlight** > Run workflow. It takes about 15 to 25 minutes. When the
"Upload to TestFlight" job is green, Apple processes the build (usually 5 to 30 minutes;
you get an e-mail).

Every run uses a higher build number automatically, so you can upload as often as you like.

If the job fails, open it: the error says what is missing (a secret, the bundle ID, the Team
ID). The full logs are under **Artifacts** (`testflight-logs`).

## Test it on your iPhone

1. App Store Connect > your app > **TestFlight** > Internal Testing > **+** to create a group,
   add yourself (your Apple Account must be a user in App Store Connect; the account holder is).
2. Install **TestFlight** from the App Store on your iPhone and accept the invitation.
3. Install Night Precinct from TestFlight and work through `appstore/SUBMISSION_CHECKLIST.md`,
   section "Device testing". Purchases in TestFlight are free (Apple's sandbox), so test every
   one, plus Restore Purchases and the subscription.

## Submit for review

When the TestFlight build works: App Store Connect > your app > the 1.0.0 version page.

- Screenshots and app preview: GitHub > Actions > **Night Precinct store screenshots and video**
  > Run workflow > **upload**. It puts the six 6.9-inch iPhone and six 13-inch iPad screenshots
  and the app preview video on the English (U.S.) page, and renames the version to match the
  build (1.0.0). Done once already on 1 October 2026. To replace them later, delete the old ones
  in App Store Connect and run it again.
- Everything else on the page: GitHub > Actions > **Night Precinct store listing** > Run workflow >
  **apply** (**check** only reports). From `appstore/metadata/en-US/` and `appstore/store.json` it sets
  the store text and URLs, subtitle, privacy policy URL, categories (Games: Simulation, Strategy), the
  age-rating answers (`appstore/AGE_RATING.md`), content rights, copyright, manual release, the App
  Review contact, notes and "no sign-in", the newest processed build, a free price, and the countries
  (not in Belgium, Brazil, mainland China, Vietnam, Russia, Japan or the EU). It also answers export
  compliance for the newest build and adds it to your internal TestFlight group. It never submits.
- What the API cannot do, so you do it in App Store Connect (the workflow lists what is still open at
  the end of its log): the App Privacy answers ("Data Not Collected", `appstore/APP_PRIVACY.md`), the
  App Review phone number (or add it as the GitHub secret `ASC_REVIEW_PHONE`, for example
  `+1 480 555 0100`, and run apply again; Apple will not save the review notes without it), the Paid Apps agreement, and finally adding the 16 in-app purchases to
  the version and Submit for Review. The legal pages must be online (GitHub Pages, above) first.

## Costs and limits

- GitHub Actions is free for public repositories. If you make the repository private, macOS
  minutes count ten times against your free monthly allowance (GitHub Free includes 2,000
  minutes a month). A macOS build takes about 10 minutes, so that allows roughly 20 macOS
  builds a month, and every push to `night-precinct/` runs one. Check the current allowance
  on GitHub's billing page.
- The repository is currently **public**: anyone can see the game's code. To make it private:
  GitHub > Settings > General > Danger Zone > Change visibility.
