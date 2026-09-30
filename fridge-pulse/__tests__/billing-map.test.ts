import { mapCustomerInfo, type CustomerInfoLike } from '../src/billing/mapCustomerInfo';
import { NOW } from '../test-utils/helpers';

const info = (active: CustomerInfoLike['entitlements']['active'], all = active): CustomerInfoLike => ({
  entitlements: { active, all },
});

describe('mapCustomerInfo', () => {
  it('reports a store trial as trial with days remaining', () => {
    const e = mapCustomerInfo(info({ pro: { periodType: 'TRIAL', expirationDate: '2026-10-13T12:00:00Z' } }), NOW);
    expect(e).toMatchObject({ status: 'trial', daysRemaining: 14 });
  });

  it('treats a normal or intro period as an active subscription', () => {
    expect(mapCustomerInfo(info({ pro: { periodType: 'NORMAL', expirationDate: '2026-10-29T12:00:00Z' } }), NOW).status).toBe('active');
    expect(mapCustomerInfo(info({ pro: { periodType: 'intro', expirationDate: '2026-10-29T12:00:00Z' } }), NOW).status).toBe('active');
  });

  it('handles lifetime-style entitlements with no expiry', () => {
    expect(mapCustomerInfo(info({ pro: { periodType: 'NORMAL', expirationDate: null } }), NOW)).toEqual({
      status: 'active', endsOn: null, daysRemaining: null,
    });
  });

  it('knows when a cancelled trial will not turn into a charge', () => {
    const e = mapCustomerInfo(info({ pro: { periodType: 'TRIAL', expirationDate: '2026-10-13T12:00:00Z', willRenew: false } }), NOW);
    expect(e).toMatchObject({ status: 'trial', willRenew: false });
  });

  it('tells an ended trial from an ended subscription', () => {
    expect(mapCustomerInfo(info({}, { pro: { periodType: 'TRIAL', expirationDate: '2026-09-20T12:00:00Z' } }), NOW)).toMatchObject({ status: 'expired', lapsed: 'trial' });
    expect(mapCustomerInfo(info({}, { pro: { periodType: 'NORMAL', expirationDate: '2026-09-20T12:00:00Z' } }), NOW)).toMatchObject({ status: 'expired', lapsed: 'paid' });
  });

  it('reports an entitlement that lapsed as expired, and none as none', () => {
    const lapsed = { pro: { periodType: 'TRIAL', expirationDate: '2026-09-20T12:00:00Z' } };
    expect(mapCustomerInfo(info({}, lapsed), NOW).status).toBe('expired');
    expect(mapCustomerInfo(info({}, {}), NOW).status).toBe('none');
  });

  it('ignores other entitlements', () => {
    expect(mapCustomerInfo(info({ other: { periodType: 'NORMAL', expirationDate: null } }, {}), NOW).status).toBe('none');
  });
});
