import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('refuses to start without a way to verify subscriptions', () => {
    assert.throws(() => loadConfig({}), /REVENUECAT_SECRET_KEY/);
  });

  it('allows unauthenticated mode only when explicitly requested', () => {
    assert.equal(loadConfig({ ALLOW_UNAUTHENTICATED: 'true' }).allowUnauthenticated, true);
    assert.throws(() => loadConfig({ ALLOW_UNAUTHENTICATED: 'yes' }), /REVENUECAT_SECRET_KEY/);
  });

  it('defaults to Claude Opus 5.5 with configurable model and effort', () => {
    const d = loadConfig({ REVENUECAT_SECRET_KEY: 'sk' });
    assert.equal(d.model, 'claude-opus-5-5');
    assert.equal(d.scanEffort, 'medium');
    assert.equal(d.mealsEffort, 'low');
    // Abuse ceilings are deliberately modest relative to a monthly subscription price.
    assert.equal(d.scansPerDay, 15);
    assert.equal(d.mealsPerDay, 40);
    assert.equal(d.identifiesPerDay, 10);
    assert.equal(d.identifyEffort, 'medium');
    assert.equal(d.offBaseUrl, 'https://world.openfoodfacts.org');
    assert.equal(d.wikiBaseUrl, 'https://en.wikipedia.org');
    assert.match(d.pictureUserAgent, /FridgePulse/);
    const c = loadConfig({ REVENUECAT_SECRET_KEY: 'sk', ANTHROPIC_MODEL: 'claude-sonnet-5-5', SCAN_EFFORT: 'high', MEALS_EFFORT: 'bogus', PORT: '9000' });
    assert.equal(c.model, 'claude-sonnet-5-5');
    assert.equal(c.scanEffort, 'high');
    assert.equal(c.mealsEffort, 'low');
    assert.equal(c.port, 9000);
  });

  it('only accepts http(s) base URLs for the picture services', () => {
    const c = loadConfig({ REVENUECAT_SECRET_KEY: 'sk', OFF_BASE_URL: 'http://127.0.0.1:9/', WIKI_BASE_URL: 'file:///etc' });
    assert.equal(c.offBaseUrl, 'http://127.0.0.1:9');
    assert.equal(c.wikiBaseUrl, 'https://en.wikipedia.org');
  });
});
