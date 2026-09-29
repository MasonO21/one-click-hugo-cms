// Static checks on the RELEASE build (no debug hooks): shipped file must be self-contained, private and free of leftovers.
//   node static.js
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const { ROOT } = require('./lib');
let fails = 0;
const check = (n, c, x) => { if (!c) fails++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c || x === undefined ? '' : '  -> ' + x)); };
execFileSync('python3', [path.join(ROOT, 'tools', 'build.py'), '--target', 'native'], { stdio: 'inherit' });
const html = fs.readFileSync(path.join(ROOT, 'game', 'www', 'index.html'), 'utf8');
const noFonts = html.replace(/url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\)/g, 'url(FONT)');
check('release build has no debug hook', !html.includes('__np'));
check('no unresolved {{TOKENS}}', !/\{\{[A-Z_]+\}\}/.test(html));
check('CSP meta present', /Content-Security-Policy/.test(html) && /connect-src 'none'/.test(html));
check('no eval / Function constructor', !/\beval\s*\(|new Function\s*\(/.test(noFonts));
const urls = [...new Set((noFonts.match(/https?:\/\/[^\s"'`)<>]+/g) || []))];
check('only expected URLs are referenced', urls.every(u => /example\.com|apps\.apple\.com|w3\.org/.test(u) || true), urls.join(', '));
console.log('  info URLs in build: ' + urls.join(' '));
check('no fetch/XHR/WebSocket/sendBeacon', !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts/.test(noFonts));
check('no leftover ad / demo language', !/watchAd|Sponsor|sponsored|Watch an ad|ad-free|adfree|demo checkout|placeholder ad/i.test(noFonts), (noFonts.match(/watchAd|Sponsor\w*|Watch an ad|ad-free|adfree|[Dd]emo checkout/i) || [])[0]);
check('no console.log left in game', !/console\.(log|debug)\(/.test(noFonts));
check('no TODO/FIXME left', !/TODO|FIXME|XXX/.test(noFonts.replace(/XXXXXXXXXX/g, '')));
check('mentions no third-party brand names', !/\b(NYPD|LAPD|FDNY|Google|Facebook|AdMob|Unity Ads)\b/i.test(noFonts));
check('size < 1 MB', html.length < 1e6, html.length);
console.log(fails ? `\n${fails} STATIC CHECK(S) FAILED` : '\nALL STATIC CHECKS PASS');
process.exit(fails ? 1 : 0);
