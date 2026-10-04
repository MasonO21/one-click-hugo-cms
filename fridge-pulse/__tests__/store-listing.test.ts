import fs from 'node:fs';
import path from 'node:path';
import { ENTITLEMENT_ID, HOUSEHOLD_ENTITLEMENT_ID, HOUSEHOLD_MAX_PEOPLE, PLAN_IDS, PLANS, PRICE_PER_MONTH, TRIAL_SPAN } from '../src/billing/trial';

const listing = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'store', 'listing.json'), 'utf8'));
const { appStore, googlePlay, subscriptions } = listing;

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
  it('states every plan’s price and the 2-week free trial in both stores', () => {
    for (const text of [appStore.description, googlePlay.fullDescription]) {
      expect(text).toContain(`${TRIAL_SPAN.toUpperCase()}, THEN ${PRICE_PER_MONTH} PER MONTH OR ${PLANS.annual.price} PER YEAR`);
      expect(text).toContain(`${PRICE_PER_MONTH} per month or ${PLANS.annual.price} per year`);
      expect(text).toContain(`${PLANS['household-monthly'].price} per month or ${PLANS['household-annual'].price} per year and covers up to ${HOUSEHOLD_MAX_PEOPLE} people`);
    }
    expect(appStore.promotionalText).toContain('free for 2 weeks'.replace('free for', 'Try free for'));
  });

  it('includes the Apple auto-renewal disclosure the App Store requires in the description', () => {
    expect(appStore.description).toContain('A monthly plan renews automatically every month, and a yearly plan every year, unless it is cancelled at least 24 hours before the end of the current period');
    expect(appStore.description).toMatch(/Privacy Policy:/);
    expect(appStore.description).toMatch(/Terms of Use:/);
  });

  it('describes the subscription products the code expects', () => {
    expect(subscriptions.introductoryOffer).toMatch(/2 weeks/);
    expect(Object.keys(subscriptions.revenueCatEntitlements)).toEqual([ENTITLEMENT_ID, HOUSEHOLD_ENTITLEMENT_ID]);
    const plans = subscriptions.plans as { productId: string; package: string; price: string; entitlements: string[] }[];
    expect(plans).toHaveLength(PLAN_IDS.length);
    for (const id of PLAN_IDS) {
      const plan = PLANS[id];
      const listed = plans.find((p) => p.productId === plan.productId);
      expect(listed).toMatchObject({ package: plan.packageId, price: `${plan.price} per ${plan.period}` });
      expect(listed!.entitlements).toEqual(plan.household ? [ENTITLEMENT_ID, HOUSEHOLD_ENTITLEMENT_ID] : [ENTITLEMENT_ID]);
    }
  });

  it('does not promise anything the app does not do', () => {
    const all = `${appStore.description} ${googlePlay.fullDescription}`.toLowerCase();
    for (const banned of ['guarantee', 'never waste', 'accurate to', '100%', 'medical', 'allergen-free']) {
      expect(all).not.toContain(banned);
    }
  });
});
