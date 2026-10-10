// About (Settings → About and licences): the build's version, the player ID for support, and the notices the open-source
// parts ask to ship with the game (three.js and Capacitor under MIT, the fonts under the SIL Open Font License 1.1).
import { h, $, modal, toast } from '../dom.js';
import { icon } from '../icons.js';
import { PRIVACY } from '../../game/data.js';
import { LOGO_ART } from '../art.js';

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'; // vite.config.js define

const NOTICES = [
  ['three.js', 'Copyright © 2010-2025 three.js authors', 'MIT'],
  ['Capacitor (core)', 'Copyright (c) 2017-present Drifty Co.', 'MIT'],
  ['Capacitor App, Haptics, Splash Screen, Status Bar', 'Copyright 2020-present Ionic', 'MIT'],
  ['Cinzel', 'Copyright 2020 The Cinzel Project Authors', 'OFL'],
  ['Oxanium', 'Copyright 2019 The Oxanium Project Authors', 'OFL'],
];
const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
const OFL = 'These fonts are licensed under the SIL Open Font License, Version 1.1 (https://openfontlicense.org). They may be used, bundled and redistributed with software, but not sold by themselves.';

export function openAbout(app) {
  const p = app.profile;
  const body = h(`<div class="ab">
    <img class="st-logo" src="${LOGO_ART}" alt="SOULSWARM: Raise the Legion" draggable="false">
    <div class="ab-ver"><span class="t-label">Version</span> <b class="tnum">${APP_VERSION}</b></div>
    <p class="ab-tx t-dim">Need help? Write to support with your Player ID, so we can find your save.</p>
    <button class="btn btn-ghost btn-block ab-id" data-act="copy">${icon('helm')} <code>${p.privacy.id}</code></button>
    <div class="row"><a class="btn btn-ghost" href="${PRIVACY.policyUrl}" target="_blank" rel="noopener">Privacy policy</a><a class="btn btn-ghost" href="${PRIVACY.termsUrl}" target="_blank" rel="noopener">Terms of use</a></div>
    <div class="st-sep"></div>
    <div class="t-label">Open-source notices</div>
    <ul class="ab-list">${NOTICES.map(([name, c, l]) => `<li><b>${name}</b><small>${c} · ${l === 'MIT' ? 'MIT License' : 'SIL Open Font License 1.1'}</small></li>`).join('')}</ul>
    <details class="ab-lic"><summary>MIT License</summary><pre>${MIT}</pre></details>
    <details class="ab-lic"><summary>SIL Open Font License 1.1</summary><pre>${OFL}</pre></details>
  </div>`);
  $(body, '[data-act="copy"]').addEventListener('click', () => {
    Promise.resolve().then(() => navigator.clipboard.writeText(p.privacy.id)).then(() => toast('Player ID copied'), () => toast(`Player ID: ${p.privacy.id}`)); // no clipboard (an older WebView): show it
  });
  return modal({ title: 'About SOULSWARM', body, cls: 'mm-about scroll', actions: [{ label: 'Close', cls: 'btn-ghost btn-block' }] });
}
