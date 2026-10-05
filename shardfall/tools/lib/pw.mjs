// Loads Playwright. Prefers the copy preinstalled at /opt/node-tools (which
// matches the Chromium in /opt/pw-browsers), then the project's devDependency.
// Never runs `playwright install`; in CI the workflow installs Chromium first.
export async function loadPlaywright() {
  const candidates = ['/opt/node-tools/node_modules/playwright/index.mjs', 'playwright'];
  let lastErr;
  for (const spec of candidates) {
    try {
      const mod = await import(spec);
      return mod.default && mod.default.chromium ? mod.default : mod;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Playwright not found. Run `npm install` in shardfall/ (and `npx playwright install chromium` outside this sandbox).\n' + (lastErr && lastErr.message));
}

export async function launchChromium(opts = {}) {
  const pw = await loadPlaywright();
  return pw.chromium.launch({ headless: true, ...opts });
}
