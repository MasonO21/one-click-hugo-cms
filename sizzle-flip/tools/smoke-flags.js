// Self-test builds only (imported before the game by tools/smoke-entry.js): emulators and simulators have nobody to
// answer Google's consent form or Apple's tracking prompt, so the ads code skips them (src/ads.js).
// A normal run showed the consent form appearing on the iPhone Simulator (run 2 of the device workflow).
window.__SMOKE_NO_PROMPTS = true;
