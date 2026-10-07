import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsClient, sanitizeProps, type AnalyticsBatch } from '../src/platform/analytics';
import { STALL_SECONDS, daysBetween, installAnalyticsHooks } from '../src/platform/analyticsHooks';
import { installPlatformHooks } from '../src/platform/hooks';
import { HttpCloudSave, generateRecoveryId, isValidRecoveryId } from '../src/platform/cloud';
import { AdMobAds, DevAds, TEST_REWARDED_IDS } from '../src/platform/ads';
import { RevenueCatIap, WebMockIap } from '../src/platform/iap';
import { LocalStorageStore } from '../src/platform/store';
import { CapacitorHaptics, NoopHaptics } from '../src/platform/haptics';
import { createPlatformServices } from '../src/platform';
import { withTimeout } from '../src/platform/env';
import { MemoryStore } from '../src/platform/mock';
import { DAY, T0, advanceMainTo, fulfil, makeGame, makeServices, tickMeta } from './meta.helpers';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { confirm?: unknown }).confirm;
});

describe('analytics client', () => {
  const batchesOf = () => {
    const batches: AnalyticsBatch[] = [];
    const sink = vi.fn(async (b: AnalyticsBatch) => {
      batches.push(b);
      return true;
    });
    return { batches, sink };
  };

  it('records nothing without consent and never sends before it', async () => {
    const { sink } = batchesOf();
    const a = new AnalyticsClient({ sink, flushIntervalMs: 0 });
    a.track('session_start', { x: 1 });
    expect(a.queued()).toBe(0);
    await a.flush();
    expect(sink).not.toHaveBeenCalled();
  });

  it('batches events and flushes on size, on demand, and keeps the install id anonymous', async () => {
    const { sink, batches } = batchesOf();
    const store = new MemoryStore();
    const a = new AnalyticsClient({ sink, store, batchSize: 3, flushIntervalMs: 0, platform: 'ios', appVersion: '1.2.3' });
    a.setConsent(true);
    a.track('tier_up', { tier: 1 });
    a.track('tier_up', { tier: 2 });
    expect(sink).not.toHaveBeenCalled();
    a.track('tier_up', { tier: 3 });
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1));
    expect(batches[0]).toMatchObject({ v: 1, platform: 'ios', appVersion: '1.2.3' });
    expect(batches[0].events.map((e) => e.props?.tier)).toEqual([1, 2, 3]);
    expect(batches[0].installId).toMatch(/^[0-9a-f]{32}$/);
    expect(await store.get('nova_install_id')).toBe(batches[0].installId);
    a.track('tier_up', { tier: 4 });
    await a.flush();
    expect(batches).toHaveLength(2);
    expect(a.queued()).toBe(0);
    await a.flush(); // empty: nothing to send
    expect(batches).toHaveLength(2);
    // a new session reuses the stored install id
    const b = new AnalyticsClient({ sink, store, flushIntervalMs: 0 });
    await b.init();
    b.setConsent(true);
    expect(b.installId()).toBe(batches[0].installId);
  });

  it('withdrawing consent clears the queue and forgets the install id', async () => {
    const { sink } = batchesOf();
    const store = new MemoryStore();
    const a = new AnalyticsClient({ sink, store, flushIntervalMs: 0 });
    a.setConsent(true);
    a.track('tier_up', { tier: 1 });
    expect(a.queued()).toBe(1);
    a.setConsent(false);
    expect(a.queued()).toBe(0);
    expect(a.installId()).toBe('');
    await vi.waitFor(async () => expect(await store.get('nova_install_id')).toBeNull());
    a.track('tier_up', { tier: 2 });
    await a.flush();
    expect(sink).not.toHaveBeenCalled();
    a.setConsent(true);
    expect(a.installId()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('re-queues a failed batch (bounded) and retries', async () => {
    let ok = false;
    const sink = vi.fn(async () => ok);
    const a = new AnalyticsClient({ sink, flushIntervalMs: 0, maxQueue: 5 });
    a.setConsent(true);
    for (let i = 0; i < 4; i++) a.track('tier_up', { i });
    await a.flush();
    expect(a.queued()).toBe(4);
    for (let i = 4; i < 9; i++) a.track('tier_up', { i }); // overflow drops the oldest
    expect(a.queued()).toBe(5);
    ok = true;
    await a.flush();
    expect(a.queued()).toBe(0);
    const sent = (sink.mock.calls.at(-1) as unknown as [AnalyticsBatch])[0];
    expect(sent.events.map((e) => e.props?.i)).toEqual([4, 5, 6, 7, 8]);
    // a throwing sink behaves like a failure
    sink.mockRejectedValueOnce(new Error('x'));
    a.track('tier_up', { i: 99 });
    await a.flush();
    expect(a.queued()).toBe(1);
  });

  it('drops events when no sink is configured (nothing leaves the device)', async () => {
    const a = new AnalyticsClient({ sink: null, flushIntervalMs: 0 });
    a.setConsent(true);
    a.track('tier_up', { tier: 1 });
    await a.flush();
    expect(a.queued()).toBe(0);
  });

  it('flushes on a timer', async () => {
    vi.useFakeTimers();
    const { sink } = batchesOf();
    const a = new AnalyticsClient({ sink, flushIntervalMs: 30_000 });
    a.setConsent(true);
    a.track('tier_up', { tier: 1 });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(sink).toHaveBeenCalledTimes(1);
    a.dispose();
  });

  it('sanitizes names and props: no PII-shaped strings, bounded sizes, finite numbers only', () => {
    const a = new AnalyticsClient({ sink: null, flushIntervalMs: 0 });
    a.setConsent(true);
    a.track('Bad Name!', {});
    a.track('x', {});
    expect(a.queued()).toBe(0);
    const p = sanitizeProps({
      email: 'player@example.com',
      long: 'x'.repeat(200),
      n: 1.23456789,
      inf: Infinity,
      ok: true,
      'Bad Key': 1,
      nested: { a: 1 } as never,
    })!;
    expect(p.email).toBe('[redacted]');
    expect((p.long as string).length).toBe(64);
    expect(p.n).toBe(1.235);
    expect('inf' in p).toBe(false);
    expect('Bad Key' in p).toBe(false);
    expect('nested' in p).toBe(false);
    expect(p.ok).toBe(true);
    const many = sanitizeProps(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i])))!;
    expect(Object.keys(many)).toHaveLength(14);
    expect(sanitizeProps(undefined)).toBeUndefined();
  });
});

describe('analytics hooks', () => {
  function rig(opts: { createdDaysAgo?: number } = {}) {
    const g = makeGame({ at: T0 });
    if (opts.createdDaysAgo) g.game.state.createdAt = T0 - opts.createdDaysAgo * DAY;
    const calls: { name: string; props: Record<string, unknown> }[] = [];
    const analytics = {
      setConsent: vi.fn(),
      track: vi.fn((name: string, props?: Record<string, unknown>) => void calls.push({ name, props: props ?? {} })),
      flush: vi.fn(async () => {}),
    };
    g.game.services.analytics = analytics as never;
    const off = installAnalyticsHooks(g.game);
    const named = (n: string) => calls.filter((c) => c.name === n).map((c) => c.props);
    return { ...g, calls, analytics, off, named };
  }

  it('starts a session on install and follows the consent setting', () => {
    const r = rig();
    expect(r.analytics.setConsent).toHaveBeenCalledWith(true);
    expect(r.named('session_start')).toEqual([expect.objectContaining({ session_no: 1, fresh: true, platform: 'web', retention_day: 0, resumed: false })]);
    r.game.state.settings.analytics = false;
    r.game.bus.emit('tick:second', { playTime: 1 });
    expect(r.analytics.setConsent).toHaveBeenLastCalledWith(false);
    r.game.state.settings.analytics = true;
    r.game.bus.emit('tick:second', { playTime: 2 });
    expect(r.analytics.setConsent).toHaveBeenLastCalledWith(true);
    expect(r.analytics.setConsent).toHaveBeenCalledTimes(3);
  });

  it('reports retention days once per day since install', async () => {
    const r = rig({ createdDaysAgo: 3 });
    expect(r.named('session_start')[0].retention_day).toBe(3);
    await vi.waitFor(() => expect(r.named('retention_day')).toEqual([{ day: 3, d1: false, d7: false, d30: false }]));
    expect(await r.game.services.store.get('nova_analytics_last_retention_day')).toBe('3');
    // a second launch the same day does not repeat it
    const again = rig({ createdDaysAgo: 3 });
    again.game.services.store.set('nova_analytics_last_retention_day', '3');
    expect(daysBetween(T0 - 3 * DAY, T0)).toBe(3);
    expect(daysBetween(T0, T0)).toBe(0);
  });

  it('reports tutorial steps for main missions and completion exactly once', () => {
    const r = rig();
    advanceMainTo(r, 'm11_tier1');
    fulfil(r, r.game.sys.missions.current()!);
    tickMeta(r, 1.5);
    const steps = r.named('tutorial_step');
    expect(steps.map((s) => s.mission)).toEqual(['m01_wood', 'm02_shelter', 'm03_campfire', 'm04_storage', 'm05_rescue', 'm06_logging', 'm07_assign', 'm08_turret', 'm09_defend', 'm10_research', 'm11_tier1']);
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.named('tutorial_complete')).toEqual([expect.objectContaining({ steps: 11 })]);
    // side missions are reported separately
    r.game.bus.emit('building:completed', { id: 9, def: 'berry_patch' });
    r.game.sys.missions.claim('s_farm');
    expect(r.named('mission_claimed')).toEqual([{ mission: 's_farm', chain: 'side' }]);
    expect(r.named('tutorial_step')).toHaveLength(11);
  });

  it('reports tier-ups with time-to-tier, research, building usage (aggregated), ads and the purchase funnel', () => {
    const r = rig();
    const bus = r.game.bus;
    r.game.state.playTime = 300;
    bus.emit('colony:tierUp', { tier: 1 });
    r.game.state.playTime = 900;
    bus.emit('colony:tierUp', { tier: 2 });
    expect(r.named('tier_up')).toEqual([
      { tier: 1, play_time_s: 300, since_prev_s: 300 },
      { tier: 2, play_time_s: 900, since_prev_s: 600 },
    ]);
    bus.emit('research:completed', { id: 'tier_stone' });
    expect(r.named('research_done')[0]).toMatchObject({ id: 'tier_stone' });
    bus.emit('world:regionDiscovered', { id: 'pinewood_forest' });
    bus.emit('combat:ended', { wave: 2, kills: 7, reward: {} });
    expect(r.named('region_discovered')).toHaveLength(1);
    expect(r.named('wave_won')[0]).toMatchObject({ wave: 2, kills: 7 });

    for (let i = 0; i < 3; i++) bus.emit('building:completed', { id: i, def: 'shelter' });
    bus.emit('building:completed', { id: 9, def: 'campfire' });
    expect(r.named('building_usage')).toHaveLength(0); // not per building
    bus.emit('tick:second', { playTime: r.game.state.playTime + 301 });
    expect(r.named('building_usage')).toEqual([
      { def: 'shelter', count: 3 },
      { def: 'campfire', count: 1 },
    ]);

    bus.emit('ad:started', { placement: 'free_crate' });
    bus.emit('ad:rewarded', { placement: 'free_crate' });
    bus.emit('ad:failed', { placement: 'offline_double' });
    bus.emit('offline:claimed', { doubled: true });
    expect(r.named('ad_started')).toEqual([{ placement: 'free_crate' }]);
    expect(r.named('ad_rewarded')[0]).toMatchObject({ placement: 'free_crate' });
    expect(r.named('ad_failed')).toEqual([{ placement: 'offline_double' }]);
    expect(r.named('offline_claimed')).toEqual([{ doubled: true }]);

    bus.emit('ui:open', { panel: 'build' });
    bus.emit('ui:open', { panel: 'shop' });
    bus.emit('iap:failed', { product: 'nova_crystals_small', reason: 'cancelled' });
    r.game.state.stats.purchases = 1;
    bus.emit('iap:purchased', { product: 'nova_crystals_small' });
    expect(r.named('shop_opened')).toHaveLength(1);
    expect(r.named('iap_failed')).toEqual([{ product: 'nova_crystals_small', reason: 'cancelled' }]);
    expect(r.named('iap_purchased')).toEqual([{ product: 'nova_crystals_small', purchases: 1 }]);
    bus.emit('daily:claimed', { day: 3 });
    bus.emit('season:levelUp', { level: 4 });
    expect(r.named('daily_claimed')[0]).toMatchObject({ day: 3 });
    expect(r.named('season_level')).toEqual([{ level: 4 }]);
  });

  it('reports a progression stall after 10 minutes without a completed mission, and again every 10 minutes', () => {
    const r = rig();
    const bus = r.game.bus;
    bus.emit('tick:second', { playTime: STALL_SECONDS - 1 });
    expect(r.named('progression_stall')).toHaveLength(0);
    bus.emit('tick:second', { playTime: STALL_SECONDS });
    expect(r.named('progression_stall')).toEqual([{ mission: 'm01_wood', minutes: 10, tier: 0, play_time_s: 600 }]);
    bus.emit('tick:second', { playTime: STALL_SECONDS + 100 });
    expect(r.named('progression_stall')).toHaveLength(1);
    r.game.state.playTime = STALL_SECONDS + 200;
    bus.emit('mission:completed', { id: 'm01_wood' }); // progress resets the clock
    bus.emit('tick:second', { playTime: STALL_SECONDS * 2 + 150 });
    expect(r.named('progression_stall')).toHaveLength(1);
    bus.emit('tick:second', { playTime: STALL_SECONDS * 2 + 200 });
    expect(r.named('progression_stall')).toHaveLength(2);
  });

  it('on pause: quit point (current mission), session end with duration, flush; resume starts a new session', () => {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    (globalThis as Record<string, unknown>).document = doc;
    (globalThis as Record<string, unknown>).window = new EventTarget();
    const r = rig();
    r.game.state.playTime = 125;
    r.game.bus.emit('resource:gained', { id: 'wood', amount: 5, source: 'gather' }); // m01 33%
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(r.named('quit_point')).toEqual([{ mission: 'm01_wood', mission_pct: 33, tier: 0, play_time_s: 125, tutorial_done: false }]);
    expect(r.named('session_end')).toEqual([{ duration_s: 125, wall_s: 0, play_time_s: 125 }]);
    expect(r.analytics.flush).toHaveBeenCalled();
    // duplicate "hidden" signals (pagehide after visibilitychange) do not double-report
    (globalThis as { window: EventTarget }).window.dispatchEvent(new Event('pagehide'));
    expect(r.named('session_end')).toHaveLength(1);
    r.clock.now += 90_000;
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(r.named('app_resumed')).toEqual([{ gap_s: 90 }]);
    expect(r.named('session_start')).toHaveLength(2);
    expect(r.named('session_start')[1].resumed).toBe(true);
    r.off();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(r.named('session_end')).toHaveLength(1);
  });

  it('uninstalling removes every bus listener', () => {
    const r = rig();
    r.off();
    const n = r.calls.length;
    r.game.bus.emit('colony:tierUp', { tier: 1 });
    r.game.bus.emit('ad:started', { placement: 'x' });
    expect(r.calls.length).toBe(n);
  });
});

describe('platform hooks', () => {
  it('syncs settings.haptics and buzzes on milestones', () => {
    const g = makeGame();
    const haptics = { setEnabled: vi.fn(), tap: vi.fn(), success: vi.fn(), warning: vi.fn(), heavy: vi.fn() };
    g.game.services.haptics = haptics;
    const off = installPlatformHooks(g.game);
    expect(haptics.setEnabled).toHaveBeenLastCalledWith(true);
    g.game.state.settings.haptics = false;
    g.game.bus.emit('tick:second', { playTime: 1 });
    expect(haptics.setEnabled).toHaveBeenLastCalledWith(false);
    g.game.bus.emit('mission:completed', { id: 'x' });
    g.game.bus.emit('colony:tierUp', { tier: 1 });
    g.game.bus.emit('combat:warning', { wave: 1, seconds: 60 });
    g.game.bus.emit('season:levelUp', { level: 1 });
    expect(haptics.success).toHaveBeenCalledTimes(2);
    expect(haptics.heavy).toHaveBeenCalledTimes(1);
    expect(haptics.warning).toHaveBeenCalledTimes(1);
    off();
    g.game.bus.emit('colony:tierUp', { tier: 2 });
    expect(haptics.heavy).toHaveBeenCalledTimes(1);
  });

  it('works with the plain mock haptics (no setEnabled)', () => {
    const g = makeGame();
    const off = installPlatformHooks(g.game);
    expect(() => g.game.bus.emit('tick:second', { playTime: 1 })).not.toThrow();
    off();
  });
});

describe('cloud save adapter', () => {
  it('is unavailable without a backend URL', async () => {
    const c = new HttpCloudSave(new MemoryStore(), '');
    await c.init();
    expect(c.available()).toBe(false);
    expect(c.recoveryId()).toBeNull();
    expect(await c.upload('x')).toBe(false);
    expect(await c.download()).toBeNull();
    expect(await c.setRecoveryId(generateRecoveryId())).toBe(false);
  });

  it('creates and persists a recovery id, and talks the documented HTTP protocol', async () => {
    const store = new MemoryStore();
    const calls: { url: string; init: RequestInit }[] = [];
    let body = '';
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (init.method === 'PUT') {
        body = init.body as string;
        return new Response(null, { status: 204 });
      }
      return body ? new Response(`${body}\n`, { status: 200 }) : new Response('', { status: 404 });
    }) as unknown as typeof fetch;
    const c = new HttpCloudSave(store, 'https://saves.example.com/api/', fetchImpl);
    await c.init();
    const id = c.recoveryId()!;
    expect(isValidRecoveryId(id)).toBe(true);
    expect(id).toMatch(/^NOVA-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(await store.get('nova_recovery_id')).toBe(id);
    expect(c.available()).toBe(true);

    expect(await c.download()).toBeNull(); // 404: nothing stored yet
    expect(await c.upload('NC1-abc')).toBe(true);
    expect(calls[1].url).toBe(`https://saves.example.com/api/${id}`);
    expect(calls[1].init.method).toBe('PUT');
    expect((calls[1].init.headers as Record<string, string>)['content-type']).toBe('text/plain');
    expect(await c.download()).toBe('NC1-abc');

    // the id survives a restart and can be switched to restore on a new device
    const again = new HttpCloudSave(store, 'https://saves.example.com/api', fetchImpl);
    await again.init();
    expect(again.recoveryId()).toBe(id);
    expect(await again.setRecoveryId('nova-abcd-2345-wxyz')).toBe(true);
    expect(again.recoveryId()).toBe('NOVA-ABCD-2345-WXYZ');
    expect(await again.setRecoveryId('not an id')).toBe(false);
    expect(again.recoveryId()).toBe('NOVA-ABCD-2345-WXYZ');
  });

  it('network failures and server errors are reported, not thrown', async () => {
    const store = new MemoryStore();
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    const c = new HttpCloudSave(store, 'https://x.test', failing);
    await c.init();
    expect(await c.upload('x')).toBe(false);
    expect(await c.download()).toBeNull();
    const err = new HttpCloudSave(store, 'https://x.test', (async () => new Response('no', { status: 500 })) as unknown as typeof fetch);
    await err.init();
    expect(await err.upload('x')).toBe(false);
    expect(await err.download()).toBeNull();
  });

  it('generates distinct, valid ids', () => {
    const ids = new Set(Array.from({ length: 200 }, generateRecoveryId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isValidRecoveryId(id)).toBe(true);
  });
});

describe('ads adapters', () => {
  it('DevAds resolves a reward immediately outside a browser and is always ready', async () => {
    const ads = new DevAds();
    expect(ads.isReady('x')).toBe(true);
    expect(await ads.showRewarded('x')).toBe('rewarded');
  });

  it('AdMob falls back to Google test ad units unless production ids are configured', () => {
    expect(new AdMobAds('ios').unit()).toEqual({ id: TEST_REWARDED_IDS.ios, testing: true });
    expect(new AdMobAds('android').unit()).toEqual({ id: TEST_REWARDED_IDS.android, testing: true });
    expect(TEST_REWARDED_IDS.ios).toContain('ca-app-pub-3940256099942544/');
    vi.stubEnv('VITE_ADMOB_REWARDED_ANDROID', 'ca-app-pub-1234567890123456/1111111111');
    vi.stubEnv('VITE_ADMOB_REWARDED_IOS', 'ca-app-pub-1234567890123456/2222222222');
    expect(new AdMobAds('android').unit().id).toBe('ca-app-pub-1234567890123456/1111111111');
    expect(new AdMobAds('ios').unit().id).toBe('ca-app-pub-1234567890123456/2222222222');
  });
});

describe('iap adapters', () => {
  it('WebMockIap: confirm dialog flow, cancel, restore of non-consumables', async () => {
    const iap = new WebMockIap();
    await iap.init([
      { id: 'a', type: 'consumable' },
      { id: 'b', type: 'non_consumable' },
      { id: 'c', type: 'subscription' },
    ]);
    expect(iap.products()).toEqual([
      { id: 'a', price: '', available: true },
      { id: 'b', price: '', available: true },
      { id: 'c', price: '', available: true },
    ]);
    const confirm = vi.fn((_msg: string) => false);
    (globalThis as Record<string, unknown>).confirm = confirm;
    expect(await iap.purchase('a')).toEqual({ ok: false, productId: 'a', cancelled: true });
    expect(confirm.mock.calls[0][0]).toMatch(/DEV STORE/);
    confirm.mockReturnValue(true);
    const bought = await iap.purchase('b');
    expect(bought.ok).toBe(true);
    expect(bought.transactionId).toMatch(/^dev_b_/);
    await iap.purchase('a');
    expect(await iap.restore()).toEqual(['b']); // consumables are not restorable
    expect(await iap.subscriptionExpiry('c')).toBeNull();
  });

  it('WebMockIap can be disabled for production web builds', async () => {
    vi.stubEnv('VITE_DISABLE_WEB_IAP', 'true');
    const iap = new WebMockIap();
    await iap.init([{ id: 'a', type: 'consumable' }]);
    expect(iap.products()[0].available).toBe(false);
    expect((await iap.purchase('a')).ok).toBe(false);
  });

  it('RevenueCat without an API key degrades to "store unavailable" without touching the SDK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const iap = new RevenueCatIap('android', '');
    await iap.init([{ id: 'a', type: 'consumable' }]);
    expect(warn).toHaveBeenCalled();
    expect(iap.products()).toEqual([{ id: 'a', price: '', available: false }]);
    expect(await iap.purchase('a')).toMatchObject({ ok: false, error: 'store_unavailable' });
    expect(await iap.restore()).toEqual([]);
    expect(await iap.subscriptionExpiry('a')).toBeNull();
  });
});

describe('stores, haptics and the services factory', () => {
  it('LocalStorageStore falls back to memory when storage is blocked', async () => {
    const s = new LocalStorageStore(); // no localStorage in node
    expect(s.persistent).toBe(false);
    await s.set('k', 'v');
    expect(await s.get('k')).toBe('v');
    await s.remove('k');
    expect(await s.get('k')).toBeNull();
  });

  it('LocalStorageStore uses real storage when available and surfaces quota errors', async () => {
    const data = new Map<string, string>();
    let full = false;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (full && k !== '__nova_probe__') throw new Error('QuotaExceededError');
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
    };
    const s = new LocalStorageStore();
    expect(s.persistent).toBe(true);
    await s.set('k', 'v');
    expect(data.get('k')).toBe('v');
    full = true;
    await expect(s.set('k', 'w')).rejects.toThrow(/Quota/);
    expect(await s.get('k')).toBe('v');
    // a throwing localStorage (private mode) degrades to memory
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    const blocked = new LocalStorageStore();
    expect(blocked.persistent).toBe(false);
  });

  it('haptics: no-op on web; native adapter respects the toggle', () => {
    const h = new NoopHaptics();
    expect(() => {
      h.tap();
      h.success();
      h.warning();
      h.heavy();
      h.setEnabled(false);
    }).not.toThrow();
    const c = new CapacitorHaptics();
    c.setEnabled(false);
    expect(() => c.tap()).not.toThrow(); // disabled: never loads the plugin
  });

  it('createPlatformServices picks web adapters outside Capacitor', async () => {
    const s = await createPlatformServices();
    expect(s.platform).toBe('web');
    expect(s.ads).toBeInstanceOf(DevAds);
    expect(s.iap).toBeInstanceOf(WebMockIap);
    expect(s.haptics).toBeInstanceOf(NoopHaptics);
    expect(s.cloud.available()).toBe(false); // no VITE_CLOUD_SAVE_URL
    expect(typeof s.store.get).toBe('function');
    s.analytics.setConsent(false);
    const forced = await createPlatformServices({ forceWeb: true });
    expect(forced.platform).toBe('web');
  });

  it('withTimeout resolves with the fallback when the promise never settles', async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise<string>(() => {}), 1000, 'late');
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe('late');
    expect(await withTimeout(Promise.resolve('fast'), 1000, 'late')).toBe('fast');
  });

  it('services from makeServices stay usable by the game', () => {
    expect(makeServices().platform).toBe('web');
  });
});
