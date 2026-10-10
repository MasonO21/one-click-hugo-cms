/**
 * Boot: platform services -> load save -> Game -> Renderer -> UI -> Audio -> main loop.
 */
import { Game } from './core/Game';
import { Renderer } from './render/Renderer';
import { UI } from './ui/UI';
import { AudioManager } from './audio/Audio';
import { createPlatformServices } from './platform';
import { SaveManager } from './platform/save';
import { AutoQuality } from './platform/autoQuality';
import { guarded } from './core/guard';
import { FramePacer, frameStep } from './core/framePacer';
import { LoopPolicy } from './core/loopPolicy';
import { onBackButton } from './platform/lifecycle';
import { ReviewPrompt } from './platform/review';

async function boot() {
  const services = await createPlatformServices();
  const saves = new SaveManager(services);
  let loaded = null;
  try {
    loaded = await saves.load();
  } catch (e) {
    console.error('[boot] failed to load save', e);
  }

  const game = new Game({ services, state: loaded ?? undefined });
  // automatic graphics quality: a one-time device pick before the scene is built, then a frame-rate governor
  const autoQuality = new AutoQuality(game);
  const renderer = new Renderer(game);
  renderer.init(document.getElementById('game')!, (gl) => autoQuality.decide(gl));
  const ui = new UI(game, renderer);
  ui.init(document.getElementById('ui')!);
  // Android back: close the top panel / leave build mode / clear the selection, else background the app
  onBackButton(() => ui.back());
  // native store-rating sheet, rarely, right after a tier-up or a won raid (no-op on the web)
  new ReviewPrompt(game, services.store).wire();
  const audio = new AudioManager(game);
  audio.init();

  game.start();
  saves.attach(game);
  autoQuality.attach();

  // expose for debugging / automated playtests (dev server, or production with ?debug)
  const debug = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');
  if (debug) {
    (window as any).game = game;
    (window as any).renderer = renderer;
    (window as any).autoQuality = autoQuality;
  }

  // compile the world's shaders behind the loading art: the first visible frame is then an ordinary one
  await renderer.warmUp();

  const boot = document.getElementById('boot');
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 600);
  }

  let last = performance.now();
  const pacer = new FramePacer();
  // 60 fps in play; 30 in Battery saver, behind menus and in a calm colony nobody has touched for a while
  const policy = new LoopPolicy(game);
  if (debug) (window as any).loopPolicy = policy;
  const opts = { capture: true, passive: true } as const;
  window.addEventListener('pointerdown', (e) => policy.pointerDown(e.timeStamp), opts);
  window.addEventListener('pointerup', (e) => policy.pointerUp(e.timeStamp), opts);
  window.addEventListener('pointercancel', (e) => policy.pointerUp(e.timeStamp), opts);
  for (const ev of ['pointermove', 'keydown', 'keyup', 'wheel'] as const) window.addEventListener(ev, (e) => policy.input(e.timeStamp), opts);
  window.addEventListener('blur', () => policy.release(performance.now()));
  document.addEventListener('visibilitychange', () => policy.release(performance.now()));
  // the next frame is booked first and every step is guarded, so one exception can never stop the loop
  const frame = (t: number) => {
    requestAnimationFrame(frame);
    // hidden (a WebView may keep its frames ticking in the background): nothing to simulate or draw; the time away is
    // credited as offline progress when the app comes back (platform/hooks.ts installResumeCredit)
    if (document.visibilityState === 'hidden') return;
    // at most 60 fps on 90/120 Hz screens; 30 in the cases above (core/loopPolicy.ts)
    if (!pacer.due(t, policy.fps(t))) return;
    const dt = frameStep(t, last);
    last = Math.max(last, t);
    guarded('game', () => game.update(dt));
    // a full-screen scene (the chest opening) hides the world: no need to draw it underneath
    if (!ui.coversWorld()) guarded('render', () => renderer.render(dt));
    guarded('ui', () => ui.update(dt));
    guarded('audio', () => audio.update(dt));
    autoQuality.update(dt); // guards itself (no closure per frame)
  };
  requestAnimationFrame(frame);
}

boot();
