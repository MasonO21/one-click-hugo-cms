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
import { onBackButton } from './platform/lifecycle';

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
  const audio = new AudioManager(game);
  audio.init();

  game.start();
  saves.attach(game);
  autoQuality.attach();

  // expose for debugging / automated playtests (dev server, or production with ?debug)
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as any).game = game;
    (window as any).renderer = renderer;
    (window as any).autoQuality = autoQuality;
  }

  const boot = document.getElementById('boot');
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 600);
  }

  let last = performance.now();
  // the next frame is booked first and every step is guarded, so one exception can never stop the loop
  const frame = (t: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    guarded('game', () => game.update(dt));
    guarded('render', () => renderer.render(dt));
    guarded('ui', () => ui.update(dt));
    guarded('audio', () => audio.update(dt));
    autoQuality.update(dt); // guards itself (no closure per frame)
  };
  requestAnimationFrame(frame);
}

boot();
