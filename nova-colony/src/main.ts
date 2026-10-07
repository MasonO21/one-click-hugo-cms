/**
 * Boot: platform services -> load save -> Game -> Renderer -> UI -> Audio -> main loop.
 */
import { Game } from './core/Game';
import { Renderer } from './render/Renderer';
import { UI } from './ui/UI';
import { AudioManager } from './audio/Audio';
import { createPlatformServices } from './platform';
import { SaveManager } from './platform/save';

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
  const renderer = new Renderer(game);
  renderer.init(document.getElementById('game')!);
  const ui = new UI(game, renderer);
  ui.init(document.getElementById('ui')!);
  const audio = new AudioManager(game);
  audio.init();

  game.start();
  saves.attach(game);

  // expose for debugging / automated playtests (dev server, or production with ?debug)
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    (window as any).game = game;
    (window as any).renderer = renderer;
  }

  const boot = document.getElementById('boot');
  if (boot) {
    boot.style.opacity = '0';
    setTimeout(() => boot.remove(), 600);
  }

  let last = performance.now();
  const frame = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    game.update(dt);
    renderer.render(dt);
    ui.update(dt);
    audio.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
