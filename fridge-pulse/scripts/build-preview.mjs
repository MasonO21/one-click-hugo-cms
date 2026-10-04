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
const brandModule = path.join(root, 'src/lib/brandFontsData.ts');
// The brand fonts listed in src/theme/fontSources.ts (FONT_FILES), read without a TypeScript loader.
const brandFiles = [...fs.readFileSync(path.join(root, 'src/theme/fontSources.ts'), 'utf8').matchAll(/^\s+(\w+): '(@expo-google-fonts\/[^']+\.ttf)',$/gm)].map((m) => [m[1], m[2]]);
if (brandFiles.length === 0) throw new Error('No brand fonts found in src/theme/fontSources.ts');

fs.rmSync(work, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });

// Embed the icon and brand fonts as data URIs for the duration of the export, then put the stubs back.
const stub = fs.readFileSync(fontModule, 'utf8');
const brandStub = fs.readFileSync(brandModule, 'utf8');
try {
  fs.writeFileSync(fontModule, `export const IONICONS_TTF_BASE64 = '${fs.readFileSync(ttf).toString('base64')}';\n`);
  const inlined = brandFiles.map(([name, file]) => `  ${name}: '${fs.readFileSync(path.join(root, 'node_modules', file)).toString('base64')}',`);
  fs.writeFileSync(brandModule, `export const BRAND_FONTS_BASE64: Record<string, string> = {\n${inlined.join('\n')}\n};\n`);
  const run = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', work, '--clear'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      EXPO_PUBLIC_BILLING_MODE: 'demo',
      EXPO_PUBLIC_API_URL: '',
      // SCREENSHOT_MODE=1 hides preview-only notes, for store screenshots (see store/README.md).
      EXPO_PUBLIC_SCREENSHOT_MODE: process.env.SCREENSHOT_MODE === '1' ? '1' : '',
    },
  });
  if (run.status !== 0) throw new Error('expo export failed');
} finally {
  fs.writeFileSync(fontModule, stub);
  fs.writeFileSync(brandModule, brandStub);
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
    // Font files are inlined in the bundle, so their copies are not needed.
    else if (!from.includes(`${path.sep}vector-icons${path.sep}`) && !from.includes(`${path.sep}@expo-google-fonts${path.sep}`)) {
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
