# Native bridge protocol (web game <-> iOS shell)

The game runs in a `WKWebView` that loads the bundled `www/index.html` from the app bundle (`file://`). It talks to Swift through **one** message handler named `np`, using `WKScriptMessageHandlerWithReply` (iOS 14+), so JavaScript can `await` a reply:

```js
const reply = await window.webkit.messageHandlers.np.postMessage({ cmd: 'products', ids: [...] });
```

Every message is a JSON object with a `cmd` string. Every reply is a property-list-safe dictionary that always contains `ok` (Bool). On failure: `{ ok:false, error:"short message" }`. The handler must never throw or leave a reply unanswered.

## Boot data (native -> JS, before any game script runs)

A `WKUserScript` injected at `.atDocumentStart` defines:

```js
window.NP_BOOT = {
  save: "<string or null>",      // contents of Application Support/save.json, or null if none
  region: "US",                  // Locale.current.region?.identifier, uppercase, or ""
  locale: "en-US",
  languages: ["en-US"],          // Locale.preferredLanguages (the game picks its language from this list)
  version: "1.0.0",              // CFBundleShortVersionString
  build: "1",                    // CFBundleVersion
  reduceMotion: false,           // UIAccessibility.isReduceMotionEnabled
  platform: "ios"
};
```

## Commands (JS -> native)

| cmd | payload | reply |
|---|---|---|
| `products` | `ids: [String]` full product IDs | `{ok, products:[{id, displayName, displayPrice, price:"4.99", currency:"USD", type:"consumable"|"nonConsumable"|"autoRenewable", period:"P1W"|null}], missing:[String]}` |
| `purchase` | `id: String` | `{ok, status:"success"|"pending"|"cancelled", tx:{...}?}` |
| `finish` | `txId: String` | `{ok}` finishes the transaction with that ID (looked up in a native dictionary of not-yet-finished transactions kept since it was delivered) |
| `entitlements` | none | `{ok, entitlements:[tx]}` verified current entitlements: non-consumables plus active (unexpired, not revoked) subscriptions |
| `restore` | none | runs `try await AppStore.sync()`, then behaves like `entitlements`. A user-cancelled sync is `{ok:true, entitlements:[...]}` from whatever is cached |
| `unfinished` | none | `{ok, transactions:[tx]}` verified transactions from `Transaction.unfinished` |
| `storefront` | none | `{ok, countryCode:"BEL"}` the App Store country from `await Storefront.current`, ISO 3166-1 alpha-3. `{ok:false}` if unknown. The page maps it to alpha-2 and applies the country rules (`LOOT_BLOCKED_REGIONS`) |
| `save` | `data: String` | `{ok}` atomically writes `save.json` in Application Support (create the directory if missing; exclude nothing from backup) |
| `wipe` | none | `{ok}` deletes `save.json` |
| `openUrl` | `url: String` | `{ok}` opens `https:` URLs in `SFSafariViewController` presented from the top view controller. Reject any other scheme. Also accept exactly `https://apps.apple.com/account/subscriptions` |
| `manageSubscriptions` | none | `{ok}` calls `AppStore.showManageSubscriptions(in: windowScene)`; on failure fall back to opening `https://apps.apple.com/account/subscriptions` |
| `haptic` | `style: "light"|"medium"|"heavy"|"success"|"warning"|"error"` | `{ok}` uses `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator`. No-op if the device has no haptics |

### `tx` object

```js
{
  id: "2000000123456789",          // Transaction.id as a String
  originalId: "2000000123456789",  // originalID as a String
  productId: "com.example.app.badges_80",
  type: "consumable"|"nonConsumable"|"autoRenewable",
  purchaseDate: 1780000000000,     // ms since epoch
  expirationDate: 1780604800000,   // ms since epoch, or null
  revoked: false                   // revocationDate != nil
}
```

Only `VerificationResult.verified` transactions are ever reported. Unverified ones are ignored (and finished if they are consumables so they do not clog the queue).

## Events (native -> JS)

Native runs a long-lived `Task` iterating `Transaction.updates`. For each verified transaction it stores it in the "not yet finished" dictionary (keyed by `String(tx.id)`) and calls:

```js
window.NPNative && window.NPNative.onTransaction(<tx object>)
```

via `webView.evaluateJavaScript`. The page defines `window.NPNative` after it has loaded; if the call arrives earlier it is harmless because the game also calls `unfinished` and `entitlements` at launch. The JS side grants the goods (once, de-duplicated by transaction ID) and then sends `finish`.

`purchase` also stores the successful transaction in the same dictionary without finishing it. The JS side grants and then sends `finish`.

Lifecycle hooks, also called through `evaluateJavaScript` and only if the page defined them:

```js
window.NPNative.onBackground()   // the app is about to go to the background: the game saves now
window.NPNative.onForeground()   // the app became active again: the game retries prices if they failed and re-reads the storefront
```

## Rules the Swift side must follow

- Use StoreKit 2 (`Product.products(for:)`, `product.purchase()`, `Transaction.updates`, `Transaction.currentEntitlements`, `Transaction.unfinished`, `AppStore.sync()`).
- Never `finish()` a transaction before JS asks for it (except unverified consumables).
- Do not log or persist any personal data. No network calls except StoreKit.
- Only one handler name (`np`). Ignore unknown commands with `{ok:false,error:"unknown"}`.
- Use `await MainActor.run` for UIKit work.
