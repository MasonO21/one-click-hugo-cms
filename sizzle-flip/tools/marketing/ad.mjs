// Video ad and App Store app preview, recorded frame by frame from the real game (needs the dev server on :8123):
//   node tools/marketing/ad.mjs [social] [preview]
//   social  → store/video/sizzle-flip-ad-1080x1920.mp4    30 s, 1080×1920: TikTok / Reels / Shorts, YouTube for
//                                                          the Google Play promo video, any vertical ad slot
//   preview → store/video/app-preview-886x1920.mp4       29.5 s, 886×1920: App Store app preview (iPhone 6.9"/6.5"),
//                                                          only in-app footage and no other stores mentioned
// The game runs on a fake clock (tools/marketing/kit.mjs) so every frame is captured at exactly 30 fps; levels are
// played along their verified routes with the aim drag shown. The soundtrack is the game's own synthesized music and
// sound effects, rendered offline at the moments they happened in the footage.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { launch, openGame, untilDue, URL as GAME_URL } from './kit.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const FPS = 30, MS = 1000 / FPS;
const VARIANTS = {
  social: { game: { width: 360, height: 640, dpr: 3 }, seconds: 30, out: 'store/video/sizzle-flip-ad-1080x1920.mp4', capSize: 40,
    endLine: 'Free on the App Store<br>&amp; Google Play' },
  preview: { game: { width: 443, height: 960, dpr: 2 }, seconds: 29.5, out: 'store/video/app-preview-886x1920.mp4', capSize: 46, endLine: '' },
};
const SONG = 'toyroom';

async function make(browser, name) {
  const V = VARIANTS[name];
  const total = Math.round(V.seconds * FPS);
  const dir = `/tmp/sizzle-ad-${name}`;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const sfx = [];
  const snap = async (page) => { await page.screenshot({ path: `${dir}/f${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 }); n++; };

  // caption with a little pop-in; called every frame with the frame index since it was set
  let cap = null, capAt = 0, capTop = '17%';
  const setCap = (html, top = '17%') => { cap = html; capAt = n; capTop = top; };
  const drawCap = async (page) => {
    const k = n - capAt, s = cap ? (k < 3 ? 0.55 + 0.25 * k : k < 5 ? 1.12 - 0.06 * (k - 3) : 1) : 1;
    await page.evaluate(([html, s, size, top]) => window.__mk.caption(html, { top, fontSize: size + 'px', transform: `scale(${s})` }), [cap || '', s, V.capSize, capTop]);
  };
  const scenes = [];
  // hideWin: the level-complete card stays hidden (the ad cuts away right after each landing)
  const scene = async (page, fn, { hideWin = true, label = '' } = {}) => {
    if (hideWin) await page.addStyleTag({ content: '#scr-win { display: none !important; }' });
    const start = n;
    const t0 = await page.evaluate(() => performance.now()), base = n / FPS;
    const pending = sfx.length;
    await fn();
    const sounds = await page.evaluate((t0) => window.__mk.sounds.filter(s => s.t >= t0), t0);
    for (const s of sounds) { const t = base + (s.t - t0) / 1000; if (t < (n - 1) / FPS) sfx.push({ ...s, t }); }
    await page.close();
    scenes.push(`${label || 'scene'} ${(start / FPS).toFixed(1)}–${(n / FPS).toFixed(1)} s`);
    return sfx.length - pending;
  };
  const rec = async (page, count, each) => { for (let i = 0; i < count && n < total; i++) { if (each) await each(i); await drawCap(page); await snap(page); await page.clock.runFor(MS); } };
  // one recorded shot: aim (drag animated), hold, release, then `after` frames
  // win: instead of a fixed `after`, keep recording until the level is won, then `win` more frames
  const shot = async (page, { aim = 14, hold = 4, after = 40, win, each } = {}) => {
    let i = 0;
    await rec(page, aim, async () => { await page.evaluate((k) => window.__mk.aim(k), (i + 1) / aim); if (each) await each(i); i++; });
    await rec(page, hold, async () => { if (each) await each(i); i++; });
    await page.evaluate(() => window.__mk.release());
    if (win === undefined) { await rec(page, after, async () => { if (each) await each(i); i++; }); return; }
    for (let k = 0; k < 240 && n < total && (await page.evaluate(() => window.__app.game.phase)) !== 'win'; k++) await rec(page, 1, async () => { if (each) await each(i); i++; });
    await rec(page, win, async () => { if (each) await each(i); i++; });
  };
  // play the first `count` shots of the route without recording
  const skip = async (page, count) => {
    for (let s = 0; s < count; s++) {
      if (!(await untilDue(page))) throw new Error('route ended early');
      await page.evaluate(() => { window.__mk.aim(1); window.__mk.release(); });
    }
    if (!(await untilDue(page))) throw new Error('route ended early');
  };
  const level = async (i, o = {}) => {
    const page = await openGame(browser, { ...V.game, save: { hotdogs: 0 } });
    await page.evaluate(([i, o]) => window.__mk.start(i, o), [i, o]);
    return page;
  };

  // 1. hook: the toaster pops the sausage into the bun (1-4)
  let page = await level(3);
  await scene(page, async () => {
    await skip(page, 1);
    setCap('Flip the sausage…');
    await shot(page, { aim: 18, hold: 8, win: 30, each: (i) => { if (i === 26 + 14) setCap('…land the <span style="color:#ffc93c">bun!</span>'); } });
  }, { label: 'toaster' });
  // 2. backyard: over the dog, into the bun (3-11)
  page = await level(50);
  await scene(page, async () => {
    await skip(page, 2);
    setCap('200 crazy levels');
    await shot(page, { aim: 16, hold: 6, win: 30 });
  }, { label: 'backyard' });
  // 3. space and heaven
  page = await level(168);
  await scene(page, async () => {
    await untilDue(page);
    setCap('10 wild worlds');
    await shot(page, { aim: 12, hold: 3, after: 66 });
  }, { label: 'space' });
  // more worlds, still under "10 wild worlds": beach ball, jack-in-the-box, rubber duck, then heaven
  for (const [lvl, at, o, label] of [[143, 2, { after: 44 }, 'beach'], [105, 3, { win: 10 }, 'toy room'], [63, 2, { win: 10 }, 'bathroom']]) {
    page = await level(lvl);
    await scene(page, async () => { await skip(page, at); await shot(page, { aim: 12, hold: 3, ...o }); }, { label });
  }
  page = await level(182);
  await scene(page, async () => { await skip(page, 2); await shot(page, { aim: 12, hold: 3, after: 48 }); }, { label: 'heaven' });
  // 4. the dog eats it (3-11, a shot of our own)
  page = await level(50, { free: true });
  await scene(page, async () => {
    for (let k = 0; k < 300 && !(await page.evaluate(() => window.__mk.ready())); k++) await page.clock.runFor(MS);
    // a shot that lands on the grass mid-screen, where a dog dashes in and grabs it (found with the solver's sim)
    await page.evaluate(() => window.__mk.force(-0.9599, 0.9));
    setCap('');
    await shot(page, { aim: 16, hold: 6, after: 72, each: (i) => { if (i === 22 + 30) setCap('Watch out<br>for the <span style="color:#ffc93c">dog!</span>'); } });
  }, { label: 'dog' });
  // 5. characters: banana, shark, rocket, then the dragon all the way to three stars
  const clips = [[0, 'banana', 0, { win: 14 }], [143, 'shark', 3, { win: 14 }], [172, 'rocket', 0, { after: 40 }]];
  let first = true;
  for (const [lvl, ch, at, o] of clips) {
    page = await level(lvl, { character: ch });
    await scene(page, async () => { await skip(page, at); if (first) setCap('130 silly<br>characters'); first = false; await shot(page, { aim: 8, hold: 2, ...o }); }, { label: ch });
  }
  page = await level(190, { character: 'dragon' });
  await scene(page, async () => {
    await skip(page, 3);
    await shot(page, { aim: 8, hold: 2, win: 0 });
    // the caption changes the moment it lands, before the level-complete card comes up under it
    setCap('600 stars<br>to <span style="color:#ffc93c">earn</span>', '6%');
    await rec(page, 24 + 84);
  }, { hideWin: false, label: 'dragon + stars' });
  // 6. end card: the title screen
  page = await openGame(browser, { ...V.game, save: {} });
  await scene(page, async () => {
    await page.evaluate(() => window.__app.toMenu('scr-title'));
    setCap('');
    await page.evaluate((line) => {
      if (!line) return;
      document.querySelectorAll('#scr-title .menu-buttons .row, #scr-title .star-total').forEach(e => { e.style.display = 'none'; });
      const d = document.createElement('div');
      d.innerHTML = line;
      d.style.cssText = 'margin-top:14px;text-align:center;font-family:Lilita One;color:#fff;font-size:30px;line-height:1.08;text-shadow:0 4px 0 #3a2216,0 -2px 0 #3a2216,2px 0 0 #3a2216,-2px 0 0 #3a2216,0 8px 14px rgba(0,0,0,.4)';
      document.querySelector('#scr-title .menu-buttons').appendChild(d);
    }, V.endLine);
    await rec(page, total - n);
  }, { label: 'end card' });
  console.log(scenes.join('\n'));
  if (n !== total) throw new Error(`recorded ${n} frames, wanted ${total} — lengthen the scenes`);

  // soundtrack: the game's music + the sound effects, rendered offline
  const wav = path.join(dir, 'audio.wav');
  const ap = await browser.newPage();
  await ap.goto(GAME_URL);
  const b64 = await ap.evaluate(async ({ seconds, song, sfx }) => {
    const { AudioEngine } = await import('/src/audio.js');
    const off = new OfflineAudioContext(2, Math.ceil(48000 * seconds), 48000);
    let now = 0;
    const ctx = new Proxy(off, { get: (t, p) => (p === 'currentTime' ? now : typeof t[p] === 'function' ? t[p].bind(t) : t[p]) });
    const RealAC = window.AudioContext;
    window.AudioContext = function () { return ctx; };
    const au = new AudioEngine();
    au.unlock();
    window.AudioContext = RealAC;
    au.playMusic(song); clearInterval(au.timer); au.timer = null;
    const events = sfx.slice().sort((a, b) => a.t - b.t);
    let e = 0;
    for (let t = 0; t < seconds; t += 0.05) {
      now = t; au.schedule();
      while (e < events.length && events[e].t <= t + 0.05) { now = events[e].t; au.play(events[e].name, events[e].o); e++; now = t; }
    }
    const buf = await off.startRendering();
    // 16-bit stereo WAV
    const L = buf.getChannelData(0), R = buf.getChannelData(1), len = L.length;
    const out = new DataView(new ArrayBuffer(44 + len * 4));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + len * 4, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
    out.setUint16(22, 2, true); out.setUint32(24, 48000, true); out.setUint32(28, 48000 * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, len * 4, true);
    for (let i = 0; i < len; i++) { out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
    const bytes = new Uint8Array(out.buffer);
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { seconds: V.seconds, song: SONG, sfx });
  await ap.close();
  fs.writeFileSync(wav, Buffer.from(b64, 'base64'));

  // loudness: two-pass EBU R128 normalisation to -16 LUFS (single-pass is imprecise on a 30 s clip)
  const meter = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr || '';
  const m = JSON.parse((meter.match(/\{[\s\S]*\}/) || ['null'])[0]);
  if (!m) throw new Error('could not measure the loudness');
  const out = path.join(root, V.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const fade = (V.seconds - 1.2).toFixed(2);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/f%05d.jpg`, '-i', wav,
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2', '-af', `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,afade=t=in:st=0:d=0.15,afade=t=out:st=${fade}:d=1.2`,
    '-t', String(V.seconds), '-movflags', '+faststart', out]);
  console.log(`${V.out}  ${n} frames, ${V.seconds} s, ${sfx.length} sound effects`);
  return { out, dir };
}

const which = process.argv.slice(2).filter(a => VARIANTS[a]);
const browser = await launch();
for (const name of which.length ? which : Object.keys(VARIANTS)) await make(browser, name);
await browser.close();
