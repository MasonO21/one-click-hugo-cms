// Capture kit for store screenshots and the video ad: runs the real game in Chromium with a fake clock, so every
// frame is deterministic and can be stepped one at a time. Levels are played along their verified routes through
// the game's own pointer handlers, with the drag animated (and a finger marker) so aiming is visible.
// Needs the dev server on :8123.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

export const URL = 'http://localhost:8123/?nosw';

export async function launch() {
  return chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
}

// in-page helpers (installed after every load)
const PAGE_KIT = () => {
  const app = window.__app;
  const css = document.createElement('style');
  css.textContent = `
    #install-hint, #hud-tip, .trophy-toast { display: none !important; }
    #mk-touch { position: fixed; z-index: 90; pointer-events: none; display: none; }
    #mk-touch i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); }
    #mk-touch .start { width: 46px; height: 46px; border: 4px solid rgba(255,255,255,.75); box-shadow: 0 0 0 3px rgba(58,34,22,.35); }
    #mk-touch .finger { width: 54px; height: 54px; background: rgba(255,255,255,.88); border: 4px solid #3a2216; box-shadow: 0 6px 14px rgba(0,0,0,.35); }
    #mk-cap { position: fixed; left: 0; right: 0; z-index: 95; pointer-events: none; text-align: center; font-family: 'Lilita One', sans-serif; color: #fff;
      -webkit-text-stroke: 0; text-shadow: 0 5px 0 #3a2216, 0 -3px 0 #3a2216, 3px 0 0 #3a2216, -3px 0 0 #3a2216, 3px 3px 0 #3a2216, -3px 3px 0 #3a2216, 0 10px 18px rgba(0,0,0,.35);
      line-height: 1.02; letter-spacing: .5px; white-space: pre-line; transform-origin: 50% 50%; }
    #mk-cap small { display: block; font-family: 'Fredoka', sans-serif; font-weight: 700; letter-spacing: 0; }
  `;
  document.head.appendChild(css);
  const touch = document.createElement('div'); touch.id = 'mk-touch'; touch.innerHTML = '<i class="start"></i><i class="finger"></i>';
  const cap = document.createElement('div'); cap.id = 'mk-cap';
  document.body.append(touch, cap);
  const PHYS_DT = 1 / 120;
  const mk = window.__mk = {
    due: null, frozen: false, shots: 0, launches: [], sounds: [],
    // play a level along its stored route; mk.due is set when the next shot should fire (the sim then waits)
    // free play (no route): fire your own shot with force() once ready() — e.g. one the dog eats
    ready() { const g = app.game; return g.phase === 'play' && g.sim.canLaunch(); },
    force(a, p) { mk.due = { a, p }; mk.frozen = true; },
    start(i, { character = 'sausage', skin, free = false } = {}) {
      if (character !== 'sausage') app.save.owned[character] = app.save.owned[character] || { at: 1, source: 'marketing' };
      app.save.character = character;
      if (skin) app.save.skin = skin;
      app.startLevel(i);
      const game = app.game;
      game.pointerDown(0, 0); // skip the intro, like a tap
      const sol = game.level.solution;
      let n = 0, wait = -1, t0 = 0;
      mk.due = null; mk.frozen = false; mk.shots = sol.length; mk.fired = 0;
      const s = game.sim, step = s.step.bind(s);
      s.step = () => {
        if (mk.frozen) return;
        step();
        if (free) return;
        if (game.phase !== 'play' || n >= sol.length || mk.due) return;
        if (wait < 0) {
          if (!(n === 0 ? s.canLaunch() : s.t - t0 > 0.15 && s.canLaunch())) return;
          wait = Math.round((sol[n][2] || 0) / (window.__PHYS_DT || PHYS_DT));
        } else wait--;
        if (wait <= 0) { mk.due = { a: sol[n][0], p: sol[n][1] }; mk.frozen = true; t0 = s.t; n++; wait = -1; }
      };
    },
    // the drag for the due shot: k = 0..1 along the pull. Returns the screen points.
    aim(k) {
      const game = app.game, d = mk.due;
      const len = 14 + d.p * (app.maxDrag() - 14);
      const sx = innerWidth * 0.5, sy = innerHeight * 0.6;
      const e = Math.sin(Math.min(1, k) * Math.PI / 2);
      const x = sx - Math.cos(d.a) * len * e, y = sy - Math.sin(d.a) * len * e;
      if (!game.aim) game.pointerDown(sx, sy);
      game.pointerMove(x, y);
      touch.style.display = 'block';
      touch.children[0].style.left = sx + 'px'; touch.children[0].style.top = sy + 'px';
      touch.children[1].style.left = x + 'px'; touch.children[1].style.top = y + 'px';
    },
    release() {
      const game = app.game;
      mk.aim(1);
      mk.frozen = false; mk.due = null;
      game.pointerUp();
      mk.fired++;
      touch.style.display = 'none';
    },
    hideTouch() { touch.style.display = 'none'; },
    caption(html, style = {}) { cap.innerHTML = html || ''; Object.assign(cap.style, style); },
  };
  // log sound effects with the (fake) clock time, for the ad's soundtrack
  const play = app.audio.play.bind(app.audio);
  app.audio.play = (name, o) => { mk.sounds.push({ name, o: o ? JSON.parse(JSON.stringify(o)) : undefined, t: performance.now() }); return play(name, o); };
};

export async function openGame(browser, { width, height, dpr, save = {} }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
  await page.goto(URL);
  await page.evaluate((s) => localStorage.setItem('sizzleflip.save.v1', JSON.stringify({ unlocked: 200, seenTips: { all: 1 }, ...s })), save);
  await page.reload();
  await page.waitForFunction(() => window.__app && window.__app.ui, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(2500);
  const { PHYS } = await page.evaluate(async () => { const m = await import('/src/physics.js'); window.__PHYS_DT = m.PHYS.DT; return { PHYS: { DT: m.PHYS.DT } }; });
  await page.evaluate(PAGE_KIT);
  return page;
}

// advance n frames of `ms` each, calling onFrame(i) after each
export async function frames(page, n, ms, onFrame) {
  for (let i = 0; i < n; i++) { await page.clock.runFor(ms); if (onFrame) await onFrame(i); }
}

// run until a shot is due (or the level ends); returns false on timeout
export async function untilDue(page, ms = 1000 / 30, max = 900) {
  for (let i = 0; i < max; i++) {
    const st = await page.evaluate(() => ({ due: !!window.__mk.due, phase: window.__app.game.phase }));
    if (st.due) return true;
    if (st.phase !== 'play') return false;
    await page.clock.runFor(ms);
  }
  return false;
}
