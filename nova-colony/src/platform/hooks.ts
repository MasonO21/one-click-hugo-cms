/**
 * Platform hooks wired to a running game: analytics subscriptions, haptic feedback that respects
 * `settings.haptics`, and native app chrome (hide splash, immersive status bar).
 * `SaveManager.attach(game)` installs these, so main.ts needs no extra call.
 * OWNER: meta agent.
 */
import type { Game } from '../core/Game';
import { installAnalyticsHooks } from './analyticsHooks';
import { isNative } from './env';
import type { ToggleableHaptics } from './haptics';

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

export function installPlatformHooks(game: Game): () => void {
  const offs: Array<() => void> = [];
  offs.push(installAnalyticsHooks(game));

  const haptics = game.services.haptics as Partial<ToggleableHaptics> & typeof game.services.haptics;
  const syncHaptics = () => haptics.setEnabled?.(!!game.state.settings.haptics);
  syncHaptics();
  offs.push(game.bus.on('tick:second', syncHaptics));
  // sparse, meaningful moments only (the UI adds its own tap feedback)
  offs.push(game.bus.on('mission:completed', () => haptics.success()));
  offs.push(game.bus.on('season:levelUp', () => haptics.success()));
  offs.push(game.bus.on('colony:tierUp', () => haptics.heavy()));
  offs.push(game.bus.on('combat:warning', () => haptics.warning()));

  if (isNative()) void setupNativeChrome();
  return () => offs.forEach((f) => f());
}
