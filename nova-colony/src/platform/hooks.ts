/**
 * Platform hooks wired to a running game: analytics subscriptions, haptic feedback that respects
 * `settings.haptics`, offline progress for a background stay, local notifications (game.notifications) and native
 * app chrome (hide splash, immersive status bar).
 * `SaveManager.attach(game)` installs these, so main.ts needs no extra call.
 * OWNER: meta agent.
 */
import type { Game } from '../core/Game';
import { installAnalyticsHooks } from './analyticsHooks';
import { isNative } from './env';
import { onBackground, onForeground } from './lifecycle';
import type { ToggleableHaptics } from './haptics';
import { installNotifications } from './notifications';
import { installErrorReporting } from './errorReport';

/** Hide the native splash and go immersive (no status bar). Safe no-op on the web. */
async function setupNativeChrome(): Promise<void> {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch (e) {
    console.warn('[native] splash hide skipped', e);
  }
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {}); // Android only
    await StatusBar.hide();
  } catch (e) {
    console.warn('[native] status bar setup skipped', e);
  }
}

export interface LifecycleHooks {
  onBackground: (cb: () => void) => () => void;
  onForeground: (cb: () => void) => () => void;
}

/**
 * The app went to the background without being closed (the phone kept it in memory): the main loop simply stopped, so
 * credit that time like a launch would — quietly under 5 minutes, the Welcome Back card after that, 80% efficiency and
 * the 8 h cap included (Game.creditAbsence). Only real time the simulation did not run counts: play time that kept
 * advancing meanwhile (an inactive but still visible app, e.g. iOS Control Center pulled down) is subtracted, and a
 * frame that ran just before the foreground event does not hide the gap. Returns an unsubscribe.
 */
export function installResumeCredit(game: Game, life: LifecycleHooks = { onBackground, onForeground }): () => void {
  let hidden: { at: number; play: number } | null = null;
  const offs = [
    life.onBackground(() => {
      hidden ??= { at: game.now(), play: game.state.playTime };
    }),
    life.onForeground(() => {
      const h = hidden;
      hidden = null;
      if (!h) return;
      const away = (game.now() - h.at) / 1000 - Math.max(0, game.state.playTime - h.play);
      try {
        game.creditAbsence(away);
        game.state.lastTickAt = game.now(); // a kill right after this must not credit the same time again at launch
      } catch (e) {
        console.warn('[resume] offline credit failed', e);
      }
    }),
  ];
  return () => offs.forEach((f) => f());
}

export function installPlatformHooks(game: Game): () => void {
  const offs: Array<() => void> = [];
  offs.push(installAnalyticsHooks(game));
  // failures the game survives reach us as consent-gated analytics events (nothing without consent)
  offs.push(installErrorReporting((ev, props) => game.services.analytics.track(ev, props)));

  const haptics = game.services.haptics as Partial<ToggleableHaptics> & typeof game.services.haptics;
  const syncHaptics = () => haptics.setEnabled?.(!!game.state.settings.haptics);
  syncHaptics();
  offs.push(game.bus.on('tick:second', syncHaptics));
  // sparse, meaningful moments only (the UI adds its own tap feedback)
  offs.push(game.bus.on('mission:completed', () => haptics.success()));
  offs.push(game.bus.on('season:levelUp', () => haptics.success()));
  offs.push(game.bus.on('colony:tierUp', () => haptics.heavy()));
  offs.push(game.bus.on('combat:warning', () => haptics.warning()));
  // a background stay produces like a closed app does (the notifications promise it)
  offs.push(installResumeCredit(game));
  // gentle reminders while away (no-op on the web; nothing is scheduled until the player opts in)
  offs.push(installNotifications(game));

  if (isNative()) void setupNativeChrome();
  return () => offs.forEach((f) => f());
}
