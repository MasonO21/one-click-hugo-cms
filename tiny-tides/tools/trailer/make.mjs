// Tiny Tides — 30 s mobile trailer pipeline (npm run trailer).
//   1. bundles tools/trailer/entry.js (the game's own art code + trailer shots + synth) with esbuild into a temp dir
//   2. renders 900 deterministic frames (t = i / 30) in headless Chromium, in parallel chunks
//   3. synthesizes the music + SFX with an OfflineAudioContext (48 kHz stereo WAV)
//   4. encodes store/trailer/tiny-tides-trailer-9x16.mp4 + -16x9.mp4 with ffmpeg (loudness-normalised), poster.png,
//      and a contact sheet, then checks the outputs.
// Options: --jobs N (parallel pages, default 3)  --preview t1,t2,…  (just write preview PNGs)  --skip-frames (reuse frames)
//          --sheet <png> (contact-sheet path)  --keep (keep the temp frames)
// Env: FFMPEG=/path/to/ffmpeg (else `ffmpeg` on PATH, else the session scratchpad build), TRAILER_TMP=<temp dir>
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const flag = (k) => argv.includes(k);
const JOBS = Math.max(1, +opt('--jobs', Math.min(3, Math.max(1, os.cpus().length - 1))));
const TMP = path.resolve(process.env.TRAILER_TMP || path.join(os.tmpdir(), 'tiny-tides-trailer'));
const FRAMES_DIR = path.join(TMP, 'frames');
const OUT = path.join(root, 'store/trailer');
const SHEET = path.resolve(opt('--sheet', path.join(TMP, 'trailer-sheet.png')));
const FPS = 30, NFRAMES = 900, POSTER_T = 29.2;
const SCRATCH_FFMPEG = '/tmp/claude-0/-home-user-one-click-hugo-cms/3f30d02c-9a47-5802-a7d5-46a805d38f4d/scratchpad/ffmpeg';

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  if (fs.existsSync(SCRATCH_FFMPEG)) return SCRATCH_FFMPEG;
  throw new Error('ffmpeg not found: set FFMPEG=/path/to/ffmpeg (needs libx264 + aac)');
}
function ff(args, { quiet = true } = {}) {
  const r = spawnSync(FF, ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stderr.slice(-4000)); throw new Error(`ffmpeg failed: ${args.join(' ')}`); }
  if (!quiet) process.stderr.write(r.stderr);
  return r.stderr;
}
const log = (...a) => console.log('[trailer]', ...a);
const t0 = Date.now();
const FF = findFfmpeg();
fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- 1. bundle
const bundlePath = path.join(TMP, 'trailer-bundle.js');
await build({ entryPoints: [path.join(here, 'entry.js')], bundle: true, format: 'iife', outfile: bundlePath, logLevel: 'error', target: 'chrome120' });
const bundle = fs.readFileSync(bundlePath, 'utf8');
const fontDir = path.join(root, 'node_modules/@fontsource/fredoka/files');
const face = (w) => `@font-face{font-family:Fredoka;font-weight:${w};src:url(data:font/woff2;base64,${fs.readFileSync(path.join(fontDir, `fredoka-latin-${w}-normal.woff2`)).toString('base64')}) format('woff2')}`;
const HTML = `<!doctype html><html><head><meta charset=utf-8><style>${face(700)}${face(600)}html,body{margin:0;background:#000}</style></head><body><canvas id=c></canvas></body></html>`;

const browser = await chromium.launch({ args: ['--disable-web-security'] });
async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.error('CONSOLE', m.text()); });
  await page.setContent(HTML);
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    await Promise.all([document.fonts.load('700 100px Fredoka'), document.fonts.load('600 100px Fredoka')]);
    if (!document.fonts.check('700 100px Fredoka')) throw new Error('Fredoka failed to load');
    window.Trailer.init();
  });
  return page;
}
const dataToBuf = (d) => Buffer.from(d.slice(d.indexOf(',') + 1), 'base64');

// ---------------------------------------------------------------- preview mode
if (opt('--preview')) {
  const times = opt('--preview').split(',').map(Number);
  const dir = path.join(TMP, 'preview'); fs.mkdirSync(dir, { recursive: true });
  const page = await openPage();
  await page.evaluate(() => window.Trailer.setDebug(true));
  const files = [];
  for (const t of times) {
    const f = path.join(dir, `p-${t.toFixed(2)}.png`);
    fs.writeFileSync(f, dataToBuf(await page.evaluate((tt) => window.Trailer.frame(tt, 'image/png'), t)));
    files.push(f);
  }
  const cols = Math.min(4, files.length), rows = Math.ceil(files.length / cols), tw = 405, th = 720;
  const tiles = await Promise.all(files.map((f) => sharp(f).resize(tw, th).png().toBuffer()));
  await sharp({ create: { width: cols * tw, height: rows * th, channels: 3, background: '#111' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).png().toFile(path.join(dir, 'preview.png'));
  log('preview ->', path.join(dir, 'preview.png'));
  await browser.close();
  process.exit(0);
}

// ---------------------------------------------------------------- 2. frames
if (!flag('--skip-frames')) {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true }); fs.mkdirSync(FRAMES_DIR, { recursive: true });
  const pages = await Promise.all(Array.from({ length: JOBS }, openPage));
  const per = Math.ceil(NFRAMES / JOBS); let done = 0;
  await Promise.all(pages.map(async (page, k) => {
    for (let i = k * per; i < Math.min(NFRAMES, (k + 1) * per); i++) {
      const d = await page.evaluate((t) => window.Trailer.frame(t, 'image/jpeg', 0.95), i / FPS);
      fs.writeFileSync(path.join(FRAMES_DIR, `f${String(i).padStart(4, '0')}.jpg`), dataToBuf(d));
      if (++done % 90 === 0) log(`frames ${done}/${NFRAMES}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  }));
  await Promise.all(pages.map((p) => p.context().close()));
}
if (fs.readdirSync(FRAMES_DIR).filter((f) => f.endsWith('.jpg')).length !== NFRAMES) throw new Error('missing frames');

// ---------------------------------------------------------------- 3. music, poster
const page = await openPage();
const aud = await page.evaluate(() => window.Trailer.audio());
const wavPath = path.join(TMP, 'music.wav');
fs.writeFileSync(wavPath, Buffer.from(aud.wav, 'base64'));
log(`music: ${aud.dyn.length} capsule landings synced, raw peak ${aud.peak.toFixed(3)}, clipped samples ${aud.clip}`);
const posterPath = path.join(OUT, 'poster.png');
await sharp(dataToBuf(await page.evaluate((t) => window.Trailer.frame(t, 'image/png'), POSTER_T))).png({ compressionLevel: 9 }).toFile(posterPath);
await browser.close();

// ---------------------------------------------------------------- 4. loudness (two-pass EBU R128 loudnorm, linear) + encodes
const LN = 'I=-14:TP=-1:LRA=11';
const meas = JSON.parse(ff(['-i', wavPath, '-af', `loudnorm=${LN}:print_format=json`, '-f', 'null', '-']).match(/\{[\s\S]*?\}/g).pop());
const normPath = path.join(TMP, 'music-norm.wav');
ff(['-y', '-i', wavPath, '-af', `loudnorm=${LN}:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true`, '-ar', '48000', '-c:a', 'pcm_s16le', normPath]);
log(`loudness in: ${meas.input_i} LUFS / ${meas.input_tp} dBTP -> normalised (${meas.normalization_type})`);

const V9 = path.join(OUT, 'tiny-tides-trailer-9x16.mp4'), V16 = path.join(OUT, 'tiny-tides-trailer-16x9.mp4');
const COLOR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const X264 = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-tune', 'animation', '-crf', '20', '-g', '60', '-bf', '2', '-r', String(FPS), ...COLOR];
const AAC = ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2'];
const toTv = 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709:flags=lanczos';
const frameIn = ['-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%04d.jpg')];
ff(['-y', ...frameIn, '-i', normPath, '-map', '0:v:0', '-map', '1:a:0', '-vf', `${toTv},format=yuv420p`, ...X264, '-maxrate', '3800k', '-bufsize', '7600k', ...AAC, '-t', '30', '-movflags', '+faststart', V9]);
log('encoded', path.relative(root, V9));
ff(['-y', ...frameIn, '-i', normPath, '-filter_complex',
  `[0:v]${toTv},split=2[a][b];[a]scale=1920:-2,crop=1920:1080:0:(ih-1080)/2,gblur=sigma=38,eq=brightness=-0.07:saturation=1.2[bg];` +
  `[b]scale=-2:1064:flags=lanczos,pad=iw+16:1080:8:8:color=0x3b1d5e[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p[v]`,
  '-map', '[v]', '-map', '1:a:0', ...X264, '-maxrate', '6000k', '-bufsize', '12000k', ...AAC, '-t', '30', '-movflags', '+faststart', V16]);
log('encoded', path.relative(root, V16));

// ---------------------------------------------------------------- 5. verify
function probe(f) {
  const s = ff(['-i', f, '-map', '0', '-c', 'copy', '-f', 'null', '-']) + ff(['-i', f, '-map', '0:v:0', '-f', 'null', '-']).replace(/\r/g, '\n');
  const dur = s.match(/Duration: (\d+):(\d+):([\d.]+)/), vid = s.match(/Video: (\w+) \((\w+)\).*?, (\d+)x(\d+)[, ].*?([\d.]+) fps/), frames = [...s.matchAll(/frame=\s*(\d+)/g)].pop();
  return { dur: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : NaN, codec: vid?.[1], profile: vid?.[2], w: +vid?.[3], h: +vid?.[4], fps: +vid?.[5], audio: /Audio: aac/.test(s), frames: frames ? +frames[1] : NaN, size: fs.statSync(f).size };
}
const checks = [];
for (const [f, w, h] of [[V9, 1080, 1920], [V16, 1920, 1080]]) {
  const p = probe(f);
  const ok = Math.abs(p.dur - 30) <= 0.05 && p.w === w && p.h === h && Math.abs(p.fps - 30) < 0.01 && p.audio && p.codec === 'h264' && p.profile === 'High' && p.frames === NFRAMES;
  checks.push(ok);
  log(`${path.basename(f)}: ${p.w}x${p.h} ${p.codec} ${p.profile} ${p.fps} fps, ${p.frames} frames, ${p.dur.toFixed(3)} s, audio ${p.audio ? 'aac' : 'MISSING'}, ${(p.size / 1048576).toFixed(2)} MB  ${ok ? 'OK' : 'CHECK FAILED'}`);
}
const eb = ff(['-i', V9, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
const I = +(eb.match(/I:\s+(-?[\d.]+) LUFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
const TP = +(eb.match(/Peak:\s+(-?[\d.]+) dBFS/g) || []).pop()?.match(/-?[\d.]+/)[0];
const vd = ff(['-i', V9, '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-']);
const maxV = +vd.match(/max_volume: (-?[\d.]+) dB/)[1], meanV = +vd.match(/mean_volume: (-?[\d.]+) dB/)[1];
log(`audio: integrated ${I} LUFS, true peak ${TP} dBTP, max ${maxV} dB, mean ${meanV} dB`);
checks.push(Math.abs(I + 14) < 1 && TP <= -0.8 && meanV > -40);
if (fs.statSync(V9).size > 15.5 * 1048576) { log('WARNING: 9x16 file is larger than ~15 MB'); checks.push(false); }

// ---------------------------------------------------------------- 6. contact sheet (16 frames from the encoded 9:16 file)
const sheetDir = path.join(TMP, 'sheet'); fs.rmSync(sheetDir, { recursive: true, force: true }); fs.mkdirSync(sheetDir, { recursive: true });
const times = Array.from({ length: 16 }, (_, i) => +(0.45 + i * (29.1 / 15)).toFixed(2));
for (const [i, t] of times.entries()) ff(['-y', '-ss', String(t), '-i', V9, '-frames:v', '1', '-vf', 'scale=270:480', path.join(sheetDir, `s${i}.png`)]);
const tw = 270, th = 480, lab = 34;
const tiles = await Promise.all(times.map(async (t, i) => {
  const label = Buffer.from(`<svg width="${tw}" height="${lab}"><rect width="100%" height="100%" fill="#1b1145"/><text x="${tw / 2}" y="24" font-family="sans-serif" font-size="20" font-weight="bold" fill="#fff" text-anchor="middle">${t.toFixed(2)} s</text></svg>`);
  return sharp({ create: { width: tw, height: th + lab, channels: 3, background: '#1b1145' } }).composite([{ input: path.join(sheetDir, `s${i}.png`), top: 0, left: 0 }, { input: label, top: th, left: 0 }]).png().toBuffer();
}));
await sharp({ create: { width: tw * 8, height: (th + lab) * 2, channels: 3, background: '#000' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % 8) * tw, top: Math.floor(i / 8) * (th + lab) }))).png().toFile(SHEET);
log('contact sheet ->', SHEET);
if (!flag('--keep')) fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s — ${checks.every(Boolean) ? 'all checks passed' : 'SOME CHECKS FAILED'}`);
if (!checks.every(Boolean)) process.exitCode = 1;
