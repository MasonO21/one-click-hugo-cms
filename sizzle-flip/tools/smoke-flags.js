// Self-test builds only (imported before the game by tools/smoke-entry.js): emulators and simulators have nobody to
// answer Google's consent form or Apple's tracking prompt, so the ads code skips them (src/ads.js).
window.__SMOKE_NO_PROMPTS = true;
