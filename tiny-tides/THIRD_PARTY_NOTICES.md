# Third-party notices

Tiny Tides bundles the following open-source components. All art (creatures, rocks, decor, icons) is drawn procedurally in code and all audio is synthesized at runtime; there are no third-party art or sound assets.

| Component | License | Use |
|---|---|---|
| Capacitor (`@capacitor/core`, `ios`, `app`, `haptics`, `local-notifications`, `preferences`, `share`, `filesystem`, `status-bar`, `splash-screen`) | MIT © Ionic | Native iOS shell and device APIs |
| `@capgo/native-purchases` | MPL-2.0 — **modified**: `patches/@capgo+native-purchases+8.8.1.patch` (also published at `site/source/`); original source at https://github.com/Cap-go/capacitor-native-purchases | StoreKit 2 in-app purchases |
| `capacitor-swift-pm`, `ion-ios-filesystem` | MIT © Ionic | Swift packages pulled in by the Capacitor plugins |
| Fredoka (via `@fontsource/fredoka`) | SIL Open Font License 1.1 © The Fredoka Project Authors | UI font (bundled) |
| esbuild, patch-package, Playwright, sharp, ESLint | MIT / Apache-2.0 / LGPL (sharp’s libvips) | Build & test tools (not shipped in the app) |

The full licence texts are generated into the website (`site/licenses.html`, from `npm run site`) and shown inside the app (Settings → Legal & credits), from `tools/licenses.mjs`. The MPL-2.0 file we changed is only `NativePurchasesPlugin.swift`; the patch is public so anyone can obtain the modified source.
