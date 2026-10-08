/**
 * Local notifications against a faked @capacitor/local-notifications (no device): the adapter never prompts by
 * itself, schedules inexact reminders with our icon/channel, cancels and clears; the controller schedules on
 * background, cancels on foreground, runs the permission flow, routes taps, is a no-op on the web and never throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ln = vi.hoisted(() => {
  type Fn = (...a: any[]) => any;
  return {
    permission: { current: 'prompt' as string },
    /** What the OS prompt answers. */
    answer: { current: 'granted' as string },
    listeners: new Map<string, Set<Fn>>(),
    fail: { current: '' as '' | 'all' | 'schedule' | 'cancel' | 'check' },
  };
});

vi.mock('@capacitor/local-notifications', () => {
  const maybeFail = (what: string) => {
    if (ln.fail.current === 'all' || ln.fail.current === what) throw new Error(`plugin ${what} failed`);
  };
  const LocalNotifications = {
    checkPermissions: vi.fn(async () => {
      maybeFail('check');
      return { display: ln.permission.current };
    }),
    requestPermissions: vi.fn(async () => {
      maybeFail('request');
      ln.permission.current = ln.answer.current;
      return { display: ln.permission.current };
    }),
    schedule: vi.fn(async ({ notifications }: { notifications: { id: number }[] }) => {
      maybeFail('schedule');
      return { notifications: notifications.map((n) => ({ id: n.id })) };
    }),
    cancel: vi.fn(async () => maybeFail('cancel')),
    removeAllDeliveredNotifications: vi.fn(async () => maybeFail('clear')),
    createChannel: vi.fn(async () => maybeFail('channel')),
    addListener: vi.fn(async (name: string, fn: (...a: any[]) => any) => {
      if (!ln.listeners.has(name)) ln.listeners.set(name, new Set());
      ln.listeners.get(name)!.add(fn);
      return { remove: async () => void ln.listeners.get(name)?.delete(fn) };
    }),
  };
  return { LocalNotifications };
});

import { LocalNotifications } from '@capacitor/local-notifications';
import { Game } from '../src/core/Game';
import { createMockServices } from '../src/platform/mock';
import { createPlatformServices } from '../src/platform';
import { installPlatformHooks } from '../src/platform/hooks';
import {
  ANDROID_CHANNEL,
  ANDROID_ICON_COLOR,
  ANDROID_SMALL_ICON,
  CapacitorNotifications,
  ColonyNotifier,
  NoopNotifications,
  installNotifications,
  mapPermission,
  readTap,
} from '../src/platform/notifications';
import { ALL_NOTIFY_IDS, NOTIFY_IDS, type PlannedNotification } from '../src/platform/notifyPlan';
import type { NotificationsService } from '../src/platform/types';

const NOW = Date.UTC(2026, 9, 8, 9, 0);
const plan: PlannedNotification[] = [
  { id: NOTIFY_IDS.storage, kind: 'storage', kinds: ['storage'], at: NOW + 2 * 3_600_000, title: 'Your storehouses are bursting! 📦', body: 'Come spend your wood.' },
  { id: NOTIFY_IDS.daily, kind: 'daily', kinds: ['daily'], at: NOW + 23 * 3_600_000, title: 'Your daily gift is ready! 🎁', body: 'Day 2', panel: 'daily' },
];

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await tick();
}

function emitTap(extra: unknown): void {
  ln.listeners.get('localNotificationActionPerformed')?.forEach((f) => f({ actionId: 'tap', notification: { id: 1, title: '', body: '', extra } }));
}

/** A game with a fake lifecycle we can drive. */
function rig(service: NotificationsService, opts: { plan?: PlannedNotification[] } = {}) {
  const clock = { now: NOW };
  const game = new Game({ seed: 5, clock: () => clock.now, services: createMockServices() });
  game.start();
  const bg = new Set<() => void>();
  const fg = new Set<() => void>();
  const track = vi.spyOn(game.services.analytics, 'track');
  const off = installNotifications(game, service, {
    onBackground: (cb) => (bg.add(cb), () => bg.delete(cb)),
    onForeground: (cb) => (fg.add(cb), () => fg.delete(cb)),
    plan: opts.plan ? () => opts.plan! : undefined,
  });
  return {
    game,
    clock,
    n: game.notifications!,
    off,
    track,
    background: () => bg.forEach((f) => f()),
    foreground: () => fg.forEach((f) => f()),
    listeners: () => bg.size + fg.size,
  };
}

beforeEach(() => {
  ln.permission.current = 'prompt';
  ln.answer.current = 'granted';
  ln.fail.current = '';
  ln.listeners.clear();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('CapacitorNotifications (faked plugin)', () => {
  it('maps OS permission states', () => {
    expect(mapPermission('granted')).toBe('granted');
    expect(mapPermission('denied')).toBe('denied');
    expect(mapPermission('prompt')).toBe('prompt');
    expect(mapPermission('prompt-with-rationale')).toBe('prompt'); // Android: asked once, may ask again
    expect(mapPermission(undefined)).toBe('unavailable');
  });

  it('checks and requests through the plugin', async () => {
    const s = new CapacitorNotifications('ios');
    expect(await s.check()).toBe('prompt');
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(await s.request()).toBe('granted');
    expect(LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('Android: cancels every colony id, creates its channel once, schedules inexact reminders with the status-bar icon', async () => {
    ln.permission.current = 'granted';
    const s = new CapacitorNotifications('android');
    expect(await s.replace(plan)).toBe(true);
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: ALL_NOTIFY_IDS.map((id) => ({ id })) });
    expect(vi.mocked(LocalNotifications.cancel).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(LocalNotifications.schedule).mock.invocationCallOrder[0]);
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: ANDROID_CHANNEL.id, importance: 3, vibration: false }));
    const sent = vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications;
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      id: NOTIFY_IDS.storage,
      title: plan[0].title,
      body: plan[0].body,
      largeBody: plan[0].body,
      isExactNotification: false, // never the "Alarms & reminders" settings screen
      smallIcon: ANDROID_SMALL_ICON,
      iconColor: ANDROID_ICON_COLOR,
      channelId: ANDROID_CHANNEL.id,
      autoCancel: true,
      extra: { kind: 'storage', panel: null },
    });
    expect(sent[0].schedule).toEqual({ at: new Date(plan[0].at), allowWhileIdle: true });
    expect(sent[1].extra).toEqual({ kind: 'daily', panel: 'daily' });
    await s.replace(plan);
    expect(LocalNotifications.createChannel).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(2);
  });

  it('iOS: no Android channel or icon fields', async () => {
    ln.permission.current = 'granted';
    expect(await new CapacitorNotifications('ios').replace(plan)).toBe(true);
    expect(LocalNotifications.createChannel).not.toHaveBeenCalled();
    const sent = vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications[0];
    expect(sent.channelId).toBeUndefined();
    expect(sent.smallIcon).toBeUndefined();
    expect(sent.threadIdentifier).toBe('colony');
  });

  it('never schedules without permission: schedule() would show the OS prompt itself', async () => {
    for (const p of ['prompt', 'prompt-with-rationale', 'denied']) {
      ln.permission.current = p;
      expect(await new CapacitorNotifications('android').replace(plan)).toBe(false);
    }
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(3); // what was pending still goes
  });

  it('an empty plan only cancels', async () => {
    ln.permission.current = 'granted';
    expect(await new CapacitorNotifications('android').replace([])).toBe(true);
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(LocalNotifications.checkPermissions).not.toHaveBeenCalled();
  });

  it('a channel that cannot be created falls back to the default channel', async () => {
    ln.permission.current = 'granted';
    vi.mocked(LocalNotifications.createChannel).mockRejectedValueOnce(new Error('old Android'));
    expect(await new CapacitorNotifications('android').replace(plan)).toBe(true);
    expect(vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications[0].channelId).toBeUndefined();
  });

  it('clear() cancels pending and empties the notification shade', async () => {
    await new CapacitorNotifications('ios').clear();
    expect(LocalNotifications.cancel).toHaveBeenCalledWith({ notifications: ALL_NOTIFY_IDS.map((id) => ({ id })) });
    expect(LocalNotifications.removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
  });

  it('never throws: plugin failures resolve to false / unavailable', async () => {
    ln.permission.current = 'granted';
    const s = new CapacitorNotifications('android');
    for (const f of ['schedule', 'cancel', 'check', 'all'] as const) {
      ln.fail.current = f;
      await expect(s.replace(plan)).resolves.toBe(false);
      await expect(s.clear()).resolves.toBeUndefined();
    }
    ln.fail.current = 'all';
    await expect(s.check()).resolves.toBe('unavailable');
    await expect(s.request()).resolves.toBe('unavailable');
  });

  it('taps: reads our extra, ignores anything else, and unsubscribes', async () => {
    const s = new CapacitorNotifications('android');
    const cb = vi.fn();
    const off = s.onTap(cb);
    await settle();
    emitTap({ kind: 'daily', panel: 'daily' });
    emitTap({ kind: 'nope', panel: 'shop' });
    emitTap(null);
    expect(cb.mock.calls.map((c) => c[0])).toEqual([{ kind: 'daily', panel: 'daily' }, {}, {}]);
    off();
    await settle();
    emitTap({ kind: 'daily' });
    expect(cb).toHaveBeenCalledTimes(3);
    expect(readTap({ kind: 'offline', panel: null })).toEqual({ kind: 'offline' });
  });
});

describe('ColonyNotifier: lifecycle', () => {
  it('launch counts as coming back: clears what was pending and reads the permission (never prompts)', async () => {
    const r = rig(new CapacitorNotifications('android'));
    await settle();
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(r.n.permission).toBe('prompt');
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(r.listeners()).toBe(2);
    r.off();
    expect(r.listeners()).toBe(0);
    expect(r.game.notifications).toBeUndefined();
  });

  it('background: cancels and schedules a fresh plan, once per transition; foreground: cancels everything', async () => {
    ln.permission.current = 'granted';
    const r = rig(new CapacitorNotifications('android'), { plan });
    r.game.state.settings.notifications = true;
    await settle();
    vi.clearAllMocks();
    // visibilitychange + pagehide + App pause + appStateChange all report the same transition
    r.background();
    r.background();
    r.background();
    await settle();
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1);
    expect(vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications.map((n) => n.id)).toEqual(plan.map((p) => p.id));
    expect(r.n.lastPlan).toEqual(plan);
    r.foreground();
    r.foreground();
    await settle();
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(2); // background replace + foreground clear
    expect(LocalNotifications.removeAllDeliveredNotifications).toHaveBeenCalledTimes(1);
    // away again: a fresh plan replaces (same ids, nothing duplicated)
    r.background();
    await settle();
    expect(LocalNotifications.schedule).toHaveBeenCalledTimes(2);
  });

  it('schedules the real plan from the running game', async () => {
    ln.permission.current = 'granted';
    const r = rig(new CapacitorNotifications('ios'));
    r.game.state.settings.notifications = true;
    await settle();
    r.background();
    await settle();
    expect(r.n.lastPlan.length).toBeGreaterThan(0); // at least the day-after "we miss you"
    expect(r.n.lastPlan.length).toBeLessThanOrEqual(3);
    const sent = vi.mocked(LocalNotifications.schedule).mock.calls[0][0].notifications;
    expect(sent.map((n) => n.id)).toEqual(r.n.lastPlan.map((n) => n.id));
    for (const n of sent) expect(ALL_NOTIFY_IDS).toContain(n.id);
  });

  it('nothing is scheduled until the player opts in, nor once the OS has blocked it', async () => {
    ln.permission.current = 'granted';
    const r = rig(new CapacitorNotifications('android'), { plan });
    await settle();
    r.background(); // settings.notifications is still false
    await settle();
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(r.n.lastPlan).toEqual([]);
    r.foreground();
    r.game.state.settings.notifications = true;
    ln.permission.current = 'denied'; // switched off in the system settings meanwhile
    r.background();
    await settle();
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  it('a tap on the gift reminder opens the daily panel (politely: it waits for a free screen)', async () => {
    const r = rig(new CapacitorNotifications('android'));
    const opened = vi.fn();
    r.game.bus.on('ui:open', opened);
    await settle();
    emitTap({ kind: 'daily', panel: 'daily' });
    emitTap({ kind: 'storage', panel: null });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith({ panel: 'daily', arg: { auto: true } });
    expect(r.track).toHaveBeenCalledWith('notify_opened', { kind: 'daily' });
    expect(r.track).toHaveBeenCalledWith('notify_opened', { kind: 'storage' });
  });
});

describe('ColonyNotifier: permission flow', () => {
  it('the card is offered once, only while the OS can still say yes', async () => {
    const r = rig(new CapacitorNotifications('android'));
    expect(r.n.canAsk()).toBe(false); // permission not read yet
    await settle();
    expect(r.n.canAsk()).toBe(true);
    ln.permission.current = 'denied';
    await r.n.refresh();
    expect(r.n.canAsk()).toBe(false);
    expect(r.n.blocked).toBe(true);
    ln.permission.current = 'granted'; // Android 12 and older: allowed by default, but still the player's choice
    await r.n.refresh();
    expect(r.n.canAsk()).toBe(true);
    expect(r.n.enabled).toBe(false);
  });

  it('"Yes, please!" shows the OS prompt; granted turns reminders on', async () => {
    const r = rig(new CapacitorNotifications('ios'));
    await settle();
    expect(await r.n.answerCard(true)).toBe('granted');
    expect(LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(r.game.state.settings).toMatchObject({ notifications: true, notifyAsked: true });
    expect(r.n.enabled).toBe(true);
    expect(r.n.canAsk()).toBe(false);
    expect(r.track).toHaveBeenCalledWith('notify_answer', { source: 'card', on: true, permission: 'granted' });
  });

  it('"Yes" but the OS prompt is declined: stays off, remembered', async () => {
    ln.answer.current = 'denied';
    const r = rig(new CapacitorNotifications('ios'));
    await settle();
    expect(await r.n.answerCard(true)).toBe('denied');
    expect(r.game.state.settings).toMatchObject({ notifications: false, notifyAsked: true });
    expect(r.n.blocked).toBe(true);
    expect(r.n.canAsk()).toBe(false);
  });

  it('"Not now": no OS prompt, never asked again', async () => {
    const r = rig(new CapacitorNotifications('android'));
    await settle();
    await r.n.answerCard(false);
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(r.game.state.settings).toMatchObject({ notifications: false, notifyAsked: true });
    expect(r.n.canAsk()).toBe(false);
  });

  it('Settings toggle: re-requests while the OS still asks, explains (stays off) once it is blocked, turns off cleanly', async () => {
    const r = rig(new CapacitorNotifications('android'), { plan });
    await settle();
    await r.n.answerCard(false);
    // later, in Settings
    ln.permission.current = 'prompt-with-rationale';
    expect(await r.n.setEnabled(true)).toBe('granted');
    expect(LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1);
    expect(r.n.enabled).toBe(true);
    // off: pending reminders are cancelled at once
    vi.clearAllMocks();
    await r.n.setEnabled(false);
    expect(r.game.state.settings.notifications).toBe(false);
    expect(LocalNotifications.cancel).toHaveBeenCalledTimes(1);
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    // blocked in the system settings: no prompt possible, the toggle stays off
    ln.permission.current = 'denied';
    expect(await r.n.setEnabled(true)).toBe('denied');
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(r.game.state.settings.notifications).toBe(false);
    expect(r.n.blocked).toBe(true);
    // allowed again in the system settings, then the toggle: on without a prompt
    ln.permission.current = 'granted';
    expect(await r.n.setEnabled(true)).toBe('granted');
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
    expect(r.n.enabled).toBe(true);
  });

  it('coming back re-reads the permission (the player may have changed it in the system settings)', async () => {
    ln.permission.current = 'granted';
    const r = rig(new CapacitorNotifications('android'));
    r.game.state.settings.notifications = true;
    await settle();
    expect(r.n.enabled).toBe(true);
    r.background();
    await settle();
    ln.permission.current = 'denied';
    r.foreground();
    await settle();
    expect(r.n.enabled).toBe(false);
    expect(r.n.blocked).toBe(true);
  });
});

describe('notifications on the web and in tests', () => {
  it('createPlatformServices gives the no-op adapter outside Capacitor', async () => {
    const s = await createPlatformServices();
    expect(s.notifications).toBeInstanceOf(NoopNotifications);
    expect(s.notifications!.available).toBe(false);
  });

  it('installed with the platform hooks: unavailable, no card, no listeners, nothing scheduled, never the plugin', async () => {
    const game = new Game({ seed: 1, services: createMockServices() }); // the mock has no notifications at all
    game.start();
    const off = installPlatformHooks(game);
    const n = game.notifications!;
    expect(n).toBeInstanceOf(ColonyNotifier);
    expect(n.available).toBe(false);
    expect(n.canAsk()).toBe(false);
    expect(n.enabled).toBe(false);
    expect(n.blocked).toBe(false);
    game.state.settings.notifications = true;
    expect(await n.reschedule()).toEqual([]);
    expect(await n.answerCard(true)).toBe('unavailable');
    expect(game.state.settings.notifications).toBe(false);
    expect(await n.setEnabled(true)).toBe('unavailable');
    await settle();
    expect(LocalNotifications.checkPermissions).not.toHaveBeenCalled();
    expect(LocalNotifications.schedule).not.toHaveBeenCalled();
    off();
    expect(game.notifications).toBeUndefined();
  });

  it('never throws, whatever the service does', async () => {
    const angry: NotificationsService = {
      available: true,
      check: () => Promise.reject(new Error('x')),
      request: () => {
        throw new Error('sync boom');
      },
      replace: () => Promise.reject(new Error('x')),
      clear: () => {
        throw new Error('sync boom');
      },
      onTap: () => {
        throw new Error('no listeners for you');
      },
    };
    const r = rig(angry, { plan });
    r.game.state.settings.notifications = true;
    await settle();
    expect(() => r.background()).not.toThrow();
    expect(() => r.foreground()).not.toThrow();
    await settle();
    await expect(r.n.reschedule()).resolves.toEqual([]);
    await expect(r.n.refresh()).resolves.toBe('unavailable');
    await expect(r.n.answerCard(true)).resolves.toBeDefined();
    await expect(r.n.setEnabled(true)).resolves.toBeDefined();
    await expect(r.n.setEnabled(false)).resolves.toBeDefined();
    const bad = new ColonyNotifier(r.game, angry, { plan: () => { throw new Error('plan failed'); } });
    await expect(bad.reschedule()).resolves.toEqual([]);
  });
});
