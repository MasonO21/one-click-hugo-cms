// 30-second trailer made from real gameplay.
//   node tools/trailer/make_trailer.js [ad|preview|all]
// ad      -> appstore/trailer/night-precinct-trailer-1080x1920.mp4  (social ads: TikTok, Reels, Shorts, Meta, Apple Search Ads video)
// preview -> appstore/trailer/app-preview-886x1920.mp4              (App Store app preview, iPhone 6.5"/6.9"; no price or "free" claims)
// The game runs with a virtual clock and is captured frame by frame (30 fps), so every run gives the same video.
// Overlays are drawn on top of the running game; nothing in the footage is mocked up.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const { launch } = require(path.join(ROOT, 'game', 'tests', 'lib.js'));
const FPS = 30, DUR = 30;
const OUT = path.join(ROOT, 'appstore', 'trailer');
const TMP = process.env.TRAILER_TMP || path.join(require('os').tmpdir(), 'np_trailer');
const which = process.argv[2] || 'all';
const ffmpeg = () => { try { return execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim(); } catch (e) { return 'ffmpeg'; } };

const VERSIONS = {
  ad: { vw: 432, vh: 768, dsf: 2.5, file: 'night-precinct-trailer-1080x1920.mp4', cta: true },
  preview: { vw: 443, vh: 960, dsf: 2, file: 'app-preview-886x1920.mp4', cta: false },
};

/* Everything below runs inside the page. t is seconds since the trailer started. */
function director() {
  const N = window.__np, S = () => N.S();
  const $ = s => document.querySelector(s);
  const fx = document.createElement('div'); fx.id = 'tfx';
  fx.innerHTML = `
  <style>
    #tfx{position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;font-family:'Big Shoulders Display',Impact,sans-serif}
    #tfx .black{position:absolute;inset:0;background:#03040b}
    #tfx .siren{position:absolute;inset:-20%;mix-blend-mode:screen}
    #tfx .flash{position:absolute;inset:0;background:#fff;opacity:0}
    #tfx .vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%)}
    #tfx .band{position:absolute;left:0;right:0;top:57%;height:26%;background:linear-gradient(180deg,transparent,rgba(3,4,14,.82) 22%,rgba(3,4,14,.82) 78%,transparent);opacity:0}
    #tfx .slam{position:absolute;left:0;right:0;text-align:center;font-weight:900;text-transform:uppercase;letter-spacing:.02em;line-height:.9;color:#fff;
      -webkit-text-stroke:3px #0a0c1c;paint-order:stroke fill;text-shadow:0 6px 0 #0a0c1c,0 0 28px rgba(0,0,0,.6);opacity:0;white-space:nowrap}
    #tfx .slam.big{font-size:96px}#tfx .slam.mid{font-size:64px}#tfx .slam.sm{font-size:34px;letter-spacing:.08em}
    #tfx .gold{color:#ffc53d}#tfx .red{color:#ff3d55}#tfx .blue{color:#7ce8ff}#tfx .orange{color:#ff8a2b}#tfx .teal{color:#3ef0cf}
    #tfx .tap{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:5px solid rgba(255,255,255,.95);box-shadow:0 0 18px rgba(255,255,255,.7);opacity:0}
    #tfx .end{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:18px;text-align:center;opacity:0;background:radial-gradient(ellipse at 50% 40%,#18246a 0%,#070a19 70%)}
    #tfx .end img{width:220px;height:220px;border-radius:48px;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 3px rgba(255,197,61,.35)}
    #tfx .end h1{margin:0;font-size:78px;font-weight:900;letter-spacing:.03em;color:#fff;line-height:.9}
    #tfx .end h2{margin:0;font-size:30px;font-weight:800;letter-spacing:.22em;color:#ffc53d}
    #tfx .end .cta{margin-top:10px;font-size:40px;font-weight:900;letter-spacing:.1em;color:#07091a;background:#ffc53d;padding:10px 28px;border-radius:12px;box-shadow:0 6px 0 #a5760a}
    #tfx .end .bar{height:10px;width:100%;position:absolute;top:0;background:repeating-linear-gradient(90deg,#ff3d55 0 40px,#3d8bff 40px 80px)}
    #tfx .legal{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);white-space:nowrap;font:600 13px 'Barlow Semi Condensed',sans-serif;color:#fff;background:rgba(3,4,14,.82);padding:5px 10px;border-radius:7px;opacity:0}
  </style>
  <div class="black"></div><div class="siren"></div><div class="band"></div><div class="vig"></div><div class="flash"></div>
  <div class="end"><div class="bar"></div><img alt=""><h1>NIGHT PRECINCT</h1><h2>POLICE &middot; FIRE &middot; EMS</h2><div class="cta"></div></div>
  <div class="legal"></div>`;
  document.body.appendChild(fx);
  /* a text slam, shrunk if needed so it never runs off the screen */
  const el = (cls, txt, top) => { const d = document.createElement('div'); d.className = 'slam ' + cls; d.innerHTML = txt; d.style.top = top; fx.appendChild(d);
    const maxW = innerWidth * .92; d.style.width = 'max-content'; d.style.left = '50%'; d.style.right = 'auto'; d.style.marginLeft = -(d.offsetWidth / 2) + 'px';
    if (d.offsetWidth > maxW) { d.style.fontSize = (parseFloat(getComputedStyle(d).fontSize) * maxW / d.offsetWidth) + 'px'; d.style.marginLeft = -(d.offsetWidth / 2) + 'px'; }
    return d; };
  const Q = sel => fx.querySelector(sel);
  const app = $('#app');
  const BEAT = 0.4;

  /* text slams: [start, end, element] */
  const texts = [
    [0.4, 3.2, el('big', 'THE CITY', '30%')], [1.2, 3.2, el('big red', 'NEVER', '42%')], [2.0, 3.2, el('big blue', 'SLEEPS', '54%')],
    [3.2, 4.0, el('big', 'TAP.', '62%')], [4.0, 4.8, el('big gold', 'ARREST.', '62%')], [4.8, 5.6, el('big', 'GET PAID.', '62%')], [5.6, 6.4, el('big blue', 'COMBO x3!', '62%')],
    [6.4, 8.0, el('mid', 'HIRE YOUR<br><span class="gold">WHOLE FORCE</span>', '60%')], [8.0, 9.6, el('mid', 'WATCH THE<br><span class="gold">CASH ROLL IN</span>', '60%')],
    [9.6, 11.2, el('mid red', 'CHASE<br><span style="color:#fff">BOUNTIES</span>', '60%')],
    [11.2, 12.8, el('mid gold', 'CRACK<br><span style="color:#fff">CRATES</span>', '8%')],
    [12.8, 14.4, el('mid', 'RISE THROUGH<br><span class="gold">12 RANKS</span>', '8%')],
    [14.4, 15.2, el('big', 'NEW', '64%')], [14.8, 16.0, el('big gold', 'WORLDS', '75%')],
    [16.0, 19.2, el('mid orange', 'EMBER<br><span style="color:#fff">STATION</span>', '60%')],
    [19.2, 20.8, el('mid teal', 'GOLDEN<br><span style="color:#fff">HOUR</span>', '60%')], [20.8, 22.4, el('mid red', 'HARD<br><span style="color:#fff">MODE</span>', '60%')],
    [22.4, 23.2, el('big gold', '3 WORLDS', '60%')], [23.2, 24.0, el('big', '48 CREWS', '60%')], [24.0, 24.8, el('big blue', '36 RANKS', '60%')], [24.8, 25.6, el('big gold', 'ENDLESS<br>IDLE CASH', '58%')],
  ];
  const beats = [3.2, 4.0, 4.8, 5.6, 6.4, 8.0, 9.6, 11.2, 12.8, 14.4, 16.0, 19.2, 20.8, 22.4, 23.2, 24.0, 24.8, 25.6];
  const taps = [];
  const tapFx = (x, y, t) => { const d = document.createElement('div'); d.className = 'tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; fx.appendChild(d); taps.push({ d, t }); };
  const btnTap = t => { const b = $('#arrestBtn'), r = b.getBoundingClientRect(); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); setTimeout(() => b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })), 60); tapFx(r.left + r.width * (.35 + Math.random() * .3), r.top + r.height * .55, t); };
  const clickEl = (e, t) => { if (!e) return; const r = e.getBoundingClientRect(); e.click(); tapFx(r.left + r.width / 2, r.top + r.height / 2, t); };
  const closeM = () => { const m = $('#modal-root'); m.classList.remove('on'); m.innerHTML = ''; app.inert = false; };
  let last = -1, tapAcc = 0, fundsBase = 0;
  const sr = $('#sceneWrap').getBoundingClientRect(), camX = sr.left + sr.width / 2, camY = sr.top + sr.height / 2;
  const ZOOMS = [[9.6, 11.2, 1.45], [16.0, 17.6, 1.4], [19.2, 20.8, 1.4]];
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const cam = t => { let z = 1; for (const [a, b, k] of ZOOMS) { if (t >= a - .01 && t < b) z = 1 + (k - 1) * Math.min(ease((t - a) / .25), ease((b - t) / .25)); } return z; };
  const once = (at, t, f) => { if (last < at && t >= at) f(); };

  const mid = (w, extra) => { const s = S(); Object.assign(s, extra || {}); N.recalc(); };
  window.__trailer = (t, dt) => {
    const s = S();
    /* ---------- actions ---------- */
    once(0, t, () => { closeM(); N.showTab('hq'); });
    const tapping = (t >= 3.2 && t < 6.4) || (t >= 16.0 && t < 18.4) || (t >= 19.2 && t < 21.6) || (t >= 22.4 && t < 25.4);
    if (tapping) { tapAcc += dt * (t < 6.4 ? 11 : 9); while (tapAcc >= 1) { tapAcc--; btnTap(t); } }
    once(6.4, t, () => { N.showTab('roster'); fundsBase = s.funds; });
    if (t >= 6.4 && t < 9.6) { const p = (t - 6.4) / 3.2; s.funds = fundsBase * Math.pow(10, 3.2 * p); s.run = Math.max(s.run, s.funds); s.life = Math.max(s.life, s.funds); }
    [6.6, 7.0, 7.4, 7.8, 8.2, 8.6, 9.0].forEach((at, k) => once(at, t, () => { const g = [...document.querySelectorAll('#panel .gen .buy:not([disabled])')]; clickEl(g[k % Math.max(1, g.length)], t); N.S().owned[[8, 9, 10, 11, 12, 7, 6][k]] += 25; N.recalc(); }));
    once(9.6, t, () => { N.showTab('hq'); N.spawnFugitive(); const f = $('.fugitive'); if (f) f.style.setProperty('--dur', '2.6s'); });
    once(10.4, t, () => { const f = $('.fugitive'); if (f) { const r = f.getBoundingClientRect(), R = Math.random; Math.random = () => 0.97; f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); Math.random = R; tapFx(r.left + r.width / 2, r.top + r.height / 2, t); } });
    once(11.6, t, () => { const R = Math.random; Math.random = () => 0.93; s.crates.legend = 2; s.pity = 0; N.openCrateUI('legend'); Math.random = R; });
    once(12.8, t, () => { closeM(); s.run = 1e40; s.life = Math.max(s.life, 1e40); N.recalc(); N.promoteModal(); });
    once(13.4, t, () => { const b = document.querySelector('#modal-root [data-x=go]'); clickEl(b, t); });
    once(13.6, t, () => { const s2 = S(); s2.owned = [60, 45, 30, 20, 12, 8, 4, 2, 25, 25, 25, 25, 25, 0, 0, 0]; N.recalc(); });
    once(14.2, t, () => closeM());
    once(14.4, t, () => { closeM(); s.done.police = true; N.doTravel('fire'); const f = S(); f.owned = [60, 45, 30, 22, 14, 9, 6, 4, 3, 2, 1, 1, 1, 0, 0, 0]; f.funds = 4.2e9; f.run = 4.2e9; f.life = 9e9; f.promos = 3; f.boosts.dbl = 0; N.recalc(); N.showTab('hq'); });
    once(16.0, t, () => closeM());
    once(19.2, t, () => { const f = S(); f.done.fire = true; f.ws.ems = f.ws.ems || {}; N.doTravel('ems'); const e = S(); e.owned = [55, 40, 26, 20, 12, 8, 6, 5, 3, 2, 1, 1, 1, 1, 0, 0]; e.funds = 7.7e8; e.run = 7.7e8; e.life = 2e9; e.promos = 2; N.recalc(); N.showTab('hq'); });
    once(19.2, t, () => closeM());
    once(22.4, t, () => { N.addBoost('spree', 12); fundsBase = S().funds; });
    if (t >= 22.4 && t < 25.6) { const e = S(), p = (t - 22.4) / 3.2; e.funds = fundsBase * Math.pow(10, 5 * p); e.run = e.funds; }
    once(25.6, t, () => closeM());

    /* ---------- overlay ---------- */
    const black = Q('.black'), siren = Q('.siren'), flash = Q('.flash'), band = Q('.band'), end = Q('.end'), legal = Q('.legal');
    black.style.opacity = t < 3.2 ? 1 : 0;
    const bi = Math.floor(t / BEAT), bp = (t % BEAT) / BEAT;
    siren.style.opacity = t < 3.2 ? 1 : 0;
    siren.style.background = `radial-gradient(circle at ${bi % 2 ? 80 : 20}% 30%, ${bi % 2 ? 'rgba(61,139,255,.55)' : 'rgba(255,61,85,.55)'} 0%, transparent 55%)`;
    let fl = 0; for (const b of beats) { const d = t - b; if (d >= 0 && d < .25) fl = Math.max(fl, (1 - d / .25) * (b === 3.2 || b === 16.0 || b === 25.6 ? .9 : .35)); }
    if (t >= 2.8 && t < 3.2) fl = Math.max(fl, (t - 2.8) / .4 * .8);
    if (t >= 14.4 && t < 16.0 && t > 15.7) fl = Math.max(fl, (t - 15.7) / .3 * .7);
    flash.style.opacity = fl.toFixed(3);
    let bandOn = 0;
    for (const [a, b, d] of texts) {
      const on = t >= a && t < b, k = t - a;
      if (!on) { d.style.opacity = 0; continue; }
      if (t >= 3.2 && d.style.top !== '8%') bandOn = 1;
      const sc = k < .12 ? 1.9 - (k / .12) * .9 : 1 + Math.max(0, .03 - (k - .12) * .06);
      const out = b - t < .08 ? (b - t) / .08 : 1;
      d.style.opacity = out; d.style.transform = `scale(${sc.toFixed(3)}) rotate(${(k < .12 ? -4 * (1 - k / .12) : 0).toFixed(2)}deg)`;
    }
    band.style.opacity = bandOn;
    // punch-in zoom and shake on hits
    let sh = 0; for (const b of beats) { const d = t - b; if (d >= 0 && d < .18) sh = Math.max(sh, 1 - d / .18); }
    app.style.transformOrigin = `${camX}px ${camY}px`;
    app.style.transform = t < 25.6 ? `translate(${(Math.sin(t * 90) * 5 * sh).toFixed(2)}px,${(Math.cos(t * 77) * 4 * sh).toFixed(2)}px) scale(${(cam(t) * (1 + .035 * sh)).toFixed(4)})` : '';
    const toasts = $('#toasts'); toasts.style.opacity = (t >= 10.3 && t < 11.2) || (t >= 13.4 && t < 14.4) ? 1 : 0;
    for (const tp of taps) { const k = t - tp.t; tp.d.style.opacity = k < .35 ? (1 - k / .35).toFixed(3) : 0; tp.d.style.transform = `scale(${(0.5 + k * 2.2).toFixed(3)})`; }
    const ek = t - 25.6;
    end.style.opacity = ek < 0 ? 0 : Math.min(1, ek / .15);
    const img = end.querySelector('img'), h1 = end.querySelector('h1'), h2 = end.querySelector('h2'), cta = end.querySelector('.cta');
    const pop = (e, at) => { const k = ek - at; e.style.opacity = k < 0 ? 0 : 1; e.style.transform = `scale(${k < 0 ? 0 : k < .15 ? (1.6 - k / .15 * .6).toFixed(3) : 1})`; };
    pop(img, 0); pop(h1, .4); pop(h2, .8); pop(cta, 1.2); if (!cta.textContent) cta.style.display = 'none';
    legal.style.opacity = t >= 25.6 ? 1 : (t >= 3.2 ? .9 : 0);
    last = t;
  };
}

async function render(name) {
  const V = VERSIONS[name];
  const dir = path.join(TMP, name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const build = path.join(TMP, 'game.html');
  execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native', '--debug', '--out', build], { stdio: 'ignore' });
  const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'ios', 'NightPrecinct', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png')).toString('base64');
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: V.vw, height: V.vh }, deviceScaleFactor: V.dsf });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-02T21:47:00') });
  await p.addInitScript(() => { try { localStorage.setItem('night-precinct-v2', JSON.stringify({ v: 3, sound: false, music: false, haptics: false, starter: true, calmSet: true, tut: 99 })); } catch (e) { } });
  await p.goto('file://' + build);
  await p.clock.runFor(800);
  await p.evaluate(({ icon, cta }) => {
    const N = window.__np, s = N.S();
    s.sound = false; s.music = false; s.tut = 99; s.starter = true; s.perm.auto = 0; s.autoOn = false; s.badges = 1840;
    s.owned = [60, 45, 30, 20, 12, 8, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0]; s.funds = 8.4e9; s.run = 1.6e10; s.life = 2.5e10; s.promos = 4; s.medals = 180;
    N.recalc(); N.checkAch();
    const css = document.createElement('style'); css.textContent = '[data-chip=buyauto],[data-chip=starter]{display:none!important} #toasts{opacity:.95}';
    document.head.appendChild(css);
    window.__icon = icon; window.__cta = cta;
  }, { icon, cta: V.cta });
  await p.clock.runFor(6000);   // let the street fill up
  await p.evaluate(director.toString().replace(/^function director\(\) \{/, '(() => {').replace(/\}$/, '})()'));
  await p.evaluate(() => {
    document.querySelector('#tfx .end img').src = window.__icon;
    document.querySelector('#tfx .end .cta').textContent = window.__cta ? 'FREE TO PLAY' : '';
    document.querySelector('#tfx .legal').textContent = 'Actual game footage. In-game purchases (includes random items).';
    document.getElementById('toasts').innerHTML = '';
    window.__vt = 0; window.__animStart = new WeakMap();
  });
  const frames = DUR * FPS;
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    await p.evaluate(({ t, dt }) => {
      window.__trailer(t, dt);
      /* CSS animations follow the virtual clock too */
      const now = t * 1000;
      for (const a of document.getAnimations()) { if (!window.__animStart.has(a)) window.__animStart.set(a, now); try { a.pause(); a.currentTime = now - window.__animStart.get(a); } catch (e) { } }
    }, { t, dt: 1 / FPS });
    await p.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
    await p.clock.runFor(1000 / FPS);
    if (f % 150 === 0) process.stdout.write(`${name}: frame ${f}/${frames}\n`);
  }
  await b.close();
  const wav = path.join(TMP, 'music.wav');
  execFileSync('python3', [path.join(__dirname, 'music.py'), wav], { stdio: 'ignore' });
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, V.file);
  execFileSync(ffmpeg(), ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.0', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
  console.log('wrote', out);
}

(async () => {
  for (const n of which === 'all' ? ['ad', 'preview'] : [which]) await render(n);
})();
