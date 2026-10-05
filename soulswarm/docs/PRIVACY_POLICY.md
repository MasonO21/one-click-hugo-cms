# Soulswarm Privacy Policy (template)

> **Template.** Replace every `[bracketed]` value and have a lawyer review it before publishing. App Store Connect and Google Play both require a public URL for this policy. Update it whenever you add an SDK; the sections marked *Production* describe the SDKs planned in `PRODUCTION_ROADMAP.md`.

**Effective date:** [YYYY-MM-DD]
**Publisher:** [Studio legal name], [address] ("we", "us")
**Contact:** [privacy@yourstudio.com]

## 1. What this policy covers
This policy explains what information the Soulswarm mobile game ("the Game") collects, why, and the choices you have.

## 2. Information the Game stores on your device
The Game saves your progress on your own device: heroes, relics, currencies, settings, quest and pass progress. This data stays on the device and is deleted when you uninstall the Game or use **Settings → Reset progress**.

*Current build:* the Game sends no personal information to us or to third parties.

## 3. Information collected when online features are enabled *(Production)*
| Data | Why | Shared with |
|---|---|---|
| A random player ID and game progress | Cloud save, cross-device restore, anti-cheat | [Backend provider, e.g. Nakama / PlayFab] |
| Purchase receipts (no card details) | Delivering and restoring purchases, fraud prevention | Apple / Google, [RevenueCat] |
| Device model, OS version, crash logs | Fixing crashes and performance problems | [Crash reporting provider] |
| Gameplay events (e.g. level reached, run length) | Balancing difficulty and improving the Game | [Analytics provider, e.g. GameAnalytics / Firebase] |
| Advertising ID (only with your permission on iOS) | Showing and measuring the optional rewarded videos | [Ad mediation, e.g. AppLovin MAX] and its partners |

We never see or store your payment card details. Purchases are handled entirely by Apple or Google.

## 4. Advertising
Ads in the Game are **optional rewarded videos** that you choose to watch for a reward. On iOS we ask permission through Apple's App Tracking Transparency prompt before any cross-app tracking. You can decline, and the Game still works. On Android you can reset or opt out of your advertising ID in system settings. Buying the Soul Pact removes the need to watch ads for rewards.

## 5. Children
The Game is not directed at children under [13 / 16, depending on region]. We do not knowingly collect personal information from children. If you believe a child has provided us information, contact us and we will delete it. Purchases on child accounts are governed by Apple and Google parental controls.

## 6. Your rights
Depending on where you live (for example under GDPR or CCPA/CPRA), you may have the right to access, correct, delete or port your data, and to object to or restrict processing. Email [privacy@yourstudio.com] with your player ID (shown in **Settings**) and we will respond within 30 days. You can withdraw consent for analytics or ads at any time in **Settings → Privacy**.

## 7. Retention
On-device data is kept until you delete it. Server-side data *(Production)* is kept while your account is active and deleted within [90] days after a deletion request, except where the law requires us to keep purchase records.

## 8. Security
We use encryption in transit (HTTPS), server-side receipt validation and access controls. No system is perfectly secure, and we will notify you and the relevant authorities of a breach as the law requires.

## 9. International transfers
Our providers may process data outside your country under appropriate safeguards (e.g. Standard Contractual Clauses).

## 10. Changes
We will post updates here and change the effective date. We will notify you in-game of significant changes.

## 11. Contact
[Studio legal name] · [address] · [privacy@yourstudio.com] · EU representative: [if applicable]
