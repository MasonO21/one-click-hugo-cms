#!/usr/bin/env node
/**
 * Store screenshots for Nova Colony (App Store + Google Play), captioned and store-ready.
 *
 *   node scripts/store-shots.mjs --url http://localhost:5203 --save path/to/save.txt [options]
 *
 * Prerequisites: a running dev server (`npx vite --port 5203 --strictPort`), Chromium for Playwright
 * (default /opt/pw-browsers/chromium-1194/chrome-linux/chrome, override with CHROMIUM_PATH) and a late-game
 * save string (the `NCS1:<crc>:<json>` envelope the game writes to localStorage). The save is seeded into
 * `localStorage['nova_colony_save_v1']` before the page boots, then made to look natural in-page through
 * `window.game` (`?debug`): Welcome Back collected, believable resource totals, a late-game story mission,
 * extra colonists and lanterns, every biome discovered. Nothing in the game is changed; everything goes
 * through the public sim API.
 *
 * Options
 *   --url <origin>        dev server (default http://localhost:5203)
 *   --save <file>         late-game save string (required unless --only tiers)
 *   --out <dir>           output root (default art/store/screenshots)
 *   --raw <dir>           where the uncaptioned captures and the contact sheet go (default <tmpdir>/nova-colony-store-shots)
 *   --devices a,b         subset of iphone-6.9, ipad-13, play-phone (default all)
 *   --only slug,slug      subset of scenes (hero tiers night festival raid build research crew style map)
 *   --no-sheet            skip the contact sheet of the phone set
 *
 * Outputs (RGB PNG, no alpha)
 *   <out>/iphone-6.9/NN-<slug>.png   1320×2868 (CSS 440×956 @3x)
 *   <out>/ipad-13/NN-<slug>.png      2064×2752 (CSS 1032×1376 @2x) — the strongest six
 *   <out>/play-phone/NN-<slug>.png   1080×1920 (CSS 360×640 @3x)
 *   <raw>/<device>/NN-<slug>[-part].png  the gameplay captures that went into each shot
 *   <raw>/contact-iphone-6.9.png     one row of the phone set, for review
 *
 * Each shot is composed in HTML/CSS (brand gradient from the app-icon sky, cream caption, the capture in a
 * rounded card) and screenshotted at the exact store size, so the set can be re-shot after art changes by
 * re-running this script. Scene setup lives in SCENES below.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const { chromium } = await import(path.join(root, 'node_modules/playwright/index.mjs'));

// ------------------------------------------------------------------------------------------------ CLI

const args = parseArgs(process.argv.slice(2));
const URL_BASE = (args.url ?? 'http://localhost:5203').replace(/\/$/, '');
const OUT = path.resolve(root, args.out ?? 'art/store/screenshots');
const RAW = path.resolve(root, args.raw ?? path.join(os.tmpdir(), 'nova-colony-store-shots'));
const ONLY = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
const DEVICE_IDS = args.devices ? String(args.devices).split(',').map((s) => s.trim()).filter(Boolean) : null;
const SAVE = args.save ? fs.readFileSync(path.resolve(args.save), 'utf8').trim() : null;
if (!SAVE) fail('--save <file> is required (a late-game save string)');

const CHROMIUM = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean).find((p) => exists(p));
if (!CHROMIUM) fail('Chromium not found; set CHROMIUM_PATH');

// ------------------------------------------------------------------------------------------------ devices & layout
//
// Everything is in CSS px of the device frame; the composition page renders at the device's DPR, so the
// screenshot comes out at the exact store size. `card` is where the gameplay capture goes (the game is
// captured at that CSS size, pixel for pixel), `cap` is the caption band above it.

const DEVICES = [
  {
    id: 'iphone-6.9', w: 440, h: 956, dpr: 3, mobile: true, out: [1320, 2868],
    gut: 18, capTop: 46, capH: 104, cardTop: 168, radius: 30, font: 35, chip: 14, star: 1,
  },
  {
    id: 'ipad-13', w: 1032, h: 1376, dpr: 2, mobile: true, out: [2064, 2752],
    gut: 40, capTop: 72, capH: 150, cardTop: 248, radius: 44, font: 66, chip: 24, star: 2,
  },
  {
    id: 'play-phone', w: 360, h: 640, dpr: 3, mobile: true, out: [1080, 1920],
    gut: 14, capTop: 30, capH: 78, cardTop: 118, radius: 24, font: 27, chip: 12, star: 0.8,
  },
];
for (const d of DEVICES) {
  d.card = { w: d.w - 2 * d.gut, h: d.h - d.cardTop - d.gut };
}

// ------------------------------------------------------------------------------------------------ scenes
//
// `capture(page, dev, h)` drives the live game through window.game / window.renderer and returns one or more raw
// PNG captures of the game page. `compose(raws, dev, scene)` (optional) builds the store frame; the default puts the
// first capture in the card under the caption. `devices` restricts a scene to some devices (iPad gets six).

/** Screenshots and waits under SwiftShader: a 2064×2752 frame can take tens of seconds. */
const SLOW_TIMEOUT = 240_000;
const GOLDEN = 0.72; // sunset light, pink sky
const NIGHT = 0.94; // dark enough for lantern pools, still readable

const SCENES = [
  {
    slug: 'hero', caption: 'Build your dream colony on a new world',
    async capture(page, dev, h) {
      await h.resetView(page);
      // the player stands a few steps south-east of the core; the follow camera looks north-west over the whole
      // colony to the sunset horizon
      await page.evaluate(({ t }) => {
        const g = window.game;
        const c = g.sys.buildings.center(g.sys.buildings.core());
        Object.assign(g.state.player, { x: c.x + 3, z: c.z + 6, rot: -2.4 });
        Object.assign(g.view.camera, { mode: 'follow', yaw: 5.0, zoom: 0.92 });
        window.renderer.setPitchBias(-0.5);
        g.state.time.dayTime = t;
      }, { t: GOLDEN });
      await h.settle(page, 3400);
      return [await page.screenshot({ type: 'png' })];
    },
  },
  {
    slug: 'tiers', caption: 'From wood camp to titanium fortress',
    async capture(page, dev, h) {
      // Two halves, same camera: the Wood camp of the first hour (the curated showcase colony scene at tier 0, on
      // its own page) above, the live Titanium colony below with its HUD hidden. Each half is captured at the height
      // it occupies in the card so nothing is cropped away.
      const half = { width: dev.card.w, height: Math.round(dev.card.h * 0.6) };
      const raws = [];
      const camp = await page.context().newPage();
      try {
        await camp.setViewportSize(half);
        await camp.goto(`${URL_BASE}/showcase.html?scene=colony&tier=0&hud=0&q=high&t=${GOLDEN}&zoom=0.3&yaw=0.62&pitch=0.05&focus=1,1`, { waitUntil: 'load' });
        await camp.waitForFunction(() => !!window.game && !!window.renderer, null, { timeout: 90_000 });
        await camp.evaluate(() => {
          // the camp of the first hour: none of the scene's late-game extras exist yet
          const g = window.game;
          g.state.settings.qualityMode = 'manual';
          g.state.settings.quality = 'high';
          try { window.renderer.applyQuality?.('high', true); } catch { /* picked up next frame */ }
          const late = new Set(['wind_turbine', 'solar_panel', 'greenhouse', 'water_pump', 'kitchen', 'smelter', 'factory', 'research_lab', 'fusion_reactor', 'teleporter', 'turret_mg', 'turret_laser', 'turret_missile', 'drone_hub', 'habitat', 'skyscraper']);
          g.state.buildings.list = g.state.buildings.list.filter((b) => !late.has(g.data.building(b.def)?.model ?? b.def));
          g.derived.buildingsVersion++;
        });
        await camp.waitForTimeout(3500);
        raws.push(await camp.screenshot({ type: 'png' }));
      } finally {
        await camp.close();
      }
      await h.resetView(page);
      await page.setViewportSize(half);
      await page.evaluate(({ t }) => {
        const g = window.game;
        const c = g.sys.buildings.center(g.sys.buildings.core());
        document.getElementById('ui').style.visibility = 'hidden';
        Object.assign(g.state.player, { x: c.x + 2, z: c.z + 5, rot: -2.4 });
        Object.assign(g.view.camera, { mode: 'follow', yaw: 0.62, zoom: 0.62 });
        window.renderer.setPitchBias(-0.18);
        g.state.time.dayTime = t;
      }, { t: GOLDEN });
      await h.settle(page, 3400);
      raws.push(await page.screenshot({ type: 'png' }));
      await page.evaluate(() => { document.getElementById('ui').style.visibility = ''; });
      await page.setViewportSize({ width: dev.card.w, height: dev.card.h });
      await page.waitForTimeout(800);
      return raws;
    },
    compose(raws, dev, scene) {
      const [top, bottom] = raws.map(dataUrl);
      const { w: cw, h: ch } = dev.card;
      const chipFs = dev.chip;
      // the diagonal runs from 58.5% (left) to 45.5% (right) of the card; each half is 60% tall
      const H = 0.6;
      const [sl, sr] = [0.585, 0.455];
      const pct = (v) => `${(v * 100).toFixed(2)}%`;
      const body = `
        <div class="half top"><img src="${top}"></div>
        <div class="half bottom"><img src="${bottom}"></div>
        <svg class="split" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="none"><line x1="0" y1="${ch * sl}" x2="${cw}" y2="${ch * sr}"/></svg>
        <div class="chip tl"><i style="background:#a8743f"></i>Tier 1 · Wood camp</div>
        <div class="chip br"><i style="background:#dfe6ee"></i>Tier 7 · Titanium</div>`;
      const css = `
        .half{position:absolute;left:0;width:100%;height:${pct(H)}}
        .half img{display:block;width:100%;height:100%;object-fit:cover}
        .half.top{top:0;clip-path:polygon(0 0,100% 0,100% ${pct(sr / H)},0 ${pct(sl / H)})}
        .half.bottom{bottom:0;clip-path:polygon(0 ${pct((sl - (1 - H)) / H)},100% ${pct((sr - (1 - H)) / H)},100% 100%,0 100%)}
        .split{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
        .split line{stroke:#fff7e8;stroke-width:${Math.max(3, chipFs * 0.4)};stroke-linecap:round;filter:drop-shadow(0 ${chipFs * 0.15}px ${chipFs * 0.5}px rgba(30,10,40,.45))}
        .chip{position:absolute;display:flex;align-items:center;gap:.45em;padding:.45em .9em .45em .7em;border-radius:999px;background:rgba(255,247,232,.96);color:#2a2140;font-weight:800;font-size:${chipFs}px;letter-spacing:-.01em;box-shadow:0 .25em .8em rgba(30,10,40,.35)}
        .chip i{display:inline-block;width:.8em;height:.8em;border-radius:50%;box-shadow:inset 0 0 0 2px rgba(42,33,64,.25)}
        .chip.tl{left:${chipFs * 1.1}px;top:${chipFs * 1.1}px}
        .chip.br{right:${chipFs * 1.1}px;bottom:${chipFs * 1.1}px}`;
      return frame(dev, scene.caption, body, css);
    },
  },
  {
    slug: 'night', caption: 'Warm lights and thriving nights',
    async capture(page, dev, h) {
      await h.resetView(page);
      // beside the core, where the lanterns and the campfire are; the player's own lantern lights the lane
      await page.evaluate(({ t }) => {
        const g = window.game;
        const c = g.sys.buildings.center(g.sys.buildings.core());
        Object.assign(g.state.player, { x: c.x + 3, z: c.z + 8, rot: -2.2 });
        Object.assign(g.view.camera, { mode: 'follow', yaw: 0.62, zoom: 0.64 });
        window.renderer.setPitchBias(0);
        g.state.time.dayTime = t;
      }, { t: NIGHT });
      await h.settle(page, 3200);
      return [await page.screenshot({ type: 'png' })];
    },
  },
  {
    // the colony gathers round the campfire under string lights; the sim runs ahead so everyone has arrived
    slug: 'festival', caption: 'Celebrate together under the lanterns', devices: ['iphone-6.9', 'play-phone'],
    async capture(page, dev, h) {
      await h.resetView(page);
      const info = await page.evaluate(({ t }) => {
        const g = window.game;
        g.state.spirit.festivalUntil = 0; // a festival that is about to end would block a fresh one
        const started = g.sys.spirit.startNow();
        for (let i = 0; i < 240; i++) g.update(0.1);
        const p = { x: 0, z: 0 };
        const has = g.sys.spirit.slotFor(0, p);
        const c = has ? p : g.sys.buildings.center(g.sys.buildings.core());
        Object.assign(g.state.player, { x: c.x + 4, z: c.z + 6, rot: -2.4 });
        Object.assign(g.view.camera, { mode: 'follow', yaw: 0.62, zoom: 0.5 });
        window.renderer.setPitchBias(-0.2);
        g.state.time.dayTime = t;
        return { started, has, active: g.sys.spirit.active() };
      }, { t: 0.86 });
      log(`    festival: ${JSON.stringify(info)}`);
      await h.settle(page, 3600);
      return [await page.screenshot({ type: 'png' })];
    },
  },
  {
    slug: 'raid', caption: 'Defend your colony from alien raids',
    async capture(page, dev, h) {
      await h.resetView(page);
      // a battery of late-game turrets on the colony's east edge, then an invasion that comes straight at it
      const spot = await page.evaluate(() => {
        const g = window.game;
        const B = g.sys.buildings;
        const CELL = 2;
        const cells = g.state.buildings.list.map((b) => ({ x: b.x, z: b.z }));
        const maxX = Math.max(...cells.map((c) => c.x));
        const core = B.core();
        const cz0 = core.z;
        // mid-range guns (≤ 15 cells): railguns and titan cannons would finish the wave at the horizon, out of frame
        const defs = ['plasma_turret', 'laser_turret', 'missile_turret', 'mg_turret', 'aa_gun', 'heavy_sentry', 'shield_generator'];
        let placed = 0;
        let i = 0;
        for (let col = 0; col < 4 && i < defs.length; col++) {
          for (let row = -4; row <= 4 && i < defs.length; row += 2) {
            const cx = maxX + 3 + col * 2;
            const cz = cz0 + row * 2;
            const def = defs[i];
            if (!B.canPlace(def, cx, cz, 0).ok) continue;
            if (B.place(def, cx, cz, 0, { free: true, instant: true, quiet: true }) != null) {
              placed++;
              i++;
            }
          }
        }
        B.flush();
        g.sys.combat.refresh();
        // only the first waves are aimed at the defenses (later ones pick a random side): plan this one as an early
        // wave so it comes straight at the battery, then restore the wave count
        const wave = g.state.combat.wave;
        g.state.combat.wave = 0;
        g.sys.combat.schedule(0, 1);
        g.sys.combat.startNow();
        g.state.combat.wave = wave;
        // the player stands with the turrets (they fire faster beside you), camera looks out east over them
        const wx = (maxX + 2 - 128) * CELL + 1;
        const wz = (cz0 - 128) * CELL + 1;
        Object.assign(g.state.player, { x: wx + 1, z: wz + 1, rot: Math.PI / 2 });
        g.state.time.dayTime = 0.5;
        Object.assign(g.view.camera, { mode: 'follow', yaw: -1.05, zoom: 0.58 });
        window.renderer.setPitchBias(-0.3);
        return { placed, phase: g.state.combat.phase, tx: wx + 9, tz: wz };
      });
      log(`    turrets placed: ${spot.placed}, combat: ${spot.phase}`);
      // The wave's own groups spawn far out and a researched battery shreds them at the edge of its range, so the
      // on-screen front is scripted: a crowd of this tier's invaders walks in from the east, in sight of the guns.
      // They are ordinary invaders (they path to the core and count toward the wave). A few seconds of simulation
      // let the turrets lock on and fire before the shot.
      const reached = await page.evaluate(({ tx, tz }) => {
        const g = window.game;
        const c = g.state.combat;
        const core = g.sys.buildings.center(g.sys.buildings.core());
        const dir = Math.atan2(tz - core.z, tx - core.x); // core -> battery, the aliens come from beyond it
        const crowd = [];
        for (const [id, n] of [['razor_crawler', 12], ['crawler', 6], ['acid_spitter', 5], ['brute', 4], ['flyer', 4], ['stormwing', 1], ['queen', 1]]) for (let i = 0; i < n; i++) crowd.push(id);
        let seed = 7;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        let spawned = 0;
        for (const id of crowd) {
          const r = 11 + rnd() * 12;
          const a = dir + (rnd() - 0.5) * 1.1;
          if (g.sys.combat.spawnInvader(id, tx + Math.cos(a) * r, tz + Math.sin(a) * r) != null) spawned++;
        }
        for (let t = 0; t < 1.2; t += 0.1) g.update(0.1);
        const alive = c.aliens.filter((a) => a.state !== 'dying' && Math.hypot(a.x - tx, a.z - tz) < 50);
        const fx = alive.reduce((s, a) => s + a.x, 0) / Math.max(1, alive.length);
        const fz = alive.reduce((s, a) => s + a.z, 0) / Math.max(1, alive.length);
        // an overview camera looking out along core -> aliens (the camera looks along (-sin yaw, -cos yaw)); the
        // target sits a little beyond the front so the crowd lands in the lower half of the frame, under the HUD cards
        const yaw = Math.atan2(-(fx - core.x), -(fz - core.z));
        Object.assign(g.view.camera, { mode: 'overview', tx: fx - Math.sin(yaw) * 6, tz: fz - Math.cos(yaw) * 6, yaw, zoom: 0.5 });
        return { spawned, alive: alive.length, proj: c.projectiles.length, phase: c.phase, yaw: +g.view.camera.yaw.toFixed(2) };
      }, spot);
      log(`    fight: ${JSON.stringify(reached)}`);
      await h.settle(page, 2200);
      return [await page.screenshot({ type: 'png' })];
    },
  },
  {
    slug: 'build', caption: 'Drag, drop, build: 150 buildings',
    async capture(page, dev, h) {
      await h.resetView(page);
      await page.evaluate(() => {
        const g = window.game;
        g.state.time.dayTime = 0.46;
        Object.assign(g.view.camera, { mode: 'follow', yaw: Math.PI * 0.25, zoom: 0.4 });
        window.renderer.setPitchBias(0);
        g.bus.emit('ui:open', { panel: 'build', arg: 'housing' });
      });
      await h.settle(page, 2600);
      const raw = await page.screenshot({ type: 'png' });
      await h.closePanels(page);
      return [raw];
    },
  },
  {
    // Google Play takes eight phone screenshots: the tech tree is App Store only
    slug: 'research', caption: '90 technologies to research', devices: ['iphone-6.9'],
    async capture(page, dev, h) {
      await h.resetView(page);
      await page.evaluate(() => {
        const g = window.game;
        g.state.time.dayTime = 0.46;
        g.bus.emit('ui:open', { panel: 'research', arg: { id: 'radio_comms' } }); // the Colonists tree: the densest branch in portrait
      });
      await h.settle(page, 2600);
      const raw = await page.screenshot({ type: 'png' });
      await h.closePanels(page);
      return [raw];
    },
  },
  {
    // Google Play takes eight phone shots: the crew list is App Store only (the festival shows the people instead)
    slug: 'crew', caption: 'Recruit colonists with personality', devices: ['iphone-6.9'],
    async capture(page, dev, h) {
      await h.resetView(page);
      await page.evaluate(() => {
        const g = window.game;
        g.state.time.dayTime = 0.46;
        g.bus.emit('ui:open', { panel: 'colonists' });
      });
      await h.settle(page, 2600);
      const raw = await page.screenshot({ type: 'png' });
      await h.closePanels(page);
      return [raw];
    },
  },
  {
    slug: 'style', caption: 'Outfits, pets and decor to make it yours', devices: ['iphone-6.9', 'play-phone'],
    async capture(page, dev, h) {
      await h.resetView(page);
      await page.evaluate(() => {
        const g = window.game;
        g.state.time.dayTime = 0.46;
        g.bus.emit('ui:open', { panel: 'wardrobe', arg: { tab: 'pets' } });
      });
      await h.settle(page, 3000);
      const raw = await page.screenshot({ type: 'png' });
      await h.closePanels(page);
      return [raw];
    },
  },
  {
    slug: 'map', caption: 'Explore 8 beautiful alien biomes',
    async capture(page, dev, h) {
      await h.resetView(page);
      await page.evaluate(() => {
        const g = window.game;
        g.state.time.dayTime = 0.46;
        g.bus.emit('ui:open', { panel: 'map' });
      });
      await h.settle(page, 3000);
      const raw = await page.screenshot({ type: 'png' });
      await h.closePanels(page);
      return [raw];
    },
  },
];

// ------------------------------------------------------------------------------------------------ in-page setup

/** Seeded before the page boots: the save goes into the main slot once per browser context. */
function seedSave(save) {
  try {
    if (!sessionStorage.getItem('nc_store_shots_seeded')) {
      localStorage.setItem('nova_colony_save_v1', save);
      sessionStorage.setItem('nc_store_shots_seeded', '1');
    }
  } catch {
    /* storage blocked: the game starts fresh */
  }
}

/**
 * The HUD's stock, day and progress numbers for the shots. Runs from naturalize and again after the boot cards close
 * (a Welcome Back claimed late would otherwise top the stock up to millions). Self-contained: it is serialised into
 * the page by Playwright.
 */
function pinNumbers() {
  const s = window.game.state;
  Object.assign(s.resources.amounts, {
    wood: 4820, stone: 3160, fiber: 1940, food: 2730, water: 2410, iron: 1385, copper: 962, coal: 1204,
    steel: 846, electronics: 512, biomass: 377, crystal: 288, alloy: 431, energy_cell: 265, nano: 174, titanium: 219,
  });
  s.research.points = 2450;
  s.time.day = 42;
  s.liveops.nova = 340;
  Object.assign(s.stats, { wavesWon: 23, kills: 1870, gathered: 48210, crafted: 96 });
  Object.assign(s.combat, { wave: 23, waveAtTier: 4, kills: 1870 });
  for (const c of s.colonists.list) c.happiness = Math.max(c.happiness, 82);
}

/**
 * Make a QA colony look like a real late-game save: late story mission, believable stock, a crew, lanterns for the
 * night shot, every biome on the map. Runs once after boot (Welcome Back already collected).
 */
function naturalize() {
  const pinNumbers = window.__pinNumbers; // installed by bootGame (page functions cannot share helpers)
  const g = window.game;
  const s = g.state;
  const d = g.data;
  const B = g.sys.buildings;

  // always shoot at high quality: newer builds pick the graphics level automatically ('auto' lands on low under
  // SwiftShader and can step down at runtime), so pin it to manual/high and re-apply it right away if the renderer
  // offers a setter (the field is harmless on builds without automatic quality)
  s.settings.qualityMode = 'manual';
  s.settings.quality = 'high';
  try { window.renderer.applyQuality?.('high', true); } catch { /* the render loop picks the setting up on its next frame */ }

  // no first-launch cards
  s.settings.analyticsAsked = true;
  const now = new Date(g.now());
  s.liveops.daily.lastClaim = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  s.liveops.daily.streak = 12;
  s.liveops.nova = 340;

  // story: a Titanium Super-Colony that finished the main chain (no tutorial bubble or guide arrow in the HUD);
  // the tracker shows today's daily missions instead, one of them half done
  const m = s.missions;
  const keep = (id) => d.mission(id)?.chain === 'daily';
  m.active = m.active.filter(keep);
  for (const id of Object.keys(m.progress)) if (!keep(id)) delete m.progress[id];
  for (const def of d.missions) if (def.chain !== 'daily' && !m.completed.includes(def.id)) m.completed.push(def.id);
  s.tutorial.done = true;
  s.combat.tutorialAttackDone = true;
  g.sys.missions.onLoad(false);
  // gathering dailies finish themselves in seconds with this economy (production counts) and building ones would
  // finish on the lanterns / turrets placed below, turning the tracker into a "Claim reward" button mid-shoot:
  // those count as claimed today; the first remaining daily is half done
  for (const id of m.active.filter((id) => keep(id) && ['gather', 'build'].includes(d.mission(id)?.type))) {
    m.active = m.active.filter((a) => a !== id);
    delete m.progress[id];
    if (!m.completed.includes(id)) m.completed.push(id);
  }
  g.sys.missions.onLoad(false);
  const firstDaily = m.active.find(keep);
  if (firstDaily) m.progress[firstDaily] = Math.max(1, Math.floor(d.mission(firstDaily).count * 0.5));

  // believable stock and progress numbers (pinNumbers runs again once the boot cards are closed)
  pinNumbers();
  Object.assign(s.player.equip, { tool: 'titan_beamtool', weapon: 'titanium_rifle', armor: 'titanium_exosuit', backpack: 'titan_haulpack' });
  for (const it of Object.values(s.player.equip)) s.player.items[it] = Math.max(1, s.player.items[it] ?? 0);

  // a few Wardrobe pieces, worn: the hero shot shows a dressed settler with a pet, the Wardrobe shot a mix of owned
  // and for-sale looks (granted straight into the save: no Nova is spent)
  const cos = s.liveops.cosmetics;
  const owned = ['outfit_frontier_knit', 'outfit_observatory', 'hat_ranger', 'hat_aviator', 'pet_ships_cat', 'pet_robo_hound', 'pet_ember_fox', 'deco_campfire_lounge'];
  for (const id of owned) if (d.cosmetic(id) && !cos.owned.includes(id)) cos.owned.push(id);
  for (const id of ['outfit_frontier_knit', 'hat_ranger', 'pet_ships_cat']) g.sys.liveops.equipCosmetic(id);

  // a crew worth the beds (quietly: no "joined" toasts)
  const core = B.center(B.core());
  const rarities = ['common', 'common', 'common', 'uncommon', 'common', 'rare', 'common', 'uncommon', 'common', 'epic'];
  const C = g.sys.colonists;
  const extra = Math.max(0, 54 - s.colonists.list.length);
  for (let i = 0; i < extra; i++) {
    const c = C.generate(rarities[i % rarities.length]);
    const a = (i / extra) * Math.PI * 2 + 0.3;
    const r = 5 + (i % 5) * 3.2;
    c.id = s.colonists.nextId++;
    c.x = c.tx = core.x + Math.cos(a) * r;
    c.z = c.tz = core.z + Math.sin(a) * r;
    c.rot = a + Math.PI / 2;
    c.activity = 'idle';
    c.workplace = null;
    c.bed = null;
    c.manual = false;
    c.joinedAt = g.now() - 3_600_000 * (3 + i);
    c.happiness = 78 + ((i * 7) % 20);
    s.colonists.list.push(c);
  }
  C.refresh();
  C.autoAssign();

  // lanterns along the colony's lanes (free, instant) so the night shot has warm pools of light
  let lamps = 0;
  const coreCell = { x: B.core().x + 1, z: B.core().z + 1 };
  const lampCells = [];
  const farFromLamps = (cx, cz) => lampCells.every((l) => Math.abs(l.x - cx) + Math.abs(l.z - cz) >= 4);
  outer: for (let ring = 2; ring <= 16; ring++) {
    const n = Math.max(8, ring * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.37;
      const cx = Math.round(coreCell.x + Math.cos(a) * ring);
      const cz = Math.round(coreCell.z + Math.sin(a) * ring);
      if (!farFromLamps(cx, cz) || !B.canPlace('lamp_post', cx, cz, 0).ok) continue;
      if (B.place('lamp_post', cx, cz, 0, { free: true, instant: true, quiet: true }) != null) {
        lamps++;
        lampCells.push({ x: cx, z: cz });
      }
      if (lamps >= 18) break outer;
    }
  }
  B.flush();

  // the whole planet on the map
  const W = g.sys.world;
  s.world.regionsDiscovered = [...s.world.regionsUnlocked];
  for (const p of W.gen?.pois ?? []) {
    const st = s.world.pois[p.id] ?? { discovered: false, looted: false, lootedAt: 0 };
    st.discovered = true;
    s.world.pois[p.id] = st;
  }
  for (const rc of W.gen?.regionCenters ?? []) W.revealAround(rc.x, rc.z, 70);
  W.revealAround(core.x, core.z, 90);
  s.stats.explored = W.explored();

  return { colonists: s.colonists.list.length, lamps, mission: g.sys.missions.current()?.name ?? null, day: s.time.day };
}

// ------------------------------------------------------------------------------------------------ page helpers

const helpers = {
  /** Back to the plain play view: panels closed, follow camera, no pitch bias. */
  async resetView(page) {
    await this.closePanels(page);
    await page.evaluate(() => {
      const g = window.game;
      Object.assign(g.view.camera, { mode: 'follow', yaw: Math.PI * 0.25, zoom: 0.45 });
      window.renderer.setPitchBias(0);
      g.view.selection = { kind: null, id: null };
    });
  },
  /** Let the camera damping and the HUD catch up (the renderer runs at a few fps under swiftshader). */
  async settle(page, ms) {
    await page.waitForTimeout(ms);
  },
  async closePanels(page) {
    for (let i = 0; i < 4; i++) {
      const open = await page.evaluate(() => document.querySelectorAll('.pm-frame:not(.closing) .pm-card').length);
      if (!open) break;
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
  },
};

/** Boot the live game page: wait for window.game, collect Welcome Back, then make the colony look natural. */
async function bootGame(page) {
  await page.goto(`${URL_BASE}/?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.game?.state && !!window.renderer, null, { timeout: 120_000 });
  await page.waitForTimeout(1800);
  const collect = page.locator('#btn-offline-collect');
  if ((await collect.count()) && (await collect.first().isVisible())) {
    await collect.first().click();
    await page.waitForTimeout(900);
  }
  // marketing shots: no tutorial hint bubble over the HUD
  await page.addStyleTag({ content: '.hint-bubble{display:none!important}' });
  await page.evaluate(`window.__pinNumbers = ${pinNumbers.toString()}`);
  const info = await page.evaluate(naturalize);
  log(`    colony: ${JSON.stringify(info)}`);
  await page.waitForTimeout(4500); // offline floaters and toasts fade
  await helpers.closePanels(page);
  await page.evaluate(pinNumbers);
}

// ------------------------------------------------------------------------------------------------ composition

const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

/** Little four-point sparkles like the ones in the app icon sky. */
function sparkles(dev) {
  const pts = [[0.08, 0.05, 1.3], [0.2, 0.11, 0.8], [0.86, 0.04, 1.1], [0.93, 0.1, 0.7], [0.55, 0.03, 0.6], [0.72, 0.08, 0.9], [0.32, 0.03, 0.55], [0.12, 0.14, 0.5]];
  const s = dev.star * dev.w * 0.012;
  return pts.map(([x, y, k]) => {
    const r = s * k;
    const cx = x * dev.w;
    const cy = y * dev.h;
    const d = `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
    return `<path d="${d}" opacity="${0.55 + 0.4 * (k > 1 ? 1 : k)}"/>`;
  }).join('');
}

/** The store frame: brand sky, caption band, a rounded cream-edged card holding `body`. */
function frame(dev, caption, body, extraCss = '') {
  const { w, h, gut, capTop, capH, cardTop, radius, font } = dev;
  const { w: cw, h: ch } = dev.card;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${w}px;height:${h}px;overflow:hidden}
    body{position:relative;background:#262b78;
      background-image:radial-gradient(120% 60% at 50% 118%,#ffc46f 0%,rgba(255,196,111,0) 60%),linear-gradient(180deg,#262b78 0%,#3f3189 22%,#7b3f91 44%,#c04f87 62%,#f0776b 80%,#ffb86e 100%);
      font-family:'Inter Display','Inter',ui-rounded,'SF Pro Rounded','Nunito','Baloo 2',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#fff7e8}
    .stars{position:absolute;inset:0;width:100%;height:100%;fill:#fff7e8}
    .cap{position:absolute;left:${gut}px;right:${gut}px;top:${capTop}px;height:${capH}px;display:flex;align-items:center;justify-content:center;text-align:center;
      font-weight:800;font-size:${font}px;line-height:1.08;letter-spacing:-.018em;text-wrap:balance;
      text-shadow:0 ${font * 0.06}px 0 rgba(42,33,64,.28),0 ${font * 0.22}px ${font * 0.6}px rgba(30,10,40,.35)}
    .card{position:absolute;left:${gut}px;top:${cardTop}px;width:${cw}px;height:${ch}px;border-radius:${radius}px;overflow:hidden;background:#1b2a3a;
      box-shadow:0 0 0 ${Math.max(3, radius * 0.14)}px rgba(255,247,232,.94),0 ${radius * 0.8}px ${radius * 1.8}px rgba(30,10,40,.45)}
    .card>img{display:block;width:100%;height:100%;object-fit:cover}
    ${extraCss}
  </style></head><body>
    <svg class="stars" viewBox="0 0 ${w} ${h}">${sparkles(dev)}</svg>
    <div class="cap">${escapeHtml(caption)}</div>
    <div class="card">${body}</div>
  </body></html>`;
}

function composeDefault(raws, dev, scene) {
  return frame(dev, scene.caption, `<img src="${dataUrl(raws[0])}">`);
}

/** One row of the finished phone set, for review. */
function contactSheet(files) {
    const cells = files.map(({ file, label }) => `<figure><img src="${dataUrl(fs.readFileSync(file))}"><figcaption>${escapeHtml(label)}</figcaption></figure>`).join('');
    const tw = 300;
    const th = Math.round(tw * 2868 / 1320);
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#15121f;color:#fff7e8;font:600 14px/1.3 'Inter',system-ui,sans-serif}
      body{display:flex;gap:16px;padding:20px;width:max-content}
      figure{margin:0;width:${tw}px}img{display:block;width:${tw}px;height:${th}px;border-radius:14px}
      figcaption{margin-top:8px;text-align:center;opacity:.85}
    </style></head><body>${cells}</body></html>`;
}

// ------------------------------------------------------------------------------------------------ main

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const t0 = Date.now();
const written = [];
try {
  for (const dev of DEVICES.filter((d) => !DEVICE_IDS || DEVICE_IDS.includes(d.id))) {
    const scenes = SCENES.filter((s) => (!ONLY || ONLY.includes(s.slug)) && (!s.devices || s.devices.includes(dev.id)));
    if (scenes.length === 0) continue;
    log(`${dev.id}: ${dev.out[0]}×${dev.out[1]} — ${scenes.map((s) => s.slug).join(', ')}`);
    fs.mkdirSync(path.join(OUT, dev.id), { recursive: true });
    fs.mkdirSync(path.join(RAW, dev.id), { recursive: true });

    // the game, captured at the card's CSS size
    const gameCtx = await browser.newContext({ viewport: { width: dev.card.w, height: dev.card.h }, deviceScaleFactor: dev.dpr, isMobile: dev.mobile, hasTouch: dev.mobile });
    gameCtx.setDefaultTimeout(SLOW_TIMEOUT); // a tablet-sized frame takes SwiftShader a while to produce
    if (SAVE) await gameCtx.addInitScript(seedSave, SAVE);
    const page = await gameCtx.newPage();
    page.on('pageerror', (e) => log(`    [pageerror] ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/GPU stall|WebGL/.test(m.text())) log(`    [console] ${m.text().slice(0, 200)}`); });
    // the store frame, rendered at the device size
    const frameCtx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.dpr });
    frameCtx.setDefaultTimeout(SLOW_TIMEOUT);
    const framePage = await frameCtx.newPage();

    // the raid changes the colony (turrets, aliens), so it is shot last; numbers follow the device's full set so a
    // re-shoot of one scene (--only) keeps its file name
    const ordered = [...scenes.filter((s) => s.slug !== 'raid'), ...scenes.filter((s) => s.slug === 'raid')];
    const index = new Map(SCENES.filter((s) => !s.devices || s.devices.includes(dev.id)).map((s, i) => [s.slug, i + 1]));
    await bootGame(page);
    for (const scene of ordered) {
      const nn = String(index.get(scene.slug)).padStart(2, '0');
      const name = `${nn}-${scene.slug}`;
      log(`  ${name}`);
      const raws = await scene.capture(page, dev, helpers);
      raws.forEach((png, i) => fs.writeFileSync(path.join(RAW, dev.id, `${name}${raws.length > 1 ? `-${i + 1}` : ''}.png`), png));
      const html = (scene.compose ?? composeDefault)(raws, dev, scene);
      await framePage.setContent(html, { waitUntil: 'load' });
      await framePage.evaluate(() => document.fonts.ready);
      await framePage.waitForTimeout(150);
      const png = toRgbPng(await framePage.screenshot({ type: 'png' }));
      const file = path.join(OUT, dev.id, `${name}.png`);
      fs.writeFileSync(file, png);
      const { width, height } = pngSize(png);
      if (width !== dev.out[0] || height !== dev.out[1]) throw new Error(`${file}: got ${width}×${height}, wanted ${dev.out.join('×')}`);
      if (png.length > 8 * 1024 * 1024) throw new Error(`${file}: ${(png.length / 1048576).toFixed(1)} MB exceeds the 8 MB store limit`);
      written.push({ dev: dev.id, file, label: `${nn} ${scene.caption}`, bytes: png.length });
      log(`    -> ${path.relative(root, file)} (${(png.length / 1048576).toFixed(2)} MB)`);
    }
    await gameCtx.close();
    await frameCtx.close();
  }

  if (!args['no-sheet']) {
    const phone = written.filter((w) => w.dev === 'iphone-6.9');
    if (phone.length) {
      const ctx = await browser.newContext({ viewport: { width: 320 * phone.length + 40, height: 760 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.setContent(contactSheet(phone), { waitUntil: 'load' });
      const file = path.join(RAW, 'contact-iphone-6.9.png');
      await p.screenshot({ path: file, fullPage: true });
      await ctx.close();
      log(`contact sheet -> ${file}`);
    }
  }
} finally {
  await browser.close();
}
log(`done: ${written.length} shots in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ------------------------------------------------------------------------------------------------ PNG utilities (no deps)

/** Store PNGs must carry no alpha channel. Chromium usually writes RGB already; RGBA is converted here. */
function toRgbPng(buf) {
  const ihdr = pngSize(buf);
  if (ihdr.colorType === 2 && ihdr.bitDepth === 8) return buf;
  if (ihdr.colorType !== 6 || ihdr.bitDepth !== 8) throw new Error(`unexpected PNG colour type ${ihdr.colorType}/${ihdr.bitDepth}`);
  const { width, height } = ihdr;
  const idat = [];
  for (const c of chunks(buf)) if (c.type === 'IDAT') idat.push(c.data);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const outStride = width * 3;
  const out = Buffer.alloc((outStride + 1) * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let ip = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ip++];
    for (let i = 0; i < stride; i++) {
      const x = raw[ip++];
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      cur[i] = v & 0xff;
    }
    // drop alpha, re-filter with Paeth (good general-purpose compression)
    const o = y * (outStride + 1);
    out[o] = 4;
    for (let px = 0; px < width; px++) {
      for (let k = 0; k < 3; k++) {
        const i = px * 3 + k;
        const v = cur[px * 4 + k];
        const a = px > 0 ? cur[(px - 1) * 4 + k] : 0;
        const b = y > 0 ? prev[px * 4 + k] : 0;
        const c = px > 0 && y > 0 ? prev[(px - 1) * 4 + k] : 0;
        out[o + 1 + i] = (v - paeth(a, b, c)) & 0xff;
      }
    }
    cur.copy(prev);
  }
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdrData),
    chunk('IDAT', zlib.deflateSync(out, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(td) >>> 0, 0);
  return Buffer.concat([len, td, crc]);
}

function* chunks(buf) {
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    yield { type, data: buf.subarray(p + 8, p + 8 + len) };
    p += 12 + len;
  }
}

function pngSize(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf[24], colorType: buf[25] };
}

// ------------------------------------------------------------------------------------------------ small utils

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (key.startsWith('no-')) out[key] = true;
    else if (next && !next.startsWith('--')) { out[key] = next; i++; } else out[key] = true;
  }
  return out;
}

function exists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function log(s) {
  console.log(s);
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
