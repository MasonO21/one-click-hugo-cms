/**
 * The four plans: prices and savings as shown, which plan the store says the person is on, buying
 * and switching in the demo, the plan picker, and a household plan covering the household.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { createLocalProvider } from '../src/billing/local';
import { mapCustomerInfo, planOfProduct, type CustomerInfoLike } from '../src/billing/mapCustomerInfo';
import { findPackage } from '../src/billing/revenuecat';
import { computeLocalEntitlement, planFor, planName, PLANS, priceAmount, priceLabel, yearlySaving } from '../src/billing/trial';
import { PlanPicker } from '../src/components/PlanPicker';
import { isCovered, sponsorName } from '../src/store/household';
import { planPriceLabel } from '../src/store/billing';
import { NOW } from '../test-utils/helpers';

jest.mock('react-native-purchases', () => ({ __esModule: true, default: {} }));

const US = Object.fromEntries(Object.values(PLANS).map((p) => [p.id, p.price])) as Record<keyof typeof PLANS, string>;

describe('plan prices', () => {
  it('labels a price with its period', () => {
    expect(priceLabel(PLANS.annual.price, 'year')).toBe(`${PLANS.annual.price}/year`);
    expect(planPriceLabel(US, 'household-monthly')).toBe(`${PLANS['household-monthly'].price}/month`);
    expect(planPriceLabel(US)).toBe(`${PLANS.annual.price}/year`);
  });

  it('reads store prices in any format', () => {
    expect(priceAmount('59,99 €')).toBe(59.99);
    expect(priceAmount('€1.234,50')).toBe(1234.5);
    expect(priceAmount('¥9,800')).toBe(9800);
    expect(priceAmount('CHF 12.90')).toBe(12.9);
    expect(priceAmount('free')).toBeNull();
  });

  it('works out the yearly saving from the prices shown, and only claims a real one', () => {
    expect(yearlySaving(US.monthly, US.annual)).toBe(50);
    expect(yearlySaving(US['household-monthly'], US['household-annual'])).toBe(50);
    expect(yearlySaving('9,99 €', '59,99 €')).toBe(50);
    expect(yearlySaving('1', '12')).toBeNull();
    expect(yearlySaving('?', US.annual)).toBeNull();
  });

  it('names plans and finds them by audience and period', () => {
    expect(planFor(true, 'year').id).toBe('household-annual');
    expect(planFor(false, 'month').id).toBe('monthly');
    expect(planName('annual')).toBe('Yearly');
    expect(planName('household-monthly')).toBe('Household, monthly');
  });
});

describe('which plan the store says the person is on', () => {
  const info = (active: CustomerInfoLike['entitlements']['active']): CustomerInfoLike => ({ entitlements: { active, all: active } });

  it('reads the plan from the product, with or without a Google Play base plan', () => {
    expect(planOfProduct('fridge_pulse_annual')).toBe('annual');
    expect(planOfProduct('fridge_pulse_household_annual:yearly')).toBe('household-annual');
    expect(planOfProduct('fridge_pulse_monthly')).toBe('monthly');
    expect(planOfProduct('something_else')).toBeUndefined();
    const e = mapCustomerInfo(info({ pro: { periodType: 'NORMAL', expirationDate: '2026-10-29T12:00:00Z', productIdentifier: 'fridge_pulse_annual' } }), NOW);
    expect(e).toMatchObject({ status: 'active', planId: 'annual' });
    expect(e.household).toBeUndefined();
  });

  it('knows a household plan from its entitlement', () => {
    const live = { periodType: 'TRIAL', expirationDate: '2026-10-13T12:00:00Z', productIdentifier: 'fridge_pulse_household_monthly' };
    expect(mapCustomerInfo(info({ pro: live, household: live }), NOW)).toMatchObject({ status: 'trial', planId: 'household-monthly', household: true });
  });
});

describe('finding a plan in the store offering', () => {
  const pkg = (identifier: string, product: string) => ({ identifier, product: { identifier: product } });

  it('matches the package id, then the product id, then the standard monthly or yearly slot', () => {
    const offering = [pkg('$rc_annual', 'fridge_pulse_annual'), pkg('custom', 'fridge_pulse_household_annual:yearly'), pkg('household_monthly', 'fridge_pulse_household_monthly')];
    expect(findPackage(offering, 'annual')?.identifier).toBe('$rc_annual');
    expect(findPackage(offering, 'household-annual')?.identifier).toBe('custom');
    expect(findPackage(offering, 'household-monthly')?.identifier).toBe('household_monthly');
    const slot = pkg('old_monthly', 'legacy_monthly');
    expect(findPackage(offering, 'monthly', { monthly: slot })).toBe(slot);
    // The standard slots never stand in for a household plan.
    expect(findPackage([], 'household-annual', { annual: offering[0] })).toBeNull();
  });
});

describe('demo billing with plans', () => {
  it('only a live household plan covers a household', () => {
    expect(computeLocalEntitlement({ trialStartedOn: '2026-09-25', paidThrough: null, plan: 'household-annual' }, NOW)).toMatchObject({ status: 'trial', planId: 'household-annual', household: true });
    const ended = computeLocalEntitlement({ trialStartedOn: '2026-01-01', paidThrough: null, plan: 'household-annual' }, NOW);
    expect(ended.status).toBe('expired');
    expect(ended.household).toBeUndefined();
  });

  it('starts the trial on the plan picked, switches during it, and pays for a period after it', async () => {
    const fresh = createLocalProvider();
    expect((await fresh.getEntitlement()).status).toBe('none');
    const first = await fresh.purchase('annual');
    expect(first.ok && first.entitlement).toMatchObject({ planId: 'annual' });
    const switched = await fresh.purchase('household-monthly');
    expect(switched.ok && switched.entitlement).toMatchObject({ planId: 'household-monthly', household: true });
    await fresh.simulateTrialDaysLeft?.(0);
    expect((await fresh.getEntitlement()).status).toBe('expired');
    const paid = await fresh.purchase('household-annual');
    expect(paid.ok && paid.entitlement).toMatchObject({ status: 'active', planId: 'household-annual', household: true });
    expect(paid.ok && paid.entitlement.daysRemaining).toBeGreaterThan(360);
  });
});

describe('household cover', () => {
  const view = (coveredUntil: number | null, sponsorIsYou = false) => ({
    name: 'Home',
    code: 'ABCD-EF23',
    members: [
      { name: 'Sam', you: sponsorIsYou, sponsor: true },
      { name: 'Alex', you: !sponsorIsYou },
    ],
    coveredUntil,
  });

  it('lasts until the date the server gave', () => {
    expect(isCovered(view(2000), 1000)).toBe(true);
    expect(isCovered(view(1000), 1000)).toBe(false);
    expect(isCovered(view(null), 1000)).toBe(false);
    expect(isCovered(null)).toBe(false);
  });

  it('names whoever pays, unless it is you', () => {
    expect(sponsorName(view(2000))).toBe('Sam');
    expect(sponsorName(view(2000, true))).toBeNull();
    expect(sponsorName(null)).toBeNull();
  });
});

describe('PlanPicker', () => {
  function render(selected: keyof typeof PLANS, current?: keyof typeof PLANS) {
    const onSelect = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<PlanPicker selected={selected} onSelect={onSelect} prices={US} current={current} />);
    });
    const text = () => JSON.stringify(tree.toJSON());
    const press = (testID: string) => act(() => tree.root.findByProps({ testID }).props.onPress());
    return { tree, onSelect, text, press };
  }

  it('shows both periods for the audience picked, with the yearly saving', () => {
    const { text } = render('annual');
    expect(text()).toContain(`${PLANS.annual.price}/year`);
    expect(text()).toContain(`${PLANS.monthly.price}/month`);
    expect(text()).toContain('Save 50%');
    expect(text()).not.toContain(PLANS['household-annual'].price);
  });

  it('keeps the period when switching to the household and back', () => {
    const yearly = render('annual');
    yearly.press('plan-household');
    expect(yearly.onSelect).toHaveBeenLastCalledWith('household-annual');
    const monthly = render('household-monthly');
    expect(monthly.text()).toContain(`${PLANS['household-monthly'].price}/month`);
    monthly.press('plan-just-me');
    expect(monthly.onSelect).toHaveBeenLastCalledWith('monthly');
    monthly.press('plan-household-annual');
    expect(monthly.onSelect).toHaveBeenLastCalledWith('household-annual');
  });

  it('marks the plan the person is on', () => {
    const { tree } = render('household-annual', 'annual');
    expect(tree.root.findByProps({ testID: 'plan-household-annual' }).props.accessibilityState).toEqual({ checked: true });
    const mine = render('annual', 'annual');
    expect(mine.text()).toContain('Your plan');
  });
});
