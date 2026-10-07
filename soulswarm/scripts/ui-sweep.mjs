// UI sweep: menus, economy and save robustness. Boots the game headless on phone viewports and
//   layout   visits every tab, modal and run screen for three profiles (fresh, mid-game, late-game) on five viewports,
//            audits each one (horizontal overflow, clipped or spilling text, overlapping, covered, tiny or zero-size
//            buttons, dialog actions below the fold, toasts off screen, broken images, console and page errors) and
//            screenshots it (warnings: 30–35 px targets; errors: everything else);
//   fuzz     taps random buttons (single, double and rapid taps, closing modals mid-animation), double-taps every
//            claim / buy / ad button and loops the run flow (battle, pause, abandon, double rewards, continue),
//            checking currencies and the modal stack after every tap;
//   economy  fuzzes applyRunResult and every grant / spend path, simulates the Soul Altar against the odds the
//            odds sheet shows, and checks the once-only rules (pass, quests, weekly chest, trial, first clears, energy);
//   save     boots from corrupted, partial, old-format, wrong-typed and out-of-range saves;
//   life     visibilitychange on the home screen and mid-run, rapid start/exit and reloading mid-run.
//
// usage: node scripts/ui-sweep.mjs [url] [--only=layout,fuzz,economy,save,life] [--out=dir] [--vp=375x667,390x844]
//                                  [--states=fresh,mid,late] [--screens=home,quests] [--clicks=600] [--jobs=2] [--no-shots]
//   url        a running dev server (default: starts `vite --port 5197`)
//   --out      screenshots and report.json (default: $TMPDIR/soulswarm-ui-sweep)
// Google Fonts are cached once in $TMPDIR/soulswarm-ui-sweep-fonts (via curl) so text is measured in the real fonts.
// Exits 1 when any check fails.
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const require = createRequire(import.meta.url);
const pw = require(execSync('npm root -g').toString().trim() + '/playwright');
const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : argv.includes(`--${k}`) ? true : d; };
let URL = argv.find((a) => !a.startsWith('--'));
const OUT = opt('out', join(tmpdir(), 'soulswarm-ui-sweep'));
const ONLY = String(opt('only', 'layout,fuzz,economy,save,life')).split(',');
const VPS = String(opt('vp', '375x667,390x844,430x932,360x780,768x1024')).split(',').map((s) => s.split('x').map(Number));
const STATES = String(opt('states', 'fresh,mid,late')).split(',');
const SCREEN_FILTER = opt('screens', '') ? String(opt('screens')).split(',') : null;
const CLICKS = +opt('clicks', 600);
const JOBS = +opt('jobs', 2);
const SHOTS = !opt('no-shots', false);
mkdirSync(OUT, { recursive: true });

let server = null;
if (!URL) {
  URL = 'http://localhost:5197/';
  server = spawn('npx', ['vite', '--port', '5197', '--strictPort'], { cwd: new globalThis.URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(URL); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + String(detail).slice(0, 600) : ''}`); };
const report = { url: URL, started: new Date().toISOString(), layout: [], fuzz: {}, economy: {}, save: {}, life: {} };

// ---------------------------------------------------------------- fonts (cached so text metrics match a device)
const FONT_DIR = join(tmpdir(), 'soulswarm-ui-sweep-fonts');
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Oxanium:wght@500;600;700;800&display=swap';
let fontsOk = existsSync(join(FONT_DIR, 'fonts.css'));
if (!fontsOk) {
  try {
    mkdirSync(FONT_DIR, { recursive: true });
    execSync(`curl -sSf -A 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' '${FONT_CSS}' -o '${join(FONT_DIR, 'fonts.css')}'`, { timeout: 20000 });
    for (const u of new Set(readFileSync(join(FONT_DIR, 'fonts.css'), 'utf8').match(/https:\/\/fonts\.gstatic\.com[^)]+/g) || [])) execSync(`curl -sSf '${u}' -o '${join(FONT_DIR, basename(u))}'`, { timeout: 20000 });
    fontsOk = true;
  } catch (e) { console.log('NOTE  Google Fonts unavailable: text is measured in fallback fonts'); }
}
async function routeFonts(ctx) {
  if (!fontsOk) return;
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: readFileSync(join(FONT_DIR, 'fonts.css'), 'utf8') }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => { const f = join(FONT_DIR, basename(new globalThis.URL(r.request().url()).pathname)); return existsSync(f) ? r.fulfill({ status: 200, contentType: 'font/woff2', body: readFileSync(f) }) : r.abort(); });
}

// ---------------------------------------------------------------- in-page helpers (installed before the game boots)
function pageHelpers() {
  const S = window.__sweep = {};
  const app = () => window.__soulswarm;
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  S.sleep = sleep;
  S.waitFor = async (sel, max = 12000) => { const t0 = performance.now(); while (!q(sel) && performance.now() - t0 < max) await sleep(50); return q(sel); };
  const shown = (el) => el.isConnected && (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : el.getClientRects().length > 0);
  const INTER = 'button, a[href], input, select, [role=button], [role=switch], [data-act], [data-a], [data-q], [data-go], [data-nav], [data-top], [data-sub], [data-wk]';
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48);
  const path = (el) => {
    const out = [];
    for (let n = el; n && n.id !== 'ui' && n !== document.body && out.length < 4; n = n.parentElement) {
      const d = n.dataset || {}, tag = d.act || d.nav || d.top || d.a || d.sub || d.q || d.sku || d.key || d.id || d.k || d.t;
      out.unshift(n.tagName.toLowerCase() + [...n.classList].slice(0, 2).map((c) => '.' + c).join('') + (tag ? `[${tag}]` : ''));
    }
    return out.join('>');
  };
  S.path = path;
  const appRect = () => q('#app').getBoundingClientRect();
  /** el's rect clipped by every ancestor that clips (overflow or clip-path) up to #app; also the list of clippers. */
  const clipInfo = (el, self) => {
    const r = el.getBoundingClientRect(); const c = { L: r.left, R: r.right, T: r.top, B: r.bottom, by: [] };
    for (let a = self ? el : el.parentElement; a && a.id !== 'app' && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a), cp = cs.clipPath !== 'none';
      const ox = cp || cs.overflowX !== 'visible', oy = cp || cs.overflowY !== 'visible';
      if (!ox && !oy) continue;
      const ar = a.getBoundingClientRect();
      c.by.push({ a, ox, oy, sx: /auto|scroll/.test(cs.overflowX), sy: /auto|scroll/.test(cs.overflowY), ell: cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none', r: ar });
      if (ox) { c.L = Math.max(c.L, ar.left); c.R = Math.min(c.R, ar.right); }
      if (oy) { c.T = Math.max(c.T, ar.top); c.B = Math.min(c.B, ar.bottom); }
    }
    return c;
  };
  const rotated = (el) => { for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) { const m = getComputedStyle(n).transform.match(/^matrix\(([^,]+),\s*([^,]+)/); if (m && Math.abs(+m[2]) > 0.01) return true; } return false; };
  /** The tappable box: the element plus any absolutely positioned ::before / ::after that takes pointer events (not with clip-path). */
  const hitRect = (el) => {
    const r = el.getBoundingClientRect(), o = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    if (getComputedStyle(el).clipPath !== 'none') return o;
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps);
      if (c.content === 'none' || c.position !== 'absolute' || c.pointerEvents === 'none' || c.display === 'none') continue;
      const px = (v) => (v.endsWith('px') ? parseFloat(v) : null), t = px(c.top), b = px(c.bottom), l = px(c.left), rr = px(c.right);
      if ([t, b, l, rr].some((v) => v === null)) continue;
      o.left = Math.min(o.left, r.left + l); o.right = Math.max(o.right, r.right - rr); o.top = Math.min(o.top, r.top + t); o.bottom = Math.max(o.bottom, r.bottom - b);
    }
    return o;
  };
  /** The nearest ancestor that really scrolls vertically, or null. */
  const scroller = (el) => { for (let a = el.parentElement; a && a.id !== 'app'; a = a.parentElement) { const cs = getComputedStyle(a); if (/auto|scroll/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 1) return a; } return null; };
  const union = (rs) => rs.reduce((u, r) => ({ left: Math.min(u.left, r.left), right: Math.max(u.right, r.right), top: Math.min(u.top, r.top), bottom: Math.max(u.bottom, r.bottom) }), { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 });

  /** Wait until every finite CSS animation has finished (frames are slow under software WebGL), then two frames. */
  S.settle = async (max = 4000) => {
    const t0 = performance.now();
    while (performance.now() - t0 < max) {
      const busy = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity && a.effect.getComputedTiming().activeDuration < 5000
        && !(a.effect.target && a.effect.target.closest && a.effect.target.closest('.toast'))); // a toast's fade is its whole life: audit it while it shows
      if (!busy.length) break;
      await Promise.race([Promise.all(busy.map((a) => a.finished.catch(() => {}))), sleep(max)]);
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  };
  /** The topmost UI layer: the last overlay (modal, Altar reveal, ad, level-up cards), else the menus, else the HUD. */
  S.layer = () => {
    const ui = q('#ui');
    const tops = qa(':scope > .modal-back, :scope > .rv, :scope > .ad-sim, .hud .lvl-back', ui).filter((e) => e.checkVisibility());
    if (tops.length) return tops[tops.length - 1];
    const meta = q(':scope > .meta', ui);
    return meta && shown(meta) ? meta : q(':scope > .hud', ui) || ui;
  };

  /** Layout audit of the topmost layer. Returns [{kind, sev, sel, text, ...}]. */
  S.audit = async ({ minTarget = 36, hardMin = 30 } = {}) => {
    const root = S.layer(), A = appRect(), out = [];
    const add = (kind, sev, el, extra = {}) => out.push({ kind, sev, sel: typeof el === 'string' ? el : path(el), text: typeof el === 'string' ? '' : label(el), ...extra });
    const tol = 1.5, rnd = (r) => [r.left ?? r.L, r.top ?? r.T, (r.right ?? r.R) - (r.left ?? r.L), (r.bottom ?? r.B) - (r.top ?? r.T)].map(Math.round).join(',');
    const sw = document.scrollingElement.scrollWidth;
    if (sw > innerWidth + 1) add('page-hscroll', 'error', 'document', { w: sw });
    if (q('#app').scrollLeft || q('#ui').scrollLeft) add('page-hscroll', 'error', '#app', {});
    // text: every visible text node, measured with a Range
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n; (n = walker.nextNode());) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || !shown(el) || el.closest('svg')) continue;
      const range = document.createRange(); range.selectNodeContents(n);
      const rs = [...range.getClientRects()].filter((r) => r.width > 0.5);
      if (!rs.length) continue;
      const tr = union(rs);
      const c = clipInfo(el, true);
      const vis = { L: Math.max(tr.left, c.L), R: Math.min(tr.right, c.R), T: Math.max(tr.top, c.T), B: Math.min(tr.bottom, c.B) };
      if (vis.R - vis.L < 1 || vis.B - vis.T < 1) continue; // scrolled out of view
      if (rotated(el)) continue; // corner ribbons are meant to be cut by their card
      for (const k of c.by) {
        if (k.ox && !k.sx && (tr.right > k.r.right + tol || tr.left < k.r.left - tol)) { seen.add(el); add(k.ell ? 'text-ellipsis' : 'text-clipped-x', k.ell ? 'info' : 'error', el, { by: path(k.a), text: n.textContent.trim().slice(0, 40), rect: rnd(tr) }); break; }
        if (k.oy && !k.sy && (tr.bottom > k.r.bottom + tol || tr.top < k.r.top - tol) && !(k.sy || k.ell)) { seen.add(el); add('text-clipped-y', 'error', el, { by: path(k.a), text: n.textContent.trim().slice(0, 40), rect: rnd(tr) }); break; }
      }
      let box = el; while (box.parentElement && /^(inline|contents)$/.test(getComputedStyle(box).display)) box = box.parentElement;
      const br = box.getBoundingClientRect();
      if (!seen.has(el) && (tr.right > br.right + tol || tr.left < br.left - tol)) { seen.add(el); add('text-spill', 'error', el, { box: path(box), text: n.textContent.trim().slice(0, 40), over: Math.round(Math.max(tr.right - br.right, br.left - tr.left)) }); }
      if (vis.R > A.right + tol || vis.L < A.left - tol) { seen.add(el); add('offscreen-x', 'error', el, { text: n.textContent.trim().slice(0, 40), rect: rnd(vis) }); }
      if (vis.B > A.bottom + tol || vis.T < A.top - tol) { seen.add(el); add('offscreen-y', 'error', el, { text: n.textContent.trim().slice(0, 40), rect: rnd(vis) }); }
    }
    // interactive elements: size, hit-testing (covered), overlaps, off-screen, zero-size
    const all = qa(INTER, root).filter(shown);
    const inter = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    const live = [];
    for (const el of inter) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) { add('zero-size', 'error', el, { rect: rnd(r) }); continue; }
      const c = clipInfo(el, false);
      const vis = { L: Math.max(r.left, c.L), R: Math.min(r.right, c.R), T: Math.max(r.top, c.T), B: Math.min(r.bottom, c.B) };
      if (vis.R - vis.L < 1 || vis.B - vis.T < 1) continue; // scrolled away inside a scroller
      if (vis.R > A.right + tol || vis.L < A.left - tol || vis.B > A.bottom + tol || vis.T < A.top - tol) add('offscreen', 'error', el, { rect: rnd(vis) });
      const full = vis.R - vis.L >= r.width - 1 && vis.B - vis.T >= r.height - 1;
      const cs = getComputedStyle(el), inert = el.disabled || cs.pointerEvents === 'none';
      const sc = scroller(el);
      if (full) {
        const hr = hitRect(el), hw = hr.right - hr.left, hh = hr.bottom - hr.top, m = Math.min(hw, hh);
        if (m < minTarget && !el.matches('input[type=range]')) add('small-target', m < hardMin ? 'error' : 'warn', el, { size: `${Math.round(hw)}x${Math.round(hh)}` });
        if (!inert) {
          const cx = (vis.L + vis.R) / 2, cy = (vis.T + vis.B) / 2, hit = document.elementFromPoint(cx, cy);
          if (hit && hit !== el && !el.contains(hit) && !(sc && !sc.contains(hit))) add('covered', 'error', el, { by: path(hit) });
        }
      }
      if (!inert || el.disabled) live.push({ el, r: { left: vis.L, right: vis.R, top: vis.T, bottom: vis.B }, sc });
    }
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const A2 = live[i], B2 = live[j], a = A2.r, b = B2.r, w = Math.min(a.right, b.right) - Math.max(a.left, b.left), hh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (!(w > 2 && hh > 2)) continue;
      // content scrolling under fixed chrome is fine while scrolling can still move it out from under it
      const [inS, fixed] = A2.sc && A2.sc !== B2.sc ? [A2, B2] : B2.sc && B2.sc !== A2.sc ? [B2, A2] : [null, null];
      if (inS && !inS.sc.contains(fixed.el)) {
        const s2 = inS.sc, below = fixed.r.top > inS.r.top;
        if (below ? s2.scrollTop < s2.scrollHeight - s2.clientHeight - 1 : s2.scrollTop > 0) continue;
      }
      add('overlap', 'error', A2.el, { with: path(B2.el), area: `${Math.round(w)}x${Math.round(hh)}` });
    }
    // a dialog's own action row (Continue, Buy, Claim…) must be on screen without scrolling the dialog first
    for (const act of qa('.modal-actions .btn', root).filter(shown)) {
      const r = act.getBoundingClientRect(), c = clipInfo(act, false);
      if (r.bottom > Math.min(c.B, A.bottom) + tol || r.top < Math.max(c.T, A.top) - tol) add('actions-below-fold', q('.modal-results', root) ? 'error' : 'warn', act, { rect: rnd(r) });
    }
    // images: <img> and CSS background images
    for (const img of qa('img', q('#ui'))) if (shown(img) && img.complete && img.naturalWidth === 0) add('broken-img', 'error', img, { src: (img.getAttribute('src') || '').slice(0, 80) });
    const urls = new Set();
    for (const el of qa('*', root)) { if (!shown(el)) continue; const bg = getComputedStyle(el).backgroundImage; for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]); }
    S.imgOk = S.imgOk || new Map();
    await Promise.all([...urls].filter((u) => !S.imgOk.has(u)).map((u) => new Promise((res) => { const im = new Image(); const t = setTimeout(() => { S.imgOk.set(u, false); res(); }, 4000); im.onload = () => { clearTimeout(t); S.imgOk.set(u, im.naturalWidth > 0); res(); }; im.onerror = () => { clearTimeout(t); S.imgOk.set(u, false); res(); }; im.src = u; })));
    for (const u of urls) if (!S.imgOk.get(u)) add('broken-bg', 'error', 'css', { src: u.slice(0, 80) });
    for (const t of qa('#ui > .toast')) { const r = t.getBoundingClientRect(); if (r.left < A.left - tol || r.right > A.right + tol) add('toast-offscreen', 'error', t, { rect: rnd(r) }); }
    return out;
  };

  // ---------------------------------------------------------------- invariants and state
  S.cur = () => { const p = app().profile; return { gold: p.gold, gems: p.gems, sigils: p.sigils, energy: p.energy, level: p.level, xp: p.xp, passXp: p.pass.xp, pity: p.altar.pity }; };
  S.inv = () => {
    const bad = [], c = S.cur();
    for (const [k, v] of Object.entries(c)) if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) bad.push(`${k}=${v}`);
    const backs = qa('#ui > .modal-back');
    const cls = backs.map((b) => (q('.modal', b)?.className || '').replace(/\s+/g, ' ').trim());
    if (backs.length > 2) bad.push(`modals stacked: ${cls.join(' | ')}`);
    const dup = cls.filter((c2, i) => c2 && cls.indexOf(c2) !== i);
    if (dup.length) bad.push(`duplicate modal: ${dup[0]}`);
    if (qa('#ui > .rv').filter((x) => !x.classList.contains('out')).length > 1) bad.push('two Altar reveals');
    if (qa('#ui > .ad-sim').length > 1) bad.push('two ad overlays');
    if (qa('#ui > .hud').length > 1) bad.push('two HUDs');
    const a = app();
    if (a.run && a.meta.el && !a.meta.el.hidden) bad.push('menus visible during a run');
    if (!a.run && qa('#ui > .hud').length) bad.push('HUD left after the run');
    return bad;
  };
  /** Fast stand-ins for the simulated store (the real ad takes 3 s, a purchase 0.65 s). result: true | false | 'random'. */
  S.fastStore = (result = true, ms = 40) => { // ms: how long the ad takes to cover the screen and pay out (a real SDK has latency)
    const s = app().store; s.__ad = s.__ad || s.rewardedAd; s.__buy = s.__buy || s.purchase;
    s.rewardedAd = () => new Promise((r) => setTimeout(() => r(result === 'random' ? Math.random() < 0.7 : result), ms));
    s.purchase = (id) => new Promise((r) => setTimeout(() => r({ ok: true, simulated: true, transactionId: 'sweep-' + id }), 120));
  };
  S.realStore = () => { const s = app().store; if (s.__ad) s.rewardedAd = s.__ad; if (s.__buy) s.purchase = s.__buy; };

  /** Close everything and restore the profile snapshot, so every screen starts from the same home screen. */
  S.snapshot = () => { S.snap = JSON.stringify(app().profile); };
  S.reset = async () => {
    const a = app();
    for (const b of qa('#ui > .modal-back')) { const x = q('.modal-x', b); if (x) x.click(); else b.remove(); }
    qa('#ui > .rv, #ui > .ad-sim, #ui > .toast').forEach((n) => n.remove());
    if (a.run) { a.exitRun(); await sleep(450); } // BATTLE ignores taps for 400 ms after a run (a double tap on Continue)
    a.engine.manual = !!S.still; // layout sweep: the 3D backdrop holds still on menu screens (cheaper frames, same layout)
    if (S.snap) { const p = a.profile; for (const k of Object.keys(p)) delete p[k]; Object.assign(p, JSON.parse(S.snap)); }
    a.applySettings();
    q('[data-nav="heroes"]')?.click(); q('[data-sub="heroes"]')?.click();
    a.meta.show('battle'); a.meta.refresh();
    q('#ui .pane-shop .pane-scroll') && (q('#ui .pane-shop .pane-scroll').scrollTop = 0);
    await S.settle();
  };

  // ---------------------------------------------------------------- profile states
  S.profiles = async () => {
    const save = await import('/src/meta/save.js'), eco = await import('/src/meta/economy.js'), D = await import('/src/game/data.js');
    const now = Date.now(), today = save.todayKey();
    const relicSet = (p, list) => { p.relics = list.map(([type, rarity, level], i) => ({ uid: 'r' + (i + 1), type, rarity, level })); p.relicSeq = list.length + 1; };
    const fresh = save.newProfile(); fresh.flags.bloodMoon = 'off';

    const mid = save.newProfile();
    Object.assign(mid, { level: 14, xp: 160, gold: 23456, gems: 1234, sigils: 4, energy: 17, energyTs: now - 120e3, selectedHero: 'nyx' });
    Object.assign(mid.heroes, { vael: { owned: true, stars: 3, shards: 14 }, nyx: { owned: true, stars: 2, shards: 22 }, seraphine: { owned: false, stars: 0, shards: 8 }, liora: { owned: false, stars: 0, shards: 10 } });
    relicSet(mid, [['crown', 'common', 3], ['lantern', 'rare', 2], ['idol', 'rare', 1], ['heart', 'common', 4], ['boots', 'epic', 1], ['coin', 'common', 2], ['eye', 'rare', 1], ['hourglass', 'common', 1], ['crown', 'rare', 1]]);
    mid.equipped = ['r2', 'r5', 'r1'];
    mid.talents = { might: 7, vitality: 6, raise: 3, cap: 4, greed: 2, swift: 1 };
    mid.chapter = { unlocked: 3, selected: 3, best: { 1: { time: 431, cleared: true, kills: 2100, depth: 1 }, 2: { time: 418, cleared: true, kills: 2340, depth: 1 }, 3: { time: 251, cleared: false, kills: 960, depth: 1 } } };
    mid.diff = { sel: { 1: 'nightmare' }, best: { 1: { normal: { time: 431, legion: 160, kills: 2100, streak: 90, cleared: true }, nightmare: { time: 305, legion: 120, kills: 1500, streak: 70, cleared: false } }, 2: { normal: { time: 418, legion: 180, kills: 2340, streak: 95, cleared: true } } } };
    mid.pass.xp = 4250; mid.pass.claimedFree = [1, 2, 3, 4, 5];
    mid.login = { streak: 3, lastClaim: null };
    mid.altar = { pity: 23, pulls: 41, freeDate: null };
    mid.trial = { day: today, done: false, ads: 0, clears: 2 };
    mid.stats = { runs: 23, kills: 31234, bestLegion: 214, raised: 8800, clears: 6, bestStreak: 140 };
    mid.flags = { tutorialDone: true, hints: { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }, bloodMoon: 'on', riteHint: true };
    mid.quests.ids = eco.pickQuests(mid, today);
    mid.quests.progress = { kills: 640, raised: 80, survive: 251, novas: 3, gates: 5, runs: 1, chests: 1, elites: 2, peak: 120 };
    eco.weeklyState(mid); mid.weekly.done = 12;

    const late = save.newProfile();
    Object.assign(late, { level: 87, xp: 3020, gold: 12345678, gems: 98765, sigils: 250, energy: 99, selectedHero: 'vael', equippedSkin: 'eclipse_vael', skins: { eclipse_vael: true }, name: 'Shepherd' });
    for (const id of D.HERO_ORDER) late.heroes[id] = { owned: true, stars: 5, shards: 137 };
    late.heroes.liora = { owned: true, stars: 4, shards: 80 };
    const all = []; for (const t of D.RELIC_TYPES) for (const r of D.RARITIES) all.push([t, r, 1 + ((all.length * 7) % 10)]);
    relicSet(late, all); late.equipped = ['r4', 'r8', 'r12'];
    late.talents = Object.fromEntries(Object.entries(D.TALENTS).map(([k, t]) => [k, t.max]));
    late.chapter = { unlocked: 6, selected: 5, best: {} };
    late.diff = { sel: { 5: 'torment', 1: 'torment', 2: 'nightmare' }, best: {} };
    for (let c = 1; c <= 5; c++) {
      late.chapter.best[c] = { time: 400 + c, cleared: true, kills: 2500 + c * 100, depth: 1 };
      late.diff.best[c] = Object.fromEntries(D.DIFFICULTY_ORDER.map((d, i) => [d, { time: 390 + c + i, legion: 380 + i, kills: 2600 + c * 100, streak: 400 + i * 10, cleared: true }]));
    }
    late.chapter.best[6] = { time: 1834, cleared: false, kills: 12000, depth: 7 };
    late.pass = { season: 1, xp: 15000, premium: true, claimedFree: Array.from({ length: 25 }, (_, i) => i + 1), claimedPrem: Array.from({ length: 20 }, (_, i) => i + 1) };
    late.purchases = { ...late.purchases, starterBought: true, pactUntil: now + 12 * 864e5, pactLastClaim: null, first: Object.fromEntries(D.GEM_SKUS.slice(0, 4).map((s) => [s, true])), history: [] };
    late.altar = { pity: 59, pulls: 1234, freeDate: null };
    late.trial = { day: today, done: true, ads: 0, clears: 47 };
    late.login = { streak: 13, lastClaim: null };
    late.stats = { runs: 1234, kills: 2345678, bestLegion: 400, raised: 999999, clears: 640, bestStreak: 1888 };
    late.flags = { tutorialDone: true, hints: { move: 1, raise: 1, gates: 1, nova: 1, rite: 1 }, bloodMoon: 'on', riteHint: true };
    late.quests.ids = eco.pickQuests(late, today);
    late.quests.progress = { kills: 9999, raised: 999, survive: 600, novas: 30, gates: 30, runs: 9, chests: 20, elites: 30, peak: 400, evolve: 3, bosses: 4, trial: 1, hardClears: 2, hardElites: 20 };
    eco.weeklyState(late); late.weekly.done = 25;
    for (const x of [fresh, mid, late]) x.settings.quality = 'low'; // cheaper frames under software WebGL; the menus look the same
    return { fresh, mid, late };
  };

  // ---------------------------------------------------------------- screens
  const click = (s, r = document) => { const e = typeof s === 'string' ? q(s, r) : s; if (!e) throw new Error('missing ' + s); e.click(); return e; };
  const nav = (t) => click(`[data-nav="${t}"]`);
  const p = () => app().profile;
  const run = async (ch = 1, opts = {}, ms = 1200) => {
    const a = app(); p().energy = Math.max(p().energy, 30); a.engine.manual = false;
    if (!a.startRun(ch, opts)) throw new Error('run did not start');
    const r = a.run; r.player.hurt = () => {}; r.ui.hint = () => {};
    await sleep(ms); return r;
  };
  const results = async (r, victory) => { r.end(victory); await S.waitFor('.modal-results'); };
  const scrollPane = (sel, to) => { const s = q(sel); s.scrollTop = to === 'end' ? s.scrollHeight : to; };
  S.SCREENS = {
    'home': {},
    'home-locked-chapter': { states: ['fresh', 'mid'], go: () => { p().chapter.selected = p().chapter.unlocked + 1; app().meta.refresh(); } },
    'home-endless': { states: ['late'], go: () => { p().chapter.selected = 6; app().meta.refresh(); } },
    'home-ch1': { states: ['mid', 'late'], go: () => { p().chapter.selected = 1; app().meta.refresh(); } },
    'home-locked-difficulty-toast': { states: ['fresh', 'mid'], wait: 300, go: () => { p().chapter.selected = 1; app().meta.refresh(); click('.dsel-b[data-d="torment"]'); } },
    'profile': { go: () => click('[data-top="player"]') },
    'energy': { go: () => click('[data-top="energy"]') },
    'energy-low': { go: () => { p().energy = 3; p().energyTs = Date.now() - 100e3; app().meta.refresh(); click('[data-top="energy"]'); } },
    'quests': { go: () => click('[data-act="quests"]') },
    'quests-claim-all': { states: ['mid', 'late'], go: async () => { click('[data-act="quests"]'); await sleep(100); (q('[data-q="*"]') || q('[data-q]:not([data-q="*"])'))?.click(); } },
    'weekly-chest': { states: ['late'], go: async () => { click('[data-act="quests"]'); await sleep(100); click('[data-wk]'); } },
    'login': { go: () => click('[data-act="login"]') },
    'login-claim': { go: async () => { click('[data-act="login"]'); await sleep(100); click('.mm-login [data-act="claim"]'); } },
    'settings': { go: () => click('[data-act="settings"]') },
    'settings-reset': { go: async () => { click('[data-act="settings"]'); await sleep(50); click('.st [data-act="reset"]'); scrollPane('.mm-settings', 'end'); } },
    'trial': { states: ['mid', 'late'], go: () => click('[data-act="trial"]') },
    'starter': { states: ['fresh', 'mid'], go: () => click('.hm [data-act="starter"]') },
    'pact': { states: ['fresh', 'mid'], go: () => click('.hm [data-act="pact"]') },
    'pact-claim': { states: ['late'], go: () => click('.hm [data-act="pactClaim"]') },
    'free-chest-ad': { states: ['fresh', 'mid'], go: () => { S.realStore(); click('.hm [data-act="chest"]'); }, after: () => { q('.ad-sim-x')?.click(); S.fastStore(); } },
    'free-chest': { go: async () => { S.fastStore(true); click('.hm [data-act="chest"]'); await sleep(200); } },
    'heroes': { go: () => nav('heroes') },
    ...Object.fromEntries(['vael', 'nyx', 'seraphine', 'liora', 'mordrake'].map((id) => [`hero-${id}`, { go: () => { nav('heroes'); click(`.hcard[data-id="${id}"]`); } }])),
    'relics': { go: () => { nav('heroes'); click('[data-sub="relics"]'); } },
    'relics-bottom': { states: ['late'], go: () => { nav('heroes'); click('[data-sub="relics"]'); scrollPane('.pane-heroes .sub-scroll', 'end'); } },
    'relic-detail': { go: () => { nav('heroes'); click('[data-sub="relics"]'); click(q('.relic-grid .relic:not(.is-eq)') || q('.relic-grid .relic')); } },
    'talents': { go: () => { nav('heroes'); click('[data-sub="talents"]'); } },
    'altar': { go: () => nav('altar') },
    'altar-odds': { go: () => { nav('altar'); click('[data-act="odds"]'); } },
    'altar-x1': { wait: 3600, go: () => { nav('altar'); click('[data-act="s1"]'); } },
    'altar-x10': { wait: 900, go: async () => { nav('altar'); click('[data-act="s10"]'); await sleep(1700); q('.rv [data-a="skip"]')?.click(); } },
    'altar-free': { wait: 3600, go: () => { S.fastStore(true); nav('altar'); click('[data-act="free"]'); } },
    'shop': { go: () => nav('shop') },
    'shop-daily': { wait: 900, go: () => click('[data-top="gold"]') },
    'shop-gems': { wait: 900, go: () => click('[data-top="gems"]') },
    'shop-bottom': { go: () => { nav('shop'); scrollPane('.pane-shop .pane-scroll', 'end'); } },
    ...Object.fromEntries(['gems_80', 'gems_500', 'gems_1200', 'gems_2600', 'gems_7000', 'gems_15000', 'starter_pack', 'soul_pact'].map((id) => [`buy-${id}`, {
      states: id === 'starter_pack' ? ['fresh', 'mid'] : id === 'soul_pact' ? ['fresh', 'mid'] : undefined,
      go: () => { nav('shop'); click(`.shop [data-sku="${id}"]`); },
    }])),
    'buy-soul_pass': { states: ['fresh', 'mid'], go: () => { nav('pass'); click('[data-act="premium"]'); } },
    'buy-done': { wait: 600, go: async () => { S.fastStore(true); nav('shop'); click('.shop [data-sku="gems_15000"]'); await sleep(60); click('.modal-purchase .btn-primary'); } },
    ...Object.fromEntries(['sigil_1', 'sigil_10', 'gold_s', 'gold_l', 'energy'].map((k) => [`gemshop-${k}`, { go: () => { nav('shop'); click(`.deal[data-key="${k}"]`); } }])),
    'pass': { go: () => nav('pass') },
    'pass-claim-all': { states: ['mid', 'late'], go: async () => { nav('pass'); await sleep(50); click('[data-act="all"]'); } },
    'pass-bottom': { go: () => { nav('pass'); scrollPane('.pane-pass .pane-scroll', 'end'); } },
    // in-run
    'run-hud': { go: () => run(1, { difficulty: 'normal' }) },
    'run-hud-hard': { states: ['late'], go: () => run(5, { difficulty: 'torment' }) },
    'run-hud-lefty': { states: ['mid'], go: () => { p().settings.lefty = true; app().applySettings(); return run(2); } },
    'run-pause': { go: async () => { const r = await run(); r.pause(true); } },
    'run-levelup': { go: async () => { const r = await run(); r.levelQueue = 1; r.showLevelUp(); } },
    'run-chest': { go: async () => { const r = await run(); r.chestQueue = 1; r.showLevelUp(); } },
    'run-shrine': { go: async () => { const r = await run(); r.events.start('shrine', { x: r.player.x, z: r.player.z }); r.events.offer(r.events.cur); } },
    'run-revive': { go: async () => { const r = await run(); delete r.player.hurt; r.player.invuln = 0; r.player.hurt(1e9); await S.waitFor('.rev'); } },
    'run-revive-spent': { go: async () => { const r = await run(); r.revivesUsed = 1; delete r.player.hurt; r.player.invuln = 0; r.player.hurt(1e9); await S.waitFor('.rev'); } },
    'results-victory': { go: async () => { const r = await run(); r.time = 431; await results(r, true); } },
    'results-defeat': { go: async () => { const r = await run(); r.time = 251; await results(r, false); } },
    'results-doubled': { go: async () => { S.fastStore(true); const r = await run(); r.time = 431; await results(r, true); click('.modal-results .btn-ad'); await sleep(250); } },
    'results-hard-first': { states: ['mid'], go: async () => { const r = await run(1, { difficulty: 'nightmare' }); r.time = 433; await results(r, true); } },
    'results-torment-bm': { states: ['late'], go: async () => { const r = await run(5, { difficulty: 'torment' }); r.time = 455; r.counters.bestStreak = 2000; await results(r, true); } },
    'results-endless': { states: ['late'], go: async () => { const r = await run(6); r.time = 1234; r.bossKills = 3; await results(r, false); } },
    'results-trial': { states: ['mid', 'late'], go: async () => { p().trial.done = false; const r = await run(0, { trial: true }); r.time = 432; await results(r, true); } },
  };
  S.go = async (name) => { const s = S.SCREENS[name]; if (s.go) await s.go(); };
  S.after = async (name) => { const s = S.SCREENS[name]; if (s.after) await s.after(); };

  // ---------------------------------------------------------------- fuzzing: tappable targets in the topmost layer
  S.targets = () => {
    const root = S.layer(), all = qa(INTER, root).filter(shown), out = [];
    for (const el of all) {
      if (all.some((o) => o !== el && o.contains(el)) || el.matches('[data-act="wipe"]')) continue; // never Erase the profile
      const r = el.getBoundingClientRect(), c = clipInfo(el, false);
      const L = Math.max(r.left, c.L, 0), R = Math.min(r.right, c.R, innerWidth), T = Math.max(r.top, c.T, 0), B = Math.min(r.bottom, c.B, innerHeight);
      if (R - L < 4 || B - T < 4) continue;
      const x = (L + R) / 2, y = (T + B) / 2, hit = document.elementFromPoint(x, y);
      if (hit && (el === hit || el.contains(hit))) out.push({ x, y, sel: path(el), text: label(el) });
    }
    if (root.classList.contains('modal-back') || root.classList.contains('rv')) out.push({ x: 5, y: innerHeight - 5, sel: 'backdrop', text: '' });
    if (root.classList.contains('hud')) out.push({ x: innerWidth / 2, y: innerHeight * 0.62, sel: 'battlefield', text: '' });
    return out;
  };
  S.center = (sel) => { const e = q(sel); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  // ---------------------------------------------------------------- double-tap scenarios: setup returns the button to tap twice
  const eco = () => import('/src/meta/economy.js');
  const D = () => import('/src/game/data.js');
  const commitRefresh = () => app().meta.refresh();
  const run2 = async (opts = {}) => { p().energy = 30; app().startRun(opts.ch || 1, opts); const r = app().run; r.player.hurt = () => {}; r.ui.hint = () => {}; await sleep(400); return r; };
  const endTo = async (r, victory) => { r.time = 300; r.counters.kills = 600; const g = p().gold; r.end(victory); await S.waitFor('.modal-results'); return p().gold - g; };
  let B = null; // state captured at setup
  S.SCN = {
    'quest claim': { setup: async () => { const E = await eco(); p().quests.progress = {}; const q0 = E.questList(p())[0]; p().quests.progress[q0.key] = q0.goal; commitRefresh(); click('[data-act="quests"]'); B = { id: q0.id, g: p().gems, want: q0.rewards.gems || 0 }; return `[data-q="${q0.id}"]`; },
      verify: () => ({ ok: p().quests.claimed.filter((x) => x === B.id).length === 1 && p().gems - B.g === B.want, detail: `claimed ${p().quests.claimed} gems +${p().gems - B.g} (want +${B.want})` }) },
    'quest claim all': { setup: async () => { const E = await eco(); p().quests.progress = {}; const [a, b] = E.questList(p()); p().quests.progress[a.key] = a.goal; p().quests.progress[b.key] = b.goal; commitRefresh(); click('[data-act="quests"]'); B = { g: p().gems, o: p().gold, want: [(a.rewards.gems || 0) + (b.rewards.gems || 0), (a.rewards.gold || 0) + (b.rewards.gold || 0)] }; return '[data-q="*"]'; },
      verify: () => ({ ok: p().quests.claimed.length === 2 && p().gems - B.g === B.want[0] && p().gold - B.o === B.want[1], detail: `claimed ${p().quests.claimed.length}, gems +${p().gems - B.g}, gold +${p().gold - B.o}` }) },
    'login claim': { setup: () => { p().login = { streak: 0, lastClaim: null }; commitRefresh(); click('[data-act="login"]'); B = { o: p().gold }; return '.mm-login [data-act="claim"]'; },
      verify: () => ({ ok: p().login.streak === 1 && p().gold - B.o === 2000, detail: `streak ${p().login.streak}, gold +${p().gold - B.o}` }) },
    'weekly chest': { setup: async () => { const E = await eco(); E.weeklyState(p()); Object.assign(p().weekly, { done: 25, claimed: false }); commitRefresh(); click('[data-act="quests"]'); B = { s: p().sigils }; return '[data-wk]'; },
      verify: () => ({ ok: p().weekly.claimed && p().sigils - B.s === 1, detail: `sigils +${p().sigils - B.s}` }) },
    'pass tier claim': { setup: () => { Object.assign(p().pass, { xp: 1000, claimedFree: [], claimedPrem: [] }); commitRefresh(); nav('pass'); B = { o: p().gold }; return '.ps-tile[data-t="1"][data-p="0"]'; },
      verify: () => ({ ok: p().pass.claimedFree.join() === '1' && p().gold - B.o === 460, detail: `claimed [${p().pass.claimedFree}] gold +${p().gold - B.o}` }) },
    'pass claim all': { setup: () => { Object.assign(p().pass, { xp: 1000, claimedFree: [], claimedPrem: [] }); commitRefresh(); nav('pass'); B = { o: p().gold }; return '[data-act="all"]'; },
      verify: () => ({ ok: p().pass.claimedFree.join() === '1,2' && p().gold - B.o === 460 + 520, detail: `claimed [${p().pass.claimedFree}] gold +${p().gold - B.o}` }) },
    'Soul Pact tribute (home)': { setup: () => { Object.assign(p().purchases, { pactUntil: Date.now() + 5 * 864e5, pactLastClaim: null }); commitRefresh(); B = { g: p().gems }; return '.hm [data-act="pactClaim"]'; },
      verify: () => ({ ok: p().gems - B.g === 100, detail: `gems +${p().gems - B.g}` }) },
    'Soul Pact tribute (shop)': { setup: () => { Object.assign(p().purchases, { pactUntil: Date.now() + 5 * 864e5, pactLastClaim: null }); commitRefresh(); nav('shop'); B = { g: p().gems }; return '.shop [data-act="pactClaim"]'; },
      verify: () => ({ ok: p().gems - B.g === 100, detail: `gems +${p().gems - B.g}` }) },
    'free chest (home)': { wait: 700, setup: () => { S.fastStore(true, 300); p().freeChestDate = null; commitRefresh(); B = { g: p().gems }; return '.hm [data-act="chest"]'; },
      verify: () => ({ ok: p().gems - B.g === 10, detail: `gems +${p().gems - B.g}` }) },
    'free chest (shop)': { wait: 700, setup: () => { S.fastStore(true, 300); p().freeChestDate = null; commitRefresh(); nav('shop'); B = { g: p().gems }; return '.shop [data-act="chest"]'; },
      verify: () => ({ ok: p().gems - B.g === 10, detail: `gems +${p().gems - B.g}` }) },
    'free summon': { wait: 700, setup: () => { S.fastStore(true, 300); p().altar.freeDate = null; commitRefresh(); nav('altar'); B = { n: p().altar.pulls }; return '[data-act="free"]'; },
      verify: () => ({ ok: p().altar.pulls - B.n === 1 && qa('#ui > .rv').length === 1, detail: `pulls +${p().altar.pulls - B.n}, reveals ${qa('#ui > .rv').length}` }) },
    'summon ×1 with the last 150 gems': { setup: () => { Object.assign(p(), { sigils: 0, gems: 150 }); commitRefresh(); nav('altar'); B = { n: p().altar.pulls }; return '[data-act="s1"]'; },
      verify: () => ({ ok: p().gems === 0 && p().altar.pulls - B.n === 1 && qa('#ui > .rv').length === 1, detail: `gems ${p().gems}, pulls +${p().altar.pulls - B.n}, reveals ${qa('#ui > .rv').length}` }) },
    'summon ×10 with the last 1,350 gems': { setup: () => { Object.assign(p(), { sigils: 0, gems: 1350 }); commitRefresh(); nav('altar'); B = { n: p().altar.pulls }; return '[data-act="s10"]'; },
      verify: () => ({ ok: p().gems === 0 && p().altar.pulls - B.n === 10 && qa('#ui > .rv').length === 1, detail: `gems ${p().gems}, pulls +${p().altar.pulls - B.n}, reveals ${qa('#ui > .rv').length}` }) },
    'energy refill': { setup: () => { Object.assign(p(), { energy: 0, gems: 500 }); commitRefresh(); click('[data-top="energy"]'); return '.mm-energy [data-act="refill"]'; },
      verify: () => ({ ok: p().gems === 450 && p().energy === 30, detail: `gems ${p().gems}, energy ${p().energy}` }) },
    'energy ad': { wait: 700, setup: () => { S.fastStore(true, 300); p().energy = 0; delete p().flags.energyAds; commitRefresh(); click('[data-top="energy"]'); return '.mm-energy [data-act="ad"]'; },
      verify: () => ({ ok: p().energy === 10, detail: `energy ${p().energy}` }) },
    'gem shop buy (confirm)': { setup: async () => { p().gems = 500; commitRefresh(); nav('shop'); click('.deal[data-key="gold_s"]'); await S.settle(); B = { o: p().gold }; return '.modal .btn-gem'; },
      verify: () => ({ ok: p().gems === 440 && p().gold - B.o === 5000, detail: `gems ${p().gems}, gold +${p().gold - B.o}` }) },
    'store purchase (Buy)': { wait: 900, setup: async () => { S.fastStore(true); p().purchases.first = {}; commitRefresh(); nav('shop'); click('.shop [data-sku="gems_80"]'); await S.settle(); B = { g: p().gems, h: p().purchases.history.length }; return '.modal-purchase .btn-primary'; },
      verify: () => ({ ok: p().gems - B.g === 160 && p().purchases.history.length - B.h === 1, detail: `gems +${p().gems - B.g}, purchases +${p().purchases.history.length - B.h}` }) },
    'double rewards (ad)': { wait: 900, setup: async () => { S.fastStore(true, 300); const r = await run2(); B = { base: await endTo(r, false), o: p().gold }; return '.modal-results .btn-ad'; },
      verify: () => ({ ok: p().gold - B.o === B.base && B.base > 0, detail: `run gold ${B.base}, doubled +${p().gold - B.o}` }) },
    'double rewards (Soul Pact, no ad)': { wait: 900, setup: async () => { p().purchases.pactUntil = Date.now() + 5 * 864e5; const r = await run2(); B = { base: await endTo(r, false), o: p().gold }; return '.modal-results .btn-ad'; },
      verify: () => ({ ok: p().gold - B.o === B.base && B.base > 0, detail: `run gold ${B.base}, doubled +${p().gold - B.o}` }) },
    'revive with gems': { wait: 600, setup: async () => { p().gems = 500; const r = await run2(); delete r.player.hurt; r.player.invuln = 0; r.player.hurt(1e9); await S.waitFor('.rev'); B = { r }; return '.modal .btn-gem'; },
      verify: () => ({ ok: p().gems === 440 && B.r.revivesUsed === 1 && !B.r.player.dead, detail: `gems ${p().gems}, revives ${B.r.revivesUsed}, dead ${B.r.player.dead}` }) },
    'begin trial': { wait: 600, setup: () => { Object.assign(p().chapter, { unlocked: 2, best: { 1: { time: 420, cleared: true, kills: 2000 } } }); p().trial = { day: null, done: false, ads: 0, clears: 0 }; p().energy = 30; commitRefresh(); click('[data-act="trial"]'); return '.mm-trial [data-act="go"]'; },
      verify: () => ({ ok: !!app().run && app().run.trial && p().energy === 30 && qa('#ui > .hud').length === 1, detail: `run ${!!app().run}, energy ${p().energy}, HUDs ${qa('#ui > .hud').length}` }) },
    'trial ad retry': { wait: 700, setup: async () => { S.fastStore(true, 300); Object.assign(p().chapter, { unlocked: 2, best: { 1: { time: 420, cleared: true, kills: 2000 } } }); const { todayKey } = await import('/src/meta/save.js'); p().trial = { day: todayKey(), done: true, ads: 0, clears: 0 }; commitRefresh(); click('[data-act="trial"]'); return '.mm-trial [data-act="retry"]'; },
      // the retry is granted once; a second tap may land on "Begin trial", which then starts the trial the player paid for
      verify: () => ({ ok: p().trial.ads === 1 && (!p().trial.done || (!!app().run && app().run.trial)), detail: JSON.stringify(p().trial) }) },
    'BATTLE': { wait: 500, setup: () => { p().energy = 30; commitRefresh(); return '.hm [data-act="battle"]'; },
      verify: () => ({ ok: p().energy === 25 && qa('#ui > .hud').length === 1, detail: `energy ${p().energy}, HUDs ${qa('#ui > .hud').length}` }) },
    // exactly the unlock cost: with more, the second tap lands on "Rank up" (that hero's own shards, so not a double grant)
    'hero unlock': { setup: async () => { Object.assign(p().heroes.seraphine, { owned: false, stars: 0, shards: 10 }); commitRefresh(); nav('heroes'); click('.hcard[data-id="seraphine"]'); await S.settle(); return '.mm-hero [data-a="unlock"]'; },
      verify: () => ({ ok: p().heroes.seraphine.owned && p().heroes.seraphine.stars === 1 && p().heroes.seraphine.shards === 0, detail: JSON.stringify(p().heroes.seraphine) }) },
    'level-up card': { wait: 80, setup: async () => { const r = await run2(); r.levelQueue = 2; r.showLevelUp(); await sleep(500); B = { r }; return '.lvl-back .card'; },
      verify: () => ({ ok: B.r.levelQueue === 1, detail: `levelQueue ${B.r.levelQueue}` }) },
    'level-up reroll (ad)': { wait: 900, setup: async () => { S.fastStore(true, 300); const r = await run2(); r.levelQueue = 1; r.showLevelUp(); await sleep(400); B = { n: 0 }; new MutationObserver((ms) => { B.n += ms.filter((m) => m.removedNodes.length).length; }).observe(q('.lvl-back .cards'), { childList: true }); return '.lvl-actions .btn-ad'; },
      verify: () => ({ ok: B.n === 1, detail: `cards redrawn ${B.n}×` }) },
    'results Continue': { wait: 900, setup: async () => { const r = await run2(); await endTo(r, false); B = { e: p().energy }; return '.modal-results .btn-primary'; },
      verify: () => ({ ok: !app().run && p().energy === B.e && !qa('#ui > .hud').length, detail: `run ${!!app().run}, energy ${B.e}→${p().energy}` }) },
    'Altar "Again"': { wait: 400, setup: async () => { Object.assign(p(), { sigils: 0, gems: 300 }); commitRefresh(); nav('altar'); click('[data-act="s1"]'); await sleep(1700); q('.rv [data-a="skip"]').click(); await S.settle(); B = { n: p().altar.pulls }; return '.rv [data-a="again"]'; },
      verify: () => ({ ok: p().altar.pulls - B.n === 1 && p().gems === 0 && qa('#ui > .rv').length === 1, detail: `pulls +${p().altar.pulls - B.n}, gems ${p().gems}, reveals ${qa('#ui > .rv').length}` }) },
  };
  S.scnSetup = async (n) => { S.fastStore(true); return S.SCN[n].setup(); };
  S.scnVerify = (n) => S.SCN[n].verify();
}

// ---------------------------------------------------------------- browser + session helpers
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const IGNORE = /ERR_CERT|ERR_TOO_MANY|net::|Failed to load resource/;

/** A phone page. seed: a profile object written to localStorage before the first boot (null: fresh device). */
async function openPage({ vp = [390, 844], seed, raw } = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  await routeFonts(ctx);
  const value = raw !== undefined ? raw : seed ? JSON.stringify(seed) : null;
  await ctx.addInitScript((v) => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); if (v !== null) localStorage.setItem('soulswarm.save.v1', v); else localStorage.removeItem('soulswarm.save.v1'); } } catch (e) { /* storage blocked */ } }, value);
  await ctx.addInitScript(pageHelpers);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__soulswarm && window.__soulswarm.meta && !document.getElementById('boot'), null, { timeout: 30000 }).catch(() => errors.push('boot: the home screen never appeared'));
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  return { ctx, page, errors };
}
const pool = async (items, n, fn) => { const q = items.slice(); await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); })); };
let builtProfiles = null;
async function profiles() {
  if (builtProfiles) return builtProfiles;
  const { ctx, page } = await openPage({});
  builtProfiles = await page.evaluate(() => window.__sweep.profiles());
  await ctx.close();
  return builtProfiles;
}

// ---------------------------------------------------------------- 1. layout sweep
async function layoutSweep() {
  const P = await profiles();
  const combos = []; for (const st of STATES) for (const vp of VPS) combos.push({ st, vp });
  const all = [];
  let screensDone = 0;
  await pool(combos, JOBS, async ({ st, vp }) => {
    const { ctx, page, errors } = await openPage({ vp, seed: P[st] });
    await page.evaluate(() => { window.__sweep.fastStore(true); window.__sweep.snapshot(); window.__sweep.still = true; });
    const names = await page.evaluate(([st2, filt]) => Object.entries(window.__sweep.SCREENS).filter(([n, s]) => (!s.states || s.states.includes(st2)) && (!filt || filt.includes(n))).map(([n, s]) => [n, s.wait || 60]), [st, SCREEN_FILTER]);
    const dir = join(OUT, 'shots', st, `${vp[0]}x${vp[1]}`); mkdirSync(dir, { recursive: true });
    for (const [name, wait] of names) {
      const e0 = errors.length;
      let issues = [];
      try {
        await page.evaluate(() => window.__sweep.reset());
        await page.evaluate((n) => window.__sweep.go(n), name);
        await page.waitForTimeout(wait);
        await page.evaluate(() => window.__sweep.settle());
        issues = await page.evaluate(() => window.__sweep.audit());
        if (SHOTS) await page.screenshot({ path: join(dir, `${name}.png`) });
        await page.evaluate((n) => window.__sweep.after(n), name);
      } catch (e) { issues.push({ kind: 'harness', sev: 'error', sel: name, text: e.message.split('\n')[0] }); }
      for (const e of errors.slice(e0)) issues.push({ kind: 'js-error', sev: 'error', sel: name, text: e.slice(0, 200) });
      all.push({ state: st, vp: `${vp[0]}x${vp[1]}`, screen: name, issues });
      screensDone++;
    }
    console.log(`  layout ${st} ${vp[0]}x${vp[1]}: ${names.length} screens, ${all.filter((x) => x.state === st && x.vp === `${vp[0]}x${vp[1]}`).reduce((n, x) => n + x.issues.filter((i) => i.sev === 'error').length, 0)} errors`);
    await ctx.close();
  });
  report.layout = all;
  // summarise: one line per distinct problem, with where it shows up
  const key = (i) => `${i.kind} ${i.sel} ${i.by || i.with || i.box || ''}`;
  const groups = new Map();
  for (const s of all) for (const i of s.issues) {
    if (i.sev === 'info') continue;
    const k = key(i); if (!groups.has(k)) groups.set(k, { i, where: [] });
    groups.get(k).where.push(`${s.state}/${s.vp}/${s.screen}`);
  }
  console.log(`\nlayout: ${all.length} screens (${STATES.length} states × ${VPS.length} viewports), ${groups.size} distinct issues`);
  for (const [, g] of [...groups].sort((a, b) => (a[1].i.sev > b[1].i.sev ? 1 : -1))) console.log(`  [${g.i.sev}] ${g.i.kind} ${g.i.sel} ${JSON.stringify({ ...g.i, kind: undefined, sev: undefined, sel: undefined })} ×${g.where.length} e.g. ${g.where.slice(0, 3).join(', ')}`);
  const errs = [...groups.values()].filter((g) => g.i.sev === 'error');
  check(`layout: ${all.length} screens audited with no layout errors`, !errs.length, errs.slice(0, 6).map((g) => `${g.i.kind} ${g.i.sel} (${g.where[0]})`).join('; '));
  const jsErr = all.flatMap((s) => s.issues.filter((i) => i.kind === 'js-error' || i.kind === 'harness').map((i) => `${s.state}/${s.vp}/${s.screen}: ${i.text}`));
  check('layout: no console, page or harness errors while visiting every screen', !jsErr.length, jsErr.slice(0, 3).join(' | '));
  return screensDone;
}

// ---------------------------------------------------------------- 2. fuzz: random taps, double taps, the run flow
let rngSeed = 1234567;
const rnd = () => { rngSeed = (Math.imul(rngSeed, 1103515245) + 12345) >>> 0; return rngSeed / 4294967296; };
async function fuzzPhase() {
  const P = await profiles();
  let taps = 0;
  const problems = [], log = [];
  for (const st of STATES) {
    const { ctx, page, errors } = await openPage({ vp: [390, 844], seed: P[st] });
    await page.evaluate(() => window.__sweep.fastStore('random'));
    const n = Math.round(CLICKS / STATES.length);
    let stuckSince = 0;
    for (let i = 0; i < n; i++) {
      const ts = await page.evaluate(() => window.__sweep.targets()).catch(() => []);
      if (!ts.length) { await page.waitForTimeout(150); continue; }
      const t = ts[Math.floor(rnd() * ts.length)], m = rnd();
      const tap = async (x, y) => { await page.touchscreen.tap(x, y); taps++; };
      let mode = 'tap';
      if (m < 0.65) await tap(t.x, t.y);
      else if (m < 0.8) { mode = 'double'; await tap(t.x, t.y); await page.waitForTimeout(45); await tap(t.x, t.y); }
      else if (m < 0.88) { mode = 'rapid'; for (let k = 0; k < 3; k++) { await tap(t.x, t.y); await page.waitForTimeout(15); } }
      else if (m < 0.95) { mode = 'tap+close'; await tap(t.x, t.y); await page.waitForTimeout(25); const x = await page.evaluate(() => window.__sweep.center('#ui > .modal-back:last-of-type .modal-x')); await tap(x ? x.x : 5, x ? x.y : 839); }
      else { mode = 'tap+other'; await tap(t.x, t.y); await page.waitForTimeout(30); const o = ts[Math.floor(rnd() * ts.length)]; await tap(o.x, o.y); }
      log.push(`${st} ${mode} ${t.sel} "${t.text}"`);
      await page.waitForTimeout(90 + rnd() * 160);
      const bad = await page.evaluate(() => window.__sweep.inv()).catch((e) => [e.message]);
      if (bad.length) problems.push({ st, i, mode, target: `${t.sel} "${t.text}"`, bad, before: log.slice(-4) });
      // a busy button that never comes back (Processing…, Restoring…)
      const busy = await page.evaluate(() => [...document.querySelectorAll('#ui button')].some((b) => /Processing|Restoring/.test(b.textContent))).catch(() => false);
      if (busy) { stuckSince = stuckSince || Date.now(); if (Date.now() - stuckSince > 6000) { problems.push({ st, i, bad: ['a busy button never recovered'], before: log.slice(-4) }); stuckSince = 0; } } else stuckSince = 0;
    }
    // after the storm: the menus still work (no stuck busy flags): a free chest, a summon and a run start from home
    const after = await page.evaluate(async () => {
      const S = window.__sweep, a = window.__soulswarm, p = a.profile, q = (s) => document.querySelector(s);
      await S.reset(); S.fastStore(true); p.freeChestDate = null; p.altar.freeDate = null; p.sigils = Math.max(p.sigils, 1); p.energy = 30; a.meta.refresh();
      const g = p.gems; q('.hm [data-act="chest"]').click(); await S.sleep(400); const chest = p.gems - g;
      await S.reset(); p.sigils = 1; a.meta.refresh(); q('[data-nav="altar"]').click(); q('[data-act="s1"]').click(); const rv = document.querySelectorAll('#ui > .rv').length;
      await S.reset(); p.energy = 30; a.meta.refresh(); q('.hm [data-act="battle"]').click(); const ran = !!a.run; await S.reset();
      return { chest, rv, ran };
    }).catch((e) => ({ error: e.message }));
    if (!(after.chest === 10 && after.rv === 1 && after.ran)) problems.push({ st, bad: ['menus broken after fuzzing: ' + JSON.stringify(after)] });
    for (const e of errors) problems.push({ st, bad: [e], before: log.slice(-4) });
    await ctx.close();
  }
  report.fuzz.random = { taps, problems, log: log.slice(-200) };
  console.log(`\nfuzz: ${taps} random taps over ${STATES.length} profiles, ${problems.length} problems`);
  for (const pr of problems.slice(0, 12)) console.log('  ', JSON.stringify(pr).slice(0, 400));
  check(`fuzz: ${taps} random taps (single, double, rapid, close mid-animation) keep currencies valid, one modal of a kind, no errors`, !problems.length, problems.slice(0, 3).map((x) => x.bad.join(',')).join(' | '));

  // double taps on every claim / buy / ad button: same-task (two clicks before any redraw) and two hit-tested taps 60 ms apart
  const { ctx, page, errors } = await openPage({ vp: [390, 844], seed: P.mid });
  await page.evaluate(() => window.__sweep.snapshot());
  const names = await page.evaluate(() => Object.keys(window.__sweep.SCN));
  const dt = [];
  for (const n of names) {
    const out = {};
    for (const mode of ['sync', 'tap']) {
      const e0 = errors.length;
      try {
        await page.evaluate(() => window.__sweep.reset());
        const sel = await page.evaluate((x) => window.__sweep.scnSetup(x), n);
        await page.evaluate(() => window.__sweep.settle(1500));
        if (mode === 'sync') await page.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click(); e.click(); }, sel);
        else await page.evaluate(async (s) => { // a real double tap: the second tap, 60 ms later, lands on whatever is under the finger then
          const c = window.__sweep.center(s); if (!c) throw new Error('missing ' + s);
          const hit = () => { const e = document.elementFromPoint(c.x, c.y), b = e && (e.closest('button, [data-act], [data-a], [data-q], [data-wk]') || e); if (!b) return;
            for (const k of ['pointerdown', 'pointerup']) b.dispatchEvent(new PointerEvent(k, { bubbles: true, clientX: c.x, clientY: c.y })); b.click(); };
          hit(); await window.__sweep.sleep(60); hit();
        }, sel);
        taps += 2;
        await page.waitForTimeout(await page.evaluate((x) => window.__sweep.SCN[x].wait || 450, n));
        out[mode] = await page.evaluate((x) => window.__sweep.scnVerify(x), n);
      } catch (e) { out[mode] = { ok: false, detail: 'harness: ' + e.message.split('\n')[0] }; }
      if (errors.length > e0) out[mode] = { ok: false, detail: errors.slice(e0).join(' | ') };
    }
    dt.push({ n, ...out });
    check(`double tap: ${n} acts once`, out.sync.ok && out.tap.ok, `same task: ${out.sync.ok ? 'ok' : out.sync.detail} · 60 ms apart: ${out.tap.ok ? 'ok' : out.tap.detail}`);
  }
  report.fuzz.doubleTap = dt;

  // the Starter Pack sheet closed while the purchase is processing, then bought again from the home screen
  const sp = await page.evaluate(async () => {
    const S = window.__sweep, a = window.__soulswarm, p = a.profile, q = (s) => document.querySelector(s);
    await S.reset(); a.store.purchase = () => new Promise((r) => setTimeout(() => r({ ok: true, simulated: true }), 400));
    Object.assign(p.purchases, { starterBought: false, starterExpires: Date.now() + 864e5, history: [] }); Object.assign(p.heroes.nyx, { owned: false, stars: 0, shards: 0 }); a.meta.refresh();
    const g = p.gems;
    q('.hm [data-act="starter"]').click(); await S.sleep(30); q('.mm-starter [data-act="buy"]').click(); await S.sleep(30);
    q('.modal-purchase .btn-primary').click(); await S.sleep(30); q('.modal-purchase')?.closest('.modal-back').querySelector('.modal-x')?.click();
    q('.hm [data-act="starter"]')?.click(); await S.sleep(30); q('.mm-starter [data-act="buy"]')?.click(); await S.sleep(30); q('.modal-purchase .btn-primary')?.click();
    await S.sleep(1000);
    return { gems: p.gems - g, nyx: p.heroes.nyx, buys: p.purchases.history.length };
  });
  check('purchase: the Starter Pack cannot be bought twice by closing its sheet mid-purchase', sp.gems === 300 && sp.buys === 1 && sp.nyx.shards === 0, JSON.stringify(sp));

  // the run flow, repeated: BATTLE, pause, abandon, results, double rewards, continue (real taps); GPU memory must not grow
  const flow = [];
  await page.evaluate(() => { window.__sweep.reset(); window.__sweep.fastStore(true); });
  for (let i = 0; i < 6; i++) {
    const tapSel = async (s, wait = 300) => { const c = await page.evaluate((x) => window.__sweep.center(x), s); if (!c) throw new Error('missing ' + s); await page.touchscreen.tap(c.x, c.y); taps++; await page.waitForTimeout(wait); };
    try {
      const b = await page.evaluate(() => { const p = window.__soulswarm.profile; p.energy = 30; window.__soulswarm.meta.refresh(); return { e: p.energy, runs: p.stats.runs, gold: p.gold }; });
      await page.evaluate(() => window.__sweep.settle(1500));
      await tapSel('.hm [data-act="battle"]', 900);
      await page.evaluate(() => { window.__soulswarm.run.player.hurt = () => {}; });
      await tapSel('.hud-pause', 500);
      await tapSel('.modal .btn-danger', 1200);
      const mid = await page.evaluate(() => window.__soulswarm.profile.gold);
      await tapSel('.modal-results .btn-ad', 500);
      await tapSel('.modal-results .btn-primary', 600);
      const a = await page.evaluate(() => { const A = window.__soulswarm, p = A.profile, m = A.engine.renderer.info.memory; return { e: p.energy, runs: p.stats.runs, gold: p.gold, run: !!A.run, huds: document.querySelectorAll('#ui > .hud').length, modals: document.querySelectorAll('#ui > .modal-back').length, menu: !A.meta.el.hidden, geo: m.geometries, tex: m.textures }; });
      flow.push({ i, ok: a.e === b.e - 5 && a.runs === b.runs + 1 && a.gold - mid === mid - b.gold && !a.run && !a.huds && !a.modals && a.menu, base: mid - b.gold, doubled: a.gold - mid, ...a });
    } catch (e) { flow.push({ i, ok: false, error: e.message.split('\n')[0] }); }
  }
  report.fuzz.runFlow = flow;
  const peak = (k, a, b) => Math.max(...flow.slice(a, b).map((f) => f[k] || 0)); // counts swing with what is on screen: compare peaks
  const g0 = peak('geo', 0, 3), gN = peak('geo', 3), t0x = peak('tex', 0, 3), tN = peak('tex', 3);
  check('run flow ×6 (BATTLE, pause, abandon, results, double rewards, continue): energy, runs and rewards exact, nothing left over', flow.every((f) => f.ok), JSON.stringify(flow.filter((f) => !f.ok).slice(0, 2)));
  check('run flow ×6: GPU geometries and textures do not grow run after run', gN <= g0 + 2 && tN <= t0x + 2, `geometries ${flow.map((f) => f.geo)} textures ${flow.map((f) => f.tex)}`);
  check('fuzz: no errors in the double-tap and run-flow checks', !errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();
  report.fuzz.taps = taps;
  console.log(`fuzz: ${taps} taps in total`);
}

// ---------------------------------------------------------------- 3. economy invariants (in page, on the game's own modules)
async function economyPhase() {
  const { ctx, page, errors } = await openPage({ vp: [390, 844] });
  // the odds the player is shown: read from the Altar's odds sheet
  const shown = await page.evaluate(async () => {
    document.querySelector('[data-nav="altar"]').click(); document.querySelector('[data-act="odds"]').click();
    const rows = [...document.querySelectorAll('.odds tbody tr')].map((tr) => [tr.cells[0].textContent.trim().toLowerCase(), parseFloat(tr.cells[1].textContent) / 100]);
    const text = document.querySelector('.mm-odds').innerText;
    document.querySelector('.mm-odds').closest('.modal-back').querySelector('.modal-x').click();
    return { odds: Object.fromEntries(rows), pity: +(text.match(/guaranteed on your (\d+)/) || [])[1], text };
  });
  const E = await page.evaluate(async (shownOdds) => {
    const eco = await import('/src/meta/economy.js'), save = await import('/src/meta/save.js'), D = await import('/src/game/data.js'), Df = await import('/src/meta/difficulty.js');
    const out = {}, fails = [], count = {}, cat = { E1: 'run', E2: 'spend' };
    let TAG = 'run'; const fail = (m) => { count[TAG] = (count[TAG] || 0) + 1; if (count[TAG] <= 6) fails.push(`${TAG}| ${m}`); };
    const realNow = Date.now, realRandom = Math.random;
    let seed = 99; const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const CUR = ['gold', 'gems', 'sigils', 'energy', 'xp', 'level'];
    const valid = (p, tag) => { for (const k of CUR) if (!Number.isInteger(p[k]) || p[k] < 0) fail(`${k}=${p[k]} after ${tag}`); if (!Number.isInteger(p.pass.xp) || p.pass.xp < 0 || p.pass.xp > D.PASS_TIERS * D.PASS_XP_PER_TIER) fail(`pass.xp=${p.pass.xp} after ${tag}`); if (p.level < 1) fail(`level ${p.level} after ${tag}`); };
    const fresh = () => { const p = save.newProfile(); p.flags.bloodMoon = 'off'; return p; };
    const cleared = () => { const p = fresh(); p.chapter.unlocked = 6; for (let c = 1; c <= 5; c++) { p.chapter.best[c] = { time: 420, cleared: true, kills: 2000 }; p.diff.best[c] = { normal: { time: 420, cleared: true }, nightmare: { time: 420, cleared: c % 2 === 0 } }; } return p; };

    TAG = 'run';
    // E1. applyRunResult with random and extreme inputs, every mode, fields dropped at random
    const X = [0, 1, 7, 59.9, 60, 119, 120, 359.5, 420, 960, 3600, 1e4, 1e6, 12.7];
    const K = [0, 1, 39, 40, 500, 2000, 99999, 1e7];
    let runs = 0;
    for (let i = 0; i < 4000; i++) {
      const p = rand() < 0.3 ? fresh() : cleared();
      const before = { energy: p.energy };
      const r = { chapter: 1 + Math.floor(rand() * 6), time: X[Math.floor(rand() * X.length)], kills: K[Math.floor(rand() * K.length)], raised: K[Math.floor(rand() * K.length)], bestLegion: Math.floor(rand() * 500), novas: Math.floor(rand() * 20), gates: Math.floor(rand() * 15), victory: rand() < 0.5, level: 1 + Math.floor(rand() * 40), bonusGold: rand() < 0.3 ? Math.floor(rand() * 2000) : 0, heroId: 'vael', endless: rand() < 0.15, bossKills: Math.floor(rand() * 5), trial: rand() < 0.15, bloodMoon: rand() < 0.3, difficulty: ['normal', 'nightmare', 'torment', 'bogus', undefined][Math.floor(rand() * 5)], chests: Math.floor(rand() * 9), elites: Math.floor(rand() * 9), evolutions: Math.floor(rand() * 3), bestStreak: Math.floor(rand() * 900) };
      if (r.chapter === 6) r.endless = true;
      if (rand() < 0.25) for (const k of Object.keys(r)) if (k !== 'chapter' && rand() < 0.3) delete r[k]; // a partial result
      try {
        const o = eco.applyRunResult(p, r); runs++;
        valid(p, `run ${JSON.stringify(r)}`);
        for (const [k, v] of Object.entries(o.rewards)) if (typeof v === 'number' && (!Number.isInteger(v) || v < 0)) fail(`run reward ${k}=${v} for ${JSON.stringify(r)}`);
        if (p.energy !== before.energy) fail('a run result changed energy');
        if (o.firstClear && (r.trial || r.endless || !r.victory)) fail(`first clear on ${JSON.stringify(r)}`);
        eco.doubleRunRewards(p, o.rewards); valid(p, 'double rewards');
      } catch (e) { fail(`applyRunResult threw ${e.message} on ${JSON.stringify(r)}`); }
          }
    out.runs = runs;

    TAG = 'spend';
    // E2. spending more than you have, or a negative / NaN amount, is refused; every buy path refuses when poor
    { const p = fresh();
      for (const cur of ['gold', 'gems', 'sigils']) for (const amt of [p[cur] + 1, -100, NaN, Infinity]) { const v = p[cur]; if (eco.spend(p, cur, amt) || p[cur] !== v) fail(`spend ${amt} ${cur}: ${v} → ${p[cur]}`); }
      p.gems = 10; for (const k of Object.keys(D.GEM_SHOP)) if (eco.buyGemShop(p, k) || p.gems !== 10) fail(`gem shop ${k} while poor`);
      p.gold = 10; if (eco.upgradeTalent(p, 'might') || p.gold !== 10) fail('talent while poor');
      p.gems = 149; p.sigils = 0; const pity = p.altar.pity; if (eco.summon(p, 1, 'gems').ok || eco.summon(p, 10, 'gems').ok || eco.summon(p, 1, 'sigils').ok || p.gems !== 149 || p.altar.pity !== pity) fail('summon while poor');
      if (eco.heroAction(p, 'mordrake').ok) fail('hero unlock without shards');
      if (eco.applyPurchase(p, 'nope') !== null) fail('unknown SKU');
      valid(p, 'spend paths'); }

    TAG = 'gacha';
    // E3. the Soul Altar against the shown odds: single pulls (pity-forced pulls excluded), the pity counter and the 10-pull rule
    { Math.random = rand; const p = fresh(); p.sigils = 1e9;
      const cnt = { common: 0, rare: 0, epic: 0, legendary: 0 }; let forced = 0, gap = 0, maxGap = 0, toLeg = [], since = 0, pityHits = 0;
      const shards = {}, types = {};
      for (let i = 0; i < 120000; i++) {
        const willForce = p.altar.pity + 1 >= D.ALTAR.pityLegendary;
        const { results } = eco.summon(p, 1, 'sigils'); const r = results[0];
        since++;
        if (willForce) { forced++; if (r.rarity !== 'legendary') fail('pity pull was not Legendary'); } else cnt[r.rarity]++;
        if (r.rarity === 'legendary') { toLeg.push(since); if (willForce) pityHits++; since = 0; gap = 0; } else { gap++; maxGap = Math.max(maxGap, gap); }
        if (r.shards) shards[r.rarity + ':' + r.shards.hero] = (shards[r.rarity + ':' + r.shards.hero] || 0) + 1;
        types[r.relic.type] = (types[r.relic.type] || 0) + 1;
        if (p.relics.length > 40) p.relics.length = 2; // keep the inventory small (merges keep it bounded anyway)
      }
      const n = Object.values(cnt).reduce((a, b) => a + b, 0);
      let chi = 0; for (const k of Object.keys(cnt)) { const e = n * shownOdds[k]; chi += (cnt[k] - e) ** 2 / e; }
      const mean = toLeg.reduce((a, b) => a + b, 0) / toLeg.length;
      // ten-pulls: every one has an Epic or better; the guarantee never makes a Legendary
      let tens = 0, noEpic = 0, legs10 = 0, pulls10 = 0;
      for (let i = 0; i < 6000; i++) { const before = p.altar.pity; const { results } = eco.summon(p, 10, 'sigils'); tens++; pulls10 += 10; if (!results.some((x) => x.rarity === 'epic' || x.rarity === 'legendary')) noEpic++; legs10 += results.filter((x) => x.rarity === 'legendary').length; if (before + 10 < D.ALTAR.pityLegendary && p.altar.pity !== before + 10 && !results.some((x) => x.rarity === 'legendary')) fail('pity counter drift in a 10-pull'); }
      const typeChi = (() => { const v = Object.values(types), m = v.reduce((a, b) => a + b, 0) / D.RELIC_TYPES.length; return v.reduce((a, x) => a + (x - m) ** 2 / m, 0); })();
      out.gacha = { singles: 120000, n, cnt, rates: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / n * 100).toFixed(3)])), shown: shownOdds, chi2: +chi.toFixed(2), forced, maxGap, meanToLegendary: +mean.toFixed(2), pityShare: +(pityHits / toLeg.length * 100).toFixed(1), tens, noEpic, legendaryRateIn10: +(legs10 / pulls10 * 100).toFixed(2), shards, typeChi2: +typeChi.toFixed(2) };
      Math.random = realRandom; }

    TAG = 'pass';
    // E4. Soul Pass: each tier once, never above the reached tier, never a tier that does not exist, premium only with the pass
    { const p = fresh(); p.pass.xp = 15000; let claims = 0;
      for (let t = 1; t <= 30; t++) { if (!eco.claimPass(p, t, false)) fail(`pass free ${t}`); else claims++; if (eco.claimPass(p, t, false)) fail(`pass free ${t} twice`); if (eco.claimPass(p, t, true)) fail(`premium ${t} without the pass`); }
      p.pass.premium = true; for (let t = 1; t <= 30; t++) { if (!eco.claimPass(p, t, true)) fail(`premium ${t}`); if (eco.claimPass(p, t, true)) fail(`premium ${t} twice`); }
      const g = p.gems; for (const t of [0, -10, 31, 1.5, NaN, '3']) if (eco.claimPass(p, t, false) || eco.claimPass(p, t, true)) fail(`pass tier ${t} claimable`);
      if (p.gems !== g) fail(`odd pass tiers paid ${p.gems - g} gems`);
      const q = fresh(); q.pass.xp = 1499; if (eco.claimPass(q, 3, false)) fail('pass tier above reached'); eco.addPassXp(q, 1e9); if (q.pass.xp !== 15000) fail('pass XP cap'); valid(p, 'pass'); }

    TAG = 'quest';
    // E5. daily quests rotate by local day (Date.now mocked), reset progress and claims, and pay once
    { const p = fresh(); p.chapter.unlocked = 2; let t = new Date(2026, 9, 5, 12).getTime(); Date.now = () => t;
      const seen = []; let same = 0;
      for (let d = 0; d < 21; d++) {
        eco.upkeep(p); const list = eco.questList(p);
        if (list.length !== 6 || new Set(list.map((x) => x.id)).size !== 6) fail(`quests day ${d}: ${list.map((x) => x.id)}`);
        if (Object.keys(p.quests.progress).length || p.quests.claimed.length) fail(`quests not reset on day ${d}`);
        const ids = p.quests.ids.join(); if (seen.length && seen[seen.length - 1] === ids) same++; seen.push(ids);
        const again = eco.pickQuests(p, save.todayKey()).join(); if (again !== ids) fail('quest pick not stable for a day');
        for (const q of list) p.quests.progress[q.key] = q.goal;
        for (const q of list) { if (!eco.claimQuest(p, q.id)) fail(`claim ${q.id}`); if (eco.claimQuest(p, q.id)) fail(`claim ${q.id} twice`); }
        t += 864e5;
      }
      if (same > 2) fail(`quests repeated on ${same} consecutive days`);
      const early = fresh(); for (let d = 0; d < 30; d++) { if (eco.pickQuests(early, `2026-11-${String(d + 1).padStart(2, '0')}`).some((id) => D.QUEST_POOL.find((q) => q.id === id).late)) fail('late quest before a Chapter 1 clear'); }
      Date.now = realNow; out.questDays = seen.length; }

    TAG = 'weekly';
    // E6. the weekly chest: 25 claims in a Monday–Sunday week open it once; a new week resets it
    { const p = fresh(); let t = new Date(2026, 9, 5, 10).getTime(); Date.now = () => t; // Monday 5 Oct 2026
      for (let d = 0; d < 7; d++) { eco.upkeep(p); const list = eco.questList(p); for (const q of list) p.quests.progress[q.key] = q.goal; for (const q of list.slice(0, 4)) eco.claimQuest(p, q.id); t += 864e5; }
      Date.now = () => new Date(2026, 9, 11, 22).getTime(); // Sunday night
      const w = eco.weeklyState(p); if (!w.ready || w.done !== 25) fail(`weekly not ready after 28 claims: ${JSON.stringify(w)}`);
      const s = p.sigils; if (!eco.claimWeekly(p) || eco.claimWeekly(p) || p.sigils !== s + 1) fail('weekly chest opened twice or not at all');
      Date.now = () => new Date(2026, 9, 12, 0, 1).getTime(); // Monday
      const w2 = eco.weeklyState(p); if (w2.done !== 0 || w2.claimed || w2.ready) fail(`weekly not reset on Monday: ${JSON.stringify(w2)}`);
      Date.now = realNow; }

    TAG = 'trial';
    // E7. the Daily Trial: locked before a Chapter 1 clear; one attempt plus one ad retry a day; resets the next day
    { const p = fresh(); let t = new Date(2026, 9, 7, 9).getTime(); Date.now = () => t;
      if (eco.beginTrial(p) || eco.trialState(p).unlocked) fail('trial open before a Chapter 1 clear');
      p.chapter.unlocked = 2;
      const seq = [eco.beginTrial(p), eco.beginTrial(p), eco.grantTrialRetry(p), eco.grantTrialRetry(p), eco.beginTrial(p), eco.beginTrial(p), eco.grantTrialRetry(p)];
      if (seq.join() !== 'true,false,true,false,true,false,false') fail(`trial attempts ${seq}`);
      t += 864e5; const s2 = eco.trialState(p); if (!s2.available || eco.beginTrial(p) !== true) fail('trial did not reset the next day');
      Date.now = realNow; }

    TAG = 'first';
    // E8. first-clear gems: once per chapter per difficulty (never on a trial or in Endless)
    { const p = fresh(); p.flags.bloodMoon = 'off'; const got = [];
      const win = (ch, difficulty, extra = {}) => eco.applyRunResult(p, { chapter: ch, time: 420, kills: 2000, raised: 100, bestLegion: 100, novas: 3, gates: 5, victory: true, level: 20, bonusGold: 0, heroId: 'vael', endless: false, bossKills: 0, difficulty, ...extra });
      for (let ch = 1; ch <= 5; ch++) for (const d of D.DIFFICULTY_ORDER) {
        const a = win(ch, d), b = win(ch, d), want = d === 'normal' ? 50 + 20 * ch : 10 + 2 * ch + D.DIFFICULTY[d].firstClearGems;
        got.push(a.rewards.gems);
        if (!a.firstClear || b.firstClear || a.rewards.gems !== want || b.rewards.gems !== 10 + 2 * ch) fail(`first clear ch${ch} ${d}: ${a.rewards.gems}/${b.rewards.gems} (want ${want})`);
        if (d === 'normal' && (a.rewards.sigils !== 1 || b.rewards.sigils)) fail(`first clear sigil ch${ch}`);
      }
      const q = fresh(); q.chapter.unlocked = 2; q.chapter.best[1] = { time: 400, cleared: true };
      const tr = eco.applyRunResult(q, { chapter: 2, time: 420, kills: 1, raised: 0, bestLegion: 0, novas: 0, gates: 0, victory: true, trial: true, level: 1 });
      const en = eco.applyRunResult(q, { chapter: 6, time: 420, kills: 1, raised: 0, bestLegion: 0, novas: 0, gates: 0, victory: true, endless: true, bossKills: 1, level: 1 });
      if (tr.firstClear || en.firstClear || q.chapter.best[2]?.cleared) fail('trial or Endless counted as a first clear');
      out.firstClearGems = got.reduce((a, b) => a + b, 0); }

    TAG = 'energy';
    // E9. energy across time jumps, including the clock going backwards
    { const p = fresh(); let t = realNow(); Date.now = () => t;
      p.energy = 0; p.energyTs = t; t += 3600e3; eco.upkeep(p); const h1 = p.energy;
      t += 10 * 3600e3; eco.upkeep(p); const h11 = p.energy;
      p.energy = 50; eco.upkeep(p); const over = p.energy;
      if (eco.spendEnergy(p) !== true || p.energy !== 45) fail('spend above max');
      p.energy = 4; if (eco.spendEnergy(p) || p.energy !== 4) fail('spend with 4 energy');
      p.energy = 10; p.energyTs = t; t -= 864e5; eco.upkeep(p); const backNext = eco.energyNextIn(p); t += 400e3; eco.upkeep(p); const backAfter = p.energy;
      p.energy = 10; p.energyTs = t - 359e3; t += 2e3; eco.upkeep(p); const partial = [p.energy, eco.energyNextIn(p)];
      Date.now = realNow;
      out.energy = { h1, h11, over, backNext, backAfter, partial };
      if (h1 !== 10 || h11 !== 30 || over !== 50) fail(`energy regen ${h1}/${h11}/${over}`);
      if (backNext > D.ENERGY_REGEN_SEC || backAfter !== 11) fail(`clock set back a day: next +1 in ${backNext} s, energy ${backAfter} after 400 s`);
      if (partial[0] !== 11) fail(`partial regen ${partial}`);
      valid(p, 'energy'); }

    TAG = 'daily';
    // E10. one-a-day rewards and purchases pay once
    { const p = fresh(); Math.random = rand;
      const twice = (name, fn) => { const a = fn(), b = fn(); if (!a || b) fail(`${name}: ${!!a}/${!!b}`); };
      twice('login', () => eco.claimLogin(p)); twice('free chest', () => eco.claimFreeChest(p)); twice('free summon', () => eco.summon(p, 1, 'free').ok);
      p.purchases.pactUntil = Date.now() + 864e5; p.purchases.pactLastClaim = null; twice('pact tribute', () => eco.claimPactDaily(p));
      const g = p.gems; eco.applyPurchase(p, 'gems_80'); eco.applyPurchase(p, 'gems_80'); if (p.gems - g !== 240) fail(`gems_80 first-buy ×2 then ×1: +${p.gems - g}`);
      Math.random = realRandom; valid(p, 'once-a-day'); }
    out.fails = fails; out.count = count;
    return out;
  }, shown.odds);
  report.economy = { shown, ...E };
  const T = (tag) => E.fails.filter((f) => f.startsWith(tag + '|')).map((f) => f.slice(tag.length + 2) + (E.count[tag] > 6 ? ` (${E.count[tag]} in all)` : ''));
  console.log(`\neconomy: ${E.runs} run results fuzzed; gacha ${JSON.stringify(E.gacha)}`);
  const G = E.gacha;
  check('economy: applyRunResult × every mode × extreme and partial inputs keeps currencies, XP and pass XP finite integers ≥ 0', !T('run').length, T('run').join(' | '));
  check('economy: spending more than you have (or a negative amount) is refused on every path', !T('spend').length, T('spend').join(' | '));
  check('gacha: the odds sheet matches ALTAR.odds', JSON.stringify(shown.odds) === JSON.stringify({ legendary: 0.02, epic: 0.1, rare: 0.28, common: 0.6 }) && shown.pity === 60, JSON.stringify(shown.odds));
  check('gacha: 120,000 single pulls match the shown per-pull odds (χ² < 16.27, p > 0.001, 3 df)', G.chi2 < 16.27, `χ²=${G.chi2} rates ${JSON.stringify(G.rates)}`);
  check('gacha: pity — never 60 pulls without a Legendary; mean pulls to one ≈ 35.1 and ~30% from pity (MONETIZATION §6.2)', G.maxGap <= 59 && Math.abs(G.meanToLegendary - 35.12) < 1.2 && Math.abs(G.pityShare - 30.4) < 3, `maxGap ${G.maxGap}, mean ${G.meanToLegendary}, pity ${G.pityShare}%`);
  check('gacha: every 10-pull has an Epic or better; the guarantee never adds Legendaries', G.noEpic === 0 && G.legendaryRateIn10 < 3.6, `no-Epic batches ${G.noEpic}/${G.tens}, Legendary rate ${G.legendaryRateIn10}%`);
  const chiEq = (ks) => { const v = ks.map((k) => G.shards[k] || 0), m = v.reduce((a, b) => a + b, 0) / v.length; return v.reduce((a, x) => a + (x - m) ** 2 / m, 0); };
  const epicKeys = Object.keys(G.shards).filter((k) => k.startsWith('epic:')), legKeys = Object.keys(G.shards).filter((k) => k.startsWith('legendary:'));
  const shardChi = [chiEq(epicKeys), chiEq(legKeys)].map((x) => +x.toFixed(2));
  check('gacha: relic types and hero shards are equally likely (as the odds sheet says)', G.typeChi2 < 24.32 && shardChi[0] < 13.82 && shardChi[1] < 10.83 && epicKeys.length === 3 && legKeys.length === 2 && !T('gacha').length, `relic χ²=${G.typeChi2} shard χ²=${shardChi} ${JSON.stringify(G.shards)}`);
  check('economy: pass tiers claim once, only when reached, only real tiers, premium only with the pass', !T('pass').length, T('pass').join(' | '));
  check('economy: quests rotate by day, reset, and pay once; late quests stay gated', !T('quest').length, T('quest').join(' | '));
  check('economy: the weekly chest opens once and resets on Monday', !T('weekly').length, T('weekly').join(' | '));
  check('economy: the Daily Trial allows one attempt plus one ad retry a day', !T('trial').length, T('trial').join(' | '));
  check('economy: first-clear gems once per chapter per difficulty (900 + 550 gems total), never from trials or Endless', !T('first').length, T('first').join(' | '));
  check('economy: energy regenerates across time jumps, including the clock going backwards', !T('energy').length, `${JSON.stringify(E.energy)} ${T('energy').join(' | ')}`);
  check('economy: login, free chest, free summon and Pact tribute pay once a day; first-buy ×2 once per tier', !T('daily').length, T('daily').join(' | '));
  check('economy: no errors', !errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 4. save robustness
// (its timestamps are taken when the script starts, so energy may have regenerated by the time a case boots)
const oldSave = (extra = {}) => ({ v: 1, createdAt: Date.now() - 30 * 864e5, lastSeen: Date.now() - 864e5, name: 'Shepherd', level: 9, xp: 120, gold: 23456, gems: 777, sigils: 3, energy: 12, energyTs: Date.now() - 600e3,
  heroes: { vael: { owned: true, stars: 3, shards: 4 }, nyx: { owned: true, stars: 1, shards: 2 }, seraphine: { owned: false, stars: 0, shards: 6 }, mordrake: { owned: false, stars: 0, shards: 5 } }, selectedHero: 'nyx', skins: {},
  relics: [{ uid: 'r1', type: 'crown', rarity: 'common', level: 4 }, { uid: 'r2', type: 'lantern', rarity: 'rare', level: 2 }, { uid: 'r3', type: 'idol', rarity: 'epic', level: 1 }], equipped: ['r1', 'r2', 'r3'], relicSeq: 4,
  talents: { might: 5, vitality: 4, raise: 2, cap: 1, greed: 0, swift: 0 }, chapter: { unlocked: 3, selected: 2, best: { 1: { time: 431, cleared: true, kills: 2100 }, 2: { time: 415, cleared: true, kills: 2300 } } },
  pass: { season: 1, xp: 2600, premium: false, claimedFree: [1, 2], claimedPrem: [] }, quests: { day: '2026-01-01', progress: { kills: 30 }, claimed: [] }, login: { streak: 4, lastClaim: '2026-01-01' },
  purchases: { first: {}, starterBought: false, starterExpires: Date.now() - 864e5, pactUntil: 0, pactLastClaim: null, history: [] }, altar: { pity: 17, pulls: 40, freeDate: null },
  stats: { runs: 30, kills: 40000, bestLegion: 210, raised: 9000, clears: 4 }, settings: { music: 0.4, sfx: 0.7, quality: 'low', haptics: false, muted: false }, flags: { tutorialDone: true, hints: { move: 1 } }, freeChestDate: null, ...extra });
const SAVE_CASES = [
  // [name, raw save, expect(profile) -> true | message]
  ['corrupted JSON', '{"gold": 12', (p, x) => (p.gold === 1500 && x.backup ? true : `fresh ${p.gold === 1500}, backup kept ${x.backup}`)],
  ['empty string', '', (p) => p.gold === 1500 || 'not fresh'],
  ['null', 'null', (p) => p.gold === 1500 || 'not fresh'],
  ['an array', '[1,2]', (p) => p.gold === 1500 || 'not fresh'],
  ['a number', '42', (p) => p.gold === 1500 || 'not fresh'],
  ['partial profile', JSON.stringify({ gold: 5000, chapter: { unlocked: 3 } }), (p) => (p.gold === 5000 && p.chapter.unlocked === 3 && p.gems === 150 ? true : JSON.stringify({ g: p.gold, u: p.chapter.unlocked }))],
  ['launch-format save (6902554: no Liora, trial, weekly or accessibility)', JSON.stringify(oldSave()), (p) => (p.gold === 23456 && p.gems === 777 && p.heroes.nyx.owned && p.selectedHero === 'nyx' && p.relics.length === 3 && p.talents.might === 5 && p.chapter.best[2].cleared && p.heroes.liora && p.trial && p.weekly && p.settings.shake === 1 && p.diff.best[1].normal.cleared ? true : 'progress lost')],
  ['pre-Update-3 save (1c55b83: no difficulty block)', JSON.stringify(oldSave({ trial: { day: null, done: false, ads: 0, clears: 5 }, weekly: { week: null, done: 3, claimed: false }, heroes: { vael: { owned: true, stars: 2, shards: 0 }, nyx: { owned: false, stars: 0, shards: 3 }, seraphine: { owned: false, stars: 0, shards: 0 }, liora: { owned: true, stars: 1, shards: 0 }, mordrake: { owned: false, stars: 0, shards: 0 } }, selectedHero: 'liora' })),
    (p) => (p.selectedHero === 'liora' && p.trial.clears === 5 && p.diff.best[1].normal.cleared && p.diff.best[2].normal.time === 415 ? true : 'progress lost')],
  ['wrong types (strings for numbers, a string for an array)', JSON.stringify(oldSave({ gold: '5000', gems: 'abc', sigils: null, energy: '12', level: '7', xp: '10', talents: { might: '3' }, pass: { xp: '1200', claimedFree: '1,2', claimedPrem: [], premium: 'no' }, chapter: { unlocked: '3', best: [] }, quests: { day: 'x', progress: { kills: '400' }, claimed: {} } })),
    (p) => (p.gold === 5000 && p.gems === 150 && Number.isInteger(p.energy) && p.energy >= 12 && p.level === 7 && p.talents.might === 3 && p.pass.xp === 1200 && Array.isArray(p.pass.claimedFree) && p.chapter.unlocked === 3 && p.pass.premium === false ? true : JSON.stringify({ gold: p.gold, gems: p.gems, energy: p.energy, level: p.level, might: p.talents.might, pass: p.pass.xp, cf: p.pass.claimedFree, un: p.chapter.unlocked }))],
  ['huge values', JSON.stringify(oldSave({ gold: 1e20, gems: 9.9e15, energy: 1e9, level: 1e6, pass: { xp: 1e12, claimedFree: [], claimedPrem: [] }, talents: { might: 1e9 }, relics: [{ uid: 'r1', type: 'crown', rarity: 'legendary', level: 1e9 }], equipped: ['r1', null, null], chapter: { unlocked: 99, selected: 42, best: {} }, heroes: { vael: { owned: true, stars: 99, shards: 1e30 } } })),
    (p) => (p.energy <= 99 && p.talents.might <= 25 && p.relics[0].level <= 10 && p.chapter.unlocked <= 6 && p.chapter.selected <= 6 && p.heroes.vael.stars <= 5 && Number.isSafeInteger(p.gold) && Number.isSafeInteger(p.heroes.vael.shards) && p.level <= 999 ? true : JSON.stringify({ e: p.energy, m: p.talents.might, rl: p.relics[0].level, u: p.chapter.unlocked, s: p.heroes.vael.stars, g: p.gold, l: p.level }))],
  ['negative values', JSON.stringify(oldSave({ gold: -500, gems: -1, energy: -5, sigils: -2 })), (p) => (p.gold === 0 && p.gems === 0 && Number.isInteger(p.energy) && p.energy >= 0 && p.sigils === 0 ? true : JSON.stringify({ g: p.gold, gm: p.gems, e: p.energy }))],
  ['unknown hero selected', JSON.stringify(oldSave({ selectedHero: 'ghost', heroes: { ...oldSave().heroes, ghost: { owned: true, stars: 3, shards: 0 } } })), (p) => p.selectedHero === 'vael' || p.selectedHero],
  ['unowned hero selected', JSON.stringify(oldSave({ selectedHero: 'mordrake' })), (p) => p.selectedHero === 'vael' || p.selectedHero],
  ['unknown relic type and rarity, dangling and duplicate equips', JSON.stringify(oldSave({ relics: [{ uid: 'r1', type: 'bogus', rarity: 'mythic', level: 1 }, { uid: 'r2', type: 'crown', rarity: 'rare', level: 2 }, { uid: 'r3', type: 'eye', rarity: 'mythic', level: 1 }], equipped: ['r1', 'r2', 'r2', 'rX'] })),
    (p) => (p.relics.length === 1 && p.relics[0].uid === 'r2' && JSON.stringify(p.equipped) === '[null,"r2",null]' ? true : JSON.stringify({ relics: p.relics.map((r) => r.uid), eq: p.equipped }))],
  ['relic ids beyond relicSeq', JSON.stringify(oldSave({ relicSeq: 2 })), (p) => p.relicSeq >= 4 || `relicSeq ${p.relicSeq}`],
  ['locked difficulty selection', JSON.stringify(oldSave({ diff: { sel: { 1: 'torment', 2: 'insane', 3: 'nightmare' }, best: {} } })), (p, x) => (x.diffSel === 'nightmare' && x.runDiff === 'nightmare' ? true : JSON.stringify(x))],
];
async function savePhase() {
  const rows = [];
  await pool(SAVE_CASES, JOBS, async ([name, raw, expect]) => {
    const { ctx, page, errors } = await openPage({ vp: [390, 844], raw });
    let x = {}, verdict;
    try {
      x = await page.evaluate(async () => {
        const S = window.__sweep, a = window.__soulswarm, q = (s) => document.querySelector(s), out = {};
        out.p = JSON.parse(JSON.stringify(a.profile)); // as loaded, before this check plays anything
        out.home = !!q('.btn-battle') && q('.hm').innerText.trim().length > 0;
        out.backup = !!localStorage.getItem('soulswarm.save.v1.corrupt');
        const D = await import('/src/meta/difficulty.js'); out.diffSel = D.selectedDifficulty(a.profile, 1);
        for (const t of ['heroes', 'altar', 'shop', 'pass', 'battle']) { q(`[data-nav="${t}"]`).click(); await S.settle(1500); }
        q('[data-nav="heroes"]').click(); for (const s of ['relics', 'talents', 'heroes']) { q(`[data-sub="${s}"]`).click(); await S.sleep(50); }
        q('.hcard')?.click(); await S.sleep(50); await S.reset();
        q('[data-act="quests"]').click(); await S.sleep(50); await S.reset();
        a.profile.energy = Math.max(a.profile.energy, 30); a.profile.chapter.selected = 1; a.meta.refresh();
        q('.hm [data-act="battle"]').click(); out.ran = !!a.run; out.runDiff = a.run && a.run.diff.id;
        if (a.run) { a.run.player.hurt = () => {}; a.run.end(false); (await S.waitFor('.modal-results .btn-primary'))?.click(); await S.sleep(200); out.back = !a.run && !a.meta.el.hidden; }
        out.inv = S.inv();
        const saved = JSON.parse(localStorage.getItem('soulswarm.save.v1') || 'null');
        out.savedOk = !!saved && typeof saved.gold === 'number';
        return out;
      });
      const e = expect(x.p, x);
      verdict = e === true && x.home && x.ran && x.back && x.savedOk && !x.inv.length && !errors.length ? true : `${e === true ? '' : e} home=${x.home} ran=${x.ran} back=${x.back} saved=${x.savedOk} inv=${x.inv} errors=${errors[0] || 0}`;
    } catch (e) { verdict = `harness: ${e.message.split('\n')[0]} ${errors[0] || ''}`; }
    rows.push({ name, verdict, home: x.home, ran: x.ran });
    await ctx.close();
  });
  report.save = rows;
  for (const [name] of SAVE_CASES) { const r = rows.find((x) => x.name === name); check(`save: ${name} boots, every tab renders, a run plays and the data is kept or repaired`, r.verdict === true, r.verdict === true ? '' : r.verdict); }
}

// ---------------------------------------------------------------- 5. lifecycle
async function lifePhase() {
  const P = await profiles();
  const audioSpy = () => { const AC = window.AudioContext; if (!AC) return; window.__actx = []; window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__actx.push(this); } }; };
  const setHidden = (page, hidden) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
  const { ctx, page, errors } = await (async () => { const o = await openPage({ vp: [390, 844], seed: P.mid }); await o.ctx.addInitScript(audioSpy); await o.page.reload({ waitUntil: 'domcontentloaded' }); await o.page.waitForFunction(() => window.__soulswarm && window.__soulswarm.meta && !document.getElementById('boot'), null, { timeout: 30000 }); return o; })();
  await page.touchscreen.tap(200, 420); await page.waitForTimeout(800); // the first gesture starts audio
  const L = {};
  L.home = await page.evaluate(async () => { const p = window.__soulswarm.profile; p.gold += 1; window.__soulswarm.meta.refresh(); return { ctx: (window.__actx || []).length, state: window.__actx?.[0]?.state }; });
  await setHidden(page, true); await page.waitForTimeout(400);
  L.hidden = await page.evaluate(() => ({ state: window.__actx?.[0]?.state, saved: JSON.parse(localStorage.getItem('soulswarm.save.v1')).gold === window.__soulswarm.profile.gold }));
  await setHidden(page, false); await page.waitForTimeout(600);
  L.visible = await page.evaluate(() => ({ state: window.__actx?.[0]?.state }));
  check('lifecycle (home): hidden saves at once and suspends audio; visible resumes it', L.home.ctx === 1 && L.hidden.state === 'suspended' && L.hidden.saved && L.visible.state === 'running', JSON.stringify(L));
  // mid-run: hidden pauses (pause sheet), audio suspends; visible keeps the pause sheet until Resume
  L.run = await page.evaluate(async () => { const a = window.__soulswarm; a.profile.energy = 30; a.startRun(1); a.run.player.hurt = () => {}; await window.__sweep.sleep(800); return { t: a.run.time }; });
  await setHidden(page, true); await page.waitForTimeout(500);
  L.runHidden = await page.evaluate(() => { const r = window.__soulswarm.run; return { paused: r.paused, sheet: !!document.querySelector('.modal-back .btn-danger'), state: window.__actx?.[0]?.state, t: r.time }; });
  await page.waitForTimeout(600);
  await setHidden(page, false); await page.waitForTimeout(600);
  L.runVisible = await page.evaluate(() => { const r = window.__soulswarm.run; return { paused: r.paused, t: r.time, state: window.__actx?.[0]?.state, sheets: document.querySelectorAll('#ui > .modal-back').length }; });
  check('lifecycle (run): hidden auto-pauses with the pause sheet and suspends audio; visible resumes audio and stays paused', L.runHidden.paused && L.runHidden.sheet && L.runHidden.state === 'suspended' && L.runVisible.paused && L.runVisible.t === L.runHidden.t && L.runVisible.state === 'running' && L.runVisible.sheets === 1, JSON.stringify({ h: L.runHidden, v: L.runVisible }));
  // hidden during a level-up and during the revive countdown
  L.special = await page.evaluate(async () => {
    const a = window.__soulswarm, S = window.__sweep, setH = (h) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); document.dispatchEvent(new Event('visibilitychange')); };
    await S.reset(); a.profile.energy = 30; a.startRun(1); const r = a.run; r.player.hurt = () => {}; await S.sleep(300);
    r.levelQueue = 1; r.showLevelUp(); setH(true); await S.sleep(200); const lvl = { modals: document.querySelectorAll('#ui > .modal-back').length, cards: document.querySelectorAll('.lvl-back .card').length }; setH(false);
    document.querySelector('.lvl-back .card')?.click(); await S.sleep(500); document.querySelector('.lvl-back .card')?.click();
    delete r.player.hurt; r.player.invuln = 0; r.player.hurt(1e9); await S.waitFor('.rev'); await S.sleep(300);
    const n0 = document.querySelector('.rev b')?.textContent; setH(true); await S.sleep(2300); const n1 = document.querySelector('.rev b')?.textContent; setH(false); await S.sleep(1200); const n2 = document.querySelector('.rev b')?.textContent;
    return { lvl, revive: [n0, n1, n2] };
  });
  check('lifecycle: hidden during a level-up keeps the cards (no pause sheet on top); the revive countdown waits while hidden', L.special.lvl.modals === 0 && L.special.lvl.cards === 3 && L.special.revive[0] === L.special.revive[1] && +L.special.revive[2] < +L.special.revive[1], JSON.stringify(L.special));
  // rapid start / exit
  L.rapid = await page.evaluate(async () => {
    const a = window.__soulswarm, S = window.__sweep, p = a.profile; await S.reset(); const m0 = { ...a.engine.renderer.info.memory };
    let spent = 0;
    for (let i = 0; i < 20; i++) { p.energy = 30; const e = p.energy; a.startRun(1 + (i % 2)); spent += e - p.energy; if (i % 3 === 0) await S.sleep(i * 3); a.exitRun(); if (i % 4 === 0) await new Promise((r) => requestAnimationFrame(r)); }
    const m1 = a.engine.renderer.info.memory;
    return { spent, huds: document.querySelectorAll('#ui > .hud').length, modals: document.querySelectorAll('#ui > .modal-back').length, menu: !a.meta.el.hidden, run: !!a.run, geo: [m0.geometries, m1.geometries], tex: [m0.textures, m1.textures], inv: S.inv() };
  });
  check('lifecycle: 20 rapid start/exit cycles charge 5 energy each and leave no HUD, run, modal or GPU leak', L.rapid.spent === 100 && !L.rapid.huds && !L.rapid.modals && L.rapid.menu && !L.rapid.run && L.rapid.geo[1] <= L.rapid.geo[0] + 2 && L.rapid.tex[1] <= L.rapid.tex[0] + 2 && !L.rapid.inv.length, JSON.stringify(L.rapid));
  check('lifecycle: no errors', !errors.length, errors.slice(0, 2).join(' | '));
  await ctx.close();
  // reload mid-run (and a trial), and reload right after a claim: the GDD's rule is that starting spends (5 energy, the day's
  // trial attempt) and an unfinished run pays nothing
  const reload = async (setup, wait, arg = null) => {
    const o = await openPage({ vp: [390, 844], seed: P.mid });
    const b = await o.page.evaluate(setup, arg);
    await o.page.waitForTimeout(wait);
    await o.page.reload({ waitUntil: 'domcontentloaded' });
    await o.page.waitForFunction(() => window.__soulswarm && window.__soulswarm.meta && !document.getElementById('boot'), null, { timeout: 30000 });
    const a = await o.page.evaluate(() => { const A = window.__soulswarm, p = A.profile; return { energy: p.energy, runs: p.stats.runs, gold: p.gold, trial: p.trial.done, streak: p.login.streak, run: !!A.run, home: !A.meta.el.hidden && !!document.querySelector('.btn-battle') }; });
    await o.ctx.close();
    return { b, a, errors: o.errors };
  };
  const startRun = (opts) => { const A = window.__soulswarm, p = A.profile; p.energy = 20; A.meta.refresh(); const b = { energy: p.energy, runs: p.stats.runs, gold: p.gold }; A.startRun(opts.trial ? 0 : 1, opts); return b; };
  const r1 = await reload(startRun, 1500, {}), r2 = await reload(startRun, 30, {}), r3 = await reload(startRun, 30, { trial: true });
  const r4 = await reload(() => { const A = window.__soulswarm; A.profile.login = { streak: 2, lastClaim: null }; document.querySelector('[data-act="login"]').click(); document.querySelector('.mm-login [data-act="claim"]').click(); return { streak: 3 }; }, 20);
  L.reload = { r1, r2, r3, r4 };
  check('lifecycle: reload mid-run keeps the 5 energy spent, records no run and returns to the home screen', r1.a.energy === 15 && r1.a.runs === r1.b.runs && r1.a.gold === r1.b.gold && !r1.a.run && r1.a.home && !r1.errors.length, JSON.stringify(r1));
  check('lifecycle: reload 30 ms after BATTLE still keeps the energy spent (the save is flushed on unload)', r2.a.energy === 15 && !r2.errors.length, JSON.stringify(r2));
  check('lifecycle: reload mid-trial keeps the day\'s attempt used', r3.a.trial === true && r3.a.energy === 20 && !r3.errors.length, JSON.stringify(r3));
  check('lifecycle: reload right after a claim keeps it', r4.a.streak === 3, JSON.stringify(r4));
  report.life = L;
}

// ---------------------------------------------------------------- run
const t0 = Date.now();
if (ONLY.includes('layout')) await layoutSweep();
if (ONLY.includes('fuzz')) await fuzzPhase();
if (ONLY.includes('economy')) await economyPhase();
if (ONLY.includes('save')) await savePhase();
if (ONLY.includes('life')) await lifePhase();

writeFileSync(join(OUT, 'report.json'), JSON.stringify({ ...report, results }, null, 1));
await browser.close();
if (server) server.kill();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed in ${Math.round((Date.now() - t0) / 1000)} s · report: ${join(OUT, 'report.json')}`);
process.exit(failed.length ? 1 : 0);
