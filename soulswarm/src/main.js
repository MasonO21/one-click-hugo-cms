// SOULSWARM: app bootstrap. Wires the profile, audio, renderer, menus and runs together.
import './ui/style.css';
import { audio, loadAudio } from './audio/index.js';
import { loadProfile, saveProfile, newProfile } from './meta/save.js';
import { upkeep, commit, spendEnergy, computeLoadout, applyRunResult, beginTrial, dailyTrial, bloodMoon, beginRush, eventCourt } from './meta/economy.js';
import { Store } from './meta/store.js';
import { difficultyUnlocked, selectDifficulty } from './meta/difficulty.js';
import { activePage } from './meta/grimoire.js';
import { haptic, setHapticsEnabled, isNative } from './engine/platform.js';
import { App as NativeApp } from '@capacitor/app';
import { handleBack } from './ui/back.js';
import * as clock from './meta/clock.js';
import * as heroModels from './engine/heromodels.js';
import * as foeModels from './engine/foemodels.js';
import { Engine } from './engine/engine.js';
import { Showcase } from './game/showcase.js';
import { Run } from './game/run.js';
import { RunUI } from './ui/runui.js';
import { createMeta } from './ui/meta/index.js';
import { CHAPTERS, CLOCK, ENDLESS_ID, ENDLESS_UNLOCK, chapterById, BOSS_RUSH } from './game/data.js';
import { toast } from './ui/dom.js';
import { analytics } from './meta/analytics.js';
import { needsGate, needsConsent, answerGate, setConsent } from './meta/privacy.js';
import { openAgeGate, openConsent } from './ui/meta/privacy.js';
import { actOf } from './game/data.js';

const profile = loadProfile();

/**
 * The app object is the contract between systems. Menus receive it and use:
 *   app.profile, app.audio, app.store, app.haptic(kind), app.engine
 *   app.heroPortrait(heroId) -> dataURL of a rendered 3D portrait
 *   app.showcase.setHero(heroId)  (the 3D hero standing behind the home screen)
 *   app.startRun(chapterId, { trial, difficulty, tutorial, rush }) -> boolean (false when out of energy, the trial is spent or the difficulty is locked)
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
  replaceProfile,
  clock, // QA: the clock instance the game uses (a dev server's HMR can serve a second copy to a fresh import)
  heroModels, // QA: likewise, the painted-model cache
  foeModels, // QA: the painted foes' cache
  analytics, // QA and Settings → Privacy: the gameplay event queue (meta/analytics.js)
  privacy: { openAgeGate: (done) => openAgeGate(app, done), openConsent: (where, done) => openConsent(app, where, done) }, // QA
};
window.__soulswarm = app; // handy for QA scripts

/** Replace the live profile with a restored one (a transfer code, meta/transfer.js): persist, reload. */
function replaceProfile(next) {
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, next);
  saveProfile(profile, true);
  try { location.reload(); } catch (e) { /* ignore */ }
}

/** Wipe all progress: blank the live profile (so an unload save cannot restore it), persist, reload. */
function resetProgress() {
  analytics.clear(); // "Delete my data": the queued events go with the save
  const fresh = newProfile();
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, fresh);
  saveProfile(profile, true);
  try { location.reload(); } catch (e) { /* ignore */ }
}

function applySettings() {
  const s = profile.settings;
  audio.setVolumes({ music: s.music, sfx: s.sfx, voice: s.voice });
  audio.setMuted(!!s.muted);
  setHapticsEnabled(s.haptics);
  if (app.engine) { app.engine.setQuality(s.quality); app.engine.reduceFlash = !!s.reduceFlash; app.engine.fpsCap = s.fps30 ? 30 : 60; }
  if (app.runUI) app.runUI.el.classList.toggle('lefty', !!s.lefty);
  saveProfile(profile);
}

/** opts.trial: today's Daily Trial (free; its chapter and mutators come from the date).
 *  opts.difficulty: 'normal' (default) | 'nightmare' | 'torment'; must be unlocked for the chapter. The trial always plays Normal.
 *  opts.tutorial: the beginner tutorial (game/tutorial.js): free, Chapter 1 on Normal, never under the Blood Moon.
 *  opts.rush: Boss Rush (BOSS_RUSH): free, one of today's tries while the event is open; it starts at Chapter 1's scaling. */
function startRun(chapterId, opts = {}) {
  if (opts.tutorial) return beginRun(CHAPTERS[0], { tutorial: true });
  if (opts.rush) { const court = eventCourt(profile); return beginRush(profile) ? beginRun(CHAPTERS[BOSS_RUSH.courts[court].chapters[0] - 1], { rush: true, court }) : false; } // this week's court
  let mutators = null;
  if (opts.trial) { const t = dailyTrial(profile); chapterId = t.chapter; mutators = [t.boon, t.bane]; }
  chapterId = +chapterId;
  const endless = chapterId === ENDLESS_ID, chapter = endless ? chapterById(ENDLESS_ID) : CHAPTERS[chapterId - 1];
  if (!chapter || (endless ? profile.chapter.unlocked < ENDLESS_UNLOCK : chapterId > profile.chapter.unlocked)) return false;
  const difficulty = (!opts.trial && opts.difficulty) || 'normal';
  if (!difficultyUnlocked(profile, chapterId, difficulty)) return false;
  if (opts.trial ? !beginTrial(profile) : !spendEnergy(profile)) return false;
  if (!opts.trial) { profile.chapter.selected = chapterId; selectDifficulty(profile, chapterId, difficulty); }
  return beginRun(chapter, { mutators, bloodMoon: !opts.trial && bloodMoon(profile), difficulty, page: opts.trial ? null : activePage(profile) }); // the inscribed Grimoire page (not in the trial)
}

function beginRun(chapter, opts) {
  if (profile.flags.coach && !opts.tutorial) profile.flags.coach = ''; // the post-tutorial pointers (ui/meta) end with the first real run
  commit(profile);
  app.meta.hide();
  const loadout = computeLoadout(profile);
  const run = new Run(app.engine, { app, loadout, chapter, ...opts });
  const mode = opts.tutorial ? 'tutorial' : opts.rush ? (opts.court === 'fallen' ? 'rush_fallen' : 'rush') : opts.mutators ? 'trial' : chapter.endless ? 'endless' : 'campaign';
  const base = { mode, chapter: chapter.id, act: chapter.act || 0, difficulty: opts.difficulty || 'normal', hero: profile.selectedHero };
  analytics.track(opts.tutorial ? 'tutorial_start' : 'run_start', { ...base, page: opts.page || '', bloodMoon: !!opts.bloodMoon, level: profile.level });
  const unlocked0 = profile.chapter.unlocked;
  const runUI = new RunUI(app, run);
  app.run = run; app.runUI = runUI;
  app.engine.setController(run);
  audio.playMusic('battle');
  run.onEnd = (result) => {
    const outcome = applyRunResult(profile, result);
    commit(profile);
    if (mode === 'tutorial') analytics.track('ftue_complete', { skipped: !!(outcome && outcome.ended), time: result.time });
    else analytics.track('run_end', { ...base, victory: !!result.victory, time: result.time, kills: result.kills, level: result.level, legion: result.bestLegion,
      bossKills: result.bossKills, boss: run.bossId, deathMinute: result.victory ? undefined : Math.floor((result.time || 0) / 60), firstClear: !!(outcome && outcome.firstClear) });
    if (profile.chapter.unlocked > unlocked0) analytics.track('chapter_unlock', { chapter: profile.chapter.unlocked, act: actOf(profile.chapter.unlocked).n });
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
  // Update 14: the neutral age gate (once), then the consent sheet when the policy is new to this player; nothing is
  // measured before. Automated test browsers (navigator.webdriver) answer as an adult who chose "Necessary only".
  analytics.init(profile);
  const sessionStart = () => analytics.track('session_start', { returning: profile.stats.runs > 0, days: Math.floor((clock.now() - profile.createdAt) / 864e5), level: profile.level, chapter: profile.chapter.unlocked });
  if (navigator.webdriver && needsGate(profile)) { answerGate(profile, new Date(clock.now()).getFullYear() - 30, false); setConsent(profile, { analytics: false, ads: false }); commit(profile); }
  if (needsGate(profile)) openAgeGate(app, sessionStart);
  else if (needsConsent(profile)) openConsent(app, 'policy', sessionStart);
  else sessionStart();
  // the painted foes load behind the home screen, so the first run's horde is painted from its first frame
  setTimeout(() => foeModels.loadFoeModels(), 600);

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
  // Server time for daily resets and timers (meta/clock.js): at boot, on every resume and every few minutes
  const timeSync = (resume) => clock.sync({ resume }).then((ok) => { if (ok) { upkeep(profile); commit(profile); if (!app.run) app.meta.refresh(); } });
  timeSync(false);
  setInterval(() => timeSync(false), CLOCK.resyncMin * 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saveProfile(profile, true); if (app.run) app.run.pause(true); }
    else timeSync(true);
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
