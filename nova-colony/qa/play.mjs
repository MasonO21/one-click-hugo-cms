// Human-like first-session playthrough through the real DOM UI. Usage: node qa/play.mjs [vp] [fromSnap] [untilStage]
import { closeModals, openPanels, SP, launch, waitReady, shot, sleep, walkTo, tap, tapXY, snapshot, timeScale, gameTime, mission, guide, res, w2s, dismissWelcome, advance } from './lib.mjs';
import fs from 'node:fs';
const vp = process.argv[2] || 'phone';
const from = process.argv[3] || '';
const until = process.argv[4] || 'end';
const TS = +(process.env.TS || 2);
const { browser, context, page, logs } = await launch(vp, from ? { storage: `${SP}/snap-${from}.json` } : {});
await waitReady(page);
await dismissWelcome(page);
await timeScale(page, TS);
const timeline = [];
const mark = async (label) => { const t = await gameTime(page); timeline.push([label, +t.toFixed(1)]); console.log(`== [${(t / 60).toFixed(2)} min] ${label}`, JSON.stringify(await res(page))); };
/** Human "think/read" time: the game keeps running while the player reads/decides. */
const think = async (sec) => { await advance(page, sec); };
const hud = async () => page.evaluate(() => document.querySelector('.nv-root')?.innerText.replace(/\s+/g, ' ').slice(0, 300));
const toasts = async () => page.evaluate(() => [...document.querySelectorAll('.toast, .nv-toast, [class*=toast]')].map((e) => e.innerText).filter(Boolean).slice(-4).join(' | '));

async function waitMission(id, maxGameSec = 600, onTick) {
  const t0 = await gameTime(page);
  while ((await gameTime(page)) - t0 < maxGameSec) {
    const m = await mission(page);
    if (!m || m.id !== id) return true;
    if (onTick) await onTick();
    await sleep(400);
  }
  return false;
}

/** Find an open spot near (cx, cz) for def (as a human eyeballing the ground). Returns world center. */
async function findSpot(def, cx, cz, minR = 3, prefer = null) {
  return page.evaluate(([def, cx, cz, minR, prefer]) => {
    const g = window.game, bs = g.sys.buildings, d = g.data.building(def);
    const C = 2, HALF = 256;
    const cell = (v) => Math.floor((v + HALF) / C);
    const best = [];
    for (let r = minR; r < 14; r++) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const x = cx + Math.cos(ang) * r * C, z = cz + Math.sin(ang) * r * C;
        const ix = cell(x), iz = cell(z);
        if (bs.canPlace(def, ix, iz, 0).ok) {
          const wx = (ix + d.size[0] / 2) * C - HALF, wz = (iz + d.size[1] / 2) * C - HALF;
          let score = r;
          // a human picks a spot they can see: up-screen of the player, away from the HUD edges
          const sp = window.renderer.worldToScreen(wx, 0.5, wz);
          if (!sp.visible || sp.y < innerHeight * 0.3 || sp.y > innerHeight * 0.72 || sp.x < innerWidth * 0.3 || sp.x > innerWidth * 0.8) score += 100;
          if (prefer === 'trees') { const n = []; const k = g.sys.world.nodesNear(wx, wz, 12, n); score += -k + r * 0.2; }
          best.push({ x: wx, z: wz, score });
        }
      }
      if (best.filter((b) => b.score < 100).length > 6 && prefer !== 'trees') break;
    }
    best.sort((a, b) => a.score - b.score);
    return best[0] || null;
  }, [def, cx, cz, minR, prefer]);
}

async function placeViaUI(def, spot, tag) {
  await ensureAfford(def);
  await tap(page, '#btn-build', { after: 900 });
  await think(3); // browse the cards
  await shot(page, `${tag}-menu`);
  await tap(page, `[data-build="${def}"]`, { after: 900 });
  await think(2.5); // look for a spot
  // tap the ground where we want it
  if (spot) {
    const p = await w2s(page, spot.x, spot.z, 0);
    if (p.visible) await tapXY(page, p.x, p.y, 700);
    else console.log('  spot off-screen', spot, p);
  }
  const b = await page.evaluate(() => ({ valid: window.game.view.build.valid, reason: window.game.view.build.reason, x: window.game.view.build.x, z: window.game.view.build.z }));
  console.log('  ghost', JSON.stringify(b), 'guide.ui', (await guide(page))?.ui);
  await shot(page, `${tag}-ghost`);
  await think(1.5);
  await tap(page, '#btn-build-confirm', { after: 900 });
  await shot(page, `${tag}-placed`);
  // leave build mode
  if (await page.evaluate(() => window.game.view.mode === 'build')) { await tap(page, '#btn-build-cancel', { after: 600 }); }
  return b;
}

async function gatherNearest(nodeDef, resId, need) {
  for (let i = 0; i < 20; i++) {
    const have = await page.evaluate((r) => window.game.state.resources.amounts[r] || 0, resId);
    if (have >= need) return true;
    const n = await page.evaluate((def) => { const g = window.game; const p = g.state.player; const n = g.sys.world.findNodeByDef(def, p.x, p.z); return n ? { x: n.x, z: n.z, i: n.i } : null; }, nodeDef);
    if (!n) return false;
    await walkTo(page, n.x, n.z, { tol: 2.8 });
    for (let k = 0; k < 40; k++) { const dep = await page.evaluate((i) => window.game.sys.world.isDepleted(i), n.i); const have2 = await page.evaluate((r) => window.game.state.resources.amounts[r] || 0, resId); if (dep || have2 >= need) break; await sleep(250); }
  }
  return false;
}

/** Like a player reading the red cost chips: gather whatever the next build is missing. */
async function ensureAfford(def) {
  for (let i = 0; i < 6; i++) {
    const miss = await page.evaluate((d) => { const g = window.game; return g.sys.economy.missing(g.sys.buildings.cost(d)); }, def);
    const keys = Object.keys(miss);
    if (!keys.length) return true;
    console.log('  need', JSON.stringify(miss));
    const r = keys[0];
    const node = r === 'stone' ? 'rock' : r === 'fiber' ? 'fiber_grass' : 'tree_round';
    const have = await page.evaluate((r) => window.game.state.resources.amounts[r] || 0, r);
    await gatherNearest(node, r, have + miss[r]);
  }
  return false;
}

const stages = {};
stages.wood = async () => {
  await shot(page, 'start');
  await think(6); // look around, read the hint
  for (let i = 0; i < 10; i++) {
    const g = await guide(page); if (!g?.world || (await mission(page))?.id !== 'm01_wood') break;
    await walkTo(page, g.world.x, g.world.z, { tol: 2.6 });
    for (let k = 0; k < 50; k++) { const g2 = await guide(page); if (!g2?.world || g2.world.x !== g.world.x) break; if (k === 4 && i === 1) await shot(page, 'chopping'); await sleep(200); }
  }
  await waitMission('m01_wood', 30);
  await mark('wood done');
};
stages.shelter = async () => {
  await think(2);
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  const spot = await findSpot('shelter', core.x, core.z, 4);
  await placeViaUI('shelter', spot, 'shelter');
  await sleep(1500);
  await shot(page, 'shelter-building');
  await waitMission('m02_shelter', 60);
  await mark('shelter done');
  await shot(page, 'shelter-done');
};
stages.campfire = async () => {
  await think(2);
  await ensureAfford('campfire');
  await mark('stone ok');
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  await walkTo(page, core.x + 3, core.z + 5, { tol: 2 });
  const spot = await findSpot('campfire', core.x, core.z, 4);
  await placeViaUI('campfire', spot, 'campfire');
  await waitMission('m03_campfire', 60);
  await mark('campfire done');
};
stages.storage = async () => {
  await think(2);
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  const spot = await findSpot('storage_crate', core.x, core.z, 3);
  await placeViaUI('storage_crate', spot, 'storage');
  await waitMission('m04_storage', 60);
  await mark('storage done');
  await sleep(1500);
  await shot(page, 'survivor-signal');
};
stages.rescue = async () => {
  await think(3);
  const g = await guide(page);
  console.log('  rescue guide', JSON.stringify(g));
  if (g?.world) {
    await walkTo(page, g.world.x, g.world.z, { tol: 2.5, maxMs: 90000 });
    await sleep(800);
    await shot(page, 'rescue-near');
    console.log('  interact label:', await page.evaluate(() => document.querySelector('#btn-interact')?.innerText));
    await tap(page, '#btn-interact', { after: 1500 });
    await shot(page, 'rescue-tapped');
  }
  await waitMission('m05_rescue', 30);
  await mark('rescue done');
  await sleep(1500);
  await shot(page, 'rescue-celebrate');
  await think(2); // read the celebration
  console.log('  closed modals:', await closeModals(page));
};
stages.logging = async () => {
  await think(2);
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  await walkTo(page, core.x, core.z + 4, { tol: 2, maxMs: 60000 });
  await ensureAfford('logging_camp');
  await walkTo(page, core.x, core.z + 4, { tol: 2, maxMs: 60000 });
  const spot = await findSpot('logging_camp', core.x, core.z, 4, 'trees');
  await placeViaUI('logging_camp', spot, 'logging');
  await waitMission('m06_logging', 60);
  await mark('logging camp done');
  await waitMission('m07_assign', 120);
  await mark('colonist assigned');
  await sleep(3000);
  await shot(page, 'colonist-working');
};
stages.turret = async () => {
  await think(2);
  await ensureAfford('scrap_turret');
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  await walkTo(page, core.x, core.z + 4, { tol: 2, maxMs: 60000 });
  const spot = await findSpot('scrap_turret', core.x, core.z, 5);
  await placeViaUI('scrap_turret', spot, 'turret');
  await waitMission('m08_turret', 60);
  await mark('turret done');
  await sleep(2000);
  await shot(page, 'warning-banner');
};
stages.defend = async () => {
  const tur = await page.evaluate(() => { const b = window.game.state.buildings.list.find((b) => b.def === 'scrap_turret'); return b ? window.game.sys.buildings.center(b) : null; });
  if (tur) await walkTo(page, tur.x + 1.5, tur.z + 1.5, { tol: 1.5 });
  let shotAttack = 0;
  const t0 = await gameTime(page);
  while ((await gameTime(page)) - t0 < 400) {
    const c = await page.evaluate(() => ({ phase: window.game.state.combat.phase, aliens: window.game.state.combat.aliens.length, m: window.game.sys.missions.current()?.id }));
    if (c.phase === 'warning' && shotAttack === 0) { await shot(page, 'warning'); shotAttack = 1; console.log('  banner:', await hud()); }
    if (c.phase === 'attack' && c.aliens > 0 && shotAttack < 3) { await sleep(1500); await shot(page, 'attack-' + shotAttack); shotAttack++; }
    if (await page.locator('[data-panel="victory"]').count()) break;
    if (c.m !== 'm09_defend') break;
    await sleep(500);
  }
  await mark('attack over');
  await sleep(1000);
  await shot(page, 'victory');
  const vb = await page.evaluate(() => document.querySelector('[data-panel="victory"]')?.innerText);
  console.log('  victory panel:', vb?.replace(/\s+/g, ' '));
};
stages.victory = async () => {
  await think(3);
  const btns = await page.evaluate(() => [...document.querySelectorAll('[data-panel="victory"] button')].map((b) => (b.id || '') + ':' + b.innerText.replace(/\s+/g, ' ')));
  console.log('  victory buttons', btns);
  const claim = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-panel="victory"] button')].find((b) => /claim|collect|open/i.test(b.innerText) && !/video|ad/i.test(b.innerText)); if (b) { b.setAttribute('data-qa', 'claim'); return true; } return false; });
  if (claim) await tap(page, '[data-qa="claim"]', { after: 1500 });
  await shot(page, 'victory-claimed');
  await waitMission('m09_defend', 30);
  await mark('defend claimed');
  // close any celebrate modal
  await sleep(1000); await shot(page, 'after-victory');
};
stages.research = async () => {
  await think(2);
  console.log('  closed modals:', await closeModals(page));
  console.log('  guide', JSON.stringify(await guide(page)));
  await tap(page, '#btn-research', { after: 1200 });
  await shot(page, 'research-panel');
  await tap(page, '[data-research="tier_reinforced"]', { after: 1000 });
  await shot(page, 'research-node');
  const b = await page.evaluate(() => { const panel = document.querySelector('[data-panel="research"]'); const btn = [...panel.querySelectorAll('button')].find((b) => /research|unlock/i.test(b.innerText) && !b.closest('[data-research]')); if (btn) { btn.setAttribute('data-qa', 'rbtn'); return btn.innerText; } return null; });
  console.log('  research button:', b);
  if (b) await tap(page, '[data-qa="rbtn"]', { after: 1500 });
  await shot(page, 'research-done');
  await waitMission('m10_research', 120);
  await mark('research done');
};
stages.tier = async () => {
  await think(2);
  console.log('  closed modals:', await closeModals(page));
  for (let i = 0; i < 3; i++) { const open = await openPanels(page); if (!open.length) break; console.log('  open:', open); await page.keyboard.press('Escape'); await sleep(600); }
  const core = await page.evaluate(() => window.game.sys.buildings.colonyCenter());
  await walkTo(page, core.x + 2, core.z + 4, { tol: 2 });
  await sleep(800);
  const p = await w2s(page, core.x, core.z, 1.5);
  await tapXY(page, p.x, p.y, 1200);
  await shot(page, 'colony-panel');
  console.log('  panels:', await openPanels(page));
  const b = await page.evaluate(() => { const btn = [...document.querySelectorAll('.pm-frame button')].find((b) => /upgrade/i.test(b.innerText)); if (btn) { btn.setAttribute('data-qa', 'ubtn'); return btn.innerText + ' disabled=' + btn.getAttribute('aria-disabled'); } return null; });
  console.log('  upgrade btn:', b);
  if (b) await tap(page, '[data-qa="ubtn"]', { after: 1200 });
  await shot(page, 'tierup-1');
  await sleep(2500);
  await shot(page, 'tierup-2');
  await waitMission('m11_tier1', 60);
  await mark('tier up');
};

const READ = { wood: 3, shelter: 3, campfire: 3, storage: 3, rescue: 3, logging: 6, turret: 3, defend: 0, victory: 4, research: 3, tier: 4 };
const order = ['wood', 'shelter', 'campfire', 'storage', 'rescue', 'logging', 'turret', 'defend', 'victory', 'research', 'tier'];
let started = !from;
for (const s of order) {
  if (!started) { if (s === from) { started = true; } continue; }
  console.log('--- stage', s, 'mission', JSON.stringify(await mission(page)));
  try { await stages[s](); await think(READ[s] ?? 2); } catch (e) { console.log('  !! stage failed', s, e.message); await shot(page, 'fail-' + s); break; }
  await snapshot(page, context, `${SP}/snap-${s}.json`);
  if (s === until) break;
}
console.log('TIMELINE', JSON.stringify(timeline));
fs.appendFileSync(`${SP}/timeline.log`, `${new Date().toISOString()} ${vp} from=${from} ${JSON.stringify(timeline)}\n`);
const errs = logs.filter((l) => /error|pageerror/i.test(l));
console.log('errors:', errs.slice(0, 20).join('\n'));
await browser.close();
