// Records game music + SFX cues from the real audio module (served next to index.html on :8765) to webm.
// usage: node rec.mjs out.webm <ms> '<cues json>'   cues: [[ms, 'music'|'sfx', name, volume], ...]
import { createRequire } from 'module'; import { execSync } from 'child_process'; import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const [out, ms, cues] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.goto('http://localhost:8765/index.html'); await p.waitForFunction(() => window.__ready);
writeFileSync(out, Buffer.from(await p.evaluate(([c, m]) => window.__record(c, m), [JSON.parse(cues), +ms]), 'base64'));
await b.close();
