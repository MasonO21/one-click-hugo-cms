# Ghost Mode on iPhone: build plan

The demo at `/ghost-mode/` shows what Ghost Mode can do on an iPhone (set a child's phone to iPhone in Settings, or use Maya in the demo). This page explains how to build each piece for real, using only what Apple allows.

Apple's rules change. Everything below reflects them as of mid-2026. Check the current documentation and App Review Guidelines before building, especially the items marked **Check with Apple**.

## The short version

Apple doesn't let any app read texts, iMessages, or other apps' messages on an iPhone. Ghost Mode on iPhone works with what Apple does allow:

| Feature | How it works on iPhone | Notes |
|---|---|---|
| Late-night activity | Screen Time (`DeviceActivity`): minutes in messaging and social apps during quiet hours | Minutes, not message counts. Nothing about who. |
| Pause social apps at night | Screen Time (`ManagedSettings` shields) during quiet hours | Texts and calls keep working. |
| Email checks (adult contacts, grooming signs, scams, bullying) | Gmail API or Microsoft Graph, checked on the phone | Gmail needs Google's yearly security review (CASA). |
| Fake-website blocking | Network Extension content filter in a Family Controls app | **Check with Apple** on the current filter requirements. |
| Distress, location sharing, think-twice before sharing personal details | Optional Ghost Mode keyboard, turned on by the child | **Check with Apple:** App Review guideline 4.4.1 limits what keyboards may collect. |
| Texts and iMessage | Optional home-computer sync that reads the iPhone's local backup | Catches up about once a night. Needs a Mac or PC. |
| Nude photo protection | Apple's built-in Communication Safety | Ghost Mode only helps parents turn it on. |
| Messages in Instagram, TikTok, Snapchat, Discord, Roblox | Not possible | The setup checklist links to each app's own parent tools. |

## What to build

### 1. Parent app (iPhone and Android)

- Shows alerts, notifications, quiet time and the morning roundup, the same as the demo.
- Receives alerts through Apple Push Notification service (APNs) and Firebase Cloud Messaging.
- A cross-platform framework (React Native or Flutter) or native SwiftUI and Kotlin all work.

### 2. Child app for iPhone

Built in Swift, with several extensions that share data through an App Group.

**Family Controls (required).**
- Request authorization with `AuthorizationCenter.shared.requestAuthorization(for: .child)`.
- The child must be in the parent's Apple Family Sharing group, on iOS 16 or later.
- Distribution needs the `com.apple.developer.family-controls` entitlement. Request it from Apple early: it's free but can take weeks.

**Late-night screen time (`DeviceActivity`).**
- Schedule a `DeviceActivitySchedule` for the quiet hours.
- Add threshold events (for example 15, 30, 45 and 60 minutes) on messaging and social app categories. The parent picks the categories with `FamilyActivityPicker`.
- When a threshold is reached, the `DeviceActivityMonitor` extension records it in the App Group. The main app then sends a `late_night_spike` alert with minutes.
- **Check with Apple:** whether the monitor extension can make network calls itself.
- The `DeviceActivityReport` extension can show usage on the child's phone but can't send that data anywhere.

**Pause apps at night (`ManagedSettings`).**
- During the quiet-hours schedule, set `shield.applicationCategories` for the chosen categories, and clear it when quiet hours end.

**Fake-website blocking (`NetworkExtension`).**
- A content filter (`NEFilterDataProvider`) checks the host name of each new connection against the same lookalike rules as the demo: `isLookalike()` in the engine.
- When it blocks a site, it shows the block page and sends a `scam_link` alert with `signs: ["blocked_site"]` and the site name. On iPhone the filter can't tell which chat the link came from.
- **Check with Apple:** content filters are allowed in Family Controls apps on children's devices that aren't supervised. Confirm the current requirements when you request the entitlements.
- A simpler fallback is `ManagedSettings` web content blocking with a fixed list of known scam domains.

**Ghost Mode keyboard (optional, the child turns it on).**
- A custom keyboard extension runs the detection rules on what the child types:
  - distress (`distressLevel()`);
  - live location (`locationShare()`);
  - personal details (`sharedKinds()`) for the think-twice prompt.
- It never stores or sends keystrokes. It only writes "a sign happened" to the App Group, which needs "Allow Full Access".
- It can't see which app it's typing in or who the message is for. That's why iPhone alerts from the keyboard say "From what Maya typed" with no contact.
- **Check with Apple:** guideline 4.4.1 says keyboards may only collect activity to improve the keyboard. Send a TestFlight build to App Review early.
- If Apple says no, ship the keyboard with only on-device help (the think-twice prompt and 988 support), with no parent alerts, which is clearly allowed.

**Email.**
- The child signs in once with Google or Microsoft (OAuth).
- Email is checked on the phone:
  1. The server gets Gmail push (Pub/Sub `watch`) or Microsoft Graph change notifications. These contain message IDs only, never content.
  2. The server sends a silent push to the child's phone.
  3. The phone fetches the new mail and runs the detection rules.
- `BGAppRefreshTask` is the backup, but iOS decides when it runs.
- Gmail's `gmail.readonly` is a restricted scope that needs Google's yearly CASA security assessment. Microsoft needs publisher verification.

**Notes to the child.**
- Ghost Mode can't put notes inside other apps' chats on iPhone.
- It sends them as local notifications from the Ghost Mode app and lists them in its "Notes from Ghost Mode" section, as in the demo.

**Sharing a chat for a report.**
- A share extension lets the child send screenshots of a chat to the parent, only when they choose to.

### 3. Home sync companion (optional)

- A small Mac and Windows app reads the Messages database from the iPhone's local backup and runs the same rules. It sends alerts only, never messages.
- The iPhone must back up to that computer, over USB or Wi-Fi sync.
- Encrypted backups need the backup password, entered by the parent.
- Expect it to catch up about once a night. The demo runs it at 3 AM and on "Sync now".
- Be clear with families about how this works, and get the child's agreement.

### 4. Server

- Pairs the parent and child phones (for example by QR code).
- Relays alerts and sends push notifications.
- Encrypt alerts end to end between the two phones (for example with CryptoKit), so the server can't read them.
- Stores no message content, ever.

## Reusing the detection rules

The rules are plain JavaScript in the section of `site/static/ghost-mode/index.html` that starts at `const SENS=`. `tests/ghost-mode/engine.test.js` tests them with 126 English and Spanish examples.

There are two ways to use them on iPhone:

- Run the same JavaScript with JavaScriptCore, which is built into iOS, in the app, the keyboard and the filter.
- Port the rules to Swift and turn the test file into Swift test fixtures, so both versions stay in step.

Keyboard extensions have tight memory limits, so keep the rules lean there.

## What leaves the child's iPhone

The same alert data as the demo's "What left the phone" log: the kind of alert, how serious it is, times, and the contact name when known. Never message text. These items are specific to iPhone:

| Data | Example |
|---|---|
| `screen_time` | `{ night, late_minutes, day, minutes_today }`: numbers only |
| Late-night alert | `unit: "minutes"`, with no chat count and no contacts |
| Blocked site | `site: "robux-gift-claim.xyz"` |
| Keyboard | `keyboard_on` / `keyboard_off` events |
| Home sync | `via: "home_sync"` on alerts it finds |

## App Store checklist

- Family Controls entitlement approved, plus Network Extension if you use the filter.
- Privacy nutrition labels and a privacy policy that explain on-device checking.
- Don't promise text or social media monitoring on iPhone in the App Store listing or screenshots.
- Make the keyboard work without Full Access for basic typing, and make it the child's choice.
- Make monitoring visible to the child. The child app should show what's checked, as the demo's "Ghost Mode on" screen does.
- Apple limits parental-control apps to its Screen Time tools rather than device management (MDM), so don't use MDM profiles.

## Suggested order

1. Parent app, server, pairing and alerts. Launch on Android first if you want, since it has full coverage.
2. iPhone child app with Family Controls: late-night screen time and pausing apps.
3. Email checking.
4. Fake-website filter.
5. Ghost Mode keyboard. Get App Review's answer on a TestFlight build first.
6. Home sync companion (optional, last).
