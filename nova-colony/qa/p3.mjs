import { SP, launch, waitReady, shot, sleep, tap } from './lib.mjs';
const vp = process.argv[2] || 'phone';
const { browser, context, page } = await launch(vp, { storage: SP + '/snap-wood.json' });
await waitReady(page);
await tap(page, '#btn-build', { after: 2500 });
await shot(page, vp + '-buildmenu-wait');
console.log(await page.evaluate(() => { const b = document.querySelector('#btn-build').getBoundingClientRect(); const t = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return t.className + ' / ' + t.closest('[class]')?.className + ' ' + JSON.stringify(b); }));
await browser.close();
