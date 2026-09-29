import fs from 'node:fs';
import path from 'node:path';
import { ENTITLEMENT_ID, PRICE_PER_MONTH, TRIAL_SPAN } from '../src/billing/trial';

const listing = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'store', 'listing.json'), 'utf8'));
const { appStore, googlePlay, subscription } = listing;

// Store limits: App Store Connect and Google Play Console field lengths.
describe('App Store listing fits the field limits', () => {
  it.each([
    ['name', appStore.name, 30],
    ['subtitle', appStore.subtitle, 30],
    ['promotionalText', appStore.promotionalText, 170],
    ['keywords', appStore.keywords, 100],
    ['description', appStore.description, 4000],
    ['whatsNew', appStore.whatsNew, 4000],
  ])('%s is at most %d characters', (_field, value: string, max: number) => {
    expect(value.length).toBeLessThanOrEqual(max);
    expect(value.length).toBeGreaterThan(0);
  });

  it('keywords are comma-separated with no spaces after commas and no repeats of the app name', () => {
    expect(appStore.keywords).not.toMatch(/, /);
    expect(appStore.keywords.toLowerCase()).not.toContain('fridge pulse');
    const words = appStore.keywords.split(',');
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('Google Play listing fits the field limits', () => {
  it.each([
    ['title', googlePlay.title, 30],
    ['shortDescription', googlePlay.shortDescription, 80],
    ['fullDescription', googlePlay.fullDescription, 4000],
  ])('%s is at most %d characters', (_field, value: string, max: number) => {
    expect(value.length).toBeLessThanOrEqual(max);
  });
});

describe('the listings describe the same offer as the app', () => {
  it('states $9.99 per month and a 2-week free trial in both stores', () => {
    for (const text of [appStore.description, googlePlay.fullDescription]) {
      expect(text).toContain(`${TRIAL_SPAN.toUpperCase()}, THEN ${PRICE_PER_MONTH} PER MONTH`);
      expect(text).toContain(`${PRICE_PER_MONTH} per month`);
    }
    expect(appStore.promotionalText).toContain('free for 2 weeks'.replace('free for', 'Try free for'));
  });

  it('includes the Apple auto-renewal disclosure the App Store requires in the description', () => {
    expect(appStore.description).toContain('renews automatically every month unless it is cancelled at least 24 hours before the end of the current period');
    expect(appStore.description).toMatch(/Privacy Policy:/);
    expect(appStore.description).toMatch(/Terms of Use:/);
  });

  it('describes the subscription product the code expects', () => {
    expect(subscription.price).toBe('$9.99 per month');
    expect(subscription.introductoryOffer).toMatch(/2 weeks/);
    expect(subscription.revenueCatEntitlement).toBe(ENTITLEMENT_ID);
  });

  it('does not promise anything the app does not do', () => {
    const all = `${appStore.description} ${googlePlay.fullDescription}`.toLowerCase();
    for (const banned of ['guarantee', 'never waste', 'accurate to', '100%', 'medical', 'allergen-free']) {
      expect(all).not.toContain(banned);
    }
  });
});
