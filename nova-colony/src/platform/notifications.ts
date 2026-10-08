/**
 * Local notifications: a few gentle reminders while the player is away (iOS / Android only).
 *
 *  - CapacitorNotifications : @capacitor/local-notifications, imported lazily inside the native shell.
 *  - NoopNotifications      : web and unit tests (nothing is ever scheduled).
 *  - ColonyNotifier         : wired to a running game (`installNotifications`, called from installPlatformHooks).
 *      background -> cancel what was pending and schedule a fresh plan (notifyPlan.ts), if the player opted in
 *      foreground -> cancel everything pending and clear the notification shade: the player is here
 *      tap        -> opens the game (the plugin does that); the daily-gift reminder also opens the gift panel, an
 *                    expedition reminder the Expeditions panel
 *
 * Permission UX (never at launch): the game asks with its own card at a moment the value is obvious (ui/NotifyPrompt:
 * after the first tier-up celebration or the first Welcome Back) and only a "Yes" shows the OS prompt. The card is
 * answered once (`settings.notifyAsked`); the Settings toggle can ask again, or explains where to switch
 * notifications on when the OS has blocked them. Reminders go out only while `settings.notifications` is on AND the
 * OS permission is granted, which is re-read on every foreground.
 *
 * Plugin pitfalls handled here: `schedule()` (8.3+) shows the OS prompt itself when permission is missing, so it is
 * only ever called after `checkPermissions()` says granted; Android `isExactNotification` defaults to true and would
 * open the system "Alarms & reminders" screen on every schedule, so all reminders are inexact (minutes of slack are
 * fine for "your storehouses are full"; SCHEDULE_EXACT_ALARM is removed from the manifest).
 *
 * Nothing here throws: every plugin call is guarded, a failure just means no reminder this time.
 * OWNER: meta agent. Tests: tests/notify.native.test.ts.
 */
import type { PermissionState } from '@capacitor/core';
import type { Game } from '../core/Game';
import type { NotificationsService, NotifyPermission, NotifyTap } from './types';
import { onBackground, onForeground } from './lifecycle';
import { ALL_NOTIFY_IDS, NOTIFY_IDS, notifySnapshot, planNotifications, type NotifyKind, type PlannedNotification } from './notifyPlan';

declare module '../core/Game' {
  interface Game {
    /** Local-notification controller (installed with the platform hooks). The UI's card and Settings toggle use it. */
    notifications?: ColonyNotifier;
  }
}

/** Android status-bar icon: res/drawable-<density>/ic_stat_nova.png, the launcher glyph in white on transparency. */
export const ANDROID_SMALL_ICON = 'ic_stat_nova';
/** Android accent behind the small icon: the UI's warm orange (--accent). */
export const ANDROID_ICON_COLOR = '#ff8a3d';
/** Our own Android channel: the plugin's default channel plays its sound on the alarm stream. */
export const ANDROID_CHANNEL = {
  id: 'colony',
  name: 'Colony updates',
  description: 'Full storehouses, a finished offline shift, squads back from expeditions and your daily gift',
  importance: 3 as const,
  visibility: 1 as const,
  vibration: false,
};

export function mapPermission(p: PermissionState | string | null | undefined): NotifyPermission {
  if (p === 'granted') return 'granted';
  if (p === 'denied') return 'denied';
  if (p === 'prompt' || p === 'prompt-with-rationale') return 'prompt';
  return 'unavailable';
}

const KINDS = Object.keys(NOTIFY_IDS) as NotifyKind[];

/** Read the `extra` we attach to every notification (anything else is ignored). */
export function readTap(extra: unknown): NotifyTap {
  const e = (extra && typeof extra === 'object' ? extra : {}) as Record<string, unknown>;
  const tap: NotifyTap = {};
  if (typeof e.kind === 'string' && (KINDS as string[]).includes(e.kind)) tap.kind = e.kind as NotifyKind;
  if (e.panel === 'daily' || e.panel === 'expeditions') tap.panel = e.panel;
  return tap;
}

// ================================================================================================ web / tests

export class NoopNotifications implements NotificationsService {
  readonly available = false;
  async check(): Promise<NotifyPermission> {
    return 'unavailable';
  }
  async request(): Promise<NotifyPermission> {
    return 'unavailable';
  }
  async replace(): Promise<boolean> {
    return false;
  }
  async clear(): Promise<void> {}
  onTap(): () => void {
    return () => {};
  }
}

// ================================================================================================ native

type LnModule = typeof import('@capacitor/local-notifications');
type LnSchema = import('@capacitor/local-notifications').LocalNotificationSchema;

export class CapacitorNotifications implements NotificationsService {
  readonly available = true;
  private mod: Promise<LnModule> | null = null;
  private channel: Promise<boolean> | null = null;

  constructor(private readonly platform: 'ios' | 'android') {}

  private plugin(): Promise<LnModule> {
    this.mod ??= import('@capacitor/local-notifications');
    return this.mod;
  }

  async check(): Promise<NotifyPermission> {
    try {
      const { LocalNotifications } = await this.plugin();
      return mapPermission((await LocalNotifications.checkPermissions()).display);
    } catch (e) {
      console.warn('[notify] permission check failed', e);
      return 'unavailable';
    }
  }

  async request(): Promise<NotifyPermission> {
    try {
      const { LocalNotifications } = await this.plugin();
      return mapPermission((await LocalNotifications.requestPermissions()).display);
    } catch (e) {
      console.warn('[notify] permission request failed', e);
      return this.check();
    }
  }

  /** Android 8+: create our channel once (resolves false if it could not be made: the default channel is used). */
  private ensureChannel(m: LnModule): Promise<boolean> {
    this.channel ??= m.LocalNotifications.createChannel({ ...ANDROID_CHANNEL }).then(
      () => true,
      (e) => {
        console.warn('[notify] channel not created', e);
        this.channel = null; // try again next time
        return false;
      },
    );
    return this.channel;
  }

  private schema(n: PlannedNotification, channel: boolean): LnSchema {
    const s: LnSchema = {
      id: n.id,
      title: n.title,
      body: n.body,
      largeBody: n.body, // Android: the whole sentence when expanded
      schedule: { at: new Date(n.at), allowWhileIdle: true },
      extra: { kind: n.kind, panel: n.panel ?? null },
      // never the exact-alarm path: it opens the system "Alarms & reminders" screen when not granted
      isExactNotification: false,
      autoCancel: true,
      threadIdentifier: 'colony', // iOS: grouped together
    };
    if (this.platform === 'android') {
      s.smallIcon = ANDROID_SMALL_ICON;
      s.iconColor = ANDROID_ICON_COLOR;
      if (channel) s.channelId = ANDROID_CHANNEL.id;
    }
    return s;
  }

  async replace(list: readonly PlannedNotification[]): Promise<boolean> {
    try {
      const m = await this.plugin();
      const { LocalNotifications } = m;
      await LocalNotifications.cancel({ notifications: ALL_NOTIFY_IDS.map((id) => ({ id })) });
      if (!list.length) return true;
      // schedule() would show the OS prompt itself when permission is missing: a background reschedule never may
      if (mapPermission((await LocalNotifications.checkPermissions()).display) !== 'granted') return false;
      const channel = this.platform === 'android' ? await this.ensureChannel(m) : false;
      await LocalNotifications.schedule({ notifications: list.map((n) => this.schema(n, channel)) });
      return true;
    } catch (e) {
      console.warn('[notify] scheduling failed', e);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      const { LocalNotifications } = await this.plugin();
      await LocalNotifications.cancel({ notifications: ALL_NOTIFY_IDS.map((id) => ({ id })) }).catch((e) => console.warn('[notify] cancel failed', e));
      await LocalNotifications.removeAllDeliveredNotifications().catch((e) => console.warn('[notify] clearing delivered failed', e));
    } catch (e) {
      console.warn('[notify] plugin unavailable', e);
    }
  }

  onTap(cb: (tap: NotifyTap) => void): () => void {
    let handle: { remove: () => Promise<void> } | null = null;
    let disposed = false;
    void this.plugin()
      .then(async ({ LocalNotifications }) => {
        const h = await LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
          try {
            cb(readTap(a?.notification?.extra));
          } catch (e) {
            console.warn('[notify] tap handler failed', e);
          }
        });
        if (disposed) void h.remove().catch(() => {});
        else handle = h;
      })
      .catch((e) => console.warn('[notify] tap listener unavailable', e));
    return () => {
      disposed = true;
      void handle?.remove().catch(() => {});
      handle = null;
    };
  }
}

// ================================================================================================ controller

export interface NotifierOptions {
  /** Lifecycle subscriptions (default: platform/lifecycle). Tests inject their own. */
  onBackground?: (cb: () => void) => () => void;
  onForeground?: (cb: () => void) => () => void;
  /** The plan for "the player leaves now" (default: planNotifications(notifySnapshot(game))). */
  plan?: (game: Game) => PlannedNotification[];
}

export type NotifySource = 'card' | 'settings';

export class ColonyNotifier {
  /** OS permission as last read ('unavailable' on the web or before the first check). */
  permission: NotifyPermission = 'unavailable';
  /** The plan handed to the OS when the app last went to the background (debugging / tests). */
  lastPlan: PlannedNotification[] = [];
  private away = false;
  private queue: Promise<unknown> = Promise.resolve();
  private offs: Array<() => void> = [];

  /** `service` may be swapped (tests, a dev preview of the native UI in a browser); call `attach()` again after. */
  constructor(
    private readonly game: Game,
    public service: NotificationsService,
    private readonly opts: NotifierOptions = {},
  ) {}

  /** Notifications exist on this platform (iOS / Android app). */
  get available(): boolean {
    return !!this.service?.available;
  }

  /** Reminders are on: the player opted in and the OS allows them. */
  get enabled(): boolean {
    return this.available && !!this.game.state.settings.notifications && this.permission === 'granted';
  }

  /** The OS blocks notifications for the app: only the system settings can change that. */
  get blocked(): boolean {
    return this.available && this.permission === 'denied';
  }

  /** May the in-game card be shown? Never answered before, and the OS can still say yes. */
  canAsk(): boolean {
    return this.available && !this.game.state.settings.notifyAsked && (this.permission === 'prompt' || this.permission === 'granted');
  }

  /** Subscribe to background / foreground / taps. Launching counts as a foreground. Returns a detach. */
  attach(): () => void {
    this.detach();
    if (!this.available) return () => {};
    const bg = this.opts.onBackground ?? onBackground;
    const fg = this.opts.onForeground ?? onForeground;
    try {
      this.offs.push(bg(() => this.hidden()));
      this.offs.push(fg(() => this.shown()));
      this.offs.push(this.service.onTap((t) => this.tapped(t)));
    } catch (e) {
      console.warn('[notify] lifecycle hooks unavailable', e);
    }
    this.away = true; // so the launch below runs the foreground path
    this.shown();
    return () => this.detach();
  }

  detach(): void {
    this.offs.forEach((f) => {
      try {
        f();
      } catch {
        /* already gone */
      }
    });
    this.offs = [];
  }

  /** Background events arrive several times per transition (visibility, pagehide, pause): act on the first. */
  private hidden(): void {
    if (this.away) return;
    this.away = true;
    void this.serial(() => this.reschedule());
  }

  private shown(): void {
    if (!this.away) return;
    this.away = false;
    void this.serial(async () => {
      await this.service.clear();
      await this.refresh();
    });
  }

  /** Run plugin work one call at a time, in order (a quick away-and-back must not race). */
  private serial<T>(fn: () => Promise<T>): Promise<T | undefined> {
    const run = this.queue.then(fn).catch((e) => {
      console.warn('[notify] failed', e);
      return undefined;
    });
    this.queue = run;
    return run;
  }

  /** Re-read the OS permission. */
  async refresh(): Promise<NotifyPermission> {
    try {
      if (this.available) this.permission = await this.service.check();
    } catch (e) {
      console.warn('[notify] permission check failed', e);
    }
    return this.permission;
  }

  /** The player is leaving: replace what is pending with a fresh plan (nothing when reminders are off). */
  async reschedule(): Promise<PlannedNotification[]> {
    try {
      if (!this.available) return [];
      const plan = this.game.state.settings.notifications ? (this.opts.plan ?? defaultPlan)(this.game) : [];
      this.lastPlan = plan;
      await this.service.replace(plan);
      return plan;
    } catch (e) {
      console.warn('[notify] could not plan reminders', e);
      return [];
    }
  }

  /** The in-game card was answered. "Yes" shows the OS prompt (when it still asks). Returns the OS permission. */
  async answerCard(yes: boolean): Promise<NotifyPermission> {
    try {
      const s = this.game.state.settings;
      s.notifyAsked = true;
      if (!yes) {
        s.notifications = false;
        this.track('card', false);
        return this.permission;
      }
      return await this.turnOn('card');
    } catch (e) {
      console.warn('[notify] answer failed', e);
      return this.permission;
    }
  }

  /** Settings toggle. Turning on asks the OS when it still asks; a blocked app stays off (the UI explains). */
  async setEnabled(on: boolean): Promise<NotifyPermission> {
    try {
      const s = this.game.state.settings;
      s.notifyAsked = true; // the card has nothing left to ask
      if (on) return await this.turnOn('settings');
      s.notifications = false;
      this.lastPlan = [];
      await this.serial(() => this.service.replace([]));
      this.track('settings', false);
      return this.permission;
    } catch (e) {
      console.warn('[notify] toggle failed', e);
      return this.permission;
    }
  }

  private async turnOn(source: NotifySource): Promise<NotifyPermission> {
    if (!this.available) {
      this.game.state.settings.notifications = false;
      return 'unavailable';
    }
    let p = await this.refresh();
    if (p === 'prompt') {
      p = await this.service.request();
      this.permission = p;
    }
    this.game.state.settings.notifications = p === 'granted';
    this.track(source, p === 'granted');
    return p;
  }

  private tapped(t: NotifyTap): void {
    try {
      this.game.services.analytics.track('notify_opened', { kind: t.kind ?? 'unknown' });
      if (t.panel === 'daily') this.game.bus.emit('ui:open', { panel: 'daily', arg: { auto: true } });
      else if (t.panel === 'expeditions') this.game.bus.emit('ui:open', { panel: 'expeditions' });
    } catch (e) {
      console.warn('[notify] tap failed', e);
    }
  }

  private track(source: NotifySource, on: boolean): void {
    try {
      this.game.services.analytics.track('notify_answer', { source, on, permission: this.permission });
    } catch {
      /* analytics is best effort */
    }
  }
}

function defaultPlan(game: Game): PlannedNotification[] {
  return planNotifications(notifySnapshot(game));
}

/**
 * Create the controller for a running game (`game.notifications`) and attach it. The service defaults to
 * `game.services.notifications` (no-op when absent). Returns an uninstall.
 */
export function installNotifications(game: Game, service?: NotificationsService, opts?: NotifierOptions): () => void {
  const n = new ColonyNotifier(game, service ?? game.services.notifications ?? new NoopNotifications(), opts);
  game.notifications = n;
  const off = n.attach();
  return () => {
    off();
    if (game.notifications === n) delete game.notifications;
  };
}
