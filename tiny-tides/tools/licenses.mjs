// Collects the open-source licence information shown on the website (licenses.html) and inside the app (Settings → Legal & credits).
// Reads node_modules, so the list always matches what is installed. Run `npm ci` first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = (name) => path.join(root, 'node_modules', name);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readLicense = (dir) => {
  const f = fs.readdirSync(dir).find((n) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(n));
  return f ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : '';
};
const repoUrl = (p) => String((typeof p.repository === 'string' ? p.repository : p.repository?.url) || p.homepage || '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://');

/** Short description of what each component does for the game. */
const USE = {
  '@capacitor/core': 'Bridge between the game and iOS',
  '@capacitor/ios': 'The native iOS app shell',
  '@capacitor/app': 'App foreground / background events',
  '@capacitor/haptics': 'Vibration feedback',
  '@capacitor/local-notifications': 'Optional on-device reminders',
  '@capacitor/preferences': 'Saving your game on the device',
  '@capacitor/share': 'The iOS share sheet',
  '@capacitor/filesystem': 'Temporary picture file for sharing',
  '@capacitor/status-bar': 'Status bar styling',
  '@capacitor/splash-screen': 'Launch screen',
  '@capgo/native-purchases': 'In-app purchases through StoreKit 2 (modified — see below)',
  '@fontsource/fredoka': 'Fredoka rounded font used for all text',
};

export function collectLicenses() {
  const pkg = readJson(path.join(root, 'package.json'));
  const names = [...Object.keys(pkg.dependencies), '@fontsource/fredoka'];
  const list = names.map((name) => {
    const dir = pkgDir(name), p = readJson(path.join(dir, 'package.json'));
    return { name: name === '@fontsource/fredoka' ? 'Fredoka (font)' : name, pkg: name, version: p.version, license: p.license, url: name === '@fontsource/fredoka' ? 'https://fonts.google.com/specimen/Fredoka' : repoUrl(p), use: USE[name] || '', text: readLicense(dir) };
  });
  // native Swift packages pulled in by the plugins (Package.swift); they are not in node_modules
  const ionFs = fs.readFileSync(path.join(root, 'legal/third-party/ion-ios-filesystem.LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim();
  list.push(
    { name: 'capacitor-swift-pm', pkg: null, version: '', license: 'MIT', url: 'https://github.com/ionic-team/capacitor-swift-pm', use: 'Capacitor iOS runtime (Swift package, built from the same source as @capacitor/ios)', text: list.find((l) => l.pkg === '@capacitor/ios').text },
    { name: 'ion-ios-filesystem', pkg: null, version: '', license: 'MIT', url: 'https://github.com/ionic-team/ion-ios-filesystem', use: 'File access used by the Filesystem plugin (Swift package)', text: ionFs },
  );
  for (const l of list) if (!l.text) throw new Error(`licenses: no licence text found for ${l.name}`);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Same licence text used by several packages is shown once. */
export function groupByText(list) {
  const groups = new Map();
  for (const l of list) {
    const key = `${l.license}\n${l.text}`;
    if (!groups.has(key)) groups.set(key, { license: l.license, text: l.text, items: [] });
    groups.get(key).items.push(l);
  }
  return [...groups.values()].sort((a, b) => a.license.localeCompare(b.license));
}
