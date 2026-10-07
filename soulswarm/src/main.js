// SOULSWARM: app bootstrap. Wires the profile, audio, renderer, menus and runs together.
import './ui/style.css';
import { audio, loadAudio } from './audio/index.js';
import { loadProfile, saveProfile, newProfile } from './meta/save.js';
import { upkeep, commit, spendEnergy, computeLoadout, applyRunResult, beginTrial, dailyTrial, bloodMoon } from './meta/economy.js';
import { Store } from './meta/store.js';
import { difficultyUnlocked, selectDifficulty } from './meta/difficulty.js';
import { haptic, setHapticsEnabled, isNative } from './engine/platform.js';
import { App as NativeApp } from '@capacitor/app';
import { handleBack } from './ui/back.js';
import { Engine } from './engine/engine.js';
import { Showcase } from './game/showcase.js';
import { Run } from './game/run.js';
import { RunUI } from './ui/runui.js';
import { createMeta } from './ui/meta/index.js';
import { CHAPTERS } from './game/data.js';
import { toast } from './ui/dom.js';

const profile = loadProfile();

/**
 * The app object is the contract between systems. Menus receive it and use:
 *   app.profile, app.audio, app.store, app.haptic(kind), app.engine
 *   app.heroPortrait(heroId) -> dataURL of a rendered 3D portrait
 *   app.showcase.setHero(heroId)  (the 3D hero standing behind the home screen)
 *   app.startRun(chapterId, { trial, difficulty }) -> boolean (false when out of energy, the trial is spent or the difficulty is locked)
 *   app.applySettings()     (after changing profile.settings)
 */
const app = {
  profile,
  audio,
  store: Store,
  haptic,
  engine: null,
  showcase: null,
  meta: null,
  run: null,
  runUI: null,
  heroPortrait: (id) => (app.engine ? app.engine.heroPortrait(id, profile) : ''),
  startRun,
  exitRun,
  applySettings,
  resetProgress,
};
window.__soulswarm = app; // handy for QA scripts

/** Wipe all progress: blank the live profile (so an unload save cannot restore it), persist, reload. */
function resetProgress() {
  const fresh = newProfile();
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, fresh);
  saveProfile(profile, true);
  try { location.reload(); } catch (e) { /* ignore */ }
}

function applySettings() {
  const s = profile.settings;
  audio.setVolumes({ music: s.music, sfx: s.sfx });
  audio.setMuted(!!s.muted);
  setHapticsEnabled(s.haptics);
  if (app.engine) { app.engine.setQuality(s.quality); app.engine.reduceFlash = !!s.reduceFlash; app.engine.fpsCap = s.fps30 ? 30 : 60; }
  if (app.runUI) app.runUI.el.classList.toggle('lefty', !!s.lefty);
  saveProfile(profile);
}

/** opts.trial: today's Daily Trial (free; its chapter and mutators come from the date).
 *  opts.difficulty: 'normal' (default) | 'nightmare' | 'torment'; must be unlocked for the chapter. The trial always plays Normal. */
function startRun(chapterId, opts = {}) {
  let mutators = null;
  if (opts.trial) { const t = dailyTrial(profile); chapterId = t.chapter; mutators = [t.boon, t.bane]; }
  const chapter = CHAPTERS[chapterId - 1];
  if (!chapter || chapterId > profile.chapter.unlocked) return false;
  const difficulty = (!opts.trial && opts.difficulty) || 'normal';
  if (!difficultyUnlocked(profile, chapterId, difficulty)) return false;
  if (opts.trial ? !beginTrial(profile) : !spendEnergy(profile)) return false;
  if (!opts.trial) { profile.chapter.selected = chapterId; selectDifficulty(profile, chapterId, difficulty); }
  commit(profile);
  app.meta.hide();
  const loadout = computeLoadout(profile);
  const run = new Run(app.engine, { app, loadout, chapter, mutators, bloodMoon: !opts.trial && bloodMoon(profile), difficulty });
  const runUI = new RunUI(app, run);
  app.run = run; app.runUI = runUI;
  app.engine.setController(run);
  audio.playMusic('battle');
  run.onEnd = (result) => {
    const outcome = applyRunResult(profile, result);
    commit(profile);
    runUI.showResults(result, outcome);
  };
  return true;
}

function exitRun() {
  if (app.run) app.run.dispose();
  if (app.runUI) app.runUI.dispose();
  app.run = null; app.runUI = null; app.exitedAt = performance.now();
  app.engine.setController(app.showcase);
  app.showcase.setHero(profile.selectedHero);
  app.meta.show('battle');
  audio.playMusic('menu');
}

function boot() {
  upkeep(profile);
  commit(profile);
  setHapticsEnabled(profile.settings.haptics);

  const engine = new Engine(document.getElementById('game'), document.getElementById('fx2d'), { quality: profile.settings.quality });
  app.engine = engine;
  engine.reduceFlash = !!profile.settings.reduceFlash; engine.fpsCap = profile.settings.fps30 ? 30 : 60;
  app.showcase = new Showcase(engine);
  app.showcase.setHero(profile.selectedHero);
  engine.setController(app.showcase);
  engine.start();

  app.meta = createMeta(app);
  document.getElementById('ui').appendChild(app.meta.el);
  app.meta.show('battle');

  // Audio needs a user gesture on mobile.
  let audioLoaded = false, gestured = false;
  const startAudio = () => {
    audio.init();
    applySettings();
    audio.playMusic(app.run ? 'battle' : 'menu');
  };
  const unlock = () => {
    gestured = true;
    if (!audioLoaded) return; // too early: keep listening, a later tap will start it
    startAudio();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  loadAudio().then(() => {
    audioLoaded = true;
    applySettings();
    if (gestured) startAudio(); // the module resumes its context on the next tap if the browser still blocks it
  });
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Periodic upkeep (energy regen, daily resets).
  setInterval(() => { upkeep(profile); if (!app.run) commit(profile); }, 15000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveProfile(profile, true); if (app.run) app.run.pause(true); }
  });
  // Android back: close, pause or step back a layer; at the home screen it sends the app to the background (state kept)
  if (isNative) NativeApp.addListener('backButton', () => { if (handleBack(app) === 'exit') NativeApp.minimizeApp(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.repeat) handleBack(app); });

  const bootEl = document.getElementById('boot');
  requestAnimationFrame(() => { bootEl.classList.add('out'); setTimeout(() => bootEl.remove(), 600); });
}

try {
  boot();
} catch (e) {
  console.error(e);
  toast('Something went wrong while starting. Please reload.');
}
