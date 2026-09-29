#!/usr/bin/env node
/**
 * Builds a self-contained web preview of the app in demo mode (simulated trial, sample scan,
 * built-in recipes) into ./preview, ready to host from any folder on a static host:
 *
 *   preview/index.html   page content (title, styles, bootstrap); wrap it in a normal HTML shell
 *   preview/app.js       the app bundle, with asset URLs made relative
 *   preview/assets/...   images the app may load (icon fonts are embedded in the bundle instead)
 *
 * Usage: npm run preview:build
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const work = path.join(root, '.preview-export');
const out = path.join(root, 'preview');
const fontModule = path.join(root, 'src/lib/ioniconsFont.ts');
const ttf = path.join(root, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');

fs.rmSync(work, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });

// Embed the icon font as a data URI for the duration of the export, then put the stub back.
const stub = fs.readFileSync(fontModule, 'utf8');
try {
  fs.writeFileSync(fontModule, `export const IONICONS_TTF_BASE64 = '${fs.readFileSync(ttf).toString('base64')}';\n`);
  const run = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', work, '--clear'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CI: '1', EXPO_PUBLIC_BILLING_MODE: 'demo', EXPO_PUBLIC_API_URL: '' },
  });
  if (run.status !== 0) throw new Error('expo export failed');
} finally {
  fs.writeFileSync(fontModule, stub);
}

// Bundle: make asset URLs relative so the page works from any folder.
const jsDir = path.join(work, '_expo/static/js/web');
const bundleName = fs.readdirSync(jsDir).find((f) => f.endsWith('.js'));
if (!bundleName) throw new Error('No web bundle found');
const bundle = fs
  .readFileSync(path.join(jsDir, bundleName), 'utf8')
  .replace(/(["'`])\/assets\//g, '$1assets/');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'app.js'), bundle);

// Assets: everything except the (unused, multi-megabyte) icon font files.
function copyAssets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    if (entry.isDirectory()) copyAssets(from);
    else if (!from.includes(`${path.sep}vector-icons${path.sep}`)) {
      const to = path.join(out, path.relative(work, from));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}
if (fs.existsSync(path.join(work, 'assets'))) copyAssets(path.join(work, 'assets'));

fs.copyFileSync(path.join(root, 'scripts/preview-page.html'), path.join(out, 'index.html'));
fs.rmSync(work, { recursive: true, force: true });

const files = [];
(function list(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list(p);
    else files.push(path.relative(out, p));
  }
})(out);
const bytes = files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
console.log(`\nPreview built: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${path.relative(process.cwd(), out) || '.'}`);
