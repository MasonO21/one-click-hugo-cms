# Build, test and upload Tiny Tides without a Mac

Tiny Tides is an iPhone/iPad app. To get it onto the App Store it has to be built with Xcode on a Mac, uploaded to App Store Connect, tested with TestFlight, then submitted. If you don't own a Mac, GitHub can lend you one: the workflow `.github/workflows/tiny-tides-ios.yml` builds the app on a GitHub-hosted Mac and uploads it to App Store Connect.

> **Ignore App Store Connect’s “Safari Web Extension Packager”.** It turns browser add-ons for Safari into apps. Tiny Tides isn’t a Safari extension, so don’t upload anything there.
>
> **Xcode Cloud** (Apple’s own build service) also works, but its first setup has to be done in Xcode on a Mac. If you ever borrow a Mac, see “If you have a Mac” below; the project already contains the script Xcode Cloud needs (`ios/App/ci_scripts/ci_post_clone.sh`).

## One-time setup (about 30 minutes, plus Apple’s enrollment wait)

1. **Join the Apple Developer Program** at developer.apple.com/programs (US$99/year) and accept the agreements in App Store Connect → Business (see `legal/APP_STORE_ADMIN_CHECKLIST.md` §1).
2. **Find your Team ID**: developer.apple.com → Account → Membership details → *Team ID* (10 characters, like `A1B2C3D4E5`).
3. **Create an App Store Connect API key**: App Store Connect → Users and Access → **Integrations** → App Store Connect API → *Team Keys* → **+**. Name it `GitHub`, set Access to **Admin** (needed so the build can create its own signing certificates), click Generate, then:
   - write down the **Key ID** and the **Issuer ID** shown above the table;
   - click **Download** to save the `AuthKey_XXXXXXXXXX.p8` file. Apple lets you download it **only once**, so keep it somewhere safe.
4. **Add four secrets to the GitHub repository**: on GitHub open the repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | your Team ID |
   | `ASC_KEY_ID` | the Key ID |
   | `ASC_ISSUER_ID` | the Issuer ID |
   | `ASC_KEY_P8` | open the `.p8` file in a text editor and paste **everything**, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

   Secrets are encrypted; nobody, including you, can read them back from GitHub, and they never appear in build logs.

## Make a test build

0. **Merge the game’s branch into your main branch** (once, and again after future changes): GitHub only shows *Run workflow* for workflows on the repository’s default branch. On GitHub: **Pull requests** → **New pull request** → base `main` (or `master`) ← compare `claude/tiny-tides-game` → Create → **Merge**.
1. On GitHub: **Actions** → **Tiny Tides iOS → TestFlight** → **Run workflow**. For the very first run, **untick “Upload”**: this only builds the app and registers its bundle ID (`com.tinytides.game`) with Apple. It takes about 10–20 minutes. A green tick means it worked.
2. **Create the app record** (once): App Store Connect → Apps → **+** → New App → iOS, name *Tiny Tides*, language English (U.S.), bundle ID `com.tinytides.game`, SKU `tinytides-ios-001` (more fields in `legal/APP_STORE_ADMIN_CHECKLIST.md` §3).
3. **Run the workflow again with “Upload” ticked.** When it finishes, App Store Connect needs another 5–30 minutes to process the build.
4. **Test on your iPhone**: App Store Connect → your app → **TestFlight** → add yourself under *Internal Testing* (answer the export-compliance question “No” if asked; the app already declares it). Install Apple’s free **TestFlight** app on your iPhone, accept the invite, and play. Purchases in TestFlight are free test purchases.

Each run gets the next build number automatically (the run number), so you can run it as often as you like.

## The build you submit for review

Fill in `legal/site.config.json` and put the `site/` folder online first (see `legal/README.md`). Then run the workflow with **“Release build” ticked**: it refuses to build while placeholders remain, so a build with placeholder legal links can’t reach App Review. In App Store Connect, choose that build on the version page and submit (`legal/APP_STORE_ADMIN_CHECKLIST.md` §5).

## Cost

- **Public GitHub repository:** GitHub-hosted Macs are free.
- **Private repository:** Mac minutes count 10× against your plan’s free minutes (the free plan’s 2,000 minutes ≈ 200 Mac minutes, about 10 builds a month). Settings → Billing shows what’s left.

## If something fails

Open the failed run and the red step; the last lines say why.

- **“Missing repository secrets”**: one of the four secrets above is missing or misspelled.
- **Signing errors** (“No profiles for 'com.tinytides.game' were found”, “requires a provisioning profile with the Declared Age Range feature”): open developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → `com.tinytides.game` → turn on **In-App Purchase** and **Declared Age Range** → Save, then run again. Also check that the API key has **Admin** access.
- **“Maximum number of certificates”**: each run on a fresh GitHub Mac may create an *Apple Development* certificate named “Created via API”. Revoke old ones under Certificates, Identifiers & Profiles → Certificates. Your App Store build isn’t affected.
- **Upload rejected because the build number was already used**: just run the workflow again (it gets a new number).

This workflow hasn’t been run yet: it can only run with your Apple account. If a step fails in a way this list doesn’t cover, copy the error into a new Claude session together with this file.

## If you have a Mac

The simplest route is Xcode itself: `npm ci`, `npm run ios:sync`, `npm run ios:open`, choose your Team under *Signing & Capabilities*, then **Product → Archive → Distribute App → App Store Connect** (details in `docs/APP_STORE_RELEASE.md`). With Xcode 26.2 or later you can also start **Xcode Cloud** from the Report navigator → Cloud → Get Started. Its builds run `ios/App/ci_scripts/ci_post_clone.sh` automatically, which installs Node, builds the game and syncs it into the Xcode project.
