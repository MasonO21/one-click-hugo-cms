# Aether Rift: Warden Clash (web build)

Playable prototype: open `index.html` (or serve this folder over HTTPS; it installs as a PWA on phones).

- Controls: left stick or WASD; skills J/K/L (or on-screen); recall B; pause Esc.
- Purchases and ads are simulated (`buy()` and `watchAd()` in `index.html`); swap in StoreKit/Play Billing and an ad SDK for production.
- Draw odds and pity are shown in-app; skins are cosmetic only.
- Settings: sound, monthly spending limit, under-18 purchase lock.

Production path: see `UNITY_PORT_PLAN.md` and the engine-free logic + tests in `../unity`.
